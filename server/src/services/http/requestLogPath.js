/**
 * The request path that log lines and error reports record. Used by the request
 * logger, the error middleware, sendErrorResponse, the CSRF check and every
 * rate limiter's log line.
 */

/**
 * Returns the path the caller asked for (`originalUrl`, else `url`) with its
 * query string removed, or undefined when the request carries neither. The
 * weather and air-quality routes take the visitor's coordinates as query
 * parameters, so a logged query string would be a logged location.
 */
export const requestLogPath = (req) => {
  const url = req?.originalUrl || req?.url;
  return typeof url === "string" ? url.split("?", 1)[0] : undefined;
};
