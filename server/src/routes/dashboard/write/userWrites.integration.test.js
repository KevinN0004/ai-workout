import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../prisma.js";

// Pins the remaining User write paths against real Postgres before they move
// off the Mongo compatibility shim: profile $set, goals $set with dotted paths,
// and the calories $push.
//
// The goals merge is the one with a sharp edge. The shim rebuilds the goals
// JSON from the existing row and patches only the keys present, so sending one
// goal must not erase the others. That is asserted directly.

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
