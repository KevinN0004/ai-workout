import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../db/prisma.js";

// The catch-up sync and deleting an import over the wire (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "Catch-up sync" and
// "Deleting an import"), against real Postgres, with Strava stubbed at fetch.
// The throttle reads the service's clock, so each step moves Date forward (and
// only Date, so Postgres's own timers are untouched). The settings are read per
// request; the originals, as dotenv left them, are restored (ADR 0011).

const NAMES = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_TOKEN_KEY", "STRAVA_BASE_URL"];
const ORIGINAL = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
const SETTINGS = {
  STRAVA_CLIENT_ID: "12345",
  STRAVA_CLIENT_SECRET: "sync-test-secret",
  STRAVA_TOKEN_KEY: Buffer.alloc(32).toString("base64"),
  STRAVA_BASE_URL: "http://strava.test"
};
const EMAIL = "strava-sync@example.com";
const START = Date.parse("2026-11-13T10:00:00Z");
const TODAY = "2026-11-13";

// What Strava lists, as the test sets it.
let listed;
const fakeStrava = async (url) => {
  const { pathname, searchParams } = new URL(String(url));
  const json = (body) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  if (pathname === "/oauth/token") {
    return json({
      access_token: "access-sync",
      refresh_token: "refresh-sync",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      athlete: { id: 779001, firstname: "Jo", lastname: "Vance" }
    });
  }
  if (pathname === "/api/v3/athlete/activities") {
    return json(searchParams.get("page") === "1" ? listed : []);
  }
  return new Response("{}", { status: 404 });
};

const activityOf = (id, overrides = {}) => ({
  id,
  name: `Run ${id}`,
  sport_type: "Run",
  start_date_local: `${TODAY}T07:00:00Z`,
  moving_time: 1800,
  distance: 5000,
  has_heartrate: false,
  ...overrides
});

const getCsrf = async (agent) => String((await agent.get("/api/csrf-token")).body?.csrfToken || "");

let agent;
let csrfToken;
let user;

const sync = (body = {}) =>
  agent.post("/api/integrations/strava/sync").set("X-CSRF-Token", csrfToken).send(body).expect(200);
const importsOf = () =>
  prisma.workoutSession.findMany({
    where: { userId: user.id, source: "strava" },
    orderBy: { externalId: "asc" }
  });
const later = (minutes) => vi.setSystemTime(new Date(Date.now() + minutes * 60000));

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(START));
  await prisma.appUser.deleteMany({ where: { email: EMAIL } });
  Object.assign(process.env, SETTINGS);
  listed = [];
  vi.stubGlobal("fetch", vi.fn(fakeStrava));

  agent = request.agent(app);
  const signupToken = await getCsrf(agent);
  await agent
    .post("/api/auth/signup")
    .set("X-CSRF-Token", signupToken)
    .send({
      email: EMAIL,
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
    })
    .expect(200);
  csrfToken = await getCsrf(agent);
  const started = await agent
    .post("/api/integrations/strava/connect")
    .set("X-CSRF-Token", csrfToken)
    .expect(200);
  const state = new URL(started.body.url).searchParams.get("state");
  await agent
    .get(`/api/integrations/strava/callback?code=c&state=${state}&scope=activity:read_all`)
    .expect(302);
  user = await prisma.appUser.findFirst({ where: { email: EMAIL } });
  // Connected ten days ago, so the window is the last full week.
  await prisma.stravaConnection.update({
    where: { userId: user.id },
    data: { connectedAt: new Date(START - 10 * 24 * 3600000) }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  for (const name of NAMES) {
    if (ORIGINAL[name] === undefined) delete process.env[name];
    else process.env[name] = ORIGINAL[name];
  }
  await prisma.appUser.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("the catch-up sync", () => {
  test("imports what Strava lists, holds off a repeat, then follows its edits and deletes", async () => {
    listed = [activityOf(5001), activityOf(5002)];

    const first = await sync();
    expect(first.body).toEqual({
      imported: 2,
      updated: 0,
      removed: 0,
      lastSyncedAt: new Date(START).toISOString()
    });
    expect((await importsOf()).map((row) => row.externalId)).toEqual(["5001", "5002"]);

    expect((await sync()).body).toEqual({ skipped: true });

    later(2);
    listed = [activityOf(5001, { name: "Renamed in Strava" })];
    const second = await sync({ manual: true });
    expect(second.body).toMatchObject({ imported: 0, updated: 1, removed: 1 });
    const rows = await importsOf();
    expect(rows.map((row) => [row.externalId, row.notes])).toEqual([["5001", "Renamed in Strava"]]);

    const state = await agent.get("/api/integrations/strava").expect(200);
    expect(state.body.lastSyncedAt).toBe(new Date(START + 2 * 60000).toISOString());
  });

  test("an unchanged list rewrites nothing and counts nothing", async () => {
    listed = [activityOf(5001)];
    await sync();
    const [before] = await importsOf();

    later(16);
    expect((await sync()).body).toMatchObject({ imported: 0, updated: 0, removed: 0 });
    expect((await importsOf())[0].updatedAt).toEqual(before.updatedAt);
  });

  test("a strength activity on a day with a workout logged here is not imported", async () => {
    await prisma.workoutSession.create({
      data: { userId: user.id, workoutDate: new Date(`${TODAY}T00:00:00Z`), focus: "Upper body" }
    });
    listed = [activityOf(5003, { sport_type: "WeightTraining" }), activityOf(5004)];

    expect((await sync()).body).toMatchObject({ imported: 1 });
    expect((await importsOf()).map((row) => row.externalId)).toEqual(["5004"]);
  });
});

describe("deleting an import", () => {
  test("deletes it, answers the dashboard without it, and no sync brings it back", async () => {
    listed = [activityOf(5001), activityOf(5002)];
    await sync();
    const [first] = await importsOf();

    const deleted = await agent
      .delete(`/api/dashboard/workouts/${first.id}`)
      .set("X-CSRF-Token", csrfToken)
      .expect(200);

    expect(deleted.body.ok).toBe(true);
    const shown = deleted.body.dashboard.workoutSessions.map((session) => session.externalId);
    expect(shown).not.toContain("5001");
    expect(shown).toContain("5002");

    later(16);
    expect((await sync()).body).toMatchObject({ imported: 0 });
    expect((await importsOf()).map((row) => row.externalId)).toEqual(["5002"]);
  });

  test("a workout logged in the app is a 404, and stays", async () => {
    const own = await prisma.workoutSession.create({
      data: { userId: user.id, workoutDate: new Date(`${TODAY}T00:00:00Z`) }
    });

    await agent
      .delete(`/api/dashboard/workouts/${own.id}`)
      .set("X-CSRF-Token", csrfToken)
      .expect(404);

    expect(await prisma.workoutSession.count({ where: { id: own.id } })).toBe(1);
  });

  test("another user's import is a 404, and stays", async () => {
    const other = await prisma.appUser.create({
      data: { email: "strava-sync-other@example.com", passwordHash: "x" }
    });
    try {
      const theirs = await prisma.workoutSession.create({
        data: {
          userId: other.id,
          workoutDate: new Date(`${TODAY}T00:00:00Z`),
          source: "strava",
          externalId: "6001"
        }
      });

      await agent
        .delete(`/api/dashboard/workouts/${theirs.id}`)
        .set("X-CSRF-Token", csrfToken)
        .expect(404);

      expect(await prisma.workoutSession.count({ where: { id: theirs.id } })).toBe(1);
    } finally {
      await prisma.appUser.delete({ where: { id: other.id } });
    }
  });
});

describe("without Strava's settings", () => {
  test("the sync answers 404", async () => {
    for (const name of NAMES) process.env[name] = "";
    await agent.post("/api/integrations/strava/sync").set("X-CSRF-Token", csrfToken).expect(404);
  });
});
