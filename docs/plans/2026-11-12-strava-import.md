# Strava import, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a Strava account in Settings, and bring each new activity in as an
off-plan workout. Imports follow Strava's edits and deletes, can be deleted here and stay
deleted, and are removed with the tokens on disconnect. This is roadmap C2. It needs B1,
done, and applies G2: Strava only.

The work is one docs PR, five server PRs, two client PRs, an E2E PR, a floor PR for each
side whose figures rose, and a close-out docs PR.

**Design:** `docs/specs/2026-11-12-strava-import-design.md`. Where this plan names a
behaviour, the spec's wording wins.

**Architecture:**

- **Data:** migration 008 adds five nullable columns to `workout_sessions` and two
  tables, `strava_connections` and `strava_deleted_activities`. Two repositories own
  them.
- **Pure parts:** `services/integrations/` holds the token cipher, the configuration
  read, the mapping from an activity to a workout, and the import rules.
- **Strava:** `services/external/stravaClient.js` is the only code that calls Strava.
  `services/integrations/stravaService.js` joins the client to the repositories: the
  locked refresh, importing one activity, the sync, the disconnect, and webhook events.
- **Routes:** `/api/integrations/strava/*` sits behind the CSRF check. `/webhooks/strava`
  is mounted before it. `DELETE /api/dashboard/workouts/:id` deletes only an import.
- **Client:** `app/strava.js` holds the calls. `settings/SettingsStravaPanel.jsx` is the
  Connected Apps panel. `app/hooks/useStravaSync.js` starts the catch-up when the
  dashboard opens. The Workouts list shows an import's details and its Delete.

**Tech Stack:** Express 5, Prisma with Postgres, zod, Node's `crypto` (AES-256-GCM),
React 19, Vitest 5 with v8 coverage, Testing Library, Playwright 1.64.

**Status: planned.**

Every file and line below was read on `46f4e0d`.

---

## Owner's decisions

Made 2026-11-11 and 2026-11-12 (the spec's Decisions):

- **Activities arrive by webhook, plus a catch-up sync** when the dashboard opens and
  from Sync now.
- **All activity types import, only from the moment of connecting.**
- **A strength-type activity is skipped when an app-logged workout exists that day.**
- **An import follows Strava's edits and deletes.**
- **An import is a workout session with new nullable columns.**
- **An import can be deleted, not edited, and a delete is remembered.** App-logged
  workouts still cannot be deleted.
- **Everyone sees Connect once the server has Strava keys.**
- **Disconnecting deletes the tokens and every import.**

## Decided while planning

1. **The configuration is read live, per request**, by `readStravaConfig(process.env)`,
   as `GEMINI_API_KEY` is. Integration tests import `app` once, so a test sets or
   blanks the variables around each case rather than re-importing.
2. **One base URL stands in for Strava's host.** Strava serves OAuth at
   `https://www.strava.com/oauth/…` and the API at `https://www.strava.com/api/v3/…`.
   `STRAVA_BASE_URL`, when set, replaces `https://www.strava.com` in both. The E2E fake
   serves both paths on one port.
3. **The callback URL is built from the request's own origin:**
   `requestOrigin(req) + "/api/integrations/strava/callback"`. `requestOrigin` is
   exported from `corsPolicy.js`, where it already works out the origin for CORS.
   - Production trusts one proxy, so the scheme is `https` behind Render.
   - Strava checks the URL against the app's registered callback domain, so a forged
     Host gains nothing.
4. **The E2E spec runs in the `deployable` project**, against the express origin, as
   production does. The callback, the redirect to Settings and the cookies then share
   one origin.
5. **Status codes:**
   - 404: Strava is not configured on the server, or the workout is not an import of
     this user's.
   - 409: connecting a Strava athlete who is already linked to another account here.
   - 400: a malformed body.
   - 502: Strava answered with an error the route cannot recover from.
   - 503: Strava is unreachable.
   - The callback never answers JSON. It always redirects to
     `/dashboard/settings?strava=<result>`.
6. **The Settings view is `/dashboard/settings`.** `settings` is its slug in
   `DASHBOARD_ROUTE_VIEW_MAP` (`app/constants.js`), which `app/routing.js` reads. The
   panel reads and then clears the `strava` query parameter.
7. **The webhook handles each event after answering**, with `setImmediate`, so the 200
   goes out first. Tests await the service's returned promise through an injected
   `schedule` function, which defaults to `setImmediate`.
8. **The tokens' column type is `text`.** The sealed form is
   `v1.<nonce b64>.<ciphertext b64>.<tag b64>`.
9. **Distance is `numeric(10,1)` in meters and heart rate `numeric(5,1)` in bpm**, read
   back through `toNumberOrNull`, as the meal macros are.

## Conventions

The house rules apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own, and edits no floor.
- Comments and docs move with the change.
- A header on every new source file. A `/** */` summary on every export. One line on
  every effect. `// @ts-check` on every new server module, below its header
  (`TYPE_CHECKED_FILES` in `repo-invariants.test.mjs` rises with each, and the new file
  is staged before `npm test`).

**Test first.** Every behaviour change starts with its test, run red for the right reason.
Mutations then show the tests hold. Confirm each mutation applied, and restore from a
saved copy (ADR 0015). Write the runners with the Write tool, in the scratchpad.

**Coverage**, at C4's close:

- Client: **branches 4140/4326 against 95.7, slack 0.02.** Statements 2.13, functions
  0.53, lines 3.40.
- Server: statements 0.56, branches 1.52, functions 0.60, lines 2.15.
- **Every PR covers every branch and function it adds**, on both sides. A `??` default
  on a value that is always present is an unreachable arm: don't write one.

**Absent is not zero** (ADR 0001):

- **Distance:** a positive number, or NULL. Strava's `0` is "no distance".
- **Heart rate:** a positive number when `has_heartrate` is true, or NULL.
- **Minutes:** NULL when `moving_time` is absent, and outside the table's 5 to 360
  check. The guard comes before `Number()`.
- **A missing `last_synced_at`** reads as "Not synced yet", never as the epoch.

**Secrets:**

- Claude never reads `server/.env` or Render's settings.
- Tests use fixture values that are obviously fake (`test-client-secret`), and a key of
  32 zero bytes in base64. If gitleaks flags one, allowlist the value in
  `security/gitleaks.toml`, never the path.

**Paths:** start every command with `cd "D:/ai-workout"`.

**Server tests need Postgres** on 55432 (`npm run postgres:local:start -w server`, in the
background; it hangs when piped). Read the `Tests` line before trusting a count.

**Gates, in order:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage` with `--coverage.reporter=json-summary`, the server measured
   with `client/dist` present;
3. for a client PR, `REDIS_URL= npm run test:e2e` after a build;
4. for a CSS PR, the screenshot compare (`capture.mjs`, CLAUDE.md).

**Merging:** only when GitHub reports the PR `CLEAN`, and only after the owner approves
that PR. Merge with a standalone `gh pr merge <n> --merge`, then watch `main`'s CI and
Deploy to green.

**Strava's documented behaviour is re-checked in PR 3**, against developers.strava.com:
the token, refresh and deauthorize endpoints, the activity fields used here, the
webhook's event shape, and the error answers for the athlete limit. Any difference
updates the spec and this plan in that PR.

---

## Task 1: the spec and this plan (PR 1)

- [ ] Add this plan to `docs/README.md`'s Plans list, after the exercise swaps entry.
      The spec is already listed.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Commit on `docs/strava-import-spec`, push, and open the PR.
- [ ] Merge when `CLEAN` and approved.

## Task 2: the data, the cipher and the settings (PR 2)

Nothing reads any of this yet. A server with no Strava settings behaves exactly as
before.

**Files:**

- Create: `server/db/postgres/008_strava_import.sql`
- Modify: `server/db/postgres/README.md` (the migrations table, and "Eleven tables")
- Modify: `server/prisma/schema.prisma`
- Create: `server/src/services/integrations/tokenCipher.js`
- Create: `server/src/services/integrations/stravaConfig.js`
- Modify: `server/src/services/platform/envValidationService.js`
- Create: `server/src/repositories/stravaConnectionRepository.js`
- Create: `server/src/repositories/stravaImportRepository.js`
- Modify: `server/src/repositories/workoutSessionRepository.js` (`mapWorkoutSession`)
- Modify: `README.md` (the environment table), `env.example`
- Tests: `server/src/services/integrations/__tests__/tokenCipher.test.js`,
  `…/stravaConfig.test.js`, `server/src/services/platform/__tests__/envValidationService.test.js`,
  `server/src/repositories/__tests__/stravaConnectionRepository.test.js`,
  `…/stravaImportRepository.test.js`, `…/workoutSessionRepository.test.js`,
  `server/src/__tests__/numericCoercion.contract.test.js`

### Step 1: migration 008

- [ ] Write `server/db/postgres/008_strava_import.sql`:

```sql
-- Strava import (roadmap C2, docs/specs/2026-11-12-strava-import-design.md).
-- An imported activity is a workout session with source 'strava'; a session
-- logged in the app keeps source NULL. A missing distance or heart rate stays
-- NULL: Strava's distance 0 means "no distance", so only a positive one is kept.
alter table workout_sessions
  add column source text check (source in ('strava')),
  add column external_id text check (char_length(external_id) <= 40),
  add column sport text check (char_length(sport) <= 60),
  add column distance_meters numeric(10, 1) check (distance_meters > 0),
  add column average_heartrate numeric(5, 1) check (average_heartrate > 0),
  add constraint workout_sessions_external_source_check
    check ((source is null) = (external_id is null));

-- Partial, so Prisma cannot name it: the repository reads, then writes.
create unique index workout_sessions_user_source_external_idx
  on workout_sessions (user_id, source, external_id)
  where external_id is not null;

-- One Strava connection per user, and one user per Strava athlete. The tokens
-- are sealed with AES-256-GCM (services/integrations/tokenCipher.js), never
-- stored in the clear. Removed with its user.
create table strava_connections (
  user_id uuid primary key references app_users (id) on delete cascade,
  athlete_id bigint not null unique,
  athlete_name text not null default '' check (char_length(athlete_name) <= 140),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_sync_error text check (char_length(last_sync_error) <= 40),
  needs_reconnect boolean not null default false,
  updated_at timestamptz not null default now()
);

-- The Strava activities a user deleted here, so no import brings them back.
create table strava_deleted_activities (
  user_id uuid not null references app_users (id) on delete cascade,
  external_id text not null check (char_length(external_id) <= 40),
  deleted_at timestamptz not null default now(),
  primary key (user_id, external_id)
);
```

- [ ] Attach 001's `set_updated_at()` to the new table, as 001 does for each of its own:

```sql
create trigger strava_connections_set_updated_at
before update on strava_connections
for each row execute function set_updated_at();
```

- [ ] Run `npm run migrate:postgres -w server`, then
      `npm run prisma:validate -w server`.

### Step 2: the Prisma models

- [ ] Add these fields to `WorkoutSession`:

```prisma
  source           String?
  externalId       String?   @map("external_id")
  sport            String?
  distanceMeters   Decimal?  @map("distance_meters") @db.Decimal(10, 1)
  averageHeartrate Decimal?  @map("average_heartrate") @db.Decimal(5, 1)
```

- [ ] Add the two models, with `stravaConnection StravaConnection?` and
      `stravaDeletedActivities StravaDeletedActivity[]` on `AppUser`:

```prisma
// One Strava connection per user (008_strava_import.sql); tokens are sealed.
model StravaConnection {
  userId        String    @id @map("user_id") @db.Uuid
  athleteId     BigInt    @unique @map("athlete_id")
  athleteName   String    @default("") @map("athlete_name")
  accessToken   String    @map("access_token")
  refreshToken  String    @map("refresh_token")
  expiresAt     DateTime  @map("expires_at") @db.Timestamptz(6)
  connectedAt   DateTime  @default(now()) @map("connected_at") @db.Timestamptz(6)
  lastSyncedAt  DateTime? @map("last_synced_at") @db.Timestamptz(6)
  lastSyncError String?   @map("last_sync_error")
  needsReconnect Boolean  @default(false) @map("needs_reconnect")
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  user AppUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("strava_connections")
}

// An activity deleted here, never imported again (008_strava_import.sql).
model StravaDeletedActivity {
  userId     String   @map("user_id") @db.Uuid
  externalId String   @map("external_id")
  deletedAt  DateTime @default(now()) @map("deleted_at") @db.Timestamptz(6)

  user AppUser @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([userId, externalId])
  @@map("strava_deleted_activities")
}
```

- [ ] Run `npm run prisma:generate -w server`.

### Step 3: the token cipher, test first

- [ ] Write `tokenCipher.test.js`. With `KEY = Buffer.alloc(32).toString("base64")`:
  - `open(seal("abc"))` is `"abc"`;
  - two seals of one value differ (a fresh nonce each time);
  - a sealed value starts with `"v1."` and has four dot-separated parts;
  - changing any one character of the ciphertext or the tag makes `open` throw a
    `TokenCipherError`;
  - opening under a different 32-byte key throws a `TokenCipherError`;
  - `open("v2.a.b.c")`, `open("")` and `open("v1.a.b")` throw a `TokenCipherError`;
  - `parseTokenKey` returns a 32-byte Buffer for `KEY`, and `null` for `undefined`,
    `""`, `"short"` and a base64 value of 31 bytes.
- [ ] Run it: `npm run test -w server -- src/services/integrations/__tests__/tokenCipher.test.js`.
      Expect it to fail, because the module is missing.
- [ ] Write `tokenCipher.js`:

```js
/**
 * Seals Strava's tokens for storage with AES-256-GCM under STRAVA_TOKEN_KEY
 * (docs/specs/2026-11-12-strava-import-design.md, "Tokens"). A sealed value is
 * `v1.<nonce>.<ciphertext>.<tag>` in base64, and any change to it fails to open.
 */
// @ts-check
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/** A sealed value that cannot be opened: malformed, tampered, or another key's. */
export class TokenCipherError extends Error {}

/**
 * The 32-byte key that `value` holds in base64, or null when it is absent or any
 * other length. The startup check and the cipher share it.
 * @param {unknown} value
 */
export const parseTokenKey = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = Buffer.from(value.trim(), "base64");
  return key.length === 32 ? key : null;
};

/**
 * Builds `{ seal, open }` over a 32-byte key.
 * @param {Buffer} key
 */
export const createTokenCipher = (key) => {
  /** @param {string} text */
  const seal = (text) => {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return [VERSION, nonce, body, cipher.getAuthTag()]
      .map((part) => (typeof part === "string" ? part : part.toString("base64")))
      .join(".");
  };

  /** @param {string} sealed */
  const open = (sealed) => {
    const parts = String(sealed).split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) throw new TokenCipherError("Unreadable token.");
    try {
      const [nonce, body, tag] = parts.slice(1).map((part) => Buffer.from(part, "base64"));
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch {
      throw new TokenCipherError("Unreadable token.");
    }
  };

  return { seal, open };
};
```

- [ ] Run the test, and expect it to pass.
- [ ] Mutate: drop `setAuthTag`, use a fixed nonce, and drop the version check. Each one
      must fail a test. Confirm each mutation applied.

### Step 4: the configuration and the startup check, test first

- [ ] Write `stravaConfig.test.js`:
  - `readStravaConfig({})` is `null`;
  - with the client id, the secret and the key set, it returns the `clientId`, the
    `clientSecret` and the `key` Buffer, `webBase` `https://www.strava.com`,
    `verifyToken: null` and `subscriptionId: null`;
  - `STRAVA_BASE_URL` set to `http://127.0.0.1:5099/` gives `webBase`
    `http://127.0.0.1:5099`, with the trailing slash dropped;
  - a configuration with a bad key is `null`. The startup check reports it, and the
    reader never runs with half a configuration;
  - `STRAVA_WEBHOOK_SUBSCRIPTION_ID` `"12345"` gives `subscriptionId: 12345`.
- [ ] Write `stravaConfig.js`:

```js
/**
 * Reads the Strava settings from the environment, live, per request
 * (docs/specs/2026-11-12-strava-import-design.md, "Settings, the server's
 * environment"). Null means the server has no Strava: every route then answers 404.
 */
// @ts-check
import { parseTokenKey } from "./tokenCipher.js";

const STRAVA_WEB = "https://www.strava.com";

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * The Strava configuration in `env`, or null when the client id, the secret or a
 * valid key is missing.
 * @param {Record<string, string | undefined>} env
 */
export const readStravaConfig = (env) => {
  const clientId = text(env.STRAVA_CLIENT_ID);
  const clientSecret = text(env.STRAVA_CLIENT_SECRET);
  const key = parseTokenKey(env.STRAVA_TOKEN_KEY);
  if (!clientId || !clientSecret || !key) return null;
  const subscription = text(env.STRAVA_WEBHOOK_SUBSCRIPTION_ID);
  return {
    clientId,
    clientSecret,
    key,
    webBase: (text(env.STRAVA_BASE_URL) || STRAVA_WEB).replace(/\/+$/, ""),
    verifyToken: text(env.STRAVA_WEBHOOK_VERIFY_TOKEN) || null,
    subscriptionId: /^\d+$/.test(subscription) ? Number(subscription) : null
  };
};
```

- [ ] Add these cases to `envValidationService.test.js`:
  - none of the three set: no error;
  - all three set and valid: no error;
  - one or two set: "STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and STRAVA_TOKEN_KEY must
    be set together.";
  - a key of the wrong length: "STRAVA_TOKEN_KEY must be 32 bytes in base64.";
  - `STRAVA_BASE_URL` with `NODE_ENV=production`: "STRAVA_BASE_URL is for tests and
    cannot be set in production.";
  - `STRAVA_WEBHOOK_SUBSCRIPTION_ID` `"abc"`: "must be a whole number";
  - `STRAVA_BASE_URL` `"not a url"`: the existing URL message. Add it to `URL_VARS`.
- [ ] Add the checks to `validateEnv`, after the Sentry rate:

```js
const stravaSet = STRAVA_REQUIRED.filter((name) => !isBlank(env[name]));
if (stravaSet.length && stravaSet.length < STRAVA_REQUIRED.length) {
  errors.push(
    `${STRAVA_REQUIRED.join(", ").replace(/, (?=[^,]*$)/, " and ")} must be set together.`
  );
} else if (stravaSet.length && !parseTokenKey(env.STRAVA_TOKEN_KEY)) {
  errors.push("STRAVA_TOKEN_KEY must be 32 bytes in base64.");
}
if (!isBlank(env.STRAVA_BASE_URL) && env.NODE_ENV === "production") {
  errors.push("STRAVA_BASE_URL is for tests and cannot be set in production.");
}
```

The constant is `const STRAVA_REQUIRED = ["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET",
  "STRAVA_TOKEN_KEY"]`. `STRAVA_WEBHOOK_SUBSCRIPTION_ID` joins `NUMERIC_VARS` with
`min: 1`. Check that its reader, `readStravaConfig`, accepts exactly what the check
passes, and add a row to the contract file's "validateEnv accepts … exactly when"
pattern if the shapes differ.

- [ ] Add the five settings, plus `STRAVA_BASE_URL` marked test-only, to the README's
      environment table, and blank to `env.example`.

### Step 5: the repositories, test first, against Postgres

- [ ] Write `stravaConnectionRepository.test.js`. Create a user as
      `progressionDecisionRepository.test.js` does, then:
  - `saveConnection` then `findConnection` round-trips every field;
  - saving again for the same user replaces the tokens and keeps `connectedAt`;
  - saving an athlete already linked to another user returns `{ conflict: true }` and
    changes nothing;
  - `findConnectionByAthlete` finds the user;
  - `markSynced` sets `lastSyncedAt` and clears `lastSyncError`. `markSyncFailed` sets
    the error and leaves `lastSyncedAt`. `markNeedsReconnect` sets the flag, and a save
    clears it;
  - `withRefreshLock` serialises: two calls for one user, the first held open on a
    deferred promise, and the second's callback runs only after the first commits (the
    staged-race shape from #388);
  - `removeConnectionAndImports` deletes the connection, the user's `source = 'strava'`
    sessions and the deleted list, and leaves an app-logged session;
  - deleting the user removes the connection and the deleted list (the cascade).
- [ ] Write `stravaConnectionRepository.js`:
  - `createStravaConnectionRepository({ prisma })` returns `findConnection({ userId })`,
    `findConnectionByAthlete({ athleteId })`,
    `saveConnection({ userId, athleteId, athleteName, accessToken, refreshToken, expiresAt })`,
    `withRefreshLock({ userId }, fn)`, `updateTokens(tx, { userPk, accessToken, refreshToken, expiresAt })`,
    `markSynced`, `markSyncFailed`, `markNeedsReconnect` and `removeConnectionAndImports`.
  - Each resolves the user through `getUserPk`, and returns null or 0 for an unknown
    user, as the progression repository does.
  - **The tokens arrive already sealed.** The repository never sees a clear token.
  - **`saveConnection`** reads by athlete id first, and returns `{ conflict: true }`
    when that row belongs to another user. Otherwise it upserts on the `user_id`
    primary key, a full constraint Prisma can name, setting `needsReconnect: false`.
  - **`withRefreshLock`** runs inside `prisma.$transaction(async (tx) => …)`, and its
    callback gets the row as it reads under the lock:

    ```js
    await tx.$queryRaw`select 1 as locked from pg_advisory_xact_lock(hashtextextended(${`strava-refresh:${userPk}`}, 0))`;
    const row = await tx.stravaConnection.findUnique({ where: { userId: userPk } });
    return fn(tx, row);
    ```

  - **The mapper** returns `athleteId` as a Number (Strava's ids fit). The tokens never
    reach anything a route returns: the state route answers the service's
    `connectionState` (PR 4), which reads only the other fields.
- [ ] Write `stravaImportRepository.test.js`:
  - `saveImport` creates a session with the five columns, a NULL plan link and empty
    exercises;
  - a second `saveImport` for the same `externalId` updates that row: the focus,
    minutes, notes, sport, distance and heart rate change, and the id and `createdAt`
    stay;
  - `saveImport` never updates a session whose `source` is NULL, even when asked with
    that session's date;
  - `hasAppWorkoutOn({ userId, date })` is true only for a `source`-NULL session on
    that date;
  - `isDeletedHere` and `listImportsSince({ userId, since })` (id, `externalId` and
    date of each import on or after `since`);
  - `removeImport({ userId, externalId })` deletes the import and returns 1, or 0;
  - `deleteImportById({ userId, id })`, in one transaction, deletes the import, adds
    its `externalId` to the deleted list, and returns true. It returns false for an
    app-logged session, another user's import, or an unknown id, and deletes nothing.
    `id` is matched as `mapWorkoutSession` returns it, `legacyId || id`, so the route
    can take the id the client holds.
- [ ] Write `stravaImportRepository.js` with those six functions, read-then-write as the
      spec says, through `getUserPk` and `userIdWhere` where the shared helpers apply.
- [ ] Extend `mapWorkoutSession`: it adds `source` (`row.source ?? null`), `sport`,
      `externalId`, and `distanceMeters` and `averageHeartrate` through
      `toNumberOrNull`. Every app-logged session reads `source: null`.
  - Update its test, and the dashboard read's expectations that list a session's keys.
  - Add two rows to `numericCoercion.contract.test.js` for the new fields read through
    the mapper, with `zeroIsValid: false`: the column never holds 0, and a 0 would
    mean "no distance".
- [ ] Run `npm run test -w server`, read the `Tests` line, then run the gates.
- [ ] Mutations: drop the athlete-conflict read, drop the `source`-NULL guard in
      `saveImport`, and drop the lock from `withRefreshLock`. Each must fail a test.
- [ ] Commit, push, open the PR, and report.

## Task 3: the Strava client, the mapping, the rules and the refresh (PR 3)

Still unused by any route.

**Files:**

- Create: `server/src/services/external/stravaClient.js`
- Create: `server/src/services/integrations/stravaMapping.js`
- Create: `server/src/services/integrations/stravaImport.js`
- Create: `server/src/services/integrations/stravaService.js` (the refresh and
  importing one activity, in this PR; more in PRs 4 to 6)
- Tests: `…/external/__tests__/stravaClient.test.js`,
  `…/integrations/__tests__/stravaMapping.test.js`, `…/stravaImport.test.js`,
  `…/stravaService.test.js`, `server/src/__tests__/numericCoercion.contract.test.js`

- [x] **Re-check Strava's documentation first** (Conventions), and correct the spec and
      this plan where it differs. Done 2026-11-13: the spec's "What Strava requires" now
      holds the findings. The owner chose to go on after learning that creating any app
      needs a Strava subscription.

### The client

- [ ] Test first, with `fetchImpl` a `vi.fn()` that answers `new Response(...)`:
  - `exchangeCode(code)` POSTs form fields `client_id`, `client_secret`, `code`,
    `grant_type=authorization_code` to `${webBase}/oauth/token`. Strava's exchange takes
    no `redirect_uri` (re-check, 2026-11-13). It returns
    `{ accessToken, refreshToken, expiresAt, athleteId, athleteName }`, with
    `expiresAt` a Date from `expires_at` seconds, and the name joined from the athlete's
    first name and last initial;
  - `refresh(refreshToken)` POSTs `grant_type=refresh_token`, and returns the three
    token fields;
  - `revoke(refreshToken)` POSTs `token` and `token_type_hint=refresh_token` to
    `${webBase}/oauth/revoke`, with the client id and secret as HTTP Basic auth. That is
    the endpoint Strava recommends since 1 June 2026; `/oauth/deauthorize` ends on
    1 June 2027 (re-check);
  - `listActivities(accessToken, { after, page, perPage })` GETs
    `${webBase}/api/v3/athlete/activities?after=&page=&per_page=` with a bearer header;
  - `getActivity(accessToken, id)` GETs `${webBase}/api/v3/activities/<id>`;
  - **the error kinds**, each a `StravaError` with `kind`:
    - 401 → `unauthorized`;
    - 404 → `not_found`;
    - 429 → `rate_limited`;
    - a 403 from the code exchange → `capacity`. Strava documents no answer for an app
      at its athlete limit (re-check), so the exchange's refusal is read as the limit;
    - 400 and 403 elsewhere → `unauthorized`, since a refused refresh is a 400;
    - any other status → `unavailable`;
    - a thrown fetch → `unavailable`;
    - a timeout → `unavailable`;
  - **no secret in an error:** for each kind, `JSON.stringify(error)`, `error.message`
    and `error.stack` hold neither the client secret, nor a token, nor the code. The
    message is fixed text, `Strava answered <kind>.`
- [ ] Write `createStravaClient({ config, fetchImpl = fetch, timeoutMs = 8000 })`, with
      a timeout on `AbortController` as `externalDataService.js` does. The response
      bodies are parsed and only the named fields are read; a response object is never
      kept or thrown.

### The mapping

- [ ] Test first, `toWorkout(activity)` with a full Strava activity fixture, then:
  - `distance: 0`, `null`, absent and `"12"` give `distanceMeters` `null`, `null`,
    `null` and `12`;
  - `has_heartrate: false` with `average_heartrate: 140` gives `null`;
    `has_heartrate: true` with `average_heartrate: 0` gives `null`, and with `141.6`
    gives `141.6`;
  - `moving_time` absent gives `durationMinutes: null`, and `1799` gives `30`. Under
    5 minutes or over 360 gives `null`, since `workout_sessions` checks that range (found
    in PR 3; the plan had `0` giving `0`, which the table refuses);
  - `start_date_local: "2026-11-12T07:15:00Z"` gives `workoutDate: "2026-11-12"`. The
    local date is the string's own date part, never converted through a time zone;
  - `sport_type: "WeightTraining"` gives `focus: "Weight training"`, and
    `"TrailRun"` gives `"Trail run"`; an unknown type falls back to `type`, then
    `"Activity"`;
  - the title goes to `notes`, cut to the notes limit (read it from
    `apiSchemaService.js`'s workout body schema);
  - `externalId` is `String(activity.id)`.
- [ ] Write `stravaMapping.js`: `positiveOrNull(value)` guards absence before
      `Number()` (the `toNumberOrNull` shape, then `> 0`), `sportLabel(type)`, and
      `toWorkout(activity)`.
- [ ] Add a `positiveOrNull` row to the contract file, with `zeroIsValid: false`.

### The rules

- [ ] Test first, `decideImport({ workout, deletedHere, appWorkoutThatDay, existing })`:
  - `"skip-deleted"` when `deletedHere`, whatever else holds;
  - `"update"` when `existing`, even for a strength type on a day with an app workout,
    since an import already here stays;
  - `"skip-duplicate"` for each of `WeightTraining`, `Workout` and `Crossfit` with
    `appWorkoutThatDay`, and `"create"` for each without it;
  - `"create"` for `Run` with `appWorkoutThatDay`.
- [ ] Test first, `deletionsFrom({ imports, listedIds, complete })`: the ids of imports
      not in `listedIds` when `complete`, and `[]` when not.
- [ ] Write `stravaImport.js`, pure, with `STRENGTH_SPORTS` exported.

### The service: the refresh and importing one activity

- [ ] Test first, `createStravaService({ connections, imports, getConfig, fetchImpl, now })`,
      with the repositories as in-memory fakes, and the clock fixed. Nothing in this PR
      logs, so the logger joins in PR 5 with `handleEvent`, where its leak test belongs.
  - **The import repository gains `hasImport({ userId, externalId })`**, with its
    Postgres test. `decideImport` needs to know whether the activity is already here.
  - **`accessTokenFor(userId)`:**
    - returns the opened token when it expires more than five minutes from now, and
      calls Strava for nothing;
    - a connection already marked `needsReconnect` throws `reconnect`, and calls Strava
      for nothing;
    - PR 3 also had a `forceRefresh` option, for PR 5 to confirm a deauthorization. PR 5
      replaced it with `confirmRevoked(userId)`, which shares the locked refresh. It
      answers true only when Strava refuses the refresh: a token that will not open is
      this server's fault, so with a forged event it must not delete anything;
    - refreshes when it is due: it seals and stores both new tokens through
      `updateTokens`, inside `withRefreshLock`, and returns the new access token;
    - **another request already refreshed:** when the row read under the lock is no
      longer due, it uses that row's token and calls Strava for nothing;
    - an `unauthorized` refresh, or a token that fails to open, calls
      `markNeedsReconnect`, then throws a `StravaError` with kind `reconnect`. Nothing is
      deleted;
    - with no connection, it throws kind `not_connected`.
  - **`importActivity(userId, activityId)`:**
    - fetches the activity, maps it, asks `decideImport`, and calls `saveImport` for
      `"create"` and `"update"`;
    - returns the decision.
  - **`removeIfGone(userId, activityId)`:**
    - a `not_found` from Strava calls `removeImport`;
    - a found activity removes nothing;
    - any other error is rethrown.
- [ ] Write those three functions in `stravaService.js`. `getConfig` defaults to
      `() => readStravaConfig(process.env)`. The cipher and the client are built from it
      on each call.
- [ ] Gates, mutations (drop the five-minute margin, drop the re-read under the lock,
      drop the `existing` arm), then commit, push, open the PR and report.

## Task 4: connect, callback, state, disconnect (PR 4)

**Files:**

- Create: `server/src/routes/integrations/registerStravaRoutes.js`. It is not
  `// @ts-check`, like every other route file: the repo has no Express type
  declarations, and adding them is a dependency decision (found in PR 4).
- Modify: `server/src/routes/registerApiRoutes.js`, `server/src/index.js` (the
  repositories and the service into `deps`), `server/src/corsPolicy.js` (export
  `requestOrigin`)
- Modify: `server/src/services/integrations/stravaService.js` (`disconnect`,
  `connectionState`)
- Modify: `server/src/routes/authRoutes.js` (the revoke before `deleteUser`)
- Tests: `server/src/routes/integrations/__tests__/stravaRoutes.test.js` (stubbed),
  `…/stravaConnect.integration.test.js` (Postgres, `app` from `index.js`, `fetch`
  stubbed with `vi.stubGlobal`), `server/src/routes/__tests__/authRoutes.test.js`

**The routes:**

- `GET /api/integrations/strava`, with `requireAuth`, answers `connectionState`:

```js
{
  (available, connected, athleteName, lastSyncedAt, lastSyncError, needsReconnect);
}
```

Every field is present. `lastSyncedAt` is an ISO string or `null`.

- `POST /api/integrations/strava/connect`, with `requireAuth`:
  - sets `stravaState`, 32 random bytes in base64url, as
    `HttpOnly; Path=/api/integrations/strava; SameSite=Lax; Max-Age=600`, plus
    `Secure` where the session cookie has it;
  - answers `{ url }`, the authorize URL on `${webBase}/oauth/authorize` with
    `client_id`, `redirect_uri`, `response_type=code`, `approval_prompt=auto`,
    `scope=activity:read_all` and `state`.
- `GET /api/integrations/strava/callback`, with `requireAuth`. A missing session
  redirects to the sign-in page. It always clears `stravaState`, then redirects to
  `/dashboard/settings?strava=<result>`, where the result is the first of these that
  holds:
  1. `error` in the query → `cancelled`;
  2. the state is missing or doesn't match the cookie → `failed`, with a `warn` log;
  3. the `scope` lacks both `activity:read_all` and `activity:read` → `no-access`;
  4. the exchange fails with `capacity` → `limit`, and with any other kind →
     `unavailable`;
  5. `saveConnection` says `conflict` → `taken`. Nothing is revoked (changed in PR 4):
     Strava's grant belongs to the athlete, so revoking the token just issued would cut
     off the account that holds the link too;
  6. otherwise → `connected`.
- `DELETE /api/integrations/strava`, with `requireAuth`, calls `disconnect` and answers
  `{ ok: true }`:
  - it revokes as a best effort, then calls `removeConnectionAndImports`;
  - a revoke that fails is logged by kind and never blocks.
- **With no configuration**, all four answer 404 `{ error: "Strava is not available." }`,
  except `GET /api/integrations/strava`, which answers `{ available: false, … }`.

- [ ] **Stubbed route tests** (the `planSwapRoutes.test.js` shape): each callback
      result, the cookie's attributes, the 404s, a failing store answering 500, and the
      redirect for no session.
- [ ] **Integration tests**, signing up as `planSwaps.integration.test.js` does, and
      setting the three Strava variables in `beforeEach` (restoring absent keys by
      deleting them, ADR 0011):
  - connect, then the callback with the matching state and a stubbed exchange, stores
    a sealed token. The row's `access_token` is not the clear token and opens to it.
    The state answer says `connected` and holds no token;
  - a second account connecting the same athlete gets `taken`;
  - disconnecting removes the row and the imports, and the state answer says not
    connected;
  - **the account delete** with a connection calls the revoke stub, then removes
    everything. With the revoke stub throwing, the account is still deleted.
- [ ] **Leak checks:**
  - **The response bodies:** the integration test serialises every response body in
    this file and asserts that no stubbed token, code or secret appears.
  - **The logs:** the routes log only through `req.log`. The stubbed test passes a spy
    there, runs every callback result and the disconnect, and asserts that no logged
    argument, serialised, holds a token, the code or the secret.
- [ ] **Imports never reach Gemini**, in `server/src/routes/__tests__/generateRoutes.test.js`,
      whose Gemini client is already stubbed and whose `requestSent()` returns what it
      was sent. A signed-in user, whose dependencies would answer an import titled
      `"Strava-only title 7c1"` with sport `"VirtualRide"`, generates a plan. The
      request holds neither string. Today the route is given no session reader at all,
      and the test pins that.
- [ ] Gates, mutations (skip the state check, skip the scope check, skip clearing the
      cookie), commit, push, open the PR and report.

## Task 5: the webhook and the subscription script (PR 5)

**Files:**

- Create: `server/src/routes/integrations/registerStravaWebhook.js`
- Modify: `server/src/index.js`. Mount it after `express.json` and before the `/api`
  limiters and the CSRF middleware, with its own limiter: `rateLimit` with
  `rateLimitStore("strava_webhook")`, 120 a minute.
- Modify: `server/src/services/integrations/stravaService.js` (`handleEvent`)
- Create: `server/scripts/strava-webhook.js`
- Modify: `knip.jsonc`, if knip does not see the script as an entry
- Tests: `…/integrations/__tests__/stravaWebhook.test.js` (stubbed),
  `…/stravaWebhook.integration.test.js`, `…/stravaService.test.js`

- [ ] **The GET, test first:**
  - the right `hub.verify_token` with a `hub.challenge` answers 200
    `{ "hub.challenge": <the challenge> }`;
  - a wrong or missing token answers 403;
  - no verify token configured, or no Strava at all, answers 404.
- [ ] **The POST, test first** (`schedule` injected and awaited):
  - it answers 200 before `handleEvent` runs;
  - a malformed body still answers 200, and does nothing;
  - with no subscription id configured, it answers 404.
- [ ] **`handleEvent(event)`, test first:**
  - **ignored, with no Strava call:** a wrong `subscription_id`, an `owner_id` that no
    connection has, an `object_type` other than `activity` or `athlete`;
  - **`activity` `create` and `update`:** `importActivity`;
  - **`activity` `delete`:** `removeIfGone`. Strava's `not_found` removes, and a found
    activity stays;
  - **`athlete` `update` with `updates.authorized` `"false"`:** `accessTokenFor` is
    forced to refresh. A `reconnect` failure then calls `removeConnectionAndImports`. A
    successful refresh changes nothing (a forged event);
  - **any error inside** is logged with the event's `object_type`, `aspect_type`,
    `object_id` and the error's kind, and never rethrown.
- [ ] **Integration:** a stubbed Strava, a connected user, then a `create` POST imports
      the activity; an `update` POST changes its title; a `delete` POST with Strava
      answering 404 removes it.
- [ ] **The script**, `server/scripts/strava-webhook.js create|view|delete`:
  - it reads `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`
    and, for `create`, `--callback <url>`;
  - it calls `POST`, `GET` or `DELETE /api/v3/push_subscriptions` on Strava;
  - it prints the subscription id, or the error's status, and never prints a secret;
  - it is a thin wrapper over an exported `runWebhookCommand(argv, env, fetchImpl)`,
    tested with a stubbed fetch. The owner runs it with
    `node --env-file=server/.env server/scripts/strava-webhook.js create --callback https://<host>/webhooks/strava`.
- [ ] Gates, mutations (skip the subscription check, delete without the 404, drop the
      deauthorize confirmation), commit, push, open the PR and report.

## Task 6: the sync, and deleting an import (PR 6)

**Files:**

- Modify: `server/src/services/integrations/stravaService.js` (`sync`)
- Modify: `server/src/routes/integrations/registerStravaRoutes.js`
  (`POST /api/integrations/strava/sync`)
- Modify: `server/src/routes/dashboard/write/registerWorkoutAndGoalRoutes.js`
  (`DELETE /api/dashboard/workouts/:id`)
- Tests: `…/stravaService.test.js`, `…/stravaSync.integration.test.js`, the workout
  route's tests

- [ ] **`sync(userId, { manual, now })`, test first:**
  - **The throttle:** a sync within 15 minutes of `lastSyncedAt` (1 minute when
    `manual`) calls Strava for nothing, and answers `{ skipped: true }`. In PR 6 the
    throttle also counts the last attempt, held in memory: a failed sync records no
    `lastSyncedAt`, and without it an outage would be asked again on every dashboard
    open. The attempt is set before the first await, so two syncs at once run one.
  - **Unchanged activities** (found in PR 6): the list holds a week every time, so
    `saveImport` compares first and answers `"unchanged"` without writing. Distance and
    heart rate are compared at the column's one decimal. Only real changes count as
    updated, so the dashboard reloads only when something changed.
  - **The window:** `after` is the larger of `connectedAt` and `now − 7 days`, in epoch
    seconds. Pages of 100, at most 3.
  - **Each listed activity** goes through `decideImport` with the list's own fields.
    The list's summary carries every mapped field, so there is no per-activity fetch;
    confirm that in PR 3's re-check.
  - **Deletes:** `complete` is true when a page held fewer than 100, or the list was
    empty, within 3 pages. Only then does `deletionsFrom` against `listImportsSince`
    remove anything. `listImportsSince` starts two days into the window (PR 6):
    `after` is a UTC instant, and an import is dated where the athlete was, up to a day
    either side, so an import from the window's first day may never have been listed.
    The webhook covers those two days.
  - **The answer:** `{ imported, updated, removed, lastSyncedAt }`, then `markSynced`.
  - **A failure** (`rate_limited` or `unavailable`) on any page: `markSyncFailed(kind)`,
    and an answer of `{ error: kind }`. Nothing is deleted, since the list is not
    complete. Imports saved from the pages before it stay; there is nothing to roll
    back.
  - **`reconnect`:** answers `{ error: "reconnect" }`.
- [ ] **The route** answers the sync's result with 200. With no connection it answers
      `{ error: "not_connected" }`, and with no configuration 404. The body is
      `{ manual?: boolean }`. In PR 6 only `manual === true` is a manual sync, and
      anything else the dashboard's quiet one, so no zod schema was needed.
- [ ] **`DELETE /api/dashboard/workouts/:id`**, with `requireAuth`: `deleteImportById`.
      In PR 6 it answers the refreshed dashboard with `ok: true`, as the saved-exercise
      delete does, so the client needs no second fetch; or 404
      `{ error: "Workout not found." }`.
- [ ] **Integration:**
  - two activities listed: both imported;
  - the same list again within the throttle: skipped;
  - a manual sync after a minute, with one activity's title changed and the other
    gone: one updated and one removed;
  - a strength activity on a day with an app-logged workout: not imported;
  - deleting an import, then syncing with it still listed: not brought back;
  - deleting an app-logged workout's id: 404, and it is still there;
  - a 3-page list of 100 each: nothing deleted. In PR 6 this is a service test, which
    pages through stubs, rather than 300 inserts in Postgres.
- [ ] Gates, mutations (drop `complete`, drop the throttle, drop the deleted-here
      check), commit, push, open the PR and report.

## Task 7: the Settings panel (PR 7, client)

**Files:**

- Create: `client/src/app/strava.js`
- Create: `client/src/pages/dashboard/settings/SettingsStravaPanel.jsx`, `.css`
- Create: `client/src/pages/dashboard/settings/assets/`, holding Strava's official
  "Connect with Strava" button. Download it from Strava's brand guidelines page, and
  keep it unmodified, as they ask.
- Modify: `client/src/pages/dashboard/views/SettingsView.jsx`. The Connected Apps rows
  lose "Wearable devices" and "Last sync", and the tab renders the panel. `apiFetch`
  comes in as a prop, from the dashboard page.
- Tests: `client/src/app/__tests__/strava.test.js`,
  `client/src/pages/dashboard/settings/__tests__/SettingsStravaPanel.test.jsx`,
  `SettingsView`'s tests

- [ ] **`app/strava.js`, test first** (the `planSwaps.js` shape: one `send` helper and
      fixed fallback messages):
  - `fetchStravaState(apiFetch)`, `startStravaConnect(apiFetch)` (answers the URL),
    `syncStrava(apiFetch, { manual })`, `disconnectStrava(apiFetch)`,
    `deleteImportedWorkout(apiFetch, id)`;
  - each refusal throws the server's message, or the fixed one.
  - In PR 7, `deleteImportedWorkout` moves to PR 8, its first caller: knip fails an
    export nothing imports. `readStravaResult(search)` joins them, read by the panel
    and by SettingsView.
- [ ] **The panel, test first**, for each state:
  - **`available: false`:** "Not available";
  - **not connected:** the Connect button, an `<a>`-free `<button>` with the image and
    the accessible name "Connect with Strava". Clicking it calls `startStravaConnect`,
    then `window.location.assign(url)`; stub `assign` in the test. In PR 7 jsdom
    refuses `vi.spyOn(window.location, "assign")` ("Cannot redefine property"), so the
    test stubs the whole `location` with `vi.stubGlobal`;
  - **connected:**
    - "Connected as Jo S.";
    - "Last synced" with the time, or "Not synced yet";
    - **Sync now**, disabled while it runs, then showing the counts;
    - **Disconnect**, behind the app's confirm pattern, read from
      `SettingsAccountPanel.jsx`, with the line "Your workouts imported from Strava
      will be removed.";
  - **`needsReconnect`:** "Reconnect Strava", which starts the same connect. In PR 7 it
    takes Sync now's place, and the retry line below is left out, since no sync will
    try again until the visitor reconnects;
  - **`lastSyncError`:** "The last sync didn't finish. It will try again.";
  - **the callback result**, from the `strava` query parameter: one message per result,
    for `connected`, `cancelled`, `no-access`, `limit`, `taken`, `unavailable` and
    `failed`. It shows once, and the parameter is removed with `history.replaceState`.
    In PR 7, SettingsView also opens on the Connected Apps tab when the parameter is
    there, since the view opens on Profile, where the message would be hidden. An
    unknown value, `constructor` included, shows nothing;
  - **offline:** Connect, Sync now and Disconnect are disabled, with the existing
    offline hint.
  - In PR 7, after Sync now or a disconnect the panel reads the state again, for the
    new time, error or connection.
- [ ] **CSS:** scoped to `.settings-strava`, with base.css tokens and a
      `prefers-reduced-motion` block only if anything moves. Run the screenshot compare
      for the Connected Apps tab: expect its two rows replaced, and nothing else changed.
      In PR 7, base.css has font tokens only, so the box takes the account panel's
      border and radius; nothing moves, so there is no motion block. The button is
      Strava's orange SVG, at its own 48px.
- [ ] Gates, with E2E. The E2E server has no Strava keys yet, so the panel reads "Not
      available" and nothing else changes. Then mutations, commit, push, open the PR and
      report.

## Task 8: imports in the Workouts list, and the sync on opening (PR 8, client)

**Files:**

- Modify: `client/src/app/units.js` (`toKmOrMi`)
- Modify: `client/src/pages/dashboard/views/WorkoutsView.jsx`, `.css`
- Create: `client/src/app/hooks/useStravaSync.js`
- Modify: `client/src/app/hooks/useDashboardData.js` (`reloadDashboard`)
- Modify: `client/src/App.jsx` (calls the hook, and passes the delete down)
- Tests: `units` tests, `client/src/__tests__/numericCoercion.contract.test.js`,
  `WorkoutsView`'s tests, `useStravaSync.test.js`, `useDashboardData`'s tests

- [ ] **`toKmOrMi(meters, measurementSystem)`, test first:**
  - `5000` metric gives `"5.0 km"`, and imperial gives `"3.1 mi"`;
  - `null`, `""`, `undefined` and `0` give `null`;
  - a contract row with `zeroIsValid: false`.
- [ ] **The Workouts list, test first, for an import row** (`source: "strava"`):
  - "From Strava", the sport, the distance through `toKmOrMi`, and "142 bpm", each only
    when present;
  - "View on Strava", an `<a>` to `https://www.strava.com/activities/<externalId>`,
    with `target="_blank"` and `rel="noopener noreferrer"`;
  - **Delete**, behind the confirm. It calls `onDeleteImportedWorkout(item.id)`, and is
    disabled offline with the hint;
  - an app-logged row has none of these.
- [ ] **`reloadDashboard`, test first:** it bumps a counter in the load effect's
      dependencies, so the effect fetches again. The effect's existing guards still
      apply.
- [ ] **`useStravaSync({ user, isDashboardRoute, apiFetch, reloadDashboard })`, test
      first:**
  - **when:** it calls `syncStrava` once per signed-in entry to the dashboard routes,
    and not again while moving between views;
  - **after:** a result with any of `imported`, `updated` or `removed` above 0 calls
    `reloadDashboard`, and a skipped or failed one does not;
  - **failures:** a thrown call is swallowed. Nothing is shown, and nothing is
    reported to Sentry, since it is expected when Strava is off;
  - **offline:** it does not call at all.
- [ ] **App:** the delete handler calls `deleteImportedWorkout`, then `reloadDashboard`.
      A failure shows the app's existing error notice.
- [ ] **Found in PR 7:** a disconnect deletes every import on the server, but the
      dashboard keeps its copy until it loads again. Settings' panel calls
      `reloadDashboard` after a disconnect too, passed down as `apiFetch` is.
- [ ] Gates, with E2E (the E2E server still has no keys), the screenshot compare for an
      import row, then mutations, commit, push, open the PR and report.

## Task 9: E2E against a fake Strava (PR 9)

**Files:**

- Create: `e2e/fakeStrava.mjs`
- Create: `e2e/strava.spec.js`
- Modify: `playwright.config.js`. A third `webServer` runs
  `node e2e/fakeStrava.mjs` on 5099. The server's `env` gains `STRAVA_CLIENT_ID: "e2e"`,
  `STRAVA_CLIENT_SECRET: "e2e-secret"`, `STRAVA_TOKEN_KEY` (32 zero bytes in base64),
  `STRAVA_BASE_URL: "http://127.0.0.1:5099"`, and empty webhook settings. The
  `deployable` project's `testMatch` gains `strava`, and `chromium` ignores it.
- Modify: `e2e/README.md`, `e2e/a11y.spec.js` (the panel, connected and not)

- [ ] **The fake** is plain `node:http`, with no dependency. It holds its activities in
      memory, and a `POST /__control` lets the spec add or remove one:
  - `GET /oauth/authorize` redirects to `redirect_uri?code=e2e-code&state=<state>&scope=read,activity:read_all`;
  - `POST /oauth/token` answers fixed tokens, an `expires_at` six hours on, and an
    athlete;
  - `POST /oauth/revoke` answers 200;
  - `GET /api/v3/athlete/activities` answers the activities after `after`, paged;
  - `GET /api/v3/activities/:id` answers one, or 404.
- [ ] **The spec**, which signs up, adds one run to the fake, then:
  1. opens Settings → Connected Apps, and sees "Connect with Strava";
  2. connects, follows the round trip back, and sees "Connected as";
  3. syncs now, opens the Workouts list, and sees the run "From Strava" with its
     distance;
  4. deletes it, syncs again, and sees it stay gone;
  5. adds a second run, syncs, and disconnects. The Workouts list then holds no import,
     and Settings shows Connect again;
  6. deletes the account, as every spec does.
- [ ] Run the full suite twice, then `strava.spec.js` once in WebKit and in Firefox
      (ad hoc, as in C1). Then gates, commit, push, open the PR and report.

## Task 10 and 11: the floors

- [ ] Measure each side on `main` with json-summary. Raise each floor that rose, to its
      figure truncated to one decimal, with the measured note, in one PR per side. A
      floor never falls.

## Task 12: close-out (docs)

- [ ] Mark this plan done, with every departure from its text, and the spec applied.
- [ ] Update `CLAUDE.md` only where a rule changed: the architecture list gains
      "Integrations: Strava import". Check its byte cap first.
- [ ] Set the roadmap's `status/C2` to `done` with ArtifactData.
- [ ] Write the C2 memory file, and update the handoff.
- [ ] Tell the owner the three steps that are theirs (the spec's "What the owner does").

---

## Self-review

- **Spec coverage:** data (Task 2), tokens (2, 3), the client (3), connecting (4), the
  webhook (5), the catch-up and the import rules (3, 6), disconnecting and the account
  delete (4), deleting an import (6), failures (3, 6, 7), the settings (2), the client
  (7, 8), Strava data and AI (4), testing (each task), rollout (the tasks' order).
- **Names used across tasks:** `readStravaConfig`, `parseTokenKey`, `createTokenCipher`,
  `toWorkout`, `positiveOrNull`, `decideImport`, `deletionsFrom`, `accessTokenFor`,
  `importActivity`, `removeIfGone`, `handleEvent`, `sync`, `disconnect`,
  `connectionState`, `saveImport`, `deleteImportById`, `removeConnectionAndImports`,
  `withRefreshLock`, `toKmOrMi`, `reloadDashboard`, `useStravaSync`. Each is defined in
  the task that first uses it.
