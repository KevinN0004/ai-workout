/**
 * Strava's webhook (roadmap C2, docs/specs/2026-11-12-strava-import-design.md,
 * "The webhook"): the subscription's setup check, and each event, answered at
 * once and handled after. Mounted by index.js ahead of the /api CSRF check.
 */
import { tokensMatch } from "../../services/auth/sessionService.js";

const PATH = "/webhooks/strava";
const NOT_AVAILABLE = "Strava's webhook is not available.";

const queryText = (value) => (typeof value === "string" ? value.trim().slice(0, 300) : "");

/**
 * Registers the two routes, each behind `stravaWebhookLimiter`. The setup check
 * needs STRAVA_WEBHOOK_VERIFY_TOKEN, and an event needs
 * STRAVA_WEBHOOK_SUBSCRIPTION_ID: without one, its route answers 404. Strava
 * waits two seconds for a 200 and does not sign events, so an event is answered
 * first and handed to `scheduleStravaEvent`, and the service checks it with
 * Strava before anything changes.
 */
export const registerStravaWebhook = (app, deps) => {
  const { getStravaConfig, stravaService, stravaWebhookLimiter, scheduleStravaEvent } = deps;

  app.get(PATH, stravaWebhookLimiter, (req, res) => {
    const config = getStravaConfig();
    if (!config?.verifyToken) return res.status(404).json({ error: NOT_AVAILABLE });
    if (!tokensMatch(config.verifyToken, queryText(req.query["hub.verify_token"]))) {
      return res.status(403).json({ error: "That verify token is not this server's." });
    }
    const challenge = queryText(req.query["hub.challenge"]);
    if (!challenge) return res.status(400).json({ error: "No challenge to answer." });
    res.json({ "hub.challenge": challenge });
  });

  app.post(PATH, stravaWebhookLimiter, (req, res) => {
    const config = getStravaConfig();
    if (!config?.subscriptionId) return res.status(404).json({ error: NOT_AVAILABLE });
    res.json({ ok: true });
    scheduleStravaEvent(() => stravaService.handleEvent(req.body, req.log));
  });
};
