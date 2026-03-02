import crypto from "crypto";

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
      req.log.info({
        event: "http_request",
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  };

