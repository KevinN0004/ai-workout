import { toDateOnly, toIso } from "../repositories/rowValues.js";
import { getUserPk, userIdWhere } from "../repositories/userLookup.js";
import { mapProgressMetric } from "../repositories/progressMetricRepository.js";
import { mapWorkoutSession } from "../repositories/workoutSessionRepository.js";
import { mapMealLog } from "../repositories/mealLogRepository.js";
import { mapSavedExercise } from "../repositories/savedExerciseRepository.js";

const toJsonArray = (value) => (Array.isArray(value) ? value : []);
const toJsonObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

const lower = (value) => String(value || "").trim().toLowerCase();
const withToObject = (doc) =>
  doc && typeof doc === "object" && typeof doc.toObject !== "function"
    ? { ...doc, toObject: () => ({ ...doc }) }
    : doc;

const mapCalorieEntry = (row = {}) => ({
  id: row.legacyId || row.id,
  date: toDateOnly(row.calorieDate),
  calories: row.calories ?? null,
  source: row.source || "manual",
  updatedAt: toIso(row.updatedAt || row.createdAt)
});

const mapGeneratedPlan = (row = {}) => ({
  id: row.legacyId || row.id,
  createdAt: toIso(row.createdAt),
  goal: row.goal || "",
  equipment: toJsonArray(row.equipment),
  duration: row.durationMinutes ?? null,
  level: row.level || "",
  injuries: row.injuries || "",
  days: row.days ?? null,
  environment: row.environment || "",
  focuses: toJsonArray(row.focuses),
  plan: row.planText || ""
});

const mapUser = (row, related = {}) => {
  if (!row) return null;
  const workoutSessions = toJsonArray(related.workoutSessions).map(mapWorkoutSession);
  const dashboard = {
    workouts: workoutSessions.slice(0, 500),
    workoutSessions,
    calories: toJsonArray(related.calorieEntries).map(mapCalorieEntry),
    mealLogs: toJsonArray(related.mealLogs).map(mapMealLog),
    progressMetrics: toJsonArray(related.progressMetrics).map(mapProgressMetric),
    plans: toJsonArray(related.generatedPlans).map(mapGeneratedPlan),
    savedExercises: toJsonArray(related.savedExercises).map(mapSavedExercise),
    goals: toJsonObject(row.goals)
  };

  return withToObject({
    userId: row.legacyUserId || row.id,
    email: row.email,
    salt: row.passwordSalt || "",
    hash: row.passwordHash,
    passwordAlgo: row.passwordAlgo || "argon2id",
    createdAt: toIso(row.createdAt),
    profile: toJsonObject(row.profile),
    dashboard
  });
};

const loadUserRelated = async (prisma, userId) => {
  const user = await prisma.appUser.findFirst({
    where: userIdWhere(userId)
  });
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
      take: 500
    }),
    prisma.calorieEntry.findMany({
      where: { userId: userPk },
      orderBy: [{ calorieDate: "desc" }, { createdAt: "desc" }],
      take: 1000
    }),
    prisma.mealLog.findMany({
      where: { userId: userPk },
      orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
      take: 800
    }),
    prisma.progressMetric.findMany({
      where: { userId: userPk },
      orderBy: [{ loggedAt: "desc" }, { id: "desc" }],
      take: 400
    }),
    prisma.generatedPlan.findMany({
      where: { userId: userPk },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200
    }),
    prisma.savedExercise.findMany({
      where: { userId: userPk },
      orderBy: [{ savedAt: "desc" }, { id: "desc" }],
      take: 200
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

const upsertGeneratedPlan = async (prisma, userId, entry) => {
  const userPk = await getUserPk(prisma, userId);
  if (!userPk) return;
  await prisma.generatedPlan.create({
    data: {
      userId: userPk,
      legacyId: entry.id || null,
      goal: entry.goal || "",
      equipment: toJsonArray(entry.equipment),
      durationMinutes: entry.duration ?? null,
      level: entry.level || "",
      injuries: entry.injuries || "",
      days: entry.days ?? null,
      environment: entry.environment || "",
      focuses: toJsonArray(entry.focuses),
      planText: entry.plan || "",
      planPayload: {}
    }
  });
};

export const createPrismaDataModels = ({ prisma }) => {
  const User = {
    async findOne(query = {}) {
      if (query.userId) return loadUserRelated(prisma, query.userId);
      if (query.email) {
        const row = await prisma.appUser.findFirst({
          where: { email: { equals: lower(query.email), mode: "insensitive" } }
        });
        return row ? loadUserRelated(prisma, row.legacyUserId || row.id) : null;
      }
      return null;
    },
    async create(doc = {}) {
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
      return loadUserRelated(prisma, row.legacyUserId || row.id);
    },
    // Only the generated-plan push remains. Profile, goals, password and
    // calorie writes moved to repositories/userRepository.js; saved exercises
    // to repositories/savedExerciseRepository.js.
    async findOneAndUpdate(query = {}, update = {}) {
      const userId = query.userId;
      if (!userId) return null;

      const planPush = update.$push?.["dashboard.plans"];
      if (planPush?.$each?.[0]) {
        await upsertGeneratedPlan(prisma, userId, planPush.$each[0]);
        return loadUserRelated(prisma, userId);
      }

      return loadUserRelated(prisma, userId);
    }
  };

  return { User };
};
