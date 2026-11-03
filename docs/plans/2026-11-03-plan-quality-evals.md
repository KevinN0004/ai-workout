# Plan-quality evals (roadmap B3), Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do roadmap B3 as decided on 2026-11-03. Generated plans are scored by rules for
structure, equipment and injury conflicts, from a manual workflow that runs ten profiles three
times each, and a run fails on a structure break or on hits above a committed reference. One
spec PR, three code PRs, the first reference, then a floor PR per side only if a figure rose.

**Design:** `docs/specs/2026-11-03-plan-quality-evals-design.md`. Its findings, the measured
hits on the saved plans and the decisions are not repeated here.

**Tech Stack:** Express 5, `@google/genai` 2.31, Vitest 5, Node 24, GitHub Actions, gh CLI.

**Status: a plan.** Every file and line below was read on `7acfa8e`.

---

## Owner's decisions

Decided 2026-11-03:

- **A separate eval key,** the secret `GEMINI_EVAL_API_KEY`, in a Google project of its own.
- **Structure, plus no worse:** fail on any structure break, or on injury or equipment hits
  above the reference by more than the larger of 3 hits and 25% of it.
- **A committed reference, and artifacts.**
- **Ten profiles, three plans each.**

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The comments, and the `CLAUDE.md` and README passages, that describe a change move in the
  PR that makes it.

Every behaviour change is test-first. Write the test, see it fail for the right reason, make
it pass, then show by mutation that it holds. Confirm each mutation applied before trusting a
run, and restore it from a saved copy.

Coverage slack is thin: server statements 0.15, branches 0.80, functions 0.31 and lines 0.58,
and client functions 0.46. Task 2 moves covered code and adds none uncovered; measure it.

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
- [ ] `npm run format:check` and `npm run test:scripts` (the decision-record path check).
- [ ] Branch `docs/b3-plan-evals`, commit, PR, merge when `CLEAN`.

## Task 2: the prompt in its own module (PR 2)

**Files:**

- Create: `server/src/services/dashboard/planPromptService.js`, with a header and
  `// @ts-check`.
- Create: `server/src/services/dashboard/__tests__/planPromptService.test.js`.
- Modify: `server/src/routes/generateRoutes.js`.
- Modify: `server/src/routes/__tests__/generateRoutes.equipment.test.js`, only its import of
  `buildGenerationEquipmentContext`.
- Modify: `scripts/__tests__/repo-invariants.test.mjs`, `TYPE_CHECKED_FILES` 6 to 7.

Steps:

- [ ] **Test first.** `planPromptService.test.js` pins `buildPlanPrompt` for a full profile
      and the fence `"abc"`: the twelve lines, `BEGIN CLIENT DATA abc (untrusted)` to
      `END CLIENT DATA abc`, as the route builds them today. Copy the expected lines from the
      route's template literal, not from the new function. Also pin
      `DEFAULT_GEMINI_MODEL === "gemini-3.5-flash-lite"`, and that `SYSTEM_INSTRUCTION` holds
      the weekday and `Coach Notes:` lines. Run it: it fails, the module does not exist.
- [ ] Move `SYSTEM_INSTRUCTION`, both capability maps, `COMMERCIAL_FULL_ACCESS_LABEL`,
      `uniqueList`, `normalizeText` and `buildGenerationEquipmentContext` into the module,
      word for word, with their comments. Add `DEFAULT_GEMINI_MODEL` and
      `buildPlanPrompt(fields, fence)`, where `fields` is
      `{ goal, equipment, duration, level, injuries, days, environment, focuses }` already
      defaulted. JSDoc every parameter: the file is type-checked.
- [ ] The route imports them. It still draws the fence, defaults the fields, and reads
      `process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL`.
- [ ] Re-point the equipment test's import at the module. The route's other tests pass
      untouched; that is the proof of no change in behaviour.
- [ ] Update the route's header and the comment above `SYSTEM_INSTRUCTION` (its contract with
      `planPayloadService` moves with it).
- [ ] **Mutations,** each confirmed applied: drop a line from `buildPlanPrompt`; swap two of
      its lines; change the default model. Each must fail a test.
- [ ] Gates, then coverage: the server's covered counts must not fall below the floors.
      Record the slack in the PR body.

## Task 3: the scorers (PR 3)

**Files:**

- Create: `scripts/evals/profiles.mjs`, `scripts/evals/scorePlan.mjs`,
  `scripts/evals/summarize.mjs`, each with a header.
- Create: `scripts/evals/__tests__/scorePlan.test.mjs`,
  `scripts/evals/__tests__/summarize.test.mjs`.
- Modify: `client/src/pages/dashboard/tips/recommendationUtils.js`, one import:
  `"../wordMatch"` becomes `"../wordMatch.js"`.

Steps:

- [ ] **The import.** Change it, then `npm -w client run build` and the client's tests: Vite
      resolves either spelling. Leave `planUtils.js`'s import alone; nothing outside Vite
      loads it.
- [ ] **Profiles.** The ten in the spec's profile table, keyed by its names, with all eight
      planner fields each. The first eight are the Phase 4 capture's, so a fixture's name is
      its profile's.
- [ ] **Test first, on the saved plans.** For each fixture, scored with its text and the
      finish reason `STOP`, there is no structure break, and these hits:

  | Fixture            | Injury | Equipment |
  | ------------------ | ------ | --------- |
  | 03 knee            | 5      | 0         |
  | 04 lower back      | 1      | 2         |
  | 07 wrist and elbow | 6      | 0         |
  | 08 hip             | 1      | 0         |
  | the other four     | 0      | 0         |

  Then one test for each structure break (a plan built to have it, and the failed, truncated,
  empty and oversized outcomes), each equipment word supplied and not supplied, "rowing
  machine" not a machine, and the hit counting rules in the spec. Run them: they fail, the
  modules do not exist.

- [ ] Write `scorePlan.mjs`. It imports `buildPlanPayload` from the server, and `isRestDay`,
      `detectInjuryFlags` and `buildInjuryText` from the client, by relative path.
- [ ] **Test first, the summary:** `summarize` totals; `compare` against a reference of 13 at
      16 and 17 (pass, fail), of 2 at 5 and 6 (pass, fail), and of 20 at 25 and 26 (pass,
      fail: exactly 25% over is allowed); with no reference (structure only); and with a
      failed call (fail). Then write `summarize.mjs`.
- [ ] **Mutations,** each confirmed applied, each must fail a test: weekday order not checked;
      notes not checked; training days compared with `>=`; a hit counted once per keyword
      instead of once per flag; the "rowing machine" exclusion removed; one supplier dropped
      from the table; the margin's floor of 3 dropped; its 25% term dropped; the comparison's `>` made `>=`.
- [ ] `npm run knip`: until Task 4 the new modules are reached only from their tests, which
      `knip.jsonc` already declares as entries (`scripts/**/*.test.mjs`), so it stays clean.
- [ ] Gates. Client coverage must not fall: the import change adds nothing.

## Task 4: the runner and the workflow (PR 4)

**Files:**

- Create: `scripts/evals/run.mjs`, with a header.
- Create: `scripts/evals/__tests__/run.test.mjs`.
- Create: `scripts/evals/reference.json`, `{ "results": null }` until Task 5.
- Create: `.github/workflows/plan-evals.yml`.
- Modify: root `package.json`: the script `"eval:plans": "node scripts/evals/run.mjs"`, and
  `@google/genai` in `devDependencies` at the server's range; `package-lock.json` by
  `npm install`.
- Modify: `.gitignore`: `scripts/evals/out/`.
- Modify: `scripts/README.md`, `README.md` (the environment table gains
  `GEMINI_EVAL_API_KEY` and `EVAL_MODEL`, as eval-only), and `CLAUDE.md`'s Build & Test list
  (`npm run eval:plans`, needs the key, never in `npm test`).

Steps:

- [ ] **Test first,** with the Gemini client injected as a stub: `runEval({ client, model,
profiles, sleep })` calls each profile three times; a call that throws once is retried
      and scored; one that throws twice is `failed`; a `MAX_TOKENS` result is not retried;
      the prompt version is 8 hex characters, the same for the same text and different when
      `SYSTEM_INSTRUCTION` differs by a character; the module's `main` refuses with no
      `GEMINI_EVAL_API_KEY`, exit 1, before any call. Run them: they fail.
- [ ] Write `run.mjs`: `runEval` as tested, and `main`, which builds the real client, reads
      `reference.json` and the file it names, writes the scores file to `out/`, prints the
      Markdown summary and the comparison, and exits 1 when the comparison fails. The pause
      is 4 seconds and the deadline 30. `main` runs only when the file is the entry point.
- [ ] **The workflow:** `workflow_dispatch` with the `model` input; `permissions: contents:
read`; `timeout-minutes: 30`; checkout, setup-node 24 with the npm cache, `npm ci`,
      `npm run eval:plans >> "$GITHUB_STEP_SUMMARY"` with `GEMINI_EVAL_API_KEY` and
      `EVAL_MODEL` in its env, then `actions/upload-artifact` of `scripts/evals/out/` with
      `if: always()`. Pin action versions as `ci.yml` does.
- [ ] **Mutations,** each confirmed applied, each must fail a test: no retry; retry on
      `MAX_TOKENS`; two calls per profile; the key check after the first call.
- [ ] `npm run knip`: `run.mjs` is an entry through the package script. No new knip entry
      should be needed; if one is, add it with a comment saying why.
- [ ] Gates. A run without the secret is not attempted in this PR.

## Task 5: the first reference (PR 5)

Blocked until the owner adds `GEMINI_EVAL_API_KEY` to the repository's Actions secrets.

- [ ] Run the workflow twice on `main` (`gh workflow run plan-evals.yml`), and watch each.
- [ ] Download both artifacts. Record each run's totals and per-profile hits in the PR body.
- [ ] Commit the first run's file to `scripts/evals/results/` and point `reference.json` at
      it. If the two runs' totals differ by more than the margin allows, widen the margin in
      `summarize.mjs` and its tests to cover it, and say so in the PR body and the spec.
- [ ] Run the workflow a third time on the branch: it compares against the new reference and
      must pass.

## Task 6: re-measure

- [ ] On `main` after Task 5, measure both sides' coverage with json-summary, the server with
      `client/dist` present. Open a floor PR for a side only if a truncated figure rose.

## Done when

- `npm run eval:plans` and the manual workflow score ten profiles three times, and fail on a
  structure break or on hits past the margin.
- The reference for today's model and prompt is committed, from two recorded runs.
- The roadmap's B3 status reads done.
