import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app, __testables } from "./index.js";

const {
  buildDashboard,
  buildMealLogEntry,
  buildProfile,
  buildWorkoutSessionEntry,
  cleanText,
  isCompleteSignupProfile,
  parseCookies,
  parseEnvBoolean,
  parseRedisPort,
  toNullableNumber,
  weatherCodeToText
} = __testables;

let server;
let baseUrl = "";

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => {
    server.once("listening", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

describe("server utilities", () => {
  test("cleanText trims and enforces max length", () => {
    expect(cleanText("   hello  ", 10)).toBe("hello");
    expect(cleanText("abcdefghijk", 5)).toBe("abcde");
    expect(cleanText(null, 5)).toBe("");
  });

  test("toNullableNumber parses numbers and enforces range", () => {
    expect(toNullableNumber("42", 1, 100)).toBe(42);
    expect(toNullableNumber("", 1, 100)).toBeNull();
    expect(toNullableNumber("abc", 1, 100)).toBeNull();
    expect(toNullableNumber(200, 1, 100)).toBeNull();
  });

  test("buildWorkoutSessionEntry sanitizes input values", () => {
    const entry = buildWorkoutSessionEntry({
      date: "2026-03-02",
      focus: " Strength ",
      duration: "45",
      exercises: [" Squat ", "", " Bench "],
      sets: "5",
      reps: "5",
      intensityRpe: "8",
      notes: " good session "
    });

    expect(entry.id).toBeTruthy();
    expect(entry.date).toBe("2026-03-02");
    expect(entry.focus).toBe("Strength");
    expect(entry.duration).toBe(45);
    expect(entry.exercises).toEqual(["Squat", "Bench"]);
    expect(entry.sets).toBe(5);
    expect(entry.reps).toBe(5);
    expect(entry.intensityRpe).toBe(8);
    expect(entry.notes).toBe("good session");
  });

  test("buildMealLogEntry falls back invalid meal type to other", () => {
    const entry = buildMealLogEntry({
      date: "2026-03-02",
      mealType: "invalid",
      name: "Chicken bowl",
      calories: "650"
    });

    expect(entry.mealType).toBe("other");
    expect(entry.name).toBe("Chicken bowl");
    expect(entry.calories).toBe(650);
  });

  test("buildProfile and completion check enforce required profile details", () => {
    const complete = buildProfile({
      firstName: "Jordan",
      lastName: "Lee",
      age: 28,
      heightCm: 175,
      weightKg: 72,
      sex: "Male",
      activity: "High"
    });
    expect(isCompleteSignupProfile(complete)).toBe(true);
    expect(complete.name).toBe("Jordan Lee");

    const incomplete = buildProfile({
      firstName: "Jordan",
      lastName: "Lee"
    });
    expect(isCompleteSignupProfile(incomplete)).toBe(false);
  });

  test("buildDashboard limits list sizes and normalizes goals", () => {
    const workouts = Array.from({ length: 600 }, (_, index) => ({ id: String(index) }));
    const dashboard = buildDashboard({
      workouts,
      goals: {
        targetWeight: "170",
        targetCalories: "2400",
        weeklyWorkouts: "4"
      }
    });

    expect(dashboard.workouts).toHaveLength(500);
    expect(dashboard.goals.targetWeight).toBe(170);
    expect(dashboard.goals.targetCalories).toBe(2400);
    expect(dashboard.goals.weeklyWorkouts).toBe(4);
  });

  test("cookie and environment helpers parse values safely", () => {
    const cookies = parseCookies("sid=abc123; name=John%20Doe");
    expect(cookies.sid).toBe("abc123");
    expect(cookies.name).toBe("John Doe");

    expect(parseRedisPort("6379")).toBe(6379);
    expect(parseRedisPort("70000")).toBeNull();

    expect(parseEnvBoolean("true", false)).toBe(true);
    expect(parseEnvBoolean("off", true)).toBe(false);
    expect(parseEnvBoolean("unknown", true)).toBe(true);
  });

  test("weatherCodeToText maps known weather codes", () => {
    expect(weatherCodeToText(0)).toBe("Clear sky");
    expect(weatherCodeToText(63)).toBe("Rain");
    expect(weatherCodeToText(99)).toBe("Thunderstorm");
  });
});

describe("server routes", () => {
  test("GET /api/health returns ok", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId.length).toBeGreaterThan(10);
  });

  test("GET /api/dashboard returns 401 when unauthenticated", async () => {
    const response = await fetch(`${baseUrl}/api/dashboard`);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toMatch(/not signed in/i);
  });

  test("GET /api/weather/current validates coordinates", async () => {
    const response = await fetch(`${baseUrl}/api/weather/current?latitude=200&longitude=10`);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/latitude and longitude/i);
  });

  test("POST /api/generate fails fast when GEMINI_API_KEY is missing", async () => {
    const previousApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "";

    const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`);
    const csrfPayload = await csrfResponse.json();
    const csrfToken = String(csrfPayload?.csrfToken || "");
    const csrfCookieRaw = csrfResponse.headers.get("set-cookie") || "";
    const csrfCookie = csrfCookieRaw.split(";")[0];

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie
      },
      body: JSON.stringify({})
    });
    const body = await response.json();

    process.env.GEMINI_API_KEY = previousApiKey;

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/missing gemini_api_key/i);
  });
});
