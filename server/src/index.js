import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import argon2 from "argon2";
import crypto from "crypto";
import { promisify } from "util";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { z } from "zod";
import { connectDatabase } from "./db.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { createRequestContextMiddleware } from "./middleware/requestContext.js";
import { registerApiRoutes } from "./routes/registerApiRoutes.js";
import { initErrorTracking } from "./services/errorTrackingService.js";
import { createHttpCacheService } from "./services/httpCacheService.js";
import { isUpstreamFailureStatus, mongoReadyStateToText } from "./services/platformHealthService.js";
import {
  createSessionService,
  parseCookies,
  parseEnvBoolean,
  parseRedisPort
} from "./services/sessionService.js";
import MealLog from "./models/MealLog.js";
import ProgressMetric from "./models/ProgressMetric.js";
import User from "./models/User.js";
import WorkoutSession from "./models/WorkoutSession.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const serverBootAtMs = Date.now();

const toShortText = (value, maxLen = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const parseCsvEnv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const configuredClientOrigins = parseCsvEnv(process.env.CLIENT_ORIGIN || process.env.CLIENT_ORIGINS);
const allowAnyCorsOrigin = configuredClientOrigins.length === 0;
const allowedCorsOrigins = new Set(configuredClientOrigins);
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowAnyCorsOrigin || allowedCorsOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS."));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token"]
};
const logLevel = toShortText(process.env.LOG_LEVEL || "info", 20).toLowerCase() || "info";
const defaultRedactedLogPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.x-csrf-token",
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "hash",
  "salt",
  "redisPassword",
  "token"
];
const redactedLogPaths = Array.from(
  new Set([...defaultRedactedLogPaths, ...parseCsvEnv(process.env.LOG_REDACT_PATHS)])
);
const logger = pino({
  level: logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: redactedLogPaths,
    censor: "[Redacted]"
  }
});
const initLatencyStats = () => ({
  count: 0,
  totalMs: 0,
  maxMs: 0,
  lastMs: 0
});
const metrics = {
  requestsTotal: 0,
  authFailures: 0,
  rateLimited: 0,
  requestLatencyMs: initLatencyStats(),
  routeLatencyMs: {},
  externalCache: {
    hits: 0,
    misses: 0,
    staleHits: 0,
    writes: 0,
    evictions: 0
  },
  externalApiFailures: {
    openMeteo: 0,
    openAq: 0,
    wger: 0,
    mealDb: 0
  },
  externalApiRetries: {
    openMeteo: 0,
    openAq: 0,
    wger: 0,
    mealDb: 0
  },
  externalApiLatencyMs: {
    openMeteo: initLatencyStats(),
    openAq: initLatencyStats(),
    wger: initLatencyStats(),
    mealDb: initLatencyStats()
  }
};
let errorTracker = {
  enabled: false,
  configured: false,
  captureException: () => {},
  flush: async () => {}
};

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  createRequestContextMiddleware({
    metrics,
    logger,
    toShortText
  })
);

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const redisSessionKeyPrefix = "session:sid:";
const csrfCookieName = "csrfToken";
const csrfHeaderName = "x-csrf-token";
const csrfUnsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const pbkdf2Async = promisify(crypto.pbkdf2);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const cookieSecure = process.env.NODE_ENV === "production" ? "; Secure" : "";

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const recordLatencyStats = (bucket, durationMs) => {
  if (!bucket || !Number.isFinite(durationMs) || durationMs < 0) return;
  bucket.count = (bucket.count || 0) + 1;
  bucket.totalMs = (bucket.totalMs || 0) + durationMs;
  bucket.maxMs = Math.max(bucket.maxMs || 0, durationMs);
  bucket.lastMs = durationMs;
};

const recordExternalApiLatency = (serviceName, durationMs) => {
  const key = cleanText(serviceName, 32);
  if (!key) return;
  if (!metrics.externalApiLatencyMs[key]) {
    metrics.externalApiLatencyMs[key] = initLatencyStats();
  }
  recordLatencyStats(metrics.externalApiLatencyMs[key], durationMs);
};

const apiRateLimitWindowMs = toPositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const apiRateLimitMax = toPositiveInt(process.env.API_RATE_LIMIT_MAX, 300);
const authRateLimitWindowMs = toPositiveInt(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  10 * 60 * 1000
);
const authRateLimitMax = toPositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 25);
const generateRateLimitWindowMs = toPositiveInt(
  process.env.GENERATE_RATE_LIMIT_WINDOW_MS,
  10 * 60 * 1000
);
const generateRateLimitMax = toPositiveInt(process.env.GENERATE_RATE_LIMIT_MAX, 20);
const dashboardCollectionDefaultLimit = toPositiveInt(
  process.env.DASHBOARD_COLLECTION_DEFAULT_LIMIT,
  50
);
const dashboardCollectionMaxLimit = toPositiveInt(
  process.env.DASHBOARD_COLLECTION_MAX_LIMIT,
  200
);
const externalApiRetries = toPositiveInt(process.env.EXTERNAL_API_RETRIES, 2);
const externalApiRetryBaseDelayMs = toPositiveInt(
  process.env.EXTERNAL_API_RETRY_BASE_DELAY_MS,
  250
);
const externalCacheMaxEntries = toPositiveInt(process.env.EXTERNAL_CACHE_MAX_ENTRIES, 500);
const externalCacheDefaultStaleTtlSec = toPositiveInt(
  process.env.EXTERNAL_CACHE_STALE_TTL_SEC,
  60 * 60 * 6
);
const openMeteoCacheTtlSec = toPositiveInt(process.env.OPEN_METEO_CACHE_TTL_SEC, 300);
const openAqCacheTtlSec = toPositiveInt(process.env.OPENAQ_CACHE_TTL_SEC, 180);
const wgerCacheTtlSec = toPositiveInt(process.env.WGER_CACHE_TTL_SEC, 900);
const mealDbCacheTtlSec = toPositiveInt(process.env.MEALDB_CACHE_TTL_SEC, 900);
const sentryShutdownTimeoutMs = toPositiveInt(process.env.SENTRY_SHUTDOWN_TIMEOUT_MS, 2000);
const argon2TimeCost = toPositiveInt(process.env.ARGON2_TIME_COST, 3);
const argon2MemoryCost = toPositiveInt(process.env.ARGON2_MEMORY_COST, 19456);
const argon2Parallelism = toPositiveInt(process.env.ARGON2_PARALLELISM, 1);
const argon2HashLength = toPositiveInt(process.env.ARGON2_HASH_LENGTH, 32);
const allowedSexValues = ["Female", "Male", "Non-binary", "Prefer not to say"];
const allowedActivityValues = ["Light", "Moderate", "High", "Very high"];
const allowedMealTypeValues = ["breakfast", "lunch", "dinner", "snack", "drink", "other"];
const defaultProfile = () => ({
  firstName: "",
  lastName: "",
  name: "",
  age: null,
  heightCm: null,
  weightKg: null,
  sex: "",
  bodyFat: null,
  activity: "Moderate",
  notes: "",
  updatedAt: new Date().toISOString()
});
const allowedSexes = new Set(allowedSexValues);
const allowedActivities = new Set(allowedActivityValues);
const defaultGoals = () => ({
  targetWeight: 160,
  targetCalories: 2200,
  weeklyWorkouts: 3
});
const defaultDashboard = () => ({
  workouts: [],
  workoutSessions: [],
  calories: [],
  mealLogs: [],
  progressMetrics: [],
  plans: [],
  savedExercises: [],
  goals: defaultGoals()
});
const buildDashboard = (input = {}) => {
  const base = defaultDashboard();
  const goals = input.goals || {};
  return {
    ...base,
    workouts: Array.isArray(input.workouts) ? input.workouts.slice(0, 500) : [],
    workoutSessions: Array.isArray(input.workoutSessions)
      ? input.workoutSessions.slice(0, 500)
      : [],
    calories: Array.isArray(input.calories) ? input.calories : [],
    mealLogs: Array.isArray(input.mealLogs) ? input.mealLogs.slice(0, 800) : [],
    progressMetrics: Array.isArray(input.progressMetrics)
      ? input.progressMetrics.slice(0, 400)
      : [],
    plans: Array.isArray(input.plans) ? input.plans : [],
    savedExercises: Array.isArray(input.savedExercises)
      ? input.savedExercises.slice(0, 200)
      : [],
    goals: {
      ...base.goals,
      targetWeight:
        toNullableNumber(goals.targetWeight, 80, 400) ?? base.goals.targetWeight,
      targetCalories:
        toNullableNumber(goals.targetCalories, 1200, 4500) ??
        base.goals.targetCalories,
      weeklyWorkouts:
        toNullableNumber(goals.weeklyWorkouts, 1, 7) ?? base.goals.weeklyWorkouts
    }
  };
};

const cleanText = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const toNullableNumber = (value, min, max) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
};

const toCleanArray = (value, maxItems = 8, maxLen = 60) =>
  (Array.isArray(value) ? value : [value])
    .map((item) => cleanText(item, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);

const toCleanNameArray = (value, maxItems = 10, maxLen = 120) =>
  (Array.isArray(value) ? value : [])
    .map((item) =>
      cleanText(typeof item === "string" ? item : item?.name, maxLen)
    )
    .filter(Boolean)
    .slice(0, maxItems);

const allowedMealTypes = new Set(allowedMealTypeValues);

const buildWorkoutSessionEntry = (input = {}) => ({
  id: cleanText(input.id, 64) || crypto.randomUUID(),
  date: cleanText(input.date, 20),
  focus: cleanText(input.focus, 80) || "General",
  duration: toNullableNumber(input.duration, 5, 360),
  exercises: toCleanArray(input.exercises, 18, 140),
  sets: toNullableNumber(input.sets, 1, 80),
  reps: toNullableNumber(input.reps, 1, 120),
  intensityRpe: toNullableNumber(input.intensityRpe ?? input.rpe, 1, 10),
  notes: cleanText(input.notes, 500),
  createdAt: new Date().toISOString()
});

const toWorkoutSummaryEntry = (session) => ({
  id: cleanText(session?.id, 64) || crypto.randomUUID(),
  date: cleanText(session?.date, 20),
  focus: cleanText(session?.focus, 80) || "General",
  duration: toNullableNumber(session?.duration, 5, 360),
  exercises: toCleanArray(session?.exercises, 18, 140),
  sets: toNullableNumber(session?.sets, 1, 80),
  reps: toNullableNumber(session?.reps, 1, 120),
  intensityRpe: toNullableNumber(session?.intensityRpe, 1, 10),
  notes: cleanText(session?.notes, 500),
  createdAt: cleanText(session?.createdAt, 40) || new Date().toISOString()
});

const buildMealLogEntry = (input = {}) => {
  const mealTypeRaw = cleanText(input.mealType, 40).toLowerCase();
  return {
    id: cleanText(input.id, 64) || crypto.randomUUID(),
    date: cleanText(input.date, 20),
    mealType: allowedMealTypes.has(mealTypeRaw) ? mealTypeRaw : "other",
    name: cleanText(input.name, 140),
    calories: toNullableNumber(input.calories, 0, 5000),
    proteinG: toNullableNumber(input.proteinG, 0, 400),
    carbsG: toNullableNumber(input.carbsG, 0, 700),
    fatG: toNullableNumber(input.fatG, 0, 300),
    notes: cleanText(input.notes, 300),
    loggedAt: new Date().toISOString()
  };
};

const buildProgressMetricEntry = (input = {}) => ({
  id: cleanText(input.id, 64) || crypto.randomUUID(),
  date: cleanText(input.date, 20),
  weightLb: toNullableNumber(input.weightLb, 50, 700),
  bodyFatPct: toNullableNumber(input.bodyFatPct, 2, 70),
  waistCm: toNullableNumber(input.waistCm, 30, 250),
  restingHr: toNullableNumber(input.restingHr, 30, 220),
  notes: cleanText(input.notes, 320),
  loggedAt: new Date().toISOString()
});

const buildSavedExerciseEntry = (input = {}) => ({
  id: cleanText(input.id, 64) || crypto.randomUUID(),
  exerciseId: toNullableNumber(input.exerciseId, 1, 10000000),
  name: cleanText(input.name, 180),
  category: cleanText(input.category, 120),
  muscles: toCleanNameArray(input.muscles, 10, 120),
  equipment: toCleanNameArray(input.equipment, 10, 120),
  imageUrl: cleanText(input.imageUrl, 320),
  videoUrl: cleanText(input.videoUrl, 320),
  reason: cleanText(input.reason, 260),
  source: "wger",
  savedAt: new Date().toISOString()
});

const openMeteoBaseUrl = cleanText(
  process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast",
  240
);
const openMeteoTimeoutMs = 10000;
const openAqBaseUrl = cleanText(process.env.OPENAQ_BASE_URL || "https://api.openaq.org/v3", 240);
const openAqApiKey = cleanText(process.env.OPENAQ_API_KEY || "", 240);
const openAqTimeoutMs = 12000;
const wgerBaseUrl = cleanText(process.env.WGER_BASE_URL || "https://wger.de/api/v2", 240);
const wgerApiToken = cleanText(process.env.WGER_API_TOKEN || "", 240);
const wgerDefaultLanguage = toNullableNumber(process.env.WGER_DEFAULT_LANGUAGE, 1, 100) ?? 2;
const wgerTimeoutMs = 12000;
const mealDbBaseUrl = cleanText(
  process.env.MEALDB_BASE_URL || "https://www.themealdb.com/api/json/v1/1",
  240
);
const mealDbTimeoutMs = 12000;
const {
  serializeCacheKeyPart,
  buildExternalCacheKey,
  readThroughExternalCache,
  mergeCacheStatuses
} = createHttpCacheService({
  metrics,
  logger,
  toShortText,
  toPositiveInt,
  maxEntries: externalCacheMaxEntries,
  defaultStaleTtlSec: externalCacheDefaultStaleTtlSec
});

const buildProfile = (input = {}) => {
  const base = defaultProfile();
  const rawName = cleanText(input.name, 80);
  const rawFirst = cleanText(input.firstName, 40);
  const rawLast = cleanText(input.lastName, 60);
  const nameParts = rawName.split(/\s+/).filter(Boolean);
  const firstName = rawFirst || nameParts[0] || "";
  const lastName = rawLast || nameParts.slice(1).join(" ") || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return {
    ...base,
    firstName,
    lastName,
    name: fullName || rawName,
    age: toNullableNumber(input.age, 10, 120),
    heightCm: toNullableNumber(input.heightCm, 100, 260),
    weightKg: toNullableNumber(input.weightKg, 25, 400),
    sex: allowedSexes.has(input.sex) ? input.sex : "",
    bodyFat: toNullableNumber(input.bodyFat, 3, 70),
    activity: allowedActivities.has(input.activity) ? input.activity : base.activity,
    notes: cleanText(input.notes, 500),
    updatedAt: new Date().toISOString()
  };
};

const isCompleteSignupProfile = (profile) =>
  Boolean(
    cleanText(profile?.firstName, 40) &&
      cleanText(profile?.lastName, 60) &&
      profile?.age !== null &&
      profile?.heightCm !== null &&
      profile?.weightKg !== null &&
      cleanText(profile?.sex, 40)
  );

const toNumberInput = (value) => {
  if (value === "") return null;
  if (value === undefined || value === null) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const requiredStringField = (maxLen) => z.string().trim().min(1).max(maxLen);
const optionalStringField = (maxLen) => z.string().trim().max(maxLen).optional();
const optionalBooleanField = z
  .preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }
    return value;
  }, z.boolean())
  .optional();
const optionalNullableNumberField = (min, max) =>
  z.preprocess(
    toNumberInput,
    z.union([z.number().min(min).max(max), z.null()]).optional()
  );
const requiredNumberField = (min, max) =>
  z.preprocess(toNumberInput, z.number().min(min).max(max));
const optionalStringArrayField = (maxItems, maxLen) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    const list = Array.isArray(value) ? value : [value];
    return list
      .map((item) => cleanText(item, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }, z.array(z.string().max(maxLen)).max(maxItems).optional());

const profileInputSchema = z
  .object({
    firstName: optionalStringField(40),
    lastName: optionalStringField(60),
    name: optionalStringField(80),
    age: optionalNullableNumberField(10, 120),
    heightCm: optionalNullableNumberField(100, 260),
    weightKg: optionalNullableNumberField(25, 400),
    sex: z.union([z.enum(allowedSexValues), z.literal("")]).optional(),
    bodyFat: optionalNullableNumberField(3, 70),
    activity: z.union([z.enum(allowedActivityValues), z.literal("")]).optional(),
    notes: optionalStringField(500)
  })
  .passthrough();

const signupBodySchema = z
  .object({
    email: requiredStringField(254),
    password: z.string().min(8).max(256),
    profile: profileInputSchema,
    rememberMe: optionalBooleanField
  })
  .passthrough();

const loginBodySchema = z
  .object({
    email: requiredStringField(254),
    password: z.string().min(1).max(256),
    rememberMe: optionalBooleanField
  })
  .passthrough();

const profileBodySchema = profileInputSchema;

const workoutSessionBodySchema = z
  .object({
    id: optionalStringField(64),
    date: requiredStringField(20),
    focus: optionalStringField(80),
    duration: requiredNumberField(5, 360),
    exercises: optionalStringArrayField(18, 140),
    sets: optionalNullableNumberField(1, 80),
    reps: optionalNullableNumberField(1, 120),
    intensityRpe: optionalNullableNumberField(1, 10),
    rpe: optionalNullableNumberField(1, 10),
    notes: optionalStringField(500)
  })
  .passthrough();

const caloriesBodySchema = z
  .object({
    date: requiredStringField(20),
    calories: requiredNumberField(800, 10000)
  })
  .passthrough();

const goalsBodySchema = z
  .object({
    targetWeight: optionalNullableNumberField(80, 400),
    targetCalories: optionalNullableNumberField(1200, 4500),
    weeklyWorkouts: optionalNullableNumberField(1, 7)
  })
  .passthrough();

const mealLogBodySchema = z
  .object({
    id: optionalStringField(64),
    date: requiredStringField(20),
    mealType: optionalStringField(40),
    name: requiredStringField(140),
    calories: optionalNullableNumberField(0, 5000),
    proteinG: optionalNullableNumberField(0, 400),
    carbsG: optionalNullableNumberField(0, 700),
    fatG: optionalNullableNumberField(0, 300),
    notes: optionalStringField(300)
  })
  .passthrough();

const progressMetricBodySchema = z
  .object({
    id: optionalStringField(64),
    date: requiredStringField(20),
    weightLb: optionalNullableNumberField(50, 700),
    bodyFatPct: optionalNullableNumberField(2, 70),
    waistCm: optionalNullableNumberField(30, 250),
    restingHr: optionalNullableNumberField(30, 220),
    notes: optionalStringField(320)
  })
  .passthrough();

const namedValueSchema = z
  .object({
    name: requiredStringField(120)
  })
  .passthrough();

const savedExerciseBodySchema = z
  .object({
    id: optionalStringField(64),
    exerciseId: optionalNullableNumberField(1, 10000000),
    name: requiredStringField(180),
    category: optionalStringField(120),
    muscles: z.array(z.union([z.string().trim().min(1).max(120), namedValueSchema])).max(10).optional(),
    equipment: z.array(z.union([z.string().trim().min(1).max(120), namedValueSchema])).max(10).optional(),
    imageUrl: optionalStringField(320),
    videoUrl: optionalStringField(320),
    reason: optionalStringField(260)
  })
  .passthrough();

const generatePlanBodySchema = z
  .object({
    goal: optionalStringField(120),
    equipment: optionalStringArrayField(10, 80),
    duration: optionalNullableNumberField(15, 180),
    level: optionalStringField(40),
    injuries: optionalStringField(140),
    days: optionalNullableNumberField(1, 7),
    environment: optionalStringField(40),
    focuses: optionalStringArrayField(8, 60)
  })
  .passthrough();

const getValidationMessage = (error) => {
  const issue = error?.issues?.[0];
  if (!issue) return "Invalid request body.";
  const path = Array.isArray(issue.path) && issue.path.length ? issue.path.join(".") : "request";
  return cleanText(`${path}: ${issue.message}`, 240) || "Invalid request body.";
};

const validateBody = (req, res, schema) => {
  const result = schema.safeParse(req.body || {});
  if (result.success) return result.data;
  res.status(400).json({ error: getValidationMessage(result.error) });
  return null;
};

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const weatherCodeToText = (code) => {
  const value = Number(code);
  if (value === 0) return "Clear sky";
  if ([1, 2, 3].includes(value)) return "Partly cloudy";
  if ([45, 48].includes(value)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(value)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "Snow";
  if ([95, 96, 99].includes(value)) return "Thunderstorm";
  return "Unknown";
};

const isSevereWeatherCode = (code) => [95, 96, 99].includes(Number(code));

const isOutdoorFriendlyNow = (current = {}) => {
  const temperature = toFiniteNumber(current.temperature_2m);
  const wind = toFiniteNumber(current.wind_speed_10m);
  const precipitation = toFiniteNumber(current.precipitation);
  const weatherCode = toFiniteNumber(current.weather_code);

  if (weatherCode !== null && isSevereWeatherCode(weatherCode)) return false;
  if (temperature !== null && (temperature < 3 || temperature > 34)) return false;
  if (wind !== null && wind > 32) return false;
  if (precipitation !== null && precipitation >= 1.0) return false;
  return true;
};

const buildWorkoutRecommendation = (current = {}) => {
  const reasons = [];
  const weatherCode = toFiniteNumber(current.weather_code);
  const weatherText = weatherCode === null ? "Unknown" : weatherCodeToText(weatherCode);
  const temperature = toFiniteNumber(current.temperature_2m);
  const wind = toFiniteNumber(current.wind_speed_10m);
  const precipitation = toFiniteNumber(current.precipitation);
  const outdoorFriendly = isOutdoorFriendlyNow(current);

  if (temperature !== null && (temperature < 8 || temperature > 30)) {
    reasons.push("Temperature is outside a comfortable outdoor training range.");
  }
  if (wind !== null && wind > 25) {
    reasons.push("Wind is high, which can make runs and cycling harder.");
  }
  if (precipitation !== null && precipitation >= 0.5) {
    reasons.push("Precipitation is present.");
  }
  if (weatherCode !== null && isSevereWeatherCode(weatherCode)) {
    reasons.push("Storm conditions detected.");
  }
  if (!reasons.length) {
    reasons.push("Weather looks suitable for outdoor training.");
  }

  return {
    workoutType: outdoorFriendly ? "outdoor" : "indoor",
    summary: outdoorFriendly
      ? "Outdoor session is recommended today."
      : "Indoor session is recommended today.",
    reasons,
    weatherText
  };
};

const delayMs = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetriableExternalError = (err) => {
  const status = Number(err?.status);
  if (err?.name === "AbortError") return true;
  if (!Number.isInteger(status)) return true;
  return status >= 500;
};

const runExternalRequestWithRetry = async (serviceName, requestFn) => {
  let attempt = 0;
  let lastError = null;
  while (attempt <= externalApiRetries) {
    const startedAt = Date.now();
    try {
      const result = await requestFn();
      recordExternalApiLatency(serviceName, Date.now() - startedAt);
      return result;
    } catch (err) {
      recordExternalApiLatency(serviceName, Date.now() - startedAt);
      lastError = err;
      const canRetry = attempt < externalApiRetries && isRetriableExternalError(err);
      if (!canRetry) break;
      metrics.externalApiRetries[serviceName] =
        (metrics.externalApiRetries[serviceName] || 0) + 1;
      const waitTime = externalApiRetryBaseDelayMs * 2 ** attempt;
      logger.warn({
        event: "external_api_retry",
        service: serviceName,
        attempt: attempt + 1,
        waitTimeMs: waitTime,
        status: Number.isInteger(err?.status) ? err.status : null,
        message: toShortText(err?.message, 220)
      });
      await delayMs(waitTime);
      attempt += 1;
    }
  }
  metrics.externalApiFailures[serviceName] = (metrics.externalApiFailures[serviceName] || 0) + 1;
  throw lastError || new Error("External request failed.");
};

const fetchOpenMeteo = async (query) => {
  const cacheKey = buildExternalCacheKey("openMeteo", {
    baseUrl: openMeteoBaseUrl,
    query
  });
  return readThroughExternalCache({
    serviceName: "openMeteo",
    cacheKey,
    ttlSec: openMeteoCacheTtlSec,
    requestFn: async () =>
      runExternalRequestWithRetry("openMeteo", async () => {
        if (typeof fetch !== "function") {
          const err = new Error("This Node runtime does not support fetch.");
          err.status = 500;
          throw err;
        }

        const url = new URL(openMeteoBaseUrl);
        for (const [key, value] of Object.entries(query || {})) {
          if (value === undefined || value === null || value === "") continue;
          url.searchParams.set(key, String(value));
        }
        url.searchParams.set("timezone", "auto");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), openMeteoTimeoutMs);
        try {
          const response = await fetch(url, { signal: controller.signal });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            const err = new Error(cleanText(data?.reason || "Open-Meteo request failed.", 200));
            err.status = response.status >= 500 ? 502 : response.status;
            throw err;
          }
          return data;
        } catch (err) {
          if (err?.name === "AbortError") {
            const timeoutErr = new Error("Open-Meteo request timed out.");
            timeoutErr.status = 504;
            throw timeoutErr;
          }
          throw err;
        } finally {
          clearTimeout(timeout);
        }
      })
  });
};

const openAqRequest = async (endpoint, query = {}) => {
  const cacheKey = buildExternalCacheKey("openAq", {
    baseUrl: openAqBaseUrl,
    endpoint,
    query
  });
  return readThroughExternalCache({
    serviceName: "openAq",
    cacheKey,
    ttlSec: openAqCacheTtlSec,
    requestFn: async () =>
      runExternalRequestWithRetry("openAq", async () => {
        if (!openAqApiKey) {
          const err = new Error("OpenAQ API key is not configured. Set OPENAQ_API_KEY.");
          err.status = 503;
          throw err;
        }
        if (typeof fetch !== "function") {
          const err = new Error("This Node runtime does not support fetch.");
          err.status = 500;
          throw err;
        }

        const base = openAqBaseUrl.replace(/\/+$/, "");
        const path = String(endpoint || "").replace(/^\/+/, "");
        const url = new URL(`${base}/${path}`);
        for (const [key, value] of Object.entries(query || {})) {
          if (value === undefined || value === null || value === "") continue;
          url.searchParams.set(key, String(value));
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), openAqTimeoutMs);
        try {
          const response = await fetch(url, {
            headers: {
              "X-API-Key": openAqApiKey
            },
            signal: controller.signal
          });
          const rawBody = await response.text();
          let data = {};
          try {
            data = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            data = rawBody;
          }
          if (!response.ok) {
            const stringBody = cleanText(typeof data === "string" ? data : "", 220);
            const firstError =
              Array.isArray(data) && data.length
                ? cleanText(data[0]?.msg || data[0]?.message || data[0]?.detail, 220)
                : "";
            const err = new Error(
              cleanText(
                firstError ||
                  (typeof data === "object" && data
                    ? data?.message || data?.detail || data?.error
                    : "") ||
                  stringBody ||
                  "OpenAQ request failed.",
                220
              )
            );
            err.status = response.status >= 500 ? 502 : response.status;
            throw err;
          }
          return data;
        } catch (err) {
          if (err?.name === "AbortError") {
            const timeoutErr = new Error("OpenAQ request timed out.");
            timeoutErr.status = 504;
            throw timeoutErr;
          }
          throw err;
        } finally {
          clearTimeout(timeout);
        }
      })
  });
};

const openAqParameterLabel = (code = "") => {
  const key = cleanText(code, 40).toLowerCase();
  const labels = {
    pm25: "PM2.5",
    "pm2.5": "PM2.5",
    pm10: "PM10",
    o3: "Ozone",
    no2: "Nitrogen dioxide",
    so2: "Sulfur dioxide",
    co: "Carbon monoxide"
  };
  return labels[key] || (key ? key.toUpperCase() : "");
};

const firstFinite = (values) => {
  for (const value of values) {
    const num = toFiniteNumber(value);
    if (num !== null) return num;
  }
  return null;
};

const firstClean = (values, maxLen = 80) => {
  for (const value of values) {
    const text = cleanText(value, maxLen);
    if (text) return text;
  }
  return "";
};

const extractOpenAqMeasurement = (item = {}) => {
  const parameterObj =
    item?.parameter ||
    item?.sensor?.parameter ||
    item?.sensors?.[0]?.parameter ||
    item?.measurement?.parameter ||
    {};
  const code = cleanText(
    parameterObj?.name || item?.parameter || item?.name || item?.sensorName,
    40
  ).toLowerCase();
  const value = firstFinite([
    item?.value,
    item?.summary?.value,
    item?.latest?.value,
    item?.measurement?.value,
    item?.measurements?.[0]?.value
  ]);
  const unit = firstClean(
    [
      item?.unit,
      parameterObj?.units,
      parameterObj?.unit,
      item?.summary?.unit,
      item?.latest?.unit
    ],
    24
  );
  const measuredAt = firstClean(
    [
      item?.datetime?.utc,
      item?.datetime?.local,
      item?.date?.utc,
      item?.date?.local,
      item?.latest?.datetime?.utc,
      item?.latest?.datetime?.local
    ],
    50
  );
  const label =
    firstClean(
      [parameterObj?.displayName, parameterObj?.display_name, parameterObj?.name],
      80
    ) || openAqParameterLabel(code);

  return { code, label, value, unit, measuredAt };
};

const pm25ToUsAqi = (pm25) => {
  if (pm25 === null || pm25 === undefined || pm25 === "") return null;
  const value = Number(pm25);
  if (!Number.isFinite(value) || value < 0) return null;
  const points = [
    { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
    { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 }
  ];
  for (const point of points) {
    if (value < point.cLow || value > point.cHigh) continue;
    const ratio = (value - point.cLow) / (point.cHigh - point.cLow || 1);
    return Math.round(point.iLow + ratio * (point.iHigh - point.iLow));
  }
  return 500;
};

const aqiBand = (aqi) => {
  if (aqi === null || aqi === undefined || aqi === "") {
    return {
      level: "Unknown",
      workoutType: "indoor",
      guidance: "Air quality data is limited. Prefer flexible indoor options."
    };
  }
  const value = Number(aqi);
  if (!Number.isFinite(value)) {
    return {
      level: "Unknown",
      workoutType: "indoor",
      guidance: "Air quality data is limited. Prefer flexible indoor options."
    };
  }
  if (value <= 50) {
    return {
      level: "Good",
      workoutType: "outdoor",
      guidance: "Air quality is good for outdoor sessions."
    };
  }
  if (value <= 100) {
    return {
      level: "Moderate",
      workoutType: "outdoor",
      guidance: "Outdoor training is usually fine; sensitive groups should monitor symptoms."
    };
  }
  if (value <= 150) {
    return {
      level: "Unhealthy for sensitive groups",
      workoutType: "indoor",
      guidance: "Reduce outdoor intensity, especially for cardio-heavy sessions."
    };
  }
  if (value <= 200) {
    return {
      level: "Unhealthy",
      workoutType: "indoor",
      guidance: "Indoor sessions are recommended today."
    };
  }
  if (value <= 300) {
    return {
      level: "Very unhealthy",
      workoutType: "indoor",
      guidance: "Avoid outdoor exertion and prioritize indoor training."
    };
  }
  return {
    level: "Hazardous",
    workoutType: "indoor",
    guidance: "Avoid outdoor training."
  };
};

const normalizePlainText = (value, maxLen = 500) => {
  if (typeof value !== "string") return "";
  const stripped = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return stripped.slice(0, maxLen);
};

const parseMultiNumberQuery = (input, min, max, maxItems = 8) => {
  if (input === undefined || input === null || input === "") return [];
  const list = Array.isArray(input) ? input : String(input).split(",");
  const values = [];
  for (const raw of list) {
    const num = toNullableNumber(String(raw).trim(), min, max);
    if (num === null) continue;
    values.push(Math.trunc(num));
    if (values.length >= maxItems) break;
  }
  return values;
};

const wgerRequest = async (endpoint, options = {}) => {
  const query = options?.query || {};
  const cacheKey = buildExternalCacheKey("wger", {
    baseUrl: wgerBaseUrl,
    endpoint,
    query
  });
  return readThroughExternalCache({
    serviceName: "wger",
    cacheKey,
    ttlSec: wgerCacheTtlSec,
    requestFn: async () =>
      runExternalRequestWithRetry("wger", async () => {
        if (typeof fetch !== "function") {
          const err = new Error("This Node runtime does not support fetch.");
          err.status = 500;
          throw err;
        }

        const base = wgerBaseUrl.replace(/\/+$/, "");
        const path = String(endpoint || "").replace(/^\/+/, "");
        const url = new URL(`${base}/${path}`);

        for (const [key, value] of Object.entries(query || {})) {
          if (value === undefined || value === null || value === "") continue;
          if (Array.isArray(value)) {
            for (const item of value) {
              if (item === undefined || item === null || item === "") continue;
              url.searchParams.append(key, String(item));
            }
            continue;
          }
          url.searchParams.set(key, String(value));
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), wgerTimeoutMs);
        try {
          const response = await fetch(url, {
            headers: wgerApiToken ? { Authorization: `Token ${wgerApiToken}` } : undefined,
            signal: controller.signal
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            const message = cleanText(
              data?.detail || data?.reason || data?.message || "Wger request failed.",
              220
            );
            const err = new Error(message);
            err.status = response.status >= 500 ? 502 : response.status;
            throw err;
          }
          return data;
        } catch (err) {
          if (err?.name === "AbortError") {
            const timeoutErr = new Error("Wger request timed out.");
            timeoutErr.status = 504;
            throw timeoutErr;
          }
          throw err;
        } finally {
          clearTimeout(timeout);
        }
      })
  });
};

const mealDbRequest = async (endpoint, query = {}) => {
  const cacheKey = buildExternalCacheKey("mealDb", {
    baseUrl: mealDbBaseUrl,
    endpoint,
    query
  });
  return readThroughExternalCache({
    serviceName: "mealDb",
    cacheKey,
    ttlSec: mealDbCacheTtlSec,
    requestFn: async () =>
      runExternalRequestWithRetry("mealDb", async () => {
        if (typeof fetch !== "function") {
          const err = new Error("This Node runtime does not support fetch.");
          err.status = 500;
          throw err;
        }

        const base = mealDbBaseUrl.replace(/\/+$/, "");
        const path = String(endpoint || "").replace(/^\/+/, "");
        const url = new URL(`${base}/${path}`);
        for (const [key, value] of Object.entries(query || {})) {
          if (value === undefined || value === null || value === "") continue;
          url.searchParams.set(key, String(value));
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), mealDbTimeoutMs);
        try {
          const response = await fetch(url, { signal: controller.signal });
          const rawBody = await response.text();
          let data = {};
          try {
            data = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            data = {};
          }

          if (!response.ok) {
            const err = new Error(
              cleanText(
                data?.message || data?.detail || data?.error || "MealDB request failed.",
                220
              )
            );
            err.status = response.status >= 500 ? 502 : response.status;
            throw err;
          }

          return data;
        } catch (err) {
          if (err?.name === "AbortError") {
            const timeoutErr = new Error("MealDB request timed out.");
            timeoutErr.status = 504;
            throw timeoutErr;
          }
          throw err;
        } finally {
          clearTimeout(timeout);
        }
      })
  });
};

const mapMealDbIngredients = (meal = {}) => {
  const ingredients = [];
  for (let i = 1; i <= 20; i += 1) {
    const ingredient = cleanText(meal?.[`strIngredient${i}`], 100);
    if (!ingredient) continue;
    const measure = cleanText(meal?.[`strMeasure${i}`], 80);
    ingredients.push(cleanText(`${measure ? `${measure} ` : ""}${ingredient}`, 140));
  }
  return ingredients;
};

const mapMealDbMeal = (meal = {}) => {
  const source = cleanText(meal?.strSource, 320);
  const youtube = cleanText(meal?.strYoutube, 320);
  const instructions = normalizePlainText(meal?.strInstructions || "", 2200);
  const category = cleanText(meal?.strCategory, 80);
  const area = cleanText(meal?.strArea, 80);
  const metaLine = [category, area].filter(Boolean).join(" | ");
  const blurb = cleanText(instructions.slice(0, 180) || metaLine || "Recipe from TheMealDB.", 260);
  const recipes = [];
  if (source) recipes.push({ label: "Source", url: source });
  if (youtube) recipes.push({ label: "YouTube", url: youtube });

  return {
    id: cleanText(meal?.idMeal, 40) ? `mealdb-${cleanText(meal?.idMeal, 40)}` : "",
    sourceId: cleanText(meal?.idMeal, 40),
    title: cleanText(meal?.strMeal, 180),
    image: cleanText(meal?.strMealThumb, 320),
    blurb,
    calories: null,
    category,
    area,
    instructions,
    ingredients: mapMealDbIngredients(meal),
    recipes,
    source: "mealdb"
  };
};

const pickWgerTranslation = (translations, preferredLanguage) => {
  const list = Array.isArray(translations) ? translations : [];
  if (!list.length) return null;

  const exact = list.find(
    (item) => Number(item?.language) === Number(preferredLanguage) && cleanText(item?.name, 200)
  );
  if (exact) return exact;

  const english = list.find(
    (item) => Number(item?.language) === 2 && cleanText(item?.name, 200)
  );
  if (english) return english;

  return list.find((item) => cleanText(item?.name, 200)) || list[0] || null;
};

const mapWgerExercise = (exercise, preferredLanguage = wgerDefaultLanguage) => {
  const translation = pickWgerTranslation(exercise?.translations, preferredLanguage);
  const images = (Array.isArray(exercise?.images) ? exercise.images : [])
    .map((item) => ({
      id: item?.id ?? null,
      url: cleanText(item?.image || item?.url, 240),
      isMain: Boolean(item?.is_main || item?.isMain)
    }))
    .filter((item) => item.url);
  const videos = (Array.isArray(exercise?.videos) ? exercise.videos : [])
    .map((item) => ({
      id: item?.id ?? null,
      url: cleanText(item?.video || item?.url, 240)
    }))
    .filter((item) => item.url);

  return {
    id: exercise?.id ?? null,
    uuid: cleanText(exercise?.uuid, 80),
    name: cleanText(translation?.name, 180),
    description: normalizePlainText(translation?.description || "", 2200),
    language: toFiniteNumber(translation?.language),
    category: {
      id: exercise?.category?.id ?? toFiniteNumber(exercise?.category),
      name: cleanText(exercise?.category?.name, 120)
    },
    muscles: (Array.isArray(exercise?.muscles) ? exercise.muscles : []).map((item) => ({
      id: item?.id ?? toFiniteNumber(item),
      name: cleanText(item?.name_en || item?.name, 120)
    })),
    secondaryMuscles: (Array.isArray(exercise?.muscles_secondary)
      ? exercise.muscles_secondary
      : []
    ).map((item) => ({
      id: item?.id ?? toFiniteNumber(item),
      name: cleanText(item?.name_en || item?.name, 120)
    })),
    equipment: (Array.isArray(exercise?.equipment) ? exercise.equipment : []).map((item) => ({
      id: item?.id ?? toFiniteNumber(item),
      name: cleanText(item?.name, 120)
    })),
    images,
    videos
  };
};

const mapMongoDocToUser = (doc) => {
  if (!doc) return null;
  const source = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const inferredAlgo =
    cleanText(source.passwordAlgo, 24) ||
    (cleanText(source.hash, 260).startsWith("$argon2") ? "argon2id" : "pbkdf2");
  return {
    id: source.userId,
    email: source.email,
    salt: source.salt,
    hash: source.hash,
    passwordAlgo: inferredAlgo,
    createdAt: source.createdAt,
    profile: source.profile,
    dashboard: source.dashboard
  };
};

const mapUserToMongoDoc = (user) => {
  const doc = {
    userId: user.id,
    email: cleanText(user.email, 254).toLowerCase(),
    salt: user.salt ?? "",
    hash: user.hash,
    passwordAlgo: cleanText(user.passwordAlgo, 24) || "pbkdf2",
    createdAt: user.createdAt || new Date().toISOString()
  };
  if (user.profile !== undefined) doc.profile = user.profile;
  if (user.dashboard !== undefined) doc.dashboard = user.dashboard;
  return doc;
};

const findUserById = async (userId) => {
  const doc = await User.findOne({ userId });
  return mapMongoDocToUser(doc);
};

const findUserByEmail = async (email) => {
  const doc = await User.findOne({
    email: cleanText(email, 254).toLowerCase()
  });
  return mapMongoDocToUser(doc);
};

const createUser = async (user) => {
  const doc = await User.create(mapUserToMongoDoc(user));
  return mapMongoDocToUser(doc);
};

const hashPasswordArgon2id = async (password) => {
  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
    timeCost: argon2TimeCost,
    memoryCost: argon2MemoryCost,
    parallelism: argon2Parallelism,
    hashLength: argon2HashLength
  });
  return { salt: "", hash, passwordAlgo: "argon2id" };
};

const hashPassword = async (password) => hashPasswordArgon2id(password);

const isArgon2Hash = (value) => cleanText(value, 260).startsWith("$argon2");

const resolvePasswordAlgo = (user = {}) => {
  const raw = cleanText(user.passwordAlgo, 24);
  if (raw === "argon2id" || raw === "pbkdf2") return raw;
  return isArgon2Hash(user.hash) ? "argon2id" : "pbkdf2";
};

const verifyPasswordPbkdf2 = async (password, user) => {
  if (!user?.salt || !user?.hash) return false;
  const hash = await pbkdf2Async(password, user.salt, 120000, 64, "sha512");
  const storedHash = Buffer.from(user.hash, "hex");
  if (storedHash.length !== hash.length) return false;
  return crypto.timingSafeEqual(storedHash, hash);
};

const verifyPassword = async (password, user) => {
  const algo = resolvePasswordAlgo(user);
  if (algo === "argon2id") {
    if (!user?.hash) return false;
    try {
      return await argon2.verify(user.hash, password);
    } catch {
      return false;
    }
  }
  return verifyPasswordPbkdf2(password, user);
};

let dummyPasswordRecordPromise = null;
const getDummyPasswordRecord = async () => {
  if (!dummyPasswordRecordPromise) {
    dummyPasswordRecordPromise = hashPasswordArgon2id("invalid-password");
  }
  return dummyPasswordRecordPromise;
};

const shouldUpgradePasswordToArgon2id = (user) => resolvePasswordAlgo(user) !== "argon2id";

const upgradeUserPasswordToArgon2id = async (userId, plainPassword) => {
  const next = await hashPasswordArgon2id(plainPassword);
  await User.updateOne(
    { userId },
    {
      $set: {
        salt: next.salt,
        hash: next.hash,
        passwordAlgo: next.passwordAlgo
      }
    }
  );
  return next;
};
const sessionService = createSessionService({
  cleanText,
  logger,
  toShortText,
  findUserById,
  sessionTtlMs: SESSION_TTL_MS,
  cookieSecure,
  csrfCookieName,
  csrfHeaderName,
  csrfUnsafeMethods,
  redisSessionKeyPrefix
});

const {
  initSessionStore,
  setSessionCookie,
  clearSessionCookie,
  setCsrfCookie,
  clearCsrfCookie,
  createSession,
  deleteSession,
  getSessionUser,
  requireAuth,
  ensureCsrfTokenCookie,
  requireCsrfToken
} = sessionService;

const parseDashboardPagination = (query = {}, defaultLimit = dashboardCollectionDefaultLimit) => {
  const parsedLimit =
    toNullableNumber(query?.limit, 1, dashboardCollectionMaxLimit) ?? defaultLimit;
  const parsedOffset = toNullableNumber(query?.offset, 0, 100000) ?? 0;
  return {
    limit: Math.trunc(parsedLimit),
    offset: Math.trunc(parsedOffset)
  };
};

const stripUserIdField = (doc = {}) => {
  if (!doc || typeof doc !== "object") return doc;
  const { userId, ...rest } = doc;
  return rest;
};

const loadCollectionPage = async ({
  model,
  userId,
  sortField,
  limit,
  offset
}) => {
  const [items, total] = await Promise.all([
    model
      .find({ userId })
      .sort({ [sortField]: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    model.countDocuments({ userId })
  ]);

  return {
    items: items.map(stripUserIdField),
    total,
    limit,
    offset,
    source: "collection"
  };
};

const getDashboardCollections = async (user, pagination = {}) => {
  const userId = cleanText(user?.id, 120);
  if (!userId) {
    return {
      workoutSessions: { items: [], total: 0, limit: 0, offset: 0, source: "collection" },
      mealLogs: { items: [], total: 0, limit: 0, offset: 0, source: "collection" },
      progressMetrics: { items: [], total: 0, limit: 0, offset: 0, source: "collection" }
    };
  }

  const workoutPagination = {
    ...parseDashboardPagination({}, dashboardCollectionDefaultLimit),
    ...(pagination.workoutSessions || {})
  };
  const mealPagination = {
    ...parseDashboardPagination({}, dashboardCollectionDefaultLimit),
    ...(pagination.mealLogs || {})
  };
  const metricPagination = {
    ...parseDashboardPagination({}, dashboardCollectionDefaultLimit),
    ...(pagination.progressMetrics || {})
  };

  const [workoutSessions, mealLogs, progressMetrics] = await Promise.all([
    loadCollectionPage({
      model: WorkoutSession,
      userId,
      sortField: "createdAt",
      limit: workoutPagination.limit,
      offset: workoutPagination.offset
    }),
    loadCollectionPage({
      model: MealLog,
      userId,
      sortField: "loggedAt",
      limit: mealPagination.limit,
      offset: mealPagination.offset
    }),
    loadCollectionPage({
      model: ProgressMetric,
      userId,
      sortField: "loggedAt",
      limit: metricPagination.limit,
      offset: metricPagination.offset
    })
  ]);

  return {
    workoutSessions,
    mealLogs,
    progressMetrics
  };
};

const buildDashboardResponse = async (user, pagination = {}) => {
  const baseDashboard = buildDashboard(user?.dashboard);
  const collections = await getDashboardCollections(user, pagination);

  return {
    dashboard: {
      ...baseDashboard,
      workoutSessions: collections.workoutSessions.items,
      mealLogs: collections.mealLogs.items,
      progressMetrics: collections.progressMetrics.items
    },
    pagination: {
      workoutSessions: {
        total: collections.workoutSessions.total,
        limit: collections.workoutSessions.limit,
        offset: collections.workoutSessions.offset,
        source: collections.workoutSessions.source
      },
      mealLogs: {
        total: collections.mealLogs.total,
        limit: collections.mealLogs.limit,
        offset: collections.mealLogs.offset,
        source: collections.mealLogs.source
      },
      progressMetrics: {
        total: collections.progressMetrics.total,
        limit: collections.progressMetrics.limit,
        offset: collections.progressMetrics.offset,
        source: collections.progressMetrics.source
      }
    }
  };
};

const apiLimiter = rateLimit({
  windowMs: apiRateLimitWindowMs,
  max: apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    metrics.rateLimited += 1;
    req.log?.warn(
      {
        event: "rate_limited",
        scope: "api_global",
        method: req.method,
        path: req.originalUrl || req.url
      },
      "Request rate limited."
    );
    res.status(429).json({ error: "Too many requests. Please try again shortly." });
  }
});

const authLimiter = rateLimit({
  windowMs: authRateLimitWindowMs,
  max: authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    metrics.rateLimited += 1;
    req.log?.warn(
      {
        event: "rate_limited",
        scope: "auth",
        method: req.method,
        path: req.originalUrl || req.url
      },
      "Auth request rate limited."
    );
    res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
  }
});

const generateLimiter = rateLimit({
  windowMs: generateRateLimitWindowMs,
  max: generateRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    metrics.rateLimited += 1;
    req.log?.warn(
      {
        event: "rate_limited",
        scope: "generate",
        method: req.method,
        path: req.originalUrl || req.url
      },
      "Generate request rate limited."
    );
    res.status(429).json({ error: "Workout generation rate limit reached. Please wait and retry." });
  }
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/generate", generateLimiter);
app.use("/api", ensureCsrfTokenCookie);
app.use("/api", requireCsrfToken);

registerApiRoutes(app, {
  User,
  metrics,
  serverBootAtMs,
  redisConfigured: sessionService.isRedisConfigured,
  redisSessionsEnabled: sessionService.isRedisSessionsEnabled,
  redisClient: sessionService.getRedisClient,
  redisLastErrorRef: sessionService.getRedisLastError,
  errorTrackingConfigured: () => Boolean(cleanText(process.env.SENTRY_DSN || "", 500)),
  errorTrackingEnabled: () => Boolean(errorTracker?.enabled),
  mongoReadyStateToText,
  isUpstreamFailureStatus,
  toNullableNumber,
  fetchOpenMeteo,
  toFiniteNumber,
  cleanText,
  weatherCodeToText,
  buildWorkoutRecommendation,
  openAqRequest,
  extractOpenAqMeasurement,
  pm25ToUsAqi,
  aqiBand,
  mergeCacheStatuses,
  openAqParameterLabel,
  wgerRequest,
  mapWgerExercise,
  parseMultiNumberQuery,
  wgerDefaultLanguage,
  mealDbRequest,
  mapMealDbMeal,
  getSessionUser,
  defaultProfile,
  requireAuth,
  validateBody,
  profileBodySchema,
  buildProfile,
  mapMongoDocToUser,
  signupBodySchema,
  findUserByEmail,
  isCompleteSignupProfile,
  hashPassword,
  defaultDashboard,
  createUser,
  createSession,
  setSessionCookie,
  setCsrfCookie,
  loginBodySchema,
  getDummyPasswordRecord,
  verifyPassword,
  shouldUpgradePasswordToArgon2id,
  upgradeUserPasswordToArgon2id,
  toShortText,
  parseCookies,
  deleteSession,
  clearSessionCookie,
  clearCsrfCookie,
  buildDashboardResponse,
  parseDashboardPagination,
  getDashboardCollections,
  workoutSessionBodySchema,
  buildWorkoutSessionEntry,
  WorkoutSession,
  toWorkoutSummaryEntry,
  caloriesBodySchema,
  goalsBodySchema,
  mealLogBodySchema,
  buildMealLogEntry,
  MealLog,
  progressMetricBodySchema,
  buildProgressMetricEntry,
  ProgressMetric,
  savedExerciseBodySchema,
  buildSavedExerciseEntry,
  gemini,
  generatePlanBodySchema,
  toCleanArray
});
app.use(
  createErrorHandler({
    logger,
    toShortText,
    captureException: (error, context = {}) => {
      errorTracker.captureException(error, context);
    }
  })
);

const startServer = async () => {
  try {
    errorTracker = await initErrorTracking({ logger, toShortText });
    const { mongoUri } = await connectDatabase();
    logger.info({ event: "mongodb_connected", mongoUri }, "MongoDB connected.");
    await initSessionStore();
    app.listen(port, () => {
      logger.info({ event: "server_started", port }, `Server listening on http://localhost:${port}`);
    });
  } catch (err) {
    logger.fatal(
      { event: "server_start_failed", error: toShortText(err?.message || String(err), 300) },
      "Failed to start server."
    );
    try {
      await errorTracker.flush(sentryShutdownTimeoutMs);
    } catch {
      // Ignore tracking flush failures during startup failure.
    }
    process.exit(1);
  }
};

export {
  app,
  startServer
};

export const __testables = {
  defaultProfile,
  defaultGoals,
  defaultDashboard,
  buildDashboard,
  cleanText,
  toNullableNumber,
  toCleanArray,
  toCleanNameArray,
  buildWorkoutSessionEntry,
  toWorkoutSummaryEntry,
  buildMealLogEntry,
  buildProgressMetricEntry,
  buildSavedExerciseEntry,
  buildProfile,
  isCompleteSignupProfile,
  getValidationMessage,
  toFiniteNumber,
  weatherCodeToText,
  isSevereWeatherCode,
  isOutdoorFriendlyNow,
  buildWorkoutRecommendation,
  normalizePlainText,
  serializeCacheKeyPart,
  buildExternalCacheKey,
  mergeCacheStatuses,
  parseMultiNumberQuery,
  parseCookies,
  parseRedisPort,
  parseEnvBoolean
};

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  startServer();
}


