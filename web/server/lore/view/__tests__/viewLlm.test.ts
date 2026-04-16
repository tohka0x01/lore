import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../db', () => ({ sql: vi.fn() }));
vi.mock('../../config/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../llm/provider', () => ({
  generateText: vi.fn(),
}));

import { getSettings } from '../../config/settings';
import { generateText } from '../../llm/provider';
import {
  resolveViewLlmConfig,
  extractJsonObject,
  chatCompletion,
  buildViewGenerationMessages,
  refineDocumentWithLlm,
  refineDocumentsWithLlm,
} from '../viewLlm';

const mockGetSettings = vi.mocked(getSettings);
const mockGenerateText = vi.mocked(generateText);

// ---------------------------------------------------------------------------
// extractJsonObject
// ---------------------------------------------------------------------------

describe('extractJsonObject', () => {
  it('parses valid JSON directly', () => {
    const result = extractJsonObject('{"gist":"hello","question":["a","b","c"]}');
    expect(result).toEqual({ gist: 'hello', question: ['a', 'b', 'c'] });
  });

  it('extracts JSON embedded in text', () => {
    const result = extractJsonObject('Some preamble text {"key":"value"} trailing text');
    expect(result).toEqual({ key: 'value' });
  });

  it('returns null for empty input', () => {
    expect(extractJsonObject('')).toBeNull();
    expect(extractJsonObject(null)).toBeNull();
    expect(extractJsonObject(undefined)).toBeNull();
  });

  it('returns null for text with no JSON', () => {
    expect(extractJsonObject('hello world no json here')).toBeNull();
  });

  it('returns null for malformed JSON even with braces', () => {
    expect(extractJsonObject('{not valid json}')).toBeNull();
  });

  it('handles JSON with markdown fences', () => {
    const input = '```json\n{"gist":"test"}\n```';
    const result = extractJsonObject(input);
    expect(result).toEqual({ gist: 'test' });
  });
});

// ---------------------------------------------------------------------------
// resolveViewLlmConfig
// ---------------------------------------------------------------------------

describe('resolveViewLlmConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns config when all settings are present', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'view_llm.base_url': 'http://llm:8080',
      'view_llm.api_key': 'test-key',
      'view_llm.model': 'test-model',
      'view_llm.temperature': 0.3,
      'view_llm.timeout_ms': 15000,
    });
    const config = await resolveViewLlmConfig();
    expect(config).toEqual({
      provider: 'openai_compatible',
      base_url: 'http://llm:8080',
      api_key: 'test-key',
      model: 'test-model',
      temperature: 0.3,
      timeout_ms: 15000,
      api_version: '',
    });
  });

  it('returns null when base_url is missing', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'view_llm.base_url': '',
      'view_llm.api_key': 'test-key',
      'view_llm.model': 'model',
    });
    const config = await resolveViewLlmConfig();
    expect(config).toBeNull();
  });

  it('returns null when model is missing', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'view_llm.base_url': 'http://llm',
      'view_llm.api_key': 'test-key',
      'view_llm.model': '',
    });
    const config = await resolveViewLlmConfig();
    expect(config).toBeNull();
  });

  it('returns null when api_key is missing', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'view_llm.base_url': 'http://llm',
      'view_llm.api_key': '',
      'view_llm.model': 'model',
    });
    const config = await resolveViewLlmConfig();
    expect(config).toBeNull();
  });

  it('does not fall back to embedding config', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'view_llm.base_url': '',
      'view_llm.api_key': '',
      'view_llm.model': 'model',
    });
    const config = await resolveViewLlmConfig();
    expect(config).toBeNull();
  });

  it('preserves zero temperature and defaults timeout when zero', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'view_llm.base_url': 'http://llm',
      'view_llm.api_key': 'test-key',
      'view_llm.model': 'model',
      'view_llm.temperature': 0,
      'view_llm.timeout_ms': 0,
    });
    const config = await resolveViewLlmConfig();
    expect(config!.temperature).toBe(0);
    expect(config!.timeout_ms).toBe(1800000);
  });

  it('uses configured provider and api version when present', async () => {
    mockGetSettings.mockResolvedValueOnce({
      'view_llm.provider': 'anthropic',
      'view_llm.base_url': 'http://llm',
      'view_llm.api_key': 'test-key',
      'view_llm.model': 'model',
      'view_llm.api_version': '2023-06-01',
    });
    const config = await resolveViewLlmConfig();
    expect(config!.provider).toBe('anthropic');
    expect(config!.api_version).toBe('2023-06-01');
  });
});

// ---------------------------------------------------------------------------
// chatCompletion
// ---------------------------------------------------------------------------

describe('chatCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateText.mockReset();
  });

  it('returns content from successful openai-compatible response', async () => {
    const config = {
      provider: 'openai_compatible' as const,
      base_url: 'http://llm:8080',
      api_key: 'key',
      model: 'test',
      timeout_ms: 5000,
      temperature: 0.2,
      api_version: '',
    };
    mockGenerateText.mockResolvedValueOnce({
      content: '{"gist":"test"}',
      raw: { choices: [{ message: { content: '{"gist":"test"}' } }] },
    });

    const result = await chatCompletion(config, [{ role: 'user', content: 'hello' }]);
    expect(result).toBe('{"gist":"test"}');
  });

  it('returns content from anthropic response blocks', async () => {
    const config = {
      provider: 'anthropic' as const,
      base_url: 'http://llm:8080',
      api_key: 'key',
      model: 'claude-sonnet-4-6',
      timeout_ms: 5000,
      temperature: 0.2,
      api_version: '2023-06-01',
    };
    mockGenerateText.mockResolvedValueOnce({
      content: '{"gist":"anthropic"}',
      raw: { content: [{ type: 'text', text: '{"gist":"anthropic"}' }] },
    });

    const result = await chatCompletion(config, [{ role: 'user', content: 'hello' }]);
    expect(result).toBe('{"gist":"anthropic"}');
  });

  it('returns content from openai responses output text', async () => {
    const config = {
      provider: 'openai_responses' as const,
      base_url: 'http://llm:8080',
      api_key: 'key',
      model: 'gpt-4.1',
      timeout_ms: 5000,
      temperature: 0.2,
      api_version: '',
    };
    mockGenerateText.mockResolvedValueOnce({
      content: '{"gist":"responses"}',
      raw: { output: [{ type: 'message', content: [{ type: 'output_text', text: '{"gist":"responses"}' }] }] },
    });

    const result = await chatCompletion(config, [{ role: 'user', content: 'hello' }]);
    expect(result).toBe('{"gist":"responses"}');
  });

  it('throws on non-ok response', async () => {
    const config = {
      provider: 'openai_compatible' as const,
      base_url: 'http://llm:8080',
      api_key: 'key',
      model: 'test',
      timeout_ms: 5000,
      temperature: 0.2,
      api_version: '',
    };
    mockGenerateText.mockRejectedValueOnce(new Error('View LLM request failed: 500'));

    await expect(chatCompletion(config, [{ role: 'user', content: 'hello' }])).rejects.toThrow('View LLM request failed: 500');
  });
});

// ---------------------------------------------------------------------------
// buildViewGenerationMessages
// ---------------------------------------------------------------------------

describe('buildViewGenerationMessages', () => {
  it('returns system and user messages', () => {
    const doc = {
      uri: 'core://test',
      path: 'test',
      priority: 5,
      disclosure: 'when testing',
      glossary_keywords: ['kw1'],
      body_preview: 'Some preview',
    };
    const messages = buildViewGenerationMessages(doc);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[0].content).toContain('retrieval views');
    expect(messages[0].content).toContain('gist');
    expect(messages[0].content).toContain('question');
  });

  it('includes document fields in user message', () => {
    const doc = {
      uri: 'core://my/node',
      path: 'my/node',
      priority: 3,
      disclosure: 'test disclosure',
      glossary_keywords: ['keyword'],
      body_preview: 'Body text',
    };
    const messages = buildViewGenerationMessages(doc);
    const userContent = JSON.parse(messages[1].content);
    expect(userContent.uri).toBe('core://my/node');
    expect(userContent.path).toBe('my/node');
    expect(userContent.priority).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// refineDocumentsWithLlm
// ---------------------------------------------------------------------------

describe('refineDocumentsWithLlm', () => {
  it('returns original docs when config is null', async () => {
    const docs = [{ uri: 'core://test' }];
    const result = await refineDocumentsWithLlm(docs, null);
    expect(result).toBe(docs);
  });

  it('returns original docs when docs array is empty', async () => {
    const config = {
      base_url: 'http://llm', api_key: 'key', model: 'test',
      timeout_ms: 5000, temperature: 0.2,
    };
    const result = await refineDocumentsWithLlm([], config);
    expect(result).toEqual([]);
  });
});
