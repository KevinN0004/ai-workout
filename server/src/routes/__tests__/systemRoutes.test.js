import express from "express";
import request from "supertest";
import { describe, expect, test } from "vitest";
import { registerSystemRoutes } from "../systemRoutes.js";

// The /api/metrics payload maps the route surface (per-route latency and
// request totals) and counts rate-limited requests live, so it is not for the
// open internet. These pin the guard in front of it, including the part that
// is easy to get backwards: an unconfigured PRODUCTION deployment must be
// closed, not open.

const buildApp = (overrides = {}) => {
  const app = express();
  registerSystemRoutes(app, {
    metrics: {
      requestsTotal: 7,
      rateLimited: 0,
      authFailures: 3,
      postgresPoolErrors: 2,
      requestLatencyMs: {},
      routeLatencyMs: {},
      externalCache: { hits: 1, misses: 1 },
      externalApiLatencyMs: {}
    },
    serverBootAtMs: Date.now(),
    redisConfigured: () => false,
    redisSessionsEnabled: () => false,
    redisClient: () => null,
    postgresStatusRef: () => ({ configured: true, connected: true, lastError: "" }),
    errorTrackingConfigured: () => false,
    errorTrackingEnabled: () => false,
    ...overrides
  });
  return app;
};

describe("GET /api/metrics", () => {
  test("is open in development when no token is configured", async () => {
    // A debugging convenience on loopback. Closing it here would make the
    // endpoint useless in the only place it is casually needed.
    const response = await request(buildApp({ metricsToken: "", isProduction: false })).get(
      "/api/metrics"
    );

    expect(response.status).toBe(200);
    expect(response.body.requestsTotal).toBe(7);
  });

  // The assertion that matters. Secure by default: getting the deployment
  // wrong -- forgetting METRICS_TOKEN -- must close the endpoint rather than
  // publish it to the internet.
  test("is closed in production when no token is configured", async () => {
    const response = await request(buildApp({ metricsToken: "", isProduction: true })).get(
      "/api/metrics"
    );

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toMatch(/authFailures|requestsTotal/);
  });

  // authRoutes.js counts every failed password check; this is where the count
  // is read.
  test("reports the failed password checks", async () => {
    const response = await request(buildApp({ metricsToken: "", isProduction: false })).get(
      "/api/metrics"
    );

    expect(response.body.authFailures).toBe(3);
  });

  // postgres.js counts every idle connection the pool lost; this is where the
  // count is read.
  test("reports the Postgres pool's connection errors", async () => {
    const response = await request(buildApp({ metricsToken: "", isProduction: false })).get(
      "/api/metrics"
    );

    expect(response.body.postgresPoolErrors).toBe(2);
  });

  test("allows a request carrying the right token", async () => {
    const response = await request(buildApp({ metricsToken: "s3cret", isProduction: true }))
      .get("/api/metrics")
      .set("X-Metrics-Token", "s3cret");

    expect(response.status).toBe(200);
    expect(response.body.requestsTotal).toBe(7);
  });

  test("refuses a wrong token", async () => {
    const response = await request(buildApp({ metricsToken: "s3cret", isProduction: true }))
      .get("/api/metrics")
      .set("X-Metrics-Token", "wrong!");

    expect(response.status).toBe(404);
  });

  test("refuses a missing token when one is configured", async () => {
    const response = await request(buildApp({ metricsToken: "s3cret", isProduction: false })).get(
      "/api/metrics"
    );

    // Configured means required, in development too -- otherwise the header
    // path would never be exercised until production, where a mistake is
    // expensive.
    expect(response.status).toBe(404);
  });

  test("answers 404 rather than 401, so it does not advertise itself", async () => {
    const response = await request(buildApp({ metricsToken: "s3cret", isProduction: true })).get(
      "/api/metrics"
    );

    // A 401 tells a scanner the endpoint exists and is merely locked.
    expect(response.status).toBe(404);
    expect(response.status).not.toBe(401);
  });
});

describe("GET /api/ready reports which store sessions are using", () => {
  const readyWith = (overrides) =>
    request(buildApp({ redisConfigured: () => true, ...overrides })).get("/api/ready");

  test("redis while its client can serve commands", async () => {
    const response = await readyWith({
      redisSessionsEnabled: () => true,
      redisClient: () => ({ isReady: true })
    });

    expect(response.status).toBe(200);
    expect(response.body.dependencies.redis).toEqual({
      configured: true,
      connected: true,
      mode: "redis"
    });
  });

  // Sessions answer 503 while the client reconnects. They do not fall back to
  // memory, so the mode must not say they do.
  test("unavailable while Redis is the store but its client is reconnecting", async () => {
    const response = await readyWith({
      redisSessionsEnabled: () => true,
      redisClient: () => ({ isReady: false })
    });

    expect(response.status).toBe(503);
    expect(response.body.dependencies.redis).toEqual({
      configured: true,
      connected: false,
      mode: "unavailable"
    });
  });

  test("in_memory_fallback when Redis failed to connect at startup", async () => {
    const response = await readyWith({
      redisSessionsEnabled: () => false,
      redisClient: () => null
    });

    expect(response.status).toBe(503);
    expect(response.body.dependencies.redis.mode).toBe("in_memory_fallback");
  });

  // Recovery is node-redis's own reconnect loop. Readiness reads the client's
  // state on every request, so it follows a reconnect without a restart.
  test("reports redis again on the next request once the client is ready", async () => {
    const client = { isReady: false };
    const app = buildApp({
      redisConfigured: () => true,
      redisSessionsEnabled: () => true,
      redisClient: () => client
    });
    const during = await request(app).get("/api/ready");

    client.isReady = true;
    const after = await request(app).get("/api/ready");

    expect(during.body.dependencies.redis.mode).toBe("unavailable");
    expect(after.status).toBe(200);
    expect(after.body.dependencies.redis.mode).toBe("redis");
  });
});

describe("the probes stay open", () => {
  // Load balancers and uptime monitors are unauthenticated by nature. If the
  // metrics guard ever leaked onto these, deploys would fail their health
  // check and an uptime monitor would report a permanent outage.
  test("/api/health is reachable with no token in production", async () => {
    const response = await request(buildApp({ metricsToken: "s3cret", isProduction: true })).get(
      "/api/health"
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  test("/api/ready is reachable with no token in production", async () => {
    const response = await request(buildApp({ metricsToken: "s3cret", isProduction: true })).get(
      "/api/ready"
    );

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ready");
  });
});

describe("registerSystemRoutes defaults", () => {
  test("treats an absent metricsToken and isProduction as development", async () => {
    // index.js always passes both, but the defaults decide what a caller that
    // forgets them gets. Open is right here: the only callers that omit them
    // are tests and local tooling.
    const app = express();
    registerSystemRoutes(app, {
      metrics: { requestsTotal: 1, rateLimited: 0, externalCache: {}, externalApiLatencyMs: {} },
      serverBootAtMs: Date.now(),
      redisConfigured: () => false,
      redisSessionsEnabled: () => false,
      redisClient: () => null,
      postgresStatusRef: () => ({ configured: true, connected: true, lastError: "" }),
      errorTrackingConfigured: () => false,
      errorTrackingEnabled: () => false
    });

    expect((await request(app).get("/api/metrics")).status).toBe(200);
  });
});
