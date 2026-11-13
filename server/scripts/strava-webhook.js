/**
 * Creates, views or deletes the Strava webhook subscription (roadmap C2), for
 * the owner to run once from their own terminal with the server's settings:
 * `node --env-file=server/.env server/scripts/strava-webhook.js view`.
 */
import { runWebhookCommand } from "../src/services/integrations/stravaSubscriptions.js";

process.exitCode = await runWebhookCommand({
  argv: process.argv.slice(2),
  env: process.env,
  fetchImpl: fetch,
  print: (line) => process.stdout.write(`${line}\n`)
});
