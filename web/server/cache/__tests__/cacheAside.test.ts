import { afterEach, describe, expect, it, vi } from 'vitest';
import { cached } from '../cacheAside';
import { __resetCacheForTest, getCacheStore } from '../index';

vi.mock('../../lore/config/settings', () => ({
  getSetting: vi.fn().mockResolvedValue(true),
}));

afterEach(async () => {
  await (await getCacheStore()).clear();
  __resetCacheForTest();
  delete process.env.REDIS_URL;
  delete process.env.CACHE_TEST_ENABLE;
});

describe('cached', () => {
  it('uses cached null as a hit', async () => {
    process.env.CACHE_TEST_ENABLE = 'true';
    const store = await getCacheStore();
    await store.set('nullable', null, { ttlMs: 1000 });
    const load = vi.fn().mockResolvedValue('loaded');
    expect(await cached({ key: 'nullable', ttlMs: 1000 }, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('collapses concurrent loads for the same key', async () => {
    process.env.CACHE_TEST_ENABLE = 'true';
    const load = vi.fn().mockResolvedValue({ ok: true });
    const [a, b] = await Promise.all([
      cached({ key: 'same', ttlMs: 1000 }, load),
      cached({ key: 'same', ttlMs: 1000 }, load),
    ]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(load).toHaveBeenCalledTimes(1);
  });
});
