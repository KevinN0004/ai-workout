/**
 * Prisma-native persistence for a user's Strava connection (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md): one row per user and per
 * athlete, its sync marks, and the lock that serialises a user's token refreshes.
 */
// @ts-check
import { getUserPk } from "./userLookup.js";

/**
 * @typedef {object} StravaConnectionRow
 * @property {string} userPk
 * @property {number} athleteId
 * @property {string} athleteName
 * @property {string} accessToken sealed
 * @property {string} refreshToken sealed
 * @property {Date} expiresAt
 * @property {Date} connectedAt
 * @property {Date | null} lastSyncedAt
 * @property {string | null} lastSyncError
 * @property {boolean} needsReconnect
 */

/**
 * The connection as the service reads it. The tokens stay sealed here; only the
 * service opens them, and nothing a route returns carries them.
 * @param {any} row
 * @returns {StravaConnectionRow}
 */
const mapConnection = (row) => ({
  userPk: row.userId,
  athleteId: Number(row.athleteId),
  athleteName: row.athleteName,
  accessToken: row.accessToken,
  refreshToken: row.refreshToken,
  expiresAt: row.expiresAt,
  connectedAt: row.connectedAt,
  lastSyncedAt: row.lastSyncedAt,
  lastSyncError: row.lastSyncError,
  needsReconnect: row.needsReconnect
});

/**
 * Builds the connection store over `prisma`. The connect, sync, webhook and
 * disconnect paths of services/integrations/stravaService.js call it. Every
 * function takes the user's id in either form and finds nothing for an unknown
 * user.
 * @param {{ prisma: any }} deps
 */
export const createStravaConnectionRepository = ({ prisma }) => {
  /**
   * The user's connection, or null.
   * @param {{ userId: string }} args
   */
  const findConnection = async ({ userId }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;
    const row = await prisma.stravaConnection.findUnique({ where: { userId: userPk } });
    return row ? mapConnection(row) : null;
  };

  /**
   * The connection of the Strava athlete `athleteId`, or null: how a webhook
   * event, which names only the athlete, finds its user.
   * @param {{ athleteId: number }} args
   */
  const findConnectionByAthlete = async ({ athleteId }) => {
    const row = await prisma.stravaConnection.findUnique({
      where: { athleteId: BigInt(athleteId) }
    });
    return row ? mapConnection(row) : null;
  };

  /**
   * Stores the user's connection with sealed tokens, replacing one they had and
   * keeping when they first connected. `{ conflict: true }` when the athlete is
   * linked to another account, which is then left as it was; null for an
   * unknown user.
   * @param {{ userId: string, athleteId: number, athleteName: string, accessToken: string, refreshToken: string, expiresAt: Date }} args
   */
  const saveConnection = async ({
    userId,
    athleteId,
    athleteName,
    accessToken,
    refreshToken,
    expiresAt
  }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;
    const holder = await prisma.stravaConnection.findUnique({
      where: { athleteId: BigInt(athleteId) },
      select: { userId: true }
    });
    if (holder && holder.userId !== userPk) return { conflict: true };
    const data = {
      athleteId: BigInt(athleteId),
      athleteName,
      accessToken,
      refreshToken,
      expiresAt,
      needsReconnect: false
    };
    const row = await prisma.stravaConnection.upsert({
      where: { userId: userPk },
      create: { userId: userPk, ...data },
      update: data
    });
    return mapConnection(row);
  };

  /**
   * Runs `fn(tx, connection)` in a transaction holding the user's refresh lock,
   * with the connection as it reads under the lock. Strava issues a new refresh
   * token on every refresh, so two refreshes at once would each spend the old
   * one. Null, without calling `fn`, when there is no connection. The timeout
   * covers Strava's answer, which arrives inside the transaction.
   * @template T
   * @param {{ userId: string }} args
   * @param {(tx: any, connection: StravaConnectionRow) => Promise<T>} fn
   * @returns {Promise<T | null>}
   */
  const withRefreshLock = async ({ userId }, fn) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;
    return prisma.$transaction(
      async (/** @type {any} */ tx) => {
        await tx.$queryRaw`select 1 as locked from pg_advisory_xact_lock(hashtextextended(${`strava-refresh:${userPk}`}, 0))`;
        const row = await tx.stravaConnection.findUnique({ where: { userId: userPk } });
        return row ? fn(tx, mapConnection(row)) : null;
      },
      { timeout: 15000 }
    );
  };

  /**
   * Stores refreshed tokens, sealed, inside `withRefreshLock`'s transaction, and
   * clears reconnect.
   * @param {any} tx
   * @param {{ userPk: string, accessToken: string, refreshToken: string, expiresAt: Date }} args
   */
  const updateTokens = (tx, { userPk, accessToken, refreshToken, expiresAt }) =>
    tx.stravaConnection.update({
      where: { userId: userPk },
      data: { accessToken, refreshToken, expiresAt, needsReconnect: false }
    });

  // Updates the user's connection row; the count of rows changed, 0 when there
  // is none.
  /** @param {string} userId @param {Record<string, unknown>} data */
  const mark = async (userId, data) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return 0;
    const { count } = await prisma.stravaConnection.updateMany({
      where: { userId: userPk },
      data
    });
    return count;
  };

  /**
   * Records a finished sync at `at`, clearing the last error.
   * @param {{ userId: string, at: Date }} args
   */
  const markSynced = ({ userId, at }) => mark(userId, { lastSyncedAt: at, lastSyncError: null });

  /**
   * Records why a sync stopped, keeping when the last one finished.
   * @param {{ userId: string, error: string }} args
   */
  const markSyncFailed = ({ userId, error }) => mark(userId, { lastSyncError: error });

  /**
   * Stops syncing until the user connects again: Strava refused a refresh, or a
   * token would not open.
   * @param {{ userId: string }} args
   */
  const markNeedsReconnect = ({ userId }) => mark(userId, { needsReconnect: true });

  /**
   * Removes the connection, every workout imported from Strava and the deleted
   * list, in one transaction: a disconnect, which Strava's terms require to
   * delete what came from it. Workouts logged in the app stay.
   * @param {{ userId: string }} args
   */
  const removeConnectionAndImports = async ({ userId }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return { removed: 0 };
    const [imports] = await prisma.$transaction([
      prisma.workoutSession.deleteMany({ where: { userId: userPk, source: "strava" } }),
      prisma.stravaDeletedActivity.deleteMany({ where: { userId: userPk } }),
      prisma.stravaConnection.deleteMany({ where: { userId: userPk } })
    ]);
    return { removed: imports.count };
  };

  return {
    findConnection,
    findConnectionByAthlete,
    saveConnection,
    withRefreshLock,
    updateTokens,
    markSynced,
    markSyncFailed,
    markNeedsReconnect,
    removeConnectionAndImports
  };
};
