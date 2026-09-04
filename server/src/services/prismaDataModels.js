import { dateOnlyToDate, toDateOnly, toIso } from "../repositories/rowValues.js";
import { getUserPk, userIdWhere } from "../repositories/userLookup.js";
import { mapProgressMetric } from "../repositories/progressMetricRepository.js";
import { mapWorkoutSession } from "../repositories/workoutSessionRepository.js";
import { mapMealLog } from "../repositories/mealLogRepository.js";

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

const mapSavedExercise = (row = {}) => ({
  id: row.legacyId || row.id,
  exerciseId: row.externalExerciseId ?? null,
  name: row.name || "",
  category: row.category || "",
  muscles: toJsonArray(row.muscles),
  equipment: toJsonArray(row.equipment),
  imageUrl: row.imageUrl || "",
  videoUrl: row.videoUrl || "",
  reason: row.reason || "",
  source: row.source || "wger",
  savedAt: toIso(row.savedAt)
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

const applyUserSet = async (prisma, userId, set = {}) => {
  const data = {};
  const goalsPatch = {};
  for (const [key, value] of Object.entries(set)) {
    if (key === "profile") data.profile = value || {};
    else if (key === "salt") data.passwordSalt = value || "";
    else if (key === "hash") data.passwordHash = value;
    else if (key === "passwordAlgo") data.passwordAlgo = value || "argon2id";
    else if (key.startsWith("dashboard.goals.")) {
      goalsPatch[key.replace("dashboard.goals.", "")] = value;
    }
  }

  if (Object.keys(goalsPatch).length) {
    const existing = await prisma.appUser.findFirst({
      where: userIdWhere(userId),
      select: { goals: true }
    });
    data.goals = { ...toJsonObject(existing?.goals), ...goalsPatch };
  }

  if (!Object.keys(data).length) return loadUserRelated(prisma, userId);
  await prisma.appUser.updateMany({
    where: userIdWhere(userId),
    data
  });
  return loadUserRelated(prisma, userId);
};

const upsertCalorieEntry = async (prisma, userId, entry) => {
  const userPk = await getUserPk(prisma, userId);
  if (!userPk) return;
  const existing = entry.id
    ? await prisma.calorieEntry.findFirst({ where: { userId: userPk, legacyId: entry.id } })
    : null;
  const data = {
    userId: userPk,
    legacyId: entry.id || null,
    calorieDate: dateOnlyToDate(entry.date),
    calories: Math.round(Number(entry.calories) || 0),
    source: entry.source || "manual"
  };
  if (existing) await prisma.calorieEntry.update({ where: { id: existing.id }, data });
  else await prisma.calorieEntry.create({ data });
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

const upsertSavedExercise = async (prisma, userId, entry) => {
  const userPk = await getUserPk(prisma, userId);
  if (!userPk) return;
  const existing = await prisma.savedExercise.findFirst({
    where: {
      userId: userPk,
      OR: [
        ...(entry.exerciseId === null ? [] : [{ externalExerciseId: entry.exerciseId }]),
        { name: { equals: entry.name, mode: "insensitive" } }
      ]
    }
  });
  const data = {
    userId: userPk,
    legacyId: entry.id || null,
    externalExerciseId: entry.exerciseId ?? null,
    name: entry.name || "",
    category: entry.category || "",
    muscles: toJsonArray(entry.muscles),
    equipment: toJsonArray(entry.equipment),
    imageUrl: entry.imageUrl || "",
    videoUrl: entry.videoUrl || "",
    reason: entry.reason || "",
    source: entry.source || "wger",
    savedAt: entry.savedAt ? new Date(entry.savedAt) : new Date()
  };
  if (existing) await prisma.savedExercise.update({ where: { id: existing.id }, data });
  else await prisma.savedExercise.create({ data });
};

const extractFirstConcatEntry = (update, path) =>
  Array.isArray(update)
    ? update?.[0]?.$set?.[path]?.$slice?.[0]?.$concatArrays?.[0]?.[0] || null
    : null;

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
    async updateOne(query = {}, update = {}) {
      await applyUserSet(prisma, query.userId, update.$set || {});
      return { acknowledged: true, modifiedCount: 1 };
    },
    async findOneAndUpdate(query = {}, update = {}) {
      const userId = query.userId;
      if (!userId) return null;

      if (update.$set) return applyUserSet(prisma, userId, update.$set);

      const caloriePush = update.$push?.["dashboard.calories"];
      if (caloriePush?.$each?.[0]) {
        await upsertCalorieEntry(prisma, userId, caloriePush.$each[0]);
        return loadUserRelated(prisma, userId);
      }

      const planPush = update.$push?.["dashboard.plans"];
      if (planPush?.$each?.[0]) {
        await upsertGeneratedPlan(prisma, userId, planPush.$each[0]);
        return loadUserRelated(prisma, userId);
      }

      const removeSavedId = update.$pull?.["dashboard.savedExercises"]?.id;
      if (removeSavedId) {
        const userPk = await getUserPk(prisma, userId);
        if (userPk) {
          await prisma.savedExercise.deleteMany({ where: { userId: userPk, legacyId: removeSavedId } });
        }
        return loadUserRelated(prisma, userId);
      }

      const savedExercise = extractFirstConcatEntry(update, "dashboard.savedExercises");
      if (savedExercise) {
        await upsertSavedExercise(prisma, userId, savedExercise);
        return loadUserRelated(prisma, userId);
      }

      return loadUserRelated(prisma, userId);
    }
  };

  return { User };
};
