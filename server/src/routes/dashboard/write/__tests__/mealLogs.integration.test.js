import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../../index.js";
import { prisma } from "../../../../db/prisma.js";
import { createMealLogRepository } from "../../../../repositories/mealLogRepository.js";

// Pins POST /api/dashboard/meal-logs against real Postgres.
//
// One of these tests asserts behaviour that is a KNOWN BUG rather than the
// behaviour anyone wants -- a meal log never produces a calorie entry. It is
// pinned deliberately so the migration is a faithful refactor and the bug is
// fixed as its own decision, not smuggled in under a refactor. See
// docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md.

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
        firstName: "Robin",
        lastName: "Hale",
        age: 34,
        heightCm: 172,
        weightKg: 68,
        sex: "Non-binary",
        activity: "Light"
      }
    });
  expect(response.status).toBe(200);
  return getCsrf(agent);
};

const postMeal = (agent, csrfToken, body) =>
  agent.post("/api/dashboard/meal-logs").set("X-CSRF-Token", csrfToken).send(body);

describe("POST /api/dashboard/meal-logs", () => {
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
    csrfToken = await signUp(agent, "meal-logs@example.com");
  });

  test("stores a meal and echoes it back with the dashboard", async () => {
    const response = await postMeal(agent, csrfToken, {
      date: "2026-06-01",
      mealType: "lunch",
      name: "Rice bowl",
      calories: 700,
      proteinG: 35,
      carbsG: 90,
      fatG: 18,
      notes: "post-gym"
    });

    expect(response.status).toBe(200);
    expect(response.body.mealLog).toMatchObject({
      date: "2026-06-01",
      mealType: "lunch",
      name: "Rice bowl",
      calories: 700,
      notes: "post-gym"
    });

    const rows = await prisma.mealLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Rice bowl");
    expect(Number(rows[0].proteinG)).toBe(35);
  });

  test("returns the meal in the dashboard payload", async () => {
    const response = await postMeal(agent, csrfToken, {
      date: "2026-06-02",
      name: "Oats",
      calories: 350
    });

    const logs = response.body.dashboard?.mealLogs || [];
    expect(logs.some((m) => m.name === "Oats")).toBe(true);
  });

  test("updates in place when the same id is sent twice", async () => {
    await postMeal(agent, csrfToken, {
      id: "meal-fixed",
      date: "2026-06-03",
      name: "Toast",
      calories: 200
    });
    await postMeal(agent, csrfToken, {
      id: "meal-fixed",
      date: "2026-06-03",
      name: "Toast with jam",
      calories: 260
    });

    const rows = await prisma.mealLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Toast with jam");
    expect(rows[0].calories).toBe(260);
  });

  test("defaults mealType to other when none is supplied", async () => {
    await postMeal(agent, csrfToken, { date: "2026-06-04", name: "Snack", calories: 120 });

    const [row] = await prisma.mealLog.findMany();
    expect(row.mealType).toBe("other");
  });

  test("accepts a meal with macros but no calories", async () => {
    const response = await postMeal(agent, csrfToken, {
      date: "2026-06-05",
      name: "Protein shake",
      proteinG: 30
    });

    expect(response.status).toBe(200);
    const [row] = await prisma.mealLog.findMany();
    expect(row.calories).toBeNull();
    expect(Number(row.proteinG)).toBe(30);
  });

  test("rejects a meal with no date", async () => {
    const response = await postMeal(agent, csrfToken, { name: "Lunch", calories: 500 });

    expect(response.status).toBe(400);
    expect(await prisma.mealLog.count()).toBe(0);
  });

  test("rejects a meal with no name", async () => {
    const response = await postMeal(agent, csrfToken, { date: "2026-06-06", calories: 500 });

    expect(response.status).toBe(400);
    expect(await prisma.mealLog.count()).toBe(0);
  });

  test("rejects a meal carrying neither calories nor any macro", async () => {
    const response = await postMeal(agent, csrfToken, { date: "2026-06-07", name: "Water" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/calories or at least one macro/i);
    expect(await prisma.mealLog.count()).toBe(0);
  });

  // Meal logs feeding the calories view. The rules are taken from the Mongo
  // pipeline that was supposed to do this and never ran -- see the plan doc.
  describe("derived calorie entries", () => {
    test("creates a meal_logs entry holding the day's total", async () => {
      const response = await postMeal(agent, csrfToken, {
        date: "2026-06-08",
        name: "Big dinner",
        calories: 900
      });

      expect(response.status).toBe(200);
      const [row] = await prisma.calorieEntry.findMany();
      expect(row.calories).toBe(900);
      expect(row.source).toBe("meal_logs");
      expect(row.legacyId).toBe("meal-logs-2026-06-08");

      const entries = response.body.dashboard?.calories || [];
      expect(entries.some((entry) => entry.calories === 900)).toBe(true);
    });

    test("updates the same entry as more meals are logged that day", async () => {
      await postMeal(agent, csrfToken, { date: "2026-06-09", name: "Breakfast", calories: 400 });
      await postMeal(agent, csrfToken, { date: "2026-06-09", name: "Lunch", calories: 650 });

      const rows = await prisma.calorieEntry.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].calories).toBe(1050);
    });

    test("keeps separate entries for separate days", async () => {
      await postMeal(agent, csrfToken, { date: "2026-06-10", name: "A", calories: 300 });
      await postMeal(agent, csrfToken, { date: "2026-06-11", name: "B", calories: 500 });

      const rows = await prisma.calorieEntry.findMany({ orderBy: { calorieDate: "asc" } });
      expect(rows.map((row) => row.calories)).toEqual([300, 500]);
    });

    // A number the user typed themselves outranks one derived from meals.
    test("a manual entry for that day suppresses the derived one", async () => {
      await agent
        .post("/api/dashboard/calories")
        .set("X-CSRF-Token", csrfToken)
        .send({ date: "2026-06-12", calories: 2000 });

      await postMeal(agent, csrfToken, { date: "2026-06-12", name: "Snack", calories: 250 });

      const rows = await prisma.calorieEntry.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].source).toBe("manual");
      expect(rows[0].calories).toBe(2000);
    });

    test("a manual entry on another day does not block the derived one", async () => {
      await agent
        .post("/api/dashboard/calories")
        .set("X-CSRF-Token", csrfToken)
        .send({ date: "2026-06-13", calories: 2000 });

      await postMeal(agent, csrfToken, { date: "2026-06-14", name: "Snack", calories: 250 });

      const rows = await prisma.calorieEntry.findMany({ orderBy: { calorieDate: "asc" } });
      expect(rows).toHaveLength(2);
      expect(rows[1].source).toBe("meal_logs");
    });

    // Macros-only meals total zero, and the original rules wrote nothing in
    // that case rather than a misleading 0-calorie day.
    test("writes nothing when the day's meals carry no calories", async () => {
      const response = await postMeal(agent, csrfToken, {
        date: "2026-06-15",
        name: "Protein shake",
        proteinG: 30
      });

      expect(response.status).toBe(200);
      expect(await prisma.calorieEntry.count()).toBe(0);
    });
  });

  // A single meal is bounded on its own, but calorie_entries bounds the day's derived
  // row separately (calorie_entries_calories_check), so a day's sum can overflow it.
  // The sync clamps the entry to that ceiling, so the route answers 200.
  describe("a day whose meals exceed the calorie_entries ceiling", () => {
    const logBigMeals = async (count) => {
      let response;
      for (let i = 0; i < count; i += 1) {
        response = await postMeal(agent, csrfToken, {
          id: `big-${i}`,
          date: "2026-06-16",
          name: `Feast ${i}`,
          calories: 4000
        });
      }
      return response;
    };

    test("clamps the derived entry to the column ceiling and keeps every meal", async () => {
      const response = await logBigMeals(3);

      expect(response.status).toBe(200);
      expect(await prisma.mealLog.count()).toBe(3);
      expect(response.body.dashboard.mealLogs).toHaveLength(3);
      const rows = await prisma.calorieEntry.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].calories).toBe(10000);
    });

    test("a retry of the same meal id does not add a meal", async () => {
      await logBigMeals(3);
      const retry = await postMeal(agent, csrfToken, {
        id: "big-2",
        date: "2026-06-16",
        name: "Feast 2",
        calories: 4000
      });

      expect(retry.status).toBe(200);
      expect(await prisma.mealLog.count()).toBe(3);
    });
  });

  test("a failing derived-entry write rolls the meal back", async () => {
    const [user] = await prisma.appUser.findMany({ select: { id: true } });
    // Real delegates everywhere except the derived write, which throws. Both the
    // root client and the transaction client are built this way, so the sync fails
    // on the same error whether or not it runs inside the transaction; only the
    // transaction decides whether the meal survives.
    const failingOver = (client) => ({
      appUser: client.appUser,
      mealLog: client.mealLog,
      calorieEntry: {
        findFirst: (args) => client.calorieEntry.findFirst(args),
        create: () => Promise.reject(new Error("derived write failed")),
        update: () => Promise.reject(new Error("derived write failed")),
        upsert: () => Promise.reject(new Error("derived write failed"))
      }
    });
    const failingPrisma = {
      ...failingOver(prisma),
      $transaction: (callback) => prisma.$transaction((tx) => callback(failingOver(tx)))
    };
    const { saveMealLogWithDailySync } = createMealLogRepository({ prisma: failingPrisma });

    await expect(
      saveMealLogWithDailySync({
        userId: user.id,
        mealLog: { id: "rollback-1", date: "2026-06-17", name: "Lost", calories: 500 }
      })
    ).rejects.toThrow("derived write failed");

    expect(await prisma.mealLog.count()).toBe(0);
  });

  test("editing the only calorie meal to macros only removes the derived entry", async () => {
    const first = await postMeal(agent, csrfToken, {
      id: "zero-1",
      date: "2026-06-19",
      name: "Shake",
      calories: 300
    });
    expect(first.status).toBe(200);
    expect(await prisma.calorieEntry.count()).toBe(1);

    const edit = await postMeal(agent, csrfToken, {
      id: "zero-1",
      date: "2026-06-19",
      name: "Shake",
      proteinG: 30
    });

    expect(edit.status).toBe(200);
    expect(await prisma.mealLog.count()).toBe(1);
    expect(await prisma.calorieEntry.count()).toBe(0);
  });

  test("saveMealLogWithDailySync returns null for an unknown user", async () => {
    const { saveMealLogWithDailySync } = createMealLogRepository({ prisma });
    const result = await saveMealLogWithDailySync({
      userId: "00000000-0000-4000-8000-000000000000",
      mealLog: { date: "2026-06-18", name: "Ghost", calories: 100 }
    });
    expect(result).toBeNull();
  });

  test("requires authentication", async () => {
    const anon = request.agent(app);
    const anonCsrf = await getCsrf(anon);

    const response = await anon
      .post("/api/dashboard/meal-logs")
      .set("X-CSRF-Token", anonCsrf)
      .send({ date: "2026-06-09", name: "Lunch", calories: 500 });

    expect(response.status).toBe(401);
  });

  test("scopes meals to the signed-in user", async () => {
    await postMeal(agent, csrfToken, { date: "2026-06-10", name: "Mine", calories: 400 });

    const other = request.agent(app);
    const otherCsrf = await signUp(other, "meal-other@example.com");
    const response = await other.get("/api/dashboard/meal-logs").set("X-CSRF-Token", otherCsrf);

    expect(response.status).toBe(200);
    expect(response.body.mealLogs).toEqual([]);
  });
});
