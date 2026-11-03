# Planned versus done (roadmap Phase 6), design

Status: **decided 2026-11-02**, nothing applied. The plan is
`docs/plans/2026-11-02-planned-versus-done.md`.

The roadmap's P6 asks that the summary show the current plan's planned, completed and missed
days, and progress toward the target weight, with every new numeric field covered by the
numeric-coercion contract tests. Phase 4 found that rest days count as training days
(`docs/specs/2026-11-02-structured-plans-design.md`, "Found, not fixed here"), and Phase 5
left a rest day loggable like any other. Phase 5 links a workout to a plan day, which makes
"done" computable. This spec settles how a rest day is told apart, what counts as done, and
what an unset target weight is.

## What was found

Read on `00a8f08`.

1. **Every day of a real plan has lines, rest days included.** `buildWeeklyMealPlan` marks a
   day a training day when the newest plan has lines for it (`planUtils.js:168`), so all
   seven days get the training-day calories.
2. **Rest days are recognisable from their opening main entry.** Across the 56 days of the
   eight Phase 4 fixtures, a day is a rest day exactly when its opening main entry starts with
   "Rest", "Full Rest", "Active Recovery" or "Optional". The opening main entry is the text
   after a "Main lifts:" heading on its own line, or the line below that heading, and the
   day's first line when it has no such heading. By that rule each fixture has exactly as many
   training days as its profile asked for: 3, 5, 4, 6, 2, 3, 7 and 1, the number in each
   fixture's file name. A rule on the first line alone is not enough: one Sunday opens with
   "Warmup: None." and puts "Main lifts: Full Rest." second, and three rest days put the
   rest under the heading as a bullet.
3. **Training days also mention rest.** Bullets such as `- Rest: 30 seconds` and prescriptions
   such as `(Rest: 60s)` sit inside training days, so a rule that searched a whole day for
   "rest" would call every day a rest day.
4. **The summary has no planned-versus-done figure.** Its weekly card counts the workouts of
   the last seven days against the weekly-workouts goal (`useDashboardMetrics.js:245`) and
   never reads the plan.
5. **Every account stores a target weight of 160 lb, chosen or not.** Sign-up saves
   `defaultDashboard()`, whose goals are 160 lb, 2,200 kcal and 3 workouts
   (`authRoutes.js:133`, `dashboardDataBuildersService.js:141`, `userReadRepository.js:187`),
   and `buildDashboard` answers 160 for a target that is absent or out of range
   (`dashboardDataBuildersService.js:182`). So a chosen 160 and the default cannot be told
   apart, and "progress toward your target" would measure against a number most users never
   picked.
6. **The summary shows "0 lb" for an absent weight.** With no weight logged it shows
   "Target weight" and `(latestWeight ?? Number(goals.targetWeight || goalForm.targetWeight)) || 0`
   (`SummaryView.jsx:435`).
7. **A blank target in the goals form is not saved.** The body schema reads `""` as null
   (`toNumberInput`, `apiSchemaService.js:19`), and the goals route writes only the goals that
   parsed (`registerWorkoutAndGoalRoutes.js:110-115`). So a form whose target is blank saves
   the other goals and leaves the target as it was. Today the form is filled from the
   dashboard with `|| 160` (`useDashboardData.js:21`), so saving only the calories would also
   save 160 as the target.

## Decisions

Decided by the owner on 2026-11-02:

- **Done means linked, or on the day.** A planned day is done when a workout linked to it
  was logged this week, or when an unlinked workout is dated on it. Linked only, and any
  workout on the day ignoring links, were offered and not chosen.
- **A target weight is absent until it is saved.** The server answers null for a target never
  saved. Keeping 160 with a separate "saved" flag, and treating 160 as the target, were
  offered and not chosen.
- **Untouched defaults are cleared.** A migration removes the stored target from accounts
  whose goals are still exactly the sign-up defaults. Clearing it for new accounts only was
  offered and not chosen. Someone who deliberately saved exactly 160 lb, 2,200 kcal and 3
  workouts is asked to set the target once more.
- **The design as presented**, including hiding "Log this workout" on rest days. Keeping the
  button on rest days was offered and not chosen.

Settled in this spec:

- **Rest days are detected on the client, by the rule in finding 2.** A `rest` flag in the
  saved structure would need a new payload version, under which every plan saved so far falls
  back to its text, and a second parser to keep in step. Asking the model to mark rest days is
  roadmap item B5, which can replace this rule.
- **The week is Monday to Sunday,** the local week holding today, because a plan's days are
  weekdays.

## Design

### Rest days

- **`app/plans.js` exports `isRestDay(lines)`**: true for a day with no lines, or whose
  opening main entry starts with one of the four words, ignoring case and a leading `- `.
  It takes a day's lines, so it serves both a saved day and `planByWeekday`'s merged lines.
- **The meal plan:** `buildWeeklyMealPlan` marks a day a training day when it has lines and
  `isRestDay` is false, so a rest day gets the rest-day calories.
- **The plan hub:**
  - a rest day's card says "Rest day";
  - "Log this workout" shows only on a training day, so a linked workout always points at a
    planned session;
  - the ordinary "Add workout" buttons are unchanged and work on any day.

### Planned versus done

`buildPlanWeek({ plan, workouts, today })`, a pure function, returns the week's seven days and
three counts. It lives in `pages/dashboard/planWeek.js`, and `useDashboardMetrics` calls it.

- **The plan** is the newest one, `dashboard.plans[0]`, read through `readPlan`.
  - A weekday is planned when one of its days is not a rest day.
  - A weekday before the local date the plan was saved on is not planned: a plan saved on
    Thursday never shows Monday as missed.
- **Each day's state:**
  - `rest` when it is not planned;
  - `done` when it is planned and has a workout, by the decided rule:
    - one linked to a day of this plan with that weekday, dated in this week;
    - or one with no link, dated on that day.

    A workout linked to an older plan counts for neither;

  - `missed` when it is planned, before today, and not done;
  - `today` when it is planned, today, and not done;
  - `upcoming` when it is planned and after today.
- **The counts:** planned, done and missed. With no plan, the function returns null and the
  summary shows nothing new.
- **The summary's weekly card** shows "3 of 4 planned days done · 1 missed" and a row of
  seven day labels, each with its state as text, not colour alone. Existing classes are used
  where they fit; a new rule needs the screenshot proof `CLAUDE.md` requires.

### Target weight

- **The server:**
  - `defaultGoals()` drops `targetWeight`, so sign-up stores none;
  - `buildDashboard` answers `targetWeight: null` for an absent or out-of-range target. The
    other two goals keep their defaults;
  - migration `005_clear_default_target_weight.sql` removes `targetWeight` from every
    account's goals that equal `{"targetWeight": 160, "targetCalories": 2200,
"weeklyWorkouts": 3}` exactly. Equality on `jsonb` ignores key order.
- **Deploy order:** the Deploy workflow migrates before it deploys. Until the new code
  starts, the old `buildDashboard` reads an absent target as 160, as it does today. An
  account created in that window keeps 160 stored.
- **The client:**
  - the client's empty dashboard (`app/dashboard.js`) and the goals form's initial value
    (`App.jsx`) hold no target. The form is filled with `""` for a null target and shows
    160 as a placeholder, so saving only the calories leaves the target unset;
  - the goals view's header says "Target weight: not set";
  - the summary's weight block shows, in order of what is known:
    - no target: "Set a target weight", with a button to the goals view;
    - a target but no weight logged: "Log a weight to see progress";
    - otherwise: the latest weight, the target and the pounds to go, with a bar from the
      first weight logged. It works for gaining as well as losing, and reads "Target
      reached" once the latest weight is at or past the target;
  - the "0 lb" fallback goes.
- **Absent is not zero.** A missing weight or target reads as absent through
  `toNumberOrNull`. A new numeric helper gets a row in the numeric-coercion contract tests.

## PRs

1. The spec and plan.
2. Rest days: `isRestDay`, the meal plan and the plan hub.
3. The target weight on the server, with migration 005.
4. Planned versus done and the weight block on the summary, and the client's handling of an
   absent target.
5. A floor PR per side, only if a truncated figure rose.

## Testing

- **Rest days:**
  - on the eight fixtures, read through `import.meta.glob` as the Phase 4 contract test
    does, the training days of each equal the number in its file name;
  - the cases of finding 3 stay training days, and the forms of finding 2 are each a rest
    day;
  - the meal plan gives a rest day the rest-day calories;
  - the plan hub labels a rest day and offers no "Log this workout" on it.
- **The target weight, against live Postgres:**
  - a new account stores no target, and its dashboard answers null;
  - a saved target is answered, and an out-of-range stored one reads as null;
  - the migration clears the target from goals exactly at the defaults, and leaves goals
    with any other value, in any key order, untouched.
- **Planned versus done,** with the clock pinned:
  - each state, on the week's first and last day;
  - a linked workout counts for its day whatever its date in the week, and not when dated
    last week;
  - an unlinked workout counts for its date's day only;
  - a workout linked to an older plan counts for nothing;
  - a plan saved mid-week leaves the days before it unplanned;
  - no plan gives null.
- **The weight block:** each of its states, with null, `""` and absent weights and targets
  reading the same.
- **Mutation:** every new guard, each mutation confirmed applied.

## Out of scope

- History before this week. B4 reads four weeks of adherence on the server and can move this
  logic there.
- Changes to the weekly-workouts goal or its progress bar.
- Marking rest days in the saved structure, or asking the model to (B5).
