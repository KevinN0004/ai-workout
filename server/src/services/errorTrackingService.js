const disabledTracker = () => ({
  enabled: false,
  configured: false,
  captureException: () => {},
  flush: async () => {}
});

const toRate = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
};

export const initErrorTracking = async ({ logger, toShortText }) => {
  const dsn = toShortText(process.env.SENTRY_DSN || "", 500);
  if (!dsn) {
    return {
      ...disabledTracker(),
      configured: false
    };
  }

  try {
    const sentryModule = await import("@sentry/node");
    const Sentry = sentryModule?.default || sentryModule;
    const tracesSampleRate = toRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0);
    Sentry.init({
      dsn,
      environment: toShortText(
        process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
        80
      ),
      release: toShortText(process.env.SENTRY_RELEASE || "", 120) || undefined,
      tracesSampleRate
    });
    logger.info(
      {
        event: "sentry_initialized",
        tracesSampleRate
      },
      "Sentry error tracking initialized."
    );

    return {
      enabled: true,
      configured: true,
      captureException: (error, context = {}) => {
        Sentry.withScope((scope) => {
          if (context?.requestId) scope.setTag("request_id", toShortText(context.requestId, 140));
          if (context?.method) scope.setTag("http_method", toShortText(context.method, 16));
          if (context?.path) scope.setTag("http_path", toShortText(context.path, 220));
          if (context?.status) scope.setTag("http_status", String(context.status));
          scope.setLevel("error");
          Sentry.captureException(error);
        });
      },
      flush: async (timeoutMs = 2000) => {
        if (typeof Sentry.flush === "function") {
          await Sentry.flush(timeoutMs);
        }
      }
    };
  } catch (err) {
    logger.warn(
      {
        event: "sentry_init_failed",
        error: toShortText(err?.message || String(err), 280)
      },
      "Sentry package unavailable or failed to initialize."
    );
    return {
      ...disabledTracker(),
      configured: true
    };
  }
};
