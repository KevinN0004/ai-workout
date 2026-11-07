/**
 * Sending one workout, meal or calorie entry: the first time, from the log
 * handlers in events.js, and again from the outbox, by useOutboxReplay.
 */
import { classifySendFailure } from "./classifySendFailure";

/**
 * POSTs `body` as JSON to `url` through `apiFetch`, and resolves to the
 * server's answer. A refusal throws an Error with the server's `error`, or
 * `fallbackMessage`, as its message and the answer's status as `status`; a
 * request that got no answer rejects as apiFetch did, with no status.
 */
export const postLog = async (apiFetch, { url, body }, fallbackMessage) => {
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (res.ok) return res.json();
  const payload = await res.json().catch(() => ({}));
  throw Object.assign(new Error(payload?.error || fallbackMessage), { status: res.status });
};

/**
 * Runs `send` and resolves to `{ data }` or `{ error }`, never rejecting. When
 * the CSRF guard refused it, it asks `ensureCsrfToken` for a fresh token and
 * runs `send` once more; that second outcome, or a token that could not be
 * fetched, is the answer.
 */
export const sendLog = async (send, ensureCsrfToken) => {
  try {
    return { data: await send() };
  } catch (error) {
    if (classifySendFailure(error) !== "refresh") return { error };
  }
  try {
    await ensureCsrfToken({ refresh: true });
    return { data: await send() };
  } catch (error) {
    return { error };
  }
};
