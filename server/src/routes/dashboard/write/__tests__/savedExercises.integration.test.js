import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../../index.js";
import { prisma } from "../../../../db/prisma.js";

// Pins the saved-exercise routes against real Postgres before they move off the
// Mongo compatibility shim.
//
// Unlike the workout and meal pipelines, this one is genuinely live: the shim's
// extractFirstConcatEntry matches this exact pipeline shape and routes it to an
// upsert. So these tests pin working behaviour, not a dead path -- in
// particular the two-way deduplication, by external exercise id or by
// case-insensitive name.

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
        firstName: "Kit",
        lastName: "Moore",
        age: 27,
        heightCm: 168,
        weightKg: 62,
        sex: "Prefer not to say",
        activity: "High"
      }
    });
  expect(response.status).toBe(200);
  return getCsrf(agent);
};

const save = (agent, csrfToken, body) =>
  agent.post("/api/dashboard/saved-exercises").set("X-CSRF-Token", csrfToken).send(body);

const remove = (agent, csrfToken, id) =>
  agent.delete(`/api/dashboard/saved-exercises/${id}`).set("X-CSRF-Token", csrfToken);

describe("saved exercise routes", () => {
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
    csrfToken = await signUp(agent, "saved-exercises@example.com");
  });

  test("stores an exercise and echoes it back with the dashboard", async () => {
    const response = await save(agent, csrfToken, {
      exerciseId: 345,
      name: "Barbell Squat",
      category: "Legs",
      muscles: ["quads"],
      equipment: ["barbell"],
      reason: "compound"
    });

    expect(response.status).toBe(200);
    expect(response.body.savedExercise).toMatchObject({ name: "Barbell Squat" });

    const rows = await prisma.savedExercise.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].externalExerciseId).toBe(345);
    expect(rows[0].muscles).toEqual(["quads"]);
  });

  test("surfaces the exercise in the dashboard payload", async () => {
    const response = await save(agent, csrfToken, { name: "Deadlift" });
    const saved = response.body.dashboard?.savedExercises || [];
    expect(saved.some((row) => row.name === "Deadlift")).toBe(true);
  });

  test("deduplicates by external exercise id rather than inserting again", async () => {
    await save(agent, csrfToken, { exerciseId: 99, name: "Row", reason: "first" });
    await save(agent, csrfToken, { exerciseId: 99, name: "Row Variation", reason: "second" });

    const rows = await prisma.savedExercise.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("second");
  });

  test("deduplicates by name regardless of case", async () => {
    await save(agent, csrfToken, { name: "Bench Press", reason: "first" });
    await save(agent, csrfToken, { name: "bench press", reason: "second" });

    const rows = await prisma.savedExercise.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("second");
  });

  test("keeps genuinely distinct exercises apart", async () => {
    await save(agent, csrfToken, { exerciseId: 1, name: "Squat" });
    await save(agent, csrfToken, { exerciseId: 2, name: "Lunge" });

    expect(await prisma.savedExercise.count()).toBe(2);
  });

  test("rejects an exercise with no name", async () => {
    const response = await save(agent, csrfToken, { exerciseId: 7 });

    expect(response.status).toBe(400);
    expect(await prisma.savedExercise.count()).toBe(0);
  });

  test("removes a saved exercise by id", async () => {
    const saved = await save(agent, csrfToken, { name: "Pull Up" });
    const id = saved.body.savedExercise.id;

    const response = await remove(agent, csrfToken, id);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(await prisma.savedExercise.count()).toBe(0);
  });

  test("removing an unknown id succeeds without deleting anything", async () => {
    await save(agent, csrfToken, { name: "Plank" });

    const response = await remove(agent, csrfToken, "does-not-exist");

    expect(response.status).toBe(200);
    expect(await prisma.savedExercise.count()).toBe(1);
  });

  test("both routes require authentication", async () => {
    const anon = request.agent(app);
    const anonCsrf = await getCsrf(anon);

    const post = await anon
      .post("/api/dashboard/saved-exercises")
      .set("X-CSRF-Token", anonCsrf)
      .send({ name: "Squat" });
    const del = await anon
      .delete("/api/dashboard/saved-exercises/whatever")
      .set("X-CSRF-Token", anonCsrf);

    expect(post.status).toBe(401);
    expect(del.status).toBe(401);
  });

  test("one user cannot delete another user's saved exercise", async () => {
    const saved = await save(agent, csrfToken, { name: "Hip Thrust" });
    const id = saved.body.savedExercise.id;

    const other = request.agent(app);
    const otherCsrf = await signUp(other, "saved-other@example.com");
    const response = await remove(other, otherCsrf, id);

    expect(response.status).toBe(200);
    // The owner's row survives: the delete is scoped to the caller.
    expect(await prisma.savedExercise.count()).toBe(1);
  });
});
