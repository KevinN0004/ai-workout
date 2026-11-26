/**
 * The error response for route handlers that catch their own errors: the
 * unmasked message is logged (no stack), a 5xx is reported to error tracking,
 * and the response carries a masked message and the request id.
 */
import { requestLogPath } from "./requestLogPath.js";

/**
 * What the server answers a failed request with: the message, and on a 5xx the
 * request's id for the logs. The client reads it from a `!res.ok` answer, which
 * may also be no JSON at all, so both fields are optional.
 * @typedef {{ error?: string, requestId?: string }} ErrorBody
 */

const GENERIC_SERVER_ERROR = "Server error.";

// Replaced once by index.js through setErrorResponseTracker. Until then, as in
// every suite that never imports index.js, a 5xx is logged and not reported.
/** @type {import("../platform/errorTrackingService.js").ErrorTracker["captureException"]} */
let reportServerError = () => {};

/**
 * Mirrors the masking rule in middleware/errorHandler.js for handlers that catch
 * their own errors: 5xx responses never carry the underlying message, because
 * Prisma and pg errors embed schema, constraint, and connection detail.
 * A 4xx keeps its message, and that includes an upstream API's:
 * externalDataService keeps an upstream 4xx's status, so the external routes
 * pass that API's own error text, or the service's fixed fallback, through to
 * the browser.
 *
 * @param {any} err Whatever the handler caught; only its message is read.
 * @param {number} [status]
 */
const safeErrorMessage = (err, status = 500) => {
  if (status >= 500) return GENERIC_SERVER_ERROR;
  const message = typeof err?.message === "string" ? err.message.trim() : "";
  return message || GENERIC_SERVER_ERROR;
};

/**
 * Sets the function sendErrorResponse reports a 5xx through, called as
 * `capture(error, { requestId, method, path, status })`, where `path` has no
 * query string. index.js passes the same forwarder it gives the error
 * middleware, so both reach one tracker.
 *
 * @param {import("../platform/errorTrackingService.js").ErrorTracker["captureException"]} capture
 */
export const setErrorResponseTracker = (capture) => {
  reportServerError = capture;
};

/**
 * Logs the full error server-side, reports a 5xx to error tracking, then
 * responds with the masked payload. Returns the response so handlers can
 * `return sendErrorResponse(...)`. Reported once: it answers the request
 * itself and never calls `next(err)`, so the error middleware does not see it.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {any} err Whatever the handler caught; only its message is read.
 * @param {number} [status]
 */
export const sendErrorResponse = (req, res, err, status = 500) => {
  const resolvedStatus = Number.isInteger(status) ? status : 500;
  const context = {
    requestId: req?.requestId || "",
    method: req?.method,
    path: requestLogPath(req),
    status: resolvedStatus
  };
  req?.log?.error(
    {
      event: "route_error",
      ...context,
      error:
        typeof err?.message === "string" ? err.message.slice(0, 300) : String(err).slice(0, 300)
    },
    "Route handler error."
  );
  if (resolvedStatus >= 500) {
    try {
      reportServerError(err, context);
    } catch {
      // Error tracking must never break the response.
    }
  }
  return res.status(resolvedStatus).json({
    error: safeErrorMessage(err, resolvedStatus),
    requestId: context.requestId
  });
};
