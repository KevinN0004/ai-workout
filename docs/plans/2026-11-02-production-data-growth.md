# Production data growth, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do roadmap Phase 3 as decided on 2026-11-02 (decision G1): a signed-in request
reads only the user row unless the route returns the dashboard, and each user keeps only the
newest 200 generated plans, which is all any route can read. Two PRs, then one floor PR.

**Design:** `docs/specs/2026-11-02-production-data-growth-design.md`. Its findings and the
measurement behind them are not repeated here.

**Tech Stack:** Express 5.3, Prisma 7.10 over Postgres 18, Vitest 5 with v8 coverage,
supertest, Playwright 1.64 (CI only), Node 24, GitHub Actions, gh CLI.

**Status: a plan.** Every file and line below was read on `1e1fb96`. The measurement in the
spec ran against local Postgres; nothing here has been applied yet.

---

## Owner's decisions

**Decided 2026-11-02 (G1):** lean reads, then prune plans past each user's newest 200.
Lean reads only, index and accept, and a scheduled prune by age were offered and not chosen.

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor. The floor PR closes the phase.
- Comments and the `CLAUDE.md` and README passages that describe a behaviour change in the
  PR that changes it.

Every behaviour change is test-first: write the test, run it against `main` and see it fail
for the right reason, make it pass, then show by mutation that it holds the fix. Confirm
each mutation applied (the file changed) before trusting a pass.

**Gates, in order, from `D:/ai-workout`:** `npm run format:check`, `npm run lint`,
`npm run knip`, `npm run build`, `npm test`, then `npm run test:coverage` with
`--coverage.reporter=json-summary` on the server, checking exact counts against each floor:
a metric passes when `covered >= floor / 100 × total`. Server function slack was 0.03
after PR #294, so every new function needs a test. Postgres must be running
(`npm run postgres:local:start -w server`).

**Merging:** a PR merges with `gh pr merge N --merge`, run on its own, only when it is CLEAN.
Then watch `main`'s CI with `gh run watch <id> --exit-status`, and the Deploy run until it
logs that the new instance reported ready.

---

## Task 1: lean reads (PR 1)

**Branch:** `perf/lean-session-reads`

**Files:**

- Modify: `server/src/repositories/userReadRepository.js` (`mapUserRow`, `findUserRow`,
  `findUserRowByEmail`; remove `findUserWithDashboardByEmail`)
- Modify: `server/src/services/auth/authUserService.js` (`findUserById`, `findUserByEmail`)
- Modify: `server/src/index.js` (`createAuthUserService` gets the two row lookups in place of
  the dashboard loaders)
- Modify: `server/src/routes/dashboard/registerDashboardReadRoutes.js` (`GET /api/dashboard`
  loads the full user)
- No wiring change: `dashboardRoutes.js` hands the read routes the same `deps` object as the
  write routes, which already take `findUserWithDashboard` and `mapDbDocToUser` from it
- Modify: `server/src/services/auth/sessionService.js` (the comment in `getSessionUser`)
- Test: `server/src/repositories/__tests__/userReadRepository.test.js`,
  `server/src/services/auth/__tests__/authUserService.test.js`,
  `server/src/routes/dashboard/__tests__/collectionReads.integration.test.js`,
  `server/src/routes/dashboard/__tests__/dashboardReadRoutes.test.js`

- [ ] **Step 1: the real-app test that catches a silent empty dashboard.** In
      `collectionReads.integration.test.js`, sign up, then save a goal, a calorie entry and a
      saved exercise through their routes, and insert one generated plan with `prisma` (no
      route saves one without Gemini). `GET /api/dashboard` must return all four in
      `dashboard.plans`, `dashboard.calories`, `dashboard.savedExercises` and
      `dashboard.goals`. It passes on `main`, because the auth load already carries them; it
      is the guard for Step 5.
- [ ] **Step 2: failing unit tests.**
  - `authUserService.test.js`: built with fakes, `findUserById` and `findUserByEmail` call
    `findUserRow` and `findUserRowByEmail` and never a dashboard loader.
  - `userReadRepository.test.js`, real database:
    - `findUserRow` resolves the UUID and the legacy id;
    - `findUserRowByEmail` ignores case;
    - the result has no `dashboard` key;
    - `passwordChangedAt` is `null` when unset and the ISO string when set, as `mapUser` gives
      it.

  Run them and see each fail for its reason: missing functions, or the full loader called.

- [ ] **Step 3: implement.** Add `mapUserRow` and rebuild `mapUser` on it. Add `findUserRow`
      and `findUserRowByEmail`: one `prisma.appUser.findFirst` each, through `userIdWhere`,
      and `mode: "insensitive"` on the email. Point the two `authUserService` lookups at them,
      and pass them to `createAuthUserService` in `index.js`.
- [ ] **Step 4: remove `findUserWithDashboardByEmail`.** It has no caller left. Grep every
      caller and its tests first, and move any test that used it to `findUserRowByEmail`.
- [ ] **Step 5: `GET /api/dashboard` loads the full user.** Use `findUserWithDashboard(req.user.id)`
      and `mapDbDocToUser`, answer 404 "User not found." when it returns `null`, then call
      `buildDashboardResponse` as today. Destructure the two from the route's `deps`, and
      cover the 404 in `dashboardReadRoutes.test.js`.
- [ ] **Step 6: comments.** In `getSessionUser`, the note on why a `null` user means "no
      row" now names the row lookup. It is still true: `findFirst` returns `null` when nothing
      matches and throws when the database fails.
- [ ] **Step 7: mutations.** Each must fail a test:
  1. `buildDashboardResponse(req.user)` back in the route (Step 1's test).
  2. `findUserById` back on `findUserWithDashboard` (Step 2).
  3. The 404 guard removed (Step 5).
  4. `findUserRow` without `userIdWhere`, matching `id` only (the legacy-id case).
- [ ] **Step 8: gates and an exact-count floor check** (Conventions).
- [ ] **Step 9: PR, CI, merge, deploy.** Title: `perf(auth): read only the user row`. The
      description quotes the spec's measurement and lists the mutations. Merge only when
      CLEAN, then watch `main` and the Deploy run.

## Task 2: prune generated plans (PR 2)

**Branch:** `feat/prune-generated-plans`, from `origin/main` after Task 1 has merged.

**Files:**

- Modify: `server/src/repositories/generatedPlanRepository.js` (new `pruneGeneratedPlans`,
  header comment)
- Modify: `server/src/repositories/userReadRepository.js` (the plan limit and order come from
  one shared place, header comment)
- Modify: `server/src/routes/generateRoutes.js` (prune after a successful save, wired
  through `index.js` like `saveGeneratedPlan`)
- Modify: `CLAUDE.md` (Data access: "Collection caps are applied on read"), `server/README.md`
- Create: `server/src/repositories/__tests__/generatedPlanRepository.test.js`
- Test: the generate route's suite, for a failed prune

- [ ] **Step 1: failing tests.**
  - Real database: with 201 plans, `pruneGeneratedPlans` leaves 200, and the one removed is
    the oldest by (`createdAt`, `id`). A second user's 201 plans are untouched. With 5 plans,
    nothing is deleted.
  - Generate route, stubbed boundaries: a successful save is followed by one prune for that
    user; a prune that throws still answers 200 with the plan and logs
    `generated_plan_prune_failed`.

  They fail on `main`, where nothing prunes.

- [ ] **Step 2: implement.** `pruneGeneratedPlans({ userId })` resolves the user through
      `getUserPk`, selects their plan ids past the limit in the read's order (`createdAt`
      desc, `id` desc) and deletes them by id. The route calls it after the save, in its own
      `try`, and only logs a failure, because the plan is already saved and the next save
      retries. Export the limit and the order from one place and import them in both
      `userReadRepository.js` and `generatedPlanRepository.js`.
- [ ] **Step 3: words.** Update `CLAUDE.md`'s "Collection caps are applied on read, not in
      storage" to say plans are also pruned on save, and why the other collections are not
      (paging reaches them). Make the same change in `server/README.md` and in both headers.
      Add to the plan repository's header that roadmap Phase 5's foreign key from
      `workout_sessions` must be `ON DELETE SET NULL`.
- [ ] **Step 4: mutations.** Each must fail a test:
  1. A limit of 201.
  2. Ascending order.
  3. The `userId` filter dropped from the prune.
  4. The route's `try` around the prune removed (the failed-prune test answers 500).
- [ ] **Step 5: gates and an exact-count floor check.**
- [ ] **Step 6: PR, CI, merge, deploy.** Title: `feat(plans): keep the newest 200 plans`.
      The description names what it deletes (only rows no route can read) and the Phase 5
      constraint.

## Task 3: floor PR

- [ ] Re-measure `main` with both PRs in, exact counts from `json-summary` plus CI's
      `All files` rows.
- [ ] Raise each floor whose truncated figure rose, and update the "Measured" note beside it.
      `repo-invariants.test.mjs` pins each note to its thresholds.
- [ ] Branch `chore/data-growth-floors`, PR, merge when CLEAN.

## Done when

- A signed-in request other than `GET /api/dashboard` and a write's response reads one row.
- No user has more than 200 generated plans after a save.
- The words in `CLAUDE.md`, `server/README.md` and both repository headers match the code.
- `main` is green and deployed, and the floors are re-measured.
