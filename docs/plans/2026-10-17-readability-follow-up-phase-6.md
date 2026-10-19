# Readability follow-up: Phase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 6 of the readability follow-up, the records: R4 (a header-length check in the header ratchet), R2 (a test pinning each coverage floor to its config's measurement note, which is what CLAUDE.md will point at), the test and config comments the earlier phases routed here, R3 (the READMEs and the "barely exercised" CORS wording) and R1 (CLAUDE.md). It is the last phase: when it merges, the spec's success criteria can be checked.

**Architecture:** Phase 6 of `docs/specs/2026-10-10-readability-follow-up-design.md`. Rule 6 says records of measured state are edited once, at the end, so they describe the final state; that is why the two tests come first and CLAUDE.md last. Five PRs, one track, merged one at a time, each a new branch from current `origin/main`. Nothing here changes a line that coverage measures (see "Coverage", below), so **there is no floor PR in this phase**: rule 3's floor PR closes a phase that moved a measurement, and this one moves none. Two tasks add tests to `scripts/__tests__/repo-invariants.test.mjs`; they have a mutation step, not a failing-test-first step, because each pins a property the tree already has (R4 must pass on the day it lands, and R2 pins an agreement that holds today), and each says so.

**Tech Stack:** Node 24 (22 in CI too), Vitest 5 (the root `test:scripts` project), Prettier 3.9, ESLint, knip, GitHub (gh CLI). No browser, no Postgres for the new tests; `test:coverage` still needs Postgres as a gate.

**Status:** complete as a plan; nothing in it has been run against the repository except read-only commands. Every count and expected output was measured on `main` at `a86daa3` on 2026-10-17: the two new test blocks were run, as written here, from a scratch file against the real tree (43 tests, all passing), and their mutations were checked in memory (see each task).

**Owner's decisions, 2026-10-18.** The calls this plan left open are settled, and every task below runs as written:

- **The CLAUDE.md list** ("CLAUDE.md changes for approval") is approved as a whole, A11 included.
- **R2** takes the recommended design: CLAUDE.md points at the two configs, and the test pins each config's measurement note to its thresholds.
- **The Phase 5 plan's `--root server` commands** stay as written. The working command is recorded in CLAUDE.md (D3).
- **Task T** takes all ten fixes: the two routed here and the eight found.
- **`e2e/README.md`'s test counts** are dropped.

**Owner's decisions this plan needs.** Every task runs as written with the recommended answer; each can be overridden before its task starts.

1. **The CLAUDE.md changes** (Task R1). The full list, for one-pass approval, is at the end: "CLAUDE.md changes for approval".
2. **R2's design**: CLAUDE.md names no floor and points at the configs; the test pins each config's floors to its own measurement note (Task R2 says why). Recommended.
3. **The Phase 5 plan's `npx vitest run ... --root server` commands**, which fail from the repository root: record the right command in CLAUDE.md and leave the merged plan as it is, because `docs/README.md` says plans "are not updated afterwards". Recommended. The alternative is an erratum line at the top of the Phase 5 plan.
4. **`e2e/README.md`'s per-suite test counts** (Task R3, change 11): drop the column, as R1 drops counts from CLAUDE.md. Recommended; they are correct today (4, 10, 5).
5. **Scope of the comments task** (Task T): the two items routed here, plus seven more of the same kind found while checking. Recommended: all of them, because each is a comment the code has already made untrue.

**Baseline (`main` at `a86daa3`, 2026-10-17).**

| What                 | Measured                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client coverage      | 4871 / 4927, 3184 / 3393, 1004 / 1013, 4442 / 4464 (98.86 / 93.84 / 99.11 / 99.50); floors 98.8 / 93.8 / 99.1 / 99.5; 2408 tests                                                                           |
| Server coverage      | 2269 / 2385, 1652 / 1871, 381 / 396, 2039 / 2119 with `client/dist` present (95.13 / 88.29 / 96.21 / 96.22); floors 95.1 / 88.2 / 96.2 / 96.2; 1178 tests. Without `client/dist`, branches are 1653 / 1871 |
| `test:scripts`       | 3 files, 97 tests, exit 0                                                                                                                                                                                  |
| `lint`               | exit 0, no output past the script banner                                                                                                                                                                   |
| Header ratchet scope | 200 tracked files; every one has a header. Lines of header text: 1 line in 1 file, 2 in 55, 3 in 101, **4 in 43**, more than 4 in **none**                                                                 |
| Main client chunk    | `index-CucB87GF.js` 484.95 kB (gzip 149.13 kB), no size warning (scratch build with `--outDir` outside the repo; the same hash as the `client/dist` on disk)                                               |

The coverage counts are #245's measurement on `fb9423a`, whose source is `main`'s (`a86daa3` changed only the two configs), and they match the `coverage-summary.json` files on disk. The header figures come from `header-lengths.mjs` (Tools), which uses the ratchet's own scope and comment extraction.

**Coverage.** Phase 6 cannot move a coverage figure, and the plan does not re-measure for that reason:

- `client/vite.config.js` measures `include: ["src/**"]` with `exclude: ["**/*.test.{js,jsx}", "src/test/**"]`, relative to `client/`; `server/vitest.config.js` measures `include: ["src/**"]` with `exclude: ["**/*.test.js", "src/generated/**"]`, relative to `server/`. Neither reaches `scripts/`, `docs/`, the READMEs, `CLAUDE.md`, `knip.jsonc` or `render.yaml`.
- The root `vitest.config.js` (the `test:scripts` project) has no coverage block, and `npm run test:coverage` runs only the two workspaces (`package.json`).
- The one task that edits files under `client/src` and `server/src` (Task T) edits only `*.test.js` files, which both configs exclude, and only their comments, so no test is added or removed.

So every PR still runs `test:coverage` as a gate, and must print the baseline's counts exactly; a difference means something outside this plan moved, and is found before the PR is marked ready.

---

## Summary of the tasks

| Order | Task | Branch                          | Changes                                                                                                                                         | Files                                                                                                                              |
| ----- | ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 0     | P    | `docs/phase-6-plan`             | This plan, and its line in `docs/README.md`. Landed by the coordinator, as every phase plan has been                                            | `docs/plans/2026-10-17-readability-follow-up-phase-6.md`, `docs/README.md`                                                         |
| 1     | R4   | `test/header-length-check`      | The ratchet also fails a header over four lines of text; the SOP says so                                                                        | `scripts/__tests__/repo-invariants.test.mjs`, `docs/code-readability-sop.md`                                                       |
| 2     | R2   | `test/pin-coverage-floors`      | A test that each config's floors are its measurement note truncated to one decimal, and that CLAUDE.md names both configs                       | `scripts/__tests__/repo-invariants.test.mjs`                                                                                       |
| 3     | T    | `docs/true-test-comments`       | Nine comments made untrue by later work: plan-task provenance in four test files, two stale counts, a renamed helper, a knip count, a plan link | five server test files, one client test file, `knip.jsonc`                                                                         |
| 4     | R3   | `docs/readmes-and-cors-wording` | The READMEs agree with the code; the "barely exercised" CORS wording is replaced in three places                                                | `README.md`, `client/README.md`, `server/README.md`, `scripts/README.md`, `e2e/README.md`, `render.yaml`, `docs/deploy-runbook.md` |
| 5     | R1   | `docs/claude-md-records`        | CLAUDE.md: wrong statements fixed, changed identifiers fixed, volatile figures replaced by where they live, the missing records added           | `CLAUDE.md`                                                                                                                        |

Merge order: P, then R4 → R2 → T → R3 → R1. R2 follows R4 because both add to the same test file. R3 follows both because `scripts/README.md` lists what that file pins. R1 is last because it names both new checks and is the record rule 6 means. T only has to precede R1 (both state knip's false-positive count), and can move if the owner wants it sooner.

---

## Conventions

- **Shell.** Git Bash, from `D:\ai-workout`, with an uppercase `D`: the lowercase path breaks Vitest. Set `SCRATCH` to a folder outside the repo and redirect output there; `TOOLS="$SCRATCH/p6-tools"` holds the Tools section's scripts. Never `cd` into a `src` folder.
- **Exit codes.** Never gate on a pipe: redirect to a file, then read `$?`.
- **Secrets.** Never read, stat or print `server/.env` or any `.env*` file. If a permission rule blocks something, stop and say so.
- **Running one server test file.** `npm run test -w server -- <path>` or `npm -w server exec vitest run <path>`, never `npx vitest run <path> --root server` from the root: `index.js`, `db/prisma.js` and `vitest.setup.js` call `dotenv.config()` with no path, which reads `.env` from the working directory, so from the root the suite never sees `server/.env` (Task R1, change D3).
- **Postgres.** `test:coverage` needs it (`npm run postgres:local:start -w server`) and a generated Prisma client after any `npm ci` (`npm run prisma:generate -w server`). Check the `Tests` line reports no failure before reading a count.
- **Take `main`: every task is a NEW branch.** `git fetch origin && git switch -c <branch> origin/main`. Open the PR as a draft. If `main` moves before the PR is ready, merge it in (`git fetch origin && git merge origin/main`), never rebase, then re-run the gates. Check with `git merge-base --is-ancestor origin/main HEAD; echo $?` as its own command (it must print `0`) before `gh pr ready`.
- **Line numbers** are on `a86daa3`. Every edit is anchored by the full text it replaces, which each task quotes; the number is a guide. R4 and R2 both edit `repo-invariants.test.mjs`, in different places (R4 inside the header block at lines 453-622, R2 a new block after it), so R2's anchor is R4's result and is quoted that way.
- **Formatting.** Run `npx prettier --write <the files you changed>` before the gates and re-read anything Prettier reflowed. Prettier keeps line breaks in Markdown (`proseWrap` is not set), so a reworded CLAUDE.md or README paragraph keeps the breaks it is given: keep prose lines within 92 columns, as CLAUDE.md's are, and list continuations indented as their neighbours are. Comment lines in code stay within 100 columns.
- **Numbers and Prettier.** Prettier 3.9.10 rewrites a JS number literal: `93.80` becomes `93.8` and `5.` becomes `5`, but `99.0` stays `99.0` (it keeps one zero after the point); in CSS `99.0%` becomes `99%`. Comments are left alone. Measured with `npx prettier --stdin-filepath`, Task R1 change D5.
- **Byte-order marks.** None of the files this plan edits starts with one; `head -c 3 <file> | od -An -tx1` must not print `ef bb bf` for any of them before or after.
- **Comments (spec rule 4)** follow `docs/code-readability-sop.md`: present tense, every claim checked against the code, no figure that lives elsewhere.
- **Mutation checks.** Write `$TOOLS/mutate.mjs` (Tools) and each mutation's JSON with the Write tool, never a heredoc or an argument. Run them after the change is committed; restore with `git checkout -- <files>` and confirm `git status --porcelain` prints nothing. The tool exits 2 when an edit did not apply, so an unapplied mutation cannot read as a caught one.
- **The gates on every PR.** Each redirected to a file; every exit code must be `0`.

  ```bash
  npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
  npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
  npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "knip exit=$?"
  npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"; grep -E "index-.*\.js|larger than" "$SCRATCH/build.txt"
  npm run test:coverage > "$SCRATCH/cov.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files|Tests  " "$SCRATCH/cov.txt"
  npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"; grep -E "Tests  " "$SCRATCH/scripts.txt"
  ```

  `build` runs before `test:coverage` because the server's branch count depends on `client/dist` (the baseline's 1652 is the with-build figure). **`test:e2e` is not a gate in this phase**: no task changes anything a browser runs. R3 edits comments in `render.yaml`, which no test or build reads, and T edits comments in test files only. If a task grows past that, add `npm run test:e2e` back.

- **Merging.** A PR merges only after its spec and quality reviews pass, its checks are green, and it shows `mergeStateStatus` `CLEAN`. Merge with "Create a merge commit" (`gh pr merge <n> --merge`, run on its own), then wait for CI on `main` to go green before the next task.
- **Trailers.** Every commit ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

---

## Tools

Write each into `$TOOLS` with the Write tool. They run from the repo root with Node 22 or 24 and need nothing installed.

| Script               | Where it comes from                                                                                                               | What it does                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `mutate.mjs`         | Phase 3's client plan (`docs/plans/2026-10-15-readability-follow-up-phase-3-client.md`, Conventions, "Mutation checks"), verbatim | Applies `[{ "file", "find", "text" }]` edits from a JSON file; exits 2 when one did not apply                    |
| `header-lengths.mjs` | below                                                                                                                             | The ratchet's scope and comment extraction, then each header's lines of text, as a histogram and the longest ten |

`header-lengths.mjs`:

<!-- prettier-ignore -->
```js
/**
 * Measures the header of every file the header ratchet scans: the same scope
 * and comment extraction as repo-invariants.test.mjs, then the header's lines
 * of text (a line that is empty once its comment marker is removed does not
 * count). Usage: node header-lengths.mjs <repoRoot>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.argv[2] ?? ".";
const IN_SCOPE_DIRS = ["client/src", "server/src", "server/scripts", "scripts", "e2e"];
const isInScope = (file) =>
  /\.(js|jsx|mjs|cjs|css)$/.test(file) &&
  !/\.(test|spec)\.|(^|\/)__tests__\/|^client\/src\/test\/setup\.js$/.test(file) &&
  (IN_SCOPE_DIRS.some((dir) => file.startsWith(`${dir}/`)) ||
    /(^|\/)[^/]+\.config\.js$/.test(file));
const sources = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
  .split("\0")
  .filter((file) => file && isInScope(file) && existsSync(path.join(repoRoot, file)));

const headerLines = (text) => {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const body = withoutBom.replace(/^#!.*\r?\n/, "").trimStart();
  let lines;
  if (body.startsWith("//")) {
    lines = [];
    for (const line of body.split(/\r?\n/)) {
      if (!line.trimStart().startsWith("//")) break;
      lines.push(line.trimStart().slice(2));
    }
  } else if (body.startsWith("/*")) {
    const end = body.indexOf("*/", 2);
    lines = body.slice(2, end === -1 ? undefined : end).split(/\r?\n/);
  } else {
    return -1;
  }
  return lines.map((line) => line.replace(/^\s*[*!]+/, "").trim()).filter((l) => l !== "").length;
};

const rows = sources.map((file) => ({ file, n: headerLines(readFileSync(path.join(repoRoot, file), "utf8")) }));
const histogram = new Map();
for (const { n } of rows) histogram.set(n, (histogram.get(n) ?? 0) + 1);
console.log(`files in scope: ${rows.length}`);
for (const [n, count] of [...histogram].sort((a, b) => a[0] - b[0]))
  console.log(`  ${n === -1 ? "no header" : `${n} line(s)`}: ${count}`);
for (const { file, n } of [...rows].sort((a, b) => b.n - a.n).slice(0, 10)) console.log(`  ${n}  ${file}`);
```

Expected on `a86daa3`: `files in scope: 200`, then `1 line(s): 1`, `2 line(s): 55`, `3 line(s): 101`, `4 line(s): 43`, and a longest ten that are all `4`.

---

## Task R4: The ratchet checks a header's length

**What the spec asks.** "A header-length check in the ratchet. It passes on the day it lands, because 1.2 trimmed the three long headers." The SOP's rule 1 already sets the length: a header is "a comment of one to four lines of text", and "a line holding only a delimiter (`/**`, `/*`, `*/` or `//`) does not count". Today nothing checks it. This task makes the ratchet check exactly that rule, with the limit the SOP states, so the test and the SOP cannot disagree.

**It passes today, by measurement.** `header-lengths.mjs` over the 200 files in the ratchet's scope: 1 file with one line of text, 55 with two, 101 with three, 43 with four, none with more, and none without a header. No header contains a blank ` *` line between two lines of text (checked separately: no block header's physical length exceeds its text lines by more than its two delimiter lines). So the limit of four is the SOP's number and the tree's maximum. 43 files sit at the limit, which is fine: the rule is "one to four".

**Design.** The ratchet already extracts the header to check it is there: `hasHeaderText` reads the run of `//` lines, or the block comment, the file opens with, and takes its first line of content. The extraction moves into `headerOf`, which returns every line of content; `hasHeaderText` keeps its exact behaviour on top of it, and a new `headerLineCount` counts the lines. One definition of "the header" then serves both checks, so a file cannot pass one under a reading the other rejects. No allowlist: a header over four lines is trimmed, or its extra lines move to a second comment below it, as `scripts/run-claude-helper.cjs` already does.

One thing the count includes, and the SOP's wording does: for a `//` header, every `//` line up to the first line that is not one. A tool directive or a section banner placed directly under a `//` header, with no blank line between, counts toward its four. The SOP puts directives "below the header", and today no file is affected; the failure message says what to do.

**No failing test first.** The check must pass on the day it lands, so there is nothing for it to fail on. Step 4's mutations are what show it reads real files and counts the way the SOP says.

**Files:**

- Modify: `scripts/__tests__/repo-invariants.test.mjs:454-456` (the block's comment), `:487-513` (the extraction), `:597` (the new tests after it)
- Modify: `docs/code-readability-sop.md:24-25`

- [ ] **Step 1: Branch, and measure**

```bash
git fetch origin && git switch -c test/header-length-check origin/main
node "$TOOLS/header-lengths.mjs" D:/ai-workout > "$SCRATCH/r4-lengths.txt" 2>&1; echo "exit=$?"; cat "$SCRATCH/r4-lengths.txt"
```

Expected: `exit=0` and the histogram in Tools (200 files; 1 / 55 / 101 / 43; nothing above 4). If any file now has more than four, a merge since `a86daa3` added it: trim that header in this PR, in the SOP's style, and say so in the PR body.

- [ ] **Step 2: The block's comment**

In `scripts/__tests__/repo-invariants.test.mjs`, replace lines 454-456:

<!-- prettier-ignore -->
```js
  // docs/code-readability-sop.md asks every non-test source file to open with a
  // comment saying what it is for. This checks presence only; whether a header
  // is any good is review's job.
```

with:

<!-- prettier-ignore -->
```js
  // docs/code-readability-sop.md asks every non-test source file to open with a
  // comment of one to four lines saying what it is for. This checks that the
  // header is there and how long it is; whether it is any good is review's job.
```

- [ ] **Step 3: One extraction, two checks**

Replace lines 487-513:

<!-- prettier-ignore -->
```js
  // True when, after a byte-order mark and a shebang line, the text opens with a
  // comment whose first line of content is not a tool directive.
  const hasHeaderText = (file, text) => {
    const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const body = withoutBom.replace(/^#!.*\r?\n/, "").trimStart();
    const isBlock = body.startsWith("/*");
    let lines;
    if (body.startsWith("//")) {
      lines = [];
      for (const line of body.split(/\r?\n/)) {
        if (!line.trimStart().startsWith("//")) break;
        lines.push(line.trimStart().slice(2));
      }
    } else if (isBlock) {
      const end = body.indexOf("*/", 2);
      lines = body.slice(2, end === -1 ? undefined : end).split(/\r?\n/);
    } else {
      return false;
    }
    const content =
      lines.map((line) => line.replace(/^\s*[*!]+/, "").trim()).find((line) => line !== "") ?? "";
    if (content === "" || TOOL_DIRECTIVE.test(content)) return false;
    if (!isBlock) return true;
    if (BLOCK_ONLY_DIRECTIVE.test(content)) return false;
    return !(/\.(js|jsx|mjs|cjs)$/.test(file) && JS_BLOCK_ONLY_DIRECTIVE.test(content));
  };
  const hasHeader = (file) => hasHeaderText(file, readFileSync(path.join(repoRoot, file), "utf8"));
```

with:

<!-- prettier-ignore -->
```js
  // The comment the text opens with, after a byte-order mark and a shebang
  // line: a run of `//` lines, or one block comment. `content` is its lines of
  // text, each without its comment marker; a line left empty is dropped, which
  // is rule 1's "a line holding only a delimiter does not count". Null when the
  // text opens with neither.
  const headerOf = (text) => {
    const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const body = withoutBom.replace(/^#!.*\r?\n/, "").trimStart();
    const isBlock = body.startsWith("/*");
    let lines;
    if (body.startsWith("//")) {
      lines = [];
      for (const line of body.split(/\r?\n/)) {
        if (!line.trimStart().startsWith("//")) break;
        lines.push(line.trimStart().slice(2));
      }
    } else if (isBlock) {
      const end = body.indexOf("*/", 2);
      lines = body.slice(2, end === -1 ? undefined : end).split(/\r?\n/);
    } else {
      return null;
    }
    const content = lines
      .map((line) => line.replace(/^\s*[*!]+/, "").trim())
      .filter((line) => line !== "");
    return { isBlock, content };
  };
  // True when the text opens with a comment whose first line of content is not
  // a tool directive.
  const hasHeaderText = (file, text) => {
    const header = headerOf(text);
    if (!header) return false;
    const first = header.content[0] ?? "";
    if (first === "" || TOOL_DIRECTIVE.test(first)) return false;
    if (!header.isBlock) return true;
    if (BLOCK_ONLY_DIRECTIVE.test(first)) return false;
    return !(/\.(js|jsx|mjs|cjs)$/.test(file) && JS_BLOCK_ONLY_DIRECTIVE.test(first));
  };
  const hasHeader = (file) => hasHeaderText(file, readFileSync(path.join(repoRoot, file), "utf8"));

  // Rule 1 allows one to four lines of text.
  const HEADER_MAX_LINES = 4;
  const headerLineCount = (text) => headerOf(text)?.content.length ?? 0;
```

`hasHeaderText` gives the same answer for every input: `find((line) => line !== "") ?? ""` is the first element of the filtered list, or `""` when it is empty, which is what `header.content[0] ?? ""` reads. The existing 20-row table (`the header rule: %s`) is the proof, and it is unchanged.

- [ ] **Step 4: The tests**

After lines 591-597 (the whole of "every source file not on the allowlist opens with a header", which is unique; a bare `});` is not):

<!-- prettier-ignore -->
```js
  test("every source file not on the allowlist opens with a header", () => {
    const missing = sources.filter((file) => !allowed.has(file) && !hasHeader(file));
    expect(
      missing,
      "give each file a header comment (docs/code-readability-sop.md, rule 1); never add it to file-header-allowlist.json"
    ).toEqual([]);
  });
```

insert:

<!-- prettier-ignore -->
```js

  test.each([
    ["a four-line block", "/**\n * One.\n * Two.\n * Three.\n * Four.\n */\n", 4],
    ["a CSS block with text on its delimiter lines", "/* One.\n   Two.\n   Three. */\n", 3],
    ["a blank line inside a block", "/**\n * One.\n *\n * Two.\n */\n", 2],
    [
      "line comments, up to the first line that is not one",
      "// One.\n// Two.\n\n// Not the header.\n",
      2
    ],
    ["CRLF line endings", "/**\r\n * One.\r\n * Two.\r\n */\r\n", 2],
    ["a five-line block", "/**\n * 1.\n * 2.\n * 3.\n * 4.\n * 5.\n */\n", 5],
    ["no comment first", 'import x from "y";\n', 0]
  ])("the header's lines of text: %s", (_label, text, expected) => {
    expect(headerLineCount(text)).toBe(expected);
  });

  test("every source file's header is at most HEADER_MAX_LINES lines of text", () => {
    const long = sources
      .map((file) => [file, headerLineCount(readFileSync(path.join(repoRoot, file), "utf8"))])
      .filter(([, count]) => count > HEADER_MAX_LINES)
      .map(([file, count]) => `${file}: ${count} lines`);
    expect(
      long,
      "trim each header to four lines of text (docs/code-readability-sop.md, rule 1); move the rest to a comment below it"
    ).toEqual([]);
  });
```

The `test.each` file-name argument the presence table takes is not needed here: the count does not depend on the file type.

- [ ] **Step 5: The SOP**

In `docs/code-readability-sop.md`, replace lines 24-25:

<!-- prettier-ignore -->
```md
`scripts/__tests__/repo-invariants.test.mjs` fails on a file in its scope that does not
open with a header. The scope is every tracked `.js`, `.jsx`, `.mjs`, `.cjs` and `.css` file
```

with:

<!-- prettier-ignore -->
```md
`scripts/__tests__/repo-invariants.test.mjs` fails on a file in its scope that does not
open with a header, or whose header has more than four lines of text. The scope is every
tracked `.js`, `.jsx`, `.mjs`, `.cjs` and `.css` file
```

Then re-read the paragraph's remaining lines (26-29) after `prettier --write`: they keep their breaks, so the paragraph's third line is now short, which Markdown renders the same. The spec allows this SOP change ("any change to the readability SOP beyond R4" is out of scope).

- [ ] **Step 6: Run, commit, mutation-check**

```bash
npx prettier --write scripts/__tests__/repo-invariants.test.mjs docs/code-readability-sop.md
npm run test:scripts > "$SCRATCH/r4-scripts.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/r4-scripts.txt"
git add scripts/__tests__/repo-invariants.test.mjs docs/code-readability-sop.md
git commit -m "test(scripts): the header ratchet checks a header's length" -m "The SOP's rule 1 allows one to four lines of text, and nothing checked it. The ratchet reads the header once, for both its presence and its length; every tracked file passes, 43 of them at four lines." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  105 passed (105)`: the 97 of today plus seven table rows and the sweep. (The scratch run of these exact blocks against the tree passed every one of them, and the presence table and a presence sweep with them, under the refactored `hasHeaderText`.)

Write `$SCRATCH/mut-r4-limit.json`:

<!-- prettier-ignore -->
```json
[
  {
    "file": "scripts/__tests__/repo-invariants.test.mjs",
    "find": "const HEADER_MAX_LINES = 4;",
    "text": "const HEADER_MAX_LINES = 3;"
  }
]
```

Write `$SCRATCH/mut-r4-long.json`:

<!-- prettier-ignore -->
```json
[
  {
    "file": "client/src/app/cache.js",
    "find": " * cache that cannot be used only costs a page its head start.\n */",
    "text": " * cache that cannot be used only costs a page its head start.\n * A fifth line.\n */"
  }
]
```

```bash
node "$TOOLS/mutate.mjs" "$SCRATCH/mut-r4-limit.json"
npm run test:scripts > "$SCRATCH/r4-mut1.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |lines$" "$SCRATCH/r4-mut1.txt" | head -5; grep -c ": 4 lines" "$SCRATCH/r4-mut1.txt"
git checkout -- scripts/__tests__/repo-invariants.test.mjs; git status --porcelain
node "$TOOLS/mutate.mjs" "$SCRATCH/mut-r4-long.json"
npm run test:scripts > "$SCRATCH/r4-mut2.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |cache.js" "$SCRATCH/r4-mut2.txt" | head -5
git checkout -- client/src/app/cache.js; git status --porcelain
```

Expected: the first mutation `exit=1`, one failure, the sweep, listing **43** files at `4 lines` (the scratch run listed exactly 43, `client/src/app/cache.js` first); the second `exit=1`, one failure, the sweep, listing `client/src/app/cache.js: 5 lines` only. An empty status after each.

- [ ] **Step 7: Gates and PR**

Run the gates (Conventions). `test:coverage` must print the baseline's counts.

```bash
git push -u origin test/header-length-check
gh pr create --draft --base main --title "test(scripts): the header ratchet checks a header's length" --body-file "$SCRATCH/pr-r4.md"
```

`pr-r4.md` outline: the spec's R4 and the SOP's rule; the measurement (the histogram, nothing over four); the design (one extraction for both checks, and the `//` run note); the two mutation results; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Then `git merge-base --is-ancestor origin/main HEAD; echo $?` (must print `0`), `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Task R2: Each floor is pinned to its measurement note

**What the spec asks.** "A test that pins the floors CLAUDE.md names to the two configs, in the style of `repo-invariants.test.mjs`." Today CLAUDE.md names floors as figures ("As of 2026-09-28: server **94.32%** statements…"), and they are a phase stale: nothing ties them to the configs, so each floor PR leaves them behind.

**Three designs, and the one recommended.**

| Design                                                                                                                                                                  | What a floor PR must edit                                | Verdict                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. CLAUDE.md keeps a table of the eight floors; the test checks it equals the configs                                                                                   | Both configs and CLAUDE.md, the same eight numbers twice | Rejected. It is the duplication R1 removes, now enforced: every floor PR edits a third file, and rule 6 says records change once, at the end                                        |
| B. CLAUDE.md names no floor and points at the configs. The test pins each config's floors to that config's own "Measured" note, and checks CLAUDE.md names both configs | Both configs, the note and the floors together, as now   | **Recommended.** Nothing a floor PR does today changes, nothing is written twice, and the one place a human reads the figures is next to the floors the test holds them to          |
| C. B, plus a check that no percentage in CLAUDE.md equals a current floor                                                                                               | As B                                                     | Rejected. CLAUDE.md keeps historical figures on purpose ("3171 of 3388 branches is 93.59%, under the 93.6% floor"), and a coincidence with a later floor would fail an unrelated PR |

**Why B is enough.** Each config already carries the floors' source, a comment above `thresholds`: `// Measured 2026-10-17 (98.86 / 93.84 / 99.11 / 99.50), …` on the client and `// Measured 2026-10-17 (95.13 / 88.29 / 96.21 / 96.22), …` on the server, in Vitest's order (statements, branches, functions, lines). Rule 3 says each floor is its measurement truncated to one decimal, and today all eight are: 98.8 / 93.8 / 99.1 / 99.5 and 95.1 / 88.2 / 96.2 / 96.2. So the test asserts exactly rule 3. It fails when a floor is edited without its note, when a note is edited without its floors, and when a floor PR raises a note past a tenth but leaves the floor (the case rule 3 exists for). It never fails a correct floor PR: a floor below its truncated measurement is one rule 3 says to raise, and a floor above its measurement fails Vitest itself. And CLAUDE.md, after R1, says the figures are in those notes, so the test is what keeps the place CLAUDE.md points at true.

Two details the test has to get right, both measured:

- **The note's figures are truncated, not rounded.** They are the two-decimal figures from `coverage-summary.json` (88.2950 prints 88.29), so truncating them again to one decimal gives the exact measurement's truncation. A note quoting a rounded figure (88.30) would demand a floor of 88.3 that Vitest then fails, so the mismatch is caught either way. The test truncates the figure as text, which is exact for every input.
- **Prettier writes the floors, not the note.** Prettier 3.9.10 turns `99.10` into `99.1` and leaves `99.0` as written, and does not touch comments, so the note can keep `99.50` while the floor reads `99.5`. The parser reads either form.

**No failing test first.** It pins an agreement the tree already has; Step 3's mutations are what show it can fail. The scratch run of this block against the tree passed its 10 tests, and four in-memory mutations of the configs' text (the floor lowered, the note given the no-build branch figure, a floor raised past its note, the note's date and opening removed) were each caught.

**Files:**

- Modify: `scripts/__tests__/repo-invariants.test.mjs` (a new block at the end of the file)

- [ ] **Step 1: Branch, and read the two notes**

```bash
git fetch origin && git switch -c test/pin-coverage-floors origin/main
grep -n "Measured\|statements:\|branches:\|functions:\|lines:" client/vite.config.js server/vitest.config.js
```

Expected: `client/vite.config.js:70` and `server/vitest.config.js:29` each hold one `Measured 2026-10-17 (…)` line, and the floors at `client/vite.config.js:73-76` and `server/vitest.config.js:39-42` are 98.8 / 93.8 / 99.1 / 99.5 and 95.1 / 88.2 / 96.2 / 96.2. If a floor PR has merged since, the figures differ but must still agree under truncation.

- [ ] **Step 2: The block**

At the end of `scripts/__tests__/repo-invariants.test.mjs`, after the header block's last lines (R4 leaves them as they are on `a86daa3`):

<!-- prettier-ignore -->
```js
  test("the allowlist has exactly ALLOWLIST_SIZE entries", () => {
    expect(
      allowlist.length,
      "lower ALLOWLIST_SIZE when entries are removed; never raise it -- give the new file a header instead"
    ).toBe(ALLOWLIST_SIZE);
  });
});
```

append:

<!-- prettier-ignore -->
```js

describe("the coverage floors agree with their measurement notes", () => {
  // CLAUDE.md names no floor: it points at the two configs, where each side's
  // `thresholds` sits under a note giving the figures it was floored from,
  // "Measured <date> (statements / branches / functions / lines)", as
  // coverage-summary.json reports them, to two decimals. Each floor is its
  // figure truncated to one decimal, so a floor PR changes a note and its floors
  // together. This fails when one changes without the other, and when a figure
  // rose past a tenth and its floor was not raised with it.
  const CONFIGS = ["client/vite.config.js", "server/vitest.config.js"];
  const METRICS = ["statements", "branches", "functions", "lines"];

  // "98.86" -> 98.8, "99" -> 99. Done on the text, which is exact.
  const toTenths = (figure) => {
    const [whole, fraction = ""] = figure.split(".");
    return Number(`${whole}.${fraction.slice(0, 1) || "0"}`);
  };

  // Read as text rather than imported: the note is a comment, and importing
  // client/vite.config.js would load its Vite plugins for nothing.
  const readConfig = (file) => {
    const text = readFileSync(path.join(repoRoot, file), "utf8");
    const block = text.match(/thresholds:\s*\{([^}]*)\}/)?.[1] ?? "";
    const floors = METRICS.map((metric) => {
      const match = block.match(new RegExp(String.raw`\b${metric}:\s*(\d+(?:\.\d+)?)`));
      return match ? Number(match[1]) : undefined;
    });
    const note = text.match(
      /Measured \d{4}-\d{2}-\d{2} \((\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?)\)/
    );
    return { floors, measured: note ? note.slice(1, 5) : [] };
  };
  const byMetric = (values) => Object.fromEntries(METRICS.map((metric, i) => [metric, values[i]]));

  test.each([
    ["98.86", 98.8],
    ["99.50", 99.5],
    ["88.29", 88.2],
    ["96.2", 96.2],
    ["99", 99]
  ])("a measured %s floors to %s", (figure, floor) => {
    expect(toTenths(figure)).toBe(floor);
  });

  test.each(CONFIGS)("%s has four floors and a measurement note", (file) => {
    // Guards the parsing: without it a moved note would pass the next test
    // vacuously, with nothing compared.
    const { floors, measured } = readConfig(file);
    expect(floors.every((floor) => Number.isFinite(floor))).toBe(true);
    expect(measured).toHaveLength(4);
  });

  test.each(CONFIGS)("%s: each floor is its measured figure truncated to one decimal", (file) => {
    const { floors, measured } = readConfig(file);
    expect(
      byMetric(floors),
      "a floor PR updates the note and the floors together (spec rule 3)"
    ).toEqual(byMetric(measured.map(toTenths)));
  });

  test("CLAUDE.md points at both configs for the floors", () => {
    const claude = readFileSync(path.join(repoRoot, "CLAUDE.md"), "utf8");
    for (const file of CONFIGS) expect(claude).toContain(`\`${file}\``);
  });
});
```

`readFileSync` and `path` are already imported at the top of the file, and `repoRoot` is defined there.

- [ ] **Step 3: Run, commit, mutation-check**

```bash
npx prettier --write scripts/__tests__/repo-invariants.test.mjs
npm run test:scripts > "$SCRATCH/r2-scripts.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/r2-scripts.txt"
git add scripts/__tests__/repo-invariants.test.mjs
git commit -m "test(scripts): pin each coverage floor to its measurement note" -m "Each config's thresholds sit under a note giving the figures they were floored from. The test holds every floor to its figure truncated to one decimal, which is spec rule 3, and checks CLAUDE.md names both configs, so CLAUDE.md can point at the notes instead of repeating the floors." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  115 passed (115)` (105 after R4, plus five `toTenths` rows, two per-config parse checks, two per-config comparisons and the CLAUDE.md check).

Write four mutation files with the Write tool:

`$SCRATCH/mut-r2-floor.json` (a floor lowered without its note):

<!-- prettier-ignore -->
```json
[
  {
    "file": "client/vite.config.js",
    "find": "functions: 99.1,",
    "text": "functions: 99,"
  }
]
```

`$SCRATCH/mut-r2-note.json` (the note given the no-build server figure, its floor left):

<!-- prettier-ignore -->
```json
[
  {
    "file": "server/vitest.config.js",
    "find": "(95.13 / 88.29 / 96.21 / 96.22)",
    "text": "(95.13 / 88.34 / 96.21 / 96.22)"
  }
]
```

`$SCRATCH/mut-r2-gone.json` (the client note's figures removed):

<!-- prettier-ignore -->
```json
[
  {
    "file": "client/vite.config.js",
    "find": "// Measured 2026-10-17 (98.86 / 93.84 / 99.11 / 99.50), the same locally",
    "text": "// Measured 2026-10-17, the same locally"
  }
]
```

`$SCRATCH/mut-r2-claude.json` (CLAUDE.md stops naming the server config):

<!-- prettier-ignore -->
```json
[
  {
    "file": "CLAUDE.md",
    "find": "`server/vitest.config.js`",
    "text": "the server's config"
  }
]
```

```bash
for m in floor note gone claude; do
  node "$TOOLS/mutate.mjs" "$SCRATCH/mut-r2-$m.json" || break
  npm run test:scripts > "$SCRATCH/r2-mut-$m.txt" 2>&1; echo "$m exit=$?"; grep -E "Tests  |×" "$SCRATCH/r2-mut-$m.txt" | head -4
  git checkout -- client/vite.config.js server/vitest.config.js CLAUDE.md; git status --porcelain
done
```

Expected, each with an empty status after it:

- `floor exit=1`: one failure, `client/vite.config.js: each floor is its measured figure truncated to one decimal`.
- `note exit=1`: one failure, the same test for `server/vitest.config.js` (88.3 against 88.2).
- `gone exit=1`: two failures for `client/vite.config.js`, "has four floors and a measurement note" and the comparison.
- `claude exit=1`: one failure, "CLAUDE.md points at both configs for the floors". On `a86daa3` CLAUDE.md names `` `server/vitest.config.js` `` once (line 527), so the one replacement removes it.

- [ ] **Step 4: Gates and PR**

Run the gates. `test:coverage` must print the baseline's counts.

```bash
git push -u origin test/pin-coverage-floors
gh pr create --draft --base main --title "test(scripts): pin each coverage floor to its measurement note" --body-file "$SCRATCH/pr-r2.md"
```

`pr-r2.md` outline: the spec's R2; the three designs and why B (the table above, shortened); what the test asserts and why a correct floor PR always passes it; the truncation and Prettier notes; the four mutation results; that CLAUDE.md is rewritten to point at the notes in R1, this phase's last PR; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Then the ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Task T: Test and config comments the code has made untrue

**What was routed here.** Phase 3's server plan: "Provenance in test comments that this phase does not otherwise touch: `collectionReads.integration.test.js:6-11` (…), and `authRoutes.test.js`'s "Task 4b" and "Task 5" notes", for "Phase 6, records, or a later readability sweep". The SOP's provenance rule says a reference to a plan task is rewritten as what the code does ("Provenance, rewritten in the present").

**What else this task takes, found while checking.** A sweep with `git grep -n -i "task [0-9]"` and `"Finding [0-9]"` over `client/src`, `server/src`, `scripts` and `e2e`, plus a grep for every identifier Phase 5 deleted, found seven more comments of the same two kinds: a plan or review reference standing in for a reason, and a fact the code has since changed. Each is listed with the check that shows it untrue. (The sweep's other hit, `WorkoutResultPage.test.jsx:214`'s `"Task 2"`, is test data, not a comment.) Recommendation: take all of them here; the alternative is to take only the two routed items and list the rest under "Not in this phase".

| #   | File and lines                                                                   | Untrue because                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `server/src/routes/dashboard/__tests__/collectionReads.integration.test.js:6-11` | "before loadCollectionPage is migrated off the Mongo compatibility shim": the shim is retired in full (CLAUDE.md, "Data access"); "the way the plan originally assumed" is provenance (routed)                           |
| 2   | `server/src/routes/__tests__/authRoutes.test.js:175`                             | "the Task 4b repository function": it is `userRepository.js`'s `updatePasswordHash` (`repositories/userRepository.js:74`) (routed)                                                                                       |
| 3   | `server/src/routes/__tests__/authRoutes.test.js:830`                             | "Task 3's rule": it is `getSessionUser`'s `passwordChangedAt` check (`services/auth/sessionService.js:412-416`)                                                                                                          |
| 4   | `server/src/routes/__tests__/authRoutes.test.js:951`                             | "Task 5's realRequireAuth": it is the `POST /api/auth/password` block's, at line 682 of the same file (routed)                                                                                                           |
| 5   | `server/src/__tests__/index.wiring.test.js:18-24`                                | "Task 5 and 6 added …": provenance; and since Phase 5's S3 the file also pins `/api/generate`, whose suite builds its route from hand-passed deps the same way                                                           |
| 6   | `server/src/services/auth/__tests__/sessionService.test.js:191`                  | "Task 5 mints a replacement session": it is `POST /api/auth/password` (`routes/authRoutes.js:247-250` says so)                                                                                                           |
| 7   | `server/src/__tests__/index.rateLimit.test.js:3-8, 126-129`                      | "The four limiters", "three of the four handlers": `index.js:506-598` declares five (`api`, `auth`, `credential`, `generate`, `anonGenerate`), and the file's `LIMIT_KEYS` names five. "Finding 1" is a review reference |
| 8   | `client/src/pages/home/components/physique/__tests__/math.test.js:49-50`         | "toFiniteNumber in useBodyModel.js": #244 folded it into `toNumberOrNull`; `useBodyModel.js:8` imports `toNumberOrNull` from `app/units`, and `git grep -n toFiniteNumber -- client/src/pages/home/hooks` finds nothing  |
| 9   | `knip.jsonc:8`                                                                   | "six false positives": with the four hook entries removed, knip reports **seven** unused files, the four and `scripts/codex-handoff/`'s three (measured with a scratch config on `a86daa3`)                              |
| 10  | `server/src/routes/dashboard/write/__tests__/mealLogs.integration.test.js:161`   | "see the plan doc": it does not say which; it is `docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md`, whose Task 3 notes describe the pipeline (lines 79 and 162)                                                  |

Every file here is a test file or `knip.jsonc`, and only comments change: no test is added or removed, and nothing the coverage configs measure is touched (see "Coverage"). No failing test first: there is no behaviour.

**Files:**

- Modify: the ten locations in the table.

- [ ] **Step 1: Branch, and confirm each anchor**

```bash
git fetch origin && git switch -c docs/true-test-comments origin/main
git grep -n -i "task [0-9]\|finding [0-9]\|four limiters\|toFiniteNumber in useBodyModel\|six false positives\|see the plan doc\|Mongo compatibility shim" -- client/src server/src scripts e2e knip.jsonc
```

Expected: exactly the table's lines, plus `WorkoutResultPage.test.jsx:214` (test data, left alone).

- [ ] **Step 2: The edits**

1. `collectionReads.integration.test.js`, replace lines 6-11:

<!-- prettier-ignore -->
```js
// Pins the paginated dashboard collection reads against real Postgres before
// loadCollectionPage is migrated off the Mongo compatibility shim.
//
// All three collections share one generic read path, so they are covered
// together -- that shared-ness is why the read side cannot be migrated one model
// at a time the way the plan originally assumed.
```

with:

<!-- prettier-ignore -->
```js
// Pins the paginated dashboard collection reads against real Postgres. The
// three collections (workout sessions, meal logs, progress metrics) share one
// generic read path, loadCollectionPage in
// repositories/dashboardCollectionRepository.js, so they are covered together.
```

2. `authRoutes.test.js`, replace line 175:

<!-- prettier-ignore -->
```js
    // A stand-in for the Task 4b repository function: mutates the row's hash
```

with:

<!-- prettier-ignore -->
```js
    // A stand-in for userRepository's updatePasswordHash: mutates the row's hash
```

3. `authRoutes.test.js`, replace lines 829-831:

<!-- prettier-ignore -->
```js
    // Not cosmetic. If the route reused the old token, that token predates
    // the stamp and Task 3's rule would reject it on the very next request --
    // signing the user out the instant they changed their password.
```

with:

<!-- prettier-ignore -->
```js
    // Not cosmetic. If the route reused the old token, that token predates
    // the stamp, and getSessionUser's passwordChangedAt check would reject it
    // on the very next request -- signing the user out the instant they changed
    // their password.
```

4. `authRoutes.test.js`, replace line 951 (after edit 3, line 952):

<!-- prettier-ignore -->
```js
  // Task 5's realRequireAuth rather than reusing the shared stub.
```

with:

<!-- prettier-ignore -->
```js
  // the POST /api/auth/password block's realRequireAuth rather than reusing the
  // shared stub.
```

5. `index.wiring.test.js`, replace lines 18-24:

<!-- prettier-ignore -->
```js
// Task 5 and 6 added POST /api/auth/password and DELETE /api/auth/me to
// authRoutes.js and fully tested them against a hand-built buildApp(overrides)
// test harness. That harness passes every dependency directly, so it proves
// nothing about the real app: index.js injects the actual dependency object
// into registerApiRoutes, and a missing key there is invisible until someone
// calls the route at runtime -- registerAuthRoutes destructures an absent key
// as undefined with no error at import time.
```

with:

<!-- prettier-ignore -->
```js
// authRoutes.test.js and generateRoutes.equipment.test.js build their routes
// from dependencies passed by hand, which proves nothing about the real app:
// index.js injects the actual dependency object into registerApiRoutes, and a
// missing key there is invisible until someone calls the route at runtime -- a
// route destructures an absent key as undefined with no error at import time.
```

6. `sessionService.test.js`, replace lines 191-192:

<!-- prettier-ignore -->
```js
    // Task 5 mints a replacement session immediately after stamping
    // passwordChangedAt, so the two can share a millisecond. Strict `<` is what
```

with:

<!-- prettier-ignore -->
```js
    // POST /api/auth/password mints a replacement session immediately after
    // stamping passwordChangedAt, so the two can share a millisecond. Strict `<` is what
```

7. `index.rateLimit.test.js`, replace lines 3-8:

<!-- prettier-ignore -->
```js
// The four limiters are the app's only defence against credential stuffing and
// against an anonymous caller burning the Gemini quota, and each one's handler
// -- the 429 body, the scope label on the log line, the metrics counter -- ran
// untested. index.test.js already loops until it sees *a* 429 on /api/generate,
// but it never asserts which limiter answered, so three of the four handlers
// were uncovered and any of them could have returned another's message.
```

with:

<!-- prettier-ignore -->
```js
// The five limiters are the app's only defence against credential stuffing and
// against an anonymous caller burning the Gemini quota. index.test.js loops
// until it sees *a* 429 on /api/generate but never asserts which limiter
// answered, so this file does: each case expects the 429 body of the limiter it
// names, and one checks the metrics counter a limited request moves.
```

and replace lines 126-129:

<!-- prettier-ignore -->
```js
  // Finding 1: the password-change and account-deletion routes previously had
  // only the global /api budget behind them, ~8x looser than login for a
  // guess that costs the same argon2id verify. This is the credential
  // limiter's own regression coverage.
```

with:

<!-- prettier-ignore -->
```js
  // Without the credential limiter, the password-change and account-deletion
  // routes would have only the global /api budget behind them: at the defaults,
  // about eight times looser than login's for a guess that costs the same
  // argon2id verify.
```

The "about eight times" is the defaults' arithmetic, from `README.md`'s rate-limit table: the global limit is 300 per 15 minutes (20 a minute) and the auth limit 25 per 10 minutes (2.5 a minute).

8. `math.test.js`, replace lines 49-50:

<!-- prettier-ignore -->
```js
  // missing measurement into a real one. Same shape as toNumberOrNull in the
  // server's rowValues.js and toFiniteNumber in useBodyModel.js.
```

with:

<!-- prettier-ignore -->
```js
  // missing measurement into a real one. Same shape as toNumberOrNull in
  // app/units.js and in the server's rowValues.js.
```

9. `knip.jsonc`, replace lines 7-9:

<!-- prettier-ignore -->
```jsonc
      // all of them as unused files, then cascades to scripts/codex-handoff/*.mjs
      // because their only importer looks dead -- six false positives inviting
      // you to delete live hook wiring.
```

with:

<!-- prettier-ignore -->
```jsonc
      // all of them as unused files, then cascades to scripts/codex-handoff/*.mjs
      // because their only importer looks dead -- a false positive for every hook
      // file, inviting you to delete live hook wiring.
```

10. `mealLogs.integration.test.js`, replace lines 160-161:

<!-- prettier-ignore -->
```js
  // Meal logs feeding the calories view. The rules are taken from the Mongo
  // pipeline that was supposed to do this and never ran -- see the plan doc.
```

with:

<!-- prettier-ignore -->
```js
  // Meal logs feeding the calories view. The rules are taken from the Mongo
  // pipeline that was supposed to do this and never ran; see
  // docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md.
```

- [ ] **Step 3: Prove nothing but comments changed, run the touched suites, commit**

```bash
npx prettier --write server/src/routes/dashboard/__tests__/collectionReads.integration.test.js server/src/routes/__tests__/authRoutes.test.js server/src/__tests__/index.wiring.test.js server/src/services/auth/__tests__/sessionService.test.js server/src/__tests__/index.rateLimit.test.js client/src/pages/home/components/physique/__tests__/math.test.js knip.jsonc server/src/routes/dashboard/write/__tests__/mealLogs.integration.test.js
git diff -U0 | grep -E "^[+-][^+-]" | grep -vE "^[+-]\s*//" > "$SCRATCH/t-noncomment.txt"; echo "non-comment lines: $(wc -l < "$SCRATCH/t-noncomment.txt")"
npm run test -w server -- src/routes/__tests__/authRoutes.test.js src/__tests__/index.wiring.test.js src/services/auth/__tests__/sessionService.test.js src/__tests__/index.rateLimit.test.js src/routes/dashboard > "$SCRATCH/t-server.txt" 2>&1; echo "server exit=$?"; grep -E "Test Files|Tests  " "$SCRATCH/t-server.txt"
npx vitest run src/pages/home/components/physique/__tests__/math.test.js --root client > "$SCRATCH/t-client.txt" 2>&1; echo "client exit=$?"; grep -E "Tests  " "$SCRATCH/t-client.txt"
npm run knip > "$SCRATCH/t-knip.txt" 2>&1; echo "knip exit=$?"
git add -u
git commit -m "docs(tests): comments that name what the code does, not a plan task" -m "Plan-task and review references become the function or route they meant, the rate-limit suite counts five limiters, math.test.js names toNumberOrNull's real home, and knip.jsonc stops counting its false positives." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `non-comment lines: 0`; both suites `exit=0` with no failure (the server run needs Postgres: `src/routes/dashboard` includes both integration files); `knip exit=0`. `git add -u` stages only the eight modified files; check `git status --porcelain` shows nothing untracked from this task.

- [ ] **Step 4: Gates and PR**

Run the gates. `test:coverage` must print the baseline's counts, and both `Tests` lines the baseline's 2408 and 1178.

```bash
git push -u origin docs/true-test-comments
gh pr create --draft --base main --title "docs(tests): comments that name what the code does, not a plan task" --body-file "$SCRATCH/pr-t.md"
```

`pr-t.md` outline: the routed items and the seven found with them, as the table; the `non-comment lines: 0` check; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Then the ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Task R3: The READMEs, and the CORS wording

**What the spec asks.** "The READMEs, and the 'barely exercised' CORS wording in `render.yaml`, the README and `docs/deploy-runbook.md`." Phase 3's server plan routed `README.md:10`'s "in-memory fallback" here, and Phase 5 routed `client/README.md:24`'s "the planner modals". Every README was read in full against the code for this plan (`README.md`, `client/`, `server/`, `scripts/`, `e2e/`, `security/`, `docs/`, `server/db/postgres/`); `security/README.md`, `docs/README.md` and `server/db/postgres/README.md` need nothing.

**The CORS wording is wrong, not just loose.** All three say same-origin serving means "CORS is barely exercised". `corsPolicy.js:37-40` (corrected in Phase 1's item 1.2) says why it is not: "A browser does send one [an Origin header] on same-origin writes, and Chromium on the bundle's crossorigin script and stylesheet loads, so a deployment that serves its own page must list its own origin." `index.js:243` mounts `cors(corsOptions)` before every route and before `registerClientStatic` (`index.js:729`), and a refused origin is answered with status 403 (`corsPolicy.js:44-46`). So an unlisted own origin breaks every write and, in Chromium, the bundle itself. The replacements say that, in each file's register.

**Files and changes** (`a86daa3` line numbers):

| #   | File                     | Lines            | Change                                                                                        |
| --- | ------------------------ | ---------------- | --------------------------------------------------------------------------------------------- |
| 1   | `README.md`              | 10               | Sessions: Redis when configured and reachable at startup, memory otherwise                    |
| 2   | `README.md`              | 23               | `app/` holds the planner setup modal and the error boundary, not "the planner modals"         |
| 3   | `README.md`              | 390-392          | CORS                                                                                          |
| 4   | `render.yaml`            | 59-62            | CORS                                                                                          |
| 5   | `docs/deploy-runbook.md` | 162-163          | CORS                                                                                          |
| 6   | `client/README.md`       | 10               | The plan's PDF export is on the `/plan` page; GeneratedPlanModal is deleted (#236)            |
| 7   | `client/README.md`       | 23-24            | As change 2                                                                                   |
| 8   | `client/README.md`       | 89-91            | The main chunk's size: where to read it, instead of a figure                                  |
| 9   | `server/README.md`       | 8                | As change 1                                                                                   |
| 10  | `server/README.md`       | 240-243, 251-264 | Sessions: the "Known inconsistency in the Redis fallback" is gone since Phase 3's S1          |
| 11  | `scripts/README.md`      | 17-23            | What `repo-invariants.test.mjs` pins: five of its ten blocks were listed; R2 and R4 add to it |
| 12  | `e2e/README.md`          | 5-9              | Owner's decision 4: drop the per-suite test counts, and say how to list the tests             |

- [ ] **Step 1: Branch, and confirm the anchors**

```bash
git fetch origin && git switch -c docs/readmes-and-cors-wording origin/main
git grep -n "barely exercised" -- . ':!docs/plans' ':!docs/specs'
git grep -n "in-memory fallback\|planner modals\|Known inconsistency\|~487 kB\|generation modal" -- "*.md" render.yaml
```

Expected: the CORS phrase at `README.md:392`, `docs/deploy-runbook.md:163` and `render.yaml:60`; the rest at the lines in the table (`README.md:10`, `README.md:23`, `client/README.md:10, 24, 89`, `server/README.md:8, 251`). `README.md:221` ("the in-memory fallback cache") and `render.yaml:69`/`docs/deploy-runbook.md:101` ("every in-memory fallback is lost on each spin-down") also match "in-memory fallback": they describe the external cache and a Redis-less deployment, and stay as they are.

- [ ] **Step 2: The edits**

**1.** `README.md`, replace line 10:

<!-- prettier-ignore -->
```md
- Optional Redis-backed sessions with in-memory fallback
```

with:

<!-- prettier-ignore -->
```md
- Sessions in Redis when it is configured and connects at startup, in memory otherwise
```

Checked: `initSessionStore` (`services/auth/sessionService.js:219-304`) uses memory when neither `REDIS_URL` nor a host and valid port is set, or when the connection fails at startup, and chooses once; after that, `runSessionCommand` (`:194-207`) turns a failed command into `SessionStoreUnavailableError`, status 503, never a write to memory. The module header says the same.

**2.** `README.md`, replace line 23:

<!-- prettier-ignore -->
```text
|       |                     #   units; the planner modals with their CSS and images
```

with:

<!-- prettier-ignore -->
```text
|       |                     #   units; the planner setup modal, the error boundary,
|       |                     #   and the planner's CSS and images
```

Checked: `git ls-files client/src/app` lists `components/PlannerSetupModal.jsx` and `components/AppErrorBoundary.jsx` (rendered by `main.jsx:18`), `styles/planner/` and `assets/planner-thumbs/`, and no other modal.

**3.** `README.md`, replace lines 390-392:

<!-- prettier-ignore -->
```md
   Set `CLIENT_ORIGIN` to the service's own URL once Render assigns it, e.g.
   `https://ai-workout.onrender.com` — the production preflight refuses to start
   without it, even though same-origin serving means CORS is barely exercised.
```

with:

<!-- prettier-ignore -->
```md
   Set `CLIENT_ORIGIN` to the service's own URL once Render assigns it, e.g.
   `https://ai-workout.onrender.com` — the production preflight refuses to start
   without it. Serving the page from the same origin does not take CORS out of the
   path: a browser sends an `Origin` header on every same-origin write, and Chromium
   on the bundle's `crossorigin` script and stylesheet loads, so a service that does
   not list its own URL answers those requests 403.
```

Checked: the preflight is `envValidationService.js:70-71` ("CLIENT_ORIGIN (or CLIENT_ORIGINS) is required when NODE_ENV=production"); the rest as the paragraph above the table. `client/dist/index.html` carries `crossorigin` on its script, modulepreload and stylesheet tags.

**4.** `render.yaml`, replace lines 59-62:

<!-- prettier-ignore -->
```yaml
      # Required when NODE_ENV=production, and the preflight refuses to start
      # without it. Same-origin serving means CORS is barely exercised, but the
      # check is unconditional. Set it to this service's own URL, e.g.
      # https://ai-workout.onrender.com
```

with:

<!-- prettier-ignore -->
```yaml
      # Required when NODE_ENV=production, and the preflight refuses to start
      # without it. Same-origin serving still goes through CORS: a browser sends
      # an Origin header on same-origin writes, and Chromium on the bundle's
      # crossorigin script and stylesheet loads, so an unlisted origin gets 403.
      # Set it to this service's own URL, e.g. https://ai-workout.onrender.com
```

**5.** `docs/deploy-runbook.md`, replace lines 162-163:

<!-- prettier-ignore -->
```md
   The server refuses to start in production without it. Same-origin serving
   means CORS is barely exercised, but the startup check is unconditional.
```

with:

<!-- prettier-ignore -->
```md
   The server refuses to start in production without it, and it matters after
   that too: a browser sends an `Origin` header on every same-origin write, and
   Chromium on the bundle's `crossorigin` script and stylesheet loads, so a
   service that does not list its own URL answers those requests 403.
```

**6.** `client/README.md`, replace line 10:

<!-- prettier-ignore -->
```md
- Workout plan generation modal with PDF export support
```

with:

<!-- prettier-ignore -->
```md
- The planner setup modal, and the generated plan's page (`/plan`) with PDF export
```

Checked: `WorkoutResultPage.jsx:234` renders the Download PDF button, wired to `events.js`'s `downloadPlanPdf` (`App.jsx:508`); `git grep -n GeneratedPlanModal -- client` finds nothing.

**7.** `client/README.md`, replace lines 23-24:

<!-- prettier-ignore -->
```text
|   |-- app/                    # Shared constants, hooks, routing, cache, API helpers;
|   |                           #   the planner modals with their CSS and images
```

with:

<!-- prettier-ignore -->
```text
|   |-- app/                    # Shared constants, hooks, routing, cache, API helpers;
|   |                           #   the planner setup modal, the error boundary, and
|   |                           #   the planner's CSS and images
```

**8.** `client/README.md`, replace lines 89-91:

<!-- prettier-ignore -->
```md
The main chunk is ~487 kB (~149 kB gzipped) and the build emits no size warning, but
only ~13 kB separates it from the 500 kB threshold. It was ~407 kB until React 19, which
alone added the difference. Two things keep it under:
```

with:

<!-- prettier-ignore -->
```md
The main chunk sits close under Vite's 500 kB warning: `npm run build` prints its size,
as `dist/assets/index-*.js`, and today the build emits no warning. It was ~407 kB until
React 19, which alone added the difference. Two things keep it under:
```

Checked: a scratch build of `a86daa3` printed `index-CucB87GF.js 484.95 kB │ gzip: 149.13 kB`, so the old "~487 kB" and "~13 kB" were already off by 2 kB. The "~407 kB until React 19" is a measurement of a past state and stays; line 94's "~399 kB" for jspdf is what the same build printed (398.95 kB) and stays.

**9.** `server/README.md`, replace line 8:

<!-- prettier-ignore -->
```md
- Cookie sessions with optional Redis storage and in-memory fallback
```

with:

<!-- prettier-ignore -->
```md
- Cookie sessions, stored in Redis when it is configured and connects at startup, in
  memory otherwise
```

**10.** `server/README.md`, replace lines 240-243:

<!-- prettier-ignore -->
```md
Redis-backed when `REDIS_URL`, or `REDIS_HOST` **and** a valid `REDIS_PORT`, are set;
in-memory otherwise. A host without a usable port counts as _no_ configuration rather
than a broken one, and a failed connection falls back to memory and disconnects the
client so it does not retry and log forever.
```

with:

<!-- prettier-ignore -->
```md
Redis-backed when `REDIS_URL`, or `REDIS_HOST` **and** a valid `REDIS_PORT`, are set and
Redis connects at startup; in-memory otherwise. A host without a usable port counts as
_no_ configuration rather than a broken one, and a connection that fails at startup falls
back to memory and disconnects the client so it does not retry and log forever. The store
is chosen once, there.
```

and replace lines 251-264:

<!-- prettier-ignore -->
```md
**Known inconsistency in the Redis fallback.** When Redis is connected:

- `createSession` catches a write failure and falls back to the in-memory map.
- `getSessionByToken` consults **only** Redis — a miss returns null; memory is never read.
- `deleteSession` returns after the Redis delete and never touches memory.

So a session created during a Redis blip is written to memory but cannot be read back —
the user is signed out on their next request — and sign-out cannot clear it. It is not
inert either: if Redis is later disabled (including by `closeSessionStore`), those
entries begin resolving as live sessions. There are tests pinning both halves.

Making the read fall back to memory would fix the sign-out but would also let a _deleted_
session return, so this wants a decision about which store is authoritative rather than a
patch.
```

with:

<!-- prettier-ignore -->
```md
**While Redis is the store, a failed session command is a 503, never a fallback to
memory.** `createSession`, `getSessionByToken` and `deleteSession` each run their Redis
command through `runSessionCommand`, which logs the failure and throws
`SessionStoreUnavailableError` (status 503), and `sessionErrorStatus` is how a route turns
it into that answer. So a sign-in during an outage gets a 503 and no cookie, rather than a
session written to memory that the next request, which reads only Redis, could not find.
`REDIS_COMMAND_TIMEOUT_MS` (1.5 s) bounds how long a command waits to reach the socket, so
that answer comes quickly.
```

Checked: `sessionService.js:333-382` (all three run `runSessionCommand` while `redisSessionsEnabled && redisClient`, and touch memory only otherwise); `:20-37` (the error class and `sessionErrorStatus`); `:11-17` (the 1500 ms timeout, and "how long a Redis command may wait to reach the socket"); `routes/authRoutes.js:120` (the 503 with no cookie). What this replaces was true until Phase 3's S1 (#208), which that plan's records list missed: it named `README.md:10` but not this section.

**11.** `scripts/README.md`, replace lines 17-23:

<!-- prettier-ignore -->
```md
`__tests__/repo-invariants.test.mjs` pins repository-wide facts that nothing else checks:

- every resolved `qs` stays on a patched release;
- `env.example` lists exactly the variables the server reads;
- every `scripts/` path in `.claude/settings.json` exists;
- the rate-limit store and limiter majors are a pairing this repo has actually run;
- the deploy workflow only deploys this repository's own pushes.
```

with:

<!-- prettier-ignore -->
```md
`__tests__/repo-invariants.test.mjs` pins repository-wide facts that nothing else checks:

- every resolved `qs` stays on a patched release;
- `env.example` lists exactly the variables the server reads;
- every `scripts/` path in `.claude/settings.json` exists, and no hook reaches an
  untracked `.claude/` file except through `run-claude-helper.cjs`, whose behaviour it
  also tests;
- no Neon scaffolding reaches a manifest, and `knip.jsonc` is the only knip config and
  still declares the hook scripts;
- the rate-limit store and limiter majors are a pairing this repo has actually run;
- the deploy workflow only deploys this repository's own pushes, from the commit CI
  passed;
- every source file opens with a header of at most four lines of text
  ([`docs/code-readability-sop.md`](../docs/code-readability-sop.md), rule 1);
- each coverage floor is its config's measurement note truncated to one decimal.
```

Checked against the file's `describe` blocks after R4 and R2: "qs stays on a patched release", "env.example stays in sync with the code", "Claude Code hook wiring", "hooks do not depend on untracked .claude/ scaffolding", "scripts/run-claude-helper.cjs", "Neon agent-skills scaffolding stays out of the build" (its four tests), "the rate-limit-redis / express-rate-limit pairing", "the Deploy workflow deploys only this repository's own pushes" (including "the checkout is pinned to the commit CI passed"), "every source file opens with a header", and R2's block.

**12.** `e2e/README.md`, replace lines 5-9:

<!-- prettier-ignore -->
```md
| Suite                | Tests | Covers                                                                                                                                                                        |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.js`      | 4     | Sign up, log a workout that survives a reload, change the password without being signed out, delete the account                                                               |
| `a11y.spec.js`       | 10    | axe scans that must find zero violations: login, signup, the dashboard, an open modal, keyboard-only modal dismissal, the settings forms and every state of the account panel |
| `deployable.spec.js` | 5     | The Express-served app: renders with no CSP violations, loads its fonts, reaches its own API, serves client routes while still 404ing unknown `/api` paths, caches correctly  |
```

with (Prettier re-pads the table):

<!-- prettier-ignore -->
```md
| Suite                | Covers                                                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke.spec.js`      | Sign up, log a workout that survives a reload, change the password without being signed out, delete the account                                                               |
| `a11y.spec.js`       | axe scans that must find zero violations: login, signup, the dashboard, an open modal, keyboard-only modal dismissal, the settings forms and every state of the account panel |
| `deployable.spec.js` | The Express-served app: renders with no CSP violations, loads its fonts, reaches its own API, serves client routes while still 404ing unknown `/api` paths, caches correctly  |

`npx playwright test --list` lists every test, by project.
```

If the owner keeps the counts (decision 4), skip this change; they are correct on `a86daa3` (4, 10 and 5 `test(` calls, none in a loop).

- [ ] **Step 3: Format, check, commit**

```bash
npx prettier --write README.md client/README.md server/README.md scripts/README.md e2e/README.md render.yaml docs/deploy-runbook.md
git diff --stat
git grep -n "barely exercised\|planner modals\|Known inconsistency\|~487 kB\|generation modal" -- "*.md" render.yaml ':!docs/plans' ':!docs/specs'; echo "leftover grep exit=$?"
git add -u
git commit -m "docs: READMEs that match the code, and CORS without \"barely exercised\"" -m "Same-origin serving does not take CORS out of the path: a browser sends Origin on same-origin writes, and Chromium on the bundle's crossorigin loads, so an unlisted own origin is answered 403. Sessions fail closed while Redis is the store, so the server README's Redis-fallback inconsistency is gone. The planner modals are one modal, the chunk size is read from the build, and scripts/README lists what repo-invariants pins." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `--stat` lists the seven files and nothing else; the leftover grep prints nothing and `exit=1`. Re-read each edited paragraph after Prettier.

- [ ] **Step 4: Gates and PR**

Run the gates. `test:coverage` must print the baseline's counts.

```bash
git push -u origin docs/readmes-and-cors-wording
gh pr create --draft --base main --title "docs: READMEs that match the code, and CORS without \"barely exercised\"" --body-file "$SCRATCH/pr-r3.md"
```

`pr-r3.md` outline: the twelve changes as the table, each with what it was checked against; why the CORS wording was wrong (the `corsPolicy.js` comment, the mount order, the 403); the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Then the ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Task R1: CLAUDE.md

**What the spec asks.** "CLAUDE.md: the volatile numbers and line references go, each replaced by where the value lives; the identifiers that changed are fixed; the floor-raising timing is recorded." Default #10: "When floors are raised: once per phase; CLAUDE.md says so from R1." And every earlier plan routed its CLAUDE.md items here (collected in "Where each change comes from", below).

**What this task does not do.** CLAUDE.md's lessons stay. A figure stays when it is dated or is a measurement of a past change ("measured 2026-09-12", "went 46 → 34", "0% → 89%"), because it records what happened, not what is; a figure goes when it reads as the state of the tree today and has no date, or when the tree has moved past it. The ruflo-generated sections (Skill Auto-Trigger Rules, Concurrency, Swarm Orchestration, MCP Tools) are not touched.

**How it was checked.** Every change below says what was checked to confirm it, on `a86daa3`. Per-file coverage figures are from the `coverage-summary.json` files #245's measurement left on disk (the counts equal #245's), and `usePreviewDerivedData.js`'s uncovered arms from a scratch coverage run of its directory's tests (`--coverage.reportsDirectory` outside the repo). Nothing in this task was checked by reasoning alone where a command could check it.

**Where each change comes from.**

| Source                                   | Item                                                                                                | Change            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------- |
| Phase 3 server plan, "Not in this phase" | "in-memory fallback" (CLAUDE.md line 110)                                                           | A1                |
| Phase 3 client plan, "Not in this phase" | `TZ` holds for the shell only; `goalOptions` is live (`a498ff2`)                                    | A14, A7           |
| Phase 4 plan, "Not in this phase"        | No entry on reduced motion or on the capture tool                                                   | D4, D7            |
| Phase 5 plan, "Not in this phase"        | GeneratedPlanModal (twice), useBodyModel's `toFiniteNumber`, every coverage figure                  | B1, B3-B5, C1-C13 |
| Phase 5's execution (owner's handoff)    | `toProfileNumber`, `parsePositiveInt`, test counts, the `client/dist` trap, `--root server` failing | B1, C13, D2, D3   |
| Owner's held corrections                 | Five rate limiters; the hook wrapper; Prettier's numbers; Lightning CSS's reordering                | A9, A15, D5, D6   |
| Spec default #10                         | When floors are raised                                                                              | D1                |
| R2 and R4 (this phase)                   | What the ratchet and the floors test now check                                                      | D1, D8            |
| Found while checking                     | Every other change marked "found" below                                                             |                   |

`toProfileNumber` and `parsePositiveInt` turned out not to appear in CLAUDE.md (`git grep -n "toProfileNumber\|parsePositiveInt" -- CLAUDE.md` prints nothing), so they need no change.

**Files:**

- Modify: `CLAUDE.md` (every change below; line numbers on `a86daa3`)

- [ ] **Step 1: Branch, and confirm nothing has moved**

```bash
git fetch origin && git switch -c docs/claude-md-records origin/main
git log --oneline a86daa3..origin/main -- CLAUDE.md
```

Expected: R4, R2, T and R3 merged, and none of them touched CLAUDE.md, so the log prints nothing and every line number below holds. If something else changed CLAUDE.md, re-anchor on the quoted text.

- [ ] **Step 2: Group A, statements that are wrong**

**A1** (line 110). Current:

<!-- prettier-ignore -->
```md
- **Sessions**: Redis-backed when `REDIS_URL` is set, with in-memory fallback
```

New:

<!-- prettier-ignore -->
```md
- **Sessions**: in Redis when `REDIS_URL` (or `REDIS_HOST` and `REDIS_PORT`) is set and Redis connects at startup, otherwise in memory. The store is chosen once: while Redis is the store, a failed session command answers 503 and never falls back to memory (`services/auth/sessionService.js`)
```

Checked: `initSessionStore` (`sessionService.js:219-304`) picks memory when nothing is configured (`:232-240`) or the connection fails (`:290-302`), and Redis otherwise; `runSessionCommand` (`:194-207`) throws `SessionStoreUnavailableError`, whose status is 503 (`:23-29`).

**A2** (line 321; found). `npm test` runs the `scripts/` tests first (`package.json`: `"test": "npm run test:scripts && npm run test -w client && npm run test -w server"`), and the block does not list `test:scripts`, which CI's lint job runs. Current:

<!-- prettier-ignore -->
```md
npm test                 # client tests, then server tests (Vitest)
```

New:

<!-- prettier-ignore -->
```md
npm test                 # scripts/ tests, then client, then server (Vitest)
npm run test:scripts     # the scripts/ tests only: repo invariants, the header ratchet
```

**A3** (lines 330-340; found). Three client tests import server modules, not two: `git grep -l "server/src" -- "client/src/**/*.test.*"` lists `app/__tests__/constants.test.js`, `app/__tests__/profileContract.test.js` and `__tests__/serverBounds.contract.test.jsx` (the fourth hit, `numericCoercion.contract.test.js`, names the path in a comment only). And `serverBounds` sits in `client/src/__tests__`, so the "from `client/src/app/__tests__`" path is one of two. Current:

<!-- prettier-ignore -->
```md
**A client test can import server modules directly, and two do.** The running
app cannot reach across the wire, but Vitest can resolve
`../../../../server/src/...` from `client/src/app/__tests__`, so a contract between the two sides
can be asserted without a browser or a database. `app/__tests__/constants.test.js` pins the
option lists against the server's `allowed*Values`, and
`app/__tests__/profileContract.test.js` walks a form draft through
`personalToProfile` → `profileBodySchema` → `buildProfile` → `profileToPersonal`
and back. Both were verified to catch divergence the owning side's own suite
misses: narrowing the server's height range to 100-170 makes a 178cm profile
store `null`, and the server's tests never try 178. Keep such imports to test
files — confirmed they do not reach the bundle.
```

New:

<!-- prettier-ignore -->
```md
**A client test can import server modules directly, and the contract tests do.** The
running app cannot reach across the wire, but Vitest can resolve a relative
`server/src/...` path from a client test, so a contract between the two sides can be
asserted without a browser or a database. `app/__tests__/constants.test.js` pins the
option lists against the server's `allowed*Values`, and
`app/__tests__/profileContract.test.js` walks a form draft through
`personalToProfile` → `profileBodySchema` → `buildProfile` → `profileToPersonal`
and back. Both were verified to catch divergence the owning side's own suite
misses: narrowing the server's height range to 100-170 makes a 178cm profile
store `null`, and the server's tests never try 178. A third,
`__tests__/serverBounds.contract.test.jsx`, renders every form that posts a number and
holds each input's range to the schema the server validates it with. Keep such imports
to test files — confirmed they do not reach the bundle.
```

**A16** (lines 395-397; found). The axe suite scans more than it says: `e2e/a11y.spec.js` has ten tests, the four named plus the keyboard-only modal dismissal, the settings forms (two), the account tab, the delete confirmation and the account panel's error state. Current:

<!-- prettier-ignore -->
```md
that order is deliberate.** `e2e/a11y.spec.js` scans the login form, the signup
form, the dashboard and an open modal, and asserts zero violations. It rides the
same Playwright job, so it is already in CI.
```

New:

<!-- prettier-ignore -->
```md
that order is deliberate.** `e2e/a11y.spec.js` scans the login and signup forms, the
dashboard, an open modal, the settings forms and the account panel's states, asserts
zero violations, and checks that a modal can be dismissed from the keyboard alone. It
rides the same Playwright job, so it is already in CI.
```

**A4** (lines 412-413; found). The two modals that already had a name kept `aria-label`, so "all six" were never named by `aria-labelledby`, and GeneratedPlanModal has since gone: `git grep -n "aria-labelledby" -- client/src` finds it on `PlannerSetupModal`, `DashboardWorkoutModal` and `ExerciseDetailsModal`, while `MealDetailsModal.jsx:27` and `PlansView.jsx:442` set `aria-label`. Current:

<!-- prettier-ignore -->
```md
  All six are now named by `aria-labelledby` pointing at their own visible
  heading, so the name cannot drift from what is on screen.
```

New:

<!-- prettier-ignore -->
```md
  The four are now named by `aria-labelledby` pointing at their own visible
  heading, so the name cannot drift from what is on screen. (One of the four,
  `GeneratedPlanModal`, has since been deleted.)
```

**A5** (line 424; found). Five modals render through `ModalPortal` now (`git grep -n "<ModalPortal" -- client/src`). Current:

<!-- prettier-ignore -->
```md
handled by `useCloseOnEscape` — `ModalPortal` calls it for all six modals,
```

New:

<!-- prettier-ignore -->
```md
handled by `useCloseOnEscape` — `ModalPortal` calls it for every modal,
```

**A6** (lines 445-451). knip's entries are four hook scripts now, and without them it reports seven unused files, not six (Task T, item 9, measured). Current:

<!-- prettier-ignore -->
```md
- **It must declare the hook scripts as entry points.** `codex-handoff.mjs`,
  `scrub-junk-files.cjs` and `skill-router.mjs` are invoked from
  `.claude/settings.json`, which knip cannot see — so without the config it
  reports all three as unused files, then cascades and reports
  `codex-handoff/*.mjs` too, because their only importer looks dead. **That is
  six false positives inviting you to delete the whole hook wiring.** They are
  live; see the Fresh Clone Setup checklist that runs them.
```

New:

<!-- prettier-ignore -->
```md
- **It must declare the hook scripts as entry points.** `codex-handoff.mjs`,
  `run-claude-helper.cjs`, `scrub-junk-files.cjs` and `skill-router.mjs` are invoked
  from `.claude/settings.json`, which knip cannot see — so without the config it
  reports every one of them as an unused file, then cascades and reports
  `codex-handoff/*.mjs` too, because their only importer looks dead. **That is a
  false positive for every hook file, inviting you to delete the whole hook wiring.**
  They are live; see the Fresh Clone Setup checklist that runs them.
```

**A7** (lines 456-457). `goalOptions` was deleted as dead (`c2c820f`) and reinstated by `a498ff2`; today `dashboard/settings/settingsFields.js:52` offers it as Settings' goal select and `createDefaultPlannerForm` falls back to its first entry (`app/constants.js:181`). Current:

<!-- prettier-ignore -->
```md
  module-private rather than deleted. Only `goalOptions` and the two meal
  libraries were genuinely dead.
```

New:

<!-- prettier-ignore -->
```md
  module-private rather than deleted. Only `goalOptions` and the two meal
  libraries were genuinely dead, and `goalOptions` has since come back (`a498ff2`):
  Settings offers it as the goal select, and `createDefaultPlannerForm` falls back to
  its first entry.
```

**A8** (lines 548-550; found). Every `views/*.jsx` has a test now, and no client file is at 0% statements (`coverage-summary.json`). Current:

<!-- prettier-ignore -->
```md
  - Do not infer coverage from whether a file has a neighbouring `*.test.js`. The
    repositories have almost none and sit near 95%, because the dashboard integration
    suites drive them; several 500-line view components have no test and sit at 0%.
```

New:

<!-- prettier-ignore -->
```md
  - Do not infer coverage from whether a file has a neighbouring `*.test.js`. The
    repositories have few tests of their own (three files for ten modules) and are well
    covered anyway, because the dashboard integration suites drive them.
```

**A9** (lines 574-577). Five limiters (`index.js:506-598`; `index.rateLimit.test.js`'s `LIMIT_KEYS` has five). Current:

<!-- prettier-ignore -->
```md
    Its CORS layer is now covered end to end, and so are all four rate limiters
    — see `index.rateLimit.test.js`, which sets the limit under test to 1 and
    the other three far out of the way, because the limiters are layered and the
    global `/api` one would otherwise answer first. `postgres.js` was the worst
```

New:

<!-- prettier-ignore -->
```md
    Its CORS layer is now covered end to end, and so is every rate limiter
    — see `index.rateLimit.test.js`, which sets the limit under test to 1 and
    the others far out of the way, because the limiters are layered and the
    global `/api` one would otherwise answer first. `postgres.js` was the worst
```

**A10** (lines 581-583; found). `routes/authRoutes.js` is at 121 / 122 statements and the dashboard write routes at 81-87%, so "every route the user's data passes through is at 100%" is not true. Current:

<!-- prettier-ignore -->
```md
    **Every route file is at or above 81%, every route the user's data passes
    through is at 100%, and every service is at or above 82%.** What is left on
    the server is infrastructure rather than request handling.
```

New:

<!-- prettier-ignore -->
```md
    For today's per-file figures, read `server/coverage/coverage-summary.json` after a
    run with `--coverage.reporter=json-summary`; a figure written here goes stale with
    the next merge.
```

**A11** (lines 688-700; found). The `|| JOHN_DOE_PREVIEW_PROFILE.x` re-applications this describes are gone: the only ones left are inside `activePreviewProfile` (`usePreviewDerivedData.js:102-134`). The file has 33 uncovered branch arms, not 40; 15 of them are the `String(x ?? "")` block, now at lines 442-455, and the other 18 are `||`/`?:` fallbacks in the derived week and dashboard figures (lines 247-458). The locale block is at lines 58-86, not 30-50. Current:

<!-- prettier-ignore -->
```md
      **`usePreviewDerivedData.js` should not be picked up again.** It is at 99.5%
      statements and 100% functions, and its 40 remaining uncovered branches are
      **double-guarded fallbacks that cannot fire**. `activePreviewProfile` spreads
      `JOHN_DOE_PREVIEW_PROFILE` and then overrides every field with
      `personal.x || JOHN_DOE_PREVIEW_PROFILE.x`, so every field is non-empty for
      any input — including all-null. Roughly thirty branches further down the file
      then re-apply the _identical_ `|| JOHN_DOE_PREVIEW_PROFILE.x` to those same
      fields (`focuses`, `equipment`, `environment`, `goal`, `trainingDays`), and
      the block of `String(x ?? "")` at lines 406-420 does it a third time. None of
      the second or third guards can ever take their fallback side. The invariant
      that makes them dead is now pinned by a test, so if someone removes a guard
      from `activePreviewProfile` the suite says so.
      The locale block at lines 30-50 was the one genuinely reachable part, and it
```

New:

<!-- prettier-ignore -->
```md
      **`usePreviewDerivedData.js`'s largest group of uncovered branches cannot
      fire.** `activePreviewProfile` spreads `JOHN_DOE_PREVIEW_PROFILE` and then
      overrides every field with `personal.x || JOHN_DOE_PREVIEW_PROFILE.x`, so every
      field is non-empty for any input — including all-null. The `String(x ?? "")`
      block that builds `previewPersonalTargets`, what the personal chapter types,
      guards those same values again, and none of its fallbacks can fire. The
      invariant that makes them dead is pinned by a test, so if someone removes a
      guard from `activePreviewProfile` the suite says so. The file's other uncovered
      arms are `||` and `?:` fallbacks on the derived week and dashboard figures
      (`todayPlan?.workout || ""` and the like); trace each one's producer before
      writing a test for it.
      The locale block (`usesImperialUnits`) was the one genuinely reachable part, and it
```

This changes a judgement, not only a figure: "should not be picked up again" covered all 40 arms as dead, and that is no longer what the file holds. The replacement keeps the claim for the 15 arms it was checked for and does not make it for the 18 it was not. **Owner's call** (approval list, item A11): keep the old heading instead if you have checked the other 18.

**A12** (lines 742-743; found). `useHomeStageFlow.js` is at 157 / 169 branches (92.9%), under the 94% claimed. Current:

<!-- prettier-ignore -->
```md
      **There are no animation write-offs left.** All three hooks that were listed
      as untestable are now at or above 94% branches.
```

New:

<!-- prettier-ignore -->
```md
      **There are no animation write-offs left.** All three hooks that were listed
      as untestable are now covered.
```

**A13** (lines 807-809; found). `authRoutes.js` is at 121 / 122 statements, so "at 100% statements" is not true of all three. Current:

<!-- prettier-ignore -->
```md
  - **The auth path and the external routes are now covered**, and are the worked
    examples to copy. `authUserService.js`, `authRoutes.js` and `errorHandler.js` are
    at 100% statements; the weather and air-quality routes are covered end to end.
```

New:

<!-- prettier-ignore -->
```md
  - **The auth path and the external routes are now covered**, and are the worked
    examples to copy: `authUserService.js`, `authRoutes.js` and `errorHandler.js`, and
    the weather and air-quality routes end to end.
```

**A14** (lines 543-546 and 770-782). A `TZ` set in the shell does not reach Node here; one set inside the process does. Measured on this machine (Node 24.19.0): `TZ=Asia/Tokyo node -e 'console.log(process.env.TZ, new Date(0).getHours())'` prints `undefined 16`; inside one process, assigning `process.env.TZ` to `Asia/Tokyo` makes the same hour read `9`, `UTC` reads `0`, `delete process.env.TZ` leaves it at `0` (UTC, not the system zone), and assigning the captured system zone back reads `16`. `DashboardPage.test.jsx:219-227` and `MealView.test.jsx:697-709` already rely on this, restoring with `SYSTEM_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone`. Current (543-546):

<!-- prettier-ignore -->
```md
    `client/vite.config.js` rely on. `TZ` cannot be set here (see the `TZ` entry below),
    but the date can: a `NODE_OPTIONS=--import` preload that shifts `Date` reaches
    Vitest's workers, and diffing the per-arm JSON across such a sweep is what found
    both. Pin the clock in any test whose branches follow `new Date()`; stage a race
```

New:

<!-- prettier-ignore -->
```md
    `client/vite.config.js` rely on. A `TZ` set in the shell does not reach Node here
    (see the `TZ` entry below), but the date can be moved: a `NODE_OPTIONS=--import`
    preload that shifts `Date` reaches Vitest's workers, and diffing the per-arm JSON
    across such a sweep is what found both. Pin the clock in any test whose branches
    follow `new Date()`; stage a race
```

Current (770-778):

<!-- prettier-ignore -->
```md
  - **`TZ` does not reach Node on this machine, so timezone claims cannot be
    verified locally.** `TZ=Asia/Tokyo node -e 'process.env.TZ'` prints
    `undefined` here, inline or exported, and the process keeps the system
    zone. A suite re-run under several `TZ` values therefore proves nothing —
    it is the same zone every time, and the passes are not independent. This
    has already produced a false claim in a merged PR description.
    What is actually available: the system zone (UTC-7) locally and **UTC in
    CI**, which sit on opposite sides of the boundary that matters, so a test
    that passes in both is genuinely exercised either side of midnight.
```

New:

<!-- prettier-ignore -->
```md
  - **A `TZ` set in the shell does not reach Node on this machine; one set inside the
    process does.** `TZ=Asia/Tokyo node -e 'console.log(process.env.TZ)'` prints
    `undefined` here, inline or exported, and the process keeps the system
    zone. A suite re-run under several shell `TZ` values therefore proves nothing —
    it is the same zone every time, and the passes are not independent. This
    has already produced a false claim in a merged PR description.
    Assigning `process.env.TZ` inside the test does work, at once: the hour of
    `new Date(0)` reads 9 under `Asia/Tokyo` and 0 under `UTC`. `DashboardPage.test.jsx`
    and `MealView.test.jsx` pin a calendar-date test to a zone that way. **Restore it by
    assigning the zone captured at load**,
    `Intl.DateTimeFormat().resolvedOptions().timeZone`, **not with `delete`**: deleting
    it leaves Node on UTC, not on the system zone — the opposite of the dotenv entry
    above, where an absent key is deleted.
    Beyond that: the system zone (UTC-7) locally and **UTC in
    CI** sit on opposite sides of the boundary that matters, so a test
    that passes in both is genuinely exercised either side of midnight.
```

Lines 779-782 ("Beyond that, reason arithmetically …") follow unchanged; the new text ends "either side of midnight." as the old did, so the next sentence still reads on.

**A15** (lines 973-974, after 1004, and 1009-1012). The hooks reach their helpers through `scripts/run-claude-helper.cjs` (`.claude/settings.json`: 16 commands, 15 hooks and the status line, name it; the other four hooks run `skill-router.mjs`, `scrub-junk-files.cjs` twice and `codex-handoff.mjs`), and it exits 0 when the helper is absent (`run-claude-helper.cjs:31-35`, and `repo-invariants.test.mjs`'s "is a silent no-op when the helper is missing"). Current (973-974):

<!-- prettier-ignore -->
```md
**15 of the 19 configured hooks, plus the status line, invoke `.claude/helpers/*`, which is
not in the repo.** Regenerate the scaffolding after cloning:
```

New:

<!-- prettier-ignore -->
```md
**Most of the configured hooks, and the status line, run a `.claude/helpers/*` script,
which is not in the repo.** They reach it through `scripts/run-claude-helper.cjs`, which
exits 0 without a word when the helper is absent, so on a fresh clone those hooks fire and
do nothing. Regenerate the scaffolding after cloning:
```

After line 1004 (`reports the last stage's status, not the command's.`), insert a blank line and:

<!-- prettier-ignore -->
```md
Check a helper directly, as the first line does, not through the wrapper: the wrapper
exits 0 whether the helper is there or not, so it cannot tell you which.
```

Current (1009-1012):

<!-- prettier-ignore -->
```md
Re-run the verification checklist above after **any** `ruflo init`, not just a fresh clone.
A regenerated `settings.json` silently reverts the `scrub-junk-files.cjs` hook path to the
stale `.js` name, and a broken hook does not announce itself — the exit-code checks are the
only thing that will catch it.
```

New:

<!-- prettier-ignore -->
```md
Re-run the verification checklist above after **any** `ruflo init`, not just a fresh clone.
A regenerated `settings.json` silently reverts the `scrub-junk-files.cjs` hook path to the
stale `.js` name, and a broken hook does not announce itself. `npm run test:scripts`
catches that, and any hook that calls `.claude/` directly instead of through the wrapper
(the hook-wiring blocks in `repo-invariants.test.mjs`); the exit-code checks catch the rest.
```

- [ ] **Step 3: Group B, identifiers that changed**

**B1** (lines 226-228). #244 folded useBodyModel's `toFiniteNumber` into `toNumberOrNull`: `useBodyModel.js:8` imports it from `app/units`. Lines 215-224 tell the bug's history in the past tense and stay. Current:

<!-- prettier-ignore -->
```md
The guard now runs before the coercion, copying `toNumberOrNull` in
`repositories/rowValues.js`. Two things follow from that, and both are worth
knowing:
```

New:

<!-- prettier-ignore -->
```md
The guard now runs before the coercion: `useBodyModel.js` reads through the client's
`toNumberOrNull` (`app/units.js`), the same shape as `repositories/rowValues.js`'s.
Two things follow from that, and both are worth knowing:
```

**B2** (lines 148-151; found). Since #244 the client has one helper of the shape this section says to copy, and the section names only server ones. Current:

<!-- prettier-ignore -->
```md
**Guard absent input before `Number()`, never after.** `toFiniteNumber` and
`weatherCodeToText` in `externalDataService.js`, and `toNumberOrNull` in
`repositories/rowValues.js`, all do this; copy that shape rather than writing a fresh
coercion.
```

New:

<!-- prettier-ignore -->
```md
**Guard absent input before `Number()`, never after.** `toFiniteNumber` and
`weatherCodeToText` in `externalDataService.js`, and `toNumberOrNull` in
`repositories/rowValues.js`, all do this; copy that shape rather than writing a fresh
coercion. On the client, `toNumberOrNull` in `app/units.js` is that shape: import it.
```

**B3** (lines 620-624). Current:

<!-- prettier-ignore -->
```md
    `PreviewStage.jsx` (31), `PreviewDashboardChapter.jsx` (28),
    `HomePage.jsx` (25), `DashboardPage.jsx` (23), `App.jsx` (20),
    `CaloriesView.jsx` (16), `AuthPage.jsx` (15) and `GeneratedPlanModal.jsx`
    (14, and the last client file at 0% on every metric) all used to head this
    list and are done.
```

New:

<!-- prettier-ignore -->
```md
    `PreviewStage.jsx` (31), `PreviewDashboardChapter.jsx` (28),
    `HomePage.jsx` (25), `DashboardPage.jsx` (23), `App.jsx` (20),
    `CaloriesView.jsx` (16) and `AuthPage.jsx` (15) all used to head this
    list and are done. `GeneratedPlanModal.jsx` (14) was there too, and was
    deleted rather than tested, because nothing could open it.
```

Checked: spec default #8 ("its last opener was removed on purpose in `21a2d45`") and #236.

**B4** (lines 630-631). Current:

<!-- prettier-ignore -->
```md
    arm is reachable at all before writing a test to reach it — and see the
    `GeneratedPlanModal` note below for how to tell.
```

New:

<!-- prettier-ignore -->
```md
    arm is reachable at all before writing a test to reach it — and see the
    note below on two guards testing the same thing, for how to tell.
```

**B5** (lines 855 and 861-862). The lesson stays; the file is gone, and `ExerciseDetailsModal.jsx:21-26` still carries the fix and says why. Current (855):

<!-- prettier-ignore -->
```md
    that the test is weak.** `GeneratedPlanModal.jsx` opened with
```

New:

<!-- prettier-ignore -->
```md
    that the test is weak.** `GeneratedPlanModal.jsx` (since deleted) opened with
```

Current (861-862):

<!-- prettier-ignore -->
```md
    collapse it: the early return is now the only guard and the portal just gets
    `open`. The same mutation is caught now. When a survivor looks like a test
```

New:

<!-- prettier-ignore -->
```md
    collapse it: the early return became the only guard and the portal just got
    `open`, and the same mutation was then caught. When a survivor looks like a test
```

**B6** (line 653). The constant is `DASH_VIEW_ORDER` (`DashboardPage.jsx:47`, read at `:251`), and the router's eight `if`s are at `:255-394`; the file's one uncovered branch and one uncovered statement are as described (122 / 123, 71 / 72). Current:

<!-- prettier-ignore -->
```md
    names in `dashViewOrder` by the line that computes it, and the router below
```

New:

<!-- prettier-ignore -->
```md
    names in `DASH_VIEW_ORDER` by the line that computes it, and the router below
```

- [ ] **Step 4: Group C, volatile figures replaced by where they live**

**C1 with D1 and D2** (lines 510-512). The current figures are a phase stale (server 94.32 / 86.67, client 98.70 / 93.68, against 95.13 / 88.29 and 98.86 / 93.84 now). The replacement names where the figures live, the timing rule, and the two things that move a measurement without a code change. Current:

<!-- prettier-ignore -->
```md
- **Coverage is measured, not estimated.** `npm run test:coverage`. As of 2026-09-28:
  server **94.32%** statements / 86.67% branches (87.10% in CI), client **98.70%** /
  93.68%.
```

New:

<!-- prettier-ignore -->
```md
- **Coverage is measured, not estimated.** `npm run test:coverage`. The current figures
  are in the comment above `thresholds` in each side's config, `client/vite.config.js`
  and `server/vitest.config.js` ("Measured <date> (statements / branches / functions /
  lines)"), and each floor is its figure truncated to one decimal;
  `scripts/__tests__/repo-invariants.test.mjs` fails when a floor and its note disagree.
  For exact counts, add `--coverage.reporter=json-summary` and read
  `<side>/coverage/coverage-summary.json`: the text table's two decimals are too coarse
  when a metric sits a fraction above its floor, and a metric passes exactly when
  `covered >= floor / 100 × total`.
  **Floors are raised once per phase of work, by one floor PR per side.** A fix PR keeps
  coverage at or above the floors and leaves the floor lines alone. The floor PR
  re-measures `main`, raises each floor whose truncated measurement went up, and updates
  the note beside it; a floor is never lowered
  (`docs/specs/2026-10-10-readability-follow-up-design.md`, rule 3).
  **Two things move a measurement with no code changing.** Server branches read higher
  in CI than locally, so the server floor follows the local figure. And with
  `client/dist` present, `index.js` serves the bundle, so `staticClient.js`'s no-bundle
  arm goes unreached and server branches read one lower; the gates build before they
  measure, so measure a server floor with a build on disk. The server config's note
  records both.
```

Checked: the two notes and floors (`client/vite.config.js:70-77`, `server/vitest.config.js:28-43`); rule 3; the pass condition is `Math.floor(10000 * covered / total) / 100 >= floor`, which for a one-decimal floor is `covered >= floor / 100 × total` (the Phase 5 plan's derivation); #245's counts with and without `client/dist` (1652 and 1653 of 1871); CI run 39028297230's 88.77 against 88.29 locally.

**C2** (lines 521-523). Current:

<!-- prettier-ignore -->
```md
  How much a floor tolerates is whatever truncation leaves, and that can be nothing:
  client statements sits at 98.7053% against 98.7, so one new uncovered statement fails
  CI.
```

New:

<!-- prettier-ignore -->
```md
  How much a floor tolerates is whatever truncation leaves, and that can be nothing:
  when the slack, `covered - floor / 100 × total`, is under one, a single new uncovered
  statement, branch or function can fail CI.
```

**C3** (lines 556-558). Current:

<!-- prettier-ignore -->
```md
    here. It is the request layer for the surface where the null-pm2.5-as-AQI-0
    bug shipped. Now at 96.7% statements / 94.6% branches, covered in
    `externalRequests.test.js` alongside the wger and MealDB wrappers.
```

New:

<!-- prettier-ignore -->
```md
    here. It is the request layer for the surface where the null-pm2.5-as-AQI-0
    bug shipped. It is now covered in `externalRequests.test.js`, alongside the wger
    and MealDB wrappers.
```

**C4** (lines 561-563). `index.js` is at 79.3% and `httpCacheService.js` at 83.5% today, not 76% and 77%; ranked by uncovered statements (38 and 19) they are still the two largest gaps. "Over 800 lines" is true (864) and is dropped as a figure. Current:

<!-- prettier-ignore -->
```md
  - Thin areas, worst first: `index.js` (76% — app bootstrap and wiring) and
    `httpCacheService.js` (77%). `index.js` is over 800 lines, and nearly all of
    what is still uncovered in it is the bootstrap the suite deliberately does
```

New:

<!-- prettier-ignore -->
```md
  - Thin areas, worst first by uncovered statements: `index.js` (app bootstrap and
    wiring) and `httpCacheService.js`. Nearly all of
    what is still uncovered in `index.js` is the bootstrap the suite deliberately does
```

**C5** (lines 600-606). The 2026-09-18 ranking has moved (`useHomeStageFlow.js` is fourth with 12, `useDashboardMetrics.js` fifth with 10). Current:

<!-- prettier-ignore -->
```md
    On the client, ranked by **uncovered branches** rather than by percentage —
    that is what says where the untested behaviour actually is:
    Current ranking, re-measured 2026-09-18: `usePreviewDerivedData.js` (33),
    `outlineGeometry.js` (28), `templateOutline.js` (22), `useDashboardMetrics.js`
    (11), and a three-way tie at 10: `useDashboardData.js`, `useMealDbSearch.js`
    and `useHomeStageFlow.js`.
    **The two geometry files at the top are the same dead-defensive pattern**:
```

New:

<!-- prettier-ignore -->
```md
    On the client, rank by **uncovered branches** rather than by percentage —
    that is what says where the untested behaviour actually is. Compute the ranking
    from `client/coverage/coverage-summary.json` (`branches.total - branches.covered`
    per file) rather than keeping one here: it changes with every merge.
    **The two geometry files near the top of it, `outlineGeometry.js` and
    `templateOutline.js`, are the same dead-defensive pattern**:
```

Checked: today's ranking is `usePreviewDerivedData.js` 33, `outlineGeometry.js` 28, `templateOutline.js` 22, so "near the top" holds.

**C7** (lines 715-724). The list keeps its names and loses its percentages, eleven of which have moved. Current:

<!-- prettier-ignore -->
```md
      Done, and worth copying from: `SettingsView.jsx` (89%),
      `WorkoutResultPage.jsx` (100%), `MealView.jsx` (100%, which took the five
      `meal/*` panels with it), `useHomeStageFlow.js` (99% / 94% branches),
      `usePreviewChapterFlow.js` (100% / 100%),
      `usePreviewWeekParticleAnimation.js` (100% / 96%) and
      `usePreviewDerivedData.js` (99% / 84%) and
      `WorkoutsView.jsx` (100% / 99%), `TipsView.jsx` (97% / 95%),
      `SummaryView.jsx` (100% / 96%), `PlansView.jsx` (93% / 91%) and
      `useDashboardMetrics.js` (99% / 89%) both preview chapter components
      (100% / 100%) `App.jsx` (99% / 99%) `DashboardPage.jsx` (99% / 99%) `usePreviewWeekOutline.js` (98% / 94%) `PlannerSetupModal.jsx` (100% / 95%) `HomePersonalStage.jsx` (100% / 100%) `useDashboardData.js` (99% / 94%) `events.js` (100% / 99%) `useBodyModel.js` (100% / 100%) `DashboardAtAGlance.jsx` (100% / 100%) `PreviewStage.jsx` (97% / 87%) `PreviewDashboardChapter.jsx` (100% / 100%) `HomePage.jsx` (100% / 100%) `CaloriesView.jsx` (100% / 100%) and `AuthPage.jsx` (95% / 100%).
```

New:

<!-- prettier-ignore -->
```md
      Done, and worth copying from: `SettingsView.jsx`, `WorkoutResultPage.jsx`,
      `MealView.jsx` (which took the five `meal/*` panels with it),
      `useHomeStageFlow.js`, `usePreviewChapterFlow.js`,
      `usePreviewWeekParticleAnimation.js`, `usePreviewDerivedData.js`,
      `WorkoutsView.jsx`, `TipsView.jsx`, `SummaryView.jsx`, `PlansView.jsx`,
      `useDashboardMetrics.js`, both preview chapter components, `App.jsx`,
      `DashboardPage.jsx`, `usePreviewWeekOutline.js`, `PlannerSetupModal.jsx`,
      `HomePersonalStage.jsx`, `useDashboardData.js`, `events.js`, `useBodyModel.js`,
      `DashboardAtAGlance.jsx`, `PreviewStage.jsx`, `PreviewDashboardChapter.jsx`,
      `HomePage.jsx`, `CaloriesView.jsx` and `AuthPage.jsx`.
```

**C8** (line 284). `templateOutline.js`'s one export is now at line 529. Current:

<!-- prettier-ignore -->
```md
  single export at line 472, and `externalDataService.js` and `events.js` are
```

New:

<!-- prettier-ignore -->
```md
  single export, `buildTemplateOutline`, and `externalDataService.js` and `events.js` are
```

**C9** (line 246). `git grep -c "toFiniteNumber("` over the four files counts 85 lines (27 + 11 + 3 + 44), not "about sixty". Current:

<!-- prettier-ignore -->
```md
the silhouette runs on: about sixty calls across `geometry.js`,
```

New:

<!-- prettier-ignore -->
```md
the silhouette runs on: dozens of calls across `geometry.js`,
```

**C10** (lines 793-795). True today (the lowest of the six, `app/plans.js`, is at 95.8% statements), but a figure. Current:

<!-- prettier-ignore -->
```md
    `units.js`, `app/plans.js`, `tips/recommendationUtils.js`, `useOptimisticLogs.js`,
    `useApiClient.js` and `app/events.js` are all at or above 95% — pure functions,
```

New:

<!-- prettier-ignore -->
```md
    `units.js`, `app/plans.js`, `tips/recommendationUtils.js`, `useOptimisticLogs.js`,
    `useApiClient.js` and `app/events.js` are all well covered — pure functions,
```

**C11** (lines 827-828). Checked again on 2026-10-17: `cr-blobs` over every blob `git rev-list --objects --all` reaches found none with a carriage return, of 2805 (it was 2457 when written). Current:

<!-- prettier-ignore -->
```md
    **On CRLF:** no committed file is, or ever was, CRLF — none of the 2457 blobs in
    the history holds a carriage return, and `.gitattributes` stores text as LF (`.bat`
```

New:

<!-- prettier-ignore -->
```md
    **On CRLF:** no committed file is, or ever was, CRLF — no blob in the history
    holds a carriage return (checked on 2026-10-17 over every blob
    `git rev-list --objects --all` reaches), and `.gitattributes` stores text as LF (`.bat`
```

**C12** (lines 948-953). The main chunk is 484.95 kB today (scratch build), not ~487. Current:

<!-- prettier-ignore -->
```md
- **`npm run build` is clean.** It used to emit a "chunks larger than 500 kB" warning;
  that went away when `jspdf` moved to a dynamic import. The main chunk is ~487 kB,
  which leaves only ~13 kB before the warning. It was ~407 kB until React 19, which
  alone added the difference -- measured by building with nothing else changed, not
  estimated. If the warning appears, check first whether something got pulled onto
  the eager path; if nothing did, the margin simply ran out.
```

New:

<!-- prettier-ignore -->
```md
- **`npm run build` is clean.** It used to emit a "chunks larger than 500 kB" warning;
  that went away when `jspdf` moved to a dynamic import. The main chunk sits close under
  that warning (the build prints its size, as `dist/assets/index-*.js`). It was ~407 kB
  until React 19, which alone added the difference -- measured by building with nothing
  else changed, not estimated. If the warning appears, check first whether something got
  pulled onto the eager path; if nothing did, the margin simply ran out.
```

**C13 with D3** (lines 955-962). The counts are a phase stale (1178 server tests now; the E2E count is right at 19 but is a count). Current:

<!-- prettier-ignore -->
```md
- Server tests need Postgres: `npm run postgres:local:start -w server` first, or **107**
  of the **1083** fail (and 27 skip) with `Can't reach database server`, which is
  environmental, not a regression (measured 2026-09-28; it was 96 of 1042 on 2026-09-12,
  and this entry said ~40 before that). The compose database works just as well —
  `docker compose up -d`, `npm -w server run migrate:postgres`, then the `DATABASE_URL`
  from `env.example`. It ran all 1042 server tests green on Postgres 16 when measured;
  compose is on 18 now, and CI runs the full suite on that same `postgres:18` image. The
  E2E suite is **19** across two projects.
```

New:

<!-- prettier-ignore -->
```md
- Server tests need Postgres: `npm run postgres:local:start -w server` first, or every
  test that reaches the database fails with `Can't reach database server`, which is
  environmental, not a regression. Read the run's `Tests` line for failures before
  trusting any server count. The compose database works just as well —
  `docker compose up -d`, `npm -w server run migrate:postgres`, then the `DATABASE_URL`
  from `env.example`; CI runs the full suite on the same `postgres:18` image compose
  uses. `npx playwright test --list` lists the E2E suite's tests, across its two
  projects.
- **Run one server test file from the workspace, not with `--root server`.**
  `npm run test -w server -- <path>` (or `npm -w server exec vitest run <path>`) runs in
  `server/`. `npx vitest run <path> --root server` from the repository root does not:
  `index.js`, `db/prisma.js` and `vitest.setup.js` call `dotenv.config()` with no path,
  and dotenv reads `.env` from the working directory, so the suite never sees
  `server/.env` and a test that reaches Postgres fails with
  `SASL: client password must be a string`. No client code calls dotenv, so
  `--root client` from the root is unaffected.
```

Checked: `docker-compose.yml:21` and `ci.yml:74, 153, 252` are `postgres:18`; the three `dotenv.config({ quiet: true })` calls (`index.js:86`, `db/prisma.js:9`, `vitest.setup.js:3`); dotenv's default path is `path.resolve(process.cwd(), ".env")` (`node_modules/dotenv/dist/index.cjs`); `git grep -n dotenv -- client` prints nothing. The SASL message itself is the owner's report from running the Phase 5 plan's commands; it was not reproduced here, because that needs a database-backed run from the wrong directory.

- [ ] **Step 5: Group D, records that were missing**

**D8** (lines 303-305). Current:

<!-- prettier-ignore -->
```md
  and present-tense reasons rather than history. `scripts/__tests__/repo-invariants.test.mjs`
  fails on a source file without a header unless `file-header-allowlist.json` lists it. That
  list only shrinks, and `ALLOWLIST_SIZE` in the test pins its length — never add to it.
```

New:

<!-- prettier-ignore -->
```md
  and present-tense reasons rather than history. `scripts/__tests__/repo-invariants.test.mjs`
  fails on a source file without a header unless `file-header-allowlist.json` lists it,
  and on any header over four lines of text. That list is empty and only shrinks, and
  `ALLOWLIST_SIZE` in the test pins its length — never add to it.
```

**D7** (after line 440, `every unit suite.`): insert a blank line and:

<!-- prettier-ignore -->
```md
**Reduced motion is handled where each motion is, not by a global reset.** Script
reads `matchMedia("(prefers-reduced-motion: reduce)")` before it animates
(`useHomeStageFlow.js`, `usePreviewChapterFlow.js`,
`usePreviewWeekParticleAnimation.js`), and the stylesheets carry their own
`@media (prefers-reduced-motion: reduce)` blocks beside the rules they stop. A global
`*` reset was considered and left out (the Phase 4 plan, Task M2): it cannot stop the
script, it loses to the `!important` transitions it would need to stop, and it would
change every element's computed animation and transition, so a screenshot compare could
not list what it expects. Hover and press feedback still moves under reduced motion,
which that plan leaves to the owner.
```

Checked: the five `matchMedia(` reads in those three hooks; 11 stylesheets with the media query (`git grep -l prefers-reduced-motion -- "client/src/**/*.css"`); the M2 task's "No global reset" bullet; the Phase 4 plan's "Not in this phase" row on hover and press motion.

**D4 and D6** (after line 953, the build entry, as C12 leaves it): insert:

<!-- prettier-ignore -->
```md
- **A CSS or motion change is proved by screenshot, not by reading.** Capture `main`
  once, then compare each CSS PR against that capture, listing the visual and
  computed-style changes the PR expects (`docs/specs/2026-10-10-readability-follow-up-design.md`,
  rule 7). The capture tool is `capture.mjs`, printed in full in the Tools section of
  `docs/plans/2026-10-16-readability-follow-up-phase-4.md`: write it out with the Write
  tool, give it an absolute repo root (`D:/ai-workout`), and it captures a build's page
  states with each one's DOM and computed styles; `compare` takes an expectation file.
  **Lightning CSS rewrites every built rule, so search the build for one declaration,
  never for a rule as written.** It reorders a rule's declarations
  (`display: grid; grid-template-columns: 44px 1fr 44px; align-items: center` builds as
  `grid-template-columns:44px 1fr 44px;align-items:center;display:grid`), adds prefixes
  (`-webkit-backdrop-filter`), shortens colours (`rgba(12, 16, 30, 0.85)` becomes
  `#0c101ed9`) and rewrites selectors (`*::before` becomes ` :before`).
```

Checked: rule 7; the Phase 4 plan's Tools section; the handoff's "the capture tools want an absolute repo root"; a scratch build of `a86daa3`: `app/styles/planner/base.css:142-146` (`display`, `grid-template-columns`, `align-items`) built as `.modal-header{grid-template-columns:44px 1fr 44px;align-items:center;display:grid}`, and `styles/base.css:173-179`'s `.panel` (`background`, `border`, `border-radius`, `padding`, `backdrop-filter`) as `.panel{-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);background:#0c101ed9;border:1px solid #ffffff14;border-radius:24px;padding:28px}`; the selector rewrite is from the Phase 4 plan's M2 (its build output). The order is neither the source's nor alphabetical, which is why the entry gives no rule for it.

**D5** (after line 942, the end of the Prettier convergence sub-entry): insert:

<!-- prettier-ignore -->
```md
  - **Prettier rewrites number literals, not comments.** In JS, `93.80` becomes `93.8`
    and `5.` becomes `5`, but `99.0` stays `99.0`; in CSS, `99.0%` becomes `99%`
    (Prettier 3.9.10, measured). So a floor in `thresholds` is never written with two
    decimals, while the measurement note above it, a comment, keeps `99.50`. The
    phase plans' "Prettier writes a whole number without `.0`" is wrong for JS: a
    floor reads `99` because it was written so.
```

Checked: `echo 'const t = [99.0, 99.00, 1.50, 1.500, 93.80, 5.];' | npx prettier --stdin-filepath scratch.js` prints `const t = [99.0, 99.0, 1.5, 1.5, 93.8, 5];`, and `.a { width: 99.0%; margin: 1.50px; }` through `--stdin-filepath scratch.css` prints `width: 99%; margin: 1.5px;`. The Phase 4 plan (Task K5) and Phase 5 plan (Task D3) both say "Prettier writes a whole number without `.0`"; those are dated records and stay, and this entry is where the correction lives.

- [ ] **Step 6: Check every change landed, and nothing else moved**

```bash
npx prettier --write CLAUDE.md
git diff --stat
git grep -n "GeneratedPlanModal\|dashViewOrder\|all four rate\|other three far\|two do\.\|all six\|line 472\|2457\|~487\|1083\|is \*\*19\*\*\|re-measured 2026-09-18\|30-50\|406-420\|94.32\|98.7053\|TZ\` cannot be set\|15 of the 19" -- CLAUDE.md
npm run test:scripts > "$SCRATCH/r1-scripts.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/r1-scripts.txt"
```

Expected: `--stat` shows `CLAUDE.md` only. The grep prints exactly three lines, all intended: B3's `GeneratedPlanModal.jsx` (14) "was there too", A4's "(One of the four, `GeneratedPlanModal`, …)" and B5's "(since deleted)". `test:scripts` passes 115, R2's "CLAUDE.md points at both configs" among them (C1 names both).

Then read the whole of each touched entry once more, top to bottom: a replacement that reads well alone can still leave its neighbour's sentence without a subject (A11 and C5 are the two most likely).

- [ ] **Step 7: Commit, gates, PR**

Commit in four commits, one per group, so a reviewer can take them separately:

```bash
git add CLAUDE.md
git commit -m "docs(claude): records that match the code" -m "Wrong statements fixed (sessions, npm test, the contract tests, modal names, knip's hook entries, goalOptions, view coverage, five rate limiters, route figures, usePreviewDerivedData's uncovered arms, runtime TZ, the hook wrapper); renamed identifiers fixed (useBodyModel's toNumberOrNull, GeneratedPlanModal, DASH_VIEW_ORDER); coverage figures, test counts and line numbers replaced by where they live; the floor-raising timing, the client/dist trap, the server single-file command, the capture tool, Prettier's number rule, Lightning CSS's rewriting and reduced motion recorded." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

(If the reviewer prefers four commits, stage the groups with `git add -p` in Step 2-5 order; the one commit above is the default.)

Run the gates. `test:coverage` must print the baseline's counts.

```bash
git push -u origin docs/claude-md-records
gh pr create --draft --base main --title "docs(claude): records that match the code" --body-file "$SCRATCH/pr-r1.md"
```

`pr-r1.md` outline: the spec's R1 and default #10; the rule for which figures stay (dated or past) and which go; the changes by group, each one line with what it was checked against (the tables in this task); the owner-approved list; the Step 6 grep; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Then the ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Ordering, and why there is no floor PR

| After  | `test:scripts` tests | Client coverage       | Server coverage       | Files touched outside tests and docs |
| ------ | -------------------- | --------------------- | --------------------- | ------------------------------------ |
| `main` | 97                   | baseline              | baseline              |                                      |
| R4     | 105                  | baseline              | baseline              | none                                 |
| R2     | 115                  | baseline              | baseline              | none                                 |
| T      | 115                  | baseline (2408 tests) | baseline (1178 tests) | `knip.jsonc` (a comment)             |
| R3     | 115                  | baseline              | baseline              | `render.yaml` (a comment)            |
| R1     | 115                  | baseline              | baseline              | none                                 |

"Baseline" means the counts in the Baseline table, exactly. Nothing here can change them (see "Coverage"), so rule 3's closing floor PR has nothing to raise, and this phase has none. If a PR's `test:coverage` prints different counts, something outside this plan moved: find it before marking the PR ready, and do not touch a floor.

The order is forced in three places and free elsewhere:

- **R4 before R2**: both add to `repo-invariants.test.mjs`, and R2's anchor is the file's last block, which R4 does not change.
- **R2 and R4 before R3**: `scripts/README.md`'s new list names what both add.
- **Everything before R1**: rule 6, and R1's D1 and D8 describe R2 and R4. T must precede R1 because both state knip's false-positive count; T and R3 can swap.

## Closing the phase, and the follow-up

When R1 merges, write the phase report (spec, "Closing a phase"): what merged, that coverage did not move (the baseline counts, re-read on `main`), and what is left (the table below). Then check the spec's four success criteria on `main`, and put the answers in the report:

1. **Every item not parked has merged**: walk the spec's phase tables against the merged PRs. Phase 6's are R1 to R4.
2. **`main` is green on every required check**: `gh run list --branch main --workflow ci.yml --limit 1`.
3. **Every coverage floor equals its truncated measurement**: R2's test asserts exactly this for the notes, and the notes are #245's measurement; confirm it holds on a fresh `test:coverage` of `main` with `client/dist` built (the baseline).
4. **CLAUDE.md and the READMEs agree with the code**: R1 and R3, with the greps in their last steps.

---

## Not in this phase

| Item                                                                                                                                                                                                                                           | Where it goes                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| The Phase 5 plan's `npx vitest run … --root server` commands (six of them), which fail from the root                                                                                                                                           | Left as written: `docs/README.md` says plans are dated records, not updated. R1's D3 records the right command. Owner decision 3 |
| The Phase 4 and Phase 5 plans' "Prettier writes a whole number without `.0`", which is wrong for JS (`99.0` stays `99.0`)                                                                                                                      | Left as written, for the same reason; R1's D5 records the measured rule                                                          |
| `usePreviewDerivedData.js`'s 18 uncovered arms outside the `String(x ?? "")` block (fallbacks on the derived week and dashboard figures, lines 247-458), which this plan did not trace                                                         | Owner's call whether to trace them; R1's A11 says to trace each producer first                                                   |
| `e2e/README.md`'s per-suite test counts                                                                                                                                                                                                        | Dropped by R3 change 12 unless the owner keeps them (decision 4)                                                                 |
| `server/vitest.setup.js` opens with an import, not a header                                                                                                                                                                                    | Outside the ratchet's scope by design (the SOP says so); no change                                                               |
| The two server `NUMERIC_VARS` gaps: the three GEMINI_* limits are not validated at startup, and `NUMERIC_VARS` accepts a non-integer that `toPositiveInt` discards                                                                             | Owner decisions, as Phase 3 and Phase 5 left them                                                                                |
| `stripUserIdField` strips nothing from today's rows                                                                                                                                                                                            | Kept, as Phase 5 decided; owner's call to delete                                                                                 |
| `JOHN_DOE_PREVIEW_PROFILE.personalComplete` and `.bodyFat` are read by nothing                                                                                                                                                                 | Owner's call, as Phase 5 left it                                                                                                 |
| DashboardPage's fallback for a view name it does not know                                                                                                                                                                                      | Kept, as Phase 3's C5d decided                                                                                                   |
| Phase 3's server owner decisions: the meal-save race, the Postgres pool's missing `'error'` listener, `finishReason` never read, a Redis that never answers, sign-up and sign-out during a store outage, `attachOptionalUser` during an outage | Owner decisions, unchanged                                                                                                       |
| Phase 3's client owner decisions: the client's reading of a non-OK `/api/auth/me`, the home form's ranges, the Undo toast replaced by an earlier success toast, the plan on `/plan` after logout, free-text "No injuries"                      | Owner decisions, unchanged                                                                                                       |
| Phase 4's owner decisions: the walkthrough's form keeping two columns on phones; hover and press motion left under reduced motion                                                                                                              | Owner decisions, unchanged                                                                                                       |
| The cascade bugs Phase 4 accepted (S8-8, S8-9, S7-6, S7-12, S8-12, S8-13), the small ties (S8-3, S8-10, S8-11, S7-2, S7-11), S8-7, S8-14, S8-15, S8-16, and #188's declarations that never apply                                               | Accepted under default #9                                                                                                        |
| Whether a failed weather or air-quality lookup should read differently from one not yet made (CLAUDE.md, the `DashboardAtAGlance` entry)                                                                                                       | Copy decision, still open                                                                                                        |
| `apiFetch` has no timeout; `detectTrack` and `detectInjuryFlags` keyword matching; `@layer`, gitleaks, NowCast or AirNow's AQI, the server allowing its own origin                                                                             | Parked, by the spec and Phase 3                                                                                                  |

---

## CLAUDE.md changes for approval

One line each, in file order, with the group letter used in Task R1. "Found" marks a change no earlier plan routed here. Approve the list as a whole, or strike items by letter.

| Change     | Lines                          | What changes                                                                                                                                                                                                                           | Kind                   |
| ---------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| A1         | 110                            | Sessions: Redis when configured and connected at startup, else memory, chosen once; a failed command is a 503                                                                                                                          | Wrong statement        |
| B2         | 148-151                        | The client's `toNumberOrNull` (`app/units.js`) named beside the server helpers to copy                                                                                                                                                 | Identifier, found      |
| B1         | 226-228                        | useBodyModel reads through the client's `toNumberOrNull`, not a private copy (#244)                                                                                                                                                    | Identifier             |
| C9         | 246                            | "about sixty calls" becomes "dozens of calls" (85 lines today)                                                                                                                                                                         | Figure                 |
| C8         | 284                            | "single export at line 472" becomes "single export, `buildTemplateOutline`" (now line 529)                                                                                                                                             | Line reference         |
| D8         | 303-305                        | The ratchet also fails a header over four lines of text (R4); the allowlist is empty                                                                                                                                                   | New record             |
| A2         | 321                            | `npm test` runs the `scripts/` tests first; `test:scripts` listed                                                                                                                                                                      | Wrong statement, found |
| A3         | 330-340                        | Three client tests import server modules, not two; `serverBounds.contract.test.jsx` named                                                                                                                                              | Wrong statement, found |
| A16        | 395-397                        | The axe suite's scope: the settings forms, the account panel's states and keyboard dismissal too                                                                                                                                       | Incomplete, found      |
| A4         | 412-413                        | Two modals kept `aria-label`; the four were named by `aria-labelledby`; GeneratedPlanModal is gone                                                                                                                                     | Wrong statement, found |
| A5         | 424                            | `ModalPortal` serves "every modal", not "all six"                                                                                                                                                                                      | Wrong statement, found |
| D7         | after 440                      | Reduced motion: per-element gates and blocks, no global reset, and why                                                                                                                                                                 | New record (Phase 4)   |
| A6         | 445-451                        | knip's hook entries are four, with `run-claude-helper.cjs`; seven false positives without them, stated without a count                                                                                                                 | Wrong statement        |
| A7         | 456-457                        | `goalOptions` came back (`a498ff2`) and is live                                                                                                                                                                                        | Wrong statement        |
| C1, D1, D2 | 510-512                        | Coverage figures replaced by the configs' notes; exact counts; floors raised once per phase by one floor PR per side; CI-vs-local and the `client/dist` trap                                                                           | Figure, new records    |
| C2         | 521-523                        | "98.7053% against 98.7" replaced by the slack rule                                                                                                                                                                                     | Figure                 |
| A14        | 543-546                        | "`TZ` cannot be set here" becomes "a `TZ` set in the shell does not reach Node"                                                                                                                                                        | Wrong statement        |
| A8         | 548-550                        | No view component is untested or at 0% any more                                                                                                                                                                                        | Wrong statement, found |
| C3         | 556-558                        | `openAqRequest`'s percentages dropped                                                                                                                                                                                                  | Figure                 |
| C4         | 561-563                        | Thin areas by uncovered statements, without the stale 76% and 77%                                                                                                                                                                      | Figure                 |
| A9         | 574-577                        | Five rate limiters, not four                                                                                                                                                                                                           | Wrong statement        |
| A10        | 581-583                        | "every route the user's data passes through is at 100%" is not true; replaced by where per-file figures live                                                                                                                           | Wrong statement, found |
| C5         | 600-606                        | The 2026-09-18 ranking replaced by how to compute one                                                                                                                                                                                  | Figure                 |
| B3         | 620-624                        | GeneratedPlanModal was deleted, not tested                                                                                                                                                                                             | Identifier             |
| B4         | 630-631                        | The pointer to the GeneratedPlanModal note renamed                                                                                                                                                                                     | Identifier             |
| B6         | 653                            | `dashViewOrder` is `DASH_VIEW_ORDER`                                                                                                                                                                                                   | Identifier, found      |
| A11        | 688-700                        | `usePreviewDerivedData.js`: 33 arms, not 40; the re-applied guards are gone; the claim kept only for the 15 arms checked; line references dropped. **Changes a judgement**: "should not be picked up again" becomes a narrower heading | Wrong statement, found |
| C7         | 715-724                        | The "done" list keeps its names and drops its percentages                                                                                                                                                                              | Figure                 |
| A12        | 742-743                        | "at or above 94% branches" is not true of `useHomeStageFlow.js` (92.9%)                                                                                                                                                                | Wrong statement, found |
| A14        | 770-778                        | The `TZ` entry: runtime `process.env.TZ` works; restore by assigning, not `delete` (which leaves UTC)                                                                                                                                  | Wrong statement        |
| C10        | 793-795                        | "at or above 95%" becomes "well covered"                                                                                                                                                                                               | Figure                 |
| A13        | 807-809                        | `authRoutes.js` is not at 100% statements (121 / 122)                                                                                                                                                                                  | Wrong statement, found |
| C11        | 827-828                        | "none of the 2457 blobs" becomes "no blob", dated 2026-10-17 (2805 checked)                                                                                                                                                            | Figure                 |
| B5         | 855, 861-862                   | GeneratedPlanModal "(since deleted)", its fix told in the past tense                                                                                                                                                                   | Identifier             |
| D5         | after 942                      | Prettier's number rule, measured; the phase plans' "whole number without `.0`" corrected                                                                                                                                               | New record             |
| C12        | 948-953                        | The main chunk's size read from the build, not "~487 kB, ~13 kB"                                                                                                                                                                       | Figure                 |
| D4, D6     | after 953                      | The screenshot rule, where the capture tool lives, and how Lightning CSS rewrites built rules                                                                                                                                          | New record (Phase 4)   |
| C13        | 955-962                        | Test counts dropped; `npx playwright test --list` for the E2E tests                                                                                                                                                                    | Figure                 |
| D3         | after 962                      | One server test file runs from the workspace; `--root server` from the root fails, and why                                                                                                                                             | New record (Phase 5)   |
| A15        | 973-974, after 1004, 1009-1012 | The hooks reach helpers through `scripts/run-claude-helper.cjs`; check a helper directly; `test:scripts` catches a reverted hook                                                                                                       | Wrong statement        |
