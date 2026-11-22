// @ts-check
import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";
import { createRequestContextMiddleware } from "../requestContext.js";

// Each fixture here holds only the fields the middleware reads. The loggers are
// cast through unknown, because a vi.fn() is not one of pino's log functions,
// and so is the request whose x-request-id is a plain string, where Node's
// header type also allows a list.

const createResponseHarness = () => {
  const listeners = {};
  return /** @type {import("express").Response & { headers: Record<string, unknown>, finish: () => void }} */ ({
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    on(event, callback) {
      listeners[event] = callback;
    },
    finish() {
      if (listeners.finish) listeners.finish();
    }
  });
};

describe("requestContext middleware", () => {
  test("uses incoming request id, tracks latency, and logs on finish", () => {
    const metrics = /** @type {import("../../services/platform/metricsService.js").Metrics} */ ({
      requestsTotal: 0,
      requestLatencyMs: {},
      routeLatencyMs: {}
    });
    const requestLogger = {
      info: vi.fn()
    };
    const logger = /** @type {import("pino").Logger} */ (
      /** @type {unknown} */ ({
        child: vi.fn(() => requestLogger)
      })
    );
    const middleware = createRequestContextMiddleware({
      metrics,
      logger,
      toShortText: (value) => String(value || "")
    });

    const req = /** @type {import("express").Request} */ (
      /** @type {unknown} */ ({
        headers: { "x-request-id": "req-123" },
        method: "GET",
        path: "/api/health",
        originalUrl: "/api/health",
        route: { path: "/api/health" }
      })
    );
    const res = createResponseHarness();
    const next = vi.fn();

    middleware(req, res, next);
    expect(req.requestId).toBe("req-123");
    expect(res.headers["X-Request-Id"]).toBe("req-123");
    expect(metrics.requestsTotal).toBe(1);
    expect(next).toHaveBeenCalledTimes(1);

    res.finish();

    expect(metrics.requestLatencyMs.count).toBe(1);
    expect(metrics.routeLatencyMs["GET /api/health"].count).toBe(1);
    expect(requestLogger.info).toHaveBeenCalledTimes(1);
  });

  test("generates request id when incoming header is missing", () => {
    const metrics = /** @type {import("../../services/platform/metricsService.js").Metrics} */ ({
      requestsTotal: 0,
      requestLatencyMs: {},
      routeLatencyMs: {}
    });
    const logger = /** @type {import("pino").Logger} */ (
      /** @type {unknown} */ ({
        child: vi.fn(() => ({ info: vi.fn() }))
      })
    );
    const middleware = createRequestContextMiddleware({
      metrics,
      logger,
      toShortText: () => ""
    });
    const req = /** @type {import("express").Request} */ ({
      headers: {},
      method: "POST",
      path: "/api/auth/login",
      originalUrl: "/api/auth/login"
    });
    const res = createResponseHarness();
    const next = vi.fn();

    middleware(req, res, next);

    expect(typeof req.requestId).toBe("string");
    expect(req.requestId.length).toBeGreaterThan(10);
    expect(res.headers["X-Request-Id"]).toBe(req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("collapses unrouted requests into one bucket so metrics stay bounded", () => {
    const metrics = /** @type {import("../../services/platform/metricsService.js").Metrics} */ ({
      requestsTotal: 0,
      requestLatencyMs: {},
      routeLatencyMs: {}
    });
    const logger = /** @type {import("pino").Logger} */ (
      /** @type {unknown} */ ({
        child: vi.fn(() => ({ info: vi.fn() }))
      })
    );
    const middleware = createRequestContextMiddleware({
      metrics,
      logger,
      toShortText: () => ""
    });

    // 404s and middleware rejections (CSRF, rate limit) arrive with no req.route
    // and a caller-supplied path. Each must not mint its own metric key.
    for (const path of ["/api/random-a", "/api/random-b", "/api/random-c"]) {
      const req = /** @type {import("express").Request} */ ({
        headers: {},
        method: "GET",
        path,
        originalUrl: path
      });
      const res = createResponseHarness();
      middleware(req, res, vi.fn());
      res.finish();
    }

    expect(Object.keys(metrics.routeLatencyMs)).toEqual(["GET <unmatched>"]);
    expect(metrics.routeLatencyMs["GET <unmatched>"].count).toBe(3);
  });

  test("still records a key per matched route", () => {
    const metrics = /** @type {import("../../services/platform/metricsService.js").Metrics} */ ({
      requestsTotal: 0,
      requestLatencyMs: {},
      routeLatencyMs: {}
    });
    const logger = /** @type {import("pino").Logger} */ (
      /** @type {unknown} */ ({
        child: vi.fn(() => ({ info: vi.fn() }))
      })
    );
    const middleware = createRequestContextMiddleware({
      metrics,
      logger,
      toShortText: () => ""
    });

    const req = /** @type {import("express").Request} */ ({
      headers: {},
      method: "GET",
      path: "/api/wger/exercises/999",
      originalUrl: "/api/wger/exercises/999",
      route: { path: "/api/wger/exercises/:id" }
    });
    const res = createResponseHarness();
    middleware(req, res, vi.fn());
    res.finish();

    expect(metrics.routeLatencyMs["GET /api/wger/exercises/:id"].count).toBe(1);
  });

  // The weather and air-quality routes take the visitor's coordinates as query
  // parameters, and this line is written for every request, so logging the
  // query would keep a location history per visitor. Driven through real
  // express so `originalUrl` is the one Express builds, not a hand-made one.
  test("logs a weather request's path without its query string", async () => {
    const metrics = /** @type {import("../../services/platform/metricsService.js").Metrics} */ ({
      requestsTotal: 0,
      requestLatencyMs: {},
      routeLatencyMs: {}
    });
    const requestLogger = { info: vi.fn() };
    const app = express();
    app.use(
      createRequestContextMiddleware({
        metrics,
        logger: /** @type {import("pino").Logger} */ (
          /** @type {unknown} */ ({ child: () => requestLogger })
        ),
        toShortText: () => ""
      })
    );
    app.get("/api/weather/recommendation", (_req, res) => res.json({ ok: true }));

    await request(app).get("/api/weather/recommendation?latitude=40.712776&longitude=-74.005974");

    expect(requestLogger.info).toHaveBeenCalledTimes(1);
    const entry = requestLogger.info.mock.calls[0][0];
    expect(entry).toMatchObject({ event: "http_request", path: "/api/weather/recommendation" });
    expect(JSON.stringify(entry)).not.toMatch(/latitude|longitude|40\.71|74\.00/);
  });
});
