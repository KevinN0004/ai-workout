export const registerSystemRoutes = (app, deps) => {
  const {
    metrics,
    serverBootAtMs,
    redisConfigured,
    redisSessionsEnabled,
    redisClient,
    postgresStatusRef,
    errorTrackingConfigured,
    errorTrackingEnabled
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
    const redisConnected = redisSessionsEnabled() && Boolean(redisClient()?.isOpen);
    const postgresStatus =
      postgresStatusRef?.() || { configured: false, connected: false, lastError: "" };
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

  app.get("/api/metrics", (req, res) => {
    const cacheLookups = (metrics.externalCache?.hits || 0) + (metrics.externalCache?.misses || 0);
    const cacheHitRatio = cacheLookups > 0 ? Number(((metrics.externalCache?.hits || 0) / cacheLookups).toFixed(4)) : null;
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
