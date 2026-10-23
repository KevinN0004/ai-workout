import { beforeEach, describe, expect, test, vi } from "vitest";
import { createSessionService, SessionStoreUnavailableError } from "../sessionService.js";

// The Redis-backed session paths. Reaching them needs the redis module mocked
// rather than a dependency injected; the fake below is a node-redis lookalike.
//
// The behaviour worth having is failing closed. While Redis is the store, a
// failed command records the error and throws SessionStoreUnavailableError,
// which the routes answer with a 503. Nothing falls back to memory, so no
// session exists that only one process can read, and a caller whose session
// could not be checked is never told it does not exist.

const createClient = vi.fn();
vi.mock("redis", () => ({ createClient: (...args) => createClient(...args) }));

const cleanText = (value, maxLen = 500) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";
const toShortText = (value, maxLen = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

let logger;
let findUserById;
let fakeRedis;

// A node-redis lookalike with just the surface the service uses.
const buildFakeRedis = (overrides = {}) => {
  const store = new Map();
  const handlers = {};
  return {
    store,
    handlers,
    on: vi.fn((event, handler) => {
      handlers[event] = handler;
    }),
    connect: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
    set: vi.fn(async (key, value) => {
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key) => store.get(key) ?? null),
    del: vi.fn(async (key) => {
      store.delete(key);
      return 1;
    }),
    ...overrides
  };
};

const buildService = (overrides = {}) =>
  createSessionService({
    cleanText,
    toShortText,
    logger,
    findUserById,
    sessionTtlMs: 60000,
    cookieSecure: "",
    csrfCookieName: "csrfToken",
    csrfHeaderName: "x-csrf-token",
    csrfUnsafeMethods: new Set(["POST"]),
    redisSessionKeyPrefix: "session:sid:",
    redisConnectTimeoutMs: 200,
    ...overrides
  });

// Brings a service up with Redis connected and ready.
const connected = async (serviceOverrides = {}, env = { REDIS_URL: "redis://localhost:6379" }) => {
  const service = buildService(serviceOverrides);
  const status = await service.initSessionStore(env);
  return { service, status };
};

const req = (token) => ({ headers: { cookie: `sid=${token}` } });

// Just enough of an express response for requireAuth.
const buildRes = () => {
  const res = {
    statusCode: null,
    body: null,
    status: vi.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload) => {
      res.body = payload;
      return res;
    })
  };
  return res;
};

// Makes one fake command fail the way a dropped connection does.
const failing = (message = "redis is on fire") =>
  vi.fn(async () => {
    throw new Error(message);
  });

beforeEach(() => {
  logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  findUserById = vi.fn(async (userId) => ({ id: userId }));
  fakeRedis = buildFakeRedis();
  createClient.mockReset();
  createClient.mockImplementation(() => fakeRedis);
});

describe("connecting", () => {
  test("uses REDIS_URL when one is set", async () => {
    const { status } = await connected();

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({ url: "redis://localhost:6379" })
    );
    expect(status).toMatchObject({ configured: true, connected: true });
  });

  // Host and port are the alternative to a url, and both are required before
  // the service will treat Redis as configured at all.
  test("uses host and port when there is no url", async () => {
    await connected({}, { REDIS_HOST: "cache.internal", REDIS_PORT: "6380" });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "default",
        socket: expect.objectContaining({ host: "cache.internal", port: 6380 })
      })
    );
  });

  test("passes the credentials and tls flag through", async () => {
    await connected(
      {},
      {
        REDIS_HOST: "cache.internal",
        REDIS_PORT: "6380",
        REDIS_USERNAME: "app",
        REDIS_PASSWORD: "secret",
        REDIS_TLS: "true"
      }
    );

    const options = createClient.mock.calls[0][0];
    expect(options.username).toBe("app");
    expect(options.password).toBe("secret");
    expect(options.socket.tls).toBe(true);
  });

  // node-redis 6 defaults to RESP3. Production is Upstash, whose docs do not
  // say it speaks RESP3, and a failed handshake would drop every session to
  // memory -- so both configuration shapes pin the protocol this app has
  // always used.
  test.each([
    ["a url", { REDIS_URL: "redis://localhost:6379" }],
    ["a host and port", { REDIS_HOST: "cache.internal", REDIS_PORT: "6380" }]
  ])("pins RESP2 when configured with %s", async (_label, env) => {
    await connected({}, env);

    expect(createClient.mock.calls[0][0].RESP).toBe(2);
  });

  // node-redis queues a command while it reconnects and fails it only after
  // its own 5 s default, so a sign-in during an outage would hang that long
  // before its 503. Both configuration shapes get the shorter limit.
  test.each([
    ["a url", { REDIS_URL: "redis://localhost:6379" }],
    ["a host and port", { REDIS_HOST: "cache.internal", REDIS_PORT: "6380" }]
  ])("gives every command a 1.5 s timeout when configured with %s", async (_label, env) => {
    await connected({}, env);

    expect(createClient.mock.calls[0][0].commandOptions).toEqual({ timeout: 1500 });
  });

  test("sends no password when none was configured", async () => {
    await connected({}, { REDIS_HOST: "cache.internal", REDIS_PORT: "6380" });

    expect(createClient.mock.calls[0][0].password).toBeUndefined();
  });

  // A host with no port is not a usable configuration, so it is treated as no
  // configuration at all rather than a broken one.
  test("stays on memory when the port is missing", async () => {
    const { status } = await connected({}, { REDIS_HOST: "cache.internal" });

    expect(createClient).not.toHaveBeenCalled();
    expect(status).toMatchObject({ configured: false, connected: false });
  });

  test("stays on memory when the port is not a port", async () => {
    const { status } = await connected(
      {},
      { REDIS_HOST: "cache.internal", REDIS_PORT: "not-a-port" }
    );

    expect(status.configured).toBe(false);
  });

  test("records a connection failure and falls back", async () => {
    fakeRedis.connect = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    const { service, status } = await connected();

    expect(status).toMatchObject({ configured: true, connected: false });
    expect(status.lastError).toMatch(/ECONNREFUSED/);
    expect(service.getRedisClient()).toBeNull();
  });

  // A client left retrying in the background logs forever, so the failed one
  // is disconnected rather than abandoned.
  test("disconnects the client it could not connect", async () => {
    fakeRedis.connect = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });

    await connected();

    expect(fakeRedis.destroy).toHaveBeenCalledTimes(1);
  });

  test("records an error the client reports later", async () => {
    const { service } = await connected();

    fakeRedis.handlers.error(new Error("connection reset"));

    expect(service.getRedisLastError()).toMatch(/connection reset/);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_session_store_error" }),
      expect.any(String)
    );
  });
});

// Recovery after an outage is node-redis's reconnect loop, driven by this
// strategy; /api/ready reads the client's live state, so it reports "redis"
// again as soon as a reconnect succeeds. node-redis 6.3 asks the strategy with
// retries 0 when a ready socket drops, reconnects at once, then passes 1, 2,
// 3... for each failed attempt.
describe("reconnecting", () => {
  const strategyOf = () => createClient.mock.calls[0][0].socket.reconnectStrategy;

  test("after startup, never gives up, doubling from 1 s to a 30 s cap", async () => {
    await connected();

    const waits = [1, 2, 3, 4, 5, 6, 50].map((retries) => strategyOf()(retries));

    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  // Before startup settles the strategy is bounded, so a Redis that is down at
  // boot cannot hold the server back from listen(): it returns an Error after
  // five retries, which ends connect().
  test("during startup, gives up after five retries", async () => {
    let waits = [];
    fakeRedis.connect = vi.fn(async () => {
      waits = [0, 1, 4, 5].map((retries) => strategyOf()(retries));
    });

    await connected();

    expect(waits.slice(0, 3)).toEqual([100, 200, 1000]);
    expect(waits[3]).toBeInstanceOf(Error);
  });
});

describe("sessions in Redis", () => {
  test("writes the session under the prefixed key with a ttl", async () => {
    const { service } = await connected();

    const token = await service.createSession("u-1");

    expect(fakeRedis.set).toHaveBeenCalledWith(
      `session:sid:${token}`,
      expect.stringContaining("u-1"),
      { EX: 60 }
    );
  });

  test("reads a session back", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");

    const user = await service.getSessionUser(req(token));

    expect(fakeRedis.get).toHaveBeenCalledWith(`session:sid:${token}`);
    expect(user).toMatchObject({ id: "u-1" });
  });

  test("resolves an unknown token to nobody", async () => {
    const { service } = await connected();

    expect(await service.getSessionUser(req("nope"))).toBeNull();
    expect(findUserById).not.toHaveBeenCalled();
  });

  test("deletes the key on sign-out", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");

    await service.deleteSession(token);

    expect(fakeRedis.del).toHaveBeenCalledWith(`session:sid:${token}`);
    expect(await service.getSessionUser(req(token))).toBeNull();
  });

  // A row without a user id is not a session, and leaving it there would mean
  // reparsing the same junk on every request.
  test("removes a stored value that is not a usable session", async () => {
    const { service } = await connected();
    fakeRedis.store.set("session:sid:junk", JSON.stringify({ createdAt: Date.now() }));

    const user = await service.getSessionUser(req("junk"));

    expect(user).toBeNull();
    expect(fakeRedis.del).toHaveBeenCalledWith("session:sid:junk");
  });

  test("treats an unparseable stored value the same way", async () => {
    const { service } = await connected();
    fakeRedis.store.set("session:sid:junk", "{not json");

    expect(await service.getSessionUser(req("junk"))).toBeNull();
  });
});

// A command failing while Redis is the store: the session operation refuses
// with a 503 rather than inventing an answer, and leaves nothing in memory.
describe("when Redis fails after connecting", () => {
  test("a failed write refuses the session rather than returning a token", async () => {
    const { service } = await connected();
    fakeRedis.set = failing();

    await expect(service.createSession("u-1")).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    expect(service.getRedisLastError()).toMatch(/redis is on fire/);
  });

  // The token the failed write would have used resolves to nobody even after
  // closeSessionStore switches the service to its in-memory map, so nothing was
  // written there either.
  test("a failed write leaves no session in memory", async () => {
    const { service } = await connected();
    fakeRedis.set = failing();
    await expect(service.createSession("u-1")).rejects.toThrow();
    const token = fakeRedis.set.mock.calls[0][0].slice("session:sid:".length);

    await service.closeSessionStore();

    expect(await service.getSessionUser(req(token))).toBeNull();
  });

  test("a failed write is reported to an operator", async () => {
    const { service } = await connected();
    fakeRedis.set = failing();

    await expect(service.createSession("u-1")).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_session_create_failed" }),
      expect.any(String)
    );
  });

  test("the error carries status 503 and the Redis failure as its cause", async () => {
    const { service } = await connected();
    fakeRedis.set = failing();

    const err = await service.createSession("u-1").catch((caught) => caught);

    expect(err.status).toBe(503);
    expect(err.cause.message).toBe("redis is on fire");
  });

  test("a failed read rejects rather than resolving to nobody", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = failing();

    await expect(service.getSessionUser(req(token))).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );
    expect(service.getRedisLastError()).toMatch(/redis is on fire/);
  });

  // A delete after a failed read would wait out its own timeout during the
  // same outage, and could not remove anything the failed read could not see.
  test("a failed read issues no cleanup delete", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = failing();

    await expect(service.getSessionUser(req(token))).rejects.toThrow();

    expect(fakeRedis.del).not.toHaveBeenCalled();
  });

  test("a failed delete of junk after a successful read still refuses", async () => {
    const { service } = await connected();
    fakeRedis.store.set("session:sid:junk", "{not json");
    fakeRedis.del = failing();

    await expect(service.getSessionUser(req("junk"))).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );
  });

  test("a failed delete rejects, so sign-out can report it", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.del = failing();

    await expect(service.deleteSession(token)).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_session_delete_failed" }),
      expect.any(String)
    );
  });

  // node-redis rejects with Error objects, but the recorded text must not
  // depend on that.
  test("records a rejection that is not an Error as its text", async () => {
    const { service } = await connected();
    fakeRedis.get = vi.fn(async () => {
      throw "socket gone";
    });

    await expect(service.getSessionUser(req("any"))).rejects.toThrow();

    expect(service.getRedisLastError()).toBe("socket gone");
  });

  // node-redis's TimeoutError, which a command gets when it cannot reach the
  // socket in time, has no message. Its class name is the useful text.
  test("records an Error with no message by its class name", async () => {
    class TimeoutError extends Error {}
    const { service } = await connected();
    fakeRedis.get = vi.fn(async () => {
      throw new TimeoutError();
    });

    await expect(service.getSessionUser(req("any"))).rejects.toThrow();

    expect(service.getRedisLastError()).toBe("TimeoutError");
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_session_get_failed", error: "TimeoutError" }),
      expect.any(String)
    );
  });

  // node-redis drops its own timeout once a command is written, so a Redis
  // that accepts the command and never answers (a paused container, a
  // half-open socket) would hold the request open for good. The session
  // commands have their own deadline, 2 s.
  test("a read that is written and never answered fails at the reply deadline", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = vi.fn(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      const outcome = service.getSessionUser(req(token)).then(
        () => "answered",
        (err) => err
      );

      await vi.advanceTimersByTimeAsync(2000);
      const settled = await Promise.race([outcome, Promise.resolve("still waiting")]);

      expect(settled).toBeInstanceOf(SessionStoreUnavailableError);
      expect(service.getRedisLastError()).toMatch(/did not answer/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a write that is never answered refuses the session at the reply deadline", async () => {
    const { service } = await connected();
    fakeRedis.set = vi.fn(() => new Promise(() => {}));
    vi.useFakeTimers();
    try {
      const outcome = service.createSession("u-1").then(
        () => "answered",
        (err) => err
      );

      await vi.advanceTimersByTimeAsync(1999);
      expect(await Promise.race([outcome, Promise.resolve("still waiting")])).toBe("still waiting");
      await vi.advanceTimersByTimeAsync(1);

      expect(await Promise.race([outcome, Promise.resolve("still waiting")])).toBeInstanceOf(
        SessionStoreUnavailableError
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // /api/generate runs attachOptionalUser. A caller whose session cookie
  // cannot be read is not anonymous: going on as anonymous would charge the
  // anonymous quota and save nothing, while telling them nothing was wrong.
  test("attachOptionalUser answers 503, not anonymous, when the read fails", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = failing();
    const res = buildRes();
    const next = vi.fn();

    await service.attachOptionalUser(
      { ...req(token), log: { error: vi.fn(), warn: vi.fn() } },
      res,
      next
    );

    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/on fire/);
    expect(next).not.toHaveBeenCalled();
  });

  // With no cookie there is nothing to read, so the store is never asked and
  // an anonymous caller is served during the outage.
  test("attachOptionalUser still serves a caller with no session cookie", async () => {
    const { service } = await connected();
    fakeRedis.get = failing();
    const request = { headers: {} };
    const next = vi.fn();

    await service.attachOptionalUser(request, buildRes(), next);

    expect(request.user).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
    expect(fakeRedis.get).not.toHaveBeenCalled();
  });

  test("requireAuth answers 503, not 401, when the read fails", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = failing();
    const res = buildRes();
    const next = vi.fn();

    await service.requireAuth({ ...req(token), log: { error: vi.fn() } }, res, next);

    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/on fire/);
    expect(next).not.toHaveBeenCalled();
  });

  // A success after a failure clears the recorded error, so the status does
  // not keep reporting a problem that has passed, and the next sign-in is
  // stored in Redis as normal.
  test("a later success clears the recorded error and stores the session", async () => {
    const { service } = await connected();
    const working = fakeRedis.set;
    fakeRedis.set = failing();
    await expect(service.createSession("u-1")).rejects.toThrow();
    expect(service.getRedisLastError()).toBeTruthy();

    fakeRedis.set = working;
    const token = await service.createSession("u-2");

    expect(service.getRedisLastError()).toBe("");
    expect(await service.getSessionUser(req(token))).toMatchObject({ id: "u-2" });
  });
});

describe("closeSessionStore", () => {
  test("disconnects and returns to the in-memory store", async () => {
    const { service } = await connected();

    await service.closeSessionStore();

    expect(fakeRedis.destroy).toHaveBeenCalled();
    expect(service.isRedisSessionsEnabled()).toBe(false);
    expect(service.getRedisClient()).toBeNull();
  });

  test("sessions still work after closing", async () => {
    const { service } = await connected();
    await service.closeSessionStore();

    const token = await service.createSession("u-1");

    expect(await service.getSessionUser(req(token))).toMatchObject({ id: "u-1" });
  });
});
