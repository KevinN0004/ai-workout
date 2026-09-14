import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../db/prisma.js";

// Pins the behaviour of POST /api/dashboard/progress-metrics against real
// Postgres before that route is migrated off the Mongo compatibility shim.
// Written to guard a refactor, so it asserts observable behaviour only -- the
// response shape and what ends up in the database -- and says nothing about
// which data layer produced it.

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
        firstName: "Sam",
        lastName: "Rivera",
        age: 31,
        heightCm: 175,
        weightKg: 72,
        sex: "Female",
        activity: "Moderate"
      }
    });
  expect(response.status).toBe(200);
  return getCsrf(agent);
};

const postMetric = (agent, csrfToken, body) =>
  agent.post("/api/dashboard/progress-metrics").set("X-CSRF-Token", csrfToken).send(body);

describe("POST /api/dashboard/progress-metrics", () => {
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
    csrfToken = await signUp(agent, "progress-metrics@example.com");
  });

  test("stores a metric and echoes it back alongside the dashboard", async () => {
    const response = await postMetric(agent, csrfToken, {
      date: "2026-04-01",
      weightLb: 168.5,
      bodyFatPct: 19.2,
      waistCm: 81,
      restingHr: 54,
      notes: "morning"
    });

    expect(response.status).toBe(200);
    expect(response.body.progressMetric).toMatchObject({
      date: "2026-04-01",
      weightLb: 168.5,
      bodyFatPct: 19.2,
      waistCm: 81,
      restingHr: 54,
      notes: "morning"
    });
    expect(response.body.dashboard).toBeTruthy();

    const rows = await prisma.progressMetric.findMany();
    expect(rows).toHaveLength(1);
    // Decimal columns must come back as numbers, not Prisma Decimal objects.
    expect(Number(rows[0].weightLb)).toBe(168.5);
  });

  test("returns the new metric in the dashboard payload", async () => {
    const response = await postMetric(agent, csrfToken, {
      date: "2026-04-02",
      weightLb: 170
    });

    const metrics = response.body.dashboard?.progressMetrics || [];
    expect(metrics.some((m) => m.date === "2026-04-02")).toBe(true);
  });

  test("updates in place when the same id is sent twice", async () => {
    const first = await postMetric(agent, csrfToken, {
      id: "metric-fixed-1",
      date: "2026-04-03",
      weightLb: 180
    });
    expect(first.status).toBe(200);

    const second = await postMetric(agent, csrfToken, {
      id: "metric-fixed-1",
      date: "2026-04-03",
      weightLb: 175
    });
    expect(second.status).toBe(200);

    const rows = await prisma.progressMetric.findMany();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].weightLb)).toBe(175);
  });

  test("creates separate rows for distinct ids", async () => {
    await postMetric(agent, csrfToken, { id: "m-a", date: "2026-04-04", weightLb: 180 });
    await postMetric(agent, csrfToken, { id: "m-b", date: "2026-04-05", weightLb: 181 });

    expect(await prisma.progressMetric.count()).toBe(2);
  });

  test("rejects a request with no date", async () => {
    const response = await postMetric(agent, csrfToken, { weightLb: 170 });

    expect(response.status).toBe(400);
    expect(await prisma.progressMetric.count()).toBe(0);
  });

  test("rejects a request carrying a date but no actual metric", async () => {
    const response = await postMetric(agent, csrfToken, { date: "2026-04-06" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/at least one metric/i);
    expect(await prisma.progressMetric.count()).toBe(0);
  });

  test("stores partial submissions, leaving absent fields null", async () => {
    const response = await postMetric(agent, csrfToken, {
      date: "2026-04-07",
      restingHr: 58
    });

    expect(response.status).toBe(200);
    const [row] = await prisma.progressMetric.findMany();
    expect(row.restingHr).toBe(58);
    expect(row.weightLb).toBeNull();
    expect(row.bodyFatPct).toBeNull();
    expect(row.waistCm).toBeNull();
  });

  test("requires authentication", async () => {
    const anon = request.agent(app);
    const anonCsrf = await getCsrf(anon);

    const response = await anon
      .post("/api/dashboard/progress-metrics")
      .set("X-CSRF-Token", anonCsrf)
      .send({ date: "2026-04-08", weightLb: 170 });

    expect(response.status).toBe(401);
  });

  test("scopes metrics to the signed-in user", async () => {
    await postMetric(agent, csrfToken, { date: "2026-04-09", weightLb: 170 });

    const other = request.agent(app);
    const otherCsrf = await signUp(other, "progress-other@example.com");
    const response = await other
      .get("/api/dashboard/progress-metrics")
      .set("X-CSRF-Token", otherCsrf);

    expect(response.status).toBe(200);
    expect(response.body.progressMetrics).toEqual([]);
  });
});
