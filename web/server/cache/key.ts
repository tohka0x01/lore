import crypto from 'crypto';
import type { JsonValue } from './types';

export const CACHE_SCHEMA_VERSION = 'v1';

export function cachePrefix(): string {
  return String(process.env.CACHE_KEY_PREFIX || 'lore').trim() || 'lore';
}

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
}

export function stableJson(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!isPlainObject(value)) throw new Error('Cache key payload must be JSON-safe');
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function hashKey(value: JsonValue, length = 24): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex').slice(0, length);
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function cacheKey(namespace: string, parts: Array<string | number | boolean | null | undefined> = []): string {
  const safeNamespace = namespace.replace(/[^a-zA-Z0-9:_-]/g, '_');
  const safeParts = parts.map((part) => String(part ?? '').replace(/[^a-zA-Z0-9:_./-]/g, '_'));
  return [cachePrefix(), CACHE_SCHEMA_VERSION, safeNamespace, ...safeParts].filter(Boolean).join(':');
}

export function hashedCacheKey(namespace: string, payload: JsonValue): string {
  return cacheKey(namespace, [hashKey(payload)]);
}

export function cacheTag(namespace: string, id = 'all'): string {
  return cacheKey('tag', [namespace, hashKey(id)]);
}
