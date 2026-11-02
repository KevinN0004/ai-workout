import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../db/prisma.js";

// Pins the paginated dashboard collection reads against real Postgres. The
// three collections (workout sessions, meal logs, progress metrics) share one
// generic read path, loadCollectionPage in
// repositories/dashboardCollectionRepository.js, so they are covered together.

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
        firstName: "Jo",
        lastName: "Vance",
        age: 30,
        heightCm: 170,
        weightKg: 70,
        sex: "Female",
        activity: "Moderate"
      }
    });
  expect(response.status).toBe(200);
  return getCsrf(agent);
};

describe("dashboard collection reads", () => {
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
    csrfToken = await signUp(agent, "collection-reads@example.com");
  });

  const seedWorkouts = async (count) => {
    for (let index = 0; index < count; index += 1) {
      const response = await agent
        .post("/api/dashboard/workout-sessions")
        .set("X-CSRF-Token", csrfToken)
        .send({
          id: `w-${index}`,
          date: "2026-07-01",
          focus: `Focus ${index}`,
          duration: 30
        });
      expect(response.status).toBe(200);
    }
  };

  test("returns an empty page and a zero total for a new user", async () => {
    const response = await agent.get("/api/dashboard/workout-sessions");

    expect(response.status).toBe(200);
    expect(response.body.workoutSessions).toEqual([]);
    expect(response.body.pagination).toMatchObject({
      total: 0,
      source: "collection"
    });
  });

  test("reports the full total independently of the page size", async () => {
    await seedWorkouts(5);

    const response = await agent.get("/api/dashboard/workout-sessions?limit=2&offset=0");

    expect(response.body.workoutSessions).toHaveLength(2);
    expect(response.body.pagination).toMatchObject({
      total: 5,
      limit: 2,
      offset: 0
    });
  });

  test("honours offset", async () => {
    await seedWorkouts(5);

    const first = await agent.get("/api/dashboard/workout-sessions?limit=2&offset=0");
    const second = await agent.get("/api/dashboard/workout-sessions?limit=2&offset=2");

    const firstIds = first.body.workoutSessions.map((row) => row.id);
    const secondIds = second.body.workoutSessions.map((row) => row.id);
    expect(secondIds).toHaveLength(2);
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
  });

  test("returns rows newest first", async () => {
    await seedWorkouts(3);

    const response = await agent.get("/api/dashboard/workout-sessions?limit=3&offset=0");
    const ids = response.body.workoutSessions.map((row) => row.id);
    expect(ids[0]).toBe("w-2");
  });

  test("never leaks the internal userId field", async () => {
    await seedWorkouts(1);

    const response = await agent.get("/api/dashboard/workout-sessions?limit=1&offset=0");
    expect(response.body.workoutSessions[0]).not.toHaveProperty("userId");
  });

  test("an offset past the end yields an empty page but the true total", async () => {
    await seedWorkouts(3);

    const response = await agent.get("/api/dashboard/workout-sessions?limit=2&offset=50");
    expect(response.body.workoutSessions).toEqual([]);
    expect(response.body.pagination.total).toBe(3);
  });

  test("rejects a limit beyond the configured maximum", async () => {
    const response = await agent.get("/api/dashboard/workout-sessions?limit=100000");
    expect(response.status).toBe(400);
  });

  test("serves meal logs through the same paginated shape", async () => {
    await agent
      .post("/api/dashboard/meal-logs")
      .set("X-CSRF-Token", csrfToken)
      .send({ date: "2026-07-02", name: "Soup", calories: 300 });

    const response = await agent.get("/api/dashboard/meal-logs?limit=5&offset=0");
    expect(response.status).toBe(200);
    expect(response.body.mealLogs).toHaveLength(1);
    expect(response.body.pagination).toMatchObject({
      total: 1,
      limit: 5,
      offset: 0,
      source: "collection"
    });
  });

  test("serves progress metrics through the same paginated shape", async () => {
    await agent
      .post("/api/dashboard/progress-metrics")
      .set("X-CSRF-Token", csrfToken)
      .send({ date: "2026-07-03", weightLb: 170 });

    const response = await agent.get("/api/dashboard/progress-metrics?limit=5&offset=0");
    expect(response.status).toBe(200);
    expect(response.body.progressMetrics).toHaveLength(1);
    expect(response.body.pagination).toMatchObject({ total: 1, limit: 5 });
  });

  test("GET /api/dashboard carries all three collections and their pagination", async () => {
    await seedWorkouts(2);

    const response = await agent.get("/api/dashboard");
    expect(response.status).toBe(200);
    expect(response.body.dashboard.workoutSessions).toHaveLength(2);
    expect(response.body.pagination).toHaveProperty("workoutSessions");
    expect(response.body.pagination).toHaveProperty("mealLogs");
    expect(response.body.pagination).toHaveProperty("progressMetrics");
  });

  test("scopes every collection to the signed-in user", async () => {
    await seedWorkouts(2);

    const other = request.agent(app);
    await signUp(other, "collection-other@example.com");
    const response = await other.get("/api/dashboard/workout-sessions");

    expect(response.body.workoutSessions).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });

  // Paging with tied sort values must not drop or repeat a row.
  // loadCollectionPage orders by the sort field and then by id, both
  // descending, so rows sharing a timestamp keep one order from page to page.
  test("pages through rows with identical timestamps without loss or repeats", async () => {
    await seedWorkouts(6);
    const tied = new Date("2026-07-01T00:00:00.000Z");
    await prisma.workoutSession.updateMany({ data: { createdAt: tied } });

    const seen = [];
    for (let offset = 0; offset < 6; offset += 2) {
      const page = await agent.get(`/api/dashboard/workout-sessions?limit=2&offset=${offset}`);
      seen.push(...page.body.workoutSessions.map((row) => row.id));
    }

    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);
  });

  // GET /api/dashboard takes plans, calorie entries, saved exercises and goals
  // from the fully loaded user, not from the paginated reads above, and
  // buildDashboard turns a user loaded without them into an empty dashboard
  // rather than an error. The goal values differ from the defaults, so a
  // fallback cannot pass for the real thing.
  test("GET /api/dashboard returns the account's plans, calories, saved exercises and goals", async () => {
    const goals = await agent
      .post("/api/dashboard/goals")
      .set("X-CSRF-Token", csrfToken)
      .send({ targetWeight: 165, targetCalories: 2400, weeklyWorkouts: 4 });
    expect(goals.status).toBe(200);
    const calories = await agent
      .post("/api/dashboard/calories")
      .set("X-CSRF-Token", csrfToken)
      .send({ date: "2026-07-02", calories: 2100 });
    expect(calories.status).toBe(200);
    const saved = await agent
      .post("/api/dashboard/saved-exercises")
      .set("X-CSRF-Token", csrfToken)
      .send({ exerciseId: 192, name: "Barbell bench press", category: "Chest" });
    expect(saved.status).toBe(200);
    // No route saves a plan without a live Gemini call, so the row goes in directly.
    const owner = await prisma.appUser.findFirst({
      where: { email: "collection-reads@example.com" }
    });
    await prisma.generatedPlan.create({
      data: { userId: owner.id, goal: "Build muscle", planText: "Monday: bench press 4x8" }
    });

    const response = await agent.get("/api/dashboard");

    expect(response.status).toBe(200);
    const { dashboard } = response.body;
    expect(dashboard.plans.map((plan) => plan.plan)).toEqual(["Monday: bench press 4x8"]);
    expect(dashboard.calories).toEqual([
      expect.objectContaining({ date: "2026-07-02", calories: 2100 })
    ]);
    expect(dashboard.savedExercises.map((exercise) => exercise.name)).toEqual([
      "Barbell bench press"
    ]);
    expect(dashboard.goals).toMatchObject({
      targetWeight: 165,
      targetCalories: 2400,
      weeklyWorkouts: 4
    });
  });
});
