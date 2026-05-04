import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db', () => ({ sql: vi.fn() }));
vi.mock('../../view/embeddings', () => ({
  embedTexts: vi.fn(),
  vectorLiteral: vi.fn(),
  resolveEmbeddingConfig: vi.fn(),
  getEmbeddingRuntimeConfig: vi.fn(),
}));
vi.mock('../../search/glossarySemantic', () => ({
  ensureGlossaryEmbeddingsIndex: vi.fn(),
  fetchGlossarySemanticRows: vi.fn(),
}));
vi.mock('../../view/viewCrud', () => ({
  ensureMemoryViewsReady: vi.fn(),
  ensureMemoryViewsIndex: vi.fn(),
}));
vi.mock('../../view/viewBuilders', () => ({
  countQueryTokens: vi.fn().mockResolvedValue(3),
}));
vi.mock('../../view/memoryViewQueries', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchDenseMemoryViewRows: vi.fn(),
    fetchLexicalMemoryViewRows: vi.fn(),
    fetchExactMemoryRows: vi.fn(),
  };
});
vi.mock('../recallEventLog', () => ({ logRecallEvents: vi.fn() }));
vi.mock('../../view/retrieval', () => ({
  NORMALIZED_DOCUMENTS_CTE: '',
  loadNormalizedDocuments: vi.fn(),
}));

import {
  DEFAULT_STRATEGY,
  scoreRawPlusLexDamp,
  computeRecencyBonus,
  getRecencyInfo,
  round,
  sortResults,
  formatResult,
} from '../scoringStrategies';

function makeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    uri: (overrides.uri as string) || 'test://a',
    priority: (overrides.priority as number) ?? 1,
    disclosure: '',
    exact_score: (overrides.exact_score as number) ?? 0,
    glossary_semantic_score: (overrides.glossary_semantic_score as number) ?? 0,
    dense_score: (overrides.dense_score as number) ?? 0,
    lexical_score: (overrides.lexical_score as number) ?? 0,
    view_bonus: (overrides.view_bonus as number) ?? 0,
    matched_on: (overrides.matched_on as Set<string>) ?? new Set<string>(),
    cues: (overrides.cues as Set<string>) ?? new Set<string>(),
    view_types: (overrides.view_types as Set<string>) ?? new Set<string>(),
    semantic_views: new Set<string>(),
    lexical_views: new Set<string>(),
    updated_at: (overrides.updated_at as Date) ?? null,
  };
}

function makeCandidateMap(...candidates: ReturnType<typeof makeCandidate>[]) {
  const map = new Map();
  for (const c of candidates) map.set(c.uri, c);
  return map;
}

const baseConfig = {
  w_exact: 0.30,
  w_glossary_semantic: 0.25,
  w_dense: 0.30,
  w_lexical: 0.03,
  priority_base: 0.05,
  priority_step: 0.01,
  multi_view_step: 0.015,
  multi_view_cap: 0.05,
  query_tokens: 5,
};

describe('fixed recall scoring strategy', () => {
  it('uses raw_plus_lex_damp as the only default strategy', () => {
    expect(DEFAULT_STRATEGY).toBe('raw_plus_lex_damp');
  });

  it('scores raw path signals with lexical length damping', () => {
    const byUri = makeCandidateMap(
      makeCandidate({
        uri: 'a',
        exact_score: 0.8,
        glossary_semantic_score: 0.5,
        dense_score: 0.6,
        lexical_score: 1.0,
        view_bonus: 0.03,
      }),
    );

    const [result] = scoreRawPlusLexDamp(byUri, { ...baseConfig, query_tokens: 20 });

    expect(result.uri).toBe('a');
    expect(result.score_breakdown.exact).toBeCloseTo(0.24, 6);
    expect(result.score_breakdown.glossary_semantic).toBeCloseTo(0.125, 6);
    expect(result.score_breakdown.semantic).toBeCloseTo(0.18, 6);
    expect(Number(result.score_breakdown.lexical_damp)).toBeLessThan(0.4);
    expect(Number(result.score_breakdown.lexical)).toBeLessThan(0.03);
  });

  it('sorts scores by score, priority, then uri', () => {
    const results = scoreRawPlusLexDamp(
      makeCandidateMap(
        makeCandidate({ uri: 'b', exact_score: 0.5, priority: 2 }),
        makeCandidate({ uri: 'a', exact_score: 0.5, priority: 1 }),
        makeCandidate({ uri: 'c', exact_score: 0.2, priority: 0 }),
      ),
      baseConfig,
    );

    expect(results.map((r) => r.uri)).toEqual(['a', 'b', 'c']);
  });

  it('handles empty maps', () => {
    expect(scoreRawPlusLexDamp(new Map(), baseConfig)).toEqual([]);
  });
});

describe('shared scoring helpers', () => {
  it('rounds to 6 decimal places', () => {
    expect(round(1.23456789)).toBe(1.234568);
  });

  it('sortResults breaks ties by priority and uri', () => {
    const sorted = sortResults([
      { uri: 'b', score: 0.5, priority: 1 },
      { uri: 'a', score: 0.5, priority: 1 },
      { uri: 'c', score: 0.6, priority: 3 },
    ] as any[]);

    expect(sorted.map((item: any) => item.uri)).toEqual(['c', 'a', 'b']);
  });

  it('returns no recency bonus when disabled', () => {
    const item = makeCandidate({ updated_at: new Date() });
    expect(computeRecencyBonus(item, { ...baseConfig, recency_enabled: false, recency_max_bonus: 0.04 })).toBe(0);
  });

  it('returns full recency bonus for exempt high-priority memories', () => {
    const item = makeCandidate({ updated_at: new Date('2020-01-01'), priority: 0 });
    expect(computeRecencyBonus(item, {
      ...baseConfig,
      recency_enabled: true,
      recency_max_bonus: 0.04,
      recency_priority_exempt: 1,
    })).toBe(0.04);
  });

  it('formats result structure and recency metadata', () => {
    const item = makeCandidate({ uri: 'test://x', exact_score: 0.5, updated_at: new Date() });
    item.matched_on.add('exact');
    item.cues.add('hello');

    const result = formatResult(item, 0.75, { exact: 0.5 }, 0.03);

    expect(result.uri).toBe('test://x');
    expect(result.score).toBe(0.75);
    expect(result.matched_on).toContain('exact');
    expect(result.cues).toContain('hello');
    expect(result.score_breakdown.recency).toBe(0.03);
    expect(getRecencyInfo(item, 0.03)?.recency_bonus).toBe(0.03);
  });
});
