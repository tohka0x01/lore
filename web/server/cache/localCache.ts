import { LRUCache } from 'lru-cache';
import type { CacheEntry, CacheGetResult, CacheHealth, CacheSetOptions, CacheStore, JsonValue } from './types';

interface TagEntry {
  keys: string[];
  expiresAt: number;
}

function cloneJson<T extends JsonValue>(value: T | null): T | null {
  return JSON.parse(JSON.stringify(value)) as T | null;
}

export class LocalCacheStore implements CacheStore {
  readonly provider = 'local' as const;
  private readonly values = new LRUCache<string, string>({ max: Number(process.env.CACHE_LOCAL_MAX_ITEMS || 2000) });
  private readonly tagIndex = new LRUCache<string, TagEntry>({ max: Number(process.env.CACHE_LOCAL_MAX_TAGS || 2000) });

  async getEntry<T extends JsonValue>(key: string): Promise<CacheGetResult<T>> {
    const raw = this.values.get(key);
    if (!raw) return { hit: false, value: null };
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return { hit: true, value: cloneJson(entry.value) };
  }

  async set<T extends JsonValue>(key: string, value: T | null, options: CacheSetOptions): Promise<void> {
    const ttlMs = Math.max(1, Number(options.ttlMs || 1));
    const createdAt = Date.now();
    const envelope: CacheEntry<T> = { value: cloneJson(value), createdAt, ttlMs };
    this.values.set(key, JSON.stringify(envelope), { ttl: ttlMs });
    for (const tag of options.tags || []) {
      const current = this.tagIndex.get(tag);
      const expiresAt = Math.max(current?.expiresAt || 0, createdAt + ttlMs);
      const keys = Array.from(new Set([...(current?.keys || []), key]));
      this.tagIndex.set(tag, { keys, expiresAt }, { ttl: Math.max(1, expiresAt - createdAt) });
    }
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  async invalidateTag(tag: string): Promise<void> {
    const entry = this.tagIndex.get(tag);
    if (!entry) return;
    for (const key of entry.keys) this.values.delete(key);
    this.tagIndex.delete(tag);
  }

  async invalidateTags(tags: string[]): Promise<void> {
    await Promise.all([...new Set(tags)].map((tag) => this.invalidateTag(tag)));
  }

  async clear(): Promise<void> {
    this.values.clear();
    this.tagIndex.clear();
  }

  async health(): Promise<CacheHealth> {
    return { provider: this.provider, ok: true };
  }
}
