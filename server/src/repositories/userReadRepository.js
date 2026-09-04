import { toDateOnly, toIso } from "./rowValues.js";
import { userIdWhere } from "./userLookup.js";
import { mapProgressMetric } from "./progressMetricRepository.js";
import { mapWorkoutSession } from "./workoutSessionRepository.js";
import { mapMealLog } from "./mealLogRepository.js";
import { mapSavedExercise } from "./savedExerciseRepository.js";
import { mapGeneratedPlan } from "./generatedPlanRepository.js";

/**
 * Loading a user together with the dashboard collections the API returns.
 *
 * Task 6 of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md, and the
 * end of that plan. This is what remained of services/prismaDataModels.js once
 * every write moved to its own repository: no Mongo operators, no fake model
 * objects, just a six-table fetch and the shape assembly the routes depend on.
 *
 * The `.toObject()` wrapper the old module applied to every returned document
 * is gone -- it existed only so Mongoose-shaped callers could call it, and
 * nothing does any more.
 */

const toJsonArray = (value) => (Array.isArray(value) ? value : []);
const toJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const lower = (value) => String(value || "").trim().toLowerCase();

const mapCalorieEntry = (row = {}) => ({
  id: row.legacyId || row.id,
  date: toDateOnly(row.calorieDate),
  calories: row.calories ?? null,
  source: row.source || "manual",
  updatedAt: toIso(row.updatedAt || row.createdAt)
});

/**
 * The per-collection limits are the caps the API actually enforces. They are
 * applied here on read rather than in storage, which is why nothing prunes
 * these tables -- see Task 5 in the plan.
 */
const COLLECTION_LIMITS = {
  workoutSessions: 500,
  calorieEntries: 1000,
  mealLogs: 800,
  progressMetrics: 400,
  generatedPlans: 200,
  savedExercises: 200
};

const mapUser = (row, related = {}) => {
  if (!row) return null;
  const workoutSessions = toJsonArray(related.workoutSessions).map(mapWorkoutSession);

  return {
    userId: row.legacyUserId || row.id,
    email: row.email,
    salt: row.passwordSalt || "",
    hash: row.passwordHash,
    passwordAlgo: row.passwordAlgo || "argon2id",
    createdAt: toIso(row.createdAt),
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

export const createUserReadRepository = ({ prisma }) => {
  const loadWithCollections = async (userId) => {
    const user = await prisma.appUser.findFirst({ where: userIdWhere(userId) });
    if (!user) return null;
    const userPk = user.id;

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
