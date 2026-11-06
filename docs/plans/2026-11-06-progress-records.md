# Progress records, e1RM and weekly sets, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logs gains a Progress panel: hard sets per muscle group this week against the
four weeks before, and per lift the best e1RM, the heaviest set and, for bodyweight lifts,
the most reps, with sessions that set a record tagged "PR". This is roadmap B2.

The work is one docs PR, three code PRs and a floor PR per side whose figure rose.

**Design:** `docs/specs/2026-11-06-progress-records-design.md`. The definitions, the group
table and the panel's rules are not repeated here.

**Tech Stack:** Express 5, Prisma with Postgres, React 19, Vitest 5 with v8 coverage,
supertest, Testing Library, Playwright 1.64, Node 24, GitHub Actions, gh CLI.

**Status: done 2026-11-06** (#354 to #358, all live; main `5f89e0f`). These are the places
the work goes past or departs from the text below.

- **#356 decided five things the spec left open.**
  - An unknown pattern counts as Not sorted, alongside a typed name's null and an unsaved
    entry's missing key.
  - Records come from rep sets only, so a lift logged only as holds is not listed.
  - The heaviest set's change is its load's.
  - The "record then" includes the cutoff day.
  - Task 3's "missing load read as 0" mutation is equivalent: behind the load-above-0 gate,
    no load and 0 kg give the same answer. The test for a non-finite load is what
    distinguishes `toNumberOrNull` from `Number()`.
- **#357 grew the main chunk by 15 bytes, not 0.** In exact bytes it went from 462,506 to
  462,521. That is two export entries, `toNumberOrNull` and `fromLoadKg`, which the lazy
  Logs chunk now imports from the main chunk; with both stubbed, the main chunk measured
  the same as before. Copying them into the chunk would break CLAUDE.md's "import it".
- **#357's PR tag** hides the visible "PR" from screen readers, which read only the hidden
  label. "Show all" is a toggle that stays in place.
- **Task 5 raised the client's floors only (#358).** The server's local figures truncate to
  its current floors.

Every file and line below was read on `8f99904`.

---

## Owner's decisions

Made 2026-11-06:

- **Volume is hard sets per muscle group per week.**
- **Every loaded lift of 1 to 10 reps gets an Epley e1RM.**
- **A record is the best e1RM and the heaviest set per lift**, and the most reps for a
  bodyweight lift, with "PR" tags in Logs.
- **A Progress panel in Logs**, computed by the client, with the server tagging each logged
  exercise with its library pattern.

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
context to match once.

**Coverage slack is thin on both sides.**

- Client, on `8f99904`: statements 4.28, branches **0.75**, functions 1.06 and lines
  **0.18**.
- Server, on `e208827` with `client/dist` present: statements 1.33, branches 1.80,
  functions **0.37** and lines **0.39**.
- So every function, branch and line a PR adds ships with its test.

**Absent is not zero** (ADR 0001). Every numeric reader guards absent input before
`Number()` and gets a row in its side's numeric-coercion contract. A missing load is no
load, never 0 kg.

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

- [ ] Add both files to `docs/README.md`'s Plans and Specs lists.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Branch `docs/progress-records` (the spec is already committed there), commit, PR,
      merge when `CLEAN`.

## Task 2: the server's pattern tag (PR 2)

**Files:**

- Modify: `server/src/repositories/workoutSessionRepository.js`: `groupExerciseSets` adds
  `pattern` to each exercise.
- Test: `server/src/repositories/__tests__/workoutSessionRepository.test.js`, and
  `server/src/routes/dashboard/write/__tests__/workoutSessionSets.integration.test.js` for
  the save's answer and the dashboard read.

Steps:

- [ ] Branch `feat/exercise-pattern-tag`. Set the roadmap's `status/B2` to `active`, with a
      note naming this plan (ArtifactData `set`; the document does not exist yet).
- [ ] **Test first:**
  - a library name ("Dumbbell box squat") reads back with `pattern: "squat"`;
  - the same name in another case and with surrounding space tags the same;
  - a typed name ("My cable thing") tags `null`;
  - two exercises in one session each get their own pattern;
  - through the route, the save's answer and the dashboard's workouts carry the tag.
    Run them: they fail, because nothing tags yet.
- [ ] **The tag:** a module-level `Map` from `name.trim().toLowerCase()` to `pattern`, built
      once from `EXERCISES`, and `pattern: PATTERN_BY_NAME.get(key) ?? null` on each
      grouped exercise. Import `EXERCISES` from `services/planning/exerciseLibrary.js`.
- [ ] **Mutations,** each of which must fail a test: the lookup without `toLowerCase`;
      without `trim`; `?? null` dropped (undefined reaches the answer); the map built
      from the wrong field.
- [ ] Gates and coverage. No client change: the server ships the tag before any client
      reads it.

## Task 3: the arithmetic (PR 3)

**Files:**

- Create: `client/src/pages/dashboard/progress.js`, with a header, `// @ts-check` and
  JSDoc types.
- Create: `client/src/pages/dashboard/__tests__/progress.test.js`.
- Modify: `client/src/__tests__/numericCoercion.contract.test.js`: a row for each numeric
  reader `progress.js` exports.
- Modify: `scripts/__tests__/repo-invariants.test.mjs`: `TYPE_CHECKED_FILES` 12 to 13.

The module exports:

- `GROUPS`: the spec's six groups, in display order, each with its patterns.
- `e1rmOf(set)`: the Epley value for a set with a load above 0 and 1 to 10 reps, or null.
- `weeklySets(sessions, today)`: per group, this week's count and the four-week average,
  plus the "Not sorted" count. Weeks start on Monday, by the session's local date.
- `liftRecords(sessions, today)`: per lift, the best e1RM, the heaviest set and the most
  bodyweight reps, each with its date and its change since four weeks before `today`;
  ordered most recently trained first.
- `prSessions(sessions)`: a map from session id to the records it set, for the Logs tags.

Steps:

- [ ] **Test first, against numbers worked by hand in the test file:**
  - `e1rmOf`: 100 kg × 5 is 116.67, 1 rep is its load, 10 reps is 133.33, 11 reps and 0 kg
    and a missing load are null, and seconds-only sets are null;
  - `weeklySets`: a Monday and the Sunday before fall in different weeks; the four-week
    average to one decimal; conditioning, mobility and balance count nowhere; a `null`
    pattern counts as "Not sorted"; an empty input gives no rows;
  - `liftRecords`: names grouped in any case and spacing, shown under the most recent
    spelling; a heavier load beats more reps, and more reps break a tie; a lift with no
    load above 0 is a bodyweight lift with most reps; the four-week change is the record
    now against the record then, and none when either is missing or they are equal;
  - `prSessions`: sessions in date order, then save order; a lift's first session sets no
    PR; a later session that beats the best e1RM, the heaviest set or the bodyweight reps
    is marked with which.
- [ ] Write the module. Read every number with `toNumberOrNull` from `app/units.js`, and add
      the contract rows.
- [ ] **Mutations:** the 10-rep window off by one; the 1-rep case through the formula; a
      week starting on Sunday; the tie broken by fewer reps; a lift's first session marked
      PR; the four-week change against today rather than four weeks back; a missing load
      read as 0.
- [ ] Gates and coverage. Nothing renders it yet, and that is fine for knip: an export only a
      test imports counts as used (checked on `8f99904` with a throwaway module and test).

## Task 4: the panel and the PR tags (PR 4)

**Files:**

- Create: `client/src/pages/dashboard/components/ProgressPanel.jsx`, with its test.
- Modify: `client/src/pages/dashboard/views/WorkoutsView.jsx`: the panel above the workout
  log, and the PR tag by a session's date.
- Modify: `client/src/pages/dashboard/views/WorkoutsView.css`: the panel's table, rows and
  tag.
- Modify: `client/src/styles/base.css`: a `.visually-hidden` utility. It is in the `base`
  layer, so it holds no `!important` (CLAUDE.md).
- Modify: `e2e/plan.spec.js`, `e2e/a11y.spec.js`.
- Test: `client/src/pages/dashboard/views/__tests__/WorkoutsView.test.jsx`.

Steps:

- [ ] **Test first, the panel:** the sets table's rows in `GROUPS` order with "Not sorted"
      last and empty groups left out; the records' order, eight shown and "Show all"; a
      bodyweight lift's "most reps"; the four-week change; the e1RM note; loads in pounds
      under an imperial region; the empty state.
- [ ] **Test first, the tag:** a session in `prSessions` shows "PR" with its hidden label; one
      outside it shows none.
- [ ] The panel and the tag. The table is a `<table>` with `<th scope="col">` headers. The
      app has no visually-hidden class (checked on `8f99904`), so this PR adds one,
      `.visually-hidden`, to `client/src/styles/base.css`: clipped to one pixel, out of the
      layout, still read aloud. The tag is "PR" followed by a `.visually-hidden` span naming
      the record.
- [ ] **Screenshot compare.** The capture tool has no Logs state (checked on `8f99904`: its
      dashboard states are loading, summary, meal and tips loading, the workout modal and
      the planner). Add a `dash-logs` state to the printed copy in
      `docs/plans/2026-10-16-readability-follow-up-phase-4.md`:
  - it opens `/dashboard/workouts`;
  - its signed-in API answers with sessions that carry sets, enough for every group, a
    bodyweight lift, a PR tag and more than eight lifts;
  - it checks for the workout log.

  Capture `main` with it first, so the state has a "before". Write the expectations before
  the "after" capture: the `dash-logs` captures change and nothing else does. Compare, and
  never widen an expectation to pass.

- [ ] **E2E:** `plan.spec.js` opens Logs after its B1 check and finds the Progress panel:
      Legs with 3 sets this week, and the squat's heaviest set, 30 lb × 12, with no e1RM.
      `a11y.spec.js` scans Logs with the panel filled.
- [ ] **Mutations:** "Not sorted" not shown; the eight-row limit off by one; the tag shown
      for every session; the region ignored for loads.
- [ ] Gates, coverage, the E2E suite, and the main chunk's size, which must not grow (Logs
      is lazy).

## Task 5: re-measure and close

- [ ] On `main` after Task 4, measure both sides' coverage with json-summary, the server
      with `client/dist` present. Open a floor PR for each side whose truncated figure
      rose.
- [ ] Mark this plan done and the spec applied, with the PR numbers.
- [ ] Set the roadmap's `status/B2` to `done`, with a note naming the PRs.

## Done when

- Each logged exercise in a session read carries its library pattern, or null.
- Logs shows this week's hard sets per muscle group against the four weeks before, and per
  lift the best e1RM (1 to 10 reps), the heaviest set and the most bodyweight reps, with
  the four-week change.
- A session that set a record is tagged "PR" in the workout log, with a label a screen
  reader reads.
- The main chunk did not grow.
