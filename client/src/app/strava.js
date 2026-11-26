/**
 * The Strava requests (roadmap C2, docs/specs/2026-11-12-strava-import-design.md):
 * the connection's state, the authorize link, the sync and the disconnect, over
 * App's apiFetch. Each returns what the server answers, or throws its message.
 */

const BASE = "/api/integrations/strava";
const STATE_FAILED = "Could not load your Strava connection. Try again.";
const CONNECT_FAILED = "Could not start connecting Strava. Try again.";
const SYNC_FAILED = "Could not sync with Strava. Try again.";
const DISCONNECT_FAILED = "Could not disconnect Strava. Try again.";

/** @typedef {import("./network.js").ApiFetch} ApiFetch */
/** @typedef {import("../../../server/src/services/http/errorResponseService.js").ErrorBody} ErrorBody */
/**
 * @template T
 * @typedef {import("./network.js").Wire<T>} Wire
 */
/** @typedef {import("../../../server/src/routes/integrations/registerStravaRoutes.js").StravaStateResponse} StravaStateResponse */
/** @typedef {import("../../../server/src/routes/integrations/registerStravaRoutes.js").StravaConnectResponse} StravaConnectResponse */
/** @typedef {import("../../../server/src/routes/integrations/registerStravaRoutes.js").StravaSyncResponse} StravaSyncResponse */
/** @typedef {import("../../../server/src/routes/integrations/registerStravaRoutes.js").StravaDisconnectedResponse} StravaDisconnectedResponse */

/**
 * The parsed answer, or an Error with the server's message, or `fallback` when
 * the refusal says nothing it can read. The read holds either, so it is typed
 * as the refusal; each request below casts what it returns to its route's answer.
 * @param {ApiFetch} apiFetch
 * @param {string} path
 * @param {RequestInit | undefined} options
 * @param {string} fallback
 * @returns {Promise<unknown>}
 */
const send = async (apiFetch, path, options, fallback) => {
  const response = await apiFetch(path, options);
  const data = /** @type {ErrorBody} */ (await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(data?.error || fallback);
  return data;
};

/**
 * What Settings shows: `{ available, connected, athleteName, lastSyncedAt,
 * lastSyncError, needsReconnect }`, with `available` false when the server
 * has no Strava settings.
 * @param {ApiFetch} apiFetch
 */
export const fetchStravaState = (apiFetch) =>
  /** @type {Promise<Wire<StravaStateResponse>>} */ (send(apiFetch, BASE, undefined, STATE_FAILED));

/**
 * The Strava page to send the visitor to, to grant access.
 * @param {ApiFetch} apiFetch
 */
export const startStravaConnect = async (apiFetch) =>
  /** @type {Wire<StravaConnectResponse>} */ (
    await send(apiFetch, `${BASE}/connect`, { method: "POST" }, CONNECT_FAILED)
  ).url;

/**
 * Runs the catch-up sync. It answers `{ skipped: true }` inside the throttle,
 * `{ error }` when it did not finish, and otherwise the counts `{ imported,
 * updated, removed, lastSyncedAt }`. `manual` is Sync now, which waits less.
 * @param {ApiFetch} apiFetch
 * @param {{ manual: boolean }} options
 */
export const syncStrava = (apiFetch, { manual }) =>
  /** @type {Promise<Wire<StravaSyncResponse>>} */ (
    send(
      apiFetch,
      `${BASE}/sync`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual })
      },
      SYNC_FAILED
    )
  );

/**
 * Whether a sync's answer imported, updated or removed a workout, so the
 * dashboard's copy is stale. A skipped or unfinished sync carries no counts:
 * their sum is NaN, which is not above 0.
 * @param {any} answer syncStrava's answer, any of StravaSyncResponse's shapes. It
 *   stays untyped because a shape without counts must sum to NaN, which only an
 *   untyped read allows.
 */
export const syncChangedWorkouts = (answer) =>
  answer.imported + answer.updated + answer.removed > 0;

/**
 * Disconnects Strava; the server deletes the tokens and every import.
 * @param {ApiFetch} apiFetch
 */
export const disconnectStrava = (apiFetch) =>
  /** @type {Promise<Wire<StravaDisconnectedResponse>>} */ (
    send(apiFetch, BASE, { method: "DELETE" }, DISCONNECT_FAILED)
  );

/**
 * The result Strava's return left in the query (`?strava=connected`), or ""
 * without one. The server sends the visitor to Settings with it.
 * @param {string} search
 */
export const readStravaResult = (search) => new URLSearchParams(search).get("strava") || "";
