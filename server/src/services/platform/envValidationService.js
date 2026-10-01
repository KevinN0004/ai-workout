/**
 * Startup preflight for the process environment: index.js runs validateEnv
 * (outside the test suites) before its own module-scope reads of process.env,
 * and exits on any error. Imported modules such as prisma.js read it earlier.
 */

// Every min/max here is meant to match what the corresponding reader in
// index.js / sessionService.js actually accepts, not just what sounds
// reasonable in isolation -- a floor the reader silently discards (falling
// back to its default) is worse than no floor: it tells the operator their
// setting took effect when it did not. Check the call site before changing
// a bound. ARGON2_TIME_COST and ARGON2_MEMORY_COST carry floors stricter than
// toPositiveInt's. They are this app's floors, not limits argon2 enforces (the
// library accepts lower costs), so lowering one is a security decision, not a
// compatibility one.
const NUMERIC_VARS = [
  { name: "PORT", min: 1, max: 65535 },
  { name: "SHUTDOWN_TIMEOUT_MS", min: 1 },
  { name: "REDIS_CONNECT_TIMEOUT_MS", min: 1 },
  { name: "REDIS_PORT", min: 1, max: 65535 },
  { name: "API_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "API_RATE_LIMIT_MAX", min: 1 },
  { name: "AUTH_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "AUTH_RATE_LIMIT_MAX", min: 1 },
  { name: "GENERATE_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "GENERATE_RATE_LIMIT_MAX", min: 1 },
  { name: "ANON_GENERATE_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "ANON_GENERATE_RATE_LIMIT_MAX", min: 1 },
  { name: "ARGON2_TIME_COST", min: 2 },
  { name: "ARGON2_MEMORY_COST", min: 1024 },
  { name: "ARGON2_PARALLELISM", min: 1 },
  { name: "ARGON2_HASH_LENGTH", min: 4 },
  { name: "DASHBOARD_COLLECTION_DEFAULT_LIMIT", min: 1 },
  { name: "DASHBOARD_COLLECTION_MAX_LIMIT", min: 1 },
  { name: "EXTERNAL_API_RETRIES", min: 1 },
  { name: "EXTERNAL_API_RETRY_BASE_DELAY_MS", min: 1 },
  { name: "EXTERNAL_CACHE_MAX_ENTRIES", min: 1 },
  { name: "EXTERNAL_CACHE_STALE_TTL_SEC", min: 1 },
  { name: "OPEN_METEO_CACHE_TTL_SEC", min: 1 },
  { name: "OPENAQ_CACHE_TTL_SEC", min: 1 },
  { name: "WGER_CACHE_TTL_SEC", min: 1 },
  { name: "MEALDB_CACHE_TTL_SEC", min: 1 },
  { name: "WGER_DEFAULT_LANGUAGE", min: 1, max: 100 },
  { name: "SENTRY_SHUTDOWN_TIMEOUT_MS", min: 1 }
];

// Only HTTP endpoints are parsed. Postgres and Redis connection strings are
// checked for presence alone -- passwords routinely contain characters that
// make new URL() throw on a perfectly valid DSN.
const URL_VARS = ["OPEN_METEO_BASE_URL", "OPENAQ_BASE_URL", "WGER_BASE_URL", "MEALDB_BASE_URL"];

const isBlank = (value) => value === undefined || value === null || String(value).trim() === "";

/**
 * Checks `env` and returns one message per problem, or [] when there is none.
 *
 * This validates and reports; it does NOT capture or freeze values. Callers keep
 * reading process.env live, because index.test.js mutates GEMINI_API_KEY at
 * runtime and generateRoutes.js reads it per request.
 */
export const validateEnv = (env = {}) => {
  const errors = [];

  if (isBlank(env.DATABASE_URL) && isBlank(env.POSTGRES_URL)) {
    errors.push("DATABASE_URL (or POSTGRES_URL) is required.");
  }

  if (env.NODE_ENV === "production" && isBlank(env.CLIENT_ORIGIN) && isBlank(env.CLIENT_ORIGINS)) {
    errors.push("CLIENT_ORIGIN (or CLIENT_ORIGINS) is required when NODE_ENV=production.");
  }

  // Optional settings, checked only when set: numbers against their bounds,
  // then the URLs, then the Sentry sample rate.
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
