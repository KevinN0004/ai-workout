import pino from "pino";
import { describe, expect, test } from "vitest";
import { createSessionService, withTimeout } from "../sessionService.js";

// Each request here holds only the cookie header the session reads, and each
// user only the fields the session check reads.
/** @typedef {import("../authUserService.js").AuthUser} AuthUser */

/**
 * @param {unknown} value
 * @param {number} [maxLen]
 */
const cleanText = (value, maxLen = 500) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";
/**
 * @param {unknown} value
 * @param {number} [maxLen]
 */
const toShortText = (value, maxLen = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

// A real logger that writes nothing.
const createLogger = () => pino({ level: "silent" });

/** @param {Partial<Parameters<typeof createSessionService>[0]>} [overrides] */
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
      findUserById: async (userId) =>
        /** @type {AuthUser} */ ({ id: userId, email: "fallback@example.com" })
    });
    await service.initSessionStore({ REDIS_HOST: "127.0.0.1", REDIS_PORT: "1" });

    const token = await service.createSession("user-123");
    expect(token).toMatch(/^[0-9a-f]{48}$/);

    const user = await service.getSessionUser(
      /** @type {import("express").Request} */ ({ headers: { cookie: `sid=${token}` } })
    );
    expect(user).toEqual({ id: "user-123", email: "fallback@example.com" });

    await service.deleteSession(token);
    const afterDelete = await service.getSessionUser(
      /** @type {import("express").Request} */ ({ headers: { cookie: `sid=${token}` } })
    );
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
      findUserById: async () =>
        /** @type {AuthUser} */ ({
          id: "user-1",
          email: "person@example.com",
          passwordChangedAt: new Date(Date.now() + 5_000).toISOString()
        })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = /** @type {import("express").Request} */ ({ headers: { cookie: `sid=${token}` } });

    expect(await service.getSessionUser(req)).toBeNull();
    // Rejecting is not enough -- the dead token must not linger in the store.
    expect(await service.getSessionByToken(token)).toBeNull();
  });

  test("a session created after the password changed survives", async () => {
    const service = buildService({
      findUserById: async () =>
        /** @type {AuthUser} */ ({
          id: "user-1",
          email: "person@example.com",
          passwordChangedAt: new Date(Date.now() - 5_000).toISOString()
        })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = /** @type {import("express").Request} */ ({ headers: { cookie: `sid=${token}` } });

    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });

  test("a user who has never changed their password keeps their session", async () => {
    const service = buildService({
      findUserById: async () =>
        /** @type {AuthUser} */ ({
          id: "user-1",
          email: "person@example.com",
          passwordChangedAt: null
        })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = /** @type {import("express").Request} */ ({ headers: { cookie: `sid=${token}` } });

    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });

  test("a token whose account no longer exists is rejected and deleted", async () => {
    // DELETE /api/auth/me clears only the cookie it was called with, so an
    // account deleted from one device leaves that account's other tokens live
    // in the store. Rejecting them is not enough: the two branches either side
    // of this one both delete, and leaving a dead token to sit out its TTL was
    // an unexplained asymmetry rather than a decision.
    const service = buildService({ findUserById: async () => null });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = /** @type {import("express").Request} */ ({ headers: { cookie: `sid=${token}` } });

    expect(await service.getSessionUser(req)).toBeNull();
    expect(await service.getSessionByToken(token)).toBeNull();
  });

  test("an empty-string timestamp is treated as absent, not as epoch zero", async () => {
    const service = buildService({
      findUserById: async () =>
        /** @type {AuthUser} */ ({
          id: "user-1",
          email: "person@example.com",
          passwordChangedAt: ""
        })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = /** @type {import("express").Request} */ ({ headers: { cookie: `sid=${token}` } });

    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });

  test("a session created in the same millisecond as the change survives", async () => {
    // POST /api/auth/password mints a replacement session immediately after
    // stamping passwordChangedAt, so the two can share a millisecond. Strict `<` is what
    // lets that session live; `<=` would sign the user out the moment they
    // changed their password.
    /** @type {string | null} */
    let changedAt = null;
    const service = buildService({
      findUserById: async () =>
        /** @type {AuthUser} */ ({
          id: "user-1",
          email: "person@example.com",
          passwordChangedAt: changedAt
        })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const session = await service.getSessionByToken(token);
    // The session just created is in the store.
    changedAt = new Date(
      /** @type {NonNullable<typeof session>} */ (session).createdAt
    ).toISOString();

    const req = /** @type {import("express").Request} */ ({ headers: { cookie: `sid=${token}` } });
    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });
});
