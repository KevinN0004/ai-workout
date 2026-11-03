# Planned versus done (roadmap Phase 6), Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do roadmap Phase 6 as decided on 2026-11-02. Rest days stop counting as training
days, the summary shows this week's planned, done and missed days of the newest plan, and it
shows progress toward a target weight, which is absent until it is saved. One spec PR and
three PRs, then a floor PR per side only if a figure rose.

**Design:** `docs/specs/2026-11-02-planned-versus-done-design.md`. Its findings, the rest-day
measurements and the decisions are not repeated here.

**Tech Stack:** Postgres 18, Prisma 7.10, Express 5, React 19 with Vite 8, Vitest 5 with v8
coverage, supertest, Testing Library, Node 24, GitHub Actions, gh CLI.

**Status: a plan.** Every file and line below was read on `00a8f08`.

---

## Owner's decisions

Decided 2026-11-02:

- **Done means linked, or on the day.** Linked only, and any workout on the day, were offered
  and not chosen.
- **A target weight is absent until saved,** and a migration clears the target from goals
  still exactly at the sign-up defaults. Keeping 160 with a flag, treating 160 as the target,
  and new accounts only, were offered and not chosen.
- **"Log this workout" is hidden on rest days.** Keeping it was offered and not chosen.

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md` and README passages, that describe a change move in the
  PR that makes it.

Every behaviour change is test-first. Write the test, see it fail for the right reason, make
it pass, then show by mutation that it holds. Confirm each mutation applied before trusting a
run, and restore it from a saved copy.

Coverage slack is thin: server statements 0.15, functions 0.31 and lines 0.58, and client
functions 0.30. So every new function and branch ships with its test.

**Database work:** local Postgres on 55432 must be running. Run
`npm -w server run migrate:postgres` before the server tests. Never `prisma db push`
(`server/db/postgres/README.md`).

**Gates, in order, from `D:/ai-workout`:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage`, with `--coverage.reporter=json-summary` for exact counts against
   each floor, the server measured with `client/dist` present.

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green before the next
merge. The Deploy workflow migrates before it deploys, so PR 3's migration reaches
production with that PR.

## Task 1: the spec and this plan (PR 1)

**Files:** create the spec and this file; modify `docs/README.md` (list both).

- [ ] **Step 1:** branch from `origin/main`, add the files, and run `npm run format:check`.
- [ ] **Step 2:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 2: rest days (PR 2)

**Files:**

- modify `client/src/app/plans.js` (`isRestDay`) and `client/src/app/__tests__/plans.test.js`,
  whose fixture cases read the server's fixtures through `import.meta.glob`;
- modify `client/src/pages/dashboard/planUtils.js:168` (`buildWeeklyMealPlan`) and its tests;
- modify `client/src/pages/dashboard/views/PlansView.jsx` (the card's "Rest day" hint at
  `:286-289`, and the button at `:530`) and its tests;
- modify `client/README.md`, where "Generated Plan Parsing" names the plan helpers.

Steps:

- [ ] **Step 1: write the failing tests**, as the spec's Testing section lists them for rest
      days.
- [ ] **Step 2: implement.** `isRestDay` stays in the ts-checked `plans.js`, with its
      `@param`.
- [ ] **Step 3: mutate.** Each mutation must fail a test:
  - search the whole day for "rest" instead of the opening main entry;
  - read only the first line, ignoring the "Main lifts:" heading;
  - drop "Optional" from the words;
  - drop the "no lines" case;
  - keep the button on rest days;
  - leave the meal plan on "has lines".
- [ ] **Step 4:** run the gates and coverage.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 3: the target weight on the server (PR 3)

**Files:**

- create `server/db/postgres/005_clear_default_target_weight.sql`:

  ```sql
  update app_users
     set goals = goals - 'targetWeight'
   where goals = '{"targetWeight": 160, "targetCalories": 2200, "weeklyWorkouts": 3}'::jsonb;
  ```

  with a header comment saying why only exact defaults are cleared;

- modify `server/src/services/dashboard/dashboardDataBuildersService.js:141-186`
  (`defaultGoals`, `buildDashboard`) and its tests;
- create `server/src/db/__tests__/clearDefaultTargetWeight.test.js` (live Postgres), which
  runs the migration's SQL against rows it inserts and deletes;
- modify the integration tests that read a new account's goals;
- modify `server/db/postgres/README.md`, the migrations table.

Steps:

- [ ] **Step 1: write the failing tests**, as the spec's Testing section lists them for the
      target weight. Among them, a sign-up through the route stores goals without
      `targetWeight`, which confirms against the database what finding 5 read in the code.
- [ ] **Step 2: implement,** then run `migrate:postgres` and see the migration apply once
      and the runner skip it after.
- [ ] **Step 3: mutate.** Each mutation must fail a test:
  - the migration matching goals that merely contain the defaults (`@>`), not equal them;
  - `buildDashboard` falling back to 160 again;
  - `defaultGoals` keeping `targetWeight`.
- [ ] **Step 4:** run the gates and coverage.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy. Confirm that
      the Deploy log's migrate step applied `005_clear_default_target_weight.sql`.

## Task 4: planned versus done and the weight block (PR 4)

**Files:**

- create `client/src/pages/dashboard/planWeek.js` (`buildPlanWeek`) and its tests;
- modify `client/src/pages/dashboard/hooks/useDashboardMetrics.js` (call it, and return the
  week and the weight progress) and its tests;
- modify `client/src/pages/dashboard/views/SummaryView.jsx:405-463` (the weekly card) and its
  tests, and `DashboardPage.jsx:286` (a button to the goals view);
- modify `client/src/app/dashboard.js:20`, `client/src/App.jsx:113-117`,
  `client/src/app/hooks/useDashboardData.js:21`, `CaloriesView.jsx:47` and `:150-162`, and
  their tests;
- modify `client/src/__tests__/numericCoercion.contract.test.js` if a numeric helper is added.

Steps:

- [ ] **Step 1: write the failing tests**, as the spec's Testing section lists them for the
      week and the weight block, with the clock pinned.
- [ ] **Step 2: implement.** If a new CSS rule is needed, capture `main` first and prove the
      change by screenshot, as `CLAUDE.md` requires.
- [ ] **Step 3: mutate.** Each mutation must fail a test:
  - count a workout linked to an older plan;
  - count an unlinked workout for any day of the week;
  - drop the saved-date cut, so Monday reads missed for a plan saved on Thursday;
  - mark today missed;
  - read a null target as 0;
  - fill the goals form with 160 for a null target.
- [ ] **Step 4: run the gates and coverage.** The client build changes, as expected.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 5: re-measure

- [ ] Run `npm run test:coverage` on `main` with exact counts, the server with `client/dist`
      present. If a truncated figure rose, a floor PR per side raises it and updates the note
      beside it. Otherwise, say so in the phase's closing summary.

## Done when

- A rest day gets rest-day calories and no "Log this workout".
- The summary shows this week's planned, done and missed days of the newest plan.
- The summary shows progress toward a saved target weight, and asks for one when none is
  saved.
- `main` is green and deployed, and the roadmap page marks P6 done.
