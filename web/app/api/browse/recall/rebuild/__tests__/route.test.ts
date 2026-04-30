import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/server/auth', () => ({
  requireBearerAuth: vi.fn(),
}));
vi.mock('@/server/lore/recall/recall', () => ({
  ensureRecallIndex: vi.fn(),
}));

import { requireBearerAuth } from '@/server/auth';
import { ensureRecallIndex } from '@/server/lore/recall/recall';
import { POST } from '../route';

const mockRequireBearerAuth = vi.mocked(requireBearerAuth);
const mockEnsureRecallIndex = vi.mocked(ensureRecallIndex);

describe('/api/browse/recall/rebuild route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireBearerAuth.mockReturnValue(null);
    mockEnsureRecallIndex.mockResolvedValue({ updated_count: 0 } as any);
  });

  it('accepts an empty POST body', async () => {
    const response = await POST(new Request('http://localhost/api/browse/recall/rebuild', {
      method: 'POST',
    }) as any);
    const body = await response.json();

    expect(mockEnsureRecallIndex).toHaveBeenCalledWith({});
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.updated_count).toBe(0);
  });

  it('passes JSON POST body through to rebuild', async () => {
    const response = await POST(new Request('http://localhost/api/browse/recall/rebuild', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'embed-model' }),
    }) as any);

    expect(mockEnsureRecallIndex).toHaveBeenCalledWith({ model: 'embed-model' });
    expect(response.status).toBe(200);
  });
});
