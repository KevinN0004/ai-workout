import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../db/prisma.js";
import { createUserReadRepository } from "./userReadRepository.js";
import { createProgressMetricRepository } from "./progressMetricRepository.js";
import { createDashboardCollectionRepository } from "./dashboardCollectionRepository.js";
import { createSavedExerciseRepository } from "./savedExerciseRepository.js";
import { createUserRepository } from "./userRepository.js";
import { createGeneratedPlanRepository } from "./generatedPlanRepository.js";
import { createWorkoutSessionRepository } from "./workoutSessionRepository.js";
import { createMealLogRepository } from "./mealLogRepository.js";

const { findUserWithDashboard, findUserWithDashboardByEmail, createUserWithDashboard } =
  createUserReadRepository({ prisma });
const { saveWorkoutSession } = createWorkoutSessionRepository({ prisma });
const { saveMealLog, sumCaloriesForDate } = createMealLogRepository({ prisma });
const { saveProgressMetric } = createProgressMetricRepository({ prisma });
const { loadCollectionPage } = createDashboardCollectionRepository({ prisma });
const { saveExercise, removeExercise } = createSavedExerciseRepository({ prisma });
const { updateProfile, updateGoals, updatePasswordHash, saveCalorieEntry } = createUserRepository({
  prisma
});
const { saveGeneratedPlan } = createGeneratedPlanRepository({ prisma });

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

describe("userReadRepository", () => {
  test("create round-trips through findOne by userId", async () => {
    const doc = baseUserDoc({ profile: { firstName: "Ada" } });
    const created = await createUserWithDashboard(doc);

    expect(created.userId).toBe(doc.userId);
    expect(created.email).toBe(doc.email);
    expect(created.profile).toEqual({ firstName: "Ada" });
    expect(created.dashboard.workoutSessions).toEqual([]);

    const found = await findUserWithDashboard(doc.userId);
    expect(found.userId).toBe(doc.userId);
    expect(found.hash).toBe(doc.hash);
  });

  test("findOne by email is case-insensitive", async () => {
    const doc = baseUserDoc({ email: "Mixed.Case@Example.com" });
    await createUserWithDashboard(doc);

    const found = await findUserWithDashboardByEmail("mixed.case@example.com");
    expect(found).not.toBeNull();
    expect(found.email).toBe("mixed.case@example.com");
  });

  test("findOne returns null for unknown user and empty query", async () => {
    expect(await findUserWithDashboard(crypto.randomUUID())).toBeNull();
    expect(await findUserWithDashboard("")).toBeNull();
  });

  // Goals live in one JSON column, so a partial write must patch rather than
  // replace. The shim expressed this as dotted $set paths; the repository does
  // a read-merge-write. Either way this property is the one that matters.
  test("updateGoals merges instead of replacing sibling keys", async () => {
    const doc = baseUserDoc();
    await createUserWithDashboard(doc);

    await updateGoals({ userId: doc.userId, goals: { calories: 2200 } });
    await updateGoals({ userId: doc.userId, goals: { protein: 160 } });

    const updated = await findUserWithDashboard(doc.userId);
    expect(updated.dashboard.goals).toEqual({ calories: 2200, protein: 160 });
  });

  test("updateGoals treats an empty patch as a no-op", async () => {
    const doc = baseUserDoc();
    await createUserWithDashboard(doc);
    await updateGoals({ userId: doc.userId, goals: { calories: 2200 } });

    expect(await updateGoals({ userId: doc.userId, goals: {} })).toBe(true);

    const updated = await findUserWithDashboard(doc.userId);
    expect(updated.dashboard.goals).toEqual({ calories: 2200 });
  });

  test("updateProfile replaces the profile it is given", async () => {
    const doc = baseUserDoc({ profile: { firstName: "Ada" } });
    await createUserWithDashboard(doc);

    expect(await updateProfile({ userId: doc.userId, profile: { firstName: "Grace" } })).toBe(true);

    const updated = await findUserWithDashboard(doc.userId);
    expect(updated.profile).toEqual({ firstName: "Grace" });
  });

  test("saveCalorieEntry upserts by id rather than duplicating", async () => {
    const doc = baseUserDoc();
    await createUserWithDashboard(doc);

    const entry = { id: "cal-1", date: "2026-03-02", calories: 1800, source: "manual" };
    await saveCalorieEntry({ userId: doc.userId, entry });
    await saveCalorieEntry({ userId: doc.userId, entry: { ...entry, calories: 2000 } });

    const after = await findUserWithDashboard(doc.userId);
    expect(after.dashboard.calories).toHaveLength(1);
    expect(after.dashboard.calories[0].calories).toBe(2000);
  });

  test("saving a generated plan stores it and returns it newest first", async () => {
    const doc = baseUserDoc();
    await createUserWithDashboard(doc);

    await saveGeneratedPlan({ userId: doc.userId, entry: { id: "p-1", goal: "First", plan: "a" } });
    await saveGeneratedPlan({
      userId: doc.userId,
      entry: { id: "p-2", goal: "Second", plan: "b" }
    });

    const after = await findUserWithDashboard(doc.userId);
    expect(after.dashboard.plans).toHaveLength(2);
    expect(after.dashboard.plans[0].goal).toBe("Second");
  });

  // The route asks for $position: 0 and $slice: 200, but neither operator does
  // anything: rows are always inserted, ordering comes from `createdAt desc`,
  // and the 200 limit is applied when reading. Pinned because it means there is
  // no storage-side cap to preserve -- the table grows without bound by design.
  test("the 200 plan limit is applied on read, not on write", async () => {
    const doc = baseUserDoc();
    await createUserWithDashboard(doc);
    const userPk = (await prisma.appUser.findFirst({ where: { legacyUserId: doc.userId } })).id;

    await prisma.generatedPlan.createMany({
      data: Array.from({ length: 205 }, (_, index) => ({
        userId: userPk,
        legacyId: `p-${index}`,
        goal: `G${index}`,
        planText: `plan ${index}`,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index))
      }))
    });

    expect(await prisma.generatedPlan.count()).toBe(205);

    const after = await findUserWithDashboard(doc.userId);
    expect(after.dashboard.plans).toHaveLength(200);
    expect(after.dashboard.plans[0].goal).toBe("G204");
  });

  test("user writes report a miss for an unknown user", async () => {
    const userId = crypto.randomUUID();
    expect(await updateProfile({ userId, profile: {} })).toBe(false);
    expect(await updateGoals({ userId, goals: { calories: 1 } })).toBe(false);
    expect(await saveCalorieEntry({ userId, entry: { calories: 1 } })).toBe(false);
    expect(await updatePasswordHash({ userId, hash: "x" })).toBe(false);
  });

  // Saved-exercise writes moved to repositories/savedExerciseRepository.js.
  // This still spans both: the repository removes the row, and the shim's user
  // read has to stop reporting it.
  test("removing a saved exercise clears it from the user's dashboard", async () => {
    const doc = baseUserDoc();
    await createUserWithDashboard(doc);
    const userPk = (await prisma.appUser.findFirst({ where: { legacyUserId: doc.userId } })).id;
    await prisma.savedExercise.create({
      data: { userId: userPk, legacyId: "saved-1", name: "Squat" }
    });

    expect(await removeExercise({ userId: doc.userId, entryId: "saved-1" })).toBe(1);

    const after = await findUserWithDashboard(doc.userId);
    expect(after.dashboard.savedExercises).toEqual([]);
  });

  test("saving an exercise twice by name updates rather than duplicating", async () => {
    const doc = baseUserDoc();
    await createUserWithDashboard(doc);

    await saveExercise({ userId: doc.userId, entry: { name: "Squat", reason: "first" } });
    await saveExercise({ userId: doc.userId, entry: { name: "squat", reason: "second" } });

    const after = await findUserWithDashboard(doc.userId);
    expect(after.dashboard.savedExercises).toHaveLength(1);
    expect(after.dashboard.savedExercises[0].reason).toBe("second");
  });

  test("saved-exercise writes are no-ops for an unknown user", async () => {
    const userId = crypto.randomUUID();
    expect(await saveExercise({ userId, entry: { name: "Squat" } })).toBeNull();
    expect(await removeExercise({ userId, entryId: "whatever" })).toBe(0);
  });
});

describe("dashboard collection repositories", () => {
  const seedUser = async () => {
    const doc = baseUserDoc();
    await createUserWithDashboard(doc);
    return doc.userId;
  };

  const page = (collection, userId, sortField, limit = 100, offset = 0) =>
    loadCollectionPage({ collection, userId, sortField, limit, offset });

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
    expect((await page("workoutSessions", userId, "createdAt")).total).toBe(1);
  });

  test("collection page applies sort, offset and limit", async () => {
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

    const newestFirst = await page("workoutSessions", userId, "createdAt");
    expect(newestFirst.items.map((row) => row.focus)).toEqual(["C", "B", "A"]);

    const paged = await page("workoutSessions", userId, "createdAt", 1, 1);
    expect(paged.items.map((row) => row.focus)).toEqual(["B"]);
    expect(paged.total).toBe(3);
  });

  // Regression for 19cc8ac: callers hold either the UUID primary key or the
  // legacy id, so both must resolve. Items and total must agree either way.
  test("items and total agree when the row has no legacy user id", async () => {
    const row = await prisma.appUser.create({
      data: {
        legacyUserId: null,
        email: `nolegacy-${crypto.randomUUID().slice(0, 8)}@example.com`,
        passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$placeholder"
      }
    });
    await prisma.workoutSession.create({ data: { userId: row.id, focus: "Legs" } });

    const result = await page("workoutSessions", row.id, "createdAt");

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(result.total);
    expect(result.items[0].focus).toBe("Legs");
  });

  // The caller has always asked for a secondary sort on id. The shim dropped it,
  // leaving ordering among tied timestamps to Postgres; the repository honours
  // it, so paging over ties cannot repeat or skip a row.
  test("pages tied timestamps without repeating or dropping a row", async () => {
    const userId = await seedUser();
    const tied = new Date(Date.UTC(2026, 2, 2)).toISOString();
    for (let index = 0; index < 6; index += 1) {
      await saveWorkoutSession({
        userId,
        session: { id: `t-${index}`, focus: `F${index}`, date: "2026-03-02", createdAt: tied }
      });
    }

    const seen = [];
    for (let offset = 0; offset < 6; offset += 2) {
      const result = await page("workoutSessions", userId, "createdAt", 2, offset);
      seen.push(...result.items.map((row) => row.id));
    }

    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
  });

  test("rejects an unknown collection rather than querying blindly", async () => {
    await expect(page("nonsense", "whoever", "createdAt")).rejects.toThrow(
      /Unknown dashboard collection/
    );
  });

  test("meal calorie total covers one date only", async () => {
    const userId = await seedUser();
    await saveMealLog({
      userId,
      mealLog: { id: "m-1", date: "2026-03-02", name: "Oats", calories: 400 }
    });
    await saveMealLog({
      userId,
      mealLog: { id: "m-2", date: "2026-03-02", name: "Chicken", calories: 650 }
    });
    await saveMealLog({
      userId,
      mealLog: { id: "m-3", date: "2026-03-03", name: "Rice", calories: 300 }
    });

    expect(await sumCaloriesForDate({ userId, date: "2026-03-02" })).toBe(1050);
    expect(await sumCaloriesForDate({ userId, date: "2026-03-03" })).toBe(300);
    expect(await sumCaloriesForDate({ userId, date: "2026-03-04" })).toBe(0);
    expect(await sumCaloriesForDate({ userId, date: "" })).toBe(0);
  });

  // Prisma's _sum returns null when no row carries a value, which is not the
  // same as a zero total. The Mongo pipeline this replaced used $ifNull to make
  // both cases 0; the repository preserves that rather than leaking null.
  test("meal calorie total is 0, not null, when no meal carries calories", async () => {
    const userId = await seedUser();
    await saveMealLog({
      userId,
      mealLog: { id: "m-macro", date: "2026-03-05", name: "Shake", proteinG: 30 }
    });

    expect(await sumCaloriesForDate({ userId, date: "2026-03-05" })).toBe(0);
  });

  test("meal calorie total is 0 for an unknown user", async () => {
    expect(await sumCaloriesForDate({ userId: crypto.randomUUID(), date: "2026-03-05" })).toBe(0);
  });

  test("progress metrics round-trip decimal columns as numbers", async () => {
    const userId = await seedUser();
    await saveProgressMetric({
      userId,
      metric: { id: "p-1", date: "2026-03-02", weightLb: 181.5, bodyFatPct: 17.25, restingHr: 54 }
    });

    const [metric] = (await page("progressMetrics", userId, "loggedAt")).items;
    expect(metric.weightLb).toBe(181.5);
    expect(metric.bodyFatPct).toBe(17.25);
    expect(metric.restingHr).toBe(54);
  });

  test("writes are no-ops and reads are empty for an unknown user", async () => {
    const userId = crypto.randomUUID();
    expect(await saveWorkoutSession({ userId, session: { focus: "X" } })).toBeNull();

    const result = await page("workoutSessions", userId, "createdAt");
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
