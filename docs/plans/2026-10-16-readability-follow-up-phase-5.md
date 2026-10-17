# Readability follow-up: Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 5 of the readability follow-up, the deletions: D1 (GeneratedPlanModal), D2 (the dead CSRF fallback and the "Enviroment" typo), the deletions the Phase 3 and Phase 4 plans routed here, then one floor PR for both sides (D3).

**Architecture:** Phase 5 of `docs/specs/2026-10-10-readability-follow-up-design.md`. Spec rule 5 puts every deletion in this phase because deleting covered code lowers a percentage and deleting uncovered code raises it. So every task here was applied alone to a scratch copy of `main` and measured, and then the whole sequence was applied cumulatively and measured again; each task quotes its counts. Two independent tracks (rule 1): six client PRs and three server PRs, each a new branch from current `origin/main`, merged one at a time within its track. D3 closes the phase for both sides. Nothing here adds behaviour, so most tasks have no failing-test-first step, and each says so; the three that rewrite tests, and the one that adds a wiring test, say what the test proves and how it was checked.

**Tech Stack:** React 19, Vite 8 (Lightning CSS), Vitest 5 with v8 coverage, jsdom 30, Express 5, Prisma, Postgres 18, Playwright 1.60 (E2E, axe, and the capture tool), GitHub (gh CLI).

**Status:** complete as a plan; nothing in it has been run against the repository. Every count and every expected tool output in it was measured in scratch copies of `a8aad22` on 2026-10-16.

**Owner's decisions, 2026-10-16.** The four calls this plan left open are settled, and every task below runs as written:

- **S1** takes the planned form: the caller's pre-check goes, and `tokensMatch` keeps its empty-token check.
- **C6** is taken, so D3 floors from the "with C6" column.
- **C5 Step 4** is taken: the four `styles/base.css` selectors go with the PR 11 list.
- **C3** takes the wider scope, with the `effectiveBodyFat` prop chain.

**Baseline (`main` at `a8aad22`, 2026-10-16).** Measured for this plan in a scratch copy of `main` (`git archive main`, `node_modules` junctions to the repo's, `vitest run --coverage --coverage.reporter=json-summary` in each workspace, Postgres up, every test passing). The server was measured twice, identically:

| Side   | Tests | Statements            | Branches              | Functions             | Lines                 |
| ------ | ----- | --------------------- | --------------------- | --------------------- | --------------------- |
| Client | 2441  | 98.8316 (4906 / 4964) | 93.8740 (3218 / 3428) | 99.0234 (1014 / 1024) | 99.4662 (4472 / 4496) |
| Server | 1183  | 95.0710 (2276 / 2394) | 88.2540 (1668 / 1890) | 96.2217 (382 / 397)   | 96.2353 (2045 / 2125) |

The client counts are Phase 4's K5 prediction exactly. The server branch count is **1668**; a figure of 1667 has been quoted for it, which is not what `main` measures locally today. CI reads server branches higher, as the note at `server/vitest.config.js:28-34` says: the last green run on `main` (run 38972980958, `a8aad22`) shows 98.83 / 93.87 / 99.02 / 99.46 for the client and 95.07 / **88.62** / 96.22 / 96.23 for the server, on Node 22 and 24 alike. The local figure is the lower, so it is the one that binds, and every count below is local.

**How the floors compare.** Vitest computes each metric as `Math.floor(10000 * covered / total) / 100` (`percent()` in `@vitest/istanbul-lib-coverage`) and fails when that is below the threshold. The floors have one decimal, so a metric passes exactly when `covered >= floor / 100 * total`. Every table below gives the counts, the percentage to four decimals, and the **slack**, `covered - floor / 100 * total`, which must be 0 or more. The floors: client 98.8 / 93.8 / 99 / 99.4 (`client/vite.config.js:72-77`), server 95 / 88.2 / 96.2 / 96.2 (`server/vitest.config.js:35-40`).

| On `main`         | Covered / total | Least the floor accepts | Slack |
| ----------------- | --------------- | ----------------------- | ----- |
| Client statements | 4906 / 4964     | 4905 (98.8% is 4904.43) | 1.57  |
| Client branches   | 3218 / 3428     | 3216 (3215.46)          | 2.54  |
| Client functions  | 1014 / 1024     | 1014 (1013.76)          | 0.24  |
| Client lines      | 4472 / 4496     | 4470 (4469.02)          | 2.98  |
| Server statements | 2276 / 2394     | 2275 (2274.30)          | 1.70  |
| Server branches   | 1668 / 1890     | 1667 (1666.98)          | 1.02  |
| Server functions  | 382 / 397       | 382 (381.91)            | 0.09  |
| Server lines      | 2045 / 2125     | 2045 (2044.25)          | 0.75  |

**What a deletion costs.** Removing k covered items keeps a metric at its floor while `k <= slack / (1 - floor / 100)`. On the server that allows at most 8 covered branches (1.02 / 0.118) and **2 covered functions** (0.09 / 0.038); on the client, 40 branches and 24 functions. Removing an uncovered item raises the percentage. That is why the server track's order is forced (see "Ordering, and the cumulative arithmetic") and the client track's is not.

---

## Summary of the tasks

Measured alone, each against `main`. The cells are the change in covered / total.

| Task | Track  | Branch                                     | Deletes                                                                                                         | Statements | Branches  | Functions | Lines     |
| ---- | ------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------- | --------- | --------- | --------- |
| D1   | Client | `chore/delete-generated-plan-modal`        | GeneratedPlanModal, the state and props only it used, its tests, its CSS and one selector that dies with it     | −19 / −21  | −13 / −14 | −8 / −9   | −16 / −18 |
| D2   | Client | `chore/csrf-fallback-and-environment-typo` | useApiClient's dead fallback and the ref only it read; the "Enviroment" typo                                    | −3 / −3    | −3 / −3   | 0 / 0     | −3 / −3   |
| C3   | Client | `chore/delete-preview-body-fat`            | `previewBodyFat`, `previewBmi`, `computedBodyFat`, and the `effectiveBodyFat` prop that only fed them           | −2 / −2    | −4 / −4   | 0 / 0     | −2 / −2   |
| C4   | Client | `refactor/one-imperial-region-set`         | the walkthrough's copy of `IMPERIAL_REGION_CODES`                                                               | −1 / −1    | 0 / 0     | 0 / 0     | −1 / −1   |
| C5   | Client | `chore/remove-never-matching-css`          | the readability effort's PR 11 list: rules with live classes that match nothing, and three dead `:is()` entries | CSS only   |           |           |           |
| C6   | Client | `refactor/fold-client-number-helpers`      | **Optional, owner's call:** `toProfileNumber` and useBodyModel's `toFiniteNumber`, folded into `toNumberOrNull` | −10 / −10  | −14 / −14 | −2 / −2   | −8 / −8   |
| S1   | Server | `chore/csrf-one-empty-token-check`         | requireCsrfToken's empty-token pre-check, which repeats tokensMatch's (S1 says why this, not the routed form)   | +1 / 0     | 0 / −3    | 0 / 0     | 0 / 0     |
| S2   | Server | `chore/drop-strip-userid-guard`            | `stripUserIdField`'s non-object guard                                                                           | −1 / −2    | −3 / −4   | 0 / 0     | −1 / −1   |
| S3   | Server | `refactor/one-positive-int-reader`         | `parsePositiveInt`; the GEMINI_* limits read through index.js's `toPositiveInt`                                 | −7 / −7    | −12 / −12 | −1 / −1   | −5 / −5   |
| D3   | Both   | `chore/phase-5-floors`                     | nothing; raises each floor whose truncated measurement rose                                                     |            |           |           |           |

Merge order: client D1 → D2 → C3 → C4 → C5 → C6 (if taken); server S1 → S2 → S3; D3 once both tracks are done. S3 cannot merge first: alone it takes server branches to 1656 / 1878 (88.1789), under the floor.

---

## Conventions

- **Shell.** Git Bash, from `D:\ai-workout`, with an uppercase `D`: the lowercase path breaks Vitest. Set `SCRATCH` to any folder outside the repo and redirect command output there. `TOOLS="$SCRATCH/p5-tools"` holds the Tools section's scripts and `SHOTS="$SCRATCH/p5-shots"` the captures. Never `cd` into a `src` folder: run Vitest with `--root client` or `--root server` from the repo root.
- **Exit codes.** Never gate on a pipe: redirect output to a file, then read `$?`.
- **Secrets.** Never read, stat or print `server/.env` or any `.env*` file. If a permission rule blocks something, stop and say so.
- **Server suite.** `npm run test:coverage` and `npm run test:e2e` need Postgres (`npm run postgres:local:start -w server`) and a generated Prisma client (`npm run prisma:generate -w server`) after any `npm ci`. Without Postgres about 107 server tests fail with "Can't reach database server" and every server count is wrong, so check that the `Tests` line reports no failure before reading one. The two tracks share the database: agree a turn before running the server suite or the E2E suite while the other track might be.
- **Ports.** The capture tool serves on 4174, so it never collides with the E2E suite's 4173 or the server's 5000. A capture that crashes can leave its preview server running: free 4174 by port (`netstat -ano | grep ":4174 "`, then `taskkill //PID <pid> //F`).
- **Take `main`: every task is a NEW branch.** `git fetch origin && git switch -c <branch> origin/main`. Open the PR as a draft. If `main` moves before the PR is marked ready, take it by merging, never by rebasing: `git fetch origin && git merge origin/main`, then re-run `test:coverage` and re-read the counts, and for a client task re-capture both sides of the compare. Then `gh pr ready`.
- **Resolving a conflict.** Keep the task's change. Keep `main`'s comments wherever they still describe the code, and rewrite any the change makes untrue, following `docs/code-readability-sop.md`. After resolving, `git diff origin/main` shows only the task's change and the comment rewrites it forces.
- **Line numbers** are on `a8aad22`. Every edit is anchored by the full text it replaces, which each task quotes; the number is a guide. Three pairs of tasks share a file, in different hunks: D1 and C3 (`HomePage.jsx`, `HomePage.test.jsx`), C3 and C4 (`usePreviewDerivedData.js`), and D1 and C5's optional Step 4 (`styles/base.css`, where Step 4 anchors on D1's result). Once the first of a pair merges, the later task's anchors are still exact but its numbers shift.
- **Byte-order marks.** Of the files these tasks edit, six start with one (`ef bb bf`): `client/src/styles/app.css`, `client/src/app/styles/planner/base.css`, `planner/responsive.css`, `planner/interactions.css`, `client/src/pages/dashboard/styles/theme.css` and `client/src/pages/home/HomePage.jsx`. Keep each: before committing, `head -c 3 <file> | od -An -tx1` must print what it printed on `main`. The Edit tool keeps them.
- **Formatting.** Every change here passed `prettier --check` and `eslint` in a scratch copy of the tree. Still run `npx prettier --write <the files you changed>` before the gates, and re-read any edit Prettier reflows. Comment lines stay within 100 columns.
- **Comments (spec rule 4).** Each task names every comment its deletion makes untrue and gives the replacement, in the SOP's style: present tense, every claim checked against the code, no numbers that live elsewhere. The header ratchet (`scripts/__tests__/repo-invariants.test.mjs`) scans tracked files, so deleting a file needs no change to it; no task adds a source file, and the allowlist stays empty.
- **Records.** CLAUDE.md names `GeneratedPlanModal.jsx` (twice), useBodyModel's `toFiniteNumber` and coverage figures. None of that is edited here: spec rule 6 puts every record in Phase 6, after D3, so they describe the final state. "Not in this phase" lists them.
- **Proving a deletion safe.** For each thing deleted: every reference grepped across `client`, `server` and `e2e`, tests included (tests and E2E specs query classes and names); `npm run knip` clean; the full suite green; and for any client task, the 44-capture compare. A pure deletion has no failing test to write first, and each such task says so rather than inventing one.
- **The gates on every PR.** Each redirected to a file; every exit code must be `0`.

  ```bash
  npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
  npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
  npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "knip exit=$?"
  npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"; grep -E "index-.*\.js|larger than" "$SCRATCH/build.txt"
  npm run test:coverage > "$SCRATCH/cov.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files|Tests  " "$SCRATCH/cov.txt"
  npm run test:e2e > "$SCRATCH/e2e.txt" 2>&1; echo "test:e2e exit=$?"; tail -3 "$SCRATCH/e2e.txt"
  npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"
  ```

  The E2E suite includes the axe scans (`e2e/a11y.spec.js`) and runs against the built bundle, which is why `build` comes first. `test:scripts` holds the header ratchet, which CI runs in its lint job. The build output must show no "larger than" chunk warning.

- **Exact coverage.** The text table shows two decimals, which is too coarse at these margins. Read the counts: `npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc.txt" 2>&1` (or `-w server`, into `sc.txt`), then `node "$TOOLS/counts.mjs" . client` (or `server`). It prints covered/total, the percentage to four decimals, the floor and the slack per metric, and exits 1 when a slack is negative. Each task's table gives what it must print, measured on `a8aad22` plus the tasks before it on its track. If the counts differ, find out why before marking the PR ready: a merge on `main` from outside this plan can move them. What must hold is the slack.
- **Screenshot compares (spec rule 7).** Every client task builds and captures before and after with Phase 4's `capture.mjs`, unchanged. Each task's before-capture must be `identical` to the previous client task's after-capture; D1's before-capture is the phase baseline. Five of the six client tasks expect **no** difference at all, and their compare runs without an expectation file: `node "$TOOLS/capture.mjs" compare "$SHOTS/<task>-before" "$SHOTS/<task>-after" > "$SCRATCH/<task>-cmp.txt" 2>&1; echo "compare exit=$?"`, which must print `identical` and exit `0`. D2 changes visible text and has an expectation file. Never widen an expectation to make a compare pass.
- **Mutation checks.** Write `$TOOLS/mutate.mjs` with the Write tool (Tools). Write each edits file with the Write tool too, never a heredoc or an argument: Git Bash rewrites arguments that start with `//`, and a heredoc collapses backslashes. Run mutations after the change is committed; restore with `git checkout -- <files>` and confirm `git status --porcelain` prints nothing. The tool exits 2 when an edit did not apply, so an unapplied mutation cannot read as a surviving one.
- **Floors.** No fix PR edits a floor. D3 raises them once.
- **Merging.** A PR merges only after its spec and quality reviews pass, its checks are green, and it shows `mergeStateStatus` `CLEAN`. Merge with **"Create a merge commit"** (`gh pr merge <n> --merge`), then wait for the CI run on `main` to go green before starting the next task on that track.
- **Trailers.** Every commit ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

---

## Tools

Write each into `$TOOLS` with the Write tool, never a heredoc (two of them hold backslashes). They run from the repo root with Node 22 or 24, and find Vite, Playwright, postcss and espree through the repo's own `node_modules`, so they need nothing installed. Install Chromium for Playwright first if this machine has never run the E2E suite (`npx playwright install chromium`).

| Script               | Where it comes from                                                                                                               | What it does                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `capture.mjs`        | Phase 4's plan (`docs/plans/2026-10-16-readability-follow-up-phase-4.md`, Tools), verbatim                                        | The 44 captures, and their compare. `node capture.mjs <repoRoot> <outDir>`; `node capture.mjs compare <dirA> <dirB> [expect.json]` |
| `css-sweep.mjs`      | the code-readability plan (`docs/plans/2026-09-29-code-readability.md`, Task 12, Step 2), verbatim                                | Every class a stylesheet names that no source file does. `node css-sweep.mjs <repoRoot>`                                           |
| `mutate.mjs`         | Phase 3's client plan (`docs/plans/2026-10-15-readability-follow-up-phase-3-client.md`, Conventions, "Mutation checks"), verbatim | Applies `[{ "file", "find", "text" }]` edits from a JSON file; exits 2 when one did not apply                                      |
| `counts.mjs`         | below                                                                                                                             | Exact counts, percentage, floor and slack per metric for one workspace; exits 1 below a floor                                      |
| `selector-probe.mjs` | below                                                                                                                             | For C5: how many elements each selector matches in every captured DOM                                                              |
| `font-rivals.mjs`    | below                                                                                                                             | For C5: every built rule that sets a font size in the specificity band the copy-size rule moves through                            |

`capture.mjs` is the tool Phase 4 proved, and nothing in it changes: for this plan it took its 44 captures of a scratch build of `a8aad22` twice, and the two runs compared `identical`. `css-sweep.mjs` lists files with `git ls-files`, so a file a task deletes must be deleted with `git rm` before the sweep runs, or the sweep tries to read it.

`counts.mjs`:

<!-- prettier-ignore -->
```js
/**
 * Exact coverage against the floors. Reads <side>/coverage/coverage-summary.json
 * and the thresholds in client/vite.config.js or server/vitest.config.js, and
 * prints covered/total, the percentage to four decimals, the floor and the
 * slack (covered minus floor% of total) per metric. Vitest passes a metric
 * exactly when its slack is 0 or more; exits 1 when any is negative.
 * Usage: node counts.mjs <repoRoot> <client|server>
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const [root = ".", side = "client"] = process.argv.slice(2);
const { total } = JSON.parse(
  readFileSync(path.join(root, side, "coverage/coverage-summary.json"), "utf8")
);
const config = readFileSync(
  path.join(root, side, side === "client" ? "vite.config.js" : "vitest.config.js"),
  "utf8"
);
const thresholds = config.match(/thresholds:\s*\{([\s\S]*?)\}/)[1];
let below = false;
for (const metric of ["statements", "branches", "functions", "lines"]) {
  const floor = Number(thresholds.match(new RegExp(String.raw`${metric}:\s*([\d.]+)`))[1]);
  const { covered, total: count } = total[metric];
  const slack = covered - (floor / 100) * count;
  if (slack < 0) below = true;
  console.log(
    `${side} ${metric.padEnd(10)} ${covered}/${count} = ${((100 * covered) / count).toFixed(4)}` +
      `  floor ${floor}  slack ${slack.toFixed(2)}${slack < 0 ? "  BELOW FLOOR" : ""}`
  );
}
process.exit(below ? 1 : 0);
```

`selector-probe.mjs`:

<!-- prettier-ignore -->
```js
/**
 * Counts, in every captured DOM (<name>.dom.html) of a capture run, the
 * elements each selector matches, with its state pseudo-classes (:hover,
 * :active, :focus-visible, :disabled, :not(:disabled)) removed so the
 * structural part is what is tested. Loads each DOM with scripts disabled.
 * Prints one line per selector: the total and the captures it matched in.
 * Usage: node selector-probe.mjs <repoRoot> <shotsDir> <selectors.json>
 */
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const [root, dir, listFile] = process.argv.slice(2);
const { chromium } = createRequire(path.join(root, "package.json"))("@playwright/test");
const selectors = JSON.parse(readFileSync(listFile, "utf8"));
const structural = (s) =>
  s.replace(/:not\(:disabled\)/g, "").replace(/:(hover|active|focus-visible|disabled)\b/g, "");
const doms = readdirSync(dir).filter((f) => f.endsWith(".dom.html")).sort();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const hits = new Map(selectors.map((s) => [s, []]));
  for (const f of doms) {
    await page.setContent(readFileSync(path.join(dir, f), "utf8"), { waitUntil: "domcontentloaded" });
    for (const s of selectors) {
      const n = await page.evaluate((sel) => document.querySelectorAll(sel).length, structural(s));
      if (n) hits.get(s).push(`${f.replace(".dom.html", "")}:${n}`);
    }
  }
  for (const [s, list] of hits) console.log(`${String(list.length ? list.reduce((a, x) => a + Number(x.split(":").pop()), 0) : 0).padStart(4)}  ${s}${list.length ? `  (${list.slice(0, 4).join(", ")}${list.length > 4 ? ", …" : ""})` : ""}`);
  console.log(`${doms.length} captured DOMs`);
} finally {
  await browser.close();
}
```

`font-rivals.mjs`:

<!-- prettier-ignore -->
```js
/**
 * Lists every rule in the built main CSS that sets font-size (or the font
 * shorthand) with a selector whose specificity lies between (0,2,1) and
 * (0,3,0) inclusive: the band in which a rival's outcome against the
 * walkthrough's copy-size rule could change when that rule drops from (0,3,0)
 * to (0,2,1). Prints each with its specificity and @media context, for review.
 * Usage: node font-rivals.mjs <repoRoot> <dist/assets/index-*.css>
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const [root, cssFile] = process.argv.slice(2);
const postcss = createRequire(path.join(root, "package.json"))("postcss");

// Splits at top-level commas only.
const splitTop = (s) => {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const max = (list) => list.reduce((m, x) => (cmp(x, m) > 0 ? x : m), [0, 0, 0]);

// Specificity of one complex selector (no top-level commas).
const spec = (sel) => {
  let s = [0, 0, 0];
  let i = 0;
  while (i < sel.length) {
    const ch = sel[i];
    if (ch === "#") {
      s = add(s, [1, 0, 0]);
      i += 1;
      while (i < sel.length && /[\w-]/.test(sel[i])) i += 1;
    } else if (ch === ".") {
      s = add(s, [0, 1, 0]);
      i += 1;
      while (i < sel.length && /[\w-]/.test(sel[i])) i += 1;
    } else if (ch === "[") {
      s = add(s, [0, 1, 0]);
      while (i < sel.length && sel[i] !== "]") i += 1;
      i += 1;
    } else if (ch === ":") {
      const pseudoEl = sel[i + 1] === ":";
      i += pseudoEl ? 2 : 1;
      let name = "";
      while (i < sel.length && /[\w-]/.test(sel[i])) name += sel[i++];
      let args = null;
      if (sel[i] === "(") {
        let depth = 0;
        let j = i;
        for (; j < sel.length; j += 1) {
          if (sel[j] === "(") depth += 1;
          if (sel[j] === ")") depth -= 1;
          if (depth === 0) break;
        }
        args = sel.slice(i + 1, j);
        i = j + 1;
      }
      if (pseudoEl || ["before", "after", "placeholder", "selection", "marker"].includes(name)) {
        s = add(s, [0, 0, 1]);
      } else if (name === "where") {
        // zero
      } else if (["is", "not", "has"].includes(name)) {
        s = add(s, max(splitTop(args).map(spec)));
      } else {
        s = add(s, [0, 1, 0]);
      }
    } else if (/[a-zA-Z]/.test(ch)) {
      s = add(s, [0, 0, 1]);
      while (i < sel.length && /[\w-]/.test(sel[i])) i += 1;
    } else i += 1;
  }
  return s;
};

const css = readFileSync(cssFile, "utf8");
const rootNode = postcss.parse(css);
const LOW = [0, 2, 1];
const HIGH = [0, 3, 0];
rootNode.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
  const decls = rule.nodes.filter((n) => n.type === "decl" && /^font(-size)?$/.test(n.prop));
  if (!decls.length) return;
  const media = [];
  for (let p = rule.parent; p && p.type === "atrule"; p = p.parent) media.unshift(`@${p.name} ${p.params}`);
  for (const sel of splitTop(rule.selector)) {
    const s = spec(sel);
    if (cmp(s, LOW) >= 0 && cmp(s, HIGH) <= 0) {
      console.log(`(${s.join(",")}) ${sel}  { ${decls.map((d) => `${d.prop}: ${d.value}${d.important ? " !important" : ""}`).join("; ")} }  ${media.join(" ")}`);
    }
  }
});
```

**Prove the tools before D1.** On `main`, clean:

```bash
npm run build > "$SCRATCH/b-main.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/main-1" > "$SCRATCH/cap-main-1.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/main-2" > "$SCRATCH/cap-main-2.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/main-1" "$SHOTS/main-2"; echo "compare exit=$?"
grep -c "^captured " "$SCRATCH/cap-main-1.txt"
node "$TOOLS/css-sweep.mjs" . > "$SCRATCH/sweep-main.txt" 2>&1; tail -1 "$SCRATCH/sweep-main.txt"
```

Expected: three `exit=0`, `identical`, `44`, and `3 unreferenced, 23 maybe dynamic, over 48 stylesheets and 88 source files` (the three are the dead `:is()` entries C5 removes). `$SHOTS/main-1` is the phase baseline and D1's before-capture. `a8aad22` is K4's merge, so it should also compare `identical` to Phase 4's `k4-after`, if that is still on disk.

---

## Client track

### Task D1: Delete GeneratedPlanModal

Nothing in the app opens the generated-plan modal. Its only opener, `setPlanModalOpen(true)` in `onSubmit`, became `setPlanModalOpen(false)` in `21a2d45`, on purpose: a new plan shows on `/plan` (WorkoutResultPage) or the dashboard instead (spec default #8). On `a8aad22`, `git grep -n "setPlanModalOpen(" -- client/src` finds four calls, all `false`: two in `events.js:166,170` and two inside the modal itself. So App builds the element on every render, HomePage and DashboardPage render it, and it returns `null` every time; only its own test file opens it. Its stylesheet rules are the S7-1 finding Phase 4 routed here: `.plan-modal` ties `styles/base.css`'s `.modal` and loses, so most of them never applied either.

**What goes:**

- `GeneratedPlanModal.jsx` and its test file (14 tests).
- In App: the import, the `planModalOpen` and `activeDayIndex` state, the `generatedPlanModal` element, and the effect that reset `activeDayIndex` for each new plan (its own comment says only GeneratedPlanModal reads it). `setPlanModalOpen` leaves the object App passes to `createAppEventHandlers`, and `generatedPlanModal` the props of HomePage and DashboardPage.
- In `events.js`: the destructured `setPlanModalOpen` and its two calls in `onSubmit`, which only ever cleared a flag nothing set.
- Its CSS: `planner/base.css`'s "Generated plan modal", "Day tabs and the day's plan" and "Notes and footer" sections, and the eight `.plan-modal*`, `.plan-tabs*` and `.plan-day` rules in `planner/responsive.css`'s 720 px block.
- One more selector that dies with it, under spec default #9: `.modal-actions .ghost` in `styles/base.css`'s 720 px block. The only `.ghost` button inside a `.modal-actions` was the modal's own (its close and Login / Sign up buttons); PlannerSetupModal's `.modal-actions` holds only `.cta` buttons (`PlannerSetupModal.jsx:265-278`), and no other component renders a `.modal-actions`. `.modal-actions .back-btn` beside it matched nothing before this task too, and is left to C5 (see there).

**What stays:** `planSections`, `parsePlanSections` and `downloadPlanPdf`, which WorkoutResultPage uses (`App.jsx:525-537`); `.plan-day-detail-*`, which is PlansView's (`PlansView.jsx:446-487`), and which the CSS deletions below do not touch: every deleted selector is `.plan-day` exactly, `.plan-tabs`, or begins `.plan-modal`.

**Comments that change with it** (spec rule 4): App's component summary, the header of `ModalPortal.jsx`, HomePage's header and summary and its JSX section comment, DashboardPage's header, ExerciseDetailsModal's one-guard note (it named this modal as the other example), the jspdf note in `events.js` ("the Download PDF buttons are its only callers": one button now), and the headers of `styles/app.css`, `planner/base.css` and `planner/responsive.css`, which describe two planner modals. Each replacement is quoted below.

**Measured** (a scratch copy of `a8aad22` with exactly this task's edits; nothing before it on the track):

| Metric     | Before      | After       | After, % | Floor | Slack |
| ---------- | ----------- | ----------- | -------- | ----- | ----- |
| Statements | 4906 / 4964 | 4887 / 4943 | 98.8671  | 98.8  | 3.32  |
| Branches   | 3218 / 3428 | 3205 / 3414 | 93.8781  | 93.8  | 2.67  |
| Functions  | 1014 / 1024 | 1006 / 1015 | 99.1133  | 99    | 1.15  |
| Lines      | 4472 / 4496 | 4456 / 4478 | 99.5087  | 99.4  | 4.87  |

Tests 2441 → 2427 (the 14 in GeneratedPlanModal.test.jsx; the events test is renamed, not removed). Every percentage rises, because the deletion takes uncovered code with it: GeneratedPlanModal's `ModalPortal onClose` arrow, which no test called (the file was 11/12 statements, 7/8 functions), and App's one uncovered statement and branch, which were in the lines this task deletes (App goes from 167/168 statements and 72/73 branches to 161/161 and 71/71). The build's main chunk goes from 488.14 kB to 485.50 kB and the main CSS from 135.33 kB to 133.50 kB.

**Files:**

- Delete: `client/src/app/components/GeneratedPlanModal.jsx`, `client/src/app/components/__tests__/GeneratedPlanModal.test.jsx`
- Modify: `client/src/App.jsx:24, 45-46, 118-119, 346, 412-431, 590, 622`
- Modify: `client/src/app/events.js:36, 84, 166-170`; `client/src/app/__tests__/events.test.js:53, 1041-1047`
- Modify: `client/src/components/ModalPortal.jsx:2-3`
- Modify: `client/src/pages/home/HomePage.jsx:4-5, 47-48, 75-76, 256-258` (byte-order mark; keep it); `client/src/pages/home/__tests__/HomePage.test.jsx:108, 162-167`
- Modify: `client/src/pages/dashboard/DashboardPage.jsx:3, 116, 541`; `__tests__/DashboardPage.hookOrder.test.jsx:77`; `__tests__/DashboardPage.integration.test.jsx:127`
- Modify: `client/src/pages/dashboard/tips/ExerciseDetailsModal.jsx:25-26`
- Modify: `client/src/styles/app.css:1` (byte-order mark), `client/src/app/styles/planner/base.css:1-117` (byte-order mark), `client/src/app/styles/planner/responsive.css:1-3, 14-54` (byte-order mark), `client/src/styles/base.css:483`

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c chore/delete-generated-plan-modal origin/main
npm run build > "$SCRATCH/b-d1-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/d1-before" > "$SCRATCH/d1-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/main-1" "$SHOTS/d1-before"; echo "chain exit=$?"
git grep -n "setPlanModalOpen(" -- client/src
```

Expected: `identical`, and the four `setPlanModalOpen(false)` calls above, none `true`.

- [ ] **Step 2: No failing test first.** This is a pure deletion: no behaviour a visitor can reach changes, so there is nothing for a new test to pin. The tests that change (Step 3) stop passing or asserting on a prop and a setter that no longer exist.

- [ ] **Step 3: Delete the modal, its state and its props**

```bash
git rm -q client/src/app/components/GeneratedPlanModal.jsx client/src/app/components/__tests__/GeneratedPlanModal.test.jsx
```

(`git rm`, not a plain delete: `css-sweep.mjs` lists files through git, Step 5.)

In `client/src/App.jsx`, delete line 24:

<!-- prettier-ignore -->
```jsx
import GeneratedPlanModal from "./app/components/GeneratedPlanModal";
```

In `client/src/App.jsx`, replace lines 45-46:

<!-- prettier-ignore -->
```jsx
 * HomePage. The planner and generated-plan modals are built here and passed to
 * HomePage and DashboardPage, which both render them.
```

with:

<!-- prettier-ignore -->
```jsx
 * HomePage. The planner modal is built here and passed to HomePage and
 * DashboardPage, which both render it.
```

In `client/src/App.jsx`, delete lines 118-119:

<!-- prettier-ignore -->
```jsx
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
```

In `client/src/App.jsx`, delete line 346:

<!-- prettier-ignore -->
```jsx
    setPlanModalOpen,
```

In `client/src/App.jsx`, delete lines 412-431:

<!-- prettier-ignore -->
```jsx
  const generatedPlanModal = (
    <GeneratedPlanModal
      planModalOpen={planModalOpen}
      result={result}
      setPlanModalOpen={setPlanModalOpen}
      planSections={planSections}
      activeDayIndex={activeDayIndex}
      setActiveDayIndex={setActiveDayIndex}
      downloadPlanPdf={downloadPlanPdf}
      go={go}
    />
  );

  // A new plan opens on its first day. Only GeneratedPlanModal reads
  // activeDayIndex. `result` is listed as well as the day count so that a plan
  // with as many days as the last one still resets.
  useEffect(() => {
    if (!planSections.days.length) return;
    setActiveDayIndex(0);
  }, [planSections.days.length, result]);
```

In `client/src/App.jsx`, delete line 590:

<!-- prettier-ignore -->
```jsx
        generatedPlanModal={generatedPlanModal}
```

In `client/src/App.jsx`, delete line 622:

<!-- prettier-ignore -->
```jsx
      generatedPlanModal={generatedPlanModal}
```

In `client/src/app/events.js`, replace line 36:

<!-- prettier-ignore -->
```js
// Download PDF buttons are its only callers and can await it.
```

with:

<!-- prettier-ignore -->
```js
// plan page's Download PDF button is its only caller and can await it.
```

In `client/src/app/events.js`, delete line 84:

<!-- prettier-ignore -->
```js
  setPlanModalOpen,
```

In `client/src/app/events.js`, replace lines 166-170:

<!-- prettier-ignore -->
```js
        setPlanModalOpen(false);
        setDashView("summary");
        go("/dashboard");
      } else {
        setPlanModalOpen(false);
```

with:

<!-- prettier-ignore -->
```js
        setDashView("summary");
        go("/dashboard");
      } else {
```

In `client/src/app/__tests__/events.test.js`, delete line 53:

<!-- prettier-ignore -->
```js
    setPlanModalOpen: vi.fn(),
```

In `client/src/app/__tests__/events.test.js`, replace lines 1041-1047:

<!-- prettier-ignore -->
```js
    test("closes the planner and its modal either way", async () => {
      deps.apiFetch.mockResolvedValue(generated());

      await build().onSubmit(submitEvent());

      expect(deps.closePlanner).toHaveBeenCalledTimes(1);
      expect(deps.setPlanModalOpen).toHaveBeenCalledWith(false);
```

with:

<!-- prettier-ignore -->
```js
    test("closes the planner either way", async () => {
      deps.apiFetch.mockResolvedValue(generated());

      await build().onSubmit(submitEvent());

      expect(deps.closePlanner).toHaveBeenCalledTimes(1);
```

In `client/src/components/ModalPortal.jsx`, replace lines 2-3:

<!-- prettier-ignore -->
```jsx
 * The portal every modal in the app renders through, from the planner and
 * plan modals in app/components to the dashboard's own.
```

with:

<!-- prettier-ignore -->
```jsx
 * The portal every modal in the app renders through, from the planner modal
 * in app/components to the dashboard's own.
```

In `client/src/pages/home/HomePage.jsx`, replace lines 4-5:

<!-- prettier-ignore -->
```jsx
 * and generated-plan modals App builds. Rendered by App for any path it does
 * not route elsewhere.
```

with:

<!-- prettier-ignore -->
```jsx
 * modal App builds. Rendered by App for any path it does not route elsewhere.
```

In `client/src/pages/home/HomePage.jsx`, replace lines 47-48:

<!-- prettier-ignore -->
```jsx
 * them. `samplePlan` is the plan the workout stage shows; `plannerModal` and
 * `generatedPlanModal` are App's elements, rendered here whatever the stage.
```

with:

<!-- prettier-ignore -->
```jsx
 * them. `samplePlan` is the plan the workout stage shows; `plannerModal` is
 * App's element, rendered here whatever the stage.
```

In `client/src/pages/home/HomePage.jsx`, replace lines 75-76:

<!-- prettier-ignore -->
```jsx
  plannerModal,
  generatedPlanModal
```

with:

<!-- prettier-ignore -->
```jsx
  plannerModal
```

In `client/src/pages/home/HomePage.jsx`, replace lines 256-258:

<!-- prettier-ignore -->
```jsx
      {/* ---- App's modals, and the hidden workout copy ---- */}
      {plannerModal}
      {generatedPlanModal}
```

with:

<!-- prettier-ignore -->
```jsx
      {/* ---- App's planner modal, and the hidden workout copy ---- */}
      {plannerModal}
```

In `client/src/pages/home/__tests__/HomePage.test.jsx`, delete line 108:

<!-- prettier-ignore -->
```jsx
      generatedPlanModal={<div data-testid="generated-modal" />}
```

In `client/src/pages/home/__tests__/HomePage.test.jsx`, replace lines 162-167:

<!-- prettier-ignore -->
```jsx
    test("the measure shell and both modals render whatever the stage", () => {
      renderHome({ homeStage: "intro" });

      expect(screen.getByTestId("workout-measure")).toBeInTheDocument();
      expect(screen.getByTestId("planner-modal")).toBeInTheDocument();
      expect(screen.getByTestId("generated-modal")).toBeInTheDocument();
```

with:

<!-- prettier-ignore -->
```jsx
    test("the measure shell and the planner modal render whatever the stage", () => {
      renderHome({ homeStage: "intro" });

      expect(screen.getByTestId("workout-measure")).toBeInTheDocument();
      expect(screen.getByTestId("planner-modal")).toBeInTheDocument();
```

In `client/src/pages/dashboard/DashboardPage.jsx`, replace line 3:

<!-- prettier-ignore -->
```jsx
 * with the toast, the workout modal and App's planner modals. Rendered by App
```

with:

<!-- prettier-ignore -->
```jsx
 * with the toast, the workout modal and App's planner modal. Rendered by App
```

In `client/src/pages/dashboard/DashboardPage.jsx`, delete line 116:

<!-- prettier-ignore -->
```jsx
  generatedPlanModal,
```

In `client/src/pages/dashboard/DashboardPage.jsx`, delete line 541:

<!-- prettier-ignore -->
```jsx
        {generatedPlanModal}
```

In `client/src/pages/dashboard/__tests__/DashboardPage.hookOrder.test.jsx`, delete line 77:

<!-- prettier-ignore -->
```jsx
  generatedPlanModal: null,
```

In `client/src/pages/dashboard/__tests__/DashboardPage.integration.test.jsx`, delete line 127:

<!-- prettier-ignore -->
```jsx
      generatedPlanModal={null}
```

In `client/src/pages/dashboard/tips/ExerciseDetailsModal.jsx`, replace lines 25-26:

<!-- prettier-ignore -->
```jsx
  // keeps a null exercise from throwing. GeneratedPlanModal follows the same
  // one-guard rule.
```

with:

<!-- prettier-ignore -->
```jsx
  // keeps a null exercise from throwing.
```

- [ ] **Step 4: Delete its CSS, and the selector that dies with it**

No `@media` block is left empty: the 720 px block in `planner/responsive.css` keeps its planner rules, and `styles/base.css`'s keeps `.modal-actions .cta` and the rest.

- [ ] **Step 5: Prove nothing else named it**

```bash
git grep -n -E "GeneratedPlanModal|generatedPlanModal|PlanModalOpen|planModalOpen|activeDayIndex|ActiveDayIndex" -- client server e2e
git grep -n -E "plan-modal|plan-tabs|plan-day[^-]" -- client e2e
npx prettier --write client/src/App.jsx client/src/app/events.js client/src/app/__tests__/events.test.js client/src/components/ModalPortal.jsx client/src/pages/home/HomePage.jsx client/src/pages/home/__tests__/HomePage.test.jsx client/src/pages/dashboard/DashboardPage.jsx client/src/pages/dashboard/__tests__/DashboardPage.hookOrder.test.jsx client/src/pages/dashboard/__tests__/DashboardPage.integration.test.jsx client/src/pages/dashboard/tips/ExerciseDetailsModal.jsx client/src/styles/app.css client/src/app/styles/planner/base.css client/src/app/styles/planner/responsive.css client/src/styles/base.css
for f in client/src/styles/app.css client/src/app/styles/planner/base.css client/src/app/styles/planner/responsive.css client/src/pages/home/HomePage.jsx; do printf "%s " $f; head -c 3 $f | od -An -tx1; done
node "$TOOLS/css-sweep.mjs" . > "$SCRATCH/sweep-d1.txt" 2>&1; tail -1 "$SCRATCH/sweep-d1.txt"
npm run knip > "$SCRATCH/knip-d1.txt" 2>&1; echo "knip exit=$?"
```

Expected: both greps print nothing; four `ef bb bf`; the sweep's last line `3 unreferenced, 23 maybe dynamic, over 48 stylesheets and 87 source files` (the same three `:is()` entries as on `main`, one source file fewer); `knip exit=0`.

- [ ] **Step 6: Build, check, commit**

```bash
npm run build > "$SCRATCH/b-d1.txt" 2>&1; echo "build exit=$?"; grep -E "index-.*\.(js|css) " "$SCRATCH/b-d1.txt"
CSS=$(ls client/dist/assets/index-*.css)
grep -c -E "plan-modal|plan-tabs" "$CSS"
git add -A client/src
git commit -F - <<'EOF'
chore(client): delete GeneratedPlanModal, which nothing opens

Its last opener became setPlanModalOpen(false) in 21a2d45, so App
built the modal on every render for HomePage and DashboardPage to
render as null. The modal goes with its state, the day-index reset
effect, the props that carried it, its tests and its stylesheet rules,
and with the one .modal-actions .ghost selector that only it matched.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `build exit=0`, the main chunk about 485.50 kB and the main CSS about 133.50 kB, and `0` from the grep.

- [ ] **Step 7: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/d1-after" > "$SCRATCH/d1-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/d1-before" "$SHOTS/d1-after" > "$SCRATCH/d1-cmp.txt" 2>&1; echo "compare exit=$?"; cat "$SCRATCH/d1-cmp.txt"
```

Expected: `compare exit=0`, last line `identical`. The scratch run printed one `NOISE desktop-dash-meal-loading-motion.png: 10 px, and no style, box or page-state difference` before it, the anti-aliasing at the profile button's edge that Phase 4's tool already sets aside; any other line means something rendered changed, so stop. No capture shows the modal, because no state can open it, so `identical` is the expected result rather than a weak one: what it proves is that the CSS deleted with it, and `.modal-actions .ghost`, styled nothing else.

- [ ] **Step 8: Coverage, and the gates**

```bash
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-d1.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/cc-d1.txt"
node "$TOOLS/counts.mjs" . client
```

Expected: `exit=0`, `Tests  2427 passed (2427)`, and the four lines of the table above, every slack positive. Then the full gates (Conventions). The axe scan's open modal is the workout modal, which this task does not touch.

- [ ] **Step 9: Push and open the PR**

```bash
git push -u origin chore/delete-generated-plan-modal
gh pr create --draft --base main --title "chore(client): delete GeneratedPlanModal, which nothing opens" --body-file "$SCRATCH/pr-d1.md"
gh pr ready
gh pr checks --watch
```

`pr-d1.md` outline: why nothing opens it (`21a2d45`, the four `false` calls); what went and what stayed (`planSections`, `downloadPlanPdf`, `.plan-day-detail-*`); `.modal-actions .ghost` and why it dies with the modal; the comments rewritten; the coverage table with before, after and slack; tests 2441 → 2427; bundle sizes; the compare's result; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 10: Review, then merge.** `$SHOTS/d1-after` is D2's chain baseline.

---

### Task D2: The dead CSRF fallback, and the "Enviroment" typo

Two small changes the spec pairs as D2, one commit each.

**The fallback** (`useApiClient.js:56-57`):

<!-- prettier-ignore -->
```js
const csrfToken =
  (await ensureCsrfToken()) || csrfTokenRef.current || readCookie(CSRF_COOKIE_NAME);
```

`ensureCsrfToken` sets `csrfTokenRef.current` to exactly the value it returns, on both of its paths (lines 27 and 40), and its last act before returning `""` is `readCookie(CSRF_COOKIE_NAME)` (line 38), which returned `""`. So when the first operand is empty the second is the same empty string, and the third repeats the read that just failed. The two fallbacks can never supply a token, which the readability effort's #183 recorded (item 7). With them gone nothing reads `csrfTokenRef` (`git grep -n csrfTokenRef -- client` lists lines 18, 27, 40 and 57 and nothing else), so the ref and its two writes go too, and `useRef` leaves the import. Behaviour is unchanged: a write still fetches `/api/csrf-token` whenever no cookie holds a token, and still refuses to send without one. The test comment over "reuses a token across later writes" credits the ref ("Once a token has been issued it is remembered"); the test sets the cookie, and the cookie is what spares the second round trip, so its comment says so.

**The typo.** The planner's first step is titled "Enviroment" (`PlannerSetupModal.jsx:25`), so the heading and the dialog's accessible name (`aria-labelledby` points at the heading) both misspell it, and `PlannerSetupModal.test.jsx:74, 86` pin the misspelling. `git grep -n -i "envirom" -- . ':!docs'` finds exactly those three lines; nothing in `e2e/`, the axe spec included, names the planner at all. This is the one task in the phase with a failing test to write first, and the one whose captures change: the three `dash-planner` captures, where the title is on screen.

**Measured** (`a8aad22` plus D1, then this task):

| Metric     | After D1    | After D2    | After D2, % | Floor | Slack |
| ---------- | ----------- | ----------- | ----------- | ----- | ----- |
| Statements | 4887 / 4943 | 4884 / 4940 | 98.8664     | 98.8  | 3.28  |
| Branches   | 3205 / 3414 | 3202 / 3411 | 93.8728     | 93.8  | 2.48  |
| Functions  | 1006 / 1015 | 1006 / 1015 | 99.1133     | 99    | 1.15  |
| Lines      | 4456 / 4478 | 4453 / 4475 | 99.5084     | 99.4  | 4.85  |

All three statements, branches and lines removed were covered (`useApiClient.js` was 25/25, 22/22, 24/24 and is 22/22, 19/19, 21/21); measured alone against `main` the change is the same −3 / −3 on each. Tests unchanged at 2427.

**Files:**

- Modify: `client/src/app/hooks/useApiClient.js:6, 18-19, 27, 40, 56-57`; `client/src/app/hooks/__tests__/useApiClient.test.jsx:198-199`
- Modify: `client/src/app/components/PlannerSetupModal.jsx:25`; `client/src/app/components/__tests__/PlannerSetupModal.test.jsx:74, 86`

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c chore/csrf-fallback-and-environment-typo origin/main
npm run build > "$SCRATCH/b-d2-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/d2-before" > "$SCRATCH/d2-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/d1-after" "$SHOTS/d2-before"; echo "chain exit=$?"
git grep -n csrfTokenRef -- client; git grep -n -i "envirom" -- . ':!docs'
```

Expected: `identical`; `csrfTokenRef` on lines 18, 27, 40 and 57 of `useApiClient.js` only; the three typo lines.

- [ ] **Step 2: Delete the fallback and the ref (no failing test first: nothing a caller can observe changes)**

In `client/src/app/hooks/useApiClient.js`, replace line 6:

<!-- prettier-ignore -->
```js
import { useCallback, useRef } from "react";
```

with:

<!-- prettier-ignore -->
```js
import { useCallback } from "react";
```

In `client/src/app/hooks/useApiClient.js`, delete line 18 and the blank line after it:

<!-- prettier-ignore -->
```js
  const csrfTokenRef = useRef("");
```

In `client/src/app/hooks/useApiClient.js`, delete line 27:

<!-- prettier-ignore -->
```js
      csrfTokenRef.current = existingToken;
```

In `client/src/app/hooks/useApiClient.js`, delete line 40:

<!-- prettier-ignore -->
```js
    csrfTokenRef.current = issuedToken;
```

In `client/src/app/hooks/useApiClient.js`, replace lines 56-57:

<!-- prettier-ignore -->
```js
        const csrfToken =
          (await ensureCsrfToken()) || csrfTokenRef.current || readCookie(CSRF_COOKIE_NAME);
```

with:

<!-- prettier-ignore -->
```js
        const csrfToken = await ensureCsrfToken();
```

In `client/src/app/hooks/__tests__/useApiClient.test.jsx`, replace lines 198-199:

<!-- prettier-ignore -->
```jsx
    // Once a token has been issued it is remembered, so a burst of writes does
    // not each pay for a round trip.
```

with:

<!-- prettier-ignore -->
```jsx
    // The endpoint sets the cookie, and later writes read it there, so a burst
    // of writes does not each pay for a round trip.
```

- [ ] **Step 3: Mutation check: the guard is still pinned**

The guard that matters stays, now reading `ensureCsrfToken`'s answer directly. Write `$SCRATCH/mut-d2-guard.json`:

```json
[
  {
    "file": "client/src/app/hooks/useApiClient.js",
    "find": "        if (!csrfToken) {\n          throw new Error(\"Security token unavailable. Refresh and try again.\");\n        }\n",
    "text": ""
  }
]
```

```bash
git add client/src/app/hooks && git commit -m "chore(client): drop the CSRF fallback that can never supply a token" -m "ensureCsrfToken sets csrfTokenRef to the value it returns and reads the cookie last, so when it returns nothing the ref and a second cookie read are empty too. The fallback goes, and the ref with it, since nothing else read it." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
node "$TOOLS/mutate.mjs" "$SCRATCH/mut-d2-guard.json"
npx vitest run src/app/hooks/__tests__/useApiClient.test.jsx --root client > "$SCRATCH/d2-mut.txt" 2>&1; echo "exit=$?"; grep -E "Tests |×" "$SCRATCH/d2-mut.txt"
git checkout -- client/src/app/hooks/useApiClient.js; git status --porcelain
```

Expected: `exit=1`, with exactly `refuses to send a write when no token can be obtained` failing (scratch run: `1 failed | 32 passed (33)`), and an empty status.

- [ ] **Step 4: The typo, test first**

In `client/src/app/components/__tests__/PlannerSetupModal.test.jsx`, replace line 74:

<!-- prettier-ignore -->
```jsx
      [1, "Enviroment"],
```

with:

<!-- prettier-ignore -->
```jsx
      [1, "Environment"],
```

In `client/src/app/components/__tests__/PlannerSetupModal.test.jsx`, replace line 86:

<!-- prettier-ignore -->
```jsx
      expect(within(dialog()).getByText("Enviroment")).toBeInTheDocument();
```

with:

<!-- prettier-ignore -->
```jsx
      expect(within(dialog()).getByText("Environment")).toBeInTheDocument();
```

```bash
npx vitest run src/app/components/__tests__/PlannerSetupModal.test.jsx --root client > "$SCRATCH/d2-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests |×" "$SCRATCH/d2-red.txt"
```

Expected: `exit=1`, with `step 1 is titled Environment` and `an out-of-range step falls back to the first title` failing (`2 failed | 36 passed (38)`), because the heading still reads "Enviroment". Then fix the source:

In `client/src/app/components/PlannerSetupModal.jsx`, replace line 25:

<!-- prettier-ignore -->
```jsx
  1: "Enviroment",
```

with:

<!-- prettier-ignore -->
```jsx
  1: "Environment",
```

```bash
npx vitest run src/app/components/__tests__/PlannerSetupModal.test.jsx --root client > "$SCRATCH/d2-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/d2-green.txt"
git grep -n -i "envirom" -- . ':!docs'
git add client/src/app/components
git commit -m "fix(client): the planner's first step is titled Environment" -m "The heading, and so the dialog's accessible name, misspelt it, and two tests pinned the misspelling." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `38 passed (38)`, and no `envirom` anywhere outside `docs/`.

- [ ] **Step 5: The after-capture and the compare**

```bash
npm run build > "$SCRATCH/b-d2.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/d2-after" > "$SCRATCH/d2-cap.txt" 2>&1; echo "capture exit=$?"
```

Write `$SHOTS/d2-expect.json`:

```json
[
  { "kind": "png", "captures": "^(desktop-dash-planner(-motion)?|phone-dash-planner)$" },
  {
    "kind": "style",
    "captures": "^(desktop-dash-planner(-motion)?|phone-dash-planner)$",
    "target": " h2#planner-setup-modal-title$",
    "prop": "^(width|inline-size|perspective-origin|transform-origin)$"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/d2-before" "$SHOTS/d2-after" "$SHOTS/d2-expect.json" > "$SCRATCH/d2-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/d2-cmp.txt"
```

Expected: `compare exit=0`, last line `15 difference(s); 0 unexpected; 0 expected but absent`, as the scratch run printed. What the file allows, in the three planner captures only:

| Where                                                                           | Changes                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the PNG of `desktop-dash-planner`, its `-motion` copy, and `phone-dash-planner` | the title's text (1782, 1782 and 1225 pixels)                                                                                                                                                                   |
| the title, `h2#planner-setup-modal-title`                                       | `width` and `inline-size` `151.766px` → `168.703px` at 1440 px (`119.25px` → `132.562px` at 390 px), and the two origins that follow the width; the heading is centred in its grid cell and as wide as its text |

The CSRF commit changes nothing rendered, so it contributes no row.

- [ ] **Step 6: Coverage, and the gates**

```bash
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-d2.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/cc-d2.txt"
node "$TOOLS/counts.mjs" . client
```

Expected: `exit=0`, `Tests  2427 passed (2427)`, and the four lines of the table above. Then the full gates. The axe scan does not open the planner; its accessible name changes only in spelling.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin chore/csrf-fallback-and-environment-typo
gh pr create --draft --base main --title "chore(client): drop a CSRF fallback that cannot fire, and spell Environment" --body-file "$SCRATCH/pr-d2.md"
gh pr ready
gh pr checks --watch
```

`pr-d2.md` outline: why the fallback cannot supply a token, and why the ref goes with it; the mutation check on the remaining guard; the typo, its red run and its green run; the capture table; the coverage table; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 8: Review, then merge.** `$SHOTS/d2-after` is C3's chain baseline.

---

### Task C3: Delete the walkthrough's body fat, which nothing reads

`usePreviewDerivedData.js:149-151` computes `previewBodyFat`, the last `Number.isFinite(Number(…))` in the client (found in #186, item 4), from `activePreviewProfile.bodyFat` or a BMI estimate (`previewBmi`, line 148). Its one reader is `previewPersonalTargets.computedBodyFat` (line 468), and lines 447-448 already say what is wrong with that: it is in neither fill order, and PreviewPersonalChapter has no field for it. `git grep -n "computedBodyFat\|previewBodyFat\|previewBmi" -- client/src e2e` finds nothing outside this hook and its test.

With `previewBodyFat` gone, nothing reads `activePreviewProfile.bodyFat` either. PreviewStage, the hook's one caller, destructures sixteen values from it (`PreviewStage.jsx:65-82`) and `activePreviewProfile` is not one of them; the hook's own later reads of the profile are its height, weight, days, duration, focuses, environment, equipment, goal and training days. So the line that sets it (`bodyFat: effectiveBodyFat ?? JOHN_DOE_PREVIEW_PROFILE.bodyFat`, line 112) goes, and with it the `effectiveBodyFat` parameter, which feeds nothing else, and the prop that carries it from HomePage through PreviewStage. Keeping them would keep a prop chain whose only end is a field nothing reads: CLAUDE.md's "dead data invites tests that assert on it". **useBodyModel is unchanged:** it still computes `effectiveBodyFat`, which drives the silhouette (`useBodyModel.js:239`) and which its own tests read; HomePage just stops passing it on. `activePreviewProfile` still spreads `JOHN_DOE_PREVIEW_PROFILE`, so it still carries the sample's `bodyFat: 18.4`, as data nothing reads; that is a constant, not code, and stays.

**Tests.** Eight tests in "the measurements it derives" observe `computedBodyFat`. Five test only the body-fat arithmetic or its input (a supplied figure, the two clamps, the null-to-sample fallback, the BMI estimate) and go with it. The other three use it to observe something that stays: a zero or negative height falling back to 175 cm, and a zero weight to 72 kg (`activeHeightCm` and `activeWeightKg`, lines 144-147, which still feed the height and weight the chapter types). Those three are rewritten to observe the typed value instead, and were checked against a mutation of both guards from `> 0` to `>= 0`: the zero-height and zero-weight cases fail, as they should, and the negative case passes, as it must, since `-20 >= 0` is false as well. Four fixtures drop the `effectiveBodyFat` they pass.

**Measured** (`a8aad22` plus D1 and D2, then this task):

| Metric     | After D2    | After C3    | After C3, % | Floor | Slack |
| ---------- | ----------- | ----------- | ----------- | ----- | ----- |
| Statements | 4884 / 4940 | 4882 / 4938 | 98.8659     | 98.8  | 3.26  |
| Branches   | 3202 / 3411 | 3198 / 3407 | 93.8656     | 93.8  | 2.23  |
| Functions  | 1006 / 1015 | 1006 / 1015 | 99.1133     | 99    | 1.15  |
| Lines      | 4453 / 4475 | 4451 / 4473 | 99.5082     | 99.4  | 4.84  |

Tests 2427 → 2422. The four branches are `previewBodyFat`'s ternary and the `??`, all covered (`usePreviewDerivedData.js` goes from 191/224 branches to 187/220); measured alone against `main` the change is the same. A narrower version, deleting only `previewBodyFat`, `previewBmi` and `computedBodyFat` and keeping the prop, measured −2 / −2 statements and branches; it was not chosen because it leaves the dead field.

**Files:**

- Modify: `client/src/pages/home/preview/hooks/usePreviewDerivedData.js:39-44, 54, 98-102, 112, 137, 148-151, 447-448, 467-468, 485-486`
- Modify: `client/src/pages/home/preview/hooks/__tests__/usePreviewDerivedData.test.jsx:25, 266-267, 404-464, 896`
- Modify: `client/src/pages/home/preview/PreviewStage.jsx:37-38, 90`; `client/src/pages/home/preview/__tests__/PreviewStage.test.jsx:110`
- Modify: `client/src/pages/home/HomePage.jsx:121, 191` (byte-order mark; once D1 has merged these are lines 119 and 189); `client/src/pages/home/__tests__/HomePage.test.jsx:50`

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c chore/delete-preview-body-fat origin/main
npm run build > "$SCRATCH/b-c3-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c3-before" > "$SCRATCH/c3-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/d2-after" "$SHOTS/c3-before"; echo "chain exit=$?"
git grep -l "computedBodyFat\|previewBodyFat\|previewBmi\|effectiveBodyFat" -- client/src e2e
```

Expected: `identical`; the grep lists eight files: the hook and its test, PreviewStage and its test, HomePage and its test, useBodyModel and its test.

- [ ] **Step 2: No failing test first.** A pure deletion: nothing a visitor sees is computed from what goes. The three rewritten tests pass before and after; Step 4 checks that they discriminate.

- [ ] **Step 3: The edits**

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, replace lines 39-44:

<!-- prettier-ignore -->
```js
 * and from the chapter state PreviewStage passes in. `resolvedHeightCm`,
 * `resolvedWeightKg` and `effectiveBodyFat` are useBodyModel's figures, passed
 * down by HomePage, and `toFeetInchesFromCm` and `toLb` are app/units.js's
 * converters. Returns the derived values; refs holding the values to type and
 * their order as they were on the first render; and helpers that size a
 * textarea and cut the week's text down to what has been typed so far.
```

with:

<!-- prettier-ignore -->
```js
 * and from the chapter state PreviewStage passes in. `resolvedHeightCm` and
 * `resolvedWeightKg` are useBodyModel's figures, passed down by HomePage, and
 * `toFeetInchesFromCm` and `toLb` are app/units.js's converters. Returns the
 * derived values; refs holding the values to type and their order as they were
 * on the first render; and helpers that size a textarea and cut the week's text
 * down to what has been typed so far.
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, delete line 54:

<!-- prettier-ignore -->
```js
  effectiveBodyFat,
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, replace lines 98-102:

<!-- prettier-ignore -->
```js
  // days picked), and a missing height, weight or body fat takes the sample's
  // number. What follows reads the fields on that basis, so a guard further
  // down that only tests for a missing value, such as the `?? ""` and
  // Array.isArray in previewPersonalTargets, cannot fire; one that tests the
  // value itself, like the session length's `> 0`, is not covered by this.
```

with:

<!-- prettier-ignore -->
```js
  // days picked), and a missing height or weight takes the sample's number.
  // What follows reads the fields on that basis, so a guard further down that
  // only tests for a missing value, such as the `?? ""` and Array.isArray in
  // previewPersonalTargets, cannot fire; one that tests the value itself, like
  // the session length's `> 0`, is not covered by this.
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, delete line 112:

<!-- prettier-ignore -->
```js
      bodyFat: effectiveBodyFat ?? JOHN_DOE_PREVIEW_PROFILE.bodyFat,
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, replace line 137:

<!-- prettier-ignore -->
```js
    [effectiveBodyFat, form, inferredTrainingDayCount, personal, resolvedHeightCm, resolvedWeightKg]
```

with:

<!-- prettier-ignore -->
```js
    [form, inferredTrainingDayCount, personal, resolvedHeightCm, resolvedWeightKg]
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, delete lines 148-151:

<!-- prettier-ignore -->
```js
  const previewBmi = Number((activeWeightKg / (activeHeightCm / 100) ** 2).toFixed(1));
  const previewBodyFat = Number.isFinite(Number(activePreviewProfile.bodyFat))
    ? roundTo(clamp(Number(activePreviewProfile.bodyFat), 3, 60), 1)
    : roundTo(clamp(1.35 * previewBmi - 13.5, 3, 60), 1);
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, delete lines 447-448:

<!-- prettier-ignore -->
```js
  // computedBodyFat is in neither fill order and PreviewPersonalChapter has no
  // field for it, so nothing reads it.
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, replace lines 467-468:

<!-- prettier-ignore -->
```js
        : [],
      computedBodyFat: String(previewBodyFat)
```

with:

<!-- prettier-ignore -->
```js
        : []
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, replace lines 485-486:

<!-- prettier-ignore -->
```js
      activePreviewProfile.trainingDays,
      previewBodyFat
```

with:

<!-- prettier-ignore -->
```js
      activePreviewProfile.trainingDays
```

In `client/src/pages/home/preview/hooks/__tests__/usePreviewDerivedData.test.jsx`, delete line 25:

<!-- prettier-ignore -->
```jsx
      effectiveBodyFat: null,
```

In `client/src/pages/home/preview/hooks/__tests__/usePreviewDerivedData.test.jsx`, replace lines 266-267:

<!-- prettier-ignore -->
```jsx
      resolvedWeightKg: 65,
      effectiveBodyFat: 22
```

with:

<!-- prettier-ignore -->
```jsx
      resolvedWeightKg: 65
```

In `client/src/pages/home/preview/hooks/__tests__/usePreviewDerivedData.test.jsx`, replace lines 404-464:

<!-- prettier-ignore -->
```jsx
    test("a supplied body fat is used as given", () => {
      const { previewPersonalTargets } = render({ effectiveBodyFat: 22.4 });
      expect(previewPersonalTargets.computedBodyFat).toBe("22.4");
    });

    test.each([
/* … 49 more lines … */
        resolvedWeightKg: 0,
        resolvedHeightCm: 183
      });

      // Falls back to 72kg, so 72 / 1.83^2 = 21.5 BMI.
      expect(previewPersonalTargets.computedBodyFat).toBe("15.5");
```

with:

<!-- prettier-ignore -->
```jsx
    test.each([
      ["zero", 0],
      ["negative", -20]
    ])("a %s height is replaced with a usable default", (_label, heightCm) => {
      // An untyped height field is typed from the resolved height, so one that
      // cannot be a height falls back to 175cm rather than typing "0" or "-20".
      const { previewPersonalTargets } = render({ resolvedHeightCm: heightCm });
      expect(previewPersonalTargets.heightCm).toBe("175");
    });

    test("a zero weight is replaced too", () => {
      const { previewPersonalTargets } = render({ resolvedWeightKg: 0 });
      expect(previewPersonalTargets.weight).toBe("72");
```

In `client/src/pages/home/preview/hooks/__tests__/usePreviewDerivedData.test.jsx`, delete line 896:

<!-- prettier-ignore -->
```jsx
          effectiveBodyFat: null,
```

In `client/src/pages/home/preview/PreviewStage.jsx`, replace lines 37-38:

<!-- prettier-ignore -->
```jsx
  resolvedWeightKg,
  effectiveBodyFat
```

with:

<!-- prettier-ignore -->
```jsx
  resolvedWeightKg
```

In `client/src/pages/home/preview/PreviewStage.jsx`, delete line 90:

<!-- prettier-ignore -->
```jsx
    effectiveBodyFat,
```

In `client/src/pages/home/preview/__tests__/PreviewStage.test.jsx`, delete line 110:

<!-- prettier-ignore -->
```jsx
      effectiveBodyFat={18}
```

In `client/src/pages/home/HomePage.jsx`, delete line 121:

<!-- prettier-ignore -->
```jsx
    effectiveBodyFat,
```

In `client/src/pages/home/HomePage.jsx`, delete line 191:

<!-- prettier-ignore -->
```jsx
                effectiveBodyFat={effectiveBodyFat}
```

In `client/src/pages/home/__tests__/HomePage.test.jsx`, delete line 50:

<!-- prettier-ignore -->
```jsx
    effectiveBodyFat: 18,
```

The test block at 404-464 is the eight body-fat tests; the three that replace it keep their place, ahead of "a typed height is preferred over the resolved one".

- [ ] **Step 4: Prove it, mutation-check the rewritten tests, commit**

```bash
git grep -n "computedBodyFat\|previewBodyFat\|previewBmi" -- client/src e2e
git grep -l "effectiveBodyFat" -- client/src e2e
npx prettier --write client/src/pages/home/preview/hooks/usePreviewDerivedData.js client/src/pages/home/preview/hooks/__tests__/usePreviewDerivedData.test.jsx client/src/pages/home/preview/PreviewStage.jsx client/src/pages/home/preview/__tests__/PreviewStage.test.jsx client/src/pages/home/HomePage.jsx client/src/pages/home/__tests__/HomePage.test.jsx
head -c 3 client/src/pages/home/HomePage.jsx | od -An -tx1
npx vitest run src/pages/home --root client > "$SCRATCH/c3-home.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c3-home.txt"
git add client/src/pages/home
git commit -m "chore(client): delete the walkthrough's body fat, which nothing reads" -m "previewBodyFat fed only previewPersonalTargets.computedBodyFat, which is in neither fill order and has no field. With it go the profile's bodyFat line, the only reader of effectiveBodyFat, and the prop that carried it from HomePage; useBodyModel still computes it for the silhouette. The height and weight fallback tests observe the typed values instead of the estimate." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: the first grep prints nothing; the second lists `useBodyModel.js` and `useBodyModel.test.jsx` only; `ef bb bf`; `exit=0`.

Write `$SCRATCH/mut-c3.json`:

```json
[
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "    Number(activePreviewProfile.heightCm) > 0 ? Number(activePreviewProfile.heightCm) : 175;\n",
    "text": "    Number(activePreviewProfile.heightCm) >= 0 ? Number(activePreviewProfile.heightCm) : 175;\n"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "    Number(activePreviewProfile.weightKg) > 0 ? Number(activePreviewProfile.weightKg) : 72;\n",
    "text": "    Number(activePreviewProfile.weightKg) >= 0 ? Number(activePreviewProfile.weightKg) : 72;\n"
  }
]
```

```bash
node "$TOOLS/mutate.mjs" "$SCRATCH/mut-c3.json"
npx vitest run src/pages/home/preview/hooks/__tests__/usePreviewDerivedData.test.jsx --root client > "$SCRATCH/c3-mut.txt" 2>&1; echo "exit=$?"; grep -E "Tests |×" "$SCRATCH/c3-mut.txt"
git checkout -- client/src/pages/home/preview/hooks/usePreviewDerivedData.js; git status --porcelain
```

Expected: `exit=1`, with `a zero height is replaced with a usable default` and `a zero weight is replaced too` failing (`2 failed | 115 passed (117)`), and an empty status.

- [ ] **Step 5: The after-capture and the compare**

```bash
npm run build > "$SCRATCH/b-c3.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c3-after" > "$SCRATCH/c3-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c3-before" "$SHOTS/c3-after" > "$SCRATCH/c3-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c3-cmp.txt"
```

Expected: `compare exit=0`, `identical`, as the scratch run against `main` printed. The four walkthrough chapters are in the set at both widths, so this shows the walkthrough types and draws the same values.

- [ ] **Step 6: Coverage, and the gates**

```bash
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-c3.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/cc-c3.txt"
node "$TOOLS/counts.mjs" . client
```

Expected: `Tests  2422 passed (2422)` and the table's four lines. Then the full gates.

- [ ] **Step 7: Push, PR, review, merge**

```bash
git push -u origin chore/delete-preview-body-fat
gh pr create --draft --base main --title "chore(client): delete the walkthrough's body fat, which nothing reads" --body-file "$SCRATCH/pr-c3.md"
gh pr ready
gh pr checks --watch
```

`pr-c3.md` outline: what read `previewBodyFat` (only a field nothing reads); why the prop goes too and useBodyModel stays; the tests deleted and the three rewritten, with the mutation result; the coverage table; the compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. `$SHOTS/c3-after` is C4's chain baseline.

---

### Task C4: One copy of `IMPERIAL_REGION_CODES`

The set of regions that use imperial units is defined twice, identically: privately in `app/units.js:7`, which `getPreferredMeasurementSystem` reads to pick App's height and weight units, and exported from `home/preview/constants.js:10`, which `usePreviewDerivedData` reads to pick the walkthrough's (found in #196's report, item 3; constants.js's own comment says so). `app/units.js` is the shared module (its header lists the home flow and its preview among its users, and the hook already imports `getRegionFromLocale` from it), so it keeps the one copy and exports it; the walkthrough's goes. The two rules that read it stay different on purpose, as the hook's comment at lines 60-66 says: App checks every preferred language, the walkthrough only the first.

`git grep -n "IMPERIAL_REGION_CODES" -- client e2e` lists `units.js:7, 47, 58`, `constants.js:10` and `usePreviewDerivedData.js:9, 62, 87`, and no test. The new export gets a `/** */` summary (SOP rule 2).

**Measured** (`a8aad22` plus D1, D2 and C3, then this task):

| Metric     | After C3    | After C4    | After C4, % | Floor | Slack |
| ---------- | ----------- | ----------- | ----------- | ----- | ----- |
| Statements | 4882 / 4938 | 4881 / 4937 | 98.8657     | 98.8  | 3.24  |
| Branches   | 3198 / 3407 | 3198 / 3407 | 93.8656     | 93.8  | 2.23  |
| Functions  | 1006 / 1015 | 1006 / 1015 | 99.1133     | 99    | 1.15  |
| Lines      | 4451 / 4473 | 4450 / 4472 | 99.5081     | 99.4  | 4.83  |

The one statement is the deleted `new Set(...)` (`constants.js` goes from 55/55 to 54/54). Tests unchanged at 2422.

**Files:**

- Modify: `client/src/app/units.js:7`; `client/src/pages/home/preview/constants.js:7-10`; `client/src/pages/home/preview/hooks/usePreviewDerivedData.js:9, 15`

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c refactor/one-imperial-region-set origin/main
npm run build > "$SCRATCH/b-c4-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c4-before" > "$SCRATCH/c4-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c3-after" "$SHOTS/c4-before"; echo "chain exit=$?"
```

Expected: `identical`.

- [ ] **Step 2: No failing test first.** The set's contents do not change, so nothing a test could pin changes. `units.test.js` and `usePreviewDerivedData.test.jsx` already drive both readers through stubbed locales (CLAUDE.md's locale-block notes), and both must stay green.

- [ ] **Step 3: The edits**

In `client/src/app/units.js`, replace line 7:

<!-- prettier-ignore -->
```js
const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);
```

with:

<!-- prettier-ignore -->
```js

/**
 * The regions that measure height in feet and inches and weight in pounds.
 * getPreferredMeasurementSystem picks App's units by it, and usePreviewDerivedData
 * the walkthrough's.
 */
export const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);
```

In `client/src/pages/home/preview/constants.js`, delete lines 7-10:

<!-- prettier-ignore -->
```js
// The regions for which usePreviewDerivedData types the height in feet and
// inches and gives the dashboard's target weight in pounds. App's own unit
// choice reads a private copy of the same set in app/units.js.
export const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, delete line 9:

<!-- prettier-ignore -->
```js
  IMPERIAL_REGION_CODES,
```

In `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, replace line 15:

<!-- prettier-ignore -->
```js
import { getRegionFromLocale } from "../../../../app/units";
```

with:

<!-- prettier-ignore -->
```js
import { IMPERIAL_REGION_CODES, getRegionFromLocale } from "../../../../app/units";
```

(The replacement in `units.js` opens with a blank line, so the file header and the new summary stay apart.)

- [ ] **Step 4: Prove it, commit, capture**

```bash
git grep -n "IMPERIAL_REGION_CODES" -- client e2e
npx prettier --write client/src/app/units.js client/src/pages/home/preview/constants.js client/src/pages/home/preview/hooks/usePreviewDerivedData.js
npx vitest run src/app/__tests__/units.test.js src/pages/home/preview --root client > "$SCRATCH/c4-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c4-tests.txt"
git add client/src && git commit -m "refactor(client): one copy of IMPERIAL_REGION_CODES" -m "app/units.js and the walkthrough's constants each defined the same set. units.js, the shared module, exports it and the walkthrough imports it." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
npm run build > "$SCRATCH/b-c4.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c4-after" > "$SCRATCH/c4-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c4-before" "$SHOTS/c4-after" > "$SCRATCH/c4-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c4-cmp.txt"
```

Expected: the grep lists `units.js` (the export at line 13, and lines 53 and 64, the two old references moved down by the summary) and `usePreviewDerivedData.js` (the import at line 14, and lines 61 and 86), nothing in `constants.js`; `exit=0`; `compare exit=0`, `identical` (the scratch run's result). The captures run with an `en-US` locale, so they show the walkthrough still typing feet and inches and pounds.

- [ ] **Step 5: Coverage, gates, PR**

```bash
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-c4.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/cc-c4.txt"
node "$TOOLS/counts.mjs" . client
git push -u origin refactor/one-imperial-region-set
gh pr create --draft --base main --title "refactor(client): one copy of IMPERIAL_REGION_CODES" --body-file "$SCRATCH/pr-c4.md"
gh pr ready
gh pr checks --watch
```

Expected: `Tests  2422 passed (2422)` and the table's four lines; then the full gates before `gh pr ready`. `pr-c4.md`: the two copies and which stays; the coverage table; the compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Review, then merge. `$SHOTS/c4-after` is C5's chain baseline.

---

### Task C5: The never-matching selectors from the PR 11 list

The readability effort's PR 11 (#197) deleted every rule whose classes nothing renders, and left two kinds it was not scoped for, which Phase 4 routed here. Each was re-verified on `a8aad22`: every class's users grepped across `client/src` and `e2e/`, and every selector run against all 44 captured DOMs with `selector-probe.mjs` (Tools), which loads each `<name>.dom.html` with scripts off and counts the elements a selector matches with its state pseudo-classes stripped. All of these match **0** elements in all 44, while the controls beside them match where they should (`.planner-setup-modal .modal-actions .cta` in the three planner captures, `.header-top` in the 17 dashboard captures, `.back-btn` 30 times across the home stages, `.modal.dashboard-modal .cta` in the three workout-modal captures).

**Live classes in selectors that match nothing** (#187, #188):

| Selector                                                             | Where (`a8aad22`)                                                                      | Why it matches nothing                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.planner-setup-modal .modal-actions .back-btn`, four rules          | `app/styles/planner/interactions.css:177-208`                                          | PlannerSetupModal's `.modal-actions` (`PlannerSetupModal.jsx:265`) holds only `.cta` buttons. Its one `.back-btn` is the header arrow, in `.modal-header` (`:104`)                                                                 |
| `.planner-setup-modal .modal-actions .ghost`, in three lists         | `planner/interactions.css:147, 162, 171`                                               | The same: no `.ghost` in that `.modal-actions`. Its `.ghost` is the close button, also in the header (`:129`)                                                                                                                      |
| `.modal.dashboard-modal .back-btn`, in two lists                     | `pages/dashboard/styles/theme.css:424, 432`                                            | None of the four `.dashboard-modal`s (DashboardWorkoutModal, MealDetailsModal, ExerciseDetailsModal, PlansView's day modal) renders a `.back-btn`; the only dashboard `.back-btn` is DashboardHomeView's, in the page              |
| `.home-page .header-top`, `.header-left`, `.auth-actions`, six rules | `pages/home/styles/core/shell.css:145-166`, `pages/home/styles/responsive.css:109-125` | Only DashboardHeader renders the three classes, and only DashboardPage renders DashboardHeader, inside `.dashboard-page`. The three pages that carry `home-page` (HomePage, AuthPage, WorkoutResultPage) render no DashboardHeader |

**Three dead `:is()` entries** (#197, "Kept"): `.preview-generate-label`, `.preview-field-row span` and `.preview-field-row .preview-field-input` in the walkthrough's copy-size rule (`pages/home/preview/styles/form-overrides.css:74-91`). Their classes are rendered by nothing (`css-sweep.mjs` reports exactly these three on `main`), but PR 11 left them because removing them is a cascade change rather than a pure deletion: `:is()` takes its most specific argument, so the rule counts as (0,3,0) only because of the third, and is (0,2,1) without them. So the change is safe only if no rule that sets a font size on the same elements sits in the band between. `font-rivals.mjs` (Tools) lists every rule in the built CSS that sets `font-size` or `font` with a selector from (0,2,1) to (0,3,0). On `a8aad22`'s main CSS: SummaryView's `.summary-view .overview-card h3`, `.summary-view .stat-row h3` and `.summary-view .summary-range-toggle button`; the dashboard toast's three (0,3,0) rules; `.home-page .unit-toggle button` and `.home-page .segmented button`; and the copy-size rule itself. In the seven lazy view sheets, thirteen more, all scoped to a dashboard view or its modal. None can match an element the copy-size rule matches: the dashboard and its modals are not inside `.preview-stage-panel`, and the two `.home-page` rules match `button`s while every copy-size target is a `label`, `input`, `select` or `textarea`, or a `p`, `span` or `li` with one of the listed classes (the two `.preview-builder-btn` are `span`s, `PreviewPersonalChapter.jsx:275, 285`). So no element's font size changes, and the captures confirm it at 1440 and 390 px. Afterwards the sweep reports **0** unreferenced classes.

**Not on the list, found while re-verifying it** (owner's call; Step 4 is optional and can be dropped from the PR): four more selectors in `styles/base.css` match nothing for the same reason. `.ghost.back-btn` and `.modal .ghost.back-btn`, in the three back-button lists at lines 343-345, 361-363 and 372-374, need an element with both classes, and none has: the six `.back-btn`s (`PlannerSetupModal.jsx:104`, `DashboardHomeView.jsx:17`, `HomePersonalStage.jsx:358`, `HomeVisualizerStage.jsx:64`, `HomeWorkoutMeasure.jsx:29`, `HomeWorkoutStage.jsx:30`) are all static class strings without `ghost`, and nothing adds a class at run time except `preview-smooth-scroll`, `no-scroll` and the two particle classes. `.modal-actions .back-btn` in the 720 px block (line 484) needs a `.back-btn` inside a `.modal-actions`, and the planner's is in its header. All four probe at 0 in the 44 DOMs, and a scratch build with Step 4 on top of D1 and Steps 2-3 captured `identical` to `main`.

Spec default #9 does not apply here: these are rules that match nothing, not cascade bugs, and their deletion is what the routing asked for. CSS only: no statement, branch or function changes, so the counts must equal C4's exactly.

**Files:**

- Modify: `client/src/app/styles/planner/interactions.css:147, 162, 171, 177-208` (byte-order mark)
- Modify: `client/src/pages/dashboard/styles/theme.css:423-424, 431-432` (byte-order mark)
- Modify: `client/src/pages/home/styles/core/shell.css:145-167`; `client/src/pages/home/styles/responsive.css:57, 109-126`
- Modify: `client/src/pages/home/preview/styles/form-overrides.css:71-79`
- Optional (Step 4): `client/src/styles/base.css:343-345, 361-363, 372-374, 482-484` (lines as on `main` after D1, which removed line 483)

- [ ] **Step 1: Branch, the before-capture, the sweep and the probe**

```bash
git fetch origin && git switch -c chore/remove-never-matching-css origin/main
npm run build > "$SCRATCH/b-c5-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c5-before" > "$SCRATCH/c5-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c4-after" "$SHOTS/c5-before"; echo "chain exit=$?"
node "$TOOLS/css-sweep.mjs" . > "$SCRATCH/sweep-c5-0.txt" 2>&1; grep "^unreferenced" "$SCRATCH/sweep-c5-0.txt"
CSS=$(ls client/dist/assets/index-*.css); node "$TOOLS/font-rivals.mjs" . "$CSS" | cut -c1-120
```

Write `$SCRATCH/c5-selectors.json`, the removed selectors and four controls:

```json
[
  ".planner-setup-modal .modal-actions .back-btn",
  ".planner-setup-modal .modal-actions .ghost",
  ".modal.dashboard-modal .back-btn",
  ".home-page .header-top",
  ".home-page .header-left",
  ".home-page .auth-actions",
  ".preview-generate-label",
  ".preview-field-row span",
  ".preview-field-row .preview-field-input",
  ".ghost.back-btn",
  ".modal .ghost.back-btn",
  ".modal-actions .back-btn",
  ".modal-actions .ghost",
  ".plan-modal",
  ".plan-tabs",
  ".plan-day",
  ".planner-setup-modal .modal-actions .cta",
  ".header-top",
  ".back-btn",
  ".modal.dashboard-modal .cta"
]
```

```bash
node "$TOOLS/selector-probe.mjs" . "$SHOTS/c5-before" "$SCRATCH/c5-selectors.json"
```

Expected: `identical`; the three unreferenced `.preview-field-input`, `.preview-field-row` and `.preview-generate-label`; the rivals listed above and nothing else in the band; and `0` for every selector but the last four, which print 3, 17, 30 and 3 (the scratch run on `main`, where `.plan-modal`, `.plan-tabs`, `.plan-day` and `.modal-actions .ghost` also printed 0; after D1 they no longer exist in any stylesheet).

- [ ] **Step 2: No failing test first.** CSS deletions: nothing a test runs changes.

- [ ] **Step 3: Delete the listed selectors, and trim the `:is()`**

Each deleted block takes the blank line after it with it, so no double blank line is left.

In `client/src/app/styles/planner/interactions.css`, delete line 147:

<!-- prettier-ignore -->
```css
.planner-setup-modal .modal-actions .ghost,
```

In `client/src/app/styles/planner/interactions.css`, delete line 162:

<!-- prettier-ignore -->
```css
.planner-setup-modal .modal-actions .ghost:hover,
```

In `client/src/app/styles/planner/interactions.css`, delete line 171:

<!-- prettier-ignore -->
```css
.planner-setup-modal .modal-actions .ghost:active,
```

In `client/src/app/styles/planner/interactions.css`, delete lines 177-208:

<!-- prettier-ignore -->
```css
/* ---- Back button in the actions row -------------------------------------- */
/* Matches nothing: PlannerSetupModal puts only .cta buttons in .modal-actions. Its back
   button is the header arrow, styled below. */
.planner-setup-modal .modal-actions .back-btn {
  background: linear-gradient(120deg, #ff873a, #ff3d58) !important;
  border-color: rgba(255, 106, 88, 0.94) !important;
  color: #fff !important;
  box-shadow:
    0 0 12px rgba(255, 61, 88, 0.56),
    0 0 28px rgba(255, 135, 58, 0.38) !important;
}

.planner-setup-modal .modal-actions .back-btn:hover:not(:disabled) {
  background: linear-gradient(120deg, #ff873a, #ff3d58) !important;
  border-color: rgba(255, 106, 88, 0.94) !important;
  color: #fff !important;
  box-shadow:
    0 0 16px rgba(255, 61, 88, 0.68),
    0 0 34px rgba(255, 135, 58, 0.46) !important;
}

.planner-setup-modal .modal-actions .back-btn:active:not(:disabled),
.planner-setup-modal .modal-actions .back-btn:focus-visible {
  background: linear-gradient(120deg, #ff873a, #ff3d58) !important;
  border-color: rgba(255, 106, 88, 0.94) !important;
  color: #fff !important;
}

.planner-setup-modal .modal-actions .back-btn:disabled {
  opacity: 1;
  box-shadow: none;
}
```

In `client/src/pages/dashboard/styles/theme.css`, replace lines 423-424:

<!-- prettier-ignore -->
```css
.modal.dashboard-modal .cta,
.modal.dashboard-modal .back-btn {
```

with:

<!-- prettier-ignore -->
```css
.modal.dashboard-modal .cta {
```

In `client/src/pages/dashboard/styles/theme.css`, replace lines 431-432:

<!-- prettier-ignore -->
```css
.modal.dashboard-modal .cta:hover:not(:disabled),
.modal.dashboard-modal .back-btn:hover:not(:disabled) {
```

with:

<!-- prettier-ignore -->
```css
.modal.dashboard-modal .cta:hover:not(:disabled) {
```

In `client/src/pages/home/styles/core/shell.css`, delete lines 145-166:

<!-- prettier-ignore -->
```css
/* ---- Rules that match nothing -------------------------------------------- */
/* Only DashboardHeader renders .header-top, .header-left and .auth-actions, and the
   dashboard page does not carry home-page. responsive.css has three more like these. */
.home-page .header-top {
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.home-page .header-left {
  grid-column: 2;
  justify-items: center;
  text-align: center;
  margin-left: 0;
}

.home-page .auth-actions {
  grid-column: 3;
  justify-content: flex-end;
  justify-self: end;
}
```

In `client/src/pages/home/styles/responsive.css`, replace line 57:

<!-- prettier-ignore -->
```css
   keeps its two columns. .header-top, .header-left and .auth-actions match nothing. */
```

with:

<!-- prettier-ignore -->
```css
   keeps its two columns. */
```

In `client/src/pages/home/styles/responsive.css`, delete lines 109-125:

<!-- prettier-ignore -->
```css
  .home-page .header-top {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }

  .home-page .header-left {
    grid-column: auto;
    justify-items: center;
    text-align: center;
  }

  .home-page .auth-actions {
    grid-column: auto;
    justify-self: center;
    justify-content: center;
  }
```

In `client/src/pages/home/preview/styles/form-overrides.css`, replace lines 71-79:

<!-- prettier-ignore -->
```css
/* :is() takes its most specific argument, so this counts as (0,3,0) only because of
   .preview-field-row .preview-field-input, one of three entries that name classes nothing
   renders; without them it would be (0,2,1). */
.preview-stage-panel
  :is(
    .preview-stage-kicker,
    .preview-generate-label,
    .preview-field-row span,
    .preview-field-row .preview-field-input,
```

with:

<!-- prettier-ignore -->
```css
/* :is() takes its most specific argument, so this counts as (0,2,1), from the
   .preview-personal-form entries. */
.preview-stage-panel
  :is(
    .preview-stage-kicker,
```

No `@media` block is left empty, and no rule is moved (SOP rule 5). The trimmed theme.css rules keep their `!important`s: they still compete with `styles/base.css`'s `.modal .cta` and the page-level `.dashboard-page .cta`.

- [ ] **Step 4 (optional, owner's call): the four `styles/base.css` selectors found while re-verifying**

In `client/src/styles/base.css`, replace lines 343-345:

<!-- prettier-ignore -->
```css
.back-btn,
.ghost.back-btn,
.modal .ghost.back-btn {
```

with:

<!-- prettier-ignore -->
```css
.back-btn {
```

In `client/src/styles/base.css`, replace lines 361-363:

<!-- prettier-ignore -->
```css
.back-btn:hover:not(:disabled),
.ghost.back-btn:hover:not(:disabled),
.modal .ghost.back-btn:hover:not(:disabled) {
```

with:

<!-- prettier-ignore -->
```css
.back-btn:hover:not(:disabled) {
```

In `client/src/styles/base.css`, replace lines 372-374:

<!-- prettier-ignore -->
```css
.back-btn:disabled,
.ghost.back-btn:disabled,
.modal .ghost.back-btn:disabled {
```

with:

<!-- prettier-ignore -->
```css
.back-btn:disabled {
```

In `client/src/styles/base.css`, replace lines 482-483:

<!-- prettier-ignore -->
```css
  .modal-actions .cta,
  .modal-actions .back-btn {
```

with:

<!-- prettier-ignore -->
```css
  .modal-actions .cta {
```

The last edit's anchor is D1's result (D1 removed `.modal-actions .ghost,` from between these two lines).

- [ ] **Step 5: Prove it, commit**

```bash
npx prettier --write client/src/app/styles/planner/interactions.css client/src/pages/dashboard/styles/theme.css client/src/pages/home/styles/core/shell.css client/src/pages/home/styles/responsive.css client/src/pages/home/preview/styles/form-overrides.css client/src/styles/base.css
for f in client/src/app/styles/planner/interactions.css client/src/pages/dashboard/styles/theme.css; do printf "%s " $f; head -c 3 $f | od -An -tx1; done
node "$TOOLS/css-sweep.mjs" . > "$SCRATCH/sweep-c5.txt" 2>&1; tail -1 "$SCRATCH/sweep-c5.txt"
git grep -n -E "match(es)? nothing|never match" -- 'client/src/*.css'
npm run build > "$SCRATCH/b-c5.txt" 2>&1; echo "build exit=$?"; grep -E "index-.*\.css " "$SCRATCH/b-c5.txt"
CSS=$(ls client/dist/assets/index-*.css); grep -c -E "modal-actions \.back-btn|dashboard-modal \.back-btn|home-page \.header-|home-page \.auth-actions|preview-field-row|preview-generate-label" "$CSS"
git add client/src
git commit -m "chore(css): remove selectors that match nothing" -m "The never-matching selectors the readability effort's PR 11 left: live classes in places no element puts them, and the copy-size rule's three entries for classes nothing renders. Its specificity drops from (0,3,0) to (0,2,1), and no font-size rule in that band can match its elements." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: two `ef bb bf`; `0 unreferenced, 23 maybe dynamic, over 48 stylesheets and 87 source files`; the grep finds no comment calling a rule dead any more; `build exit=0` and the main CSS down from D1's 133.50 kB to about 131.9 kB (131.65 kB with Step 4, in the scratch build of D1 with Steps 3 and 4; Step 3 alone on `main` took it from 135.33 kB to 133.69 kB); `0` from the last grep (if Step 4 was dropped, `modal-actions \.back-btn` still matches once, so expect `1`).

- [ ] **Step 6: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/c5-after" > "$SCRATCH/c5-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c5-before" "$SHOTS/c5-after" > "$SCRATCH/c5-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c5-cmp.txt"
```

Expected: `compare exit=0`, `identical`: the scratch runs of Step 3 alone on `main`, and of D1 with Steps 3 and 4, both printed exactly that.

- [ ] **Step 7: Coverage unchanged, the gates, the PR**

```bash
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-c5.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/cc-c5.txt"
node "$TOOLS/counts.mjs" . client
git push -u origin chore/remove-never-matching-css
gh pr create --draft --base main --title "chore(css): remove selectors that match nothing" --body-file "$SCRATCH/pr-c5.md"
gh pr ready
gh pr checks --watch
```

Expected: exactly C4's counts (4881 / 4937, 3198 / 3407, 1006 / 1015, 4450 / 4472) and `Tests  2422 passed (2422)`; then the full gates. `pr-c5.md` outline: the table of selectors and why each matches nothing; the probe's output; the `:is()` analysis with `font-rivals.mjs`'s output; whether Step 4 was taken; the sweep before and after; the compare; bundle sizes; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Review, then merge. `$SHOTS/c5-after` is C6's chain baseline.

---

### Task C6 (optional, owner's decision): Fold two client number helpers into `toNumberOrNull`

**Owner decision.** Phase 3's client plan marked this "Phase 5, as a deletion, or left as it is. Owner's call", and it stays that: this task is measured and written so that it can be run as it stands, and skipped with no effect on any other task or on D3's floors (see "Ordering"). The readability effort's PR 10 (#196) left both copies alone on purpose, because its plan excluded the numeric helpers the contract test enumerates unless their rows changed in the same PR, which this task does.

`app/units.js:85-89`'s `toNumberOrNull` (Phase 3's C2) has two private twins with the same three lines: `toProfileNumber` in `app/profileMapping.js:19-23` (exported only for its tests and the contract test) and `toFiniteNumber` in `pages/home/hooks/useBodyModel.js:12-16`. Folding them leaves one guard-before-coerce helper on the client besides `physique/math.js`'s `toFiniteNumber(value, fallback)`, whose fallback argument makes it a different function.

- **profileMapping.js** imports `toNumberOrNull`; `toProfileNumber` and its summary go. The summary's reason (a 0 is outside every numeric range in the server's profile schema, so the save would be refused, and a blank height could not fall back to the other unit) moves into `personalToProfile`'s summary, the one place it still applies.
- **useBodyModel.js** imports `toNumberOrNull` from `app/units` (as `useDashboardMetrics.js` already does); its `toFiniteNumber` and the comment above it go.
- **Tests.** `profileMapping.test.js`'s `describe("toProfileNumber")` (seven tests) and the contract test's `toProfileNumber` row (seven) go: `toNumberOrNull`'s own row already pins all seven cases on the same body. The contract test's closing note on `useBodyModel.js`'s private helper goes, because the helper is gone and the table covers what replaces it. Two comments in `useBodyModel.test.jsx` that name the private `toFiniteNumber` name `toNumberOrNull` instead; the second also stops narrating the 3% bug's history and says what the guard prevents, in the present tense.

**Measured** (`a8aad22` plus D1 to C5, then this task):

| Metric     | After C5    | After C6    | After C6, % | Floor | Slack |
| ---------- | ----------- | ----------- | ----------- | ----- | ----- |
| Statements | 4881 / 4937 | 4871 / 4927 | 98.8634     | 98.8  | 3.12  |
| Branches   | 3198 / 3407 | 3184 / 3393 | 93.8403     | 93.8  | 1.37  |
| Functions  | 1006 / 1015 | 1004 / 1013 | 99.1115     | 99    | 1.13  |
| Lines      | 4450 / 4472 | 4442 / 4464 | 99.5072     | 99.4  | 4.78  |

Tests 2422 → 2408. Everything removed was covered (`profileMapping.js` 24/24 → 19/19 statements and 73/73 → 66/66 branches; `useBodyModel.js` 155/155 → 150/150 and 74/74 → 67/67), so every percentage falls a little; measured alone against `main` the change is the same (−10 / −10, −14 / −14, −2 / −2, −8 / −8), which also passes. It costs 0.86 of the client's branch slack, the most of any client task.

**What proves it.** The three bodies are character-for-character the same, so no answer changes. A mutation of the shared helper (deleting its guard) fails eleven tests across the contract test, `profileMapping.test.js` and `useBodyModel.test.jsx` (`11 failed | 96 passed (107)` in the scratch run), so both callers stay pinned through it. The captures include the physique stage (`visualizer`, at both widths and with motion), which the body model draws.

**Files:**

- Modify: `client/src/app/profileMapping.js:6-23, 33-35, 50-51, 58, 68, 70`; `client/src/app/__tests__/profileMapping.test.js:2, 14-40`
- Modify: `client/src/pages/home/hooks/useBodyModel.js:8-16, 140-141, 156, 168, 184`; `client/src/pages/home/hooks/__tests__/useBodyModel.test.jsx:8, 169-174`
- Modify: `client/src/__tests__/numericCoercion.contract.test.js:3, 32-36, 72-79`

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c refactor/fold-client-number-helpers origin/main
npm run build > "$SCRATCH/b-c6-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c6-before" > "$SCRATCH/c6-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c5-after" "$SHOTS/c6-before"; echo "chain exit=$?"
git grep -n "toProfileNumber\|toFiniteNumber" -- client/src ':!client/src/pages/home/components/physique'
```

Expected: `identical`; the grep lists `profileMapping.js` and its test, the contract test (its import, its row, the physique `toFiniteNumber` row, and the closing note), and `useBodyModel.js` and its test.

- [ ] **Step 2: No failing test first.** The bodies are identical, so there is no behaviour to pin; Step 4's mutation shows the callers' tests reach the shared helper.

- [ ] **Step 3: The edits**

In `client/src/app/profileMapping.js`, replace lines 6-23:

<!-- prettier-ignore -->
```js
import { splitFullName, toCmFromFeetInches, toFeetInchesFromCm, toKg, toLb } from "./units";
import { defaultPersonalForm } from "./constants";

/**
 * A form value as a profile number, or null when it is blank or not a number.
 * It guards before it coerces: `Number("")` and `Number(null)` are both 0 and
 * both finite, so testing afterwards would turn an unfilled field into a
 * measured 0. A 0 is outside every numeric range in the server's profile schema
 * (apiSchemaService.js), so the whole save would be refused with a 400, and a
 * blank height in personalToProfile's active unit could not fall back to the
 * other one.
 * Same shape as toNullableNumber in the server's dashboardDataBuildersService.
 */
export const toProfileNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
```

with:

<!-- prettier-ignore -->
```js
import {
  splitFullName,
  toCmFromFeetInches,
  toFeetInchesFromCm,
  toKg,
  toLb,
  toNumberOrNull
} from "./units";
import { defaultPersonalForm } from "./constants";
```

In `client/src/app/profileMapping.js`, replace lines 33-35:

<!-- prettier-ignore -->
```js
 * toProfileNumber, height in centimetres from whichever unit is active, and
 * weight in kilograms. `units` holds `heightUnit` ("cm" or "ft") and
 * `weightUnit` ("kg" or "lb"), metric when absent.
```

with:

<!-- prettier-ignore -->
```js
 * toNumberOrNull, height in centimetres from whichever unit is active, and
 * weight in kilograms. `units` holds `heightUnit` ("cm" or "ft") and
 * `weightUnit` ("kg" or "lb"), metric when absent.
 *
 * A blank field is null, never 0: a 0 is outside every numeric range in the
 * server's profile schema (apiSchemaService.js), so the whole save would be
 * refused with a 400, and a blank height in the active unit could not fall back
 * to the other one.
```

In `client/src/app/profileMapping.js`, replace lines 50-51:

<!-- prettier-ignore -->
```js
  const fromCm = toProfileNumber(source.heightCm);
  const fromImperial = toProfileNumber(toCmFromFeetInches(source.heightFeet, source.heightInches));
```

with:

<!-- prettier-ignore -->
```js
  const fromCm = toNumberOrNull(source.heightCm);
  const fromImperial = toNumberOrNull(toCmFromFeetInches(source.heightFeet, source.heightInches));
```

In `client/src/app/profileMapping.js`, replace line 58:

<!-- prettier-ignore -->
```js
    age: toProfileNumber(source.age),
```

with:

<!-- prettier-ignore -->
```js
    age: toNumberOrNull(source.age),
```

In `client/src/app/profileMapping.js`, replace line 68:

<!-- prettier-ignore -->
```js
    weightKg: toProfileNumber(toKg(source.weight, weightUnit)),
```

with:

<!-- prettier-ignore -->
```js
    weightKg: toNumberOrNull(toKg(source.weight, weightUnit)),
```

In `client/src/app/profileMapping.js`, replace line 70:

<!-- prettier-ignore -->
```js
    bodyFat: toProfileNumber(source.bodyFat),
```

with:

<!-- prettier-ignore -->
```js
    bodyFat: toNumberOrNull(source.bodyFat),
```

In `client/src/app/__tests__/profileMapping.test.js`, replace line 2:

<!-- prettier-ignore -->
```js
import { personalToProfile, profileToPersonal, toProfileNumber } from "../profileMapping";
```

with:

<!-- prettier-ignore -->
```js
import { personalToProfile, profileToPersonal } from "../profileMapping";
```

In `client/src/app/__tests__/profileMapping.test.js`, delete lines 14-40:

<!-- prettier-ignore -->
```js
describe("toProfileNumber", () => {
  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined]
  ])("treats %s as absent", (_label, value) => {
    expect(toProfileNumber(value)).toBeNull();
  });

  // Both spellings matter. A guard written as `if (!value)` still passes the
  // string "0", which is truthy, and only fails on the number -- so testing the
  // string alone lets the forbidden falsiness guard through.
  test.each([
    ["a numeric string", "0"],
    ["a number", 0]
  ])("keeps a measured zero given as %s", (_label, value) => {
    expect(toProfileNumber(value)).toBe(0);
  });

  test("parses a real measurement", () => {
    expect(toProfileNumber("34")).toBe(34);
  });

  test("treats a non-numeric string as absent", () => {
    expect(toProfileNumber("not-a-number")).toBeNull();
  });
});
```

In `client/src/__tests__/numericCoercion.contract.test.js`, delete line 3:

<!-- prettier-ignore -->
```js
import { toProfileNumber } from "../app/profileMapping";
```

In `client/src/__tests__/numericCoercion.contract.test.js`, delete lines 32-36:

<!-- prettier-ignore -->
```js
  {
    name: "toProfileNumber (app/profileMapping)",
    call: (value) => toProfileNumber(value),
    absent: null
  },
```

In `client/src/__tests__/numericCoercion.contract.test.js`, replace lines 72-79:

<!-- prettier-ignore -->
```js
// Deliberately not in the table, both checked rather than assumed:
//
// - `useBodyModel.js` has a module-private `toFiniteNumber` of its own. It has
//   the right shape, and its null-vs-empty-string equivalence is already pinned
//   behaviourally in useBodyModel.test.jsx, which asserts that a body fat given
//   as null and one given as "" produce the same model. Reaching it from here
//   would mean adding a `__testables` bag to a React hook module to duplicate a
//   test that already exists.
```

with:

<!-- prettier-ignore -->
```js
// Deliberately not in the table, checked rather than assumed:
```

In `client/src/pages/home/hooks/useBodyModel.js`, replace lines 8-16:

<!-- prettier-ignore -->
```js

// Guards before it coerces, because `Number("")` and `Number(null)` are both 0
// and both finite -- so testing afterwards turns an unfilled field into a real
// measurement. Same shape as `toNumberOrNull` in the server's rowValues.js.
const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
```

with:

<!-- prettier-ignore -->
```js
import { toNumberOrNull } from "../../../app/units";
```

In `client/src/pages/home/hooks/useBodyModel.js`, replace lines 140-141:

<!-- prettier-ignore -->
```js
    const fromCmInput = toFiniteNumber(personal.heightCm);
    const fromImperialInput = toFiniteNumber(
```

with:

<!-- prettier-ignore -->
```js
    const fromCmInput = toNumberOrNull(personal.heightCm);
    const fromImperialInput = toNumberOrNull(
```

In `client/src/pages/home/hooks/useBodyModel.js`, replace line 156:

<!-- prettier-ignore -->
```js
    const normalized = toFiniteNumber(toKg(personal.weight, weightUnit));
```

with:

<!-- prettier-ignore -->
```js
    const normalized = toNumberOrNull(toKg(personal.weight, weightUnit));
```

In `client/src/pages/home/hooks/useBodyModel.js`, replace line 168:

<!-- prettier-ignore -->
```js
  const ageValue = useMemo(() => toFiniteNumber(personal.age), [personal.age]);
```

with:

<!-- prettier-ignore -->
```js
  const ageValue = useMemo(() => toNumberOrNull(personal.age), [personal.age]);
```

In `client/src/pages/home/hooks/useBodyModel.js`, replace line 184:

<!-- prettier-ignore -->
```js
    const value = toFiniteNumber(personal.bodyFat);
```

with:

<!-- prettier-ignore -->
```js
    const value = toNumberOrNull(personal.bodyFat);
```

In `client/src/pages/home/hooks/__tests__/useBodyModel.test.jsx`, replace line 8:

<!-- prettier-ignore -->
```jsx
// empty string, which is exactly the difference the guard in toFiniteNumber
```

with:

<!-- prettier-ignore -->
```jsx
// empty string, which is exactly the difference the guard in toNumberOrNull
```

In `client/src/pages/home/hooks/__tests__/useBodyModel.test.jsx`, replace lines 169-174:

<!-- prettier-ignore -->
```jsx
    // This used to resolve to 3%, because `toFiniteNumber` converted before it
    // tested: `Number("")` is 0 and `Number.isFinite(0)` is true, so an
    // unentered body fat became an explicit 0, `clamp(0, 3, 60)` lifted it to
    // 3, and the `??` below treated that as a real answer. The visitor was
    // modelled leaner than an elite athlete and `estimatedBodyFat` was
    // unreachable. The guard now runs before the coercion.
```

with:

<!-- prettier-ignore -->
```jsx
    // `toNumberOrNull` tests before it converts. Converted first, `Number("")`
    // is 0 and `Number.isFinite(0)` is true, so an unentered body fat would
    // become an explicit 0, `clamp(0, 3, 60)` would lift it to 3, and the `??`
    // below would treat that as a real answer: the visitor modelled leaner than
    // an elite athlete, and `estimatedBodyFat` unreachable.
```

- [ ] **Step 4: Prove it, commit, mutation-check**

```bash
git grep -n "toProfileNumber" -- client server e2e
git grep -n "toFiniteNumber" -- client/src ':!client/src/pages/home/components/physique' ':!client/src/__tests__/numericCoercion.contract.test.js'
npx prettier --write client/src/app/profileMapping.js client/src/app/__tests__/profileMapping.test.js client/src/pages/home/hooks/useBodyModel.js client/src/pages/home/hooks/__tests__/useBodyModel.test.jsx client/src/__tests__/numericCoercion.contract.test.js
npx vitest run src/__tests__/numericCoercion.contract.test.js src/app/__tests__/profileMapping.test.js src/pages/home/hooks/__tests__/useBodyModel.test.jsx --root client > "$SCRATCH/c6-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c6-tests.txt"
git add client/src
git commit -m "refactor(client): one guard-before-coerce number helper" -m "toProfileNumber and useBodyModel's toFiniteNumber had toNumberOrNull's body exactly. Both callers import it; the contract test keeps its row for it and drops the one for toProfileNumber." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: both greps print nothing (the physique helper and its contract row are a different function and stay); `exit=0`, `107 passed (107)`.

Write `$SCRATCH/mut-c6.json`:

```json
[
  {
    "file": "client/src/app/units.js",
    "find": "  if (value === null || value === undefined || value === \"\") return null;\n  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : null;\n",
    "text": "  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : null;\n"
  }
]
```

```bash
node "$TOOLS/mutate.mjs" "$SCRATCH/mut-c6.json"
npx vitest run src/__tests__/numericCoercion.contract.test.js src/app/__tests__/profileMapping.test.js src/pages/home/hooks/__tests__/useBodyModel.test.jsx --root client > "$SCRATCH/c6-mut.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c6-mut.txt"
git checkout -- client/src/app/units.js; git status --porcelain
```

Expected: `exit=1`, `11 failed | 96 passed (107)`, failures in all three files, and an empty status.

- [ ] **Step 5: The after-capture, coverage, gates, PR**

```bash
npm run build > "$SCRATCH/b-c6.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c6-after" > "$SCRATCH/c6-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c6-before" "$SHOTS/c6-after" > "$SCRATCH/c6-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c6-cmp.txt"
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-c6.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/cc-c6.txt"
node "$TOOLS/counts.mjs" . client
git push -u origin refactor/fold-client-number-helpers
gh pr create --draft --base main --title "refactor(client): one guard-before-coerce number helper" --body-file "$SCRATCH/pr-c6.md"
gh pr ready
gh pr checks --watch
```

Expected: `compare exit=0`, `identical`; `Tests  2408 passed (2408)` and the table's four lines; then the full gates. `pr-c6.md` outline: the owner's decision to take it; the three identical bodies; what moved into `personalToProfile`'s summary; the tests and contract row removed, and why `toNumberOrNull`'s row covers them; the mutation result; the coverage table; the compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Review, then merge.

---

## Server track

The three server tasks touch no client file and render nothing, so they take no captures. They share the database with each other and with the E2E suite: run one server suite at a time.

### Task S1: One empty-token check in the CSRF comparison

**What was routed here, and what this task does instead.** Phase 3's server plan routed "`tokensMatch`'s empty-token check (`sessionService.js:78`), because `requireCsrfToken` rejects an empty token first" here as a guard no input reaches. Both halves of that hold on `a8aad22` (the line is now 105):

<!-- prettier-ignore -->
```js
// sessionService.js:103-109, the comparison, private, with one caller
const tokensMatch = (a, b) => {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length === 0 || right.length === 0) return false;
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
};

// sessionService.js:478-481, requireCsrfToken, its only caller
const cookieToken = cleanText(cookies[csrfCookieName], 128);
const headerToken = cleanText(req.headers[csrfHeaderName], 128);

if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
```

`git grep -n "tokensMatch" -- server` finds the definition and that one call. `cleanText` returns a string, and the caller has already refused an empty one, so `tokensMatch` only ever sees two non-empty strings, and a non-empty string never encodes to an empty buffer. Line 105's early return cannot fire, and the coverage report agrees: its `return false` is one of `sessionService.js`'s four uncovered statements. Deleting it was measured: every test still passes, so it is an equivalent mutant today.

**It is not a guard to delete, because it is the one that is load-bearing for the comparison.** `crypto.timingSafeEqual` returns `true` for two empty buffers. So `tokensMatch` without line 105 says an empty cookie token matches an empty header token, and the only thing between that and a CSRF bypass on every unsafe route is the caller's pre-check, one refactor away from going. The two guards test the same condition, which is CLAUDE.md's pattern from GeneratedPlanModal: "give it one guard, not two", because the second makes the first untestable. The question is which one stays, and for a security check the answer is the one inside the comparison, where every caller gets it.

So this task deletes the **caller's** half instead: `!cookieToken || !headerToken ||` goes, and `tokensMatch` keeps its check, which becomes the only refusal of an empty token. That is still a deletion of a redundant guard, it removes no defence, and it makes the remaining guard reachable: the existing tests that send no token ("checks POST" and the rest) now reach line 105, and deleting line 105 now fails six of them, where today nothing can fail. A one-line comment over `tokensMatch` says why the check is there. **Recommendation: take this form. The routed form, deleting line 105, is measured below as the fallback, and I would not take it.** If the owner prefers to leave both guards, drop S1: S2 then S3 still pass on their own (see "Ordering").

**Measured** (`a8aad22`, then this task):

| Metric     | Before      | After       | After, % | Floor | Slack |
| ---------- | ----------- | ----------- | -------- | ----- | ----- |
| Statements | 2276 / 2394 | 2277 / 2394 | 95.1128  | 95    | 2.70  |
| Branches   | 1668 / 1890 | 1668 / 1887 | 88.3943  | 88.2  | 3.67  |
| Functions  | 382 / 397   | 382 / 397   | 96.2217  | 96.2  | 0.09  |
| Lines      | 2045 / 2125 | 2045 / 2125 | 96.2353  | 96.2  | 0.75  |

The caller's three branches go, and the file's unreached branches fall from nine to six, `tokensMatch`'s early return among them; its `return false` is now a covered statement (`sessionService.js`: statements 240/244 → 241/244, branches 132/141 → 132/138). Tests unchanged at 1183. The routed form, for comparison, measured 2275 / 2392, **1665 / 1886** (88.2821), 382 / 397, 2044 / 2124: it passes too, but with 1.55 branch slack instead of 3.67, and it removes the guard that matters.

**Files:**

- Modify: `server/src/services/auth/sessionService.js:103` (a comment above it) and `:481`

- [ ] **Step 1: Branch, and confirm the two guards**

```bash
git fetch origin && git switch -c chore/csrf-one-empty-token-check origin/main
git grep -n "tokensMatch" -- server
sed -n '103,109p;478,481p' server/src/services/auth/sessionService.js
```

Expected: the definition at 103 and the one call at 481; the code as quoted above.

- [ ] **Step 2: No failing test first.** No behaviour changes: an empty token is refused before and after, by a different line. Step 4's mutation is what shows the remaining guard is now the one the tests hold.

- [ ] **Step 3: The edit**

In `server/src/services/auth/sessionService.js`, above line 103 (`const tokensMatch = (a, b) => {`), insert:

<!-- prettier-ignore -->
```js
// The CSRF check's one comparison. An empty token never matches, not even an
// empty one: timingSafeEqual calls two empty buffers equal, so requireCsrfToken
// relies on this to refuse a write that carries neither cookie nor header.
```

and replace line 481:

<!-- prettier-ignore -->
```js
    if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
```

with:

<!-- prettier-ignore -->
```js
    if (!tokensMatch(cookieToken, headerToken)) {
```

- [ ] **Step 4: Tests, commit, mutation-check**

```bash
npx prettier --write server/src/services/auth/sessionService.js
npx vitest run src/services/auth/__tests__/sessionService.auth.test.js --root server > "$SCRATCH/s1-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/s1-tests.txt"
git add server/src/services/auth/sessionService.js
git commit -m "chore(server): one empty-token check in the CSRF comparison" -m "requireCsrfToken refused an empty token, and tokensMatch refused it again, so tokensMatch's check could not fire and no test could tell it apart from its absence. The caller's copy goes. The comparison keeps the check, because timingSafeEqual calls two empty buffers equal; the tests that send no token now reach it." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Write `$SCRATCH/mut-s1.json`:

```json
[
  {
    "file": "server/src/services/auth/sessionService.js",
    "find": "  if (left.length === 0 || right.length === 0) return false;\n",
    "text": ""
  }
]
```

```bash
node "$TOOLS/mutate.mjs" "$SCRATCH/mut-s1.json"
npx vitest run src/services/auth/__tests__/sessionService.auth.test.js --root server > "$SCRATCH/s1-mut.txt" 2>&1; echo "exit=$?"; grep -E "Tests |×" "$SCRATCH/s1-mut.txt"
git checkout -- server/src/services/auth/sessionService.js; git status --porcelain
```

Expected: `exit=0` before the mutation; after it `exit=1`, with "checks POST", "checks PUT", "checks PATCH", "checks DELETE", "records the refusal for an operator" and "survives a request with no logger attached" failing (six, as in the scratch run): each sends no token, and without the check two empty buffers compare equal and the write is let through. Empty status after.

- [ ] **Step 5: Coverage, gates, PR**

```bash
npm run test:coverage -w server -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/sc-s1.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/sc-s1.txt"
node "$TOOLS/counts.mjs" . server
git push -u origin chore/csrf-one-empty-token-check
gh pr create --draft --base main --title "chore(server): one empty-token check in the CSRF comparison" --body-file "$SCRATCH/pr-s1.md"
gh pr ready
gh pr checks --watch
```

Expected: `Tests  1183 passed (1183)`, no "Can't reach database server", and the table's four lines; then the full gates. `pr-s1.md` outline: the routed item and why this PR removes the other copy (timingSafeEqual on two empty buffers; one guard, in the comparison); the mutation result before (survives) and after (six failures); the coverage table, with the routed form's numbers beside it; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. The quality review should look at the security reasoning specifically. Review, then merge.

---

### Task S2: Drop `stripUserIdField`'s non-object guard

`dashboardCollectionService.js:44-48`:

<!-- prettier-ignore -->
```js
const stripUserIdField = (doc = {}) => {
  if (!doc || typeof doc !== "object") return doc;
  const { userId: _omitUserId, ...rest } = doc;
  return rest;
};
```

Its one caller is `toCollectionPage` (line 60, `items.map(stripUserIdField)`), and `items` is what `loadCollectionPage` returns: `rows.map(spec.mapRow)` (`repositories/dashboardCollectionRepository.js:54`), where every `mapRow` (`mapWorkoutSession`, `mapMealLog`, `mapProgressMetric`) returns an object literal. So `doc` is always an object, and the guard cannot fire; it is `dashboardCollectionService.js`'s one uncovered statement. The tests agree: `dashboardReadRoutes.test.js` stubs the reader with object items, and `collectionReads.integration.test.js` reads real rows. `git grep -n "stripUserIdField" -- server` finds the definition and the call, nothing else.

Deleting it changes one thing nobody can reach: a `null` item would now throw at the destructure instead of passing through. The `= {}` default stays. It also never fires (map passes every element), but removing it as well was measured one covered branch worse (1664 / 1885 against 1665 / 1886 alone on `main`) and gains nothing a reader needs; this task is the guard Phase 3 routed, and only that.

Found while checking, and **not** in this task: no mapper emits a `userId`, so `stripUserIdField` strips nothing from what the repository returns today, and `collectionReads.integration.test.js:121`'s `not.toHaveProperty("userId")` passes with or without it. It is a response-shape guard against a future mapper leaking an owner id, which is a reasonable thing to keep; "Not in this phase" lists it.

**Measured** (`a8aad22` plus S1, then this task):

| Metric     | After S1    | After S2    | After S2, % | Floor | Slack |
| ---------- | ----------- | ----------- | ----------- | ----- | ----- |
| Statements | 2277 / 2394 | 2276 / 2392 | 95.1505     | 95    | 3.60  |
| Branches   | 1668 / 1887 | 1665 / 1883 | 88.4227     | 88.2  | 4.19  |
| Functions  | 382 / 397   | 382 / 397   | 96.2217     | 96.2  | 0.09  |
| Lines      | 2045 / 2125 | 2044 / 2124 | 96.2335     | 96.2  | 0.71  |

`dashboardCollectionService.js` goes from 34/35 statements and 17/18 branches to 33/33 and 14/14: the guard's `if` and three covered branch arms go, with its `return doc`, the file's one uncovered statement, and one uncovered arm. Alone against `main` the change is the same (2275 / 2392, 1665 / 1886, 382 / 397, 2044 / 2124). Tests unchanged at 1183.

**Files:**

- Modify: `server/src/services/dashboard/dashboardCollectionService.js:45`

- [ ] **Step 1: Branch, and confirm the producer**

```bash
git fetch origin && git switch -c chore/drop-strip-userid-guard origin/main
git grep -n "stripUserIdField" -- server
git grep -n "mapRow\|return { items" -- server/src/repositories/dashboardCollectionRepository.js
```

Expected: the definition at 44 and the call at 60; `mapRow` on lines 14, 19 and 24 (the three mappers) and `return { items: rows.map(spec.mapRow), total };` at 54.

- [ ] **Step 2: No failing test first.** A pure deletion: no input that reaches it changes.

- [ ] **Step 3: The edit**

In `server/src/services/dashboard/dashboardCollectionService.js`, delete line 45:

<!-- prettier-ignore -->
```js
    if (!doc || typeof doc !== "object") return doc;
```

No comment describes the guard, so none changes.

- [ ] **Step 4: Tests, commit, coverage, gates, PR**

```bash
npx vitest run src/routes/dashboard --root server > "$SCRATCH/s2-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/s2-tests.txt"
git add server/src/services/dashboard/dashboardCollectionService.js
git commit -m "chore(server): drop stripUserIdField's non-object guard" -m "Every item is a row mapper's object literal, so the guard could not fire." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
npm run test:coverage -w server -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/sc-s2.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/sc-s2.txt"
node "$TOOLS/counts.mjs" . server
git push -u origin chore/drop-strip-userid-guard
gh pr create --draft --base main --title "chore(server): drop stripUserIdField's non-object guard" --body-file "$SCRATCH/pr-s2.md"
gh pr ready
gh pr checks --watch
```

Expected: `exit=0` for the route tests (they include the integration suite, so Postgres must be up); `Tests  1183 passed (1183)` and the table's four lines; then the full gates. `pr-s2.md`: the producer chain that makes the guard unreachable; why the default stays; the coverage table; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Review, then merge.

---

### Task S3: One positive-integer reader

`generateRoutes.js:31-36`'s exported `parsePositiveInt(value, fallback)` (from #192) and `index.js:263-267`'s private `toPositiveInt(value, fallback)` give the same answer for every input. The only difference in their bodies is `parsePositiveInt`'s extra test for a whitespace-only string, and that cannot change an answer: `Number("   ")` is `0`, which `toPositiveInt`'s `parsed > 0` already sends to `fallback`. The rest is the same three lines. Phase 3's server plan routed the merge here, with `toPositiveInt` the copy that stays, so `parsePositiveInt` goes and the route reads its three GEMINI_* limits through `toPositiveInt`.

**How the route gets it.** As every other helper it uses: in the deps object index.js hands `registerApiRoutes` (`index.js:632-720`), which already carries `toNullableNumber`, `cleanText` and `toCleanArray` the same way, and as `createHttpCacheService` already receives this same `toPositiveInt` (`index.js:370`). `registerGenerateRoutes` destructures it beside `toNullableNumber`.

**The risk that adds, and the test that closes it.** A helper the route used to import, it now receives, so a missing key in the deps object would become a `TypeError` inside the route's `try`, answered as a 500. Nothing would catch that today: the only tests that drive `/api/generate` through the real app (`index.test.js:243, 514`) blank `GEMINI_API_KEY`, so the route answers 500 at its first check, before it reads a limit; `index.wiring.test.js`'s header explains the same gap for the auth routes. So this task adds one test to `index.wiring.test.js`, which exists for exactly this: `vi.mock("@google/genai")` replaces the client index.js builds at import, a hoisted line sets a key if none is set, and the test posts to `/api/generate` with `GEMINI_MAX_OUTPUT_TOKENS` stubbed to `1234` and asserts a 200 whose model call carried `maxOutputTokens: 1234`. It passes on `main` (where the route reads its own copy) and after the change, and **dropping `toPositiveInt` from the deps object fails it** (scratch run: the new test fails, the other five pass), which is the mutation check. The equipment suite, which builds the route with hand-passed deps, gets the real function from `index.js`'s `__testables` rather than a stand-in, so its GEMINI_* tests keep testing the reader that ships.

**The contract test** loses its `parsePositiveInt` row (six tests); `toPositiveInt`'s row, which stays, asserts the same six cases on the same body. Its `zeroIsValid` note stops naming the deleted helper. `index.js`'s comment on `toPositiveInt` says that the route reads through it too.

**Measured** (`a8aad22` plus S1 and S2, then this task):

| Metric     | After S2    | After S3    | After S3, % | Floor | Slack |
| ---------- | ----------- | ----------- | ----------- | ----- | ----- |
| Statements | 2276 / 2392 | 2269 / 2385 | 95.1363     | 95    | 3.25  |
| Branches   | 1665 / 1883 | 1653 / 1871 | 88.3485     | 88.2  | 2.78  |
| Functions  | 382 / 397   | 381 / 396   | 96.2121     | 96.2  | 0.05  |
| Lines      | 2044 / 2124 | 2039 / 2119 | 96.2246     | 96.2  | 0.52  |

Everything removed was covered (`generateRoutes.js`: 89/89 → 82/82 statements, 77/78 → 65/66 branches, 13/13 → 12/12 functions). Tests 1183 → 1178: six contract tests out, one wiring test in. **This task cannot merge first.** Alone against `main` it measures branches **1656 / 1878 = 88.1789**, under the 88.2 floor (slack −0.40), because twelve covered branches is more than the eight the server's slack allows. After S1 alone it would pass (1656 / 1875, 88.3200); after S2 alone, only just (1653 / 1874, 88.2070, slack 0.13). Functions keep 0.05 of slack after it: one more covered server function removed anywhere before D3 would fail that floor.

**Files:**

- Modify: `server/src/routes/generateRoutes.js:24-36, 194, 203-204, 266, 270-274`
- Modify: `server/src/index.js:260-262, 719`
- Modify: `server/src/__tests__/index.wiring.test.js:1, 250` (the mock at the top, the test at the end)
- Modify: `server/src/routes/__tests__/generateRoutes.equipment.test.js:10, 40, 437`
- Modify: `server/src/__tests__/numericCoercion.contract.test.js:4, 36-38, 73-78`

- [ ] **Step 1: Branch, and confirm the two copies**

```bash
git fetch origin && git switch -c refactor/one-positive-int-reader origin/main
git grep -n "parsePositiveInt" -- server
sed -n '31,36p' server/src/routes/generateRoutes.js; sed -n '263,267p' server/src/index.js
```

Expected: the definition, the three calls at 266, 270 and 271, and the contract test's import, comment and row; the two bodies as described.

- [ ] **Step 2: The wiring test first, green on `main`**

In `server/src/__tests__/index.wiring.test.js`, replace line 1:

<!-- prettier-ignore -->
```js
import { afterAll, beforeAll, describe, expect, test } from "vitest";
```

with:

<!-- prettier-ignore -->
```js
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// /api/generate needs a Gemini client to get past its first check, and index.js
// builds that client when it is imported, so the client is replaced and a key
// set before the import below runs.
const { generateContent } = vi.hoisted(() => {
  process.env.GEMINI_API_KEY ||= "wiring-test-key";
  return { generateContent: vi.fn(async () => ({ text: "Monday - Push\nBench press" })) };
});
vi.mock("@google/genai", () => ({
  GoogleGenAI: function GoogleGenAI() {
    return { models: { generateContent } };
  }
}));
```

In `server/src/__tests__/index.wiring.test.js`, after line 250:

<!-- prettier-ignore -->
```js
});
```

insert:

<!-- prettier-ignore -->
```js

// The route reads its GEMINI_* limits through the toPositiveInt index.js puts in
// the deps object. Without it the call throws inside the route's try, and the
// caller gets a 500 instead of a plan.
describe("plan generation is wired into the real app", () => {
  test("POST /api/generate reads its limits through the injected toPositiveInt", async () => {
    vi.stubEnv("GEMINI_MAX_OUTPUT_TOKENS", "1234");
    try {
      const response = await withCsrf("/api/generate", "POST", {
        body: { goal: "Build strength", days: 3 }
      });

      expect(response.status).toBe(200);
      expect(generateContent).toHaveBeenCalledWith(
        expect.objectContaining({ config: expect.objectContaining({ maxOutputTokens: 1234 }) })
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
```

```bash
npx vitest run src/__tests__/index.wiring.test.js --root server > "$SCRATCH/s3-wiring-main.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/s3-wiring-main.txt"
```

Expected: `exit=0`, `6 passed (6)`. It is green here because the route still reads its own copy; it is written first so the same test is the one that pins the wiring after Step 3. It does not fail first: this is a refactor, and there is no behaviour to break before it.

- [ ] **Step 3: The merge**

In `server/src/routes/generateRoutes.js`, delete lines 24-36:

<!-- prettier-ignore -->
```js
/**
 * Reads a positive integer setting, or returns `fallback`. Absent input (null,
 * undefined, a blank string) is tested before `Number()` runs, because
 * `Number(null)` and `Number("")` are both 0. Zero, negatives, fractions and
 * non-numeric text are outside the domain of every setting read through here,
 * so they give `fallback` too.
 */
export const parsePositiveInt = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
```

In `server/src/routes/generateRoutes.js`, replace line 194:

<!-- prettier-ignore -->
```js
 *   unset.
```

with:

<!-- prettier-ignore -->
```js
 *   unset. `toPositiveInt` is index.js's reader for a positive integer
 *   setting, which the three GEMINI_* limits go through.
```

In `server/src/routes/generateRoutes.js`, after line 203:

<!-- prettier-ignore -->
```js
    toNullableNumber,
```

insert:

<!-- prettier-ignore -->
```js
    toPositiveInt,
```

In `server/src/routes/generateRoutes.js`, replace line 266:

<!-- prettier-ignore -->
```js
      const maxOutputTokens = parsePositiveInt(
```

with:

<!-- prettier-ignore -->
```js
      const maxOutputTokens = toPositiveInt(
```

In `server/src/routes/generateRoutes.js`, replace lines 270-274:

<!-- prettier-ignore -->
```js
      const timeoutMs = parsePositiveInt(process.env.GEMINI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
      const maxPlanChars = parsePositiveInt(
        process.env.GEMINI_MAX_PLAN_CHARS,
        DEFAULT_MAX_PLAN_CHARS
      );
```

with:

<!-- prettier-ignore -->
```js
      const timeoutMs = toPositiveInt(process.env.GEMINI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
      const maxPlanChars = toPositiveInt(process.env.GEMINI_MAX_PLAN_CHARS, DEFAULT_MAX_PLAN_CHARS);
```

In `server/src/index.js`, replace lines 260-262:

<!-- prettier-ignore -->
```js
// Guards before it coerces. The `> 0` below would also reject the 0 that
// `Number(null)` and `Number("")` produce, but only by accident of the range;
// a copy of this shape for a range that includes 0 needs the guard to be right.
```

with:

<!-- prettier-ignore -->
```js
// Reads every positive integer setting, here and, through the deps object, in
// generateRoutes.js. Guards before it coerces. The `> 0` below would also reject
// the 0 that `Number(null)` and `Number("")` produce, but only by accident of the
// range; a copy of this shape for a range that includes 0 needs the guard to be
// right.
```

In `server/src/index.js`, replace line 719:

<!-- prettier-ignore -->
```js
  toCleanArray
```

with:

<!-- prettier-ignore -->
```js
  toCleanArray,
  toPositiveInt
```

In `server/src/routes/__tests__/generateRoutes.equipment.test.js`, after line 10:

<!-- prettier-ignore -->
```js
} from "../../services/dashboard/dashboardDataBuildersService.js";
```

insert:

<!-- prettier-ignore -->
```js
import { __testables as indexTestables } from "../../index.js";
```

In `server/src/routes/__tests__/generateRoutes.equipment.test.js`, after line 40:

<!-- prettier-ignore -->
```js
    toNullableNumber,
```

insert:

<!-- prettier-ignore -->
```js
    toPositiveInt: indexTestables.toPositiveInt,
```

In `server/src/routes/__tests__/generateRoutes.equipment.test.js`, after line 437:

<!-- prettier-ignore -->
```js
        toNullableNumber,
```

insert:

<!-- prettier-ignore -->
```js
        toPositiveInt: indexTestables.toPositiveInt,
```

In `server/src/__tests__/numericCoercion.contract.test.js`, delete line 4:

<!-- prettier-ignore -->
```js
import { parsePositiveInt } from "../routes/generateRoutes.js";
```

In `server/src/__tests__/numericCoercion.contract.test.js`, replace lines 36-38:

<!-- prettier-ignore -->
```js
// `zeroIsValid` is not decoration. `toPositiveInt`, `parsePositiveInt` and
// `parseRedisPort` legitimately exclude 0 from their domain -- a port 0, a
// limit of 0 and a zero-length generation timeout are not meaningful -- so for
```

with:

<!-- prettier-ignore -->
```js
// `zeroIsValid` is not decoration. `toPositiveInt` and `parseRedisPort`
// legitimately exclude 0 from their domain -- a port 0, a limit of 0 and a
// zero-length generation timeout are not meaningful -- so for
```

In `server/src/__tests__/numericCoercion.contract.test.js`, delete lines 73-78:

<!-- prettier-ignore -->
```js
  {
    name: "parsePositiveInt (generateRoutes)",
    call: (value) => parsePositiveInt(value, 42),
    absent: 42,
    zeroIsValid: false
  },
```

- [ ] **Step 4: Prove it, commit, mutation-check**

```bash
git grep -n "parsePositiveInt" -- server client e2e
npx prettier --write server/src/routes/generateRoutes.js server/src/index.js server/src/__tests__/index.wiring.test.js server/src/routes/__tests__/generateRoutes.equipment.test.js server/src/__tests__/numericCoercion.contract.test.js
npx vitest run src/__tests__/index.wiring.test.js src/routes/__tests__/generateRoutes.equipment.test.js src/__tests__/numericCoercion.contract.test.js --root server > "$SCRATCH/s3-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/s3-tests.txt"
git add server/src
git commit -m "refactor(server): one positive-integer reader" -m "parsePositiveInt and index.js's toPositiveInt gave the same answer for every input. The route reads its GEMINI_* limits through toPositiveInt, passed in the deps object like the route's other helpers, and a wiring test drives /api/generate through the real app to pin that it arrives." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: the grep prints nothing; `exit=0`.

Write `$SCRATCH/mut-s3.json`:

```json
[
  {
    "file": "server/src/index.js",
    "find": "  toCleanArray,\n  toPositiveInt\n});\n",
    "text": "  toCleanArray\n});\n"
  }
]
```

```bash
node "$TOOLS/mutate.mjs" "$SCRATCH/mut-s3.json"
npx vitest run src/__tests__/index.wiring.test.js --root server > "$SCRATCH/s3-mut.txt" 2>&1; echo "exit=$?"; grep -E "Tests |×" "$SCRATCH/s3-mut.txt"
git checkout -- server/src/index.js; git status --porcelain
```

Expected: `exit=1`, `1 failed | 5 passed (6)`, the failure "POST /api/generate reads its limits through the injected toPositiveInt", and an empty status.

- [ ] **Step 5: Coverage, gates, PR**

```bash
npm run test:coverage -w server -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/sc-s3.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/sc-s3.txt"
node "$TOOLS/counts.mjs" . server
git push -u origin refactor/one-positive-int-reader
gh pr create --draft --base main --title "refactor(server): one positive-integer reader" --body-file "$SCRATCH/pr-s3.md"
gh pr ready
gh pr checks --watch
```

Expected: `Tests  1178 passed (1178)` and the table's four lines, with functions' 0.05 slack noted in the PR; then the full gates. If S1 or S2 has not merged, `counts.mjs` prints `BELOW FLOOR` for branches: stop and merge them first. `pr-s3.md` outline: why the two bodies give the same answers; why injection; the wiring gap and the test that closes it, with the mutation result; the contract row; the coverage table and the ordering constraint; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Review, then merge.

---

## Closing

### Task D3: The floor PR, both sides

Modelled on Phase 4's K5 and PR #227, for both configs in one PR, as the spec's D3 says. It runs once both tracks have merged, from the `main` they leave. Rule 3: it re-measures `main`, raises each floor whose value truncated to one decimal went up, and updates the measurement notes; floors are never lowered. This is the one measurement in the follow-up where a percentage could have moved either way (spec, D3); as measured, every metric rose or held.

**Expected measurement** (the cumulative scratch runs: `a8aad22` with every task applied, in order):

| Side   | Metric     | Covered / total, with C6 | %, with C6 | Covered / total, without C6 | %, without C6 | Floor now | Floor after | Spare after (with C6 / without) |
| ------ | ---------- | ------------------------ | ---------- | --------------------------- | ------------- | --------- | ----------- | ------------------------------- |
| Client | Statements | 4871 / 4927              | 98.8634    | 4881 / 4937                 | 98.8657       | 98.8      | 98.8        | 3.12 / 3.24                     |
| Client | Branches   | 3184 / 3393              | 93.8403    | 3198 / 3407                 | 93.8656       | 93.8      | 93.8        | 1.37 / 2.23                     |
| Client | Functions  | 1004 / 1013              | 99.1115    | 1006 / 1015                 | 99.1133       | 99        | **99.1**    | 0.12 / 0.14                     |
| Client | Lines      | 4442 / 4464              | 99.5072    | 4450 / 4472                 | 99.5081       | 99.4      | **99.5**    | 0.32 / 0.36                     |
| Server | Statements | 2269 / 2385              | 95.1363    |                             |               | 95        | **95.1**    | 0.87                            |
| Server | Branches   | 1653 / 1871              | 88.3485    |                             |               | 88.2      | **88.3**    | 0.91                            |
| Server | Functions  | 381 / 396                | 96.2121    |                             |               | 96.2      | 96.2        | 0.05                            |
| Server | Lines      | 2039 / 2119              | 96.2246    |                             |               | 96.2      | 96.2        | 0.52                            |

Client tests 2408 with C6, 2422 without; server 1178. **C6 changes no floor:** with or without it the truncated values are 98.8 / 93.8 / 99.1 / 99.5. So the expected result is four raised floors, client functions 99 → 99.1 and lines 99.4 → 99.5, server statements 95 → 95.1 and branches 88.2 → 88.3, if CI agrees (Step 1). Server branches read higher in CI than locally (88.62 against 88.25 on `a8aad22`), so the server floor follows the local figure, as its note says.

**Files:**

- Modify: `client/vite.config.js:70-77` (the measurement note and `thresholds`)
- Modify: `server/vitest.config.js:29-40` (the measurement note and `thresholds`)

- [ ] **Step 1: Measure `main`, locally and in CI**

```bash
git fetch origin
git switch -c chore/phase-5-floors origin/main
npm ci > "$SCRATCH/ci-floor.txt" 2>&1; echo "npm ci exit=$?"
npm run prisma:generate -w server > "$SCRATCH/prisma-floor.txt" 2>&1; echo "prisma exit=$?"
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-floor.txt" 2>&1; echo "client exit=$?"
npm run test:coverage -w server -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/sc-floor.txt" 2>&1; echo "server exit=$?"
node "$TOOLS/counts.mjs" . client; node "$TOOLS/counts.mjs" . server
grep -E "Tests  " "$SCRATCH/cc-floor.txt" "$SCRATCH/sc-floor.txt"
```

Expected: every `exit=0`, the counts in the table (the "with C6" or "without C6" column, whichever the owner chose), and no "Can't reach database server". Run the server line twice: its branch count was stable across two runs on `main`, and a figure that moves between runs of the same code is a test bug to find before flooring from it (CLAUDE.md). Then read the last green CI run on `main`: `gh run list --branch main --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId'`, then `gh run view <id> --log | grep -E "All files"`, for both coverage jobs on Node 22 and 24. Where CI and local differ, floor from the lower.

- [ ] **Step 2: Raise only the floors whose truncated measurement went up**

For each metric the candidate is `Math.floor(measured * 10) / 10`; raise the floor only where that is higher than today's, never lower one. Prettier writes a whole number without `.0`.

In `client/vite.config.js`, replace lines 70-77:

<!-- prettier-ignore -->
```js
      // Measured 2026-10-16 (98.83 / 93.87 / 99.02 / 99.46), the same locally
      // and in CI.
      thresholds: {
        statements: 98.8,
        branches: 93.8,
        functions: 99,
        lines: 99.4
      }
```

with (figures as measured in Step 1; these are the expected ones, with C6):

<!-- prettier-ignore -->
```js
      // Measured <date> (98.86 / 93.84 / 99.11 / 99.50), the same locally
      // and in CI.
      thresholds: {
        statements: 98.8,
        branches: 93.8,
        functions: 99.1,
        lines: 99.5
      }
```

In `server/vitest.config.js`, replace lines 29-40:

<!-- prettier-ignore -->
```js
      // Measured 2026-10-15 (95.07 / 88.20 / 96.22 / 96.23), floored one
      // decimal below. Branches read higher in CI than locally (88.62 against
      // 88.20 on 2026-10-15), so the floor follows the local figure, the lower
      // of the two. One decimal rather than whole percent, which would leave
      // up to a point of measured coverage free to slip without tripping
      // anything.
      thresholds: {
        statements: 95,
        branches: 88.2,
        functions: 96.2,
        lines: 96.2
      }
```

with:

<!-- prettier-ignore -->
```js
      // Measured <date> (95.13 / 88.34 / 96.21 / 96.22), floored one
      // decimal below. Branches read higher in CI than locally (<CI figure>
      // against 88.34 on <date>), so the floor follows the local figure, the
      // lower of the two. One decimal rather than whole percent, which would
      // leave up to a point of measured coverage free to slip without tripping
      // anything.
      thresholds: {
        statements: 95.1,
        branches: 88.3,
        functions: 96.2,
        lines: 96.2
      }
```

The two-decimal figures in each note are the summary's, which keeps two decimals and drops the rest (98.8634 prints as 98.86, 99.5072 as 99.5, 88.3485 as 88.34); the note quotes them, and the floors come from the exact counts. If no floor on a side rises, leave that file alone; if none rises on either side, open no PR and record "no floor moved" in the phase report.

- [ ] **Step 3: Prove it, commit, open the PR**

```bash
npx prettier --write client/vite.config.js server/vitest.config.js
npm run test:coverage > "$SCRATCH/cov-floor2.txt" 2>&1; echo "test:coverage exit=$?"
node "$TOOLS/counts.mjs" . client; node "$TOOLS/counts.mjs" . server
npm run lint > "$SCRATCH/lint-floor.txt" 2>&1; echo "lint exit=$?"
npm run format:check > "$SCRATCH/fmt-floor.txt" 2>&1; echo "format:check exit=$?"
npm run test:scripts > "$SCRATCH/scripts-floor.txt" 2>&1; echo "test:scripts exit=$?"
git add client/vite.config.js server/vitest.config.js
git commit -m "chore(coverage): raise the floors after Phase 5" -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
git push -u origin chore/phase-5-floors
gh pr create --base main --title "chore(coverage): raise the floors after Phase 5" --body-file "$SCRATCH/pr-floors.md"
```

Expected: every `exit=0`, and `counts.mjs` printing every slack 0 or more against the new floors (the "Spare after" column). `pr-floors.md` follows #227's body: the floors that moved and the rule; the Phase 5 PRs merged on each track, with their numbers; for each side a table of Metric, Covered / total, Measured to four decimals, Floor before, Floor after, Spare; the tests before (2441 and 1183) and after; the CI run that agrees; the verification exits; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 4: Review, then merge.** The quality review recomputes each percentage and its truncation from the counts in the body. Then the phase report (spec, "Closing a phase"): what merged, the coverage before and after, and what moved to Phase 6.

---

## Ordering, and the cumulative arithmetic

Every row below was measured: a scratch copy of `a8aad22` with the tasks up to that row applied, `vitest run --coverage`, the counts read from `coverage-summary.json`. Each cell is covered / total, the percentage to four decimals, and the slack against today's floor in brackets. The measured sequence equals the sum of the tasks' separate deltas exactly on both sides, because no two tasks on a track touch the same instrumented code.

**Client** (floors 98.8 / 93.8 / 99 / 99.4):

| After  | Statements                  | Branches                    | Functions                   | Lines                       | Tests |
| ------ | --------------------------- | --------------------------- | --------------------------- | --------------------------- | ----- |
| `main` | 4906 / 4964, 98.8316 (1.57) | 3218 / 3428, 93.8740 (2.54) | 1014 / 1024, 99.0234 (0.24) | 4472 / 4496, 99.4662 (2.98) | 2441  |
| D1     | 4887 / 4943, 98.8671 (3.32) | 3205 / 3414, 93.8781 (2.67) | 1006 / 1015, 99.1133 (1.15) | 4456 / 4478, 99.5087 (4.87) | 2427  |
| D2     | 4884 / 4940, 98.8664 (3.28) | 3202 / 3411, 93.8728 (2.48) | 1006 / 1015, 99.1133 (1.15) | 4453 / 4475, 99.5084 (4.85) | 2427  |
| C3     | 4882 / 4938, 98.8659 (3.26) | 3198 / 3407, 93.8656 (2.23) | 1006 / 1015, 99.1133 (1.15) | 4451 / 4473, 99.5082 (4.84) | 2422  |
| C4, C5 | 4881 / 4937, 98.8657 (3.24) | 3198 / 3407, 93.8656 (2.23) | 1006 / 1015, 99.1133 (1.15) | 4450 / 4472, 99.5081 (4.83) | 2422  |
| C6     | 4871 / 4927, 98.8634 (3.12) | 3184 / 3393, 93.8403 (1.37) | 1004 / 1013, 99.1115 (1.13) | 4442 / 4464, 99.5072 (4.78) | 2408  |

**The client order is free.** D1 goes first because it is the spec's first item and because it raises every percentage (it deletes uncovered code along with the covered), which buys the rest slack; but no order fails. The worst case is D1 last, with every other task merged before it: by the measured deltas that is 4890 / 4948 statements (slack 1.38), 3197 / 3407 branches (1.23), 1012 / 1022 functions (0.22) and 4458 / 4482 lines (2.89), all passing. C5 changes no count. Skipping C6 changes no floor in D3.

**Server** (floors 95 / 88.2 / 96.2 / 96.2):

| After  | Statements                  | Branches                    | Functions                 | Lines                       | Tests |
| ------ | --------------------------- | --------------------------- | ------------------------- | --------------------------- | ----- |
| `main` | 2276 / 2394, 95.0710 (1.70) | 1668 / 1890, 88.2540 (1.02) | 382 / 397, 96.2217 (0.09) | 2045 / 2125, 96.2353 (0.75) | 1183  |
| S1     | 2277 / 2394, 95.1128 (2.70) | 1668 / 1887, 88.3943 (3.67) | 382 / 397, 96.2217 (0.09) | 2045 / 2125, 96.2353 (0.75) | 1183  |
| S2     | 2276 / 2392, 95.1505 (3.60) | 1665 / 1883, 88.4227 (4.19) | 382 / 397, 96.2217 (0.09) | 2044 / 2124, 96.2335 (0.71) | 1183  |
| S3     | 2269 / 2385, 95.1363 (3.25) | 1653 / 1871, 88.3485 (2.78) | 381 / 396, 96.2121 (0.05) | 2039 / 2119, 96.2246 (0.52) | 1178  |

**The server order is forced at one point: S3 needs S1 or S2 before it.** S3 deletes twelve covered branches, and `main`'s branch slack allows eight: alone it measures 1656 / 1878 = 88.1789 (slack −0.40) and fails. S1 and S2 each raise the branch percentage, which is what makes room: S1 by making three unreached branches reached while it deletes three reached ones, S2 by deleting an unreached branch along with three reached ones. S1 and S2 can merge in either order. Functions are the other tight metric: S3 removes one covered function, which leaves 0.05 of slack; nothing else on the server track touches a function.

**If the owner chooses differently** (by the measured per-task deltas; these sequences were not run end to end):

| Choice                                             | After S3, branches           | After S3, statements        | D3's server floors        |
| -------------------------------------------------- | ---------------------------- | --------------------------- | ------------------------- |
| S1 as planned (the caller's pre-check goes)        | 1653 / 1871, 88.3485 (2.78)  | 2269 / 2385, 95.1363 (3.25) | 95.1 / 88.3 / 96.2 / 96.2 |
| S1 in the routed form (`tokensMatch`'s check goes) | 1650 / 1870, 88.2353 (0.66)  | 2267 / 2383, 95.1322 (3.15) | 95.1 / 88.2 / 96.2 / 96.2 |
| No S1 (both guards stay); S2 then S3               | 1653 / 1874, 88.2070 (0.13)  | 2268 / 2385, 95.0943 (2.25) | 95 / 88.2 / 96.2 / 96.2   |
| Neither S1 nor S2                                  | 1656 / 1878, 88.1789 (−0.40) | 2269 / 2387, 95.0566 (1.35) | S3 cannot merge           |

If neither S1 nor S2 is taken, S3 cannot pass without a test that reaches an uncovered server branch first, and lowering the floor is not on the table (rule 3): that would go back to the owner.

**D3's result, as planned:** client 98.8 / 93.8 / **99.1** / **99.5**, server **95.1** / **88.3** / 96.2 / 96.2, the bold ones raised.

**What the scratch measurement did not run.** The E2E suite needs the built bundle served beside a running server and was not run against the scratch copies; each PR runs it as a gate. The capture set shows the planner's first step only and the walkthrough at 1440 and 390 px only, so the class-name greps, the DOM probe and `font-rivals.mjs` are what cover the planner's other steps and the widths between.

---

## Not in this phase

| Item                                                                                                                                                                                                                                                                                                                                                                           | Where it goes                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| CLAUDE.md names what this phase deletes or changes: `GeneratedPlanModal.jsx` in the coverage list and in the "two guards testing the same thing" note, useBodyModel's `toFiniteNumber` in the absent-is-not-zero section (if C6 is taken), and every coverage figure                                                                                                           | Phase 6, R1 (spec rule 6: records after the last floor PR)                                                            |
| The two server `NUMERIC_VARS` gaps from Phase 3: GEMINI_MAX_OUTPUT_TOKENS, GEMINI_TIMEOUT_MS and GEMINI_MAX_PLAN_CHARS are not validated at startup (after S3 they are read through `toPositiveInt`), and `NUMERIC_VARS` accepts a non-integer that `toPositiveInt` then discards                                                                                              | Owner decisions, as Phase 3 left them                                                                                 |
| `stripUserIdField` strips nothing from today's rows: no row mapper emits a `userId`, so `collectionReads.integration.test.js:121`'s "never leaks the internal userId field" passes with or without it. It is a cheap guard against a future mapper leaking an owner id                                                                                                         | Kept. Owner's call to delete; it would remove a covered function, leaving 0.01 of function slack after S3 (380 / 395) |
| DashboardPage's fallback for a view name it does not know, unreachable since Phase 3's C5d (`DashboardPage.test.jsx`, "a view name it does not know falls back to the summary"); C5d kept it on purpose                                                                                                                                                                        | Kept, as C5d decided                                                                                                  |
| `JOHN_DOE_PREVIEW_PROFILE.personalComplete` (`home/preview/constants.js:49`) is read by nothing (#186, item 4), and after C3 neither is its `bodyFat`. Both are data in a constant, so deleting them moves no count                                                                                                                                                            | Owner's call; a one-line follow-up if wanted                                                                          |
| Declarations that never apply (#188): `layout/base.css`'s `--preview-body-width` and `--preview-chip-expanded` (PreviewStage's inline style sets both) and its `--preview-body-right-pad` fallback, `.preview-week-table-wrap::before`'s texture, and the `--preview-step-toc-reserve-scale` PreviewStage sets and no stylesheet reads                                         | Accepted under default #9: rules on rendered elements, not dead selectors, and none dies with code deleted here       |
| The invisible cascade bugs Phase 4 accepted (S8-8, S8-9, S7-6, S7-12, S8-12, S8-13), the small visible-on-inspection ties (S8-3, S8-10, S8-11, S7-2, S7-11), and S8-7, S8-14, S8-15, S8-16                                                                                                                                                                                     | Accepted, as Phase 4 recorded. `.plan-modal`'s (S7-1) went with D1                                                    |
| Phase 3's other owner decisions: the meal-save race, the Postgres pool's `'error'` listener, `finishReason`, a Redis that never answers, sign-up and sign-out during a store outage, `attachOptionalUser` during an outage, the client's reading of a non-OK `/api/auth/me`; the home form's ranges, the Undo toast, the plan on `/plan` after logout, free-text "No injuries" | Owner decisions, unchanged                                                                                            |
| Phase 4's owner decisions: the walkthrough's form keeping two columns on phones; the hover and press motion left under reduced motion                                                                                                                                                                                                                                          | Owner decisions, unchanged                                                                                            |
| `apiFetch` has no timeout; `detectTrack` and `detectInjuryFlags` keyword matching; `@layer`, gitleaks, NowCast, the server allowing its own origin                                                                                                                                                                                                                             | Parked, by Phase 3 and the spec                                                                                       |
| The READMEs, the `render.yaml` and runbook CORS wording, the header-length check, and the test pinning CLAUDE.md's floors to the configs                                                                                                                                                                                                                                       | Phase 6, R1 to R4                                                                                                     |
