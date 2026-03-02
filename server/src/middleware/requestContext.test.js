import { describe, expect, test, vi } from "vitest";
import { createRequestContextMiddleware } from "./requestContext.js";

const createResponseHarness = () => {
  const listeners = {};
  return {
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
  };
};

describe("requestContext middleware", () => {
  test("uses incoming request id, tracks latency, and logs on finish", () => {
    const metrics = {
      requestsTotal: 0,
      requestLatencyMs: {},
      routeLatencyMs: {}
    };
    const requestLogger = {
      info: vi.fn()
    };
    const logger = {
      child: vi.fn(() => requestLogger)
    };
    const middleware = createRequestContextMiddleware({
      metrics,
      logger,
      toShortText: (value) => String(value || "")
    });

    const req = {
      headers: { "x-request-id": "req-123" },
      method: "GET",
      path: "/api/health",
      originalUrl: "/api/health",
      route: { path: "/api/health" }
    };
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
    const metrics = {
      requestsTotal: 0,
      requestLatencyMs: {},
      routeLatencyMs: {}
    };
    const logger = {
      child: vi.fn(() => ({ info: vi.fn() }))
    };
    const middleware = createRequestContextMiddleware({
      metrics,
      logger,
      toShortText: () => ""
    });
    const req = {
      headers: {},
      method: "POST",
      path: "/api/auth/login",
      originalUrl: "/api/auth/login"
    };
    const res = createResponseHarness();
    const next = vi.fn();

    middleware(req, res, next);

    expect(typeof req.requestId).toBe("string");
    expect(req.requestId.length).toBeGreaterThan(10);
    expect(res.headers["X-Request-Id"]).toBe(req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
