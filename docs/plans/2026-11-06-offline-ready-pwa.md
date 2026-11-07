# Offline-ready PWA, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app installs, opens with no signal (and while Render wakes) from the last
signed-in user and their cached dashboard, and keeps workout, meal and calorie entries on
the device until the server has them, exactly once. This is roadmap C1. No gate applies.

The work is one docs PR, one server PR, three client PRs, a floor PR per side whose figure
rose, and a close-out docs PR.

**Design:** `docs/specs/2026-11-06-offline-ready-pwa-design.md`. Where this plan names a
behaviour, the spec's wording wins.

**Architecture:** `vite-plugin-pwa` in `generateSW` mode writes the worker and the manifest;
the worker precaches the shell and never touches `/api`. The page owns the offline state:
a cached session in localStorage, a connection store fed by every request, and a
per-account outbox that `useOptimisticLogs` writes to when a send fails and a replay hook
drains. The server's existing read-then-write by `legacy_id` makes a replay an update.

**Tech Stack:** React 19, Vite 8, vite-plugin-pwa 2.0.0 with Workbox 7, Express 5, zod,
Prisma with Postgres, Vitest 5 with v8 coverage, supertest, Testing Library, Playwright,
Node 24, GitHub Actions, gh CLI.

**Status: not started.**

Every file and line below was read on `02e93f6`.

---

## Owner's decisions

Made 2026-11-06:

- **Open offline:** the shell, the last signed-in user and their last dashboard stay on the
  device.
- **The three logs queue:** workouts with their sets, meals and calories. Every other write
  is disabled offline.
- **Sign-out warns, then discards** what still cannot be sent.
- **A new version is offered with a Reload button, never forced.**
- **`generateSW`, with the queue in the page.** Background Sync was declined.

## Decided while planning

Reading the code for this plan settled points the spec left open. Items 1 to 4 change what
the spec says, and Task 1 applies them to it; 5 to 8 are how this plan builds what it says.

1. **The progression answers are a write that cannot queue.** `useProgression.js` sends the
   plan hub's Undo, Accept, Decline and Train normally as `PUT` and `DELETE` (lines 63 and
   67). They join the disabled list.
2. **The update notice needs no wait of its own.** `ModalPortal` makes everything outside an
   open modal inert, so the notice's Reload cannot be reached while a modal or the planner
   is open, and the notice never reloads by itself. The spec's "waits while the planner or
   any modal is open" becomes that sentence. Its axe scan is dropped too: E2E cannot stage a
   waiting worker without a second build, so the unit test pins the button's name.
3. **The connection store probes while offline.** A request that got no answer marks the
   connection offline, and only an answered request clears it. If nothing else is sent,
   the disabled buttons would stay disabled, so while offline the store sends
   `GET /api/health` every 30 seconds and on the `online` event.
4. **`apiFetch`'s backstop reads `navigator.onLine` only.** Refusing writes on the
   unanswered-request signal could refuse the one request that would prove the server is
   back. The buttons use the full connection state; the backstop refuses only when the
   browser itself reports no network.
5. **The data's age comes from the dashboard cache.** The notice's "from 2 h ago" is the
   cached dashboard's `updatedAt` (`useDashboardData.js`, the write-through effect), not the
   session cache's `savedAt`.
6. **`queueOptimisticLogCommit` takes `{ url, body }` instead of `request`.** The outbox has
   to store the request as data, and the outcome table needs the status, which today's
   `request` closures throw away (`events.js`, the three `if (!res.ok)` branches).
   `useOptimisticLogs` gets `apiFetch` and sends it itself.
7. **A forced CSRF refresh.** `ensureCsrfToken` returns the cookie when one is set
   (`useApiClient.js`), so after a CSRF refusal it would hand back the stale token. It
   gains `{ refresh: true }`, which skips the cookie and asks `/api/csrf-token`.
8. **The `chromium` E2E project blocks service workers** (`serviceWorkers: "block"`), so its
   specs keep testing the network as they do now, and `page.route` still sees every request.
   The worker's specs run in `deployable`, which is also the only project with the CSP.

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md`, README and ADR passages, that describe a change move in
  the PR that makes it. `CLAUDE.md` is 39,211 of its 40,000 bytes: the E2E detail goes in
  ADR 0005 and `e2e/README.md`, with one short line in `CLAUDE.md`.

**Test first.** Every behaviour change starts with its test, which must fail for the right
reason before the change makes it pass. A mutation then shows the test holds. Confirm each
mutation applied before trusting a run, and restore the file from a saved copy (ADR 0015).
Write mutation scripts with the Write tool, never a heredoc, and give each pattern enough
context to match once. Run a new component's tests red before writing it.

**Coverage slack is thin on both sides,** on `02e93f6`:

Slack is `covered - floor / 100 × total`, from the handoff's exact counts:

- Client: statements 1.31 (5541 of 5590 at 99.1), **branches 0.19** (3735 of 3919 at
  95.3), **functions 0.40** (1192 of 1200 at 99.3) and lines 1.06 (4996 of 5015 at 99.6).
- Server, with `client/dist` present: **statements 0.70** (3303 of 3415 at 96.7), branches
  2.09 (2397 of 2606 at 91.9), **functions 0** (585 of 600 at 97.5) and lines 1.00 (2923 of
  3000 at 97.4).
- So every function, branch and line a PR adds ships with its test, and Task 2 adds no
  server function at all.

**Absent is not zero** (ADR 0001). The outbox stores the body the form built, and nothing
here coerces a number; any new numeric reader gets a contract row.

**Gates, in order, from `D:/ai-workout`:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage`, with `--coverage.reporter=json-summary` for exact counts against
   each floor, the server measured with `client/dist` present;
3. for a client PR, the E2E suite (`REDIS_URL= npm run test:e2e`, after a build);
4. for a dependency change, `npx --yes audit-ci@7.1.0 --config security/audit-ci.json`.

Postgres must be up for the server suite (`npm run postgres:local:start -w server`, in the
background; wait for port 55432).

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green before the next
merge. A PR that falls `BEHIND` is updated with `gh pr update-branch` and checked again.
Report after each PR, and wait for "proceed carefully".

## Task 1: the spec and this plan (PR 1)

- [ ] Apply "Decided while planning" 1 to 4 to the spec: the progression answers in the
      disabled list; the update notice's inert sentence; the probe; the backstop's
      `navigator.onLine`.
- [ ] Add both files to `docs/README.md`'s Plans and Specs lists, after the
      adaptive-progression entries.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Branch `docs/offline-ready-pwa` (the spec is already committed there), commit, PR,
      merge when `CLEAN`.

## Task 2: the server takes replays (PR 2)

**Files:**

- Modify: `server/src/services/http/apiSchemaService.js:171`: `caloriesBodySchema` gains
  `id: optionalStringField(64)`.
- Modify: `server/src/routes/dashboard/write/registerWorkoutAndGoalRoutes.js:85`: the
  calorie entry's id.
- Modify: `server/src/repositories/workoutSessionRepository.js:158-161`: an update keeps
  `createdAt`.
- Modify: `server/src/index.js:212-237`: `manifest-src`.
- Test: `server/src/routes/dashboard/write/__tests__/userWrites.integration.test.js` (its
  `POST /api/dashboard/calories` block, line 192),
  `server/src/repositories/__tests__/workoutSessionRepository.test.js`,
  `server/src/__tests__/index.securityHeaders.test.js`.
- Modify: `README.md`'s "Dashboard writes" line: workout, meal and calorie writes take an
  optional client `id`, and a repeat updates the same entry.

The three changes, none of which adds a function:

```js
// registerWorkoutAndGoalRoutes.js, the calorie route. The client's id is the
// replay key (docs/specs/2026-11-06-offline-ready-pwa-design.md): a resent entry
// updates its row in saveCalorieEntry instead of adding a second.
const entry = {
  id: cleanText(body.id, 64) || crypto.randomUUID(),
```

```js
// workoutSessionRepository.js, inside the transaction. A replay is an update,
// and keeps the time the workout was first saved; Prisma leaves a field that
// is undefined untouched.
const saved = existing
  ? await tx.workoutSession.update({
      where: { id: existing.id },
      data: { ...data, createdAt: undefined }
    })
  : await tx.workoutSession.create({ data });
```

```js
// index.js, in the CSP directives. The web app manifest (vite-plugin-pwa)
// is fetched under manifest-src, which falls back to default-src 'none'.
"manifest-src": ["'self'"],
```

Steps:

- [ ] Branch `feat/server-replay-keys`. Set the roadmap's `status/C1` to `active`, with a
      note naming this plan (ArtifactData `set` with no `if_version`; the document does not
      exist yet).
- [ ] **Tests first:**
  - Calories: two posts with the same `id` and different calories leave one manual row for
    the date, holding the second figure; two posts without an id still leave two rows, as
    today; an `id` of 65 characters is a 400.
  - Workouts: a save, then a save with the same id and a different focus, leaves one row
    with the new focus and the first save's `createdAt`. Pin the clock between the two
    saves (`vi.setSystemTime`), so the test cannot pass by both saves landing in one
    millisecond.
  - CSP: `directive(await getCsp(), "manifest-src")` is `'self'`, in a new test in the
    "is sent at all" describe, beside "allows the app to call its own API".
- [ ] Run them red: the calorie route mints a fresh id; the update writes `createdAt`; there
      is no `manifest-src`.
- [ ] Make the three changes, and run the tests green.
- [ ] **Mutations,** each of which must fail a test: the body id ignored; the `createdAt: undefined` line dropped; `manifest-src` removed; `optionalStringField(64)` as `(65)`.
- [ ] Gates and server coverage. The function count must not move; check it in the
      json-summary.

## Task 3: the three logs carry a replay key (PR 3)

**Files:**

- Modify: `client/src/app/events.js`: `submitWorkout` (line 380 on), `submitCalories` (line
  451 on) and `submitMealLog` (line 623 on).
- Test: `client/src/app/__tests__/events.handlers.test.js` (`describe("submitWorkout")` at
  line 55, `describe("submitCalories")` at line 179, and the meal block).

Each handler mints the key beside its optimistic id and sends it as `id`. The optimistic id
stays the UI's: `useProgression.js:30` leaves out every id starting `optimistic-`, and the
server hands `legacy_id` back as the entry's `id`.

```js
// The replay key the server stores as legacy_id, so a resent entry updates its
// row (docs/specs/2026-11-06-offline-ready-pwa-design.md). Not the optimistic
// id, which useProgression reads as "not saved yet".
const clientId = crypto.randomUUID();
const payload = { ...link, id: clientId, date: workoutForm.date /* … as today */ };
```

Steps:

- [ ] Branch `feat/client-replay-keys`.
- [ ] Confirm jsdom exposes `crypto.randomUUID` in this suite (a one-line test). If it does
      not, stub it in `client/src/test/setup.js` with Node's `crypto.randomUUID`.
- [ ] **Tests first:** for each of the three handlers, the sent body's `id` matches the UUID
      shape, is different on a second submit, and does not start `optimistic-`; the
      optimistic item's id still does.
- [ ] Run them red, add the keys, run them green.
- [ ] **Mutations:** the body's `id` set to the optimistic id; the key minted once at module
      scope instead of per submit.
- [ ] Gates, client coverage and E2E. No server change: the server already takes an `id`
      for workouts and meals, and Task 2's calorie change is live.

## Task 4: the worker, the manifest and the update notice (PR 4)

**Files:**

- Modify: `client/package.json`, `package-lock.json`: `vite-plugin-pwa@2.0.0` as a dev
  dependency, and `workbox-window` at the 7.4 release `vite-plugin-pwa` resolves, pinned
  exactly, as a dependency (the registration module imports it at runtime). Both releases
  must be at least two weeks old; check with `npm view <pkg> time --json`.
- Modify: `client/vite.config.js`: the plugin.
- Create: `client/public/icons/icon.svg`, `pwa-192.png`, `pwa-512.png`,
  `pwa-maskable-512.png`, `apple-touch-icon-180.png`.
- Modify: `client/index.html`: `<meta name="theme-color" content="#000000">` and
  `<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">`.
- Create: `client/src/app/hooks/useWorkerUpdate.js`, and its test.
- Modify: `client/src/app/components/AppNotice.jsx`: an optional action button
  (`actionLabel`, `onAction`), beside Dismiss. Its test grows.
- Modify: `client/src/App.jsx`: the update notice.
- Modify: `client/src/test/setup.js`: a default mock of `virtual:pwa-register/react`.
- Modify: `eslint.config.js`: `import-x/no-unresolved` ignores `^virtual:`.
- Modify: `knip.jsonc`, only if knip reports the virtual import or the plugin.
- Modify: `playwright.config.js`: `serviceWorkers: "block"` in the `chromium` project.
- Modify: `e2e/deployable.spec.js`: the worker and offline-reload tests.
- Modify: `docs/adr/0005-testing-across-the-wire.md`, `e2e/README.md`, and one line in
  `CLAUDE.md`'s E2E list: the `chromium` project blocks workers; worker specs run in
  `deployable`.

The plugin, after `react()`:

```js
import { VitePWA } from "vite-plugin-pwa";

// The installable shell (docs/specs/2026-11-06-offline-ready-pwa-design.md).
// The worker precaches the build and answers navigations with index.html, but
// never an /api path, and caches no API response: the page's localStorage
// caches own the data. "prompt" leaves activating a new worker to the visitor.
VitePWA({
  strategies: "generateSW",
  registerType: "prompt",
  injectRegister: false,
  includeAssets: ["icons/apple-touch-icon-180.png"],
  manifest: {
    name: "PATH | Personalized AI Training Hub",
    short_name: "PATH",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    theme_color: "#000000",
    background_color: "#000000",
    icons: [
      { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/pwa-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  },
  workbox: {
    globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
    navigateFallback: "/index.html",
    navigateFallbackDenylist: [/^\/api(\/|$)/],
    cleanupOutdatedCaches: true
  }
});
```

The hook wraps the plugin's React module, and is the only importer of it:

```js
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Whether a new version of the app is waiting, and `reload`, which activates
 * it and reloads the page. In development the plugin's module registers no
 * worker, so `ready` stays false.
 */
export default function useWorkerUpdate() {
  const {
    needRefresh: [ready],
    updateServiceWorker
  } = useRegisterSW();
  return { ready, reload: () => updateServiceWorker(true) };
}
```

App renders `<AppNotice message="A new version is ready." actionLabel="Reload"
onAction={reload} />` when `ready` and no session notice is showing. The session notice
wins, because it says the visitor's data is stale.

**The icons** are drawn once as `icon.svg`: the letter P in white on black, in the app's
display face, centred, with the maskable variant's mark inside the central 80% safe zone.
Render the PNGs with a scratch script in the session scratchpad that opens the SVG in
Playwright's Chromium at each size and screenshots it. Commit the SVG and the PNGs, not the
script. The owner can replace the art without a code change.

Steps:

- [ ] Branch `feat/pwa-shell`.
- [ ] Install, then run the audit check. If audit-ci reports a new advisory through
      `workbox-build`, stop and report it rather than allowlisting it.
- [ ] Confirm Vitest resolves `virtual:pwa-register/react` through the plugin when a test
      mocks it. If it does not, alias the id in the `test` block to a stub in
      `client/src/test/`, and say so in the PR.
- [ ] **Tests first:**
  - `useWorkerUpdate`: `ready` follows the mocked `needRefresh`; `reload` calls
    `updateServiceWorker(true)`.
  - `AppNotice`: the action button renders only with both props, is named by
    `actionLabel` (`getByRole("button", { name: "Reload" })`), and calls `onAction`.
  - App: the update notice shows when `ready`; Reload calls `reload`; the session notice
    replaces it while the session is unchecked.
- [ ] Run them red, write the hook, the notice and the plugin config, run them green.
- [ ] `npm run build`, then check `client/dist`: `sw.js`, `manifest.webmanifest` and the
      icons are there, and `sw.js`'s precache list names `index.html` and the hashed
      bundles. Record the main chunk's size against 464,368 bytes, in exact bytes.
- [ ] **E2E, in `deployable.spec.js`:**
  - The worker installs: after `page.goto("/")`,
    `navigator.serviceWorker.ready` resolves, and after a reload
    `navigator.serviceWorker.controller` is set.
  - The manifest: `page.request.get("/manifest.webmanifest")` is 200 with
    `application/manifest+json`, served `no-cache`, and the page load reports no CSP
    violation (`watchForCspViolations`).
  - Offline: once controlled, `context.setOffline(true)`, reload, and `#root` has content.
    First confirm that `setOffline` reaches the worker's own fetches in this Playwright
    version: with it offline, a request that bypasses the precache must fail. If it does
    not reach them, cut the network with `context.route("**/*", (r) => r.abort())` for
    non-precached URLs instead, and say so in the PR.
- [ ] Set `serviceWorkers: "block"` on the `chromium` project, and confirm its specs still
      pass unchanged.
- [ ] **Mutations:** `/api` removed from the denylist (an offline navigation to an `/api`
      path must not get the shell; add that assertion); `registerType` as `"autoUpdate"`
      (the App test asserting no reload without a click fails); the action button rendered
      without `onAction`.
- [ ] Gates, client coverage, E2E, and the docs lines.

## Task 5: opening offline (PR 5)

**Files:**

- Create: `client/src/app/connection.js`: the connection store.
- Create: `client/src/app/hooks/useConnection.js`: `useSyncExternalStore` over it.
- Create: `client/src/app/describeAge.js`: "2 h ago" from two timestamps.
- Modify: `client/src/app/network.js`: `fetchWithTimeout` reports each outcome to the store.
- Modify: `client/src/app/hooks/useApiClient.js`: the backstop, and
  `ensureCsrfToken({ refresh })` for Task 6.
- Modify: `client/src/app/constants.js`: the session cache key,
  `ai-workout-session-cache-v1`, as `SESSION_CACHE_KEY`.
- Modify: `client/src/App.jsx:459-487`: the session check's cached branch, and the offline
  notice.
- Modify: `client/src/app/events.js`: the sign-in paths (lines 306 and 329) write the
  session cache; `onLogout` (line 339) and `deleteAccount` (line 573) remove it.
- Modify, each to read `useConnection()` and disable its submit with "You're offline"
  beside it: `pages/dashboard/views/CaloriesView.jsx` (goals, body weight),
  `pages/dashboard/views/TipsView.jsx` (save an exercise), the saved exercise's remove
  control, `app/components/PlannerSetupModal.jsx` (Generate),
  `pages/dashboard/views/SettingsView.jsx` (profile),
  `pages/dashboard/settings/SettingsAccountPanel.jsx` (password, delete), and the plan
  hub's progression answers (the component `useProgression` serves).
- Modify: `client/src/styles/app.css` (or the owning view's sheet): `.offline-hint`, one
  muted line.
- Tests: beside each file, in its `__tests__/`.

The store's exports:

- `getConnection()`: `"online"` or `"offline"`. Offline when the browser reports no
  network, or when the last request got no answer; online again on the next answered
  request.
- `subscribeConnection(listener)`: calls `listener` on each change, once; returns the
  unsubscribe.
- `markAnswered()` and `markUnanswered()`: what `fetchWithTimeout` reports.
- While offline, the store sends `GET /api/health` every 30 seconds and on the browser's
  `online` event, so a page with nothing else to send still finds the server again. The
  timer starts on the first subscriber and stops when online or when the last subscriber
  leaves.

The backstop also refuses `POST /api/auth/logout` offline. That is harmless: `onLogout`
already catches a failed logout request, signs out locally and shows the
"could not end your session" notice, as it does on a dead network today.

`fetchWithTimeout` calls `markAnswered()` when `fetch` resolves, whatever the status, and
`markUnanswered()` when it rejects or times out. The probe uses `fetch` directly with its
own deadline, so it does not report into the store recursively; its answer calls
`markAnswered()`.

Steps:

- [ ] Branch `feat/open-offline`.
- [ ] **Tests first:**
  - `connection.js`, with fake timers and a stubbed `navigator.onLine`: starts online when
    the browser is; `offline` event and `markUnanswered` go offline; `markAnswered` and an
    answered probe go online; the probe runs every 30 s only while offline, and stops when
    online; subscribers hear each change once.
  - `network.js`: a resolved fetch, including a 500, marks answered; a rejection and a
    timeout mark unanswered.
  - `describeAge`: under a minute is "just now"; 5 minutes, 2 hours and 3 days read
    "5 min ago", "2 h ago", "3 days ago"; a missing or future time is null, and the notice
    then leaves the age out.
  - `useApiClient`: with `navigator.onLine` false, a write to any path other than the
    three log paths (`/api/dashboard/workout-sessions`, `/api/dashboard/meal-logs` and
    `/api/dashboard/calories`) rejects with "You're offline. This needs a connection." before
    fetching; the three log paths and every GET are not refused; `ensureCsrfToken` with
    `refresh: true` fetches `/api/csrf-token` although a cookie is set.
  - App's session check:
    - a 200 writes the session cache;
    - a 401 removes it and signs out;
    - a network error with a cached user signs that user in, shows the offline notice
      with the dashboard cache's age, and keeps retrying; the next 200 replaces the user;
    - a network error with no cached user shows today's notice;
    - a cached user scoped to another email than a later 200's is replaced, and the
      dashboard is that account's.
  - Sign-in writes the cache; `onLogout` and `deleteAccount` remove it.
  - Each disabled control: disabled with "You're offline" when the store is offline, and
    enabled when it is online. The three log forms are never disabled.
- [ ] Run them red, write the store, the hook, the helper and the wiring, run them green.
- [ ] axe: add the offline notice to `e2e/a11y.spec.js` by going offline on the dashboard
      (the `chromium` project blocks the worker, which this does not need).
- [ ] **Mutations:** the cached branch taken on a 401; the probe left running while online;
      `markAnswered` only for 2xx; the backstop applied to the log paths; one control's
      `disabled` dropped.
- [ ] Gates, client coverage and E2E.

## Task 6: the outbox (PR 6)

**Files:**

- Create: `client/src/app/outbox.js`: storage.
- Create: `client/src/app/classifySendFailure.js`: the outcome table.
- Create: `client/src/app/hooks/useOutboxReplay.js`: the replay.
- Modify: `client/src/app/hooks/useOptimisticLogs.js`: `{ url, body }`, `apiFetch`, the move
  to the outbox, and rehydration.
- Modify: `client/src/app/events.js`: the three handlers pass `{ url, body, clientId }`;
  `onLogout` checks the outbox and asks; `deleteAccount` clears it.
- Modify: `client/src/App.jsx`: pass `apiFetch` to `useOptimisticLogs`, run
  `useOutboxReplay`, and render the sign-out confirm.
- Create: `client/src/app/components/SignOutConfirm.jsx` (in `ModalPortal`), and its test.
- Modify: the workout, meal and calorie lists (`views/WorkoutsView.jsx`, `views/MealView.jsx`
  and `views/CaloriesView.jsx`): a row whose item has `isQueued` shows "Not sent yet".
- Tests: beside each file.

`outbox.js` keeps log entries the server has not confirmed, in localStorage under
`ai-workout-outbox-v1:<scope>` (`buildScopedCacheKey` with an `OUTBOX_CACHE_PREFIX` in
`constants.js`), oldest first. Each entry is `{ clientId, type, url, body, item, queuedAt }`.
Its exports:

- `readOutbox(user)`: the entries, or `[]` with no storage or bad JSON.
- `addToOutbox(user, entry)`: true when stored, false when storage refused the write, so
  the caller never shows an entry as kept when it was not. An entry with a `clientId`
  already there replaces it. It does its own `try`/`catch` around `setItem`, because
  `writeJsonCache` swallows the failure this needs to see.
- `removeFromOutbox(user, clientId)` and `clearOutbox(user)`.

`classifySendFailure({ status, error })` says what to do with a log send that did not
succeed. `status` is null when no answer came, and `error` is the body's `error` string.

- `"queue"`: no answer, a 5xx, a 429 or a 401.
- `"refresh"`: a 403 whose error is the CSRF guard's, `"Invalid or missing CSRF token."`
  (`sessionService.js:513`).
- `"drop"`: any other 4xx, which a resend cannot fix.

The send inside `useOptimisticLogs`, for one entry: `apiFetch(url, { method: "POST", … })`;
on 2xx, as today; on "refresh", `ensureCsrfToken({ refresh: true })` and one resend, whose
failure is classified again without a second refresh; on "queue", `addToOutbox`, and the
entry stays on screen with `isQueued: true` and "Not sent yet"; if `addToOutbox` returns
false, report the error as today; on "drop", as today.

`useOutboxReplay({ user, apiFetch, ensureCsrfToken, setDashboard, showDashboardToast,
removeQueuedEntry })` sends the outbox one entry at a time, oldest first, when `user` is
set, on the `online` event, when the connection store turns online, and every 30 seconds
while the outbox has entries and the store is online. It runs inside
`navigator.locks.request("ai-workout-outbox", { ifAvailable: true }, …)` when
`navigator.locks` exists, and directly otherwise. Each entry's outcome follows
`classifySendFailure`; "queue" stops the run, leaving that entry and the rest. A run that
saved any entries ends with one toast: "1 entry saved." or "N entries saved." It checks
`captureAccount` before applying an answer, as the sends do today.

Sign-out: `onLogout` flushes as today, then reads the outbox. When it is empty, sign-out
goes on as today. Otherwise it opens `SignOutConfirm` ("N entries haven't reached the
server and will be lost.", Cancel and Sign out anyway); Sign out anyway runs the rest of
today's `onLogout` and `clearOutbox`. `deleteAccount` calls `clearOutbox` with the other
caches.

Steps:

- [ ] Branch `feat/outbox`.
- [ ] **Tests first:**
  - `outbox.js`: add, read, remove and clear; two accounts never see each other's entries;
    a second add with the same `clientId` replaces the first; bad JSON reads as empty; a
    throwing `setItem` makes `addToOutbox` return false.
  - `classifySendFailure`: one test per row of the spec's table, plus a 403 with another
    error (drop), a 503 (queue) and a 413 (drop).
  - `useOptimisticLogs`: a send with no answer moves to the outbox and the entry stays with
    `isQueued`; a 400 is dropped with its error, as today; a CSRF 403 refreshes once and
    resends, and a second CSRF 403 is dropped; a storage failure reports the error; the
    outbox's entries are on screen after a remount; undo is not offered on a queued entry.
  - `useOutboxReplay`, with fake timers: replays oldest first, one at a time; stops at the
    first "queue" and keeps the rest; drops a 400 and goes on; one toast per run with the
    count; a run inside a held lock is skipped (`ifAvailable` answers null); with no
    `navigator.locks`, runs directly; an answer after a sign-out touches nothing.
  - `SignOutConfirm`: names the count, Cancel keeps the session and the outbox, Sign out
    anyway signs out and empties it; Escape is Cancel (`useCloseOnEscape`).
  - The lists: a queued item shows "Not sent yet", a saved one does not.
- [ ] Run them red, write the modules, the hook, the modal and the wiring, run them green.
- [ ] **E2E, a new `e2e/offline.spec.js`, matched by the `deployable` project**
      (`testMatch: /(deployable|offline)\.spec\.js/`):
  - Sign up, open the dashboard, wait for the worker to control the page.
  - `context.setOffline(true)` (or Task 4's fallback), log a workout with a focus unique to
    the run, and see "Not sent yet" after the undo window.
  - Reload while offline: the entry is still there, still "Not sent yet".
  - Go online: "1 entry saved." appears; reload; the workouts list holds exactly one row
    with that focus.
  - Delete the account, as every spec here does.
  - The run uses about 2 of the 10 credential-limit slots; run locally with `REDIS_URL=`.
- [ ] axe: the sign-out confirm, in `e2e/a11y.spec.js`, with an entry queued.
- [ ] **Mutations:** a 401 classified "drop"; the replay not stopping at "queue"; the
      `clientId` dedupe in `addToOutbox` dropped; `clearOutbox` dropped from
      `deleteAccount`; the account check dropped from the replay.
- [ ] Gates, client coverage and E2E. Measure the main chunk again, in exact bytes.

## Task 7: floors (PR 7 and PR 8)

- [ ] Measure both sides with `--coverage.reporter=json-summary`, the server with
      `client/dist` present. For each side whose figure rose, raise its floors to the
      measurement truncated to one decimal, with the `Measured <date>` note, in its own PR
      (`chore/floors-client-offline-ready-pwa`, `chore/floors-server-offline-ready-pwa`).
      Never lower a floor. A side whose figures equal its floors gets no PR.

## Task 8: close-out (PR 9)

- [ ] Mark this plan done, with every place the work went past or departed from it, and the
      spec applied, with the PRs.
- [ ] Set the roadmap's `status/C1` to `done` with ArtifactData (`if_version`) after the last
      PR deploys ready.
- [ ] Write the memory file, and update the handoff: C1 done, B6 and C3's C1 dependency met.
