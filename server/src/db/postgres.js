/**
 * The raw pg pool and its connection status. The migration script applies the
 * schema through the pool; index.js opens it at startup as a probe, and the
 * readiness route reports its status. Prisma keeps its own connection (prisma.js).
 */
let postgresPool = null;

const cleanText = (value, maxLen = 500) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const redactDatabaseUrl = (value) => {
  const raw = cleanText(value, 1000);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.password) parsed.password = "redacted";
    if (parsed.username) parsed.username = "redacted";
    return parsed.toString();
  } catch {
    return raw.replace(/\/\/([^:@/]+)(:[^@/]*)?@/, "//[redacted]:[redacted]@");
  }
};

let postgresStatus = {
  configured: false,
  connected: false,
  lastError: "",
  databaseUrl: ""
};

/**
 * Reads the connection settings from `env`: the URL (DATABASE_URL, else
 * POSTGRES_URL), a copy with the credentials redacted for logs and status, and
 * the SSL flags. SSL is off unless POSTGRES_SSL is true; with it on, the server
 * certificate is verified unless POSTGRES_SSL_REJECT_UNAUTHORIZED is false.
 */
export const resolvePostgresConfig = (env = process.env) => {
  const databaseUrl = cleanText(env.DATABASE_URL || env.POSTGRES_URL || "", 1000);
  return {
    configured: Boolean(databaseUrl),
    databaseUrl,
    safeDatabaseUrl: redactDatabaseUrl(databaseUrl),
    ssl: parseBoolean(env.POSTGRES_SSL, false),
    sslRejectUnauthorized: parseBoolean(env.POSTGRES_SSL_REJECT_UNAUTHORIZED, true)
  };
};

/**
 * A copy of the last known status: whether a URL is configured, whether the
 * startup probe connected, its error, and the redacted URL. Nothing re-probes,
 * so it changes only when connectPostgres or closePostgres runs.
 */
export const getPostgresStatus = () => ({ ...postgresStatus });

/** The open pool, or null before connectPostgres succeeds and after closePostgres. */
export const getPostgresPool = () => postgresPool;

/**
 * Opens the pool and proves it with one `select 1`, then returns the status.
 * With no URL configured it opens nothing. On a failure it records the error in
 * the status, ends the half-open pool and rethrows.
 */
export const connectPostgres = async ({ env = process.env } = {}) => {
  const config = resolvePostgresConfig(env);
  postgresStatus = {
    configured: config.configured,
    connected: false,
    lastError: "",
    databaseUrl: config.safeDatabaseUrl
  };

  if (!config.configured) return getPostgresStatus();

  try {
    const { Pool } = await import("pg");
    postgresPool = new Pool({
      connectionString: config.databaseUrl,
      // No `options: "-c timezone=UTC"` here, deliberately -- PgBouncer rejects
      // that startup parameter and this pool is what applies the migrations, so
      // carrying it would make the schema unreachable on any pooled database.
      // UTC comes from the database default instead; see
      // server/db/postgres/003_utc_timezone.sql.
      ssl: config.ssl
        ? {
            rejectUnauthorized: config.sslRejectUnauthorized
          }
        : undefined
    });

    const client = await postgresPool.connect();
    try {
      await client.query("select 1");
    } finally {
      client.release();
    }

    postgresStatus = {
      ...postgresStatus,
      connected: true,
      lastError: ""
    };
    return getPostgresStatus();
  } catch (err) {
    postgresStatus = {
      ...postgresStatus,
      connected: false,
      lastError: cleanText(err?.message || String(err), 300)
    };
    if (postgresPool) {
      try {
        await postgresPool.end();
      } catch {
        // Ignore cleanup failures after a failed startup probe.
      }
      postgresPool = null;
    }
    throw err;
  }
};

/** Ends the pool, if one is open, and marks the status disconnected. */
export const closePostgres = async () => {
  if (!postgresPool) return;
  await postgresPool.end();
  postgresPool = null;
  postgresStatus = {
    ...postgresStatus,
    connected: false
  };
};
