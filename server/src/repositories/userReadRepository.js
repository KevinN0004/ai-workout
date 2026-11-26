/**
 * Loads users for the API: the user row alone, which every signed-in request
 * and sign-in reads (findUserRow, findUserRowByEmail), or the row with every
 * dashboard collection, each capped on read by COLLECTION_LIMITS
 * (findUserWithDashboard). Only generated plans are pruned, after each save.
 */
import { toDateOnly, toIso, toJsonArray, toJsonObject } from "./rowValues.js";
import { userIdWhere } from "./userLookup.js";
import { mapProgressMetric } from "./progressMetricRepository.js";
import { mapWorkoutSession, WORKOUT_SESSION_INCLUDE } from "./workoutSessionRepository.js";
import { mapMealLog } from "./mealLogRepository.js";
import { mapSavedExercise } from "./savedExerciseRepository.js";
import {
  GENERATED_PLAN_LIMIT,
  GENERATED_PLAN_ORDER,
  mapGeneratedPlan
} from "./generatedPlanRepository.js";

/**
 * A new account as authUserService's mapUserToDbDoc builds it for
 * createUserWithDashboard.
 * @typedef {object} NewUserDoc
 * @property {string} [userId] The legacy id; `id` is read when it is absent.
 * @property {string} [id]
 * @property {string} [email]
 * @property {string} [salt]
 * @property {string} hash
 * @property {string} [passwordAlgo]
 * @property {import("@prisma/client").Prisma.InputJsonObject} [profile]
 * @property {{ goals?: import("@prisma/client").Prisma.InputJsonObject }} [dashboard]
 */

/**
 * The relation lists mapUser reads, each loaded by loadWithCollections.
 * @typedef {object} UserRelations
 * @property {import("./workoutSessionRepository.js").WorkoutSessionRow[]} [workoutSessions]
 * @property {import("@prisma/client").CalorieEntry[]} [calorieEntries]
 * @property {import("@prisma/client").MealLog[]} [mealLogs]
 * @property {import("@prisma/client").ProgressMetric[]} [progressMetrics]
 * @property {import("@prisma/client").GeneratedPlan[]} [generatedPlans]
 * @property {import("@prisma/client").SavedExercise[]} [savedExercises]
 */

/** @param {unknown} value */
const lower = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

// Its one caller, mapUser, passes a row; the default guards a bare call.
/** @param {import("@prisma/client").CalorieEntry} [row] */
const mapCalorieEntry = (row = /** @type {import("@prisma/client").CalorieEntry} */ ({})) => ({
  id: row.legacyId || row.id,
  date: toDateOnly(row.calorieDate),
  calories: row.calories ?? null,
  source: row.source || "manual",
  updatedAt: toIso(row.updatedAt || row.createdAt)
});

/**
 * The caps the API enforces on each collection, applied here, on read. Only
 * generated plans are also pruned to their cap, after each save
 * (generatedPlanRepository.js). The paginated routes reach sessions, meals and
 * metrics past their caps, so pruning those would delete visible history.
 */
const COLLECTION_LIMITS = {
  workoutSessions: 500,
  calorieEntries: 1000,
  mealLogs: 800,
  progressMetrics: 400,
  generatedPlans: GENERATED_PLAN_LIMIT,
  savedExercises: 200
};

// The user row's own fields, as both mapUser and the row lookups return them.
// There is no `dashboard` key at all, because buildDashboard turns a missing
// dashboard into an empty one, and an empty one would pass for a real account.
/** @param {import("@prisma/client").AppUser | null} row */
const mapUserRow = (row) => {
  if (!row) return null;
  return {
    userId: row.legacyUserId || row.id,
    email: row.email,
    salt: row.passwordSalt || "",
    hash: row.passwordHash,
    passwordAlgo: row.passwordAlgo || "argon2id",
    createdAt: toIso(row.createdAt),
    // toIso(null) returns "", not null, and "" is not "never changed" -- the
    // absent/zero rule applies to timestamps too, so this is guarded before
    // toIso rather than trusting its return value.
    passwordChangedAt: row.passwordChangedAt ? toIso(row.passwordChangedAt) : null,
    profile: toJsonObject(row.profile)
  };
};

/**
 * Maps a user row and its loaded collections to the user document that
 * authUserService.mapDbDocToUser reads, or null when there is no row. It
 * carries the password hash and salt, which authUserService verifies against.
 *
 * @param {import("@prisma/client").AppUser | null} row
 * @param {UserRelations} [related]
 */
export const mapUser = (row, related = {}) => {
  if (!row) return null;
  // related holds the rows Prisma loaded with the user, or nothing.
  const workoutSessions = /** @type {NonNullable<UserRelations["workoutSessions"]>} */ (
    toJsonArray(related.workoutSessions)
  ).map(mapWorkoutSession);

  return {
    // row was checked above, so mapUserRow returns its fields, not null.
    .../** @type {NonNullable<ReturnType<typeof mapUserRow>>} */ (mapUserRow(row)),
    dashboard: {
      workouts: workoutSessions.slice(0, COLLECTION_LIMITS.workoutSessions),
      workoutSessions,
      calories: /** @type {NonNullable<UserRelations["calorieEntries"]>} */ (
        toJsonArray(related.calorieEntries)
      ).map(mapCalorieEntry),
      mealLogs: /** @type {NonNullable<UserRelations["mealLogs"]>} */ (
        toJsonArray(related.mealLogs)
      ).map(mapMealLog),
      progressMetrics: /** @type {NonNullable<UserRelations["progressMetrics"]>} */ (
        toJsonArray(related.progressMetrics)
      ).map(mapProgressMetric),
      plans: /** @type {NonNullable<UserRelations["generatedPlans"]>} */ (
        toJsonArray(related.generatedPlans)
      ).map(mapGeneratedPlan),
      savedExercises: /** @type {NonNullable<UserRelations["savedExercises"]>} */ (
        toJsonArray(related.savedExercises)
      ).map(mapSavedExercise),
      goals: toJsonObject(row.goals)
    }
  };
};

/**
 * Builds the user reads over `prisma`: the user row alone by id (either form)
 * or by email ignoring case, the user with every collection by id, each
 * returning the mapped user or null, and create, which returns the new user
 * with its collections.
 *
 * @param {{ prisma: import("@prisma/client").PrismaClient }} deps
 */
export const createUserReadRepository = ({ prisma }) => {
  /**
   * One user and every collection, or null only when no user row matches.
   * @param {unknown} userId
   */
  const loadWithCollections = async (userId) => {
    // The user row first: its primary key scopes every collection query.
    const user = await prisma.appUser.findFirst({ where: userIdWhere(userId) });
    if (!user) return null;
    const userPk = user.id;

    // Then every collection at once, newest first, each capped by
    // COLLECTION_LIMITS.
    const [
      workoutSessions,
      calorieEntries,
      mealLogs,
      progressMetrics,
      generatedPlans,
      savedExercises
    ] = await Promise.all([
      prisma.workoutSession.findMany({
        where: { userId: userPk },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: COLLECTION_LIMITS.workoutSessions,
        include: WORKOUT_SESSION_INCLUDE
      }),
      prisma.calorieEntry.findMany({
        where: { userId: userPk },
        orderBy: [{ calorieDate: "desc" }, { createdAt: "desc" }],
        take: COLLECTION_LIMITS.calorieEntries
      }),
      prisma.mealLog.findMany({
        where: { userId: userPk },
        orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
        take: COLLECTION_LIMITS.mealLogs
      }),
      prisma.progressMetric.findMany({
        where: { userId: userPk },
        orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
        take: COLLECTION_LIMITS.progressMetrics
      }),
      prisma.generatedPlan.findMany({
        where: { userId: userPk },
        orderBy: GENERATED_PLAN_ORDER,
        take: COLLECTION_LIMITS.generatedPlans
      }),
      prisma.savedExercise.findMany({
        where: { userId: userPk },
        orderBy: [{ savedAt: "desc" }, { id: "desc" }],
        take: COLLECTION_LIMITS.savedExercises
      })
    ]);

    return mapUser(user, {
      workoutSessions,
      calorieEntries,
      mealLogs,
      progressMetrics,
      generatedPlans,
      savedExercises
    });
  };

  /**
   * Accepts either the UUID primary key or the legacy id.
   * @param {unknown} userId
   */
  const findUserWithDashboard = (userId) =>
    userId ? loadWithCollections(userId) : Promise.resolve(null);

  /**
   * The user row alone, or null when no row matches. One query, whatever the
   * account holds. Accepts either the UUID primary key or the legacy id.
   *
   * @param {unknown} userId
   */
  const findUserRow = async (userId) =>
    userId ? mapUserRow(await prisma.appUser.findFirst({ where: userIdWhere(userId) })) : null;

  /**
   * The user row alone for an email, matched ignoring case, or null.
   * @param {unknown} email
   */
  const findUserRowByEmail = async (email) => {
    if (!email) return null;
    const row = await prisma.appUser.findFirst({
      where: { email: { equals: lower(email), mode: "insensitive" } }
    });
    return mapUserRow(row);
  };

  // Its one caller, authUserService's createUser, passes a document; the
  // default guards a bare call.
  /** @param {NewUserDoc} [doc] */
  const createUserWithDashboard = async (doc = /** @type {NewUserDoc} */ ({})) => {
    const row = await prisma.appUser.create({
      data: {
        legacyUserId: doc.userId || doc.id,
        email: lower(doc.email),
        passwordSalt: doc.salt || "",
        passwordHash: doc.hash,
        passwordAlgo: doc.passwordAlgo || "argon2id",
        profile: doc.profile || {},
        goals: doc.dashboard?.goals || {}
      }
    });
    return loadWithCollections(row.legacyUserId || row.id);
  };

  return {
    findUserWithDashboard,
    findUserRow,
    findUserRowByEmail,
    createUserWithDashboard
  };
};
