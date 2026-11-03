# Plan-quality evals (roadmap B3), design

Status: **decided 2026-11-03; PRs 2 to 4 applied (#326 to #328), then superseded in part the
same day** by `docs/specs/2026-11-03-rule-based-plans-design.md`. Plans are now built by rules
and only their notes come from Gemini, so the scorers below gate the generator in `npm test`,
and the live run, its workflow and the first reference (PR 5) are retired or cancelled. The
plan is `docs/plans/2026-11-03-plan-quality-evals.md`.

The roadmap's B3 asks for a fixed set of profiles (injuries, home and commercial gyms, 2 to 6
days) run through generation from a manual GitHub Actions workflow, with the key as a secret.
Each plan is scored for structure from the plan payload, for equipment outside the listed
capabilities, and for injury conflicts using the existing `detectInjuryFlags`, and the scores
are kept per model and prompt version. The September spec kept prompt changes out because
nothing here could verify their effect, and B4, B5 and D2 all change the prompt or the model.
This spec settles what is scored, what fails a run, where scores are kept and how the eval
sends exactly what production sends.

## What was found

Read on `7acfa8e`.

1. **The prompt is built inside the route handler.** `SYSTEM_INSTRUCTION`, the equipment
   capability maps, the client-data block and the default model (`gemini-3.5-flash-lite`) all
   sit in `server/src/routes/generateRoutes.js`. Only `buildGenerationEquipmentContext` is
   exported. Anything outside the route that wants the production prompt would have to copy
   it, and a copy drifts.
2. **The checks B3 needs already exist, on both sides.** `buildPlanPayload`
   (`server/src/services/dashboard/planPayloadService.js`) gives the days and notes,
   `isRestDay` (`client/src/app/plans.js`) tells a rest day apart, and `detectInjuryFlags` with
   `buildInjuryText` (`client/src/pages/dashboard/tips/recommendationUtils.js`) give the risky
   keywords for an injury answer. Nothing checks equipment against a plan's text: the
   equipment map in `recommendationUtils.js` holds wger name fragments, and its `row`
   fragment, for rowing machines, would also match every dumbbell row.
3. **Plain Node cannot load `recommendationUtils.js`.** It imports `../wordMatch` with no
   extension, which Vite resolves and Node does not. `plans.js` and the server modules load
   as they are.
4. **Today's prompt passes structure on all eight saved plans.** Scored with the checks below,
   the eight Phase 4 plans (`server/src/services/dashboard/__tests__/fixtures/plans/`) each have
   the seven weekdays in order and coach notes, and each has exactly as many training days as
   its profile asked for.
5. **Injury keyword hits are common, and most are adaptations.** The four injured plans have
   13 hits: knee 5, wrists and elbows 6, lower back 1, hip 1. Most are the safe versions a
   coach would choose: box squats for a knee, "No-Jump" burpees, a floor press "with wrists
   stacked". So the keyword check is a rough signal: a rule of zero hits would fail today's
   prompt, and the check is useful only to compare one run with another.
6. **Equipment hits are rare.** With the table below, one plan of eight has any: the strength
   floor and cardio deck profile gets cable rows, and bands in a warmup, which neither area
   lists. That is 2 hits.
7. **One of eight Phase 4 calls timed out** at `GEMINI_TIMEOUT_MS` and was retried
   (`docs/specs/2026-11-02-structured-plans-design.md`). Across 30 calls a run would expect
   several timeouts, which say nothing about the prompt.
8. **The users' daily cap is on the route.** `GENERATE_DAILY_LIMIT` is enforced by the rate
   limiters on `/api/generate` (`server/src/index.js`), so a runner that calls Gemini directly
   never spends it.
9. **The root workspace does not declare `@google/genai`.** It is a server dependency, hoisted
   to the root `node_modules`, so a root script that imports it runs, and knip reports it as
   unlisted.

## Decisions

Decided by the owner on 2026-11-03:

- **A separate eval key.** The workflow reads a new repository secret, `GEMINI_EVAL_API_KEY`,
  made in a Google project of its own, so eval runs never spend production's quota. Reusing
  the production key was offered and not chosen.
- **Structure, plus no worse.** A run fails on any structure break, or when its injury or
  equipment hits rise above the committed reference by more than the margin below. Reporting
  only, and failing on any hit, were offered and not chosen.
- **A committed reference, and artifacts.** Every run uploads its scores as a workflow
  artifact. A run adopted as the reference is committed through an ordinary PR. Artifacts
  only, and a workflow that opens its own PR, were offered and not chosen.
- **Ten profiles, three plans each:** 30 calls a run. One plan per profile, and the eight
  Phase 4 profiles once each, were offered and not chosen.

Settled in this spec:

- **The eval lives in `scripts/evals/`.** It needs server and client modules both, and
  `scripts/` is the repository's tooling, linted and tested by `test:scripts`.
- **The prompt version is a hash, not a number.** A number has to be remembered at every
  wording change; a hash of the text cannot be forgotten.
- **A failed call is retried once.** A timeout or an API error says nothing about the prompt
  (finding 7). A call that fails twice makes the run incomplete, which fails it, reported
  apart from structure breaks. A plan cut off at the token cap is not retried: it is a
  structure break, since a longer prompt or a wordier model causes it.

## Design

### The prompt, shared

`server/src/services/dashboard/planPromptService.js` takes from the route, unchanged:

- `SYSTEM_INSTRUCTION`;
- the two capability maps and `buildGenerationEquipmentContext`;
- `DEFAULT_GEMINI_MODEL`, `"gemini-3.5-flash-lite"`;
- `buildPlanPrompt(fields, fence)`, which returns the client-data block the route builds today
  from the defaulted fields and the fence tag.

The route keeps the validation, the defaults, the fence draw, the call, its checks and the
save, and calls the module for the text. This is a move with no change in behaviour: the
route's tests, which assert the prompt and the system instruction it sends, pass unchanged.

### The scorers

`scripts/evals/scorePlan.mjs` exports `scorePlan(profile, outcome)`. `outcome` is a call's
result: its text and finish reason, or the failure. It returns:

- **`structure`**, a list of breaks, empty when none:
  - `failed`, the call failed twice;
  - `truncated`, it stopped at the token cap;
  - `empty`, its text is blank;
  - `oversized`, its text is over the route's 20,000-character default;
  - `weekdays`, the payload's days are not Monday to Sunday, once each, in order;
  - `notes`, the payload has no notes;
  - `training-days`, the days `isRestDay` calls training days differ in number from the
    profile's.
- **`injuryHits`**: each plan line, on any day, holding a keyword of a flag that
  `detectInjuryFlags(buildInjuryText(profile.injuries, ""))` raises, counted once per line and
  flag. This is how `scoreExercise` counts a conflict, matching by substring.
- **`equipmentHits`**: each plan line, on any day, naming equipment that none of the profile's
  labels supplies, counted once per line and word, from this table (labels lower-cased):

  | Word                                                                                                   | Supplied by                                                                                               |
  | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
  | barbell, BB                                                                                            | full gym access, strength floor                                                                           |
  | dumbbell, DB                                                                                           | dumbbells, full gym access, strength floor, functional training zone, group class studio                  |
  | kettlebell, KB                                                                                         | kettlebell, full gym access, strength floor, functional training zone, group class studio                 |
  | bench                                                                                                  | adjustable bench, full gym access, strength floor                                                         |
  | band, banded                                                                                           | resistance bands, full gym access, functional training zone, group class studio, recovery & mobility zone |
  | pull-up, chin-up, hanging                                                                              | pull-up bar, full gym access, strength floor, functional training zone                                    |
  | cable                                                                                                  | full gym access, functional training zone                                                                 |
  | machine (not "rowing machine"), Smith, leg press                                                       | full gym access, strength floor                                                                           |
  | treadmill, elliptical, rower, rowing machine, stationary, air, assault or spin bike, erg, stair master | full gym access, cardio deck                                                                              |
  | swim, swimming, pool, aqua, aquatic                                                                    | full gym access, pool / aquatic center                                                                    |

  Words match whole and ignore case. The suppliers follow the capability lines the prompt
  sends: racks on the strength floor and bodyweight stations in the functional zone count as
  somewhere to do a pull-up. Bodyweight work and a mat are never hits.

`scripts/evals/summarize.mjs` exports `summarize(scores)` and `compare(run, reference)`:

- **`summarize`** totals each profile's three plans and the run: structure breaks, injury
  hits, equipment hits.
- **`compare`** fails a run with any structure break or failed call, and fails it when its
  total injury hits, or its total equipment hits, exceed the reference's by more than the
  margin: the larger of 3 hits and 25% of the reference. So a reference of 13 allows up to 16,
  and a reference of 2 allows up to 5. With no reference, only structure gates.

### The profiles

`scripts/evals/profiles.mjs`: ten profiles, each with every field the planner sends.

- The eight Phase 4 profiles, as captured: Home and Commercial, 1 to 7 days, every injury
  option and none.
- **A bodyweight-only home plan for 5 days with a knee injury,** which tests the equipment
  check on pull-ups.
- **A full-gym plan for 4 days with a shoulder injury.**

| Name                                  | Goal                           | Environment | Equipment                                       | Level        | Days | Minutes | Injuries    | Focuses               |
| ------------------------------------- | ------------------------------ | ----------- | ----------------------------------------------- | ------------ | ---- | ------- | ----------- | --------------------- |
| `01-home-bodyweight-3d`               | Build lean strength and energy | Home        | Bodyweight only                                 | Beginner     | 3    | 30      | None        | Strength              |
| `02-commercial-full-5d`               | Build lean strength and energy | Commercial  | Full gym access                                 | Intermediate | 5    | 60      | None        | Strength              |
| `03-home-dumbbells-4d-knee`           | Fat loss + conditioning        | Home        | Dumbbells, Adjustable bench, Yoga mat           | Intermediate | 4    | 45      | Knee        | Weight Loss, Cardio   |
| `04-commercial-strength-6d-lowerback` | Build lean strength and energy | Commercial  | Strength floor, Cardio deck                     | Advanced     | 6    | 75      | Lower back  | Strength              |
| `05-home-bands-2d-shoulder`           | Mobility                       | Home        | Resistance bands, Yoga mat                      | Beginner     | 2    | 20      | Shoulder    | Mobility, Recovery    |
| `06-commercial-cardio-3d`             | Cardio                         | Commercial  | Cardio deck, Functional training zone           | Beginner     | 3    | 45      | None        | Cardio                |
| `07-home-kettlebell-7d-wrist`         | Fat loss + conditioning        | Home        | Kettlebell, Pull-up bar                         | Advanced     | 7    | 40      | Wrist/Elbow | Weight Loss, Strength |
| `08-commercial-recovery-1d-hip`       | Recovery                       | Commercial  | Recovery & mobility zone, Pool / aquatic center | Intermediate | 1    | 30      | Hip         | Recovery, Mobility    |
| `09-home-bodyweight-5d-knee`          | Build lean strength and energy | Home        | Bodyweight only                                 | Intermediate | 5    | 45      | Knee        | Strength              |
| `10-commercial-full-4d-shoulder`      | Build lean strength and energy | Commercial  | Full gym access                                 | Intermediate | 4    | 60      | Shoulder    | Strength              |

The first eight are the fields the Phase 4 capture sent, so their saved plans are the
scorers' fixtures.

### The run

`scripts/evals/run.mjs`, from the root `npm run eval:plans`:

- For each profile, three times, in order: build the prompt with `buildPlanPrompt` and a fresh
  fence, call Gemini with the route's config (the system instruction, 8,192 output tokens, a
  30-second deadline), and score the outcome. A call that fails is retried once.
- **A pause of 4 seconds between calls,** to stay under the per-minute limit.
- **It reads** `GEMINI_EVAL_API_KEY`, and `EVAL_MODEL` with `DEFAULT_GEMINI_MODEL` as its
  default. It refuses to start with no key.
- **It writes** `scripts/evals/out/<model>--<promptVersion>.json`: the date, the model, the
  prompt version, every plan's text and scores, and the summary. `out/` is git-ignored.
- **It prints** a Markdown table of the summary, which the workflow appends to the job
  summary, and the comparison with the reference. It exits 1 when the comparison fails.
- **The prompt version** is the first 8 hex characters of the sha256 of `SYSTEM_INSTRUCTION`
  and `buildPlanPrompt` for four fixed setups with the fence `"0"`, joined by newlines. One
  profile would hash only the capability lines it selects, so a change to another label's
  capabilities would keep the version. The four between them hold every capability line: a
  home with each label, a home with none, full gym access, and one commercial area.
- **The run's limits are the route's own,** `DEFAULT_MAX_OUTPUT_TOKENS`, `DEFAULT_TIMEOUT_MS`
  and `DEFAULT_MAX_PLAN_CHARS`, which `generateRoutes.js` exports for the evals rather than
  have them copied.
- **The root workspace declares `@google/genai`** as a devDependency at the server's range, so
  knip sees it listed and npm keeps the one copy.

### The workflow

`.github/workflows/plan-evals.yml`:

- **Manual only** (`workflow_dispatch`), with one input, `model`, defaulting to empty, which
  means `DEFAULT_GEMINI_MODEL`.
- **One job,** `contents: read`, a 30-minute timeout: `npm ci`, then `npm run eval:plans` with
  `GEMINI_EVAL_API_KEY` from secrets, then the scores file uploaded as an artifact, whether the
  comparison passed or not.
- It needs no database, no build and no other secret.

### The reference

- **Adopted runs** are committed as `scripts/evals/results/<model>--<promptVersion>.json`, one
  file for each model and prompt pair, copied from the run's artifact.
- **`scripts/evals/reference.json`** names the file for the model and prompt production uses:
  `{ "results": "<file name>" }`. A PR that changes the prompt or `GEMINI_MODEL` runs the eval,
  and once the run is adopted, commits its file and moves the pointer.
- **The first reference is two runs** of today's prompt. The PR that adopts it records both
  runs' totals, so the margin is checked against real variation, and changes it if
  the two runs differ by more.

## PRs

1. The spec and plan.
2. The prompt moved into `planPromptService.js`, with no change in behaviour.
3. The scorers, the summary and the profiles, tested on the eight saved plans, and the one
   import given its extension.
4. The runner and the workflow.
5. The first reference, from two runs, once the owner has added `GEMINI_EVAL_API_KEY`.
6. A floor PR per side, only if a truncated figure rose.

PRs 2 to 4 need no key. PR 5 cannot start until the secret exists.

## Testing

- **The prompt move:** the route's tests pass unchanged, and a new test pins that
  `buildPlanPrompt` returns the lines the route sent before the move, for a full profile.
- **The scorers,** in `scripts/evals/__tests__/`, run by `test:scripts`:
  - on the eight saved plans, structure has no break, injury hits are 5, 1, 6 and 1 on the
    injured profiles and 0 on the rest, and equipment hits are 2 on the strength-floor
    profile and 0 on the rest;
  - each structure break, from a plan built to have it;
  - each equipment word, supplied and not supplied, and "rowing machine" not counted as a
    machine;
  - a line with two keywords of one injury is one hit, and a line hitting wrist and elbow is
    two.
- **The summary and comparison:** at the margin's edge on both sides, with and without a
  reference, and with a failed call.
- **The runner,** with the Gemini client stubbed: a retry after one failure, a failed call
  after two, a cut-off plan not retried, the prompt version unchanged for the same text and
  changed by one character, and no start without a key.
- **Mutation:** every new guard, each mutation confirmed applied.
- **Not in the unit suite:** a live call. The workflow is proved by its first run in PR 5.
- **Coverage:** the server's floors cover the moved module. Files under `scripts/` are outside
  both coverage configs, so mutation is their measure.

## Out of scope

- A model grading a model. The roadmap's risk note keeps rule-based checks as the gate.
- Running the eval in CI, on a schedule or on every PR.
- A provider interface (D2) and JSON output (B5), which will run this eval.
- History fixtures for B4, which adds them.
- Changing the prompt. B3 only measures it.
