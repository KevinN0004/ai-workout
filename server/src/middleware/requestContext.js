/**
 * Per-request context: a request id, a logger that carries it, and the latency
 * metrics recorded when the response finishes. index.js mounts it first, so
 * every later middleware and route can use `req.requestId` and `req.log`.
 */
import crypto from "crypto";
import { recordLatencyStats } from "../services/platform/metricsService.js";

const UNMATCHED_ROUTE_LABEL = "<unmatched>";

// Only paths Express actually matched become metric keys. Express collapses
// params (`/api/wger/exercises/:id`), so that set is bounded by the declared
// routes. Anything answered before routing -- 404s, CSRF and rate-limit
// rejections -- carries a caller-supplied path, and keying on it would let an
// unauthenticated client grow routeLatencyMs without bound.
const sanitizeRoutePath = (req) => {
  const routePath = req?.route?.path;
  if (typeof routePath === "string" && routePath) return routePath;
  return UNMATCHED_ROUTE_LABEL;
};

/**
 * Builds the middleware. It reuses the caller's `X-Request-Id` (cut to 128
 * characters) or mints a UUID, echoes the id on the response, and counts the
 * request in `metrics.requestsTotal`. When the response finishes it records the
 * latency overall and per matched route, and logs one `http_request` line.
 */
export const createRequestContextMiddleware =
  ({ metrics, logger, toShortText }) =>
  (req, res, next) => {
    const incomingId = toShortText(req.headers["x-request-id"], 128);
    const requestId = incomingId || crypto.randomUUID();
    const startedAt = Date.now();
    req.requestId = requestId;
    req.log = logger.child({ requestId });
    res.setHeader("X-Request-Id", requestId);
    metrics.requestsTotal += 1;
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      recordLatencyStats(metrics.requestLatencyMs, durationMs);
      const routeKey = `${String(req.method || "GET").toUpperCase()} ${sanitizeRoutePath(req)}`;
      const byRoute = metrics.routeLatencyMs || (metrics.routeLatencyMs = {});
      byRoute[routeKey] = byRoute[routeKey] || {};
      recordLatencyStats(byRoute[routeKey], durationMs);
      req.log.info({
        event: "http_request",
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs
      });
    });
    next();
  };
