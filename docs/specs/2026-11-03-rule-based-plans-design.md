# Rule-based plans, design

Status: **decided 2026-11-03**, nothing applied. The plan is
`docs/plans/2026-11-03-rule-based-plans.md`. This replaces the rest of roadmap B3 as
`docs/specs/2026-11-03-plan-quality-evals-design.md` planned it: its scorers stay, as the
gate below, and its live eval run goes.

The owner wants workouts chosen by an algorithm of the app's own instead of by Gemini. This
spec sets out the algorithm's rules, which the owner reviewed, the exercise library they
choose from, what Gemini still does, how the plan's quality is gated, and what changes on
the roadmap.

## What was found

Read on `ef481e8`.

1. **Gemini writes the whole plan.** `POST /api/generate` (`server/src/routes/generateRoutes.js`)
   sends the planner form to Gemini through `planPromptService.js`, and parses the text it
   returns into days and notes with `buildPlanPayload`. It saves both, and answers
   `{ plan, payload, savedPlan }`.
2. **Everything downstream reads that text format, and nothing else.** The plan views, the meal
   plan, plan-day logging and planned versus done read the saved payload's days, each a
   weekday heading and its lines. `isRestDay` (`client/src/app/plans.js`) tells a rest day by
   its opening main entry, and the notes are the lines under `Coach Notes:`. A plan written in
   that format by any other means needs no change downstream.
3. **Generation fails without Gemini.** With no key the route answers 500. A timeout is a 504,
   and a cut-off, empty or over-long answer is a 502. The client waits 40 seconds
   (`GENERATE_TIMEOUT_MS`, `client/src/app/events.js`), sized to the server's 30-second
   `GEMINI_TIMEOUT_MS`.
4. **The E2E suite leaves generation out** only because it needs a real key
   (`e2e/README.md`). So P5's and P6's plan features have never run end to end.
5. **B3's scorers check exactly what an algorithm must guarantee.** `scripts/evals/scorePlan.mjs`
   finds structure breaks, equipment the profile lacks, and lines risky for a named injury,
   using the app's own parser, rest-day rule and `detectInjuryFlags`. On Gemini's plans they
   found 13 injury hits and 2 equipment hits across eight profiles.
6. **The injury keywords live in client code.** `injuryKeywordRules` and its name forms are in
   `client/src/pages/dashboard/tips/recommendationUtils.js`, which server code cannot import.
   The repository's pattern for a rule both sides need is one copy on the server and a client
   contract test that imports it and asserts equality (`app/__tests__/constants.test.js`).
7. **The goal, level and injuries arrive as free text.** The planner offers fixed options
   (`client/src/app/constants.js`), but `/api/generate` accepts any cleaned string, up to 120,
   40 and 140 characters.

## Decisions

Decided by the owner on 2026-11-03:

- **The rules are designed here and reviewed by the owner,** as set out below. Rules the owner
  supplies, and a minimal template-only first version, were offered and not chosen.
- **Gemini writes the coach notes only.** Removing it entirely, and keeping it as a fallback
  for the whole plan, were offered and not chosen.
- **The exercises come from a curated library in the repository.** The wger catalogue, and a
  curated library linked to wger, were offered and not chosen.
- **The design as presented,** including the strict injury rule: an injury excludes every
  exercise tagged as stressing it and every exercise whose name holds one of its keywords.
  The softer rule, which keeps safe regressions such as box squats for a knee, was offered and
  not chosen.

Settled in this spec:

- **The algorithm runs on the server,** as pure functions with no I/O, so it can move to the
  client later (C1) without a rewrite.
- **The same form always gives the same plan.** No randomness, so every rule is testable and a
  regression shows as a diff.
- **A plan never fails because of Gemini.** Rule-written notes stand in whenever the notes call
  cannot be used.

## Design

### The exercise library

`server/src/services/planning/exerciseLibrary.js`, about 100 entries, each:

- `id`, kebab-case and unique; `name`, as the plan shows it;
- `pattern`, one of `squat`, `hinge`, `horizontal-push`, `vertical-push`, `horizontal-pull`,
  `vertical-pull`, `single-leg`, `glutes-calves`, `core`, `arms`, `conditioning`, `mobility`;
- `needs`, the capabilities it requires, all of them (an empty list is bodyweight);
- `level`, the lowest level it suits: `beginner`, `intermediate` or `advanced`;
- `stresses`, the injuries it loads, from `lower back`, `back`, `knee`, `shoulder`, `hip`,
  `wrist`, `elbow`.

The order within a pattern is its priority: the first eligible entry is the default choice.

**Capabilities** are `dumbbell`, `kettlebell`, `barbell`, `bench`, `band`, `pull-up bar`,
`cable`, `machine`, `cardio machine` and `pool`. Each planner label supplies the ones the
scorers' table credits it with (`scorePlan.mjs`): `Dumbbells` supplies `dumbbell`,
`Strength floor` supplies `barbell`, `dumbbell`, `kettlebell`, `bench`, `pull-up bar` and
`machine`, `Full gym access` supplies all of them, and so on. A label the map does not know
supplies nothing, and no label is needed for bodyweight work or a mat.

### The injury rules, shared

`server/src/services/planning/injuryRules.js` holds `injuryKeywordRules`, the name forms, the
penalties, `coveredBy`, `detectInjuryFlags` and `buildInjuryText`, moved from
`recommendationUtils.js`. The Guides view keeps its copy, and a client contract test asserts
that the two are equal, so they cannot drift.

### The generator

`server/src/services/planning/generatePlan.js` exports `generatePlan(form)`, which returns the
plan's text in the format of finding 2, without notes. The steps:

1. **Read the form.**
   - **The goal's track:** each of the five goal options maps to its own track. Free text maps
     by its words: fat or loss to fat loss, cardio, endurance or run to cardio, mobility,
     recovery, and anything else to lean strength.
   - **The level:** Beginner, Intermediate or Advanced, ignoring case, else Intermediate.
   - **The injuries:** `detectInjuryFlags(buildInjuryText(injuries, ""))`.
   - **The equipment:** the capabilities its labels supply. "Commercial" reads the commercial
     labels, and any other environment the home labels.
2. **Choose the training weekdays:**

   | Days | Training weekdays                     |
   | ---- | ------------------------------------- |
   | 1    | Wednesday                             |
   | 2    | Monday, Thursday                      |
   | 3    | Monday, Wednesday, Friday             |
   | 4    | Monday, Tuesday, Thursday, Friday     |
   | 5    | Monday to Wednesday, Friday, Saturday |
   | 6    | Monday to Saturday                    |
   | 7    | every day                             |

3. **Choose each training day's type, in order:**
   - 1 to 3 days are full body, as A, B, A.
   - 4 days are upper, lower, upper, lower.
   - 5 days are upper, lower, conditioning, upper, lower.
   - 6 days are push, pull, legs, push, pull, legs.
   - 7 days are the six, then mobility.

   Then:
   - **A fat loss or cardio track,** or a Weight Loss or Cardio focus, makes one strength day
     conditioning: the third of 4 days, and the fourth of 6 or 7. Five days have one already,
     and 1 to 3 days keep every strength day and get the longer finisher instead.
   - **A Mobility or Recovery focus** makes the last strength day mobility, for 3 to 6 days.
     Seven days have one already.
   - **A mobility or recovery track** makes every training day mobility.

4. **Fill each day's slots:**

   | Day type     | Slots, in order                                                            |
   | ------------ | -------------------------------------------------------------------------- |
   | Full body    | squat, hinge, horizontal-push, horizontal-pull, core, single-leg, arms     |
   | Upper        | horizontal-push, vertical-pull, vertical-push, horizontal-pull, arms, core |
   | Lower        | squat, hinge, single-leg, glutes-calves, core                              |
   | Push         | horizontal-push, vertical-push, horizontal-push, arms, core                |
   | Pull         | vertical-pull, horizontal-pull, horizontal-pull, arms, core                |
   | Legs         | squat, hinge, single-leg, glutes-calves, core                              |
   | Conditioning | conditioning, conditioning, core, conditioning                             |
   | Mobility     | mobility, mobility, mobility, core, mobility                               |
   - **How many slots fill** follows the duration: `clamp(floor((minutes - 10) / 8), 2, 8)`
     exercises, from the first slot. Past a day type's slot list, its list repeats from the top.
   - **The first two filled slots are the main lifts,** and the rest are accessories.

5. **Choose an exercise for each slot.** The first library entry of the slot's pattern that:
   - **needs only capabilities the form supplies;**
   - **suits the level:** its level is at or below the form's;
   - **stresses no flagged injury,** and whose name holds no keyword of a flagged injury;
   - **has not been used this week,** if any other entry fits, so A and B days differ and two
     slots of one pattern on a day differ.

   A slot nothing fits is left out. It is never filled with an exercise that breaks a rule.

6. **Write the prescription by track:**

   | Track                         | Main lifts          | Accessories         | Finisher                    |
   | ----------------------------- | ------------------- | ------------------- | --------------------------- |
   | Lean strength                 | 3 x 8-10, rest 90s  | 3 x 10-12, rest 60s | 5 minutes of conditioning   |
   | Lean strength, Strength focus | 4 x 5, rest 120s    | 3 x 8-10, rest 90s  | 5 minutes of conditioning   |
   | Fat loss                      | 3 x 12-15, rest 45s | 3 x 15, rest 45s    | 10 minutes of intervals     |
   | Cardio                        | 2 x 15-20, rest 30s | 2 x 20, rest 30s    | 15 minutes of steady cardio |
   | Mobility or recovery          | 2 x 45 seconds      | 2 x 45 seconds      | 5 minutes of easy breathing |
   - **A beginner** does one set fewer, never below 2.
   - **An advanced lifter** does one set more on the main lifts.
   - **Conditioning slots** are timed, such as 6 rounds of 40 seconds on and 20 off, by track.

7. **Write the day,** in the format the parsers read:

   ```text
   Monday - Full body A
   Warmup: 5 minutes - <the day type's warmup>.
   Main lifts:
   - <exercise>: 3 x 8-10 (Rest 90s)
   Accessories:
   - <exercise>: 3 x 10-12 (Rest 60s)
   Finisher/conditioning:
   - <finisher>
   ```

   A rest day is `Rest day. Optional: a 20-minute easy walk.` on the line under its weekday, so
   `isRestDay` reads it as rest. A mobility day opens its main lifts with a mobility exercise,
   so it reads as a training day.

### The coach notes

- **The route asks Gemini for the notes only.** The system instruction asks for three to five
  short coaching notes on progression, recovery and the stated goal and injuries, as plain
  lines. The message holds the generated plan, which is the app's own text, and the client
  data, fenced as today.
- **It accepts the answer** when it finished and has text. The lines are trimmed, a leading
  `Coach Notes:` label and empty lines are dropped, and at most 8 lines of 300 characters each
  are kept.
- **Rule-written notes** stand in when there is no key or no client, or the call fails, times
  out, is cut off or comes back empty: a progression line, a line per flagged injury saying the
  plan leaves out exercises that load it and to stop anything that hurts, a recovery line, and
  a line for the track. `buildFallbackNotes(form)` writes them, and is pure.
- **The limits change with the job.** `GEMINI_MAX_OUTPUT_TOKENS` defaults to 1,024 and
  `GEMINI_TIMEOUT_MS` to 8,000. `GEMINI_MAX_PLAN_CHARS` is retired, since the plan text is the
  app's own. The client's wait drops to 20 seconds.
- **The log says which notes a plan got,** as `generate_notes` with `source: "gemini"` or
  `"rules"` and the reason. The saved plan and the answer are unchanged in shape.

### The route

`/api/generate` keeps its validation, defaults, rate limits, save and prune. It:

1. builds the text with `generatePlan`;
2. gets the notes, from Gemini or the rules;
3. appends `Coach Notes:` and the notes;
4. parses the whole with `buildPlanPayload`, so the text and the payload agree by
   construction.

It answers 200 for every valid request. The 500 for a missing key, the 504 and the three 502s
go, with their tests.

### The quality gate

`scripts/evals/__tests__/generatePlan.gate.test.mjs`, in `npm test`, scores `generatePlan`'s
output, with the rule-written notes, and requires every training day to hold at least two
exercises, for:

- **Equipment:** every environment, with each label alone, no label, and all labels.
- **Days and injuries:** 1 to 7 days, and each injury option.
- **Goals and levels:** each goal option, and each level.

That comes to about 12,000 plans. A smaller sweep covers the focuses and the durations 15, 45,
90 and 180. Every plan must have **zero structure breaks, zero equipment hits and zero injury
hits.** The gate is absolute, because the generator is deterministic.

The scorers stay as they are. They are the independent check, because the generator's library
tags and the scorers' word table are kept apart on purpose. So the gate also catches a library
entry whose name names equipment its tags do not need.

`scripts/evals/run.mjs`, its tests, the `plan-evals.yml` workflow, `reference.json` and the root
`@google/genai` devDependency go, and so does the `GEMINI_EVAL_API_KEY` secret's purpose. The
eval profiles stay, as the gate's named cases.

## Roadmap changes

Applied in one republish of the roadmap page after this phase merges:

- **B3** becomes "Rule-based plans, gated": this spec.
- **B5 (Gemini JSON output), D2 (swappable LLM provider) and D5 (on-device AI spike)** are
  dropped, since the plan no longer comes from a model and only its notes use one. M2 no longer
  needs B5.
- **B4 (plans that adapt to your history)** keeps its rules, now as rules in `generatePlan`
  that read the last four weeks.
- **C4 (exercise swaps)** filters on the library's tags, and drops pgvector.

## PRs

1. The spec and plan.
2. The injury rules moved to the server, with the client contract test.
3. The exercise library and its tests.
4. `generatePlan` and `buildFallbackNotes`, gated by the scorers.
5. The route switched to the generator, with Gemini notes and the fallback; the prompt
   rewritten for notes; the env defaults, `GEMINI_MAX_PLAN_CHARS`, the client's wait and the
   docs updated.
6. The live eval runner and its workflow retired.
7. The roadmap republish.
8. A floor PR per side, only if a truncated figure rose.

## Testing

- **The library:**
  - every id is unique;
  - every pattern, capability, level and injury is from its list;
  - every pattern but `vertical-pull` and `arms` has a bodyweight beginner entry, so a
    bodyweight-only plan fills those slots unless an injury rules them out;
  - no entry's name holds a keyword of an injury its `stresses` leaves out.

  The last rule makes the strict rule and the tags agree, and the gate checks it again.

- **The injury rules:** the moved tests, and the client contract test.
- **The generator,** with the tables above as cases:
  - each weekday pattern and each day-type sequence;
  - each focus and track swap;
  - the slot count at the durations' edges;
  - each choice rule, with an entry that breaks it skipped;
  - the variant rotation;
  - a slot left out when nothing fits;
  - each prescription row, the level adjustments, and the written format.

  Also: the same form gives the same text, and every generated plan parses to the requested
  number of training days by `isRestDay`.

- **The notes:** Gemini's answer accepted and trimmed; each fallback reason; the fallback
  lines per injury and track; the log line.
- **The route:** a plan with no key at all; the notes call's config; the saved payload equal to
  the parse of the answer's text.
- **The gate,** as above.
- **Mutation:** every rule, each mutation confirmed applied.

## Out of scope

- **An E2E test that generates a plan.** Generation will work without a key, so P5 and P6 can
  finally run end to end; that is its own follow-up.
- **History-aware rules (B4).**
- **Exercise images or wger links.**
- **Changing the planner form,** or the brand line "Personalized AI Training Hub".
