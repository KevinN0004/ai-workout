import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { connectDatabase } from "./db.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { createRequestContextMiddleware } from "./middleware/requestContext.js";
import { registerApiRoutes } from "./routes/registerApiRoutes.js";
import { createAuthUserService } from "./services/authUserService.js";
import {
  caloriesBodySchema,
  generatePlanBodySchema,
  getValidationMessage,
  goalsBodySchema,
  loginBodySchema,
  mealLogBodySchema,
  profileBodySchema,
  progressMetricBodySchema,
  savedExerciseBodySchema,
  signupBodySchema,
  validateBody,
  workoutSessionBodySchema
} from "./services/apiSchemaService.js";
import { initErrorTracking } from "./services/errorTrackingService.js";
import { createHttpCacheService } from "./services/httpCacheService.js";
import { isUpstreamFailureStatus, mongoReadyStateToText } from "./services/platformHealthService.js";
import { createDashboardCollectionService } from "./services/dashboardCollectionService.js";
import {
  buildDashboard,
  buildMealLogEntry,
  buildProfile,
  buildProgressMetricEntry,
  buildSavedExerciseEntry,
  buildWorkoutSessionEntry,
  cleanText,
  defaultDashboard,
  defaultGoals,
  defaultProfile,
  isCompleteSignupProfile,
  toCleanArray,
  toCleanNameArray,
  toNullableNumber,
  toWorkoutSummaryEntry
} from "./services/dashboardDataBuildersService.js";
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

const authUserService = createAuthUserService({
  User,
  cleanText,
  argon2Options: {
    timeCost: argon2TimeCost,
    memoryCost: argon2MemoryCost,
    parallelism: argon2Parallelism,
    hashLength: argon2HashLength
  }
});
const {
  mapMongoDocToUser,
  findUserById,
  findUserByEmail,
  createUser,
  hashPassword,
  getDummyPasswordRecord,
  verifyPassword,
  shouldUpgradePasswordToArgon2id,
  upgradeUserPasswordToArgon2id
} = authUserService;
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
const dashboardCollectionService = createDashboardCollectionService({
  cleanText,
  toNullableNumber,
  defaultLimit: dashboardCollectionDefaultLimit,
  maxLimit: dashboardCollectionMaxLimit,
  WorkoutSession,
  MealLog,
  ProgressMetric,
  buildDashboard
});
const {
  parseDashboardPagination,
  getDashboardCollections,
  buildDashboardResponse
} = dashboardCollectionService;

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


