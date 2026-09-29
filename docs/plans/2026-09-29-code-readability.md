# Code Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every in-scope source file up to `docs/code-readability-sop.md`: a header first, a summary on every export, a reason on every effect and long function, comments in the present tense, and a predictable order. Prove that each change altered nothing it should not, and add a ratchet so the result does not decay.

**Architecture:** Thirteen PRs.

- **PR 0** lands the SOP and a header ratchet: a repo-invariant test with an allowlist that can only shrink.
- **PRs 1–9** each bring one area up to the SOP in two commits. The comments commit is proven by a byte-identical client build or by identical syntax trees. The tidy commit is proven by the full set of gates.
- **PRs 10–12** merge duplicated helpers, remove dead CSS, and give the walkthrough's styles one home. Each is proven by tests or by frozen-clock screenshots.

Scratch tools do the measuring and proving. They are written out in full below, and each was run and proven by mutation on 2026-09-29.

**Tech Stack:** Node 24 (ESM), espree 10 and postcss 8 (already installed as ESLint's and Vite's dependencies), Vitest 4, Vite, Playwright (`page.clock`), git.

**Spec:** `docs/specs/2026-09-29-code-readability-design.md` · **SOP:** `docs/code-readability-sop.md`

---

## Conventions for every task

- **Where to run.** Run every command from the repo root, in Git Bash. Set these once per shell:

  ```bash
  REPO=D:/ai-workout
  SCRATCH=/c/Users/nguye/AppData/Local/Temp/claude/d--ai-workout/readability   # any directory OUTSIDE the repo
  TOOLS="$SCRATCH/tools"
  mkdir -p "$TOOLS"
  . "$TOOLS/pr.sh"     # after Task 0 has written it
  ```

- **Gating on exit codes.** Never gate on a piped command's exit code. Redirect to a file and check `$?`, as every step below does.
- **Mutation edits.** Mutations are JSON files written with the Write tool and applied with `mutate.mjs`. Never use sed or a heredoc for them. On 2026-09-29 Git Bash rewrote `\n` to `/n` inside an argument that began with `//`, so a test edit silently became a comment and "passed". `CLAUDE.md` lists four more ways a mutation can fail to apply.
- **Restoring after a mutation.** Undo each one with `git checkout -- <file>`. Then `git status --porcelain` must list only the work in progress.
- **Never trust a `\u` escape typed into any Write or Edit, a subagent's or the controller's.** Tool calls decode them, intermittently: typing the escape for U+FEFF can store the character itself, and a lone one can store nothing at all (Findings §9).
  - If an edit has to include a line that already holds an escape, as the six non-breaking-space escapes in `PreviewWorkoutWeekChapter.jsx` do, end the edit's `old_string` and `new_string` short of that line.
  - After any edit that writes an escape, run `node "$TOOLS/restore-escapes.mjs" <file>`.
  - Before **every** commit in Tasks 2–13, run `node "$TOOLS/escapes-intact.mjs" "$REPO"` (Task 0, Step 11). It must exit 0. ESLint cannot stand in for it, because it does not look inside strings.
- **Postgres.** It must be up for the server suite (`npm run postgres:local:start -w server`, or `docker compose up -d`). Without it, 107 server tests fail with `Can't reach database server`, which says nothing about the change.
- **Commit trailer.** Every commit message ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`.
- **One PR at a time, in order.** Every PR edits `scripts/__tests__/file-header-allowlist.json`. Branch each PR from an up-to-date `main` after the previous one merges. If two are ever open together, regenerate the allowlist after rebasing (Task 0, Step 6's tool does it) instead of hand-merging the JSON.
- **Checklist line numbers** come from the baseline scan of `9b85b7d`. They drift as a file is edited, so re-run `area.mjs` for current ones.
- **"Move header to top"** means the scanner found a comment before the file's first statement but not at line 1. Read it before moving it:
  - If it describes the module, move it above the imports.
  - If it describes the statement below it, as the `dotenv.config()` comment in `server/src/index.js` does, leave it where it is and write a new header.

## Findings made while writing this plan

These change what some tasks do, relative to the spec. The spec is a dated record and is not edited.

1. **Dead CSS is much larger than `.preview-field*`.** The sweep in Task 12 finds 35 classes that no source file names. 28 of them have rules in `home/styles/core/preview.css`, whose 62 walkthrough rules split into 47 dead, 13 duplicated in `home/preview/styles/`, and 2 live and unique. So PR 11 removes most of that file, and PR 12 folds in the rest.
2. **`parseDateValue` is not a duplicate.** `WorkoutsView`'s copy returns a sort timestamp or `0`. `useDashboardMetrics`' copy returns a `Date` or `null`, and parses `YYYY-MM-DD` as local midnight. Merging them would break one caller, so PR 10 renames the view's copy instead.
3. **`cleanText`, `validateQuery` and `validateParams` only share names.** `cleanText` defaults to 500 characters in `db/postgres.js` and 120 in `dashboardDataBuildersService.js`. The two validation modules take different third arguments. PR 10 leaves all three.
4. **Comments that call the retired Mongo shim live.** 36 comment lines in 13 server files still describe it, and some as present fact:
   - `index.js:333`: "the shim still backs its reads"
   - `rowValues.js`: "the Mongo compatibility shim that still wraps some of them"
   - `progressMetricRepository.js`, `workoutSessionRepository.js`: "The compatibility shim delegates…"

   The history pattern misses most of these, so PRs 1 and 2 are also gated on a `git grep` for them.

5. **Effects: 43 of 46 need a comment, not 45.** The spec counted without the SOP's rule that a hook's only effect is explained by the hook's own summary.
6. **The history set swaps one entry.** The tightened pattern adds `client/src/app/constants.js:7` ("Removed as dead code in c2c820f and reinstated") and drops `registerWorkoutAndGoalRoutes.js:105`. It is 29 comments either way. Read line 105 while PR 1 has the file open.
7. **17 values can move to module scope, not 30.** The first scanner counted empty `{}`/`[]` accumulators, such as `useDashboardMetrics`' `caloriesByDate` and the particle animation's `particles`. Moving one of those would share mutable state across renders. The scanner now excludes empty containers and anything the function writes into.
8. **The walkthrough advances by itself.** It is a timed state machine: 1.5 s after it opens it has moved from "Personal Info" to "Generate". A deterministic screenshot therefore needs three things:
   - a frozen page clock
   - a pinned `Math.random`, because typing delays are random
   - waits that poll from Node, because Playwright's `waitForFunction` re-checks on animation frames, and those freeze with the clock

   With all three, three runs of 12 captures were byte-identical. An outline added to one element changed exactly the 8 captures that show it.

9. **Tool calls decode `\u` escapes, intermittently.** This was found while executing Task 1. The implementer appended the ratchet with the U+FEFF escape in its regex, and the file received the raw character; ESLint's `no-irregular-whitespace` caught it. A probe on 2026-09-29 then isolated the layer:
   - **The prompt a subagent receives keeps the escape.** The probe saw six visible characters.
   - **The Write or Edit call that stores it may not.** A probe that typed `A`, a backslash, `uFEFF` and `B` stored the bytes `41 ef bb bf 42`, and a lone escape stored an empty file.
   - **The controller is not immune.** One Write kept all 11 of this plan's escapes. The Edits that first added this finding decoded 6 of theirs, and `escapes-intact.mjs` caught them on its first run.

   `same-code.mjs` catches a decoded escape in a comments commit, because the literal's `raw` text changes. Nothing else did: ESLint passes a decoded non-breaking space inside a string, and `same-code` does not check a code-moving commit. Hence `escapes-intact.mjs`, `restore-escapes.mjs`, and the Conventions rule above.

## Baseline (from the scanner, `9b85b7d`)

| PR  | Headers first | Exports documented | Effects commented | Long functions sectioned | History | To module scope | Import-order breaks | BOMs |
| --- | ------------- | ------------------ | ----------------- | ------------------------ | ------- | --------------- | ------------------- | ---- |
| 1   | 2/23          | 3/26               | 0/0               | 13/27                    | 2       | 0               | 0                   | 0    |
| 2   | 6/31          | 10/65              | 0/0               | 17/31                    | 12      | 0               | 0                   | 0    |
| 3   | 2/22          | 4/34               | 1/21              | 8/22                     | 6       | 0               | 0                   | 0    |
| 4   | 0/32          | 1/42               | 1/12              | 10/34                    | 3       | 1               | 0                   | 3    |
| 5   | 0/16          | 1/21               | 0/6               | 3/24                     | 2       | 14              | 11                  | 1    |
| 6   | 0/13          | 0/20               | 1/7               | 10/20                    | 2       | 2               | 2                   | 0    |
| 7   | 0/25          | —                  | —                 | —                        | —       | —               | —                   | 13   |
| 8   | 0/24          | —                  | —                 | —                        | —       | —               | —                   | 6    |
| 9   | 3/12          | 5/11               | 0/0               | 6/7                      | 2       | 0               | 0                   | 0    |

**Target after each area PR:** every "x/y" at y/y, and history, module-scope and import-order at 0. BOMs stay unchanged. Any exception is named in the PR description with its reason.

## File map

| Scratch (`$TOOLS`, never committed) | Purpose                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `scan.mjs`                          | Parses every in-scope file; writes one JSON record per file                          |
| `area.mjs`                          | Totals and a per-file checklist for one area PR                                      |
| `same-code.mjs`                     | Proves the working tree differs from `HEAD` only in comments                         |
| `mutate.mjs`                        | Applies edits from a JSON file and fails if one did not apply                        |
| `make-allowlist.mjs`                | Writes the ratchet's allowlist with the ratchet's own rule                           |
| `pr.sh`                             | The shell steps every area PR repeats                                                |
| `css-sweep.mjs`                     | Dead-CSS candidates (Task 12)                                                        |
| `capture.mjs`                       | Deterministic screenshots of the home stages and walkthrough chapters (Tasks 12, 13) |
| `walkthrough-split.mjs`             | Classifies the home page's walkthrough rules as dead, duplicate or live (Task 13)    |

| Committed                                                         | Task                               |
| ----------------------------------------------------------------- | ---------------------------------- |
| `docs/code-readability-sop.md`                                    | Already on `chore/readability-sop` |
| `scripts/__tests__/repo-invariants.test.mjs` (a new block)        | 1                                  |
| `scripts/__tests__/file-header-allowlist.json` (new)              | 1, then shrunk by 2–10             |
| `.github/pull_request_template.md`, `docs/README.md`, `CLAUDE.md` | 1                                  |
| The 198 in-scope source files                                     | 2–10, as listed in each task       |
| `client/src/app/linePath.js` and its test (new)                   | 11                                 |
| `server/src/repositories/__tests__/rowValues.test.js` (new)       | 11                                 |

---

### Task 0: The scratch tools

**Files:** creates everything in `$TOOLS`. Nothing in the repo changes.

- [ ] **Step 1: Set the variables** (see Conventions) and confirm the tree is clean:

```bash
git status --porcelain
```

Expected: no output.

- [ ] **Step 2: Write `$TOOLS/scan.mjs`**

```js
/**
 * Readability scanner. Parses every tracked JS/JSX/MJS/CJS file with espree and
 * every CSS file with postcss, and writes one JSON record per file describing
 * what docs/code-readability-sop.md asks for and what is missing.
 *
 * Usage: node scan.mjs <repoRoot> <out.json>
 * Not committed: it lives in the scratchpad and is reproduced in
 * docs/plans/2026-09-29-code-readability.md.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [root = "D:/ai-workout", out = "scan.json"] = process.argv.slice(2);
const require = createRequire(path.join(root, "package.json"));
const espree = require("espree");
const postcss = require("postcss");

// Same scope and header rule as the ratchet in scripts/__tests__/repo-invariants.test.mjs.
const IN_SCOPE_DIRS = ["client/src", "server/src", "server/scripts", "scripts", "e2e"];
const isSource = (f) => /\.(js|jsx|mjs|cjs|css)$/.test(f);
const isTest = (f) => /\.(test|spec)\.|(^|\/)__tests__\/|^client\/src\/test\/setup\.js$/.test(f);
const inScope = (f) =>
  isSource(f) &&
  !isTest(f) &&
  (IN_SCOPE_DIRS.some((d) => f.startsWith(`${d}/`)) || /(^|\/)[^/]+\.config\.js$/.test(f));
const DIRECTIVE = /^\s*(eslint[- ]|global\s|@vitest-environment|prettier-ignore|istanbul|c8\s)/;
const HISTORY =
  /Task \d+\b|docs\/(plans|specs)\/|\bPR #?\d+|\(#\d+\)|`[0-9a-f]{7,12}`|\bcommit [0-9a-f]{7}|\b(previously|used to|formerly|reinstated)\b/i;

const headerFirst = (text) => {
  const body = text.replace(/^\uFEFF/, "").replace(/^#!.*\r?\n/, "");
  const first = body.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return (
    /^\s*(\/\/|\/\*)/.test(first) &&
    !/^\s*(\/\/|\/\*+)\s*(eslint|global\s|prettier-ignore|istanbul|c8\s|@vitest-environment)/.test(
      first
    )
  );
};

const isFn = (n) =>
  !!n && ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(n.type);

// A value built only from literals: it depends on nothing, so it can live at
// module scope -- unless it is an accumulator. An empty {} or [] is always one,
// and a filled one the function writes into is too; moving either would share
// mutable state across renders, so both are excluded.
const isEmptyContainer = (n) =>
  (n?.type === "ObjectExpression" && n.properties.length === 0) ||
  (n?.type === "ArrayExpression" && n.elements.length === 0);
const isMutatedIn = (name, source) =>
  new RegExp(
    `\\b${name}(\\s*\\[[^\\]]*\\]|\\.[A-Za-z_$][\\w$]*)\\s*(=(?!=)|\\+=|-=|\\+\\+|--)|\\b${name}\\.(push|pop|shift|unshift|splice|sort|reverse|set|add|delete|clear|fill)\\(`
  ).test(source);
const isPureLiteral = (n) => {
  if (!n) return false;
  if (n.type === "Literal") return true;
  if (n.type === "TemplateLiteral") return n.expressions.length === 0;
  if (n.type === "UnaryExpression") return n.operator === "-" && n.argument.type === "Literal";
  if (n.type === "ArrayExpression") return n.elements.every((e) => e && isPureLiteral(e));
  if (n.type === "ObjectExpression")
    return n.properties.every(
      (p) => p.type === "Property" && !p.computed && isPureLiteral(p.value)
    );
  return false;
};

function scanJs(file, text) {
  const src = text.replace(/^\uFEFF/, "");
  const opts = {
    ecmaVersion: "latest",
    ecmaFeatures: { jsx: true },
    comment: true,
    loc: true,
    range: true
  };
  let ast;
  try {
    ast = espree.parse(src, { ...opts, sourceType: "module" });
  } catch {
    ast = espree.parse(src, { ...opts, sourceType: "script" });
  }
  const docs = ast.comments.filter((c) => !DIRECTIVE.test(c.value));
  const endsAt = new Set(docs.map((c) => c.loc.end.line));
  const leading = (...lines) => lines.some((l) => endsAt.has(l - 1));
  const commentsIn = (node) =>
    docs.filter((c) => c.range[0] > node.range[0] && c.range[1] < node.range[1]).length;

  const firstCode = ast.body.find((n) => n.type !== "ImportDeclaration");
  const header = docs.some((c) => c.loc.end.line < (firstCode ? firstCode.loc.start.line : 4));

  // Exported functions, components and hooks, and whether a comment ends directly above.
  const exports = [];
  for (const node of ast.body) {
    if (!/^Export(Named|Default)Declaration$/.test(node.type) || !node.declaration) continue;
    const d = node.declaration;
    const init =
      d.type === "VariableDeclaration" && d.declarations.length === 1 ? d.declarations[0].init : d;
    if (!isFn(d) && !isFn(init)) continue;
    const name = d.id?.name || d.declarations?.[0]?.id?.name || "default";
    exports.push({ name, line: node.loc.start.line, documented: leading(node.loc.start.line) });
  }

  // Walk once for functions, effects and literal constants inside hooks/components.
  const fns = [];
  const effects = [];
  const staticInBody = [];
  const fnName = (node, ancestors) => {
    if (node.id?.name) return node.id.name;
    for (let i = ancestors.length - 1; i >= 0; i -= 1) {
      const a = ancestors[i];
      if (a.type === "VariableDeclarator") return a.id?.name;
      if (a.type === "Property") return a.key?.name || a.key?.value;
      if (a.type === "CallExpression")
        return `${a.callee?.name || a.callee?.property?.name || "call"}(callback)`;
      if (/Statement$/.test(a.type)) break;
    }
    return "(anonymous)";
  };
  const walk = (node, ancestors) => {
    if (!node || typeof node.type !== "string") return;
    if (isFn(node) && node.body?.type === "BlockStatement") {
      const starts = [node.loc.start.line];
      for (let i = ancestors.length - 1; i >= 0; i -= 1) {
        starts.push(ancestors[i].loc.start.line);
        if (/Declaration$|Statement$|^Property$/.test(ancestors[i].type)) break;
      }
      const name = fnName(node, ancestors);
      const len = node.loc.end.line - node.loc.start.line + 1;
      fns.push({
        node,
        name,
        line: node.loc.start.line,
        len,
        inside: commentsIn(node),
        leading: leading(...starts)
      });
      if (/^use[A-Z]/.test(name) || (/^[A-Z]/.test(name) && file.endsWith(".jsx"))) {
        for (const stmt of node.body.body) {
          if (stmt.type !== "VariableDeclaration" || stmt.kind !== "const") continue;
          for (const d of stmt.declarations)
            if (
              d.id.type === "Identifier" &&
              isPureLiteral(d.init) &&
              !isEmptyContainer(d.init) &&
              !isMutatedIn(d.id.name, src.slice(node.range[0], node.range[1]))
            )
              staticInBody.push({ in: name, name: d.id.name, line: d.loc.start.line });
        }
      }
    }
    if (
      node.type === "CallExpression" &&
      /^use(Layout)?Effect$/.test(node.callee?.name || node.callee?.property?.name || "")
    ) {
      const stmt = ancestors.findLast((a) => /Statement$/.test(a.type));
      const owner = ancestors.findLast((a) => isFn(a));
      const cb = node.arguments[0];
      const firstInner = cb?.body?.body?.[0];
      const atTop = docs.some(
        (c) =>
          cb &&
          c.range[0] > cb.range[0] &&
          c.loc.start.line <= (firstInner?.loc.start.line ?? cb.loc.start.line + 1)
      );
      effects.push({
        line: node.loc.start.line,
        owner,
        commented: leading(node.loc.start.line, stmt?.loc.start.line ?? 0) || atTop
      });
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "range") continue;
      const v = node[key];
      const next = [...ancestors, node];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === "string" && walk(c, next));
      else if (v && typeof v.type === "string") walk(v, next);
    }
  };
  walk(ast, []);

  // A hook's only effect is covered by the hook's own comment (SOP: effects rule).
  for (const e of effects) {
    const siblings = effects.filter((x) => x.owner === e.owner);
    const ownerFn = fns.find((f) => f.node === e.owner);
    if (!e.commented && siblings.length === 1 && ownerFn?.leading) e.commented = true;
    delete e.owner;
  }

  const rank = (s) =>
    /\.(css|svg|png|jpe?g|webp)(\?.*)?$|\?raw$/.test(s) ? 2 : /^[./]/.test(s) ? 1 : 0;
  let prev = -1;
  let importOrderBreaks = 0;
  for (const n of ast.body.filter((b) => b.type === "ImportDeclaration")) {
    const r = rank(n.source.value);
    if (r < prev) importOrderBreaks += 1;
    prev = Math.max(prev, r);
  }

  return {
    header,
    exports,
    effects,
    longFunctions: fns
      .filter((f) => f.len >= 40)
      .map((f) => ({ name: f.name, line: f.line, len: f.len, sectioned: f.inside > 0 })),
    staticInBody,
    importOrderBreaks,
    history: docs
      .filter((c) => HISTORY.test(c.value))
      .map((c) => ({
        line: c.loc.start.line,
        text: c.value.trim().replace(/\s+/g, " ").slice(0, 120)
      }))
  };
}

function scanCss(text) {
  const rootNode = postcss.parse(text.replace(/^\uFEFF/, ""));
  const top = rootNode.nodes || [];
  return {
    header: top[0]?.type === "comment",
    rules: top.filter((n) => n.type !== "comment").length,
    banners: top.filter((n) => n.type === "comment").length
  };
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((f) => f && inScope(f) && existsSync(path.join(root, f)));
const records = tracked.map((file) => {
  const text = readFileSync(path.join(root, file), "utf8");
  const base = { file, headerFirst: headerFirst(text), bom: text.charCodeAt(0) === 0xfeff };
  return file.endsWith(".css")
    ? { ...base, lang: "css", ...scanCss(text) }
    : { ...base, lang: "js", ...scanJs(file, text) };
});
writeFileSync(out, JSON.stringify(records, null, 1));
console.log(`scanned ${records.length} in-scope files -> ${out}`);
```

- [ ] **Step 3: Write `$TOOLS/area.mjs`**

```js
/**
 * Per-PR readability report. Reads a scan.mjs output and prints, for one area
 * PR of docs/plans/2026-09-29-code-readability.md, the totals the PR reports
 * before and after, then a checklist line for every file with work left.
 *
 * Usage: node area.mjs <pr 1-9> <scan.json> [--totals]
 */
import { readFileSync } from "node:fs";

const [pr, scanPath, flag] = process.argv.slice(2);

// The nine area PRs. Order matters: a file belongs to the first area that matches.
export const AREAS = [
  [
    1,
    "Server bootstrap, middleware, routes",
    (f) => /^server\/src\/[^/]+\.js$|^server\/src\/(middleware|routes)\//.test(f)
  ],
  [
    2,
    "Server services, repositories, db, server scripts and config",
    (f) =>
      /^server\/src\/(services|repositories|db)\/|^server\/scripts\/|^server\/[^/]+\.config\.js$/.test(
        f
      )
  ],
  [
    3,
    "Client shell",
    (f) =>
      /^client\/src\/(App|main)\.jsx$|^client\/src\/(app|components|hooks)\/.*\.jsx?$|^client\/[^/]+\.config\.js$/.test(
        f
      )
  ],
  [4, "Dashboard page (JS)", (f) => /^client\/src\/pages\/dashboard\/.*\.jsx?$/.test(f)],
  [
    5,
    "Home page (JS), including physique",
    (f) => /^client\/src\/pages\/home\/(?!preview\/).*\.jsx?$/.test(f)
  ],
  [
    6,
    "Preview, auth and workout-result pages (JS)",
    (f) => /^client\/src\/pages\/(home\/preview|auth|workout-result)\/.*\.jsx?$/.test(f)
  ],
  [
    7,
    "CSS: global, planner, dashboard, auth, workout-result",
    (f) => /\.css$/.test(f) && !/pages\/home\//.test(f)
  ],
  [8, "CSS: home and preview", (f) => /\.css$/.test(f) && /pages\/home\//.test(f)],
  [
    9,
    "Tooling: scripts/, e2e/, root configs",
    (f) => /^(scripts|e2e)\/|^[^/]+\.config\.js$/.test(f)
  ]
];

const areaOf = (file) => AREAS.find(([, , match]) => match(file))?.[0];
const records = JSON.parse(readFileSync(scanPath, "utf8")).filter(
  (r) => areaOf(r.file) === Number(pr)
);
const [, title] = AREAS.find(([n]) => n === Number(pr));

const sum = (fn) => records.reduce((s, r) => s + fn(r), 0);
const js = records.filter((r) => r.lang === "js");
const totals = {
  files: records.length,
  headerFirst: sum((r) => (r.headerFirst ? 1 : 0)),
  exports: sum((r) => r.exports?.length ?? 0),
  exportsDocumented: sum((r) => r.exports?.filter((e) => e.documented).length ?? 0),
  effects: sum((r) => r.effects?.length ?? 0),
  effectsCommented: sum((r) => r.effects?.filter((e) => e.commented).length ?? 0),
  longFunctions: sum((r) => r.longFunctions?.length ?? 0),
  longSectioned: sum((r) => r.longFunctions?.filter((f) => f.sectioned).length ?? 0),
  history: sum((r) => r.history?.length ?? 0),
  staticInBody: sum((r) => r.staticInBody?.length ?? 0),
  importOrderBreaks: sum((r) => r.importOrderBreaks ?? 0),
  cssBanners: sum((r) => r.banners ?? 0),
  // Must be the same before and after: the SOP leaves existing byte-order marks alone.
  bom: sum((r) => (r.bom ? 1 : 0))
};
console.log(`PR ${pr} — ${title}`);
console.log(
  `headers first ${totals.headerFirst}/${totals.files} | exports documented ${totals.exportsDocumented}/${totals.exports} | ` +
    `effects commented ${totals.effectsCommented}/${totals.effects} | long functions sectioned ${totals.longSectioned}/${totals.longFunctions} | ` +
    `history comments ${totals.history} | literal constants in hooks/components ${totals.staticInBody} | import-order breaks ${totals.importOrderBreaks}` +
    (js.length === records.length ? "" : ` | CSS top-level banners ${totals.cssBanners}`) +
    ` | byte-order marks ${totals.bom}`
);
if (flag === "--totals") process.exit(0);

for (const r of records) {
  const todo = [];
  if (!r.headerFirst) todo.push(r.lang === "js" && r.header ? "move header to top" : "header");
  if (r.lang === "css") {
    if (r.rules >= 8)
      todo.push(`section banners (${r.rules} top-level blocks, ${r.banners} banners now)`);
  } else {
    const ex = r.exports.filter((e) => !e.documented);
    if (ex.length) todo.push(`export docs: ${ex.map((e) => `${e.name} (l.${e.line})`).join(", ")}`);
    const fx = r.effects.filter((e) => !e.commented);
    if (fx.length) todo.push(`effect comments: l.${fx.map((e) => e.line).join(", l.")}`);
    const lf = r.longFunctions.filter((f) => !f.sectioned);
    if (lf.length)
      todo.push(
        `section comments: ${lf.map((f) => `${f.name} (l.${f.line}, ${f.len} lines)`).join(", ")}`
      );
    if (r.history.length)
      todo.push(`present-tense rewrite: l.${r.history.map((h) => h.line).join(", l.")}`);
    if (r.staticInBody.length)
      todo.push(
        `tidy — to module scope: ${r.staticInBody.map((s) => `${s.name} (l.${s.line}, in ${s.in})`).join(", ")}`
      );
    if (r.importOrderBreaks) todo.push("tidy — import order");
  }
  if (todo.length) console.log(`- [ ] \`${r.file}\` — ${todo.join("; ")}`);
}
```

- [ ] **Step 4: Write `$TOOLS/same-code.mjs`**

```js
/**
 * Proves a change is comment-only. For every JS/JSX/MJS/CJS/CSS file that
 * differs between HEAD and the working tree (staged or not), parses both
 * versions, throws away comments, whitespace and positions, and requires what
 * is left to be identical. Exits 1 on any difference, on any added or deleted
 * source file, and lists changed files it cannot judge (anything else).
 *
 * Usage: node same-code.mjs <repoRoot>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.argv[2] || "D:/ai-workout";
const require = createRequire(path.join(root, "package.json"));
const espree = require("espree");
const postcss = require("postcss");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// Syntax tree without positions. Comments are not in espree's tree unless asked for.
const jsShape = (text) => {
  const opts = { ecmaVersion: "latest", ecmaFeatures: { jsx: true } };
  const src = text.replace(/^\uFEFF/, "");
  let ast;
  try {
    ast = espree.parse(src, { ...opts, sourceType: "module" });
  } catch {
    ast = espree.parse(src, { ...opts, sourceType: "script" });
  }
  return JSON.stringify(ast, (key, value) =>
    ["start", "end", "loc", "range"].includes(key) ? undefined : value
  );
};

// Every non-comment node in order, with its selector/at-rule/declaration content.
const cssShape = (text) => {
  const out = [];
  postcss.parse(text.replace(/^\uFEFF/, "")).walk((n) => {
    if (n.type === "rule") out.push(["rule", n.selector.replace(/\s+/g, " ")]);
    else if (n.type === "atrule") out.push(["at", n.name, n.params.replace(/\s+/g, " ")]);
    // raws.value.raw keeps a comment written inside a value, so one placed there
    // fails rather than being silently dropped by postcss's cleaned `value`.
    else if (n.type === "decl")
      out.push([
        "decl",
        n.prop,
        (n.raws.value?.raw ?? n.value).replace(/\s+/g, " "),
        !!n.important
      ]);
    if (n.type !== "comment") out.push(["depth", depthOf(n)]);
  });
  return JSON.stringify(out);
};
const depthOf = (n) => (n.parent ? 1 + depthOf(n.parent) : 0);

const changed = git("diff", "--name-status", "HEAD").trim().split("\n").filter(Boolean);
let failed = 0;
const unjudged = [];
for (const line of changed) {
  const [status, file] = line.split("\t");
  if (!/\.(js|jsx|mjs|cjs|css)$/.test(file)) {
    unjudged.push(file);
    continue;
  }
  if (status !== "M" || !existsSync(path.join(root, file))) {
    console.log(
      `FAIL ${status} ${file}: a comment-only change neither adds nor deletes source files`
    );
    failed += 1;
    continue;
  }
  const before = git("show", `HEAD:${file}`);
  const after = readFileSync(path.join(root, file), "utf8");
  const shape = file.endsWith(".css") ? cssShape : jsShape;
  let same;
  try {
    same = shape(before) === shape(after);
  } catch (error) {
    console.log(`FAIL ${file}: does not parse (${error.message})`);
    failed += 1;
    continue;
  }
  if (same) console.log(`same ${file}`);
  else {
    console.log(`FAIL ${file}: the code changed, not only the comments`);
    failed += 1;
  }
}
if (unjudged.length) console.log(`not judged (not JS or CSS): ${unjudged.join(", ")}`);
console.log(
  failed
    ? `${failed} file(s) changed code`
    : `comment-only: ${changed.length - unjudged.length} source file(s)`
);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 5: Write `$TOOLS/mutate.mjs`**

```js
/**
 * Applies a list of edits read from a JSON file, and fails loudly if any edit
 * did not apply, so an edit that missed can never read as "the check passed".
 * Edits come from a file, not the command line, because Git Bash rewrites
 * arguments that look like paths (it turned "\n" into "/n" in an argument
 * starting with "//").
 *
 * Usage: node mutate.mjs <edits.json>
 *   edits.json: [{ "file": "...", "find": "...", "text": "...", "mode": "replace" | "before" }]
 *   paths are relative to the current directory (run it from the repo root).
 */
import { readFileSync, writeFileSync } from "node:fs";

const edits = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const { file, find, text, mode = "replace" } of edits) {
  const src = readFileSync(file, "utf8");
  const at = src.indexOf(find);
  if (at === -1) {
    console.error(`MUTATION NOT APPLIED: ${JSON.stringify(find)} not found in ${file}`);
    process.exit(2);
  }
  const next =
    mode === "before"
      ? src.slice(0, at) + text + src.slice(at)
      : src.slice(0, at) + text + src.slice(at + find.length);
  writeFileSync(file, next);
  const written = readFileSync(file, "utf8");
  if (written === src || !written.includes(text)) {
    console.error(`MUTATION NOT APPLIED: ${file} does not contain the new text`);
    process.exit(2);
  }
  console.log(`mutated ${file}`);
}
```

- [ ] **Step 6: Write `$TOOLS/make-allowlist.mjs`**

Its scope and header rule are copied verbatim from the ratchet (Task 1, Step 3). If you change one, change the other.

```js
/**
 * Writes scripts/__tests__/file-header-allowlist.json: every in-scope source
 * file that does not open with a header today. The scope and the header rule
 * are copied verbatim from the ratchet in repo-invariants.test.mjs, so the
 * list this writes is the list that test accepts.
 *
 * Usage: node make-allowlist.mjs <repoRoot> [--check]
 *   --check prints the count and the three ratchet assertions instead of writing.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [repoRoot = "D:/ai-workout", flag] = process.argv.slice(2);
const allowlistPath = path.join(repoRoot, "scripts", "__tests__", "file-header-allowlist.json");

// ---- copied from the ratchet ------------------------------------------------
const IN_SCOPE_DIRS = ["client/src", "server/src", "server/scripts", "scripts", "e2e"];
const isInScope = (file) =>
  /\.(js|jsx|mjs|cjs|css)$/.test(file) &&
  !/\.(test|spec)\.|(^|\/)__tests__\/|^client\/src\/test\/setup\.js$/.test(file) &&
  (IN_SCOPE_DIRS.some((dir) => file.startsWith(`${dir}/`)) ||
    /(^|\/)[^/]+\.config\.js$/.test(file));
const sources = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
  .split("\0")
  .filter((file) => file && isInScope(file) && existsSync(path.join(repoRoot, file)));
const TOOL_DIRECTIVE =
  /^\s*(\/\/|\/\*+)\s*(eslint|global\s|prettier-ignore|istanbul|c8\s|@vitest-environment)/;
const hasHeader = (file) => {
  const text = readFileSync(path.join(repoRoot, file), "utf8")
    .replace(/^\uFEFF/, "")
    .replace(/^#!.*\r?\n/, "");
  const first = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  return /^\s*(\/\/|\/\*)/.test(first) && !TOOL_DIRECTIVE.test(first);
};
// -----------------------------------------------------------------------------

const lacking = sources.filter((file) => !hasHeader(file)).sort();
if (flag !== "--check") {
  writeFileSync(allowlistPath, `${JSON.stringify(lacking, null, 2)}\n`);
  console.log(`wrote ${lacking.length} entries to ${allowlistPath}`);
} else {
  const allowlist = existsSync(allowlistPath)
    ? JSON.parse(readFileSync(allowlistPath, "utf8"))
    : lacking;
  const allowed = new Set(allowlist);
  console.log(
    `in scope ${sources.length}, with a header ${sources.length - lacking.length}, lacking ${lacking.length}`
  );
  console.log(
    "1 missing, not allowlisted:",
    sources.filter((f) => !allowed.has(f) && !hasHeader(f))
  );
  console.log(
    "2 allowlisted but done:",
    allowlist.filter((f) => sources.includes(f) && hasHeader(f))
  );
  console.log(
    "3 allowlisted but not an in-scope file:",
    allowlist.filter((f) => !sources.includes(f))
  );
}
```

- [ ] **Step 7: Write `$TOOLS/pr.sh`** — the steps every area PR repeats, as named shell functions

```bash
# Shared steps for the area PRs in docs/plans/2026-09-29-code-readability.md.
# Source it after setting REPO, SCRATCH and TOOLS: . "$TOOLS/pr.sh"

# Test-file and test counts for all three suites, saved as $SCRATCH/<label>-counts.txt.
pr_counts() {
  npm test > "$SCRATCH/$1-test.txt" 2>&1
  local status=$?
  sed 's/\x1b\[[0-9;]*m//g' "$SCRATCH/$1-test.txt" | grep -E "Test Files|^ +Tests " > "$SCRATCH/$1-counts.txt"
  echo "npm test exit=$status"
  cat "$SCRATCH/$1-counts.txt"
}

# Scan the tree and print one area's totals. $1 = PR number, $2 = before|after.
pr_scan() {
  node "$TOOLS/scan.mjs" "$REPO" "$SCRATCH/pr$1-$2.json" > /dev/null || { echo "scan failed"; return 1; }
  node "$TOOLS/area.mjs" "$1" "$SCRATCH/pr$1-$2.json" --totals
}

# Snapshot the built client, then (after comment edits) require a byte-identical rebuild.
pr_dist_snapshot() {
  npm -w client run build > "$SCRATCH/build.txt" 2>&1
  echo "build exit=$?"
  rm -rf "$SCRATCH/dist-before" && cp -r client/dist "$SCRATCH/dist-before"
}
pr_dist_same() {
  npm -w client run build > "$SCRATCH/build.txt" 2>&1
  echo "build exit=$?"
  diff -r "$SCRATCH/dist-before" client/dist > "$SCRATCH/dist-diff.txt" 2>&1
  echo "dist identical exit=$? (0 = byte-identical)"
}

# Regenerate the ratchet's allowlist, then show that lines were only removed.
pr_allowlist() {
  node "$TOOLS/make-allowlist.mjs" "$REPO"
  git diff --numstat -- scripts/__tests__/file-header-allowlist.json
}

# Every gate CI runs, each with its own exit code.
pr_gates() {
  local s
  for s in lint format:check knip build; do
    npm run "$s" > "$SCRATCH/gate-$s.txt" 2>&1
    echo "$s exit=$?"
  done
  npm run test:coverage > "$SCRATCH/gate-coverage.txt" 2>&1
  echo "test:coverage exit=$?"
  npm run test:e2e > "$SCRATCH/gate-e2e.txt" 2>&1
  echo "test:e2e exit=$?"
  tail -3 "$SCRATCH/gate-e2e.txt"
}
```

Then `. "$TOOLS/pr.sh"`.

- [ ] **Step 8: Reproduce the baseline**

```bash
node "$TOOLS/scan.mjs" "$REPO" "$SCRATCH/baseline.json"; echo "scan exit=$?"
for n in 1 2 3 4 5 6 7 8 9; do node "$TOOLS/area.mjs" $n "$SCRATCH/baseline.json" --totals; done > "$SCRATCH/baseline-totals.txt"; echo "area exit=$?"
node "$TOOLS/make-allowlist.mjs" "$REPO" --check
```

Expected: `scanned 198 in-scope files`. The totals match the Baseline table above, **if nothing has merged since `9b85b7d`**. If something has, the numbers move, and the new ones are the baseline. `make-allowlist --check` prints `in scope 198, with a header 13, lacking 185` and three empty lists.

- [ ] **Step 9: Prove `same-code.mjs` by mutation**

Write these three files with the Write tool.

`$TOOLS/edits-comment-only.json`:

```json
[
  {
    "file": "server/src/shutdown.js",
    "find": "\nexport ",
    "text": "\n// premise: a comment-only edit",
    "mode": "before"
  },
  {
    "file": "client/src/pages/dashboard/styles/toast.css",
    "find": "\n.",
    "text": "\n/* ---- premise: a banner ---- */",
    "mode": "before"
  }
]
```

`$TOOLS/edits-breaks-js.json`:

```json
[
  {
    "file": "server/src/shutdown.js",
    "find": "\nexport ",
    "text": "\n// premise: this line ends the comment\n)(",
    "mode": "before"
  }
]
```

`$TOOLS/edits-code-change.json`:

```json
[
  { "file": "server/src/corsPolicy.js", "find": "const ", "text": "let " },
  {
    "file": "client/src/pages/dashboard/styles/toast.css",
    "find": "px",
    "text": "px/* inside a value */"
  }
]
```

Then run all three:

```bash
restore() { git checkout -- server/src/shutdown.js server/src/corsPolicy.js client/src/pages/dashboard/styles/toast.css; }
for case in comment-only breaks-js code-change; do
  echo "== $case"; node "$TOOLS/mutate.mjs" "$TOOLS/edits-$case.json"; echo "mutate exit=$?"
  node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/same-$case.txt" 2>&1; echo "same-code exit=$?"; cat "$SCRATCH/same-$case.txt"; restore
done; git status --porcelain
```

Expected, as measured on 2026-09-29:

| Case           | `same-code` exit | Output                                                               |
| -------------- | ---------------- | -------------------------------------------------------------------- |
| `comment-only` | 0                | `same` for both files, `comment-only: 2 source file(s)`              |
| `breaks-js`    | 1                | `FAIL server/src/shutdown.js: does not parse (Unexpected token ))`   |
| `code-change`  | 1                | `FAIL` for `toast.css` and `corsPolicy.js`, `2 file(s) changed code` |

`mutate exit=0` in every case, and `git status --porcelain` is empty at the end. A `mutate exit=2` means an anchor moved: fix the JSON and rerun. Do not read that run as a pass.

- [ ] **Step 10: Prove the bundle comparison both ways**

```bash
pr_dist_snapshot
node "$TOOLS/mutate.mjs" "$TOOLS/edits-comment-only.json"
pr_dist_same                                   # expect: dist identical exit=0
git checkout -- server/src/shutdown.js client/src/pages/dashboard/styles/toast.css
```

Now the control. Write `$TOOLS/edits-client-code.json` with the Write tool:

```json
[{ "file": "client/src/app/units.js", "find": "\"US\"", "text": "\"UZ\"" }]
```

```bash
node "$TOOLS/mutate.mjs" "$TOOLS/edits-client-code.json"
pr_dist_same                                   # expect: dist identical exit=1
git checkout -- client/src/app/units.js
npm -w client run build > /dev/null 2>&1; git status --porcelain
```

Expected: `exit=0` for the comment edit and `exit=1` for the one-character code edit, which changes every chunk's content hash. At the end, a clean build and an empty status.

- [ ] **Step 11: Write `$TOOLS/escapes-intact.mjs` and `$TOOLS/restore-escapes.mjs`, and prove the guard** (added after Findings §9)

The escape characters in this file are built with `String.fromCharCode`, so writing it can decode nothing. If a subagent writes it, check afterwards that the only backslashes are the ones shown.

```js
/**
 * Guards against a subagent tool call decoding a unicode escape. Verified on
 * 2026-09-29: when a subagent types backslash-u-FEFF into Write or Edit, the
 * file receives the character U+FEFF itself (a lone one is dropped entirely).
 * ESLint does not notice inside a string. For every file that differs from
 * HEAD, this requires no fewer backslash-u escapes than HEAD has, and no more
 * invisible characters (U+FEFF past position 0, U+00A0, U+200B-U+200D,
 * U+2060) than HEAD has. Exits 1 if either is violated.
 *
 * Usage: node escapes-intact.mjs <repoRoot>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.argv[2] || "D:/ai-workout";
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const BACKSLASH = String.fromCharCode(92);
const ESCAPE = new RegExp(`${BACKSLASH}${BACKSLASH}u(\\{[0-9A-Fa-f]+\\}|[0-9A-Fa-f]{4})`, "g");
const INVISIBLE = [0xfeff, 0xa0, 0x200b, 0x200c, 0x200d, 0x2060].map((c) => String.fromCharCode(c));

const escapes = (text) => (text.match(ESCAPE) || []).length;
const invisibles = (text) => {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // a leading BOM is legitimate
  return INVISIBLE.reduce((n, ch) => n + body.split(ch).length - 1, 0);
};

const changed = git("diff", "--name-only", "HEAD").trim().split("\n").filter(Boolean);
let failed = 0;
for (const file of changed) {
  if (!existsSync(path.join(root, file))) continue;
  let before = "";
  try {
    before = git("show", `HEAD:${file}`);
  } catch {
    before = ""; // a new file: HEAD has nothing to compare against
  }
  const after = readFileSync(path.join(root, file), "utf8");
  const e = [escapes(before), escapes(after)];
  const v = [invisibles(before), invisibles(after)];
  // Losing an escape, or gaining an invisible character, is what a decoded
  // escape looks like. Gaining an escape is legitimate: new text can mention one.
  if (e[1] < e[0] || v[1] > v[0]) {
    console.log(
      `FAIL ${file}: escapes ${e[0]} -> ${e[1]}, invisible characters ${v[0]} -> ${v[1]}`
    );
    failed += 1;
  }
}
console.log(
  failed
    ? `${failed} file(s) lost or gained escapes`
    : `escapes intact in ${changed.length} changed file(s)`
);
process.exit(failed ? 1 : 0);
```

`$TOOLS/restore-escapes.mjs` repairs a file the guard flags. It turns each invisible character back into its ASCII escape:

```js
/**
 * Repairs decoded unicode escapes: every U+FEFF (except a leading byte-order
 * mark), U+00A0, U+200B-U+200D and U+2060 in the named files becomes its ASCII
 * escape again. The backslash is built from a character code, so running or
 * writing this script cannot itself be decoded by a tool call.
 *
 * Usage: node restore-escapes.mjs <file> [file...]
 */
import { readFileSync, writeFileSync } from "node:fs";

const BACKSLASH = String.fromCharCode(92);
const CODES = [0xfeff, 0xa0, 0x200b, 0x200c, 0x200d, 0x2060];
for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, "utf8");
  const leadingBom = text.charCodeAt(0) === 0xfeff;
  let body = leadingBom ? text.slice(1) : text;
  let fixed = 0;
  for (const code of CODES) {
    const ch = String.fromCharCode(code);
    const escape = `${BACKSLASH}u${code.toString(16).toUpperCase().padStart(4, "0")}`;
    fixed += body.split(ch).length - 1;
    body = body.split(ch).join(escape);
  }
  writeFileSync(file, (leadingBom ? String.fromCharCode(0xfeff) : "") + body);
  console.log(`${file}: ${fixed} character(s) restored to escapes`);
}
```

Prove it the way it fails in practice. The scripts below build every escape and character from character codes, so no tool call has to type one:

- one turns a non-breaking-space escape in `PreviewWorkoutWeekChapter.jsx` into the literal character, which is what a decoded tool call does;
- the other adds a comment that mentions a new escape, which is legitimate.

Measured on 2026-09-29, with the copies extracted from this plan:

| Case                                  | Output                                                | Exit |
| ------------------------------------- | ----------------------------------------------------- | ---- |
| clean tree                            | `escapes intact in 0 changed file(s)`                 | 0    |
| a comment that mentions a new escape  | `escapes intact in 1 changed file(s)`                 | 0    |
| one escape decoded                    | `FAIL …: escapes 6 -> 5, invisible characters 0 -> 1` | 1    |
| that file after `restore-escapes.mjs` | `escapes intact in 0 changed file(s)`                 | 0    |

After the repair, the file was byte-identical to `HEAD`. The decoded escape also made `same-code.mjs` exit 1, while `npx eslint` on the file exited 0.

Its first real catch was this plan. The Edits that added Findings §9 decoded 6 escapes, and `restore-escapes.mjs` put them back.

---

### Task 1: PR 0 — the SOP, the ratchet, the template, the docs

**Branch:** `chore/readability-sop`. It already carries the spec, this plan and the SOP.

**Files:**

- Modify: `scripts/__tests__/repo-invariants.test.mjs` (imports, and a new `describe` block at the end)
- Create: `scripts/__tests__/file-header-allowlist.json`
- Modify: `.github/pull_request_template.md`, `docs/README.md`, `CLAUDE.md`

- [ ] **Step 1: Confirm the branch and its contents**

```bash
git switch chore/readability-sop && git status --porcelain
ls docs/code-readability-sop.md docs/specs/2026-09-29-code-readability-design.md docs/plans/2026-09-29-code-readability.md
npm run test:scripts > "$SCRATCH/pr0-scripts-before.txt" 2>&1; echo "exit=$?"
sed 's/\x1b\[[0-9;]*m//g' "$SCRATCH/pr0-scripts-before.txt" | grep -E "Test Files|^ +Tests "
```

Expected: a clean tree, the three files present, `exit=0`, `Test Files 3 passed (3)` and `Tests 65 passed (65)`.

- [ ] **Step 2: Create an empty allowlist**

Create `scripts/__tests__/file-header-allowlist.json` containing exactly:

```json
[]
```

- [ ] **Step 3: Write the failing test**

In `scripts/__tests__/repo-invariants.test.mjs`, add `execFileSync` to the imports (line 1 stays as it is):

```js
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
```

Append this block at the end of the file:

```js
describe("every source file opens with a header comment", () => {
  // docs/code-readability-sop.md asks every non-test source file to open with a
  // comment saying what it is for. This checks presence only; whether a header
  // is any good is review's job.
  //
  // file-header-allowlist.json lists the files that had no header when this
  // check arrived. It only shrinks: a file that gains a header must leave the
  // list (the third test), and so must a path that stops being an in-scope file
  // (the fourth), so no entry can outlive the file it excuses. At zero entries
  // the list allows nothing and could be deleted along with the third and
  // fourth tests, which exist only to keep it honest.
  const IN_SCOPE_DIRS = ["client/src", "server/src", "server/scripts", "scripts", "e2e"];
  const isInScope = (file) =>
    /\.(js|jsx|mjs|cjs|css)$/.test(file) &&
    !/\.(test|spec)\.|(^|\/)__tests__\/|^client\/src\/test\/setup\.js$/.test(file) &&
    (IN_SCOPE_DIRS.some((dir) => file.startsWith(`${dir}/`)) ||
      /(^|\/)[^/]+\.config\.js$/.test(file));
  // Tracked files, not a directory walk, so stray local files cannot fail it.
  const sources = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" })
    .split("\0")
    .filter((file) => file && isInScope(file) && existsSync(path.join(repoRoot, file)));

  // After a byte-order mark and a shebang, the first non-blank line must be a
  // comment -- and not a tool directive, which tells a reader nothing.
  const TOOL_DIRECTIVE =
    /^\s*(\/\/|\/\*+)\s*(eslint|global\s|prettier-ignore|istanbul|c8\s|@vitest-environment)/;
  const hasHeader = (file) => {
    const text = readFileSync(path.join(repoRoot, file), "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/^#!.*\r?\n/, "");
    const first = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
    return /^\s*(\/\/|\/\*)/.test(first) && !TOOL_DIRECTIVE.test(first);
  };

  const allowlist = JSON.parse(
    readFileSync(path.join(repoRoot, "scripts", "__tests__", "file-header-allowlist.json"), "utf8")
  );
  const allowed = new Set(allowlist);

  test("the sweep found the source tree", () => {
    // Guards the scope: a broken filter must not pass vacuously on no files.
    expect(sources.length).toBeGreaterThan(150);
    expect(sources).toContain("server/src/index.js");
    expect(sources).toContain("client/src/styles/base.css");
  });

  test("every source file not on the allowlist opens with a header", () => {
    const missing = sources.filter((file) => !allowed.has(file) && !hasHeader(file));
    expect(missing).toEqual([]);
  });

  test("every allowlisted file still lacks one, so the list only shrinks", () => {
    const done = allowlist.filter((file) => sources.includes(file) && hasHeader(file));
    expect(done).toEqual([]);
  });

  test("every allowlisted path is an in-scope tracked file, listed once", () => {
    const stale = allowlist.filter((file) => !sources.includes(file));
    expect(stale).toEqual([]);
    expect(allowed.size).toBe(allowlist.length);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

```bash
npm run test:scripts > "$SCRATCH/pr0-red.txt" 2>&1; echo "exit=$?"
sed 's/\x1b\[[0-9;]*m//g' "$SCRATCH/pr0-red.txt" | grep -E "FAIL|✓|×|Tests " | head -20
```

Expected: `exit=1`, and exactly one failing test: `every source file not on the allowlist opens with a header`. Its diff lists the 185 files. The other three new tests pass.

- [ ] **Step 5: Generate the allowlist**

```bash
node "$TOOLS/make-allowlist.mjs" "$REPO"
```

Expected: `wrote 185 entries`.

- [ ] **Step 6: Run it and watch it pass**

```bash
npm run test:scripts > "$SCRATCH/pr0-green.txt" 2>&1; echo "exit=$?"
sed 's/\x1b\[[0-9;]*m//g' "$SCRATCH/pr0-green.txt" | grep -E "Test Files|^ +Tests "
```

Expected: `exit=0`, `Tests 69 passed (69)`, which is the 65 from Step 1 plus 4.

- [ ] **Step 7: Prove each assertion bites**

Write these four files with the Write tool.

`$TOOLS/edits-ratchet-directive.json`, a header replaced by a tool directive (the first line):

```json
[
  {
    "file": "server/src/shutdown.js",
    "find": "/**\n * Builds the routine run on SIGTERM/SIGINT",
    "text": "// eslint-disable-next-line no-unused-vars\n/**\n * Builds the routine run on SIGTERM/SIGINT"
  }
]
```

`$TOOLS/edits-ratchet-removed.json`, a header deleted outright:

```json
[
  {
    "file": "server/src/shutdown.js",
    "find": "/**\n * Builds the routine run on SIGTERM/SIGINT: stop accepting connections, drain,\n * then release every external resource before exiting.\n *\n * Dependencies are injected so the sequence is unit-testable by direct call.\n * That matters because Windows does not deliver POSIX signals to Node the way\n * the Linux CI runner does, so signal-driven tests would not run locally.\n */\n",
    "text": ""
  }
]
```

The `text` is `""`. `mutate.mjs` confirms that an empty replacement applied by checking the file changed, and `written.includes("")` is always true. So also confirm with `git diff --stat` that the file lost 8 lines.

`$TOOLS/edits-ratchet-done.json`, an allowlisted file that gains a header:

```json
[
  {
    "file": "client/src/app/routing.js",
    "find": "import ",
    "text": "/** Maps a URL path to the dashboard view it shows. */\nimport ",
    "mode": "replace"
  }
]
```

`$TOOLS/edits-ratchet-stale.json`, a path that does not exist:

```json
[
  {
    "file": "scripts/__tests__/file-header-allowlist.json",
    "find": "[\n",
    "text": "[\n  \"client/src/does-not-exist.js\",\n"
  }
]
```

Stage the two new files first. The loop restores the allowlist with `git checkout --`, which reads from the index, and an untracked file is not in it. Worse, one path git cannot match makes the whole `checkout` restore nothing, which would leave `shutdown.js` and `routing.js` mutated.

```bash
git add scripts/__tests__/repo-invariants.test.mjs scripts/__tests__/file-header-allowlist.json
for case in directive removed done stale; do
  echo "== $case"; node "$TOOLS/mutate.mjs" "$TOOLS/edits-ratchet-$case.json"; echo "mutate exit=$?"; git diff --stat
  npm run test:scripts > "$SCRATCH/pr0-mut-$case.txt" 2>&1; echo "test exit=$?"
  sed 's/\x1b\[[0-9;]*m//g' "$SCRATCH/pr0-mut-$case.txt" | grep -E "^ +(×|FAIL)|Tests " | head -5
  git checkout -- server/src/shutdown.js client/src/app/routing.js scripts/__tests__/file-header-allowlist.json
done; git status --porcelain
```

Expected:

| Case        | `test exit` | The failing test                                                   |
| ----------- | ----------- | ------------------------------------------------------------------ |
| `directive` | 1           | `every source file not on the allowlist opens with a header`       |
| `removed`   | 1           | `every source file not on the allowlist opens with a header`       |
| `done`      | 1           | `every allowlisted file still lacks one, so the list only shrinks` |
| `stale`     | 1           | `every allowlisted path is an in-scope tracked file, listed once`  |

The status at the end shows only this task's files, staged: the test and the allowlist, and nothing else modified.

- [ ] **Step 8: The PR template**

In `.github/pull_request_template.md`, after the line ``- [ ] `npm run build` — exit 0``, add:

```markdown
- [ ] New or changed source files follow `docs/code-readability-sop.md` (a header first, a summary on each export, a reason on each effect)
```

- [ ] **Step 9: The docs index**

In `docs/README.md`, add a row to the table after the `deploy-runbook.md` row:

```markdown
| [`code-readability-sop.md`](code-readability-sop.md) | How source files are commented and ordered, and how to prove a readability change altered nothing |
```

Then add this line to the Plans list, after the 2026-09-23 entry:

```markdown
- [2026-09-29 — Code readability](plans/2026-09-29-code-readability.md)
```

The spec entry is already there.

- [ ] **Step 10: `CLAUDE.md`**

First, correct the stale length. Replace `` `index.js` is ~697 lines, and nearly all of `` with `` `index.js` is ~836 lines, and nearly all of ``. Confirm the number first with `wc -l < server/src/index.js`, and use what it prints.

Second, in the `Conventions:` list, add this bullet immediately before `- Validate user input at system boundaries`:

```markdown
- **Comments and in-file order follow `docs/code-readability-sop.md`**: a header first in
  every source file, a prose `/** */` summary on every export, one line on every effect,
  and present-tense reasons rather than history. `scripts/__tests__/repo-invariants.test.mjs`
  fails on a source file without a header unless `file-header-allowlist.json` lists it, and
  that list only shrinks — never add to it.
```

- [ ] **Step 11: Gates**

```bash
npm test > "$SCRATCH/g1.txt" 2>&1; echo "npm test exit=$?"
npm run lint > "$SCRATCH/g2.txt" 2>&1; echo "lint exit=$?"
npm run format:check > "$SCRATCH/g3.txt" 2>&1; echo "format:check exit=$?"
npm run knip > "$SCRATCH/g4.txt" 2>&1; echo "knip exit=$?"
npm run build > "$SCRATCH/g5.txt" 2>&1; echo "build exit=$?"
```

Expected: all five `exit=0`. `CLAUDE.md` asks for the full `npm test` and a build before any commit, even one this narrow. If `format:check` fails, run `npx prettier --write` on the files it names, then check they are stable by running `--write` a second time and comparing sizes.

- [ ] **Step 12: Commit**

```bash
git add scripts/__tests__/repo-invariants.test.mjs scripts/__tests__/file-header-allowlist.json .github/pull_request_template.md docs/README.md CLAUDE.md
git commit -F - <<'EOF'
test: fail on a source file without a header comment

A repo invariant with a shrink-only allowlist of the 185 files that have
no header today. The allowlist can only lose entries: a file that gains a
header, or stops existing, fails the suite until its line is removed.
Adds the SOP to the PR template, the docs index and CLAUDE.md, and
corrects CLAUDE.md's length for index.js.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

- [ ] **Step 13: Open the PR**

```bash
git push -u origin chore/readability-sop
gh pr create --title "docs: code readability SOP, plan and header ratchet" --body-file "$SCRATCH/pr0-body.md"
```

Write `$SCRATCH/pr0-body.md` first, following `.github/pull_request_template.md`:

- **What changed:** the spec, this plan, the SOP, and the ratchet.
- **Verification:** the Step 6 counts, the Step 7 mutation table with real exit codes, and the Step 11 gates.
- **Risk:** the ratchet fails CI on any new file without a header.

End the body with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

---

### Task 2: PR 1 — server bootstrap, middleware, routes

**Branch:** `chore/readability-server-routes`

**Before:** `headers first 2/23 | exports documented 3/26 | long functions sectioned 13/27 | history comments 2`
**After:** `headers first 23/23 | exports documented 26/26 | long functions sectioned 27/27 | history comments 0`, and no comment in these files that mentions the retired shim.

**Files and what each needs** (from the baseline scan):

- [ ] `server/src/index.js` — header (see the note below: the comment above `dotenv.config()` stays), section banners
- [ ] `server/src/middleware/errorHandler.js` — header; export docs: createErrorHandler (l.1)
- [ ] `server/src/middleware/requestContext.js` — header; export docs: createRequestContextMiddleware (l.17)
- [ ] `server/src/routes/authRoutes.js` — header; export docs: registerAuthRoutes (l.4); section comments: post(callback) (l.83, 44 lines), post(callback) (l.128, 46 lines)
- [ ] `server/src/routes/dashboard/registerDashboardReadRoutes.js` — header; export docs: registerDashboardReadRoutes (l.4); section comments: registerDashboardReadRoutes (l.4, 79 lines)
- [ ] `server/src/routes/dashboard/registerDashboardWriteRoutes.js` — header; export docs: registerDashboardWriteRoutes (l.5)
- [ ] `server/src/routes/dashboard/validation.js` — header; export docs: validateQuery (l.15), validateParams (l.22)
- [ ] `server/src/routes/dashboard/write/registerMealAndMetricRoutes.js` — header; export docs: registerMealAndMetricRoutes (l.2); present-tense rewrite: l.43 (to l.47)
- [ ] `server/src/routes/dashboard/write/registerSavedExerciseRoutes.js` — header; export docs: registerSavedExerciseRoutes (l.4); section comments: registerSavedExerciseRoutes (l.4, 57 lines)
- [ ] `server/src/routes/dashboard/write/registerWorkoutAndGoalRoutes.js` — header; export docs: registerWorkoutAndGoalRoutes (l.4); present-tense rewrite: l.37 (to l.39), and read l.105
- [ ] `server/src/routes/dashboardRoutes.js` — header; export docs: registerDashboardRoutes (l.4)
- [ ] `server/src/routes/external/registerAirQualityRoutes.js` — header; export docs: registerAirQualityRoutes (l.4); section comments: registerAirQualityRoutes (l.4, 128 lines), get(callback) (l.18, 113 lines)
- [ ] `server/src/routes/external/registerMealDbRoutes.js` — header; export docs: registerMealDbRoutes (l.5)
- [ ] `server/src/routes/external/registerWeatherRoutes.js` — move header to top; export docs: registerWeatherRoutes (l.18); section comments: registerWeatherRoutes (l.18, 163 lines), get(callback) (l.29, 63 lines), get(callback) (l.93, 87 lines)
- [ ] `server/src/routes/external/registerWgerRoutes.js` — header; export docs: registerWgerRoutes (l.11); section comments: registerWgerRoutes (l.11, 198 lines), get(callback) (l.23, 60 lines), get(callback) (l.84, 73 lines), get(callback) (l.158, 50 lines)
- [ ] `server/src/routes/external/validation.js` — header; export docs: validateQuery (l.57), validateParams (l.65)
- [ ] `server/src/routes/externalRoutes.js` — header; export docs: registerExternalRoutes (l.6)
- [ ] `server/src/routes/generateRoutes.js` — header; export docs: buildGenerationEquipmentContext (l.78), registerGenerateRoutes (l.123); section comments: buildGenerationEquipmentContext (l.78, 44 lines)
- [ ] `server/src/routes/registerApiRoutes.js` — header; export docs: registerApiRoutes (l.7)
- [ ] `server/src/routes/systemRoutes.js` — move header to top; export docs: registerSystemRoutes (l.15)
- [ ] `server/src/staticClient.js` — move header to top; export docs: resolveClientDistPath (l.26)
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses 21 entries

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-server-routes
```

- [ ] **Step 2: Baseline**

```bash
pr_scan 1 before
pr_counts pr1-before
```

Expected: the **Before** line above (it moves if `main` has moved), and `npm test exit=0`.

- [ ] **Step 3: Write the comments**

Work through the file list, following the SOP's "Factory or route registrar" checklist.

**`server/src/index.js`.** The comment above `dotenv.config()` explains that call, so it stays where it is. Put this header at line 1:

```js
/**
 * The API server's bootstrap: reads the environment, builds the Express app,
 * wires every repository and service into the routes, and exports `app` for
 * the test suites and `startServer` for the entry-point guard at the bottom.
 */
```

Then add these banners. Each one goes on its own line directly above the anchor, and above any comment already attached to the anchor. Each anchor is the first line in the file that begins with this text:

| Banner                                                                             | Anchor                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `// ---- Environment ------------------------------------------------------------` | `// quiet: dotenv 17+ prints`                                                              |
| `// ---- App, logging and metrics -----------------------------------------------` | `const app = express();`                                                                   |
| `// ---- Request pipeline -------------------------------------------------------` | `if (process.env.NODE_ENV === "production") {`                                             |
| `// ---- Configuration ----------------------------------------------------------` | `// Built only when a key is configured.`                                                  |
| `// ---- Repositories -----------------------------------------------------------` | `const { findUserWithDashboard, findUserWithDashboardByEmail, createUserWithDashboard } =` |
| `// ---- Services ---------------------------------------------------------------` | `// The cache is built here but sessionService, which owns the Redis client, is not`       |
| `// ---- Rate limiters ----------------------------------------------------------` | `// Counters live in Redis when it is up, so they survive a restart or the free`           |
| `// ---- Limits and CSRF on /api ------------------------------------------------` | `app.use("/api", apiLimiter);`                                                             |
| `// ---- API routes -------------------------------------------------------------` | `registerApiRoutes(app, {`                                                                 |
| `// ---- Static client and error handler ----------------------------------------` | `// After the API routes so /api keeps its own 404s, and before the error`                 |
| `// ---- Startup ----------------------------------------------------------------` | `const startServer = async () => {`                                                        |
| `// ---- Exports ----------------------------------------------------------------` | `export { app, startServer };`                                                             |

Delete the line `// Progress-metric writes go straight to Prisma; the shim still backs its reads.` It is false: nothing reads through the shim, which is gone, and the Repositories banner now names the block. Move no statement.

**The two write-route files.**

- `registerMealAndMetricRoutes.js:43–47` and `registerWorkoutAndGoalRoutes.js:37–39` narrate a Mongo pipeline that no longer exists. Replace each with a present-tense line saying what the code below it does. If the code is self-explanatory, delete the comment.
- Read `registerWorkoutAndGoalRoutes.js:105` too, which the pattern no longer flags.

**Every route handler of 40 or more lines** gets section comments naming its steps: validate, load, write, respond.

- [ ] **Step 4: Prove the comments changed no code**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr1-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr1-same.txt"
git grep -nE "shim|prismaDataModels|Mongo|Mongoose|toObject" -- server/src/index.js server/src/middleware server/src/routes ':!*__tests__*'; echo "grep exit=$? (1 = none left)"
pr_counts pr1-comments && diff "$SCRATCH/pr1-before-counts.txt" "$SCRATCH/pr1-comments-counts.txt"; echo "counts identical exit=$?"
```

Expected: `same-code exit=0` with `comment-only: 21 source file(s)` (or however many you touched, with no `FAIL`), `grep exit=1`, and `counts identical exit=0`.

- [ ] **Step 5: Shrink the allowlist**

```bash
pr_allowlist
npm run test:scripts > "$SCRATCH/pr1-scripts.txt" 2>&1; echo "test:scripts exit=$?"
```

Expected: `wrote 164 entries`, numstat `0	21	scripts/__tests__/file-header-allowlist.json` (no additions), and `test:scripts exit=0`.

- [ ] **Step 6: Measure**

```bash
pr_scan 1 after
```

Expected: the **After** line. If something is short, re-run `node "$TOOLS/area.mjs" 1 "$SCRATCH/pr1-after.json"` for the list, finish it, and repeat from Step 4.

- [ ] **Step 7: Commit**

```bash
git add -A server/src scripts/__tests__/file-header-allowlist.json && git status --porcelain
git commit -F - <<'EOF'
docs(server): comment the bootstrap, middleware and routes per the SOP

Comment-only: same-code.mjs finds identical syntax trees in every file,
and test counts are unchanged. Adds a header to each file, a summary to
each export, section banners to index.js without moving any statement,
and replaces the comments narrating the retired Mongo pipeline with what
the code does now.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

There are no tidy items in this area, so there is no second commit.

- [ ] **Step 8: Gates and PR**

```bash
pr_gates
```

Expected: every gate `exit=0`, and the E2E tail shows `19 passed`.

Then push and open the PR, following the template:

- **What changed:** the Before and After lines, and the same-code result.
- **Verification:** the gates.
- **Exceptions:** any export left bare, by name and with the reason.

---

### Task 3: PR 2 — server services, repositories, db, server scripts and config

**Branch:** `chore/readability-server-services`

**Before:** `headers first 6/31 | exports documented 10/65 | long functions sectioned 17/31 | history comments 12`
**After:** `headers first 31/31 | exports documented 65/65 | long functions sectioned 31/31 | history comments 0`, and the shim grep empty across all of `server/src`.

**Files and what each needs:**

- [ ] `server/scripts/apply-postgres-migrations.js` — header
- [ ] `server/src/db/postgres.js` — header; export docs: resolvePostgresConfig (l.34), getPostgresStatus (l.45), getPostgresPool (l.47), connectPostgres (l.49), closePostgres (l.107)
- [ ] `server/src/db/postgresMigrations.js` — move header to top
- [ ] `server/src/db/prisma.js` — header; export docs: connectPrisma (l.42), disconnectPrisma (l.47)
- [ ] `server/src/repositories/dashboardCollectionRepository.js` — header rewrite (below); export docs: createDashboardCollectionRepository (l.33); rewrite the shim reference at l.38
- [ ] `server/src/repositories/generatedPlanRepository.js` — header rewrite; export docs: mapGeneratedPlan (l.27), createGeneratedPlanRepository (l.41)
- [ ] `server/src/repositories/mealLogRepository.js` — header rewrite; export docs: mapMealLog (l.14), createMealLogRepository (l.27); rewrite the Mongo references at l.73 and l.92–93
- [ ] `server/src/repositories/progressMetricRepository.js` — header rewrite; export docs: mapProgressMetric (l.13), createProgressMetricRepository (l.24)
- [ ] `server/src/repositories/rowValues.js` — header rewrite (it calls the shim live); export docs: toIso (l.10), toDateOnly (l.16), dateOnlyToDate (l.22)
- [ ] `server/src/repositories/savedExerciseRepository.js` — header rewrite; export docs: mapSavedExercise (l.17), createSavedExerciseRepository (l.31)
- [ ] `server/src/repositories/userLookup.js` — export docs: userIdWhere (l.12)
- [ ] `server/src/repositories/userReadRepository.js` — header rewrite; export docs: mapUser (l.52), createUserReadRepository (l.81); section comments: loadWithCollections (l.82, 54 lines); rewrite l.38
- [ ] `server/src/repositories/userRepository.js` — header rewrite; export docs: createUserRepository (l.17); rewrite the shim references at l.30 and l.96
- [ ] `server/src/repositories/workoutSessionRepository.js` — header rewrite; export docs: mapWorkoutSession (l.14), createWorkoutSessionRepository (l.27)
- [ ] `server/src/services/auth/authUserService.js` — header; export docs: createAuthUserService (l.7); present-tense rewrite: l.22–23
- [ ] `server/src/services/auth/sessionService.js` — header; export docs: parseCookies (l.5), parseEnvBoolean (l.29), createSessionService (l.69)
- [ ] `server/src/services/dashboard/dashboardCollectionService.js` — header; export docs: createDashboardCollectionService (l.1); section comments: getDashboardCollections (l.42, 53 lines)
- [ ] `server/src/services/dashboard/dashboardDataBuildersService.js` — header; export docs: cleanText (l.3), toNullableNumber (l.6), toCleanArray (l.14), toCleanNameArray (l.20), defaultProfile (l.85), defaultGoals (l.106), defaultDashboard (l.112), buildDashboard (l.123), buildWorkoutSessionEntry (l.149), buildMealLogEntry (l.162), buildProgressMetricEntry (l.178), buildSavedExerciseEntry (l.189), buildProfile (l.203), isCompleteSignupProfile (l.246); present-tense rewrite: l.28 ("Reinstated from commit c2c820f")
- [ ] `server/src/services/external/externalDataService.js` — header; export docs: createExternalDataService (l.1); section comments: fetchOpenMeteo (l.158, 48 lines), openAqRequest (l.207, 81 lines), runExternalRequestWithRetry(callback) (l.218, 68 lines), extractOpenAqMeasurement (l.323, 45 lines), aqiBand (l.389, 57 lines), wgerRequest (l.469, 66 lines), runExternalRequestWithRetry(callback) (l.481, 52 lines), mealDbRequest (l.536, 63 lines), runExternalRequestWithRetry(callback) (l.547, 50 lines), mapWgerExercise (l.657, 45 lines); present-tense rewrite: l.36
- [ ] `server/src/services/external/httpCacheService.js` — header; export docs: createHttpCacheService (l.1)
- [ ] `server/src/services/http/apiSchemaService.js` — header; export docs: getValidationMessage (l.213), validateBody (l.220)
- [ ] `server/src/services/http/errorResponseService.js` — header
- [ ] `server/src/services/http/requestValidationService.js` — header; export docs: getSchemaValidationMessage (l.6), validateSchemaInput (l.15)
- [ ] `server/src/services/http/validationMessages.js` — export docs: validationMessage (l.33)
- [ ] `server/src/services/platform/envValidationService.js` — export docs: validateEnv (l.55); section comments: validateEnv (l.55, 46 lines)
- [ ] `server/src/services/platform/errorTrackingService.js` — header; export docs: initErrorTracking (l.45); section comments: initErrorTracking (l.45, 64 lines)
- [ ] `server/src/services/platform/metricsService.js` — export docs: initLatencyStats (l.12)
- [ ] `server/src/services/platform/platformHealthService.js` — header; export docs: isUpstreamFailureStatus (l.1)
- [ ] `server/src/services/platform/rateLimitStore.js` — header
- [ ] `server/vitest.config.js` — header
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses 25 entries

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-server-services
```

- [ ] **Step 2: Baseline**

```bash
pr_scan 2 before
pr_counts pr2-before
```

- [ ] **Step 3: Write the comments**

**The repository headers.** Each replaces the file's existing `/** … */` block and moves above the imports. Every fact in them was checked against the code on 2026-09-29.

`dashboardCollectionRepository.js`:

```js
/**
 * Paginated reads for the three dashboard collections: workout sessions, meal
 * logs and progress metrics. One generic loadCollectionPage serves all three,
 * because dashboardCollectionService drives them through a single code path.
 */
```

`generatedPlanRepository.js`:

```js
/**
 * Prisma-native persistence for generated workout plans. It only inserts:
 * plans are read newest first by `createdAt`, and userReadRepository caps them
 * at 200 on read, so nothing prunes the table and it grows without bound.
 * That is a decision still to be made, not an oversight.
 */
```

`mealLogRepository.js`:

```js
/**
 * Prisma-native persistence for meal logs: the row mapper the API returns, the
 * save, and the calorie entry derived from each day's meals.
 */
```

`progressMetricRepository.js`:

```js
/**
 * Prisma-native persistence for progress metrics: the row mapper the API
 * returns, and the save.
 */
```

`rowValues.js`:

```js
/**
 * Column value conversions shared by every repository's row mapper: dates to
 * ISO strings and date-only keys, and Decimal columns to numbers. An absent
 * value reads as "" or null, never as 0.
 */
```

`savedExerciseRepository.js`:

```js
/**
 * Prisma-native persistence for saved exercises. Saving one the user already
 * has -- the same external exercise id, or the same name ignoring case --
 * updates that row instead of adding a second.
 */
```

`userReadRepository.js`:

```js
/**
 * Loads a user together with the dashboard collections the API returns: one
 * six-table fetch and the response shape the routes depend on. Each collection
 * is capped here, on read (COLLECTION_LIMITS); nothing prunes the tables.
 */
```

`userRepository.js`:

```js
/**
 * Prisma-native writes against the user row and its calorie entries. Each one
 * reports whether it matched a user; the routes then re-read the user through
 * findUserWithDashboard for the response body.
 */
```

`workoutSessionRepository.js`:

```js
/**
 * Prisma-native persistence for workout sessions: the row mapper the API
 * returns, and the save.
 */
```

**`userReadRepository.js:38`**, the comment above `COLLECTION_LIMITS`, becomes:

```js
/**
 * The caps the API enforces on each collection. They are applied here, on
 * read, rather than in storage, so nothing prunes these tables.
 */
```

**The remaining shim and Mongo references** are in `dashboardCollectionRepository.js:38`, `mealLogRepository.js:73` and `:92–93`, `userRepository.js:30` and `:96`, and `authUserService.js:22–23`. Rewrite each one to state the current reason for the code beside it. A comment that only explains what the old system did is deleted.

`mealLogRepository.js:73` is a rationale worth keeping: `_sum` returns null where the old pipeline's `$ifNull` gave 0. Keep it in the present: "`_sum` is null when no row has calories, so it is turned into 0 here: an empty day's total is zero, not absent."

**`dashboardDataBuildersService.js:28` and `externalDataService.js:36`** hold real guard rationales. Keep the reason, drop the commit hash and the "used to". Also add a header to every file in the list that lacks one.

- [ ] **Step 4: Prove the comments changed no code**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr2-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr2-same.txt"
git grep -nE "shim|prismaDataModels|Mongo|Mongoose|toObject|Task [0-9]+[a-z]? of" -- server/src ':!*__tests__*' ':!*.test.*'; echo "grep exit=$? (1 = none left)"
pr_counts pr2-comments && diff "$SCRATCH/pr2-before-counts.txt" "$SCRATCH/pr2-comments-counts.txt"; echo "counts identical exit=$?"
```

Expected: `same-code exit=0` with no `FAIL`, `grep exit=1`, and `counts identical exit=0`.

- [ ] **Step 5: Shrink the allowlist**

```bash
pr_allowlist
npm run test:scripts > "$SCRATCH/pr2-scripts.txt" 2>&1; echo "test:scripts exit=$?"
```

Expected: numstat `0	25	…` and `test:scripts exit=0`.

- [ ] **Step 6: Measure**

```bash
pr_scan 2 after
```

Expected: the **After** line.

- [ ] **Step 7: Commit**

```bash
git add -A server scripts/__tests__/file-header-allowlist.json && git status --porcelain
git commit -F - <<'EOF'
docs(server): comment the services, repositories and db layer per the SOP

Comment-only: identical syntax trees in every file, unchanged test counts.
Rewrites the repository headers, which cited plan tasks and described the
retired Mongo shim as still live, to state what each file does now.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

No tidy items in this area.

- [ ] **Step 8: Gates and PR**

```bash
pr_gates
```

Expected: all `exit=0`, and `19 passed`. Then push and open the PR, with Before/After, the same-code result, the empty shim grep, and the gates.

---

### Task 4: PR 3 — the client shell

**Branch:** `chore/readability-client-shell`

**Before:** `headers first 2/22 | exports documented 4/34 | effects commented 1/21 | long functions sectioned 8/22 | history comments 6`
**After:** `headers first 22/22 | exports documented 34/34 | effects commented 21/21 | long functions sectioned 22/22 | history comments 0`

**Files and what each needs:**

- [ ] `client/src/App.jsx` — header; export docs: App (l.38); effect comments: l.399, l.406, l.412, l.418, l.432, l.438, l.443; section comments: toggleEquipment (l.210, 56 lines), setForm(callback) (l.211, 54 lines)
- [ ] `client/src/app/cache.js` — header; export docs: buildScopedCacheKey (l.1), readJsonCache (l.6), writeJsonCache (l.17), removeJsonCache (l.26), readCookie (l.36)
- [ ] `client/src/app/components/GeneratedPlanModal.jsx` — header; export docs: GeneratedPlanModal (l.4); present-tense rewrite: l.17
- [ ] `client/src/app/components/PlannerSetupModal.jsx` — header; export docs: PlannerSetupModal (l.61); section comments: PlannerSetupModal (l.61, 209 lines)
- [ ] `client/src/app/constants.js` — header; present-tense rewrite: l.7
- [ ] `client/src/app/dashboard.js` — header; export docs: defaultDashboardData (l.1), mergeOptimisticDashboard (l.16)
- [ ] `client/src/app/errorTracking.js` — export docs: initErrorTracking (l.27)
- [ ] `client/src/app/events.js` — header; export docs: createAppEventHandlers (l.41); section comments: onSubmit (l.95, 40 lines), openSignupWithPrefilledProfile (l.136, 41 lines), onAuthSubmit (l.210, 62 lines), submitWorkout (l.293, 56 lines), submitMealLog (l.524, 47 lines); present-tense rewrite: l.275, l.432
- [ ] `client/src/app/hooks/useApiClient.js` — header; export docs: useApiClient (l.5); section comments: useApiClient (l.5, 51 lines)
- [ ] `client/src/app/hooks/useDashboardData.js` — header; export docs: useDashboardData (l.14); effect comments: l.42, l.46, l.181, l.190, l.200, l.210, l.218, l.262, l.267, l.279; section comments: useCallback(callback) (l.126, 54 lines), useEffect(callback) (l.218, 43 lines)
- [ ] `client/src/app/hooks/useOptimisticLogs.js` — header; export docs: useOptimisticLogs (l.4); effect comments: l.43, l.135; section comments: useOptimisticLogs (l.4, 146 lines), useCallback(callback) (l.85, 47 lines)
- [ ] `client/src/app/network.js` — header; export docs: fetchWithTimeout (l.1)
- [ ] `client/src/app/plans.js` — header; export docs: parsePlanSections (l.3), extractLatestPlanByWeekday (l.53); section comments: parsePlanSections (l.3, 49 lines)
- [ ] `client/src/app/profileMapping.js` — move header to top; export docs: profileToPersonal (l.63)
- [ ] `client/src/app/routing.js` — header; export docs: resolveDashViewFromPath (l.3)
- [ ] `client/src/app/units.js` — header; export docs: splitFullName (l.3), getRegionFromLocale (l.17), getPreferredMeasurementSystem (l.31), getLocalDateKey (l.46), toCmFromFeetInches (l.54), toFeetInchesFromCm (l.64), toKg (l.77), toLb (l.84)
- [ ] `client/src/components/ModalPortal.jsx` — header; export docs: ModalPortal (l.5)
- [ ] `client/src/hooks/useBodyScrollLock.js` — header; export docs: useBodyScrollLock (l.10); effect comments: l.11
- [ ] `client/src/hooks/useCloseOnEscape.js` — move header to top
- [ ] `client/src/main.jsx` — move header to top
- [ ] `client/vite.config.js` — header; present-tense rewrite: l.53, l.56 (the "(#178)" story: keep what the floors guard against, drop the PR number and "used to")
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses 20 entries

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-client-shell
```

- [ ] **Step 2: Baseline, including the built bundle**

```bash
pr_scan 3 before
pr_counts pr3-before
pr_dist_snapshot
```

- [ ] **Step 3: Write the comments**

Follow the SOP's component, hook and plain-module checklists. The SOP's worked example is `App.jsx`'s `popstate` effect: `go` navigates with `pushState`, which fires no event, so back and forward are the only route changes that effect hears about.

`useDashboardData.js`'s ten effects are the densest block in the area. Give each its own line on what it keeps in sync, and why that dependency list.

- [ ] **Step 4: Prove the comments changed no code**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr3-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr3-same.txt"
pr_dist_same
pr_counts pr3-comments && diff "$SCRATCH/pr3-before-counts.txt" "$SCRATCH/pr3-comments-counts.txt"; echo "counts identical exit=$?"
```

Expected: `same-code exit=0`, `dist identical exit=0`, and `counts identical exit=0`. The `vite.config.js` edit is judged by `same-code`, since it is not part of the bundle.

- [ ] **Step 5: Shrink the allowlist**

```bash
pr_allowlist
npm run test:scripts > "$SCRATCH/pr3-scripts.txt" 2>&1; echo "test:scripts exit=$?"
```

Expected: numstat `0	20	…` and `exit=0`.

- [ ] **Step 6: Measure**

```bash
pr_scan 3 after
```

Expected: the **After** line.

- [ ] **Step 7: Commit**

```bash
git add -A client scripts/__tests__/file-header-allowlist.json && git status --porcelain
git commit -F - <<'EOF'
docs(client): comment the app shell, shared hooks and Vite config per the SOP

Comment-only: the built bundle is byte-identical, every file's syntax tree
is unchanged, and test counts match.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

No tidy items in this area.

- [ ] **Step 8: Gates and PR**

```bash
pr_gates
```

Expected: all `exit=0`, and `19 passed`. Then push and open the PR, with Before/After, the same-code result, `dist identical exit=0`, and the gates.

---

### Task 5: PR 4 — the dashboard page

**Branch:** `chore/readability-dashboard`

**Before:** `headers first 0/32 | exports documented 1/42 | effects commented 1/12 | long functions sectioned 10/34 | history comments 3 | literal constants in hooks/components 1 | byte-order marks 3`
**After:** `headers first 32/32 | exports documented 42/42 | effects commented 12/12 | long functions sectioned 34/34 | history comments 0 | literal constants in hooks/components 0 | byte-order marks 3`

**Files and what each needs:**

- [ ] `client/src/pages/dashboard/DashboardPage.jsx` — header; export docs: DashboardPage (l.41); effect comments: l.146; section comments: renderActiveDashboardView (l.220, 149 lines); tidy — to module scope: dashViewOrder (l.209)
- [ ] `client/src/pages/dashboard/components/DashboardAtAGlance.jsx` — header; export docs: DashboardAtAGlance (l.1); section comments: DashboardAtAGlance (l.1, 144 lines)
- [ ] `client/src/pages/dashboard/components/DashboardBottomNav.jsx` — header; export docs: DashboardBottomNav (l.9)
- [ ] `client/src/pages/dashboard/components/DashboardDrawer.jsx` — header; export docs: DashboardDrawer (l.3)
- [ ] `client/src/pages/dashboard/components/DashboardHeader.jsx` — header; export docs: DashboardHeader (l.1); section comments: DashboardHeader (l.1, 126 lines)
- [ ] `client/src/pages/dashboard/components/DashboardWorkoutModal.jsx` — header; export docs: DashboardWorkoutModal (l.3); section comments: DashboardWorkoutModal (l.3, 190 lines)
- [ ] `client/src/pages/dashboard/hooks/useDashboardMetrics.js` — header; export docs: useDashboardMetrics (l.119); section comments: useDashboardMetrics (l.119, 252 lines), useMemo(callback) (l.172, 188 lines); present-tense rewrite: l.26
- [ ] `client/src/pages/dashboard/meal/MealCoursePanel.jsx` — header; export docs: MealCoursePanel (l.1)
- [ ] `client/src/pages/dashboard/meal/MealDetailsModal.jsx` — header; export docs: MealDetailsModal (l.3); section comments: MealDetailsModal (l.3, 81 lines)
- [ ] `client/src/pages/dashboard/meal/MealLogPanel.jsx` — header; export docs: MealLogPanel (l.1); section comments: MealLogPanel (l.1, 156 lines)
- [ ] `client/src/pages/dashboard/meal/MealSearchPanel.jsx` — header; export docs: MealSearchPanel (l.1); section comments: MealSearchPanel (l.1, 50 lines)
- [ ] `client/src/pages/dashboard/meal/MealSections.jsx` — header; export docs: MealSections (l.1); section comments: MealSections (l.1, 55 lines)
- [ ] `client/src/pages/dashboard/meal/data/fallbackImage.js` — header (the file has a byte-order mark: the header goes after it)
- [ ] `client/src/pages/dashboard/meal/data/index.js` — header (byte-order mark)
- [ ] `client/src/pages/dashboard/meal/data/recommendations.js` — header (byte-order mark)
- [ ] `client/src/pages/dashboard/meal/useMealDbSearch.js` — header; export docs: useMealDbSearch (l.5); effect comments: l.20, l.75; section comments: useMealDbSearch (l.5, 154 lines), useEffect(callback) (l.20, 54 lines), loadRecommendationSections (l.23, 44 lines), useEffect(callback) (l.75, 47 lines)
- [ ] `client/src/pages/dashboard/meal/utils.js` — header; export docs: getCalorieBand (l.3), handleImageError (l.9), normalizeMealDbMeal (l.14), dedupeMeals (l.47)
- [ ] `client/src/pages/dashboard/planUtils.js` — header; export docs: detectTrack (l.88), getDailyCalories (l.102), buildWeeklyMealPlan (l.110)
- [ ] `client/src/pages/dashboard/settings/SettingsAccountPanel.jsx` — move header to top
- [ ] `client/src/pages/dashboard/settings/SettingsEditForm.jsx` — header; export docs: SettingsEditForm (l.8); section comments: renderField (l.44, 82 lines)
- [ ] `client/src/pages/dashboard/settings/settingsFields.js` — move header to top; export docs: fieldsForTab (l.54)
- [ ] `client/src/pages/dashboard/tips/ExerciseDetailsModal.jsx` — header; export docs: ExerciseDetailsModal (l.4)
- [ ] `client/src/pages/dashboard/tips/ExerciseTile.jsx` — header; export docs: ExerciseTile (l.3); section comments: ExerciseTile (l.3, 49 lines)
- [ ] `client/src/pages/dashboard/tips/recommendationUtils.js` — header; export docs: normalizeText (l.74), uniqueList (l.77), resolveMediaUrl (l.79), getExerciseImage (l.86), buildContextCategories (l.95), buildEquipmentKeywords (l.104), detectInjuryFlags (l.117), scoreExercise (l.126), buildGuideCards (l.214); section comments: scoreExercise (l.126, 87 lines), buildGuideCards (l.214, 69 lines)
- [ ] `client/src/pages/dashboard/views/CaloriesView.jsx` — header; export docs: CaloriesView (l.3); present-tense rewrite: l.25
- [ ] `client/src/pages/dashboard/views/DashboardHomeView.jsx` — header; export docs: DashboardHomeView (l.3)
- [ ] `client/src/pages/dashboard/views/MealView.jsx` — header; export docs: MealView (l.13); effect comments: l.140, l.149; section comments: MealView (l.13, 212 lines), useMemo(callback) (l.63, 49 lines)
- [ ] `client/src/pages/dashboard/views/PlansView.jsx` — header; export docs: PlansView (l.8); effect comments: l.45, l.150; section comments: useMemo(callback) (l.54, 85 lines), map(callback) (l.60, 68 lines)
- [ ] `client/src/pages/dashboard/views/SettingsView.jsx` — header; export docs: SettingsView (l.37); present-tense rewrite: l.54
- [ ] `client/src/pages/dashboard/views/SummaryView.jsx` — header; export docs: SummaryView (l.30)
- [ ] `client/src/pages/dashboard/views/TipsView.jsx` — header; export docs: TipsView (l.22); effect comments: l.49, l.56, l.60, l.90; section comments: useEffect(callback) (l.90, 42 lines)
- [ ] `client/src/pages/dashboard/views/WorkoutsView.jsx` — header; export docs: WorkoutsView (l.17); section comments: WorkoutsView (l.17, 241 lines)
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses 32 entries

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-dashboard
```

- [ ] **Step 2: Baseline, including the built bundle**

```bash
pr_scan 4 before
pr_counts pr4-before
pr_dist_snapshot
```

- [ ] **Step 3: Write the comments**

Follow the SOP's component and hook checklists.

- **The three meal `data/` files** start with a byte-order mark. Put the header after it, on what is then line 1. Step 6's `byte-order marks 3` checks that none was lost.
- **`CaloriesView.jsx:25`** records a real fix: the list guards used to disagree. Keep the present-tense point, that each list is narrowed once so both uses agree, and drop "used to".
- **Leave `useDashboardMetrics`' `caloriesByDate`, `last7Calories` and the other `{}`/`[]` values where they are.** They are accumulators filled in the memo. The scanner no longer lists them, for that reason.

- [ ] **Step 4: Prove the comments changed no code**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr4-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr4-same.txt"
pr_dist_same
pr_counts pr4-comments && diff "$SCRATCH/pr4-before-counts.txt" "$SCRATCH/pr4-comments-counts.txt"; echo "counts identical exit=$?"
```

Expected: `same-code exit=0`, `dist identical exit=0` and `counts identical exit=0`.

- [ ] **Step 5: Shrink the allowlist and commit the comments**

```bash
pr_allowlist
npm run test:scripts > "$SCRATCH/pr4-scripts.txt" 2>&1; echo "test:scripts exit=$?"
git add -A client scripts/__tests__/file-header-allowlist.json && git status --porcelain
git commit -F - <<'EOF'
docs(dashboard): comment the dashboard page per the SOP

Comment-only: the built bundle is byte-identical, every syntax tree is
unchanged, and test counts match.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

Expected: numstat `0	32	…`, `test:scripts exit=0` and `commit exit=0`.

- [ ] **Step 6: Tidy — `dashViewOrder` to module scope**

In `DashboardPage.jsx`, move the `dashViewOrder` array literal (about line 209, inside `DashboardPage`) to module scope, above `export default function DashboardPage`. Rename it `DASH_VIEW_ORDER`, the file's idiom for module constants, and update every use inside the component.

`git grep -n "dashViewOrder" -- client/src` must then show no remaining uses. `DashboardPage.test.jsx` may name it in a comment, which is fine.

```bash
pr_gates
pr_counts pr4-tidy && diff "$SCRATCH/pr4-before-counts.txt" "$SCRATCH/pr4-tidy-counts.txt"; echo "counts identical exit=$?"
pr_scan 4 after
```

Expected: every gate `exit=0`, `19 passed`, `counts identical exit=0`, and the **After** line.

```bash
git add -A client && git commit -F - <<'EOF'
refactor(dashboard): hoist the dashboard view order to module scope

A literal array rebuilt on every render; it depends on neither props nor
state. No behaviour change: all gates pass with unchanged test counts.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

- [ ] **Step 7: PR.** Push and open it with Before/After, both commits' proofs, and the gates.

---

### Task 6: PR 5 — the home page, including the physique silhouette

**Branch:** `chore/readability-home`

**Before:** `headers first 0/16 | exports documented 1/21 | effects commented 0/6 | long functions sectioned 3/24 | history comments 2 | literal constants in hooks/components 14 | import-order breaks 11 | byte-order marks 1`
**After:** `headers first 16/16 | exports documented 21/21 | effects commented 6/6 | long functions sectioned 24/24 | history comments 0 | literal constants in hooks/components 0 | import-order breaks 0 | byte-order marks 1`

**Files and what each needs:**

- [ ] `client/src/pages/home/HomePage.jsx` — header (byte-order mark: header after it); export docs: HomePage (l.12); section comments: HomePage (l.12, 230 lines); tidy — to module scope: trainingDayOptions (l.38), silhouetteViewHeight (l.61), silhouetteFloorInset (l.62), backBtnStyle (l.111), visualLabel (l.118); tidy — import order
- [ ] `client/src/pages/home/components/HomeIntroStage.jsx` — header; export docs: HomeIntroStage (l.3)
- [ ] `client/src/pages/home/components/HomePersonalStage.jsx` — header; export docs: HomePersonalStage (l.1); section comments: HomePersonalStage (l.1, 352 lines)
- [ ] `client/src/pages/home/components/HomeVisualizerStage.jsx` — header; export docs: HomeVisualizerStage (l.4); effect comments: l.15; section comments: HomeVisualizerStage (l.4, 61 lines)
- [ ] `client/src/pages/home/components/HomeWorkoutMeasure.jsx` — header; export docs: HomeWorkoutMeasure (l.1); section comments: HomeWorkoutMeasure (l.1, 61 lines)
- [ ] `client/src/pages/home/components/HomeWorkoutStage.jsx` — header; export docs: HomeWorkoutStage (l.1); section comments: HomeWorkoutStage (l.1, 66 lines)
- [ ] `client/src/pages/home/components/PhysiqueSilhouette2D.jsx` — header; export docs: PhysiqueSilhouette2D (l.11)
- [ ] `client/src/pages/home/components/physique/geometry.js` — header; export docs: buildPhysiqueSilhouetteGeometry (l.42); section comments: buildPhysiqueSilhouetteGeometry (l.42, 889 lines), pushMirrorLimbTrapezoidAnchors (l.357, 59 lines)
- [ ] `client/src/pages/home/components/physique/guideLayout.js` — header; export docs: appendDefaultGuides (l.3); section comments: appendDefaultGuides (l.3, 94 lines)
- [ ] `client/src/pages/home/components/physique/math.js` — header; export docs: clamp (l.1), mirrorX (l.3), interpolateBandWidth (l.20); present-tense rewrite: l.8
- [ ] `client/src/pages/home/components/physique/outlineGeometry.js` — header; export docs: buildSymmetricOutline (l.8); section comments: buildSymmetricOutline (l.8, 226 lines)
- [ ] `client/src/pages/home/components/physique/outlineUtils.js` — header; export docs: selectImportantSegmentPoints (l.10), simplifyPerimeterByImportance (l.49), buildSmoothClosedPath (l.102); section comments: simplifyPerimeterByImportance (l.49, 52 lines), buildSmoothClosedPath (l.102, 71 lines)
- [ ] `client/src/pages/home/components/physique/palette.js` — header; export docs: buildPhysiquePalette (l.3)
- [ ] `client/src/pages/home/components/physique/templateOutline.js` — header; export docs: buildTemplateOutline (l.472); section comments: parseTemplate (l.211, 44 lines), buildTemplateSizing (l.272, 43 lines), buildDerivedMetrics (l.316, 89 lines), buildScaleBands (l.406, 65 lines); present-tense rewrite: l.69; tidy — import order
- [ ] `client/src/pages/home/hooks/useBodyModel.js` — move header to top; export docs: useBodyModel (l.57); section comments: useBodyModel (l.57, 444 lines), useMemo(callback) (l.183, 288 lines); tidy — to module scope: the six lookup tables named `map` (l.109, l.120, l.130, l.145, l.158, l.170)
- [ ] `client/src/pages/home/hooks/useHomeStageFlow.js` — header; export docs: useHomeStageFlow (l.4); effect comments: l.408, l.447, l.461, l.477, l.493; section comments: useHomeStageFlow (l.4, 525 lines), transitionToStageFromTrigger (l.82, 238 lines), startMorphTimeline (l.233, 79 lines), onGetStarted (l.321, 86 lines); tidy — to module scope: stageOrder (l.30), unifiedAnimationMs (l.37), stageCrossfadeMs (l.38)
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses 16 entries

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-home
```

- [ ] **Step 2: Baseline, including the built bundle**

```bash
pr_scan 5 before
pr_counts pr5-before
pr_dist_snapshot
```

- [ ] **Step 3: Write the comments**

**`geometry.js`.** `buildPhysiqueSilhouetteGeometry` is one 889-line function, and `CLAUDE.md` asks for it to stay whole. Divide it with section comments at each change of subject:

- the fallback model and its clamps (say the units: SVG user units in a fixed-height view box)
- the torso anchors
- the limbs
- the head
- the outline assembly
- the palette

Also: the fallback table gets one line giving its units. The `CLAUDE.md` note on `buildTemplateSizing` belongs as a comment where the raw model value is read: the scales use the unclamped value, not the clamped local.

**`useHomeStageFlow.js`.** Group its 25 refs under one section comment, "DOM handles and pending timers", without moving them.

- [ ] **Step 4: Prove the comments changed no code, shrink the allowlist, commit**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr5-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr5-same.txt"
pr_dist_same
pr_counts pr5-comments && diff "$SCRATCH/pr5-before-counts.txt" "$SCRATCH/pr5-comments-counts.txt"; echo "counts identical exit=$?"
pr_allowlist
npm run test:scripts > "$SCRATCH/pr5-scripts.txt" 2>&1; echo "test:scripts exit=$?"
git add -A client scripts/__tests__/file-header-allowlist.json && git status --porcelain
git commit -F - <<'EOF'
docs(home): comment the home page and physique silhouette per the SOP

Comment-only: the built bundle is byte-identical, every syntax tree is
unchanged, and test counts match.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

Expected: `same-code exit=0`, `dist identical exit=0`, `counts identical exit=0`, numstat `0	16	…`, `test:scripts exit=0` and `commit exit=0`.

- [ ] **Step 5: Tidy**

**Module constants.** Move each listed literal to module scope, above the component or hook, with an UPPER_SNAKE name that says what it holds:

- **`useHomeStageFlow.js`:** `stageOrder` → `STAGE_ORDER`, `unifiedAnimationMs` → `UNIFIED_ANIMATION_MS`, `stageCrossfadeMs` → `STAGE_CROSSFADE_MS`.
- **`HomePage.jsx`:** `trainingDayOptions`, `silhouetteViewHeight`, `silhouetteFloorInset`, `backBtnStyle` and `visualLabel` → `TRAINING_DAY_OPTIONS`, `SILHOUETTE_VIEW_HEIGHT`, `SILHOUETTE_FLOOR_INSET`, `BACK_BUTTON_STYLE` and `VISUAL_LABEL`.
- **`useBodyModel.js`:** each of the six `map` tables gets a name for what it maps. Read the key it is indexed by: an activity level, a goal, a diet and so on, for example `ACTIVITY_LEVEL_FACTORS`. Before moving each one, confirm the memo neither mutates it nor builds it from a closure value. The scanner checked the first, and the second is the reason to read it.

**Import order in `HomePage.jsx`:** packages, then local modules, then `./HomePage.css` last. Keep the byte-order mark as the first byte. Check with:

```bash
node -e "console.log(require('fs').readFileSync('client/src/pages/home/HomePage.jsx','utf8').charCodeAt(0) === 0xfeff)"
```

It must print `true`.

**Import order in `templateOutline.js`:** the same order.

Then run the gates and measure:

```bash
pr_gates
pr_counts pr5-tidy && diff "$SCRATCH/pr5-before-counts.txt" "$SCRATCH/pr5-tidy-counts.txt"; echo "counts identical exit=$?"
pr_scan 5 after
```

Expected: every gate `exit=0`, `19 passed`, `counts identical exit=0`, and the **After** line.

```bash
git add -A client && git commit -F - <<'EOF'
refactor(home): hoist literal tables to module scope and order imports

Values that depend on neither props nor state are built once at module
scope under names that say what they hold. No behaviour change: all
gates pass with unchanged test counts.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

- [ ] **Step 6: PR.** Push and open it with Before/After, both proofs, and the gates.

---

### Task 7: PR 6 — the preview walkthrough, auth and workout-result pages

**Branch:** `chore/readability-preview`

**Before:** `headers first 0/13 | exports documented 0/20 | effects commented 1/7 | long functions sectioned 10/20 | history comments 2 | literal constants in hooks/components 2 | import-order breaks 2`
**After:** `headers first 13/13 | exports documented 20/20 | effects commented 7/7 | long functions sectioned 20/20 | history comments 0 | literal constants in hooks/components 0 | import-order breaks 0`

**Files and what each needs:**

- [ ] `client/src/pages/auth/AuthPage.jsx` — header; export docs: AuthPage (l.4); section comments: AuthPage (l.4, 394 lines); tidy — import order
- [ ] `client/src/pages/home/preview/PreviewStage.jsx` — header; export docs: PreviewStage (l.13); effect comments: l.150, l.159, l.163; present-tense rewrite: l.124
- [ ] `client/src/pages/home/preview/components/PreviewDashboardChapter.jsx` — header; export docs: PreviewDashboardChapter (l.3); section comments: PreviewDashboardChapter (l.3, 280 lines)
- [ ] `client/src/pages/home/preview/components/PreviewPersonalChapter.jsx` — header; export docs: PreviewPersonalChapter (l.3); section comments: PreviewPersonalChapter (l.3, 270 lines)
- [ ] `client/src/pages/home/preview/components/PreviewToc.jsx` — header; export docs: PreviewToc (l.1); section comments: PreviewToc (l.1, 40 lines)
- [ ] `client/src/pages/home/preview/components/PreviewWorkoutWeekChapter.jsx` — header; export docs: PreviewWorkoutWeekChapter (l.3); section comments: PreviewWorkoutWeekChapter (l.3, 170 lines)
- [ ] `client/src/pages/home/preview/constants.js` — header; export docs: createDefaultPreviewWeekLineOffsets (l.77)
- [ ] `client/src/pages/home/preview/hooks/usePreviewChapterFlow.js` — header; export docs: usePreviewChapterFlow (l.25); effect comments: l.53; section comments: forEach(callback) (l.249, 69 lines), setTimeout(callback) (l.251, 43 lines)
- [ ] `client/src/pages/home/preview/hooks/usePreviewDerivedData.js` — header; export docs: usePreviewDerivedData (l.16); section comments: useMemo(callback) (l.206, 161 lines); present-tense rewrite: l.467; tidy — to module scope: trainingTemplates (l.153), trainingExerciseTemplates (l.161)
- [ ] `client/src/pages/home/preview/hooks/usePreviewWeekOutline.js` — header; export docs: usePreviewWeekOutline (l.4); effect comments: l.10
- [ ] `client/src/pages/home/preview/hooks/usePreviewWeekParticleAnimation.js` — header; export docs: usePreviewWeekParticleAnimation (l.20); effect comments: l.60; section comments: forEach(callback) (l.126, 53 lines), forEach(callback) (l.180, 66 lines)
- [ ] `client/src/pages/home/preview/utils.js` — header; export docs: normalizePreviewTrainingDay (l.8), getRegionFromLocale (l.16), clamp (l.30), roundTo (l.32), getPreviewTypingStepMs (l.37), randomBetween (l.43), buildPreviewLinePath (l.45), getPreviewWeekdayName (l.61)
- [ ] `client/src/pages/workout-result/WorkoutResultPage.jsx` — header; export docs: WorkoutResultPage (l.5); tidy — import order
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses 13 entries

Two of `utils.js`'s exports, `getRegionFromLocale` and `buildPreviewLinePath`, are removed in PR 10. Document them here anyway, in one line each: the ratchet and the scan run per PR.

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-preview
```

- [ ] **Step 2: Baseline, including the built bundle**

```bash
pr_scan 6 before
pr_counts pr6-before
pr_dist_snapshot
```

- [ ] **Step 3: Write the comments**

**The walkthrough is a timed state machine.** `usePreviewChapterFlow`'s header should say so: each chapter plays a timed sequence and then advances by itself. That is the first thing a reader needs, and it is what made the PR 11 screenshots need a frozen clock.

**`usePreviewDerivedData.js`'s guards stay.** `CLAUDE.md` records its double-guarded fallbacks as dead but deliberately left. Do not remove them, and do not comment each one. One comment at the top of the block that builds `activePreviewProfile` covers them: every field is non-empty after it, so the later `|| JOHN_DOE_PREVIEW_PROFILE.x` guards cannot fire.

- [ ] **Step 4: Prove the comments changed no code, shrink the allowlist, commit**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr6-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr6-same.txt"
pr_dist_same
pr_counts pr6-comments && diff "$SCRATCH/pr6-before-counts.txt" "$SCRATCH/pr6-comments-counts.txt"; echo "counts identical exit=$?"
pr_allowlist
npm run test:scripts > "$SCRATCH/pr6-scripts.txt" 2>&1; echo "test:scripts exit=$?"
git add -A client scripts/__tests__/file-header-allowlist.json && git status --porcelain
git commit -F - <<'EOF'
docs(preview): comment the walkthrough, auth and workout-result pages per the SOP

Comment-only: the built bundle is byte-identical, every syntax tree is
unchanged, and test counts match.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

Expected: every check `exit=0`, and numstat `0	13	…`.

- [ ] **Step 5: Tidy**

**Module constants.** In `usePreviewDerivedData.js`, move `trainingTemplates` and `trainingExerciseTemplates` out of the `useMemo` callback to module scope, as `TRAINING_TEMPLATES` and `TRAINING_EXERCISE_TEMPLATES`. First confirm the callback does not write into them.

**Import order.** In `AuthPage.jsx` and `WorkoutResultPage.jsx`: packages, then local modules, then styles.

Then run the gates and measure:

```bash
pr_gates
pr_counts pr6-tidy && diff "$SCRATCH/pr6-before-counts.txt" "$SCRATCH/pr6-tidy-counts.txt"; echo "counts identical exit=$?"
pr_scan 6 after
```

Expected: every gate `exit=0`, `19 passed`, `counts identical exit=0`, and the **After** line.

```bash
git add -A client && git commit -F - <<'EOF'
refactor(preview): hoist the training templates and order imports

No behaviour change: all gates pass with unchanged test counts.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

- [ ] **Step 6: PR.** Push and open it with Before/After, both proofs, and the gates.

---

### Task 8: PR 7 — CSS: global, planner, dashboard, auth, workout-result

**Branch:** `chore/readability-css-app`

**Before:** `headers first 0/25 | CSS top-level banners 1 | byte-order marks 13`
**After:** `headers first 25/25 | byte-order marks 13`, and every file of eight or more top-level blocks divided by banners.

**Files and what each needs:**

- [ ] `client/src/app/styles/planner/base.css` — header; section banners (42 top-level blocks)
- [ ] `client/src/app/styles/planner/interactions.css` — header; section banners (31)
- [ ] `client/src/app/styles/planner/motion.css` — header
- [ ] `client/src/app/styles/planner/responsive.css` — header
- [ ] `client/src/pages/auth/AuthPage.css` — header; section banners (49)
- [ ] `client/src/pages/dashboard/DashboardPage.css` — header
- [ ] `client/src/pages/dashboard/settings/SettingsAccountPanel.css` — header
- [ ] `client/src/pages/dashboard/styles/glance-loading.css` — header; section banners (20)
- [ ] `client/src/pages/dashboard/styles/navigation.css` — header; section banners (22)
- [ ] `client/src/pages/dashboard/styles/responsive.css` — header
- [ ] `client/src/pages/dashboard/styles/theme.css` — header; section banners (70)
- [ ] `client/src/pages/dashboard/styles/toast.css` — header; section banners (9, one exists)
- [ ] `client/src/pages/dashboard/styles/workout-modal.css` — header; section banners (33)
- [ ] `client/src/pages/dashboard/views/CaloriesView.css` — header; section banners (22)
- [ ] `client/src/pages/dashboard/views/DashboardHomeView.css` — header
- [ ] `client/src/pages/dashboard/views/MealView.css` — header; section banners (54)
- [ ] `client/src/pages/dashboard/views/PlansView.css` — header; section banners (34)
- [ ] `client/src/pages/dashboard/views/SettingsView.css` — header; section banners (14)
- [ ] `client/src/pages/dashboard/views/SummaryView.css` — header; section banners (53)
- [ ] `client/src/pages/dashboard/views/TipsView.css` — header; section banners (46)
- [ ] `client/src/pages/dashboard/views/WorkoutsView.css` — header; section banners (11)
- [ ] `client/src/pages/workout-result/WorkoutResultPage.css` — header; section banners (24)
- [ ] `client/src/styles/app.css` — header
- [ ] `client/src/styles/base.css` — header; section banners (57)
- [ ] `client/src/styles/index.css` — header
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses 25 entries

- [ ] **Step 1: Branch and baseline**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-css-app
pr_scan 7 before
pr_counts pr7-before
pr_dist_snapshot
```

- [ ] **Step 2: Write the headers and banners**

Follow the SOP's "Stylesheet" checklist and its CSS formats.

- **Byte-order marks.** 13 of these files start with one, and the header goes after it.
- **Import-only files.** For a file that only `@import`s others, such as `DashboardPage.css` and `styles/app.css`, the header says what the imported files are, and that their order is the cascade order.
- **Banners.** Each `@media` block and each group of `@keyframes` gets a banner of its own. `theme.css` defines the dashboard's custom properties, so its first banner is "Tokens".
- **Never move or change a rule.**

- [ ] **Step 3: Prove the comments changed no code**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr7-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr7-same.txt"
pr_dist_same
pr_counts pr7-comments && diff "$SCRATCH/pr7-before-counts.txt" "$SCRATCH/pr7-comments-counts.txt"; echo "counts identical exit=$?"
pr_scan 7 after
```

Expected:

- `same-code exit=0`. Its CSS check fails any comment written inside a declaration value.
- `dist identical exit=0` and `counts identical exit=0`.
- The **After** line, including `byte-order marks 13`.

- [ ] **Step 4: Shrink the allowlist, commit, gates, PR**

```bash
pr_allowlist
npm run test:scripts > "$SCRATCH/pr7-scripts.txt" 2>&1; echo "test:scripts exit=$?"
git add -A client scripts/__tests__/file-header-allowlist.json && git status --porcelain
git commit -F - <<'EOF'
docs(css): headers and section banners for the app, dashboard and auth styles

Comment-only: the built CSS is byte-identical, postcss finds the same
rules and declarations in every file, and no byte-order mark was lost.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
pr_gates
```

Expected: numstat `0	25	…`, and every check `exit=0`. Push and open the PR.

---

### Task 9: PR 8 — CSS: home and preview

**Branch:** `chore/readability-css-home`

**Before:** `headers first 0/24 | CSS top-level banners 5 | byte-order marks 6`
**After:** `headers first 24/24 | byte-order marks 6`

**Files and what each needs:**

- [ ] `client/src/pages/home/HomePage.css` — header
- [ ] `client/src/pages/home/preview/PreviewStage.css` — header
- [ ] `client/src/pages/home/preview/styles/form-overrides.css` — header; section banners (9)
- [ ] `client/src/pages/home/preview/styles/layout.css` — header
- [ ] `client/src/pages/home/preview/styles/layout/base.css` — header; section banners (12, one exists)
- [ ] `client/src/pages/home/preview/styles/layout/dashboard.css` — header; section banners (50)
- [ ] `client/src/pages/home/preview/styles/layout/frame.css` — header; section banners (22, two exist)
- [ ] `client/src/pages/home/preview/styles/layout/header.css` — header; section banners (8)
- [ ] `client/src/pages/home/preview/styles/layout/toc.css` — header; section banners (20)
- [ ] `client/src/pages/home/preview/styles/personal.css` — header; section banners (55, one exists)
- [ ] `client/src/pages/home/preview/styles/responsive.css` — header
- [ ] `client/src/pages/home/preview/styles/workout-week.css` — header
- [ ] `client/src/pages/home/preview/styles/workout-week/animations.css` — header; section banners (9)
- [ ] `client/src/pages/home/preview/styles/workout-week/break-apart.css` — header; section banners (34)
- [ ] `client/src/pages/home/preview/styles/workout-week/content.css` — header; section banners (21)
- [ ] `client/src/pages/home/preview/styles/workout-week/structure.css` — header; section banners (26)
- [ ] `client/src/pages/home/preview/styles/workout-week/table-base.css` — header
- [ ] `client/src/pages/home/styles/core.css` — header
- [ ] `client/src/pages/home/styles/core/layout.css` — header; section banners (43, one exists)
- [ ] `client/src/pages/home/styles/core/personal.css` — header; section banners (40)
- [ ] `client/src/pages/home/styles/core/preview.css` — **header only** (see Step 2)
- [ ] `client/src/pages/home/styles/core/shell.css` — header; section banners (26)
- [ ] `client/src/pages/home/styles/forms-and-motion.css` — header; section banners (51)
- [ ] `client/src/pages/home/styles/responsive.css` — header
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses 24 entries

- [ ] **Step 1: Branch and baseline**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-css-home
pr_scan 8 before
pr_counts pr8-before
pr_dist_snapshot
```

- [ ] **Step 2: Write the headers and banners**

Follow the SOP's "Stylesheet" checklist. Six of these files start with a byte-order mark.

**`core/preview.css` gets a header and no banners.** PR 11 deletes 47 of its 62 walkthrough rules, and PR 12 deletes the file. The header states what is true now:

```css
/* Walkthrough styles loaded by the home page through core.css. Most rules here
   match no rendered element, and the rest are also defined in
   home/preview/styles/, which loads later and wins where the two conflict. */
```

Before committing that sentence, confirm its last clause from the built CSS, as in Task 13, Step 3.

- [ ] **Step 3: Prove the comments changed no code**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr8-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr8-same.txt"
pr_dist_same
pr_counts pr8-comments && diff "$SCRATCH/pr8-before-counts.txt" "$SCRATCH/pr8-comments-counts.txt"; echo "counts identical exit=$?"
pr_scan 8 after
```

Expected: `same-code exit=0`, `dist identical exit=0`, `counts identical exit=0`, and the **After** line with `byte-order marks 6`.

- [ ] **Step 4: Shrink the allowlist, commit, gates, PR**

```bash
pr_allowlist
npm run test:scripts > "$SCRATCH/pr8-scripts.txt" 2>&1; echo "test:scripts exit=$?"
git add -A client scripts/__tests__/file-header-allowlist.json && git status --porcelain
git commit -F - <<'EOF'
docs(css): headers and section banners for the home page and walkthrough styles

Comment-only: the built CSS is byte-identical, postcss finds the same
rules and declarations in every file, and no byte-order mark was lost.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
pr_gates
```

Expected: numstat `0	24	…`, and every check `exit=0`. Push and open the PR.

---

### Task 10: PR 9 — tooling: `scripts/`, root configs

**Branch:** `chore/readability-tooling`

**Before:** `headers first 3/12 | exports documented 5/11 | long functions sectioned 6/7 | history comments 2`
**After:** `headers first 12/12 | exports documented 11/11 | long functions sectioned 7/7 | history comments 0`, and **the allowlist is empty**.

**Files and what each needs:**

- [ ] `eslint.config.js` — move header to top (judge it: see Conventions)
- [ ] `playwright.config.js` — move header to top (judge it)
- [ ] `scripts/check-audit-allowlist.mjs` — export docs: checkAdvisoryReviews (l.33)
- [ ] `scripts/codex-handoff.mjs` — header
- [ ] `scripts/codex-handoff/context-score.mjs` — header; export docs: scoreContext (l.3)
- [ ] `scripts/codex-handoff/file-suggest.mjs` — header; export docs: suggestFiles (l.65)
- [ ] `scripts/codex-handoff/workflow-select.mjs` — header; export docs: detectRepairLanguage (l.8), buildCodexPrompt (l.45), selectWorkflow (l.77); section comments: selectWorkflow (l.77, 42 lines)
- [ ] `scripts/scrub-junk-files.cjs` — move header to top; present-tense rewrite: l.4 (the "Guard 3 used to be…" paragraph)
- [ ] `scripts/setup-git-config.mjs` — present-tense rewrite: l.2 ("Both used to be documented steps in CLAUDE.md")
- [ ] `scripts/skill-router.mjs` — header
- [ ] `vitest.config.js` — move header to top (judge it)
- [ ] `scripts/__tests__/file-header-allowlist.json` — loses its last 9 entries

- [ ] **Step 1: Branch and baseline**

```bash
git switch main && git pull --ff-only && git switch -c chore/readability-tooling
pr_scan 9 before
pr_counts pr9-before
```

- [ ] **Step 2: Write the comments**

The three hook scripts (`codex-handoff.mjs`, `scrub-junk-files.cjs`, `skill-router.mjs`) are invoked from `.claude/settings.json`. Each header should say so, and name the hook event that runs it. That is what knip cannot see and why `knip.jsonc` declares them as entry points.

- [ ] **Step 3: Prove the comments changed no code, and the hooks still run**

```bash
node "$TOOLS/same-code.mjs" "$REPO" > "$SCRATCH/pr9-same.txt" 2>&1; echo "same-code exit=$?"; tail -2 "$SCRATCH/pr9-same.txt"
node scripts/codex-handoff.mjs --hook > /dev/null 2>&1; echo "codex-handoff exit=$?"
node scripts/scrub-junk-files.cjs --dry-run > /dev/null 2>&1; echo "scrub exit=$?"
pr_counts pr9-comments && diff "$SCRATCH/pr9-before-counts.txt" "$SCRATCH/pr9-comments-counts.txt"; echo "counts identical exit=$?"
pr_scan 9 after
```

Expected: every exit `0`, and the **After** line.

- [ ] **Step 4: Empty the allowlist, commit, gates, PR**

```bash
pr_allowlist
cat scripts/__tests__/file-header-allowlist.json
npm run test:scripts > "$SCRATCH/pr9-scripts.txt" 2>&1; echo "test:scripts exit=$?"
```

Expected: `wrote 0 entries`, the file contains `[]`, and `test:scripts exit=0`.

The ratchet stays. With an empty list, its first assertion now covers every source file, and the other two guard against anyone re-adding an entry. Leave the file as `[]` rather than deleting it. Deleting it would also mean deleting two of the ratchet's tests, which is a separate decision.

```bash
git add -A scripts eslint.config.js playwright.config.js vitest.config.js && git status --porcelain
git commit -F - <<'EOF'
docs(tooling): comment the repo scripts and root configs per the SOP

Comment-only: every syntax tree is unchanged, the hook scripts still exit
0, and test counts match. Empties the header allowlist: every in-scope
source file now opens with a header.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
pr_gates
```

Push and open the PR.

---

### Task 11: PR 10 — duplicated helpers

**Branch:** `refactor/shared-helpers`

**Files:**

- Modify: `server/src/repositories/rowValues.js` — gains `toJsonArray` and `toJsonObject`
- Create: `server/src/repositories/__tests__/rowValues.test.js`
- Modify: `generatedPlanRepository.js`, `savedExerciseRepository.js`, `workoutSessionRepository.js`, `userReadRepository.js`, `userRepository.js` — import them instead of defining them
- Create: `client/src/app/linePath.js`, `client/src/app/__tests__/linePath.test.js`
- Modify: `client/src/pages/dashboard/hooks/useDashboardMetrics.js`, `client/src/pages/home/preview/utils.js`, `client/src/pages/home/preview/components/PreviewDashboardChapter.jsx`, `client/src/pages/home/preview/hooks/usePreviewDerivedData.js`, `client/src/pages/home/preview/__tests__/utils.test.js`
- Modify: `client/src/pages/dashboard/views/WorkoutsView.jsx` — rename only

**Left alone, and why** (verified on 2026-09-29):

- **`cleanText`:** the default length differs, 500 in `db/postgres.js` and 120 in the builders.
- **`validateQuery`/`validateParams`:** the third argument differs.
- **`parseDateValue`:** the contract differs. See Findings §2.
- **`clamp` and `roundTo`:** one-liners.
- **`toProfileNumber`, and `useBodyModel`'s `toFiniteNumber`:** both are rows in `numericCoercion.contract.test.js`.
- **`normalizeText`/`uniqueList`:** client and server have no shared module.

- [ ] **Step 1: Branch and baseline**

```bash
git switch main && git pull --ff-only && git switch -c refactor/shared-helpers
pr_counts pr10-before
```

- [ ] **Step 2: Write the failing server test**

Create `server/src/repositories/__tests__/rowValues.test.js`:

```js
/**
 * Pins the JSON-column readers every repository shares. A JSON column can hold
 * anything, so each reader turns whatever is stored into the shape its mapper
 * expects, and anything else into an empty value rather than a crash.
 */
import { describe, expect, test } from "vitest";
import { toJsonArray, toJsonObject } from "../rowValues.js";

describe("toJsonArray", () => {
  test("passes an array through unchanged", () => {
    const value = [1, "two"];
    expect(toJsonArray(value)).toBe(value);
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a JSON-looking string", "[1]"],
    ["zero", 0],
    ["a plain object", {}],
    ["an array-like object", { length: 1 }]
  ])("reads %s as an empty array", (_label, value) => {
    expect(toJsonArray(value)).toEqual([]);
  });
});

describe("toJsonObject", () => {
  test("passes a plain object through unchanged", () => {
    const value = { a: 1 };
    expect(toJsonObject(value)).toBe(value);
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a JSON-looking string", "{}"],
    ["zero", 0],
    ["an empty array", []],
    ["an array", [1]]
  ])("reads %s as an empty object", (_label, value) => {
    expect(toJsonObject(value)).toEqual({});
  });
});
```

```bash
npm -w server exec vitest run src/repositories/__tests__/rowValues.test.js > "$SCRATCH/pr10-red.txt" 2>&1; echo "exit=$?"; tail -8 "$SCRATCH/pr10-red.txt"
```

Expected: `exit=1`, with the import failing: `toJsonArray` is not exported.

- [ ] **Step 3: Implement**

Append to `server/src/repositories/rowValues.js`:

```js
/** A JSON column read as an array: anything that is not one reads as empty. */
export const toJsonArray = (value) => (Array.isArray(value) ? value : []);

/** A JSON column read as a plain object: arrays, null and scalars read as empty. */
export const toJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
```

Extend its header, written in PR 2, so the list reads: "…dates to ISO strings and date-only keys, Decimal columns to numbers, and JSON columns to arrays and objects."

```bash
npm -w server exec vitest run src/repositories/__tests__/rowValues.test.js > "$SCRATCH/pr10-green.txt" 2>&1; echo "exit=$?"; tail -4 "$SCRATCH/pr10-green.txt"
```

Expected: `exit=0`, 16 tests passed.

- [ ] **Step 4: Replace the six copies**

In each file below, delete the local definition and extend the existing `rowValues.js` import:

| File                          | Delete                                                            | Import line becomes                                                                                |
| ----------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `generatedPlanRepository.js`  | `const toJsonArray = …`                                           | `import { toIso, toJsonArray } from "./rowValues.js";`                                             |
| `savedExerciseRepository.js`  | `const toJsonArray = …`                                           | `import { toIso, toJsonArray } from "./rowValues.js";`                                             |
| `workoutSessionRepository.js` | `const toJsonArray = …`                                           | `import { dateOnlyToDate, toDateOnly, toIso, toJsonArray, toNumberOrNull } from "./rowValues.js";` |
| `userReadRepository.js`       | `const toJsonArray = …` and the two-line `const toJsonObject = …` | `import { toDateOnly, toIso, toJsonArray, toJsonObject } from "./rowValues.js";`                   |
| `userRepository.js`           | the two-line `const toJsonObject = …`                             | `import { dateOnlyToDate, toJsonObject } from "./rowValues.js";`                                   |

```bash
git grep -nE "const toJson(Array|Object) =" -- server/src; echo "grep exit=$? (1 = only rowValues.js exports them)"
git grep -nE "export const toJson(Array|Object)" -- server/src
```

Expected: `grep exit=1` for the first, and two lines, both in `rowValues.js`, for the second.

- [ ] **Step 5: The client line path, test first**

Create `client/src/app/__tests__/linePath.test.js`, holding the `buildPreviewLinePath` block from `client/src/pages/home/preview/__tests__/utils.test.js` (its five tests) renamed to `buildLinePath`:

```js
/**
 * Pins buildLinePath, the SVG path builder the dashboard's charts and the
 * walkthrough's dashboard chapter both draw with.
 */
import { describe, expect, test } from "vitest";
import { buildLinePath } from "../linePath";

describe("buildLinePath", () => {
  test("starts with a move command and continues with lines", () => {
    const path = buildLinePath([1, 2, 3]);

    expect(path.startsWith("M")).toBe(true);
    expect((path.match(/L/g) || []).length).toBe(2);
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  test("produces one point per value", () => {
    expect(buildLinePath([1, 2, 3, 4]).split(" ")).toHaveLength(4);
  });

  test("handles an empty series without dividing by zero", () => {
    const path = buildLinePath([]);

    expect(path).not.toMatch(/NaN|Infinity/);
    expect(path.startsWith("M")).toBe(true);
  });

  test("handles a single value and a flat series", () => {
    expect(buildLinePath([5])).not.toMatch(/NaN/);
    // A flat series has zero range; the guard keeps it from dividing by zero.
    expect(buildLinePath([4, 4, 4])).not.toMatch(/NaN/);
  });

  test("keeps points inside the requested box", () => {
    const width = 200;
    const height = 80;
    const padding = 10;
    const path = buildLinePath([3, 9, 1, 7], width, height, padding);

    path.split(" ").forEach((command) => {
      const [x, y] = command.slice(1).split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(padding - 0.001);
      expect(x).toBeLessThanOrEqual(width - padding + 0.001);
      expect(y).toBeGreaterThanOrEqual(padding - 0.001);
      expect(y).toBeLessThanOrEqual(height - padding + 0.001);
    });
  });
});
```

```bash
npm -w client exec vitest run src/app/__tests__/linePath.test.js > "$SCRATCH/pr10-client-red.txt" 2>&1; echo "exit=$?"
```

Expected: `exit=1` (`../linePath` does not exist).

Create `client/src/app/linePath.js`. This is the body both copies shared, character for character:

```js
/**
 * The SVG path both the dashboard's charts and the walkthrough's dashboard
 * chapter draw their line series with.
 */

/**
 * An SVG path ("M x,y L x,y …") through `values`, scaled into a
 * width × height box inset by `padding`. An empty series draws a single point,
 * and a flat one a horizontal line, rather than dividing by zero.
 */
export const buildLinePath = (values, width = 260, height = 110, padding = 10) => {
  const safeValues = values.length ? values : [0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / Math.max(safeValues.length - 1, 1);

  return safeValues
    .map((value, index) => {
      const x = padding + stepX * index;
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
};
```

```bash
npm -w client exec vitest run src/app/__tests__/linePath.test.js > "$SCRATCH/pr10-client-green.txt" 2>&1; echo "exit=$?"
```

Expected: `exit=0`, 5 passed.

Then remove the two copies:

- **`useDashboardMetrics.js`:** delete the private `const buildLinePath = …` (about lines 103–117). Add `import { buildLinePath } from "../../../app/linePath";` after its `planUtils` import. It still returns `buildLinePath` from the hook, so its callers and its own tests are unchanged.
- **`home/preview/utils.js`:** delete `export const buildPreviewLinePath = …`.
- **`PreviewDashboardChapter.jsx`:** line 1 becomes `import { buildLinePath } from "../../../../app/linePath";`, and `buildPreviewLinePath(series)` becomes `buildLinePath(series)`.
- **`home/preview/__tests__/utils.test.js`:** delete the `describe("buildPreviewLinePath", …)` block, and `buildPreviewLinePath,` from its import list.

- [ ] **Step 6: `getRegionFromLocale`**

`client/src/app/__tests__/units.test.js` already pins everything the walkthrough's copy's tests do, and more strictly: it requires `""` for a bare language, where the walkthrough test accepted any string.

- **`home/preview/utils.js`:** delete `export const getRegionFromLocale = …`.
- **`usePreviewDerivedData.js`:** remove `getRegionFromLocale,` from its `../utils` import, and add `import { getRegionFromLocale } from "../../../../app/units";` after that import.
- **`home/preview/__tests__/utils.test.js`:** delete the `describe("getRegionFromLocale", …)` block and `getRegionFromLocale,` from its imports.

- [ ] **Step 7: Rename `WorkoutsView`'s `parseDateValue`**

In `client/src/pages/dashboard/views/WorkoutsView.jsx`, rename the function and both its uses in `sortByDateDesc`, and put this summary above it:

```js
/** A row's date as a sortable timestamp; a missing or unparseable date sorts as 0, last. */
const toSortTime = (value) => {
```

- [ ] **Step 8: Verify**

```bash
git grep -nE "buildPreviewLinePath|getRegionFromLocale = |parseDateValue" -- client/src ':!*.test.*'
```

Expected: only `useDashboardMetrics.js`'s own `parseDateValue` remains.

```bash
pr_gates
pr_counts pr10-after; cat "$SCRATCH/pr10-before-counts.txt"
```

Expected: every gate `exit=0`, and `19 passed`. The test counts change by design:

- server `+16` (the new `rowValues` tests)
- client `+5 −5` for the line path, which moved rather than being lost
- client `−3` for the walkthrough's `getRegionFromLocale` tests, now covered by `units.test.js`

State all three in the PR. The ratchet requires `linePath.js` to open with a header, which it does.

- [ ] **Step 9: Commit and PR**

```bash
git add -A client server && git status --porcelain
git commit -F - <<'EOF'
refactor: one copy of each duplicated helper

toJsonArray and toJsonObject move into rowValues.js with their own tests,
replacing four and two private copies. The line-path builder the dashboard
and the walkthrough each carried becomes client/src/app/linePath.js, and
the walkthrough's copy of getRegionFromLocale goes in favour of app/units.
WorkoutsView's parseDateValue is renamed toSortTime: it shared a name with
useDashboardMetrics' function but not its contract.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

Push and open the PR, with the gates and the three test-count changes explained.

---

### Task 12: PR 11 — dead CSS

**Branch:** `chore/remove-dead-css`

**Files:**

- Create (scratch): `$TOOLS/css-sweep.mjs`, `$TOOLS/capture.mjs`
- Modify: every stylesheet the sweep names. As of 2026-09-29:
  - `home/styles/core/preview.css`, `home/styles/responsive.css`, `home/styles/forms-and-motion.css`
  - `home/preview/styles/form-overrides.css`, `layout/dashboard.css`, `layout/header.css`, `home/preview/styles/responsive.css`
  - `dashboard/views/WorkoutsView.css`, `dashboard/styles/theme.css`

- [ ] **Step 1: Branch**

```bash
git switch main && git pull --ff-only && git switch -c chore/remove-dead-css
```

- [ ] **Step 2: Write `$TOOLS/css-sweep.mjs`**

```js
/**
 * Dead-CSS candidates for PR 11. Lists every class used in a stylesheet
 * selector that no non-test JS/JSX/HTML file names, either as a whole token in
 * a string or template literal, or as the literal prefix of a template-built
 * class (`stage-${x}` could produce "stage-forward", so that class is reported
 * as "maybe dynamic", not as dead). A candidate is a lead: each one is
 * confirmed by hand before anything is deleted.
 *
 * Usage: node css-sweep.mjs <repoRoot>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.argv[2] || "D:/ai-workout";
const require = createRequire(path.join(root, "package.json"));
const postcss = require("postcss");
const espree = require("espree");

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const isTest = (f) => /\.(test|spec)\.|(^|\/)__tests__\//.test(f);
const code = tracked.filter(
  (f) => f.startsWith("client/") && /\.(js|jsx|html)$/.test(f) && !isTest(f)
);
const sheets = tracked.filter((f) => f.startsWith("client/") && f.endsWith(".css"));

// Every whole token in every string and template quasi, and every quasi that
// ends in a partial class (the literal text right before a ${...}).
const tokens = new Set();
const prefixes = new Set();
const addText = (text) => text.split(/[\s"'`]+/).forEach((t) => t && tokens.add(t));
for (const file of code) {
  const text = readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");
  if (file.endsWith(".html")) {
    addText(text.replace(/[<>=]/g, " "));
    continue;
  }
  const ast = espree.parse(text, {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true }
  });
  // A template inside key, id, htmlFor, aria-* or data-* builds something that
  // is never a class (`key={`preview-${day}`}` once made every preview-* class
  // look possibly generated), so its prefixes are not collected.
  const NOT_A_CLASS = /^(key|id|htmlFor|aria-.*|data-.*)$/;
  const walk = (node, inNonClassAttr) => {
    if (!node || typeof node.type !== "string") return;
    const nonClass =
      inNonClassAttr || (node.type === "JSXAttribute" && NOT_A_CLASS.test(node.name?.name ?? ""));
    if (node.type === "Literal" && typeof node.value === "string") addText(node.value);
    if (node.type === "JSXText") addText(node.value);
    if (node.type === "TemplateLiteral")
      node.quasis.forEach((q, i) => {
        const raw = q.value.cooked ?? q.value.raw;
        addText(raw);
        if (!nonClass && i < node.quasis.length - 1) {
          const tail = raw.split(/\s+/).pop();
          if (tail) prefixes.add(tail);
        }
      });
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach((c) => walk(c, nonClass));
      else if (v && typeof v.type === "string") walk(v, nonClass);
    }
  };
  walk(ast, false);
}

const candidates = new Map();
for (const file of sheets) {
  const rootNode = postcss.parse(
    readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "")
  );
  rootNode.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    for (const [, cls] of rule.selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      if (tokens.has(cls)) continue;
      // The longest matching prefix, so a reader can judge whether the
      // interpolation really can produce this class.
      const prefix = [...prefixes]
        .filter((p) => cls.startsWith(p))
        .sort((a, b) => b.length - a.length)[0];
      const key = prefix ? `maybe dynamic (${prefix}\${…})  .${cls}` : `unreferenced  .${cls}`;
      const where = `${file.replace("client/src/", "")}:${rule.source.start.line}`;
      candidates.set(key, [...(candidates.get(key) || []), where]);
    }
  });
}
const sorted = [...candidates].sort(([a], [b]) => a.localeCompare(b));
for (const [key, where] of sorted) console.log(`${key.padEnd(52)} ${where.join("  ")}`);
const dead = sorted.filter(([k]) => k.startsWith("unreferenced")).length;
console.log(
  `\n${dead} unreferenced, ${sorted.length - dead} maybe dynamic, over ${sheets.length} stylesheets and ${code.length} source files`
);
```

- [ ] **Step 3: Write `$TOOLS/capture.mjs`**

```js
/**
 * Full-page screenshots of the home page's stages and the preview walkthrough's
 * four chapters, at a desktop and a phone viewport, for the CSS PRs (11, 12) of
 * docs/plans/2026-09-29-code-readability.md. Serves the already-built bundle
 * (client/dist) with Vite's preview server, so run `npm -w client run build`
 * first. Motion is reduced and CSS animations disabled so a stage settles to
 * the same pixels every run; `compare` mode says whether two runs match.
 *
 * Usage: node capture.mjs <repoRoot> <outDir>
 *        node capture.mjs compare <dirA> <dirB>
 */
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.argv[2] === "compare") {
  const [a, b] = process.argv.slice(3);
  const names = [...new Set([...readdirSync(a), ...readdirSync(b)])].sort();
  const differ = names.filter((n) => {
    try {
      return !readFileSync(path.join(a, n)).equals(readFileSync(path.join(b, n)));
    } catch {
      return true;
    }
  });
  console.log(
    differ.length ? `DIFFER: ${differ.join(", ")}` : `identical: ${names.length} screenshots`
  );
  process.exit(differ.length ? 1 : 0);
}

const [repoRoot = "D:/ai-workout", outDir = "shots"] = process.argv.slice(2);
const require = createRequire(path.join(repoRoot, "client", "package.json"));
const { preview } = await import(pathToFileURL(require.resolve("vite")).href);
const { chromium } = createRequire(path.join(repoRoot, "package.json"))("@playwright/test");

const PORT = 4174; // not 4173, so it cannot collide with a preview left running for E2E
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

// Each state starts from a fresh load of "/" and ends on what it names. The
// walkthrough is a timed state machine that advances chapters by itself, so
// the page clock is frozen (page.clock.install) and only moved by fixed
// amounts: every run then photographs the same instant.
//
// Waits poll from Node on real time. Playwright's own waitForFunction and
// locator.waitFor re-check on animation frames, which the frozen clock also
// stops, so a condition not already true at the first check would never be
// checked again.
const waitUntil = async (page, predicate, arg, label) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await page.evaluate(predicate, arg)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${label}`);
};
const hasText = (text) => document.body.innerText.includes(text);
const STATES = {
  intro: async (page) => {
    await waitUntil(page, hasText, "Get Started", "the intro");
  },
  personal: async (page) => {
    await page.getByRole("button", { name: "Get Started" }).click();
    await page.clock.runFor(3000);
    await waitUntil(page, hasText, "Full name", "the personal form");
  },
  ...Object.fromEntries(
    [
      ["preview-personal-info", "Personal Info"],
      ["preview-generate", "Generate"],
      ["preview-result", "Result"],
      ["preview-dashboard", "Dashboard"]
    ].map(([state, tab]) => [
      state,
      async (page) => {
        await page.getByRole("button", { name: "Preview" }).click();
        await page.clock.runFor(1000);
        await page.getByRole("tab", { name: tab }).click();
        // Selected is checked before time moves again, which is what proves
        // the capture is of this chapter and not of one it advanced to.
        await waitUntil(
          page,
          (name) =>
            document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() ===
            name,
          tab,
          `the ${tab} chapter`
        );
        await page.clock.runFor(300);
      }
    ])
  )
};

mkdirSync(outDir, { recursive: true });
const server = await preview({
  root: path.join(repoRoot, "client"),
  preview: { port: PORT, strictPort: true },
  logLevel: "error"
});
const browser = await chromium.launch();
try {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      deviceScaleFactor: 1
    });
    // The typing animation draws a random delay per character; pin it, as the
    // unit tests do with vi.spyOn(Math, "random").
    await context.addInitScript(() => {
      Math.random = () => 0.5;
    });
    for (const [state, reach] of Object.entries(STATES)) {
      const page = await context.newPage();
      await page.clock.install({ time: new Date("2026-09-29T12:00:00Z") });
      await page.goto(`http://localhost:${PORT}/`);
      await page.clock.runFor(500);
      await reach(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      await page.screenshot({
        path: path.join(outDir, `${viewportName}-${state}.png`),
        fullPage: true,
        animations: "disabled",
        caret: "hide"
      });
      await page.close();
      console.log(`captured ${viewportName}-${state}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
```

The capture log will show `ECONNREFUSED` stack traces from the preview's `/api` proxy. That is expected: no API server is running, and the walkthrough renders logged-out either way.

- [ ] **Step 4: Baseline captures, and prove they are deterministic**

```bash
npm -w client run build > "$SCRATCH/pr11-build-before.txt" 2>&1; echo "build exit=$?"
rm -rf "$SCRATCH"/shots-*
node "$TOOLS/capture.mjs" "$REPO" "$SCRATCH/shots-before-1" > "$SCRATCH/cap1.log" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" "$REPO" "$SCRATCH/shots-before-2" > "$SCRATCH/cap2.log" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SCRATCH/shots-before-1" "$SCRATCH/shots-before-2"; echo "compare exit=$?"
```

Expected: both captures `exit=0`, then `identical: 12 screenshots` and `compare exit=0`. If they differ, stop. A capture that does not repeat proves nothing, so find what moved before going on.

- [ ] **Step 5: Prove the capture sees a change** (the control)

Write `$TOOLS/edits-css-control.json` with the Write tool:

```json
[
  {
    "file": "client/src/pages/home/preview/styles/layout/header.css",
    "find": ".preview-stage-title {",
    "text": ".preview-stage-kicker { outline: 4px solid #f00; }\n\n",
    "mode": "before"
  }
]
```

```bash
node "$TOOLS/mutate.mjs" "$TOOLS/edits-css-control.json" && npm -w client run build > /dev/null 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" "$REPO" "$SCRATCH/shots-control" > "$SCRATCH/cap-ctl.log" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SCRATCH/shots-before-1" "$SCRATCH/shots-control"; echo "compare exit=$?"
git checkout -- client/src/pages/home/preview/styles/layout/header.css && npm -w client run build > /dev/null 2>&1; git status --porcelain
```

Expected, as measured on 2026-09-29: `compare exit=1`, and exactly the 8 preview captures differ (`desktop-` and `phone-`, times `preview-personal-info`, `-generate`, `-result`, `-dashboard`). The 4 intro and personal captures are identical, because the kicker only renders in the walkthrough.

- [ ] **Step 6: The sweep**

```bash
node "$TOOLS/css-sweep.mjs" "$REPO" > "$SCRATCH/sweep.txt" 2>&1; echo "exit=$?"
tail -1 "$SCRATCH/sweep.txt"; grep '^unreferenced' "$SCRATCH/sweep.txt"
```

Expected on 2026-09-29: `35 unreferenced, 23 maybe dynamic`. The 23 "maybe dynamic" are built by templates that really exist, such as `builder-stage-${…}`, `air-quality-${…}` and `trend-${…}`, and stay.

- [ ] **Step 7: Confirm each candidate by hand**

The sweep is a lead. For each unreferenced class, two independent checks:

```bash
for c in $(grep '^unreferenced' "$SCRATCH/sweep.txt" | awk '{print substr($2,2)}'); do
  n=$(git grep -l -e "$c" -- 'client/src/*.js' 'client/src/*.jsx' 'client/index.html' 'e2e/*.js' | wc -l)
  echo "$n  $c"
done | sort -n > "$SCRATCH/confirm.txt"; cat "$SCRATCH/confirm.txt"
```

Every line must start with `0`, and that includes tests and E2E, which query classes. Then, for each class, search its owning component folder for the class's last segment. For `.preview-stage-title-ghost`, search `client/src/pages/home/preview` for `ghost`. That catches a class assembled by concatenation, like `"title-" + variant`, which no single token shows.

A class with any hit stays, and the PR names it.

- [ ] **Step 8: Delete**

In each stylesheet, for each rule that names a confirmed class:

- **Every selector in the rule names one:** delete the rule.
- **Only some selectors in a comma list do:** delete just those selectors. A selector list's members are independent, so removing one that matches nothing changes nothing for the others.
- **An `@media` block left empty:** delete it too.

Change nothing else.

```bash
node "$TOOLS/css-sweep.mjs" "$REPO" > "$SCRATCH/sweep-after.txt" 2>&1; tail -1 "$SCRATCH/sweep-after.txt"
```

Expected: `0 unreferenced` (or only the classes you kept, each named in the PR).

- [ ] **Step 9: Prove nothing that renders changed**

```bash
npm -w client run build > "$SCRATCH/pr11-build-after.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" "$REPO" "$SCRATCH/shots-after" > "$SCRATCH/cap-after.log" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SCRATCH/shots-before-1" "$SCRATCH/shots-after"; echo "compare exit=$?"
pr_gates
```

Expected: `identical: 12 screenshots`, every gate `exit=0` and `19 passed`. That run includes `e2e/a11y.spec.js`, the axe scans.

**The dashboard is not in the screenshot set,** because reaching it needs an account. Its two classes (`.workout-list`, `.workout-list-row`) rest on the Step 7 proof, which is the stronger one: no element can carry a class that nothing assigns. That leaves the E2E and axe runs. Say so in the PR.

- [ ] **Step 10: Commit and PR**

```bash
git add -A client && git status --porcelain
git commit -F - <<'EOF'
chore(css): remove rules for classes nothing renders

Every class removed was confirmed unreferenced by two independent searches
across source, tests and E2E. Frozen-clock screenshots of every home stage
and walkthrough chapter, at desktop and phone widths, are byte-identical
before and after; the capture was first shown to be repeatable and to
detect a one-rule change.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

Push and open the PR, with the classes removed and the lines removed per file, the three compare results (repeatability, control, after), and the gates.

---

### Task 13: PR 12 — one home for the walkthrough's styles

**Branch:** `refactor/walkthrough-styles`

**Files:**

- Delete: `client/src/pages/home/styles/core/preview.css`, and its `@import` in `home/styles/core.css`
- Modify: `home/styles/core/personal.css`, `home/styles/core/layout.css` and `home/styles/responsive.css`, which lose their walkthrough rules
- Modify: `home/preview/styles/form-overrides.css`, `personal.css`, `responsive.css` and `layout/base.css`, `frame.css`, `header.css`, `dashboard.css`, which receive them
- Create (scratch): `$TOOLS/walkthrough-split.mjs`

**Stays in `home/`:** `.home-preview-btn` and `.home-stage-preview`. They style the home page's own Preview button and stage container, not the walkthrough.

- [ ] **Step 1: Branch and baseline captures**

```bash
git switch main && git pull --ff-only && git switch -c refactor/walkthrough-styles
npm -w client run build > /dev/null 2>&1; echo "build exit=$?"
rm -rf "$SCRATCH"/shots-*
node "$TOOLS/capture.mjs" "$REPO" "$SCRATCH/shots-before" > "$SCRATCH/cap-before.log" 2>&1; echo "capture exit=$?"
```

- [ ] **Step 2: Write `$TOOLS/walkthrough-split.mjs` and run it**

```js
/**
 * For PR 12: classifies every rule in the home page's core stylesheets that
 * styles the walkthrough. Each is "dead" (every selector names a class the
 * css-sweep reports as unreferenced), "duplicate" (a selector home/preview/
 * styles/ also defines at the top level), or "live" (neither).
 *
 * Usage: node walkthrough-split.mjs <repoRoot> <sweep.txt>
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const [root = "D:/ai-workout", sweepPath = "sweep.txt"] = process.argv.slice(2);
const require = createRequire(path.join(root, "package.json"));
const postcss = require("postcss");
const dead = new Set(
  [...readFileSync(sweepPath, "utf8").matchAll(/^unreferenced\s+\.(\S+)/gm)].map((m) => m[1])
);
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .trim()
  .split("\n");
const previewSheets = tracked.filter(
  (f) => f.startsWith("client/src/pages/home/preview/styles/") && f.endsWith(".css")
);
const previewSelectors = new Set();
for (const f of previewSheets)
  postcss.parse(readFileSync(path.join(root, f), "utf8").replace(/^\uFEFF/, "")).each((n) => {
    if (n.type === "rule") previewSelectors.add(n.selector.replace(/\s+/g, " "));
  });

const classesOf = (selector) => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
const isDeadSelector = (s) => classesOf(s).some((c) => dead.has(c));
for (const f of [
  "client/src/pages/home/styles/core/preview.css",
  "client/src/pages/home/styles/core/personal.css",
  "client/src/pages/home/styles/core/layout.css",
  "client/src/pages/home/styles/responsive.css"
]) {
  const counts = { dead: 0, duplicate: 0, live: 0 };
  const live = [];
  postcss
    .parse(readFileSync(path.join(root, f), "utf8").replace(/^\uFEFF/, ""))
    .walkRules((rule) => {
      if (rule.parent.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
      if (!/preview|setup-snapshot/.test(rule.selector)) return;
      const selectors = rule.selectors.map((s) => s.replace(/\s+/g, " "));
      const kind = selectors.every(isDeadSelector)
        ? "dead"
        : rule.parent.type === "root" && previewSelectors.has(rule.selector.replace(/\s+/g, " "))
          ? "duplicate"
          : "live";
      counts[kind] += 1;
      if (kind === "live")
        live.push(
          `${rule.source.start.line}: ${rule.selector.replace(/\s+/g, " ").slice(0, 90)}${rule.parent.type === "atrule" ? `  [@${rule.parent.name} ${rule.parent.params}]` : ""}`
        );
    });
  console.log(
    `\n${f.replace("client/src/pages/home/", "")}: walkthrough rules dead ${counts.dead}, duplicate ${counts.duplicate}, live ${counts.live}`
  );
  for (const l of live) console.log(`   live ${l}`);
}
```

```bash
node "$TOOLS/css-sweep.mjs" "$REPO" > "$SCRATCH/sweep.txt" 2>&1
node "$TOOLS/walkthrough-split.mjs" "$REPO" "$SCRATCH/sweep.txt"
```

Expected after PR 11:

- **`core/preview.css`:** `dead 0`, up to 13 duplicates, and 2 live (`.preview-stage-title-row` and `.preview-stage-title-row h2`).
- **`core/personal.css`:** 9 duplicates.
- **`core/layout.css`:** 1 duplicate (`html.preview-smooth-scroll`), plus live `.home-preview-btn` and `.home-stage-preview` rules, which stay.
- **`home/styles/responsive.css`:** 10 live `preview-*` rules inside `@media` blocks, plus `.home-preview-btn` rules, which stay.

- [ ] **Step 3: Establish which copy wins today**

The merge has to keep whichever declaration wins now. In the bundle, the home page's `core/*` rules load before `home/preview/styles/*`: `HomePage.jsx` imports `./HomePage.css` on line 1, before it imports `PreviewStage`. So for equal specificity the preview copy wins. Confirm it from the built CSS rather than from that argument:

```bash
f=$(grep -l "preview-stage-title-row" client/dist/assets/*.css); echo "$f"
grep -bo "\.preview-step-shell{[^}]*}" "$f"
```

Expected: two matches. The one at the lower byte offset has the declarations of `core/preview.css`'s `.preview-step-shell`, and the higher one those of `layout/frame.css`'s. Match them by eye. If it is the other way round, the merge rule below reverses too: the `core/` copy wins, so its values replace the preview copy's.

- [ ] **Step 4: Merge each duplicate**

For each duplicated selector, with an earlier copy **E** in `core/` and a later copy **L** in `home/preview/styles/`:

1. **A property in both:** L's value is what renders, so L keeps it. The exception is when E's has `!important` and L's does not: then E's value wins today, so write E's value into L, with its `!important`.
2. **A property only in E:** add it to L's rule.
3. **Delete E's rule.**

Put the merged declarations at the end of L's rule, so every declaration L already had keeps its order.

**Where each file's rules go:**

- **`core/preview.css`** duplicates merge into the preview file that defines the same selector: `layout/frame.css`, `layout/header.css`, `layout/base.css` or `layout/dashboard.css`. Its 2 live rules (`.preview-stage-title-row`, `.preview-stage-title-row h2`) move to the top of `layout/header.css`, after its header, because that file styles the rest of the title row.
- **`core/personal.css`**'s `.preview-personal-form*` rules merge into `home/preview/styles/form-overrides.css`. The one it shares with `home/preview/styles/personal.css` merges there.
- **`core/layout.css`**'s `html.preview-smooth-scroll` merges into `home/preview/styles/layout/base.css`.
- **`home/styles/responsive.css`**'s 10 `preview-*` rules move into `home/preview/styles/responsive.css`, each inside an `@media` block with the **identical** params, reusing one there if it exists. The `.home-nav-spacer, .home-preview-btn` rule stays where it is.

Then delete `home/styles/core/preview.css`, and the line `@import "./core/preview.css";` from `home/styles/core.css`. Update `core.css`'s header, from PR 8, so it no longer lists the file.

- [ ] **Step 5: Prove it**

```bash
npm -w client run build > "$SCRATCH/pr12-build.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" "$REPO" "$SCRATCH/shots-after" > "$SCRATCH/cap-after.log" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SCRATCH/shots-before" "$SCRATCH/shots-after"; echo "compare exit=$?"
node "$TOOLS/walkthrough-split.mjs" "$REPO" "$SCRATCH/sweep.txt" 2>&1 | grep -E "walkthrough rules"
```

Expected: `identical: 12 screenshots`. `walkthrough-split` no longer lists `core/preview.css`, since the file is gone, and reports `duplicate 0` everywhere else. The only live rules left in `home/` are the `.home-preview-btn` and `.home-stage-preview` ones.

**If a capture differs,** a moved declaration changed places in the cascade relative to some other rule. Find it by bisecting:

1. Revert one file's changes (`git checkout -- <file>`).
2. Rebuild and re-capture.
3. Repeat until the captures match. The last file reverted holds the declaration.
4. Keep that declaration's rule in its original file, say why in a comment there, and name it in the PR.

- [ ] **Step 6: Gates, commit, PR**

```bash
pr_gates
git add -A client && git status --porcelain
git commit -F - <<'EOF'
refactor(css): give the walkthrough's styles one home

The walkthrough rules the home page's core stylesheets carried are merged
into home/preview/styles/ in today's cascade order, and core/preview.css is
deleted. Frozen-clock screenshots of every home stage and walkthrough
chapter, at desktop and phone widths, are byte-identical before and after.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

Expected: every gate `exit=0`, and `19 passed`. Push and open the PR, with the Step 3 evidence for the cascade order, the compare result, and any declaration kept in place with its reason.

---

## Self-review against the spec

| Spec requirement                                               | Where                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| The SOP document                                               | Written on `chore/readability-sop`; indexed in Task 1       |
| Header ratchet, three assertions, shrink-only, mutation-proven | Task 1, Steps 3–7 (a fourth test guards the scope)          |
| PR-template checkbox                                           | Task 1, Step 8                                              |
| `CLAUDE.md` pointer and the `index.js` length                  | Task 1, Step 10                                             |
| Comments commit proven by bundle or syntax tree                | Tasks 2–10, the "Prove the comments changed no code" steps  |
| Tidy commit proven by the full gates                           | Tasks 5–7, the "Tidy" steps                                 |
| Per-PR before/after numbers                                    | `pr_scan N before` and `pr_scan N after` in every area task |
| `index.js` banners with no statement moved                     | Task 2, Step 3                                              |
| The eight repository headers                                   | Task 3, Step 3 (nine, with `rowValues.js`)                  |
| CSS headers and banners only, no rule moved                    | Tasks 8 and 9                                               |
| PR 10 helpers, each pair re-read                               | Task 11, with the pairs left alone listed and why           |
| PR 11 dead CSS with screenshots, E2E and axe                   | Task 12                                                     |
| PR 12 merge in today's cascade order, pixel-identical          | Task 13                                                     |
