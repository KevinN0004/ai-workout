# Production data growth (roadmap Phase 3), design

Status: **decided 2026-11-02**, measured, nothing applied. The plan is
`docs/plans/2026-11-02-production-data-growth.md`.

The September roadmap (`docs/specs/2026-09-18-development-roadmap-design.md`, Phase 3) left
one choice open for after the first deploy: prune on write, a scheduled prune, or index and
accept. The app has been deployed since then (the Deploy workflow last ran green on
2026-11-02), which is when that roadmap said the choice is cheapest to make.

## What was found

Read on `1e1fb96`.

1. **Nothing prunes any table.** `COLLECTION_LIMITS` in `userReadRepository.js` caps what a
   read returns: 500 workout sessions, 1,000 calorie entries, 800 meal logs, 400 progress
   metrics, 200 generated plans and 200 saved exercises.
2. **Every signed-in request loads all six collections.** `requireAuth`, `attachOptionalUser`
   and `GET /api/auth/me` all go through `getSessionUser`, which calls
   `authUserService.findUserById`, which calls `findUserWithDashboard`. Every write route then
   loads the user again for its response (`updatedDoc`), so a write loads everything twice.
   Signup's existence check and login load by email the same way.
3. **Only `GET /api/dashboard` reads those collections.** It passes `req.user` to
   `buildDashboardResponse`, which reads `user.dashboard`. Every other reader of `req.user`
   reads `.id` (19 places) or `.profile` (2), or passes it to `verifyPassword`, which reads the
   hash fields. `mapUserToDbDoc` runs only at signup.
4. **Paging reaches past the read caps for three collections.**
   `GET /api/dashboard/workout-sessions`, `meal-logs` and `progress-metrics` page by offset over
   the whole table, so those rows are visible history, and the planned adherence summary
   (roadmap Phase 6), adaptive plans and analytics will read them. Plans past 200, calorie
   entries past 1,000 and saved exercises past 200 are reachable from no route.
5. **Plans are the largest rows.** `planText` is capped by `GEMINI_MAX_PLAN_CHARS` (default
   20,000), and `GENERATE_DAILY_LIMIT` (default 200) caps generations across all users in 24
   hours.
6. **`buildDashboard(undefined)` returns a complete empty dashboard.** A route that reads the
   collections from a user loaded without them answers 200 with no plans, calories or goals,
   and nothing fails. This is the failure the tests below exist to catch.

## Measured

2026-11-02, local Postgres 18 over loopback, median of 15 runs after 2 warm-ups. A scratch
script seeded throwaway accounts with every collection at its read cap, timed
`findUserWithDashboard` against a load of the user row alone, and deleted the accounts.

| Account                                             | Full load today  | User row only  |
| --------------------------------------------------- | ---------------- | -------------- |
| New, nothing logged                                 | 3.1 ms, 367 B    | 0.27 ms, 309 B |
| Every collection at its cap, 5,000-character plans  | 19.97 ms, 2.0 MB | 0.30 ms, 312 B |
| Every collection at its cap, 20,000-character plans | 22.5 ms, 5.0 MB  | 0.30 ms, 313 B |

The bytes are the loaded user object serialised as JSON, in which sessions appear twice
(`workouts` and `workoutSessions`). They measure what the server builds for each request,
not what crosses the wire from Postgres. In production every megabyte also crosses the
network between Render and Neon, which loopback does not show.

## Decision

**Lean reads, then prune plans**, decided by the owner on 2026-11-02 (decision G1).

Considered and not chosen:

- **Lean reads only.** Nothing deleted; plan storage keeps growing, bounded by the daily
  generation cap.
- **Index and accept.** No code; every request keeps getting heavier until each user reaches
  the caps.
- **A scheduled prune by age.** Deletes history that paging shows and later phases read.

## Design

### PR 1: lean reads

- `userReadRepository` gains `findUser(userId)` and `findUserByEmail(email)`. Each runs one
  `appUser` query: ids through `userIdWhere`, so both the UUID and the legacy id resolve, and
  email case-insensitively as today. Both map through a new `mapUserRow`, the user fields of
  `mapUser` without `dashboard`, and `mapUser` is rebuilt on top of it so the two cannot drift.
  `passwordChangedAt` keeps its guard (absent is `null`, never `""`).
- `authUserService.findUserById` and `findUserByEmail` use those lookups. Their callers keep
  their names and their wiring: `getSessionUser` (so `requireAuth`, `attachOptionalUser` and
  `GET /api/auth/me`), signup's existence check and login.
- `GET /api/dashboard` loads the full user itself, as the write routes already do:
  `findUserWithDashboard(req.user.id)`, `mapDbDocToUser`, a 404 "User not found." when the row
  has gone, then `buildDashboardResponse` as today. The response does not change.
- The lean user carries **no `dashboard` key**. An empty one would look like a real account
  with nothing logged.
- `findUserWithDashboardByEmail` loses its only caller and is removed, after a grep of every
  caller and its tests.
- `getSessionUser`'s comment explaining why a `null` user means "no row" moves to the new
  lookup and stays true: `findFirst` returns `null` when nothing matches and throws on a
  database failure, so an outage still cannot cost a valid session its token.

Expected effect, from the measurement: a signed-in request reads one row however much the
account holds, except `GET /api/dashboard` and a write's response, which load everything once.

### PR 2: prune generated plans

- A new `pruneGeneratedPlans({ userId })` deletes that user's plans past the newest 200, in
  exactly the order the read uses (`createdAt` desc, then `id` desc). The limit and the order
  live in one place that both the read and the prune import, so the set kept is always the
  set read.
- **The generate route calls it after a successful save, in its own `try`, and a failure is
  only logged** (`generated_plan_prune_failed`). The save is awaited inside the request's
  `try` (`generateRoutes.js:359`), so anything that throws there answers 500 and the user
  never receives the plan Gemini just made. The plan is already saved, and the next save
  retries the prune. For the same reason the prune is **not** in a transaction with the
  insert: rolling back a saved plan to undo housekeeping would lose the plan and the Gemini
  call that produced it.
- **No lock.** Two saves in flight for one user can each prune before the other's insert
  lands and leave 201 rows until the next save. The read cap hides the extra row, and nothing
  derives a value from the count. The calorie sum, which does derive one, takes
  `lockUserCalorieWrites`; this does not need to.
- **No backfill and no migration.** A user's first save after the deploy trims that user only.
- The text that says nothing prunes changes in the same PR: `CLAUDE.md` (Data access),
  `server/README.md`, and the headers of `userReadRepository.js` and
  `generatedPlanRepository.js`.
- **For roadmap Phase 5:** when `workout_sessions` gains `generated_plan_id`, its foreign key
  must be `ON DELETE SET NULL`, or the prune must skip referenced plans, so pruning a plan can
  never delete or block a session.

### Floor PR

Re-measure `main` once both PRs are in, and raise each floor whose truncated figure rose
(readability spec rule 3).

## Testing

- **PR 1**
  - `authUserService`: `findUserById` and `findUserByEmail` call the row lookups and never the
    dashboard loaders (injected fakes). Fails on `main`.
  - `userReadRepository`, real database: `findUser` by UUID and by legacy id,
    `findUserByEmail` with different case, the result has no `dashboard` key, and
    `passwordChangedAt` reads as `mapUser` reads it.
  - **The real app:** sign up, log data into the collections `buildDashboard` reads (a plan, a
    calorie entry, a saved exercise, goals), then `GET /api/dashboard` returns all of it.
    Mutation: put `buildDashboardResponse(req.user)` back in the route, and this test must
    fail, because finding 6 is otherwise silent.
  - Further mutations: point `findUserById` back at the full loader; drop the 404 guard.
- **PR 2**
  - Real database: with 201 plans the prune leaves 200, and the one removed is the oldest by
    (`createdAt`, `id`). Another user's plans are untouched. With fewer than 200, nothing is
    deleted.
  - The generate route: a successful save is followed by a prune for that user, and a prune
    that throws still answers 200 with the plan and logs the failure.
  - Mutations: keep 201, order ascending, drop the user filter, remove the route's `try`
    around the prune. Each must fail a test.
- **Gates for each PR:** `npm test`, `npm run lint`, `npm run format:check`, `npm run knip`,
  `npm run build`, and `npm run test:coverage` with an exact-count floor check. Server
  function slack was 0.03 after PR #294, so every new function needs a test. E2E runs in CI.

## What forces a re-check

- A new reader of `req.user.dashboard`. It gets `undefined` now, and `buildDashboard` turns
  that into an empty dashboard without failing.
- A route that pages plans, calorie entries or saved exercises. The prune would then delete
  history a user can see.
- Lowering the plan limit, which deletes rows at the next save. Raising it is safe.

## Out of scope

- Pruning workout sessions, meal logs, progress metrics, calorie entries or saved exercises.
- Changing any read cap.
- A storage alarm.
