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

export const getPostgresStatus = () => ({ ...postgresStatus });

export const getPostgresPool = () => postgresPool;

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

export const closePostgres = async () => {
  if (!postgresPool) return;
  await postgresPool.end();
  postgresPool = null;
  postgresStatus = {
    ...postgresStatus,
    connected: false
  };
};
