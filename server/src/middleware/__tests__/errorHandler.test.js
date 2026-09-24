import { beforeEach, describe, expect, test, vi } from "vitest";
import { createErrorHandler } from "../errorHandler.js";

// The last thing between a thrown error and the client. It was at 15%
// statements and 0% branch coverage, which the adjacency scan had not shown.
// Its job is small and load-bearing: decide a status, report the error once,
// and mask 5xx detail so Prisma and pg internals do not reach a caller.
//
// toShortText is defined inside index.js and not exported. Importing index.js
// here would drag in the whole app bootstrap for a pure function, and widening
// a production export to make a test possible is the wrong trade. It is stubbed
// instead, and the tests assert the middleware calls it with the cap it relies
// on rather than asserting on the stub's own output.

let logger;
let toShortText;
let captureException;

const build = (overrides = {}) =>
  createErrorHandler({ logger, toShortText, captureException, ...overrides });

const buildRes = ({ headersSent = false } = {}) => {
  const res = {
    headersSent,
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

const buildReq = (overrides = {}) => ({
  requestId: "req-1",
  method: "POST",
  originalUrl: "/api/dashboard/workout-sessions",
  ...overrides
});

const errorWith = (message, status) => {
  const err = new Error(message);
  if (status !== undefined) err.status = status;
  return err;
};

// Runs the middleware and hands back everything worth asserting on.
const handle = (err, { req = buildReq(), res = buildRes(), handler = build() } = {}) => {
  const next = vi.fn();
  handler(err, req, res, next);
  return { req, res, next };
};

const logEntry = () => logger.error.mock.calls[0][0];

beforeEach(() => {
  logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  toShortText = vi.fn((value, maxLen = 160) =>
    typeof value === "string" ? value.trim().slice(0, maxLen) : ""
  );
  captureException = vi.fn();
});

describe("createErrorHandler", () => {
  // The reason this middleware exists. A Prisma or pg error message carries
  // schema, constraint and connection detail, and a 5xx must never repeat it.
  describe("masking a server error", () => {
    const leaky =
      "Invalid `prisma.appUser.findFirst()`: postgresql://admin:hunter2@10.0.0.4:5432/prod is unreachable";

    test("answers a generic message rather than the underlying one", () => {
      const { res } = handle(errorWith(leaky, 500));

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe("Server error.");
    });

    test("leaks no part of the underlying message", () => {
      const { res } = handle(errorWith(leaky, 500));

      expect(JSON.stringify(res.body)).not.toMatch(/hunter2|postgresql:|appUser|10\.0\.0\.4/);
    });

    test.each([500, 502, 503, 599])("masks a %i", (status) => {
      const { res } = handle(errorWith(leaky, status));

      expect(res.statusCode).toBe(status);
      expect(res.body.error).toBe("Server error.");
    });

    // The message is still recorded server-side; masking is about the response.
    test("still logs the real message for an operator", () => {
      handle(errorWith(leaky, 500));

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logEntry().error).toContain("hunter2");
    });
  });

  // 4xx messages are curated by the routes that raise them, so they pass
  // through -- that is what makes a validation error useful to a caller.
  describe("passing through a client error", () => {
    test.each([400, 401, 403, 404, 409, 429, 499])("passes a %i message through", (status) => {
      const { res } = handle(errorWith("Valid latitude and longitude are required.", status));

      expect(res.statusCode).toBe(status);
      expect(res.body.error).toBe("Valid latitude and longitude are required.");
    });

    // 499 above and 500 here sit either side of the only boundary that matters.
    test("treats 500 as the first masked status", () => {
      expect(handle(errorWith("detail", 499)).res.body.error).toBe("detail");
      expect(handle(errorWith("detail", 500)).res.body.error).toBe("Server error.");
    });
  });

  describe("choosing a status", () => {
    // An error thrown by application code carries no status, and defaulting
    // anywhere below 500 would publish its message.
    test.each([
      ["absent", undefined],
      ["not a number", "500"],
      ["fractional", 500.5],
      ["null", null]
    ])("defaults to a masked 500 when the status is %s", (_label, status) => {
      const err = new Error("connection terminated unexpectedly");
      err.status = status;

      const { res } = handle(err);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe("Server error.");
    });

    test("uses an integer status as given", () => {
      expect(handle(errorWith("nope", 418)).res.statusCode).toBe(418);
    });
  });

  describe("error tracking", () => {
    test("reports a server error with the request context", () => {
      const err = errorWith("boom", 503);
      handle(err, { req: buildReq({ requestId: "req-9", method: "GET", originalUrl: "/api/x" }) });

      expect(captureException).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledWith(err, {
        requestId: "req-9",
        method: "GET",
        path: "/api/x",
        status: 503
      });
    });

    // A 4xx is the caller's mistake, not an incident.
    test("does not report a client error", () => {
      handle(errorWith("bad request", 400));

      expect(captureException).not.toHaveBeenCalled();
    });

    // Sentry being down must not turn one failed request into two.
    test("still answers when the tracker throws", () => {
      const handler = build({
        captureException: () => {
          throw new Error("sentry unreachable");
        }
      });

      const { res } = handle(errorWith("boom", 500), { handler });

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe("Server error.");
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    test("works when no tracker was supplied at all", () => {
      const handler = createErrorHandler({ logger, toShortText });

      const { res } = handle(errorWith("boom", 500), { handler });

      expect(res.statusCode).toBe(500);
    });
  });

  describe("logging", () => {
    test("records the request context once", () => {
      handle(errorWith("boom", 500));

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logEntry()).toMatchObject({
        event: "unhandled_error",
        requestId: "req-1",
        method: "POST",
        path: "/api/dashboard/workout-sessions",
        status: 500
      });
    });

    // The cap is the point: an unbounded upstream message in a log line is how
    // a log pipeline gets flooded by one bad request.
    test("caps the logged message at 300 characters", () => {
      handle(errorWith("x".repeat(5000), 500));

      expect(toShortText).toHaveBeenCalledWith("x".repeat(5000), 300);
    });

    test("falls back to a message when the error has none", () => {
      handle({ status: 500 });

      expect(toShortText).toHaveBeenCalledWith("Server error.", 300);
    });

    test("prefers originalUrl but falls back to url", () => {
      handle(errorWith("boom", 500), {
        req: { requestId: "r", method: "GET", url: "/fallback" }
      });

      expect(logEntry().path).toBe("/fallback");
    });
  });

  describe("requestId", () => {
    test("echoes it back so a user can quote it in a report", () => {
      expect(handle(errorWith("boom", 500)).res.body.requestId).toBe("req-1");
    });

    test("sends an empty string rather than undefined when there is none", () => {
      const { res } = handle(errorWith("boom", 500), { req: { method: "GET", url: "/x" } });

      expect(res.body.requestId).toBe("");
    });
  });

  // Express cannot write a second set of headers. Once the response has begun,
  // the only correct move is to hand back to Express and let it destroy the
  // connection -- writing again would throw inside the error handler itself.
  describe("when the response has already started", () => {
    test("delegates to next instead of answering", () => {
      const err = errorWith("boom", 500);
      const res = buildRes({ headersSent: true });

      const { next } = handle(err, { res });

      expect(next).toHaveBeenCalledWith(err);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    // The report still has to happen; that is the half that is still possible.
    test("still logs and reports first", () => {
      handle(errorWith("boom", 500), { res: buildRes({ headersSent: true }) });

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledTimes(1);
    });
  });

  describe("a request object that is barely there", () => {
    test("survives an undefined request", () => {
      const res = buildRes();

      expect(() => build()(errorWith("boom", 500), undefined, res, vi.fn())).not.toThrow();
      expect(res.statusCode).toBe(500);
      expect(res.body.requestId).toBe("");
    });
  });
});
