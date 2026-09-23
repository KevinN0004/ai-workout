import crypto from "crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { registerAuthRoutes } from "../authRoutes.js";
import { createAuthUserService } from "../../services/auth/authUserService.js";
import { parseCookies } from "../../services/auth/sessionService.js";
import {
  accountDeleteBodySchema,
  loginBodySchema,
  passwordChangeBodySchema,
  profileBodySchema,
  signupBodySchema,
  validateBody
} from "../../services/http/apiSchemaService.js";
import {
  buildProfile,
  cleanText,
  defaultDashboard,
  defaultProfile,
  isCompleteSignupProfile
} from "../../services/dashboard/dashboardDataBuildersService.js";

// The route layer above authUserService, which was left at 58.5% statements
// and 38.1% branch when that service went to 100%. The branches here are the
// ones a caller can reach: whether a bad login is distinguishable from an
// unknown account, whether a failed password upgrade costs a user their
// session, and what ends up in the response body.
//
// Only the database, the session store and the cookie writers are stubbed.
// Password hashing is the real argon2 through the real authUserService, so a
// signup followed by a login exercises the same code a request does. Cost
// parameters are the lowest argon2 accepts, to keep the file quick.
const argon2Options = { timeCost: 2, memoryCost: 8192, parallelism: 1, hashLength: 32 };

let rows;
let sessions;
let metrics;
let cookieCalls;
let deps;
let logError;

const findUserWithDashboard = async (userId) => rows.find((row) => row.userId === userId) || null;
const findUserWithDashboardByEmail = async (email) =>
  rows.find((row) => row.email === email) || null;
const createUserWithDashboard = async (doc) => {
  rows.push(doc);
  return doc;
};

const buildApp = (overrides = {}) => {
  const app = express();
  app.use(express.json());
  // Every handler reads req.log optionally; give it one so the log assertions
  // have something to see.
  app.use((req, _res, next) => {
    req.log = { error: logError, warn: vi.fn(), info: vi.fn() };
    next();
  });
  registerAuthRoutes(app, { ...deps, ...overrides });
  return app;
};

// A real legacy record, hashed the way the pre-argon2 code did it -- the same
// shape authUserService.test.js's identical helper builds, so verifyPassword's
// real pbkdf2 branch accepts it rather than only a stubbed algo flag.
const legacyPbkdf2Record = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash, passwordAlgo: "pbkdf2" };
};

const signupBody = (overrides = {}) => ({
  email: "Person@Example.COM",
  password: "StrongPass123!",
  profile: {
    firstName: "Jordan",
    lastName: "Kim",
    age: 29,
    heightCm: 178,
    weightKg: 76,
    sex: "Male",
    activity: "Moderate"
  },
  ...overrides
});

beforeEach(() => {
  rows = [];
  sessions = [];
  metrics = { authFailures: 0 };
  cookieCalls = { session: [], csrf: [], clearedSession: 0, clearedCsrf: 0 };
  logError = vi.fn();

  const authUserService = createAuthUserService({
    cleanText,
    argon2Options,
    updatePasswordHash: vi.fn(async ({ userId, salt, hash, passwordAlgo }) => {
      const row = rows.find((item) => item.userId === userId);
      if (row) Object.assign(row, { salt, hash, passwordAlgo });
    }),
    findUserWithDashboard,
    findUserWithDashboardByEmail,
    createUserWithDashboard
  });

  deps = {
    getSessionUser: vi.fn(async () => null),
    defaultProfile,
    requireAuth: (req, res, next) => {
      req.user = { id: "u-1", profile: defaultProfile() };
      next();
    },
    validateBody,
    profileBodySchema,
    buildProfile,
    findUserWithDashboard,
    updateProfile: vi.fn(async ({ userId, profile }) => {
      const row = rows.find((item) => item.userId === userId);
      if (row) row.profile = profile;
    }),
    mapDbDocToUser: authUserService.mapDbDocToUser,
    signupBodySchema,
    cleanText,
    findUserByEmail: authUserService.findUserByEmail,
    isCompleteSignupProfile,
    hashPassword: authUserService.hashPassword,
    defaultDashboard,
    createUser: authUserService.createUser,
    createSession: vi.fn(async (userId) => {
      const token = `sess-${sessions.length + 1}`;
      sessions.push({ token, userId });
      return token;
    }),
    setSessionCookie: vi.fn((_res, token, rememberMe) => {
      cookieCalls.session.push({ token, rememberMe });
    }),
    setCsrfCookie: vi.fn((_res, token) => {
      cookieCalls.csrf.push(token);
    }),
    loginBodySchema,
    passwordChangeBodySchema,
    accountDeleteBodySchema,
    metrics,
    getDummyPasswordRecord: authUserService.getDummyPasswordRecord,
    verifyPassword: authUserService.verifyPassword,
    shouldUpgradePasswordToArgon2id: authUserService.shouldUpgradePasswordToArgon2id,
    upgradeUserPasswordToArgon2id: authUserService.upgradeUserPasswordToArgon2id,
    // A stand-in for the Task 4b repository function: mutates the row's hash
    // the same way, and only stamps passwordChangedAt when the caller passes
    // the intent flag -- the repository owns the clock, so this fake mints
    // its own timestamp rather than accepting one.
    updatePasswordHash: vi.fn(async ({ userId, salt, hash, passwordAlgo, stampPasswordChange }) => {
      const row = rows.find((item) => item.userId === userId);
      if (row) {
        Object.assign(row, { salt, hash, passwordAlgo });
        if (stampPasswordChange) row.passwordChangedAt = new Date().toISOString();
      }
      return true;
    }),
    toShortText: (value, maxLen = 160) =>
      typeof value === "string" ? value.trim().slice(0, maxLen) : "",
    parseCookies,
    deleteSession: vi.fn(async (token) => {
      sessions = sessions.filter((item) => item.token !== token);
    }),
    clearSessionCookie: vi.fn(() => {
      cookieCalls.clearedSession += 1;
    }),
    clearCsrfCookie: vi.fn(() => {
      cookieCalls.clearedCsrf += 1;
    })
  };
});

describe("POST /api/auth/signup", () => {
  test("creates the account and opens a session", async () => {
    const response = await request(buildApp()).post("/api/auth/signup").send(signupBody());

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("person@example.com");
    expect(rows).toHaveLength(1);
    expect(cookieCalls.session).toHaveLength(1);
    expect(cookieCalls.csrf).toHaveLength(1);
  });

  // The address is the login identifier, so it is stored in one form.
  test("normalises the email before storing it", async () => {
    await request(buildApp())
      .post("/api/auth/signup")
      .send(signupBody({ email: " A@B.Com " }));

    expect(rows[0].email).toBe("a@b.com");
  });

  test("stores a real argon2id hash and never the password", async () => {
    await request(buildApp()).post("/api/auth/signup").send(signupBody());

    expect(rows[0].passwordAlgo).toBe("argon2id");
    expect(rows[0].hash.startsWith("$argon2id$")).toBe(true);
    expect(JSON.stringify(rows[0])).not.toContain("StrongPass123!");
  });

  // Nothing derived from the password may travel back to the client.
  test("returns no credential material", async () => {
    const response = await request(buildApp()).post("/api/auth/signup").send(signupBody());

    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/hash|salt|passwordAlgo|StrongPass123!/i);
    expect(Object.keys(response.body.user).sort()).toEqual(["email", "id", "profile"]);
  });

  test("rejects a duplicate account with 409", async () => {
    const app = buildApp();
    await request(app).post("/api/auth/signup").send(signupBody());

    const second = await request(app).post("/api/auth/signup").send(signupBody());

    expect(second.status).toBe(409);
    expect(rows).toHaveLength(1);
  });

  // Case is not a way around the duplicate check.
  test("treats a differently-cased email as the same account", async () => {
    const app = buildApp();
    await request(app)
      .post("/api/auth/signup")
      .send(signupBody({ email: "person@example.com" }));

    const second = await request(app)
      .post("/api/auth/signup")
      .send(signupBody({ email: "PERSON@EXAMPLE.COM" }));

    expect(second.status).toBe(409);
  });

  test("rejects an incomplete profile with 400", async () => {
    const response = await request(buildApp())
      .post("/api/auth/signup")
      .send(signupBody({ profile: { firstName: "Jordan" } }));

    expect(response.status).toBe(400);
    expect(rows).toHaveLength(0);
    // No session for an account that was never created.
    expect(cookieCalls.session).toHaveLength(0);
  });

  test.each([
    ["no email", { email: undefined }],
    ["an empty email", { email: "   " }],
    ["no password", { password: undefined }],
    ["a short password", { password: "abc" }]
  ])("rejects a body with %s", async (_label, patch) => {
    const response = await request(buildApp()).post("/api/auth/signup").send(signupBody(patch));

    expect(response.status).toBe(400);
    expect(rows).toHaveLength(0);
  });

  // Recording what the schema does rather than what it might be expected to.
  // signupBodySchema types email as a non-empty string of at most 254
  // characters and does not check its shape, so this is accepted today. The
  // app sends no mail, so the address is only ever a login identifier.
  test("does not check the shape of the email", async () => {
    const response = await request(buildApp())
      .post("/api/auth/signup")
      .send(signupBody({ email: "not-an-email" }));

    expect(response.status).toBe(200);
    expect(rows[0].email).toBe("not-an-email");
  });

  test("remembers the session by default", async () => {
    await request(buildApp()).post("/api/auth/signup").send(signupBody());

    expect(cookieCalls.session[0].rememberMe).toBe(true);
  });

  test("honours rememberMe false", async () => {
    await request(buildApp())
      .post("/api/auth/signup")
      .send(signupBody({ rememberMe: false }));

    expect(cookieCalls.session[0].rememberMe).toBe(false);
  });

  test("answers 500 without detail when the store fails", async () => {
    const app = buildApp({
      createUser: async () => {
        throw new Error("connection terminated unexpectedly");
      }
    });

    const response = await request(app).post("/api/auth/signup").send(signupBody());

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/connection terminated/);
  });
});

describe("POST /api/auth/login", () => {
  const registered = async (app) => {
    await request(app).post("/api/auth/signup").send(signupBody());
    cookieCalls.session = [];
    cookieCalls.csrf = [];
  };

  test("signs in with the password used at signup", async () => {
    const app = buildApp();
    await registered(app);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "person@example.com", password: "StrongPass123!" });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("person@example.com");
    expect(cookieCalls.session).toHaveLength(1);
    expect(cookieCalls.csrf).toHaveLength(1);
  });

  test("accepts a differently-cased email", async () => {
    const app = buildApp();
    await registered(app);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "PERSON@example.com", password: "StrongPass123!" });

    expect(response.status).toBe(200);
  });

  // The reason the dummy-hash path exists. If a wrong password and an unknown
  // address answered differently, the login form would be a way to ask which
  // addresses have accounts.
  describe("does not reveal whether an account exists", () => {
    test("answers a wrong password and an unknown address identically", async () => {
      const app = buildApp();
      await registered(app);

      const wrongPassword = await request(app)
        .post("/api/auth/login")
        .send({ email: "person@example.com", password: "WrongPass123!" });
      const unknownEmail = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "StrongPass123!" });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    // Answering an unknown address without hashing would return sooner, and
    // the difference is measurable.
    test("still verifies against a dummy record for an unknown address", async () => {
      const verifyPassword = vi.fn(async () => false);
      const getDummyPasswordRecord = vi.fn(async () => ({
        hash: "$argon2id$stub",
        passwordAlgo: "argon2id"
      }));
      const app = buildApp({ verifyPassword, getDummyPasswordRecord });

      await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "StrongPass123!" });

      expect(getDummyPasswordRecord).toHaveBeenCalledTimes(1);
      expect(verifyPassword).toHaveBeenCalledTimes(1);
    });

    test("opens no session on either failure", async () => {
      const app = buildApp();
      await registered(app);

      await request(app)
        .post("/api/auth/login")
        .send({ email: "person@example.com", password: "WrongPass123!" });
      await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@example.com", password: "StrongPass123!" });

      expect(cookieCalls.session).toHaveLength(0);
    });
  });

  test("counts both kinds of failure", async () => {
    const app = buildApp();
    await registered(app);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "person@example.com", password: "WrongPass123!" });
    expect(metrics.authFailures).toBe(1);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "StrongPass123!" });
    expect(metrics.authFailures).toBe(2);
  });

  test("does not count a successful sign-in", async () => {
    const app = buildApp();
    await registered(app);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "person@example.com", password: "StrongPass123!" });

    expect(metrics.authFailures).toBe(0);
  });

  test("returns no credential material", async () => {
    const app = buildApp();
    await registered(app);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "person@example.com", password: "StrongPass123!" });

    expect(JSON.stringify(response.body)).not.toMatch(/hash|salt|passwordAlgo|StrongPass123!/i);
  });

  test.each([
    ["no email", { password: "StrongPass123!" }],
    ["no password", { email: "person@example.com" }],
    ["an empty body", {}]
  ])("rejects a login with %s", async (_label, body) => {
    const response = await request(buildApp()).post("/api/auth/login").send(body);

    expect(response.status).toBe(400);
  });

  test("honours rememberMe false", async () => {
    const app = buildApp();
    await registered(app);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "person@example.com", password: "StrongPass123!", rememberMe: false });

    expect(cookieCalls.session[0].rememberMe).toBe(false);
  });

  // Omitting the field means remembered, the same as it does at signup. This
  // is the difference between a persistent cookie and one that dies with the
  // browser, so the default is worth pinning on both routes rather than one.
  test("remembers the session when the field is omitted", async () => {
    const app = buildApp();
    await registered(app);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "person@example.com", password: "StrongPass123!" });

    expect(cookieCalls.session[0].rememberMe).toBe(true);
  });

  // The stored hash stays argon2 in these, so the real verifier still accepts
  // the password; only the "does this row need upgrading" answer is forced.
  // Rewriting the row's passwordAlgo instead would send verification down the
  // pbkdf2 path against an argon2 hash and fail the login for the wrong reason.
  describe("migrating a legacy password", () => {
    test("rehashes on a successful sign-in", async () => {
      const upgradeUserPasswordToArgon2id = vi.fn(async () => ({}));
      const app = buildApp({
        shouldUpgradePasswordToArgon2id: () => true,
        upgradeUserPasswordToArgon2id
      });
      await registered(app);

      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "person@example.com", password: "StrongPass123!" });

      expect(response.status).toBe(200);
      expect(upgradeUserPasswordToArgon2id).toHaveBeenCalledTimes(1);
    });

    test("does not rehash an account already on argon2id", async () => {
      const upgradeUserPasswordToArgon2id = vi.fn(async () => ({}));
      const app = buildApp({ upgradeUserPasswordToArgon2id });
      await registered(app);

      await request(app)
        .post("/api/auth/login")
        .send({ email: "person@example.com", password: "StrongPass123!" });

      expect(upgradeUserPasswordToArgon2id).not.toHaveBeenCalled();
    });

    // The upgrade is a convenience. Letting it fail the request would lock a
    // user out over a write they did not ask for and cannot retry.
    test("signs the user in even when the rehash fails", async () => {
      const app = buildApp({
        shouldUpgradePasswordToArgon2id: () => true,
        upgradeUserPasswordToArgon2id: async () => {
          throw new Error("pg: could not write");
        }
      });
      await registered(app);

      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "person@example.com", password: "StrongPass123!" });

      expect(response.status).toBe(200);
      expect(cookieCalls.session).toHaveLength(1);
    });

    test("records the failed rehash for an operator", async () => {
      const app = buildApp({
        shouldUpgradePasswordToArgon2id: () => true,
        upgradeUserPasswordToArgon2id: async () => {
          throw new Error("pg: could not write");
        }
      });
      await registered(app);

      await request(app)
        .post("/api/auth/login")
        .send({ email: "person@example.com", password: "StrongPass123!" });

      expect(logError).toHaveBeenCalledTimes(1);
      expect(logError.mock.calls[0][0]).toMatchObject({ event: "password_upgrade_failed" });
    });
  });

  // Regression pin for passwordChangedAt: the login rehash is invisible to the
  // user, so it must never stamp the field -- doing so would sign a
  // legacy-hash account out of every other device on an ordinary login it
  // never asked to be rehashed by. Forcing shouldUpgradePasswordToArgon2id
  // with a stub (as the describe block above does) would prove nothing about
  // what upgradeUserPasswordToArgon2id itself passes downstream, so this
  // drives a genuinely pbkdf2-hashed account through the real upgrade path
  // instead, with its own authUserService wired to a spyable
  // updatePasswordHash.
  test("a pbkdf2 -> argon2id upgrade on login does not stamp passwordChangedAt", async () => {
    const updates = [];
    const upgradeUserPasswordToArgon2id = createAuthUserService({
      cleanText,
      argon2Options,
      updatePasswordHash: async (args) => {
        updates.push(args);
        return true;
      },
      findUserWithDashboard,
      findUserWithDashboardByEmail,
      createUserWithDashboard
    }).upgradeUserPasswordToArgon2id;

    const app = buildApp({ upgradeUserPasswordToArgon2id });
    await registered(app);

    // Overwrite the freshly-signed-up argon2 row with a genuine pbkdf2 hash of
    // the same password, so both shouldUpgradePasswordToArgon2id and the real
    // pbkdf2 verifier see a legacy account rather than a forced flag.
    Object.assign(rows[0], legacyPbkdf2Record("StrongPass123!"));

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "person@example.com", password: "StrongPass123!" });

    expect(response.status).toBe(200);
    // Proves the upgrade genuinely fired -- otherwise the forEach below would
    // assert nothing over an empty array.
    expect(updates.length).toBeGreaterThan(0);
    updates.forEach((args) => {
      expect(args.stampPasswordChange).toBeFalsy();
    });
  });

  test("answers 500 without detail when the lookup fails", async () => {
    const app = buildApp({
      findUserByEmail: async () => {
        throw new Error("connection terminated unexpectedly");
      }
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "person@example.com", password: "StrongPass123!" });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/connection terminated/);
  });
});

describe("POST /api/auth/password", () => {
  // The shared `requireAuth` stub used everywhere else in this file always
  // resolves to a fixed { id: "u-1" } with no hash, regardless of any cookie
  // -- fine for routes that only read req.user.id, but this route verifies
  // the current password against req.user.hash. These tests need a
  // `requireAuth` that genuinely resolves the signed-in row from the cookie,
  // the way index.js really wires it (getSessionUser -> findUserById), so it
  // is built locally from the same `sessions` / `rows` fixtures rather than
  // reusing the shared stub.
  const realRequireAuth = async (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie || "");
    const session = sessions.find((item) => item.token === cookies.sid);
    const row = session && rows.find((item) => item.userId === session.userId);
    if (!row) return res.status(401).json({ error: "Not signed in." });
    req.user = deps.mapDbDocToUser(row);
    next();
  };

  const passwordApp = (overrides = {}) => buildApp({ requireAuth: realRequireAuth, ...overrides });

  // The shared `setSessionCookie`/`setCsrfCookie` mocks only record calls in
  // `cookieCalls`; they never write a real Set-Cookie header (see the logout
  // tests below, which hardcode "sid=sess-1" rather than reading a response
  // header for the same reason). So the session cookie a signup produced is
  // read back from `cookieCalls.session`, not from `res.headers["set-cookie"]`.
  const signUpAndGetCookie = async (app) => {
    await request(app).post("/api/auth/signup").send(signupBody()).expect(200);
    const { token } = cookieCalls.session[cookieCalls.session.length - 1];
    return `sid=${token}`;
  };

  test("changes the password and lets the new one log in", async () => {
    const app = passwordApp();
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "BrandNewPass456!" })
      .expect(200);

    await request(app)
      .post("/api/auth/login")
      .send({ email: signupBody().email, password: "BrandNewPass456!" })
      .expect(200);
  });

  test("the old password stops working", async () => {
    const app = passwordApp();
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "BrandNewPass456!" })
      .expect(200);

    await request(app)
      .post("/api/auth/login")
      .send({ email: signupBody().email, password: signupBody().password })
      .expect(401);
  });

  test("a wrong current password is rejected and changes nothing", async () => {
    const app = passwordApp();
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: "not-the-password", newPassword: "BrandNewPass456!" })
      .expect(401);

    await request(app)
      .post("/api/auth/login")
      .send({ email: signupBody().email, password: signupBody().password })
      .expect(200);
  });

  test("asks the repository to stamp the change so other sessions can be invalidated", async () => {
    const updates = [];
    const app = passwordApp({
      updatePasswordHash: async (args) => {
        updates.push(args);
        return true;
      }
    });
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "BrandNewPass456!" })
      .expect(200);

    expect(updates).toHaveLength(1);
    expect(updates[0].stampPasswordChange).toBe(true);
  });

  // The shared mocks never write a real Set-Cookie header (see
  // signUpAndGetCookie above), so "a replacement session was issued" is
  // observed through the same cookieCalls.session record the rest of this
  // file already trusts, rather than through the response headers.
  test("issues a replacement session so this device stays signed in", async () => {
    const app = passwordApp();
    const cookie = await signUpAndGetCookie(app);
    const sessionCallsBefore = cookieCalls.session.length;

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "BrandNewPass456!" })
      .expect(200);

    expect(cookieCalls.session.length).toBe(sessionCallsBefore + 1);
  });

  test("requires a signed-in user", async () => {
    const app = passwordApp();
    await request(app)
      .post("/api/auth/password")
      .send({ currentPassword: "whatever", newPassword: "BrandNewPass456!" })
      .expect(401);
  });

  test("reports failure, and keeps the session, when the write matched no row", async () => {
    // The account was deleted in another tab between requireAuth resolving the
    // user and the update landing. Before this was checked the route answered
    // 200 "Password changed." having changed nothing -- and worse, it had
    // already destroyed the caller's session and minted a replacement for an
    // account that no longer existed.
    const app = passwordApp({ updatePasswordHash: async () => false });
    const cookie = await signUpAndGetCookie(app);
    const before = sessions.length;

    const response = await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: "StrongPass123!", newPassword: "BrandNewPass456!" });

    expect(response.status).toBe(401);
    expect(sessions.length).toBe(before);
  });

  test("rejects a new password shorter than eight characters", async () => {
    const app = passwordApp();
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "short" })
      .expect(400);
  });

  test("the replacement session is a different token from the one it replaces", async () => {
    // Not cosmetic. If the route reused the old token, that token predates
    // the stamp and Task 3's rule would reject it on the very next request --
    // signing the user out the instant they changed their password.
    //
    // The shared createSession mock names tokens from sessions.length, which
    // a real crypto-random token generator never would. Combined with this
    // route's delete-then-create order, that scheme can regenerate the same
    // string after the old session is removed -- a fixture artifact, not a
    // real collision. A monotonic counter that survives deletions stands in
    // for "every minted token is unique", which is what production actually
    // guarantees.
    let tokenCounter = 0;
    const uniqueCreateSession = vi.fn(async (userId) => {
      tokenCounter += 1;
      const token = `unique-sess-${tokenCounter}`;
      sessions.push({ token, userId });
      return token;
    });
    const app = passwordApp({ createSession: uniqueCreateSession });
    const cookie = await signUpAndGetCookie(app);
    const originalToken = cookieCalls.session[cookieCalls.session.length - 1].token;

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "BrandNewPass456!" })
      .expect(200);

    const replacementToken = cookieCalls.session[cookieCalls.session.length - 1].token;
    expect(replacementToken).not.toBe(originalToken);
  });

  test("counts a wrong current password as an auth failure", async () => {
    const app = passwordApp();
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: "not-the-password", newPassword: "BrandNewPass456!" })
      .expect(401);

    expect(metrics.authFailures).toBe(1);
  });

  test("does not count a successful password change", async () => {
    const app = passwordApp();
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "BrandNewPass456!" })
      .expect(200);

    expect(metrics.authFailures).toBe(0);
  });

  test("does not leak whether the failure was the password or the session", async () => {
    // A 401 for a wrong current password must not be distinguishable in body
    // text from any other 401 in a way that helps an attacker who has stolen
    // a session cookie enumerate the real password.
    const app = passwordApp();
    const cookie = await signUpAndGetCookie(app);

    const res = await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: "not-the-password", newPassword: "BrandNewPass456!" })
      .expect(401);

    expect(JSON.stringify(res.body)).not.toMatch(/hash|argon|salt|pbkdf2/i);
  });
});

describe("DELETE /api/auth/me", () => {
  // Same problem, same fix, as POST /api/auth/password above: the shared
  // `requireAuth` stub always resolves to a fixed { id: "u-1" } with no
  // hash/salt, regardless of any cookie. This route verifies a password
  // against req.user, and one of its tests specifically asserts that a
  // session belonging to a deleted user stops authenticating -- against the
  // shared stub that would pass unconditionally, proving nothing. So this
  // block builds its own requireAuth that genuinely resolves the signed-in
  // row from the cookie via the same sessions/rows fixtures, mirroring
  // Task 5's realRequireAuth rather than reusing the shared stub.
  const realRequireAuth = async (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie || "");
    const session = sessions.find((item) => item.token === cookies.sid);
    const row = session && rows.find((item) => item.userId === session.userId);
    if (!row) return res.status(401).json({ error: "Not signed in." });
    req.user = deps.mapDbDocToUser(row);
    next();
  };

  const deleteApp = (overrides = {}) => buildApp({ requireAuth: realRequireAuth, ...overrides });

  // Same reasoning as signUpAndGetCookie in the password describe block: the
  // shared setSessionCookie/setCsrfCookie mocks only record calls in
  // cookieCalls, they never write a real Set-Cookie header, so the session
  // cookie a signup or login produced is read back from cookieCalls.session
  // rather than from a response header.
  const signUpAndGetCookie = async (app) => {
    await request(app).post("/api/auth/signup").send(signupBody()).expect(200);
    const { token } = cookieCalls.session[cookieCalls.session.length - 1];
    return `sid=${token}`;
  };

  test("deletes the account and the old credentials stop working", async () => {
    const deleted = [];
    const app = deleteApp({
      deleteUser: async ({ userId }) => {
        deleted.push(userId);
        const index = rows.findIndex((row) => row.userId === userId);
        if (index >= 0) rows.splice(index, 1);
        return true;
      }
    });
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .delete("/api/auth/me")
      .set("Cookie", cookie)
      .send({ password: signupBody().password })
      .expect(200);

    expect(deleted).toHaveLength(1);
    await request(app)
      .post("/api/auth/login")
      .send({ email: signupBody().email, password: signupBody().password })
      .expect(401);
  });

  test("a wrong password is rejected and the account survives", async () => {
    const deleted = [];
    const app = deleteApp({
      deleteUser: async ({ userId }) => {
        deleted.push(userId);
        return true;
      }
    });
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .delete("/api/auth/me")
      .set("Cookie", cookie)
      .send({ password: "not-the-password" })
      .expect(401);

    expect(deleted).toHaveLength(0);
    await request(app)
      .post("/api/auth/login")
      .send({ email: signupBody().email, password: signupBody().password })
      .expect(200);
  });

  test("counts a wrong password as an auth failure", async () => {
    const app = deleteApp({ deleteUser: async () => true });
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .delete("/api/auth/me")
      .set("Cookie", cookie)
      .send({ password: "not-the-password" })
      .expect(401);

    expect(metrics.authFailures).toBe(1);
  });

  test("does not count a successful deletion", async () => {
    const app = deleteApp({ deleteUser: async () => true });
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .delete("/api/auth/me")
      .set("Cookie", cookie)
      .send({ password: signupBody().password })
      .expect(200);

    expect(metrics.authFailures).toBe(0);
  });

  test("requires a signed-in user", async () => {
    const app = deleteApp();
    await request(app).delete("/api/auth/me").send({ password: "whatever" }).expect(401);
  });

  // cookieCalls is not an array of call names -- see the shared beforeEach
  // above, which tracks clears as counters (clearedSession/clearedCsrf), the
  // same shape the logout tests below already assert on.
  test("clears the session and csrf cookies", async () => {
    const app = deleteApp({ deleteUser: async () => true });
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .delete("/api/auth/me")
      .set("Cookie", cookie)
      .send({ password: signupBody().password })
      .expect(200);

    expect(cookieCalls.clearedSession).toBe(1);
    expect(cookieCalls.clearedCsrf).toBe(1);
  });

  // The design spec's claim under test: does an orphaned session -- one
  // whose user row is gone but whose session token was never touched by the
  // delete request -- actually stop authenticating? That depends on
  // requireAuth genuinely re-resolving the user on every request rather than
  // trusting a cached value, which is exactly what realRequireAuth above
  // does (session lookup, then a fresh row lookup) and the shared stub does
  // not.
  test("a session belonging to the deleted user no longer authenticates", async () => {
    const app = deleteApp({
      deleteUser: async ({ userId }) => {
        const index = rows.findIndex((row) => row.userId === userId);
        if (index >= 0) rows.splice(index, 1);
        return true;
      }
    });
    // Sign in twice, so there is a second live session the delete route never
    // sees. The route clears only the cookie it was called with.
    const firstCookie = await signUpAndGetCookie(app);
    await request(app)
      .post("/api/auth/login")
      .send({ email: signupBody().email, password: signupBody().password })
      .expect(200);
    const secondCookie = `sid=${cookieCalls.session[cookieCalls.session.length - 1].token}`;

    await request(app)
      .delete("/api/auth/me")
      .set("Cookie", firstCookie)
      .send({ password: signupBody().password })
      .expect(200);

    // The design spec assumed this degrades to a 401 because getSessionUser
    // returns findUserById(...) and requireAuth rejects a falsy user. That was
    // an inference about Prisma's findUnique, never run. This is the test that
    // settles it -- an orphaned token must not still authenticate.
    await request(app).get("/api/profile").set("Cookie", secondCookie).expect(401);
  });
});

describe("GET /api/auth/me", () => {
  test("returns the signed-in user", async () => {
    const app = buildApp({
      getSessionUser: async () => ({
        id: "u-1",
        email: "person@example.com",
        profile: { firstName: "Jordan" }
      })
    });

    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "u-1",
      email: "person@example.com",
      profile: { firstName: "Jordan" }
    });
  });

  test("answers 401 when there is no session", async () => {
    const response = await request(buildApp()).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Not signed in.");
  });

  // defaultProfile() stamps a fresh updatedAt on every call, so the shape is
  // compared rather than the object.
  test("substitutes a default profile for a user without one", async () => {
    const app = buildApp({
      getSessionUser: async () => ({ id: "u-1", email: "person@example.com" })
    });

    const response = await request(app).get("/api/auth/me");

    const { updatedAt, ...rest } = response.body.user.profile;
    const { updatedAt: _ignored, ...expected } = defaultProfile();
    expect(rest).toEqual(expected);
    expect(Number.isNaN(Date.parse(updatedAt))).toBe(false);
  });

  test("leaks no credential material even if the session carries it", async () => {
    const app = buildApp({
      getSessionUser: async () => ({
        id: "u-1",
        email: "person@example.com",
        hash: "$argon2id$secret",
        salt: "legacy-salt"
      })
    });

    const response = await request(app).get("/api/auth/me");

    expect(JSON.stringify(response.body)).not.toMatch(/argon2id\$secret|legacy-salt/);
  });

  test("answers 500 without detail when the session store fails", async () => {
    const app = buildApp({
      getSessionUser: async () => {
        throw new Error("redis is on fire");
      }
    });

    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/redis is on fire/);
  });
});

describe("profile", () => {
  test("GET returns the profile on the request", async () => {
    const response = await request(buildApp()).get("/api/profile");

    expect(response.status).toBe(200);
    // Compared by shape: defaultProfile() stamps a fresh updatedAt per call.
    const { updatedAt: _ignored, ...expected } = defaultProfile();
    expect(response.body.profile).toMatchObject(expected);
  });

  test("POST merges the change over what was there", async () => {
    rows.push({ userId: "u-1", email: "a@b.com", profile: defaultProfile() });

    const response = await request(buildApp())
      .post("/api/profile")
      .send({ firstName: "Jordan", age: 31 });

    expect(response.status).toBe(200);
    expect(response.body.profile.firstName).toBe("Jordan");
    expect(response.body.profile.age).toBe(31);
  });

  test("POST rejects a value outside the allowed set", async () => {
    const response = await request(buildApp()).post("/api/profile").send({ sex: "Martian" });

    expect(response.status).toBe(400);
  });

  // The row is read back after the write, so a user deleted mid-request is a
  // 404 rather than a crash.
  test("POST answers 404 when the user has gone", async () => {
    const response = await request(buildApp()).post("/api/profile").send({ firstName: "Jordan" });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("User not found.");
  });

  test("POST answers 500 without detail when the write fails", async () => {
    const app = buildApp({
      updateProfile: async () => {
        throw new Error("connection terminated unexpectedly");
      }
    });

    const response = await request(app).post("/api/profile").send({ firstName: "Jordan" });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/connection terminated/);
  });

  test("accepts and returns the training and lifestyle fields", async () => {
    rows.push({ userId: "u-1", email: "a@b.com", profile: defaultProfile() });
    const app = buildApp();
    const response = await request(app)
      .post("/api/profile")
      .send({
        sleep: "7 - 8 hours",
        timeline: "3 months",
        experience: "Intermediate",
        nutrition: "High-protein",
        cardio: "Mixed",
        goal: "Mobility",
        trainingDays: ["Monday", "Wednesday"]
      });

    expect(response.status).toBe(200);
    expect(response.body.profile).toMatchObject({
      sleep: "7 - 8 hours",
      cardio: "Mixed",
      goal: "Mobility",
      trainingDays: ["Monday", "Wednesday"]
    });
  });

  // One per closed-set field. An allowlist that silently omits a real option is
  // the same defect class this whole change exists to close, so each field is
  // asserted separately rather than trusting one representative. trainingDays
  // is included here (rather than only in its own tests below) specifically
  // to prove it now rejects like every sibling closed-set field instead of
  // silently dropping the unrecognised entry.
  test.each([
    ["sleep", "Nine-ish"],
    ["experience", "Wizard-tier"],
    ["nutrition", "Junk only"],
    ["cardio", "Interpretive dance"],
    ["goal", "Become a wizard"],
    ["trainingDays", ["Blursday"]]
  ])("rejects a %s value outside the allowed list", async (field, value) => {
    const response = await request(buildApp())
      .post("/api/profile")
      .send({ [field]: value });

    expect(response.status).toBe(400);
  });

  test("rejects a trainingDays array of more than seven entries", async () => {
    // All seven real day names plus one repeat -- eight entries, none of
    // them invalid, so this isolates the length cap from the enum check
    // above. z.array().max() rejects; it does not truncate the array down
    // to seven and proceed.
    const response = await request(buildApp())
      .post("/api/profile")
      .send({
        trainingDays: [
          "Monday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday"
        ]
      });

    expect(response.status).toBe(400);
  });

  // Regression for a cap-before-filter bug that was fixed twice at this
  // layer. First the schema capped trainingDays at 7 raw strings ahead of
  // buildProfile's day-name filter, so this exact payload returned 200 with
  // trainingDays silently reduced to [] (the trailing "Monday" cut off by
  // the cap before it could be checked). Widening the cap to 64 did not fix
  // it -- it only moved the cliff from position 8 to 65. The real fix
  // replaced the cap with z.array(z.enum(...)).max(7), which validates
  // membership and length directly and has no slice step left to get wrong.
  // This payload -- mixing junk with a valid day, and exceeding the length
  // limit -- must now be rejected outright rather than silently trimmed.
  test("rejects a payload mixing invalid entries with a valid day rather than silently dropping the valid one", async () => {
    const response = await request(buildApp())
      .post("/api/profile")
      .send({ trainingDays: ["x1", "x2", "x3", "x4", "x5", "x6", "x7", "Monday"] });

    expect(response.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  test("drops the session named by the cookie", async () => {
    const app = buildApp();
    await request(app).post("/api/auth/signup").send(signupBody());
    expect(sessions).toHaveLength(1);

    const response = await request(app).post("/api/auth/logout").set("Cookie", "sid=sess-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(deps.deleteSession).toHaveBeenCalledWith("sess-1");
  });

  test("clears both cookies", async () => {
    await request(buildApp()).post("/api/auth/logout").set("Cookie", "sid=sess-1");

    expect(cookieCalls.clearedSession).toBe(1);
    expect(cookieCalls.clearedCsrf).toBe(1);
  });

  // Logging out twice, or without ever signing in, is not an error.
  test("succeeds with no cookie at all", async () => {
    const response = await request(buildApp()).post("/api/auth/logout");

    expect(response.status).toBe(200);
    expect(deps.deleteSession).not.toHaveBeenCalled();
    // The cookies are cleared regardless, so a stale one cannot survive.
    expect(cookieCalls.clearedSession).toBe(1);
  });

  test("still clears cookies when the session store fails", async () => {
    const app = buildApp({
      deleteSession: async () => {
        throw new Error("redis is on fire");
      }
    });

    const response = await request(app).post("/api/auth/logout").set("Cookie", "sid=sess-1");

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/redis is on fire/);
  });
});
