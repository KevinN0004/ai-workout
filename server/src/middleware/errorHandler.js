export const createErrorHandler = ({ logger, toShortText, captureException = () => {} }) =>
  (err, req, res, next) => {
    const status = Number.isInteger(err?.status) ? err.status : 500;
    const isServerError = status >= 500;
    const message = err?.message || "Server error.";
    const requestId = req?.requestId || "";
    if (isServerError) {
      try {
        captureException(err, {
          requestId,
          method: req?.method,
          path: req?.originalUrl || req?.url,
          status
        });
      } catch {
        // Error tracking must never break request flow.
      }
    }

    logger.error(
      {
        event: "unhandled_error",
        requestId,
        method: req?.method,
        path: req?.originalUrl || req?.url,
        status,
        error: toShortText(message, 300)
      },
      "Unhandled application error."
    );

    if (res.headersSent) return next(err);
    return res.status(status).json({
      error: isServerError ? "Server error." : message,
      requestId
    });
  };
