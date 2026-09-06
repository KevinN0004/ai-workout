import { beforeEach, describe, expect, test, vi } from "vitest";
import { createSessionService } from "./sessionService.js";

// The Redis-backed session paths. Reaching them needs the redis module mocked
// rather than a dependency injected, which is why they were the last part of
// sessionService left uncovered.
//
// The behaviour worth having is the fallback. Redis holds sessions when it is
// up, but a blip must not cost anyone their sign-in: every operation catches,
// records the error, and carries on against the in-memory map.

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
    disconnect: vi.fn(async () => {}),
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

    expect(fakeRedis.disconnect).toHaveBeenCalledTimes(1);
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

// The reason the fallback exists: Redis going away mid-request must not sign
// anyone out or stop new sign-ins.
describe("when Redis fails after connecting", () => {
  test("a failed write still returns a token rather than throwing", async () => {
    const { service } = await connected();
    fakeRedis.set = vi.fn(async () => {
      throw new Error("redis is on fire");
    });

    const token = await service.createSession("u-1");

    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(service.getRedisLastError()).toMatch(/redis is on fire/);
  });

  // Recorded as it behaves, because the shape is surprising. createSession
  // falls back to the in-memory map when the Redis write fails, but
  // getSessionByToken consults only Redis while Redis is enabled -- a miss
  // returns null and memory is never checked. So the session written during
  // the blip cannot be read back, and the user is signed out on their next
  // request. The fallback write is unreachable by any read until Redis is
  // disabled entirely.
  test("a session written during a blip cannot be read back", async () => {
    const { service } = await connected();
    fakeRedis.set = vi.fn(async () => {
      throw new Error("redis is on fire");
    });
    const token = await service.createSession("u-1");

    expect(await service.getSessionUser(req(token))).toBeNull();
  });

  // The other half of the same asymmetry: sign-out returns after the Redis
  // delete, so the memory entry is never removed either.
  test("signing out does not clear the entry that blip left in memory", async () => {
    const { service } = await connected();
    fakeRedis.set = vi.fn(async () => {
      throw new Error("redis is on fire");
    });
    const token = await service.createSession("u-1");

    await service.deleteSession(token);
    // Still invisible while Redis is up...
    expect(await service.getSessionUser(req(token))).toBeNull();

    // ...but it is still in the map, so closing Redis brings it back.
    await service.closeSessionStore();
    expect(await service.getSessionUser(req(token))).toMatchObject({ id: "u-1" });
  });

  test("a failed write is reported to an operator", async () => {
    const { service } = await connected();
    fakeRedis.set = vi.fn(async () => {
      throw new Error("redis is on fire");
    });

    await service.createSession("u-1");

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_session_create_failed" }),
      expect.any(String)
    );
  });

  test("a failed read resolves to nobody rather than throwing", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = vi.fn(async () => {
      throw new Error("redis is on fire");
    });

    await expect(service.getSessionUser(req(token))).resolves.toBeNull();
    expect(service.getRedisLastError()).toMatch(/redis is on fire/);
  });

  test("a failed read still tries to clear the key", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = vi.fn(async () => {
      throw new Error("redis is on fire");
    });

    await service.getSessionUser(req(token));

    expect(fakeRedis.del).toHaveBeenCalledWith(`session:sid:${token}`);
  });

  // The cleanup is best-effort; failing it must not turn a failed read into a
  // thrown request.
  test("survives the cleanup failing too", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = vi.fn(async () => {
      throw new Error("redis is on fire");
    });
    fakeRedis.del = vi.fn(async () => {
      throw new Error("still on fire");
    });

    await expect(service.getSessionUser(req(token))).resolves.toBeNull();
  });

  test("a failed delete is recorded rather than thrown", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.del = vi.fn(async () => {
      throw new Error("redis is on fire");
    });

    await expect(service.deleteSession(token)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_session_delete_failed" }),
      expect.any(String)
    );
  });

  // A success after a failure clears the recorded error, so the status does
  // not keep reporting a problem that has passed.
  test("a later success clears the recorded error", async () => {
    const { service } = await connected();
    fakeRedis.set = vi.fn(async () => {
      throw new Error("redis is on fire");
    });
    await service.createSession("u-1");
    expect(service.getRedisLastError()).toBeTruthy();

    fakeRedis.set = vi.fn(async () => "OK");
    await service.createSession("u-2");

    expect(service.getRedisLastError()).toBe("");
  });
});

describe("closeSessionStore", () => {
  test("disconnects and returns to the in-memory store", async () => {
    const { service } = await connected();

    await service.closeSessionStore();

    expect(fakeRedis.disconnect).toHaveBeenCalled();
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
