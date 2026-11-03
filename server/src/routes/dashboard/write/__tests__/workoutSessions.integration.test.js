import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../../index.js";
import { prisma } from "../../../../db/prisma.js";
import { buildPlanPayload } from "../../../../services/dashboard/planPayloadService.js";

// Pins POST /api/dashboard/workout-sessions and its /workouts alias against
// real Postgres: the write, an update in place for a resent id, and the
// dashboard the route answers with, its workouts newest first and with no
// duplicate ids.

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

  // A resent id updates its row rather than adding a second, so the dashboard
  // lists it once. Asserted through the response so it holds however the
  // route is implemented.
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

  // A session can name a day of one of the user's own plans. The link is kept
  // only when that plan has a saved structure with that day; otherwise the
  // workout still saves, unlinked.
  describe("linking a session to a plan day", () => {
    const realPlanText = readFileSync(
      new URL(
        "../../../../services/dashboard/__tests__/fixtures/plans/01-home-bodyweight-3d.txt",
        import.meta.url
      ),
      "utf8"
    );

    const userPkOf = async (email) => (await prisma.appUser.findFirst({ where: { email } })).id;

    // A plan saved as the generate route saves one: a legacy id the client
    // knows it by, and its structure.
    const seedPlan = (userId, { legacyId = crypto.randomUUID(), payload } = {}) =>
      prisma.generatedPlan.create({
        data: {
          userId,
          legacyId,
          planText: realPlanText,
          planPayload: payload === undefined ? buildPlanPayload(realPlanText) : payload
        }
      });

    const workout = (link) => ({ date: "2026-05-12", focus: "Monday", duration: 30, ...link });
    const storedLink = async () => {
      const [row] = await prisma.workoutSession.findMany();
      return { generatedPlanId: row.generatedPlanId, planDayIndex: row.planDayIndex };
    };

    test("keeps a link to a day of the user's own plan, day 0 included", async () => {
      const plan = await seedPlan(await userPkOf("workout-sessions@example.com"));

      const response = await postWorkout(
        agent,
        csrfToken,
        workout({ planId: plan.legacyId, planDayIndex: 0 })
      );

      expect(response.status).toBe(200);
      expect(response.body.workoutSession).toMatchObject({
        planId: plan.legacyId,
        planDayIndex: 0
      });
      expect(await storedLink()).toEqual({ generatedPlanId: plan.id, planDayIndex: 0 });
    });

    // A plan without a legacy id is known to the client by its primary key.
    test("finds a plan by its primary key when that is its id", async () => {
      const plan = await seedPlan(await userPkOf("workout-sessions@example.com"), {
        legacyId: null
      });

      const response = await postWorkout(
        agent,
        csrfToken,
        workout({ planId: plan.id, planDayIndex: 6 })
      );

      expect(response.body.workoutSession).toMatchObject({ planId: plan.id, planDayIndex: 6 });
      expect(await storedLink()).toEqual({ generatedPlanId: plan.id, planDayIndex: 6 });
    });

    test.each([
      [
        "another user's plan",
        async () => {
          const stranger = await prisma.appUser.create({
            data: { email: "plan-stranger@example.com", passwordHash: "x" }
          });
          return { planId: (await seedPlan(stranger.id)).legacyId, planDayIndex: 0 };
        }
      ],
      ["an unknown legacy id", async () => ({ planId: "no-such-plan", planDayIndex: 0 })],
      ["an unknown primary key", async () => ({ planId: crypto.randomUUID(), planDayIndex: 0 })],
      [
        "a plan saved without a structure",
        async () => {
          const plan = await seedPlan(await userPkOf("workout-sessions@example.com"), {
            payload: {}
          });
          return { planId: plan.legacyId, planDayIndex: 0 };
        }
      ],
      [
        "a day past the plan's last",
        async () => {
          const plan = await seedPlan(await userPkOf("workout-sessions@example.com"));
          return { planId: plan.legacyId, planDayIndex: 7 };
        }
      ],
      [
        "a day index that is not a whole number",
        async () => {
          const plan = await seedPlan(await userPkOf("workout-sessions@example.com"));
          return { planId: plan.legacyId, planDayIndex: 1.5 };
        }
      ]
    ])("saves the workout without a link to %s", async (_label, arrange) => {
      const link = await arrange();

      const response = await postWorkout(agent, csrfToken, workout(link));

      expect(response.status).toBe(200);
      expect(response.body.workoutSession).toMatchObject({ planId: null, planDayIndex: null });
      expect(await storedLink()).toEqual({ generatedPlanId: null, planDayIndex: null });
    });

    test("clears the link when the session is saved again without one", async () => {
      const plan = await seedPlan(await userPkOf("workout-sessions@example.com"));
      await postWorkout(
        agent,
        csrfToken,
        workout({ id: "w-linked", planId: plan.legacyId, planDayIndex: 2 })
      );

      await postWorkout(agent, csrfToken, workout({ id: "w-linked" }));

      expect(await storedLink()).toEqual({ generatedPlanId: null, planDayIndex: null });
    });

    test("is read back by the dashboard and the paginated collection", async () => {
      const plan = await seedPlan(await userPkOf("workout-sessions@example.com"));
      await postWorkout(agent, csrfToken, workout({ planId: plan.legacyId, planDayIndex: 3 }));

      const dashboard = await agent.get("/api/dashboard");
      const page = await agent.get("/api/dashboard/workout-sessions");

      expect(dashboard.body.dashboard.workouts[0]).toMatchObject({
        planId: plan.legacyId,
        planDayIndex: 3
      });
      expect(page.body.workoutSessions[0]).toMatchObject({
        planId: plan.legacyId,
        planDayIndex: 3
      });
    });

    // The plan prune deletes plans past each user's newest 200. The session
    // stays, and its index, left behind by the database, is not read.
    test("reads as unlinked once its plan is deleted", async () => {
      const plan = await seedPlan(await userPkOf("workout-sessions@example.com"));
      await postWorkout(agent, csrfToken, workout({ planId: plan.legacyId, planDayIndex: 3 }));

      await prisma.generatedPlan.delete({ where: { id: plan.id } });
      const dashboard = await agent.get("/api/dashboard");

      expect(dashboard.body.dashboard.workouts[0]).toMatchObject({
        planId: null,
        planDayIndex: null
      });
      expect((await prisma.workoutSession.findMany())[0].planDayIndex).toBe(3);
    });

    test("reads an off-plan session with neither field set", async () => {
      const response = await postWorkout(agent, csrfToken, workout());

      expect(response.body.workoutSession).toMatchObject({ planId: null, planDayIndex: null });
    });
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
