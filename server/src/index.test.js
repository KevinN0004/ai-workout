import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { app, __testables } from "./index.js";
import MealLog from "./models/MealLog.js";
import ProgressMetric from "./models/ProgressMetric.js";
import User from "./models/User.js";
import WorkoutSession from "./models/WorkoutSession.js";

const {
  buildDashboard,
  defaultDashboard,
  buildMealLogEntry,
  buildProfile,
  buildWorkoutSessionEntry,
  buildExternalCacheKey,
  cleanText,
  isCompleteSignupProfile,
  mergeCacheStatuses,
  parseCookies,
  parseEnvBoolean,
  parseRedisPort,
  serializeCacheKeyPart,
  toNullableNumber,
  weatherCodeToText
} = __testables;

let server;
let baseUrl = "";

const extractCookieFromHeader = (headerValue, cookieName) => {
  const raw = String(headerValue || "");
  const match = raw.match(new RegExp(`${cookieName}=([^;,\\s]+)`));
  if (!match) return "";
  return `${cookieName}=${match[1]}`;
};

const toRequestUrl = (input) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return String(input?.url || "");
};

const createFindChain = (items = []) => {
  const state = {
    rows: Array.isArray(items) ? items.map((item) => ({ ...item })) : []
  };
  return {
    sort(sortSpec = {}) {
      const [sortField, sortDir] = Object.entries(sortSpec)[0] || [];
      if (!sortField) return this;
      state.rows.sort((a, b) => {
        const left = String(a?.[sortField] || "");
        const right = String(b?.[sortField] || "");
        return sortDir === -1 ? right.localeCompare(left) : left.localeCompare(right);
      });
      return this;
    },
    skip(value) {
      const count = Number.isFinite(Number(value)) ? Number(value) : 0;
      state.rows = state.rows.slice(Math.max(0, count));
      return this;
    },
    limit(value) {
      const count = Number.isFinite(Number(value)) ? Number(value) : state.rows.length;
      state.rows = state.rows.slice(0, Math.max(0, count));
      return this;
    },
    lean: async () => state.rows.map((item) => ({ ...item }))
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  test("cache key serializer is stable across object key order", () => {
    const keyA = buildExternalCacheKey("wger", {
      endpoint: "exerciseinfo/",
      query: { limit: 20, offset: 0, muscles: [4, 2] }
    });
    const keyB = buildExternalCacheKey("wger", {
      query: { muscles: [4, 2], offset: 0, limit: 20 },
      endpoint: "exerciseinfo/"
    });

    expect(keyA).toBe(keyB);
    expect(serializeCacheKeyPart({ b: 2, a: 1 })).toBe("{a:1,b:2}");
  });

  test("mergeCacheStatuses prioritizes stale over hit and miss", () => {
    expect(mergeCacheStatuses("hit", "hit")).toBe("hit");
    expect(mergeCacheStatuses("miss", "hit")).toBe("miss");
    expect(mergeCacheStatuses("hit", "stale", "miss")).toBe("stale");
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

  test("POST /api/auth/logout rejects request with missing CSRF token", async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST"
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/csrf/i);
  });

  test("GET /api/ready reports redis fallback mode", async () => {
    const response = await fetch(`${baseUrl}/api/ready`);
    const body = await response.json();

    expect([200, 503]).toContain(response.status);
    expect(body.dependencies.redis.mode).toBe("in_memory_fallback");
    expect(body.dependencies.redis.connected).toBe(false);
    expect(typeof body.dependencies.errorTracking.provider).toBe("string");
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

  test("auth flow supports signup -> session me -> logout", async () => {
    const usersById = new Map();

    vi.spyOn(User, "findOne").mockImplementation(async (query = {}) => {
      if (query.userId) return usersById.get(query.userId) || null;
      if (query.email) {
        for (const user of usersById.values()) {
          if (user.email === query.email) return user;
        }
      }
      return null;
    });
    vi.spyOn(User, "create").mockImplementation(async (doc) => {
      usersById.set(doc.userId, { ...doc });
      return doc;
    });

    const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`);
    const csrfPayload = await csrfResponse.json();
    const csrfToken = String(csrfPayload?.csrfToken || "");
    const csrfCookie = extractCookieFromHeader(csrfResponse.headers.get("set-cookie"), "csrfToken");

    const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie
      },
      body: JSON.stringify({
        email: "integration-auth@example.com",
        password: "StrongPass123!",
        rememberMe: true,
        profile: {
          firstName: "Taylor",
          lastName: "Nguyen",
          age: 30,
          heightCm: 172,
          weightKg: 70,
          sex: "Male",
          activity: "Moderate"
        }
      })
    });
    expect(signupResponse.status).toBe(200);

    const signupSetCookie = signupResponse.headers.get("set-cookie") || "";
    const sidCookie = extractCookieFromHeader(signupSetCookie, "sid");
    expect(sidCookie).toMatch(/^sid=/);

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sidCookie }
    });
    const meBody = await meResponse.json();
    expect(meResponse.status).toBe(200);
    expect(meBody.user.email).toBe("integration-auth@example.com");

    const logoutCsrfResponse = await fetch(`${baseUrl}/api/csrf-token`, {
      headers: { Cookie: sidCookie }
    });
    const logoutCsrfPayload = await logoutCsrfResponse.json();
    const logoutCsrfToken = String(logoutCsrfPayload?.csrfToken || "");
    const logoutCsrfCookie = extractCookieFromHeader(
      logoutCsrfResponse.headers.get("set-cookie"),
      "csrfToken"
    );

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        "X-CSRF-Token": logoutCsrfToken,
        Cookie: [sidCookie, logoutCsrfCookie].filter(Boolean).join("; ")
      }
    });
    expect(logoutResponse.status).toBe(200);

    const afterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sidCookie }
    });
    expect(afterLogout.status).toBe(401);
  });

  test("dashboard workout mutation returns updated payload for signed-in user", async () => {
    const usersById = new Map();
    const workoutsByUser = new Map();
    const toUserDoc = (doc) => (doc ? { ...doc, toObject: () => ({ ...doc }) } : null);

    vi.spyOn(User, "findOne").mockImplementation(async (query = {}) => {
      if (query.userId) return toUserDoc(usersById.get(query.userId) || null);
      if (query.email) {
        for (const user of usersById.values()) {
          if (user.email === query.email) return toUserDoc(user);
        }
      }
      return null;
    });
    vi.spyOn(User, "create").mockImplementation(async (doc) => {
      usersById.set(doc.userId, { ...doc, dashboard: doc.dashboard || defaultDashboard() });
      return toUserDoc(doc);
    });
    vi.spyOn(User, "findOneAndUpdate").mockImplementation(async (query = {}, update = {}) => {
      const user = usersById.get(query.userId);
      if (!user) return null;
      if (update.$pull?.["dashboard.workouts"]?.id) {
        const removeId = update.$pull["dashboard.workouts"].id;
        user.dashboard.workouts = (user.dashboard.workouts || []).filter((item) => item.id !== removeId);
      }
      const pushCfg = update.$push?.["dashboard.workouts"];
      if (pushCfg?.$each) {
        const existing = Array.isArray(user.dashboard.workouts) ? user.dashboard.workouts : [];
        user.dashboard.workouts = [...pushCfg.$each, ...existing].slice(0, pushCfg.$slice || 500);
      }
      usersById.set(query.userId, user);
      return toUserDoc(user);
    });

    vi.spyOn(WorkoutSession, "findOneAndUpdate").mockImplementation(async (query = {}, update = {}) => {
      const list = workoutsByUser.get(query.userId) || [];
      const next = {
        ...(update.$set || {})
      };
      const withoutId = list.filter((item) => item.id !== next.id);
      workoutsByUser.set(query.userId, [next, ...withoutId]);
      return next;
    });
    vi.spyOn(WorkoutSession, "countDocuments").mockImplementation(async (query = {}) => {
      const list = workoutsByUser.get(query.userId) || [];
      return list.length;
    });
    vi.spyOn(WorkoutSession, "find").mockImplementation((query = {}) => {
      return createFindChain(workoutsByUser.get(query.userId) || []);
    });

    vi.spyOn(MealLog, "countDocuments").mockResolvedValue(0);
    vi.spyOn(MealLog, "find").mockImplementation(() => createFindChain([]));
    vi.spyOn(ProgressMetric, "countDocuments").mockResolvedValue(0);
    vi.spyOn(ProgressMetric, "find").mockImplementation(() => createFindChain([]));

    const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`);
    const csrfPayload = await csrfResponse.json();
    const csrfToken = String(csrfPayload?.csrfToken || "");
    const csrfCookie = extractCookieFromHeader(csrfResponse.headers.get("set-cookie"), "csrfToken");

    const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie
      },
      body: JSON.stringify({
        email: "integration-workout@example.com",
        password: "StrongPass123!",
        profile: {
          firstName: "Casey",
          lastName: "Tran",
          age: 31,
          heightCm: 176,
          weightKg: 74,
          sex: "Female",
          activity: "High"
        }
      })
    });
    expect(signupResponse.status).toBe(200);

    const sidCookie = extractCookieFromHeader(signupResponse.headers.get("set-cookie"), "sid");
    expect(sidCookie).toMatch(/^sid=/);

    const csrfAuthedResponse = await fetch(`${baseUrl}/api/csrf-token`, {
      headers: { Cookie: sidCookie }
    });
    const csrfAuthedPayload = await csrfAuthedResponse.json();
    const csrfAuthedToken = String(csrfAuthedPayload?.csrfToken || "");
    const csrfAuthedCookie = extractCookieFromHeader(
      csrfAuthedResponse.headers.get("set-cookie"),
      "csrfToken"
    );
    const authCookie = [sidCookie, csrfAuthedCookie].filter(Boolean).join("; ");

    const workoutResponse = await fetch(`${baseUrl}/api/dashboard/workout-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfAuthedToken,
        Cookie: authCookie
      },
      body: JSON.stringify({
        date: "2026-03-02",
        focus: "Lower Body",
        duration: 52,
        exercises: ["Squat", "Lunge"],
        sets: 4,
        reps: 8,
        intensityRpe: 7
      })
    });
    const workoutBody = await workoutResponse.json();

    expect(workoutResponse.status).toBe(200);
    expect(workoutBody.workoutSession.focus).toBe("Lower Body");
    expect(Array.isArray(workoutBody.dashboard.workoutSessions)).toBe(true);
    expect(workoutBody.dashboard.workoutSessions.length).toBeGreaterThan(0);
  });

  test("weather current returns fallback payload on upstream failure", async () => {
    const realFetch = global.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const url = toRequestUrl(input);
        if (url.startsWith(baseUrl)) {
          return realFetch(input, init);
        }
        return {
          ok: false,
          status: 503,
          json: async () => ({ reason: "simulated outage" })
        };
      })
    );

    const response = await fetch(`${baseUrl}/api/weather/current?latitude=38.1111&longitude=-122.5555`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.fallback).toBe(true);
    expect(body.service).toBe("open-meteo");
  });

  test("weather current serves stale cached payload when upstream fails after cache expiry", async () => {
    const realFetch = global.fetch;
    let upstreamCallCount = 0;
    const initialNow = Date.now();
    let nowOffset = 0;
    vi.spyOn(Date, "now").mockImplementation(() => initialNow + nowOffset);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init) => {
        const url = toRequestUrl(input);
        if (url.startsWith(baseUrl)) {
          return realFetch(input, init);
        }

        upstreamCallCount += 1;
        if (upstreamCallCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              latitude: 37.7749,
              longitude: -122.4194,
              timezone: "UTC",
              current: {
                time: "2026-03-02T00:00",
                temperature_2m: 18,
                apparent_temperature: 18,
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
          status: 404,
          json: async () => ({ reason: "upstream unavailable" })
        };
      })
    );

    const firstResponse = await fetch(
      `${baseUrl}/api/weather/current?latitude=37.7749&longitude=-122.4194`
    );
    const firstBody = await firstResponse.json();
    expect(firstResponse.status).toBe(200);
    expect(firstBody.cache).toBe("miss");

    nowOffset = 301000;
    const staleResponse = await fetch(
      `${baseUrl}/api/weather/current?latitude=37.7749&longitude=-122.4194`
    );
    const staleBody = await staleResponse.json();
    expect(staleResponse.status).toBe(200);
    expect(staleBody.cache).toBe("stale");
    expect(staleBody.fallback).not.toBe(true);
  });

  test("generate endpoint is rate-limited after repeated requests", async () => {
    const previousApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "";
    try {
      const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`);
      const csrfPayload = await csrfResponse.json();
      const csrfToken = String(csrfPayload?.csrfToken || "");
      const csrfCookie = extractCookieFromHeader(csrfResponse.headers.get("set-cookie"), "csrfToken");

      let sawRateLimit = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
            Cookie: csrfCookie
          },
          body: JSON.stringify({})
        });
        if (response.status === 429) {
          sawRateLimit = true;
          break;
        }
      }

      expect(sawRateLimit).toBe(true);
    } finally {
      process.env.GEMINI_API_KEY = previousApiKey;
    }
  });

  test("GET /api/metrics exposes latency and cache ratio fields", async () => {
    const response = await fetch(`${baseUrl}/api/metrics`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.requestLatencyMs.avgMs).toBe("number");
    expect(body.requestLatencyMs.byRoute).toBeTruthy();
    expect(body.externalCache).toHaveProperty("hitRatio");
    expect(body.externalApiLatencyMs).toBeTruthy();
    expect(body.externalApiLatencyMs).toHaveProperty("openMeteo");
  });
});
