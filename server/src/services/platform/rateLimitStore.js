/**
 * The store behind index.js's rate limiters: counts in Redis when the session
 * store's client is ready, and in memory otherwise.
 */
import { MemoryStore } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

/** @typedef {() => ReturnType<typeof import("redis").createClient> | null} GetRedisClient */

/**
 * @param {{ getClient: GetRedisClient, prefix: string }} deps
 * @returns {RedisStore}
 */
const defaultCreateRedisStore = ({ getClient, prefix }) =>
  new RedisStore({
    prefix,
    // Resolved per command rather than captured, so a reconnect that swaps the
    // client object is picked up without rebuilding the store.
    // activeStore builds this store, and routes each call to it, only after it
    // has seen a ready client.
    sendCommand: (...args) =>
      /** @type {NonNullable<ReturnType<GetRedisClient>>} */ (getClient()).sendCommand(args)
  });

/**
 * An express-rate-limit `Store` that counts in Redis when it is available and in
 * memory when it is not.
 *
 * The limiters in `index.js` are built at module scope, but Redis connects
 * later inside `startServer()`, so a store cannot capture a client at
 * construction time. It resolves one per call through `getClient` instead, and
 * keeps counting in memory whenever there is none -- otherwise a Redis outage
 * would turn every `/api` request into a 500.
 *
 * @param {object} deps
 * @param {GetRedisClient} deps.getClient
 * @param {typeof defaultCreateRedisStore} [deps.createRedisStore]
 * @param {string} [deps.prefix]
 * @param {import("pino").Logger | null} [deps.logger]
 */
export const createRateLimitStore = ({
  getClient,
  createRedisStore = defaultCreateRedisStore,
  prefix = "rl:",
  logger = null
}) => {
  const memoryStore = new MemoryStore();
  /** @type {RedisStore | null} */
  let redisStore = null;
  /** @type {import("express-rate-limit").Options | null} */
  let initOptions = null;
  let outageReported = false;

  const activeStore = () => {
    if (!getClient()?.isReady) return memoryStore;
    if (!redisStore) {
      redisStore = createRedisStore({ getClient, prefix });
      if (initOptions && redisStore.init) redisStore.init(initOptions);
    }
    return redisStore;
  };

  // A Redis failure must never reach the caller: express-rate-limit would turn a
  // rejected store call into a 500 on a request that should simply be counted.
  /**
   * @param {"increment" | "decrement" | "resetKey"} method
   * @param {string} key
   */
  const runWithFallback = async (method, key) => {
    const store = activeStore();
    if (store === memoryStore) return memoryStore[method](key);
    try {
      const result = await store[method](key);
      // Re-arm, so a later outage is reported rather than silently swallowed.
      outageReported = false;
      return result;
    } catch (/** @type {any} */ err) {
      // The Redis command threw it, possibly a non-Error. Once per outage, not once per request: while Redis is failing, every
      // request lands here, and logging each one would flood the log.
      if (!outageReported) {
        outageReported = true;
        logger?.error?.(
          {
            event: "rate_limit_store_error",
            error: String(err?.message || err).slice(0, 260),
            method
          },
          "Rate limit store unavailable. Counting in memory."
        );
      }
      return memoryStore[method](key);
    }
  };

  return {
    // Read by express-rate-limit's double-count check, which tells stores
    // apart by prefix. Without it every one of these wrappers looks like the
    // same store, and a request through two limiters is reported as counted
    // twice when it was not.
    prefix,
    /** @param {import("express-rate-limit").Options} options */
    init(options) {
      initOptions = options;
      memoryStore.init(options);
    },
    /** @param {string} key */
    async increment(key) {
      // Both stores' increment resolves to the key's count.
      return /** @type {Promise<import("express-rate-limit").ClientRateLimitInfo>} */ (
        runWithFallback("increment", key)
      );
    },
    /** @param {string} key */
    async decrement(key) {
      // Both stores' decrement resolves to nothing.
      return /** @type {Promise<void>} */ (runWithFallback("decrement", key));
    },
    /** @param {string} key */
    async resetKey(key) {
      // Both stores' resetKey resolves to nothing.
      return /** @type {Promise<void>} */ (runWithFallback("resetKey", key));
    }
  };
};
