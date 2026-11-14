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

// The parsed answer, or an Error with the server's message, or `fallback` when
// the refusal says nothing it can read.
const send = async (apiFetch, path, options, fallback) => {
  const response = await apiFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || fallback);
  return data;
};

/**
 * What Settings shows: `{ available, connected, athleteName, lastSyncedAt,
 * lastSyncError, needsReconnect }`, with `available` false when the server
 * has no Strava settings.
 */
export const fetchStravaState = (apiFetch) => send(apiFetch, BASE, undefined, STATE_FAILED);

/** The Strava page to send the visitor to, to grant access. */
export const startStravaConnect = async (apiFetch) =>
  (await send(apiFetch, `${BASE}/connect`, { method: "POST" }, CONNECT_FAILED)).url;

/**
 * Runs the catch-up sync. It answers `{ skipped: true }` inside the throttle,
 * `{ error }` when it did not finish, and otherwise the counts `{ imported,
 * updated, removed, lastSyncedAt }`. `manual` is Sync now, which waits less.
 */
export const syncStrava = (apiFetch, { manual }) =>
  send(
    apiFetch,
    `${BASE}/sync`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual })
    },
    SYNC_FAILED
  );

/** Disconnects Strava; the server deletes the tokens and every import. */
export const disconnectStrava = (apiFetch) =>
  send(apiFetch, BASE, { method: "DELETE" }, DISCONNECT_FAILED);

/**
 * The result Strava's return left in the query (`?strava=connected`), or ""
 * without one. The server sends the visitor to Settings with it.
 */
export const readStravaResult = (search) => new URLSearchParams(search).get("strava") || "";
