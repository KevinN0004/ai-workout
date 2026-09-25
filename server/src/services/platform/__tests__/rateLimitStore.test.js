import { describe, expect, test } from "vitest";
import { createRateLimitStore } from "../rateLimitStore.js";

// The five limiters in index.js are built at module scope, but Redis connects
// later inside startServer(). So the store cannot capture a client at
// construction time -- it resolves one per call and must keep counting when
// there is none, or a Redis outage turns every /api request into a 500.

describe("createRateLimitStore without a Redis client", () => {
  test("counts hits in memory when no client is available", async () => {
    const store = createRateLimitStore({ getClient: () => null });
    store.init({ windowMs: 60_000 });

    // Read totalHits immediately: MemoryStore hands back a live reference to its
    // own record, so holding the object and asserting later sees the mutated count.
    const first = (await store.increment("ip-1")).totalHits;
    const second = (await store.increment("ip-1")).totalHits;

    expect(first).toBe(1);
    expect(second).toBe(2);
  });
});

const readyClient = () => ({ isReady: true, sendCommand: async () => 1 });

const spyStore = () => {
  const calls = [];
  return {
    calls,
    init() {},
    async increment(key) {
      calls.push(["increment", key]);
      return { totalHits: 99, resetTime: new Date() };
    },
    async decrement(key) {
      calls.push(["decrement", key]);
    },
    async resetKey(key) {
      calls.push(["resetKey", key]);
    }
  };
};

describe("createRateLimitStore with a ready Redis client", () => {
  test("counts through the Redis store rather than memory", async () => {
    const redis = spyStore();
    const store = createRateLimitStore({
      getClient: readyClient,
      createRedisStore: () => redis
    });
    store.init({ windowMs: 60_000 });

    const result = await store.increment("ip-1");

    expect(redis.calls).toEqual([["increment", "ip-1"]]);
    expect(result.totalHits).toBe(99);
  });
});

describe("createRateLimitStore when Redis fails mid-request", () => {
  test("keeps counting in memory instead of rejecting", async () => {
    const failing = {
      init() {},
      async increment() {
        throw new Error("READONLY You can't write against a read only replica.");
      },
      async decrement() {},
      async resetKey() {}
    };
    const store = createRateLimitStore({
      getClient: readyClient,
      createRedisStore: () => failing
    });
    store.init({ windowMs: 60_000 });

    const first = (await store.increment("ip-1")).totalHits;
    const second = (await store.increment("ip-1")).totalHits;

    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  test("reports the outage once rather than on every request", async () => {
    const errors = [];
    const failing = {
      init() {},
      async increment() {
        throw new Error("connection lost");
      },
      async decrement() {},
      async resetKey() {}
    };
    const store = createRateLimitStore({
      getClient: readyClient,
      createRedisStore: () => failing,
      logger: { error: (fields) => errors.push(fields) }
    });
    store.init({ windowMs: 60_000 });

    await store.increment("ip-1");
    await store.increment("ip-1");
    await store.increment("ip-1");

    expect(errors).toHaveLength(1);
    expect(errors[0].event).toBe("rate_limit_store_error");
    expect(errors[0].error).toBe("connection lost");
  });
});
