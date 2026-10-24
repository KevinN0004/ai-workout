import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

// The five /api limiters are the app's only defence against credential stuffing
// and against an anonymous caller burning the Gemini quota, and a sixth bounds
// the SPA shell's file read. index.test.js loops until it sees *a* 429 on
// /api/generate but never asserts which limiter answered, so this file does:
// each limiter has a case that expects its own 429 body, and one case checks
// the metrics counter a limited request moves.
//
// Every limit is read from the environment once at import, so each case gets a
// freshly imported app with the one limit under test set to 1 and the rest set
// far out of the way. That isolates which limiter answers: the limiters are
// layered (/api global, then the per-route one), so leaving the others at their
// defaults would let the global one answer first.
//
// Re-importing is safe for the reason index.cors.test.js gives: index.js
// exports startServer rather than calling it, and prisma.js caches its client
// on globalThis outside production, so no second database client is created.

const LIMIT_KEYS = [
  "API_RATE_LIMIT_MAX",
  "AUTH_RATE_LIMIT_MAX",
  "CREDENTIAL_RATE_LIMIT_MAX",
  "GENERATE_RATE_LIMIT_MAX",
  "ANON_GENERATE_RATE_LIMIT_MAX",
  "SPA_RATE_LIMIT_MAX"
];

// The shell's limiter is mounted only when there is a bundle to serve, so every
// app here is pointed at a real one in a temporary folder. With client/dist
// built, index.js would otherwise serve that, and without it mount nothing.
const SHELL = "<!doctype html><html><body><div id=root>SPA_SHELL_MARKER</div></body></html>";
let distPath;

beforeAll(() => {
  distPath = fs.mkdtempSync(path.join(os.tmpdir(), "ai-workout-dist-"));
  fs.writeFileSync(path.join(distPath, "index.html"), SHELL);
});

afterAll(() => {
  fs.rmSync(distPath, { recursive: true, force: true });
});

// Well above any single test's request count, so a limiter that is not under
// test cannot answer first.
const OUT_OF_THE_WAY = "1000";

let running = [];

// Each key is always assigned, never deleted, before the import. index.js calls
// dotenv.config() at module scope and dotenv fills in keys that are absent, so
// deleting one would hand the app whatever server/.env says rather than the
// value the test asked for.
const startApp = async (limited) => {
  vi.resetModules();
  const keys = [...LIMIT_KEYS, "CLIENT_DIST_PATH"];
  const previous = keys.map((key) => process.env[key]);
  LIMIT_KEYS.forEach((key) => {
    process.env[key] = key === limited ? "1" : OUT_OF_THE_WAY;
  });
  process.env.CLIENT_DIST_PATH = distPath;

  let app;
  try {
    ({ app } = await import("../index.js"));
  } finally {
    // Assigning undefined to process.env stores the string "undefined", so a
    // variable that was absent has to be deleted rather than assigned back.
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  running.push(server);
  return `http://127.0.0.1:${server.address().port}`;
};

// The limiters are registered before the CSRF middleware, so an unauthenticated
// POST with no token still reaches them. Under the limit these answer 403; over
// it they answer 429, which is the only part these tests assert on.
const post = (baseUrl, path) =>
  fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

const del = (baseUrl, path) =>
  fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });

afterEach(async () => {
  await Promise.all(
    running.map((server) => new Promise((resolve) => server.close(() => resolve())))
  );
  running = [];
});

describe("rate limiters", () => {
  test("the global /api limiter answers with its own message", async () => {
    const baseUrl = await startApp("API_RATE_LIMIT_MAX");

    const first = await fetch(`${baseUrl}/api/health`);
    const second = await fetch(`${baseUrl}/api/health`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({
      error: "Too many requests. Please try again shortly."
    });
  });

  test("the auth limiter answers sign-in attempts with its own message", async () => {
    const baseUrl = await startApp("AUTH_RATE_LIMIT_MAX");

    await post(baseUrl, "/api/auth/login");
    const limited = await post(baseUrl, "/api/auth/login");

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Too many sign-in attempts. Please try again later."
    });
  });

  // Registered on both /api/auth/login and /api/auth/signup, and the limiter is
  // shared, so exhausting it on one must limit the other. A per-route limiter
  // would let an attacker double their budget by alternating the two.
  test("the auth limiter budget is shared between login and signup", async () => {
    const baseUrl = await startApp("AUTH_RATE_LIMIT_MAX");

    await post(baseUrl, "/api/auth/login");
    const limited = await post(baseUrl, "/api/auth/signup");

    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe("Too many sign-in attempts. Please try again later.");
  });

  // Without the credential limiter, the password-change and account-deletion
  // routes would have only the global /api budget behind them: at the defaults,
  // about eight times looser than login's for a guess that costs the same
  // argon2id verify.
  test("the credential limiter answers repeated password-verification attempts with 429", async () => {
    const baseUrl = await startApp("CREDENTIAL_RATE_LIMIT_MAX");

    await post(baseUrl, "/api/auth/password");
    const limited = await post(baseUrl, "/api/auth/password");

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Too many attempts. Please try again later."
    });
  });

  // Registered on both POST /api/auth/password and DELETE /api/auth/me with
  // the same limiter instance, so exhausting it on one must limit the other --
  // otherwise an attacker holding a stolen session could double their guess
  // budget by alternating the two credential checks.
  test("the credential limiter budget is shared between password change and account deletion", async () => {
    const baseUrl = await startApp("CREDENTIAL_RATE_LIMIT_MAX");

    await post(baseUrl, "/api/auth/password");
    const limited = await del(baseUrl, "/api/auth/me");

    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe("Too many attempts. Please try again later.");
  });

  // The regression to guard against here: binding the credential limiter to
  // the whole /api/auth/me path (app.use) rather than to DELETE alone would
  // also throttle this GET, which the client calls on every page load to check
  // the session.
  test("GET /api/auth/me is not subject to the credential limiter", async () => {
    const baseUrl = await startApp("CREDENTIAL_RATE_LIMIT_MAX");

    const responses = [];
    for (let i = 0; i < 5; i += 1) {
      responses.push(await fetch(`${baseUrl}/api/auth/me`));
    }

    expect(responses.some((res) => res.status === 429)).toBe(false);
    expect(responses.every((res) => res.status === 401)).toBe(true);
  });

  test("the generate limiter answers with its own message", async () => {
    const baseUrl = await startApp("GENERATE_RATE_LIMIT_MAX");

    await post(baseUrl, "/api/generate");
    const limited = await post(baseUrl, "/api/generate");

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Workout generation rate limit reached. Please wait and retry."
    });
  });

  // The anonymous quota is the one a signed-out visitor meets first, and it is
  // the only handler that answers with requiresAuth so the client knows to show
  // the sign-in prompt rather than a generic retry message.
  test("the anonymous generate quota asks the caller to sign in", async () => {
    const baseUrl = await startApp("ANON_GENERATE_RATE_LIMIT_MAX");

    await post(baseUrl, "/api/generate");
    const limited = await post(baseUrl, "/api/generate");

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Free plan limit reached. Sign in to keep generating workout plans.",
      requiresAuth: true
    });
  });

  // The SPA fallback reads index.html from disk on every page request, so it
  // has a limiter of its own. This pins that index.js hands it the configured
  // limit; staticClient.test.js covers what the limiter does.
  test("the shell's limiter answers page requests with its own message", async () => {
    const baseUrl = await startApp("SPA_RATE_LIMIT_MAX");

    const first = await fetch(`${baseUrl}/dashboard`);
    const limited = await fetch(`${baseUrl}/dashboard`);

    expect(first.status).toBe(200);
    expect(await first.text()).toContain("SPA_SHELL_MARKER");
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Too many page requests. Please try again shortly."
    });
  });

  // One budget per process, separate from the /api one: exhausting the shell's
  // must leave the API answering.
  test("a limited page request leaves /api alone and is counted", async () => {
    const baseUrl = await startApp("SPA_RATE_LIMIT_MAX");

    const before = await (await fetch(`${baseUrl}/api/metrics`)).json();
    await fetch(`${baseUrl}/`);
    const limited = await fetch(`${baseUrl}/`);
    const health = await fetch(`${baseUrl}/api/health`);
    const after = await (await fetch(`${baseUrl}/api/metrics`)).json();

    expect(limited.status).toBe(429);
    expect(health.status).toBe(200);
    expect(after.rateLimited).toBe(before.rateLimited + 1);
  });

  test("a limited request is counted in the metrics the operator reads", async () => {
    const baseUrl = await startApp("AUTH_RATE_LIMIT_MAX");

    const before = await (await fetch(`${baseUrl}/api/metrics`)).json();
    await post(baseUrl, "/api/auth/login");
    await post(baseUrl, "/api/auth/login");
    const after = await (await fetch(`${baseUrl}/api/metrics`)).json();

    expect(after.rateLimited).toBe(before.rateLimited + 1);
  });

  test("a request under the limit is not counted or rejected", async () => {
    const baseUrl = await startApp("AUTH_RATE_LIMIT_MAX");

    const before = await (await fetch(`${baseUrl}/api/metrics`)).json();
    const allowed = await post(baseUrl, "/api/auth/login");
    const after = await (await fetch(`${baseUrl}/api/metrics`)).json();

    expect(allowed.status).not.toBe(429);
    expect(after.rateLimited).toBe(before.rateLimited);
  });
});
