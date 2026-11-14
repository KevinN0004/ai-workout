/**
 * A stand-in for Strava's OAuth and API, for strava.spec.js (roadmap C2). Plain
 * node:http with no dependency; playwright.config.js starts it on 5099 and points
 * the server's STRAVA_BASE_URL at it. The spec drives it through /__control.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_STRAVA_PORT || 5099);
const ACCESS_TOKEN = "e2e-access";
const SIX_HOURS = 6 * 60 * 60;

// Everything the fake holds, reset by the spec at the start of each run.
const state = {
  athlete: { id: 7001, firstname: "Jo", lastname: "Strava" },
  activities: new Map(),
  // The activity ids fetched one by one, and how many revokes arrived, in order.
  fetched: [],
  revokes: 0
};

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk;
    });
    req.on("end", () => resolve(text));
  });

const tokens = () => ({
  token_type: "Bearer",
  access_token: ACCESS_TOKEN,
  refresh_token: "e2e-refresh",
  expires_at: Math.floor(Date.now() / 1000) + SIX_HOURS,
  expires_in: SIX_HOURS
});

const authorized = (req) => req.headers.authorization === `Bearer ${ACCESS_TOKEN}`;

// The spec's controls: reset with an athlete id, add or remove an activity, and
// read what the server asked for.
const control = async (req, res) => {
  if (req.method === "GET") {
    return send(res, 200, { fetched: state.fetched, revokes: state.revokes });
  }
  const command = JSON.parse((await readBody(req)) || "{}");
  if (command.action === "reset") {
    state.athlete = { ...state.athlete, id: command.athleteId };
    state.activities.clear();
    state.fetched = [];
    state.revokes = 0;
  } else if (command.action === "add") {
    state.activities.set(String(command.activity.id), command.activity);
  } else if (command.action === "remove") {
    state.activities.delete(String(command.id));
  }
  return send(res, 200, { ok: true });
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === "/__control") return control(req, res);

  // The athlete approves at once, granting every activity.
  if (req.method === "GET" && path === "/oauth/authorize") {
    const back = new URL(url.searchParams.get("redirect_uri"));
    back.searchParams.set("code", "e2e-code");
    back.searchParams.set("state", url.searchParams.get("state") || "");
    back.searchParams.set("scope", "read,activity:read_all");
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }

  if (req.method === "POST" && path === "/oauth/token") {
    const form = new URLSearchParams(await readBody(req));
    if (form.get("grant_type") === "authorization_code") {
      return send(res, 200, { ...tokens(), athlete: state.athlete });
    }
    return send(res, 200, tokens());
  }

  if (req.method === "POST" && path === "/oauth/revoke") {
    await readBody(req);
    state.revokes += 1;
    res.writeHead(200);
    return res.end();
  }

  if (!authorized(req)) return send(res, 401, { message: "Authorization Error" });

  // The athlete's activities that started after `after`, oldest first, paged.
  if (req.method === "GET" && path === "/api/v3/athlete/activities") {
    const after = Number(url.searchParams.get("after") || 0);
    const page = Number(url.searchParams.get("page") || 1);
    const perPage = Number(url.searchParams.get("per_page") || 30);
    const listed = [...state.activities.values()]
      .filter((activity) => Date.parse(activity.start_date) / 1000 > after)
      .sort((a, b) => Date.parse(a.start_date) - Date.parse(b.start_date));
    return send(res, 200, listed.slice((page - 1) * perPage, page * perPage));
  }

  const one = path.match(/^\/api\/v3\/activities\/(\d+)$/);
  if (req.method === "GET" && one) {
    state.fetched.push(one[1]);
    const activity = state.activities.get(one[1]);
    return activity ? send(res, 200, activity) : send(res, 404, { message: "Record Not Found" });
  }

  return send(res, 404, { message: "Not Found" });
});

server.listen(PORT, "127.0.0.1");
