import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../prisma.js";
import { createPrismaDataModels } from "./prismaDataModels.js";
import { createProgressMetricRepository } from "../repositories/progressMetricRepository.js";
import { createWorkoutSessionRepository } from "../repositories/workoutSessionRepository.js";

const { User, WorkoutSession, MealLog, ProgressMetric } = createPrismaDataModels({ prisma });
const { saveWorkoutSession } = createWorkoutSessionRepository({ prisma });

const baseUserDoc = (overrides = {}) => ({
  userId: overrides.userId ?? crypto.randomUUID(),
  email: overrides.email ?? `shim-${crypto.randomUUID().slice(0, 8)}@example.com`,
  salt: "",
  hash: "$argon2id$v=19$m=65536,t=3,p=4$placeholder",
  passwordAlgo: "argon2id",
  ...overrides
});

beforeEach(async () => {
  await prisma.appUser.deleteMany({});
});

afterAll(async () => {
  await prisma.appUser.deleteMany({});
});

describe("prismaDataModels user shim", () => {
  test("create round-trips through findOne by userId", async () => {
    const doc = baseUserDoc({ profile: { firstName: "Ada" } });
    const created = await User.create(doc);

    expect(created.userId).toBe(doc.userId);
    expect(created.email).toBe(doc.email);
    expect(created.profile).toEqual({ firstName: "Ada" });
    expect(created.dashboard.workoutSessions).toEqual([]);

    const found = await User.findOne({ userId: doc.userId });
    expect(found.userId).toBe(doc.userId);
    expect(found.hash).toBe(doc.hash);
  });

  test("findOne by email is case-insensitive", async () => {
    const doc = baseUserDoc({ email: "Mixed.Case@Example.com" });
    await User.create(doc);

    const found = await User.findOne({ email: "mixed.case@example.com" });
    expect(found).not.toBeNull();
    expect(found.email).toBe("mixed.case@example.com");
  });

  test("findOne returns null for unknown user and empty query", async () => {
    expect(await User.findOne({ userId: crypto.randomUUID() })).toBeNull();
    expect(await User.findOne({})).toBeNull();
  });

  test("$set merges goals instead of replacing sibling keys", async () => {
    const doc = baseUserDoc();
    await User.create(doc);

    await User.findOneAndUpdate(
      { userId: doc.userId },
      { $set: { "dashboard.goals.calories": 2200 } }
    );
    const updated = await User.findOneAndUpdate(
      { userId: doc.userId },
      { $set: { "dashboard.goals.protein": 160 } }
    );

    expect(updated.dashboard.goals).toEqual({ calories: 2200, protein: 160 });
  });

  test("$push calories upserts by id rather than duplicating", async () => {
    const doc = baseUserDoc();
    await User.create(doc);

    const entry = { id: "cal-1", date: "2026-03-02", calories: 1800, source: "manual" };
    await User.findOneAndUpdate(
      { userId: doc.userId },
      { $push: { "dashboard.calories": { $each: [entry] } } }
    );
    const after = await User.findOneAndUpdate(
      { userId: doc.userId },
      { $push: { "dashboard.calories": { $each: [{ ...entry, calories: 2000 }] } } }
    );

    expect(after.dashboard.calories).toHaveLength(1);
    expect(after.dashboard.calories[0].calories).toBe(2000);
  });

  test("$pull removes a saved exercise by id", async () => {
    const doc = baseUserDoc();
    await User.create(doc);
    const userPk = (await prisma.appUser.findFirst({ where: { legacyUserId: doc.userId } })).id;
    await prisma.savedExercise.create({
      data: { userId: userPk, legacyId: "saved-1", name: "Squat" }
    });

    const after = await User.findOneAndUpdate(
      { userId: doc.userId },
      { $pull: { "dashboard.savedExercises": { id: "saved-1" } } }
    );

    expect(after.dashboard.savedExercises).toEqual([]);
  });
});

describe("prismaDataModels collection shims", () => {
  const seedUser = async () => {
    const doc = baseUserDoc();
    await User.create(doc);
    return doc.userId;
  };

  // Writes moved to the repository; the shim keeps the read side, so this now
  // spans both and still asserts the same upsert-by-legacy-id behaviour.
  test("workout save creates then updates the same legacy id", async () => {
    const userId = await seedUser();

    const created = await saveWorkoutSession({
      userId,
      session: { id: "w-1", date: "2026-03-02", focus: "Push", duration: 45, sets: 4, reps: 8 }
    });
    expect(created.focus).toBe("Push");
    expect(created.date).toBe("2026-03-02");

    const updated = await saveWorkoutSession({
      userId,
      session: { id: "w-1", date: "2026-03-02", focus: "Pull", duration: 50 }
    });
    expect(updated.focus).toBe("Pull");
    expect(await WorkoutSession.countDocuments({ userId })).toBe(1);
  });

  test("find chain applies sort, skip and limit", async () => {
    const userId = await seedUser();
    for (const [index, focus] of ["A", "B", "C"].entries()) {
      await saveWorkoutSession({
        userId,
        session: {
          id: `w-${index}`,
          focus,
          date: "2026-03-02",
          createdAt: new Date(Date.UTC(2026, 2, 2, index)).toISOString()
        }
      });
    }

    const newestFirst = await WorkoutSession.find({ userId }).sort({ createdAt: -1 }).lean();
    expect(newestFirst.map((row) => row.focus)).toEqual(["C", "B", "A"]);

    const paged = await WorkoutSession.find({ userId })
      .sort({ createdAt: -1 })
      .skip(1)
      .limit(1)
      .lean();
    expect(paged.map((row) => row.focus)).toEqual(["B"]);
  });

  test("find and countDocuments agree when the row has no legacy user id", async () => {
    const row = await prisma.appUser.create({
      data: {
        legacyUserId: null,
        email: `nolegacy-${crypto.randomUUID().slice(0, 8)}@example.com`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$placeholder"
      }
    });
    await prisma.workoutSession.create({ data: { userId: row.id, focus: "Legs" } });

    const userId = row.id;
    const total = await WorkoutSession.countDocuments({ userId });
    const items = await WorkoutSession.find({ userId }).lean();

    expect(total).toBe(1);
    expect(items).toHaveLength(total);
    expect(items[0].focus).toBe("Legs");
  });

  test("meal aggregate sums calories for a single date", async () => {
    const userId = await seedUser();
    await MealLog.findOneAndUpdate(
      { userId, id: "m-1" },
      { $set: { id: "m-1", date: "2026-03-02", name: "Oats", calories: 400 } }
    );
    await MealLog.findOneAndUpdate(
      { userId, id: "m-2" },
      { $set: { id: "m-2", date: "2026-03-02", name: "Chicken", calories: 650 } }
    );
    await MealLog.findOneAndUpdate(
      { userId, id: "m-3" },
      { $set: { id: "m-3", date: "2026-03-03", name: "Rice", calories: 300 } }
    );

    const result = await MealLog.aggregate([{ $match: { userId, date: "2026-03-02" } }]);
    expect(result).toEqual([{ calories: 1050 }]);

    expect(await MealLog.aggregate([{ $match: { userId } }])).toEqual([]);
  });

  // Writes moved to the repository; the shim keeps only the read side, so this
  // now spans both and still asserts what it always did -- that Decimal columns
  // come back as numbers rather than Prisma Decimal objects.
  test("progress metrics round-trip decimal columns as numbers", async () => {
    const userId = await seedUser();
    const { saveProgressMetric } = createProgressMetricRepository({ prisma });
    await saveProgressMetric({
      userId,
      metric: { id: "p-1", date: "2026-03-02", weightLb: 181.5, bodyFatPct: 17.25, restingHr: 54 }
    });

    const [metric] = await ProgressMetric.find({ userId }).lean();
    expect(metric.weightLb).toBe(181.5);
    expect(metric.bodyFatPct).toBe(17.25);
    expect(metric.restingHr).toBe(54);
  });

  test("collection writes are no-ops for an unknown user", async () => {
    const userId = crypto.randomUUID();
    expect(await saveWorkoutSession({ userId, session: { focus: "X" } })).toBeNull();
    expect(await WorkoutSession.countDocuments({ userId })).toBe(0);
    expect(await WorkoutSession.find({ userId }).lean()).toEqual([]);
  });
});
