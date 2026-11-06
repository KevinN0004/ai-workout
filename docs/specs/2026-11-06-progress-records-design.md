# Progress: records, e1RM and weekly sets, design

Status: **decided 2026-11-06**, section by section with the owner; **applied 2026-11-06** in
#355 to #357, with the client floors raised in #358, all live. The plan is
`docs/plans/2026-11-06-progress-records.md`, whose status says where the work went past
this text. This is roadmap B2, the first reader of the sets B1 stores.

B1 records each set of a workout. B2 turns those sets into the progress a lifter checks:
how many hard sets each muscle group got this week, the best estimated one-rep max (e1RM)
for each lift, and the records each lift has set. This spec decides what each number
means, where it is worked out, and where it is shown.

## What was found

Read on `8f99904`.

1. **The client already holds the sets.** The dashboard read returns up to 500 sessions,
   each with its `exerciseSets` (B1, kept there by the owner's decision of 2026-11-05).
2. **The library knows each exercise's movement pattern, not its muscles.**
   `EXERCISES` (`server/src/services/planning/exerciseLibrary.js`) gives each of its 157
   entries one of 13 patterns. All 157 names are distinct ignoring case, so a name maps to
   at most one pattern (checked).
3. **The client cannot load the library.** It is server source, and the client may import
   server modules only in tests (CLAUDE.md).
4. **A logged name is free text.** A plan day pre-fills library names (B1), but a name
   typed by hand may match nothing.
5. **Logs is lazy-loaded** (`WorkoutsView`, its own chunk), so a panel there does not grow
   the main bundle, which is 462.5 kB after #353.
6. **The phone's bottom bar already holds five items**, the most the navigation guidance
   allows.

## Decisions

Made with the owner on 2026-11-06:

- **Volume is hard sets per muscle group per week**, not tonnage. Weekly set counts are the
  dose the evidence on muscle growth measures, and they work for bodyweight and holds.
- **Every loaded lift of 1 to 10 reps gets an e1RM**, per exercise name. No list of main
  lifts to keep.
- **A record is the best e1RM and the heaviest set per lift**, and for a bodyweight lift the
  most reps in one set. A session that sets one is marked "PR" in Logs.
- **It lives in a Progress panel in Logs**, above the workout log.
- **The client computes; the server tags each logged exercise with its library pattern.**

## Design

### The server's tag

`mapWorkoutSession` (`server/src/repositories/workoutSessionRepository.js`) adds `pattern`
to each exercise in `exerciseSets`: the library pattern of the entry whose name matches,
ignoring case and surrounding space, or `null` for a name the library does not hold. The
lookup is a map from lower-cased name to pattern, built once from `EXERCISES`. Nothing is
stored: the tag is worked out on every read, so a library change reaches old sessions too.

### Muscle groups

| Group             | Patterns                           |
| ----------------- | ---------------------------------- |
| Legs              | `squat`, `single-leg`              |
| Posterior chain   | `hinge`, `glutes-calves`           |
| Chest & shoulders | `horizontal-push`, `vertical-push` |
| Back              | `horizontal-pull`, `vertical-pull` |
| Core              | `core`                             |
| Arms              | `arms`                             |

`conditioning`, `mobility` and `balance` are not hard sets and count toward no group. A set
whose exercise has no pattern counts toward one line, "Not sorted", so that nothing logged
vanishes from the count.

### The arithmetic

A pure module, `client/src/pages/dashboard/progress.js`, works from the sessions Logs
holds: the dashboard read's, and any optimistic entry not yet saved.

- **Weekly sets.** Every logged set of a counted group, in weeks that start on Monday, by
  the session's date. Shown as this week's count against the average of the four weeks
  before it, to one decimal.
- **e1RM.** Epley: `load × (1 + reps / 30)`, for a set with a load above 0 and 1 to 10 reps.
  A single rep's e1RM is its load. Past 10 reps the estimate is unreliable, so those sets
  have none.
- **Lifts.** Sets are grouped by exercise name ignoring case and surrounding space, and a
  lift is shown under its most recent spelling.
- **Records, per lift.**
  - The best e1RM, with its date.
  - The heaviest set: its load and reps, the greater reps winning a tie of load.
  - For a bodyweight lift, one with no set carrying a load above 0, the most reps in one
    set.
  - Each record's change since four weeks before today: the record then against the record
    now, shown only when both exist and they differ.
- **PR marks.** Sessions are walked in date order, then save order. A session is marked when
  one of its sets beats every earlier session's best e1RM, heaviest set or bodyweight reps
  for that lift. A lift's first session sets no PR: there is nothing earlier to beat.
- **Absent is not zero.** A missing load is no load, never 0 kg, and a set without an RPE
  still counts toward volume. Every numeric reader in the module guards absent input first,
  and gets a row in the client numeric-coercion contract.

### The panel

In `WorkoutsView`, a section headed "Progress" above the workout log:

- **This week's sets:** a table with a row per group, holding the group, this week's count
  and the four-week average ("Legs 12, avg 10.0"). A group with no sets in either period is
  left out, and "Not sorted" comes last when it has sets. It is a real `<table>` with
  column headers.
- **Records:** a row per lift, most recently trained first, eight shown and "Show all" for
  the rest. For example: "Barbell back squat: e1RM 112 kg (up 4 kg), heaviest 100 kg × 4",
  or "Pull-up: most reps 12". Loads are shown in the region's unit (`fromLoadKg`). A line
  under the list reads "e1RM is estimated from sets of 1 to 10 reps (Epley)."
- **PR tags:** a session that set a record shows a "PR" tag by its date in the workout log,
  with a hidden label naming the record, for example "personal record: Barbell back squat,
  heaviest set".
- **Empty:** "Log a workout with sets to see your progress here."

## PRs

One at a time, merged only when CLEAN, with main's CI and Deploy watched before the next:

1. **Docs**: this spec and the plan.
2. **Server tag**: `pattern` on each logged exercise, and its tests. The server ships before
   any client reads it.
3. **The arithmetic**: `progress.js` and its hand-worked fixtures.
4. **The panel and the PR tags**: with unit tests, an axe scan, a screenshot compare and the
   E2E check below.
5. **Floors**: one PR per side whose figure rose.

## Testing

- **TDD throughout**, with each mutation confirmed applied and each file restored (ADR 0015).
- **Server**: a library name tags with its pattern, in any case and with surrounding space;
  a typed name tags `null`; the tag reaches the dashboard read and the save's answer.
- **The arithmetic, against hand-worked numbers**: the Epley values, the 1-rep case, the
  10-rep edge and 11 reps excluded, 0 kg and missing loads, ties of heaviest load, the
  Monday week boundary, the four-week average, name grouping in any case, the most recent
  spelling, the four-week change, and PR marking in date order with a lift's first session
  setting none.
- **The panel**: the table's rows and order, the records' order and "Show all", the PR tag
  and its label, the empty state, and loads in pounds under an imperial region.
- **Accessibility and layout**: an axe scan of Logs with the panel filled, and a screenshot
  compare with written expectations.
- **E2E**: `plan.spec.js` logs the squat as in B1 (12, 11 and 10 reps, 30 lb on the first),
  then finds the Progress panel showing its heaviest set (30 lb × 12) and no e1RM for it, as
  12 reps is past the window.
- **Coverage**: `test:coverage` with json-summary on both sides, the server measured with
  `client/dist` present. Server function and line slack are under one, so every server
  function added ships with its test.

## Out of scope

- **Records over every session ever logged.** The panel reads the sessions Logs holds, up to
  500; a server route over all history waits until an account needs it.
- **Charts of e1RM over time.** The four-week change is the trend this spec shows.
- **Tonnage**, and **a rep-max table** per lift.
- **Mapping typed names to a group** by keywords. They count under "Not sorted".
- **Progression from these numbers**: B4.
