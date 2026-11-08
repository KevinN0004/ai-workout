# In-gym workout mode, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-screen session to train in, at `/workout`. It shows one exercise at a
time and logs a set with one tap. It runs a rest timer that buzzes and beeps, keeps the
session on the device until Finish, and saves it through the Log workout form's own path,
offline included. This is roadmap B6. It needs B1 and C1, both done.

The work is one docs PR, one server PR, three client PRs, a floor PR for each side whose
figures rose, and a close-out docs PR.

**Design:** `docs/specs/2026-11-08-in-gym-workout-mode-design.md`. Where this plan names a
behaviour, the spec's wording wins.

**Architecture:**

- A pure module, `app/workoutSession.js`, holds the session and every change to it.
- `app/activeSession.js` keeps it in localStorage per account.
- The screen is a lazy page, `pages/workout/SessionPage.jsx`, at App's new `/workout`
  route.
- Finish calls `queueWorkout`, the Log workout form's save path, moved out of
  `submitWorkout` so both share it.
- The server adds `restSeconds` to each prescription it saves.

**Tech Stack:** React 19, Vite 8, Express 5, Vitest 5 with v8 coverage, Testing Library,
Playwright 1.64, the Screen Wake Lock, Vibration and Web Audio APIs.

**Status: not started.**

Every file and line below was read on `2c20546`.

---

## Owner's decisions

Made 2026-11-07:

- **Start points:** a plan day's "Start workout", and "Start a blank workout" on the Logs
  view.
- **Saving:** the session is kept on the device and saved at Finish, through C1's queue.
- **Rest:** from the plan, with older plans using 90 s. Adjust with ±15 s, held per
  exercise, and Skip.
- **The end of a rest:** a Screen Wake Lock where allowed, a buzz and a beep, and a Sound
  switch.
- **Logging a set:** pre-filled, adjusted, then "Done". Undo takes back the last set.
- **The screen:** its own full-screen route, `/workout`.

## Decided while planning

1. **A plan day's session is built from `buildPlanDayPrefill`'s cards**, with each
   exercise's rest read from `day.prescriptions[i].restSeconds`.
   - The cards come from the prescriptions in order (sliced to 18), so index `i` matches.
   - A day saved before P4 has no prescriptions, so every rest is the default.
   - The cards' targets are display text ("8-10", "7-8", "60"). The session reads the
     number it needs with a new `topOfRange` and the existing `toLoadKg`. So B4's week
     logic (the week's load, deload sets) is reused, never copied.
2. **The session module and its storage live in `client/src/app/`**, not in the page.
   - The plan hub's and the Logs' Start buttons, sign-out, App's Resume notice and the
     page all read them.
   - CLAUDE.md puts code used from more than one page outside the page.
   - Only the screen and its own hooks live in `pages/workout/`.
3. **Starting and finishing are App's event handlers** (`app/events.js`):
   - `startSession(draft)` writes the session and opens `/workout`. When a session is
     already open, it instead sets the draft App asks about ("Resume" or "Discard and
     start").
   - `finishSession(session)` queues the save, clears the session and opens the Logs.
   - The views stay presentational: PlansView and WorkoutsView get one `onStartSession`
     prop.
4. **The Resume notice is App's `AppNotice`.** It shows on dashboard routes while a
   session is open, after the session and offline notices and before the update notice.
   App reads the open session again whenever the route or the user changes.
5. **Sign-out always clears the open session**, sent or not, as it clears the kept sign-in.
   The confirm counts it only when it has logged sets.

## Conventions

The house rules apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- Comments and docs move with the change.

**Test first.** Every behaviour change starts with its test, run red for the right reason.
Mutations then show the tests hold; confirm each applied, and restore from a saved copy
(ADR 0015). Write runners with the Write tool. Never pass escaped strings through Bash
(`node -e` with `\n` loses them).

**Coverage**, on `2c20546`:

- Client: statements 4.29, branches 3.67, **functions 0.76**, lines 1.81.
- Server: **functions 0**, statements 0.69.
- The server PR therefore covers every function it adds.

**Absent is not zero** (ADR 0001):

- A load nobody set is `null` ("Bodyweight"), never 0.
- An RPE nobody tapped is `null`.
- `topOfRange` guards absent text before `Number()` and gets a row in the client's
  numeric-coercion contract.

**Paths:** run every command from `D:/ai-workout`. The shell resets to lowercase `d:\`,
and the client suite then fails dozens of tests.

**Gates, in order:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage` with `--coverage.reporter=json-summary`, the server measured
   with `client/dist` present;
3. for a client PR, `REDIS_URL= npm run test:e2e` after a build;
4. for a CSS PR, the screenshot compare (`capture.mjs`, CLAUDE.md).

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`, then watch `main`'s CI and Deploy to green. Report after each
PR, and wait for "proceed carefully".

## Task 1: the spec and this plan (PR 1)

- [ ] Add both to `docs/README.md`'s Plans and Specs lists, after the offline-ready PWA's
      entries.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Commit on `docs/in-gym-workout-mode` (the spec is already there), open the PR, and
      merge when `CLEAN`.

## Task 2: rest on each prescription (PR 2)

**Files:**

- Modify: `server/src/services/planning/generatePlan.js` (`// @ts-check`):
  - `LineDose` gains `restSeconds`;
  - `plainDose` sets it to `null`;
  - the scheme branch of `doseFor` reads it from `base.rest`, and the strength-hold branch
    sets 60;
  - `Prescription` gains `restSeconds`, and `prescriptionOf` copies it.
- Test: `server/src/services/planning/__tests__/generatePlan.test.js`.
- Modify: `scripts/evals/__tests__/generatePlan.gate.test.mjs`. `prescriptionFailures`
  also reads the line's rest and checks `restSeconds` against it.
- Modify: `client/src/app/plans.js`, the `Prescription` typedef only: `restSeconds`,
  optional, `number | null`.

The reading, as one module-private helper:

```js
/**
 * The top of a dose's rest in seconds: "90s" is 90, "60-90s" is 90.
 * @param {string} rest
 */
const restSecondsOf = (rest) => Number(/(\d+)s$/.exec(rest)?.[1] ?? NaN);
```

Every `base.rest` in `SCHEMES` ends in digits and "s", so the result is a whole number. A
gate check pins it, so a new scheme with another spelling fails the gate rather than
saving `NaN`.

In the gate, after the existing comparisons:

```js
const rest = /Rest (\d+)(?:-(\d+))?s/.exec(note ?? "");
const restSeconds = rest ? Number(rest[2] ?? rest[1]) : null;
// … and in `agrees`:
prescription.restSeconds === restSeconds;
```

Steps:

- [ ] Branch `feat/prescription-rest`. Set the roadmap's `status/B6` to `active` with a note
      naming this plan (ArtifactData `set`, no `if_version`).
- [ ] **Tests first:**
  - A lean main lift's prescription has `restSeconds: 90`, a lean accessory 90 (from
    "60-90s"), a strength main 180, and a fat-loss accessory 60 (from "45-60s").
  - A strength hold has 60.
  - A core hold, a balance line and a mobility line have `null`.
  - The gate: run `npm run test:scripts`; it must fail on every plan (the field is
    missing) before the change.
- [ ] Add the field and run the tests green. Add no exported function: `restSecondsOf` is
      private, and the gate's reading lives in the test file.
- [ ] **Mutations,** each of which must fail a test:
  - `restSeconds` taken from the range's bottom;
  - the hold's 60 dropped;
  - `plainDose`'s `null` set to 90.
  - Run the first mutation (rest from the range's bottom) through the gate as well, and
    confirm the gate fails on it by itself. That shows the gate's own reading of the line
    catches a drifting field, apart from the unit tests.
- [ ] Gates and server coverage. The function count must not rise without coverage; read
      it in the json-summary.

## Task 3: the session, kept on the device (PR 3)

**Files:**

- Create: `client/src/app/workoutSession.js` (`// @ts-check`, header, JSDoc types), with
  its test.
- Create: `client/src/app/activeSession.js`, with its test.
- Modify: `client/src/app/constants.js`: the key prefix `ACTIVE_SESSION_PREFIX`, set to
  `"ai-workout-active-session-v1"`.
- Modify: `client/src/app/events.js`: `queueWorkout`, `submitWorkout` on it,
  `finishSession`, and `deleteAccount` clearing the session.
- Modify: `client/src/__tests__/numericCoercion.contract.test.js`: a row for
  `topOfRange`.
- Modify: `scripts/__tests__/repo-invariants.test.mjs`: `TYPE_CHECKED_FILES` plus one.

The session, as `workoutSession.js` types it:

```js
/**
 * @typedef {object} SessionSet
 * @property {number} amount reps, or seconds when the exercise counts seconds
 * @property {number | null} loadKg null for bodyweight, never 0 unless chosen
 * @property {number | null} rpe null when not tapped
 *
 * @typedef {object} SessionExercise
 * @property {string} key
 * @property {string} name
 * @property {"reps" | "seconds"} kind
 * @property {boolean} perSide
 * @property {number | null} targetAmount the top of the prescribed range
 * @property {string} targetText as the card shows it, e.g. "8–10 reps @ RPE 7–8"
 * @property {number | null} targetLoadKg
 * @property {number} plannedSets 0 for an added exercise
 * @property {number} restSeconds
 * @property {boolean} skipped
 * @property {SessionSet[]} sets
 *
 * @typedef {object} WorkoutSession
 * @property {1} version
 * @property {string} clientId the replay key Finish sends as `id`
 * @property {number} startedAt ms since the epoch
 * @property {string} date the local date it started, YYYY-MM-DD
 * @property {string} title
 * @property {string | null} planId
 * @property {number | null} planDayIndex
 * @property {number} current the index of the exercise on screen
 * @property {number | null} restEndsAt ms since the epoch, while a rest runs
 * @property {SessionExercise[]} exercises
 */
```

Its exports, each pure, taking and returning a session:

| Export                                                                                                                                             | What it does                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_REST_SECONDS` (90), `MIN_REST_SECONDS` (15), `MAX_REST_SECONDS` (600), `LOAD_STEP` (`{ metric: 2.5, imperial: 5 }`, in the region's unit) | Constants                                                                                                                                                                                                                                                                                                                   |
| `topOfRange(text)`                                                                                                                                 | `"8-10"` gives 10 and `"5"` gives 5; `null` for absent, blank or non-numeric text, guarded before `Number()`                                                                                                                                                                                                                |
| `sessionFromPlanDay({ day, week, system, planId, now })`                                                                                           | From `buildPlanDayPrefill(day, week, system)`'s cards and each prescription's `restSeconds` (positive whole numbers only, else 90)                                                                                                                                                                                          |
| `blankSession({ now })`                                                                                                                            | A session with no exercises, titled "Workout"                                                                                                                                                                                                                                                                               |
| `addExercise(session, { name, kind })`                                                                                                             | An added exercise: no targets, 0 planned sets, 90 s rest. It becomes current.                                                                                                                                                                                                                                               |
| `draftFor(exercise, system)`                                                                                                                       | The set "Done" would log: the first from the targets, a later one copying the previous set's amount and load, and `rpe: null` always                                                                                                                                                                                        |
| `logSet(session, set, now)`                                                                                                                        | Appends the set to the current exercise, and starts its rest (`restEndsAt = now + restSeconds * 1000`)                                                                                                                                                                                                                      |
| `undoLastSet(session)`                                                                                                                             | Removes the current exercise's last set and ends any rest                                                                                                                                                                                                                                                                   |
| `goTo(session, index)`, `skipExercise(session, index)`                                                                                             | Moving between exercises                                                                                                                                                                                                                                                                                                    |
| `adjustRest(session, deltaSeconds, now)`                                                                                                           | Changes the running rest's end, and sets the current exercise's `restSeconds`, both clamped to 15 to 600 s                                                                                                                                                                                                                  |
| `endRest(session)`                                                                                                                                 | Skip                                                                                                                                                                                                                                                                                                                        |
| `loggedSetCount(session)`                                                                                                                          | Every set logged                                                                                                                                                                                                                                                                                                            |
| `toWorkoutSave(session, now)`                                                                                                                      | The `queueWorkout` input: `{ id: clientId, date, focus: title, duration, notes: "", exerciseSets, planId, planDayIndex }`. Exercises with no sets are dropped, and `duration` is whole minutes since `startedAt`, clamped to 5–360. `exerciseSets` has the API's shape: `{ name, sets: [{ reps, seconds, loadKg, rpe }] }`. |

`activeSession.js`:

- `readActiveSession(user)` returns the stored session, or `null` for none, bad JSON or a
  `version` other than 1.
- `writeActiveSession(user, session)` returns true when storage took it.
- `clearActiveSession(user)`.
- The key is `buildScopedCacheKey(ACTIVE_SESSION_PREFIX, user)`.

`queueWorkout`, inside `createAppEventHandlers`, is the part of `submitWorkout` from its
payload on, made into one function:

```js
// The Log workout form's save, shared with Finish: the entry shows at once, is
// sent when the undo window closes, and is kept on the device if that send fails.
const queueWorkout = ({ id, date, focus, duration, notes, exerciseSets, planId, planDayIndex }) => {
  const link = planId ? { planId, planDayIndex } : null;
  const exercises = exerciseSets.map((exercise) => exercise.name);
  const payload = { id, date, focus, duration, notes, exercises, exerciseSets, ...link };
  // … the optimistic item and queueOptimisticLogCommit call, as today
};
```

- `submitWorkout` passes `id: crypto.randomUUID()` and the form's values.
- `finishSession(session)` passes `toWorkoutSave(session, Date.now())`, then calls
  `clearActiveSession(user)` and `go("/dashboard/workouts")`.

Steps:

- [ ] Branch `feat/workout-session-model`.
- [ ] **Tests first, `workoutSession.test.js`, against hand-built days**, never
      `generatePlan`:
  - `topOfRange`: "8-10" is 10, "5" is 5, "" and absent are null, "abc" is null.
  - `sessionFromPlanDay`, on a rule-built day with a week:
    - the week's load is in kg, from lb under imperial;
    - a deload week's halved sets;
    - `restSeconds` is read, or 90 when the field is missing, null, 0, -5 or "90";
    - the plan link and title.
  - `sessionFromPlanDay`, on a pre-P4 day (lines only): one exercise per name, with no
    targets and 90 s.
  - `draftFor`:
    - the first set takes the targets;
    - a later one copies the amount and load;
    - RPE is null even when the previous set had one;
    - an exercise with no load gives `loadKg: null`.
  - `logSet` and `undoLastSet`: the rest's end is the clock plus the rest; undo removes
    only the last set and ends the rest.
  - `adjustRest`: ±15 s on the running rest and on the exercise's rest, clamped at 15
    and 600.
  - `toWorkoutSave`:
    - exercises with no sets are dropped;
    - the duration is clamped (a 2-minute session gives 5, and 30 hours gives 360);
    - the date is the start's;
    - **its result, through `queueWorkout`, posts the same body `submitWorkout` posts for
      the same sets** (both built in one test).
- [ ] **Tests first, `activeSession.test.js`:**
  - write then read;
  - kept per account;
  - bad JSON and a wrong version read as null;
  - a refused write returns false;
  - clear.
- [ ] **Tests first, in `events.handlers.test.js`:**
  - `submitWorkout` still posts what it posted, and the existing tests pass unchanged;
  - `finishSession` queues the session's body under its `clientId`, clears it and opens
    the Logs;
  - `deleteAccount` clears an open session.
- [ ] Run all of them red, write the modules and the handlers, and run them green. Raise
      `TYPE_CHECKED_FILES`, and add the contract row.
- [ ] **Mutations:**
  - `draftFor` copying RPE;
  - `topOfRange` coercing before the guard;
  - the duration clamp's lower bound dropped;
  - `restSeconds` accepting "90";
  - `toWorkoutSave` keeping empty exercises;
  - `finishSession` not clearing the session.
- [ ] Gates, client coverage and E2E. Measure the main chunk in exact bytes: the modules
      are eager, because events.js imports them.

## Task 4: the screen (PR 4)

**Files:**

- Create: `client/src/pages/workout/SessionPage.jsx` and `SessionPage.css`, the page:
  - the bar: title, elapsed time, Finish, Cancel workout;
  - the current exercise and its target;
  - the set panel;
  - the sets done, with Undo;
  - Previous and Next exercise;
  - the exercise list with Add exercise and Skip.
- Create: `client/src/pages/workout/components/SetPanel.jsx`. The steppers for amount and
  load, the RPE buttons 5–10 (toggles, `aria-pressed`) and "Done".
- Create: `client/src/pages/workout/components/ExerciseList.jsx`, and
  `client/src/pages/workout/hooks/useSessionState.js`. The hook holds the session in state
  and writes it with `writeActiveSession` on every change.
- Modify: `client/src/App.jsx`:
  - the `/workout` route, with SessionPage lazy-loaded as App's other lazy pieces are,
    signed-in only: no user goes to `/auth`, and no open session goes to
    `/dashboard/workouts`;
  - the Resume notice, and the start-conflict confirm;
  - `onStartSession` passed down.
- Create: `client/src/app/components/StartSessionConfirm.jsx`, the confirm: "A workout is
  in progress", with Resume and Discard and start. It is built from `base.css`'s modal
  classes, like SignOutConfirm.
- Modify: `client/src/app/events.js`:
  - `startSession(draft)`;
  - `onLogout` counts an open session with logged sets in the confirm;
  - `signOut` and `confirmSignOut` clear it.
- Modify: `client/src/pages/dashboard/DashboardPage.jsx`, to pass `onStartSession` to
  PlansView and WorkoutsView.
- Modify: `client/src/pages/dashboard/views/PlansView.jsx`. "Start workout" beside "Log
  this workout" calls `onStartSession` with `sessionFromPlanDay` for that day: the week's
  progression, the region's system, the newest plan's id, and the clock.
- Modify: `client/src/pages/dashboard/views/WorkoutsView.jsx`. "Start a blank workout"
  calls `onStartSession(blankSession({ now: Date.now() }))`.
- Create: `e2e/session.spec.js`, in the `chromium` project.
- Modify: `e2e/a11y.spec.js`, `e2e/README.md`.

Steps:

- [ ] Branch `feat/workout-session-screen`. Capture `main` with `capture.mjs` first: the
      dashboard, Logs, the plan hub with a day open, and the Log workout modal. The new
      stylesheet is lazy and scoped to `.session-page`, so the compare must show no change
      to any existing page.
- [ ] **Tests first:**
  - **SessionPage, with a session given:**
    - it shows the current exercise and "Set 1 of 3";
    - −/+ change the amount and the load by the step;
    - − from the lightest step gives "Bodyweight";
    - "Done" logs the set shown, and the rows show it;
    - Undo removes it;
    - Next exercise goes on;
    - Finish is disabled with no sets, and calls `finishSession` with the session once
      enabled;
    - Cancel asks, and Discard clears and leaves;
    - Add exercise asks for a name and reps or seconds;
    - every control is reachable and named.
  - **`useSessionState`:** every change is written; storage that refuses keeps the page
    working, with a notice that the device is not saving it.
  - **App:**
    - `/workout` with a session renders the page, with no session goes to Logs, and with
      no user goes to `/auth`;
    - the Resume notice shows on dashboard routes while a session is open and opens
      `/workout`;
    - the start-conflict confirm's two answers.
  - **The views:** "Start workout" sends `sessionFromPlanDay`'s result for that day,
    "Start a blank workout" a blank session, and both reach `onStartSession`.
  - **`events.handlers.test.js`:**
    - `startSession` writes and opens `/workout`;
    - with an open session, it asks instead;
    - sign-out counts an open session with sets, and not one without;
    - sign-out clears it.
- [ ] Run them red, build the page, the components and the wiring, and run them green.
- [ ] **E2E, `session.spec.js`:**
  1. sign up and generate a plan, as `plan.spec.js` does;
  2. open a training day and press "Start workout";
  3. log a set with "Done", log a second, and Undo it;
  4. log it again, and Finish;
  5. the Logs show the session, with its sets in `formatExerciseLine`'s wording;
  6. reload, and it is still there;
  7. delete the account.
- [ ] **axe:** `a11y.spec.js` scans the session screen with a set logged, and walks one
      set with the keyboard alone: Tab to "Done", Enter, then Tab to Undo.
- [ ] Screenshot compare against the capture: no change to existing pages. Record the
      session screen's capture in the PR.
- [ ] **Mutations:**
  - the − step going below the step to 0;
  - Finish enabled with no sets;
  - the Resume notice on non-dashboard routes;
  - `startSession` overwriting an open session;
  - sign-out counting a session with no sets.
- [ ] Gates, client coverage, E2E, and the main chunk in exact bytes. SessionPage must be
      its own chunk; check the build output.

## Task 5: the rest timer (PR 5)

**Files:**

- Create: `client/src/pages/workout/hooks/useRestTimer.js`. From `restEndsAt` and the
  clock, it returns `{ remaining, over }`. It ticks every second and on
  `visibilitychange`, and calls `onEnd` once per rest, only when it sees the end within
  5 s of it.
- Create: `client/src/pages/workout/hooks/useWakeLock.js`. While mounted, it requests
  `navigator.wakeLock?.request("screen")`, requests again on `visibilitychange` to
  visible, releases on unmount, and ignores every rejection.
- Create: `client/src/pages/workout/restAlert.js`:
  - `unlockAudio()`, called from "Done": it creates or resumes one `AudioContext`, and
    does nothing without one;
  - `beep()`, a 0.2 s, 880 Hz oscillator;
  - `buzz()`, which calls `navigator.vibrate?.([200, 100, 200])`.
- Create: `client/src/pages/workout/components/RestTimer.jsx`. The digits, −15 s, +15 s
  and Skip, and a polite live region that says "Rest 90 seconds" on start and "Rest over"
  at the end.
- Modify: `SessionPage.jsx`, for the timer, the wake lock, and the Sound switch. The
  switch is a toggle button, remembered under `ai-workout-session-sound-v1`, starting on.
- **No motion.** The timer is plain digits with no ring, pulse or transition, so this PR
  needs no `prefers-reduced-motion` block (spec; ADR 0007). A later animation brings its
  own.

Steps:

- [ ] Branch `feat/rest-timer`.
- [ ] **Tests first, with fake timers and stubbed boundaries:**
  - `useRestTimer`:
    - the remaining time counts down;
    - a jump of 60 s (a locked phone) catches up at once on `visibilitychange`;
    - `onEnd` fires once at the end;
    - `onEnd` does not fire when the end is seen 6 s late;
    - a new rest re-arms it.
  - `useWakeLock`: it requests on mount and again when visible, releases on unmount, and
    a rejected request is ignored; it does nothing without `navigator.wakeLock`.
  - `restAlert`:
    - `beep` plays only after `unlockAudio`, and only with an `AudioContext`;
    - `buzz` calls `vibrate` when present and does nothing otherwise.
  - `RestTimer`: the digits; ±15 s and Skip reach the session; the live region says each
    line once.
  - SessionPage: the Sound switch stops the beep, and is remembered.
- [ ] Run them red, build, and run them green.
- [ ] **E2E:** `session.spec.js` checks that a rest starts after "Done" and that Skip ends
      it. It uses `page.clock`, and polls from Node rather than with `waitForFunction`
      (memory: the Playwright clock stops in-page waits).
- [ ] Screenshot compare: the session screen changes as expected, with the timer; nothing
      else changes.
- [ ] **Mutations:**
  - the 5-second rule as 50 s;
  - the wake lock not requested again when visible;
  - `beep` without the Sound switch;
  - the live region announcing every second.
- [ ] Gates, client coverage, E2E.

## Task 6: floors (PR 6 and PR 7)

- [ ] Measure both sides. Raise each side whose figure crosses a tenth in its own PR, and
      never lower a floor.

## Task 7: close-out (PR 8)

- [ ] Run `session.spec.js` ad hoc in WebKit and Firefox, with a throwaway config in the
      git-ignored `playwright-report/` (memory: Firefox offline emulation). Report any
      failure before closing.
- [ ] Mark this plan done, with every departure. Mark the spec applied, with the PRs.
- [ ] Set the roadmap's `status/B6` to `done` (ArtifactData, `if_version`) after the last
      PR deploys ready.
- [ ] Write the memory, and update the handoff.
