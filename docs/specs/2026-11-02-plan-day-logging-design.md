# Logging a workout against a plan day (roadmap Phase 5), design

Status: **decided 2026-11-02**, nothing applied. The plan is
`docs/plans/2026-11-02-plan-day-logging.md`.

The September roadmap (`docs/specs/2026-09-18-development-roadmap-design.md`, Phase 5)
approved the shape: two nullable columns on `workout_sessions`, `generated_plan_id` and
`plan_day_index`, indexed as a pair; the write route accepts them; the workouts UI logs
against a day of the current plan; and the plan display marks the days that have a session.
Phase 4 (`docs/specs/2026-11-02-structured-plans-design.md`) gave every new plan a saved
structure whose day `index` is stable, which is what makes the link possible. This spec
settles the migration, the write and read, the pre-fill and the tests.

## What was found

Read on `91bcd5d`.

1. **The next migration number is 004.** `001_foundation.sql`, `002_password_changed_at.sql`
   and `003_utc_timezone.sql` exist, and the runner applies files in filename order, each in
   its own transaction (`postgresMigrations.js`). CI migrates before its tests, and the
   Deploy workflow migrates before it deploys.
2. **The client knows a plan by its legacy id, not its key.** `mapGeneratedPlan` returns
   `id: row.legacyId || row.id`, and the generate route gives every plan a legacy id
   (`crypto.randomUUID()`). A foreign key references `generated_plans.id`, so the server has
   to resolve the id the client sends. `userIdWhere` already does this for users: a UUID
   matches either column, anything else the legacy column only, so a non-UUID string never
   reaches the `uuid` column.
3. **The workout write is an upsert by legacy id.** `saveWorkoutSession` reads by
   `(user, legacyId)` and then updates or creates (`workoutSessionRepository.js:42`). The
   route answers `workoutSession: session`, the entry it built rather than the row it saved
   (`registerWorkoutAndGoalRoutes.js:57`). Nothing in the client reads that field.
4. **Sessions are read in three places.** The dashboard read (`userReadRepository.js:115`),
   the paginated collection (`dashboardCollectionRepository.js:12`) and the save's own
   return. All three go through `mapWorkoutSession`.
5. **The Log workout modal has four entry points.** It is opened from the glance panel
   (`DashboardPage.jsx:461`) and twice from `WorkoutsView` (`:147`, `:196`). Each spreads the
   previous form and sets only the date, so a field left in the form survives into the next
   entry.
6. **The plan hub keys its week by weekday.** `PlansView` shows a card per weekday from
   `latestPlanByWeekday` and opens a day-details modal. It has no access to the plan's
   saved days or to the workout form.
7. **Real plan days fit the form.** Across the 56 days of the eight Phase 4 fixtures:
   - a day's text has a median of 360 characters and a maximum of 771, and 6 days exceed the
     notes field's 500;
   - a day has at most 14 bullet lines (`- Name: prescription`), under the exercises field's
     18 items;
   - six bullet names carry a comma, each inside a bracketed aside such as
     `Cable Rows (Close grip, focus on upright posture)`. The exercises field is split on
     commas, so an aside left in would split one exercise into two.

## Decisions

Decided by the owner on 2026-11-02:

- **G3: logging against a plan day pre-fills the form** from that day's prescription.
- **The pre-fill fills the exercises and the notes.**
  - Exercises: each bullet's name, with bracketed asides and "Rest" lines dropped.
  - Notes: the day's lines, cut to 500 characters.
  - Focus: the day's title.
  - Date: today.
  - Sets, reps and RPE are left empty: the form holds one number for each, and per-set
    logging is roadmap item B1.

  Exercises only, and notes only, were offered and not chosen.

Settled in this spec:

- **A link that does not check out is dropped, and the workout is kept.** The plan must be
  one of the caller's own, must have a saved structure, and must have the day. Otherwise the
  session saves without the link and the route logs `workout_plan_link_dropped`. Logging is
  optimistic and sent after the undo window, so a refused link would lose the workout
  behind it, which is worse than a missing link. A request naming another user's plan is
  dropped the same way and never reveals whether that plan exists.
- **Only the newest plan can be logged against, and only when it has a saved structure.**
  That is every plan saved since Phase 4.

## Design

### The migration: `004_workout_plan_day.sql`

```sql
alter table workout_sessions
  add column generated_plan_id uuid references generated_plans (id) on delete set null,
  add column plan_day_index smallint,
  add constraint workout_sessions_plan_day_index_check
    check (plan_day_index is null or plan_day_index >= 0),
  add constraint workout_sessions_plan_link_check
    check (generated_plan_id is null or plan_day_index is not null);

create index workout_sessions_plan_day_idx
  on workout_sessions (generated_plan_id, plan_day_index);
```

- **Deleting a plan sets `generated_plan_id` to null and leaves `plan_day_index`.** A
  reference's `set null` clears only its own column. So the link check allows an index
  without a plan, and the read ignores one.
- **The index also serves the prune.** Each delete of a plan has to find the sessions that
  reference it, and without an index on `generated_plan_id` that is a scan of the user's
  sessions per plan deleted.
- **Old code runs safely against the new columns.** They are nullable, and Prisma names
  the columns it reads.

`schema.prisma` gains the two fields, the relation (`onDelete: SetNull`) and the index.
`server/db/postgres/README.md` lists the file.

### The write

- **`workoutSessionBodySchema`** accepts an optional `planId` (a string of up to 64
  characters) and `planDayIndex` (0 to 31).
- **`buildWorkoutSessionEntry`** keeps `planId` (cleaned, or null) and `planDayIndex` (a
  whole number of 0 or more, or null). Index 0 is the first day, so it is never read as
  absent.
- **`saveWorkoutSession` resolves the link before it writes.**
  - It finds the plan among the user's own, by the id's legacy column, or by either column
    when the id is a UUID, the same rule as `userIdWhere`.
  - It keeps the link only when `toPlanPayload` accepts the plan's structure and the
    structure has a day at that index.
  - It writes both columns, or neither. An update without a link clears the link.
- **The route answers the saved session,** whose `planId` says whether the link was kept.
  It logs `workout_plan_link_dropped` when a link was asked for and not kept.

### The read

`mapWorkoutSession` adds:

- `planId`: the linked plan's client id (`legacyId || id`), or null;
- `planDayIndex`: the index, or null whenever `planId` is.

Each of the three reads selects the plan's `id` and `legacyId` with the session.

### The client

- **`app/plans.js` exports `savedPlanDays(plan)`:** the plan's saved days when its payload
  is valid, and null otherwise. This is the rule `readPlan` uses, without its text
  fallback.
- **`pages/dashboard/planUtils.js` gains `buildPlanDayPrefill(day)`,** which returns the
  form's `focus`, `exercises` and `notes` by the rules in Decisions. It skips names that
  still hold a comma or run past 140 characters. It is tested on all 56 real days.
- **The workout form gains `planId` and `planDayIndex`.**
  - `submitWorkout` sends them and puts them on the optimistic entry, so a logged day shows
    at once, and the form reset clears them.
  - The three existing entry points clear them too, so the next ordinary workout is not
    linked by accident.
- **The plan hub's day-details modal gains "Log this workout".**
  - It shows when the newest plan has saved days and one of them is that weekday.
  - It fills the form with the pre-fill, today's date and the link (the first saved day
    with that weekday), closes the day details and opens the Log workout modal.
- **The Log workout modal says what it is logging** ("Logging Monday of your plan") whenever
  the form carries a link.
- **The plan hub marks each logged day.** A weekday card shows "Logged" when a workout
  session links to that day of the newest plan. Existing classes only, so no stylesheet
  changes.

## PRs

1. The spec and plan.
2. The migration and the Prisma model, with live-schema tests. No behaviour changes.
3. The server write and read.
4. The client.
5. A floor PR per side, only if a truncated figure rose.

## Testing

- **The migration, against live Postgres:**
  - the columns, the two checks and the index exist;
  - deleting a plan keeps its sessions and clears their `generated_plan_id`;
  - the database refuses a negative index, and a plan without an index.
- **The write:**
  - a link to the caller's plan and an existing day is stored, index 0 included;
  - a link is dropped, the workout kept and the warning logged when:
    - the plan belongs to another user;
    - the plan is unknown;
    - the id is not a UUID and matches no legacy id;
    - the plan has no saved structure;
    - the index is past the last day;
  - an update without a link clears one.
- **The read:** each of the three reads returns `planId` and `planDayIndex`, both null
  after the plan is deleted.
- **The client:**
  - `buildPlanDayPrefill` on the 56 real days: no name holds a comma, no name is "Rest", and
    the notes stay within 500 characters;
  - `submitWorkout` sends the link and clears it;
  - each entry point clears a stale link;
  - the plan hub shows the button only with saved days, pre-fills and opens the modal, and
    marks a logged day.
- **Mutation:** every new guard, each mutation confirmed applied.
- **No E2E change.** No plan exists in the E2E run, because generation needs a live key.

## Found, not fixed here

- **Rest days count as training days** (Phase 4's finding), and a rest day can be logged
  against like any other. P6 detects rest days.

## Out of scope

- Logging against an older plan, or a plan saved before Phase 4.
- Changing or removing a session's link after it is saved.
- Per-set logging (B1) and planned-versus-done figures (P6).
