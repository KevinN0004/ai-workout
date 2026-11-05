# Per-set logging, design

Status: **decided 2026-11-05**, section by section with the owner. The plan is
`docs/plans/2026-11-05-per-set-logging.md`. This is roadmap B1. It also carries G3, the
pre-fill on plan-day logging, as far as the prescribed sets.

A workout session records one `sets` number, one `reps` number and one RPE, so "3 × 8 at
60 kg, then 62.5 kg" cannot be written down. B2 (records, e1RM, volume), B4 (plans that
adapt to your history), B6 (in-gym mode) and C1 (offline) all need set-level data. This
spec adds a set log: what one set holds, where it is stored, how the form records it, how
a plan day pre-fills it, and how it ships.

## What was found

Read on `8e677b6`.

1. **A session stores a summary, not sets.** `workout_sessions` (`server/prisma/schema.prisma`)
   has `exercises` (a JSON list of names), `sets`, `reps` and `intensity_rpe`, one each for
   the whole session. `buildWorkoutSessionEntry` (`dashboardDataBuildersService.js`) bounds
   them at 18 names of 140 characters, 1 to 80 sets, 1 to 120 reps and RPE 1 to 10, and
   `workoutSessionBodySchema` (`apiSchemaService.js`) validates the same fields.
2. **Every session read goes through one include.** `WORKOUT_SESSION_INCLUDE` and
   `mapWorkoutSession` (`workoutSessionRepository.js`) serve the dashboard read
   (`userReadRepository.js`, up to 500 sessions) and the paginated Logs route
   (`dashboardCollectionRepository.js`).
3. **The save is read-then-write**, because `workout_sessions_user_legacy_idx` is a partial
   unique index that `schema.prisma` cannot express (CLAUDE.md, Data access).
4. **The rule-based generator knows each exercise's dose and writes only text.** `doseOf`
   (`server/src/services/planning/generatePlan.js`) builds sets, a rep range or a hold in
   seconds, "a side", and the reps in reserve, then formats them into a line such as
   `- Dumbbell bench press: 3 x 8-10 (Rest 90s, stop 2 reps short of failure)`. The saved
   `plan_payload` holds each day's `lines`, not the numbers behind them.
5. **Both payload validators ignore fields they do not know.** `toPlanPayload`
   (`planPayloadService.js`) and `isPlanPayload` (`client/src/app/plans.js`) check
   `version === 1` and the known fields of each day. A new optional field passes both
   unchanged, so it needs no version bump. P6 showed what a bump costs: a client still
   running reads every new plan as invalid.
6. **Plan-day logging pre-fills names only.** `buildPlanDayPrefill`
   (`client/src/pages/dashboard/planUtils.js`) gives the form the day's title, the exercise
   names its bullets prescribe (skipping ramp-ups, cool-downs and superset labels since
   #339), and the day's text as notes.
7. **Weights are stored in two units today.** The profile stores `weightKg`, and progress
   metrics store `weight_lb`. Which one is shown follows the browser's region
   (`getPreferredMeasurementSystem`, `client/src/app/units.js`), and nothing saves a
   preference. `toKg` and `toLb` in `units.js` convert.

## Decisions

Made with the owner on 2026-11-05:

- **A set holds reps or seconds, plus an optional load and RPE.** Holds (planks, wall sits,
  balance work) are logged in seconds, not as reps. Cardio stays session-level, in the
  duration and notes, as today.
- **Loads are stored in kg and shown in the region's unit**, converted at the edge with
  `app/units.js`, as body weight in the profile already is.
- **The form becomes exercise cards with set rows.** The comma-separated exercises box and
  the session's single Sets, Reps and RPE fields leave the form. A card with a name and no
  sets still logs, so a quick log stays possible.
- **Sets are stored in a new `exercise_sets` table**, not as JSON on the session, so the
  database checks the numbers and B2 can find a lift's best set across all history with an
  indexed query.

## Design

### The table

Migration `server/db/postgres/006_exercise_sets.sql` adds `exercise_sets`, one row per set:

| Column           | Type and rule                                                        |
| ---------------- | -------------------------------------------------------------------- |
| `id`             | `uuid` primary key, `gen_random_uuid()`                              |
| `session_id`     | `uuid not null`, references `workout_sessions(id) on delete cascade` |
| `user_id`        | `uuid not null`, references `app_users(id) on delete cascade`        |
| `exercise_order` | `smallint not null`, 0 to 17 (the 18-exercise cap)                   |
| `exercise_name`  | `text not null`, 1 to 140 characters                                 |
| `set_number`     | `smallint not null`, 1 to 20                                         |
| `reps`           | `smallint`, 0 to 200                                                 |
| `seconds`        | `smallint`, 1 to 3600                                                |
| `load_kg`        | `numeric(6,2)`, 0 to 1000                                            |
| `rpe`            | `numeric(3,1)`, 1 to 10                                              |
| `created_at`     | `timestamptz not null default now()`                                 |

- **Exactly one of `reps` and `seconds`** (`check (num_nonnulls(reps, seconds) = 1)`). A
  set with neither is not a set.
- **Zero is a measurement where it can be one.** 0 reps is a failed set and 0 kg is
  bodyweight work, so both are kept. A blank is null, never 0 (ADR 0001). A hold of 0
  seconds is not a hold, so `seconds` starts at 1.
- `unique (session_id, exercise_order, set_number)`, and an index on
  `(user_id, lower(exercise_name))` for B2.
- `user_id` duplicates what the session already knows, so a per-user query needs no join.
  The save writes it from the session's own `user_id`, never from the body.

### The write

`POST /api/dashboard/workout-sessions` accepts a new optional field:

```json
"exerciseSets": [
  { "name": "Dumbbell bench press", "sets": [{ "reps": 10, "seconds": null, "loadKg": 22.5, "rpe": 7 }] }
]
```

- `workoutSessionBodySchema` validates it: at most 18 exercises, 20 sets each, names of 1 to
  140 characters, and each set's numbers in the table's ranges, with exactly one of `reps`
  and `seconds`. The numeric fields use the existing absent-aware field helpers, so `null`,
  `""` and a missing key all mean absent.
- `buildWorkoutSessionEntry` carries the cleaned list through. When `exerciseSets` is
  present and `exercises` is not, `exercises` is filled from the cards' names in order, so
  today's readers (Logs, the plan-day "Logged" marks, the metrics) keep working unchanged.
- `saveWorkoutSession` runs in one transaction: the session row is saved with today's
  read-then-write, then the session's sets are deleted and the new ones inserted. A failed
  insert rolls back the session row with it. An update that sends no `exerciseSets` leaves
  a session's sets alone, so a client still running the old bundle cannot wipe them.
- The summary fields `sets`, `reps` and `intensityRpe` stay accepted and stored. Older
  sessions keep them, and the old bundle still sends them. The new form does not.

### The reads

- `WORKOUT_SESSION_INCLUDE` includes the session's sets, ordered by `exercise_order`, then
  `set_number`, and `mapWorkoutSession` returns them grouped as `exerciseSets` in the shape
  the write takes. `load_kg` and `rpe` are Decimal columns, read through `toNumberOrNull`.
  `server/src/__tests__/numericCoercion.contract.test.js` gains a row for each new reader.
- **The dashboard read's added size is not measured yet.** It reads up to 500 sessions, and
  with sets each may carry about twenty more rows. PR 2 measures it on seeded data. If it is
  too heavy, the dashboard read leaves sets out and only the paginated Logs route carries
  them. The measurement and the choice go in that PR.

### Plan prescriptions

- **What the generator adds.** Each generated day gains `prescriptions`, one per exercise
  line, in the order of those lines:
  `{ name, sets, reps: { min, max } | null, seconds: { min, max } | null, perSide, targetRpe: { min, max } | null }`.
  - A reps dose fills `reps`: "3 x 8-10", "2 x 6 a side", and "3 x 10 steps", with steps
    counted as reps. A hold fills `seconds`: "3 x 20-30 seconds", "3 x 30 seconds a side".
  - `targetRpe` is 10 minus the reps in reserve: "stop 1-2 reps short of failure" is RPE
    8 to 9 (`{ min: 8, max: 9 }`), "stop 2 short" is RPE 8 (`{ min: 8, max: 8 }`), and
    "stop 3 short" is RPE 7. A hold or a mobility drill has none. This is a
    **convention**: the reps-in-reserve RPE scale, which the rule-based plans evidence
    review cites as "Zourdos/Helms via AUT" for the effort cue.
  - Left out, as #339 leaves them out of the names: the ramp-up line, intervals, the cardio
    finisher, Easy breathing, Easy cooldown and rest-day walks.
- **How it is saved.** `plan_payload` days gain `prescriptions` as an optional field. The
  payload stays at version 1 (finding 5). Both validators accept a day with or without it,
  and check it when it is there. A malformed `prescriptions` is dropped from its day, and
  the rest of the plan stays valid. The generate route takes the prescriptions from the
  generator's `week` and joins them to the parsed days by weekday.
- **Older plans** carry none, so logging one of their days pre-fills names only, as today.
- **Per side.** One logged set covers both sides, with reps or seconds counted per side.
  The card says "each side".

### The form

`DashboardWorkoutModal` keeps Session details (date, duration, focus) and Notes. Exercise
details becomes a list of cards:

- A card has a name field, a reps-or-seconds choice, set rows, "Add set" and a remove
  button. A set row has reps or seconds, a load in the region's unit and an RPE, and its
  own remove button. "Add set" copies the previous row's load. "Add exercise" adds an empty
  card, up to 18 cards and 20 sets each.
- **A target is a placeholder, never a value.** A pre-filled row shows "8-10" and "8-9" in
  grey and holds nothing until something is typed, so an untouched row saves no
  measurement.
- **On save,** a row left wholly blank is dropped. A row with a load or RPE but no reps or
  seconds stops the save with an inline "Enter reps or seconds" beside it. A load typed in
  pounds is converted to kg with `toKg` and rounded to two decimals.
- **Labels name the set and the exercise:** "Set 2 reps, Dumbbell bench press". The
  modal's focus trap (#342) and the phone tap test (#341) cover the cards.
- The form state moves from `exercises`, `sets`, `reps` and `intensityRpe` to
  `exerciseSets`, held as strings while typed, as the form holds numbers today.

### The pre-fill

`buildPlanDayPrefill` builds cards from the day's `prescriptions`, each with its number of
empty set rows, the reps-or-seconds choice set, and the targets as placeholders. A day
without prescriptions gets one name-only card per exercise, using #339's rules.

### Logs

- The optimistic entry carries its `exerciseSets`, so Logs shows the sets before the server
  answers, and Undo works as today.
- A session with sets shows one line per exercise, for example
  "Dumbbell bench press: 10, 9, 8 reps · 22.5 kg · RPE 7-9", in the region's unit, with
  the load and RPE ranges collapsed when every set shares them.
- A session without sets keeps its "3 sets · 10 reps · RPE 8" line.

## PRs

One PR at a time, merged only when CLEAN, with main's CI and Deploy watched before the
next:

1. **Docs**: this spec and the plan.
2. **Table and repository**: migration 006, the Prisma model, the transactional save, the
   include and mapper, the contract rows, and the dashboard-read measurement.
3. **API**: the `exerciseSets` schema and builder, the response, and the bounds tests. The
   server accepts sets before any client sends them.
4. **Plan prescriptions**: the generator, the optional payload field in both validators,
   the client-server contract test, and the gate check below.
5. **Client form**: the cards, set rows, units, validation, the optimistic entry and Logs.
6. **Pre-fill and E2E**: plan-day logging builds the cards, and `plan.spec.js` logs sets.
7. **Floors**: one PR per side, raised once.

## Testing

- **TDD throughout**, with each mutation confirmed applied and each file restored byte for
  byte (ADR 0015).
- **Server, against Postgres**: the save writes and replaces sets in one transaction; a
  failed set insert leaves no session row; an update without `exerciseSets` keeps the
  stored sets; another user's session cannot gain sets; deleting a session or an account
  removes its sets; each check constraint refuses its out-of-range value; 0 reps and 0 kg
  survive the round trip.
- **The gate** (`scripts/evals/__tests__/generatePlan.gate.test.mjs`) also asserts, over
  every generated plan, that each exercise line has exactly one prescription in the same
  order, and that its set count and range match the dose text.
- **Contract**: a client test imports the server's payload validator and the generator,
  and checks that both validators accept the same days with and without prescriptions,
  and drop the same malformed ones.
- **Client**: the cards' add, remove, copy-load and validation rules, the pound-to-kg
  conversion, the pre-fill from prescriptions and without them, and the Logs line. The
  client numeric-coercion contract gains a row for each new parser.
- **Accessibility and layout**: the axe scan covers the modal with cards, and a phone-width
  screenshot compare, with written expectations, checks the cards at 390 px.
- **E2E**: `plan.spec.js` logs Monday with set rows filled, reloads, and checks that Logs
  shows them.
- **Coverage**: `test:coverage` with json-summary on both sides, the server measured with
  `client/dist` present.

## Out of scope

- **Records, e1RM and volume trends**: B2.
- **Progression from the logged sets**: B4. B1 stores what B4 reads, and changes no plan.
- **A rest timer and one-tap logging**: B6.
- **Offline queueing of set writes**: C1.
- **A saved kg-or-lb preference.** The region decides, as it does for body weight.
- **Cardio sets** (distance, minutes per block). The owner chose session-level cardio.
- **Editing a past session's sets.** Today's form logs new sessions, and this keeps that.
