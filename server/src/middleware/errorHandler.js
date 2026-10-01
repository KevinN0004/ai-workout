/**
 * The app's last-resort error middleware, mounted last in index.js. It answers
 * any error a handler throws or passes to `next(err)` instead of answering itself.
 */

/**
 * Builds the error middleware. Every error is logged, and a 5xx is also sent to
 * `captureException`; a failure there is swallowed so tracking never breaks the
 * response. A 5xx answers "Server error." whatever the error says, since that
 * text can carry database detail, while a 4xx keeps its message. An error that
 * arrives after the headers are sent goes on to Express's default handler.
 */
export const createErrorHandler =
  ({ logger, toShortText, captureException = () => {} }) =>
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
