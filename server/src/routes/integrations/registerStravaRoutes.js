/**
 * The Strava routes Settings and the dashboard call (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md): the state Settings shows, the
 * authorize link, Strava's return, the catch-up sync, and the disconnect.
 */
// @ts-check
import { randomBytes } from "node:crypto";
import { tokensMatch } from "../../services/auth/sessionService.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

const BASE = "/api/integrations/strava";
const STATE_COOKIE = "stravaState";
const STATE_MAX_AGE_SECONDS = 600;
const NOT_AVAILABLE = "Strava is not available.";
const ACTIVITY_SCOPES = ["activity:read_all", "activity:read"];

/** @param {unknown} value */
const queryText = (value) => (typeof value === "string" ? value.trim().slice(0, 300) : "");

/** @typedef {import("../../services/auth/authUserService.js").AuthUser} AuthUser */
/** @typedef {ReturnType<typeof import("../../services/integrations/stravaService.js").createStravaService>} StravaService */

/**
 * What index.js hands the Strava routes; one property per member they read.
 * @typedef {object} StravaDeps
 * @property {import("express").RequestHandler} requireAuth Rejects a request with no session.
 * @property {import("express").RequestHandler} attachOptionalUser Sets req.user, or null.
 * @property {ReturnType<typeof import("../../services/auth/sessionService.js").createSessionService>["parseCookies"]} parseCookies
 * @property {string} cookieSecure "; Secure" or "", appended to the cookie.
 * @property {() => ReturnType<typeof import("../../services/integrations/stravaConfig.js").readStravaConfig>} getStravaConfig
 * @property {typeof import("../../corsPolicy.js").requestOrigin} requestOrigin
 * @property {StravaService} stravaService
 */

/**
 * What GET /api/integrations/strava answers: the connection's state for Settings.
 * @typedef {Awaited<ReturnType<StravaService["connectionState"]>>} StravaStateResponse
 */

/**
 * What POST /api/integrations/strava/connect answers: Strava's authorize URL.
 * @typedef {{ url: ReturnType<StravaService["authorizeUrl"]> }} StravaConnectResponse
 */

/**
 * What POST /api/integrations/strava/sync answers: the sync's outcome, its
 * error included.
 * @typedef {Awaited<ReturnType<StravaService["sync"]>>} StravaSyncResponse
 */

/**
 * What DELETE /api/integrations/strava answers once the connection is removed.
 * @typedef {{ ok: true }} StravaDisconnectedResponse
 */

/**
 * Registers the five routes. `getStravaConfig` is read on every request, so
 * without Strava's settings each answers 404 but the state, which answers
 * `available: false`. Strava's return is a page load, not a fetch, so it always
 * redirects: to Settings with the result, or to sign-in without a session. The
 * sync answers its outcome with a 200, its error included, for Settings to show.
 *
 * @param {import("express").Express} app
 * @param {StravaDeps} deps
 */
// Every handler behind requireAuth reads req.user, which requireAuth has set.
export const registerStravaRoutes = (app, deps) => {
  const {
    requireAuth,
    attachOptionalUser,
    parseCookies,
    cookieSecure,
    getStravaConfig,
    requestOrigin,
    stravaService
  } = deps;

  // Sets the state cookie to `value` for `maxAge` seconds; 0 clears it.
  /**
   * @param {import("express").Response} res
   * @param {string} value
   * @param {number} maxAge
   */
  const setStateCookie = (res, value, maxAge) =>
    res.append(
      "Set-Cookie",
      `${STATE_COOKIE}=${value}; HttpOnly; Path=${BASE}; SameSite=Lax; Max-Age=${maxAge}${cookieSecure}`
    );

  // The answer every route but the state gives without Strava's settings.
  /** @param {import("express").Response} res */
  const notAvailable = (res) => res.status(404).json({ error: NOT_AVAILABLE });

  app.get(BASE, requireAuth, async (req, res) => {
    try {
      res.json(
        /** @satisfies {StravaStateResponse} */ (
          await stravaService.connectionState(/** @type {AuthUser} */ (req.user).id)
        )
      );
    } catch (err) {
      sendErrorResponse(req, res, err);
    }
  });

  app.post(`${BASE}/connect`, requireAuth, (req, res) => {
    if (!getStravaConfig()) return notAvailable(res);
    try {
      const state = randomBytes(32).toString("base64url");
      const url = stravaService.authorizeUrl({
        redirectUri: `${requestOrigin(req)}${BASE}/callback`,
        state
      });
      setStateCookie(res, state, STATE_MAX_AGE_SECONDS);
      res.json(/** @satisfies {StravaConnectResponse} */ ({ url }));
    } catch (err) {
      sendErrorResponse(req, res, err);
    }
  });

  app.get(`${BASE}/callback`, attachOptionalUser, async (req, res) => {
    if (!getStravaConfig()) return notAvailable(res);
    const expected = String(parseCookies(req.headers.cookie || "")[STATE_COOKIE] || "");
    setStateCookie(res, "", 0);
    if (!req.user) return res.redirect("/auth");
    /** @param {string} result */
    const land = (result) => res.redirect(`/dashboard/settings?strava=${result}`);

    const query = req.query;
    if (queryText(query.error)) return land("cancelled");
    // In constant time, and never an empty state, which the cookie lacks on a
    // return this browser did not start.
    if (!tokensMatch(expected, queryText(query.state))) {
      req.log.warn({ event: "strava_state_mismatch" }, "Strava's return did not match its state.");
      return land("failed");
    }
    const scopes = queryText(query.scope).split(/[\s,]+/);
    if (!ACTIVITY_SCOPES.some((scope) => scopes.includes(scope))) return land("no-access");
    const code = queryText(query.code);
    if (!code) return land("failed");

    try {
      return land(await stravaService.connect(req.user.id, code));
    } catch (err) {
      const kind = String(/** @type {{ kind?: string }} */ (err).kind || "error");
      if (kind === "capacity") return land("limit");
      req.log.warn({ event: "strava_connect_failed", kind }, "Connecting Strava failed.");
      return land("unavailable");
    }
  });

  app.post(`${BASE}/sync`, requireAuth, async (req, res) => {
    if (!getStravaConfig()) return notAvailable(res);
    try {
      // Only a real true is Sync now; anything else is the dashboard's quiet sync.
      const manual = req.body?.manual === true;
      res.json(
        /** @satisfies {StravaSyncResponse} */ (
          await stravaService.sync(/** @type {AuthUser} */ (req.user).id, { manual })
        )
      );
    } catch (err) {
      sendErrorResponse(req, res, err);
    }
  });

  app.delete(BASE, requireAuth, async (req, res) => {
    if (!getStravaConfig()) return notAvailable(res);
    try {
      const { revokeError } = await stravaService.disconnect(/** @type {AuthUser} */ (req.user).id);
      if (revokeError) {
        req.log.warn(
          { event: "strava_revoke_failed", kind: revokeError },
          "Strava did not revoke access."
        );
      }
      res.json(/** @satisfies {StravaDisconnectedResponse} */ ({ ok: true }));
    } catch (err) {
      sendErrorResponse(req, res, err);
    }
  });
};
