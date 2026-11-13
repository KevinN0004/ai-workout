# Strava import, design

Status: **decided 2026-11-12**, section by section with the owner. The plan is
`docs/plans/2026-11-12-strava-import.md`. This is roadmap C2. It needs B1 (per-set
logging), done, and applies gate G2: Strava only, with Garmin later.

Someone who records a run, a ride or a gym session in Strava should see it in the app
without typing it in again. C2 connects a Strava account in Settings and brings each
new activity in as an off-plan workout. It also follows Strava when an activity is
edited or deleted, and removes everything it brought in when the account is
disconnected.

## What was found

Read on `46f4e0d`.

1. **Settings has a "Connected Apps" tab that is only placeholder text.**
   - `SettingsView.jsx` lists four rows ("Wearable devices", "Health data sync",
     "Calendar sync", "Last sync") that all read "Not connected" or "Not synced yet".
   - Settings tabs are display rows plus an Edit form. The account tab's actions live
     in their own panel, `settings/SettingsAccountPanel.jsx`.
2. **A workout session has nowhere to put a distance, a heart rate or a sport.**
   - `workout_sessions` holds a date, a focus (free text up to 80 characters), minutes,
     exercises, sets, reps, RPE, notes, and P5's nullable plan link.
   - Every screen that shows workouts reads this one table: the Workouts list, the
     dashboard metrics (the last seven days count toward the weekly goal), and the
     paged routes.
3. **The app cannot delete a workout.** No route deletes a session, and the Workouts
   list has no Edit or Delete button. The only deletes are for saved exercises,
   progression answers and the account.
4. **Deleting the account cascades.** `DELETE /api/auth/me` checks the password, then
   `deleteUser`. Every `AppUser` relation is `ON DELETE CASCADE`.
5. **Nothing on the server encrypts anything.** No code uses `createCipheriv`, and
   there is no encryption key.
6. **What could leak a token:**
   - **Logs:** pino redacts the request headers that carry credentials, and a top-level
     key named `token`, but not names like `access_token`.
   - **Sentry:** `errorTrackingService.js` drops request bodies and query strings,
     which also strips them from outgoing-request breadcrumbs. The `code` Strava sends
     back in the callback's query never reaches Sentry.
7. **Every unsafe request under `/api` needs our CSRF token.** `requireCsrfToken` runs
   on `/api` for POST, PUT, PATCH and DELETE. Strava's webhook cannot send one.
8. **The sign-in cookies are `SameSite=Lax`**, so they are sent on the top-level GET
   that Strava's redirect makes back to us.
9. **The server sleeps.** Render's free instances spin down after 15 minutes idle, and
   the first request after that takes 30 to 60 seconds (README, deploy runbook).
10. **Only the planner's answers reach Gemini.** `planPromptService.js` builds the
    prompt from the planner input; logged workouts are never sent.
11. **The client has no distance conversion.** `app/units.js` converts heights and
    weights only.

## What Strava requires

From Strava's developer documentation and coverage of its API agreement, checked on
2026-11-11. Re-check each point against Strava's own pages while building.

- **A webhook event must be answered with a 200 within two seconds.** Strava tries each
  event three times in all, and then gives up. The subscription's setup GET must also
  echo `hub.challenge` within two seconds. Events are not signed.
- **A new API app can connect one athlete, its owner** ("Single Player Mode"). Strava's
  FAQ says an owner can raise that to 10 athletes from the API settings page, and
  beyond 10 needs Strava's review.
- **The API agreement (November 2024):**
  - an app may show a person's Strava data only to that person;
  - an app may not use Strava data in AI models;
  - an app follows Strava's brand guidelines ("Connect with Strava", "View on Strava").
- **When a person revokes access, the app must delete their Strava data**, unless the
  law or an agreement with them says otherwise. This came from a forum post quoting the
  terms; the agreement's own text could not be opened.

Because the server sleeps far longer than two seconds, a webhook alone would lose most
activities finished while it slept. So C2 adds a catch-up sync.

## Decisions

Made with the owner on 2026-11-11 and 2026-11-12:

- **Activities arrive by webhook, plus a catch-up sync** when the dashboard opens and
  from Settings' Sync now.
- **All activity types import, from the moment of connecting.** Nothing from before.
- **A strength-type activity is skipped when the app already has a workout that day**
  that was logged in the app. Cardio always imports.
- **An import follows Strava.** An edit in Strava updates it, and a delete in Strava
  removes it. Workouts logged in the app are never touched.
- **An import is a workout session, with new nullable columns.**
- **An import cannot be edited in the app, but it can be deleted.** The delete is
  remembered, so the activity never comes back. App-logged workouts still cannot be
  deleted, as today.
- **Everyone sees Connect once the server has Strava keys.** Without them, the row
  reads "Not available".
- **Disconnecting deletes the tokens and every imported workout**, as Strava's terms
  require.

## Design

### Data: migration 008

- **`workout_sessions` gains five nullable columns:**
  - `source`: `'strava'`, or NULL for a workout logged in the app;
  - `external_id`: the Strava activity id, as text;
  - `sport`: Strava's `sport_type` (`Run`, `Ride`, `WeightTraining`…);
  - `distance_meters`: a numeric;
  - `average_heartrate`: a numeric.

  A partial unique index on `(user_id, source, external_id) where external_id is not
null` stops an activity being imported twice. Prisma cannot express it, so the
  repository reads first and then writes, like the other repositories.

- **How an activity becomes a workout:**
  - **date:** the date part of `start_date_local`;
  - **focus:** the sport's label (`Run`, `Weight training`), cut to 80 characters;
  - **minutes:** `moving_time` in minutes, rounded, and NULL when absent;
  - **notes:** the activity's title, cut to the notes limit;
  - **plan link:** none, so it is an off-plan session;
  - **exercises, sets, reps, RPE:** empty or NULL. Progression reads sets, so it ignores
    imports.
- **Absent is not zero:**
  - **Heart rate** is stored only when `has_heartrate` is true and the value is a
    positive number.
  - **Distance** is stored only when it is a positive number. Strava reports
    `distance: 0` for an activity with no distance, such as weight training, so here a
    zero is not a measurement.
  - **Minutes** guard absence before converting.

  Each new helper adds its row to the numeric-coercion contract tests, declaring zero as
  not meaningful.

- **`strava_connections`**, one row per user, `ON DELETE CASCADE` from `app_users`:
  - `athlete_id`, unique, so one Strava account links to one account here;
  - the athlete's display name;
  - `access_token` and `refresh_token`, each encrypted;
  - `expires_at`, `connected_at`, `last_synced_at` and `last_sync_error`;
  - `needs_reconnect`, a boolean.
- **`strava_deleted_activities`**, `(user_id, external_id)`, `ON DELETE CASCADE`: the
  activities deleted in the app, so they are never imported again.

### Tokens

- **AES-256-GCM under `STRAVA_TOKEN_KEY`**, 32 bytes in base64, with a random 12-byte
  nonce for each value. A stored value is `v1.<nonce>.<ciphertext>.<tag>`, so the key
  can be rotated later.
  - A value that fails to decrypt is never guessed at. The connection is marked
    `needs_reconnect`.
- **A token never leaves the server's memory unencrypted:**
  - never in a response;
  - never in a log line, since no Strava response object or token is ever passed to
    the logger;
  - never in a Sentry event: a test asserts that a thrown Strava error carries none.
- **Refreshing takes a lock.** Strava issues a new refresh token on every refresh, so
  two refreshes at once could each spend the old token and store different new ones.
  - A refresh runs in a transaction after `pg_advisory_xact_lock`, keyed on the user
    with its own namespace.
  - It reads the row again under the lock, and uses the stored access token when
    another request has already refreshed it.
  - A token is refreshed when it expires within five minutes.

### The Strava client: `services/external/stravaClient.js`

- **The calls:** the OAuth code exchange, the refresh, the revoke, the athlete's
  activity list, and one activity.
- **A test-only base URL.** Every call goes to `STRAVA_BASE_URL`, or to Strava's own
  hosts when that is unset. Startup refuses `STRAVA_BASE_URL` in production, so it
  exists only for the E2E fake.
- **Each call has a timeout.** It aborts like the external-data fetches, and answers a
  typed error: `unauthorized`, `not_found`, `rate_limited`, `capacity`, `unavailable`.
- **Fetch is the boundary tests stub.**

### Connecting

- **`POST /api/integrations/strava/connect`** (CSRF-checked) answers the authorize URL:
  - it carries `scope=activity:read_all`, so private ("Only Me") activities import too;
  - it carries a random `state`, also set as a short-lived HttpOnly cookie, Path
    `/api/integrations/strava`, `SameSite=Lax`, 10 minutes.

  The client navigates to the URL.

- **`GET /api/integrations/strava/callback`** needs a signed-in session. It:
  1. checks that the `state` matches the cookie, then clears the cookie;
  2. treats `error=access_denied` as cancelled;
  3. checks that the granted `scope` includes `activity:read_all` or `activity:read`;
  4. exchanges the code server-side, and stores the connection;
  5. redirects to the Settings tab, with a result that the panel reads once and shows.
- **The results:** connected; cancelled; activity access unticked; Strava's athlete
  limit reached ("Strava isn't accepting more connections for this app yet"); that
  Strava account already linked to another account here; Strava unavailable.
- **`GET /api/integrations/strava`** answers the panel's state: `available` (the server
  has keys), `connected`, the athlete's name, `lastSyncedAt`, `lastSyncError`, and
  `needsReconnect`.
- **Without keys**, the state answers `available: false`, and connect, callback, sync
  and disconnect answer 404.

### The webhook: `/webhooks/strava`

- **It is mounted outside `/api`**, before the CSRF middleware, with its own rate
  limit and the JSON body parser.
- **The GET answers the subscription's setup:** it echoes `hub.challenge` as JSON only
  when `hub.verify_token` equals `STRAVA_WEBHOOK_VERIFY_TOKEN`, and is a 403 otherwise.
- **A POST is answered 200 at once and handled afterwards**, in the same process.
  - **Ignored:** an event whose `subscription_id` is not `STRAVA_WEBHOOK_SUBSCRIPTION_ID`,
    or whose `owner_id` is not a connected athlete.
  - **Strava doesn't sign events, so an event is only a hint**, checked against Strava:
    - **activity created or updated:** fetch the activity, then import or update it;
    - **activity deleted:** fetch it, and only a `not_found` removes the import;
    - **athlete deauthorized** (`updates.authorized` is `"false"`): try a refresh, and
      only a refusal disconnects.
  - A forged event costs at most an API call.
  - A failure while handling is logged with the event's type and ids, never its body,
    and left to the catch-up.
- **The subscription** is one per Strava app. The owner manages it with
  `server/scripts/strava-webhook.mjs create|view|delete`, run in their own terminal
  with the server's environment.

### Catch-up sync

- **`POST /api/integrations/strava/sync`:**
  - **When:** the dashboard calls it on opening, and Settings' Sync now calls it with
    `{ manual: true }`.
  - **Throttle:** the server runs it at most once every 15 minutes per user, or once a
    minute when manual, and otherwise answers the last result.
- **What it reads:** activities after `max(connected_at, now − 7 days)`, 100 to a page,
  at most 3 pages. New ones are imported and changed ones updated.
- **Deletes, only from a complete list:** when every page came back, an import in that
  window that is no longer in the list is removed. A partial list removes nothing.
- **The answer:** `{ imported, updated, removed, lastSyncedAt }`, or the error kind.
- **What it misses:** an edit, made while the server slept, to an activity older than
  seven days. Strava's webhook is the only path for those.

### The import rules

They live in `services/integrations/stravaImport.js`, pure functions of an activity
and what the user already has:

- **An activity deleted in the app is skipped.**
- **A strength-type activity is skipped when the user has an app-logged workout on its
  date.** The strength types are `WeightTraining`, `Workout` and `Crossfit`. The check
  runs at every import, so after the app's own workout is gone the next sync brings
  the activity in.
- **An import already in the app stays** when a workout is logged in the app on the
  same day afterwards. The skip applies only to bringing an activity in.
- **An update changes only the fields Strava supplies.** It never touches a session
  whose `source` is NULL.

### Disconnecting, and deleting the account

- **`DELETE /api/integrations/strava`**, with Settings' confirm saying the imported
  workouts will be removed:
  1. asks Strava to revoke access, as a best effort;
  2. deletes the connection, every session with `source = 'strava'`, and the deleted
     list, in one transaction.
- **A confirmed deauthorization** does the same.
- **Deleting the account** asks Strava to revoke first, as a best effort, and the
  cascade removes the rest. A failed revoke never blocks deleting the account.

### Deleting an import

- **`DELETE /api/dashboard/workouts/:id`** deletes the session only when it is the
  user's and its `source` is `'strava'`. It answers 404 otherwise, so it can't delete
  an app-logged workout.
- **The same transaction** adds its activity id to `strava_deleted_activities`.

### Failures

- **Strava down, slow or rate-limited:**
  - the sync stops;
  - `last_sync_error` records the kind;
  - Settings says "The last sync didn't finish. It will try again".

  Nothing is deleted, and the dashboard never waits on it.

- **Strava refuses a refresh**, or a token fails to decrypt: the connection becomes
  `needs_reconnect`. Settings shows "Reconnect Strava", and syncing stops.
  - **No import is deleted on a refusal alone,** since a wrong secret on our side would
    look the same.
  - **Imports are deleted only** on a disconnect, or on a deauthorization event that a
    refused refresh confirms.
- **Reconnecting** the same Strava account replaces the tokens and keeps the imports.

### Settings, the server's environment

- **Five settings:** `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_TOKEN_KEY`,
  `STRAVA_WEBHOOK_VERIFY_TOKEN`, `STRAVA_WEBHOOK_SUBSCRIPTION_ID`.
- **The startup check:**
  - The first three are all set or all unset; partly set is a startup error.
  - The key must decode to 32 bytes.
  - The two webhook settings are optional. Without them the webhook route answers 404,
    and the catch-up still works.
  - `STRAVA_BASE_URL` is a startup error in production.
- **Documented** in the README's environment table, and blank in `env.example`.
- **The owner sets them in Render. Claude never reads them.**

### The client

- **`app/strava.js`** holds the calls: state, connect, sync, disconnect, and deleting
  an import.
- **`settings/SettingsStravaPanel.jsx`**, in the Connected Apps tab, replaces the
  "Wearable devices" and "Last sync" rows. The other placeholder rows stay as they are.
  It shows:
  - "Not available" when the server has no keys;
  - "Connect with Strava", Strava's own button artwork, as its guidelines ask;
  - "Connected as", then the athlete's name, with the last sync time, Sync now and Disconnect, behind a
    confirm;
  - "Reconnect Strava" when `needsReconnect`;
  - the callback's result, once.
- **The Workouts list, for an import:**
  - a "From Strava" label, its sport, and a "View on Strava" link to the activity;
  - its distance in the user's units (`toKmOrMi` in `app/units.js`, with its contract
    row), and its average heart rate in bpm, each only when present;
  - Delete, behind a confirm. It is disabled offline, with the existing offline hint,
    since the outbox replays saves, not deletes.
- **Opening the dashboard** starts the catch-up once, quietly. After it returns with
  anything imported, updated or removed, the dashboard reloads its workouts. A failed
  sync never blocks or alerts.

### Strava data and AI

- **Imports never reach Gemini.** The prompt is built from the planner's answers only.
  A test builds a prompt for a user with imports and asserts that no import field
  appears in it.

### Testing

- **Server unit tests:**
  - the mapping, with Strava's absent and zero fields;
  - the import rules;
  - encryption: a round trip, a tampered value failing, a wrong key failing;
  - the client's error kinds, with fetch stubbed;
  - the environment checks;
  - the Sentry and log checks, so that no token appears in either.
- **Repository and route tests, against Postgres, with Strava stubbed at fetch:**
  - **connecting:** a state mismatch, an unticked scope, the athlete limit, an athlete
    already linked;
  - **the webhook:** the setup check, a forged event ignored, a create, an update, and
    a delete confirmed by a 404;
  - **the sync:** the throttle, and a partial list deleting nothing;
  - **deleting:** an import deleted and remembered, an app-logged workout refused with
    a 404;
  - **disconnecting:** the imports and tokens gone, and the account-delete cascade;
  - **two refreshes at once**, staged with deferred promises.
- **Contract tests:** the new numeric helpers' rows on both sides.
- **Client tests:** the panel's states, the callback result, an import's row in the
  Workouts list, and the delete.
- **E2E (`e2e/strava.spec.js`), against a fake Strava** (`e2e/fakeStrava.mjs`, a tiny
  local server):
  - the authorize redirect, the callback with real cookies, an import showing in the
    Workouts list, a delete, and a disconnect removing the rest;
  - `a11y.spec.js` scans the panel.
- **Coverage:** client branches have 0.02 of slack. Every PR covers each branch and
  function it adds.

### Rollout

Each PR ships after the one it relies on:

1. **Docs:** this spec and its plan.
2. **Server, unused:** migration 008, the repositories, token encryption, and the
   environment checks.
3. **Server:** the Strava client, the mapping, the import rules, and the locked refresh.
4. **Server:** connect, callback, state, disconnect, and the revoke on account delete.
5. **Server:** the webhook and the subscription script.
6. **Server:** the sync, and deleting an import.
7. **Client:** the Settings panel.
8. **Client:** imports in the Workouts list, and the sync on opening the dashboard.
9. **E2E:** the fake Strava and `strava.spec.js`.
10. **Close-out:** the floor PRs, then the docs, the roadmap's status and memory.

Until the owner sets the keys, production shows "Not available", so every step is
safe to deploy.

### What the owner does, after PR 9

1. Register an API app at strava.com/settings/api, with the callback domain set to the
   Render host.
2. Set the five settings in Render.
3. Run `strava-webhook.mjs create` once, and set the subscription id it prints.

## Risks

- **A token leaking.** It is encrypted at rest, never logged, never returned, and
  tests assert it is absent from logs and Sentry events.
- **Lost activities while the server sleeps.** The catch-up covers the last seven days.
- **A forged webhook.** Every event is checked against Strava before anything changes.
- **Deleting someone's history by mistake.** Only an import is ever deleted, only on a
  confirmed signal, and a partial list deletes nothing.
- **Strava's limits.** One athlete until the owner raises it; Settings says so plainly
  when Strava refuses.
- **Strava's terms changing.** The points above were checked through coverage, not the
  agreement's text, so they are re-checked while building.

## Out of scope

- Garmin (G2), Apple Health and Health Connect (C3).
- Importing activities from before connecting.
- Routes, maps, splits, laps, power, cadence, elevation, and heart-rate streams.
- Writing to Strava: uploading the app's workouts.
- Editing an import in the app, and deleting an app-logged workout.
- Using imports in plan generation or progression.
