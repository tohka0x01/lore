import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../server/auth', () => ({
  requireBearerAuth: vi.fn(),
}));
vi.mock('../../../../../server/lore/lifecycle/config', () => ({
  loadLifecycleTextConfig: vi.fn(),
}));

import { requireBearerAuth } from '../../../../../server/auth';
import { loadLifecycleTextConfig } from '../../../../../server/lore/lifecycle/config';
import * as guidanceRoute from '../route';

const mockRequireBearerAuth = vi.mocked(requireBearerAuth);
const mockLoadLifecycleTextConfig = vi.mocked(loadLifecycleTextConfig);

describe('lifecycle guidance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireBearerAuth.mockReturnValue(null);
    mockLoadLifecycleTextConfig.mockResolvedValue({
      guidance: 'SERVER GUIDANCE',
      bootPreamble: 'BOOT SECRET CONTEXT',
      startupRecallPreamble: 'STARTUP RECALL',
      promptRecallPreamble: 'PROMPT RECALL',
    });
  });

  it('returns the unauthorized response unchanged', async () => {
    const unauthorized = new Response(JSON.stringify({ detail: 'Unauthorized' }), { status: 401 }) as never;
    mockRequireBearerAuth.mockReturnValue(unauthorized);

    const response = await guidanceRoute.GET(new Request(
      'http://localhost/api/lifecycle/guidance?client_type=opencode',
    ) as any);

    expect(response).toBe(unauthorized);
    expect(mockLoadLifecycleTextConfig).not.toHaveBeenCalled();
  });

  it('returns effective guidance only', async () => {
    const response = await guidanceRoute.GET(new Request(
      'http://localhost/api/lifecycle/guidance?client_type=opencode',
      { headers: { authorization: 'Bearer test-token' } },
    ) as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ guidance: 'SERVER GUIDANCE' });
    expect(JSON.stringify(body)).not.toContain('BOOT SECRET CONTEXT');
    expect(JSON.stringify(body)).not.toContain('STARTUP RECALL');
    expect(JSON.stringify(body)).not.toContain('PROMPT RECALL');
    expect(JSON.stringify(body)).not.toContain('test-token');
    expect(Object.keys(body)).toEqual(['guidance']);
  });

  it('returns an empty guidance string when server guidance is disabled', async () => {
    mockLoadLifecycleTextConfig.mockResolvedValueOnce({
      guidance: '',
      bootPreamble: 'BOOT PREAMBLE',
      startupRecallPreamble: 'STARTUP',
      promptRecallPreamble: 'PROMPT',
    });

    const response = await guidanceRoute.GET(new Request(
      'http://localhost/api/lifecycle/guidance?client_type=opencode',
    ) as any);

    expect(await response.json()).toEqual({ guidance: '' });
  });
});
