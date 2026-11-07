/**
 * What becomes of a workout, meal or calorie entry whose send failed, read by
 * useOptimisticLogs and useOutboxReplay.
 */

// The message the server's CSRF guard answers a refused token with
// (server/src/services/auth/sessionService.js).
const CSRF_REFUSAL = "Invalid or missing CSRF token.";

/**
 * "queue" to keep the entry and send it later, "refresh" to fetch a fresh CSRF
 * token and send it once more, or "drop" to report it and let it go, for the
 * error a send threw (docs/specs/2026-11-06-offline-ready-pwa-design.md).
 * `error.status` is the answer's status, and absent when no answer came. A
 * 5xx, a 429 and a 401 are kept, because the body is not at fault; any other
 * 4xx is dropped, because resending the same body cannot fix it.
 */
export const classifySendFailure = (error) => {
  const status = error?.status;
  if (!status || status >= 500 || status === 429 || status === 401) return "queue";
  if (status === 403 && error.message === CSRF_REFUSAL) return "refresh";
  return "drop";
};
