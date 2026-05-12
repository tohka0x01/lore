export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type CacheProviderName = 'local' | 'redis' | 'disabled';

export interface CacheSetOptions {
  ttlMs: number;
  tags?: string[];
}

export interface CacheEntry<T extends JsonValue> {
  value: T | null;
  createdAt: number;
  ttlMs: number;
}

export interface CacheGetResult<T extends JsonValue> {
  hit: boolean;
  value: T | null;
}

export interface CacheHealth {
  provider: CacheProviderName;
  ok: boolean;
  detail?: string;
}

export interface CacheStore {
  readonly provider: CacheProviderName;
  getEntry<T extends JsonValue>(key: string): Promise<CacheGetResult<T>>;
  set<T extends JsonValue>(key: string, value: T | null, options: CacheSetOptions): Promise<void>;
  delete(key: string): Promise<void>;
  invalidateTag(tag: string): Promise<void>;
  invalidateTags(tags: string[]): Promise<void>;
  clear(): Promise<void>;
  health(): Promise<CacheHealth>;
}
