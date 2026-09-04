import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../prisma.js";

// Pins POST /api/dashboard/meal-logs against real Postgres before that route is
// migrated off the Mongo compatibility shim.
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
  const response = await agent.post("/api/auth/signup").set("X-CSRF-Token", csrfToken).send({
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

  // KNOWN BUG, pinned so the migration cannot quietly change it.
  //
  // The route computes a day's calorie total and builds a large Mongo pipeline
  // intended to write it into dashboard.calories as a `meal_logs`-sourced entry.
  // The shim never matches array pipelines, so none of that runs: logging a meal
  // contributes nothing to the calories view. Asserted as-is; fixing it is a
  // product decision, not part of a refactor.
  test("does not currently create a calorie entry from a meal log", async () => {
    const response = await postMeal(agent, csrfToken, {
      date: "2026-06-08",
      name: "Big dinner",
      calories: 900
    });

    expect(response.status).toBe(200);
    expect(response.body.dashboard?.calories).toEqual([]);
    expect(await prisma.calorieEntry.count()).toBe(0);
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
