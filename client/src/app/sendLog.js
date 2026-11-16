/**
 * Sending one workout, meal or calorie entry: the first time, from the log
 * handlers in events.js, and again from the outbox, by useOutboxReplay.
 */
// @ts-check
import { classifySendFailure } from "./classifySendFailure";

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
  // The server's answer is not typed yet (D1 phase 3 spec, decision 2).
  if (res.ok) return res.json();
  const payload = await res.json().catch(() => ({}));
  throw Object.assign(new Error(payload?.error || fallbackMessage), { status: res.status });
};

/**
 * Runs `send` and resolves to `{ data }` or `{ error }`, never rejecting. When
 * the CSRF guard refused it, it asks `ensureCsrfToken` for a fresh token and
 * runs `send` once more; that second outcome, or a token that could not be
 * fetched, is the answer. Everything either one throws is an Error: postLog's,
 * apiFetch's or fetch's, so `error` is a SendError.
 * @param {() => Promise<any>} send Resolves to the server's answer, not typed yet.
 * @param {EnsureCsrfToken} ensureCsrfToken
 * @returns {Promise<{ data?: any, error?: SendError }>}
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
