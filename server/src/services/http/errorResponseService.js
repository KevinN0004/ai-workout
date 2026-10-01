/**
 * The error response for route handlers that catch their own errors: the
 * unmasked message is logged (no stack), and the response carries a masked
 * message and the request id. Nothing here reports to error tracking.
 */
const GENERIC_SERVER_ERROR = "Server error.";

/**
 * Mirrors the masking rule in middleware/errorHandler.js for handlers that catch
 * their own errors: 5xx responses never carry the underlying message, because
 * Prisma and pg errors embed schema, constraint, and connection detail.
 * A 4xx keeps its message, and that includes an upstream API's:
 * externalDataService keeps an upstream 4xx's status, so the external routes
 * pass that API's own error text, or the service's fixed fallback, through to
 * the browser.
 */
const safeErrorMessage = (err, status = 500) => {
  if (status >= 500) return GENERIC_SERVER_ERROR;
  const message = typeof err?.message === "string" ? err.message.trim() : "";
  return message || GENERIC_SERVER_ERROR;
};

/**
 * Logs the full error server-side, then responds with the masked payload.
 * Returns the response so handlers can `return sendErrorResponse(...)`.
 */
export const sendErrorResponse = (req, res, err, status = 500) => {
  const resolvedStatus = Number.isInteger(status) ? status : 500;
  req?.log?.error(
    {
      event: "route_error",
      requestId: req?.requestId || "",
      method: req?.method,
      path: req?.originalUrl || req?.url,
      status: resolvedStatus,
      error:
        typeof err?.message === "string" ? err.message.slice(0, 300) : String(err).slice(0, 300)
    },
    "Route handler error."
  );
  return res.status(resolvedStatus).json({
    error: safeErrorMessage(err, resolvedStatus),
    requestId: req?.requestId || ""
  });
};
