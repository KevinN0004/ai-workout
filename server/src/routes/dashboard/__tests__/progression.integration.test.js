import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../db/prisma.js";

// The week's progression over the wire (roadmap B4,
// docs/specs/2026-11-06-adaptive-progression-design.md, "Answers and undo"):
// the read and the answers, against real Postgres. Its own file because the
// auth limiter allows 25 signups a file.
//
// The plan is written straight to its table rather than through
// /api/generate: index.js builds its Gemini client when it loads, from
// server/.env, so a generate call here could reach the real API. The clock is
// pinned to Monday 9 Nov 2026 at noon UTC (Date only), so "last week" is the
// week of Monday 2 Nov and a client date a day behind is in that week.

const NOW = new Date("2026-11-09T12:00:00Z");
const ROW = "Seated cable row";
const BOX = "Dumbbell box squat";
const GOBLET = "Dumbbell goblet squat";

const rx = (name) => ({
  name,
  sets: 3,
  reps: { min: 8, max: 10 },
  seconds: null,
  perSide: false,
  targetRpe: { min: 7, max: 8 }
});

const payloadOf = (names) => ({
  version: 1,
  days: [
    {
      index: 0,
      weekday: "Monday",
      title: "Monday - Full body A",
      lines: names.map((name) => `- ${name}: 3 x 8-10`),
      prescriptions: names.map(rx)
    }
  ],
  notes: []
});

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

const userOf = (email) => prisma.appUser.findFirst({ where: { email } });

const savePlan = async (email, { names = [ROW, BOX], injuries = "Knee" } = {}) => {
  const user = await userOf(email);
  return prisma.generatedPlan.create({
    data: {
      userId: user.id,
      legacyId: `plan-${email}`,
      level: "Intermediate",
      injuries,
      planText: "Monday - Full body A",
      planPayload: payloadOf(names)
    }
  });
};

// A workout on `date` with three sets of 10 at RPE 8 for each of `names`.
const logWorkout = async (agent, csrfToken, date, names = [ROW, BOX], loadKg = 40) => {
  const response = await agent
    .post("/api/dashboard/workout-sessions")
    .set("X-CSRF-Token", csrfToken)
    .send({
      date,
      duration: 45,
      exerciseSets: names.map((name) => ({
        name,
        sets: [1, 2, 3].map(() => ({ reps: 10, loadKg, rpe: 8 }))
      }))
    });
  expect(response.status).toBe(200);
};

const liftOf = (response, name) =>
  response.body.progression.lifts.find((lift) => lift.name === name);

const liftPath = (weekStart, key) =>
  `/api/dashboard/progression/${weekStart}/lifts/${encodeURIComponent(key)}`;

describe("the progression routes", () => {
  let agent;
  let csrfToken;
  const EMAIL = "progression-routes@example.com";

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.appUser.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    await prisma.appUser.deleteMany({});
    agent = request.agent(app);
    csrfToken = await signUp(agent, EMAIL);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A plan, and last Monday's workout with every set at the top at RPE 8.
  const trainedLastWeek = async () => {
    await savePlan(EMAIL);
    await logWorkout(agent, csrfToken, "2026-11-02");
  };

  test("each route needs a session", async () => {
    const stranger = request.agent(app);
    const token = await getCsrf(stranger);
    const responses = await Promise.all([
      stranger.get("/api/dashboard/progression"),
      stranger
        .put(liftPath("2026-11-09", "seated cable row"))
        .set("X-CSRF-Token", token)
        .send({ decision: "undo" }),
      stranger.delete(liftPath("2026-11-09", "seated cable row")).set("X-CSRF-Token", token),
      stranger
        .put("/api/dashboard/progression/2026-11-09/week")
        .set("X-CSRF-Token", token)
        .send({ decision: "normal" }),
      stranger.delete("/api/dashboard/progression/2026-11-09/week").set("X-CSRF-Token", token)
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
  });

  test("with no plan, the week's progression is null", async () => {
    const response = await agent.get("/api/dashboard/progression");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ progression: null });
  });

  test("reads the step up after last week's workout, and asks first on the knee lift", async () => {
    await trainedLastWeek();

    const response = await agent.get("/api/dashboard/progression?today=2026-11-09");

    expect(response.status).toBe(200);
    expect(response.body.progression.weekStart).toBe("2026-11-09");
    expect(liftOf(response, ROW)).toMatchObject({
      key: "seated cable row",
      change: "up",
      kg: { from: 40, target: 42.5 },
      why: "Every set reached 10 reps at RPE 8 or below on Mon 2 Nov",
      decision: null
    });
    expect(liftOf(response, BOX)).toMatchObject({ change: "ask", kg: { from: 40, target: 42.5 } });
  });

  test("only the newest plan's lifts are read", async () => {
    const older = await savePlan(EMAIL, { names: [GOBLET] });
    await prisma.generatedPlan.update({
      where: { id: older.id },
      data: { legacyId: "plan-older", createdAt: new Date("2026-10-01T00:00:00Z") }
    });
    await trainedLastWeek();

    const response = await agent.get("/api/dashboard/progression");

    expect(response.body.progression.lifts.map((lift) => lift.name)).toEqual([ROW, BOX]);
  });

  test("a client date a day off is kept, and one two days off is replaced", async () => {
    await trainedLastWeek();

    const dayBehind = await agent.get("/api/dashboard/progression?today=2026-11-08");
    const twoBehind = await agent.get("/api/dashboard/progression?today=2026-11-07");
    const none = await agent.get("/api/dashboard/progression");

    expect(dayBehind.body.progression.weekStart).toBe("2026-11-02");
    expect(twoBehind.body.progression.weekStart).toBe("2026-11-09");
    expect(none.body.progression.weekStart).toBe("2026-11-09");
  });

  // One test for every case, as each test signs up and the limiter allows 25.
  test("a today that is not a YYYY-MM-DD date is a 400", async () => {
    for (const today of ["tomorrow", "2026-11-9", "2026-11-09T00:00:00Z"]) {
      const response = await agent.get(
        `/api/dashboard/progression?today=${encodeURIComponent(today)}`
      );
      expect(response.status, today).toBe(400);
    }
  });

  test("the profile note is read with the plan's injury answer", async () => {
    await savePlan(EMAIL, { names: [GOBLET], injuries: "None" });
    await logWorkout(agent, csrfToken, "2026-11-02", [GOBLET]);
    const user = await userOf(EMAIL);
    await prisma.appUser.update({
      where: { id: user.id },
      data: { profile: { ...user.profile, notes: "sore knee" } }
    });

    const response = await agent.get("/api/dashboard/progression");

    expect(liftOf(response, GOBLET).change).toBe("ask");
  });

  test("undo holds the lift, and taking it back brings the step up back", async () => {
    await trainedLastWeek();

    const undone = await agent
      .put(liftPath("2026-11-09", "seated cable row"))
      .set("X-CSRF-Token", csrfToken)
      .send({ decision: "undo" });
    expect(undone.status).toBe(200);
    expect(liftOf(undone, ROW)).toMatchObject({
      change: "hold",
      kg: { from: 40, target: 40 },
      decision: "undo"
    });
    expect(liftOf(await agent.get("/api/dashboard/progression"), ROW).decision).toBe("undo");

    const takenBack = await agent
      .delete(liftPath("2026-11-09", "seated cable row"))
      .set("X-CSRF-Token", csrfToken);
    expect(takenBack.status).toBe(200);
    expect(liftOf(takenBack, ROW)).toMatchObject({ change: "up", decision: null });
  });

  test("accept on an asked lift steps it up, and decline holds it", async () => {
    await trainedLastWeek();
    const answer = (decision) =>
      agent
        .put(liftPath("2026-11-09", "dumbbell box squat"))
        .set("X-CSRF-Token", csrfToken)
        .send({ decision });

    expect(liftOf(await answer("accept"), BOX)).toMatchObject({ change: "up", decision: "accept" });
    expect(liftOf(await answer("decline"), BOX)).toMatchObject({
      change: "hold",
      decision: "decline"
    });
  });

  test("an answer for last week's Monday is accepted on a Monday", async () => {
    await trainedLastWeek();

    const response = await agent
      .put(liftPath("2026-11-02", "seated cable row"))
      .set("X-CSRF-Token", csrfToken)
      .send({ decision: "undo" });

    expect(response.status).toBe(200);
    expect(response.body.progression.weekStart).toBe("2026-11-02");
  });

  test("a deload week can be trained normally, and that answer taken back", async () => {
    await savePlan(EMAIL);
    for (const date of ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]) {
      await logWorkout(agent, csrfToken, date);
    }
    expect(
      (await agent.get("/api/dashboard/progression")).body.progression.deloadWeek
    ).toMatchObject({ active: true, count: 5, decision: null });

    const normal = await agent
      .put("/api/dashboard/progression/2026-11-09/week")
      .set("X-CSRF-Token", csrfToken)
      .send({ decision: "normal" });
    expect(normal.status).toBe(200);
    expect(normal.body.progression.deloadWeek).toMatchObject({ active: true, decision: "normal" });
    expect(liftOf(normal, ROW)).toMatchObject({ change: "up", sets: 3 });

    const takenBack = await agent
      .delete("/api/dashboard/progression/2026-11-09/week")
      .set("X-CSRF-Token", csrfToken);
    expect(takenBack.body.progression.deloadWeek.decision).toBeNull();
    expect(liftOf(takenBack, ROW)).toMatchObject({ change: "hold", sets: 2 });
  });

  test("a weekStart two weeks back, not a Monday or not a real date is a 400", async () => {
    await trainedLastWeek();
    for (const weekStart of ["2026-10-26", "2026-11-10", "monday", "2026-02-30"]) {
      const lift = await agent
        .put(liftPath(weekStart, "seated cable row"))
        .set("X-CSRF-Token", csrfToken)
        .send({ decision: "undo" });
      const week = await agent
        .delete(`/api/dashboard/progression/${weekStart}/week`)
        .set("X-CSRF-Token", csrfToken);
      expect([lift.status, week.status], weekStart).toEqual([400, 400]);
    }
    expect(await prisma.progressionDecision.count()).toBe(0);
  });

  test.each([
    ["normal on a lift", "lifts/seated%20cable%20row", "normal"],
    ["an unknown decision on a lift", "lifts/seated%20cable%20row", "maybe"],
    ["undo on the week", "week", "undo"],
    ["no decision on the week", "week", undefined]
  ])("%s is a 400", async (_label, path, decision) => {
    await trainedLastWeek();
    const response = await agent
      .put(`/api/dashboard/progression/2026-11-09/${path}`)
      .set("X-CSRF-Token", csrfToken)
      .send(decision === undefined ? {} : { decision });
    expect(response.status).toBe(400);
  });

  test("a lift the week does not hold is a 404, and nothing is stored", async () => {
    await trainedLastWeek();
    const put = await agent
      .put(liftPath("2026-11-09", "barbell back squat"))
      .set("X-CSRF-Token", csrfToken)
      .send({ decision: "undo" });
    const remove = await agent
      .delete(liftPath("2026-11-09", "barbell back squat"))
      .set("X-CSRF-Token", csrfToken);

    expect([put.status, remove.status]).toEqual([404, 404]);
    expect(put.body).toEqual({ error: "That lift is not one of this week's lifts." });

    // Spaces alone trim to the week's own key, and are still not a lift.
    const blank = await agent
      .put(liftPath("2026-11-09", "  "))
      .set("X-CSRF-Token", csrfToken)
      .send({ decision: "undo" });
    expect(blank.status).toBe(404);
    expect(await prisma.progressionDecision.count()).toBe(0);
  });

  test("with no plan, an answer is a 404", async () => {
    const lift = await agent
      .put(liftPath("2026-11-09", "seated cable row"))
      .set("X-CSRF-Token", csrfToken)
      .send({ decision: "undo" });
    const week = await agent
      .put("/api/dashboard/progression/2026-11-09/week")
      .set("X-CSRF-Token", csrfToken)
      .send({ decision: "normal" });
    expect([lift.status, week.status]).toEqual([404, 404]);
    const error = "There is no plan with a saved structure to answer for.";
    expect([lift.body, week.body]).toEqual([{ error }, { error }]);
  });

  test("another user's answer on the same lift leaves this user's week as it was", async () => {
    await trainedLastWeek();
    const other = request.agent(app);
    const otherEmail = "progression-other@example.com";
    const otherToken = await signUp(other, otherEmail);
    await savePlan(otherEmail);
    await logWorkout(other, otherToken, "2026-11-02");

    const theirs = await other
      .put(liftPath("2026-11-09", "seated cable row"))
      .set("X-CSRF-Token", otherToken)
      .send({ decision: "undo" });
    expect(liftOf(theirs, ROW).decision).toBe("undo");

    const mine = await agent.get("/api/dashboard/progression");
    expect(liftOf(mine, ROW)).toMatchObject({ change: "up", decision: null });
  });

  test("an answer without the CSRF header is refused", async () => {
    await trainedLastWeek();
    const response = await agent
      .put(liftPath("2026-11-09", "seated cable row"))
      .send({ decision: "undo" });
    expect(response.status).toBe(403);
    expect(await prisma.progressionDecision.count()).toBe(0);
  });
});
