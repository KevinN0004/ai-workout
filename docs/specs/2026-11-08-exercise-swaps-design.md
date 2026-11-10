# Exercise swaps from the library, design

Status: **decided 2026-11-08**, section by section with the owner; **applied 2026-11-10**,
in #385 to #390, with the floors raised in #391 and #392, all live. The plan is
`docs/plans/2026-11-08-exercise-swaps.md`, whose status says where the work went past
this text. This is roadmap C4. It needs B4 (adaptive progression), done, and applies gate
G4: a swap waits for the user's tap, and shows why, with an undo.

"Something easier on my shoulder" and "I have no cable machine" are questions the curated
exercise library can already answer. C4 lets someone swap an exercise in their plan for
one of its alternatives. The alternatives come from the library under the rules that
built the plan, so a swap can never offer what the generator would refuse.

## What was found

Read on `f4b9c76`.

1. **The library is 157 entries over 13 patterns, and every name is unique.**
   `exerciseLibrary.js` tags each entry by pattern, the equipment it needs, its level,
   and for each body area whether it is to be modified or avoided. A modify tag names
   the easier entry to use instead and the cue to show with it. A unique name means a
   saved prescription, which holds only a name, finds its entry.
2. **The generator's choice is one function.** `choose()` (`generatePlan.js`) takes a
   pattern's entries in priority order and keeps those that:
   - need only equipment the plan has;
   - are at or below its level;
   - are not high-impact when the areas include knee, hip or pregnancy;
   - are tagged avoid for none of the areas.

   A modify entry is replaced by its regression, if that fits and is untagged. It returns
   the first candidate not already used that week, or else the first. Every candidate
   is worked out, and only one is returned.

3. **The dose depends on a slot's role, which is not saved.** `doseFor(exercise, role,
rules)` gives core, balance and mobility their own doses, and every other pattern the
   scheme's `main` or `accessory` dose. A regressed exercise always takes the accessory
   dose. A `Prescription` saves `name`, `sets`, `reps` or `seconds`, `perSide`,
   `targetRpe` and `restSeconds`, but neither the role nor the library id.
4. **The plan does not save its health answers, on purpose.** `readInput` reads
   `plan.health` (`pregnant`, `condition`, `symptoms`, `supervised`) into the areas and
   the light-to-moderate mode. `generated_plans` keeps the goal, the equipment and
   environment, the level, the injuries, the days, the duration and the focuses, but no
   health answers. The rule-based plans spec decided that "the health answers are not
   stored", and a route test holds it.
   - **The saved notes say which health rules applied.** `buildSafetyNotes`
     (`fallbackNotes.js`) adds one fixed sentence for the light-to-moderate mode and one
     for pregnancy, to every plan, whoever wrote the rest of the notes.
5. **The plan text is the days' lines.** `generatePlan` writes `text` from each day's
   heading and `lines`. The payload's days hold the same lines. The PDF export prints
   `planText` (`downloadPlanPdfFromText`, `client/src/app/events.js`).
6. **B4 keys everything by lift name.** `progression.js` builds each lift's week from the
   sessions logged under its name, and `progression_decisions` stores answers by week
   and `lift_key`. Nothing in B4 swaps an exercise.
7. **There are no plan routes.** The client reads plans from `GET /api/dashboard`
   (`dashboard.plans`, newest first), and the plan hub shows `plans[0]`.

## Decisions

Made with the owner on 2026-11-08:

- **A swap changes the plan from then on.** The plan hub, a session started afterwards
  and B4 all use the new exercise. A one-off is still the session's Skip and Add.
- **A swap starts from the plan day's details or from the in-gym screen.** Both change
  the plan.
- **The alternatives follow the plan's own rules, plus an optional area.** The swap can
  name an area ("it bothers my shoulder"), which adds that area's avoid and modify tags
  for this swap only.
- **A swap reaches every day the exercise appears.**
- **A swapped exercise says what it replaced and why, with an Undo** that restores the
  original everywhere.
- **The health answers stay unsaved** (decided while starting PR 2, after this spec
  first proposed saving them). A swap reads the plan's health rules from its saved
  safety notes instead.

## Design

### One rule for choosing and for swapping

- **`candidatesFor(pattern, rules, library)`** is exported from `generatePlan.js`. It
  returns every candidate `choose()` works out, in the same order, with modify entries
  already replaced by their regressions. `choose()` becomes the first candidate not
  already used, else the first, so the generator's output does not change. The plan
  gate's existing sweeps show that.
- **What a swap offers** for an exercise in a plan:
  - the candidates of that exercise's pattern, under the plan's rules with the named
    area added, if any;
  - without the exercise itself, or anything already on a day the exercise is on;
  - each with its name, the equipment it needs, and, for a regression, the area and
    the cue.
- **The plan's rules** come from `readInput` over the saved plan's columns, the
  profile's age, and the health answers its safety notes imply:
  - `healthFromNotes(notes)` (`fallbackNotes.js`, beside the sentences it reads) gives
    `pregnant: true` when the notes hold the pregnancy line, and `condition: true` when
    they hold the light-to-moderate line, and `false` otherwise;
  - the sentences are exported constants that `buildSafetyNotes` writes, so writer and
    reader cannot drift apart;
  - this works the same for every plan saved since rule-based plans, before C4 or after.

### What a plan records

- **Each new prescription gains `exerciseId` and `role`** (`"main"`, `"accessory"`, or
  `null` for core, balance and mobility). A prescription saved before C4 finds its entry
  by name. Its role is the one whose dose `doseFor` gives that matches the saved
  prescription's sets and amounts, or `"accessory"` when neither matches.
- **No health answer is saved.** The payload carries the notes it already did.
- **A swapped prescription** is the new exercise's prescription, at the dose `doseFor`
  gives it in the old one's role, with:
  - `swappedFrom`, the plan's original prescription and line, kept whole so Undo can put
    them back. Swapping an exercise that was already swapped keeps the first
    `swappedFrom`, so Undo always returns to what the plan was generated with;
  - `swapReason`, the area named for the latest swap, or `null`.
- **Each day's occurrence keeps its own role.** An exercise that is a main lift on Monday
  and an accessory on Thursday is swapped to the main dose on Monday and the accessory
  dose on Thursday.
- **Its line** is rewritten the way the generator writes lines, keeping a superset label
  ("A1."). The same line in `planText` is replaced too, so the plan page, the PDF and
  the notes read the same plan.
- **A day's ramp-up follows its lead lift** (found while building PR 3). The generator
  writes `- Ramp-up: <lead> x 8 at about half your working weight, …` only for a lead
  that takes a load. A swap of the lead renames that line, or leaves it out for a
  bodyweight lift. `swappedFrom.rampLine` keeps the original, so Undo, or a later swap
  to a loaded lift, puts it back after the warm-up.
- **A plan whose text does not hold a day's lines as its payload does is not swapped.**
  No saved plan is like that, and the route answers 409 rather than letting the two
  drift apart.
- **Nothing in the database schema changes.** The payload is JSON.

### The server

- **`GET /api/dashboard/plans/:planId/swaps?exercise=<name>&area=<area>`** returns
  `{ exercise, area, areas, alternatives }`.
  - `areas` lists the areas a swap can name: the injury areas (`INJURY_AREAS`, lower
    back to elbow). Pregnancy comes only from the plan's safety notes.
  - It answers 404 for a plan that is not the user's, and 400 for a name not in the plan
    or an area not in the list.
- **`POST /api/dashboard/plans/:planId/swaps`** with `{ from, to, area }`:
  - works the alternatives out again, and answers 409 when `to` is not one of them, so
    the server never trusts the client's list;
  - rewrites every prescription named `from`, with its line, in the payload and the text;
  - returns the plan as `GET /api/dashboard` maps it.
- **`POST /api/dashboard/plans/:planId/swaps/undo`** with `{ name }` puts back
  `swappedFrom` wherever a prescription named `name` has one, and returns the plan.
- **Each write reads and writes the plan in one transaction**, after
  `SELECT … FOR UPDATE` on that plan's row, so two swaps at once cannot lose one. Only
  the one row is locked, so the deadlock that ruled out row locks for meal saves does
  not arise.
- **The pure parts live in `services/planning/swaps.js`:** the alternatives, the swap
  and the undo, as functions of a payload and rules. The routes do the access and the
  storage.

### The plan hub

- **Each exercise with a prescription, in a day's details, gets "Swap".**
- **The swap is a step inside the details modal**, never a second modal. It shows:
  - "It bothers my…", with each area as a choice, none chosen at first;
  - the alternatives, re-fetched when the area changes;
  - "Nothing else in the library fits this plan" when there are none;
  - Back, to the day's details.
- **Choosing an alternative swaps it**, puts the returned plan into the dashboard, and
  returns to the day's details. There, the exercise reads "Swapped from Barbell back
  squat (shoulder)" with Undo.

### The in-gym screen

- **In a session started from a plan day, each exercise with no logged sets gets
  "Swap"** in the exercise list. Once it has sets, Skip and Add are the way on.
- **The swap is the same step, inside the session page.** Choosing one swaps it in the
  plan, then replaces the exercise in the open session through a new pure
  `replaceExercise(session, index, card, prescription)` in `app/workoutSession.js`. The
  exercise takes the new one's target and rest.
- **A blank session has no plan, so it has no Swap.**

### Edge cases

- **Offline, Swap is disabled**, with the existing offline hint. The alternatives come
  from the server, and a plan change is not a log entry for the outbox to replay.
- **A plan from before P4** (text only) has no prescriptions, so it has no Swap.
- **Logged workouts keep their names.** History is never rewritten. B4 starts the new
  lift with no history, and Undo brings the old lift's history back.
- **A session started before a swap keeps its own copy**, as it already does.
- **Absent is not zero:** a swapped exercise with no load to set keeps a `null` load.

### Testing

- **Server unit tests:**
  - `candidatesFor` returns `choose()`'s choice first, for the gate's plans;
  - the swap, the undo, a superset label, every day reached, and `swappedFrom` kept;
  - the role found for a prescription saved before C4;
  - the health rules read back from the safety notes, for each health answer the planner
    takes, and nothing saved.
- **Route tests, against Postgres:** another user's plan, a name or area not in the plan,
  a `to` that is not offered, two swaps at once, and undo.
- **The plan gate:** for its generated plans, every alternative of every prescription,
  with no area and with each area, passes the equipment, level, impact and avoid checks.
  Its dose is the one `doseFor` gives it in that role.
- **Client:** the swap step in both places, the swapped-from line and Undo, and
  `replaceExercise`.
- **E2E:** `plan.spec.js` swaps an exercise, sees the swapped-from line after a reload,
  and undoes it. `session.spec.js` swaps one in the gym. `a11y.spec.js` scans the swap
  step.
- **Coverage:** server functions have 0.02 of slack and client functions 0.27, so each
  PR covers every function it adds.

### Rollout

Each step ships after the one it relies on:

1. **Docs:** this spec and its plan.
2. **Server, no change in behaviour:** `candidatesFor` and `prescribe`, `exerciseId` and
   `role` on new prescriptions, and `healthFromNotes`.
3. **Server:** `swaps.js`, and the three routes.
4. **Client:** the swap in the plan hub.
5. **Client:** the swap on the in-gym screen.
6. **Close-out:** the floor PRs, then the docs, the roadmap's status and memory.

### Risks

- **A swap must never offer what the generator would refuse.** One function chooses
  for both, and the gate checks every alternative it offers.
- **The plan text and the payload could disagree.** Both are rewritten in the same
  transaction, from the same line, and a test reads both back.
- **A swap on a plan saved before C4** relies on matching names and doses. A name not
  in the library offers nothing rather than guessing.

## Out of scope

- B4 suggesting swaps by itself, for example after a lift has held for weeks.
- Swapping a conditioning block, a warm-up or a rest-day walk, which have no
  prescription.
- Swapping for one session only, beyond the session's existing Skip and Add.
- Changing the plan's equipment or injuries answers, which still means a new plan.
