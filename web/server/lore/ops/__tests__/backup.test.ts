import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue('{}'),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ size: 1024, mtime: new Date('2025-01-01T00:00:00Z') }),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../db', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const mockPool = { connect: vi.fn().mockResolvedValue(mockClient) };
  return {
    sql: vi.fn(),
    getPool: vi.fn().mockReturnValue(mockPool),
  };
});

vi.mock('../../config/settings', () => ({
  getSettings: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import fs from 'node:fs/promises';
import { sql, getPool } from '../../../db';
import { getSettings } from '../../config/settings';
import {
  exportDatabase,
  validateBackup,
  restoreDatabase,
  exportToLocal,
  listLocalBackups,
  readLocalBackup,
  deleteLocalBackup,
  cleanupLocalBackups,
  exportToWebDAV,
  listWebDAVBackups,
  cleanupWebDAVBackups,
} from '../backup';

const mockSql = vi.mocked(sql);
const mockGetPool = vi.mocked(getPool);
const mockGetSettings = vi.mocked(getSettings);
const mockFs = vi.mocked(fs);

function makeResult(rows: Record<string, unknown>[] = []) {
  return { rows, rowCount: rows.length } as any;
}

function makeValidBackup(overrides: Record<string, unknown> = {}) {
  return {
    format: 'lore-backup-v1',
    created_at: new Date().toISOString(),
    tables: {
      nodes: [{ uuid: 'u1', created_at: '2025-01-01' }],
      memories: [{ id: 1, node_uuid: 'u1', content: 'hi', deprecated: false, migrated_to: null, created_at: '2025-01-01' }],
      edges: [],
      paths: [],
      glossary_keywords: [],
      app_settings: [],
      memory_events: [],
      dream_diary: [],
      glossary_term_embeddings: [],
    },
    stats: { nodes: 1, memories: 1, edges: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettings.mockResolvedValue({
    'backup.local.path': '/tmp/lore-backups',
  } as any);
});

describe('exportDatabase', () => {
  beforeEach(() => {
    mockSql.mockResolvedValue(makeResult([]));
  });

  it('returns backup with correct format version', async () => {
    const result = await exportDatabase();
    expect(result.format).toBe('lore-backup-v1');
  });

  it('includes created_at ISO timestamp', async () => {
    const result = await exportDatabase();
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('queries all CORE_TABLES', async () => {
    await exportDatabase();
    expect(mockSql.mock.calls.length).toBe(10);
  });

  it('does not query recall_events by default', async () => {
    await exportDatabase();
    const recallCalls = mockSql.mock.calls.filter(([query]) => (query as string).includes('recall_events'));
    expect(recallCalls).toHaveLength(0);
  });

  it('queries recall_events when includeRecallEvents=true', async () => {
    await exportDatabase({ includeRecallEvents: true });
    const recallCalls = mockSql.mock.calls.filter(([query]) => (query as string).includes('recall_events'));
    expect(recallCalls).toHaveLength(1);
  });

  it('includes stats with row counts for each table', async () => {
    mockSql
      .mockResolvedValueOnce(makeResult([{ uuid: 'u1' }]))
      .mockResolvedValue(makeResult([]));

    const result = await exportDatabase();
    expect(result.stats.nodes).toBe(1);
    expect(result.stats.memories).toBe(0);
  });

  it('preserves table row data', async () => {
    mockSql
      .mockResolvedValueOnce(makeResult([{ uuid: 'abc', created_at: '2025-01-01' }]))
      .mockResolvedValue(makeResult([]));

    const result = await exportDatabase();
    expect(result.tables.nodes).toHaveLength(1);
    expect(result.tables.nodes[0].uuid).toBe('abc');
  });
});

describe('validateBackup', () => {
  it('returns valid=true for a well-formed backup', () => {
    const result = validateBackup(makeValidBackup());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error for null input', () => {
    const result = validateBackup(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('JSON');
  });

  it('returns error for wrong format version', () => {
    const result = validateBackup(makeValidBackup({ format: 'lore-backup-v99' }));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('格式版本不匹配');
  });

  it('returns error for missing required tables', () => {
    const data = makeValidBackup();
    delete (data.tables as any).nodes;
    const result = validateBackup(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('nodes'))).toBe(true);
  });

  it('returns error if tables value is not an array', () => {
    const data = makeValidBackup();
    (data.tables as any).memories = 'not-an-array';
    const result = validateBackup(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('memories'))).toBe(true);
  });

  it('returns stats from backup data', () => {
    const result = validateBackup(makeValidBackup());
    expect(result.stats.nodes).toBe(1);
  });

  it('returns empty stats for invalid input', () => {
    const result = validateBackup(null);
    expect(result.stats).toEqual({});
  });
});

describe('restoreDatabase', () => {
  let mockClient: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockClient = { query: vi.fn().mockResolvedValue({ rows: [{ count: '0' }] }), release: vi.fn() };
    (mockGetPool().connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);
  });

  it('throws 400 for invalid backup data', async () => {
    await expect(restoreDatabase(null)).rejects.toMatchObject({ status: 400 });
  });

  it('throws for wrong format version', async () => {
    await expect(restoreDatabase(makeValidBackup({ format: 'bad-version' }))).rejects.toMatchObject({ status: 400 });
  });

  it('begins and commits a transaction for valid backup', async () => {
    await restoreDatabase(makeValidBackup());
    const calls = mockClient.query.mock.calls.map(([query]: [string]) => query);
    expect(calls[0]).toBe('BEGIN');
    expect(calls.at(-1)).toBe('COMMIT');
  });

  it('truncates tables before inserting', async () => {
    await restoreDatabase(makeValidBackup());
    const calls = mockClient.query.mock.calls.map(([query]: [string]) => query);
    const truncateCalls = calls.filter((query) => query.includes('TRUNCATE'));
    expect(truncateCalls.length).toBeGreaterThan(0);
    expect(truncateCalls[0]).toContain('CASCADE');
  });

  it('inserts rows from backup tables', async () => {
    await restoreDatabase(makeValidBackup());
    const calls = mockClient.query.mock.calls.map(([query]: [string]) => query);
    const insertCalls = calls.filter((query) => query.startsWith('INSERT INTO'));
    expect(insertCalls.some((query) => query.includes('nodes'))).toBe(true);
    expect(insertCalls.some((query) => query.includes('memories'))).toBe(true);
  });

  it('resets sequences after restore', async () => {
    await restoreDatabase(makeValidBackup());
    const calls = mockClient.query.mock.calls.map(([query]: [string]) => query);
    const seqCalls = calls.filter((query) => query.includes('setval'));
    expect(seqCalls.length).toBeGreaterThan(0);
  });

  it('returns restored row counts and duration_ms', async () => {
    const result = await restoreDatabase(makeValidBackup());
    expect(result).toHaveProperty('restored');
    expect(result).toHaveProperty('duration_ms');
    expect(typeof result.duration_ms).toBe('number');
    expect(result.restored.nodes).toBe(1);
    expect(result.restored.memories).toBe(1);
  });

  it('rolls back and rethrows on query error', async () => {
    mockClient.query.mockImplementation(async (query: string) => {
      if (query === 'COMMIT') throw new Error('DB error at commit');
      return { rows: [{ count: '0' }] };
    });

    await expect(restoreDatabase(makeValidBackup())).rejects.toThrow('DB error at commit');
    const calls = mockClient.query.mock.calls.map(([query]: [string]) => query);
    expect(calls).toContain('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('exportToLocal', () => {
  beforeEach(() => {
    mockSql.mockResolvedValue(makeResult([]));
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 2048, mtime: new Date() } as any);
  });

  it('creates the configured backup directory', async () => {
    await exportToLocal();
    expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/lore-backups', { recursive: true });
  });

  it('writes JSON file and returns metadata', async () => {
    const result = await exportToLocal();
    expect(mockFs.writeFile).toHaveBeenCalledOnce();
    expect(result.filename).toMatch(/^lore-backup-.*\.json$/);
    expect(result.size).toBe(2048);
    expect(result.stats).toBeDefined();
  });
});

describe('listLocalBackups', () => {
  beforeEach(() => {
    mockFs.mkdir.mockResolvedValue(undefined);
  });

  it('returns empty array when no backup files exist', async () => {
    mockFs.readdir.mockResolvedValue([] as any);
    await expect(listLocalBackups()).resolves.toEqual([]);
  });

  it('filters to only lore-backup-*.json files', async () => {
    mockFs.readdir.mockResolvedValue([
      'lore-backup-2025-01-01-12-00-00.json',
      'other-file.txt',
      'lore-backup-2025-01-02-12-00-00.json',
    ] as any);
    mockFs.stat.mockResolvedValue({ size: 500, mtime: new Date('2025-01-02T12:00:00Z') } as any);

    const result = await listLocalBackups();
    expect(result).toHaveLength(2);
    expect(result.every((entry) => entry.filename.startsWith('lore-backup-'))).toBe(true);
  });

  it('sorts backups newest first', async () => {
    mockFs.readdir.mockResolvedValue([
      'lore-backup-2025-01-01-00-00-00.json',
      'lore-backup-2025-01-03-00-00-00.json',
      'lore-backup-2025-01-02-00-00-00.json',
    ] as any);
    mockFs.stat
      .mockResolvedValueOnce({ size: 100, mtime: new Date('2025-01-01T00:00:00Z') } as any)
      .mockResolvedValueOnce({ size: 100, mtime: new Date('2025-01-03T00:00:00Z') } as any)
      .mockResolvedValueOnce({ size: 100, mtime: new Date('2025-01-02T00:00:00Z') } as any);

    const result = await listLocalBackups();
    expect(result[0].created_at > result[1].created_at).toBe(true);
    expect(result[1].created_at > result[2].created_at).toBe(true);
  });

  it('returns empty array on readdir error', async () => {
    mockFs.readdir.mockRejectedValue(new Error('ENOENT'));
    await expect(listLocalBackups()).resolves.toEqual([]);
  });
});

describe('readLocalBackup', () => {
  it('reads from the configured backup directory with sanitized filename', async () => {
    mockFs.readFile.mockResolvedValue('{"format":"lore-backup-v1"}' as any);
    const result = await readLocalBackup('lore-backup-2025-01-01-00-00-00.json');
    expect(mockFs.readFile).toHaveBeenCalledWith(
      '/tmp/lore-backups/lore-backup-2025-01-01-00-00-00.json',
      'utf-8',
    );
    expect(result).toContain('lore-backup-v1');
  });

  it('sanitizes path traversal attempts using basename', async () => {
    mockFs.readFile.mockResolvedValue('{}' as any);
    await readLocalBackup('../../etc/passwd');
    const calls = (mockFs.readFile as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1];
    const calledPath = lastCall[0] as string;
    expect(calledPath).not.toContain('..');
    expect(calledPath).toMatch(/passwd/);
  });
});

describe('deleteLocalBackup', () => {
  it('deletes from the configured backup directory with sanitized filename', async () => {
    await deleteLocalBackup('lore-backup-2025-01-01-00-00-00.json');
    expect(mockFs.unlink).toHaveBeenCalledWith('/tmp/lore-backups/lore-backup-2025-01-01-00-00-00.json');
  });
});

describe('cleanupLocalBackups', () => {
  beforeEach(() => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
  });

  it('returns 0 when backups count is within retention', async () => {
    mockFs.readdir.mockResolvedValue(['lore-backup-2025-01-01-00-00-00.json'] as any);
    mockFs.stat.mockResolvedValue({ size: 100, mtime: new Date() } as any);

    await expect(cleanupLocalBackups(3)).resolves.toBe(0);
  });

  it('deletes oldest backups beyond retentionCount', async () => {
    mockFs.readdir.mockResolvedValue([
      'lore-backup-2025-01-01-00-00-00.json',
      'lore-backup-2025-01-02-00-00-00.json',
      'lore-backup-2025-01-03-00-00-00.json',
    ] as any);
    mockFs.stat
      .mockResolvedValueOnce({ size: 100, mtime: new Date('2025-01-01T00:00:00Z') } as any)
      .mockResolvedValueOnce({ size: 100, mtime: new Date('2025-01-02T00:00:00Z') } as any)
      .mockResolvedValueOnce({ size: 100, mtime: new Date('2025-01-03T00:00:00Z') } as any);

    const deleted = await cleanupLocalBackups(2);
    expect(deleted).toBe(1);
    expect(mockFs.unlink).toHaveBeenCalledOnce();
  });
});

describe('exportToWebDAV', () => {
  beforeEach(() => {
    mockSql.mockResolvedValue(makeResult([]));
    mockGetSettings.mockResolvedValue({
      'backup.webdav.url': 'https://dav.example.com/backups',
      'backup.webdav.username': 'user',
      'backup.webdav.password': 'pass',
      'backup.include_recall_events': false,
    } as any);
    mockFetch.mockResolvedValue({ ok: true, status: 201, statusText: 'Created', text: vi.fn() });
  });

  it('throws when WebDAV URL is not configured', async () => {
    mockGetSettings.mockResolvedValue({
      'backup.webdav.url': '',
      'backup.webdav.username': '',
      'backup.webdav.password': '',
    } as any);

    await expect(exportToWebDAV()).rejects.toThrow('WebDAV URL not configured');
  });

  it('calls fetch PUT with authorization header', async () => {
    await exportToWebDAV();
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('dav.example.com');
    expect(options.method).toBe('PUT');
    expect(options.headers.Authorization).toContain('Basic ');
  });

  it('returns filename, url, size, stats on success', async () => {
    const result = await exportToWebDAV();
    expect(result.filename).toMatch(/^lore-backup-/);
    expect(result.url).toContain('dav.example.com');
    expect(typeof result.size).toBe('number');
    expect(result.stats).toBeDefined();
  });

  it('throws when fetch response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });
    await expect(exportToWebDAV()).rejects.toThrow('WebDAV PUT 503');
  });
});

describe('listWebDAVBackups', () => {
  beforeEach(() => {
    mockGetSettings.mockResolvedValue({
      'backup.webdav.url': 'https://dav.example.com/backups',
      'backup.webdav.username': 'user',
      'backup.webdav.password': 'pass',
    } as any);
  });

  it('returns empty array when URL not configured', async () => {
    mockGetSettings.mockResolvedValue({
      'backup.webdav.url': '',
      'backup.webdav.username': '',
      'backup.webdav.password': '',
    } as any);

    await expect(listWebDAVBackups()).resolves.toEqual([]);
  });

  it('parses backup filenames from PROPFIND XML response', async () => {
    const xml = `<?xml version="1.0"?>
      <d:multistatus xmlns:d="DAV:">
        <d:response><d:href>/backups/lore-backup-2025-01-01-12-00-00.json</d:href></d:response>
        <d:response><d:href>/backups/lore-backup-2025-01-02-12-00-00.json</d:href></d:response>
      </d:multistatus>`;
    mockFetch.mockResolvedValue({ ok: true, status: 207, text: vi.fn().mockResolvedValue(xml) });

    const result = await listWebDAVBackups();
    expect(result).toHaveLength(2);
    expect(result[0]).toMatch(/^lore-backup-/);
    expect(result[0] > result[1]).toBe(true);
  });

  it('throws on PROPFIND error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' });
    await expect(listWebDAVBackups()).rejects.toThrow('PROPFIND 401');
  });
});

describe('cleanupWebDAVBackups', () => {
  beforeEach(() => {
    mockGetSettings.mockResolvedValue({
      'backup.webdav.url': 'https://dav.example.com/backups',
      'backup.webdav.username': 'user',
      'backup.webdav.password': 'pass',
    } as any);
  });

  it('returns 0 when URL not configured', async () => {
    mockGetSettings.mockResolvedValue({
      'backup.webdav.url': '',
      'backup.webdav.username': '',
      'backup.webdav.password': '',
    } as any);

    await expect(cleanupWebDAVBackups(3)).resolves.toBe(0);
  });

  it('returns 0 when backups count is within retention', async () => {
    const xml = `<d:response><d:href>/backups/lore-backup-2025-01-01-00-00-00.json</d:href></d:response>`;
    mockFetch.mockResolvedValue({ ok: true, status: 207, text: vi.fn().mockResolvedValue(xml) });

    await expect(cleanupWebDAVBackups(5)).resolves.toBe(0);
  });

  it('deletes excess backups beyond retention count', async () => {
    const xml = `
      <d:response><d:href>/backups/lore-backup-2025-01-03-00-00-00.json</d:href></d:response>
      <d:response><d:href>/backups/lore-backup-2025-01-02-00-00-00.json</d:href></d:response>
      <d:response><d:href>/backups/lore-backup-2025-01-01-00-00-00.json</d:href></d:response>
    `;
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 207, text: vi.fn().mockResolvedValue(xml) })
      .mockResolvedValue({ ok: true, status: 204, statusText: 'No Content' });

    const result = await cleanupWebDAVBackups(2);
    expect(result).toBe(1);
    const deleteCalls = mockFetch.mock.calls.filter(([, options]) => options?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(1);
  });
});
