/**
 * Loads a user together with the dashboard collections the API returns: the
 * user row, then every collection at once, in the response shape the routes
 * depend on. Each collection is capped here, on read (COLLECTION_LIMITS);
 * nothing prunes the tables.
 */
import { toDateOnly, toIso } from "./rowValues.js";
import { userIdWhere } from "./userLookup.js";
import { mapProgressMetric } from "./progressMetricRepository.js";
import { mapWorkoutSession } from "./workoutSessionRepository.js";
import { mapMealLog } from "./mealLogRepository.js";
import { mapSavedExercise } from "./savedExerciseRepository.js";
import { mapGeneratedPlan } from "./generatedPlanRepository.js";

const toJsonArray = (value) => (Array.isArray(value) ? value : []);
const toJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
 * The caps the API enforces on each collection. They are applied here, on
 * read, rather than in storage, so nothing prunes these tables.
 */
const COLLECTION_LIMITS = {
  workoutSessions: 500,
  calorieEntries: 1000,
  mealLogs: 800,
  progressMetrics: 400,
  generatedPlans: 200,
  savedExercises: 200
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
    profile: toJsonObject(row.profile),
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
 * Builds the user readers over `prisma`: find by id (either form), find by
 * email ignoring case, and create. Each returns the mapped user, or null when
 * no user matches.
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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

  const findUserWithDashboardByEmail = async (email) => {
    if (!email) return null;
    const row = await prisma.appUser.findFirst({
      where: { email: { equals: lower(email), mode: "insensitive" } }
    });
    return row ? loadWithCollections(row.legacyUserId || row.id) : null;
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
    findUserWithDashboardByEmail,
    createUserWithDashboard
  };
};
