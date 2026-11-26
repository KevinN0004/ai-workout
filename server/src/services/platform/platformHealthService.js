/**
 * The rule for what counts as an upstream outage, which index.js hands to the
 * external routes.
 */

/**
 * Whether an error status means the upstream is unavailable -- one of the 5xx
 * statuses listed here -- rather than that the request was wrong. The external
 * routes answer an outage with a fallback body instead of an error.
 *
 * @param {number} status The error's status; the routes pass 500 for an error with none.
 */
export const isUpstreamFailureStatus = (status) =>
  Number.isInteger(status) && [500, 502, 503, 504].includes(status);
