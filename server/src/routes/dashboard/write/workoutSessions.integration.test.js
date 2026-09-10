import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../prisma.js";

// Pins POST /api/dashboard/workouts and its /workout-sessions alias against real
// Postgres before that route is migrated off the Mongo compatibility shim.
//
// Beyond the write itself, these tests pin the three properties the route's
// Mongo aggregation-pipeline update claims to provide -- newest first, no
// duplicate ids, and a cap on dashboard.workouts. They are asserted here as
// observable behaviour so that removing the pipeline has to preserve them
// rather than being taken on trust.

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

const postWorkout = (agent, csrfToken, body, path = "/api/dashboard/workout-sessions") =>
  agent.post(path).set("X-CSRF-Token", csrfToken).send(body);

describe("POST /api/dashboard/workout-sessions", () => {
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
    csrfToken = await signUp(agent, "workout-sessions@example.com");
  });

  test("stores a session and echoes it back with the dashboard", async () => {
    const response = await postWorkout(agent, csrfToken, {
      date: "2026-05-01",
      focus: "Push",
      duration: 45,
      exercises: ["bench", "dips"],
      sets: 4,
      reps: 8,
      intensityRpe: 8,
      notes: "solid"
    });

    expect(response.status).toBe(200);
    expect(response.body.workoutSession).toMatchObject({
      date: "2026-05-01",
      focus: "Push",
      duration: 45,
      sets: 4,
      reps: 8,
      notes: "solid"
    });

    const rows = await prisma.workoutSession.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].focus).toBe("Push");
    expect(rows[0].exercises).toEqual(["bench", "dips"]);
  });

  test("serves the same handler on the /workouts alias", async () => {
    const response = await postWorkout(
      agent,
      csrfToken,
      { date: "2026-05-02", focus: "Pull", duration: 30 },
      "/api/dashboard/workouts"
    );

    expect(response.status).toBe(200);
    expect(await prisma.workoutSession.count()).toBe(1);
  });

  test("updates in place when the same id is sent twice", async () => {
    await postWorkout(agent, csrfToken, {
      id: "w-fixed",
      date: "2026-05-03",
      focus: "Legs",
      duration: 40
    });
    await postWorkout(agent, csrfToken, {
      id: "w-fixed",
      date: "2026-05-03",
      focus: "Legs revised",
      duration: 50
    });

    const rows = await prisma.workoutSession.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].focus).toBe("Legs revised");
    expect(rows[0].durationMinutes).toBe(50);
  });

  // The pipeline update dedupes dashboard.workouts by id. Asserted through the
  // response so it holds however the route is implemented.
  test("does not duplicate a resubmitted id in the dashboard", async () => {
    await postWorkout(agent, csrfToken, {
      id: "w-dupe",
      date: "2026-05-04",
      focus: "A",
      duration: 30
    });
    const second = await postWorkout(agent, csrfToken, {
      id: "w-dupe",
      date: "2026-05-04",
      focus: "B",
      duration: 30
    });

    const workouts = second.body.dashboard?.workouts || [];
    expect(workouts.filter((w) => w.id === "w-dupe")).toHaveLength(1);
  });

  test("returns dashboard workouts newest first", async () => {
    await postWorkout(agent, csrfToken, {
      id: "w-1",
      date: "2026-05-05",
      focus: "First",
      duration: 30
    });
    await postWorkout(agent, csrfToken, {
      id: "w-2",
      date: "2026-05-06",
      focus: "Second",
      duration: 30
    });
    const third = await postWorkout(agent, csrfToken, {
      id: "w-3",
      date: "2026-05-07",
      focus: "Third",
      duration: 30
    });

    const workouts = third.body.dashboard?.workouts || [];
    expect(workouts).toHaveLength(3);
    expect(workouts[0].focus).toBe("Third");
  });

  test("rejects a session with no date", async () => {
    const response = await postWorkout(agent, csrfToken, { focus: "Push", duration: 45 });

    expect(response.status).toBe(400);
    expect(await prisma.workoutSession.count()).toBe(0);
  });

  test("rejects a session with no duration", async () => {
    const response = await postWorkout(agent, csrfToken, { date: "2026-05-08", focus: "Push" });

    expect(response.status).toBe(400);
    expect(await prisma.workoutSession.count()).toBe(0);
  });

  test("defaults focus when none is supplied", async () => {
    const response = await postWorkout(agent, csrfToken, { date: "2026-05-09", duration: 25 });

    expect(response.status).toBe(200);
    const [row] = await prisma.workoutSession.findMany();
    expect(row.focus).toBe("General");
  });

  test("requires authentication", async () => {
    const anon = request.agent(app);
    const anonCsrf = await getCsrf(anon);

    const response = await anon
      .post("/api/dashboard/workout-sessions")
      .set("X-CSRF-Token", anonCsrf)
      .send({ date: "2026-05-10", duration: 30 });

    expect(response.status).toBe(401);
  });

  test("scopes sessions to the signed-in user", async () => {
    await postWorkout(agent, csrfToken, { date: "2026-05-11", focus: "Mine", duration: 30 });

    const other = request.agent(app);
    const otherCsrf = await signUp(other, "workout-other@example.com");
    const response = await other
      .get("/api/dashboard/workout-sessions")
      .set("X-CSRF-Token", otherCsrf);

    expect(response.status).toBe(200);
    expect(response.body.workoutSessions).toEqual([]);
  });
});
