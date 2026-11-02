# Decision records, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do roadmap item E1. `CLAUDE.md` keeps its rules, each with a pointer, and the history
behind them moves to numbered decision records in `docs/adr/` with its wording intact. A
repo-invariant test keeps the pointers resolving and the file under a byte ceiling. One spec
PR, then three move PRs.

**Design:** `docs/specs/2026-11-02-decision-records-design.md`. Its findings, criteria and
measurements are not repeated here.

**Tech Stack:** Markdown, Prettier 3.9, Vitest 5 (the root `scripts/` project), Node 24,
GitHub Actions, gh CLI.

**Status: a plan.** Every line number below is in `CLAUDE.md` at `653bc77`.

---

## Conventions

The readability follow-up's rules still apply (`docs/specs/2026-10-10-readability-follow-up-design.md`):

- One PR at a time, each on a new branch from current `origin/main`.
- A moved passage keeps its wording. The only edits are the ten the spec lists.
- Every passage that describes a check changes in the PR that changes the check.

The guard block is test-first: write it, run it and see each test fail for the right reason,
add what it checks, see it pass, then show by mutation that each test catches its failure.
Confirm each mutation applied (the file changed) before trusting a pass.

**Gates, in order, from `D:/ai-workout`:** `npm run format:check`, `npm run lint`,
`npm run knip`, `npm test`, then `node check-moved.mjs` (Tools, below) against the PR's base.
Every sentence it reports goes in the PR description with its reason.

**Merging:** only when GitHub reports the PR `CLEAN`, with a standalone
`gh pr merge <n> --merge`. Then watch `main`'s CI and Deploy runs to green.

## Records

Each record is `# NNNN. Title`, a status line, `## Decision` and `## Background`. Background
is the listed ranges in order, each a block. A range that opens with a list item is unwrapped
into a paragraph and dedented by its marker's indent plus two. Any other range is dedented by
its least-indented line.

| Record                                    | Lines at `653bc77`                           | PR  |
| ----------------------------------------- | -------------------------------------------- | --- |
| `0001-absent-is-not-zero.md`              | 166–189, 242–243, 245–252, 254–339, 992–1002 | 2   |
| `0002-us-aqi-from-the-nowcast.md`         | 191–200                                      | 2   |
| `0003-picking-the-openaq-station.md`      | 202–229, 231–240                             | 2   |
| `0004-file-length-is-a-smell.md`          | 343–367                                      | 2   |
| `0005-testing-across-the-wire.md`         | 400–412, 414–469                             | 3   |
| `0006-accessibility-by-axe.md`            | 471–519                                      | 3   |
| `0007-reduced-motion-where-it-moves.md`   | 521–534                                      | 3   |
| `0008-knip-and-dead-code.md`              | 536–561                                      | 3   |
| `0009-compose-on-loopback.md`             | 578–602                                      | 3   |
| `0010-coverage-floors.md`                 | 606–647, 663–665                             | 4   |
| `0011-tests-control-their-environment.md` | 648–662, 700–715, 887–906                    | 4   |
| `0012-coverage-gaps.md`                   | 676–699, 716–860                             | 4   |
| `0013-test-boundaries.md`                 | 861–885, 908–915                             | 4   |
| `0014-what-to-test.md`                    | 666–675, 916–941                             | 4   |
| `0015-mutation-testing.md`                | 942–991, 1003–1022                           | 4   |
| `0016-formatter-exclusions.md`            | 1043–1065                                    | 4   |

The `CLAUDE.md` side, by the same line numbers: a `docs/adr` line goes in after 97, and 155–339
(External data), 341–367 (Conventions), 400–561, 578–602, 606–1022 and 1043–1065 are each
replaced by the rule they held and a pointer.

## Task 1: the spec and this plan (PR 1)

**Files:** create `docs/specs/2026-11-02-decision-records-design.md` and this file; modify
`docs/README.md` (list both).

- [ ] **Step 1:** branch `docs/decision-records-spec` from `origin/main`, add the three
      files, run `npm run format:check`.
- [ ] **Step 2:** open the PR, wait for `CLEAN`, merge.

## Task 2: the guard block and records 0001–0004 (PR 2)

**Files:** modify `scripts/__tests__/repo-invariants.test.mjs`, `CLAUDE.md`,
`docs/README.md`, `README.md`, `docs/code-readability-sop.md`, `scripts/README.md`; create
`docs/adr/README.md` and records 0001–0004.

- [ ] **Step 1: write the guard block first.** In `repo-invariants.test.mjs`, a
      `describe("the decision records")` with the spec's five tests, and
      `CLAUDE_MD_MAX_BYTES` set to the size this PR leaves, rounded up to the next
      thousand (76,000 on the draft). Tracked files come from `git ls-files`, as the header
      sweep's do.
- [ ] **Step 2: see it fail.** `npm run test:scripts`. Expected: the naming, numbering and
      index tests fail because `docs/adr` does not exist, and the ceiling test fails at
      87,007 bytes.
- [ ] **Step 3: add the records and the slimmed sections.** Records 0001–0004, the index
      with their four rows, the External data and Conventions sections, and the
      `docs/adr` line in File Organization. Then the pointers: in `docs/README.md` an
      `adr/` row and "the decision records" in where to read why; in `README.md` the
      `CLAUDE.md` line and the docs index line; in `docs/code-readability-sop.md:318`
      record 0004; in `scripts/README.md` the new checks. Run `npx prettier --write` on
      every changed Markdown file and confirm a second pass changes nothing.
- [ ] **Step 4: see it pass.** `npm run test:scripts`.
- [ ] **Step 5: mutate.** One at a time, each confirmed applied, each expected to fail its
      test: delete the 0002 row from the index; swap the 0001 and 0002 rows; add an
      unlisted `0005-x.md`; rename `0003-…` so the pointer in `CLAUDE.md` dangles; name
      `docs/adr/0099-missing.md` in `docs/README.md`; add `notes.md` to `docs/adr`; append
      2 KB to `CLAUDE.md`. Restore each from memory, not from git.
- [ ] **Step 6:** run the gates and `check-moved.mjs` against `origin/main`. Expected:
      only the External data and Conventions edits and the File Organization artifact.
- [ ] **Step 7:** open the PR, wait for `CLEAN`, merge, watch CI and Deploy.

## Task 3: records 0005–0009 (PR 3)

**Files:** modify `CLAUDE.md`, `docs/adr/README.md`, `e2e/README.md`,
`scripts/__tests__/repo-invariants.test.mjs` (the ceiling); create records 0005–0009.

- [ ] **Step 1:** branch from `origin/main`, add the five records and their rows, and
      replace lines 400–561 and 578–602 with their rules (the contract tests, the E2E
      suite's five things, accessibility, reduced motion, knip, the compose binding and
      the two passwords).
- [ ] **Step 2:** point `e2e/README.md:34` at records 0005 and 0006.
- [ ] **Step 3:** lower `CLAUDE_MD_MAX_BYTES` to this PR's size, rounded up to the next
      thousand (67,000 on the draft). See the test fail at the old size first, by running it
      before the `CLAUDE.md` change lands.
- [ ] **Step 4:** Prettier twice, the gates, `check-moved.mjs`. Expected: the 0008
      Fresh Clone Setup edit only.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, watch CI and Deploy.

## Task 4: records 0010–0016, and the final ceiling (PR 4)

**Files:** modify `CLAUDE.md`, `docs/adr/README.md`, `client/README.md`,
`scripts/__tests__/repo-invariants.test.mjs`; create records 0010–0016.

- [ ] **Step 1:** branch from `origin/main`, add the seven records and their rows, and
      replace lines 606–1022 and 1043–1065 with their rules. The coverage bullet keeps the
      two warnings that live nowhere else: `App.jsx`'s unit initializers, and the
      deliberate gaps in `outlineGeometry.js`, `templateOutline.js` and
      `usePreviewDerivedData.js`.
- [ ] **Step 2:** point `client/README.md:141` at record 0012.
- [ ] **Step 3:** set `CLAUDE_MD_MAX_BYTES` to 40,000.
- [ ] **Step 4:** Prettier twice, the gates, `check-moved.mjs`. Expected: the 0010, 0012
      and 0014 edits and the `TZ` and jsdom split.
- [ ] **Step 5:** open the PR, wait for `CLEAN`, merge, watch CI and Deploy.

## Done when

- `CLAUDE.md` is under 40,000 bytes on `main`, and `repo-invariants.test.mjs` holds it there.
- Records 0001–0016 are on `main`, indexed, and every pointer to one resolves.
- `check-moved.mjs` against `653bc77` reports only the sentences the spec accounts for.
- `main` is green and deployed.

## Tools

`check-moved.mjs`. Write it out with the Write tool and run it from a scratch directory:
`node check-moved.mjs <old CLAUDE.md> <new CLAUDE.md> <docs/adr>`, with the old file from
`git show <base>:CLAUDE.md`. It exits 1 and lists every sentence it cannot find.

````js
// Proves a move lost nothing: every sentence of the old CLAUDE.md must appear, after
// normalising markdown and whitespace, in the new CLAUDE.md or in a decision record.
// Prints each sentence that appears in neither, for review.
// Usage: node check-moved.mjs <oldClaude> <newClaude> <adrDir>
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const [oldPath, newPath, adrDir] = process.argv.slice(2);
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// Markdown that a move or Prettier may change without changing the words.
const normalise = (text) =>
  text
    .replace(/^```.*$/gm, " ")
    .replace(/^ *(?:[-*+]|\d+\.) +/gm, " ")
    .replace(/^#+ +/gm, " ")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const sentences = (text) =>
  normalise(text)
    .split(/(?<=[.!?:;])\s+(?=[A-Z`"(0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const oldSentences = sentences(read(oldPath));
const records = readdirSync(adrDir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => read(path.join(adrDir, f)));
const corpus = [read(newPath), ...records].map(normalise).join(" \u0000 ");

const missing = oldSentences.filter((s) => !corpus.includes(s));
console.log(`${oldSentences.length} sentences checked, ${missing.length} not found verbatim`);
for (const s of missing) console.log(`- ${s}`);
process.exitCode = missing.length ? 1 : 0;
````
