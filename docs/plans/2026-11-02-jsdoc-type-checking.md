# Type checking through JSDoc, phase 1, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start roadmap lane D1 as decided on 2026-11-02 (JSDoc + checkJs). TypeScript 7
checks each workspace's `// @ts-check` files in CI, a repo-invariant test keeps the pragmas
where TypeScript reads them and their count from falling, and the four hotspot files are
checked. One spec PR, then three conversion PRs, then a floor PR only if coverage rose.

**Design:** `docs/specs/2026-11-02-jsdoc-type-checking-design.md`. Its findings, the probe
and the measurements are not repeated here.

**Tech Stack:** TypeScript 7.0, JSDoc, Vite 8, Vitest 5 with v8 coverage, Node 24, GitHub
Actions, gh CLI.

**Status: a plan.** Every file and line below was read on `11fd8d0`.

---

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- Each PR passes the floors on its own and edits no floor.
- The `CLAUDE.md`, README and SOP passages that describe a change move in the PR that makes it.

Every guard and every conversion is test-first:

- **A guard:** write it, run it and see it fail for the right reason, then make it pass.
- **A file:** add the pragma, run `npm run typecheck` and see the errors the spec measured,
  then annotate until it passes.

Show by mutation that each guard catches its failure, and confirm each mutation applied
before trusting a run. A conversion that finds a real bug stops, and the fix goes in
test-first.

**Gates, in order, from `D:/ai-workout`:**

1. `npm run format:check`, `npm run lint`, `npm run knip`, `npm run typecheck` (from Task 2),
   `npm run build` and `npm test`;
2. `npm run test:coverage`, with `--coverage.reporter=json-summary` for exact counts against
   each floor;
3. the client build compared byte for byte with `main`'s, since an annotation is a comment
   (`docs/code-readability-sop.md`, "Proving a change is readability-only").

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green.

## Task 1: the spec and this plan (PR 1)

**Files:** create the spec and this file; modify `docs/README.md` (list both).

- [ ] **Step 1:** branch from `origin/main`, add the three files, run `npm run format:check`.
- [ ] **Step 2:** open the PR, wait for `CLEAN`, merge.

## Task 2: the tooling, `units.js` and `rowValues.js` (PR 2)

**Files:**

- create `client/tsconfig.json`, `server/tsconfig.json` and
  `docs/adr/0017-type-checking-through-jsdoc.md`;
- modify `package.json`, `package-lock.json`, `client/package.json`, `server/package.json`,
  `.github/workflows/ci.yml`, `scripts/__tests__/repo-invariants.test.mjs`,
  `client/src/app/units.js`, `server/src/repositories/rowValues.js`, `CLAUDE.md`,
  `docs/adr/README.md`, `docs/code-readability-sop.md` and `scripts/README.md`.

Steps:

- [ ] **Step 1: write the guard block first.** In `repo-invariants.test.mjs`, a
      `describe("type-checked files")` with the spec's four tests. Set `TYPE_CHECKED_FILES`
      to 2. Read the tracked `.js`, `.jsx`, `.mjs` and `.cjs` files under `client/src` and
      `server/src` from `git ls-files`, as the header sweep does. A file is checked when it
      has a line that is exactly `// @ts-check`. Its position is right when the text before
      that line, with comments removed, is only whitespace. A ` * @ts-check` line inside a
      block comment fails the position test.
- [ ] **Step 2: see it fail.** `npm run test:scripts`. Expected: the count is 0 against 2,
      there are no tsconfigs, and CI has no typecheck step.
- [ ] **Step 3: install and configure.** Run `npm install -D typescript@^7.0.2` at the root,
      and confirm that `package-lock.json` lists `@typescript/typescript-linux-x64`, the
      binary CI needs. Add the two tsconfigs as the spec's Design gives them. Add a
      `typecheck` script (`tsc -p tsconfig.json`) to each workspace, a root one that runs
      both, and a `Typecheck` step after `Knip` in `ci.yml`'s lint job.
- [ ] **Step 4: check `units.js`.** Add `// @ts-check` on the line below its header. Run
      `npm run typecheck` and expect 10 TS7006 errors. Then give each parameter a
      `@param {Type} name` line below its summary until it passes. The form-value helpers
      take `unknown`.
- [ ] **Step 5: check `rowValues.js`** the same way, expecting 6.
- [ ] **Step 6: see the guards pass.** `npm run test:scripts`.
- [ ] **Step 7: mutate**, one at a time, each confirmed applied and restored from memory:
  - a type error in each checked file: `npm run typecheck` fails;
  - the pragma moved below `units.js`'s first export: position;
  - the pragma written inside `units.js`'s header: position;
  - the pragma removed from `rowValues.js`: count;
  - `// @ts-check` added to a third file: count;
  - `strict: false` in `server/tsconfig.json`: tsconfig test;
  - the `Typecheck` step deleted from `ci.yml`: CI test.
- [ ] **Step 8: write it down.**
  - `CLAUDE.md`: the command in the block, `npm run typecheck` in the "ALWAYS run" line,
    and a two-line rule saying where the pragma goes and that `TYPE_CHECKED_FILES` rises with
    it, pointing at 0017. Keep the file under `CLAUDE_MD_MAX_BYTES`.
  - 0017 and its index row.
  - The SOP's rule 2: the checked-file wording in the spec's Design.
  - `scripts/README.md`: the new checks.
- [ ] **Step 9: prove and gate.** Compare the client build with `main`'s, byte for byte.
      Expected: identical. Run the gates, then `test:coverage`. Expected: every exact count
      equals `main`'s.
- [ ] **Step 10:** open the PR, wait for `CLEAN`, merge, watch CI and Deploy.

## Task 3: `math.js` (PR 3)

**Files:** modify `client/src/pages/home/components/physique/math.js` and
`scripts/__tests__/repo-invariants.test.mjs` (`TYPE_CHECKED_FILES` to 3).

- [ ] **Step 1:** raise the count first and see the count test fail at 2.
- [ ] **Step 2:** add the pragma, and expect 9 TS7006 errors from `npm run typecheck`. Annotate
      until it passes. `toFiniteNumber`'s `fallback` is a number, and its `value` is `unknown`.
- [ ] **Step 3:** mutation: a type error in `math.js` fails the typecheck.
- [ ] **Step 4:** the build compare, the gates and `test:coverage`, as in Task 2.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, watch CI and Deploy.

## Task 4: `externalDataService.js` (PR 4)

**Files:** modify `server/package.json`, `package-lock.json`, `server/tsconfig.json`
(`types: ["node"]`), `server/src/services/external/externalDataService.js` and
`scripts/__tests__/repo-invariants.test.mjs` (`TYPE_CHECKED_FILES` to 4).

- [ ] **Step 1:** raise the count first and see the count test fail at 3.
- [ ] **Step 2:** add `@types/node` to the server and name it in `types`. Add the pragma and
      record the errors `npm run typecheck` reports. The spec measured 183 without Node's
      types, and fewer are expected with them.
- [ ] **Step 3:** type the factory's dependency object with a `@typedef` and annotate the rest.
      Where the checker is right, the fix goes in test-first, with its own mutation.
- [ ] **Step 4:** the gates, including `test:coverage`. A test-first fix may move coverage;
      a pure annotation cannot.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, watch CI and Deploy.

If the diff grows past what one review can hold, the service splits by section, each part a
PR with the count raised once at the end.

## Task 5: re-measure

- [ ] Run `npm run test:coverage` on `main` with exact counts. If a truncated figure rose, a
      floor PR per side raises it and updates the note beside it. If none rose, say so in the
      phase's closing summary, and open no PR.

## Done when

- `npm run typecheck` runs in CI over both workspaces with strict on, and passes.
- The four hotspots are checked, and `TYPE_CHECKED_FILES` is 4.
- The client build on `main` is byte-identical to `11fd8d0`'s, unless a test-first fix
  changed code.
- `main` is green and deployed.
