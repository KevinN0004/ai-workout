# In-gym workout mode, design

Status: **decided 2026-11-07**, section by section with the owner; **applied 2026-11-08**,
in #378 to #381, with the client floor raised in #382, all live. The plan is
`docs/plans/2026-11-08-in-gym-workout-mode.md`, whose status says where the work went past
this text. This is roadmap B6. It needs B1 (per-set logging) and C1 (offline-ready PWA),
both done. No gate applies to it.

Logging happens on a phone between sets, and the Log workout modal is built for a desk: a
form of typed fields, saved once at the end. B6 adds a full-screen session to train in.
It shows one exercise at a time, logs a set with one tap, runs a rest timer, and keeps
working with no signal.

## What was found

Read on `2c20546`.

1. **A plan day already pre-fills a whole workout.** `buildPlanDayPrefill`
   (`pages/dashboard/planUtils.js`) turns a day into exercise cards: each card has the
   prescribed sets, its reps or seconds target, per side, target RPE, and this week's load
   from B4. A deload week halves the sets. The plan hub's day details open it with "Log
   this workout" (`PlansView.jsx`, `logPlanDay`), which keeps the plan-day link
   (`planId`, `planDayIndex`).
2. **Logging is one form and one save.** `submitWorkout` (`app/events.js`) turns the
   cards into the API's `exerciseSets`, with loads in kg (`toExerciseSets`,
   `app/exerciseSets.js`). It queues one POST through `useOptimisticLogs`, with the Undo
   window, and through C1's outbox when the send fails. The replay key (C1) makes a resent
   session one row.
3. **A saved prescription has no rest time.** `Prescription` (`generatePlan.js`) holds
   `name`, `sets`, `reps` or `seconds`, `perSide` and `targetRpe`. The rest is only in the
   line text the dose writes: "3 x 8-10 (Rest 90s, …)". The doses' rests are "90s",
   "60-90s", "150-180s", "45-60s" and "60s". A strength hold's note says "Rest 60s".
   Core, balance and mobility doses name none.
4. **Both payload validators keep unknown fields.** `isPrescription`
   (`services/dashboard/planPayloadService.js`, and its copy in `client/src/app/plans.js`)
   checks the fields it knows and keeps the prescription whole. So a new field passes
   through, and an older plan simply lacks it.
5. **No device API is in use yet.** Nothing calls Screen Wake Lock, `navigator.vibrate`
   or Web Audio.
6. **`/workout` is a free route.** App routes `/`, `/auth`, `/plan` and `/dashboard/*`.
7. **The main chunk is 471,914 bytes**, of the 500 kB warning line.

## Decisions

Made with the owner on 2026-11-07:

- **A session starts from a plan day, or blank.** "Start workout" on a plan day, and
  "Start a blank workout" on the Logs view.
- **The session is kept on the device and saved at Finish.** Each set is stored on the
  phone at once, and Finish sends the session once through C1's queue. The server,
  progression and the Logs only ever see finished workouts. No server change is needed
  for saving.
- **The rest comes from the plan, adjustable.** The server adds each prescription's rest.
  Older plans use 90 seconds, with −15 s / +15 s and Skip.
- **At the end of a rest, the screen is kept awake, the phone buzzes and a beep plays.**
  The screen stays awake where the browser allows it; the beep has a Sound on/off switch.
- **A set is pre-filled, adjusted, then logged with one tap on "Done"**, and Undo takes
  back the last one.
- **The session has its own full-screen route, `/workout`.** It is lazy-loaded, survives
  a reload, and Back leaves it.

## Design

### Starting, and the screen

- **Starting a session.**
  - The plan hub's day details gain "Start workout" beside "Log this workout". It opens
    `/workout` pre-filled from that day through `buildPlanDayPrefill`, so it has this
    week's loads and sets, deload weeks included. It keeps the plan-day link.
  - The Logs view gains "Start a blank workout". It opens `/workout` with no exercises.
  - Only one session is open at a time. Starting another while one is open asks first:
    "Resume" or "Discard and start".
- **The route.** App renders `SessionPage` at `/workout`, lazy-loaded and full-screen,
  outside the dashboard layout.
  - It needs a signed-in user. The kept session (C1) counts, so it opens offline.
  - With no session open, `/workout` goes to the Logs view.
- **The screen, top to bottom:**
  1. A slim bar: the session's title and elapsed time, "Finish", "Cancel workout" and the
     Sound switch.
  2. The current exercise: its name, "Set 2 of 3", and its target, for example "8–10
     reps @ RPE 7–8, 60 kg".
  3. The set being logged:
     - large −/+ steppers for reps (or seconds) and for load;
     - optional RPE buttons, 5 to 10;
     - a large "Done".
  4. The sets done so far for this exercise, with "Undo" on the last one.
  5. The rest timer, while one runs: large digits, −15 s, +15 s and Skip.
  6. "Previous" and "Next exercise" buttons, and a list of the exercises. The list can
     jump to any exercise, add one (to a blank session, or an extra on a plan day), or
     skip one. Adding one asks for its name and whether it counts reps or seconds; it has
     no targets and the 90-second rest.
- **Moving on.** After an exercise's last planned set, "Next exercise" becomes the main
  button. Nothing moves on by itself.
- **Accessibility.**
  - Every control is a real button with a name.
  - The timer's digits are not announced. A polite live region announces "Rest 90
    seconds" when a rest starts and "Rest over" when it ends.
  - The keyboard alone can log a set and finish.

### The session's data, and saving it

- **The open session** is one object in localStorage, under
  `ai-workout-active-session-v1:<account>` (scoped like the dashboard cache). It is
  written on every change, so a closed tab, a crash or a dead battery loses at most the
  tap in flight. It holds:
  - a replay key (`crypto.randomUUID()`, minted at the start) and `startedAt`;
  - the title, and the plan-day link when there is one;
  - its exercises, each with: name, reps or seconds, per side, targets, planned sets,
    rest, and the sets logged;
  - the current exercise, and the rest timer's end time.
- **A logged set** holds reps or seconds, a load in kg, and an RPE.
  - Loads are entered in the region's unit, in steps of 2.5 kg or 5 lb (as B4 uses), and
    stored in kg through `toLoadKg` and `fromLoadKg`.
  - **Absent is not zero.** An exercise with no load shows "Bodyweight" and stores
    `null`; the − button never produces a 0 kg nobody chose. An RPE nobody tapped is
    `null`, never easy.
- **Pre-filling a set.**
  - An exercise's first set comes from its targets: the week's load, and the top of the
    rep range (or the seconds).
  - Each later set copies the reps (or seconds) and load of the set before it. RPE is
    never copied: each set's starts empty, so an effort nobody tapped is never recorded.
- **Finish** turns the session into the same body the Log workout form sends: the
  exercise names, `exerciseSets` in kg, the focus, the local date the session started,
  and the plan-day link.
  - It queues it through the save path `submitWorkout` uses. That path moves out of
    `submitWorkout` so both share it: the Undo window, and C1's outbox when the send
    fails.
  - Then it opens the Logs view.
  - Exercises with no logged sets are left out. Finish is disabled until a set is logged.
  - The duration is the minutes since the start, clamped to the server's 5 to 360, so a
    session left open overnight is not refused and lost.
- **Cancel workout** asks first: "Discard this workout? N sets will be lost."
- **Resuming.**
  - While a session is open, the dashboard shows "Workout in progress, started 18:05",
    with Resume.
  - Both Start buttons offer Resume, or Discard and start.
- **Sign-out and deletion.**
  - An open session with logged sets counts in SignOutConfirm's number, beside the unsent
    entries, and Sign out anyway discards it.
  - Account deletion removes it without asking, as it removes the outbox.

### The rest timer, the screen staying awake, and the alert

- **The timer** starts on each "Done", for that exercise's rest: the plan's when it has
  one, otherwise 90 seconds.
  - −15 s and +15 s change the running rest, and become that exercise's rest for the rest
    of the session, kept between 15 seconds and 10 minutes. Skip ends it.
  - It is stored as an end time. The digits are recomputed from the clock every second
    and whenever the page becomes visible again, so a locked screen or a background tab
    never makes it drift.
- **When a rest ends:**
  - the timer reads "Rest over";
  - the phone vibrates where the browser allows it (`navigator.vibrate`; iPhones ignore
    it);
  - a short beep plays through Web Audio, unless sound is off. The audio is unlocked on
    the "Done" tap, since browsers allow sound only after a tap.
  - The Sound switch is remembered on the device, and starts on.
  - If the page sees the end more than 5 seconds late, because the phone was locked, it
    shows "Rest over" without a late buzz or beep.
- **Keeping the screen awake.**
  - While the session page is open, it asks for a Screen Wake Lock. It asks again
    whenever the page becomes visible, since browsers release the lock when a page is
    hidden, and lets it go when the page closes.
  - A refusal, or a browser without it, changes nothing.
- **Reduced motion.** The timer is plain digits with no ring, pulse or transition, so
  there is no motion to stop. Anything later that animates carries its own
  `prefers-reduced-motion` block (ADR 0007).

### The server

- **Each prescription gains `restSeconds`**, the top of its dose's rest:
  - "90s" gives 90, "60-90s" gives 90, and "150-180s" gives 180;
  - a strength hold's "Rest 60s" gives 60;
  - a core, balance or mobility dose names no rest, so it gives `null`.
- **The plan gate asserts the field** on every plan it generates.
- **No validator changes** (found 4). The client reads `restSeconds` only when it is a
  positive whole number, and otherwise uses 90.
- **Only plans generated after this ships carry it.** Older plans use 90 seconds.

### Testing

- **Unit tests:**
  - the session module: absent is not zero, kg and lb, the duration clamp, and that
    Finish sends the same body as the Log workout form;
  - the timer hook, with fake timers;
  - Wake Lock, `vibrate` and `AudioContext`, stubbed at their boundaries;
  - App's routing to `/workout`, and resuming.
- **The server:** `restSeconds` on each dose, and the plan gate's check.
- **E2E.**
  - A new `session.spec.js`: start a plan day's workout, log two sets and undo one, see a
    rest start, finish, and find the session in the Logs with its sets.
  - `a11y.spec.js`: an axe scan of the session screen, and a keyboard-only path through
    one set.
  - The new spec also runs ad hoc in WebKit and Firefox before close-out, as C1 did.
- **Coverage.** Server functions have no slack, so the server PR covers every function it
  adds.

### Rollout

Each step ships after the one it relies on:

1. **Docs:** this spec and its plan.
2. **Server:** `restSeconds` on new prescriptions, and the plan gate's check.
3. **Client, the session's logic:**
   - a pure module: start from a plan day or blank, log a set, undo, the steppers,
     units, and the body Finish sends;
   - storage on the device;
   - the Log workout save path moved out of `submitWorkout`, to be shared.
4. **Client, the screen:**
   - the `/workout` route and SessionPage (lazy);
   - the two Start buttons, the Resume notice and Cancel;
   - sign-out counting an open session.
5. **Client, the timer:** the rest timer, Wake Lock, vibrate and beep, the Sound switch,
   and the live region.
6. **Close-out:** the floor PRs, then the docs, the roadmap's status and memory.

### Risks

- **The main chunk** (471,914 bytes) grows only by the Start buttons, the Resume notice
  and the shared save path. SessionPage is a lazy chunk, and each PR measures the main
  chunk in exact bytes.
- **Locked phones throttle timers.** The end-time design and the 5-second rule mean a
  late alert is skipped rather than played out of place. The rest is still shown as over
  when the page comes back.
- **Wake Lock, vibrate and Web Audio differ by browser.** Each is used only when present,
  and a refusal is ignored. The cross-browser pass checks the screen in WebKit and
  Firefox.

## Out of scope

- Supersets as linked pairs: they log one exercise at a time.
- Plate maths.
- Notifications.
- Heart-rate monitors.
- Editing a past session from the session screen.
- Anything C3 (the native app) adds.
