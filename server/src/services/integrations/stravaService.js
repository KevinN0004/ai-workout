/**
 * Joins the Strava client to the connection and import stores (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md): a usable access token,
 * refreshed under the user's lock, and importing or removing one activity.
 */
// @ts-check
import { StravaError, createStravaClient } from "../external/stravaClient.js";
import { readEvent } from "./stravaEvent.js";
import { decideImport, deletionsFrom } from "./stravaImport.js";
import { toWorkout } from "./stravaMapping.js";
import { TokenCipherError, createTokenCipher } from "./tokenCipher.js";

// A token this close to its expiry is refreshed before use.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// The catch-up: how often it may run, how far back it reads, how much of the
// list it reads (pages of 100, at most 3), and how much of its window's start
// it leaves to the webhook when removing what Strava no longer lists.
const DAY_MS = 24 * 60 * 60 * 1000;
const SYNC_GAP_MS = 15 * 60 * 1000;
const MANUAL_SYNC_GAP_MS = 60 * 1000;
const SYNC_DAYS = 7;
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const DELETE_MARGIN_DAYS = 2;

/**
 * Builds the Strava service. `getConfig` (readStravaConfig over process.env, in
 * index.js) is read on every call, so a server whose settings are cleared stops
 * at once. `fetchImpl` and `now` are the boundaries tests stub.
 * @typedef {ReturnType<typeof import("./stravaConfig.js").readStravaConfig>} StravaConfig
 * @param {{ connections: any, imports: any, getConfig: () => StravaConfig, fetchImpl?: typeof fetch, now: () => Date }} deps
 */
export const createStravaService = ({
  connections,
  imports,
  getConfig,
  fetchImpl = fetch,
  now
}) => {
  // When each user's catch-up last began, in this process: a failed attempt
  // records no sync, and still holds the next one off.
  /** @type {Map<string, Date>} */
  const lastAttempts = new Map();

  // The cipher and the client over the current settings, or not_configured.
  const tools = () => {
    const config = getConfig();
    if (!config) throw new StravaError("not_configured");
    return {
      cipher: createTokenCipher(config.key),
      client: createStravaClient({ config, fetchImpl })
    };
  };

  /** @param {{ expiresAt: Date }} row */
  const isDue = (row) => row.expiresAt.getTime() - now().getTime() <= REFRESH_MARGIN_MS;

  /**
   * The token `sealed` holds, or null for one that will not open.
   * @param {{ open: (sealed: string) => string }} cipher
   * @param {string} sealed
   */
  const openOrNull = (cipher, sealed) => {
    try {
      return cipher.open(sealed);
    } catch {
      return null;
    }
  };

  /**
   * Refreshes the user's tokens under their lock, storing the new pair sealed.
   * `{ token }`; `{ refused: true }` when Strava refuses the refresh token;
   * `{ unreadable: true }` when a stored token will not open; null without a
   * connection. Unless `force`, a token another request refreshed while this
   * one waited is used as it is.
   * @param {string} userId
   * @param {boolean} force
   * @returns {Promise<{ token: string } | { refused: true } | { unreadable: true } | null>}
   */
  const refreshLocked = (userId, force) => {
    const { cipher, client } = tools();
    /** @type {(tx: any, row: any) => Promise<{ token: string } | { refused: true } | { unreadable: true }>} */
    const underLock = async (tx, row) => {
      if (!force && !isDue(row)) {
        const token = openOrNull(cipher, row.accessToken);
        return token === null ? { unreadable: true } : { token };
      }
      const refreshToken = openOrNull(cipher, row.refreshToken);
      if (refreshToken === null) return { unreadable: true };
      try {
        const fresh = await client.refresh(refreshToken);
        await connections.updateTokens(tx, {
          userPk: row.userPk,
          accessToken: cipher.seal(fresh.accessToken),
          refreshToken: cipher.seal(fresh.refreshToken),
          expiresAt: fresh.expiresAt
        });
        return { token: fresh.accessToken };
      } catch (error) {
        if (error instanceof StravaError && error.kind === "unauthorized") return { refused: true };
        throw error;
      }
    };
    return connections.withRefreshLock({ userId }, underLock);
  };

  /**
   * An access token for the user's Strava account, refreshed first when it is
   * due. A refused refresh, or a token that will not open, marks the connection
   * for reconnecting and throws `reconnect`; nothing is deleted on that alone.
   * @param {string} userId
   * @returns {Promise<string>}
   */
  const accessTokenFor = async (userId) => {
    const { cipher } = tools();
    const current = await connections.findConnection({ userId });
    if (!current) throw new StravaError("not_connected");
    if (current.needsReconnect) throw new StravaError("reconnect");
    /** @type {{ token: string } | { refused: true } | { unreadable: true } | null} */
    let result;
    if (isDue(current)) {
      result = await refreshLocked(userId, false);
    } else {
      const token = openOrNull(cipher, current.accessToken);
      result = token === null ? { unreadable: true } : { token };
    }
    if (!result) throw new StravaError("not_connected");
    if ("token" in result) return result.token;
    await connections.markNeedsReconnect({ userId });
    throw new StravaError("reconnect");
  };

  /**
   * Whether Strava has revoked the app's access: true only when Strava refuses
   * a forced refresh, whatever the token's expiry or reconnect mark. A token
   * here that will not open is this server's fault, not proof, so it answers
   * false, as does a refresh that works, whose new tokens are kept.
   * @param {string} userId
   */
  const confirmRevoked = async (userId) => {
    const result = await refreshLocked(userId, true);
    return Boolean(result && "refused" in result);
  };

  /**
   * Imports or updates `workout` unless the import rules skip it, for the
   * webhook and the catch-up alike. `{ decision, saved }`: the rule's decision,
   * and what the save did ("created", "updated" or "unchanged"), or null when
   * nothing was saved.
   * @param {string} userId
   * @param {ReturnType<typeof toWorkout>} workout
   */
  const importWorkout = async (userId, workout) => {
    const { externalId } = workout;
    const [deletedHere, existing, appWorkoutThatDay] = await Promise.all([
      imports.isDeletedHere({ userId, externalId }),
      imports.hasImport({ userId, externalId }),
      workout.workoutDate
        ? imports.hasAppWorkoutOn({ userId, date: workout.workoutDate })
        : Promise.resolve(false)
    ]);
    const decision = decideImport({ workout, deletedHere, appWorkoutThatDay, existing });
    const saved =
      decision === "create" || decision === "update"
        ? await imports.saveImport({ userId, workout })
        : null;
    return { decision, saved };
  };

  /**
   * Fetches the activity `activityId`, and imports or updates it unless the
   * import rules skip it. Returns the rule's decision.
   * @param {string} userId
   * @param {string | number} activityId
   */
  const importActivity = async (userId, activityId) => {
    const token = await accessTokenFor(userId);
    const activity = await tools().client.getActivity(token, String(activityId));
    return (await importWorkout(userId, toWorkout(activity))).decision;
  };

  /**
   * Removes the import of `activityId` when Strava answers that it no longer
   * exists. True when it was removed; any answer but not_found is passed on.
   * @param {string} userId
   * @param {string | number} activityId
   */
  const removeIfGone = async (userId, activityId) => {
    const externalId = String(activityId);
    const token = await accessTokenFor(userId);
    try {
      await tools().client.getActivity(token, externalId);
      return false;
    } catch (error) {
      // The client throws only StravaErrors, so the kind alone decides.
      if (/** @type {StravaError} */ (error).kind !== "not_found") throw error;
    }
    await imports.removeImport({ userId, externalId });
    return true;
  };

  /**
   * Strava's authorize page for this app, returning to `redirectUri` with
   * `state`.
   * @param {{ redirectUri: string, state: string }} args
   */
  const authorizeUrl = (args) => tools().client.authorizeUrl(args);

  /**
   * Trades the code from Strava's redirect for the athlete's tokens and stores
   * them sealed. "connected"; "taken" when the athlete is linked to another
   * account, whose link is left as it is (Strava's grant is the athlete's, so a
   * revoke here would cut that account off too); "failed" when the user is gone.
   * A refused exchange is passed on, so the athlete limit reads as `capacity`.
   * @param {string} userId
   * @param {string} code
   */
  const connect = async (userId, code) => {
    const { cipher, client } = tools();
    const granted = await client.exchangeCode(code);
    const saved = await connections.saveConnection({
      userId,
      athleteId: granted.athleteId,
      athleteName: granted.athleteName,
      accessToken: cipher.seal(granted.accessToken),
      refreshToken: cipher.seal(granted.refreshToken),
      expiresAt: granted.expiresAt
    });
    if (!saved) return "failed";
    return "conflict" in saved ? "taken" : "connected";
  };

  /**
   * What Settings shows: whether the server has Strava, and the user's
   * connection, without its tokens.
   * @param {string} userId
   */
  const connectionState = async (userId) => {
    const available = Boolean(getConfig());
    const row = available ? await connections.findConnection({ userId }) : null;
    return {
      available,
      connected: Boolean(row),
      athleteName: row?.athleteName ?? "",
      lastSyncedAt: row?.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
      lastSyncError: row?.lastSyncError ?? null,
      needsReconnect: row?.needsReconnect ?? false
    };
  };

  /**
   * Asks Strava to revoke the app's access to the user's account, as a best
   * effort: it never throws. Null when it was revoked or there was nothing to
   * revoke, and otherwise why not, so the caller can log it.
   * @param {string} userId
   * @returns {Promise<string | null>}
   */
  const revokeAccess = async (userId) => {
    if (!getConfig()) return null;
    const { cipher, client } = tools();
    try {
      const row = await connections.findConnection({ userId });
      if (!row) return null;
      await client.revoke(cipher.open(row.refreshToken));
      return null;
    } catch (error) {
      if (error instanceof TokenCipherError) return "unreadable";
      return String(/** @type {{ kind?: string }} */ (error).kind || "error");
    }
  };

  /**
   * Revokes access as a best effort, then removes the connection and every
   * import, which Strava's terms require once access is withdrawn.
   * @param {string} userId
   */
  const disconnect = async (userId) => {
    const revokeError = await revokeAccess(userId);
    const { removed } = await connections.removeConnectionAndImports({ userId });
    return { removed, revokeError };
  };

  /**
   * Handles one webhook event, after the 200 has gone back to Strava. Strava does
   * not sign events, so each one is only a hint, checked with Strava before
   * anything changes: an activity is fetched before it is imported, a delete
   * needs Strava's not_found, and a revoke needs Strava to refuse a refresh.
   * Answers what it did, and never throws: a failure is logged by the event's
   * types, id and the error's kind, and left to the catch-up sync.
   * @param {unknown} body
   * @param {{ warn: (fields: object, message: string) => void }} logger
   */
  const handleEvent = async (body, logger) => {
    const config = getConfig();
    const event = readEvent(body);
    if (!config || !event || event.subscriptionId !== config.subscriptionId) return "ignored";
    try {
      const connection = await connections.findConnectionByAthlete({ athleteId: event.ownerId });
      if (!connection) return "ignored";
      const userId = connection.userPk;
      if (event.deauthorized) {
        if (!(await confirmRevoked(userId))) return "kept";
        await connections.removeConnectionAndImports({ userId });
        return "disconnected";
      }
      if (event.objectType !== "activity" || !event.objectId) return "ignored";
      if (event.aspectType === "create" || event.aspectType === "update") {
        return await importActivity(userId, event.objectId);
      }
      if (event.aspectType === "delete") {
        return (await removeIfGone(userId, event.objectId)) ? "removed" : "kept";
      }
      return "ignored";
    } catch (error) {
      logger.warn(
        {
          event: "strava_event_failed",
          objectType: event.objectType,
          aspectType: event.aspectType,
          objectId: event.objectId,
          kind: String(/** @type {{ kind?: string }} */ (error).kind || "error")
        },
        "A Strava event could not be handled."
      );
      return "failed";
    }
  };

  /**
   * The catch-up (docs/specs/2026-11-12-strava-import-design.md, "Catch-up
   * sync"): lists the activities of the last seven days, never from before
   * connecting, imports or updates each under the import rules, and, only from
   * a complete list, removes the imports Strava no longer lists. At most once
   * every fifteen minutes, or a minute when `manual`, counting a failed attempt
   * too, so an outage is not asked again on every dashboard open. Answers the
   * counts, `{ skipped: true }`, or `{ error: kind }`; a failure is recorded on
   * the connection and deletes nothing.
   * @param {string} userId
   * @param {{ manual?: boolean }} [options]
   */
  const sync = async (userId, { manual = false } = {}) => {
    const at = now();
    const gap = manual ? MANUAL_SYNC_GAP_MS : SYNC_GAP_MS;
    /** @param {Date | null | undefined} time */
    const recent = (time) =>
      Boolean(time) && at.getTime() - /** @type {Date} */ (time).getTime() < gap;
    // Checked and set before the first await, so two syncs at once run one.
    if (recent(lastAttempts.get(userId))) return { skipped: true };
    lastAttempts.set(userId, at);

    const connection = await connections.findConnection({ userId });
    if (!connection) return { error: "not_connected" };
    if (recent(connection.lastSyncedAt)) return { skipped: true };
    const afterMs = Math.max(connection.connectedAt.getTime(), at.getTime() - SYNC_DAYS * DAY_MS);

    try {
      const token = await accessTokenFor(userId);
      const { client } = tools();
      /** @type {any[]} */
      const listed = [];
      let complete = false;
      for (let page = 1; page <= MAX_PAGES && !complete; page += 1) {
        const activities = await client.listActivities(token, {
          after: Math.floor(afterMs / 1000),
          page,
          perPage: PAGE_SIZE
        });
        listed.push(...activities);
        complete = activities.length < PAGE_SIZE;
      }

      const counts = { imported: 0, updated: 0, removed: 0 };
      for (const activity of listed) {
        const { saved } = await importWorkout(userId, toWorkout(activity));
        if (saved === "created") counts.imported += 1;
        if (saved === "updated") counts.updated += 1;
      }

      // Strava's window opens at a UTC instant, and an import is dated where
      // the athlete was, up to a day either side, so the first two days are
      // left to the webhook rather than risk removing what was never listed.
      const since = new Date(afterMs + DELETE_MARGIN_DAYS * DAY_MS).toISOString().slice(0, 10);
      const held = await imports.listImportsSince({ userId, since });
      const listedIds = new Set(listed.map((activity) => String(activity.id)));
      for (const externalId of deletionsFrom({ imports: held, listedIds, complete })) {
        counts.removed += await imports.removeImport({ userId, externalId });
      }

      await connections.markSynced({ userId, at });
      return { ...counts, lastSyncedAt: at.toISOString() };
    } catch (error) {
      const kind = String(/** @type {{ kind?: string }} */ (error).kind || "error");
      await connections.markSyncFailed({ userId, error: kind });
      return { error: kind };
    }
  };

  return {
    accessTokenFor,
    sync,
    handleEvent,
    confirmRevoked,
    importActivity,
    removeIfGone,
    authorizeUrl,
    connect,
    connectionState,
    revokeAccess,
    disconnect
  };
};
