/**
 * Connecting and disconnecting Strava (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md, "Connecting"): the state
 * Settings shows, the authorize link, Strava's return, and the disconnect.
 */
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

/**
 * Registers the four routes. `getStravaConfig` is read on every request, so
 * without Strava's settings each answers 404 but the state, which answers
 * `available: false`. Strava's return is a page load, not a fetch, so it always
 * redirects: to Settings with the result, or to sign-in without a session.
 */
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
  const setStateCookie = (res, value, maxAge) =>
    res.append(
      "Set-Cookie",
      `${STATE_COOKIE}=${value}; HttpOnly; Path=${BASE}; SameSite=Lax; Max-Age=${maxAge}${cookieSecure}`
    );

  // The answer every route but the state gives without Strava's settings.
  const notAvailable = (res) => res.status(404).json({ error: NOT_AVAILABLE });

  app.get(BASE, requireAuth, async (req, res) => {
    try {
      res.json(await stravaService.connectionState(req.user.id));
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
      res.json({ url });
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

  app.delete(BASE, requireAuth, async (req, res) => {
    if (!getStravaConfig()) return notAvailable(res);
    try {
      const { revokeError } = await stravaService.disconnect(req.user.id);
      if (revokeError) {
        req.log.warn(
          { event: "strava_revoke_failed", kind: revokeError },
          "Strava did not revoke access."
        );
      }
      res.json({ ok: true });
    } catch (err) {
      sendErrorResponse(req, res, err);
    }
  });
};
