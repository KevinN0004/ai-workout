import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../db/prisma.js";
import { createTokenCipher } from "../../../services/integrations/tokenCipher.js";

// Connecting and disconnecting Strava over the wire (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "Connecting" and
// "Disconnecting, and deleting the account"), against real Postgres, with
// Strava stubbed at fetch. The settings are read per request, so each test sets
// them; the originals, as dotenv left them, are restored after the file (ADR 0011).

const NAMES = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_TOKEN_KEY", "STRAVA_BASE_URL"];
const ORIGINAL = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
const KEY = Buffer.alloc(32);
const SETTINGS = {
  STRAVA_CLIENT_ID: "12345",
  STRAVA_CLIENT_SECRET: "integration-test-secret",
  STRAVA_TOKEN_KEY: KEY.toString("base64"),
  STRAVA_BASE_URL: "http://strava.test"
};
const SECRETS = ["integration-test-secret", "access-int", "refresh-int", "code-int"];
const EMAILS = ["strava-connect-a@example.com", "strava-connect-b@example.com"];
const cipher = createTokenCipher(KEY);

// Strava's two OAuth endpoints, as this file needs them; `revokeFails` makes
// the revoke unreachable.
let stravaCalls;
let revokeFails;
const fakeStrava = async (url, init = {}) => {
  const path = new URL(String(url)).pathname;
  stravaCalls.push({ path, body: String(init.body || "") });
  if (path === "/oauth/token") {
    return new Response(
      JSON.stringify({
        access_token: "access-int",
        refresh_token: "refresh-int",
        expires_at: Math.floor(Date.now() / 1000) + 21600,
        athlete: { id: 777001, firstname: "Jo", lastname: "Vance" }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  if (path === "/oauth/revoke") {
    if (revokeFails) throw new TypeError("fetch failed");
    return new Response("", { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

const getCsrf = async (agent) => String((await agent.get("/api/csrf-token")).body?.csrfToken || "");

// The token first: supertest closes its shared server once no request is
// pending, so a request built before another one finishes is sent to nothing.
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

// Connects the signed-in `agent` through the routes, as a browser would, and
// answers where Strava's return landed.
const connectThrough = async (agent, csrfToken) => {
  const started = await agent
    .post("/api/integrations/strava/connect")
    .set("X-CSRF-Token", csrfToken)
    .expect(200);
  const state = new URL(started.body.url).searchParams.get("state");
  const landed = await agent
    .get(
      `/api/integrations/strava/callback?code=code-int&state=${state}&scope=read,activity:read_all`
    )
    .expect(302);
  return { started, landed };
};

const userOf = (email) => prisma.appUser.findFirst({ where: { email } });
const cleanUp = () => prisma.appUser.deleteMany({ where: { email: { in: EMAILS } } });

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await cleanUp();
  Object.assign(process.env, SETTINGS);
  stravaCalls = [];
  revokeFails = false;
  vi.stubGlobal("fetch", vi.fn(fakeStrava));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  for (const name of NAMES) {
    if (ORIGINAL[name] === undefined) delete process.env[name];
    else process.env[name] = ORIGINAL[name];
  }
  await cleanUp();
  await prisma.$disconnect();
});

describe("connecting Strava", () => {
  test("Strava's return stores the tokens sealed, and the state shows the athlete", async () => {
    const agent = request.agent(app);
    const csrfToken = await signUp(agent, EMAILS[0]);

    const { started, landed } = await connectThrough(agent, csrfToken);

    expect(new URL(started.body.url).origin).toBe("http://strava.test");
    expect(landed.headers.location).toBe("/dashboard/settings?strava=connected");
    const user = await userOf(EMAILS[0]);
    const row = await prisma.stravaConnection.findUnique({ where: { userId: user.id } });
    expect(row.accessToken).not.toContain("access-int");
    expect(cipher.open(row.accessToken)).toBe("access-int");
    expect(cipher.open(row.refreshToken)).toBe("refresh-int");
    expect(Number(row.athleteId)).toBe(777001);

    const state = await agent.get("/api/integrations/strava").expect(200);
    expect(state.body).toMatchObject({ available: true, connected: true, athleteName: "Jo V." });
    for (const secret of SECRETS) {
      expect(JSON.stringify([started.body, state.body])).not.toContain(secret);
    }
  });

  test("a return without the state this browser was given connects nothing", async () => {
    const agent = request.agent(app);
    await signUp(agent, EMAILS[0]);

    const landed = await agent
      .get("/api/integrations/strava/callback?code=code-int&state=forged&scope=activity:read_all")
      .expect(302);

    expect(landed.headers.location).toBe("/dashboard/settings?strava=failed");
    expect(await prisma.stravaConnection.count({ where: { user: { email: EMAILS[0] } } })).toBe(0);
    expect(stravaCalls).toEqual([]);
  });

  test("a second account connecting the same athlete is told it is taken", async () => {
    const first = request.agent(app);
    await connectThrough(first, await signUp(first, EMAILS[0]));
    const second = request.agent(app);

    const { landed } = await connectThrough(second, await signUp(second, EMAILS[1]));

    expect(landed.headers.location).toBe("/dashboard/settings?strava=taken");
    expect(await prisma.stravaConnection.count({ where: { user: { email: EMAILS[1] } } })).toBe(0);
    // The first account's link stays, and nothing was revoked for it.
    expect(await prisma.stravaConnection.count({ where: { user: { email: EMAILS[0] } } })).toBe(1);
    expect(stravaCalls.filter((call) => call.path === "/oauth/revoke")).toEqual([]);
  });
});

describe("disconnecting Strava", () => {
  test("revokes, then removes the connection and the imports, and keeps app workouts", async () => {
    const agent = request.agent(app);
    const csrfToken = await signUp(agent, EMAILS[0]);
    await connectThrough(agent, csrfToken);
    const user = await userOf(EMAILS[0]);
    const date = new Date("2026-11-12T00:00:00Z");
    await prisma.workoutSession.create({
      data: { userId: user.id, workoutDate: date, source: "strava", externalId: "5001" }
    });
    const own = await prisma.workoutSession.create({
      data: { userId: user.id, workoutDate: date }
    });

    await agent.delete("/api/integrations/strava").set("X-CSRF-Token", csrfToken).expect(200);

    const revoke = stravaCalls.find((call) => call.path === "/oauth/revoke");
    expect(new URLSearchParams(revoke.body).get("token")).toBe("refresh-int");
    expect(await prisma.stravaConnection.count({ where: { userId: user.id } })).toBe(0);
    const left = await prisma.workoutSession.findMany({ where: { userId: user.id } });
    expect(left.map((row) => row.id)).toEqual([own.id]);
    const state = await agent.get("/api/integrations/strava").expect(200);
    expect(state.body).toMatchObject({ available: true, connected: false });
  });

  test("a revoke Strava does not answer still disconnects", async () => {
    const agent = request.agent(app);
    const csrfToken = await signUp(agent, EMAILS[0]);
    await connectThrough(agent, csrfToken);
    revokeFails = true;

    await agent.delete("/api/integrations/strava").set("X-CSRF-Token", csrfToken).expect(200);

    expect(await prisma.stravaConnection.count({ where: { user: { email: EMAILS[0] } } })).toBe(0);
  });
});

describe("deleting the account", () => {
  test.each([
    ["Strava answers", false],
    ["Strava does not answer", true]
  ])(
    "revokes Strava's access first, and the account goes either way (%s)",
    async (_label, fails) => {
      const agent = request.agent(app);
      const csrfToken = await signUp(agent, EMAILS[0]);
      await connectThrough(agent, csrfToken);
      revokeFails = fails;

      await agent
        .delete("/api/auth/me")
        .set("X-CSRF-Token", csrfToken)
        .send({ password: "StrongPass123!" })
        .expect(200);

      expect(stravaCalls.some((call) => call.path === "/oauth/revoke")).toBe(true);
      expect(await userOf(EMAILS[0])).toBeNull();
      expect(await prisma.stravaConnection.count({ where: { athleteId: 777001n } })).toBe(0);
    }
  );
});

describe("without Strava's settings", () => {
  test("the state says not available, and the other routes answer 404", async () => {
    for (const name of NAMES) process.env[name] = "";
    const agent = request.agent(app);
    const csrfToken = await signUp(agent, EMAILS[0]);

    const state = await agent.get("/api/integrations/strava").expect(200);
    expect(state.body).toEqual({
      available: false,
      connected: false,
      athleteName: "",
      lastSyncedAt: null,
      lastSyncError: null,
      needsReconnect: false
    });
    await agent.post("/api/integrations/strava/connect").set("X-CSRF-Token", csrfToken).expect(404);
    await agent.get("/api/integrations/strava/callback?code=x&state=y").expect(404);
    await agent.delete("/api/integrations/strava").set("X-CSRF-Token", csrfToken).expect(404);
  });
});
