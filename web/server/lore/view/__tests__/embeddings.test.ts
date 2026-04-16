import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/settings', () => ({
  getSettings: vi.fn(),
}));

import { getSettings } from '../../config/settings';
import { vectorLiteral, resolveEmbeddingConfig, embedTexts, getEmbeddingRuntimeConfig } from '../embeddings';

const mockGetSettings = vi.mocked(getSettings);

describe('vectorLiteral', () => {
  it('converts array to pgvector literal', () => {
    expect(vectorLiteral([1, 2, 3])).toBe('[1,2,3]');
  });

  it('converts float array', () => {
    expect(vectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });

  it('returns string value for non-array', () => {
    expect(vectorLiteral('[1,2,3]')).toBe('[1,2,3]');
  });

  it('returns empty array for null', () => {
    expect(vectorLiteral(null)).toBe('[]');
  });

  it('returns empty array for undefined', () => {
    expect(vectorLiteral(undefined)).toBe('[]');
  });

  it('coerces non-numeric array items to NaN then Number', () => {
    expect(vectorLiteral([1, 'abc', 3])).toBe('[1,NaN,3]');
  });
});

describe('resolveEmbeddingConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      'embedding.provider': 'openai_compatible',
      'embedding.base_url': 'http://embeddings.local',
      'embedding.api_key': 'test-key',
      'embedding.model': 'text-embedding-3-small',
    });
  });

  it('resolves config from settings', async () => {
    const config = await resolveEmbeddingConfig();
    expect(config).toEqual({
      provider: 'openai_compatible',
      base_url: 'http://embeddings.local',
      api_key: 'test-key',
      model: 'text-embedding-3-small',
    });
  });

  it('throws when api_key is missing', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'embedding.provider': 'openai_compatible',
      'embedding.base_url': 'http://embeddings.local',
      'embedding.api_key': '',
      'embedding.model': 'text-embedding-3-small',
    });

    await expect(resolveEmbeddingConfig()).rejects.toThrow('Embedding config is missing');
  });

  it('uses explicit override values for provided fields only', async () => {
    const config = await resolveEmbeddingConfig({
      base_url: 'http://override.local/',
      model: 'override-model',
    });

    expect(config).toEqual({
      provider: 'openai_compatible',
      base_url: 'http://override.local',
      api_key: 'test-key',
      model: 'override-model',
    });
  });

  it('accepts fully explicit config when settings are empty', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'embedding.provider': 'openai_compatible',
      'embedding.base_url': '',
      'embedding.api_key': '',
      'embedding.model': '',
    });

    const config = await resolveEmbeddingConfig({
      base_url: 'http://fallback',
      api_key: 'fallback-key',
      model: 'fallback-model',
    });

    expect(config).toEqual({
      provider: 'openai_compatible',
      base_url: 'http://fallback',
      api_key: 'fallback-key',
      model: 'fallback-model',
    });
  });

  it('strips trailing slash from base_url', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'embedding.provider': 'openai_compatible',
      'embedding.base_url': 'http://test.local/',
      'embedding.api_key': 'key',
      'embedding.model': 'model',
    });

    const config = await resolveEmbeddingConfig();
    expect(config.base_url).toBe('http://test.local');
  });
});

describe('embedTexts', () => {
  it('fetches embeddings for each input', async () => {
    const mockResponse = { data: [{ index: 0, embedding: [0.1, 0.2] }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const result = await embedTexts(
      { base_url: 'http://test', api_key: 'key', model: 'model' },
      ['hello'],
    );

    expect(result).toEqual([[0.1, 0.2]]);
    vi.unstubAllGlobals();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    await expect(embedTexts(
      { base_url: 'http://test', api_key: 'key', model: 'model' },
      ['hello'],
    )).rejects.toThrow('Embedding request failed: 429');

    vi.unstubAllGlobals();
  });

  it('throws when response has no embedding data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    }));

    await expect(embedTexts(
      { base_url: 'http://test', api_key: 'key', model: 'model' },
      ['hello'],
    )).rejects.toThrow('Embedding response missing data rows');

    vi.unstubAllGlobals();
  });
});

describe('getEmbeddingRuntimeConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      'embedding.provider': 'openai_compatible',
      'embedding.base_url': 'http://embeddings.local',
      'embedding.api_key': 'key',
      'embedding.model': 'text-embedding-3-small',
    });
  });

  it('returns base_url and model without api_key', async () => {
    const config = await getEmbeddingRuntimeConfig();
    expect(config).toEqual({
      provider: 'openai_compatible',
      base_url: 'http://embeddings.local',
      model: 'text-embedding-3-small',
    });
    expect(config).not.toHaveProperty('api_key');
  });
});
