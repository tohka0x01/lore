import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/settings', () => ({
  getSettings: vi.fn(),
}));
vi.mock('../../memory/boot', () => ({
  bootView: vi.fn(),
}));
vi.mock('../../llm/config', () => ({
  resolveViewLlmConfig: vi.fn(),
}));

import { getSettings } from '../../config/settings';
import { bootView } from '../../memory/boot';
import { resolveViewLlmConfig } from '../../llm/config';
import { buildSetupFlowStatus, getSetupFlowStatus } from '../flow';

const mockGetSettings = vi.mocked(getSettings);
const mockBootView = vi.mocked(bootView);
const mockResolveViewLlmConfig = vi.mocked(resolveViewLlmConfig);

const BASE_BOOT_VIEW = {
  loaded: 3,
  total: 3,
  failed: [],
  core_memories: [],
  recent_memories: [],
  nodes: [
    {
      uri: 'core://agent',
      role: 'agent' as const,
      role_label: 'workflow constraints',
      purpose: 'Working rules, collaboration constraints, and execution protocol.',
      dream_protection: 'protected' as const,
      state: 'initialized' as const,
      content: 'Agent memory',
      content_length: 12,
      priority: 0,
      disclosure: null,
      node_uuid: 'agent-uuid',
    },
    {
      uri: 'core://soul',
      role: 'soul' as const,
      role_label: 'style / persona / self-definition',
      purpose: 'Agent style, persona, and self-cognition baseline.',
      dream_protection: 'protected' as const,
      state: 'empty' as const,
      content: '',
      content_length: 0,
      priority: 0,
      disclosure: null,
      node_uuid: 'soul-uuid',
    },
    {
      uri: 'preferences://user',
      role: 'user' as const,
      role_label: 'stable user definition',
      purpose: 'Stable user information, user preferences, and durable collaboration context.',
      dream_protection: 'protected' as const,
      state: 'missing' as const,
      content: '',
      content_length: 0,
      priority: null,
      disclosure: null,
      node_uuid: null,
    },
  ],
  overall_state: 'partial' as const,
  remaining_count: 2,
  draft_generation_available: false,
  draft_generation_reason: 'View LLM API key is not configured.',
};

describe('buildSetupFlowStatus', () => {
  it('marks steps complete in order and picks the first incomplete step', () => {
    const result = buildSetupFlowStatus({
      embedding: { configured: true, runtime_ready: true },
      llm: { configured: false, runtime_ready: false },
      boot: BASE_BOOT_VIEW,
    });

    expect(result.complete).toBe(false);
    expect(result.next_step).toBe('/setup/llm');
    expect(result.steps).toEqual([
      { id: 'embedding', path: '/setup/embedding', complete: true },
      { id: 'llm', path: '/setup/llm', complete: false },
      { id: 'boot-agent', path: '/setup/boot/agent', complete: true, role: 'agent', uri: 'core://agent' },
      { id: 'boot-soul', path: '/setup/boot/soul', complete: false, role: 'soul', uri: 'core://soul' },
      { id: 'boot-user', path: '/setup/boot/user', complete: false, role: 'user', uri: 'preferences://user' },
    ]);
  });

  it('marks setup complete when all steps are complete', () => {
    const result = buildSetupFlowStatus({
      embedding: { configured: true, runtime_ready: true },
      llm: { configured: true, runtime_ready: true },
      boot: {
        ...BASE_BOOT_VIEW,
        nodes: BASE_BOOT_VIEW.nodes.map((node) => ({ ...node, state: 'initialized' as const })),
        overall_state: 'complete',
        remaining_count: 0,
        draft_generation_available: true,
        draft_generation_reason: null,
      },
    });

    expect(result.complete).toBe(true);
    expect(result.next_step).toBeNull();
    expect(result.steps.every((step) => step.complete)).toBe(true);
  });
});

describe('getSetupFlowStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      'embedding.base_url': 'http://embed:8080',
      'embedding.api_key': 'embed-key',
      'embedding.model': 'embed-model',
      'view_llm.base_url': 'http://llm:8080',
      'view_llm.api_key': 'llm-key',
      'view_llm.model': 'view-model',
    });
    mockBootView.mockResolvedValue(BASE_BOOT_VIEW as any);
    mockResolveViewLlmConfig.mockResolvedValue(null);
  });

  it('treats embedding as runtime-ready once settings are complete', async () => {
    const result = await getSetupFlowStatus();

    expect(result.embedding).toEqual({ configured: true, runtime_ready: true });
    expect(result.llm).toEqual({ configured: true, runtime_ready: false });
    expect(result.next_step).toBe('/setup/boot/soul');
  });

  it('marks llm runtime ready when resolveViewLlmConfig succeeds', async () => {
    mockResolveViewLlmConfig.mockResolvedValue({
      provider: 'openai_compatible',
      base_url: 'http://llm:8080',
      api_key: 'key',
      model: 'view-model',
      timeout_ms: 5000,
      temperature: 0.2,
      api_version: '',
    });

    const result = await getSetupFlowStatus();

    expect(result.llm).toEqual({ configured: true, runtime_ready: true });
  });

  it('treats embedding and llm as incomplete when required settings fields are missing', async () => {
    mockGetSettings.mockResolvedValue({
      'embedding.base_url': 'http://embed:8080',
      'embedding.api_key': '',
      'embedding.model': 'embed-model',
      'view_llm.base_url': 'http://llm:8080',
      'view_llm.api_key': '',
      'view_llm.model': 'view-model',
    });

    const result = await getSetupFlowStatus();

    expect(result.embedding).toEqual({ configured: false, runtime_ready: false });
    expect(result.llm).toEqual({ configured: false, runtime_ready: false });
    expect(result.next_step).toBe('/setup/embedding');
  });
});
