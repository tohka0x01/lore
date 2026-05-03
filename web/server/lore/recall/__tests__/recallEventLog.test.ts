import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockConnect = vi.fn(() => Promise.resolve({ query: mockClientQuery, release: mockClientRelease }));

vi.mock('../../../db', () => ({
  sql: vi.fn(),
  getPool: () => ({ connect: mockConnect }),
}));
import { sql } from '../../../db';
import {
  logRecallEvents,
  markRecallEventsUsedInAnswer,
  intervalDaysSql,
  asNumber,
  asObject,
  normalizeUriList,
  truncateText,
} from '../recallEventLog';

const mockSql = vi.mocked(sql);

function makeResult(rows: Record<string, unknown>[] = [], rowCount = rows.length) {
  return { rows, rowCount } as any;
}

function eventInsertCalls() {
  return mockClientQuery.mock.calls.filter(([q]) =>
    typeof q === 'string' && q.includes('INSERT INTO recall_events'),
  );
}

function splitTopLevelList(source: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function insertShape(sqlText: string, tableName: string) {
  const normalized = sqlText.replace(/\s+/g, ' ');
  const insertIndex = normalized.indexOf(`INSERT INTO ${tableName}`);
  expect(insertIndex).toBeGreaterThanOrEqual(0);

  const columnsStart = normalized.indexOf('(', insertIndex);
  const columnsEnd = normalized.indexOf(')', columnsStart);
  const valuesIndex = normalized.indexOf('VALUES', columnsEnd);
  const valuesStart = normalized.indexOf('(', valuesIndex);
  let depth = 0;
  let valuesEnd = -1;
  for (let i = valuesStart; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        valuesEnd = i;
        break;
      }
    }
  }

  expect(columnsStart).toBeGreaterThanOrEqual(0);
  expect(columnsEnd).toBeGreaterThan(columnsStart);
  expect(valuesStart).toBeGreaterThanOrEqual(0);
  expect(valuesEnd).toBeGreaterThan(valuesStart);

  return {
    columns: splitTopLevelList(normalized.slice(columnsStart + 1, columnsEnd)).length,
    values: splitTopLevelList(normalized.slice(valuesStart + 1, valuesEnd)).length,
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

describe('intervalDaysSql', () => {
  it('clamps to range 1..90 with default 7', () => {
    expect(intervalDaysSql(0)).toBe(7); // 0 is falsy, fallback kicks in
    expect(intervalDaysSql(-5)).toBe(1); // -5 is a valid number, clamped to min
    expect(intervalDaysSql(30)).toBe(30);
    expect(intervalDaysSql(200)).toBe(90);
    expect(intervalDaysSql(null)).toBe(7);
    expect(intervalDaysSql(undefined)).toBe(7);
  });
});

describe('asNumber', () => {
  it('returns finite numbers', () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(3.14)).toBe(3.14);
    expect(asNumber(-1)).toBe(-1);
  });

  it('returns null for non-finite values', () => {
    expect(asNumber(NaN)).toBeNull();
    expect(asNumber(Infinity)).toBeNull();
    expect(asNumber(-Infinity)).toBeNull();
    expect(asNumber(undefined)).toBeNull();
    expect(asNumber('abc')).toBeNull();
  });

  it('coerces string numbers', () => {
    expect(asNumber('123')).toBe(123);
    expect(asNumber('0')).toBe(0);
  });
});

describe('asObject', () => {
  it('returns the object if value is an object', () => {
    const obj = { a: 1 };
    expect(asObject(obj)).toBe(obj);
  });

  it('returns empty object for non-objects', () => {
    expect(asObject(null)).toEqual({});
    expect(asObject(undefined)).toEqual({});
    expect(asObject(42)).toEqual({});
    expect(asObject('hello')).toEqual({});
  });
});

describe('normalizeUriList', () => {
  it('deduplicates and trims URIs', () => {
    expect(normalizeUriList(['a', ' b ', 'a', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('filters out empty strings and falsy values', () => {
    expect(normalizeUriList(['', null, undefined, 'x'])).toEqual(['x']);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeUriList(null)).toEqual([]);
    expect(normalizeUriList('string')).toEqual([]);
    expect(normalizeUriList(undefined)).toEqual([]);
  });
});

describe('truncateText', () => {
  it('returns empty string for falsy input', () => {
    expect(truncateText('')).toBe('');
    expect(truncateText(null)).toBe('');
    expect(truncateText(undefined)).toBe('');
  });

  it('collapses whitespace', () => {
    expect(truncateText('hello   world\n\tfoo')).toBe('hello world foo');
  });

  it('truncates long text with ellipsis', () => {
    const longText = 'a'.repeat(300);
    const result = truncateText(longText, 280);
    expect(result.length).toBe(280);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('returns short text as-is', () => {
    expect(truncateText('short')).toBe('short');
  });
});

// ---------------------------------------------------------------------------
// logRecallEvents
// ---------------------------------------------------------------------------

describe('logRecallEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue(makeResult());
    mockClientQuery.mockResolvedValue(makeResult());
  });

  it('returns 0 for empty query', async () => {
    const result = await logRecallEvents({ queryText: '' });
    expect(result).toEqual({ inserted_count: 0 });
  });

  it('inserts exact rows', async () => {
    const result = await logRecallEvents({
      queryText: 'test query',
      exactRows: [{ uri: 'core://node1', exact_score: 0.9, weight: 1.0 }],
    });
    expect(result.inserted_count).toBe(1);
    expect(result.query_id).toBeDefined();
    // table init + insert
    const insertCalls = eventInsertCalls();
    expect(insertCalls).toHaveLength(1);
    const params = insertCalls[0][1] as unknown[];
    expect(params[0]).toBe('test query');
    expect(params[1]).toBe('core://node1');
    expect(params[2]).toBe('exact');
  });

  it('inserts glossary_semantic rows', async () => {
    const result = await logRecallEvents({
      queryText: 'glossary test',
      glossarySemanticRows: [{ uri: 'core://node2', glossary_semantic_score: 0.8, keyword: 'key' }],
    });
    expect(result.inserted_count).toBe(1);
    const insertCalls = eventInsertCalls();
    const params = insertCalls[0][1] as unknown[];
    expect(params[2]).toBe('glossary_semantic');
  });

  it('inserts dense rows', async () => {
    const result = await logRecallEvents({
      queryText: 'dense test',
      denseRows: [{ uri: 'core://node3', semantic_score: 0.7, weight: 1.2 }],
    });
    expect(result.inserted_count).toBe(1);
    const insertCalls = eventInsertCalls();
    const params = insertCalls[0][1] as unknown[];
    expect(params[2]).toBe('dense');
  });

  it('inserts lexical rows with flags', async () => {
    const result = await logRecallEvents({
      queryText: 'lexical test',
      lexicalRows: [{ uri: 'core://node4', lexical_score: 0.6, weight: 1, fts_hit: true, text_hit: false, uri_hit: true }],
    });
    expect(result.inserted_count).toBe(1);
    const insertCalls = eventInsertCalls();
    const params = insertCalls[0][1] as unknown[];
    expect(params[2]).toBe('lexical');
    const meta = JSON.parse(params[8] as string);
    expect(meta.lexical_flags.fts_hit).toBe(true);
    expect(meta.lexical_flags.uri_hit).toBe(true);
    expect(meta.lexical_flags.text_hit).toBe(false);
  });

  it('inserts multiple signal types in one call', async () => {
    const result = await logRecallEvents({
      queryText: 'multi signal',
      exactRows: [{ uri: 'core://a', exact_score: 1 }],
      denseRows: [{ uri: 'core://b', semantic_score: 0.5 }],
      lexicalRows: [{ uri: 'core://c', lexical_score: 0.3 }],
    });
    expect(result.inserted_count).toBe(3);
  });

  it('marks selected when URI is in displayedItems', async () => {
    await logRecallEvents({
      queryText: 'selected test',
      exactRows: [{ uri: 'core://sel' }],
      displayedItems: [{ uri: 'core://sel' }],
    });
    const insertCalls = eventInsertCalls();
    const params = insertCalls[0][1] as unknown[];
    expect(params[6]).toBe(true); // selected
  });

  it('uses provided queryId', async () => {
    const result = await logRecallEvents({
      queryId: 'custom-id-123',
      queryText: 'id test',
      exactRows: [{ uri: 'core://x' }],
    });
    expect(result.query_id).toBe('custom-id-123');
    const insertCalls = eventInsertCalls();
    const meta = JSON.parse(insertCalls[0][1]![8] as string);
    expect(meta.query_id).toBe('custom-id-123');
  });

  it('stores client_type in recall event metadata', async () => {
    await logRecallEvents({
      queryText: 'client type test',
      exactRows: [{ uri: 'core://client' }],
      clientType: 'claudecode',
    });

    const insertCalls = eventInsertCalls();
    const meta = JSON.parse(insertCalls[0][1]![8] as string);
    expect(meta.client_type).toBe('claudecode');
  });

  it('writes query, candidates, and path events in one transaction', async () => {
    const result = await logRecallEvents({
      queryId: 'q-rollup',
      queryText: 'rollup query',
      sessionId: 's1',
      clientType: 'codex',
      exactRows: [{ uri: 'core://a', exact_score: 0.9, weight: 1 }],
      denseRows: [{ uri: 'core://b', semantic_score: 0.7, weight: 1 }],
      rankedCandidates: [
        { uri: 'core://a', score: 0.91, matched_on: ['exact'] },
        { uri: 'core://b', score: 0.72, matched_on: ['dense'] },
      ],
      displayedItems: [{ uri: 'core://a' }],
    });

    expect(result).toEqual({ inserted_count: 2, query_id: 'q-rollup' });
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockClientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(mockClientRelease).toHaveBeenCalledTimes(1);

    const sqlTexts = mockClientQuery.mock.calls.map(([query]) => String(query));
    expect(sqlTexts.some((query) => query.includes('INSERT INTO recall_queries'))).toBe(true);
    expect(sqlTexts.some((query) => query.includes('INSERT INTO recall_query_candidates'))).toBe(true);
    expect(sqlTexts.some((query) => query.includes('INSERT INTO recall_events'))).toBe(true);
  });

  it('keeps recall INSERT column and value expression counts aligned', async () => {
    await logRecallEvents({
      queryId: 'q-sql-shape',
      queryText: 'shape query',
      clientType: 'codex',
      exactRows: [{ uri: 'core://a', exact_score: 0.9, weight: 1 }],
      rankedCandidates: [{ uri: 'core://a', score: 0.91, matched_on: ['exact'] }],
      displayedItems: [{ uri: 'core://a' }],
    });

    const sqlTexts = mockClientQuery.mock.calls.map(([query]) => String(query));
    const queryInsert = sqlTexts.find((query) => query.includes('INSERT INTO recall_queries'));
    const candidateInsert = sqlTexts.find((query) => query.includes('INSERT INTO recall_query_candidates'));
    const eventInsert = sqlTexts.find((query) => query.includes('INSERT INTO recall_events'));

    expect(insertShape(queryInsert || '', 'recall_queries')).toEqual({ columns: 8, values: 8 });
    expect(insertShape(candidateInsert || '', 'recall_query_candidates')).toEqual({ columns: 9, values: 9 });
    expect(insertShape(eventInsert || '', 'recall_events')).toEqual({ columns: 15, values: 15 });
  });

  it('rolls back the transaction when any recall write fails', async () => {
    mockClientQuery.mockImplementation(async (query: string) => {
      if (String(query).includes('INSERT INTO recall_query_candidates')) {
        throw new Error('candidate insert failed');
      }
      return makeResult();
    });

    await expect(logRecallEvents({
      queryId: 'q-fail',
      queryText: 'fail query',
      exactRows: [{ uri: 'core://a' }],
      rankedCandidates: [{ uri: 'core://a', score: 0.8 }],
    })).rejects.toThrow('candidate insert failed');

    expect(mockClientQuery.mock.calls.some(([query]) => query === 'ROLLBACK')).toBe(true);
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// markRecallEventsUsedInAnswer
// ---------------------------------------------------------------------------

describe('markRecallEventsUsedInAnswer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSql.mockResolvedValue(makeResult([], 0));
    mockClientQuery.mockResolvedValue(makeResult([], 0));
  });

  it('returns 0 for empty queryId', async () => {
    const result = await markRecallEventsUsedInAnswer({ queryId: '' });
    expect(result).toEqual({ updated_count: 0, query_id: null });
  });

  it('returns 0 when success is false', async () => {
    const result = await markRecallEventsUsedInAnswer({ queryId: 'q1', success: false });
    expect(result).toEqual({ updated_count: 0, query_id: 'q1' });
  });

  it('updates matching rows', async () => {
    mockClientQuery.mockImplementation(async (query: string) => {
      if (String(query).includes('UPDATE recall_query_candidates')) {
        return makeResult([], 3);
      }
      return makeResult();
    });
    const result = await markRecallEventsUsedInAnswer({
      queryId: 'q-abc',
      nodeUris: ['core://a', 'core://b'],
      assistantText: 'The answer is 42',
      source: 'agent_end',
      success: true,
    });
    expect(result.updated_count).toBe(3);
    expect(result.query_id).toBe('q-abc');
    expect(result.node_uris).toEqual(['core://a', 'core://b']);

    const updateCalls = mockClientQuery.mock.calls.filter(([q]) =>
      typeof q === 'string' && q.includes('UPDATE recall_events'),
    );
    expect(updateCalls).toHaveLength(1);
  });

  it('includes answer_preview in metadata patch when text is provided', async () => {
    mockClientQuery.mockImplementation(async (query: string) => {
      if (String(query).includes('UPDATE recall_query_candidates')) {
        return makeResult([], 1);
      }
      return makeResult();
    });
    await markRecallEventsUsedInAnswer({
      queryId: 'q-preview',
      assistantText: 'Some answer text',
      success: true,
    });
    const updateCalls = mockClientQuery.mock.calls.filter(([q]) =>
      typeof q === 'string' && q.includes('UPDATE recall_events'),
    );
    const metaPatch = JSON.parse(updateCalls[0][1]![2] as string);
    expect(metaPatch.answer_preview).toBe('Some answer text');
    expect(metaPatch.answer_signal_source).toBe('agent_end');
  });

  it('stores answer client type in metadata patch when provided', async () => {
    mockClientQuery.mockImplementation(async (query: string) => {
      if (String(query).includes('UPDATE recall_query_candidates')) {
        return makeResult([], 1);
      }
      return makeResult();
    });
    await markRecallEventsUsedInAnswer({
      queryId: 'q-client',
      success: true,
      clientType: 'mcp',
    });
    const updateCalls = mockClientQuery.mock.calls.filter(([q]) =>
      typeof q === 'string' && q.includes('UPDATE recall_events'),
    );
    const metaPatch = JSON.parse(updateCalls[0][1]![2] as string);
    expect(metaPatch.answer_client_type).toBe('mcp');
  });

  it('marks candidates first, recalculates query used_count, then syncs events', async () => {
    mockClientQuery.mockImplementation(async (query: string) => {
      if (String(query).includes('UPDATE recall_query_candidates')) {
        return makeResult([{ node_uri: 'core://a' }, { node_uri: 'core://b' }], 2);
      }
      return makeResult();
    });

    const result = await markRecallEventsUsedInAnswer({
      queryId: 'q-usage',
      nodeUris: ['core://a', 'core://b'],
      assistantText: 'answer',
      success: true,
      clientType: 'codex',
    });

    expect(result.updated_count).toBe(2);
    expect(result.query_id).toBe('q-usage');
    expect(result.node_uris).toEqual(['core://a', 'core://b']);

    const sqlTexts = mockClientQuery.mock.calls.map(([query]) => String(query));
    const candidateIndex = sqlTexts.findIndex((query) => query.includes('UPDATE recall_query_candidates'));
    const queryIndex = sqlTexts.findIndex((query) => query.includes('UPDATE recall_queries'));
    const eventIndex = sqlTexts.findIndex((query) => query.includes('UPDATE recall_events'));
    expect(candidateIndex).toBeGreaterThan(-1);
    expect(queryIndex).toBeGreaterThan(candidateIndex);
    expect(eventIndex).toBeGreaterThan(queryIndex);
  });

  it('keeps usage retry idempotent by recalculating used_count from candidates', async () => {
    mockClientQuery.mockImplementation(async (query: string) => {
      if (String(query).includes('UPDATE recall_query_candidates')) {
        return makeResult([], 0);
      }
      return makeResult();
    });

    const result = await markRecallEventsUsedInAnswer({
      queryId: 'q-retry',
      nodeUris: ['core://a'],
      success: true,
    });

    expect(result.updated_count).toBe(0);
    const updateQueryText = mockClientQuery.mock.calls
      .map(([query]) => String(query))
      .find((query) => query.includes('UPDATE recall_queries'));
    expect(updateQueryText).toContain('SELECT COUNT(*)');
  });
});
