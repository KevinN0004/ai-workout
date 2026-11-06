# Plans that adapt to your history, design

Status: **decided 2026-11-06**, section by section with the owner. The plan is
`docs/plans/2026-11-06-adaptive-progression.md`. This is roadmap B4. It carries G4,
decided on 2026-11-02: automatic within bounds.

A plan is a weekly template that stays the same until it is regenerated. B4 turns it into a
coach: each week, the server reads what you logged against the plan and sets that week's
load for each lift. It steps the load up, holds it, or deloads it, and it sets a deload week
when one is due. Each change says why and can be undone. A step up on a lift your injury
note concerns waits for your answer.

## What was found

Read on `ddc46f6`.

1. **A prescription has no load.** B1's prescriptions (`generatePlan.js`, `Prescription`)
   carry a name, sets, a rep or seconds range, per side, and a target RPE. A step up has to
   start from the load you last logged.
2. **Logged sets can be read against the plan.** P5 links a workout to a plan day
   (`planId`, `planDayIndex`), and B1 stores every set's reps, load and RPE. The dashboard
   read already holds up to 500 sessions with their sets, and the plans (the user's own
   plans, up to 200).
3. **A saved plan keeps its level and injury answer** (`generated_plans.level`,
   `.injuries`), beside its structure (`plan_payload`).
4. **The generator never puts a "modify" lift for a named area in a plan.** For an area the
   injury text names, an exercise the library tags `avoid` is skipped, and one tagged
   `modify` is replaced by its regression for that area, which carries no flag for it
   (`generatePlan.js`, the candidate loop). The knee case swaps "Dumbbell goblet squat"
   (knee: modify) for "Dumbbell box squat" (no knee flag). So a rule reading only the
   library's flags would never find a lift to ask about; see "Asked first" below.
5. **The server does not know your unit or your date.** The unit comes from the browser's
   region (`getPreferredMeasurementSystem`), and the server runs on UTC while weeks start
   on your Monday.
6. **The API has no PUT route yet.** It uses GET, POST and DELETE, but CORS allows PUT
   (`corsPolicy.js`) and the CSRF guard covers it (`csrfUnsafeMethods` in `index.js`).
7. **The next migration is 007** (`server/db/postgres/006_exercise_sets.sql` is the last).

## Decisions

Made with the owner on 2026-11-06, within G4:

- **The plan adapts every week, on the saved plan.** It is never regenerated for this.
- **A lift's target is hit at the top of its rep range, every set:** double progression.
- **A lift deload is about 10% lighter, then builds back.**
- **The deload week is the 6th training week in a row**, and a beginner plan's first is the
  8th. A missed week resets the count; a new plan does not.
- **Only a step up on an injury-flagged lift is asked first.** Swaps stay in C4, and no rule
  changes days or volume.
- **The server works it out on each read**, in a pure module that the plan gate scores.

## Design

### The rules

Worked out for the latest plan with a saved structure, for the week that starts on the
Monday of the client's date.

- **Lifts.** A lift is each exercise the plan prescribes in reps, not seconds. Logged sets
  are matched to it by name, ignoring case and surrounding space, as in B2. These lifts get
  no target, and say so:
  - a lift with no logged load above 0 in the four weeks before the week ("Pick a load");
  - a bodyweight lift or a hold.
- **Working load.** The heaviest load in the lift's most recent session in those four
  weeks.
- **Step up.** The load goes up one step when that session has at least the prescribed
  number of sets at the working load, each at the top of the rep range or more, and each
  with an RPE of 8 or below. A set without an RPE is never easy.
- **Hold.** Anything else keeps the working load.
- **Lift deload.** Either of these makes the target about 10% lighter:
  - the week before had no workout logged at all, though an earlier week had one;
  - the lift's last three sessions at the same load each had a higher average RPE than the
    one before, the last above 8. A session with no RPE breaks the run.

  The target is the working load less 10%, rounded to the nearest step, and always at least
  one step lighter: 60 kg goes to 55 kg, and 10 kg to 7.5 kg.

- **Deload week.** Weeks are walked from the first logged workout. A week with a workout
  counts one more, and a missed week or a deload week resets the count to 0. The 6th counted
  week is a deload week; a beginner plan's first is the 8th, and after that every 6th. The
  level is read as the generator reads it (`readInput`): the plan's `level` in lower case,
  with an unknown one read as intermediate. In a
  deload week every exercise is prescribed at `ceil(sets / 2)` sets, at least 1, and every
  lift holds its working load.
- **Order.** A deload week comes first, then a lift deload, then a step up, then a hold.
- **Asked first.** A step up waits for the user's answer when the lift is injury-flagged:
  for an area that the plan's injury answer and the profile note name now
  (`buildInjuryText`, `detectInjuryAreas`), the library either tags the lift `modify` or
  `avoid`, or names it as a regression for that area. The second half is what finds the
  lifts a plan actually holds (found 4). The first half covers a note added after the plan
  was made. Holds and deloads stay automatic, because lighter is safe.
- **Units.** Each target is worked out twice, in kg with a 2.5 kg step and in lb with a
  5 lb step, each rounded to its own step from the working load in that unit. The client
  shows its region's.
- **Why.** Every change carries a sentence naming the session and the reason. For example:
  "Every set reached 10 reps at RPE 8 or below on Mon 2 Nov", or "No workout logged last
  week; about 10% lighter to rebuild".

### Answers and undo

- **One row per user, week and lift** in a new table, `progression_decisions` (migration
  007): `id`, `user_id` (foreign key to `app_users`, `ON DELETE CASCADE`), `week_start`
  (date), `lift_key` (the lower-cased name, or `''` for the week), `decision`, and
  `created_at`. `decision` is one of:
  - `undo`: an automatic step up or lift deload holds instead;
  - `accept` or `decline`: an asked step up goes up, or holds;
  - `normal`: a deload week trains as usual.
- **A full unique index** on `(user_id, week_start, lift_key)`. It is not partial, so a
  plain upsert works here, unlike the legacy-id tables.
- **An answer covers its week only.** Next week the rules run again from what was logged.
  The table is not tied to a plan, so a regenerated plan keeps the week's answers for the
  lifts it still has.
- **Routes:**
  - `PUT /api/dashboard/progression/:weekStart/:liftKey` takes `{ decision }`;
  - `DELETE` on the same path takes an answer back.
  - Both are zod-validated and CSRF-guarded, and both answer with the recomputed week.
  - `weekStart` must be the current Monday or the one before, so an old link cannot
    rewrite history.
- **Access** goes through a new `progressionDecisionRepository.js`. Reads take the week's
  rows only, and at most one row per lift per week leaves nothing to prune.

### Data flow and screens

- **The dashboard read carries `progression`.** `GET /api/dashboard?today=YYYY-MM-DD`
  sends the client's local date, which the server accepts within one day of its own UTC
  date and otherwise replaces with its own. The answer gains:
  - `weekStart`;
  - `deloadWeek`: `{ active, count, reason, decision }`;
  - `lifts`: `[{ name, change, kg: { from, target }, lb: { from, target }, sets, why,
decision }]`, with `change` one of `up`, `hold`, `deload`, `ask` and `none`.

  `progression` is null when there is no plan with a saved structure. The PUT and DELETE
  answers return the same object, and the client swaps it in.

- **The plan hub's day details** show, under each lift, the week's load in the region's
  unit with its change, its reason and its controls: Undo, or Go up and Keep. A deload week
  shows a banner, "Lighter week: your 6th week in a row. Same loads, half the sets", with
  Train normally, and the prescriptions at the week's sets.
- **The log pre-fill** shows the week's load as each set row's load placeholder, beside B1's
  rep and RPE placeholders. Nothing is typed for the user: a typed load in a row left blank
  would stop the save.
- **The summary's plan line** adds "deload week" when one is active.
- **The new client code is in lazy chunks.** The plan hub view and the log modal are lazy
  already, so the main chunk grows by no more than the shared helpers they import from it.

## PRs

One at a time, merged only when CLEAN, with main's CI and Deploy watched before the next:

1. **Docs**: this spec and the plan.
2. **The rules**: `server/src/services/planning/progression.js`, pure and type-checked, its
   tests, and the plan gate's history fixtures. Server only; nothing calls it yet.
3. **The server API**: migration 007, the repository, `progression` in the dashboard read
   with `?today=`, and the PUT and DELETE routes.
4. **The client**: the plan hub, the pre-fill placeholders, the summary line, a `dash-plans`
   capture state, the E2E and the axe scan.
5. **Floors**, one PR per side whose figure rose, then the close-out.

## Testing

- **TDD throughout**, with each mutation confirmed applied and each file restored
  (ADR 0015).
- **The rules, against hand-worked history fixtures**, each rule at its edge:
  - one set short of the top of the range;
  - RPE 8.5 against 8;
  - a set with no RPE;
  - the heaviest of mixed loads;
  - the missed week across its Monday;
  - three rising RPEs against two;
  - the 6th counted week against the 5th, and a beginner's 8th;
  - kg and lb rounding, and the one-step-lighter floor;
  - every answer kind;
  - each half of the injury-flag rule.
- **Numeric-coercion contract rows** for every reader: a missing load is no load, and a
  missing RPE is never easy.
- **Mutations**, at least:
  - RPE 8 or below read as below 8, or as 9 or below;
  - the top of the range read as the bottom;
  - a set with no RPE counted easy;
  - the nearest step as the step below;
  - the one-step floor dropped;
  - the deload-week count off by one, or no beginner offset;
  - an asked step up applied automatically;
  - the rules in the wrong order.
- **The plan gate.** B3's gate in `scripts/evals` gains history fixtures, injury cases
  included. For every generated plan with each history it asserts:
  - no automatic step up on an injury-flagged lift;
  - no step up without an RPE of 8 or below on every counted set;
  - a step up of exactly one step;
  - a lift deload at least one step and about 10% lighter;
  - a deload week with every exercise at `ceil(sets / 2)` sets, at least 1, and no load up.
- **Route tests** in their own integration file, because of the auth limiter's 25 signups a
  file:
  - the week window;
  - the decision values;
  - another user's rows unreachable.
- **E2E.** It logs a plan day dated last Monday with every set at the top at RPE 8, then
  checks that the plan hub shows the step up, that Undo reverts it, and that the pre-fill
  shows the target. axe scans the day's details with a change and a question on screen.
- **Screenshots.** A `dash-plans` capture state with a seeded history, compared against
  written expectations.
- **Coverage.** `test:coverage` with json-summary on both sides, the server measured with
  `client/dist` present. The client's statement and function slack is under one after
  #358, so every client function added ships with its test.

## Out of scope

- **Swaps**, which are C4.
- **Changes to days or volume**, other than the deload week's sets.
- **Progression for holds and bodyweight lifts**, by seconds or reps.
- **Loads for a lift never logged with one.** The plan does not guess a first load.
- **Reading more than the dashboard read holds** (500 sessions).
