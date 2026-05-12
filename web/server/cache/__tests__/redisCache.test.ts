import { describe, expect, it, vi } from 'vitest';

const redisMock = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  set: vi.fn(),
  sadd: vi.fn(),
  pttl: vi.fn().mockResolvedValue(1),
  pexpire: vi.fn(),
  smembers: vi.fn().mockResolvedValue([]),
  del: vi.fn(),
  scan: vi.fn().mockResolvedValue(['0', []]),
  ping: vi.fn().mockResolvedValue('PONG'),
  pipeline: vi.fn(),
  on: vi.fn(),
  status: 'wait',
}));

vi.mock('ioredis', () => ({
  default: vi.fn(function Redis() {
    redisMock.pipeline.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
    return redisMock;
  }),
}));

import { RedisCacheStore } from '../redisCache';

describe('RedisCacheStore', () => {
  it('reads cached null as a hit from an envelope', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ value: null, createdAt: 1, ttlMs: 1000 }));
    const cache = new RedisCacheStore('redis://example');
    expect(await cache.getEntry('k')).toEqual({ hit: true, value: null });
  });

  it('returns miss when Redis get fails', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('offline'));
    const cache = new RedisCacheStore('redis://example');
    expect(await cache.getEntry('k')).toEqual({ hit: false, value: null });
  });
});
