import crypto from "crypto";

const sanitizeRoutePath = (req) => {
  const routePath = req?.route?.path;
  if (typeof routePath === "string" && routePath) return routePath;
  const rawPath = req?.path || req?.originalUrl || req?.url || "";
  return String(rawPath).split("?")[0] || "/";
};

const recordLatency = (bucket, durationMs) => {
  if (!bucket || !Number.isFinite(durationMs) || durationMs < 0) return;
  bucket.count = (bucket.count || 0) + 1;
  bucket.totalMs = (bucket.totalMs || 0) + durationMs;
  bucket.maxMs = Math.max(bucket.maxMs || 0, durationMs);
  bucket.lastMs = durationMs;
};

export const createRequestContextMiddleware = ({ metrics, logger, toShortText }) =>
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
      recordLatency(metrics.requestLatencyMs, durationMs);
      const routeKey = `${String(req.method || "GET").toUpperCase()} ${sanitizeRoutePath(req)}`;
      const byRoute = metrics.routeLatencyMs || (metrics.routeLatencyMs = {});
      byRoute[routeKey] = byRoute[routeKey] || {};
      recordLatency(byRoute[routeKey], durationMs);
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
