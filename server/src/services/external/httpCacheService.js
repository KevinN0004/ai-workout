/**
 * The read-through cache in front of the external APIs: a fresh entry answers
 * without a request, and a stale one answers when the upstream fails. Kept in
 * Redis when the session store's client is ready, in memory otherwise. Built
 * once in index.js.
 */

/**
 * One cached response: the payload, and the times it was written, stops being
 * fresh, and stops being served at all.
 * @typedef {object} CacheEntry
 * @property {unknown} payload
 * @property {number} createdAtMs
 * @property {number} expiresAtMs
 * @property {number} staleUntilMs
 */

/**
 * Builds the cache. Returns the key builder, the read-through wrapper every
 * external request runs through, and the rule for merging the cache statuses
 * of a response built from several requests.
 *
 * @param {object} deps `maxEntries` caps the in-memory cache, `defaultStaleTtlSec` is
 *   how long an entry may still be served once its fresh TTL ends, and
 *   `getRedisClient` returns the session store's client or null.
 * @param {import("../platform/metricsService.js").Metrics} deps.metrics
 * @param {import("pino").Logger} deps.logger
 * @param {(value: unknown, maxLen?: number) => string} deps.toShortText
 * @param {(value: unknown, fallback: number) => number} deps.toPositiveInt
 * @param {number} deps.maxEntries
 * @param {number} deps.defaultStaleTtlSec
 * @param {import("../platform/rateLimitStore.js").GetRedisClient} [deps.getRedisClient]
 */
export const createHttpCacheService = ({
  metrics,
  logger,
  toShortText,
  toPositiveInt,
  maxEntries,
  defaultStaleTtlSec,
  // Redis keeps the cache across a restart. That matters less for the fresh
  // TTLs, which are minutes long, than for the stale window (hours long by
  // default), which is what lets an upstream outage serve old data instead of
  // an error. In memory that buffer is lost on every spin-down.
  getRedisClient = () => null
}) => {
  /** @type {Map<string, CacheEntry>} */
  const responseCache = new Map();
  // Per operation, because reads and writes fail independently: with one shared
  // flag, a succeeding write would re-arm a failing read, which would then log
  // on every request.
  const redisOutageReported = { read: false, write: false };

  const redisReady = () => Boolean(getRedisClient()?.isReady);

  /** @param {string} cacheKey */
  const redisCacheKey = (cacheKey) => `extcache:${cacheKey}`;

  /**
   * @param {any} err Whatever the Redis command threw, possibly a non-Error.
   * @param {"read" | "write"} operation
   */
  const reportRedisOutage = (err, operation) => {
    if (redisOutageReported[operation]) return;
    redisOutageReported[operation] = true;
    logger.warn({
      event: "external_cache_redis_error",
      operation,
      message: toShortText(err?.message || String(err), 220)
    });
  };

  /** @param {unknown} value */
  const cloneForCache = (value) => {
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };

  /**
   * @param {unknown} value
   * @returns {string}
   */
  const serializeCacheKeyPart = (value) => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (Array.isArray(value)) {
      return `[${value.map((item) => serializeCacheKeyPart(item)).join(",")}]`;
    }
    if (typeof value === "object") {
      const keys = Object.keys(value).sort();
      // An object, read by its own keys.
      const pairs = keys.map(
        (key) =>
          `${key}:${serializeCacheKeyPart(/** @type {Record<string, unknown>} */ (value)[key])}`
      );
      return `{${pairs.join(",")}}`;
    }
    return JSON.stringify(value);
  };

  /**
   * @param {string} serviceName
   * @param {object} [parts]
   */
  const buildExternalCacheKey = (serviceName, parts = {}) =>
    `${serviceName}:${serializeCacheKeyPart(parts)}`;

  // Both `maxEntries` and the `evictions` metric describe the in-memory fallback
  // only. On the Redis path nothing evicts: a key disappears when its own TTL
  // closes the stale window, which no process observes, so a read that finds
  // nothing counts as an ordinary miss. An expired Redis read is not counted as
  // an eviction either: keys that expire unread would never be counted, so the
  // number would be a systematic undercount presented as a count. Redis is
  // bounded by TTL rather than by entry count.
  /** @param {number} [now] */
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

  /**
   * @param {CacheEntry} entry
   * @param {number} now
   */
  const entryToResult = (entry, now) => ({
    payload: cloneForCache(entry.payload),
    fresh: now <= entry.expiresAtMs,
    staleAgeMs: Math.max(0, now - entry.expiresAtMs)
  });

  /**
   * @param {string} cacheKey
   * @param {number} [now]
   */
  const readResponseCache = async (cacheKey, now = Date.now()) => {
    if (redisReady()) {
      try {
        // redisReady() has just said the client exists and is ready.
        const raw = await /** @type {NonNullable<ReturnType<typeof getRedisClient>>} */ (
          getRedisClient()
        ).get(redisCacheKey(cacheKey));
        redisOutageReported.read = false;
        if (raw) {
          const entry = JSON.parse(raw);
          if (now <= entry.staleUntilMs) return entryToResult(entry, now);
        }
        // Nothing usable in Redis. Memory is still consulted rather than assumed
        // empty: a failing Redis write falls back to it, and without this the
        // entry it wrote could never be read, silently disabling the cache.
      } catch (err) {
        reportRedisOutage(err, "read");
      }
    }
    return readMemoryCache(cacheKey, now);
  };

  /**
   * @param {string} cacheKey
   * @param {number} [now]
   */
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

  /**
   * @param {string} cacheKey
   * @param {unknown} payload
   * @param {number} ttlSec
   * @param {number} [staleTtlSec]
   */
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
        // redisReady() has just said the client exists and is ready.
        await /** @type {NonNullable<ReturnType<typeof getRedisClient>>} */ (getRedisClient()).set(
          redisCacheKey(cacheKey),
          JSON.stringify(entry),
          {
            PX: ttlMs + staleMs
          }
        );
        metrics.externalCache.writes += 1;
        redisOutageReported.write = false;
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

  /**
   * @param {import("./externalDataService.js").CachedRequest & { staleTtlSec?: number }} request
   * @returns {Promise<import("./externalDataService.js").CachedRead>}
   */
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
    } catch (/** @type {any} */ err) {
      // requestFn threw it, the upstream call, possibly with a non-Error.
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

  /** @param {...(string | undefined)} statuses A request not made has no status. */
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
