export const registerSystemRoutes = (app, deps) => {
  const {
    User,
    metrics,
    serverBootAtMs,
    redisConfigured,
    redisSessionsEnabled,
    redisClient,
    redisLastErrorRef,
    mongoReadyStateToText
  } = deps;

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      requestId: req.requestId || "",
      uptimeSec: Math.round((Date.now() - serverBootAtMs) / 1000)
    });
  });

  app.get("/api/ready", (req, res) => {
    const mongoStateCode = Number(User?.db?.readyState ?? 0);
    const mongoConnected = mongoStateCode === 1;
    const redisConnected = redisSessionsEnabled() && Boolean(redisClient()?.isOpen);
    const ready = mongoConnected && (!redisConfigured() || redisConnected);
    const payload = {
      status: ready ? "ready" : "not_ready",
      requestId: req.requestId || "",
      dependencies: {
        mongodb: {
          connected: mongoConnected,
          stateCode: mongoStateCode,
          state: mongoReadyStateToText(mongoStateCode)
        },
        redis: {
          configured: redisConfigured(),
          connected: redisConnected,
          mode: redisConnected ? "redis" : "in_memory_fallback",
          lastError: redisLastErrorRef() || ""
        }
      },
      uptimeSec: Math.round((Date.now() - serverBootAtMs) / 1000)
    };
    if (ready) return res.json(payload);
    return res.status(503).json(payload);
  });

  app.get("/api/metrics", (req, res) => {
    res.json({
      requestId: req.requestId || "",
      uptimeSec: Math.round((Date.now() - serverBootAtMs) / 1000),
      requestsTotal: metrics.requestsTotal,
      authFailures: metrics.authFailures,
      rateLimited: metrics.rateLimited,
      externalCache: { ...metrics.externalCache },
      externalApiFailures: { ...metrics.externalApiFailures },
      externalApiRetries: { ...metrics.externalApiRetries }
    });
  });

  app.get("/api/csrf-token", (req, res) => {
    res.json({ csrfToken: req.csrfToken || "" });
  });
};

