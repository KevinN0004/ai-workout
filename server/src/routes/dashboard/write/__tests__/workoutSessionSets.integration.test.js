import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../../index.js";
import { prisma } from "../../../../db/prisma.js";

// A workout's sets (roadmap B1) through POST /api/dashboard/workout-sessions
// against real Postgres: saved and answered, refused whole when one set is
// wrong, and absent from the old body. In a file of their own because every
// test signs up, and workoutSessions.integration.test.js already spends most
// of the auth limiter's 25 a window, which each file gets afresh.

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
        firstName: "Alex",
        lastName: "Chen",
        age: 28,
        heightCm: 180,
        weightKg: 78,
        sex: "Male",
        activity: "High"
      }
    });
  expect(response.status).toBe(200);
  return getCsrf(agent);
};

const postWorkout = (agent, csrfToken, body) =>
  agent.post("/api/dashboard/workout-sessions").set("X-CSRF-Token", csrfToken).send(body);

describe("POST /api/dashboard/workout-sessions with sets", () => {
  let agent;
  let csrfToken;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.appUser.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.appUser.deleteMany({});
    agent = request.agent(app);
    csrfToken = await signUp(agent, "workout-sets@example.com");
  });

  test("stores a session's sets and answers with them", async () => {
    const exerciseSets = [
      {
        name: "Dumbbell bench press",
        sets: [
          { reps: 10, seconds: null, loadKg: 22.5, rpe: 7 },
          { reps: 8, seconds: null, loadKg: 22.5, rpe: 8.5 }
        ]
      },
      { name: "Plank", sets: [{ reps: null, seconds: 30, loadKg: null, rpe: null }] }
    ];

    const response = await postWorkout(agent, csrfToken, {
      date: "2026-05-01",
      duration: 45,
      exerciseSets
    });

    // Each exercise comes back tagged with its library pattern (roadmap B2):
    // the bench press is a horizontal push, and "Plank" is not in the library.
    const tagged = [
      { ...exerciseSets[0], pattern: "horizontal-push" },
      { ...exerciseSets[1], pattern: null }
    ];
    expect(response.status).toBe(200);
    expect(response.body.workoutSession.exerciseSets).toEqual(tagged);
    expect(response.body.workoutSession.exercises).toEqual(["Dumbbell bench press", "Plank"]);
    const listed = response.body.dashboard.workouts.find(
      (workout) => workout.id === response.body.workoutSession.id
    );
    expect(listed.exerciseSets).toEqual(tagged);
    expect(await prisma.exerciseSet.count()).toBe(3);
  });

  test("refuses a set without reps or seconds, and saves nothing", async () => {
    const response = await postWorkout(agent, csrfToken, {
      date: "2026-05-01",
      duration: 45,
      exerciseSets: [{ name: "Squat", sets: [{ reps: null, seconds: null, loadKg: 100 }] }]
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "exerciseSets.0.sets.0: Each set needs reps or seconds, not both."
    );
    expect(await prisma.workoutSession.count()).toBe(0);
  });

  test("still saves the old body, with no sets", async () => {
    const response = await postWorkout(agent, csrfToken, {
      date: "2026-05-01",
      duration: 45,
      exercises: ["Squat"],
      sets: 3,
      reps: 8
    });

    expect(response.status).toBe(200);
    expect(response.body.workoutSession).toMatchObject({
      exercises: ["Squat"],
      sets: 3,
      reps: 8,
      exerciseSets: []
    });
  });
});
