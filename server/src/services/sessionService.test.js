import { describe, expect, test, vi } from "vitest";
import { createSessionService, withTimeout } from "./sessionService.js";

const cleanText = (value, maxLen = 500) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";
const toShortText = (value, maxLen = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
});

const buildService = (overrides = {}) =>
  createSessionService({
    cleanText,
    toShortText,
    logger: createLogger(),
    findUserById: async () => null,
    sessionTtlMs: 1000 * 60,
    cookieSecure: "",
    csrfCookieName: "csrfToken",
    csrfHeaderName: "x-csrf-token",
    csrfUnsafeMethods: new Set(["POST"]),
    redisSessionKeyPrefix: "session:sid:",
    ...overrides
  });

describe("withTimeout", () => {
  test("resolves with the original value when the promise wins", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "too slow")).resolves.toBe("ok");
  });

  test("rejects with the supplied message when the promise stalls", async () => {
    const stalled = new Promise(() => {});
    await expect(withTimeout(stalled, 20, "too slow")).rejects.toThrow("too slow");
  });

  test("propagates the original rejection rather than the timeout", async () => {
    const failing = Promise.reject(new Error("original failure"));
    await expect(withTimeout(failing, 1000, "too slow")).rejects.toThrow("original failure");
  });
});

describe("initSessionStore", () => {
  test("reports an unconfigured store and uses in-memory sessions", async () => {
    const service = buildService();
    const status = await service.initSessionStore({});

    expect(status).toEqual({ configured: false, connected: false, lastError: "" });
    expect(service.isRedisConfigured()).toBe(false);
    expect(service.isRedisSessionsEnabled()).toBe(false);
  });

  // Regression: node-redis retries a failed connection indefinitely, so awaiting
  // connect() on an unreachable host used to hang startup forever and the server
  // never reached listen(). The vitest timeout below is the assertion that matters.
  test("falls back to in-memory sessions when Redis is unreachable", async () => {
    const service = buildService({ redisConnectTimeoutMs: 300 });
    // Port 1 is reserved and closed, so the socket fails fast.
    const status = await service.initSessionStore({
      REDIS_HOST: "127.0.0.1",
      REDIS_PORT: "1"
    });

    expect(status.configured).toBe(true);
    expect(status.connected).toBe(false);
    expect(status.lastError).not.toBe("");
    expect(service.isRedisSessionsEnabled()).toBe(false);
    expect(service.getRedisClient()).toBeNull();
  }, 15000);

  test("still issues working sessions after falling back", async () => {
    const service = buildService({
      redisConnectTimeoutMs: 300,
      findUserById: async (userId) => ({ id: userId, email: "fallback@example.com" })
    });
    await service.initSessionStore({ REDIS_HOST: "127.0.0.1", REDIS_PORT: "1" });

    const token = await service.createSession("user-123");
    expect(token).toMatch(/^[0-9a-f]{48}$/);

    const user = await service.getSessionUser({ headers: { cookie: `sid=${token}` } });
    expect(user).toEqual({ id: "user-123", email: "fallback@example.com" });

    await service.deleteSession(token);
    const afterDelete = await service.getSessionUser({ headers: { cookie: `sid=${token}` } });
    expect(afterDelete).toBeNull();
  }, 15000);

  test("closeSessionStore is safe when no Redis client was ever created", async () => {
    const service = buildService();
    await service.initSessionStore({});

    await expect(service.closeSessionStore()).resolves.toBeUndefined();
    expect(service.isRedisSessionsEnabled()).toBe(false);
    expect(service.getRedisClient()).toBeNull();
  });

  test("closeSessionStore disconnects the client and disables Redis sessions", async () => {
    const service = buildService({ redisConnectTimeoutMs: 300 });
    await service.initSessionStore({ REDIS_HOST: "127.0.0.1", REDIS_PORT: "1" });

    await service.closeSessionStore();

    expect(service.isRedisSessionsEnabled()).toBe(false);
    expect(service.getRedisClient()).toBeNull();
  }, 15000);
});

describe("passwordChangedAt invalidation", () => {
  test("a session created before the password changed is rejected and deleted", async () => {
    const service = buildService({
      findUserById: async () => ({
        id: "user-1",
        email: "person@example.com",
        passwordChangedAt: new Date(Date.now() + 5_000).toISOString()
      })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = { headers: { cookie: `sid=${token}` } };

    expect(await service.getSessionUser(req)).toBeNull();
    // Rejecting is not enough -- the dead token must not linger in the store.
    expect(await service.getSessionByToken(token)).toBeNull();
  });

  test("a session created after the password changed survives", async () => {
    const service = buildService({
      findUserById: async () => ({
        id: "user-1",
        email: "person@example.com",
        passwordChangedAt: new Date(Date.now() - 5_000).toISOString()
      })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = { headers: { cookie: `sid=${token}` } };

    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });

  test("a user who has never changed their password keeps their session", async () => {
    const service = buildService({
      findUserById: async () => ({
        id: "user-1",
        email: "person@example.com",
        passwordChangedAt: null
      })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = { headers: { cookie: `sid=${token}` } };

    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });

  test("an empty-string timestamp is treated as absent, not as epoch zero", async () => {
    const service = buildService({
      findUserById: async () => ({
        id: "user-1",
        email: "person@example.com",
        passwordChangedAt: ""
      })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = { headers: { cookie: `sid=${token}` } };

    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });
});
