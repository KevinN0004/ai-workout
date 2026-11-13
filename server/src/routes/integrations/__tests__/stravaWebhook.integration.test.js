import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import request from "supertest";
import { app } from "../../../index.js";
import { prisma } from "../../../db/prisma.js";

// Strava's webhook over the wire (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "The webhook"), against real
// Postgres, with Strava stubbed at fetch. Events are handled after the 200, so
// each test waits on the database rather than on a timer. The settings are read
// per request; the originals, as dotenv left them, are restored (ADR 0011).

const NAMES = [
  "STRAVA_CLIENT_ID",
  "STRAVA_CLIENT_SECRET",
  "STRAVA_TOKEN_KEY",
  "STRAVA_BASE_URL",
  "STRAVA_WEBHOOK_VERIFY_TOKEN",
  "STRAVA_WEBHOOK_SUBSCRIPTION_ID"
];
const ORIGINAL = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
const SETTINGS = {
  STRAVA_CLIENT_ID: "12345",
  STRAVA_CLIENT_SECRET: "webhook-test-secret",
  STRAVA_TOKEN_KEY: Buffer.alloc(32).toString("base64"),
  STRAVA_BASE_URL: "http://strava.test",
  STRAVA_WEBHOOK_VERIFY_TOKEN: "verify-webhook",
  STRAVA_WEBHOOK_SUBSCRIPTION_ID: "77"
};
const EMAIL = "strava-webhook@example.com";
const ATHLETE = 778001;

// Strava as this file needs it: the OAuth token endpoint, and activities by id.
// `refreshRefused` makes a refresh fail as a revoked grant does.
let activities;
let refreshRefused;
let stravaCalls;
const fakeStrava = async (url, init = {}) => {
  const { pathname } = new URL(String(url));
  stravaCalls.push(pathname);
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  if (pathname === "/oauth/token") {
    const grant = new URLSearchParams(String(init.body)).get("grant_type");
    if (grant === "refresh_token" && refreshRefused) return json(400, { message: "Bad Request" });
    return json(200, {
      access_token: "access-wh",
      refresh_token: "refresh-wh",
      expires_at: Math.floor(Date.now() / 1000) + 21600,
      athlete: { id: ATHLETE, firstname: "Jo", lastname: "Vance" }
    });
  }
  const match = /^\/api\/v3\/activities\/(\d+)$/.exec(pathname);
  if (match) {
    const activity = activities.get(match[1]);
    return activity ? json(200, activity) : json(404, { message: "Record Not Found" });
  }
  return json(404, {});
};

const runOf = (id, overrides = {}) => ({
  id: Number(id),
  name: "Lunch run",
  sport_type: "Run",
  start_date_local: "2026-11-12T12:00:00Z",
  moving_time: 1800,
  distance: 5000,
  has_heartrate: true,
  average_heartrate: 150,
  ...overrides
});

const eventOf = (overrides = {}) => ({
  object_type: "activity",
  object_id: 6001,
  aspect_type: "create",
  updates: {},
  owner_id: ATHLETE,
  subscription_id: 77,
  event_time: 1794600000,
  ...overrides
});

const getCsrf = async (agent) => String((await agent.get("/api/csrf-token")).body?.csrfToken || "");

// Signs up and connects through the routes, as a browser would.
const connectedUser = async () => {
  const agent = request.agent(app);
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
  const csrfToken = await getCsrf(agent);
  const started = await agent
    .post("/api/integrations/strava/connect")
    .set("X-CSRF-Token", csrfToken)
    .expect(200);
  const state = new URL(started.body.url).searchParams.get("state");
  await agent
    .get(`/api/integrations/strava/callback?code=c&state=${state}&scope=activity:read_all`)
    .expect(302);
  return prisma.appUser.findFirst({ where: { email: EMAIL } });
};

const post = (body) => request(app).post("/webhooks/strava").send(body).expect(200);
const importsOf = (userId) =>
  prisma.workoutSession.findMany({ where: { userId, source: "strava" } });
// Lets the event handled after a response run to its end.
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.appUser.deleteMany({ where: { email: EMAIL } });
  Object.assign(process.env, SETTINGS);
  activities = new Map();
  refreshRefused = false;
  stravaCalls = [];
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
  await prisma.appUser.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("the subscription's setup check", () => {
  test("echoes the challenge for this server's verify token, and refuses another", async () => {
    const answered = await request(app)
      .get("/webhooks/strava?hub.mode=subscribe&hub.verify_token=verify-webhook&hub.challenge=c-1")
      .expect(200);
    expect(answered.body).toEqual({ "hub.challenge": "c-1" });

    await request(app)
      .get("/webhooks/strava?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=c-1")
      .expect(403);
  });

  test("needs no CSRF token, being outside /api", async () => {
    await request(app)
      .post("/webhooks/strava")
      .send(eventOf({ subscription_id: 1 }))
      .expect(200);
  });
});

describe("events", () => {
  test("a create imports the activity, an update changes it, and a delete Strava confirms removes it", async () => {
    const user = await connectedUser();
    activities.set("6001", runOf("6001"));

    await post(eventOf());
    await vi.waitFor(async () => expect(await importsOf(user.id)).toHaveLength(1));
    const [created] = await importsOf(user.id);
    expect(created).toMatchObject({ externalId: "6001", sport: "Run", notes: "Lunch run" });
    expect(Number(created.distanceMeters)).toBe(5000);

    activities.set("6001", runOf("6001", { name: "Renamed in Strava" }));
    await post(eventOf({ aspect_type: "update", updates: { title: "Renamed in Strava" } }));
    await vi.waitFor(async () =>
      expect((await importsOf(user.id))[0].notes).toBe("Renamed in Strava")
    );

    activities.delete("6001");
    await post(eventOf({ aspect_type: "delete" }));
    await vi.waitFor(async () => expect(await importsOf(user.id)).toHaveLength(0));
  });

  test("a delete of an activity Strava still has removes nothing", async () => {
    const user = await connectedUser();
    activities.set("6001", runOf("6001"));
    await post(eventOf());
    await vi.waitFor(async () => expect(await importsOf(user.id)).toHaveLength(1));

    await post(eventOf({ aspect_type: "delete" }));
    await vi.waitFor(() =>
      expect(stravaCalls.filter((path) => path === "/api/v3/activities/6001")).toHaveLength(2)
    );
    await settle();
    expect(await importsOf(user.id)).toHaveLength(1);
  });

  test("an event for another subscription is ignored, and Strava is not asked", async () => {
    const user = await connectedUser();
    activities.set("6001", runOf("6001"));
    const before = stravaCalls.length;

    await post(eventOf({ subscription_id: 78 }));
    await settle();

    expect(stravaCalls.length).toBe(before);
    expect(await importsOf(user.id)).toHaveLength(0);
  });

  test("a revoke the refresh refutes changes nothing; one Strava confirms disconnects", async () => {
    const user = await connectedUser();
    activities.set("6001", runOf("6001"));
    await post(eventOf());
    await vi.waitFor(async () => expect(await importsOf(user.id)).toHaveLength(1));
    const revoke = eventOf({
      object_type: "athlete",
      object_id: ATHLETE,
      aspect_type: "update",
      updates: { authorized: "false" }
    });

    await post(revoke);
    await vi.waitFor(() =>
      expect(stravaCalls.filter((path) => path === "/oauth/token")).toHaveLength(2)
    );
    await settle();
    expect(await prisma.stravaConnection.count({ where: { userId: user.id } })).toBe(1);
    expect(await importsOf(user.id)).toHaveLength(1);

    refreshRefused = true;
    await post(revoke);
    await vi.waitFor(async () =>
      expect(await prisma.stravaConnection.count({ where: { userId: user.id } })).toBe(0)
    );
    expect(await importsOf(user.id)).toHaveLength(0);
  });
});

describe("without the webhook's settings", () => {
  test("both routes answer 404", async () => {
    process.env.STRAVA_WEBHOOK_VERIFY_TOKEN = "";
    process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID = "";

    await request(app)
      .get("/webhooks/strava?hub.verify_token=verify-webhook&hub.challenge=c")
      .expect(404);
    await request(app).post("/webhooks/strava").send(eventOf()).expect(404);
  });
});

// Last, since the limit's window outlasts the file.
describe("the webhook's own limit", () => {
  test("a flood is cut off at 120 requests a minute", async () => {
    let last;
    for (let count = 0; count < 121; count += 1) {
      last = await request(app).get("/webhooks/strava?hub.verify_token=x&hub.challenge=c");
    }
    expect(last.status).toBe(429);
    expect(last.body).toEqual({ error: "Too many requests." });
  });
});
