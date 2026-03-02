import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { connectDatabase } from "./db.js";
import { app } from "./index.js";
import MealLog from "./models/MealLog.js";
import ProgressMetric from "./models/ProgressMetric.js";
import User from "./models/User.js";
import WorkoutSession from "./models/WorkoutSession.js";

let mongoServer;

const getCsrf = async (agent) => {
  const response = await agent.get("/api/csrf-token");
  return String(response.body?.csrfToken || "");
};

const toRequestUrl = (input) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return String(input?.url || "");
};

describe("api integration", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongoServer.getUri();
    await connectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      WorkoutSession.deleteMany({}),
      MealLog.deleteMany({}),
      ProgressMetric.deleteMany({})
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  test("signup -> auth/me -> dashboard mutation works with real mongodb", async () => {
    const agent = request.agent(app);
    const csrfToken = await getCsrf(agent);

    const signupResponse = await agent.post("/api/auth/signup").set("X-CSRF-Token", csrfToken).send({
      email: "integration-realdb@example.com",
      password: "StrongPass123!",
      profile: {
        firstName: "Jordan",
        lastName: "Kim",
        age: 29,
        heightCm: 178,
        weightKg: 76,
        sex: "Male",
        activity: "Moderate"
      }
    });
    expect(signupResponse.status).toBe(200);

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(200);
    expect(meResponse.body?.user?.email).toBe("integration-realdb@example.com");

    const authedCsrf = await getCsrf(agent);
    const workoutResponse = await agent
      .post("/api/dashboard/workout-sessions")
      .set("X-CSRF-Token", authedCsrf)
      .send({
        date: "2026-03-02",
        focus: "Push Day",
        duration: 48,
        exercises: ["Bench Press", "Overhead Press"],
        sets: 4,
        reps: 6
      });
    expect(workoutResponse.status).toBe(200);
    expect(workoutResponse.body?.workoutSession?.focus).toBe("Push Day");

    const listResponse = await agent.get("/api/dashboard/workout-sessions?limit=1&offset=0");
    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body?.workoutSessions)).toBe(true);
    expect(listResponse.body?.pagination?.limit).toBe(1);
  });

  test("query/path schema validation rejects invalid values", async () => {
    const weatherBad = await request(app).get("/api/weather/current?latitude=200&longitude=10");
    expect(weatherBad.status).toBe(400);
    expect(String(weatherBad.body?.error || "")).toMatch(/latitude and longitude/i);

    const wgerBadId = await request(app).get("/api/wger/exercises/not-a-number");
    expect(wgerBadId.status).toBe(400);
    expect(String(wgerBadId.body?.error || "")).toMatch(/exercise id/i);

    const agent = request.agent(app);
    const csrfToken = await getCsrf(agent);
    await agent.post("/api/auth/signup").set("X-CSRF-Token", csrfToken).send({
      email: "validation-check@example.com",
      password: "StrongPass123!",
      profile: {
        firstName: "A",
        lastName: "B",
        age: 24,
        heightCm: 168,
        weightKg: 63,
        sex: "Female",
        activity: "Light"
      }
    });
    const invalidPagination = await agent.get("/api/dashboard/workout-sessions?limit=100000");
    expect(invalidPagination.status).toBe(400);
    expect(String(invalidPagination.body?.error || "")).toMatch(/limit/i);
  });

  test("weather endpoint serves stale cached result when upstream fails after ttl", async () => {
    const originalFetch = global.fetch;
    const baseNow = Date.now();
    let nowOffset = 0;
    let callCount = 0;
    const latitude = 12.34567;
    const longitude = -98.76543;

    vi.spyOn(Date, "now").mockImplementation(() => baseNow + nowOffset);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const url = toRequestUrl(input);
        if (url.includes("/v1/forecast")) {
          callCount += 1;
          if (callCount === 1) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                latitude,
                longitude,
                timezone: "UTC",
                current: {
                  time: "2026-03-02T00:00",
                  temperature_2m: 19,
                  apparent_temperature: 19,
                  precipitation: 0,
                  weather_code: 1,
                  wind_speed_10m: 8,
                  relative_humidity_2m: 55,
                  is_day: 1
                }
              })
            };
          }
          return {
            ok: false,
            status: 500,
            json: async () => ({ reason: "forced upstream failure" })
          };
        }
        return originalFetch(input, init);
      })
    );

    const first = await request(app).get(`/api/weather/current?latitude=${latitude}&longitude=${longitude}`);
    expect(first.status).toBe(200);
    expect(first.body?.cache).toBe("miss");

    nowOffset = 301000;
    const second = await request(app).get(`/api/weather/current?latitude=${latitude}&longitude=${longitude}`);
    expect(second.status).toBe(200);
    expect(second.body?.cache).toBe("stale");
    expect(second.body?.fallback).not.toBe(true);
  });
});
