import { describe, expect, it } from 'vitest';
import { cacheKey, cacheTag, hashKey, stableJson } from '../key';
import { LocalCacheStore } from '../localCache';

describe('cache key utilities', () => {
  it('hashes JSON objects stably regardless of property order', () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
    expect(hashKey({ b: 2, a: 1 })).toBe(hashKey({ a: 1, b: 2 }));
  });

  it('builds versioned keys and tags with prefix', () => {
    expect(cacheKey('node', ['core://agent', 'full'])).toBe('lore:v1:node:core://agent:full');
    expect(cacheTag('memory')).toMatch(/^lore:v1:tag:memory:/);
  });
});

describe('LocalCacheStore', () => {
  it('expires local values by ttl', async () => {
    const cache = new LocalCacheStore();
    await cache.set('k', 'v', { ttlMs: 10 });
    expect((await cache.getEntry('k')).value).toBe('v');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await cache.getEntry('k')).hit).toBe(false);
  });

  it('treats cached null as a hit', async () => {
    const cache = new LocalCacheStore();
    await cache.set('nullable', null, { ttlMs: 1000 });
    expect(await cache.getEntry('nullable')).toEqual({ hit: true, value: null });
  });

  it('returns a JSON clone instead of the original object reference', async () => {
    const cache = new LocalCacheStore();
    const value = { nested: { count: 1 } };
    await cache.set('json', value, { ttlMs: 1000 });
    value.nested.count = 2;
    expect((await cache.getEntry<typeof value>('json')).value).toEqual({ nested: { count: 1 } });
  });

  it('keeps a tag index alive for the longest tagged member', async () => {
    const cache = new LocalCacheStore();
    await cache.set('long', 'a', { ttlMs: 1000, tags: ['mixed'] });
    await cache.set('short', 'b', { ttlMs: 10, tags: ['mixed'] });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await cache.invalidateTag('mixed');
    expect((await cache.getEntry('long')).hit).toBe(false);
  });
});
