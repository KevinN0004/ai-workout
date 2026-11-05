# Per-set logging, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workout records its sets: reps or seconds, plus an optional load and RPE, per
exercise, in a new `exercise_sets` table. The Log workout form records them on exercise
cards, and logging a day of a rule-built plan pre-fills the cards with the prescribed sets.
This is roadmap B1.

The work is one docs PR, five code PRs and a floor PR per side.

**Design:** `docs/specs/2026-11-05-per-set-logging-design.md`. The decisions, the table, the
payload field and the form rules are not repeated here.

**Tech Stack:** Express 5, Prisma with Postgres, zod, React 19, Vitest 5 with v8 coverage,
supertest, Testing Library, Playwright 1.64, Node 24, GitHub Actions, gh CLI.

Every file and line below was read on `8e677b6`.

---

## Owner's decisions

Made 2026-11-05:

- **A set holds reps or seconds, plus an optional load and RPE.** Cardio stays session-level.
- **Loads are stored in kg and shown in the region's unit.**
- **The form becomes exercise cards with set rows**, and a name with no sets still logs.
- **Sets live in a new `exercise_sets` table.**

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md` and README passages, that describe a change move in the
  PR that makes it.

**Test first.** Every behaviour change starts with its test, which must fail for the right
reason before the change makes it pass. A mutation then shows the test holds. Confirm each
mutation applied before trusting a run, and restore the file from a saved copy (ADR 0015).
Write mutation scripts with the Write tool, never a heredoc.

**Coverage slack.** Client, measured on `8e677b6`: statements 2.61, branches 5.14,
functions 0.55 and lines 4.30. Server, measured on `8e677b6` with `client/dist` present:
statements 2.08 (2966 of 3081), branches 1.64 (2168 of 2378), **functions 0.23** (510 of 525) and lines 1.57 (2639 of 2719). One untested server function fails CI, so every server
function added ships with its test.

**Absent is not zero** (ADR 0001). Every new numeric reader guards absent input before
`Number()`, and gets a row in the numeric-coercion contract test on its side. 0 reps and
0 kg are measurements.

**Gates, in order, from `D:/ai-workout`:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage`, with `--coverage.reporter=json-summary` for exact counts against
   each floor, the server measured with `client/dist` present;
3. for a client PR, the E2E suite (`REDIS_URL= npm run test:e2e`, after a build).

Postgres must be up for the server suite (`npm run postgres:local:start -w server`, in the
background; wait for port 55432).

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green before the next
merge. Deploy runs "Migrate, then deploy", so Task 2's migration is live before its code.

## Task 1: the spec and this plan (PR 1)

- [ ] Add both files to `docs/README.md`'s Plans and Specs lists.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Branch `docs/per-set-logging` (the spec is already committed there), commit, PR, merge
      when `CLEAN`.

## Task 2: the table and the repository (PR 2)

**Files:**

- Create: `server/db/postgres/006_exercise_sets.sql`.
- Modify: `server/db/postgres/README.md`, the migrations table.
- Modify: `server/prisma/schema.prisma`: an `ExerciseSet` model mapped to `exercise_sets`,
  with `WorkoutSession.exerciseSets` and `AppUser.exerciseSets` relations.
- Modify: `server/src/repositories/workoutSessionRepository.js`: the include, the mapper
  and the transactional save.
- Modify: `server/src/repositories/rowValues.js` only if a new conversion is needed. A
  helper added there gets its contract row.
- Test: `server/src/routes/dashboard/write/__tests__/workoutSessions.integration.test.js`,
  `server/src/repositories/__tests__/userReadRepository.test.js` and
  `server/src/__tests__/numericCoercion.contract.test.js`.

Steps:

- [ ] Branch `feat/exercise-sets-table`. Measure the server's coverage on `main` with
      `client/dist` present, and write the four slack figures into this plan's Conventions
      in this PR.
- [ ] Set the roadmap's `status/B1` to `active`, with a note naming this plan (ArtifactData
      `set`; see the roadmap memory for the collection and rules).
- [ ] **The migration,** as the spec's table: the columns, the checks
      (`num_nonnulls(reps, seconds) = 1`, each range), the unique key and both indexes.
      A header comment says why `user_id` is duplicated and why `seconds` starts at 1 when
      `reps` starts at 0. Apply it locally with `npm run migrate:postgres -w server`, then
      `npm run prisma:generate -w server` and `npm run prisma:validate -w server`.
- [ ] **Test first, against Postgres,** through `saveWorkoutSession`:
  - a session saved with `exerciseSets` reads back with them, grouped and ordered;
  - saving the same session id again with new sets replaces them;
  - saving it again with no `exerciseSets` keeps the stored sets;
  - a set insert that fails (an out-of-range value sent past the builder) leaves no session
    row and no sets, so the transaction holds;
  - 0 reps and 0 kg round-trip as 0, and a missing load and RPE as null;
  - each check constraint refuses its out-of-range value (one raw insert per check);
  - deleting the session, and deleting the user, removes its sets;
  - the sets' `user_id` is the session's, whatever the input says.

  Run them: they fail, because nothing writes sets yet.

- [ ] **The repository:**
  - `WORKOUT_SESSION_INCLUDE` gains
    `exerciseSets: { orderBy: [{ exerciseOrder: "asc" }, { setNumber: "asc" }] }`.
  - `mapWorkoutSession` returns `exerciseSets`, grouped by `exercise_order` into
    `[{ name, sets: [{ reps, seconds, loadKg, rpe }] }]`. `loadKg` and `rpe` go through
    `toNumberOrNull`, and `reps` and `seconds` through `?? null`.
  - `saveWorkoutSession` wraps the session write and the sets in `prisma.$transaction`. It
    replaces the sets only when `session.exerciseSets` is an array.
- [ ] **Contract rows:** the mapper's `loadKg` and `rpe` readers in the server's
      numeric-coercion contract, with zero meaningful for `loadKg` and not for `rpe`.
- [x] **Measure the dashboard read.** Seeded histories from 52 to 500 sessions, timed with
      and without sets. Every one passed the "twice the time" rule this step first set,
      because the baseline is a few milliseconds. The rule's fallback, the paginated Logs
      route, does not exist for workouts: Logs shows only the sessions the dashboard read
      holds. So the owner decided on 2026-11-05 to keep sets in the dashboard read. The
      figures are in the spec's "The reads" section.
- [ ] **Mutations,** each of which must fail a test:
  - the transaction removed (two separate writes);
  - the "only when an array" guard removed;
  - the include's `orderBy` dropped;
  - `toNumberOrNull` on `loadKg` replaced by `Number()`;
  - `user_id` taken from the input.
- [ ] Gates and coverage. The PR states the server's measured figures.

## Task 3: the API (PR 3)

**Files:**

- Modify: `server/src/services/http/apiSchemaService.js`: `workoutSessionBodySchema` gains
  `exerciseSets`.
- Modify: `server/src/services/dashboard/dashboardDataBuildersService.js`:
  `buildWorkoutSessionEntry` carries the cleaned list through.
- Test: the schema's and builder's tests in their `__tests__/` folders, and
  `workoutSessions.integration.test.js` for the route.

Steps:

- [ ] **Test first:**
  - The schema accepts the spec's shape and refuses 19 exercises, 21 sets, an empty or
    141-character name, a set with both or neither of reps and seconds, reps 201, seconds 0,
    load 1000.01 and RPE 10.5.
  - `null`, `""` and a missing key all read as absent for every numeric field, and 0 reps
    and 0 kg are kept.
  - The builder fills `exercises` from the cards' names when only `exerciseSets` came, and
    leaves `exercises` alone when both came.
  - Through the route: a POST with sets answers with them; the old summary body still saves
    and answers as before.
- [ ] Write the schema with the existing absent-aware field helpers, then the builder.
- [ ] **Mutations:** each bound off by one; the both-or-neither refinement removed; the
      names fill skipped.
- [ ] Gates and coverage. No client change: the server accepts sets before any client sends
      them.

## Task 4: plan prescriptions (PR 4)

**Files:**

- Modify: `server/src/services/planning/generatePlan.js`: each day gains `prescriptions`.
- Modify: `server/src/services/dashboard/planPayloadService.js`: the optional field, its
  typedef and its check. A day's malformed `prescriptions` is dropped, not the plan.
- Modify: `server/src/routes/generateRoutes.js`: joins the generator's prescriptions to
  the parsed payload days by weekday.
- Modify: `client/src/app/plans.js`: `isPlanPayload` accepts and checks the field the same
  way, and `savedPlanDays` returns it.
- Test: `generatePlan.test.js`, `planPayloadService`'s tests,
  `scripts/evals/__tests__/generatePlan.gate.test.mjs`, the generate route's tests, and
  `client/src/app/__tests__/planPayload.contract.test.js`.

Steps:

- [ ] **Test first, the generator:**
  - "3 x 8-10" gives `reps { 8, 10 }`, "2 x 6 a side" gives `perSide`, "3 x 10 steps"
    gives reps, and "3 x 20-30 seconds a side" gives `seconds` with `perSide`;
  - "stop 1-2 reps short" gives `targetRpe { 8, 9 }`, and "stop 3" gives `{ 7, 7 }`;
  - a hold and a mobility drill have no target;
  - the ramp-up line, intervals, the cardio finisher, Easy breathing, Easy cooldown and
    rest-day walks have no prescription;
  - a superset's "A1." label is not part of the name.
- [ ] **The gate:** across both sweeps, each exercise line has exactly one prescription, in
      order, whose name and set count match the line and whose range matches the dose text.
- [ ] Build `prescriptions` from the same values `doseOf` formats, not by reading its text
      back. Give `doseOf` a structured result and format the line from it.
- [ ] **Test first, the payload:** both validators accept a day with and without
      `prescriptions`, drop a malformed one (a negative set count, `min > max`, a missing
      name), and keep the rest of the plan valid. The contract test runs the same cases
      through both sides.
- [ ] The validators, then the route's join. A plan from before this PR reads unchanged.
- [ ] **Mutations:** the reps-in-reserve conversion off by one; a ramp-up given a
      prescription; the dropped field rejecting the whole plan; one side's check loosened.
- [ ] Gates, coverage, and the gate's run time, which must stay under 30 s.

## Task 5: the client form (PR 5)

**Files:**

- Create: `client/src/pages/dashboard/components/ExerciseCard.jsx` (one card: name, the
  reps-or-seconds choice, its set rows and their buttons), with its test.
- Create: `client/src/app/exerciseSets.js`, not under `pages/dashboard/` as first planned,
  because `app/events.js` and `App.jsx` use it too (the form's pure rules: an empty
  card, add and remove, copy load, clean for save with the pound-to-kg conversion, and the
  validation messages), with its test.
- Modify: `client/src/pages/dashboard/components/DashboardWorkoutModal.jsx`: the cards
  replace the comma box and the summary fields.
- Modify: `client/src/App.jsx` and `client/src/app/events.js`: the form state and the save
  body move to `exerciseSets`.
  `submitWorkout` builds the optimistic entry itself, so it gains `exerciseSets` there, and
  `useOptimisticLogs.js` does not change.
- Modify: `client/src/pages/dashboard/views/PlansView.jsx`: `logPlanDay` stops resetting
  the summary fields (`sets`, `reps`, `intensityRpe`) and starts `exerciseSets` empty.
- Modify: `client/src/pages/dashboard/views/WorkoutsView.jsx`: the Logs line per exercise.
- Modify: the CSS beside the modal, for the cards and rows.
- Test: the modal's, WorkoutsView's and events' tests, the client numeric-coercion
  contract, and `e2e/a11y.spec.js`.

Steps:

- [ ] **Test first, `exerciseSets.js`:**
  - a blank row is dropped;
  - a row with a load or RPE and no reps or seconds gives the inline message;
  - 135 lb saves as 61.23 kg, a kg load as typed (two decimals);
  - "0" reps and "0" load are kept, and "" is absent;
  - add set copies the previous load;
  - the caps of 18 cards and 20 rows hold.
- [ ] Write it, importing `toNumberOrNull` from `app/units.js`, with its own `toLoadKg` and
      `fromLoadKg`: `toKg` rounds to a whole kilogram and reads 0 as blank. Add contract rows
      for its parsers.
- [ ] **Test first, the card and the modal:** labels read "Set 2 reps, <name>"; add and
      remove work from the keyboard; the reps-or-seconds choice relabels the rows; a
      placeholder target is not a value; save sends `exerciseSets` and the cards' names as
      `exercises`, and no summary fields.
- [ ] The card, the modal and the save.
- [ ] **Test first, Logs:** a session with sets shows "Dumbbell bench press: 10, 9, 8 reps
      · 22.5 kg · RPE 7-9", or pounds under an imperial region; a hold shows seconds; a
      session without sets keeps its summary line.
- [ ] The Logs line, and the optimistic entry with its sets.
- [ ] **Screenshot compare:** capture `main` with `capture.mjs` (the Tools section of
      `docs/plans/2026-10-16-readability-follow-up-phase-4.md`, with `D:/ai-workout` as the
      root). Write the expected changes before the after-capture: the modal's cards in
      `dash-workout-modal` at each viewport. The tool keys elements by DOM position, so the
      cards also shift every later path in the modal into a style row (#342 hit this):
      expect PNG, `meta` and style rows in those captures, and none elsewhere. Compare,
      and never widen an expectation to pass.
- [ ] **E2E:** the a11y suite scans the modal with two cards and three rows, and the phone
      tap test reaches "Add set" and "Save workout".
- [ ] **Mutations:** the blank-row drop; the pound conversion; a placeholder sent as a
      value; the label's exercise name.
- [ ] Gates, coverage and the E2E suite.

## Task 6: the pre-fill and the E2E (PR 6)

**Files:**

- Modify: `client/src/pages/dashboard/planUtils.js`: `buildPlanDayPrefill` builds cards.
- `PlansView.jsx` does not change: `logPlanDay` already passes the whole saved day, which
  carries its `prescriptions` from Task 4.
- Modify: `e2e/plan.spec.js`.
- Test: `client/src/pages/dashboard/__tests__/planUtils.test.js`.

Steps:

- [ ] **Test first:**
  - a day with prescriptions gives one card per prescription, with its number of empty
    rows, its reps-or-seconds choice, "each side" when `perSide`, and its targets as
    placeholders;
  - a day without prescriptions gives one name-only card per exercise, by #339's rules;
  - #339's 540-week sweep still holds, now through the real generator's prescriptions.
- [ ] The pre-fill.
- [ ] **E2E:** `plan.spec.js` logs Monday, fills each pre-filled row's reps and the first
      row's load, saves, reloads, and checks that Logs shows the sets and the plan hub card
      shows "Logged".
- [ ] **Mutations:** a target written as a value; `perSide` dropped; the fallback for
      older plans removed.
- [ ] Gates, coverage and the E2E suite.

## Task 7: re-measure and close

- [ ] On `main` after Task 6, measure both sides' coverage with json-summary, the server
      with `client/dist` present. Open a floor PR for each side whose truncated figure
      rose.
- [ ] Mark this plan done and the spec applied, with the PR numbers.
- [ ] Set the roadmap's `status/B1` to `done`, with a note naming the PRs.

## Done when

- A workout's sets are stored in `exercise_sets`, saved with their session in one
  transaction, and read back with it.
- The Log workout form records reps or seconds, load and RPE per set, in the region's unit,
  and saves loads in kg.
- Logging a day of a rule-built plan pre-fills the prescribed sets, with targets as
  placeholders. An older plan pre-fills names.
- Logs shows each exercise's sets, and older sessions keep their summary line.
- The old bundle can still save, and cannot wipe a session's sets.
