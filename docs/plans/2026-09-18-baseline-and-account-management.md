# Baseline and Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure the real baseline, then give a signed-in user a way to change their password and delete their account — the two things that gate deploying an app holding age, height, weight and body fat.

**Architecture:** Two new routes on the existing `registerAuthRoutes` seam, composed from helpers that already exist and are covered (`verifyPassword`, `hashPassword`, `updatePasswordHash`, `userIdWhere`). Deleting the user row relies on the six `onDelete: Cascade` relations rather than a hand-written cascade. Session invalidation is done with a new `passwordChangedAt` column compared against `session.createdAt`, which needs no user-to-token index and behaves identically for the Redis and in-memory stores. The client gets a new Account tab backed by a new `SettingsAccountPanel` component, leaving the three placeholder tabs untouched.

**Tech Stack:** Express 4, Zod, Prisma, argon2, supertest + Vitest (server); React 18, Vitest + Testing Library (client); Playwright (E2E).

**Design spec:** `docs/specs/2026-09-18-development-roadmap-design.md` — this plan covers Phase 0 and Phase 1 only. Phases 2 through 6 are deliberately not planned yet.

---

## Background the engineer needs

Read all of this before starting. Each item is a real constraint in this repository, not general advice.

**The roadmap spec left one decision open, and this plan takes it.** The spec listed three ways to make a password change affect other sessions and recommended the second. This plan implements it: a `passwordChangedAt` timestamp on `AppUser`, with `getSessionUser` rejecting any session created before it. The other two options — a user-to-token index, or accepting that other sessions survive — are not implemented. If you disagree, stop and raise it rather than improvising a third design mid-task.

**There is a trap in `updatePasswordHash`, and Task 2 exists to avoid it.** That function is already wired, but for silently upgrading a pbkdf2 hash to argon2id **on every successful login** (`authUserService.js:115`). If it starts stamping `passwordChangedAt` unconditionally, then an ordinary login by a legacy-hash user would invalidate every one of their other sessions. So `passwordChangedAt` is an **optional** parameter, written only when the caller passes it, and the login-upgrade path must not pass it. Task 2 pins this with a test; do not delete that test.

**Absent is not zero.** `Number(null)` and `Number("")` are both `0` and both finite, and this class has shipped five bugs in this repository. Guard **before** coercing, never after. It applies here to the `passwordChangedAt` comparison: parse first, check the result is finite, and only then compare. Note the failure direction — an unparseable timestamp means the session _survives_, so a broken guard fails open and silently stops invalidating anything. That is why Task 3 asserts a valid timestamp does invalidate, rather than only asserting that an absent one does not.

**`userIdWhere` and `getUserPk` are load-bearing.** Callers hold either the UUID primary key or the legacy string id depending on when the account and session were created, and both must resolve. Commit `19cc8ac` exists because one path assumed only the legacy id. Every new query in this plan goes through those helpers.

**`verifyPassword` takes the password first.** The signature is `verifyPassword(password, user)`, and `hashPassword(password)` returns `{ salt: "", hash, passwordAlgo: "argon2id" }` — `salt` is intentionally empty for argon2id. `requireAuth` puts the fully mapped user on `req.user`, including `hash`, `salt` and `passwordAlgo`, so no second lookup is needed to verify a password.

**Characterization tests prove nothing on their own.** A test written against existing code passes on its first run whether or not it discriminates. Where a task says to mutation-test, apply the mutation, **confirm the file changed on disk**, and confirm the test fails. An unapplied mutation and an uncaught one both read as "tests passed". Five things have silently prevented a match here: shell escaping, indentation, an apostrophe in the pattern, CRLF line endings, and a heredoc collapsing `\\n`. Write mutation scripts with the Write tool, not a heredoc.

**Accessibility is checked by axe, not the linter.** New UI gets scanned in `e2e/a11y.spec.js`. When the linter and axe disagree about rendered output, axe wins.

**Migrations are raw SQL.** `server/db/postgres/` holds `.sql` files applied in filename order by `postgresMigrations.js` and tracked in `SchemaMigration`. There is one file today, `001_foundation.sql`. Write idempotent SQL in the style it uses (`if not exists`, lowercase).

**Server tests need Postgres.** Run `npm run postgres:local:start -w server` or `docker compose up -d` first, or 96 tests fail with "Can't reach database server". That is environmental, not a regression.

---

## File Structure

**Server — created**

- `server/db/postgres/002_password_changed_at.sql` — adds the nullable column.

**Server — modified**

- `server/prisma/schema.prisma` — `passwordChangedAt` on `AppUser`.
- `server/src/repositories/userReadRepository.js` — carry the column into the mapped user.
- `server/src/repositories/userRepository.js` — optional `passwordChangedAt` on `updatePasswordHash`; new `deleteUser`.
- `server/src/services/authUserService.js` — carry `passwordChangedAt` through `mapDbDocToUser`.
- `server/src/services/sessionService.js` — reject sessions created before `passwordChangedAt`.
- `server/src/services/apiSchemaService.js` — two new body schemas.
- `server/src/routes/authRoutes.js` — two new routes, two new deps.
- `server/src/index.js` — wire the new deps.

**Server — test files modified**

- `server/src/routes/authRoutes.test.js` — the two new routes.
- `server/src/services/sessionService.test.js` — the invalidation rule.
- `server/src/repositories/userReadRepository.test.js` — the new column.

**Client — created**

- `client/src/pages/dashboard/views/SettingsAccountPanel.jsx` — both forms.
- `client/src/pages/dashboard/views/SettingsAccountPanel.test.jsx`
- `client/src/pages/dashboard/views/SettingsAccountPanel.css`

**Client — modified**

- `client/src/app/events.js` — `changePassword` and `deleteAccount` handlers.
- `client/src/App.jsx` — pass both through.
- `client/src/pages/DashboardPage.jsx` — pass both through.
- `client/src/pages/dashboard/views/SettingsView.jsx` — the Account tab.

**E2E — modified**

- `e2e/smoke.spec.js` and `e2e/a11y.spec.js` — delete the created account in the existing `afterAll` hooks.

---

## Phase 0 — Confirm the baseline

### Task 1: Measure what green actually is

No code changes. This exists because every later task's "did I regress anything" depends on it, and because `CLAUDE.md`'s figures are claims from 2026-09-17 that nothing has re-measured.

**Files:**

- Modify: `CLAUDE.md` (only where a measurement contradicts it)

- [ ] **Step 1: Start Postgres**

Run one of these, not both — they both bind 55432:

```bash
npm run postgres:local:start -w server
```

Expected: the helper reports a running instance. If you use `docker compose up -d` instead, also run `npm -w server run migrate:postgres`, because the container starts empty.

- [ ] **Step 2: Run each gate separately and record the exit code**

Do not pipe these into `tail` or `head`. A piped command reports the last stage's exit code, which hides a failure.

```bash
npm run lint > /tmp/lint.txt 2>&1; echo "lint: $?"
npm run format:check > /tmp/format.txt 2>&1; echo "format: $?"
npm run knip > /tmp/knip.txt 2>&1; echo "knip: $?"
npm run build > /tmp/build.txt 2>&1; echo "build: $?"
npm test > /tmp/test.txt 2>&1; echo "test: $?"
```

Expected per `CLAUDE.md`: all five exit 0, lint reports 0 errors and 0 warnings, and build emits no chunk-size warning. **Record what actually happened**, including any deviation.

- [ ] **Step 3: Measure coverage**

```bash
npm run test:coverage > /tmp/coverage.txt 2>&1; echo "coverage: $?"
```

Record the four headline numbers: server statements and branches, client statements and branches. `CLAUDE.md` claims server 93.65% / 85.35% and client 98.33% / 93.21% as of 2026-09-17.

- [ ] **Step 4: Re-rank the client files by uncovered branches**

From the coverage report, list the client source files with the most uncovered branches, worst first. `CLAUDE.md` claims `usePreviewDerivedData.js` (34), `outlineGeometry.js` (28), `templateOutline.js` (22), `SettingsView.jsx` (11), `useDashboardMetrics.js` (11), `useDashboardData.js` (10), measured 2026-09-13.

This ranking has been wrong in this file before — it once named a file as done while it was the largest gap — so treat the list above as a claim to check, not a starting point.

- [ ] **Step 5: Correct `CLAUDE.md` where the measurement disagrees**

Update only the figures that are wrong, and update the "As of" date to today. Do not restructure the file. If everything matches, change only the date.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: re-measure the baseline and correct the recorded figures"
```

If nothing needed correcting, skip the commit and say so — an empty commit is noise.

---

## Phase 1 — Account management

### Task 2: Add `passwordChangedAt` without breaking the login upgrade

**Files:**

- Create: `server/db/postgres/002_password_changed_at.sql`
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/repositories/userReadRepository.js`
- Modify: `server/src/repositories/userRepository.js`
- Modify: `server/src/services/authUserService.js`
- Test: `server/src/repositories/userReadRepository.test.js`

- [ ] **Step 1: Write the failing test**

Add to `server/src/repositories/userReadRepository.test.js`:

```js
describe("passwordChangedAt", () => {
  test("is carried through as an ISO string when set", () => {
    const mapped = mapUserWithCollections({
      id: "00000000-0000-0000-0000-000000000001",
      email: "person@example.com",
      passwordHash: "$argon2id$hash",
      passwordAlgo: "argon2id",
      passwordChangedAt: new Date("2026-09-18T10:00:00.000Z"),
      profile: {},
      goals: {}
    });
    expect(mapped.passwordChangedAt).toBe("2026-09-18T10:00:00.000Z");
  });

  test("is null when the column has never been written", () => {
    const mapped = mapUserWithCollections({
      id: "00000000-0000-0000-0000-000000000001",
      email: "person@example.com",
      passwordHash: "$argon2id$hash",
      passwordAlgo: "argon2id",
      passwordChangedAt: null,
      profile: {},
      goals: {}
    });
    expect(mapped.passwordChangedAt).toBeNull();
  });
});
```

Check the existing file for the exact name it imports for the mapper and the shape of the row fixtures it already builds, and match them. If the mapper is not exported, export it rather than testing through `loadWithCollections`.

- [ ] **Step 2: Run the test and watch it fail**

```bash
npm -w server test -- userReadRepository
```

Expected: FAIL — `passwordChangedAt` is `undefined`, not the ISO string.

- [ ] **Step 3: Write the migration**

Create `server/db/postgres/002_password_changed_at.sql`:

```sql
-- Set only when a user deliberately changes their password. Deliberately NOT
-- set by the pbkdf2 -> argon2id upgrade that runs on login: that upgrade is
-- invisible to the user, and stamping it here would sign them out of every
-- other device every time a legacy-hash account logs in.
alter table app_users add column if not exists password_changed_at timestamptz;
```

- [ ] **Step 4: Add the column to the Prisma schema**

In `server/prisma/schema.prisma`, inside `model AppUser`, below `passwordAlgo`:

```prisma
  passwordChangedAt DateTime? @map("password_changed_at") @db.Timestamptz(6)
```

- [ ] **Step 5: Apply the migration and regenerate the client**

```bash
npm -w server run migrate:postgres
npm -w server run prisma:validate
npm -w server run prisma:generate
```

Expected: the migration applies `002_password_changed_at.sql`, validate passes, generate succeeds.

- [ ] **Step 6: Carry the column through the read mapper**

In `server/src/repositories/userReadRepository.js`, in the object that already sets `passwordAlgo` and `createdAt`, add:

```js
    passwordChangedAt: toIso(row.passwordChangedAt),
```

`toIso` is already imported in that file. Confirm it returns `null` rather than a string for a null input before relying on it; if it does not, use `row.passwordChangedAt ? toIso(row.passwordChangedAt) : null`.

- [ ] **Step 7: Carry it through `mapDbDocToUser`**

In `server/src/services/authUserService.js`, in the object returned by `mapDbDocToUser` (currently ending `profile`, `dashboard`), add:

```js
      passwordChangedAt: source.passwordChangedAt ?? null,
```

- [ ] **Step 8: Run the test and watch it pass**

```bash
npm -w server test -- userReadRepository
```

Expected: PASS.

- [ ] **Step 9: Write the failing test for the upgrade-path guard**

Add to `server/src/routes/authRoutes.test.js`, inside the login describe block:

```js
test("a pbkdf2 -> argon2id upgrade on login does not stamp passwordChangedAt", async () => {
  const updates = [];
  const app = buildApp({
    updatePasswordHash: async (args) => {
      updates.push(args);
      return true;
    }
  });

  await request(app).post("/api/auth/signup").send(signupBody()).expect(200);
  const row = rows[0];
  row.passwordAlgo = "pbkdf2";

  await request(app)
    .post("/api/auth/login")
    .send({ email: signupBody().email, password: signupBody().password });

  // The upgrade may or may not fire depending on how the fixture hashes, but
  // if it does it must never carry a passwordChangedAt. Signing a user out of
  // their other devices is a consequence of *them* changing a password, never
  // of a silent rehash they did not ask for.
  updates.forEach((args) => {
    expect(args.passwordChangedAt).toBeUndefined();
  });
});
```

Check `authRoutes.test.js` for how it already drives a pbkdf2 login before writing this — if there is an existing helper that seeds a pbkdf2 user, use it rather than mutating `row.passwordAlgo` by hand.

- [ ] **Step 10: Make `updatePasswordHash` take the timestamp only when given one**

In `server/src/repositories/userRepository.js`, replace `updatePasswordHash` with:

```js
/**
 * Used by the pbkdf2 -> argon2id upgrade on successful login, and by the
 * user-initiated password change.
 *
 * `passwordChangedAt` is optional and written only when supplied. The upgrade
 * path must NOT supply it: that rehash is invisible to the user, and stamping
 * it would invalidate every other session belonging to any legacy-hash
 * account, on an ordinary login they did not initiate.
 */
const updatePasswordHash = async ({ userId, salt, hash, passwordAlgo, passwordChangedAt }) => {
  const data = {
    passwordSalt: salt || "",
    passwordHash: hash,
    passwordAlgo: passwordAlgo || "argon2id"
  };
  if (passwordChangedAt) data.passwordChangedAt = passwordChangedAt;
  const { count } = await prisma.appUser.updateMany({
    where: userIdWhere(userId),
    data
  });
  return count > 0;
};
```

- [ ] **Step 11: Run the server suite**

```bash
npm -w server test
```

Expected: PASS, including both new tests.

- [ ] **Step 12: Commit**

```bash
git add server/db/postgres/002_password_changed_at.sql server/prisma/schema.prisma server/src/repositories/userReadRepository.js server/src/repositories/userRepository.js server/src/services/authUserService.js server/src/repositories/userReadRepository.test.js server/src/routes/authRoutes.test.js
git commit -m "feat(server): add passwordChangedAt, unset by the login rehash"
```

---

### Task 3: Reject sessions created before the password changed

**Files:**

- Modify: `server/src/services/sessionService.js`
- Test: `server/src/services/sessionService.test.js`

- [ ] **Step 1: Write the failing test**

Add to `server/src/services/sessionService.test.js`:

```js
describe("passwordChangedAt invalidation", () => {
  test("a session created before the password changed is rejected and deleted", async () => {
    const service = buildService({
      findUserById: async () => ({
        id: "user-1",
        email: "person@example.com",
        passwordChangedAt: new Date(Date.now() + 5_000).toISOString()
      })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = { headers: { cookie: `sid=${token}` } };

    expect(await service.getSessionUser(req)).toBeNull();
    // Rejecting is not enough -- the dead token must not linger in the store.
    expect(await service.getSessionByToken(token)).toBeNull();
  });

  test("a session created after the password changed survives", async () => {
    const service = buildService({
      findUserById: async () => ({
        id: "user-1",
        email: "person@example.com",
        passwordChangedAt: new Date(Date.now() - 5_000).toISOString()
      })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = { headers: { cookie: `sid=${token}` } };

    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });

  test("a user who has never changed their password keeps their session", async () => {
    const service = buildService({
      findUserById: async () => ({
        id: "user-1",
        email: "person@example.com",
        passwordChangedAt: null
      })
    });
    await service.initSessionStore({});
    const token = await service.createSession("user-1");
    const req = { headers: { cookie: `sid=${token}` } };

    expect(await service.getSessionUser(req)).toMatchObject({ id: "user-1" });
  });
});
```

`buildService(overrides)` is the existing helper at the top of `sessionService.test.js` — it calls `createSessionService` with `cleanText`, `toShortText`, a stub logger, `findUserById: async () => null`, a 60-second `sessionTtlMs` and the csrf settings, spreading your overrides last. Do not build a second one. The `initSessionStore({})` call matters: without it there is no store and `createSession` has nowhere to write, which is why the existing tests at lines 79 and 94 call it the same way.

- [ ] **Step 2: Run the tests and watch the right one fail**

```bash
npm -w server test -- sessionService
```

Expected: the first test FAILS (the user is returned), the second and third PASS. If all three pass, your fixture is not reaching `getSessionUser` — fix that before continuing, or you will implement against a test that cannot see the change.

- [ ] **Step 3: Implement the check**

In `server/src/services/sessionService.js`, replace the body of `getSessionUser`:

```js
const getSessionUser = async (req) => {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.sid;
  const session = await getSessionByToken(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > sessionTtlMs) {
    await deleteSession(token);
    return null;
  }
  const user = await findUserById(session.userId);
  if (!user) return null;

  // Guard before comparing, not after. Date.parse of an absent value is NaN,
  // and every comparison against NaN is false -- so an unparseable timestamp
  // fails OPEN and silently stops invalidating anything. The finite check
  // makes that explicit rather than incidental, and the "created before"
  // test above is what proves the rule still bites.
  const changedAtMs = Date.parse(user.passwordChangedAt ?? "");
  if (Number.isFinite(changedAtMs) && session.createdAt < changedAtMs) {
    await deleteSession(token);
    return null;
  }
  return user;
};
```

The comparison is strict `<` deliberately: the replacement session minted by the password-change route can land in the same millisecond as the timestamp it is reacting to, and must survive.

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npm -w server test -- sessionService
```

Expected: all three PASS.

- [ ] **Step 5: Run the whole server suite**

```bash
npm -w server test
```

Expected: PASS. `getSessionUser` is on every authenticated path, so a break here surfaces widely.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/sessionService.js server/src/services/sessionService.test.js
git commit -m "feat(server): reject sessions older than the last password change"
```

---

### Task 4: Add `deleteUser` to the user repository

**Files:**

- Modify: `server/src/repositories/userRepository.js`

- [ ] **Step 1: Add the function**

In `server/src/repositories/userRepository.js`, above the `return` statement:

```js
/**
 * Removes the account row. The six AppUser relations all carry
 * onDelete: Cascade, so workout sessions, meal logs, progress metrics,
 * calorie entries, generated plans and saved exercises go with it -- there is
 * deliberately no hand-written cascade here to drift out of step with the
 * schema.
 *
 * Goes through userIdWhere because a caller may hold either the UUID primary
 * key or the legacy string id.
 */
const deleteUser = async ({ userId }) => {
  const { count } = await prisma.appUser.deleteMany({ where: userIdWhere(userId) });
  return count > 0;
};
```

- [ ] **Step 2: Export it**

Change the final return of `createUserRepository` to:

```js
return { updateProfile, updateGoals, updatePasswordHash, saveCalorieEntry, deleteUser };
```

- [ ] **Step 3: Verify the cascade claim against the schema rather than trusting this plan**

```bash
grep -c "onDelete: Cascade" server/prisma/schema.prisma
```

Expected: `6`. If it is not 6, stop — a relation has been added without a cascade and deleting a user would fail on a foreign key instead of removing their data.

- [ ] **Step 4: Run the server suite**

```bash
npm -w server test
```

Expected: PASS, unchanged. Nothing calls `deleteUser` yet.

- [ ] **Step 5: Commit**

```bash
git add server/src/repositories/userRepository.js
git commit -m "feat(server): add deleteUser, leaning on the schema cascades"
```

---

### Task 5: `POST /api/auth/password`

**Files:**

- Modify: `server/src/services/apiSchemaService.js`
- Modify: `server/src/routes/authRoutes.js`
- Test: `server/src/routes/authRoutes.test.js`

- [ ] **Step 1: Write the failing test**

Add to `server/src/routes/authRoutes.test.js`:

```js
describe("POST /api/auth/password", () => {
  const signUpAndGetCookie = async (app) => {
    const res = await request(app).post("/api/auth/signup").send(signupBody()).expect(200);
    return res.headers["set-cookie"];
  };

  test("changes the password and lets the new one log in", async () => {
    const app = buildApp();
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
    const app = buildApp();
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
    const app = buildApp();
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

  test("stamps passwordChangedAt so other sessions can be invalidated", async () => {
    const updates = [];
    const app = buildApp({
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
    expect(updates[0].passwordChangedAt).toBeInstanceOf(Date);
  });

  test("issues a replacement session so this device stays signed in", async () => {
    const app = buildApp();
    const cookie = await signUpAndGetCookie(app);
    const before = Object.keys(sessions).length;

    const res = await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "BrandNewPass456!" })
      .expect(200);

    expect(res.headers["set-cookie"]).toBeDefined();
    expect(Object.keys(sessions).length).toBe(before);
  });

  test("requires a signed-in user", async () => {
    const app = buildApp();
    await request(app)
      .post("/api/auth/password")
      .send({ currentPassword: "whatever", newPassword: "BrandNewPass456!" })
      .expect(401);
  });

  test("rejects a new password shorter than eight characters", async () => {
    const app = buildApp();
    const cookie = await signUpAndGetCookie(app);

    await request(app)
      .post("/api/auth/password")
      .set("Cookie", cookie)
      .send({ currentPassword: signupBody().password, newPassword: "short" })
      .expect(400);
  });
});
```

`sessions` is the existing fixture in that file — check its actual shape (object or Map) and adjust the two length assertions to match. If it is a Map, use `sessions.size`.

- [ ] **Step 2: Run the tests and watch them fail**

```bash
npm -w server test -- authRoutes
```

Expected: every new test FAILS with 404, because the route does not exist.

- [ ] **Step 3: Add the schema**

In `server/src/services/apiSchemaService.js`, below `loginBodySchema`:

```js
export const passwordChangeBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(8).max(256)
  })
  .passthrough();
```

The asymmetry is deliberate and matches the existing schemas: `signupBodySchema` requires 8 for a password being set, `loginBodySchema` requires 1 for one being checked. A current password is being checked.

- [ ] **Step 4: Add the route**

In `server/src/routes/authRoutes.js`, add `passwordChangeBodySchema` and `updatePasswordHash` to the `deps` destructuring at the top, then add this route above the logout handler:

```js
app.post("/api/auth/password", requireAuth, async (req, res) => {
  try {
    const body = validateBody(req, res, passwordChangeBodySchema);
    if (!body) return;

    const { currentPassword, newPassword } = body;
    // requireAuth has already put the mapped user on req.user, hash and all,
    // so there is no second lookup to do here.
    const correct = await verifyPassword(currentPassword, req.user);
    if (!correct) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const { salt, hash, passwordAlgo } = await hashPassword(newPassword);
    await updatePasswordHash({
      userId: req.user.id,
      salt,
      hash,
      passwordAlgo,
      passwordChangedAt: new Date()
    });

    // Every other session is now older than passwordChangedAt and will be
    // rejected by getSessionUser. This device would be too, so it gets a
    // fresh token -- minted after the stamp, and compared with a strict `<`,
    // so it survives even in the same millisecond.
    const previousToken = parseCookies(req.headers.cookie || "").sid;
    if (previousToken) await deleteSession(previousToken);
    const token = await createSession(req.user.id);
    // rememberMe is not recoverable from the old session, which stores only
    // userId and createdAt. Defaulting to true matches signup and login.
    setSessionCookie(res, token, true);

    res.json({ ok: true });
  } catch (err) {
    sendErrorResponse(req, res, err, 500);
  }
});
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npm -w server test -- authRoutes
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/apiSchemaService.js server/src/routes/authRoutes.js server/src/routes/authRoutes.test.js
git commit -m "feat(server): add POST /api/auth/password"
```

---

### Task 6: `DELETE /api/auth/me`

**Files:**

- Modify: `server/src/services/apiSchemaService.js`
- Modify: `server/src/routes/authRoutes.js`
- Test: `server/src/routes/authRoutes.test.js`

- [ ] **Step 1: Write the failing test**

Add to `server/src/routes/authRoutes.test.js`:

```js
describe("DELETE /api/auth/me", () => {
  const signUpAndGetCookie = async (app) => {
    const res = await request(app).post("/api/auth/signup").send(signupBody()).expect(200);
    return res.headers["set-cookie"];
  };

  test("deletes the account and the old credentials stop working", async () => {
    const deleted = [];
    const app = buildApp({
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
    const app = buildApp({
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

  test("requires a signed-in user", async () => {
    const app = buildApp();
    await request(app).delete("/api/auth/me").send({ password: "whatever" }).expect(401);
  });

  test("a session belonging to the deleted user no longer authenticates", async () => {
    const app = buildApp({
      deleteUser: async ({ userId }) => {
        const index = rows.findIndex((row) => row.userId === userId);
        if (index >= 0) rows.splice(index, 1);
        return true;
      }
    });
    // Sign in twice, so there is a second live session the delete route never
    // sees. The route clears only the cookie it was called with.
    const firstCookie = await signUpAndGetCookie(app);
    const second = await request(app)
      .post("/api/auth/login")
      .send({ email: signupBody().email, password: signupBody().password })
      .expect(200);
    const secondCookie = second.headers["set-cookie"];

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

  test("clears the session and csrf cookies", async () => {
    const app = buildApp({ deleteUser: async () => true });
    const cookie = await signUpAndGetCookie(app);
    cookieCalls.length = 0;

    await request(app)
      .delete("/api/auth/me")
      .set("Cookie", cookie)
      .send({ password: signupBody().password })
      .expect(200);

    expect(cookieCalls).toContain("clearSessionCookie");
    expect(cookieCalls).toContain("clearCsrfCookie");
  });
});
```

`cookieCalls` is the existing fixture in that file — check what it actually records (it may store objects rather than names) and adjust the last two assertions to match its real shape.

- [ ] **Step 2: Run the tests and watch them fail**

```bash
npm -w server test -- authRoutes
```

Expected: every new test FAILS with 404.

- [ ] **Step 3: Add the schema**

In `server/src/services/apiSchemaService.js`, below `passwordChangeBodySchema`:

```js
export const accountDeleteBodySchema = z
  .object({
    password: z.string().min(1).max(256)
  })
  .passthrough();
```

- [ ] **Step 4: Add the route**

In `server/src/routes/authRoutes.js`, add `accountDeleteBodySchema` and `deleteUser` to the `deps` destructuring, then add below the password route:

```js
app.delete("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const body = validateBody(req, res, accountDeleteBodySchema);
    if (!body) return;

    const correct = await verifyPassword(body.password, req.user);
    if (!correct) {
      return res.status(401).json({ error: "Password is incorrect." });
    }

    // The six AppUser relations cascade, so this removes the workout
    // sessions, meal logs, progress metrics, calorie entries, generated plans
    // and saved exercises with it.
    await deleteUser({ userId: req.user.id });

    const token = parseCookies(req.headers.cookie || "").sid;
    if (token) await deleteSession(token);
    clearSessionCookie(res);
    clearCsrfCookie(res);

    res.json({ ok: true });
  } catch (err) {
    sendErrorResponse(req, res, err, 500);
  }
});
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npm -w server test -- authRoutes
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/apiSchemaService.js server/src/routes/authRoutes.js server/src/routes/authRoutes.test.js
git commit -m "feat(server): add DELETE /api/auth/me"
```

---

### Task 7: Wire the new dependencies into the app

The route tests pass deps directly through `buildApp`, so both routes are green while the real app still cannot serve them. This task closes that gap.

**Files:**

- Modify: `server/src/index.js`

- [ ] **Step 1: Import the two new schemas**

In `server/src/index.js`, add to the existing import from `./services/apiSchemaService.js`:

```js
  accountDeleteBodySchema,
  passwordChangeBodySchema,
```

- [ ] **Step 2: Destructure `deleteUser` from the user repository**

Find the line that reads:

```js
const { updateProfile, updateGoals, updatePasswordHash, saveCalorieEntry } = createUserRepository({
```

and change it to:

```js
const { updateProfile, updateGoals, updatePasswordHash, saveCalorieEntry, deleteUser } =
  createUserRepository({
```

- [ ] **Step 3: Add all four to the `registerApiRoutes` deps object**

In the object passed to `registerApiRoutes(app, { ... })`, add:

```js
  passwordChangeBodySchema,
  accountDeleteBodySchema,
  deleteUser,
```

`updatePasswordHash` is already in that object — confirm it rather than adding a duplicate key, which would be silently shadowed.

- [ ] **Step 4: Verify each new dep actually arrives**

```bash
grep -n "passwordChangeBodySchema\|accountDeleteBodySchema\|deleteUser\|updatePasswordHash" server/src/index.js
```

Expected: `passwordChangeBodySchema` and `accountDeleteBodySchema` appear twice each (import and deps), `deleteUser` twice (destructure and deps), `updatePasswordHash` twice (destructure and deps) — and no key appears twice inside the deps object itself.

- [ ] **Step 5: Boot the server and hit the route**

```bash
npm run dev:server
```

In another shell:

```bash
curl -i -X POST http://localhost:5000/api/auth/password -H "Content-Type: application/json" -d '{}'
```

Expected: **401**, not 404. A 404 means the wiring did not take; a 403 means CSRF rejected it first, which is also proof the route exists.

- [ ] **Step 6: Run the full server suite and lint**

```bash
npm -w server test
npm run lint
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/index.js
git commit -m "feat(server): wire the account management routes"
```

---

### Task 8: Client handlers

**Files:**

- Modify: `client/src/app/events.js`
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/DashboardPage.jsx`
- Test: `client/src/app/events.handlers.test.js`

- [ ] **Step 1: Write the failing test**

Add to `client/src/app/events.handlers.test.js`:

```js
describe("changePassword", () => {
  test("posts the two passwords and reports success", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ ok: true }))
    });

    const result = await handlers.changePassword({
      currentPassword: "old-pass",
      newPassword: "new-pass-123"
    });

    expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass-123" })
    });
    expect(result).toEqual({ ok: true });
  });

  test("surfaces the server's message on failure", async () => {
    const { handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ error: "Current password is incorrect." }, false))
    });

    const result = await handlers.changePassword({
      currentPassword: "wrong",
      newPassword: "new-pass-123"
    });

    expect(result).toEqual({ ok: false, error: "Current password is incorrect." });
  });
});

describe("deleteAccount", () => {
  test("deletes, then clears local state and returns home", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ ok: true })),
      go: vi.fn(),
      setUser: vi.fn(),
      clearOptimisticOperations: vi.fn(),
      clearDashboardDataState: vi.fn(),
      clearDashboardToast: vi.fn(),
      resetPersonalFlow: vi.fn()
    });

    const result = await handlers.deleteAccount("old-pass");

    expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "old-pass" })
    });
    expect(deps.setUser).toHaveBeenCalledWith(null);
    expect(deps.go).toHaveBeenCalledWith("/");
    expect(result).toEqual({ ok: true });
  });

  test("a rejected password leaves the user signed in", async () => {
    const { deps, handlers } = buildDeps({
      apiFetch: vi.fn(async () => jsonResponse({ error: "Password is incorrect." }, false)),
      go: vi.fn(),
      setUser: vi.fn(),
      clearOptimisticOperations: vi.fn(),
      clearDashboardDataState: vi.fn(),
      clearDashboardToast: vi.fn(),
      resetPersonalFlow: vi.fn()
    });

    const result = await handlers.deleteAccount("wrong");

    // This is the assertion that separates deleteAccount from onLogout. Logging
    // out clears local state even when the request fails, deliberately. Deleting
    // must not: a rejected password means the account is still there, and
    // signing the user out anyway would look exactly like it had worked.
    expect(deps.setUser).not.toHaveBeenCalled();
    expect(deps.go).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: "Password is incorrect." });
  });
});
```

`buildDeps(overrides)` and `jsonResponse(body, ok)` are the existing helpers at the top of `events.handlers.test.js`. `buildDeps` returns `{ deps, handlers }` — assert against `deps.apiFetch`, not a local variable, because `createAppEventHandlers` closes over the object it was given. `jsonResponse` defaults `ok` to `true`, so pass `false` explicitly for the failure cases.

- [ ] **Step 2: Run the tests and watch them fail**

```bash
npm -w client test -- events.handlers
```

Expected: FAIL — `handlers.changePassword is not a function`.

- [ ] **Step 3: Add both handlers**

In `client/src/app/events.js`, next to `submitProfile`:

```js
const changePassword = async ({ currentPassword, newPassword }) => {
  try {
    const res = await apiFetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || "Unable to change password.");
    }
    showDashboardToast("Password changed.");
    return { ok: true };
  } catch (err) {
    const message = err.message || "Unable to change password.";
    showDashboardToast(message, "error");
    return { ok: false, error: message };
  }
};

const deleteAccount = async (password) => {
  try {
    const res = await apiFetch("/api/auth/me", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || "Unable to delete account.");
    }
  } catch (err) {
    const message = err.message || "Unable to delete account.";
    showDashboardToast(message, "error");
    return { ok: false, error: message };
  }
  // Only past the request. Unlike onLogout, this must NOT clear local state
  // when the call fails: a rejected password means the account is still
  // there, and signing the user out anyway would look like it worked.
  setUser(null);
  clearOptimisticOperations();
  clearDashboardDataState();
  clearDashboardToast();
  resetPersonalFlow();
  go("/");
  return { ok: true };
};
```

- [ ] **Step 4: Export both**

Add `changePassword` and `deleteAccount` to the object `events.js` already returns, beside `submitProfile`.

- [ ] **Step 5: Thread them to SettingsView**

In `client/src/App.jsx`, destructure both from the handlers beside `submitProfile`, and pass them to `DashboardPage`:

```jsx
onChangePassword = { changePassword };
onDeleteAccount = { deleteAccount };
```

In `client/src/pages/DashboardPage.jsx`, add `onChangePassword` and `onDeleteAccount` to the props list and pass them down:

```jsx
<SettingsView
  user={user}
  onSaveProfile={onSaveProfile}
  onChangePassword={onChangePassword}
  onDeleteAccount={onDeleteAccount}
/>
```

- [ ] **Step 6: Run the tests and watch them pass**

```bash
npm -w client test -- events.handlers
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/app/events.js client/src/App.jsx client/src/pages/DashboardPage.jsx client/src/app/events.handlers.test.js
git commit -m "feat(client): add changePassword and deleteAccount handlers"
```

---

### Task 9: The Account tab

A new component rather than more of `SettingsView`, because credentials and deletion are a second, unrelated reason for that file to change — which is the repository's stated trigger for a split. The three placeholder tabs are not touched.

**Files:**

- Create: `client/src/pages/dashboard/views/SettingsAccountPanel.jsx`
- Create: `client/src/pages/dashboard/views/SettingsAccountPanel.css`
- Create: `client/src/pages/dashboard/views/SettingsAccountPanel.test.jsx`
- Modify: `client/src/pages/dashboard/views/SettingsView.jsx`

- [ ] **Step 1: Write the failing test**

Create `client/src/pages/dashboard/views/SettingsAccountPanel.test.jsx`:

```jsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import SettingsAccountPanel from "./SettingsAccountPanel";

const setup = (overrides = {}) => {
  const props = {
    onChangePassword: vi.fn().mockResolvedValue({ ok: true }),
    onDeleteAccount: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides
  };
  render(<SettingsAccountPanel {...props} />);
  return props;
};

describe("password change", () => {
  test("sends both fields", async () => {
    const { onChangePassword } = setup();
    await userEvent.type(screen.getByLabelText(/current password/i), "old-pass");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-pass-123");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() =>
      expect(onChangePassword).toHaveBeenCalledWith({
        currentPassword: "old-pass",
        newPassword: "new-pass-123"
      })
    );
  });

  test("shows the error and keeps the form open when it fails", async () => {
    const { onChangePassword } = setup({
      onChangePassword: vi
        .fn()
        .mockResolvedValue({ ok: false, error: "Current password is incorrect." })
    });
    await userEvent.type(screen.getByLabelText(/current password/i), "wrong");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-pass-123");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByText("Current password is incorrect.")).toBeInTheDocument();
    expect(onChangePassword).toHaveBeenCalled();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  test("clears both fields on success, so a password is not left on screen", async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/current password/i), "old-pass");
    await userEvent.type(screen.getByLabelText(/^new password/i), "new-pass-123");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => expect(screen.getByLabelText(/current password/i)).toHaveValue(""));
    expect(screen.getByLabelText(/^new password/i)).toHaveValue("");
  });
});

describe("account deletion", () => {
  test("does not delete until the confirmation step is reached", async () => {
    const { onDeleteAccount } = setup();
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    expect(onDeleteAccount).not.toHaveBeenCalled();
  });

  test("deletes once the password is given and confirmed", async () => {
    const { onDeleteAccount } = setup();
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await userEvent.type(screen.getByLabelText(/confirm with your password/i), "old-pass");
    await userEvent.click(screen.getByRole("button", { name: /permanently delete/i }));

    await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledWith("old-pass"));
  });

  test("cancelling backs out without deleting", async () => {
    const { onDeleteAccount } = setup();
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onDeleteAccount).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/confirm with your password/i)).not.toBeInTheDocument();
  });

  test("shows the error when the password is rejected", async () => {
    setup({
      onDeleteAccount: vi.fn().mockResolvedValue({ ok: false, error: "Password is incorrect." })
    });
    await userEvent.click(screen.getByRole("button", { name: /delete account/i }));
    await userEvent.type(screen.getByLabelText(/confirm with your password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /permanently delete/i }));

    expect(await screen.findByText("Password is incorrect.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
npm -w client test -- SettingsAccountPanel
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the component**

Create `client/src/pages/dashboard/views/SettingsAccountPanel.jsx`:

```jsx
import { useState } from "react";
import "./SettingsAccountPanel.css";

export default function SettingsAccountPanel({ onChangePassword, onDeleteAccount }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changing, setChanging] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const submitPassword = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setChanging(true);
    const result = await onChangePassword({ currentPassword, newPassword });
    setChanging(false);
    if (result?.ok) {
      // Never leave a password sitting in a field after a successful change.
      setCurrentPassword("");
      setNewPassword("");
      return;
    }
    setPasswordError(result?.error || "Unable to change password.");
  };

  const submitDelete = async (event) => {
    event.preventDefault();
    setDeleteError("");
    setDeleting(true);
    const result = await onDeleteAccount(deletePassword);
    setDeleting(false);
    // On success the handler navigates away, so there is nothing to reset.
    if (!result?.ok) setDeleteError(result?.error || "Unable to delete account.");
  };

  const cancelDelete = () => {
    setConfirmingDelete(false);
    setDeletePassword("");
    setDeleteError("");
  };

  return (
    <div className="settings-account-panel">
      <form className="account-form" onSubmit={submitPassword}>
        <h4>Change password</h4>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>
        {passwordError && (
          <p className="account-error" role="alert">
            {passwordError}
          </p>
        )}
        <button type="submit" disabled={changing}>
          {changing ? "Changing..." : "Change password"}
        </button>
      </form>

      <form className="account-form account-danger" onSubmit={submitDelete}>
        <h4>Delete account</h4>
        <p className="muted">
          This removes your account and every workout, meal, metric and plan saved against it. It
          cannot be undone.
        </p>
        {confirmingDelete ? (
          <>
            <label>
              Confirm with your password
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                required
              />
            </label>
            {deleteError && (
              <p className="account-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="account-actions">
              <button type="submit" disabled={deleting}>
                {deleting ? "Deleting..." : "Permanently delete"}
              </button>
              <button type="button" onClick={cancelDelete}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)}>
            Delete account
          </button>
        )}
      </form>
    </div>
  );
}
```

Note the label shape: the input is nested inside the `<label>`, which is what every form in this app does and what axe accepts. Do not add `htmlFor`/`id` pairs to satisfy the linter — `CLAUDE.md` records that `label-has-for` produced 128 false positives on exactly this pattern and is off for that reason.

- [ ] **Step 4: Write the stylesheet**

Create `client/src/pages/dashboard/views/SettingsAccountPanel.css`:

```css
.settings-account-panel {
  display: grid;
  gap: 1.5rem;
  margin-top: 1rem;
}

.account-form {
  display: grid;
  gap: 0.75rem;
}

.account-form h4 {
  margin: 0;
}

.account-actions {
  display: flex;
  gap: 0.5rem;
}

.account-error {
  margin: 0;
  color: #b3261e;
}
```

Check `SettingsView.css` for the colour token the rest of the dashboard uses for errors and use that instead of the literal above if one exists.

- [ ] **Step 5: Run the tests and watch them pass**

```bash
npm -w client test -- SettingsAccountPanel
```

Expected: PASS.

- [ ] **Step 6: Add the Account tab to SettingsView**

In `client/src/pages/dashboard/views/SettingsView.jsx`, import the panel:

```jsx
import SettingsAccountPanel from "./SettingsAccountPanel";
```

Accept the two new props:

```jsx
export default function SettingsView({ user, onSaveProfile, onChangePassword, onDeleteAccount }) {
```

Add a tab to the `tabs` array, after `profile` and before `connected-apps`:

```jsx
      {
        id: "account",
        label: "Account",
        description: "Sign-in credentials and account removal.",
        rows: [
          { label: "Email", value: user?.email },
          { label: "Password", value: "Set" }
        ]
      },
```

Then render the panel beneath the rows, for that tab only. Replace the final `else` arm of the existing ternary:

```jsx
          ) : (
            <>
              <div className="settings-list">
                {activeTabData.rows.map((row) => (
                  <div className="settings-list-row" key={`${activeTabData.id}-${row.label}`}>
                    <span className="muted">{row.label}</span>
                    <strong className="settings-value">{displayValue(row.value)}</strong>
                  </div>
                ))}
              </div>
              {activeTabData.id === "account" && (
                <SettingsAccountPanel
                  onChangePassword={onChangePassword}
                  onDeleteAccount={onDeleteAccount}
                />
              )}
            </>
          )}
```

The tab carries real rows rather than an empty array, deliberately. An unused `rows: []` would be dead data, and `CLAUDE.md` records that dead data in this codebase attracted a test asserting on something nothing rendered.

`EDITABLE_TABS` is not changed, so `canEdit` stays false for this tab and no Edit button appears.

- [ ] **Step 7: Verify the tabs memo still lists its real dependencies**

The `tabs` useMemo already depends on `user?.email`. Confirm lint is clean rather than assuming:

```bash
npm run lint
```

Expected: 0 errors, 0 warnings. A new `react-hooks/exhaustive-deps` warning means you introduced it — `CLAUDE.md` states the tree is at zero.

- [ ] **Step 8: Run the client suite**

```bash
npm -w client test
```

Expected: PASS. `SettingsView.test.jsx` may assert on the number of tabs; update it to expect the new one if so.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/dashboard/views/SettingsAccountPanel.jsx client/src/pages/dashboard/views/SettingsAccountPanel.css client/src/pages/dashboard/views/SettingsAccountPanel.test.jsx client/src/pages/dashboard/views/SettingsView.jsx client/src/pages/dashboard/views/SettingsView.test.jsx
git commit -m "feat(client): add the account tab with password change and deletion"
```

---

### Task 10: E2E coverage and teardown

This is what stops each run leaking an account, and it is also the only test in the repository that runs both halves together.

**Files:**

- Modify: `e2e/smoke.spec.js`
- Modify: `e2e/a11y.spec.js`

- [ ] **Step 1: Read how the suite runs before changing it**

The E2E suite runs against the built bundle via `vite preview` on 4173, so `npm -w client run build` must happen first. Do **not** set `NODE_ENV=test` for the server it starts — `index.js` guards `startServer()` with `NODE_ENV !== "test" && !VITEST`, so the process would load, export and exit 0 with no output, which reads exactly like a crash.

```bash
npm -w client run build
npm run test:e2e
```

Expected: PASS, as the baseline before your changes.

- [ ] **Step 2: Add the account-deletion journey to the smoke suite**

Add to `e2e/smoke.spec.js`, inside the existing `test.describe.serial` block, after the reload test:

```js
test("the account can be deleted and the credentials stop working", async () => {
  await page.getByRole("button", { name: /settings/i }).click();
  await page.getByRole("tab", { name: /account/i }).click();
  await page.getByRole("button", { name: /delete account/i }).click();
  await page.getByLabel(/confirm with your password/i).fill(account.password);
  await page.getByRole("button", { name: /permanently delete/i }).click();

  // Deleting signs the user out and returns them home.
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();

  // The credentials must now be rejected -- this is the assertion that proves
  // the row is really gone rather than merely hidden.
  await page.getByRole("button", { name: /log in/i }).click();
  await page.getByLabel(/email/i).fill(account.email);
  await page.getByLabel(/password/i).fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/incorrect|not found|invalid/i)).toBeVisible();
});
```

The selectors above are written from the component in Task 9 and the existing spec's conventions. Run the test and fix any that do not match what the built page actually renders — do not assume.

- [ ] **Step 3: Scan the new UI with axe**

Add to `e2e/a11y.spec.js`, following the shape of the existing "settings profile edit form" test:

```js
test("the account panel has no violations", async () => {
  await page.getByRole("button", { name: /settings/i }).click();
  await page.getByRole("tab", { name: /account/i }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the delete confirmation has no violations", async () => {
  await page.getByRole("button", { name: /settings/i }).click();
  await page.getByRole("tab", { name: /account/i }).click();
  await page.getByRole("button", { name: /delete account/i }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

Match the file's existing `AxeBuilder` construction, including any `.include()` or rule configuration it already applies.

- [ ] **Step 4: Make the a11y suite clean up its account**

In `e2e/a11y.spec.js`, the `test.afterAll` hook already exists. Add a deletion there so the run stops leaking an account. Read what that hook currently does first and add to it rather than replacing it.

Because the smoke suite's last test now deletes its own account as the thing under test, its `afterAll` needs no deletion — but it must not fail if the account is already gone. Make any cleanup you add tolerant of a missing account.

- [ ] **Step 5: Run the E2E suite**

```bash
npm -w client run build
npm run test:e2e
```

Expected: PASS, all tests.

- [ ] **Step 6: Confirm no account was left behind**

```bash
psql "$DATABASE_URL" -c "select count(*) from app_users where email like 'e2e-%@example.test';"
```

Expected: the count is unchanged from before the run. If it grew, the teardown did not fire.

- [ ] **Step 7: Commit**

```bash
git add e2e/smoke.spec.js e2e/a11y.spec.js
git commit -m "test(e2e): cover account deletion and stop leaking accounts"
```

---

### Task 11: Prove the tests discriminate, then raise the ratchet

Everything above was written test-first, so the tests are known to fail before the code exists. This task checks the ones that are easy to write toothlessly, and closes out the coverage ratchet.

**Files:**

- Modify: `client/vite.config.js` (the coverage thresholds only)

- [ ] **Step 1: Write the mutation script**

Use the Write tool, not a heredoc — `CLAUDE.md` records that three of the five things which have silently prevented a mutation matching here are the shell. Put the script in your scratchpad directory, **not** in the repository: `CLAUDE.md` forbids saving working files to the root, and a mutation script is not something to commit. Use `String.raw` for any pattern containing a backslash.

Apply these six mutations one at a time, reverting each before the next:

1. `server/src/services/sessionService.js` — change `session.createdAt < changedAtMs` to `session.createdAt <= changedAtMs`. **Expected to survive**: the two values differ by seconds in every test, so this is an equivalent mutant under the current fixtures. Recording it as expected is the point; an unexpected survivor is what you are hunting.
2. `server/src/services/sessionService.js` — delete the `Number.isFinite(changedAtMs) &&` guard. Expected **caught** by the "never changed their password" test, because `Date.parse("")` is NaN and every comparison with NaN is false... verify which way this actually lands and record it. If it survives, that test is not discriminating and needs a real timestamp case.
3. `server/src/repositories/userRepository.js` — change `if (passwordChangedAt)` to `data.passwordChangedAt = passwordChangedAt ?? new Date();`. Expected **caught** by the login-upgrade test in Task 2.
4. `server/src/routes/authRoutes.js` — make the password route skip `verifyPassword` and always proceed. Expected **caught** by "a wrong current password is rejected".
5. `server/src/routes/authRoutes.js` — remove the `deleteSession` + `createSession` re-issue from the password route. Expected **caught** by "issues a replacement session".
6. `client/src/pages/dashboard/views/SettingsAccountPanel.jsx` — remove the two `setCurrentPassword("")` / `setNewPassword("")` calls. Expected **caught** by "clears both fields on success".

- [ ] **Step 2: Run each mutation and confirm it applied**

For each one, after applying, confirm the file actually changed before running the suite:

```bash
git diff --stat
```

Expected: exactly one file, with a non-zero change count. An unapplied mutation and an uncaught one both read as "tests passed", so this check is not optional. Match patterns on `\r?\n` — some files here use CRLF.

- [ ] **Step 3: Record the results**

Write down, for each of the six, whether it was caught or survived and whether that matched the expectation. Any unexpected survivor means either the test is toothless or the two code paths are equivalent — `CLAUDE.md` documents cases of both, so work out which before adding a test.

- [ ] **Step 4: Revert every mutation**

```bash
git checkout -- server client
git status --short
```

Expected: clean. Delete the scratchpad script.

- [ ] **Step 5: Re-measure coverage and raise the client ratchet**

```bash
npm run test:coverage
```

The client thresholds in `client/vite.config.js` are a ratchet floored one decimal below the measured value. Raise them to match the new measurement. **Never lower them to make a build pass.** If coverage fell, find out why before touching the numbers.

- [ ] **Step 6: Run every gate**

```bash
npm run lint > /tmp/lint.txt 2>&1; echo "lint: $?"
npm run format:check > /tmp/format.txt 2>&1; echo "format: $?"
npm run knip > /tmp/knip.txt 2>&1; echo "knip: $?"
npm run build > /tmp/build.txt 2>&1; echo "build: $?"
npm test > /tmp/test.txt 2>&1; echo "test: $?"
```

Expected: all five exit 0. If `knip` now reports `SettingsAccountPanel` as unused, its import in `SettingsView.jsx` did not land.

- [ ] **Step 7: Commit**

```bash
git add client/vite.config.js
git commit -m "test: raise the client coverage ratchet after account management"
```

---

## What this plan deliberately does not do

- **The three placeholder tabs are untouched.** Connected Apps, Privacy and Notifications stay hardcoded strings. They need a product decision before an implementation, and the roadmap spec keeps them out of scope.
- **No change-email.** There is no endpoint and no way to verify a new address.
- **Phases 2 through 6 are not planned.** Planning Phase 5 today would mean guessing at decisions Phases 2 through 4 have not made yet. Each gets its own spec and plan when it is reached.
- **No rate limiter is added for the two new routes.** `app.use("/api", ...)` already applies the global limiter, and both routes require a valid session, so the anonymous-abuse surface is small. If the deploy in Phase 2 shows otherwise, add one then rather than speculatively now.
