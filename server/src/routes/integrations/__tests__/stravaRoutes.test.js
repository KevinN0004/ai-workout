import { describe, expect, test, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerStravaRoutes } from "../registerStravaRoutes.js";

// The Strava connection routes (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "Connecting" and
// "Disconnecting"), with the service stubbed: every callback result, the state
// cookie, what answers 404 without Strava, and that nothing logged holds the code.
// stravaConnect.integration.test.js runs them against Postgres.

const STATE_PATH = "/api/integrations/strava";
const CALLBACK = `${STATE_PATH}/callback`;
const STATE = "state-from-cookie";

const stubService = (overrides = {}) => ({
  connectionState: vi.fn(async () => ({ available: true, connected: false })),
  authorizeUrl: vi.fn(
    ({ redirectUri, state }) => `https://strava.test/authorize?r=${redirectUri}&s=${state}`
  ),
  connect: vi.fn(async () => "connected"),
  disconnect: vi.fn(async () => ({ removed: 3, revokeError: null })),
  sync: vi.fn(async () => ({
    imported: 1,
    updated: 0,
    removed: 0,
    lastSyncedAt: "2026-11-13T10:00:00.000Z"
  })),
  ...overrides
});

const buildApp = ({
  service = stubService(),
  configured = true,
  user = { id: "u-1" },
  log
} = {}) => {
  const app = express();
  app.use(express.json());
  const logger = log || { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
  app.use((req, _res, next) => {
    req.log = logger;
    next();
  });
  const signedIn = (req, res, next) => {
    if (!user) return res.status(401).json({ error: "Not signed in." });
    req.user = user;
    next();
  };
  registerStravaRoutes(app, {
    requireAuth: signedIn,
    attachOptionalUser: (req, _res, next) => {
      req.user = user;
      next();
    },
    parseCookies: (header) =>
      Object.fromEntries(
        String(header)
          .split(";")
          .filter(Boolean)
          .map((part) => part.trim().split("="))
      ),
    cookieSecure: "",
    getStravaConfig: () => (configured ? { clientId: "12345" } : null),
    requestOrigin: () => "http://app.test",
    stravaService: service
  });
  return { app, service, logger };
};

// The callback with `query`, sent with the state cookie unless `cookie` says otherwise.
const callback = (app, query, cookie = `stravaState=${STATE}`) => {
  const call = request(app).get(`${CALLBACK}?${new URLSearchParams(query)}`);
  return cookie ? call.set("Cookie", cookie) : call;
};

const GOOD = { code: "code-xyz", state: STATE, scope: "read,activity:read_all" };

const redirectOf = (response) => response.headers.location;
const cookiesOf = (response) => [].concat(response.headers["set-cookie"] || []);

describe("GET /api/integrations/strava", () => {
  test("answers the service's state for the signed-in user", async () => {
    const service = stubService({
      connectionState: vi.fn(async () => ({
        available: true,
        connected: true,
        athleteName: "Jo S."
      }))
    });
    const { app } = buildApp({ service });

    const response = await request(app).get(STATE_PATH).expect(200);

    expect(response.body).toEqual({ available: true, connected: true, athleteName: "Jo S." });
    expect(service.connectionState).toHaveBeenCalledWith("u-1");
  });

  test("needs a session", async () => {
    await request(buildApp({ user: null }).app)
      .get(STATE_PATH)
      .expect(401);
  });

  test("a failing store is a 500", async () => {
    const service = stubService({
      connectionState: vi.fn(async () => Promise.reject(new Error("down")))
    });
    await request(buildApp({ service }).app).get(STATE_PATH).expect(500);
  });
});

describe("POST /api/integrations/strava/connect", () => {
  test("answers Strava's authorize URL, returning to this origin, with a fresh state cookie", async () => {
    const { app, service } = buildApp();

    const response = await request(app).post(`${STATE_PATH}/connect`).expect(200);

    const [{ redirectUri, state }] = service.authorizeUrl.mock.calls[0];
    expect(redirectUri).toBe("http://app.test/api/integrations/strava/callback");
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body.url).toContain(state);
    const [cookie] = cookiesOf(response);
    expect(cookie).toBe(
      `stravaState=${state}; HttpOnly; Path=/api/integrations/strava; SameSite=Lax; Max-Age=600`
    );
  });

  test("each connect takes a new state", async () => {
    const { app, service } = buildApp();
    await request(app).post(`${STATE_PATH}/connect`);
    await request(app).post(`${STATE_PATH}/connect`);
    const [first, second] = service.authorizeUrl.mock.calls.map(([args]) => args.state);
    expect(first).not.toBe(second);
  });

  test("without Strava on the server it is a 404", async () => {
    const response = await request(buildApp({ configured: false }).app)
      .post(`${STATE_PATH}/connect`)
      .expect(404);
    expect(response.body).toEqual({ error: "Strava is not available." });
  });

  test("a failure building the URL is a 500", async () => {
    const service = stubService({
      authorizeUrl: vi.fn(() => {
        throw new Error("odd");
      })
    });
    await request(buildApp({ service }).app).post(`${STATE_PATH}/connect`).expect(500);
  });
});

describe("GET /api/integrations/strava/callback", () => {
  test("a good return connects, clears the state, and lands on Settings", async () => {
    const { app, service } = buildApp();

    const response = await callback(app, GOOD).expect(302);

    expect(redirectOf(response)).toBe("/dashboard/settings?strava=connected");
    expect(service.connect).toHaveBeenCalledWith("u-1", "code-xyz");
    expect(cookiesOf(response)).toContain(
      "stravaState=; HttpOnly; Path=/api/integrations/strava; SameSite=Lax; Max-Age=0"
    );
  });

  test.each([
    ["taken", "taken"],
    ["failed", "failed"]
  ])("the service's %s lands as %s", async (outcome, result) => {
    const { app } = buildApp({ service: stubService({ connect: vi.fn(async () => outcome) }) });
    expect(redirectOf(await callback(app, GOOD))).toBe(`/dashboard/settings?strava=${result}`);
  });

  test("activity:read alone is enough", async () => {
    const { app } = buildApp();
    const response = await callback(app, { ...GOOD, scope: "read activity:read" });
    expect(redirectOf(response)).toBe("/dashboard/settings?strava=connected");
  });

  test("a cancel on Strava's page is cancelled, and connects nothing", async () => {
    const { app, service } = buildApp();
    const response = await callback(app, { error: "access_denied", state: STATE });
    expect(redirectOf(response)).toBe("/dashboard/settings?strava=cancelled");
    expect(service.connect).not.toHaveBeenCalled();
  });

  test.each([
    ["a state that differs", { ...GOOD, state: "someone-else" }, `stravaState=${STATE}`],
    ["no state cookie", GOOD, ""],
    ["no state in the query", { code: "code-xyz", scope: GOOD.scope }, `stravaState=${STATE}`],
    ["a state of another length", { ...GOOD, state: `${STATE}x` }, `stravaState=${STATE}`],
    // timingSafeEqual calls two empty buffers equal, so "no cookie" must fail
    // even when the return carries no state either.
    ["neither a cookie nor a state", { code: "code-xyz", scope: GOOD.scope }, ""]
  ])("%s fails, with a warning, and connects nothing", async (_label, query, cookie) => {
    const { app, service, logger } = buildApp();

    const response = await callback(app, query, cookie);

    expect(redirectOf(response)).toBe("/dashboard/settings?strava=failed");
    expect(service.connect).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { event: "strava_state_mismatch" },
      expect.any(String)
    );
  });

  test("activity access unticked on Strava's page is no-access", async () => {
    const { app, service } = buildApp();
    const response = await callback(app, { ...GOOD, scope: "read" });
    expect(redirectOf(response)).toBe("/dashboard/settings?strava=no-access");
    expect(service.connect).not.toHaveBeenCalled();
  });

  test("no code fails", async () => {
    const { app } = buildApp();
    const { code: _code, ...withoutCode } = GOOD;
    expect(redirectOf(await callback(app, withoutCode))).toBe("/dashboard/settings?strava=failed");
  });

  test("Strava's athlete limit is limit", async () => {
    const error = Object.assign(new Error("Strava answered capacity."), { kind: "capacity" });
    const { app } = buildApp({
      service: stubService({ connect: vi.fn(async () => Promise.reject(error)) })
    });
    expect(redirectOf(await callback(app, GOOD))).toBe("/dashboard/settings?strava=limit");
  });

  test.each([
    [
      "a Strava outage",
      Object.assign(new Error("Strava answered unavailable."), { kind: "unavailable" }),
      "unavailable"
    ],
    ["a store failure", new Error("database down"), "error"]
  ])("%s is unavailable, logged by kind alone", async (_label, error, kind) => {
    const { app, logger } = buildApp({
      service: stubService({ connect: vi.fn(async () => Promise.reject(error)) })
    });

    expect(redirectOf(await callback(app, GOOD))).toBe("/dashboard/settings?strava=unavailable");
    expect(logger.warn).toHaveBeenCalledWith(
      { event: "strava_connect_failed", kind },
      expect.any(String)
    );
  });

  test("without a session it goes to sign-in, and still clears the state", async () => {
    const { app, service } = buildApp({ user: null });
    const response = await callback(app, GOOD);
    expect(redirectOf(response)).toBe("/auth");
    expect(service.connect).not.toHaveBeenCalled();
    expect(cookiesOf(response).join("\n")).toContain("stravaState=;");
  });

  test("without Strava on the server it is a 404", async () => {
    await callback(buildApp({ configured: false }).app, GOOD).expect(404);
  });

  test("nothing logged holds the code or the state", async () => {
    const { app, logger } = buildApp({
      service: stubService({
        connect: vi.fn(async () =>
          Promise.reject(Object.assign(new Error("x"), { kind: "unavailable" }))
        )
      })
    });
    await callback(app, GOOD);
    await callback(app, { ...GOOD, state: "wrong" });

    const logged = JSON.stringify([
      logger.warn.mock.calls,
      logger.error.mock.calls,
      logger.info.mock.calls
    ]);
    expect(logged).not.toContain("code-xyz");
    expect(logged).not.toContain(STATE);
  });
});

describe("DELETE /api/integrations/strava", () => {
  test("disconnects, and answers ok", async () => {
    const { app, service, logger } = buildApp();

    const response = await request(app).delete(STATE_PATH).expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(service.disconnect).toHaveBeenCalledWith("u-1");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test("a revoke Strava refused is logged by kind, and the disconnect still answers ok", async () => {
    const { app, logger } = buildApp({
      service: stubService({
        disconnect: vi.fn(async () => ({ removed: 1, revokeError: "unavailable" }))
      })
    });

    await request(app).delete(STATE_PATH).expect(200);
    expect(logger.warn).toHaveBeenCalledWith(
      { event: "strava_revoke_failed", kind: "unavailable" },
      expect.any(String)
    );
  });

  test("without Strava on the server it is a 404", async () => {
    await request(buildApp({ configured: false }).app)
      .delete(STATE_PATH)
      .expect(404);
  });

  test("a failing store is a 500", async () => {
    const service = stubService({
      disconnect: vi.fn(async () => Promise.reject(new Error("down")))
    });
    await request(buildApp({ service }).app).delete(STATE_PATH).expect(500);
  });
});

describe("POST /api/integrations/strava/sync", () => {
  const SYNC = `${STATE_PATH}/sync`;

  test("answers the sync's result for the signed-in user", async () => {
    const { app, service } = buildApp();

    const response = await request(app).post(SYNC).send({}).expect(200);

    expect(response.body).toEqual({
      imported: 1,
      updated: 0,
      removed: 0,
      lastSyncedAt: "2026-11-13T10:00:00.000Z"
    });
    expect(service.sync).toHaveBeenCalledWith("u-1", { manual: false });
  });

  test("Sync now asks for a manual sync", async () => {
    const { app, service } = buildApp();
    await request(app).post(SYNC).send({ manual: true }).expect(200);
    expect(service.sync).toHaveBeenCalledWith("u-1", { manual: true });
  });

  test.each([
    ["a string", { manual: "true" }],
    ["a number", { manual: 1 }]
  ])("manual given as %s is not manual", async (_label, body) => {
    const { app, service } = buildApp();
    await request(app).post(SYNC).send(body).expect(200);
    expect(service.sync).toHaveBeenCalledWith("u-1", { manual: false });
  });

  test("a sync with no body is not manual", async () => {
    const { app, service } = buildApp();
    await request(app).post(SYNC).expect(200);
    expect(service.sync).toHaveBeenCalledWith("u-1", { manual: false });
  });

  test("a sync that went wrong answers its error with a 200, for Settings to show", async () => {
    const service = stubService({ sync: vi.fn(async () => ({ error: "rate_limited" })) });
    const response = await request(buildApp({ service }).app).post(SYNC).expect(200);
    expect(response.body).toEqual({ error: "rate_limited" });
  });

  test("without Strava on the server it is a 404", async () => {
    await request(buildApp({ configured: false }).app)
      .post(SYNC)
      .expect(404);
  });

  test("needs a session", async () => {
    await request(buildApp({ user: null }).app)
      .post(SYNC)
      .expect(401);
  });

  test("a failing store is a 500", async () => {
    const service = stubService({ sync: vi.fn(async () => Promise.reject(new Error("down"))) });
    await request(buildApp({ service }).app).post(SYNC).expect(500);
  });
});
