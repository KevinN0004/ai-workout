# Rule-based plans, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plans are chosen by the app's own rules from a curated exercise library, and Gemini
writes only the coach notes, with rule-written notes when it cannot. B3's scorers gate every
generated plan in `npm test`. One spec PR, five code PRs, the roadmap republish, then a floor
PR per side only if a figure rose.

**Design:** `docs/specs/2026-11-03-rule-based-plans-design.md`. Its rules, tables and decisions
are not repeated here.

**Tech Stack:** Express 5, `@google/genai` 2.31, Vitest 5 with v8 coverage, supertest, Node 24,
GitHub Actions, gh CLI.

**Status: a plan.** Every file and line below was read on `ef481e8`.

---

## Owner's decisions

Decided 2026-11-03:

- **The rules are designed in the spec and reviewed by the owner.**
- **Gemini writes the coach notes only.**
- **A curated exercise library in the repository.**
- **The strict injury rule:** tags and name keywords both exclude.

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md` and README passages, that describe a change move in the
  PR that makes it.

Every behaviour change is test-first. Write the test, see it fail for the right reason, make
it pass, then show by mutation that it holds. Confirm each mutation applied before trusting a
run, and restore it from a saved copy.

**Coverage slack is thin:** server statements 0.33, branches 0.80, functions 0.34 and lines
0.72, and client functions 0.46. The new modules are server source, so every function and
branch in them ships with its test. Task 5 deletes covered route code, so measure before
and after.

**Gates, in order, from `D:/ai-workout`:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck`,
   `npm run build` and `npm test`;
2. `npm run test:coverage`, with `--coverage.reporter=json-summary` for exact counts against
   each floor, the server measured with `client/dist` present.

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green before the next
merge.

## Task 1: the spec and this plan (PR 1)

- [ ] Add both files to `docs/README.md`'s lists.
- [ ] Mark `docs/specs/2026-11-03-plan-quality-evals-design.md` and its plan as superseded in
      part: their status lines point here, and say which tasks are cancelled (Task 5, the
      first reference) and replaced.
- [ ] `npm run format:check` and `npm run test:scripts`.
- [ ] Branch `docs/rule-based-plans`, commit, PR, merge when `CLEAN`.

## Task 2: the injury rules on the server (PR 2)

**Files:**

- Create: `server/src/services/planning/injuryRules.js`, with a header and `// @ts-check`.
- Create: `server/src/services/planning/__tests__/injuryRules.test.js`.
- Create: `client/src/pages/dashboard/tips/__tests__/injuryRules.contract.test.js`.
- `recommendationUtils.js` does not change: the contract test compares the two sides through
  `detectInjuryFlags` and `buildInjuryText`, which both already export.
- Modify: `scripts/__tests__/repo-invariants.test.mjs`, `TYPE_CHECKED_FILES` 7 to 8.

Steps:

- [ ] **Test first:** the server module's `detectInjuryFlags` and `buildInjuryText` give the
      client's results on the client's own cases. Copy the cases from
      `recommendationUtils`'s tests, so they are the same inputs. Run them: they fail, the
      module does not exist.
- [ ] Write the module, copying the tables and the two functions word for word, then add
      JSDoc types.
- [ ] **The contract test,** on the client, imports both modules and asserts equal outputs for
      every injury option, for free-text notes that name each injury and each name form, and
      for every no-injury answer. Then mutate one keyword on each side: each must fail.
- [ ] Gates and coverage.

## Task 3: the exercise library (PR 3)

**Files:**

- Create: `server/src/services/planning/exerciseLibrary.js`, with a header and `// @ts-check`.
- Create: `server/src/services/planning/__tests__/exerciseLibrary.test.js`.
- Modify: `TYPE_CHECKED_FILES` 8 to 9.

Steps:

- [ ] **Test first,** the spec's library rules:
  - unique ids;
  - every field drawn from its list;
  - the bodyweight beginner entry per pattern;
  - no name holding a keyword of an injury its `stresses` omits.

  Also `capabilitiesFor({ environment, equipment })`: each label's capabilities, matching the
  scorers' table label by label, written out in the test from the spec; an unknown label; an
  empty list; and case.

- [ ] Write the library, about 100 entries, and `capabilitiesFor`. Order each pattern by
      priority.
- [ ] **Mutations:** a duplicated id; a stress removed from an entry whose name holds its
      keyword; a label's capability dropped. Each must fail.
- [ ] Gates and coverage.

## Task 4: the generator and the fallback notes (PR 4)

**Files:**

- Create: `server/src/services/planning/generatePlan.js` and
  `server/src/services/planning/fallbackNotes.js`, each with a header and `// @ts-check`.
- Create: their tests in `server/src/services/planning/__tests__/`.
- Create: `scripts/evals/__tests__/generatePlan.gate.test.mjs`.
- Modify: `TYPE_CHECKED_FILES` 9 to 11.

Steps:

- [ ] **Test first, the generator's rules,** each table of the spec as cases:
  - the form reading;
  - the weekdays and the day-type sequences;
  - the swaps;
  - the slot count at 15, 18, 26, 45 and 180 minutes;
  - the choice rules, each with a library stub holding one entry that breaks it;
  - the rotation;
  - the dropped slot;
  - the prescriptions and level changes;
  - the written format, against one full expected plan for a fixed form.

  Also determinism, and `isRestDay`'s count equal to the days asked for. `generatePlan` takes
  the library as an optional second argument, so the tests can pass a stub.

- [ ] Write `generatePlan.js`.
- [ ] **Test first, the fallback notes:** each line, per injury and per track. Then write
      `fallbackNotes.js`.
- [ ] **The gate, test first:**
  - the spec's two sweeps, through `scorePlan`;
  - zero breaks and hits everywhere;
  - two exercises or more on every training day.

  A failure names the form and the hit. Time it: it must stay under 20 seconds on this
  machine, or the sweep shrinks and the PR says how.

- [ ] **Mutations,** each confirmed applied:
  - the equipment filter off;
  - the level filter off;
  - the tag rule off;
  - the keyword rule off;
  - the rotation off;
  - a weekday pattern changed;
  - a swap removed;
  - the duration formula's floor changed;
  - a prescription row changed.

  The gate or a unit test must fail on each.

- [ ] Gates and coverage.

## Task 5: the route switch (PR 5)

**Files:**

- Modify: `server/src/routes/generateRoutes.js` and its tests.
- Modify: `server/src/services/dashboard/planPromptService.js` and its tests: the notes
  instruction and message replace the plan prompt. `buildGenerationEquipmentContext` and the
  capability maps go, once nothing reads them.
- Modify: `server/src/services/platform/envValidationService.js`, `env.example`,
  `README.md`'s environment table, `render.yaml`: `GEMINI_MAX_PLAN_CHARS` removed, the new
  defaults stated, `GEMINI_API_KEY` described as optional, for the notes.
- Modify: `client/src/app/events.js`, `GENERATE_TIMEOUT_MS` to 20,000, and its comment and
  tests.
- Modify: `scripts/evals/scorePlan.mjs`: its oversized check reads a cap of its own, 20,000
  characters, stated beside it, since the route's `DEFAULT_MAX_PLAN_CHARS` goes.
- Modify: `e2e/README.md`, `CLAUDE.md` (the AI line in Project Architecture), and the server
  README where they describe generation.

Steps:

- [ ] **Test first, against the route:**
  - a plan with no key, then with the stub client answering notes;
  - the notes call's model, instruction, token cap and abort signal;
  - each fallback reason (a throw, the deadline, `MAX_TOKENS`, empty text, no client), each
    logged with its reason;
  - the answer's text ends with `Coach Notes:` and the notes;
  - the saved payload equals `buildPlanPayload` of the text;
  - every valid request answers 200.

  The old 500, 502 and 504 tests are deleted in this PR, and the PR body lists each one with
  why it goes.

- [ ] Rewrite the route and the prompt module.
- [ ] Update the env validation, `env.example`, the README table and `render.yaml` together.
      The `env.example` invariant in `repo-invariants.test.mjs` must pass.
- [ ] **Mutations:** the fallback on each reason removed in turn; the notes trimmed differently;
      the payload built before the notes are appended. Each must fail.
- [ ] Gates and coverage. The coverage note in the PR body compares the covered and total
      counts before and after, since covered code is deleted.

## Task 6: retire the live eval run (PR 6)

- [ ] Delete `scripts/evals/run.mjs`, its tests, `scripts/evals/reference.json`,
      `.github/workflows/plan-evals.yml`, the `eval:plans` script, the root `@google/genai`
      devDependency and the `scripts/evals/out/` ignore line.
- [ ] Update `scripts/README.md` and `CLAUDE.md`'s Build & Test list.
- [ ] Make `DEFAULT_MAX_OUTPUT_TOKENS` and `DEFAULT_TIMEOUT_MS` module-private again once
      `run.mjs` is gone, since nothing else imports them; `npm run knip` confirms.
- [ ] Gates.

## Task 7: the roadmap republish

- [ ] Read the roadmap artifact, apply the spec's "Roadmap changes" to the file the read saves,
      and publish to its `url` without `capabilities`.
- [ ] Set the db statuses: B3 done when this phase is, and B5, D2 and D5 `dropped`, each
      with a note naming this spec.

## Task 8: re-measure

- [ ] On `main` after Task 6, measure both sides' coverage with json-summary, the server with
      `client/dist` present. Open a floor PR for a side only if a truncated figure rose.

## Done when

- `/api/generate` answers every valid request with a rule-built plan, with no key needed, and
  with Gemini's notes when it can get them.
- The gate passes in `npm test` with zero structure breaks, equipment hits and injury hits
  across the sweeps.
- The live eval run and its secret are gone, and the roadmap reflects the change.
