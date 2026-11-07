# Plans that adapt to your history, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each week, the saved plan sets a load for every lift from what was logged against
it: one step up, a hold, or about 10% lighter. It sets a deload week when one is due. Each
change says why and can be undone, and a step up on an injury-flagged lift waits for the
user's answer. This is roadmap B4, within G4 (automatic within bounds).

The work is one docs PR, three code PRs and a floor PR per side whose figure rose.

**Design:** `docs/specs/2026-11-06-adaptive-progression-design.md`. The rules, the answers
and the screens are not repeated here; where this plan names a rule, the spec's wording
wins.

**Tech Stack:** Express 5, zod, Prisma with Postgres, React 19, Vitest 5 with v8 coverage,
supertest, Testing Library, Playwright 1.64, Node 24, GitHub Actions, gh CLI.

**Status: done 2026-11-07** (#360 to #365, all live; main `9b7edd4`). These are the places
the work goes past or departs from the text below.

- **#361 settled five rules the spec left open.**
  - A bodyweight lift is a library entry that needs no dumbbell, kettlebell, barbell, cable
    or machine. "Inverted row under a racked barbell" needs a barbell only to hang from,
    and is the one listed exception (`BODYWEIGHT_IDS`).
  - The lightest-step floor reads the kg `from`. A lift at one step in pounds (under
    7.5 lb) is always at one step in kg, so the kg floor covers both units and the two
    never disagree on a deload.
  - Every read of a lift stays inside the 28 days before the week, the rising-RPE run
    included. A session in the current week counts from next week, so a week's targets do
    not move while it is trained.
  - A session's average RPE is taken over the sets at its working load that carry one. A
    session with none of them breaks a rising run.
  - An undone or declined change keeps its rule's `why`, and `decision` says it was
    answered.
- **The spec's "though an earlier week had one" needs no check of its own.** A lift with a
  working load always has a workout before the week before, so the missed-week deload
  reads the week before alone.
- **The plan gate's progression sweep runs every main-sweep input** (11,970, under eight
  histories, in about 22 s), and asserts that each kind of change is reached. One mutant
  passes the gate and fails the unit tests: dropping the library-flag half of the injury
  rule, since the generator never puts a lift flagged for a named area in a plan.
- **#362's route tests insert their plan with Prisma,** not through `/api/generate`:
  index.js builds its Gemini client from `server/.env` when it loads. The path, not the
  trimmed key, decides a lift's answer from the week's, because a key of spaces trims to
  the week's `''`. A stubbed-deps file covers the user-gone 404 and the 500s.
- **#363 differs from Task 4 in four places.**
  - App passes `apiFetch` to DashboardPage, which Task 4's file list left out.
  - `buildPlanDayPrefill` takes the region's unit as a third argument, read once by
    PlansView, so the helper stays pure.
  - A timed exercise never takes a lift's load, even when another day prescribes the same
    name in reps; a surviving mutant found the case.
  - The axe scan of the day details runs in `plan.spec.js`, the only spec with a plan and
    a logged week. `a11y.spec.js`'s account has no plan.
- **#363 grew the main chunk by 1,847 bytes**, from 462,521 to 464,368. About 490 bytes are
  `planUtils`'s additions, which are eager because the summary's metrics import the module,
  and about 1,360 the hook, the summary's line and the wiring; `WeekProgression` stays in
  the lazy PlansView chunk. Each part was measured by building without it.
- **Task 5 raised both sides.** The client's branch floor went from 95.1 to 95.3 (#364).
  The server's four went to 96.7 / 91.9 / 97.5 / 97.4 (#365), which leaves its function
  slack at exactly 0.

Every file and line below was read on `ddc46f6`.

---

## Owner's decisions

Made 2026-11-06, within G4 (decided 2026-11-02):

- **The plan adapts every week, on the saved plan**, never by regenerating it.
- **Double progression:** a lift's target is the top of its rep range on every set.
- **A lift deload is about 10% lighter**, then builds back.
- **The deload week is the 6th training week in a row**, a beginner's first the 8th; a
  missed week resets the count.
- **Only a step up on an injury-flagged lift is asked first.**
- **The server works it out on each read**, in a pure module the plan gate scores.

## Decided while planning

Reading the code for this plan settled points the spec left open. The spec now says each
of these (same PR):

1. **The week has its own read, `GET /api/dashboard/progression?today=`**, and is not part
   of `GET /api/dashboard`. Every write route answers with `buildDashboardResponse(updated)`
   and carries no `today` (`registerSavedExerciseRoutes.js` and its siblings), and the
   client swaps each answer's `dashboard` in. A workout dated in an earlier week, a new plan
   (`events.js` `onSubmit` prepends `savedPlan` locally) and a changed profile note all
   change the week's targets, so the client reads the week again when one of them changes.
2. **The week's answer has its own path,** `/progression/:weekStart/week`, beside
   `/progression/:weekStart/lifts/:liftKey`. The table still stores `''` for the week, which
   Express cannot match as a path segment.
3. **The newest plan only,** when it has a saved structure. That is the plan the hub shows
   and logs against (`PlansView.jsx`, `savedPlanDays(dashboard.plans[0])`). An older plan
   with a structure would put targets on a week the hub does not show.
4. **The week window is the Monday of any date within one day of the server's UTC date,**
   the same tolerance `today` gets. That is the spec's "this Monday or the one before",
   stated so that a client a day ahead on a Sunday is covered too.
5. **Rounding works from `from`.** In each unit, `from` is the working load rounded to the
   nearest step, never below one step. A step up is `from` plus one step, so the gate's
   "exactly one step" holds in pounds too: 60 kg is 132.28 lb, and rounding the raw load
   plus 5 lb would give 135 lb, 2.72 lb up. A deload is the nearest step to 90% of `from`,
   at most `from` less one step. A lift already at one step holds.
6. **Every set at the working load must qualify for a step up,** and there must be at least
   the prescribed number of them.
7. **A deload week resets the count whether or not it was trained normally,** so the walk
   reads no past answers and the repository reads one week's rows only.
8. **Pregnancy is not an area here.** The health answers shape one plan and are not saved
   (`generateRoutes.js`, the comment above `health: body.health || {}`), so
   `readInput`'s pregnancy area cannot be rebuilt on a later read.
9. **The hook and the summary line are on the eager path.** The summary view is not lazy
   (`DashboardPage.jsx` lazy-loads every other view), so the main chunk grows by them;
   Task 4 measures it in exact bytes.

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md` and README passages, that describe a change move in the
  PR that makes it.

**Test first.** Every behaviour change starts with its test, which must fail for the right
reason before the change makes it pass. A mutation then shows the test holds. Confirm each
mutation applied before trusting a run, and restore the file from a saved copy (ADR 0015).
Write mutation scripts with the Write tool, never a heredoc, and give each pattern enough
context to match once. Run a new component's tests red before writing it: #357 skipped that
step and had to disclose it.

**Coverage slack is thin on both sides,** on `ddc46f6`:

- Client: statements **0.46**, branches 2.93, functions **0.22** and lines 0.74.
- Server, with `client/dist` present: statements 1.40, branches 1.98, functions **0.40**
  and lines **0.45**.
- So every function, branch and line a PR adds ships with its test.

**Absent is not zero** (ADR 0001). A missing load is no load, never 0 kg, and a missing RPE
is never easy. Every numeric reader guards absent input before `Number()` and gets a row in
its side's numeric-coercion contract.

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
merge. A PR that falls `BEHIND` is updated with `gh pr update-branch` and checked again.

## Task 1: the spec and this plan (PR 1)

- [ ] Add both files to `docs/README.md`'s Plans and Specs lists, after the progress-records
      entries.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Branch `docs/adaptive-progression` (the spec is already committed there), commit, PR,
      merge when `CLEAN`.

## Task 2: the rules (PR 2)

**Files:**

- Create: `server/src/services/planning/progression.js`, with a header, `// @ts-check` and
  JSDoc types.
- Create: `server/src/services/planning/__tests__/progression.test.js`.
- Create: `scripts/evals/histories.mjs`: the gate's history fixtures.
- Modify: `scripts/evals/__tests__/generatePlan.gate.test.mjs`: a progression sweep.
- Modify: `server/src/__tests__/numericCoercion.contract.test.js`: a row for `readSet`.
- Modify: `scripts/__tests__/repo-invariants.test.mjs`: `TYPE_CHECKED_FILES` 13 to 14.

The module exports:

- `STEPS`: `{ kg: 2.5, lb: 5 }`.
- `liftKeyOf(name)`: the name trimmed and lower-cased, as B2 groups lifts.
- `weekStartOf(dateKey)`: the Monday of a `YYYY-MM-DD` key, as a key. Date-key arithmetic in
  UTC, so the server's zone never moves a day.
- `clientToday(today, now)`: `today` when it is a date key within one day of `now`'s UTC
  date, otherwise `now`'s UTC date key.
- `allowedWeekStarts(now)`: the Mondays of `now`'s UTC date and the days either side of it.
- `deloadSets(sets)`: `Math.max(1, Math.ceil(sets / 2))`.
- `readSet(set)`: `{ reps, loadKg, rpe }`, each read with `toNumberOrNull` from
  `repositories/rowValues.js`, so a missing value is null and a measured 0 is 0.
- `buildProgression({ plan, sessions, decisions, today, notes, library = EXERCISES })`: the
  week's progression, in the spec's shape, or null when `plan` has no saved structure.
  - `plan` is a mapped plan (`mapGeneratedPlan`), whose `payload.days[].prescriptions` hold
    the lifts and whose `level` and `injuries` the rules read.
  - `sessions` are mapped sessions (`mapWorkoutSession`): `date` and `createdAt`, and
    `exerciseSets` of `{ name, pattern, sets }`.
  - `decisions` is a map from lift key (`''` for the week) to decision.
  - `notes` is the profile note, read with `buildInjuryText(plan.injuries, notes)` and
    `detectInjuryAreas`.
  - Each lift appears once, under its first prescription's name, with `sets` the week's
    sets: the prescription's, or `deloadSets` of them in a deload week trained light.

Steps:

- [ ] Branch `feat/progression-rules`. Set the roadmap's `status/B4` to `active`, with a
      note naming this plan (ArtifactData `set` with no `if_version`; the document does not
      exist yet).
- [ ] **Test first, against hand-worked histories written in the test file.** Build each
      from a small plan payload and dated sessions, never from `generatePlan`, so a fixture
      cannot drift with the generator. Every case below is a test:
  - `weekStartOf`: a Monday is its own; a Sunday is the Monday six days before; a month
    and a year boundary.
  - `clientToday`: a day either side is kept; two days off, a non-date and a missing value
    are replaced.
  - Lifts: a seconds prescription gets none; a lift with no load above 0 in the four weeks
    is `none` with "Pick a load"; a load 29 days back counts for nothing, 28 days back
    counts; names match in any case and spacing.
  - Working load: the heaviest of mixed loads in the most recent session, not the heaviest
    in the window.
  - Step up: three sets of 10 at RPE 8 on 3 x 8-10 goes up; one set at 9 reps holds; RPE
    8.5 holds; a set with no RPE holds; two qualifying sets on a 3-set prescription hold; a
    lighter back-off set does not block it.
  - Lift deload: no workout in the week before, with one earlier, deloads every lift; with
    none earlier it does not; the Sunday before the Monday counts as the week before. RPE
    7, 7.5 and 8.5 at one load deloads; 7, 7.5 and 8 holds; two rising sessions hold; a
    session with no RPE in the run holds; a load change breaks the run.
  - Rounding: 60 kg goes up to 62.5 kg and, from 132.28 lb, 130 lb to 135 lb; 60 kg deloads
    to 55 kg; 10 kg deloads to 7.5 kg; a lift at 2.5 kg holds; lb deloads by 5 lb steps.
  - Deload week: five counted weeks before this one make it a deload week, four do not; a
    beginner's first is after seven, then every sixth; a missed week resets the count; a
    deload week resets it; an unknown level is read as intermediate. In a deload week each
    lift holds at `from` and `sets` is `deloadSets`.
  - Order: a deload week beats a lift deload, which beats a step up.
  - Asked first: with "knee" as the injury answer, a step up on "Dumbbell box squat" (named
    as the knee regression of "Dumbbell goblet squat") is `ask`; with the note "sore knee"
    and no injury answer, a step up on "Dumbbell goblet squat" (tagged knee `modify`) is
    `ask`; a hold or a deload on either stays automatic; a lift flagged for an area nobody
    named is not asked.
  - Answers: `undo` turns an `up` or a `deload` into a hold; `accept` and `decline` turn an
    `ask` into an `up` or a hold; `normal` turns a deload week into a usual one, with each
    lift back on the lift rules; an answer that does not fit the change is ignored; every
    lift carries its `decision`.
  - Why: the step up's sentence names the session's date ("Every set reached 10 reps at
    RPE 8 or below on Mon 2 Nov"), and each other change has its sentence.
  - A plan with no payload is null.
- [ ] Run them: they fail, because the module does not exist.
- [ ] Write the module. Read every logged number with `readSet`, add its contract row
      (missing, `null` and `""` agree; a non-numeric string is absent; 0 survives), and
      raise `TYPE_CHECKED_FILES`.
- [ ] **The gate.** `scripts/evals/histories.mjs` exports `HISTORIES`, each a function from a
      generated plan's week and a `weekStart` to sessions logged against it: every lift at
      the top at RPE 8; at RPE 8.5; one set short; one set without an RPE; three sessions of
      rising RPE; a missed week; five and seven counted weeks before this one. The gate gains
      "the progression sweep": every input of the main sweep, with the knee, shoulder and
      lower-back answers included, and each history, through `generatePlan` then
      `buildProgression` with the plan as the route would read it back. It asserts, for every
      lift:
  - no `up` on an injury-flagged lift, read from the library independently of the module;
  - no `up` unless every set at the working load reached the top at RPE 8 or below;
  - an `up` is exactly one step, in kg and in lb;
  - a `deload` is at least one step and no more than 10% plus one step lighter;
  - in a deload week, every lift's `sets` is `deloadSets` of its prescription and no
    target is above `from`.

  Measure the sweep's time. If it passes `SWEEP_TIMEOUT_MS`, sweep every second input and
  say so in the test's comment, with the count it reaches.

- [ ] **Mutations,** each of which must fail a test: RPE `<= 8` as `< 8`, and as `<= 9`; the
      top of the range read as `min`; a missing RPE counted easy; the nearest step as the step
      below; the one-step floor dropped; the deload-week threshold off by one; the beginner
      offset dropped; an `ask` applied as an `up`; the deload week below the lift deload in
      the order; the four-week window off by one day.
- [ ] Gates and coverage. Nothing calls the module yet, and that is fine for knip: an export
      only a test imports counts as used (B2's Task 3 checked this).

## Task 3: the server API (PR 3)

**Files:**

- Create: `server/db/postgres/007_progression_decisions.sql`.
- Modify: `server/prisma/schema.prisma`: `ProgressionDecision`, and its relation on
  `AppUser`.
- Create: `server/src/repositories/progressionDecisionRepository.js`, with its test in
  `server/src/repositories/__tests__/`.
- Create: `server/src/routes/dashboard/registerProgressionRoutes.js`, registered by
  `server/src/routes/dashboardRoutes.js`.
- Modify: `server/src/routes/dashboard/validation.js`: the query, params and body schemas.
- Modify: `server/src/index.js`: build the repository and pass its functions as deps, as it
  does for `createSavedExerciseRepository`.
- Create: `server/src/routes/dashboard/__tests__/progression.integration.test.js`, its own
  file because of the auth limiter's 25 signups a file.
- Modify: `README.md`'s route list (line 256 reads "Dashboard: `GET /api/dashboard`, …"):
  add the progression read, and the progression answers to the "Dashboard writes" line.

The migration:

```sql
-- One answer per user, week and lift to the week's progression (roadmap B4,
-- docs/specs/2026-11-06-adaptive-progression-design.md). lift_key is the
-- lower-cased lift name, or '' for the week's own answer, which is "normal".
create table progression_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  lift_key text not null check (char_length(lift_key) <= 140),
  decision text not null check (decision in ('undo', 'accept', 'decline', 'normal')),
  created_at timestamptz not null default now(),
  constraint progression_decisions_week_answer_check check ((lift_key = '') = (decision = 'normal')),
  constraint progression_decisions_user_week_lift_key unique (user_id, week_start, lift_key)
);
```

The unique constraint is full, not partial, so `schema.prisma` can name it
(`@@unique([userId, weekStart, liftKey], map: "progression_decisions_user_week_lift_key")`)
and the repository can use Prisma's `upsert` on it, unlike the legacy-id tables.

The repository exports `createProgressionDecisionRepository({ prisma })`, returning:

- `listWeekDecisions({ userId, weekStart })`: the week's rows as a map from lift key to
  decision; an empty map when the user cannot be resolved (`getUserPk`);
- `saveDecision({ userId, weekStart, liftKey, decision })`: an upsert;
- `removeDecision({ userId, weekStart, liftKey })`: a `deleteMany`, which removes nothing
  for a row that is not there.

The routes, all behind `requireAuth`:

- `GET /api/dashboard/progression?today=`: `today` optional; one that is not
  `YYYY-MM-DD` is a 400. It loads the user with `findUserWithDashboard`, reads the week's
  decisions, and answers `{ progression }` from `buildProgression` with the newest plan,
  the sessions, `profile.notes` and `clientToday(today, new Date())`.
- `PUT` and `DELETE /api/dashboard/progression/:weekStart/lifts/:liftKey` and
  `/progression/:weekStart/week`: a `weekStart` outside `allowedWeekStarts(new Date())` is
  a 400; a `liftKey` that is not one of the week's lifts is a 404; a lift's decision is one
  of `undo`, `accept` and `decline`, and the week's is `normal`. Each answers
  `{ progression }`, recomputed for `weekStart`.

Steps:

- [ ] Branch `feat/progression-api`.
- [ ] **Test first, the repository:** a save then a list reads it back; a second save of the
      same key replaces it; a remove leaves the other keys; one user's rows are not in
      another's list; an unknown user lists nothing.
- [ ] **Test first, the routes,** in the integration file:
  - signed out, each route is a 401;
  - with no plan, `progression` is null;
  - with a plan saved through `/api/generate` and a workout logged last week with every set
    at the top at RPE 8, the read shows the step up, and `today` a day off still reads that
    week while two days off reads the server's own;
  - a `today` of `"tomorrow"` is a 400;
  - `undo` holds the lift, and `DELETE` brings the step up back;
  - a `weekStart` two weeks back, and one that is not a Monday, are 400s;
  - a decision outside its path's values is a 400, and `normal` on a lift path is a 400;
  - an unknown `liftKey` is a 404;
  - another user's `PUT` on the same key leaves this user's week unchanged;
  - a `PUT` without the CSRF header is refused.
- [ ] Run them red, then write the migration, the model (`npm run prisma:generate -w server`),
      the repository, the schemas and the routes. Apply the migration locally with
      `npm -w server run migrate:postgres`.
- [ ] **Mutations:** the window widened to two days; the unique key without `week_start`;
      the 404 check dropped; the decision schema accepting `normal` on a lift path; the read
      ignoring `profile.notes`.
- [ ] Gates and coverage. The server's function and line slack is under half a unit, so
      every handler is reached by a test.
- [ ] After merge, confirm the Deploy run applied migration 007 before Task 4 merges.

## Task 4: the client (PR 4)

**Files:**

- Create: `client/src/pages/dashboard/hooks/useProgression.js`, with its test. It reads the
  week, re-reads it when its key changes, and answers and takes back. The key is the newest
  plan's id, the profile note, and the ids of the saved workout sessions; an id starting
  `optimistic-` (`buildOptimisticId` in `events.js`) is not saved yet and is left out. A
  stale answer is dropped by request id, as `useDashboardData` drops one.
- Create: `client/src/pages/dashboard/components/WeekProgression.jsx`, with its test: the
  deload banner and "Train normally", and for each of a day's lifts its load in the region's
  unit (`getPreferredMeasurementSystem`), its change, its reason, and Undo, or Go up and
  Keep. Each button's accessible name names the lift ("Undo the step up for Dumbbell box
  squat"), with the lift name in a `.visually-hidden` span.
- Modify: `client/src/pages/dashboard/DashboardPage.jsx`: call `useProgression` with
  `user?.profile?.notes` (as `TipsView` reads the note), above the `if (!user)` early
  return like the hooks already there, and pass the week to `PlansView` and its
  `deloadWeek` to `SummaryView`.
- Modify: `client/src/pages/dashboard/views/PlansView.jsx`: `WeekProgression` in the day
  details under "Workout details", and the week passed to `buildPlanDayPrefill`.
- Modify: `client/src/pages/dashboard/planUtils.js`: `buildPlanDayPrefill(day, week)` opens
  each card with the week's sets as rows and the week's load as `targets.load`, and exports
  `deloadSets`.
- Modify: `client/src/pages/dashboard/components/ExerciseCard.jsx`: the load input's
  `placeholder={card.targets?.load ?? ""}`, and `client/src/app/exerciseSets.js`'s
  `ExerciseCard` typedef gains `load` on `targets`.
- Modify: `client/src/pages/dashboard/views/SummaryView.jsx`: the plan line adds ", deload
  week" when one is active and not answered `normal`.
- Modify: `client/src/pages/dashboard/views/PlansView.css`: the lift lines, the change
  labels and the banner, with a `prefers-reduced-motion` block if anything moves.
- Create: `client/src/pages/dashboard/__tests__/progression.contract.test.js`: the client's
  `deloadSets` equals the server's for 1 to 10 sets. A client test may import server
  modules (CLAUDE.md).
- Modify: `e2e/plan.spec.js`, `e2e/a11y.spec.js`, and the capture tool's printed copy in
  `docs/plans/2026-10-16-readability-follow-up-phase-4.md`.

Steps:

- [ ] Branch `feat/progression-client`.
- [ ] **Test first, the hook:** it reads the week with today's local date; a new newest plan,
      a changed note and a newly saved session each read it again; an optimistic entry and a
      re-render with the same key do not; an answer swaps the week in; a stale answer is
      dropped; a failed read leaves the week null and the dashboard working.
- [ ] **Test first, the component:** each change's label and reason; a load in pounds under an
      imperial region; Undo on an `up` and a `deload`, Go up and Keep on an `ask`, nothing
      on a `hold` or a `none`; a taken-back answer shows its control again; the banner and
      Train normally only in a deload week; the buttons' accessible names.
- [ ] **Test first, the pre-fill and the summary:** a lift's card has the week's sets as rows
      and its load target as the placeholder; an `ask` not yet answered shows `from`; a
      deload week halves every card's rows, holds included; no week leaves B1's pre-fill as
      it is; the summary line with and without a deload week.
- [ ] Run each red, then write it.
- [ ] **Screenshot compare.** Add a `dash-plans` state to the capture tool and its printed
      copy: it opens `/dashboard/plans`, answers `GET /api/dashboard/progression` with a week
      holding an `up`, an `ask`, a `deload` and a `none`, and opens Monday's details.
      Capture `main` with it first. Write the expectations before the "after" capture:
      `dash-plans` changes and nothing else does. Never widen an expectation to pass.
- [ ] **E2E:** `plan.spec.js` logs a plan day dated last Monday with every set at the top
      at RPE 8 and a load, then checks that the hub shows a step up with its reason, that
      Undo reverts it, and that opening the log shows the target as the load placeholder.
      The spec's plan answers "Knee" (`plan.spec.js`, step 2), so its "Dumbbell box squat"
      is asked first: assert the question for it and the step up for a lift of that day
      with no knee flag. `a11y.spec.js` scans the day details with a change and a question on screen.
- [ ] **Mutations:** the region ignored for loads; Undo shown on a `hold`; the deload week
      not halving holds; the key ignoring the note; an optimistic id in the key.
- [ ] Gates, coverage, the E2E suite, and the main chunk in exact bytes (`wc -c`) against
      `main`'s 462,521, with the growth explained in the PR.

## Task 5: re-measure and close

- [ ] On `main` after Task 4, measure both sides' coverage with json-summary, the server
      with `client/dist` present. Open a floor PR for each side whose truncated figure
      rose.
- [ ] Mark this plan done and the spec applied, with the PR numbers and where the work went
      past the text.
- [ ] Set the roadmap's `status/B4` to `done`, with a note naming the PRs.

## Done when

- The plan hub shows each lift's load for the week, in the region's unit, with its change
  and the reason, and the log pre-fill offers it as the load placeholder.
- A step up follows a session with every set at the working load at the top of the range at
  RPE 8 or below; a missed week or rising RPE deloads; a deload week comes in the 6th
  counted week (a beginner's first in the 8th) at half the sets.
- Every automatic change can be undone for the week, a step up on an injury-flagged lift
  waits for the answer, and the plan gate holds across the history fixtures, injury cases
  included.
