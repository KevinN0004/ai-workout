# Offline-ready PWA, design

Status: **decided 2026-11-06**, section by section with the owner. The plan is
`docs/plans/2026-11-06-offline-ready-pwa.md`. This is roadmap C1. No gate applies to it.

Gyms often have poor signal, and a logged set must not vanish because one request failed.
Render's free tier also sleeps after 15 minutes idle, so the first request after a quiet
spell can take longer than the client's 15-second deadline. C1 makes the app installable,
opens it without a connection, and keeps workout, meal and calorie entries on the device
until the server has them.

## What was found

Read on `02e93f6`.

1. **There is no manifest, service worker or icon.** `client/` has no `public/` folder, and
   `client/index.html` holds only the title and the root.
2. **The server already treats a client id as a replay key for workouts and meals.**
   `buildWorkoutSessionEntry` and `buildMealLogEntry` keep `input.id` (up to 64 characters)
   and mint a UUID only when there is none. `saveWorkoutSession` and `saveMealLog` store it
   as `legacy_id` and update the user's row that already carries it, read-then-write,
   behind the partial unique index `(user_id, legacy_id) where legacy_id is not null`. The
   client sends no id today.
3. **Calories ignore a client id.** `POST /api/dashboard/calories` builds its entry with
   `id: crypto.randomUUID()` on every request, so a replayed calorie entry would be saved
   twice. `saveCalorieEntry` already reads-then-writes by `legacy_id`.
4. **A replayed workout would reset its `createdAt`.** The builder sets `createdAt` to the
   server's now, and the update writes it.
5. **The id the server returns is the stored `legacy_id`** (`id: row.legacyId || row.id` in
   each mapper). The client's optimistic id, `optimistic-<type>-<time>-<hex>`, must not be
   sent: `useProgression` leaves out every id that starts `optimistic-` as not yet saved
   (`useProgression.js`), so a saved workout carrying one would never count.
6. **A pending entry lives only in memory.** `useOptimisticLogs` holds each workout, meal and
   calorie entry for the undo window, then sends it. A failed send is reported and the entry
   dropped; a reload loses anything unsent.
7. **Opening the app offline stops at the sign-in check.** App's `/api/auth/me` check
   retries while it gets no answer (a network error, a timeout or a non-401 status) and
   shows "Can't reach the server to check your sign-in. Trying again...", with no user.
8. **The dashboard is already cached per account.** `useDashboardData` writes every
   dashboard to localStorage under `DASHBOARD_CACHE_PREFIX` scoped by account
   (`buildScopedCacheKey`) and rehydrates from it. Sign-out and account deletion remove it.
9. **The CSP blocks a manifest.** `default-src 'none'` with no `manifest-src`
   (`server/src/index.js`). A worker gets through: `worker-src` falls back to
   `script-src 'self'`, and when the Sentry line adds `worker-src` it includes `'self'`.
   Only the `deployable` E2E project, on the express origin, sees the CSP at all.
10. **`staticClient.js` needs no change.** A file outside `assets/` is served `no-cache`,
    which a worker script and a manifest both want.
11. **`vite-plugin-pwa` 2.0.0** (published 3 Oct 2026) lists Vite 8 as a peer. The client
    is on Vite 8.3.

## Decisions

Made with the owner on 2026-11-06:

- **Open offline.** The shell, the last signed-in user and their last dashboard stay on
  the device, so the app opens with no signal, and while Render wakes.
- **The three logs queue.** Workouts (with their sets), meals and calories. Every other
  write is disabled offline.
- **Sign-out warns, then discards.** Entries that still cannot be sent are named in a
  confirm, and nothing stays on the device after sign-out.
- **A new version is offered, never forced.** A notice with a Reload button.
- **`vite-plugin-pwa` in `generateSW` mode, with the queue in the page.** Background Sync
  was declined: it is Chromium-only, and the page's Undo and error handling could not see
  a queue held inside the worker.

## Design

### The shell and install

- **The worker.** `vite-plugin-pwa` in `client/vite.config.js`, `strategies: "generateSW"`,
  `registerType: "prompt"`.
  - It precaches `index.html` and everything the build writes to `assets/`.
  - It answers every navigation with the cached `index.html`, except a path under `/api`
    (`navigateFallbackDenylist`).
  - It caches no `/api` response. API data stays in the localStorage caches, so each kind
    of data has one owner.
  - Google Fonts are not cached. Offline, the app falls back to system fonts.
- **The manifest.**
  - Name "PATH", full name "PATH | Personalized AI Training Hub".
  - `display: "standalone"`, `start_url: "/dashboard"`, and theme and background colours
    from `styles/base.css`.
  - Icons: one mark drawn as SVG, rendered once to 192 px, 512 px and a maskable 512 px PNG,
    and committed in `client/public/`. The owner can replace the art without a code change.
- **The server.** The CSP gains `manifest-src 'self'`, and a test pins it.
- **Registration.** A small module registers the worker in production builds only. Dev,
  `vite preview` with no build, and Vitest never register one.

### Opening offline

- **A cached session.**
  - A localStorage entry, `ai-workout-session-cache-v1`, holds `{ user, savedAt }` from the
    last successful session check or sign-in, through `cache.js`.
  - It is removed on a 401, on sign-out and on account deletion, where the dashboard cache
    is removed today.
- **The session check.**
  - When it gets no answer and a cached user exists, App signs that user in from the cache
    and keeps retrying as it does now.
  - A 200 sets the user and refreshes the cache; a 401 signs out and removes it. Both as
    today.
  - So when Render is waking, the 15-second deadline passes, the dashboard renders from its
    cache, and the first retry that answers takes over.
- **`useConnection`**, one shared hook, reports `online` or `offline`.
  - It reads `navigator.onLine` and the `online` and `offline` events.
  - A request that got no answer also counts as offline, because `onLine` stays true on Wi-Fi
    with no internet. The next answered request counts as online again.
- **What offline looks like.**
  - With a cached user, the notice reads "Offline — showing your data from 2 h ago. Entries
    you log are saved on this device and sent when you reconnect." Without one, today's
    sign-in notice stays.
  - The submit of each write that cannot queue is disabled, with "You're offline" beside it:
    goals, body weight, saved exercises, plan generation, and the profile, password and
    account-deletion settings.
  - `apiFetch` refuses those writes at once while offline, as a backstop for a control that
    was missed.

### The outbox

- **The replay key.**
  - Each workout, meal and calorie entry gets a `clientId` from `crypto.randomUUID()` when it
    is logged, and its request body carries it as `id`.
  - The optimistic id stays the UI's (found 5).
  - The calorie route keeps a body `id` (`cleanText(body.id, 64) || crypto.randomUUID()`),
    and the calorie schema declares it.
  - A workout update keeps the row's first `createdAt` (found 4).
  - A replay therefore updates the same row. Two tabs racing on one id cannot make two rows:
    the partial unique index refuses the second insert, and that entry's next replay is an
    update.
- **When a send fails.** After the undo window, the send runs as it does today. Its outcome
  decides the entry's fate:

  | Outcome                                 | What happens                        | Shown as        |
  | --------------------------------------- | ----------------------------------- | --------------- |
  | No answer, 5xx, 429                     | Moves to the outbox                 | "Not sent yet"  |
  | 400, 404, 413 or another 4xx            | Reported and dropped, as today      | Error, as today |
  | 403 for a missing or invalid CSRF token | A fresh token, then one retry       | —               |
  | 401                                     | Kept in the outbox for that account | "Not sent yet"  |

  A 400 is dropped because replaying the same body can never succeed. A 401 entry is sent
  the next time that account signs in on the device. A timeout may come after the server
  has saved the entry; the replay key makes the second send an update, not a second row.

- **Storage.**
  - The outbox is in localStorage under `ai-workout-outbox-v1:<scope>`, with the dashboard
    cache's scoping, so another account on the device never reads it.
  - Each entry holds `{ clientId, type, url, body, item, queuedAt }`.
  - If storage cannot be written, the send fails as it does today, so an entry is never
    shown as safe when it is not.
  - On load, the outbox's entries join the dashboard's pending entries.
- **Replay.**
  - One request at a time, oldest first.
  - It runs when a signed-in user is set, on the `online` event, after any answered request,
    and every 30 seconds while the outbox has entries and the connection is online.
  - A Web Lock (`navigator.locks`), where the browser has one, keeps two tabs from replaying
    together. The unique index is the backstop.
  - Each success removes the entry and puts the server's dashboard on screen. A replay that
    sends any entries ends with one toast: "2 entries saved."
- **Undo.** Not offered once an entry is in the outbox, as once a send has started today. A
  wrong entry is deleted after it is saved.
- **Sign-out.**
  - Sign-out sends the outbox first, as it sends pending entries today.
  - If entries are still unsent, a confirm in `ModalPortal` says "N entries haven't reached
    the server and will be lost", with Cancel and Sign out anyway. Sign out anyway removes
    the outbox with the other caches.
  - Account deletion removes the outbox without asking.

### Updates

- The plugin's `onNeedRefresh` shows an app-level notice, "A new version is ready", with a
  Reload button that activates the new worker and reloads.
- The notice waits while the planner or any modal is open.
- Nothing reloads by itself. A cold launch always gets the new version.
- An old bundle now stays in use for longer, so a server change keeps accepting the
  previous client's requests. That has been the rule since P6.

### Testing

- **Pure modules carry the decisions,** each with unit tests:
  - `outbox.js`: read, write and remove, scoping, and storage failure;
  - `classifySendFailure`: queue, drop, or a fresh token and a retry, for each row of the
    table above.
- **Hooks** are tested with fake timers and a stubbed `navigator.onLine`: `useConnection`,
  the replay, and `useOptimisticLogs`' move to the outbox. The plugin's virtual registration
  module is mocked at its boundary.
- **The server.** The calorie route keeps a body id, a workout update keeps `createdAt`, and
  the CSP carries `manifest-src`.
- **E2E.**
  - On `deployable`: the worker installs, the manifest loads with no CSP violation, and a
    reload with the context offline still renders the dashboard.
  - A workout logged offline, then the context back online, is on the dashboard exactly
    once after a reload.
- **axe** scans the offline notice, the update notice and the sign-out confirm.
- **Coverage.** Server functions have no slack and client branches 0.19, so every new
  function and branch is covered in the PR that adds it.

### Rollout

Each step ships after the one it relies on, the server first:

1. **Docs:** this spec and its plan.
2. **Server:** the calorie route keeps a body id, a workout update keeps `createdAt`, and
   the CSP gains `manifest-src 'self'`.
3. **Client:** the three log bodies carry a `clientId` as `id`. Safe on its own: the server
   already takes one.
4. **Client:** the worker, the manifest and icons, registration and the update notice.
5. **Client:** the cached session, `useConnection`, the offline notice and the disabled
   writes.
6. **Client:** the outbox, the replay and the sign-out confirm.
7. **Close-out:** a floor PR for each side, then the close-out docs PR, the roadmap status
   and memory.

### Risks

- **Playwright's `setOffline` and the worker.** Whether it reaches the worker's own requests
  is confirmed in step 4. If it does not, the test cuts the network with `page.route`
  instead.
- **The main chunk** is 464 kB of the 500 kB warning line, and `workbox-window` adds to it.
  Measured in step 4, not estimated.
- **A cached session is not a valid session.** It shows data the device already held and
  queues writes; it never authorises one. The server still answers 401 to an expired
  session, and that entry waits in the outbox.

## Out of scope

- Background Sync, and any replay while the app is closed.
- Plan generation offline.
- Caching Google Fonts.
- Push notifications.
- A queue for any write other than the three logs.
- In-gym mode, which is B6.
