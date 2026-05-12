import { getCacheStore } from './index';
import type { JsonValue } from './types';

export interface CachedOptions {
  key: string;
  ttlMs: number;
  tags?: string[];
  enabled?: boolean;
}

const inFlight = new Map<string, Promise<JsonValue>>();

export async function cached<T>(options: CachedOptions, load: () => Promise<T>): Promise<T> {
  if (process.env.VITEST && process.env.CACHE_TEST_ENABLE !== 'true') return load();
  if (options.enabled === false || Number(options.ttlMs) <= 0) return load();
  const store = await getCacheStore();
  const entry = await store.getEntry<JsonValue>(options.key);
  if (entry.hit) return entry.value as T;

  const existing = inFlight.get(options.key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = load()
    .then(async (value) => {
      await store.set(options.key, value as JsonValue, { ttlMs: options.ttlMs, tags: options.tags || [] });
      return value;
    })
    .finally(() => inFlight.delete(options.key));
  inFlight.set(options.key, promise as Promise<JsonValue>);
  return promise;
}

export async function invalidateCacheTags(tags: string[]): Promise<void> {
  await (await getCacheStore()).invalidateTags(tags);
}

export async function clearApplicationCache(): Promise<void> {
  await (await getCacheStore()).clear();
}
