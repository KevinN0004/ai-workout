import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { sendErrorResponse, setErrorResponseTracker } from "../errorResponseService.js";
import { createErrorHandler } from "../../../middleware/errorHandler.js";

// The error response route handlers send when they catch their own error: the
// masked payload, the log line, and the report to error tracking for a 5xx.
// The tracker is a stub that records what it is given; the logger is a stub
// on the request, as requestContext.js attaches the real one.

let capture;

const buildReq = (overrides = {}) => ({
  requestId: "req-1",
  method: "POST",
  originalUrl: "/api/thing",
  log: { error: vi.fn() },
  ...overrides
});

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

beforeEach(() => {
  capture = vi.fn();
  setErrorResponseTracker(capture);
});

afterEach(() => {
  setErrorResponseTracker(() => {});
});

describe("reporting to error tracking", () => {
  test("reports a 5xx with the request it came from", () => {
    const err = new Error("connection terminated unexpectedly");

    sendErrorResponse(buildReq(), buildRes(), err, 500);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(err, {
      requestId: "req-1",
      method: "POST",
      path: "/api/thing",
      status: 500
    });
  });

  test("reports a 503 too", () => {
    sendErrorResponse(buildReq(), buildRes(), new Error("store down"), 503);

    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ status: 503 })
    );
  });

  // A 4xx is the caller's mistake, not the server's, and would only be noise.
  test("does not report a 4xx", () => {
    sendErrorResponse(buildReq(), buildRes(), new Error("Not found."), 404);

    expect(capture).not.toHaveBeenCalled();
  });

  test("reports a status that is not an integer as the 500 it answers", () => {
    const res = buildRes();

    sendErrorResponse(buildReq(), res, new Error("boom"), "teapot");

    expect(res.statusCode).toBe(500);
    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ status: 500 })
    );
  });

  test("still answers when the tracker throws", () => {
    setErrorResponseTracker(() => {
      throw new Error("sentry is down too");
    });
    const res = buildRes();

    sendErrorResponse(buildReq(), res, new Error("boom"), 500);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Server error.", requestId: "req-1" });
  });

  // Before index.js sets a tracker, as in every suite that never imports it,
  // a 5xx is answered and nothing is reported.
  test("answers a 5xx when no tracker has been set", async () => {
    vi.resetModules();
    const fresh = await import("../errorResponseService.js");
    const res = buildRes();

    fresh.sendErrorResponse(buildReq(), res, new Error("boom"), 500);

    expect(res.statusCode).toBe(500);
  });

  // The route answers itself and never calls next(err), so the error
  // middleware, which reports through the same tracker, never sees it.
  test("reports a route-caught error once, with the error middleware mounted", async () => {
    const app = express();
    app.get("/boom", (req, res) => {
      sendErrorResponse(req, res, new Error("caught here"), 500);
    });
    app.use(
      createErrorHandler({
        logger: { error: vi.fn() },
        toShortText: (value) => String(value ?? ""),
        captureException: capture
      })
    );

    const response = await request(app).get("/boom");

    expect(response.status).toBe(500);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe("the response", () => {
  test("masks a 5xx message and carries the request id", () => {
    const res = buildRes();

    sendErrorResponse(buildReq(), res, new Error("relation app_users does not exist"), 500);

    expect(res.body).toEqual({ error: "Server error.", requestId: "req-1" });
  });

  test("keeps a 4xx message", () => {
    const res = buildRes();

    sendErrorResponse(buildReq(), res, new Error("Not found."), 404);

    expect(res.body.error).toBe("Not found.");
  });

  test("falls back to the generic text for a 4xx that carries none", () => {
    const res = buildRes();

    sendErrorResponse(buildReq(), res, {}, 400);

    expect(res.body.error).toBe("Server error.");
  });

  test("logs a thrown value that is not an Error as its text", () => {
    const req = buildReq();

    sendErrorResponse(req, buildRes(), "plain string failure", 500);

    expect(req.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "route_error", error: "plain string failure" }),
      expect.any(String)
    );
  });
});
