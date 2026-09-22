import { existsSync } from "fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { closePostgres, connectPostgres, getPostgresStatus } from "./db/postgres.js";
import { connectPrisma, disconnectPrisma, prisma } from "./db/prisma.js";
import { createShutdownHandler } from "./shutdown.js";
import { createErrorHandler } from "./middleware/errorHandler.js";
import { createRequestContextMiddleware } from "./middleware/requestContext.js";
import { registerApiRoutes } from "./routes/registerApiRoutes.js";
import { registerClientStatic, resolveClientDistPath } from "./staticClient.js";
import { createAuthUserService } from "./services/authUserService.js";
import {
  accountDeleteBodySchema,
  caloriesBodySchema,
  generatePlanBodySchema,
  getValidationMessage,
  goalsBodySchema,
  loginBodySchema,
  mealLogBodySchema,
  passwordChangeBodySchema,
  profileBodySchema,
  progressMetricBodySchema,
  savedExerciseBodySchema,
  signupBodySchema,
  validateBody,
  workoutSessionBodySchema
} from "./services/apiSchemaService.js";
import { createExternalDataService } from "./services/externalDataService.js";
import { initErrorTracking } from "./services/errorTrackingService.js";
import { createExternalApiLatencyRecorder, createMetrics } from "./services/metricsService.js";
import { createCorsPolicy } from "./corsPolicy.js";
import { createHttpCacheService } from "./services/httpCacheService.js";
import { isUpstreamFailureStatus } from "./services/platformHealthService.js";
import { createDashboardCollectionService } from "./services/dashboardCollectionService.js";
import { createUserReadRepository } from "./repositories/userReadRepository.js";
import { createProgressMetricRepository } from "./repositories/progressMetricRepository.js";
import { createWorkoutSessionRepository } from "./repositories/workoutSessionRepository.js";
import { createMealLogRepository } from "./repositories/mealLogRepository.js";
import { createDashboardCollectionRepository } from "./repositories/dashboardCollectionRepository.js";
import { createSavedExerciseRepository } from "./repositories/savedExerciseRepository.js";
import { createUserRepository } from "./repositories/userRepository.js";
import { createGeneratedPlanRepository } from "./repositories/generatedPlanRepository.js";
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
  toNullableNumber
} from "./services/dashboardDataBuildersService.js";
import {
  createSessionService,
  parseCookies,
  parseEnvBoolean,
  parseRedisPort
} from "./services/sessionService.js";
import { validateEnv } from "./services/envValidationService.js";

dotenv.config();

if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  // Must run before any other module-scope code reads process.env below
  // (the pino logger, argon2 options, the port, ~30 vars in all) -- a
  // check that runs after those reads is not a preflight, it is a report
  // filed after the crash. Kept in its own guard so the suite, which
  // imports `app` from this module, never trips a fatal env check.
  const envErrors = validateEnv(process.env);
  if (envErrors.length > 0) {
    // process.stderr rather than the pino logger: the logger is not yet
    // constructed at this point, and even once it exists, LOG_LEVEL=silent
    // would swallow a logger.fatal here with no output at all.
    process.stderr.write(
      `Environment validation failed:\n${envErrors.map((line) => `  - ${line}`).join("\n")}\n`
    );
    process.exit(1);
  }
}

const app = express();
const port = process.env.PORT || 5000;
const serverBootAtMs = Date.now();
let postgresLastError = "";

const toShortText = (value, maxLen = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const parseCsvEnv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const { corsOptions, isEmpty: corsAllowlistIsEmpty } = createCorsPolicy(
  parseCsvEnv(process.env.CLIENT_ORIGIN || process.env.CLIENT_ORIGINS)
);
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

if (corsAllowlistIsEmpty) {
  logger.warn(
    { event: "cors_allowlist_missing" },
    "CLIENT_ORIGIN is not set. Allowing loopback origins only; set it before deploying."
  );
}

const metrics = createMetrics();
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

app.use(
  helmet({
    // Every response here is JSON, so nothing legitimately loads a subresource.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'none'"],
        "frame-ancestors": ["'none'"],
        "base-uri": ["'none'"],
        "form-action": ["'none'"]
      }
    },
    // The SPA is served from its own origin, so the default same-origin CORP
    // would block it from reading these responses.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
    hsts:
      process.env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true } : false
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

// Guards before it coerces. The `> 0` below already rejected the 0 that
// `Number(null)` and `Number("")` produce, so this changes no answer -- it just
// stops the safety being a side effect of the range. A later helper copying
// this shape for a range that includes 0 would not have been so lucky.
const toPositiveInt = (value, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const recordExternalApiLatency = createExternalApiLatencyRecorder({ metrics, cleanText });

const apiRateLimitWindowMs = toPositiveInt(process.env.API_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
const apiRateLimitMax = toPositiveInt(process.env.API_RATE_LIMIT_MAX, 300);
const authRateLimitWindowMs = toPositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000);
const authRateLimitMax = toPositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 25);
// Guards the two routes that re-verify a signed-in caller's own password.
// Those requests arrive with a valid session already in hand, so the shared
// login/signup budget above does not apply to them, and the global /api
// limiter alone is far too loose a bound on a per-guess argon2id verify.
const credentialRateLimitWindowMs = toPositiveInt(
  process.env.CREDENTIAL_RATE_LIMIT_WINDOW_MS,
  10 * 60 * 1000
);
const credentialRateLimitMax = toPositiveInt(process.env.CREDENTIAL_RATE_LIMIT_MAX, 10);
const generateRateLimitWindowMs = toPositiveInt(
  process.env.GENERATE_RATE_LIMIT_WINDOW_MS,
  10 * 60 * 1000
);
const generateRateLimitMax = toPositiveInt(process.env.GENERATE_RATE_LIMIT_MAX, 20);
// Anonymous callers may still try the generator, but on a much tighter budget so
// an unauthenticated visitor cannot drain the Gemini quota.
const anonGenerateRateLimitWindowMs = toPositiveInt(
  process.env.ANON_GENERATE_RATE_LIMIT_WINDOW_MS,
  24 * 60 * 60 * 1000
);
const anonGenerateRateLimitMax = toPositiveInt(process.env.ANON_GENERATE_RATE_LIMIT_MAX, 3);
const dashboardCollectionDefaultLimit = toPositiveInt(
  process.env.DASHBOARD_COLLECTION_DEFAULT_LIMIT,
  50
);
const dashboardCollectionMaxLimit = toPositiveInt(process.env.DASHBOARD_COLLECTION_MAX_LIMIT, 200);
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
const redisConnectTimeoutMs = toPositiveInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 10000);
const shutdownTimeoutMs = toPositiveInt(process.env.SHUTDOWN_TIMEOUT_MS, 10000);
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
const { findUserWithDashboard, findUserWithDashboardByEmail, createUserWithDashboard } =
  createUserReadRepository({ prisma });
// Progress-metric writes go straight to Prisma; the shim still backs its reads.
const { saveProgressMetric } = createProgressMetricRepository({ prisma });
const { saveWorkoutSession } = createWorkoutSessionRepository({ prisma });
const { saveMealLog, syncDerivedCalorieEntry } = createMealLogRepository({ prisma });
const { loadCollectionPage } = createDashboardCollectionRepository({ prisma });
const { saveExercise, removeExercise } = createSavedExerciseRepository({ prisma });
const { updateProfile, updateGoals, updatePasswordHash, saveCalorieEntry, deleteUser } =
  createUserRepository({
    prisma
  });
const { saveGeneratedPlan } = createGeneratedPlanRepository({ prisma });
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

const externalDataService = createExternalDataService({
  cleanText,
  toNullableNumber,
  readThroughExternalCache,
  buildExternalCacheKey,
  metrics,
  logger,
  toShortText,
  recordExternalApiLatency,
  externalApiRetries,
  externalApiRetryBaseDelayMs,
  openMeteoBaseUrl,
  openMeteoTimeoutMs,
  openMeteoCacheTtlSec,
  openAqBaseUrl,
  openAqApiKey,
  openAqTimeoutMs,
  openAqCacheTtlSec,
  wgerBaseUrl,
  wgerApiToken,
  wgerDefaultLanguage,
  wgerTimeoutMs,
  wgerCacheTtlSec,
  mealDbBaseUrl,
  mealDbTimeoutMs,
  mealDbCacheTtlSec
});
const {
  toFiniteNumber,
  weatherCodeToText,
  isSevereWeatherCode,
  isOutdoorFriendlyNow,
  buildWorkoutRecommendation,
  fetchOpenMeteo,
  openAqRequest,
  openAqParameterLabel,
  extractOpenAqMeasurement,
  pm25ToUsAqi,
  aqiBand,
  normalizePlainText,
  parseMultiNumberQuery,
  wgerRequest,
  mealDbRequest,
  mapMealDbMeal,
  mapWgerExercise
} = externalDataService;

const authUserService = createAuthUserService({
  findUserWithDashboard,
  findUserWithDashboardByEmail,
  createUserWithDashboard,
  cleanText,
  argon2Options: {
    timeCost: argon2TimeCost,
    memoryCost: argon2MemoryCost,
    parallelism: argon2Parallelism,
    hashLength: argon2HashLength
  },
  updatePasswordHash
});
const {
  mapDbDocToUser,
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
  redisSessionKeyPrefix,
  redisConnectTimeoutMs
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
  attachOptionalUser,
  ensureCsrfTokenCookie,
  requireCsrfToken
} = sessionService;
const dashboardCollectionService = createDashboardCollectionService({
  cleanText,
  toNullableNumber,
  defaultLimit: dashboardCollectionDefaultLimit,
  maxLimit: dashboardCollectionMaxLimit,
  loadCollectionPage,
  buildDashboard
});
const { parseDashboardPagination, getDashboardCollections, buildDashboardResponse } =
  dashboardCollectionService;

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

// Bound by method rather than by path: GET /api/auth/me is the session check
// the client calls on every page load and must never share this budget, so
// this is applied to the POST and DELETE routes individually below instead of
// with app.use("/api/auth/me", ...), which would also throttle that GET.
const credentialLimiter = rateLimit({
  windowMs: credentialRateLimitWindowMs,
  max: credentialRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    metrics.rateLimited += 1;
    req.log?.warn(
      {
        event: "rate_limited",
        scope: "credential",
        method: req.method,
        path: req.originalUrl || req.url
      },
      "Credential verification rate limited."
    );
    res.status(429).json({ error: "Too many attempts. Please try again later." });
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
    res
      .status(429)
      .json({ error: "Workout generation rate limit reached. Please wait and retry." });
  }
});

// Applies only to callers without a session. Uses the library's default IP key
// generator so IPv6 clients are bucketed by prefix rather than by single address.
const anonGenerateLimiter = rateLimit({
  windowMs: anonGenerateRateLimitWindowMs,
  max: anonGenerateRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => Boolean(req.user),
  handler: (req, res) => {
    metrics.rateLimited += 1;
    req.log?.warn(
      {
        event: "rate_limited",
        scope: "generate_anonymous",
        method: req.method,
        path: req.originalUrl || req.url
      },
      "Anonymous generate quota reached."
    );
    res.status(429).json({
      error: "Free plan limit reached. Sign in to keep generating workout plans.",
      requiresAuth: true
    });
  }
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.post("/api/auth/password", credentialLimiter);
app.delete("/api/auth/me", credentialLimiter);
app.use("/api/generate", attachOptionalUser, anonGenerateLimiter, generateLimiter);
app.use("/api", ensureCsrfTokenCookie);
app.use("/api", requireCsrfToken);

registerApiRoutes(app, {
  findUserWithDashboard,
  metrics,
  serverBootAtMs,
  redisConfigured: sessionService.isRedisConfigured,
  redisSessionsEnabled: sessionService.isRedisSessionsEnabled,
  redisClient: sessionService.getRedisClient,
  postgresStatusRef: getPostgresStatus,
  errorTrackingConfigured: () => Boolean(cleanText(process.env.SENTRY_DSN || "", 500)),
  errorTrackingEnabled: () => Boolean(errorTracker?.enabled),
  // Gate for /api/metrics. Absent in production closes the endpoint rather
  // than opening it -- see the note on metricsGuard in systemRoutes.js.
  metricsToken: cleanText(process.env.METRICS_TOKEN || "", 200),
  isProduction: process.env.NODE_ENV === "production",
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
  mapDbDocToUser,
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
  saveWorkoutSession,
  caloriesBodySchema,
  goalsBodySchema,
  mealLogBodySchema,
  buildMealLogEntry,
  saveMealLog,
  syncDerivedCalorieEntry,
  progressMetricBodySchema,
  buildProgressMetricEntry,
  saveProgressMetric,
  savedExerciseBodySchema,
  buildSavedExerciseEntry,
  saveExercise,
  removeExercise,
  updateProfile,
  updateGoals,
  saveCalorieEntry,
  passwordChangeBodySchema,
  accountDeleteBodySchema,
  updatePasswordHash,
  deleteUser,
  gemini,
  generatePlanBodySchema,
  saveGeneratedPlan,
  toCleanArray
});
// After the API routes so /api keeps its own 404s, and before the error
// handler so a sendFile failure still reaches it. See staticClient.js for why
// the client must be served from this origin rather than deployed separately.
registerClientStatic(app, {
  express,
  existsSync,
  distPath: resolveClientDistPath(process.env.CLIENT_DIST_PATH),
  logger
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
    const postgresStartupRequired = parseEnvBoolean(
      process.env.POSTGRES_STARTUP_REQUIRED,
      process.env.NODE_ENV === "production"
    );
    try {
      const postgresStatus = await connectPostgres();
      await connectPrisma();
      postgresLastError = "";
      if (postgresStatus.configured) {
        logger.info(
          { event: "postgres_connected", databaseUrl: postgresStatus.databaseUrl },
          "Postgres connected."
        );
      }
    } catch (postgresErr) {
      postgresLastError = toShortText(postgresErr?.message || String(postgresErr), 300);
      if (postgresStartupRequired) throw postgresErr;
      logger.warn(
        {
          event: "postgres_startup_skipped",
          error: postgresLastError
        },
        "Postgres connection failed. Starting API in degraded local mode."
      );
    }
    const sessionStoreStatus = await initSessionStore();
    // In-memory sessions do not survive a restart and are not shared between
    // replicas, so a multi-instance deployment can opt into failing loudly rather
    // than silently degrading to them.
    const redisStartupRequired = parseEnvBoolean(process.env.REDIS_STARTUP_REQUIRED, false);
    if (redisStartupRequired && sessionStoreStatus.configured && !sessionStoreStatus.connected) {
      throw new Error(
        `Redis is configured but unreachable and REDIS_STARTUP_REQUIRED is set. ${sessionStoreStatus.lastError}`.trim()
      );
    }
    const httpServer = app.listen(port, () => {
      logger.info(
        { event: "server_started", port },
        `Server listening on http://localhost:${port}`
      );
    });

    const handleShutdown = createShutdownHandler({
      logger,
      toShortText,
      getHttpServer: () => httpServer,
      closeSessionStore: sessionService.closeSessionStore,
      disconnectPrisma,
      closePostgres,
      flushErrorTracker: () => errorTracker.flush(sentryShutdownTimeoutMs),
      shutdownTimeoutMs
    });
    // Registered here rather than at module scope so importing `app` in tests
    // does not attach process-wide handlers.
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    process.on("SIGINT", () => handleShutdown("SIGINT"));
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

export { app, startServer };

export const __testables = {
  defaultProfile,
  defaultGoals,
  defaultDashboard,
  buildDashboard,
  cleanText,
  toNullableNumber,
  toPositiveInt,
  toCleanArray,
  toCleanNameArray,
  buildWorkoutSessionEntry,
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
