/**
 * Sending one workout, meal or calorie entry: the first time, from the log
 * handlers in events.js, and again from the outbox, by useOutboxReplay.
 */
import { classifySendFailure } from "./classifySendFailure";

/** @typedef {import("../../../server/src/services/http/errorResponseService.js").ErrorBody} ErrorBody */
/**
 * @template T
 * @typedef {import("./network.js").Wire<T>} Wire
 */

/**
 * What the three logs postLog sends answer with: the dashboard, and the
 * workout, calorie entry or meal as saved.
 * @typedef {import("../../../server/src/routes/dashboard/write/registerWorkoutAndGoalRoutes.js").WorkoutSessionSavedResponse | import("../../../server/src/routes/dashboard/write/registerWorkoutAndGoalRoutes.js").CaloriesSavedResponse | import("../../../server/src/routes/dashboard/write/registerMealAndMetricRoutes.js").MealLogSavedResponse} LogSavedResponse
 */

/**
 * What a send throws: an Error, with the answer's `status` when one came.
 * @typedef {Error & { status?: number }} SendError
 */

/**
 * useApiClient's `ensureCsrfToken`: the token, fetched fresh with `refresh`.
 * @typedef {(options?: { refresh?: boolean }) => Promise<string>} EnsureCsrfToken
 */

/**
 * POSTs `body` as JSON to `url` through `apiFetch`, and resolves to the
 * server's answer. A refusal throws an Error with the server's `error`, or
 * `fallbackMessage`, as its message and the answer's status as `status`; a
 * request that got no answer rejects as apiFetch did, with no status.
 * @param {import("./network.js").ApiFetch} apiFetch
 * @param {{ url: string, body: unknown }} request
 * @param {string} fallbackMessage
 */
export const postLog = async (apiFetch, { url, body }, fallbackMessage) => {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (res.ok) return /** @type {Promise<Wire<LogSavedResponse>>} */ (res.json());
  const payload = /** @type {ErrorBody} */ (await res.json().catch(() => ({})));
  throw Object.assign(new Error(payload?.error || fallbackMessage), { status: res.status });
};

/**
 * Runs `send` and resolves to `{ data }` or `{ error }`, never rejecting. When
 * the CSRF guard refused it, it asks `ensureCsrfToken` for a fresh token and
 * runs `send` once more; that second outcome, or a token that could not be
 * fetched, is the answer. Everything either one throws is an Error: postLog's,
 * apiFetch's or fetch's, so `error` is a SendError.
 * @param {() => Promise<Wire<LogSavedResponse>>} send Resolves to the server's answer, postLog's.
 * @param {EnsureCsrfToken} ensureCsrfToken
 * @returns {Promise<{ data: Wire<LogSavedResponse>, error?: undefined } | { data?: undefined, error: SendError }>}
 */
export const sendLog = async (send, ensureCsrfToken) => {
  try {
    return { data: await send() };
  } catch (error) {
    if (classifySendFailure(/** @type {SendError} */ (error)) !== "refresh") {
      return { error: /** @type {SendError} */ (error) };
    }
  }
  try {
    await ensureCsrfToken({ refresh: true });
    return { data: await send() };
  } catch (error) {
    return { error: /** @type {SendError} */ (error) };
  }
};
