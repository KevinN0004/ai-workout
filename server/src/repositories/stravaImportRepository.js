/**
 * Prisma-native persistence for workouts imported from Strava (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md): a session with source
 * 'strava', one per activity, and the list of activities deleted here.
 */
// @ts-check
import { dateOnlyToDate, toDateOnly } from "./rowValues.js";
import { getUserPk, legacyOrIdWhere } from "./userLookup.js";

/**
 * @typedef {object} ImportedWorkout
 * @property {string} externalId
 * @property {string} sport
 * @property {string} workoutDate YYYY-MM-DD
 * @property {string} focus
 * @property {number | null} durationMinutes
 * @property {string} notes
 * @property {number | null} distanceMeters
 * @property {number | null} averageHeartrate
 */

const SOURCE = "strava";

/**
 * Builds the import store over `prisma`. stravaService.js imports, updates and
 * removes through it, and the delete route deletes through it. Every function
 * finds nothing for an unknown user, and none touches a workout logged in the
 * app: each one filters on the source.
 * @param {{ prisma: any }} deps
 */
export const createStravaImportRepository = ({ prisma }) => {
  /**
   * Imports `workout`, or updates the import of the same activity in place.
   * Returns "created" or "updated", or null for an unknown user. The unique
   * index is partial, so this reads first and then writes.
   * @param {{ userId: string, workout: ImportedWorkout }} args
   */
  const saveImport = async ({ userId, workout }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;
    const { externalId, workoutDate, ...fields } = workout;
    const data = { ...fields, workoutDate: dateOnlyToDate(workoutDate) };
    const existing = await prisma.workoutSession.findFirst({
      where: { userId: userPk, source: SOURCE, externalId },
      select: { id: true }
    });
    if (existing) {
      await prisma.workoutSession.update({ where: { id: existing.id }, data });
      return "updated";
    }
    await prisma.workoutSession.create({
      data: { ...data, userId: userPk, source: SOURCE, externalId }
    });
    return "created";
  };

  /**
   * Whether the user logged a workout in the app on `date`: the duplicate rule
   * for a strength-type activity.
   * @param {{ userId: string, date: string }} args
   */
  const hasAppWorkoutOn = async ({ userId, date }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return false;
    const count = await prisma.workoutSession.count({
      where: { userId: userPk, source: null, workoutDate: dateOnlyToDate(date) }
    });
    return count > 0;
  };

  /**
   * Whether the user deleted the activity `externalId` here.
   * @param {{ userId: string, externalId: string }} args
   */
  const isDeletedHere = async ({ userId, externalId }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return false;
    const row = await prisma.stravaDeletedActivity.findUnique({
      where: { userId_externalId: { userId: userPk, externalId } },
      select: { externalId: true }
    });
    return Boolean(row);
  };

  /**
   * Whether the activity `externalId` is already imported for the user, so a
   * later save is an update the duplicate rule does not apply to.
   * @param {{ userId: string, externalId: string }} args
   */
  const hasImport = async ({ userId, externalId }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return false;
    const count = await prisma.workoutSession.count({
      where: { userId: userPk, source: SOURCE, externalId }
    });
    return count > 0;
  };

  /**
   * The user's imports dated on or after `since`, as `{ id, externalId, date }`:
   * what a complete catch-up list is compared against.
   * @param {{ userId: string, since: string }} args
   */
  const listImportsSince = async ({ userId, since }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return [];
    const rows = await prisma.workoutSession.findMany({
      where: { userId: userPk, source: SOURCE, workoutDate: { gte: dateOnlyToDate(since) } },
      select: { id: true, externalId: true, workoutDate: true },
      orderBy: { workoutDate: "asc" }
    });
    return rows.map((/** @type {any} */ row) => ({
      id: row.id,
      externalId: row.externalId,
      date: toDateOnly(row.workoutDate)
    }));
  };

  /**
   * Removes the import of `externalId`, which Strava says is gone. The count of
   * rows removed, 0 when there was none.
   * @param {{ userId: string, externalId: string }} args
   */
  const removeImport = async ({ userId, externalId }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return 0;
    const { count } = await prisma.workoutSession.deleteMany({
      where: { userId: userPk, source: SOURCE, externalId }
    });
    return count;
  };

  /**
   * Deletes the user's import `id`, as the client holds it, and remembers its
   * activity, in one transaction, so no import brings it back. False, deleting
   * nothing, for a workout logged in the app, another user's, or none.
   * @param {{ userId: string, id: string }} args
   */
  const deleteImportById = async ({ userId, id }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return false;
    const row = await prisma.workoutSession.findFirst({
      where: { AND: [legacyOrIdWhere(id, "legacyId"), { userId: userPk, source: SOURCE }] },
      select: { id: true, externalId: true }
    });
    if (!row) return false;
    await prisma.$transaction([
      prisma.workoutSession.delete({ where: { id: row.id } }),
      prisma.stravaDeletedActivity.upsert({
        where: { userId_externalId: { userId: userPk, externalId: row.externalId } },
        create: { userId: userPk, externalId: row.externalId },
        update: {}
      })
    ]);
    return true;
  };

  return {
    saveImport,
    hasAppWorkoutOn,
    isDeletedHere,
    hasImport,
    listImportsSince,
    removeImport,
    deleteImportById
  };
};
