import Redis from 'ioredis';
import { CACHE_SCHEMA_VERSION, cachePrefix } from './key';
import type { CacheEntry, CacheGetResult, CacheHealth, CacheSetOptions, CacheStore, JsonValue } from './types';

const TAG_TTL_GRACE_MS = 86_400_000;

export class RedisCacheStore implements CacheStore {
  readonly provider = 'redis' as const;
  private readonly client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 100, 2000);
      },
    });
    this.client.on('error', (error) => console.warn('[cache:redis]', error.message));
  }

  private async connect(): Promise<void> {
    if (this.client.status === 'wait') await this.client.connect();
  }

  async getEntry<T extends JsonValue>(key: string): Promise<CacheGetResult<T>> {
    try {
      await this.connect();
      const raw = await this.client.get(key);
      if (raw === null) return { hit: false, value: null };
      const entry = JSON.parse(raw) as CacheEntry<T>;
      return { hit: true, value: entry.value };
    } catch (error) {
      console.warn('[cache] redis get failed', key, (error as Error).message);
      return { hit: false, value: null };
    }
  }

  async set<T extends JsonValue>(key: string, value: T | null, options: CacheSetOptions): Promise<void> {
    try {
      await this.connect();
      const ttlMs = Math.max(1, Number(options.ttlMs || 1));
      const envelope: CacheEntry<T> = { value, createdAt: Date.now(), ttlMs };
      const pipeline = this.client.pipeline();
      pipeline.set(key, JSON.stringify(envelope), 'PX', ttlMs);
      for (const tag of options.tags || []) pipeline.sadd(tag, key);
      await pipeline.exec();
      for (const tag of options.tags || []) await this.extendTagTtl(tag, ttlMs + TAG_TTL_GRACE_MS);
    } catch (error) {
      console.warn('[cache] redis set failed', key, (error as Error).message);
    }
  }

  private async extendTagTtl(tag: string, ttlMs: number): Promise<void> {
    const current = await this.client.pttl(tag);
    if (current < ttlMs) await this.client.pexpire(tag, ttlMs);
  }

  async delete(key: string): Promise<void> {
    try {
      await this.connect();
      await this.client.del(key);
    } catch (error) {
      console.warn('[cache] redis delete failed', key, (error as Error).message);
    }
  }

  async invalidateTag(tag: string): Promise<void> {
    try {
      await this.connect();
      const keys = await this.client.smembers(tag);
      if (keys.length) await this.client.del(...keys);
      await this.client.del(tag);
    } catch (error) {
      console.warn('[cache] redis tag invalidation failed', tag, (error as Error).message);
    }
  }

  async invalidateTags(tags: string[]): Promise<void> {
    await Promise.all([...new Set(tags)].map((tag) => this.invalidateTag(tag)));
  }

  async clear(): Promise<void> {
    try {
      await this.connect();
      const prefix = `${cachePrefix()}:${CACHE_SCHEMA_VERSION}:`;
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = nextCursor;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== '0');
    } catch (error) {
      console.warn('[cache] redis clear failed', (error as Error).message);
    }
  }

  async health(): Promise<CacheHealth> {
    try {
      await this.connect();
      const pong = await this.client.ping();
      return { provider: this.provider, ok: pong === 'PONG' };
    } catch (error) {
      return { provider: this.provider, ok: false, detail: (error as Error).message };
    }
  }
}
