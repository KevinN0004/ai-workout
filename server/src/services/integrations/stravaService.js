/**
 * Joins the Strava client to the connection and import stores (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md): a usable access token,
 * refreshed under the user's lock, and importing or removing one activity.
 */
// @ts-check
import { StravaError, createStravaClient } from "../external/stravaClient.js";
import { decideImport } from "./stravaImport.js";
import { toWorkout } from "./stravaMapping.js";
import { createTokenCipher } from "./tokenCipher.js";

// A token this close to its expiry is refreshed before use.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

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
   * An access token for the user's Strava account, refreshed first when it is
   * due, or always with `forceRefresh`, which confirms access is still granted.
   * A refused refresh, or a token that will not open, marks the connection for
   * reconnecting and throws `reconnect`; nothing is deleted on that alone.
   * @param {string} userId
   * @param {{ forceRefresh?: boolean }} [options]
   * @returns {Promise<string>}
   */
  const accessTokenFor = async (userId, { forceRefresh = false } = {}) => {
    const { cipher, client } = tools();
    const reconnect = async () => {
      await connections.markNeedsReconnect({ userId });
      return new StravaError("reconnect");
    };
    // Opens a sealed token, or answers null for one that will not open.
    /** @param {string} sealed */
    const openOrNull = (sealed) => {
      try {
        return cipher.open(sealed);
      } catch {
        return null;
      }
    };

    const current = await connections.findConnection({ userId });
    if (!current) throw new StravaError("not_connected");
    if (current.needsReconnect) throw new StravaError("reconnect");
    if (!forceRefresh && !isDue(current)) {
      const token = openOrNull(current.accessToken);
      if (token === null) throw await reconnect();
      return token;
    }

    /** @type {(tx: any, row: any) => Promise<{ token: string | null }>} */
    const refreshUnderLock = async (tx, row) => {
      // Another request may have refreshed while this one waited for the lock.
      if (!forceRefresh && !isDue(row)) return { token: openOrNull(row.accessToken) };
      const refreshToken = openOrNull(row.refreshToken);
      if (refreshToken === null) return { token: null };
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
        if (error instanceof StravaError && error.kind === "unauthorized") return { token: null };
        throw error;
      }
    };
    const result = await connections.withRefreshLock({ userId }, refreshUnderLock);
    if (!result) throw new StravaError("not_connected");
    if (result.token === null) throw await reconnect();
    return result.token;
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
    const workout = toWorkout(activity);
    const { externalId } = workout;
    const [deletedHere, existing, appWorkoutThatDay] = await Promise.all([
      imports.isDeletedHere({ userId, externalId }),
      imports.hasImport({ userId, externalId }),
      workout.workoutDate
        ? imports.hasAppWorkoutOn({ userId, date: workout.workoutDate })
        : Promise.resolve(false)
    ]);
    const decision = decideImport({ workout, deletedHere, appWorkoutThatDay, existing });
    if (decision === "create" || decision === "update") {
      await imports.saveImport({ userId, workout });
    }
    return decision;
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

  return { accessTokenFor, importActivity, removeIfGone };
};
