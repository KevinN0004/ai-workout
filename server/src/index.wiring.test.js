import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { app } from "./index.js";
import { prisma } from "./db/prisma.js";

// Task 5 and 6 added POST /api/auth/password and DELETE /api/auth/me to
// authRoutes.js and fully tested them against a hand-built buildApp(overrides)
// test harness. That harness passes every dependency directly, so it proves
// nothing about the real app: index.js injects the actual dependency object
// into registerApiRoutes, and a missing key there is invisible until someone
// calls the route at runtime -- registerAuthRoutes destructures an absent key
// as undefined with no error at import time.
//
// This file pins that wiring against the real `app`.
//
// Two different mutations need two different kinds of request to catch them:
//   - Dropping a route registration entirely (or the whole deps object) shows
//     up as 404 even for an unauthenticated caller, because requireAuth never
//     runs. The "no session" tests below catch that.
//   - Dropping just passwordChangeBodySchema, accountDeleteBodySchema,
//     updatePasswordHash or deleteUser from the deps object does NOT show up
//     on an unauthenticated request: requireAuth rejects with 401 before the
//     handler ever reaches the line that uses those deps, so an unauthenticated
//     request cannot tell a present dep from a missing one. Reaching them
//     requires a request that gets past requireAuth (a real session) and past
//     verifyPassword (the correct current password), which is what the
//     authenticated round-trip tests below are for: a missing schema throws in
//     validateBody, and a missing updatePasswordHash/deleteUser throws calling
//     undefined as a function -- both land in the route's catch as a 500
//     instead of the 200 these tests assert.
//
// CSRF is registered ahead of these routes (app.use("/api", requireCsrfToken)
// runs before registerApiRoutes in index.js), so every unsafe-method call below
// first fetches /api/csrf-token and echoes the pair back, exactly as
// index.test.js does for /api/auth/logout, signup and the dashboard mutation.

let server;
let baseUrl = "";

const WIRING_TEST_EMAILS = [
  "wiring-password-change@example.test",
  "wiring-account-delete@example.test"
];

const extractCookieFromHeader = (headerValue, cookieName) => {
  const raw = String(headerValue || "");
  const match = raw.match(new RegExp(`${cookieName}=([^;,\\s]+)`));
  if (!match) return "";
  return `${cookieName}=${match[1]}`;
};

const fetchCsrf = async (sidCookie) => {
  const response = await fetch(`${baseUrl}/api/csrf-token`, {
    headers: sidCookie ? { Cookie: sidCookie } : {}
  });
  const payload = await response.json();
  const csrfToken = String(payload?.csrfToken || "");
  const csrfCookie = extractCookieFromHeader(response.headers.get("set-cookie"), "csrfToken");
  return { csrfToken, csrfCookie };
};

const withCsrf = async (path, method, { sidCookie, body } = {}) => {
  const { csrfToken, csrfCookie } = await fetchCsrf(sidCookie);
  const cookie = [sidCookie, csrfCookie].filter(Boolean).join("; ");

  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
      Cookie: cookie
    },
    body: JSON.stringify(body ?? {})
  });
};

const signUp = async (email, password) => {
  const response = await withCsrf("/api/auth/signup", "POST", {
    body: {
      email,
      password,
      profile: {
        firstName: "Wiring",
        lastName: "Test",
        age: 30,
        heightCm: 175,
        weightKg: 72,
        sex: "Male",
        activity: "Moderate"
      }
    }
  });
  expect(response.status).toBe(200);
  const sidCookie = extractCookieFromHeader(response.headers.get("set-cookie"), "sid");
  expect(sidCookie).toMatch(/^sid=/);
  return sidCookie;
};

beforeAll(async () => {
  await prisma.appUser.deleteMany({ where: { email: { in: WIRING_TEST_EMAILS } } });
  server = app.listen(0);
  await new Promise((resolve) => {
    server.once("listening", resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await prisma.appUser.deleteMany({ where: { email: { in: WIRING_TEST_EMAILS } } });
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

describe("account management routes are wired into the real app", () => {
  test("POST /api/auth/password is registered and requires auth", async () => {
    const response = await withCsrf("/api/auth/password", "POST");

    // A 404 means registerAuthRoutes never received the route registration at
    // all. This alone cannot tell a present passwordChangeBodySchema /
    // updatePasswordHash from a missing one -- see the authenticated test below
    // for that.
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/not signed in/i);
  });

  test("DELETE /api/auth/me is registered and requires auth", async () => {
    const response = await withCsrf("/api/auth/me", "DELETE");

    // A 404 means registerAuthRoutes never received the route registration at
    // all. This alone cannot tell a present accountDeleteBodySchema /
    // deleteUser from a missing one -- see the authenticated test below for
    // that.
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/not signed in/i);
  });

  test("POST /api/auth/password actually changes the password for a signed-in user", async () => {
    const email = "wiring-password-change@example.test";
    const sidCookie = await signUp(email, "OriginalPass123!");

    const response = await withCsrf("/api/auth/password", "POST", {
      sidCookie,
      body: { currentPassword: "OriginalPass123!", newPassword: "RotatedPass456!" }
    });
    const body = await response.json();

    // A 500 here means passwordChangeBodySchema or updatePasswordHash is
    // missing from the deps object: validateBody(req, res, undefined) throws,
    // or updatePasswordHash() throws as "not a function".
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });

    const loginResponse = await withCsrf("/api/auth/login", "POST", {
      body: { email, password: "RotatedPass456!" }
    });
    expect(loginResponse.status).toBe(200);
  });

  test("DELETE /api/auth/me actually deletes the account for a signed-in user", async () => {
    const email = "wiring-account-delete@example.test";
    const sidCookie = await signUp(email, "DeleteMePass123!");

    const response = await withCsrf("/api/auth/me", "DELETE", {
      sidCookie,
      body: { password: "DeleteMePass123!" }
    });
    const body = await response.json();

    // A 500 here means accountDeleteBodySchema or deleteUser is missing from
    // the deps object: validateBody(req, res, undefined) throws, or
    // deleteUser() throws as "not a function".
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });

    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sidCookie }
    });
    expect(meResponse.status).toBe(401);
  });
});
