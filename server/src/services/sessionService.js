import crypto from "crypto";
import { createClient } from "redis";
import { sendErrorResponse } from "./errorResponseService.js";

export const parseCookies = (cookieHeader = "") =>
  cookieHeader.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (!key) return acc;
    const rawValue = rest.join("=");
    try {
      acc[key] = decodeURIComponent(rawValue);
    } catch {
      acc[key] = rawValue;
    }
    return acc;
  }, {});

// Guards before it coerces. The 1..65535 range already rejected the 0 that
// `Number(null)` and `Number("")` produce, so no answer changes here either;
// see the note on `toPositiveInt` in index.js.
export const parseRedisPort = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 65535) return null;
  return parsed;
};

export const parseEnvBoolean = (value, fallback = false) => {
  const normalized = typeof value === "string" ? value.trim().slice(0, 12).toLowerCase() : "";
  if (!normalized) return fallback;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const appendSetCookieHeader = (res, cookieValue) => {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const list = Array.isArray(current) ? current : [current];
  res.setHeader("Set-Cookie", [...list, cookieValue]);
};

/**
 * Rejects with `message` if `promise` has not settled within `timeoutMs`.
 * The timer is always cleared so a resolved promise cannot hold the event loop open.
 */
export const withTimeout = (promise, timeoutMs, message) => {
  let timer = null;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

const tokensMatch = (a, b) => {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length === 0 || right.length === 0) return false;
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

export const createSessionService = ({
  cleanText,
  logger,
  toShortText,
  findUserById,
  sessionTtlMs,
  cookieSecure,
  csrfCookieName,
  csrfHeaderName,
  csrfUnsafeMethods,
  redisSessionKeyPrefix,
  redisConnectTimeoutMs = 10000
}) => {
  const inMemorySessions = new Map();
  let redisClient = null;
  let redisSessionsEnabled = false;
  let redisConfigured = false;
  let redisLastError = "";
  // node-redis retries a failed connection forever by default, which leaves the
  // initial connect() pending and stops the process from ever reaching listen().
  // Retries stay bounded until startup settles, then revert to open-ended backoff
  // so a Redis blip during normal operation still recovers on its own.
  let redisStartupSettled = false;
  const maxStartupReconnectAttempts = 5;

  const redisReconnectStrategy = (retries) => {
    if (redisStartupSettled) return Math.min(500 * 2 ** Math.min(retries, 6), 30000);
    if (retries >= maxStartupReconnectAttempts) {
      return new Error("Redis startup connection retries exhausted.");
    }
    return Math.min(100 * 2 ** retries, 1000);
  };

  const closeRedisClientQuietly = async (client) => {
    if (!client) return;
    try {
      await client.disconnect();
    } catch {
      // The client may never have connected; nothing to clean up.
    }
  };

  const getSessionStoreStatus = () => ({
    configured: redisConfigured,
    connected: redisSessionsEnabled,
    lastError: redisLastError
  });

  const sessionRedisKey = (token) => `${redisSessionKeyPrefix}${token}`;

  const pruneExpiredInMemorySessions = () => {
    const now = Date.now();
    for (const [token, session] of inMemorySessions) {
      if (now - session.createdAt > sessionTtlMs) {
        inMemorySessions.delete(token);
      }
    }
  };

  const initSessionStore = async (env = process.env) => {
    const redisUrl = cleanText(env.REDIS_URL || "", 500);
    const redisHost = cleanText(env.REDIS_HOST || "", 255);
    const redisPort = parseRedisPort(env.REDIS_PORT);
    const redisUsername = cleanText(env.REDIS_USERNAME || "default", 120) || "default";
    const redisPassword = cleanText(env.REDIS_PASSWORD || "", 500);
    const redisTls = parseEnvBoolean(env.REDIS_TLS, false);
    const hasSocketConfig = Boolean(redisHost && redisPort !== null);
    redisConfigured = Boolean(redisUrl || hasSocketConfig);
    redisLastError = "";

    if (!redisConfigured) {
      logger.warn(
        { event: "redis_config_missing" },
        "Redis config not set. Using in-memory sessions."
      );
      redisSessionsEnabled = false;
      redisStartupSettled = true;
      return getSessionStoreStatus();
    }

    redisStartupSettled = false;
    let client = null;
    try {
      const socketOptions = {
        connectTimeout: redisConnectTimeoutMs,
        reconnectStrategy: redisReconnectStrategy
      };
      client = hasSocketConfig
        ? createClient({
            username: redisUsername,
            password: redisPassword || undefined,
            socket: {
              ...socketOptions,
              host: redisHost,
              port: redisPort,
              tls: redisTls
            }
          })
        : createClient({ url: redisUrl, socket: socketOptions });

      client.on("error", (err) => {
        redisLastError = cleanText(err?.message || String(err), 260);
        logger.error(
          { event: "redis_session_store_error", error: redisLastError },
          "Redis session store error."
        );
      });

      // Hard backstop: the bounded strategy above should surface a failure first,
      // but a socket that stalls without erroring must not block startup either.
      await withTimeout(
        client.connect(),
        redisConnectTimeoutMs,
        `Redis connection timed out after ${redisConnectTimeoutMs}ms.`
      );
      redisStartupSettled = true;
      redisClient = client;
      redisSessionsEnabled = true;
      redisLastError = "";
      logger.info({ event: "redis_connected" }, "Redis session store connected.");
    } catch (err) {
      redisStartupSettled = true;
      redisLastError = cleanText(err?.message || String(err), 260);
      logger.error(
        {
          event: "redis_connect_failed",
          error: redisLastError
        },
        "Failed to connect Redis session store. Falling back to in-memory sessions."
      );
      // Stop the client retrying in the background, or it keeps logging forever.
      await closeRedisClientQuietly(client);
      redisClient = null;
      redisSessionsEnabled = false;
    }
    return getSessionStoreStatus();
  };

  const setSessionCookie = (res, token, persistent = true) => {
    const maxAge = Math.floor(sessionTtlMs / 1000);
    const maxAgePart = persistent ? `; Max-Age=${maxAge}` : "";
    appendSetCookieHeader(
      res,
      `sid=${token}; HttpOnly; Path=/; SameSite=Lax${maxAgePart}${cookieSecure}`
    );
  };

  const clearSessionCookie = (res) => {
    appendSetCookieHeader(res, `sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieSecure}`);
  };

  const setCsrfCookie = (res, token) => {
    appendSetCookieHeader(
      res,
      `${csrfCookieName}=${token}; Path=/; SameSite=Lax${cookieSecure}; Max-Age=86400`
    );
  };

  const clearCsrfCookie = (res) => {
    appendSetCookieHeader(
      res,
      `${csrfCookieName}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecure}`
    );
  };

  const createSession = async (userId) => {
    const token = crypto.randomBytes(24).toString("hex");
    const session = { userId, createdAt: Date.now() };
    if (redisSessionsEnabled && redisClient) {
      try {
        await redisClient.set(sessionRedisKey(token), JSON.stringify(session), {
          EX: Math.floor(sessionTtlMs / 1000)
        });
        redisLastError = "";
        return token;
      } catch (err) {
        redisLastError = cleanText(err?.message || String(err), 260);
        logger.error(
          { event: "redis_session_create_failed", error: redisLastError },
          "Redis create session failed."
        );
      }
    }
    pruneExpiredInMemorySessions();
    inMemorySessions.set(token, session);
    return token;
  };

  const getSessionByToken = async (token) => {
    if (!token) return null;
    if (redisSessionsEnabled && redisClient) {
      try {
        const raw = await redisClient.get(sessionRedisKey(token));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !cleanText(parsed.userId, 120)) {
          await redisClient.del(sessionRedisKey(token));
          return null;
        }
        redisLastError = "";
        return parsed;
      } catch (err) {
        redisLastError = cleanText(err?.message || String(err), 260);
        logger.error(
          { event: "redis_session_get_failed", error: redisLastError },
          "Redis get session failed."
        );
        try {
          await redisClient.del(sessionRedisKey(token));
        } catch {
          // Ignore cleanup failures.
        }
        return null;
      }
    }
    pruneExpiredInMemorySessions();
    return inMemorySessions.get(token) || null;
  };

  const deleteSession = async (token) => {
    if (!token) return;
    if (redisSessionsEnabled && redisClient) {
      try {
        await redisClient.del(sessionRedisKey(token));
        redisLastError = "";
      } catch (err) {
        redisLastError = cleanText(err?.message || String(err), 260);
        logger.error(
          { event: "redis_session_delete_failed", error: redisLastError },
          "Redis delete session failed."
        );
      }
      return;
    }
    inMemorySessions.delete(token);
  };

  const getSessionUser = async (req) => {
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies.sid;
    const session = await getSessionByToken(token);
    if (!session) return null;
    if (Date.now() - session.createdAt > sessionTtlMs) {
      await deleteSession(token);
      return null;
    }
    return findUserById(session.userId);
  };

  const requireAuth = async (req, res, next) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "Not signed in." });
      req.user = user;
      next();
    } catch (err) {
      sendErrorResponse(req, res, err, 500);
    }
  };

  /**
   * Resolves the session user when one is present but never rejects the request.
   * Lets a route stay open to anonymous callers while still letting rate limiters
   * and handlers tell the two apart.
   */
  const attachOptionalUser = async (req, res, next) => {
    try {
      req.user = (await getSessionUser(req)) || null;
    } catch (err) {
      req.user = null;
      req.log?.warn(
        {
          event: "optional_auth_lookup_failed",
          error: toShortText(err?.message || String(err), 240)
        },
        "Optional session lookup failed. Continuing as anonymous."
      );
    }
    next();
  };

  /**
   * Releases the Redis connection so a shutdown is not held open by it.
   * Safe to call when Redis was never configured or already fell back.
   */
  const closeSessionStore = async () => {
    const client = redisClient;
    redisClient = null;
    redisSessionsEnabled = false;
    await closeRedisClientQuietly(client);
  };

  const ensureCsrfTokenCookie = (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie || "");
    const current = cleanText(cookies[csrfCookieName], 128);
    if (current) {
      req.csrfToken = current;
      return next();
    }
    const token = crypto.randomBytes(24).toString("hex");
    req.csrfToken = token;
    setCsrfCookie(res, token);
    next();
  };

  const requireCsrfToken = (req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if (!csrfUnsafeMethods.has(method)) return next();

    const cookies = parseCookies(req.headers.cookie || "");
    const cookieToken = cleanText(cookies[csrfCookieName], 128);
    const headerToken = cleanText(req.headers[csrfHeaderName], 128);

    if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
      req.log?.warn(
        {
          event: "csrf_check_failed",
          method,
          path: req.originalUrl || req.url
        },
        "CSRF validation failed."
      );
      return res.status(403).json({ error: "Invalid or missing CSRF token." });
    }
    return next();
  };

  return {
    parseCookies,
    parseRedisPort,
    parseEnvBoolean,
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
    closeSessionStore,
    ensureCsrfTokenCookie,
    requireCsrfToken,
    getSessionStoreStatus,
    isRedisConfigured: () => redisConfigured,
    isRedisSessionsEnabled: () => redisSessionsEnabled,
    getRedisClient: () => redisClient,
    getRedisLastError: () => redisLastError
  };
};
