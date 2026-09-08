/**
 * Startup preflight for the process environment.
 *
 * This validates and reports; it does NOT capture or freeze values. Callers keep
 * reading process.env live, because index.test.js mutates GEMINI_API_KEY at
 * runtime and generateRoutes.js reads it per request.
 */

const NUMERIC_VARS = [
  { name: "PORT", min: 1, max: 65535 },
  { name: "SHUTDOWN_TIMEOUT_MS", min: 0 },
  { name: "REDIS_CONNECT_TIMEOUT_MS", min: 0 },
  { name: "API_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "API_RATE_LIMIT_MAX", min: 1 },
  { name: "AUTH_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "AUTH_RATE_LIMIT_MAX", min: 1 },
  { name: "GENERATE_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "GENERATE_RATE_LIMIT_MAX", min: 1 },
  { name: "ANON_GENERATE_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "ANON_GENERATE_RATE_LIMIT_MAX", min: 1 },
  { name: "ARGON2_TIME_COST", min: 1 },
  { name: "ARGON2_MEMORY_COST", min: 8 },
  { name: "ARGON2_PARALLELISM", min: 1 },
  { name: "ARGON2_HASH_LENGTH", min: 4 },
  { name: "DASHBOARD_COLLECTION_DEFAULT_LIMIT", min: 1 },
  { name: "DASHBOARD_COLLECTION_MAX_LIMIT", min: 1 },
  { name: "EXTERNAL_API_RETRIES", min: 0 },
  { name: "EXTERNAL_API_RETRY_BASE_DELAY_MS", min: 0 },
  { name: "EXTERNAL_CACHE_MAX_ENTRIES", min: 1 },
  { name: "EXTERNAL_CACHE_STALE_TTL_SEC", min: 0 },
  { name: "OPEN_METEO_CACHE_TTL_SEC", min: 0 },
  { name: "OPENAQ_CACHE_TTL_SEC", min: 0 },
  { name: "WGER_CACHE_TTL_SEC", min: 0 },
  { name: "MEALDB_CACHE_TTL_SEC", min: 0 },
  { name: "WGER_DEFAULT_LANGUAGE", min: 1 },
  { name: "SENTRY_SHUTDOWN_TIMEOUT_MS", min: 0 }
];

// Only HTTP endpoints are parsed. Postgres and Redis connection strings are
// checked for presence alone -- passwords routinely contain characters that
// make new URL() throw on a perfectly valid DSN.
const URL_VARS = ["OPEN_METEO_BASE_URL", "OPENAQ_BASE_URL", "WGER_BASE_URL", "MEALDB_BASE_URL"];

const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

export const validateEnv = (env = {}) => {
  const errors = [];

  if (isBlank(env.DATABASE_URL) && isBlank(env.POSTGRES_URL)) {
    errors.push("DATABASE_URL (or POSTGRES_URL) is required.");
  }

  if (env.NODE_ENV === "production" && isBlank(env.CLIENT_ORIGIN) && isBlank(env.CLIENT_ORIGINS)) {
    errors.push("CLIENT_ORIGIN (or CLIENT_ORIGINS) is required when NODE_ENV=production.");
  }

  for (const { name, min, max } of NUMERIC_VARS) {
    if (isBlank(env[name])) continue;
    const value = Number(env[name]);
    if (!Number.isFinite(value)) {
      errors.push(`${name} must be a number (received "${env[name]}").`);
      continue;
    }
    if (min !== undefined && value < min) {
      errors.push(`${name} must be >= ${min} (received ${value}).`);
    }
    if (max !== undefined && value > max) {
      errors.push(`${name} must be <= ${max} (received ${value}).`);
    }
  }

  for (const name of URL_VARS) {
    if (isBlank(env[name])) continue;
    try {
      new URL(String(env[name]).trim());
    } catch {
      errors.push(`${name} must be a valid URL (received "${env[name]}").`);
    }
  }

  if (!isBlank(env.SENTRY_TRACES_SAMPLE_RATE)) {
    const rate = Number(env.SENTRY_TRACES_SAMPLE_RATE);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      errors.push(
        `SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1 (received "${env.SENTRY_TRACES_SAMPLE_RATE}").`
      );
    }
  }

  return errors;
};
