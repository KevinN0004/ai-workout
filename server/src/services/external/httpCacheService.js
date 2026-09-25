export const createHttpCacheService = ({
  metrics,
  logger,
  toShortText,
  toPositiveInt,
  maxEntries,
  defaultStaleTtlSec,
  // Redis keeps the cache across a restart. That matters less for the 3-15 minute
  // fresh TTLs than for the stale window (6 hours by default), which is what lets
  // an upstream outage serve old data instead of an error. In memory that buffer
  // is lost on every spin-down.
  getRedisClient = () => null
}) => {
  const responseCache = new Map();
  let redisOutageReported = false;

  const redisReady = () => Boolean(getRedisClient()?.isReady);

  const redisCacheKey = (cacheKey) => `extcache:${cacheKey}`;

  const reportRedisOutage = (err, operation) => {
    if (redisOutageReported) return;
    redisOutageReported = true;
    logger.warn({
      event: "external_cache_redis_error",
      operation,
      message: toShortText(err?.message || String(err), 220)
    });
  };

  const cloneForCache = (value) => {
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };

  const serializeCacheKeyPart = (value) => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (Array.isArray(value)) {
      return `[${value.map((item) => serializeCacheKeyPart(item)).join(",")}]`;
    }
    if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      const pairs = keys.map((key) => `${key}:${serializeCacheKeyPart(value[key])}`);
      return `{${pairs.join(",")}}`;
    }
    return JSON.stringify(value);
  };

  const buildExternalCacheKey = (serviceName, parts = {}) =>
    `${serviceName}:${serializeCacheKeyPart(parts)}`;

  const pruneResponseCache = (now = Date.now()) => {
    for (const [key, entry] of responseCache.entries()) {
      if (now <= entry.staleUntilMs) continue;
      responseCache.delete(key);
      metrics.externalCache.evictions += 1;
    }
    while (responseCache.size > maxEntries) {
      const oldestKey = responseCache.keys().next().value;
      if (!oldestKey) break;
      responseCache.delete(oldestKey);
      metrics.externalCache.evictions += 1;
    }
  };

  const entryToResult = (entry, now) => ({
    payload: cloneForCache(entry.payload),
    fresh: now <= entry.expiresAtMs,
    staleAgeMs: Math.max(0, now - entry.expiresAtMs)
  });

  const readResponseCache = async (cacheKey, now = Date.now()) => {
    if (redisReady()) {
      try {
        const raw = await getRedisClient().get(redisCacheKey(cacheKey));
        // A key past its stale window is gone by TTL, so absence is the only miss.
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (now > entry.staleUntilMs) return null;
        redisOutageReported = false;
        return entryToResult(entry, now);
      } catch (err) {
        reportRedisOutage(err, "read");
      }
    }
    return readMemoryCache(cacheKey, now);
  };

  const readMemoryCache = (cacheKey, now = Date.now()) => {
    const entry = responseCache.get(cacheKey);
    if (!entry) return null;
    if (now > entry.staleUntilMs) {
      responseCache.delete(cacheKey);
      metrics.externalCache.evictions += 1;
      return null;
    }
    return {
      payload: cloneForCache(entry.payload),
      fresh: now <= entry.expiresAtMs,
      staleAgeMs: Math.max(0, now - entry.expiresAtMs)
    };
  };

  const writeResponseCache = async (
    cacheKey,
    payload,
    ttlSec,
    staleTtlSec = defaultStaleTtlSec
  ) => {
    const now = Date.now();
    const ttlMs = Math.max(1, toPositiveInt(ttlSec, 1)) * 1000;
    const staleMs = Math.max(1, toPositiveInt(staleTtlSec, 1)) * 1000;

    if (redisReady()) {
      try {
        const entry = {
          payload,
          createdAtMs: now,
          expiresAtMs: now + ttlMs,
          staleUntilMs: now + ttlMs + staleMs
        };
        // Redis expiry replaces pruneResponseCache: the key disappears exactly when
        // the stale window closes, so nothing has to sweep it.
        await getRedisClient().set(redisCacheKey(cacheKey), JSON.stringify(entry), {
          PX: ttlMs + staleMs
        });
        metrics.externalCache.writes += 1;
        redisOutageReported = false;
        return;
      } catch (err) {
        reportRedisOutage(err, "write");
      }
    }

    pruneResponseCache(now);
    if (responseCache.has(cacheKey)) {
      responseCache.delete(cacheKey);
    }
    responseCache.set(cacheKey, {
      payload: cloneForCache(payload),
      createdAtMs: now,
      expiresAtMs: now + ttlMs,
      staleUntilMs: now + ttlMs + staleMs
    });
    metrics.externalCache.writes += 1;
  };

  const readThroughExternalCache = async ({
    serviceName,
    cacheKey,
    ttlSec,
    staleTtlSec = defaultStaleTtlSec,
    requestFn
  }) => {
    const cached = await readResponseCache(cacheKey);
    if (cached?.fresh) {
      metrics.externalCache.hits += 1;
      return { data: cached.payload, cache: "hit" };
    }

    metrics.externalCache.misses += 1;
    try {
      const data = await requestFn();
      await writeResponseCache(cacheKey, data, ttlSec, staleTtlSec);
      return { data, cache: "miss" };
    } catch (err) {
      if (cached) {
        metrics.externalCache.staleHits += 1;
        logger.warn({
          event: "external_api_stale_cache_served",
          service: serviceName,
          cacheKey: cacheKey.slice(0, 220),
          staleAgeMs: cached.staleAgeMs,
          message: toShortText(err?.message || String(err), 220)
        });
        return { data: cached.payload, cache: "stale" };
      }
      throw err;
    }
  };

  const mergeCacheStatuses = (...statuses) => {
    const clean = statuses
      .map((status) => (typeof status === "string" ? status.trim().slice(0, 20).toLowerCase() : ""))
      .filter(Boolean);
    if (!clean.length) return "";
    if (clean.includes("stale")) return "stale";
    if (clean.every((status) => status === "hit")) return "hit";
    if (clean.includes("miss")) return "miss";
    return clean[0];
  };

  return {
    serializeCacheKeyPart,
    buildExternalCacheKey,
    readThroughExternalCache,
    mergeCacheStatuses
  };
};
