/**
 * The owner's command for Strava's webhook subscription (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md, "The webhook"): create, view or
 * delete the app's one subscription. server/scripts/strava-webhook.js runs it.
 */
// @ts-check

const STRAVA_WEB = "https://www.strava.com";
const USAGE = [
  "Usage: node --env-file=server/.env server/scripts/strava-webhook.js <command>",
  "  create --callback https://<host>/webhooks/strava",
  "  view",
  "  delete <subscription id>"
].join("\n");

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * Runs one command and answers its exit code: 0 done, 1 Strava refused or was
 * unreachable, 2 a bad command or missing settings. Every line goes to `print`
 * with the client secret removed, Strava's own error text included.
 * @param {{ argv: string[], env: Record<string, string | undefined>, fetchImpl: typeof fetch, print: (line: string) => void }} args
 * @returns {Promise<number>}
 */
export const runWebhookCommand = async ({ argv, env, fetchImpl, print }) => {
  const clientId = text(env.STRAVA_CLIENT_ID);
  const clientSecret = text(env.STRAVA_CLIENT_SECRET);
  /** @param {string} line */
  const say = (line) => print(clientSecret ? line.split(clientSecret).join("[redacted]") : line);
  const [command, ...rest] = argv;

  const callback = command === "create" && rest[0] === "--callback" ? text(rest[1]) : "";
  const deleteId = command === "delete" ? text(rest[0]) : "";
  const known =
    (command === "create" && callback) || command === "view" || (command === "delete" && deleteId);
  if (!known) {
    say(USAGE);
    return 2;
  }

  const missing = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET"].filter((name) => !text(env[name]));
  if (command === "create" && !text(env.STRAVA_WEBHOOK_VERIFY_TOKEN)) {
    missing.push("STRAVA_WEBHOOK_VERIFY_TOKEN");
  }
  if (missing.length) {
    say(`Set ${missing.join(" and ")} first.`);
    return 2;
  }
  if (command === "create" && !callback.startsWith("https://")) {
    say("The callback must be an https:// URL that Strava can reach.");
    return 2;
  }
  if (command === "delete" && !/^\d+$/.test(deleteId)) {
    say("A subscription id is a number; `view` prints it.");
    return 2;
  }

  const base = `${(text(env.STRAVA_BASE_URL) || STRAVA_WEB).replace(/\/+$/, "")}/api/v3/push_subscriptions`;
  const credentials = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
  /** @type {[string, RequestInit]} */
  const [url, init] =
    command === "create"
      ? [
          base,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              callback_url: callback,
              verify_token: text(env.STRAVA_WEBHOOK_VERIFY_TOKEN)
            }).toString()
          }
        ]
      : command === "view"
        ? [`${base}?${credentials}`, { method: "GET" }]
        : [`${base}/${deleteId}?${credentials}`, { method: "DELETE" }];

  /** @type {Response} */
  let response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    say("The command could not reach Strava.");
    return 1;
  }
  /** @type {any} */
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const reasons = Array.isArray(data?.errors)
      ? data.errors.map((/** @type {any} */ error) => `${text(error.field)}: ${text(error.code)}`)
      : [];
    say([`Strava answered ${response.status}.`, ...reasons].join("\n"));
    return 1;
  }
  if (command === "create") {
    const id = data?.id;
    say(
      id
        ? `Created subscription ${id}. Set STRAVA_WEBHOOK_SUBSCRIPTION_ID=${id} in Render.`
        : "Strava created the subscription but sent no id. Run view to read it."
    );
  } else if (command === "view") {
    const subscriptions = Array.isArray(data) ? data : [];
    say(
      subscriptions.length
        ? subscriptions
            .map(
              (/** @type {any} */ item) =>
                `Subscription ${item.id} sends to ${text(item.callback_url)}`
            )
            .join("\n")
        : "No subscription."
    );
  } else {
    say(`Deleted subscription ${deleteId}.`);
  }
  return 0;
};
