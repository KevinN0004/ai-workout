import { beforeEach, describe, expect, test, vi } from "vitest";
import { createSessionService } from "./sessionService.js";

// The cookie, CSRF and session-lifecycle half of sessionService. The existing
// file covers withTimeout and the Redis startup fallback; this covers what a
// request actually touches, all of it on the in-memory store.
//
// The security-relevant shapes here are the two cookies -- the session one is
// HttpOnly and the CSRF one deliberately is not, because the client has to
// read it to echo it back -- and the double-submit check that compares them.

const cleanText = (value, maxLen = 500) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";
const toShortText = (value, maxLen = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

let logger;
let findUserById;

const buildService = (overrides = {}) =>
  createSessionService({
    cleanText,
    toShortText,
    logger,
    findUserById,
    sessionTtlMs: 1000 * 60,
    cookieSecure: "",
    csrfCookieName: "csrfToken",
    csrfHeaderName: "x-csrf-token",
    csrfUnsafeMethods: new Set(["POST", "PUT", "PATCH", "DELETE"]),
    redisSessionKeyPrefix: "session:sid:",
    ...overrides
  });

// Just enough of an express response for the cookie writers and the guards.
const buildRes = () => {
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    getHeader: (name) => headers[name],
    setHeader: (name, value) => {
      headers[name] = value;
    },
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

const cookiesOf = (res) => {
  const value = res.getHeader("Set-Cookie");
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const buildReq = (overrides = {}) => ({
  method: "GET",
  headers: {},
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  ...overrides
});

beforeEach(() => {
  logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  findUserById = vi.fn(async (userId) => ({ id: userId, email: "a@b.com" }));
});

describe("parseCookies", () => {
  const { parseCookies } = buildService();

  test("reads a single cookie", () => {
    expect(parseCookies("sid=abc123")).toEqual({ sid: "abc123" });
  });

  test("reads several", () => {
    expect(parseCookies("sid=abc; csrfToken=def")).toEqual({ sid: "abc", csrfToken: "def" });
  });

  test("decodes an encoded value", () => {
    expect(parseCookies("name=a%40b.com").name).toBe("a@b.com");
  });

  // A cookie value can legitimately contain "=", so only the first one splits.
  test("keeps an equals sign inside the value", () => {
    expect(parseCookies("token=abc=def").token).toBe("abc=def");
  });

  test.each([
    ["an empty header", ""],
    ["undefined", undefined],
    ["junk with no pairs", "not-a-cookie"]
  ])("returns nothing usable for %s", (_label, input) => {
    expect(parseCookies(input).sid).toBeUndefined();
  });
});

describe("parseRedisPort", () => {
  const { parseRedisPort } = buildService();

  test.each([
    ["6379", 6379],
    [6379, 6379],
    [1, 1],
    [65535, 65535]
  ])("accepts %s", (input, expected) => {
    expect(parseRedisPort(input)).toBe(expected);
  });

  // 0 is what a missing value coerces to, and it is not a port.
  test.each([0, -1, 65536, "abc", null, undefined, 1.5])("rejects %s", (input) => {
    expect(parseRedisPort(input)).toBeNull();
  });
});

describe("parseEnvBoolean", () => {
  const { parseEnvBoolean } = buildService();

  test.each(["true", "1", "yes", "on", "TRUE", "  On  "])("reads %s as true", (input) => {
    expect(parseEnvBoolean(input, false)).toBe(true);
  });

  test.each(["false", "0", "no", "off", "OFF"])("reads %s as false", (input) => {
    expect(parseEnvBoolean(input, true)).toBe(false);
  });

  test.each([
    ["an unrecognised word", "maybe"],
    ["an empty string", ""],
    ["undefined", undefined]
  ])("falls back for %s", (_label, input) => {
    expect(parseEnvBoolean(input, true)).toBe(true);
    expect(parseEnvBoolean(input, false)).toBe(false);
  });
});

describe("cookies", () => {
  test("the session cookie is HttpOnly and scoped to the site", () => {
    const res = buildRes();

    buildService().setSessionCookie(res, "token-1");

    const [cookie] = cookiesOf(res);
    expect(cookie).toContain("sid=token-1");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
  });

  // Remember-me is the difference between a cookie with an expiry and one that
  // dies with the browser.
  test("a persistent session cookie carries a max age", () => {
    const res = buildRes();

    buildService({ sessionTtlMs: 60000 }).setSessionCookie(res, "token-1", true);

    expect(cookiesOf(res)[0]).toContain("Max-Age=60");
  });

  test("a session-only cookie carries none", () => {
    const res = buildRes();

    buildService().setSessionCookie(res, "token-1", false);

    expect(cookiesOf(res)[0]).not.toContain("Max-Age");
  });

  // The CSRF cookie is deliberately readable: the client has to send it back
  // in a header for the double-submit check to mean anything.
  test("the csrf cookie is not HttpOnly", () => {
    const res = buildRes();

    buildService().setCsrfCookie(res, "csrf-1");

    const [cookie] = cookiesOf(res);
    expect(cookie).toContain("csrfToken=csrf-1");
    expect(cookie).not.toContain("HttpOnly");
  });

  test.each([
    ["the session cookie", (service, res) => service.clearSessionCookie(res), "sid="],
    ["the csrf cookie", (service, res) => service.clearCsrfCookie(res), "csrfToken="]
  ])("clearing %s expires it immediately", (_label, clear, prefix) => {
    const res = buildRes();

    clear(buildService(), res);

    const [cookie] = cookiesOf(res);
    expect(cookie).toContain(prefix);
    expect(cookie).toContain("Max-Age=0");
  });

  // Signup sets both cookies on one response. Overwriting rather than
  // appending would silently drop whichever was written first.
  test("a second cookie is added rather than replacing the first", () => {
    const res = buildRes();
    const service = buildService();

    service.setSessionCookie(res, "token-1");
    service.setCsrfCookie(res, "csrf-1");

    const cookies = cookiesOf(res);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("sid=token-1");
    expect(cookies[1]).toContain("csrfToken=csrf-1");
  });

  test("the secure flag is appended when configured", () => {
    const res = buildRes();

    buildService({ cookieSecure: "; Secure" }).setSessionCookie(res, "token-1");

    expect(cookiesOf(res)[0]).toContain("Secure");
  });
});

describe("the session lifecycle", () => {
  const withSession = async (service) => {
    const token = await service.createSession("u-1");
    return buildReq({ headers: { cookie: `sid=${token}` } });
  };

  test("a created session resolves back to its user", async () => {
    const service = buildService();

    const user = await service.getSessionUser(await withSession(service));

    expect(findUserById).toHaveBeenCalledWith("u-1");
    expect(user).toMatchObject({ id: "u-1" });
  });

  test("issues a different token every time", async () => {
    const service = buildService();

    const [a, b] = await Promise.all([service.createSession("u-1"), service.createSession("u-1")]);

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{48}$/);
  });

  test("an unknown token resolves to nobody", async () => {
    const service = buildService();

    const user = await service.getSessionUser(buildReq({ headers: { cookie: "sid=nope" } }));

    expect(user).toBeNull();
    expect(findUserById).not.toHaveBeenCalled();
  });

  test("no cookie resolves to nobody", async () => {
    expect(await buildService().getSessionUser(buildReq())).toBeNull();
  });

  test("a deleted session stops resolving", async () => {
    const service = buildService();
    const token = await service.createSession("u-1");

    await service.deleteSession(token);

    const req = buildReq({ headers: { cookie: `sid=${token}` } });
    expect(await service.getSessionUser(req)).toBeNull();
  });

  test("deleting without a token is harmless", async () => {
    await expect(buildService().deleteSession("")).resolves.toBeUndefined();
  });

  // An expired session is not merely ignored, it is removed, so a stale token
  // cannot sit in the store until the process restarts.
  test("an expired session is rejected and cleaned up", async () => {
    const service = buildService({ sessionTtlMs: 10 });
    const req = await withSession(service);

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(await service.getSessionUser(req)).toBeNull();
    // Still gone once the clock no longer matters.
    expect(await service.getSessionUser(req)).toBeNull();
    expect(findUserById).not.toHaveBeenCalled();
  });
});

describe("requireAuth", () => {
  test("attaches the user and continues", async () => {
    const service = buildService();
    const token = await service.createSession("u-1");
    const req = buildReq({ headers: { cookie: `sid=${token}` } });
    const next = vi.fn();

    await service.requireAuth(req, buildRes(), next);

    expect(req.user).toMatchObject({ id: "u-1" });
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("answers 401 without a session", async () => {
    const res = buildRes();
    const next = vi.fn();

    await buildService().requireAuth(buildReq(), res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe("Not signed in.");
    expect(next).not.toHaveBeenCalled();
  });

  test("masks a lookup failure rather than leaking it", async () => {
    findUserById = vi.fn(async () => {
      throw new Error("connection terminated unexpectedly");
    });
    const service = buildService();
    const token = await service.createSession("u-1");
    const res = buildRes();

    await service.requireAuth(
      buildReq({ headers: { cookie: `sid=${token}` } }),
      res,
      vi.fn()
    );

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/connection terminated/);
  });
});

describe("attachOptionalUser", () => {
  test("attaches the user when there is one", async () => {
    const service = buildService();
    const token = await service.createSession("u-1");
    const req = buildReq({ headers: { cookie: `sid=${token}` } });

    await service.attachOptionalUser(req, buildRes(), vi.fn());

    expect(req.user).toMatchObject({ id: "u-1" });
  });

  test("attaches null rather than refusing the request", async () => {
    const req = buildReq();
    const next = vi.fn();

    await buildService().attachOptionalUser(req, buildRes(), next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  // The point of this middleware: a route open to anonymous callers must not
  // start refusing everyone because the session store is unwell.
  test("continues as anonymous when the lookup throws", async () => {
    findUserById = vi.fn(async () => {
      throw new Error("redis is on fire");
    });
    const service = buildService();
    const token = await service.createSession("u-1");
    const req = buildReq({ headers: { cookie: `sid=${token}` } });
    const next = vi.fn();

    await service.attachOptionalUser(req, buildRes(), next);

    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "optional_auth_lookup_failed" }),
      expect.any(String)
    );
  });
});

describe("ensureCsrfTokenCookie", () => {
  test("issues a token and sets the cookie when there is none", () => {
    const req = buildReq();
    const res = buildRes();
    const next = vi.fn();

    buildService().ensureCsrfTokenCookie(req, res, next);

    expect(req.csrfToken).toMatch(/^[0-9a-f]{48}$/);
    expect(cookiesOf(res)[0]).toContain(`csrfToken=${req.csrfToken}`);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // Reissuing on every request would invalidate the token a page already holds.
  test("reuses the token already in the cookie", () => {
    const req = buildReq({ headers: { cookie: "csrfToken=existing-token" } });
    const res = buildRes();

    buildService().ensureCsrfTokenCookie(req, res, vi.fn());

    expect(req.csrfToken).toBe("existing-token");
    expect(cookiesOf(res)).toHaveLength(0);
  });
});

describe("requireCsrfToken", () => {
  const send = (service, { method, cookie, header }) => {
    const req = buildReq({
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(header ? { "x-csrf-token": header } : {})
      }
    });
    const res = buildRes();
    const next = vi.fn();
    service.requireCsrfToken(req, res, next);
    return { req, res, next };
  };

  test.each(["GET", "HEAD", "OPTIONS", "get"])("lets %s through unchecked", (method) => {
    const { res, next } = send(buildService(), { method });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test.each(["POST", "PUT", "PATCH", "DELETE"])("checks %s", (method) => {
    const { res, next } = send(buildService(), { method });

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test("accepts a matching pair", () => {
    const { res, next } = send(buildService(), {
      method: "POST",
      cookie: "csrfToken=match-me",
      header: "match-me"
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });

  test.each([
    ["the header is missing", { cookie: "csrfToken=abc" }],
    ["the cookie is missing", { header: "abc" }],
    ["they disagree", { cookie: "csrfToken=abc", header: "def" }],
    // Different lengths would make timingSafeEqual throw, so the length is
    // checked before the comparison.
    ["they are different lengths", { cookie: "csrfToken=abc", header: "abcdef" }]
  ])("refuses when %s", (_label, parts) => {
    const { res, next } = send(buildService(), { method: "POST", ...parts });

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/csrf/i);
    expect(next).not.toHaveBeenCalled();
  });

  test("records the refusal for an operator", () => {
    const { req } = send(buildService(), { method: "POST" });

    expect(req.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "csrf_check_failed", method: "POST" }),
      expect.any(String)
    );
  });

  test("survives a request with no logger attached", () => {
    const service = buildService();
    const req = { method: "POST", headers: {} };
    const res = buildRes();

    expect(() => service.requireCsrfToken(req, res, vi.fn())).not.toThrow();
    expect(res.statusCode).toBe(403);
  });
});

describe("getSessionStoreStatus", () => {
  test("reports the in-memory store when Redis was never configured", () => {
    const status = buildService().getSessionStoreStatus();

    expect(status).toEqual({ configured: false, connected: false, lastError: "" });
  });
});
