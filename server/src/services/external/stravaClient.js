/**
 * The only code that calls Strava (roadmap C2, docs/specs/2026-11-12-strava-import-design.md):
 * the OAuth code exchange, the refresh and the revoke, and the athlete's activities.
 * Every failure is a StravaError of one kind, whose text never holds a credential.
 */
// @ts-check

/**
 * @typedef {"unauthorized" | "not_found" | "rate_limited" | "capacity" | "unavailable"} StravaErrorKind
 * @typedef {{ clientId: string, clientSecret: string, webBase: string }} StravaClientConfig
 */

/**
 * A Strava call that failed, as one kind and the HTTP status (null when there was
 * no answer). Its message is fixed text, and it carries no cause: nothing Strava
 * sent and nothing the request held reaches a log or Sentry through it.
 */
export class StravaError extends Error {
  /**
   * @param {string} kind
   * @param {number | null} status
   */
  constructor(kind, status = null) {
    super(`Strava answered ${kind}.`);
    this.name = "StravaError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * The kind a refusal of `status` is. A 403 from the code exchange is Strava's
 * athlete limit, which it documents no other answer for.
 * @param {number} status
 * @param {boolean} exchange
 * @returns {StravaErrorKind}
 */
const kindOf = (status, exchange) => {
  if (status === 403 && exchange) return "capacity";
  if (status === 400 || status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "unavailable";
};

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * "Jo S." from the athlete's first name and last initial, or "" with neither.
 * @param {any} athlete
 */
const athleteNameOf = (athlete) => {
  const first = text(athlete?.firstname);
  const last = text(athlete?.lastname);
  return [first, last ? `${last[0].toUpperCase()}.` : ""].filter(Boolean).join(" ");
};

/**
 * The tokens a token answer holds, or an unavailable error when one is missing.
 * @param {any} data
 */
const tokensOf = (data) => {
  const accessToken = text(data?.access_token);
  const refreshToken = text(data?.refresh_token);
  const expiresAt = Number(data?.expires_at);
  if (!accessToken || !refreshToken || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw new StravaError("unavailable", 200);
  }
  return { accessToken, refreshToken, expiresAt: new Date(expiresAt * 1000) };
};

/**
 * Builds the Strava client over `config`. Each call aborts after `timeoutMs`.
 * Only the named fields of an answer are read; no response is kept or thrown.
 * @param {{ config: StravaClientConfig, fetchImpl?: typeof fetch, timeoutMs?: number }} deps
 */
export const createStravaClient = ({ config, fetchImpl = fetch, timeoutMs = 8000 }) => {
  const oauth = `${config.webBase}/oauth`;
  const api = `${config.webBase}/api/v3`;

  /**
   * Sends one request and answers its parsed JSON, or "" when `json` is false.
   * @param {string} url
   * @param {RequestInit} init
   * @param {{ exchange?: boolean, json?: boolean }} [options]
   * @returns {Promise<any>}
   */
  const request = async (url, init, { exchange = false, json = true } = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    /** @type {Response} */
    let response;
    try {
      response = await fetchImpl(url, { ...init, signal: controller.signal });
    } catch {
      throw new StravaError("unavailable");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new StravaError(kindOf(response.status, exchange), response.status);
    if (!json) return "";
    try {
      return await response.json();
    } catch {
      throw new StravaError("unavailable", response.status);
    }
  };

  /** @param {Record<string, string>} fields */
  const form = (fields) => ({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString()
  });

  /** @param {string} accessToken */
  const bearer = (accessToken) => ({ headers: { Authorization: `Bearer ${accessToken}` } });

  const credentials = { client_id: config.clientId, client_secret: config.clientSecret };

  /**
   * Trades the code Strava's redirect brought back for the athlete's tokens, and
   * reads who the athlete is.
   * @param {string} code
   */
  const exchangeCode = async (code) => {
    const data = await request(
      `${oauth}/token`,
      form({ ...credentials, code, grant_type: "authorization_code" }),
      { exchange: true }
    );
    const athleteId = Number(data?.athlete?.id);
    if (!Number.isSafeInteger(athleteId) || athleteId <= 0) {
      throw new StravaError("unavailable", 200);
    }
    return { ...tokensOf(data), athleteId, athleteName: athleteNameOf(data.athlete) };
  };

  /**
   * A new token pair for `refreshToken`, which Strava then invalidates.
   * @param {string} refreshToken
   */
  const refresh = async (refreshToken) =>
    tokensOf(
      await request(
        `${oauth}/token`,
        form({ ...credentials, grant_type: "refresh_token", refresh_token: refreshToken })
      )
    );

  /**
   * Revokes the app's access to the athlete's account, with the refresh token.
   * @param {string} refreshToken
   */
  const revoke = async (refreshToken) => {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    const init = form({ token: refreshToken, token_type_hint: "refresh_token" });
    await request(
      `${oauth}/revoke`,
      { ...init, headers: { ...init.headers, Authorization: `Basic ${basic}` } },
      { json: false }
    );
  };

  /**
   * One page of the athlete's activities that started after `after`, in epoch
   * seconds, as Strava's summaries.
   * @param {string} accessToken
   * @param {{ after: number, page: number, perPage: number }} query
   * @returns {Promise<any[]>}
   */
  const listActivities = async (accessToken, { after, page, perPage }) => {
    const query = new URLSearchParams({
      after: String(after),
      page: String(page),
      per_page: String(perPage)
    });
    const data = await request(`${api}/athlete/activities?${query}`, bearer(accessToken));
    if (!Array.isArray(data)) throw new StravaError("unavailable", 200);
    return data;
  };

  /**
   * One activity by its Strava id.
   * @param {string} accessToken
   * @param {string} activityId
   */
  const getActivity = async (accessToken, activityId) => {
    const data = await request(
      `${api}/activities/${encodeURIComponent(activityId)}`,
      bearer(accessToken)
    );
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new StravaError("unavailable", 200);
    }
    return data;
  };

  return { exchangeCode, refresh, revoke, listActivities, getActivity };
};
