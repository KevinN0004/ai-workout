import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../../index.js";
import { prisma } from "../../../../db/prisma.js";
import { createMealLogRepository } from "../../../../repositories/mealLogRepository.js";
import { createUserRepository } from "../../../../repositories/userRepository.js";

// Pins the profile, goals and calories writes against real Postgres.
//
// The goals merge is the one with a sharp edge. userRepository.updateGoals
// reads the stored goals and patches only the keys sent, so sending one goal
// must not erase the others. That is asserted directly.
//
// A manual calorie entry replaces the day's entry derived from meal logs, so
// the calories suite also logs meals, and races one save against the other
// through clients that pause at a barrier.

const getCsrf = async (agent) => {
  const response = await agent.get("/api/csrf-token");
  return String(response.body?.csrfToken || "");
};

const signUp = async (agent, email) => {
  const csrfToken = await getCsrf(agent);
  const response = await agent
    .post("/api/auth/signup")
    .set("X-CSRF-Token", csrfToken)
    .send({
      email,
      password: "StrongPass123!",
      profile: {
        firstName: "Nico",
        lastName: "Bell",
        age: 33,
        heightCm: 176,
        weightKg: 74,
        sex: "Male",
        activity: "Moderate"
      }
    });
  expect(response.status).toBe(200);
  return getCsrf(agent);
};

describe("remaining user write paths", () => {
  let agent;
  let csrfToken;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.appUser.deleteMany({});
    agent = request.agent(app);
    csrfToken = await signUp(agent, "user-writes@example.com");
  });

  describe("POST /api/profile", () => {
    test("updates the supplied fields and echoes the profile back", async () => {
      const response = await agent
        .post("/api/profile")
        .set("X-CSRF-Token", csrfToken)
        .send({ firstName: "Dominique", weightKg: 80 });

      expect(response.status).toBe(200);
      expect(response.body.profile).toMatchObject({ firstName: "Dominique", weightKg: 80 });

      const row = await prisma.appUser.findFirst();
      expect(row.profile.firstName).toBe("Dominique");
    });

    test("merges into the existing profile rather than replacing it", async () => {
      await agent
        .post("/api/profile")
        .set("X-CSRF-Token", csrfToken)
        .send({ firstName: "Dominique" });

      const response = await agent.get("/api/profile");
      // lastName came from signup and must survive a partial update.
      expect(response.body.profile.lastName).toBe("Bell");
      expect(response.body.profile.firstName).toBe("Dominique");
    });

    test("requires authentication", async () => {
      const anon = request.agent(app);
      const anonCsrf = await getCsrf(anon);
      const response = await anon
        .post("/api/profile")
        .set("X-CSRF-Token", anonCsrf)
        .send({ firstName: "Nobody" });

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/dashboard/goals", () => {
    test("stores the supplied goals", async () => {
      const response = await agent
        .post("/api/dashboard/goals")
        .set("X-CSRF-Token", csrfToken)
        .send({ targetWeight: 165, targetCalories: 2200, weeklyWorkouts: 4 });

      expect(response.status).toBe(200);
      expect(response.body.dashboard.goals).toMatchObject({
        targetWeight: 165,
        targetCalories: 2200,
        weeklyWorkouts: 4
      });
    });

    // The sharp edge: a partial update must patch, not replace.
    test("keeps goals not present in the request", async () => {
      await agent
        .post("/api/dashboard/goals")
        .set("X-CSRF-Token", csrfToken)
        .send({ targetWeight: 165, targetCalories: 2200, weeklyWorkouts: 4 });

      const response = await agent
        .post("/api/dashboard/goals")
        .set("X-CSRF-Token", csrfToken)
        .send({ targetWeight: 160 });

      expect(response.body.dashboard.goals).toMatchObject({
        targetWeight: 160,
        targetCalories: 2200,
        weeklyWorkouts: 4
      });
    });

    test("an empty request succeeds and changes nothing", async () => {
      await agent
        .post("/api/dashboard/goals")
        .set("X-CSRF-Token", csrfToken)
        .send({ targetWeight: 165 });

      const response = await agent
        .post("/api/dashboard/goals")
        .set("X-CSRF-Token", csrfToken)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.dashboard.goals).toMatchObject({ targetWeight: 165 });
    });

    test("rejects an out-of-range goal", async () => {
      const response = await agent
        .post("/api/dashboard/goals")
        .set("X-CSRF-Token", csrfToken)
        .send({ targetCalories: 99999 });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/dashboard/calories", () => {
    const postCalories = (body) =>
      agent.post("/api/dashboard/calories").set("X-CSRF-Token", csrfToken).send(body);
    const postMeal = (body) =>
      agent.post("/api/dashboard/meal-logs").set("X-CSRF-Token", csrfToken).send(body);

    test("stores an entry and surfaces it in the dashboard", async () => {
      const response = await agent
        .post("/api/dashboard/calories")
        .set("X-CSRF-Token", csrfToken)
        .send({ date: "2026-08-01", calories: 2100 });

      expect(response.status).toBe(200);
      const rows = await prisma.calorieEntry.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].calories).toBe(2100);
      expect(rows[0].source).toBe("manual");

      const entries = response.body.dashboard?.calories || [];
      expect(entries.some((row) => row.calories === 2100)).toBe(true);
    });

    test("each submission is a new entry", async () => {
      await agent
        .post("/api/dashboard/calories")
        .set("X-CSRF-Token", csrfToken)
        .send({ date: "2026-08-02", calories: 2000 });
      await agent
        .post("/api/dashboard/calories")
        .set("X-CSRF-Token", csrfToken)
        .send({ date: "2026-08-02", calories: 2400 });

      // The route mints a fresh uuid per submission, so both persist.
      expect(await prisma.calorieEntry.count()).toBe(2);
    });

    test("rejects a request missing date or calories", async () => {
      const noDate = await agent
        .post("/api/dashboard/calories")
        .set("X-CSRF-Token", csrfToken)
        .send({ calories: 2000 });
      const noCalories = await agent
        .post("/api/dashboard/calories")
        .set("X-CSRF-Token", csrfToken)
        .send({ date: "2026-08-03" });

      expect(noDate.status).toBe(400);
      expect(noCalories.status).toBe(400);
      expect(await prisma.calorieEntry.count()).toBe(0);
    });

    // A number the user typed outranks one derived from meals, and summing both
    // would count the day twice, which is what the dashboard's per-day totals do.
    test("a manual entry saved after a meal replaces the derived one", async () => {
      await postMeal({ date: "2026-08-05", name: "Lunch", calories: 650 });
      expect(await prisma.calorieEntry.count()).toBe(1);

      const saved = await postCalories({ date: "2026-08-05", calories: 2100 });
      expect(saved.status).toBe(200);

      const rows = await prisma.calorieEntry.findMany();
      expect(rows.map(({ source, calories }) => ({ source, calories }))).toEqual([
        { source: "manual", calories: 2100 }
      ]);
      const read = await agent.get("/api/dashboard");
      expect(read.body.dashboard.calories).toEqual([
        expect.objectContaining({ date: "2026-08-05", source: "manual", calories: 2100 })
      ]);
      expect(await prisma.mealLog.count()).toBe(1);
    });

    test("a manual entry for another day leaves the derived one", async () => {
      await postMeal({ date: "2026-08-06", name: "Lunch", calories: 650 });

      await postCalories({ date: "2026-08-07", calories: 2100 });

      const rows = await prisma.calorieEntry.findMany({ orderBy: { calorieDate: "asc" } });
      expect(rows.map(({ source, calories }) => ({ source, calories }))).toEqual([
        { source: "meal_logs", calories: 650 },
        { source: "manual", calories: 2100 }
      ]);
    });

    // saveCalorieEntry passes a caller's source through. The route always sends
    // "manual", so only a direct caller reaches this, and an entry carrying the
    // derived source is not a number the user typed.
    test("saving an entry with the derived source leaves the day's derived entry", async () => {
      await postMeal({ date: "2026-08-08", name: "Lunch", calories: 650 });
      const [user] = await prisma.appUser.findMany({ select: { id: true } });
      const { saveCalorieEntry } = createUserRepository({ prisma });

      await saveCalorieEntry({
        userId: user.id,
        entry: { id: "derived-copy", date: "2026-08-08", calories: 500, source: "meal_logs" }
      });

      const rows = await prisma.calorieEntry.findMany({ orderBy: { calories: "asc" } });
      expect(rows.map(({ legacyId, calories }) => ({ legacyId, calories }))).toEqual([
        { legacyId: "derived-copy", calories: 500 },
        { legacyId: "meal-logs-2026-08-08", calories: 650 }
      ]);
    });

    // A meal and a manual entry saved at once for the same day. Without a shared
    // lock the meal's sync finds no manual entry, which is not yet committed, and
    // the manual save finds no derived entry to remove, which is not either, so
    // both land and the day counts twice. The barrier holds the sync after its
    // manual-entry read, and the manual save after its removal, until the other
    // has got there too or 300 ms have passed.
    test("a meal and a manual entry saved at once leave only the manual entry", async () => {
      const [user] = await prisma.appUser.findMany({ select: { id: true } });
      let arrived = 0;
      let releaseAll;
      const allArrived = new Promise((resolve) => {
        releaseAll = resolve;
      });
      const meet = async () => {
        arrived += 1;
        if (arrived >= 2) releaseAll();
        await Promise.race([allArrived, new Promise((resolve) => setTimeout(resolve, 300))]);
      };
      // A client whose transactions wait at the barrier after each call to
      // calorieEntry[method]. Everything else is the real client.
      const pausingAfter = (method) => {
        const pausingDelegate = (delegate) =>
          new Proxy(delegate, {
            get(target, prop) {
              const value = Reflect.get(target, prop);
              if (prop !== method) return typeof value === "function" ? value.bind(target) : value;
              return async (args) => {
                const result = await value.call(target, args);
                await meet();
                return result;
              };
            }
          });
        const pausingTx = (tx) =>
          new Proxy(tx, {
            get(target, prop) {
              const value = Reflect.get(target, prop);
              if (prop === "calorieEntry") return pausingDelegate(value);
              return typeof value === "function" ? value.bind(target) : value;
            }
          });
        return new Proxy(prisma, {
          get(target, prop) {
            if (prop === "$transaction") {
              return (callback) => target.$transaction((tx) => callback(pausingTx(tx)));
            }
            return Reflect.get(target, prop);
          }
        });
      };
      const { saveMealLogWithDailySync } = createMealLogRepository({
        prisma: pausingAfter("findFirst")
      });
      const { saveCalorieEntry } = createUserRepository({ prisma: pausingAfter("deleteMany") });

      const results = await Promise.allSettled([
        saveMealLogWithDailySync({
          userId: user.id,
          mealLog: { id: "race-meal", date: "2026-08-09", name: "Oats", calories: 400 }
        }),
        saveCalorieEntry({
          userId: user.id,
          entry: { id: "race-manual", date: "2026-08-09", calories: 2100, source: "manual" }
        })
      ]);

      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
      expect(await prisma.mealLog.count()).toBe(1);
      const entries = await prisma.calorieEntry.findMany({ select: { source: true } });
      expect(entries).toEqual([{ source: "manual" }]);
    });

    test("scopes entries to the signed-in user", async () => {
      await agent
        .post("/api/dashboard/calories")
        .set("X-CSRF-Token", csrfToken)
        .send({ date: "2026-08-04", calories: 2000 });

      const other = request.agent(app);
      await signUp(other, "calories-other@example.com");
      const response = await other.get("/api/dashboard");

      expect(response.body.dashboard.calories).toEqual([]);
    });
  });
});
