# Exercise swaps from the library, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone swap an exercise in their plan for an alternative from the curated
library. The alternatives are chosen under the rules that built the plan, plus an optional
area that bothers them. They swap from the plan day's details or the in-gym screen, the
plan changes on every day the exercise appears, and the swap says what it replaced, with
an Undo. This is roadmap C4. It needs B4, done.

The work is one docs PR, two server PRs, two client PRs, a floor PR for each side whose
figures rose, and a close-out docs PR.

**Design:** `docs/specs/2026-11-08-exercise-swaps-design.md`. Where this plan names a
behaviour, the spec's wording wins.

**Architecture:**

- `generatePlan.js` exports `candidatesFor`, the one rule for choosing and for swapping,
  and `prescribe`, the one way to write a prescription and its line.
- A pure module, `services/planning/swaps.js`, works out a plan's alternatives, a swap and
  an undo.
- The plan repository gains a read and a locked rewrite. New routes under
  `/api/dashboard/plans/:planId/swaps` serve them.
- On the client, one shared `SwapStep` component serves the plan hub and the in-gym
  screen. App's `replacePlan` puts the returned plan into the dashboard.

**Tech Stack:** Express 5, Prisma with Postgres, zod, React 19, Vitest 5 with v8 coverage,
Testing Library, Playwright 1.64.

**Status: done 2026-11-10** (#384 to #392, all live; main `5851e87`). These are the
places the work goes past or departs from the text below.

- **#385, one rule.**
  - **The health answers stay unsaved** (owner, 2026-11-08). As first written, this plan
    saved them in the payload. The rule-based plans spec decided they are not stored,
    and a route test holds that. `healthFromNotes` in `fallbackNotes.js` reads them back
    from the safety lines instead, whose sentences are now constants the writer shares.
    The spec and this plan were corrected in the same PR.
  - Each prescription's `role` is its slot's. A regression in a main slot keeps
    `"main"`, so a swap out of it takes the dose the generator gives that slot.
- **#387, the swap, pure.**
  - **A day's ramp-up follows its lead lift**, which the plan did not foresee. It is
    renamed, or dropped for a bodyweight lift, and `swappedFrom.rampLine` restores it.
  - **A plan whose text does not hold a day's lines as its payload does** is not
    swapped, and the route answers 409.
  - `SavedPlan`'s text columns are required, since `mapGeneratedPlan` always fills them.
    Defaults for them were unreachable branch arms, which put server branches below
    their floor until removed.
  - The gate's swap sweep checks every alternative against the generator's own rules,
    not the swap's, and also runs each three-day plan with no injury as pregnant, so
    reading health from the notes is exercised. With options taken from the whole
    pattern, it fails by itself.
- **#388, the routes.** The lock is proved by a staged race: the first rewrite waits
  inside its transaction, and without `FOR UPDATE` the second's change is lost. Age
  only changes an older adult's static-stretch dose, so a stubbed test with a
  70-year-old pins that the profile's age reaches the rules.
- **#389, the plan hub.**
  - **`useProgression` reads the week again when the plan's lifts change.** A swap
    keeps the plan's id, and the week is built from its prescriptions, so the swapped
    lift's load waited for a reload. The plan missed this.
  - **The area buttons stay put while the alternatives load.** Shown only with an
    answer, they vanished on every tap; the tests found it.
  - `SwapStep` has its own `SwapStep.css`, scoped to `.swap-step`, since it is shared.
  - The swap step's axe scan is in `plan.spec.js`, which has a plan on screen, not
    `a11y.spec.js`. `capture.mjs` gained `CAPTURE_SKIP`, for a state `main` cannot reach.
- **#390, the in-gym screen.**
  - **Swap is offered by the planned-sets rule alone.** A blank session's exercises
    have no planned sets, so a check for the session's plan was a second guard on the
    same thing, and is gone. It stays only on the offline hint.
  - `SwapStep`'s `onSwapped` passes the name swapped in as well, and the session finds
    the new prescription on its plan day by it. A plan whose day no longer holds it
    leaves the session's exercise.
- **#391 and #392, the floors.** Client branches rose to 95.7. All four server floors
  rose, to 96.9 / 92.3 / 97.6 / 97.5.
- **WebKit and Firefox** (Playwright 1.64.1) each passed `plan.spec.js` and
  `session.spec.js`, 9 of 9, twice, on `36e9258`.

Every file and line below was read on `f4b9c76`.

---

## Owner's decisions

Made 2026-11-08:

- **A swap changes the plan from then on**, on every day the exercise appears.
- **It starts from the plan day's details, or from the in-gym screen's exercise list.**
- **The alternatives follow the plan's own rules, plus an optional area.**
- **A swapped exercise says what it replaced and why, with an Undo** that restores the
  plan's original.

## Decided while planning

1. **The profile's age is read at swap time, not saved.** `/api/generate` passes
   `req.user.profile.age` to `generatePlan`, where it sets the older-adult mobility doses.
   The swap routes read it the same way, so nothing about the person is saved for swaps.
2. **`replaceExercise(session, index, prescription)` builds the new exercise from the
   prescription.** The spec's signature also took a card. A card comes from
   `buildPlanDayPrefill` in `pages/dashboard/`, which `app/` never imports, and a swapped
   lift has no B4 load to pre-fill anyway.
3. **`SwapStep` lives in shared `client/src/components/`**, because two pages render it.
4. **Swapping back to the original name is an undo.** It drops `swappedFrom`, so the
   prescription is exactly the generated one.
5. **A line is found by its name.** A prescription line reads
   `- [A1. ]<name>: <dose>`, and names are unique in the library. The line matching
   `/^- (?:[A-Z]\d\. )?<name>: /` is the one rewritten, keeping its label.
6. **Status codes:**
   - 404: a plan that is not the user's, or that has no saved structure.
   - 400: a malformed query or body, an area not in `INJURY_AREAS`, or (on GET) an
     exercise not in the plan.
   - 409 (on POST): a `from` no longer in the plan, a `to` not offered, or an undo with
     nothing swapped. Each means the plan changed under the client.
7. **The health answers stay unsaved** (owner, 2026-11-08, while starting PR 2). As first
   written, this plan saved them in the payload. The rule-based plans spec decided they
   are not stored, and a route test holds that.
   - Swaps read them back from the plan's safety notes instead, with `healthFromNotes`
     in `fallbackNotes.js`.
   - Its result is `{ pregnant, condition }`. `condition` is `true` when the
     light-to-moderate line is there, since any of the three yes answers writes that one
     line and gives the same rules.

## Conventions

The house rules apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- Comments and docs move with the change.

**Test first.** Every behaviour change starts with its test, run red for the right reason.
Mutations then show the tests hold. Confirm each mutation applied, and restore from a
saved copy (ADR 0015). Write the runners with the Write tool.

**Coverage**, on `f4b9c76`:

- Server: **functions 586/601 against a 97.5 floor, slack 0.02.** Statements 0.76,
  branches 2.25, lines 1.03.
- Client: **functions 1370/1378 against 99.4, slack 0.27.** Statements 1.30, branches
  3.98, lines 3.05.
- **Every PR covers every function it adds**, on both sides.

**Absent is not zero** (ADR 0001):

- A swapped exercise's load is `null` until it is logged.
- A safety line that is absent from the notes reads as a `false` health answer: its rule
  did not apply when the plan was generated.

**Paths:** run every command from `D:/ai-workout`. The shell resets to lowercase `d:\`,
and the client suite then fails dozens of tests.

**Gates, in order:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage` with `--coverage.reporter=json-summary`, the server measured
   with `client/dist` present;
3. for a client PR, `REDIS_URL= npm run test:e2e` after a build;
4. for a CSS PR, the screenshot compare (`capture.mjs`, CLAUDE.md).

**Merging:** only when GitHub reports the PR `CLEAN`, and only after the owner approves
that PR. Merge with a standalone `gh pr merge <n> --merge`, then watch `main`'s CI and
Deploy to green.

---

## Task 1: the spec and this plan (PR 1)

- [ ] Add both to `docs/README.md`'s Plans and Specs lists, after the in-gym workout
      mode's entries.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Commit on `docs/exercise-swaps` (the spec is already there), and open the PR.
- [ ] Merge when `CLEAN` and approved.

## Task 2: one rule, and what a plan records (PR 2)

No behaviour changes: every generated plan is the same, except that each prescription
carries two more fields. Nothing new is saved about the person.

**Files:**

- Modify: `server/src/services/planning/generatePlan.js` (`// @ts-check`).
  - **Export `candidatesFor(pattern, rules, library, order)`.** It is the body of
    `choose()` up to `candidates`, and returns that array. `choose()` becomes:

    ```js
    const choose = (pattern, rules, library, used, order) => {
      const candidates = candidatesFor(pattern, rules, library, order);
      return candidates.find((candidate) => !used.has(candidate.id)) ?? candidates[0] ?? null;
    };
    ```

  - **`prescriptionOf(exercise, dose, role)`** gains `exerciseId: exercise.id`, and
    `role`. The role is `null` for the patterns `doseFor` doses by their own rules
    (`OWN_DOSE_PATTERNS = new Set(["core", "balance", "mobility"])`), and the given role
    otherwise.
  - **Export `prescribe(exercise, role, rules, label)`**, which returns
    `{ prescription, line }`:

    ```js
    export const prescribe = (exercise, role, rules, label) => {
      const dose = doseFor(exercise, role, rules);
      return {
        prescription: prescriptionOf(exercise, dose, role),
        line: exerciseLine(exercise, formatDose(dose), label)
      };
    };
    ```

    `buildTrainingDay`'s `prescribed` calls it, pushes `prescription`, and returns `line`.

  - **The `Prescription` typedef** gains `exerciseId` (string) and `role`
    (`"main" | "accessory" | null`).
- Modify: `server/src/services/planning/fallbackNotes.js` (Decided 7):
  - export `LIGHT_MODE_LINE` and `PREGNANCY_LINE`, the two sentences `buildSafetyNotes`
    already writes, and write them from the constants;
  - export `healthFromNotes(notes)`, which returns
    `{ pregnant: notes.includes(PREGNANCY_LINE), condition: notes.includes(LIGHT_MODE_LINE) }`,
    reading anything that is not a list of strings as no notes.
- Modify: `server/src/services/dashboard/planPayloadService.js` and
  `client/src/app/plans.js`, the typedefs only: `Prescription` gains optional
  `exerciseId`, `role`, `swappedFrom` and `swapReason`. Both validators keep unknown
  fields, so neither changes.
- `server/src/routes/generateRoutes.js` does not change. Its test that the health
  answers are not saved stays as it is.
- Tests:
  - `server/src/services/planning/__tests__/generatePlan.test.js`;
  - `server/src/services/planning/__tests__/fallbackNotes.test.js`;
  - `scripts/evals/__tests__/generatePlan.gate.test.mjs`.

Steps:

- [ ] Branch `feat/swap-candidates`. Set the roadmap's `status/C4` to `active`, with a
      note naming this plan (ArtifactData `set`, no `if_version`).
- [ ] **Tests first:**
  - `candidatesFor`:
    - lists every fitting entry of a pattern in priority order;
    - leaves out an avoid entry for the areas;
    - replaces a modify entry with its regression, carrying `regressed`, `area` and
      `cue`;
    - leaves out a regression that does not fit;
    - with `order`, tries those ids first.
  - Each prescription has `exerciseId` equal to its library entry's id, and a `role`:
    `"main"` for a main lift, `"accessory"` for an accessory, `null` for core, balance
    and mobility.
  - `prescribe` returns the same prescription and line the generator writes for that
    exercise.
  - `healthFromNotes`, over the notes `buildSafetyNotes` writes:
    - `{ pregnant: true, condition: true }` for a pregnant plan, which is also
      light-to-moderate;
    - `{ pregnant: false, condition: true }` for each of `condition`, `symptoms` and
      `supervised`;
    - both `false` for no health answer;
    - both `false` for `undefined`, or a list holding something other than strings.
  - **Round trip:** for each health answer, `readInput` given
    `healthFromNotes(buildSafetyNotes(plan))` gives the same `areas` and `lightMode` as
    the plan's own rules.
  - **The gate:** in `prescriptionFailures`, every prescription's `exerciseId` names a
    library entry whose name is the prescription's name, and its `role` is in
    `["main", "accessory", null]`. Run `npm run test:scripts` red first.
- [ ] Implement, and run everything green. The existing generator tests and both gate
      sweeps must pass unchanged, apart from the new fields. That is the proof that
      `choose()` still chooses the same exercises.
- [ ] **Mutations,** each of which must fail a test:
  - `choose()` taking the last candidate instead of the first;
  - `candidatesFor` keeping avoid entries;
  - `role` always `"main"`;
  - `healthFromNotes` ignoring the pregnancy line;
  - `buildSafetyNotes` writing its own copy of a sentence instead of the constant (the
    round trip must catch it).
- [ ] Gates and server coverage. `candidatesFor`, `prescribe` and `healthFromNotes` are
      three new functions; each must be covered, which the json-summary shows.

## Task 3: the swap itself, pure (PR 3)

**Files:**

- Create: `server/src/services/planning/swaps.js` (`// @ts-check`, header, JSDoc types).
- Test: `server/src/services/planning/__tests__/swaps.test.js`.
- Modify: `scripts/evals/__tests__/generatePlan.gate.test.mjs`: the swap sweep.
- Modify: `scripts/__tests__/repo-invariants.test.mjs`: `TYPE_CHECKED_FILES` plus one.

`swaps.js` exports:

```js
/** The areas a swap can name: the injury areas, never pregnancy. */
export const SWAP_AREAS = INJURY_AREAS;

/**
 * The rules `plan` was built under, read by readInput from its saved columns and the
 * health answers its safety notes imply (healthFromNotes), with `age` from the
 * profile and `area` added when it is given and not already there.
 * @param {SavedPlan} plan
 * @param {{ age: number | null, area: string | null }} options
 */
export const rulesForPlan = (plan, { age, area }) => { … };

/**
 * The alternatives to `name` in `plan` under `rules`: the candidates of its
 * pattern, without itself or anything on a day it is on. Null when `name` is not
 * one of the plan's prescriptions, or not a library entry. Each alternative:
 * { name, needs, regressed, area, cue }.
 */
export const swapOptions = (plan, name, rules, library = EXERCISES) => { … };

/**
 * `plan`'s payload and text with every prescription named `from` replaced by `to`,
 * each at the dose prescribe gives it in that prescription's role, and each line
 * rewritten with its label kept. The first `swappedFrom` is kept, and swapping to
 * the original is an undo. Null when `from` is not in the plan or `to` is not one
 * of its options.
 * @returns {{ payload: PlanPayload, planText: string } | null}
 */
export const applySwap = (plan, { from, to, area }, rules, library = EXERCISES) => { … };

/**
 * `plan`'s payload and text with each prescription named `name` that has a
 * `swappedFrom` put back to it. Null when none has.
 */
export const undoSwap = (plan, name) => { … };
```

Module-private helpers:

- `roleOf(prescription, entry, rules)` returns the saved `role` when present. Otherwise
  it is `"main"` when `prescribe(chosen, "main", rules)` gives the prescription's sets,
  reps and seconds, and `"accessory"` otherwise.
- `lineIndexOf(lines, name)`, per Decided 5.
- `chosenOf(entry)`, a library entry as the `ChosenExercise` the generator passes to
  `doseFor`, with `regressed: false`.

**The text** is rewritten by replacing each old line with its new one, so `planText` and
the payload's lines stay the same lines.

Steps:

- [ ] Branch `feat/swaps-module`.
- [ ] **Tests first**, on plans generated by `generatePlan` and saved as the route saves
      them (text with its notes, and payload with `withPrescriptions`):
  - `rulesForPlan`:
    - reads the plan's level, equipment and injuries;
    - adds `area`;
    - adds nothing for an area already present;
    - reads a plan generated for pregnancy as pregnant, and one generated with a yes
      to a health question as light-to-moderate, from its notes;
    - passes `age` through.
  - `swapOptions`:
    - offers only the exercise's pattern;
    - never the exercise itself, nor anything already on a day it is on;
    - with `area: "shoulder"`, leaves out the shoulder-avoid entries and offers the
      shoulder regressions with their cues;
    - returns null for a name not in the plan;
    - returns `[]` where nothing else fits (a plan with no equipment, for a pattern
      with one bodyweight entry).
  - `applySwap`:
    - replaces the exercise on every day it is on, each at its own role's dose (a main
      lift on Monday and an accessory on Thursday);
    - keeps a superset label;
    - rewrites `planText`'s line too;
    - records `swappedFrom` (the original prescription and line) and `swapReason`;
    - a second swap keeps the first `swappedFrom`;
    - swapping back to the original drops `swappedFrom`;
    - returns null for a `to` not offered.
  - `undoSwap`:
    - restores the original prescription and line everywhere, in the payload and the
      text;
    - returns null when nothing is swapped.
  - **A plan saved before C4** (prescriptions without `exerciseId` or `role`) swaps by
    name, with its role found by its dose.
- [ ] **The gate's swap sweep**, its own test with `SWEEP_TIMEOUT_MS`.
  - **Which plans:** the main sweep's inputs with `days: 3`, about 1,600 plans.
  - **What it swaps:** each distinct prescription name, with no area and with each of
    `SWAP_AREAS`.
  - **Every alternative must:**
    - need only the plan's capabilities;
    - be at or below its level;
    - not be tagged avoid for the rules' areas plus the area;
    - not be high-impact under knee, hip or pregnancy;
    - after `applySwap`, pass `scorePlan`'s equipment and injury checks on the new text.

  Run it red first, against `swaps.js` stubbed to return every pattern entry.

- [ ] Implement, and run everything green.
- [ ] **Mutations,** each of which must fail a test:
  - `swapOptions` not leaving out the day's exercises;
  - `rulesForPlan` not adding `area`;
  - `rulesForPlan` not reading the notes' health;
  - `applySwap` reaching only the first day;
  - the second swap overwriting `swappedFrom`;
  - `roleOf` always `"accessory"`;
  - `undoSwap` leaving `planText` alone.

  The first three must also fail the gate by itself.

- [ ] Gates and server coverage: every function in `swaps.js` covered.

## Task 4: the routes (PR 4)

**Files:**

- Modify: `server/src/repositories/generatedPlanRepository.js`:
  - **`findPlanForUser({ userId, planId })`** returns the mapped plan, or null. It finds
    the plan by `legacyOrIdWhere(planId, "legacyId")`, scoped to the user's primary key.
  - **`rewritePlan({ userId, planId, rewrite })`** runs in one `prisma.$transaction`:
    1. resolve the row as above;
    2. lock it with `` tx.$queryRaw`select id from generated_plans where id = ${row.id}::uuid for update` ``;
    3. read it again, and call `rewrite(mappedPlan)`;
    4. if that returns null, return `{ conflict: true }`;
    5. otherwise update `planPayload` and `planText`, and return `{ plan }`.

    It returns null for no such plan.
- Create: `server/src/routes/dashboard/registerPlanSwapRoutes.js`, registered from
  `dashboardRoutes.js`.
- Modify: `server/src/routes/dashboard/validation.js`:
  - `planSwapParamsSchema` (`planId`, 1 to 100 characters);
  - `planSwapQuerySchema` (`exercise` 1 to 140, `area` optional, one of `SWAP_AREAS`);
  - `planSwapBodySchema` (`from`, `to`, `area` nullable);
  - `planUndoBodySchema` (`name`).
- Modify: `server/src/index.js`, which passes the two repository functions in the
  route deps.
- Tests:
  - `server/src/routes/dashboard/__tests__/planSwapRoutes.test.js`, stubbed, for the
    500 and a user gone;
  - `server/src/routes/dashboard/__tests__/planSwaps.integration.test.js`, against
    Postgres, with the plan written straight to its table as
    `progression.integration.test.js` does;
  - `server/src/repositories/__tests__/generatedPlanRepository.test.js`.

The routes, all behind `requireAuth`:

- `GET /api/dashboard/plans/:planId/swaps?exercise=&area=` answers
  `{ exercise, area, areas: SWAP_AREAS, alternatives }`.
- `POST /api/dashboard/plans/:planId/swaps` with `{ from, to, area }` answers `{ plan }`.
- `POST /api/dashboard/plans/:planId/swaps/undo` with `{ name }` answers `{ plan }`.
- The codes are Decided 6's.

Steps:

- [ ] Branch `feat/swap-routes`.
- [ ] **Tests first.** Integration tests:
  - GET:
    - lists the alternatives for a prescription;
    - with an area, lists the narrower set;
    - 400 for a name not in the plan;
    - 400 for an area outside `SWAP_AREAS`;
    - 404 for another user's plan;
    - 404 for a plan with no payload.
  - POST:
    - swaps, and a following `GET /api/dashboard` shows the new prescription, line and
      text;
    - 409 for a `to` not offered;
    - 409 for a `from` gone;
    - 404 for another user's plan.
  - **Two swaps sent at once,** of two different exercises: both land. Stage the race
    with two un-awaited requests, then read the row back.
  - **Undo:**
    - restores the original;
    - 409 when nothing is swapped.
  - **The plan id:** a plan found by its `legacyId`, and by its `id`.

  Unit tests:
  - a user row gone is a 404;
  - a repository failure is a 500 on each route.

- [ ] Implement, and run everything green.
- [ ] **Mutations,** each of which must fail a test:
  - the `for update` dropped. The concurrent test must catch it. If it cannot,
    because the race does not reproduce, say so in the PR, and keep the lock on
    reasoning, as CLAUDE.md does for `lockUserCalorieWrites`;
  - the user scope dropped from `findPlanForUser`;
  - `to` not checked against the options.
- [ ] Gates and server coverage: every new function covered.

## Task 5: the swap in the plan hub (PR 5)

**Files:**

- Create: `client/src/app/planSwaps.js`, the requests over App's `apiFetch`:
  - `fetchSwapOptions(apiFetch, planId, exercise, area)`;
  - `swapExercise(apiFetch, planId, { from, to, area })`;
  - `undoExerciseSwap(apiFetch, planId, name)`.

  Each returns the parsed body, or throws an Error with the server's `error` or a
  default message.

- Create: `client/src/components/SwapStep.jsx`, with its test. Props:
  `{ apiFetch, planId, exercise, onSwapped, onBack }`. It renders:
  - a heading `Swap <exercise>`;
  - an "It bothers my…" group, where each area is a toggle button (`aria-pressed`) and
    a second tap clears it;
  - the alternatives as buttons, each with its equipment and any cue;
  - "Nothing else in the library fits this plan" when there are none;
  - a polite status while loading, and an alert when a request fails;
  - Back.

  Choosing an alternative calls `swapExercise`, then `onSwapped(plan)`.

- Create: `client/src/pages/dashboard/components/PlanDaySwaps.jsx`, with its test. It is
  the day's prescriptions, each with Swap. A swapped one reads `Swapped from <original>
(<area>)` with Undo. Offline, Swap and Undo are disabled, with `OfflineHint`.
- Modify: `client/src/pages/dashboard/views/PlansView.jsx`. The details modal holds
  `swapping` state (the exercise name, or null). While it is set, the modal body shows
  `SwapStep` instead of the day's details. `onSwapped` calls `onPlanChanged(plan)` and
  clears it.
- Modify: `client/src/app/events.js`: `replacePlan(plan)`, which swaps the plan with the
  same id in `dashboard.plans`.
- Modify: `client/src/App.jsx` and `client/src/pages/dashboard/DashboardPage.jsx`: pass
  `onPlanChanged={replacePlan}` and `apiFetch` to PlansView.
- CSS: `PlansView.css`, for the swap step and the swapped-from line, with no motion.
- E2E: `e2e/plan.spec.js` and `e2e/a11y.spec.js`.

Steps:

- [ ] Branch `feat/plan-hub-swaps`.
- [ ] **Tests first:**
  - `planSwaps.js`:
    - each request's path, method and body, with the area left out when null;
    - the server's error message, and the default.
  - `SwapStep`:
    - lists the alternatives;
    - an area re-fetches;
    - a second tap on the area clears it;
    - choosing swaps and hands back the plan;
    - "Nothing else…" for none;
    - a failed request shows its error;
    - Back.
  - `PlanDaySwaps`:
    - the swapped-from line with its area, and without one;
    - Undo calls the request and hands back the plan;
    - offline, everything is disabled.
  - `PlansView`:
    - Swap opens the step inside the same dialog;
    - after a swap, the dashboard's plan is replaced and the day's details show the
      new exercise;
    - Escape from the step closes the dialog, with only one modal open.
  - `events.handlers.test.js`: `replacePlan` replaces only the matching plan.
- [ ] Implement, and run everything green.
- [ ] **E2E:**
  - `plan.spec.js`, after the plan is generated:
    1. open Monday;
    2. Swap its first exercise;
    3. choose the first alternative;
    4. see "Swapped from";
    5. reload, and see it still;
    6. Undo, and see the original.
  - `a11y.spec.js`: scan the swap step, with an area chosen.
- [ ] Screenshot compare. Only the plan day details change: the swap list, and the step
      when it is captured. Add a `swap` state to `capture.mjs`.
- [ ] **Mutations,** each of which must fail a test:
  - `replacePlan` replacing every plan;
  - the area's second tap not clearing it;
  - Swap enabled offline.
- [ ] Gates, client coverage, E2E, and the main chunk measured against `main`.

## Task 6: the swap on the in-gym screen (PR 6)

**Files:**

- Modify: `client/src/app/workoutSession.js`: `replaceExercise(session, index,
prescription)`. The exercise at `index` takes:
  - the prescription's name, kind, per side, targets and rest;
  - `plannedSets` from its sets;
  - a new key, a `null` target load, and no sets.

  It is only used for an exercise with no sets, and returns `session` unchanged
  otherwise.

- Modify: `client/src/pages/workout/components/ExerciseList.jsx`. In a session with a
  `planId`, Swap appears on each exercise with no sets. It is disabled offline.
- Modify: `client/src/pages/workout/SessionPage.jsx`. Swap shows `SwapStep` in place of
  the exercise list. `onSwapped(plan)`:
  1. calls `onPlanChanged(plan)`;
  2. finds the new prescription on the session's plan day;
  3. updates the session with `replaceExercise`.
- Modify: `client/src/App.jsx`: pass `apiFetch` and `onPlanChanged` to SessionPage.
- E2E: `e2e/session.spec.js`.

Steps:

- [ ] Branch `feat/session-swaps`.
- [ ] **Tests first:**
  - `replaceExercise`:
    - takes the new targets and rest;
    - a seconds prescription gives a seconds exercise;
    - a load of `null`;
    - an exercise with sets is left alone.
  - SessionPage:
    - Swap only in a plan session, and only on exercises with no sets;
    - swapping replaces the exercise and keeps it on the device;
    - offline, it is disabled;
    - a blank session has no Swap.
- [ ] Implement, and run everything green.
- [ ] **E2E:** in `session.spec.js`, before the first Done:
  1. swap the second exercise;
  2. see its new name in the list;
  3. after Finish, the plan day's details show "Swapped from".
- [ ] **Mutations,** each of which must fail a test:
  - `replaceExercise` keeping the old sets;
  - Swap shown on an exercise with sets;
  - Swap in a blank session.
- [ ] Gates, client coverage, E2E.

## Task 7: floors (PR 7 and PR 8)

- [ ] Measure both sides. Raise each side whose figure crosses a tenth, in its own PR,
      and never lower a floor.

## Task 8: close-out (PR 9)

- [ ] Run `plan.spec.js` and `session.spec.js` ad hoc in WebKit and Firefox, with a
      throwaway config in the git-ignored `playwright-report/` (memory: Firefox offline
      emulation). Report any failure before closing.
- [ ] Mark this plan done, with every departure, and the spec applied, with the PRs.
- [ ] After the last PR deploys ready, set the roadmap's `status/C4` to `done`
      (ArtifactData, `if_version`).
- [ ] Write the memory, and update the handoff.
