import { describe, expect, test, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerStravaWebhook } from "../registerStravaWebhook.js";

// Strava's webhook (roadmap C2, docs/specs/2026-11-12-strava-import-design.md,
// "The webhook"), with the service stubbed: the subscription's setup check, and
// an event answered at once and handled after. stravaWebhook.integration.test.js
// runs it against Postgres.

const PATH = "/webhooks/strava";
const CONFIG = { verifyToken: "verify-me", subscriptionId: 77 };

const buildApp = ({ config = CONFIG, handleEvent = vi.fn(async () => "create") } = {}) => {
  const app = express();
  app.use(express.json());
  const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  app.use((req, _res, next) => {
    req.log = log;
    next();
  });
  const scheduled = [];
  const limiterCalls = [];
  registerStravaWebhook(app, {
    getStravaConfig: () => config,
    stravaService: { handleEvent },
    stravaWebhookLimiter: (_req, _res, next) => {
      limiterCalls.push(1);
      next();
    },
    scheduleStravaEvent: (task) => scheduled.push(task)
  });
  return { app, handleEvent, scheduled, log, limiterCalls };
};

const setup = (query) => `${PATH}?${new URLSearchParams(query)}`;

describe("GET /webhooks/strava, the subscription's setup check", () => {
  test("the right verify token gets its challenge back, as JSON", async () => {
    const { app, limiterCalls } = buildApp();

    const response = await request(app)
      .get(
        setup({
          "hub.mode": "subscribe",
          "hub.verify_token": "verify-me",
          "hub.challenge": "abc123"
        })
      )
      .expect(200);

    expect(response.body).toEqual({ "hub.challenge": "abc123" });
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(limiterCalls).toHaveLength(1);
  });

  test.each([
    ["a wrong token", { "hub.verify_token": "guess", "hub.challenge": "abc" }],
    ["no token", { "hub.challenge": "abc" }]
  ])("%s is refused", async (_label, query) => {
    await request(buildApp().app).get(setup(query)).expect(403);
  });

  test("no challenge is a bad request", async () => {
    await request(buildApp().app)
      .get(setup({ "hub.verify_token": "verify-me" }))
      .expect(400);
  });

  test.each([
    ["no verify token configured", { subscriptionId: 77, verifyToken: null }],
    ["no Strava configured", null]
  ])("with %s it is a 404", async (_label, config) => {
    await request(buildApp({ config }).app)
      .get(setup({ "hub.verify_token": "verify-me", "hub.challenge": "abc" }))
      .expect(404);
  });
});

describe("POST /webhooks/strava, an event", () => {
  const EVENT = { object_type: "activity", object_id: 9001, owner_id: 4242, subscription_id: 77 };

  test("is answered 200 at once, and handled only after", async () => {
    const { app, handleEvent, scheduled, log, limiterCalls } = buildApp();

    const response = await request(app).post(PATH).send(EVENT).expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(handleEvent).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(handleEvent).toHaveBeenCalledWith(EVENT, log);
    expect(limiterCalls).toHaveLength(1);
  });

  test("a body that is not an event is still answered 200, for the service to ignore", async () => {
    const { app, scheduled, handleEvent } = buildApp();

    await request(app).post(PATH).send("not json").set("Content-Type", "text/plain").expect(200);
    await scheduled[0]();
    expect(handleEvent).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["no subscription configured", { verifyToken: "verify-me", subscriptionId: null }],
    ["no Strava configured", null]
  ])("with %s it is a 404, and nothing is handled", async (_label, config) => {
    const { app, scheduled } = buildApp({ config });
    await request(app).post(PATH).send(EVENT).expect(404);
    expect(scheduled).toEqual([]);
  });
});
