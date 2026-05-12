import type { CacheGetResult, CacheHealth, CacheSetOptions, CacheStore, JsonValue } from './types';

export class NoopCacheStore implements CacheStore {
  readonly provider = 'disabled' as const;
  async getEntry<T extends JsonValue>(_key: string): Promise<CacheGetResult<T>> { return { hit: false, value: null }; }
  async set<T extends JsonValue>(_key: string, _value: T | null, _options: CacheSetOptions): Promise<void> {}
  async delete(_key: string): Promise<void> {}
  async invalidateTag(_tag: string): Promise<void> {}
  async invalidateTags(_tags: string[]): Promise<void> {}
  async clear(): Promise<void> {}
  async health(): Promise<CacheHealth> { return { provider: this.provider, ok: true }; }
}
