import crypto from "crypto";

/**
 * Constant-time comparison, so a wrong token cannot be narrowed by timing.
 * Length is compared first because timingSafeEqual throws on a mismatch, and
 * the length of a secret is not the part worth protecting.
 */
const tokenMatches = (provided, expected) => {
  const a = Buffer.from(String(provided || ""), "utf8");
  const b = Buffer.from(String(expected || ""), "utf8");
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const registerSystemRoutes = (app, deps) => {
  const {
    metrics,
    serverBootAtMs,
    redisConfigured,
    redisSessionsEnabled,
    redisClient,
    postgresStatusRef,
    errorTrackingConfigured,
    errorTrackingEnabled,
    metricsToken = "",
    isProduction = false
  } = deps;
  const toAvg = (totalMs, count) => (count > 0 ? Number((totalMs / count).toFixed(2)) : 0);
  const summarizeLatencyBucket = (bucket = {}) => ({
    count: bucket.count || 0,
    avgMs: toAvg(bucket.totalMs || 0, bucket.count || 0),
    maxMs: Number((bucket.maxMs || 0).toFixed(2)),
    lastMs: Number((bucket.lastMs || 0).toFixed(2))
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      requestId: req.requestId || "",
      uptimeSec: Math.round((Date.now() - serverBootAtMs) / 1000)
    });
  });

  app.get("/api/ready", (req, res) => {
    // isOpen stays true while the client is merely reconnecting; isReady is only
    // true when the connection can actually serve commands.
    const redisConnected = redisSessionsEnabled() && Boolean(redisClient()?.isReady);
    const postgresStatus = postgresStatusRef?.() || {
      configured: false,
      connected: false,
      lastError: ""
    };
    const postgresReady = Boolean(postgresStatus.configured && postgresStatus.connected);
    const ready = postgresReady && (!redisConfigured() || redisConnected);
    // This endpoint is unauthenticated so load balancers and uptime probes can
    // reach it. It therefore reports liveness booleans only: connection strings
    // and driver error text name internal hosts, so they stay in the logs.
    const payload = {
      status: ready ? "ready" : "not_ready",
      requestId: req.requestId || "",
      dependencies: {
        postgres: {
          configured: Boolean(postgresStatus.configured),
          connected: Boolean(postgresStatus.connected),
          healthy: postgresReady
        },
        redis: {
          configured: redisConfigured(),
          connected: redisConnected,
          mode: redisConnected ? "redis" : "in_memory_fallback"
        },
        errorTracking: {
          configured: errorTrackingConfigured(),
          enabled: errorTrackingEnabled(),
          provider: errorTrackingConfigured() ? "sentry" : "none"
        }
      },
      uptimeSec: Math.round((Date.now() - serverBootAtMs) / 1000)
    };
    if (ready) return res.json(payload);
    return res.status(503).json(payload);
  });

  // Unauthenticated, this reported authFailures, per-route latency and request
  // totals to anyone who asked -- enough for someone brute-forcing a password
  // to watch their own attempts land, and enough to map the route surface.
  //
  // Secure by default rather than opt-in: with no METRICS_TOKEN set it stays
  // open in development, where it is a debugging convenience and the process is
  // on loopback, and is refused in production, where it is exposed to the
  // internet. Getting the deployment wrong therefore closes the endpoint rather
  // than opening it.
  //
  // 404 rather than 401, so an unconfigured deployment does not advertise that
  // the endpoint exists and is merely locked.
  const metricsGuard = (req, res, next) => {
    if (metricsToken) {
      if (tokenMatches(req.get("x-metrics-token"), metricsToken)) return next();
      return res.status(404).json({ error: "Not found." });
    }
    if (isProduction) return res.status(404).json({ error: "Not found." });
    return next();
  };

  app.get("/api/metrics", metricsGuard, (req, res) => {
    const cacheLookups = (metrics.externalCache?.hits || 0) + (metrics.externalCache?.misses || 0);
    const cacheHitRatio =
      cacheLookups > 0
        ? Number(((metrics.externalCache?.hits || 0) / cacheLookups).toFixed(4))
        : null;
    const routeLatency = Object.fromEntries(
      Object.entries(metrics.routeLatencyMs || {}).map(([routeKey, bucket]) => [
        routeKey,
        summarizeLatencyBucket(bucket)
      ])
    );
    const externalApiLatency = Object.fromEntries(
      Object.entries(metrics.externalApiLatencyMs || {}).map(([serviceName, bucket]) => [
        serviceName,
        summarizeLatencyBucket(bucket)
      ])
    );

    res.json({
      requestId: req.requestId || "",
      uptimeSec: Math.round((Date.now() - serverBootAtMs) / 1000),
      requestsTotal: metrics.requestsTotal,
      rateLimited: metrics.rateLimited,
      requestLatencyMs: {
        ...summarizeLatencyBucket(metrics.requestLatencyMs),
        byRoute: routeLatency
      },
      externalCache: {
        ...metrics.externalCache,
        lookups: cacheLookups,
        hitRatio: cacheHitRatio
      },
      externalApiFailures: { ...metrics.externalApiFailures },
      externalApiRetries: { ...metrics.externalApiRetries },
      externalApiLatencyMs: externalApiLatency
    });
  });

  app.get("/api/csrf-token", (req, res) => {
    res.json({ csrfToken: req.csrfToken || "" });
  });
};
