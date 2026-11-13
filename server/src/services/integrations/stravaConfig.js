/**
 * Reads the Strava settings from the environment, live, per request
 * (docs/specs/2026-11-12-strava-import-design.md, "Settings, the server's
 * environment"). Null means the server has no Strava, and its routes answer 404.
 */
// @ts-check
import { parseTokenKey } from "./tokenCipher.js";

const STRAVA_WEB = "https://www.strava.com";

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * The webhook subscription id `value` holds, a whole number above 0 in plain
 * digits, or null. The startup check and the reader share it, so the check passes
 * exactly what the reader keeps.
 * @param {unknown} value
 */
export const parseSubscriptionId = (value) => {
  const digits = text(value);
  return /^[1-9]\d*$/.test(digits) ? Number(digits) : null;
};

/**
 * The Strava configuration in `env`, or null when the client id, the secret or a
 * valid key is missing. `webBase` stands for https://www.strava.com in both the
 * OAuth and the API paths; STRAVA_BASE_URL replaces it for the E2E fake.
 * @param {Record<string, string | undefined>} env
 */
export const readStravaConfig = (env) => {
  const clientId = text(env.STRAVA_CLIENT_ID);
  const clientSecret = text(env.STRAVA_CLIENT_SECRET);
  const key = parseTokenKey(env.STRAVA_TOKEN_KEY);
  if (!clientId || !clientSecret || !key) return null;
  return {
    clientId,
    clientSecret,
    key,
    webBase: (text(env.STRAVA_BASE_URL) || STRAVA_WEB).replace(/\/+$/, ""),
    verifyToken: text(env.STRAVA_WEBHOOK_VERIFY_TOKEN) || null,
    subscriptionId: parseSubscriptionId(env.STRAVA_WEBHOOK_SUBSCRIPTION_ID)
  };
};
