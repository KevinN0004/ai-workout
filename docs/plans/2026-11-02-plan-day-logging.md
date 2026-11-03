# Logging a workout against a plan day (roadmap Phase 5), Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do roadmap Phase 5 as decided on 2026-11-02. A workout session can link to a day of
the newest plan, the plan hub logs a day with the form pre-filled, and it marks the days
logged. One spec PR and three PRs, then a floor PR per side only if a figure rose.

**Design:** `docs/specs/2026-11-02-plan-day-logging-design.md`. Its findings, the
measurements of real plan days and the decisions are not repeated here.

**Tech Stack:** Postgres 18, Prisma 7.10, Express 5, React 19 with Vite 8, Vitest 5 with v8
coverage, supertest, Testing Library, Node 24, GitHub Actions, gh CLI.

**Status: a plan.** Every file and line below was read on `91bcd5d`.

---

## Owner's decisions

Decided 2026-11-02:

- **G3:** logging against a plan day pre-fills the form.
- **The pre-fill fills exercises and notes:** exercises from the bullet names, and notes from
  the day's lines, cut to 500 characters. Exercises only, and notes only, were offered and
  not chosen.

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md` and README passages, that describe a change move in the
  PR that makes it.

Every behaviour change is test-first. Write the test, see it fail for the right reason, make
it pass, then show by mutation that it holds. Confirm each mutation applied before trusting a
run, and restore it from a saved copy.

Coverage slack is thin: server branches 0.13, functions 0.25 and lines 0.17, and client
functions 0.24. So every new function and branch ships with its test.

**Database work:** local Postgres on 55432 must be running. Run
`npm -w server run migrate:postgres`, then `npm -w server run prisma:generate`, before the
server tests. Never `prisma db push` (`server/db/postgres/README.md`).

**Gates, in order, from `D:/ai-workout`:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage`, with `--coverage.reporter=json-summary` for exact counts against
   each floor, the server measured with `client/dist` present.

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green before the next
merge. The Deploy workflow migrates before it deploys, so PR 2's migration reaches
production with that PR.

## Task 1: the spec and this plan (PR 1)

**Files:** create the spec and this file; modify `docs/README.md` (list both).

- [ ] **Step 1:** branch from `origin/main`, add the files, and run `npm run format:check`.
- [ ] **Step 2:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 2: the migration and the model (PR 2)

**Files:**

- create `server/db/postgres/004_workout_plan_day.sql`, as the spec's "The migration" gives
  it, with a header comment saying why the link check allows an index without a plan;
- modify `server/prisma/schema.prisma`:
  - `WorkoutSession` gains `generatedPlanId` (`@map("generated_plan_id") @db.Uuid`),
    `planDayIndex` (`@map("plan_day_index") @db.SmallInt`), the relation `generatedPlan`
    (`onDelete: SetNull`) and `@@index([generatedPlanId, planDayIndex], map: "workout_sessions_plan_day_idx")`;
  - `GeneratedPlan` gains `workoutSessions WorkoutSession[]`;
- create `server/src/db/__tests__/workoutPlanLink.test.js` (live Postgres);
- modify `server/db/postgres/README.md`, the migrations table.

Steps:

- [ ] **Step 1: write the failing tests.**
  - `information_schema` and `pg_constraint` show both columns, both checks and the
    reference's `on delete set null`, and `pg_indexes` shows `workout_sessions_plan_day_idx`.
  - Deleting a plan keeps a linked session and clears its `generated_plan_id`, while
    `plan_day_index` stays.
  - An insert with `plan_day_index = -1` is refused, and so is a plan without an index.

  Run them with the migration not yet applied, and see them fail.

- [ ] **Step 2: add the migration and the model.** Run `migrate:postgres` and
      `prisma:generate`, then `npm run prisma:validate -w server`.
- [ ] **Step 3: see them pass.** Then run the full server suite: no other test changes.
- [ ] **Step 4: mutate.** Each mutation must fail a test:
  - `on delete cascade` in place of `set null`, re-applied to a scratch database;
  - the index check dropped.

  Rebuild the local database from scratch after each one, by dropping the schema and
  migrating again.

- [ ] **Step 5: run the gates and coverage.** Coverage cannot move: no source changes.
- [ ] **Step 6:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy. Confirm that
      the Deploy log's migrate step applied `004_workout_plan_day.sql`.

## Task 3: the server write and read (PR 3)

**Files:**

- modify `server/src/services/http/apiSchemaService.js:122-135`
  (`workoutSessionBodySchema`);
- modify `server/src/services/dashboard/dashboardDataBuildersService.js:190-207`
  (`buildWorkoutSessionEntry`);
- modify `server/src/repositories/userLookup.js`: export `legacyOrIdWhere(value, legacyField)`,
  the rule `userIdWhere` uses, so that `userIdWhere` is built on it;
- modify `server/src/repositories/workoutSessionRepository.js` (the mapper and the save);
- modify `server/src/repositories/userReadRepository.js:115` and
  `server/src/repositories/dashboardCollectionRepository.js:12` (select the plan with each
  session);
- modify `server/src/routes/dashboard/write/registerWorkoutAndGoalRoutes.js:33-61`;
- modify the tests beside each, and `server/src/__tests__/numericCoercion.contract.test.js`
  if the builder gains a helper.

Steps:

- [ ] **Step 1: write the failing tests**, as the spec's Testing section lists them for the
      write and the read. The repository tests run against real Postgres, with two users
      and plans saved with and without a payload. The route tests stub the repository and
      check the warning and the answer.
- [ ] **Step 2: implement.**
  - In the save, resolve the plan first, scoped to the user, and keep the link only when
    `toPlanPayload` accepts the structure and `index < days.length`. Write both columns, or
    neither.
  - The route answers the saved session, falling back to the entry it built when the save
    returns null, and logs `workout_plan_link_dropped` when the entry had a `planId` and the
    saved session has none.
- [ ] **Step 3: mutate.** Each mutation must fail a test:
  - drop the user scope from the plan lookup;
  - drop the payload check;
  - change `<` to `<=` in the day check;
  - return `planDayIndex` without checking `planId`;
  - answer the built entry instead of the saved session.
- [ ] **Step 4:** run the gates and coverage.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 4: the client (PR 4)

**Files:**

- modify `client/src/app/plans.js` (`savedPlanDays`) and its tests;
- modify `client/src/pages/dashboard/planUtils.js` (`buildPlanDayPrefill`) and its tests,
  which read the server's fixtures through `import.meta.glob` as the Phase 4 contract test
  does;
- modify `client/src/App.jsx:81-90` (the form's initial state) and `client/src/app/events.js`
  (`submitWorkout`, `:374-430`), and their tests;
- modify `client/src/pages/dashboard/DashboardPage.jsx` (pass the form setters to
  `PlansView`, and clear the link at `:461`), `WorkoutsView.jsx` (`:147` and `:196`),
  `PlansView.jsx` (the button and the logged mark) and `DashboardWorkoutModal.jsx` (the
  linked line), and their tests;
- modify `client/README.md`, where "Generated Plan Parsing" names the plan helpers.

Steps:

- [ ] **Step 1: write the failing tests**, as the spec's Testing section lists them for the
      client.
- [ ] **Step 2: implement,** reusing existing classes only. A stylesheet change would need the
      screenshot proof `CLAUDE.md` requires.
- [ ] **Step 3: mutate.** Each mutation must fail a test:
  - keep bracketed asides;
  - keep "Rest" lines;
  - drop the notes cut;
  - stop clearing the link at one entry point;
  - show the button without saved days;
  - mark a day from another plan.
- [ ] **Step 4: run the gates and coverage.** The client build changes, as expected.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, and watch CI and Deploy.

## Task 5: re-measure

- [ ] Run `npm run test:coverage` on `main` with exact counts, the server with `client/dist`
      present. If a truncated figure rose, a floor PR per side raises it and updates the note
      beside it. Otherwise, say so in the phase's closing summary.

## Done when

- `workout_sessions` carries the link in production, and deleting a plan never deletes a
  session.
- A workout logged from a plan day is saved with its link and shown as logged on that day.
- A link that does not check out never costs the user the workout.
- `main` is green and deployed, and the roadmap page marks P5 done.
