import { describe, expect, test, vi } from "vitest";
import { createHttpCacheService } from "../httpCacheService.js";

const createCacheHarness = () => {
  const metrics = {
    externalCache: {
      hits: 0,
      misses: 0,
      staleHits: 0,
      writes: 0,
      evictions: 0
    }
  };
  const logger = { warn: vi.fn() };
  const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    metrics,
    logger,
    cache: createHttpCacheService({
      metrics,
      logger,
      toShortText: (value) => String(value || ""),
      toPositiveInt,
      maxEntries: 5,
      defaultStaleTtlSec: 60
    })
  };
};

describe("httpCacheService", () => {
  test("serializeCacheKeyPart is deterministic for objects", () => {
    const { cache } = createCacheHarness();
    const left = cache.serializeCacheKeyPart({ b: 2, a: 1 });
    const right = cache.serializeCacheKeyPart({ a: 1, b: 2 });
    expect(left).toBe("{a:1,b:2}");
    expect(left).toBe(right);
  });

  test("readThroughExternalCache returns hit after first miss", async () => {
    const { cache, metrics } = createCacheHarness();
    const key = cache.buildExternalCacheKey("service", { page: 1 });
    const requestFn = vi.fn(async () => ({ value: 42 }));

    const miss = await cache.readThroughExternalCache({
      serviceName: "service",
      cacheKey: key,
      ttlSec: 5,
      requestFn
    });
    const hit = await cache.readThroughExternalCache({
      serviceName: "service",
      cacheKey: key,
      ttlSec: 5,
      requestFn
    });

    expect(miss.cache).toBe("miss");
    expect(hit.cache).toBe("hit");
    expect(requestFn).toHaveBeenCalledTimes(1);
    expect(metrics.externalCache.misses).toBe(1);
    expect(metrics.externalCache.hits).toBe(1);
  });

  test("serves stale cache entry when request fails after expiry", async () => {
    vi.useFakeTimers();
    const { cache, metrics, logger } = createCacheHarness();
    const key = cache.buildExternalCacheKey("weather", { city: "sf" });
    const requestFn = vi
      .fn()
      .mockResolvedValueOnce({ temp: 18 })
      .mockRejectedValueOnce(new Error("upstream down"));

    const first = await cache.readThroughExternalCache({
      serviceName: "weather",
      cacheKey: key,
      ttlSec: 1,
      staleTtlSec: 5,
      requestFn
    });
    expect(first.cache).toBe("miss");

    vi.advanceTimersByTime(1500);
    const stale = await cache.readThroughExternalCache({
      serviceName: "weather",
      cacheKey: key,
      ttlSec: 1,
      staleTtlSec: 5,
      requestFn
    });

    expect(stale.cache).toBe("stale");
    expect(stale.data).toEqual({ temp: 18 });
    expect(metrics.externalCache.staleHits).toBe(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test("mergeCacheStatuses prioritizes stale and miss correctly", () => {
    const { cache } = createCacheHarness();
    expect(cache.mergeCacheStatuses("hit", "hit")).toBe("hit");
    expect(cache.mergeCacheStatuses("hit", "miss")).toBe("miss");
    expect(cache.mergeCacheStatuses("miss", "stale", "hit")).toBe("stale");
  });
});

// A fake Redis that behaves like the commands the cache uses. Shared between two
// service instances, it stands in for a process restart: the Map-backed cache is
// per-instance, so only a Redis-backed one can survive the second construction.
const createFakeRedis = () => {
  const store = new Map();
  return {
    isReady: true,
    store,
    async get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAtMs <= Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, options = {}) {
      const ttlMs = options.PX ?? 60_000;
      store.set(key, { value, expiresAtMs: Date.now() + ttlMs });
      return "OK";
    }
  };
};

const createRedisCacheHarness = (client) => {
  const metrics = {
    externalCache: { hits: 0, misses: 0, staleHits: 0, writes: 0, evictions: 0 }
  };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    metrics,
    logger,
    cache: createHttpCacheService({
      metrics,
      logger,
      toShortText: (value) => String(value || ""),
      toPositiveInt,
      maxEntries: 5,
      defaultStaleTtlSec: 60,
      getRedisClient: () => client
    })
  };
};

describe("httpCacheService backed by Redis", () => {
  test("serves a payload cached by a previous instance", async () => {
    const client = createFakeRedis();

    const before = createRedisCacheHarness(client);
    const first = await before.cache.readThroughExternalCache({
      serviceName: "open-meteo",
      cacheKey: "open-meteo:{lat:1,lon:2}",
      ttlSec: 300,
      requestFn: async () => ({ tempC: 21 })
    });
    expect(first.cache).toBe("miss");

    // A new instance: no shared Map, only the shared Redis.
    const after = createRedisCacheHarness(client);
    const second = await after.cache.readThroughExternalCache({
      serviceName: "open-meteo",
      cacheKey: "open-meteo:{lat:1,lon:2}",
      ttlSec: 300,
      requestFn: async () => {
        throw new Error("upstream must not be called on a hit");
      }
    });

    expect(second.cache).toBe("hit");
    expect(second.data).toEqual({ tempC: 21 });
  });
});
