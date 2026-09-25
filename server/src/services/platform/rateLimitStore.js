import { MemoryStore } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

const defaultCreateRedisStore = ({ getClient, prefix }) =>
  new RedisStore({
    prefix,
    // Resolved per command rather than captured, so a reconnect that swaps the
    // client object is picked up without rebuilding the store.
    sendCommand: (...args) => getClient().sendCommand(args)
  });

/**
 * An express-rate-limit `Store` that counts in Redis when it is available and in
 * memory when it is not.
 *
 * The five limiters in `index.js` are built at module scope, but Redis connects
 * later inside `startServer()`, so a store cannot capture a client at
 * construction time. It resolves one per call through `getClient` instead, and
 * keeps counting in memory whenever there is none -- otherwise a Redis outage
 * would turn every `/api` request into a 500.
 */
export const createRateLimitStore = ({
  getClient,
  createRedisStore = defaultCreateRedisStore,
  prefix = "rl:",
  logger = null
}) => {
  const memoryStore = new MemoryStore();
  let redisStore = null;
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
  const runWithFallback = async (method, key) => {
    const store = activeStore();
    if (store === memoryStore) return memoryStore[method](key);
    try {
      const result = await store[method](key);
      // Re-arm, so a later outage is reported rather than silently swallowed.
      outageReported = false;
      return result;
    } catch (err) {
      // Once per outage, not once per request: the session store's bounded retry
      // exists because an unbounded one logged forever.
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
    init(options) {
      initOptions = options;
      memoryStore.init(options);
    },
    async increment(key) {
      return runWithFallback("increment", key);
    },
    async decrement(key) {
      return runWithFallback("decrement", key);
    },
    async resetKey(key) {
      return runWithFallback("resetKey", key);
    }
  };
};
