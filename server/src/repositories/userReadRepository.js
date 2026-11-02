/**
 * Loads users for the API: the user row alone, which every signed-in request
 * and sign-in reads (findUserRow, findUserRowByEmail), or the row with every
 * dashboard collection, each capped on read by COLLECTION_LIMITS
 * (findUserWithDashboard). Only generated plans are pruned, after each save.
 */
import { toDateOnly, toIso, toJsonArray, toJsonObject } from "./rowValues.js";
import { userIdWhere } from "./userLookup.js";
import { mapProgressMetric } from "./progressMetricRepository.js";
import { mapWorkoutSession } from "./workoutSessionRepository.js";
import { mapMealLog } from "./mealLogRepository.js";
import { mapSavedExercise } from "./savedExerciseRepository.js";
import {
  GENERATED_PLAN_LIMIT,
  GENERATED_PLAN_ORDER,
  mapGeneratedPlan
} from "./generatedPlanRepository.js";

const lower = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const mapCalorieEntry = (row = {}) => ({
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
 */
export const mapUser = (row, related = {}) => {
  if (!row) return null;
  const workoutSessions = toJsonArray(related.workoutSessions).map(mapWorkoutSession);

  return {
    ...mapUserRow(row),
    dashboard: {
      workouts: workoutSessions.slice(0, COLLECTION_LIMITS.workoutSessions),
      workoutSessions,
      calories: toJsonArray(related.calorieEntries).map(mapCalorieEntry),
      mealLogs: toJsonArray(related.mealLogs).map(mapMealLog),
      progressMetrics: toJsonArray(related.progressMetrics).map(mapProgressMetric),
      plans: toJsonArray(related.generatedPlans).map(mapGeneratedPlan),
      savedExercises: toJsonArray(related.savedExercises).map(mapSavedExercise),
      goals: toJsonObject(row.goals)
    }
  };
};

/**
 * Builds the user reads over `prisma`: the user row alone by id (either form)
 * or by email ignoring case, the user with every collection by id, each
 * returning the mapped user or null, and create, which returns the new user
 * with its collections.
 */
export const createUserReadRepository = ({ prisma }) => {
  /** One user and every collection, or null only when no user row matches. */
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
        take: COLLECTION_LIMITS.workoutSessions
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

  /** Accepts either the UUID primary key or the legacy id. */
  const findUserWithDashboard = (userId) =>
    userId ? loadWithCollections(userId) : Promise.resolve(null);

  /**
   * The user row alone, or null when no row matches. One query, whatever the
   * account holds. Accepts either the UUID primary key or the legacy id.
   */
  const findUserRow = async (userId) =>
    userId ? mapUserRow(await prisma.appUser.findFirst({ where: userIdWhere(userId) })) : null;

  /** The user row alone for an email, matched ignoring case, or null. */
  const findUserRowByEmail = async (email) => {
    if (!email) return null;
    const row = await prisma.appUser.findFirst({
      where: { email: { equals: lower(email), mode: "insensitive" } }
    });
    return mapUserRow(row);
  };

  const createUserWithDashboard = async (doc = {}) => {
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
