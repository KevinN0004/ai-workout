# Rule-based plans, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plans are chosen by the app's own evidence-checked rules from a curated exercise
library, and Gemini writes only the coach notes. Rule-written notes stand in when Gemini
can't, and the safety lines are always rule-written. A short health screen and the profile's
age adjust the plan. B3's scorers gate every generated plan in `npm test`.

The work is one spec PR, six code PRs and the roadmap republish, then a floor PR per side
only if a figure rose.

**Design:** `docs/specs/2026-11-03-rule-based-plans-design.md`, with its evidence review
`docs/specs/2026-11-03-rule-based-plans-evidence.md`. The rules, tables, sources and decisions
are not repeated here.

**Tech Stack:** Express 5, React 19, `@google/genai` 2.31, Vitest 5 with v8 coverage,
supertest, Testing Library, Node 24, GitHub Actions, gh CLI.

**Status: done 2026-11-04** (#329 to #336, all live; main `a829396`). Task 7 shipped before
Task 5 (#333, then #334), because Task 5 rewrote the prompt module that the runner Task 7
deleted still imported. Task 9 raised the server floors only (#336); the client figures
equalled its floors. Every file and line below was read on `ef481e8`.

---

## Owner's decisions

Decided 2026-11-03:

- **Gemini writes the coach notes only.**
- **A curated exercise library in the repository.**
- **The rules are a draft for the owner, checked against the evidence first.**
- **Modify, with a short avoid list**, in place of the strict rule.
- **A health screen of four yes/no questions in the planner.**
- **Deloads wait for B4.**
- **Beginners are capped at three full-body days, and the profile's age is read.**

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md` and README passages, that describe a change move in the
  PR that makes it.

**Test first.** Every behaviour change starts with its test, which must fail for the right
reason before the change makes it pass. A mutation then shows the test holds. Confirm each
mutation applied before trusting a run, and restore the file from a saved copy.

**Coverage slack is thin:** server statements 0.33, branches 0.80, functions 0.34 and lines
0.72, and client functions 0.46.

- The new modules are server source, so every function and branch in them ships with its test.
- Task 5 deletes covered route code, so measure before and after.

**Gates, in order, from `D:/ai-workout`:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage`, with `--coverage.reporter=json-summary` for exact counts against
   each floor, the server measured with `client/dist` present.

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green before the next
merge.

## Task 1: the spec, the evidence review and this plan (PR 1)

- [ ] Add the three files to `docs/README.md`'s lists.
- [ ] Mark `docs/specs/2026-11-03-plan-quality-evals-design.md` and its plan as superseded in
      part: their status lines point here, and say which tasks are cancelled and replaced.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Branch `docs/rule-based-plans`, commit, PR, merge when `CLEAN`.

## Task 2: the injury rules on the server (PR 2)

**Files:**

- Create: `server/src/services/planning/injuryRules.js`, with a header and `// @ts-check`.
- Create: `server/src/services/planning/__tests__/injuryRules.test.js`.
- Create: `client/src/pages/dashboard/tips/__tests__/injuryRules.contract.test.js`.
- Modify: `scripts/__tests__/repo-invariants.test.mjs`, `TYPE_CHECKED_FILES` 7 to 8.

`recommendationUtils.js` does not change in this PR. The Guides view keeps its own scoring.

Steps:

- [ ] **Test first:** the server's `detectInjuryFlags` maps every planner option and every name
      form to its areas. It matches whole words, so the spec's false positives map to no area:
      "leg press", "calf raise", "leg curl", "jump rope", "triceps kickback". Run the tests:
      they fail, because the module does not exist yet.
- [ ] Write the module: the area names, name forms, `coveredBy`, `detectInjuryFlags` and
      `buildInjuryText`, with JSDoc types.
- [ ] **The contract test,** on the client: for every planner option, every name form, and
      every no-injury answer, both copies give the same areas. Mutate one name form on each
      side; each mutation must fail it.
- [ ] Gates and coverage.

## Task 3: the exercise library (PR 3)

**Files:**

- Create: `server/src/services/planning/exerciseLibrary.js`, with a header and `// @ts-check`.
- Create: `server/src/services/planning/__tests__/exerciseLibrary.test.js`.
- Modify: `TYPE_CHECKED_FILES` 8 to 9.

Steps:

- [ ] **Test first,** the spec's library rules:
  - unique ids, and every field drawn from its list;
  - every regression exists, has the same pattern, is `ok` for its area, and needs no
    capability the original does not;
  - the `ok` bodyweight beginner entry for every area in `squat`, `hinge`, `single-leg` and
    `core`;
  - every avoid-table entry is `avoid` for its area;
  - every conditioning entry has an `impact`.

  Also `capabilitiesFor({ environment, equipment })`: each label's capabilities, written out
  in the test from the scorers' table; an unknown label; an empty list; and case.

- [ ] Write the library, about 120 entries, and `capabilitiesFor`. Order each pattern by
      priority.
- [ ] **Mutations,** each of which must fail:
  - a duplicated id;
  - a regression that is itself `avoid`;
  - a guarantee entry removed;
  - an avoid-table entry marked `ok`;
  - a capability dropped from a label.
- [ ] Gates and coverage.

## Task 4: the generator, the fallback notes and the gate (PR 4)

**Files:**

- Create: `server/src/services/planning/generatePlan.js` and
  `server/src/services/planning/fallbackNotes.js`, each with a header and `// @ts-check`.
- Create: their tests in `server/src/services/planning/__tests__/`.
- Modify: `scripts/evals/scorePlan.mjs` and its tests. The injury check becomes the spec's
  avoid-phrase list, matched as whole words, and the oversized check reads a cap of its own,
  20,000 characters, stated beside it.
- Create: `scripts/evals/__tests__/generatePlan.gate.test.mjs`.
- Modify: `TYPE_CHECKED_FILES` 9 to 11.

Steps:

- [ ] **Test first, the generator's rules,** with each table of the spec as cases:
  - reading the input;
  - the weekdays;
  - every sequence cell, including the focus table;
  - the slots, the time budget at 15, 20, 21, 30, 44, 45, 90 and 180 minutes, and supersets;
  - the choice rules, including a `modify` entry replaced by its regression with its cue, and
    an `avoid` entry skipped, each with a library stub;
  - the rotation;
  - every prescription row, and the level, one-day, older-adult and light-to-moderate changes;
  - the interval formats and the hard-session cap;
  - the walk lengths against the weekly target;
  - the written format, against one full expected plan for a fixed input.

  Also check that the same input gives the same output, and that `isRestDay`'s count equals
  the days asked for. `generatePlan` takes the library as an optional second argument, so the
  tests can pass a stub.

- [ ] Write `generatePlan.js`.
- [ ] **Test first, the fallback notes and the rule lines:**
  - each fallback line;
  - each injury line, including unmapped free text;
  - the referral, pregnancy and red-flag lines, and the general notice.

  Then write `fallbackNotes.js`.

- [ ] **The scorer change, test first:**
  - the avoid phrases per area as whole words;
  - re-measure the eight Gemini fixtures under them, and pin the new counts;
  - the oversized cap.
- [ ] **The gate, test first:** the spec's two sweeps, with every check in the spec's list.
      A failure names the input and the check. Time it: it must stay under 20 seconds on this
      machine, or the sweep shrinks and the PR says how.
- [ ] **Mutations,** each confirmed applied. The gate or a unit test must fail on each:
  - the equipment filter off;
  - the level filter off;
  - `modify` treated as `ok`;
  - `avoid` treated as `ok`;
  - the regression cue dropped;
  - the beginner cap off;
  - one sequence cell swapped to once-a-week;
  - the full-body slot order restored to the draft's;
  - the time budget's floor removed;
  - a prescription row changed;
  - the hard-session cap off;
  - the walk computation off by one rest day;
  - the balance slot dropped for an older adult;
  - light-to-moderate mode ignored.
- [ ] Gates and coverage.

## Task 5: the route switch (PR 5)

**Files:**

- Modify: `server/src/routes/generateRoutes.js` and its tests.
- Modify: `server/src/services/dashboard/planPromptService.js` and its tests. The notes
  instruction, with the spec's limits, and the notes message replace the plan prompt.
  `buildGenerationEquipmentContext` and the capability maps go, once nothing reads them.
- Modify: `server/src/services/http/apiSchemaService.js`, which gains the optional `health`
  object of four booleans, with its tests.
- Modify: `server/src/services/platform/envValidationService.js`, `env.example`, the
  environment table in `README.md`, and `render.yaml`:
  - `GEMINI_MAX_PLAN_CHARS` is removed;
  - the new defaults are stated;
  - `GEMINI_API_KEY` is described as optional, needed only for the notes.
- Modify: `e2e/README.md`, the AI line in `CLAUDE.md`'s Project Architecture, and the server
  README where it describes generation.

Steps:

- [ ] **Test first, against the route:**
  - a plan with no key, then with the stub client answering notes;
  - the notes call's model, instruction, token cap and abort signal;
  - each fallback reason (a throw, the deadline, `MAX_TOKENS`, empty text, no client), each
    logged with its reason;
  - the rule lines kept after Gemini's notes;
  - `health` read and not saved;
  - the profile's age used for a signed-in caller and absent for an anonymous one;
  - the saved payload equal to `buildPlanPayload` of the text;
  - every valid request answers 200.

  The old 500, 502 and 504 tests are deleted in this PR, and the PR body lists each one with
  why it goes.

- [ ] Rewrite the route and the prompt module.
- [ ] Update the env validation, `env.example`, the README table and `render.yaml` together.
      The `env.example` invariant in `repo-invariants.test.mjs` must pass.
- [ ] **Mutations,** each of which must fail:
  - the fallback removed, one reason at a time;
  - a rule line dropped after Gemini's notes;
  - `health` saved with the plan;
  - the payload built before the notes are appended.
- [ ] Gates and coverage. The PR body compares the covered and total counts before and after,
      since covered code is deleted.

## Task 6: the planner's health step (PR 6)

**Files:**

- Modify: `client/src/app/components/PlannerSetupModal.jsx` and its tests. It gains the spec's
  four questions, all optional, and a link to the full PAR-Q+.
- Modify: `client/src/app/constants.js`: `createDefaultPlannerForm` gains a `health` object of
  four `false` values.
- Modify: the client code that posts the planner form, so the request carries `health`.
- Modify: `client/src/app/events.js`: `GENERATE_TIMEOUT_MS` drops to 20,000, with its comment
  and tests.
- Modify: the client README.

Steps:

- [ ] **Test first:**
  - the step renders the four questions;
  - none is required;
  - each answer reaches the request body;
  - the default is all `false`;
  - the plan is never blocked;
  - the new timeout.
- [ ] **The accessibility scan.** `e2e/a11y.spec.js` covers the planner modal, so add the step
      to it if the planner's states are scanned there, and run `npm run test:e2e`.
- [ ] **Mutations,** each of which must fail: one answer not sent; a question marked required;
      the old timeout.
- [ ] Gates and coverage.

## Task 7: retire the live eval run (PR 5, shipped before Task 5)

- [ ] Delete `scripts/evals/run.mjs` and its tests, `scripts/evals/reference.json`,
      `.github/workflows/plan-evals.yml`, the `eval:plans` script, the root `@google/genai`
      devDependency, and the `scripts/evals/out/` ignore line.
- [ ] Delete `scripts/evals/summarize.mjs` and its tests too: its run summary and reference
      comparison have no caller once the runner is gone.
- [ ] Update `scripts/README.md` and `CLAUDE.md`'s Build & Test list.
- [ ] Make `DEFAULT_MAX_OUTPUT_TOKENS` and `DEFAULT_TIMEOUT_MS` module-private again once
      `run.mjs` is gone, since nothing else imports them. `npm run knip` confirms.
- [ ] Gates.

## Task 8: the roadmap republish

- [ ] Read the roadmap artifact, apply the spec's "Roadmap changes" to the file the read saves,
      and publish to its `url` without `capabilities`.
- [ ] Set the db statuses: B3 done when this phase is, and B5, D2 and D5 `dropped`, each
      with a note naming this spec.

## Task 9: re-measure

- [ ] On `main` after Task 7, measure both sides' coverage with json-summary, the server with
      `client/dist` present. Open a floor PR for a side only if a truncated figure rose.

## Done when

- `/api/generate` answers every valid request with a rule-built plan, with no key needed, and
  with Gemini's notes when it can get them and the rule lines always.
- The gate passes in `npm test` on every check across both sweeps.
- The planner asks the four health questions, and a yes gives a light-to-moderate plan.
- The live eval run and its secret are gone, and the roadmap reflects the change.
