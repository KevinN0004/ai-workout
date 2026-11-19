/**
 * Sessions and CSRF: the session store (Redis if configured and connected at
 * startup, else memory, chosen once; while Redis is the store, a failed command
 * is a 503, never a fallback to memory), the session and CSRF cookies, and the
 * middleware requiring a signed-in user or a matching CSRF token. Built in index.js.
 */
// @ts-check
import crypto from "crypto";
import { createClient } from "redis";
import { sendErrorResponse } from "../http/errorResponseService.js";
import { requestLogPath } from "../http/requestLogPath.js";

// How long a Redis command may wait to reach the socket, in ms. node-redis
// queues commands while it reconnects and its own limit is 5 s, so without this
// a sign-in during an outage waits that long for its 503. 1.5 s still rides out
// the immediate reconnect that follows a dropped connection. It is set on the
// client, so the rate-limit store and the HTTP cache, which share this client,
// get it too; both check isReady before using it.
const REDIS_COMMAND_TIMEOUT_MS = 1500;

// How long a session command may wait for Redis's answer, in ms. node-redis
// drops the timeout above once a command is written, so a Redis that accepts
// the command and never answers (a paused container, a half-open connection)
// would leave the request waiting with no end. This deadline covers the whole
// command, so it is longer than the queueing timeout, which answers first while
// the client reconnects.
const REDIS_SESSION_REPLY_TIMEOUT_MS = 2000;

/** @typedef {ReturnType<typeof createClient>} RedisClient */

/**
 * A session as the store keeps it: whose it is, and when it began, in ms.
 * @typedef {{ userId: string, createdAt: number }} StoredSession
 */

/**
 * Thrown by a session operation when Redis is the store and a command on it
 * failed. It carries status 503, and the Redis error as its `cause`.
 */
export class SessionStoreUnavailableError extends Error {
  /** @param {unknown} cause */
  constructor(cause) {
    super("Session store unavailable.", { cause });
    this.name = "SessionStoreUnavailableError";
    this.status = 503;
  }
}

/**
 * The status a route answers for an error from a session operation: 503 when
 * the session store was unavailable, because the server could not check the
 * session, where a 401 would say there is none; 500 for anything else.
 *
 * @param {unknown} err
 */
export const sessionErrorStatus = (err) =>
  err instanceof SessionStoreUnavailableError ? 503 : 500;

/**
 * Parses a Cookie header into a name-to-value object. A value that is not valid
 * percent-encoding is kept raw rather than dropped.
 *
 * @param {string} [cookieHeader]
 */
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
  }, /** @type {Record<string, string>} */ ({}));

// Guards before it coerces. The 1..65535 range would also reject the 0 that
// `Number(null)` and `Number("")` produce, but only by accident of the range;
// see the note on `toPositiveInt` in index.js.
/** @param {unknown} value */
export const parseRedisPort = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 1 || parsed > 65535) return null;
  return parsed;
};

/**
 * Reads an on/off environment flag: true, 1, yes or on, and false, 0, no or
 * off, in any case. Anything else, including an absent value, is `fallback`.
 *
 * @param {unknown} value
 * @param {boolean} [fallback]
 */
export const parseEnvBoolean = (value, fallback = false) => {
  const normalized = typeof value === "string" ? value.trim().slice(0, 12).toLowerCase() : "";
  if (!normalized) return fallback;
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

/**
 * @param {import("express").Response} res
 * @param {string} cookieValue
 */
const appendSetCookieHeader = (res, cookieValue) => {
  // The app sets Set-Cookie only as text, here and through res.append.
  const current = /** @type {string | string[] | undefined} */ (res.getHeader("Set-Cookie"));
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
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} message
 * @returns {Promise<T>}
 */
export const withTimeout = (promise, timeoutMs, message) => {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  /** @type {Promise<never>} */
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

/**
 * Compares two secrets in constant time. An empty one never matches, not even
 * an empty one: timingSafeEqual calls two empty buffers equal, so the CSRF
 * check relies on this to refuse a write that carries neither cookie nor
 * header. The Strava routes use it for the OAuth state and the webhook's
 * verify token.
 *
 * @param {unknown} a
 * @param {unknown} b
 */
export const tokensMatch = (a, b) => {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length === 0 || right.length === 0) return false;
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

/**
 * Builds the service. index.js calls `initSessionStore` once at startup, which
 * connects Redis when it is configured and falls back to memory when it is not
 * or cannot connect.
 *
 * @param {object} deps `findUserById` (from authUserService) loads a session's user, the
 *   user row alone.
 *   `cookieSecure` is "; Secure" or "", appended to every cookie.
 *   `csrfUnsafeMethods` is the set of methods `requireCsrfToken` checks, and
 *   `redisSessionKeyPrefix` namespaces the session keys in Redis.
 * @param {typeof import("../dashboard/dashboardDataBuildersService.js").cleanText} deps.cleanText
 * @param {import("pino").Logger} deps.logger
 * @param {(value: unknown, maxLen?: number) => string} deps.toShortText
 * @param {ReturnType<typeof import("./authUserService.js").createAuthUserService>["findUserById"]} deps.findUserById
 * @param {number} deps.sessionTtlMs
 * @param {string} deps.cookieSecure
 * @param {string} deps.csrfCookieName
 * @param {string} deps.csrfHeaderName
 * @param {Set<string>} deps.csrfUnsafeMethods
 * @param {string} deps.redisSessionKeyPrefix
 * @param {number} [deps.redisConnectTimeoutMs]
 */
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
  /** @type {Map<string, StoredSession>} */
  const inMemorySessions = new Map();
  /** @type {RedisClient | null} */
  let redisClient = null;
  let redisSessionsEnabled = false;
  let redisConfigured = false;
  let redisLastError = "";
  // The text kept and logged for a Redis failure. node-redis's TimeoutError
  // has no message, so an Error without one is named by its class.
  /** @param {unknown} err */
  const redisErrorText = (err) =>
    cleanText(err instanceof Error ? err.message || err.constructor.name : String(err), 260);
  // node-redis retries a failed connection forever by default, which leaves the
  // initial connect() pending and stops the process from ever reaching listen().
  // Retries stay bounded until startup settles, then revert to open-ended backoff
  // so a Redis blip during normal operation still recovers on its own. When a
  // ready connection drops, node-redis reconnects at once and then passes
  // retries 1, 2, 3... here for each failed attempt, so the waits run 1 s, 2 s,
  // 4 s and on up to 30 s.
  let redisStartupSettled = false;
  const maxStartupReconnectAttempts = 5;

  /** @param {number} retries */
  const redisReconnectStrategy = (retries) => {
    if (redisStartupSettled) return Math.min(500 * 2 ** Math.min(retries, 6), 30000);
    if (retries >= maxStartupReconnectAttempts) {
      return new Error("Redis startup connection retries exhausted.");
    }
    return Math.min(100 * 2 ** retries, 1000);
  };

  /** @param {RedisClient | null} client */
  const closeRedisClientQuietly = async (client) => {
    if (!client) return;
    try {
      // destroy(), not disconnect(): node-redis 5 renamed it, and 6 keeps
      // disconnect() only as a deprecated alias. The catch below swallows a
      // missing method too, so losing the alias would leave a failed client
      // retrying and logging forever with nothing to show for it.
      await client.destroy();
    } catch {
      // The client may never have connected; nothing to clean up.
    }
  };

  const getSessionStoreStatus = () => ({
    configured: redisConfigured,
    connected: redisSessionsEnabled,
    lastError: redisLastError
  });

  /** @param {string} token */
  const sessionRedisKey = (token) => `${redisSessionKeyPrefix}${token}`;

  const pruneExpiredInMemorySessions = () => {
    const now = Date.now();
    for (const [token, session] of inMemorySessions) {
      if (now - session.createdAt > sessionTtlMs) {
        inMemorySessions.delete(token);
      }
    }
  };

  // Runs one command while Redis is the session store, within
  // REDIS_SESSION_REPLY_TIMEOUT_MS. A failure or a missed deadline is logged and
  // kept as the store's last error, then thrown as SessionStoreUnavailableError:
  // reads consult only Redis, so a fallback would hide the failure, not fix it.
  /**
   * @template T
   * @param {string} event
   * @param {string} message
   * @param {() => Promise<T>} command
   */
  const runSessionCommand = async (event, message, command) => {
    try {
      const result = await withTimeout(
        command(),
        REDIS_SESSION_REPLY_TIMEOUT_MS,
        `Redis did not answer within ${REDIS_SESSION_REPLY_TIMEOUT_MS}ms.`
      );
      redisLastError = "";
      return result;
    } catch (err) {
      redisLastError = redisErrorText(err);
      logger.error({ event, error: redisLastError }, message);
      throw new SessionStoreUnavailableError(err);
    }
  };

  // A stored value that is not JSON, or names no user, is not a session.
  /**
   * @param {string} raw
   * @returns {StoredSession | null}
   */
  const parseStoredSession = (raw) => {
    try {
      const parsed = JSON.parse(raw);
      return parsed && cleanText(parsed.userId, 120) ? parsed : null;
    } catch {
      return null;
    }
  };

  /** @param {NodeJS.ProcessEnv} [env] */
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
    /** @type {RedisClient | null} */
    let client = null;
    try {
      const socketOptions = {
        connectTimeout: redisConnectTimeoutMs,
        reconnectStrategy: redisReconnectStrategy
      };
      // RESP2, pinned: node-redis 6 defaults to RESP3, which this app gains
      // nothing from, and Upstash's docs do not say it speaks RESP3. A failed
      // handshake there would drop every session to memory.
      const clientOptions = /** @type {const} */ ({
        RESP: 2,
        commandOptions: { timeout: REDIS_COMMAND_TIMEOUT_MS }
      });
      client = hasSocketConfig
        ? createClient({
            ...clientOptions,
            username: redisUsername,
            password: redisPassword || undefined,
            // tls is the boolean the environment sets; redis's type splits it by
            // literal.
            socket: /** @type {import("redis").RedisClientOptions["socket"]} */ ({
              ...socketOptions,
              host: redisHost,
              // hasSocketConfig is true only when redisPort parsed.
              port: /** @type {number} */ (redisPort),
              tls: redisTls
            })
          })
        : createClient({ ...clientOptions, url: redisUrl, socket: socketOptions });

      client.on("error", (err) => {
        redisLastError = redisErrorText(err);
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
      redisLastError = redisErrorText(err);
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

  /**
   * @param {import("express").Response} res
   * @param {string} token
   * @param {boolean} [persistent]
   */
  const setSessionCookie = (res, token, persistent = true) => {
    const maxAge = Math.floor(sessionTtlMs / 1000);
    const maxAgePart = persistent ? `; Max-Age=${maxAge}` : "";
    appendSetCookieHeader(
      res,
      `sid=${token}; HttpOnly; Path=/; SameSite=Lax${maxAgePart}${cookieSecure}`
    );
  };

  /** @param {import("express").Response} res */
  const clearSessionCookie = (res) => {
    appendSetCookieHeader(res, `sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieSecure}`);
  };

  /**
   * @param {import("express").Response} res
   * @param {string} token
   */
  const setCsrfCookie = (res, token) => {
    appendSetCookieHeader(
      res,
      `${csrfCookieName}=${token}; Path=/; SameSite=Lax${cookieSecure}; Max-Age=86400`
    );
  };

  /** @param {import("express").Response} res */
  const clearCsrfCookie = (res) => {
    appendSetCookieHeader(
      res,
      `${csrfCookieName}=; Path=/; Max-Age=0; SameSite=Lax${cookieSecure}`
    );
  };

  /** @param {string} userId */
  const createSession = async (userId) => {
    const token = crypto.randomBytes(24).toString("hex");
    const session = { userId, createdAt: Date.now() };
    if (redisSessionsEnabled && redisClient) {
      await runSessionCommand("redis_session_create_failed", "Redis create session failed.", () =>
        // Checked just above, and the command runs at once.
        /** @type {RedisClient} */ (redisClient).set(
          sessionRedisKey(token),
          JSON.stringify(session),
          {
            EX: Math.floor(sessionTtlMs / 1000)
          }
        )
      );
      return token;
    }
    pruneExpiredInMemorySessions();
    inMemorySessions.set(token, session);
    return token;
  };

  /** @param {string | undefined} token */
  const getSessionByToken = async (token) => {
    if (!token) return null;
    if (redisSessionsEnabled && redisClient) {
      const key = sessionRedisKey(token);
      const raw = await runSessionCommand(
        "redis_session_get_failed",
        "Redis get session failed.",
        // Checked just above, and the command runs at once.
        () => /** @type {RedisClient} */ (redisClient).get(key)
      );
      if (!raw) return null;
      const session = parseStoredSession(raw);
      // Junk under a session key is removed, so it is not parsed again on every
      // request.
      if (!session) {
        await runSessionCommand("redis_session_delete_failed", "Redis delete session failed.", () =>
          // Checked above, and the command runs at once.
          /** @type {RedisClient} */ (redisClient).del(key)
        );
      }
      return session;
    }
    pruneExpiredInMemorySessions();
    return inMemorySessions.get(token) || null;
  };

  /** @param {string | undefined} token */
  const deleteSession = async (token) => {
    if (!token) return;
    if (redisSessionsEnabled && redisClient) {
      await runSessionCommand("redis_session_delete_failed", "Redis delete session failed.", () =>
        // Checked just above, and the command runs at once.
        /** @type {RedisClient} */ (redisClient).del(sessionRedisKey(token))
      );
      return;
    }
    inMemorySessions.delete(token);
  };

  /** @param {import("express").Request} req */
  const getSessionUser = async (req) => {
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies.sid;
    const session = await getSessionByToken(token);
    if (!session) return null;
    if (Date.now() - session.createdAt > sessionTtlMs) {
      await deleteSession(token);
      return null;
    }
    const user = await findUserById(session.userId);
    if (!user) {
      // The account is gone -- deleted while this token was still live. Drop
      // the token rather than leaving it to expire, matching the TTL branch
      // above and the passwordChangedAt branch below, which both delete.
      //
      // Safe because null here means "no row": findUserById resolves through
      // findUserRow, whose one findFirst returns null only when nothing
      // matches. A database failure throws instead and never reaches this
      // line, so a transient outage cannot cost a valid session its token.
      await deleteSession(token);
      return null;
    }

    // Guard before comparing, not after. Date.parse of an absent value is NaN,
    // and every comparison against NaN is false -- so an unparseable timestamp
    // fails OPEN and silently stops invalidating anything. The finite check
    // makes that explicit rather than incidental, and the "created before"
    // test in sessionService.test.js is what proves the rule still bites.
    const changedAtMs = Date.parse(user.passwordChangedAt ?? "");
    if (Number.isFinite(changedAtMs) && session.createdAt < changedAtMs) {
      await deleteSession(token);
      return null;
    }
    return user;
  };

  /** @type {import("express").RequestHandler} */
  const requireAuth = async (req, res, next) => {
    try {
      const user = await getSessionUser(req);
      if (!user) return res.status(401).json({ error: "Not signed in." });
      req.user = user;
      next();
    } catch (err) {
      sendErrorResponse(req, res, err, sessionErrorStatus(err));
    }
  };

  /**
   * Resolves the session user when one is present, so a route can stay open to
   * anonymous callers while rate limiters and handlers tell the two apart. A
   * session cookie the unavailable store cannot read answers 503, as
   * requireAuth does: going on as anonymous would charge the anonymous quota and
   * save nothing. Any other lookup failure goes on as anonymous.
   * @type {import("express").RequestHandler}
   */
  const attachOptionalUser = async (req, res, next) => {
    try {
      req.user = (await getSessionUser(req)) || null;
    } catch (/** @type {any} */ err) {
      // The session read or the user lookup threw it, possibly with a non-Error.
      if (err instanceof SessionStoreUnavailableError) {
        return sendErrorResponse(req, res, err, 503);
      }
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

  /** @type {import("express").RequestHandler} */
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

  /** @type {import("express").RequestHandler} */
  const requireCsrfToken = (req, res, next) => {
    const method = String(req.method || "GET").toUpperCase();
    if (!csrfUnsafeMethods.has(method)) return next();

    const cookies = parseCookies(req.headers.cookie || "");
    const cookieToken = cleanText(cookies[csrfCookieName], 128);
    const headerToken = cleanText(req.headers[csrfHeaderName], 128);

    if (!tokensMatch(cookieToken, headerToken)) {
      req.log?.warn(
        {
          event: "csrf_check_failed",
          method,
          path: requestLogPath(req)
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
    getSessionByToken,
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
