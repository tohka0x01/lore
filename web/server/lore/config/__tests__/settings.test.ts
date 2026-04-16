import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../db', () => ({ sql: vi.fn() }));

import { sql } from '../../../db';
import {
  coerce,
  resolveFromDefault,
  resolveValue,
  getSetting,
  getSettings,
  getAllSettings,
  getSettingsSnapshot,
  updateSettings,
  resetSettings,
  validatePatchEntry,
  getSchema,
  __clearSettingsCache,
} from '../settings';
import { SETTINGS_SCHEMA, SCHEMA_BY_KEY, SECTIONS } from '../settingsSchema';
import type { SettingDef } from '../settingsSchema';

const mockSql = vi.mocked(sql);

function makeResult(rows: Record<string, unknown>[] = [], rowCount = rows.length) {
  return { rows, rowCount } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  __clearSettingsCache();
});

describe('settingsSchema', () => {
  it('exposes unique schema keys and expected settings-only additions', () => {
    expect(new Set(SETTINGS_SCHEMA.map((def) => def.key)).size).toBe(SETTINGS_SCHEMA.length);
    expect(SCHEMA_BY_KEY.get('embedding.api_key')?.secret).toBe(true);
    expect(SCHEMA_BY_KEY.get('view_llm.api_key')?.secret).toBe(true);
    expect(SCHEMA_BY_KEY.has('backup.local.path')).toBe(true);
    expect(SCHEMA_BY_KEY.has('review.local.path')).toBe(true);
  });

  it('SCHEMA_BY_KEY has an entry for every schema item', () => {
    for (const def of SETTINGS_SCHEMA) {
      expect(SCHEMA_BY_KEY.get(def.key)).toBe(def);
    }
  });

  it('SECTIONS covers all section ids used in schema', () => {
    const sectionIds = new Set(SETTINGS_SCHEMA.map((def) => def.section));
    const declaredIds = new Set(SECTIONS.map((section) => section.id));
    for (const id of sectionIds) {
      expect(declaredIds.has(id)).toBe(true);
    }
  });
});

describe('coerce', () => {
  const numSchema: SettingDef = { key: 'x', section: 's', label: 'l', type: 'number', default: 0 };
  const intSchema: SettingDef = { key: 'x', section: 's', label: 'l', type: 'integer', default: 0 };
  const enumSchema: SettingDef = { key: 'x', section: 's', label: 'l', type: 'enum', default: 'a', options: ['a', 'b'] };
  const strSchema: SettingDef = { key: 'x', section: 's', label: 'l', type: 'string', default: '' };
  const boolSchema: SettingDef = { key: 'x', section: 's', label: 'l', type: 'boolean', default: false };

  it('returns null for nullish values', () => {
    expect(coerce(null, numSchema)).toBeNull();
    expect(coerce(undefined, strSchema)).toBeNull();
  });

  it('coerces numbers from strings', () => {
    expect(coerce('3.14', numSchema)).toBeCloseTo(3.14);
  });

  it('returns null for non-finite numbers', () => {
    expect(coerce('abc', numSchema)).toBeNull();
  });

  it('coerces integers and truncates', () => {
    expect(coerce('7.9', intSchema)).toBe(7);
  });

  it('returns null for invalid enums', () => {
    expect(coerce('c', enumSchema)).toBeNull();
  });

  it('passes through valid enums', () => {
    expect(coerce('b', enumSchema)).toBe('b');
  });

  it('coerces strings', () => {
    expect(coerce(42, strSchema)).toBe('42');
  });

  it('coerces booleans', () => {
    expect(coerce(true, boolSchema)).toBe(true);
    expect(coerce('true', boolSchema)).toBe(true);
    expect(coerce('false', boolSchema)).toBe(false);
    expect(coerce('anything', boolSchema)).toBe(false);
  });
});

describe('resolveFromDefault', () => {
  it('returns the schema default', () => {
    expect(resolveFromDefault({ key: 'x', section: 's', label: 'l', type: 'string', default: 'hello' })).toBe('hello');
  });
});

describe('resolveValue', () => {
  it('returns db value when present as wrapped JSON', () => {
    const dbValues = new Map<string, unknown>([['recall.scoring.rrf_k', { value: 60 }]]);
    expect(resolveValue('recall.scoring.rrf_k', dbValues)).toBe(60);
  });

  it('returns db value when present as a raw primitive', () => {
    const dbValues = new Map<string, unknown>([['recall.scoring.rrf_k', 45]]);
    expect(resolveValue('recall.scoring.rrf_k', dbValues)).toBe(45);
  });

  it('falls back to schema default when db value is invalid or missing', () => {
    const invalid = new Map<string, unknown>([['recall.scoring.rrf_k', { value: 'bad' }]]);
    const missing = new Map<string, unknown>();
    expect(resolveValue('recall.scoring.rrf_k', invalid)).toBe(20);
    expect(resolveValue('recall.scoring.rrf_k', missing)).toBe(20);
  });

  it('returns undefined for unknown keys', () => {
    expect(resolveValue('no.such.key', new Map())).toBeUndefined();
  });
});

describe('getSetting / getSettings / getAllSettings / getSettingsSnapshot', () => {
  it('getSetting returns resolved db value', async () => {
    mockSql.mockResolvedValueOnce(makeResult([{ key: 'recall.scoring.rrf_k', value: { value: 50 } }]));

    await expect(getSetting('recall.scoring.rrf_k')).resolves.toBe(50);
  });

  it('getSettings returns multiple keys', async () => {
    mockSql.mockResolvedValueOnce(makeResult([
      { key: 'recall.scoring.rrf_k', value: { value: 33 } },
      { key: 'recall.weights.w_exact', value: { value: 0.5 } },
    ]));

    const values = await getSettings(['recall.scoring.rrf_k', 'recall.weights.w_exact']);
    expect(values['recall.scoring.rrf_k']).toBe(33);
    expect(values['recall.weights.w_exact']).toBeCloseTo(0.5);
  });

  it('getAllSettings resolves defaults for missing keys', async () => {
    mockSql.mockResolvedValueOnce(makeResult([{ key: 'recall.scoring.rrf_k', value: { value: 77 } }]));

    const values = await getAllSettings();
    expect(values['recall.scoring.rrf_k']).toBe(77);
    expect(values['embedding.provider']).toBe('openai_compatible');
  });

  it('uses cache on repeated reads within TTL', async () => {
    mockSql.mockResolvedValueOnce(makeResult([{ key: 'recall.scoring.rrf_k', value: { value: 77 } }]));

    await getSetting('recall.scoring.rrf_k');
    const second = await getSetting('recall.scoring.rrf_k');

    expect(second).toBe(77);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('getSettingsSnapshot masks secret values and reports sources', async () => {
    mockSql.mockResolvedValueOnce(makeResult([
      { key: 'embedding.api_key', value: { value: 'secret-key' } },
      { key: 'embedding.base_url', value: { value: 'http://embed.local' } },
    ]));

    const snapshot = await getSettingsSnapshot();

    expect(snapshot.values['embedding.api_key']).toBe('');
    expect(snapshot.secret_configured['embedding.api_key']).toBe(true);
    expect(snapshot.sources['embedding.api_key']).toBe('db');
    expect(snapshot.values['embedding.base_url']).toBe('http://embed.local');
    expect(snapshot.sources['view_llm.api_key']).toBe('default');
    expect(snapshot.secret_configured['view_llm.api_key']).toBe(false);
    expect(snapshot.defaults['embedding.provider']).toBe('openai_compatible');
  });
});

describe('updateSettings', () => {
  it('writes a valid patch and returns a snapshot', async () => {
    mockSql.mockResolvedValue(makeResult());

    await updateSettings({ 'recall.scoring.rrf_k': 40 });

    const upsertCall = mockSql.mock.calls.find(([text]) => (text as string).includes('INSERT INTO app_settings'));
    expect(upsertCall).toBeDefined();
    expect(upsertCall?.[1]).toEqual(['recall.scoring.rrf_k', JSON.stringify({ value: 40 })]);
  });

  it('throws for unknown keys', async () => {
    await expect(updateSettings({ 'no.such.key': 1 })).rejects.toThrow('Unknown setting key');
  });

  it('throws for non-object patches', async () => {
    await expect(updateSettings(null as any)).rejects.toThrow('patch must be an object');
  });

  it('rejects blank writes for secret settings', async () => {
    await expect(updateSettings({ 'embedding.api_key': '' })).rejects.toThrow('Use reset to clear secret setting');
  });
});

describe('resetSettings', () => {
  it('deletes a single key from the db', async () => {
    mockSql.mockResolvedValue(makeResult());

    await resetSettings('recall.scoring.rrf_k');

    const deleteCall = mockSql.mock.calls.find(([text]) => (text as string).includes('DELETE FROM app_settings'));
    expect(deleteCall).toBeDefined();
    expect(deleteCall?.[1]).toEqual(['recall.scoring.rrf_k']);
  });

  it('accepts arrays of keys', async () => {
    mockSql.mockResolvedValue(makeResult());

    await resetSettings(['recall.scoring.rrf_k', 'recall.weights.w_exact']);

    const deleteCalls = mockSql.mock.calls.filter(([text]) => (text as string).includes('DELETE FROM app_settings'));
    expect(deleteCalls).toHaveLength(2);
  });

  it('throws for unknown keys', async () => {
    await expect(resetSettings('no.such.key')).rejects.toThrow('Unknown setting key');
  });
});

describe('validatePatchEntry', () => {
  it('throws for unknown keys', () => {
    expect(() => validatePatchEntry('no.key', 1)).toThrow('Unknown setting key');
  });

  it('throws when numbers are below min', () => {
    expect(() => validatePatchEntry('recall.scoring.rrf_k', 2)).toThrow('must be >= 5');
  });

  it('throws when numbers are above max', () => {
    expect(() => validatePatchEntry('recall.scoring.rrf_k', 999)).toThrow('must be <= 200');
  });

  it('throws for invalid enum values', () => {
    expect(() => validatePatchEntry('recall.scoring.strategy', 'nonexistent')).toThrow('Invalid value');
  });

  it('accepts valid enum values', () => {
    expect(validatePatchEntry('recall.scoring.strategy', 'rrf')).toBe('rrf');
  });

  it('coerces numeric strings', () => {
    expect(validatePatchEntry('recall.scoring.rrf_k', '30')).toBe(30);
  });

  it('validates booleans', () => {
    expect(validatePatchEntry('recall.recency.enabled', true)).toBe(true);
    expect(validatePatchEntry('recall.recency.enabled', 'true')).toBe(true);
    expect(validatePatchEntry('recall.recency.enabled', 'false')).toBe(false);
  });

  it('rejects blank secret values', () => {
    expect(() => validatePatchEntry('embedding.api_key', '')).toThrow('Use reset to clear secret setting');
  });
});

describe('__clearSettingsCache', () => {
  it('forces the next getSetting call to reload from db', async () => {
    mockSql
      .mockResolvedValueOnce(makeResult([{ key: 'recall.scoring.rrf_k', value: { value: 10 } }]))
      .mockResolvedValueOnce(makeResult([{ key: 'recall.scoring.rrf_k', value: { value: 20 } }]));

    expect(await getSetting('recall.scoring.rrf_k')).toBe(10);

    __clearSettingsCache();

    expect(await getSetting('recall.scoring.rrf_k')).toBe(20);
    expect(mockSql).toHaveBeenCalledTimes(2);
  });
});

describe('getSchema', () => {
  it('returns schema and sections', () => {
    expect(getSchema()).toEqual({ schema: SETTINGS_SCHEMA, sections: SECTIONS });
  });
});
