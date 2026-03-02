import crypto from "crypto";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDatabase } from "../src/db.js";
import MealLog from "../src/models/MealLog.js";
import ProgressMetric from "../src/models/ProgressMetric.js";
import User from "../src/models/User.js";
import WorkoutSession from "../src/models/WorkoutSession.js";

dotenv.config();

const dryRun = process.argv.includes("--dry-run");
const skipCleanup = process.argv.includes("--skip-cleanup");

const toArray = (value) => (Array.isArray(value) ? value : []);
const toTrimmedString = (value, maxLen = 180) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";
const toNullableFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toId = (rawValue, prefix) => {
  const trimmed = toTrimmedString(rawValue, 64);
  if (trimmed) return trimmed;
  return `${prefix}-${crypto.randomUUID()}`.slice(0, 64);
};

const normalizeWorkoutSession = (entry = {}) => ({
  id: toId(entry.id, "ws"),
  date: toTrimmedString(entry.date, 20),
  focus: toTrimmedString(entry.focus, 80),
  duration: toNullableFiniteNumber(entry.duration),
  exercises: toArray(entry.exercises)
    .map((item) => toTrimmedString(item, 140))
    .filter(Boolean)
    .slice(0, 32),
  sets: toNullableFiniteNumber(entry.sets),
  reps: toNullableFiniteNumber(entry.reps),
  intensityRpe: toNullableFiniteNumber(entry.intensityRpe),
  notes: toTrimmedString(entry.notes, 500),
  createdAt: toTrimmedString(entry.createdAt, 40) || new Date().toISOString()
});

const normalizeMealLog = (entry = {}) => ({
  id: toId(entry.id, "ml"),
  date: toTrimmedString(entry.date, 20),
  mealType: toTrimmedString(entry.mealType, 40),
  name: toTrimmedString(entry.name, 140),
  calories: toNullableFiniteNumber(entry.calories),
  proteinG: toNullableFiniteNumber(entry.proteinG),
  carbsG: toNullableFiniteNumber(entry.carbsG),
  fatG: toNullableFiniteNumber(entry.fatG),
  notes: toTrimmedString(entry.notes, 300),
  loggedAt: toTrimmedString(entry.loggedAt, 40) || new Date().toISOString()
});

const normalizeProgressMetric = (entry = {}) => ({
  id: toId(entry.id, "pm"),
  date: toTrimmedString(entry.date, 20),
  weightLb: toNullableFiniteNumber(entry.weightLb),
  bodyFatPct: toNullableFiniteNumber(entry.bodyFatPct),
  waistCm: toNullableFiniteNumber(entry.waistCm),
  restingHr: toNullableFiniteNumber(entry.restingHr),
  notes: toTrimmedString(entry.notes, 320),
  loggedAt: toTrimmedString(entry.loggedAt, 40) || new Date().toISOString()
});

const uniqueById = (entries = []) => {
  const map = new Map();
  for (const entry of entries) {
    map.set(entry.id, entry);
  }
  return Array.from(map.values());
};

const buildBulkOps = (userId, entries, modelType) =>
  entries.map((entry) => {
    const normalized =
      modelType === "workout"
        ? normalizeWorkoutSession(entry)
        : modelType === "meal"
        ? normalizeMealLog(entry)
        : normalizeProgressMetric(entry);
    return {
      updateOne: {
        filter: { userId, id: normalized.id },
        update: {
          $set: {
            userId,
            ...normalized
          }
        },
        upsert: true
      }
    };
  });

const migrate = async () => {
  const { mongoUri } = await connectDatabase();
  console.log(`[migrate] Connected MongoDB: ${mongoUri}`);
  console.log(
    `[migrate] Starting migration dryRun=${dryRun} skipCleanup=${skipCleanup}`
  );

  const query = {
    $or: [
      { "dashboard.workoutSessions.0": { $exists: true } },
      { "dashboard.mealLogs.0": { $exists: true } },
      { "dashboard.progressMetrics.0": { $exists: true } }
    ]
  };

  let usersProcessed = 0;
  let workoutOpsCount = 0;
  let mealOpsCount = 0;
  let metricOpsCount = 0;
  let cleanedUsers = 0;

  const cursor = User.find(query).select({ userId: 1, dashboard: 1 }).lean().cursor();

  for await (const user of cursor) {
    usersProcessed += 1;
    const userId = toTrimmedString(user?.userId, 120);
    if (!userId) continue;

    const workoutEntries = uniqueById(
      buildBulkOps(userId, toArray(user?.dashboard?.workoutSessions), "workout").map(
        (op) => op.updateOne.update.$set
      )
    );
    const mealEntries = uniqueById(
      buildBulkOps(userId, toArray(user?.dashboard?.mealLogs), "meal").map(
        (op) => op.updateOne.update.$set
      )
    );
    const metricEntries = uniqueById(
      buildBulkOps(userId, toArray(user?.dashboard?.progressMetrics), "metric").map(
        (op) => op.updateOne.update.$set
      )
    );

    const workoutOps = workoutEntries.map((entry) => ({
      updateOne: {
        filter: { userId, id: entry.id },
        update: { $set: entry },
        upsert: true
      }
    }));
    const mealOps = mealEntries.map((entry) => ({
      updateOne: {
        filter: { userId, id: entry.id },
        update: { $set: entry },
        upsert: true
      }
    }));
    const metricOps = metricEntries.map((entry) => ({
      updateOne: {
        filter: { userId, id: entry.id },
        update: { $set: entry },
        upsert: true
      }
    }));

    workoutOpsCount += workoutOps.length;
    mealOpsCount += mealOps.length;
    metricOpsCount += metricOps.length;

    if (!dryRun) {
      if (workoutOps.length) {
        await WorkoutSession.bulkWrite(workoutOps, { ordered: false });
      }
      if (mealOps.length) {
        await MealLog.bulkWrite(mealOps, { ordered: false });
      }
      if (metricOps.length) {
        await ProgressMetric.bulkWrite(metricOps, { ordered: false });
      }
      if (!skipCleanup) {
        await User.updateOne(
          { userId },
          {
            $set: {
              "dashboard.workoutSessions": [],
              "dashboard.mealLogs": [],
              "dashboard.progressMetrics": []
            }
          }
        );
        cleanedUsers += 1;
      }
    }
  }

  console.log("[migrate] Completed.");
  console.log(
    `[migrate] usersProcessed=${usersProcessed} workoutSessions=${workoutOpsCount} mealLogs=${mealOpsCount} progressMetrics=${metricOpsCount} cleanedUsers=${dryRun ? 0 : cleanedUsers}`
  );
};

migrate()
  .catch((err) => {
    console.error("[migrate] Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
  });
