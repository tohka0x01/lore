import { sql } from '../db';
import type { CacheHealth, CacheStore } from './types';
import { LocalCacheStore } from './localCache';
import { NoopCacheStore } from './noopCache';
import { RedisCacheStore } from './redisCache';

declare global {
  var __loreCacheStore: CacheStore | undefined;
}

async function isCacheEnabled(): Promise<boolean> {
  try {
    const result = await sql(`SELECT value FROM app_settings WHERE key = $1 LIMIT 1`, ['cache.enabled']);
    const raw = result.rows[0]?.value;
    const value = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    return value !== false;
  } catch {
    return true;
  }
}

async function createCacheStore(): Promise<CacheStore> {
  if (!(await isCacheEnabled())) return new NoopCacheStore();

  const redisUrl = String(process.env.REDIS_URL || '').trim();
  if (!redisUrl) return new LocalCacheStore();

  const redis = new RedisCacheStore(redisUrl);
  const health = await redis.health();
  if (health.ok) return redis;

  console.warn('[cache] Redis unavailable during startup; using local cache', health.detail || 'unknown');
  return new LocalCacheStore();
}

export async function getCacheStore(): Promise<CacheStore> {
  if (globalThis.__loreCacheStore) return globalThis.__loreCacheStore;
  globalThis.__loreCacheStore = await createCacheStore();
  return globalThis.__loreCacheStore;
}

export async function getCacheHealth(): Promise<CacheHealth> {
  return (await getCacheStore()).health();
}

export function resetCacheStore(): void {
  globalThis.__loreCacheStore = undefined;
}

export function __resetCacheForTest(): void {
  resetCacheStore();
}
