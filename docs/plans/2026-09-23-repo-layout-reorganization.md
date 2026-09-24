# Repository Layout Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move tests into `__tests__/`, group server services by domain, give each page its own folder, move global CSS into `styles/`, and tidy the root configs, with no change to what any code does.

**Architecture:** A single scratch codemod computes every move and every rewritten relative specifier against the tree as it stands, refuses to run if anything fails to resolve, and only then `git mv`s the files and writes the rewritten contents. A separate checker proves every relative specifier in the tree still resolves afterwards, including the `vi.mock` strings ESLint cannot see. Test counts and coverage totals captured before the move must match exactly after it. The config work that follows is small, hand-made edits, one commit each.

**Tech Stack:** Node 24 (ESM scripts), git, Vitest 4, ESLint 9, Prettier 3.9, knip 6, Playwright.

**Spec:** `docs/specs/2026-09-23-repo-layout-reorganization-design.md`

**Branch:** `chore/reorganize-layout` (already created, stacked on `chore/guard-neon-scaffolding`).

---

## Conventions for every task

- Run every command from the repo root, in Git Bash.
- `SCRATCH` is a directory **outside** the repo for the one-off scripts and captured output. Set it once per shell:

  ```bash
  SCRATCH=/c/Users/nguye/AppData/Local/Temp/claude/d--ai-workout/c4051fa0-a19b-4e4a-9c75-42359a1f9daf/scratchpad
  ```

- Never gate on a piped command's exit code. Redirect to a file and check `$?`, as the steps below do.
- Every commit message ends with the trailer `Co-Authored-By: claude-flow <ruv@ruv.net>`.

## File map

| Created (scratch, not committed) | Purpose                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `$SCRATCH/lib-specifiers.mjs`    | Shared: the specifier patterns and the resolver          |
| `$SCRATCH/check-specifiers.mjs`  | Fails on any relative specifier that does not resolve    |
| `$SCRATCH/reorganize.mjs`        | The codemod: plans, then applies, all 143 moves          |
| `$SCRATCH/find-stale-paths.mjs`  | Lists text that still names a moved file by its old path |

| Created (committed)     | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `.vscode/settings.json` | Hides generated output from the explorer |

| Moved                             | To                                                     |
| --------------------------------- | ------------------------------------------------------ |
| 118 test files                    | `__tests__/` beside their source (the codemod)         |
| 13 services                       | `server/src/services/<domain>/` (the codemod)          |
| 10 page `.jsx`/`.css` files       | `client/src/pages/<page>/` (the codemod)               |
| `client/src/App.css`, `index.css` | `client/src/styles/app.css`, `index.css` (the codemod) |
| `CODEOWNERS`                      | `.github/CODEOWNERS`                                   |
| `.audit-ci.json`                  | `security/audit-ci.json`                               |
| `knip.json`                       | `knip.jsonc`                                           |
| `.prettierrc`                     | `.prettierrc.yaml`                                     |

| Modified by hand                                                                                                                   | Why                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `scripts/__tests__/repo-invariants.test.mjs`                                                                                       | Repo root is one level further up; knip.jsonc reader and guards |
| `scripts/check-audit-allowlist.mjs`                                                                                                | New audit-ci config path                                        |
| `.github/workflows/ci.yml`                                                                                                         | New audit-ci config path; comment naming knip.jsonc             |
| `package.json`, `server/package.json`                                                                                              | Scripts grouped                                                 |
| `.gitignore`, `.prettierignore`, `.dockerignore`                                                                                   | Section headers and comments                                    |
| `vitest.config.js`, `client/vite.config.js`                                                                                        | Section headers and comments                                    |
| `README.md`, `CLAUDE.md`, `client/README.md`, `server/db/postgres/README.md`, `server/scripts/refuse-db-push.js`, one test comment | Paths that named moved files                                    |

---

### Task 0: Prerequisites and baseline

**Files:** none changed. Output goes to `$SCRATCH/before-*.txt`.

- [ ] **Step 1: Confirm the branch and a clean tree**

```bash
git branch --show-current
git status --porcelain
```

Expected: `chore/reorganize-layout`, and no status lines.

- [ ] **Step 2: Make sure Postgres is reachable**

The server suite needs it. Without it, 96 tests fail with `Can't reach database server`, and that says nothing about this change. Start whichever local Postgres `server/.env` points at, if it is not already up:

```bash
npm run postgres:local:start -w server   # or: docker compose up -d (never both; both bind 55432)
```

Step 3 is the real check: a server suite with no database fails there, loudly.

- [ ] **Step 3: Capture test counts and coverage before anything moves**

```bash
npm run test:scripts > "$SCRATCH/before-scripts.txt" 2>&1; echo "scripts exit=$?"
npm run test:coverage -w client > "$SCRATCH/before-client.txt" 2>&1; echo "client exit=$?"
npm run test:coverage -w server > "$SCRATCH/before-server.txt" 2>&1; echo "server exit=$?"
for f in "$SCRATCH"/before-{scripts,client,server}.txt; do
  echo "== $(basename "$f")"
  sed 's/\x1b\[[0-9;]*m//g' "$f" | grep -E "Test Files|^ +Tests |All files"
done > "$SCRATCH/before-summary.txt"
cat "$SCRATCH/before-summary.txt"
```

Expected: all three `exit=0`. The summary has a `Test Files` and a `Tests` line for each suite, and an `All files` coverage line for client and server. If any suite fails here, stop. The baseline has to be green before the move can be judged against it.

- [ ] **Step 4: Capture the E2E baseline**

```bash
npm -w client run build > "$SCRATCH/before-build.txt" 2>&1; echo "build exit=$?"
npm run test:e2e > "$SCRATCH/before-e2e.txt" 2>&1; echo "e2e exit=$?"
tail -5 "$SCRATCH/before-e2e.txt"
```

Expected: `build exit=0`, `e2e exit=0`, `19 passed`. If Playwright reports a missing browser, run `npx playwright install chromium` and repeat.

---

### Task 1: The specifier checker

**Files:**

- Create: `$SCRATCH/lib-specifiers.mjs`
- Create: `$SCRATCH/check-specifiers.mjs`

- [ ] **Step 1: Write the shared library**

`$SCRATCH/lib-specifiers.mjs`:

```js
import path from "node:path";

const posix = path.posix;

// Every syntactic position a relative path occupies in this repo's JS and CSS.
// Each pattern captures (prefix)(quote)(specifier), so a rewrite can replace
// the specifier alone and leave the surrounding bytes -- BOMs, CRLFs, line
// wrapping -- exactly as they were.
const JS_PATTERNS = [
  // import … from "x" (single or multi-line) and export … from "x"
  /(\bfrom\s*)(["'])([^"'\n]+)\2/g,
  // import "x" -- side-effect imports, mostly CSS
  /(\bimport\s*)(["'])([^"'\n]+)\2/g,
  // import("x")
  /(\bimport\s*\(\s*)(["'])([^"'\n]+)\2/g,
  // vi.mock("x") and friends. ESLint's no-unresolved does not read these
  // strings, which is the main reason the checker exists.
  /(\bvi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)\s*\(\s*)(["'])([^"'\n]+)\2/g,
  // require("x")
  /(\brequire\s*\(\s*)(["'])([^"'\n]+)\2/g
];

const CSS_PATTERNS = [/(@import\s+(?:url\(\s*)?)(["'])([^"'\n]+)\2/g];

export const CODE_FILE = /\.(js|jsx|mjs|cjs|css)$/;

export const patternsFor = (file) => (file.endsWith(".css") ? CSS_PATTERNS : JS_PATTERNS);

export const isRelative = (spec) => spec.startsWith("./") || spec.startsWith("../");

// Tried in order after the literal path: the extensionless forms Vite and the
// eslint node resolver accept.
const RESOLVE_SUFFIXES = ["", ".js", ".jsx", ".mjs", ".cjs", "/index.js", "/index.jsx"];

/**
 * Resolves a relative specifier written in `fromFile` (repo-relative, posix).
 *
 * `exists` decides what counts as a file. Both scripts pass membership of the
 * git index, which is case-sensitive -- the same answer the Linux CI runner
 * gets -- where the Windows filesystem would accept a miscased path.
 *
 * Returns { target, suffix, query }, where `suffix` is whatever resolution
 * appended (".jsx", "/index.js", ...) so a rewrite can drop it again and keep
 * the original style, or null when nothing matches.
 */
export const resolveSpecifier = (fromFile, spec, exists) => {
  const queryAt = spec.indexOf("?");
  const pathPart = queryAt === -1 ? spec : spec.slice(0, queryAt);
  const query = queryAt === -1 ? "" : spec.slice(queryAt);
  const base = posix.normalize(posix.join(posix.dirname(fromFile), pathPart));
  for (const suffix of RESOLVE_SUFFIXES) {
    if (exists(base + suffix)) return { target: base + suffix, suffix, query };
  }
  return null;
};

/** Every relative specifier in `text`, in pattern order. */
export const findRelativeSpecifiers = (file, text) =>
  patternsFor(file).flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) => match[3]).filter(isRelative)
  );
```

- [ ] **Step 2: Write the checker**

`$SCRATCH/check-specifiers.mjs`:

```js
#!/usr/bin/env node
/**
 * Fails when any relative specifier in a tracked JS/JSX/MJS/CJS/CSS file does
 * not resolve to a tracked file. Run from the repo root.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CODE_FILE, findRelativeSpecifiers, resolveSpecifier } from "./lib-specifiers.mjs";

const root = process.cwd();
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const trackedSet = new Set(tracked);
const exists = (file) => trackedSet.has(file);

const unresolved = [];
let checked = 0;

for (const file of tracked.filter((name) => CODE_FILE.test(name))) {
  const text = readFileSync(path.join(root, file), "utf8");
  for (const spec of findRelativeSpecifiers(file, text)) {
    checked += 1;
    if (!resolveSpecifier(file, spec, exists)) unresolved.push(`  ${file}: "${spec}"`);
  }
}

if (unresolved.length > 0) {
  console.error(`${unresolved.length} of ${checked} relative specifiers do not resolve:`);
  console.error(unresolved.join("\n"));
  process.exit(1);
}
console.log(`All ${checked} relative specifiers resolve.`);
```

- [ ] **Step 3: Run it on the untouched tree. It must pass, with no false positives**

```bash
node "$SCRATCH/check-specifiers.mjs"; echo "exit=$?"
```

Expected: `All 519 relative specifiers resolve.` and `exit=0`.

- [ ] **Step 4: Prove the patterns see every form**

`$SCRATCH/lib-specifiers.check.mjs`:

```js
// Every form the codemod must rewrite, one per line, plus two it must skip:
// a bare package name and a remote CSS URL.
import { findRelativeSpecifiers } from "./lib-specifiers.mjs";

const js = [
  'import a from "./a.js";',
  'import {\n  b\n} from "./b";',
  'export * from "../c.js";',
  'import "./d.css";',
  'const e = await import("./e.js");',
  'vi.mock("./f.js", () => ({}));',
  'vi.doMock("./g.js");',
  'const h = await vi.importActual("./h.js");',
  'import pkg from "react";'
].join("\n");
const css = '@import "./i.css";\n@import url("https://example.test/x.css");';

const expected = JSON.stringify([
  ["./a.js", "./b", "../c.js", "./d.css", "./e.js", "./f.js", "./g.js", "./h.js"],
  ["./i.css"]
]);
const actual = JSON.stringify([
  findRelativeSpecifiers("x.test.js", js),
  findRelativeSpecifiers("x.css", css)
]);
console.log(actual);
process.exit(actual === expected ? 0 : 1);
```

```bash
node "$SCRATCH/lib-specifiers.check.mjs"; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 5: Prove it catches a broken path (mutation)**

A checker that passes on a correct tree has proved nothing yet. Break one path on purpose:

```bash
git mv server/src/services/sessionService.js server/src/services/sessionServiceX.js
node "$SCRATCH/check-specifiers.mjs" > "$SCRATCH/mutation.txt" 2>&1; echo "exit=$?"
head -1 "$SCRATCH/mutation.txt"
git mv server/src/services/sessionServiceX.js server/src/services/sessionService.js
git status --porcelain
```

Expected: `exit=1`, a first line reading `N of 519 relative specifiers do not resolve:` with N above zero, and a clean status once the file is moved back.

Nothing to commit. The scripts stay in `$SCRATCH`.

---

### Task 2: The codemod, dry run only

**Files:**

- Create: `$SCRATCH/reorganize.mjs`

- [ ] **Step 1: Write the codemod**

`$SCRATCH/reorganize.mjs`:

```js
#!/usr/bin/env node
/**
 * One-off codemod for docs/specs/2026-09-23-repo-layout-reorganization-design.md.
 * Run from the repo root:  node <path>/reorganize.mjs [--dry-run]
 *
 * Computes every move and every rewritten specifier against the tree as it is
 * now, refuses to continue if anything fails to resolve, and only then touches
 * the working tree: `git mv` for each file, followed by the rewritten contents.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CODE_FILE, isRelative, patternsFor, resolveSpecifier } from "./lib-specifiers.mjs";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const posix = path.posix;

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const tracked = git("ls-files").split("\n").filter(Boolean);
const trackedSet = new Set(tracked);
const exists = (file) => trackedSet.has(file);

// ---- The move rules (spec sections 1-4) ------------------------------------

const SERVICE_DOMAINS = {
  auth: ["authUserService", "sessionService"],
  dashboard: ["dashboardCollectionService", "dashboardDataBuildersService"],
  external: ["externalDataService", "httpCacheService"],
  http: ["apiSchemaService", "requestValidationService", "errorResponseService"],
  platform: [
    "metricsService",
    "errorTrackingService",
    "platformHealthService",
    "envValidationService"
  ]
};

// Each service test follows the service it imports.
const SERVICE_TEST_DOMAINS = {
  "authUserService.test.js": "auth",
  "sessionService.test.js": "auth",
  "sessionService.auth.test.js": "auth",
  "sessionService.redis.test.js": "auth",
  "dashboardDataBuildersService.test.js": "dashboard",
  "airQuality.test.js": "external",
  "externalMappers.test.js": "external",
  "externalRequests.test.js": "external",
  "externalRetry.test.js": "external",
  "httpCacheService.test.js": "external",
  "requestValidationService.test.js": "http",
  "envValidationService.test.js": "platform",
  "errorTrackingService.test.js": "platform",
  "metricsService.test.js": "platform"
};

const PAGE_FOLDERS = {
  AuthPage: "auth",
  DashboardPage: "dashboard",
  HomePage: "home",
  PreviewPage: "preview",
  WorkoutResultPage: "workout-result"
};

const GLOBAL_CSS = {
  "client/src/App.css": "client/src/styles/app.css",
  "client/src/index.css": "client/src/styles/index.css"
};

const TEST_FILE = /\.test\.(js|jsx|mjs)$/;
const TEST_ROOTS = ["client/src", "server/src", "scripts"];

const serviceDomainOf = Object.fromEntries(
  Object.entries(SERVICE_DOMAINS).flatMap(([domain, names]) =>
    names.map((name) => [`${name}.js`, domain])
  )
);

const inTestRoot = (dir) => TEST_ROOTS.some((top) => dir === top || dir.startsWith(`${top}/`));

const newPathFor = (file) => {
  const dir = posix.dirname(file);
  const name = posix.basename(file);
  const isTest = TEST_FILE.test(name);

  if (GLOBAL_CSS[file]) return GLOBAL_CSS[file];

  if (dir === "client/src/pages") {
    const page = Object.keys(PAGE_FOLDERS).find((prefix) => name.startsWith(`${prefix}.`));
    if (!page) throw new Error(`No page folder assigned for ${file}`);
    const pageDir = `${dir}/${PAGE_FOLDERS[page]}`;
    return isTest ? `${pageDir}/__tests__/${name}` : `${pageDir}/${name}`;
  }

  if (dir === "server/src/services") {
    const domain = isTest ? SERVICE_TEST_DOMAINS[name] : serviceDomainOf[name];
    if (!domain) throw new Error(`No service domain assigned for ${file}`);
    return isTest ? `${dir}/${domain}/__tests__/${name}` : `${dir}/${domain}/${name}`;
  }

  if (isTest && inTestRoot(dir) && posix.basename(dir) !== "__tests__") {
    return `${dir}/__tests__/${name}`;
  }
  return null;
};

// ---- Plan the moves ---------------------------------------------------------

const moves = new Map();
for (const file of tracked) {
  const to = newPathFor(file);
  if (to) moves.set(file, to);
}

const destinations = [...moves.values()];
const collisions = destinations.filter(
  (to, index) => exists(to) || destinations.indexOf(to) !== index
);
if (collisions.length > 0) {
  console.error(`Destinations already taken:\n  ${collisions.join("\n  ")}`);
  process.exit(1);
}

// ---- Plan the rewrites, against the tree as it is now ----------------------

const rewrites = new Map();
const problems = [];
let specifiersRewritten = 0;

for (const file of tracked.filter((name) => CODE_FILE.test(name))) {
  const newFile = moves.get(file) ?? file;
  const original = readFileSync(path.join(root, file), "utf8");
  let text = original;

  for (const pattern of patternsFor(file)) {
    text = text.replace(pattern, (whole, prefix, quote, spec) => {
      if (!isRelative(spec)) return whole;
      const resolved = resolveSpecifier(file, spec, exists);
      if (!resolved) {
        problems.push(`  ${file}: "${spec}"`);
        return whole;
      }
      const newTarget = moves.get(resolved.target) ?? resolved.target;
      if (newFile === file && newTarget === resolved.target) return whole;

      let next = posix.relative(posix.dirname(newFile), newTarget);
      if (resolved.suffix) next = next.slice(0, -resolved.suffix.length);
      if (!next.startsWith("../")) next = `./${next}`;
      next += resolved.query;
      if (next === spec) return whole;

      specifiersRewritten += 1;
      return `${prefix}${quote}${next}${quote}`;
    });
  }
  if (text !== original) rewrites.set(file, text);
}

if (problems.length > 0) {
  console.error(`Unresolvable specifiers -- nothing was changed:\n${problems.join("\n")}`);
  process.exit(1);
}

// ---- Report, then apply ------------------------------------------------------

const countBy = (predicate) => [...moves.keys()].filter(predicate).length;
console.log(`Moves: ${moves.size}`);
console.log(`  tests:        ${countBy((file) => TEST_FILE.test(file))}`);
console.log(`  services:     ${countBy((file) => /^server\/src\/services\/\w+\.js$/.test(file))}`);
console.log(
  `  page files:   ${countBy((file) => /^client\/src\/pages\/\w+\.(jsx|css)$/.test(file))}`
);
console.log(`  global CSS:   ${countBy((file) => Boolean(GLOBAL_CSS[file]))}`);
console.log(`Files rewritten: ${rewrites.size}, specifiers rewritten: ${specifiersRewritten}`);

if (dryRun) {
  for (const [from, to] of moves) console.log(`  ${from} -> ${to}`);
  process.exit(0);
}

for (const [from, to] of moves) {
  mkdirSync(path.join(root, posix.dirname(to)), { recursive: true });
  git("mv", from, to);
}
for (const [file, text] of rewrites) {
  writeFileSync(path.join(root, moves.get(file) ?? file), text);
}
console.log("Applied.");
```

- [ ] **Step 2: Dry run and check the counts against the spec**

```bash
node "$SCRATCH/reorganize.mjs" --dry-run > "$SCRATCH/dry-run.txt" 2>&1; echo "exit=$?"
head -7 "$SCRATCH/dry-run.txt"
git status --porcelain
```

Expected, exactly:

```text
exit=0
Moves: 143
  tests:        118
  services:     13
  page files:   10
  global CSS:   2
Files rewritten: 145, specifiers rewritten: 319
```

The status is empty, because a dry run touches nothing. 118 tests = 72 client + 44 server + 2 scripts.

- [ ] **Step 3: Spot-check the map**

```bash
grep -E "sessionService|DashboardPage|App\.css|repo-invariants" "$SCRATCH/dry-run.txt"
```

Expected, among others:

```text
  client/src/App.css -> client/src/styles/app.css
  client/src/pages/DashboardPage.jsx -> client/src/pages/dashboard/DashboardPage.jsx
  client/src/pages/DashboardPage.hookOrder.test.jsx -> client/src/pages/dashboard/__tests__/DashboardPage.hookOrder.test.jsx
  scripts/repo-invariants.test.mjs -> scripts/__tests__/repo-invariants.test.mjs
  server/src/services/sessionService.js -> server/src/services/auth/sessionService.js
  server/src/services/sessionService.redis.test.js -> server/src/services/auth/__tests__/sessionService.redis.test.js
```

Nothing to commit.

---

### Task 3: Apply the moves

**Files:** the 143 moves in `$SCRATCH/dry-run.txt`, the 145 rewritten files, plus:

- Modify: `scripts/__tests__/repo-invariants.test.mjs:6`

- [ ] **Step 1: Apply**

```bash
node "$SCRATCH/reorganize.mjs" > "$SCRATCH/apply.txt" 2>&1; echo "exit=$?"
tail -2 "$SCRATCH/apply.txt"
```

Expected: `exit=0`, then `Files rewritten: 145, specifiers rewritten: 319` and `Applied.`

- [ ] **Step 2: Fix the one path the codemod cannot see**

`repo-invariants.test.mjs` finds the repo root from its own location. It is now one folder deeper. In `scripts/__tests__/repo-invariants.test.mjs`, change line 6:

```js
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
```

to:

```js
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
```

- [ ] **Step 3: Every relative specifier resolves**

```bash
node "$SCRATCH/check-specifiers.mjs"; echo "exit=$?"
```

Expected: `All 519 relative specifiers resolve.` and `exit=0`. The count matches Task 1, because moving files changes specifiers, not how many there are.

- [ ] **Step 4: Byte-order marks survived**

```bash
for f in client/src/styles/app.css client/src/styles/index.css client/src/pages/dashboard/DashboardPage.css; do
  head -c 3 "$f" | od -An -tx1
done
```

Expected: `ef bb bf` three times.

- [ ] **Step 5: Lint**

```bash
npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "exit=$?"
tail -3 "$SCRATCH/lint.txt"
```

Expected: `exit=0` with no problems reported. `import-x/no-unresolved` covers every static import.

- [ ] **Step 6: Formatting**

A longer specifier can push an import past 100 columns and change how Prettier wraps it.

```bash
npm run format:check > "$SCRATCH/format.txt" 2>&1; echo "exit=$?"
grep "\[warn\]" "$SCRATCH/format.txt"
```

If `exit=0`, go to Step 7. Otherwise format only the listed files and confirm the diff is line wrapping around import specifiers:

```bash
grep "\[warn\]" "$SCRATCH/format.txt" | grep -v "Code style issues" | sed 's/\[warn\] //' > "$SCRATCH/unformatted.txt"
npx prettier --write $(cat "$SCRATCH/unformatted.txt")
git diff -- $(cat "$SCRATCH/unformatted.txt")
npm run format:check > /dev/null 2>&1; echo "exit=$?"
```

Expected: the diff touches only import or `vi.mock` lines, and the final check prints `exit=0`.

- [ ] **Step 7: Test counts and coverage match the baseline exactly**

```bash
npm run test:scripts > "$SCRATCH/after-scripts.txt" 2>&1; echo "scripts exit=$?"
npm run test:coverage -w client > "$SCRATCH/after-client.txt" 2>&1; echo "client exit=$?"
npm run test:coverage -w server > "$SCRATCH/after-server.txt" 2>&1; echo "server exit=$?"
for f in "$SCRATCH"/after-{scripts,client,server}.txt; do
  echo "== $(basename "$f" | sed 's/after/before/')"
  sed 's/\x1b\[[0-9;]*m//g' "$f" | grep -E "Test Files|^ +Tests |All files"
done > "$SCRATCH/after-summary.txt"
diff "$SCRATCH/before-summary.txt" "$SCRATCH/after-summary.txt"; echo "diff exit=$?"
```

Expected: three `exit=0` and `diff exit=0`, meaning identical file counts, test counts and coverage totals. If the counts differ, a test file was lost or duplicated. If only coverage differs, a mock stopped applying and a test is running against the real module. Either way, do not continue. Compare the before and after output for the affected suite to find it.

- [ ] **Step 8: knip still clean**

```bash
npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 9: Commit**

```bash
git add client/src server/src scripts
git status --porcelain | grep -v "^[RAMD] " ; echo "(nothing above = everything staged)"
git commit -q -F - <<'EOF'
refactor: move tests into __tests__/, group services and pages

Every *.test.* file under client/src, server/src and scripts/ moves into
a __tests__/ folder beside the code it covers. Server services split
into auth/, dashboard/, external/, http/ and platform/. Each page
component moves into its page's folder, and the two global stylesheets
into client/src/styles/.

Mechanical: a codemod rewrote all 319 affected relative specifiers,
vi.mock paths and CSS @imports included. Test counts and coverage
totals are identical before and after.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 4: Paths in docs and comments that named moved files

**Files:**

- Create: `$SCRATCH/find-stale-paths.mjs`
- Modify: `CLAUDE.md` (8 places), `client/README.md:100`, `client/src/__tests__/numericCoercion.contract.test.js:6`, `server/db/postgres/README.md:20`, `server/scripts/refuse-db-push.js:16,35`, `.gitignore:45`

- [ ] **Step 1: Write the finder**

`$SCRATCH/find-stale-paths.mjs`:

```js
#!/usr/bin/env node
/**
 * Lists every line in a tracked text file that still names a moved file by its
 * old path. Run from the repo root:  node find-stale-paths.mjs <dry-run.txt>
 *
 * docs/plans and docs/specs are historical records and are skipped.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const [mapFile] = process.argv.slice(2);
const pairs = readFileSync(mapFile, "utf8")
  .split("\n")
  .map((line) => line.match(/^\s+(\S+) -> (\S+)$/))
  .filter(Boolean)
  .map(([, from, to]) => ({ from, to }));

// Every suffix of an old path that keeps at least one directory: for
// client/src/app/events.test.js that is the full path, src/app/events.test.js
// and app/events.test.js. A bare filename is not a stale reference -- it is
// still true after the move.
const suffixes = (file) => {
  const parts = file.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(index).join("/"));
};
const needles = [...new Set(pairs.flatMap(({ from }) => suffixes(from)))];

// A needle that also occurs inside a new path cannot tell stale from current.
const ambiguous = needles.filter((needle) => pairs.some(({ to }) => to.includes(needle)));
if (ambiguous.length > 0) {
  console.error(`Ambiguous needles:\n  ${ambiguous.join("\n  ")}`);
  process.exit(2);
}

const TEXT_FILE =
  /\.(md|js|jsx|mjs|cjs|json|jsonc|yml|yaml|css|html|ps1|sql)$|(^|\/)[^./]+$|(^|\/)\.[^/]+$/;
const skipped = (file) =>
  file.startsWith("docs/plans/") || file.startsWith("docs/specs/") || file === "package-lock.json";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const hits = [];
for (const file of tracked.filter((name) => TEXT_FILE.test(name) && !skipped(name))) {
  readFileSync(path.join(process.cwd(), file), "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (needles.some((needle) => line.includes(needle))) {
        hits.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
}

if (hits.length > 0) {
  console.log(hits.join("\n"));
  process.exit(1);
}
console.log(`No stale paths (${needles.length} old-path forms checked).`);
```

- [ ] **Step 2: Run it. It should list exactly the 13 lines below**

```bash
node "$SCRATCH/find-stale-paths.mjs" "$SCRATCH/dry-run.txt"; echo "exit=$?"
```

Expected: `exit=1`, listing:

```text
.gitignore:45: # scripts/repo-invariants.test.mjs instead.
CLAUDE.md:161: `server/src/numericCoercion.contract.test.js` and its client counterpart enumerate every
CLAUDE.md:261: (`services/metricsService.js`, `corsPolicy.js`) are cohesive rather than
CLAUDE.md:299: can be asserted without a browser or a database. `app/constants.test.js` pins the
CLAUDE.md:301: `app/profileContract.test.js` walks a form draft through
CLAUDE.md:334: mutation by exactly one. `server/src/index.securityHeaders.test.js` is the
CLAUDE.md:818: `server/src/services/dashboardDataBuildersService.js`, which was a false
CLAUDE.md:854: `scripts/repo-invariants.test.mjs` carried a test asserting the exclusion still
client/README.md:100: **Mocking a module the app constructs with `new`.** `app/events.test.js` mocks `jspdf`,
client/src/__tests__/numericCoercion.contract.test.js:6: // server/src/numericCoercion.contract.test.js:
server/db/postgres/README.md:20: process memory otherwise — see `services/sessionService.js`. The `workout_sessions` table
server/scripts/refuse-db-push.js:16: * The actual detection lives in server/src/db/postgresUniqueIndexes.test.js, which
server/scripts/refuse-db-push.js:35: "  server/db/postgres/ and let server/src/db/postgresUniqueIndexes.test.js",
```

A code specifier in that list means Task 3 missed it. Stop and investigate.

- [ ] **Step 3: Make the replacements**

Each is an exact string replacement. Line numbers are only a guide.

| File                                                    | Replace                                                                       | With                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `.gitignore`                                            | `# scripts/repo-invariants.test.mjs instead.`                                 | `# scripts/__tests__/repo-invariants.test.mjs instead.`                                 |
| `CLAUDE.md`                                             | `` `server/src/numericCoercion.contract.test.js` and its client counterpart`` | `` `server/src/__tests__/numericCoercion.contract.test.js` and its client counterpart`` |
| `CLAUDE.md`                                             | ``(`services/metricsService.js`, `corsPolicy.js`)``                           | ``(`services/platform/metricsService.js`, `corsPolicy.js`)``                            |
| `CLAUDE.md`                                             | `` `../../../server/src/...` from `client/src`, so``                          | `` `../../../../server/src/...` from `client/src/app/__tests__`, so``                   |
| `CLAUDE.md`                                             | `` `app/constants.test.js` pins the``                                         | `` `app/__tests__/constants.test.js` pins the``                                         |
| `CLAUDE.md`                                             | `` `app/profileContract.test.js` walks``                                      | `` `app/__tests__/profileContract.test.js` walks``                                      |
| `CLAUDE.md`                                             | `` `server/src/index.securityHeaders.test.js` is the``                        | `` `server/src/__tests__/index.securityHeaders.test.js` is the``                        |
| `CLAUDE.md`                                             | `` `server/src/services/dashboardDataBuildersService.js`, which``             | `` `server/src/services/dashboard/dashboardDataBuildersService.js`, which``             |
| `CLAUDE.md`                                             | `` `scripts/repo-invariants.test.mjs` carried a test``                        | `` `scripts/__tests__/repo-invariants.test.mjs` carried a test``                        |
| `client/README.md`                                      | `` `app/events.test.js` mocks``                                               | `` `app/__tests__/events.test.js` mocks``                                               |
| `client/src/__tests__/numericCoercion.contract.test.js` | `// server/src/numericCoercion.contract.test.js:`                             | `// server/src/__tests__/numericCoercion.contract.test.js:`                             |
| `server/db/postgres/README.md`                          | `` `services/sessionService.js` ``                                            | `` `services/auth/sessionService.js` ``                                                 |
| `server/scripts/refuse-db-push.js` (2×)                 | `server/src/db/postgresUniqueIndexes.test.js`                                 | `server/src/db/__tests__/postgresUniqueIndexes.test.js`                                 |

The `../../../../` in the CLAUDE.md row is not a guess. `client/src/app/__tests__/constants.test.js` imports `../../../../server/src/services/dashboard/dashboardDataBuildersService.js` after Task 3. Confirm with `grep -n "server/src" client/src/app/__tests__/constants.test.js`.

- [ ] **Step 4: Re-run the finder**

```bash
node "$SCRATCH/find-stale-paths.mjs" "$SCRATCH/dry-run.txt"; echo "exit=$?"
```

Expected: `No stale paths (... old-path forms checked).` and `exit=0`.

- [ ] **Step 5: Gates touched by these files**

```bash
npm run lint > /dev/null 2>&1; echo "lint exit=$?"
npm run format:check > /dev/null 2>&1; echo "format exit=$?"
```

Expected: both `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore CLAUDE.md client/README.md client/src/__tests__/numericCoercion.contract.test.js server/db/postgres/README.md server/scripts/refuse-db-push.js
git commit -q -F - <<'EOF'
docs: point path references at the moved files

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 5: CODEOWNERS into .github/

**Files:**

- Move: `CODEOWNERS` → `.github/CODEOWNERS`

- [ ] **Step 1: Move it**

```bash
git mv CODEOWNERS .github/CODEOWNERS
```

GitHub reads `CODEOWNERS` from the root, `docs/` or `.github/`. Its patterns (`/.github/`, `/scripts/`, `/security/`) are relative to the repository root wherever the file sits, so the content does not change.

- [ ] **Step 2: Nothing else names it**

```bash
git grep -n "CODEOWNERS" -- ':!docs/plans/**' ':!docs/specs/**'; echo "exit=$?"
```

Expected: `exit=1` (no hits). The README tree added in Task 13 will mention it.

- [ ] **Step 3: Commit**

```bash
git commit -q -F - <<'EOF'
chore: move CODEOWNERS into .github/

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 6: The audit-ci config into security/

**Files:**

- Move: `.audit-ci.json` → `security/audit-ci.json`
- Modify: `.github/workflows/ci.yml:60`, `scripts/check-audit-allowlist.mjs:6,63,100`

- [ ] **Step 1: Move it**

```bash
git mv .audit-ci.json security/audit-ci.json
```

- [ ] **Step 2: Confirm the checker now fails (it reads the old path)**

```bash
node scripts/check-audit-allowlist.mjs > "$SCRATCH/audit.txt" 2>&1; echo "exit=$?"
grep -o "ENOENT[^']*'[^']*'" "$SCRATCH/audit.txt"
```

Expected: a non-zero exit and an `ENOENT` naming `.audit-ci.json`.

- [ ] **Step 3: Point everything at the new path**

In `scripts/check-audit-allowlist.mjs`:

- line 6, the doc comment: `otherwise stay forever. This cross-checks .audit-ci.json against` → `otherwise stay forever. This cross-checks security/audit-ci.json against`
- line 63, the error message: `` `${advisory} is allowlisted in .audit-ci.json but has no entry in security/advisory-reviews.json.` `` → `` `${advisory} is allowlisted in security/audit-ci.json but has no entry in security/advisory-reviews.json.` ``
- line 100:

  ```js
  const auditConfig = readJson(path.join(repoRoot, ".audit-ci.json"));
  ```

  becomes:

  ```js
  const auditConfig = readJson(path.join(repoRoot, "security", "audit-ci.json"));
  ```

In `.github/workflows/ci.yml`, line 60:

```text
        run: npx --yes audit-ci@7.1.0 --config .audit-ci.json
```

becomes:

```text
        run: npx --yes audit-ci@7.1.0 --config security/audit-ci.json
```

`scripts/__tests__/check-audit-allowlist.test.mjs` asserts `toContain("no entry in security/advisory-reviews.json")`, which the new message still contains, so the test does not change.

- [ ] **Step 4: Verify**

```bash
node scripts/check-audit-allowlist.mjs; echo "exit=$?"
npx --yes audit-ci@7.1.0 --config security/audit-ci.json > "$SCRATCH/audit-ci.txt" 2>&1; echo "audit-ci exit=$?"
tail -3 "$SCRATCH/audit-ci.txt"
npm run test:scripts > /dev/null 2>&1; echo "scripts exit=$?"
git grep -n "\.audit-ci" -- ':!docs/plans/**' ':!docs/specs/**'; echo "grep exit=$?"
```

Expected: `Audit allowlist OK (2 entries).` with `exit=0`, then `audit-ci exit=0`, `scripts exit=0` and `grep exit=1`.

Then prove that audit-ci actually reads the `--config` path, so the `exit=0` above means something:

```bash
npx --yes audit-ci@7.1.0 --config security/does-not-exist.json > /dev/null 2>&1; echo "missing-config exit=$? (expect non-zero)"
```

If `audit-ci` exits non-zero on the real config, find out whether the move caused it before touching anything. `HEAD` still has the old file, so run the same audit with the old config and compare:

```bash
git show HEAD:.audit-ci.json > "$SCRATCH/audit-ci-old.json"
npx --yes audit-ci@7.1.0 --config "$SCRATCH/audit-ci-old.json" > /dev/null 2>&1; echo "old-config exit=$?"
```

If that fails too, a new upstream advisory is the cause, not the move. Stop and report it rather than editing the allowlist.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-audit-allowlist.mjs .github/workflows/ci.yml
git commit -q -F - <<'EOF'
chore: move the audit-ci config beside the advisory reviews

security/audit-ci.json now sits next to security/advisory-reviews.json,
the file check-audit-allowlist.mjs cross-checks it against.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 7: knip.json → knip.jsonc, with comments and a guard

**Files:**

- Move: `knip.json` → `knip.jsonc`
- Modify: `scripts/__tests__/repo-invariants.test.mjs`, `.github/workflows/ci.yml:49`, `.gitignore:43`, `CLAUDE.md:408`

knip looks for `knip.json` **before** `knip.jsonc`. This was checked in `node_modules/knip/dist/constants.js`, `KNIP_CONFIG_LOCATIONS`. It also merges any `knip` key in `package.json` into the config file (`util/create-options.js`). So after the rename, a `knip.json` recreated by the Neon installer would silently replace this config, hook entries and all. That is the scenario `repo-invariants` already guards against. The guard has to follow the file.

- [ ] **Step 1: Write the failing tests**

In `scripts/__tests__/repo-invariants.test.mjs`, add this directly below the `repoRoot` line:

```js
// knip.jsonc may hold comments, which JSON.parse rejects. Stripped with a
// scanner rather than a regex because the globs themselves contain "/*"
// ("scripts/**/*.test.mjs"), and the $schema URL contains "//" -- a regex
// would read both as comment openers.
const stripJsonComments = (text) => {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      out += char;
      if (char === "\\") {
        out += text[i + 1] ?? "";
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
      out += char;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i === -1) throw new Error("Unterminated block comment");
      i += 1;
    } else {
      out += char;
    }
  }
  return out;
};
```

In the `Neon agent-skills scaffolding stays out of the build` block, replace the `readJson` helper:

```text
  const readJson = (relativePath) =>
    JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
```

with:

```text
  const readJson = (relativePath) =>
    JSON.parse(stripJsonComments(readFileSync(path.join(repoRoot, relativePath), "utf8")));
```

Update the block comment's present-tense line:

```text
  // .gitignore cannot help with package.json and knip.json, which are tracked
```

to:

```text
  // .gitignore cannot help with package.json and knip.jsonc, which are tracked
```

Leave `On its second run the installer ALSO added ignoreDependencies to knip.json,` as it is. It describes what happened, when the file had that name.

Rename the existing test and point it at the new file:

```text
  test("knip.json does not suppress an unused @neon/* dependency", () => {
```

becomes:

```text
  test("knip.jsonc does not suppress an unused @neon/* dependency", () => {
```

and inside it, `const knipConfig = readJson("knip.json");` becomes `const knipConfig = readJson("knip.jsonc");`.

Then add these two tests at the end of the same `describe` block:

```text
  test("knip.jsonc is the only knip config", () => {
    // knip looks for knip.json BEFORE knip.jsonc, so a knip.json re-created
    // on our behalf would silently replace this config -- hook entries and
    // all -- rather than fail. It also merges a "knip" key from package.json
    // into whichever file it loads.
    const competitors = [
      "knip.json",
      ".knip.json",
      ".knip.jsonc",
      "knip.ts",
      "knip.js",
      "knip.config.ts",
      "knip.config.js"
    ].filter((name) => existsSync(path.join(repoRoot, name)));

    expect(competitors).toEqual([]);
    expect(existsSync(path.join(repoRoot, "knip.jsonc"))).toBe(true);
    expect(readJson("package.json").knip).toBeUndefined();
  });

  test("knip.jsonc still declares the hook scripts as entry points", () => {
    // Also proves the comment stripping leaves "/*" inside a string alone:
    // "scripts/**/*.test.mjs" would not survive a naive regex.
    const entries = readJson("knip.jsonc").workspaces["."].entry;

    expect(entries).toEqual(
      expect.arrayContaining([
        "scripts/codex-handoff.mjs",
        "scripts/scrub-junk-files.cjs",
        "scripts/skill-router.mjs",
        "scripts/**/*.test.mjs"
      ])
    );
  });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run scripts/__tests__/repo-invariants.test.mjs > "$SCRATCH/knip-red.txt" 2>&1; echo "exit=$?"
grep -E "✓|×|FAIL|ENOENT" "$SCRATCH/knip-red.txt" | head -12
```

Expected: non-zero exit. Three tests fail: the renamed one and the entry test with `ENOENT ... knip.jsonc`, and the only-config test because `knip.json` still exists. The others pass.

- [ ] **Step 3: Rename, and write the commented config**

```bash
git mv knip.json knip.jsonc
```

Replace the whole contents of `knip.jsonc` with:

```jsonc
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    ".": {
      // The first three are Claude Code hook targets, invoked from
      // .claude/settings.json, which knip cannot see. Without them knip reports
      // all three as unused files, then cascades to scripts/codex-handoff/*.mjs
      // because their only importer looks dead -- six false positives inviting
      // you to delete live hook wiring.
      "entry": [
        "scripts/codex-handoff.mjs",
        "scripts/scrub-junk-files.cjs",
        "scripts/skill-router.mjs",
        "scripts/**/*.test.mjs",
        "e2e/**/*.spec.js"
      ],
      // Repo tooling, the E2E suite, and the config files at the root.
      "project": ["scripts/**/*.{mjs,cjs,js}", "e2e/**/*.js", "*.js"]
    },
    "client": { "project": "src/**/*.{js,jsx}" },
    "server": { "project": "src/**/*.js" }
  }
}
```

The values are unchanged. Only the comments and the file extension are new.

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx vitest run scripts/__tests__/repo-invariants.test.mjs > "$SCRATCH/knip-green.txt" 2>&1; echo "exit=$?"
grep -E "Tests " "$SCRATCH/knip-green.txt"
```

Expected: `exit=0`, all passing.

- [ ] **Step 5: Prove the guards bite (mutation)**

The mutations are files, not shell one-liners. CLAUDE.md records three ways the shell has silently stopped a mutation from applying, and each script refuses to report success unless its edit actually changed the file.

`$SCRATCH/mutate-strip.mjs`, which swaps the scanner for the naive regex it exists to avoid:

```js
import { readFileSync, writeFileSync } from "node:fs";

const file = "scripts/__tests__/repo-invariants.test.mjs";
const src = readFileSync(file, "utf8");
const naive =
  String.raw`const stripJsonComments = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");` +
  "\n";
const out = src.replace(
  /const stripJsonComments = \(text\) => \{[\s\S]*?\r?\n\};\r?\n/,
  () => naive
);
if (out === src) {
  console.error("mutation did not apply");
  process.exit(2);
}
writeFileSync(file, out);
console.log("mutation applied");
```

`$SCRATCH/mutate-knip.mjs`, which drops one hook entry from the config:

```js
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("knip.jsonc", "utf8");
const out = src.replace(/^\s*"scripts\/skill-router\.mjs",\r?\n/m, "");
if (out === src) {
  console.error("mutation did not apply");
  process.exit(2);
}
writeFileSync("knip.jsonc", out);
console.log("mutation applied");
```

Run them:

```bash
# 1. A competing knip.json must fail the only-config test.
echo '{}' > knip.json
npx vitest run scripts/__tests__/repo-invariants.test.mjs > /dev/null 2>&1; echo "competitor exit=$? (expect 1)"
rm knip.json

# 2. A naive regex stripper must fail the knip.jsonc tests.
cp scripts/__tests__/repo-invariants.test.mjs "$SCRATCH/invariants.bak"
node "$SCRATCH/mutate-strip.mjs"; echo "applied exit=$? (expect 0)"
npx vitest run scripts/__tests__/repo-invariants.test.mjs > /dev/null 2>&1; echo "naive-regex exit=$? (expect 1)"
cp "$SCRATCH/invariants.bak" scripts/__tests__/repo-invariants.test.mjs
npx vitest run scripts/__tests__/repo-invariants.test.mjs > /dev/null 2>&1; echo "restored exit=$? (expect 0)"
```

Expected: `competitor exit=1`, `applied exit=0`, `naive-regex exit=1`, `restored exit=0`.

- [ ] **Step 6: Prove knip itself reads knip.jsonc (mutation)**

```bash
cp knip.jsonc "$SCRATCH/knip.bak"
node "$SCRATCH/mutate-knip.mjs"; echo "applied exit=$? (expect 0)"
npm run knip > "$SCRATCH/knip-mutant.txt" 2>&1; echo "knip exit=$? (expect 1)"
grep -n "skill-router" "$SCRATCH/knip-mutant.txt"
cp "$SCRATCH/knip.bak" knip.jsonc
npm run knip > /dev/null 2>&1; echo "knip exit=$? (expect 0)"
```

Expected: while the entry is missing, knip exits 1 and names `scripts/skill-router.mjs` as an unused file. Once the file is restored it exits 0. That proves knip loads `knip.jsonc` and not something else.

- [ ] **Step 7: Update the references that name the file**

- `.github/workflows/ci.yml` line 49: `# knip.json declares the hook scripts in scripts/ as entry points. Nothing` → `# knip.jsonc declares the hook scripts in scripts/ as entry points. Nothing`
- `.gitignore` line 43: `# resulting knip failure by adding ignoreDependencies to knip.json. That is the` → `# resulting knip failure by adding ignoreDependencies to knip.json (now knip.jsonc). That is the`. Task 10 rewraps this paragraph.
- `CLAUDE.md` line 408: ``**`npm run knip` is clean, and `knip.json` is what keeps it that way.**`` → ``**`npm run knip` is clean, and `knip.jsonc` is what keeps it that way.**``

```bash
git grep -n "knip\.json\b" -- ':!docs/plans/**' ':!docs/specs/**' ':!package-lock.json'
```

Expected: only the historical lines that name `knip.json` on purpose. That is the `ignoreDependencies to knip.json` sentence in the test and the `.gitignore` line with `(now knip.jsonc)`, plus the `"knip.json"` entry in the competitor list.

- [ ] **Step 8: Gates and commit**

```bash
npm run lint > /dev/null 2>&1; echo "lint exit=$?"
npm run format:check > /dev/null 2>&1; echo "format exit=$?"
npm run test:scripts > /dev/null 2>&1; echo "scripts exit=$?"
git add knip.jsonc scripts/__tests__/repo-invariants.test.mjs .github/workflows/ci.yml .gitignore CLAUDE.md
git commit -q -F - <<'EOF'
chore: rename knip.json to knip.jsonc so it can explain itself

knip resolves knip.json ahead of knip.jsonc, so a knip.json recreated by
the Neon installer would now silently replace this config. The invariant
suite asserts knip.jsonc is the only knip config, and reads it with a
string-aware comment stripper: the globs contain "/*" and the $schema
URL contains "//". Both guards, and knip's use of the file, were
mutation-tested.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

Expected: every gate `exit=0`, then `commit exit=0`.

---

### Task 8: .prettierrc → .prettierrc.yaml, with comments

**Files:**

- Move: `.prettierrc` → `.prettierrc.yaml`

- [ ] **Step 1: Capture the resolved config before the change**

```bash
node --input-type=module -e '
import { resolveConfig } from "prettier";
const c = await resolveConfig("client/src/main.jsx");
console.log(JSON.stringify(Object.fromEntries(Object.entries(c).sort())));
' > "$SCRATCH/prettier-before.json"; echo "exit=$?"
cat "$SCRATCH/prettier-before.json"
```

Expected: `exit=0` and the eight options from `.prettierrc`.

- [ ] **Step 2: Rename and rewrite as YAML**

```bash
git mv .prettierrc .prettierrc.yaml
```

Replace the whole contents of `.prettierrc.yaml` with:

```yaml
# Prettier owns formatting. ESLint is scoped to defect classes (see
# eslint.config.js), and eslint-config-prettier stops the two from fighting.
# CI runs `npm run format:check`; `npm run format` fixes.

# ---- Layout -----------------------------------------------------------------
printWidth: 100
tabWidth: 2

# ---- Syntax -----------------------------------------------------------------
semi: true
singleQuote: false
trailingComma: none
arrowParens: always
bracketSpacing: true

# ---- Line endings -----------------------------------------------------------
# LF, matching `* text=auto eol=lf` in .gitattributes.
endOfLine: lf
```

- [ ] **Step 3: The resolved config is identical, and it comes from the new file**

```bash
node --input-type=module -e '
import { resolveConfig } from "prettier";
const c = await resolveConfig("client/src/main.jsx");
console.log(JSON.stringify(Object.fromEntries(Object.entries(c).sort())));
' > "$SCRATCH/prettier-after.json"
diff "$SCRATCH/prettier-before.json" "$SCRATCH/prettier-after.json"; echo "diff exit=$?"
npx prettier --find-config-path client/src/main.jsx
npm run format:check > /dev/null 2>&1; echo "format exit=$?"
```

Expected: `diff exit=0`, `.prettierrc.yaml`, `format exit=0`.

- [ ] **Step 4: Commit**

```bash
git commit -q -F - <<'EOF'
chore: rewrite the Prettier config as commented YAML

Same eight options, same values; the resolved config is byte-identical.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 9: Group the package.json scripts

**Files:**

- Modify: `package.json` (`scripts`), `server/package.json` (`scripts`)

JSON cannot hold comments, so order does the grouping: dev, then build/start, then test, then quality, then setup. `client/package.json` is already in that order (`dev`, `build`, `preview`, `test*`) and does not change.

- [ ] **Step 1: Reorder the root scripts**

Replace the `"scripts"` object in `package.json` with:

```text
  "scripts": {
    "dev": "concurrently \"npm run dev -w client\" \"npm run dev -w server\"",
    "dev:client": "npm run dev -w client",
    "dev:server": "npm run dev -w server",
    "build": "npm run build -w client",
    "start": "npm run start -w server",
    "test": "npm run test:scripts && npm run test -w client && npm run test -w server",
    "test:all": "npm run test",
    "test:scripts": "vitest run",
    "test:coverage": "npm run test:coverage -w client && npm run test:coverage -w server",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "knip": "knip",
    "prepare": "node scripts/setup-git-config.mjs"
  },
```

- [ ] **Step 2: Reorder the server scripts**

Replace the `"scripts"` object in `server/package.json` with:

```text
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "postgres:local:start": "powershell -ExecutionPolicy Bypass -File scripts/start-local-postgres.ps1",
    "migrate:postgres": "node scripts/apply-postgres-migrations.js",
    "prisma:generate": "prisma generate",
    "prisma:push": "node scripts/refuse-db-push.js",
    "prisma:validate": "prisma validate",
    "prisma:studio": "prisma studio"
  },
```

- [ ] **Step 3: The same scripts and the same everything else, only reordered**

```bash
node -e '
const { execSync } = require("child_process");
const fs = require("fs");
const sorted = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
let ok = true;
for (const f of ["package.json", "server/package.json"]) {
  const before = JSON.parse(execSync("git show HEAD:" + f, { encoding: "utf8" }));
  const after = JSON.parse(fs.readFileSync(f, "utf8"));
  const same = sorted(before.scripts) === sorted(after.scripts) &&
    sorted({ ...before, scripts: 0 }) === sorted({ ...after, scripts: 0 });
  console.log(f, same ? "same content" : "DIFFERENT");
  ok = ok && same;
}
process.exit(ok ? 0 : 1);
'; echo "exit=$?"
npm run format:check > /dev/null 2>&1; echo "format exit=$?"
npm run test:scripts > /dev/null 2>&1; echo "scripts exit=$?"
```

Expected: `same content` twice, `exit=0`, `format exit=0`, `scripts exit=0` (the Neon invariant reads these manifests).

- [ ] **Step 4: Commit**

```bash
git add package.json server/package.json
git commit -q -F - <<'EOF'
chore: group the npm scripts by purpose

dev, build/start, test, quality, setup. JSON cannot hold comments, so
the order carries the grouping. Content unchanged.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 10: Headers and comments in the ignore files

**Files:**

- Modify: `.gitignore`, `.prettierignore`, `.dockerignore`

Comments and ordering only. The set of patterns does not change. For `.dockerignore`, which has a negation (`!README.md`), the order does not change either.

- [ ] **Step 1: Capture the pattern sets**

```bash
for f in .gitignore .prettierignore; do
  grep -vE '^\s*(#|$)' "$f" | sort > "$SCRATCH/$f.before"
done
grep -vE '^\s*(#|$)' .dockerignore > "$SCRATCH/.dockerignore.before"
```

- [ ] **Step 2: Rewrite `.gitignore`**

Replace the whole file with:

```gitignore
# ---- Dependencies and build output ------------------------------------------
node_modules
dist

# ---- Test output ------------------------------------------------------------
# Coverage output from `npm run test:coverage`.
coverage

# Playwright run output from `npm run test:e2e`.
test-results/
playwright-report/
blob-report/
playwright/.cache/

# ---- Secrets ----------------------------------------------------------------
# server/.env holds the Gemini key and the Postgres connection string. The
# committed template is env.example.
.env

# ---- Local Postgres ---------------------------------------------------------
# Data directory and generated password, both written by
# server/scripts/start-local-postgres.ps1.
.postgres-data
.postgres-pw

# ---- Claude Code / claude-flow local state ----------------------------------
.claude/settings.local.json
.claude/scheduled_tasks.lock
.claude/worktrees/
.swarm/
**/.claude-flow/

# ---- claude-flow generated scaffolding --------------------------------------
# Regenerated by `claude-flow init`, so versioning it produces ~300 files of
# boilerplate and a churning diff on every upgrade. Bespoke project tooling
# (CLAUDE.md, .mcp.json, scripts/) is tracked.
#
# .claude/settings.json is tracked deliberately, despite also being init output:
# it is the only place the hook wiring lives. Untracked, a fresh clone gets
# scripts/skill-router.mjs and friends with nothing invoking them -- and a
# missing hook here fails silently, so the breakage would not announce itself.
# Its permission allowlist is hand-trimmed; if `claude-flow init` overwrites it,
# recover with `git checkout -- .claude/settings.json`.
.claude/agents/
.claude/commands/
.claude/helpers/
.claude/skills/

# ---- Neon agent-skills scaffolding ------------------------------------------
# The skill installer writes a Neon project config into the repo root -- it
# declares Neon Auth, three object-storage buckets and a serverless function --
# plus a sample function and its own lockfile. This app uses Neon only as a
# managed Postgres host: it has its own argon2 auth, no object storage, and
# ships as an Express container, so none of that is reachable from the app.
#
# Ignored rather than deleted once, because it re-appeared within a single
# session after being removed. Root-anchored so it cannot swallow a real file
# somewhere else in the tree.
#
# What an ignore CANNOT cover is the same installer's edits to tracked files:
# it adds @neon/* to the root package.json and, on its second run, silenced the
# resulting knip failure by adding ignoreDependencies to knip.json (now
# knip.jsonc). That is the dangerous case -- a green gate shipping unused
# packages -- so it is pinned in scripts/__tests__/repo-invariants.test.mjs
# instead.
/neon.ts
/hello.ts
/skills-lock.json
```

- [ ] **Step 3: Rewrite `.prettierignore`**

Replace the whole file with:

```gitignore
# Paths `npm run format` and `npm run format:check` skip. The check gates every
# PR, so anything listed here is exempt from that gate as well.

# ---- Dependencies, build and test output ------------------------------------
node_modules
dist
coverage
test-results
playwright-report
blob-report

# ---- Agent tooling and git hooks --------------------------------------------
# .claude-flow holds session-state JSON; a routine `npm run format` once walked
# into it and rewrote local state.
.claude
.claude-flow
.githooks

# ---- Local Postgres state ---------------------------------------------------
.postgres-data
.postgres-pw

# ---- Byte-sensitive or tool-owned files -------------------------------------
# npm writes the lockfile itself.
package-lock.json
# A no-op today, since Prettier has no SQL parser, but migration files are
# byte-sensitive and this records the intent.
server/db/**/*.sql
```

- [ ] **Step 4: Rewrite `.dockerignore`**

Replace the whole file with:

```gitignore
# Keeps the build context small and, more importantly, keeps secrets and host
# state out of the image. `COPY . .` in the build stage would otherwise pull in
# server/.env, which holds the Gemini key and the Postgres connection string.

# ---- Secrets ----------------------------------------------------------------
.env
.env.*
**/.env
**/.env.*

# ---- Dependencies -----------------------------------------------------------
# The image installs its own with `npm ci`.
node_modules
**/node_modules

# ---- Repository and agent tooling -------------------------------------------
.git
.github
.githooks
.claude
.claude-flow

# ---- Build and test output --------------------------------------------------
# client/dist is rebuilt inside the image by `npm run build`.
client/dist
coverage
**/coverage
test-results
playwright-report
blob-report

# ---- Local Postgres state ---------------------------------------------------
.postgres-data
.postgres-pw

# ---- Not needed at runtime --------------------------------------------------
# The negation re-includes README.md, so it has to stay after `*.md`.
docs
e2e
*.md
!README.md
```

- [ ] **Step 5: The patterns are unchanged**

```bash
for f in .gitignore .prettierignore; do
  grep -vE '^\s*(#|$)' "$f" | sort | diff "$SCRATCH/$f.before" - > /dev/null; echo "$f exit=$?"
done
grep -vE '^\s*(#|$)' .dockerignore | diff "$SCRATCH/.dockerignore.before" - > /dev/null; echo ".dockerignore exit=$?"
git status --porcelain --ignored > "$SCRATCH/ignored-after.txt"
grep -c '^!!' "$SCRATCH/ignored-after.txt"
npm run format:check > /dev/null 2>&1; echo "format exit=$?"
```

Expected: three `exit=0`. The ignored-path count is non-zero, since `node_modules`, `coverage` and the rest are still ignored. `format exit=0`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .prettierignore .dockerignore
git commit -q -F - <<'EOF'
chore: group the ignore files under commented headers

Comments and ordering only; each file's pattern set is unchanged, and
.dockerignore keeps its order because of the !README.md negation.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 11: Headers and comments in the Vitest and Vite configs

**Files:**

- Modify: `vitest.config.js`, `client/vite.config.js`

- [ ] **Step 1: Rewrite `vitest.config.js`**

Replace the whole file with:

```js
import { defineConfig } from "vitest/config";

// The root Vitest project covers the repo tooling in scripts/ only; `npm test`
// runs it first, as `test:scripts`. The workspaces have their own configs:
// client/vite.config.js and server/vitest.config.js.
export default defineConfig({
  test: {
    // Matched by filename, so tests in scripts/__tests__/ are found without
    // naming the folder.
    include: ["scripts/**/*.test.mjs"],
    // Tooling scripts run under Node, never in a browser.
    environment: "node"
  }
});
```

- [ ] **Step 2: Rewrite `client/vite.config.js`**

Replace the whole file with the following. The values are unchanged. The coverage comment loses its contradiction: it said "floored to whole percent" and, one paragraph later, "one decimal", and the values are one decimal.

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // ---- Dev server (npm run dev:client) -------------------------------------
  // /api goes to the Express server, so the client calls relative paths in
  // development exactly as it does in production, where one process serves
  // both the bundle and the API.
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  },

  // ---- Preview server (npm run preview, and the E2E suite) -----------------
  // `vite preview` does not inherit `server.proxy`. The E2E suite runs against
  // the built bundle rather than the dev server, so that it exercises the
  // artifact that actually ships -- which needs the same /api proxy.
  preview: {
    port: 4173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  },

  // ---- Tests and coverage (npm run test -w client) -------------------------
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    // Suites may use describe / test / expect without importing them.
    globals: true,
    coverage: {
      provider: "v8",
      // Everything under src is measured. Only the tests and their setup are
      // excluded -- narrowing this further would report a better number rather
      // than a truer one.
      include: ["src/**"],
      exclude: ["**/*.test.{js,jsx}", "src/test/**"],
      reporter: ["text", "html"],
      // A ratchet, not a target: each floor is the measured value floored to
      // one decimal, so a green tree never fails and a real slip does. Raise
      // them when coverage rises; never lower them to make a build pass. The
      // measured values and their dates are recorded in CLAUDE.md.
      //
      // Aspirational values would block every PR from day one, which is how
      // coverage gates get deleted instead of met. Whole percent was tried
      // first and let a sub-point gain evaporate without tripping anything;
      // these suites are deterministic -- no randomness, no timing-dependent
      // branches -- so a tenth of a point is a safe margin.
      thresholds: {
        statements: 98.6,
        branches: 93.6,
        functions: 98.7,
        lines: 99.3
      }
    }
  }
});
```

- [ ] **Step 3: Only comments and blank lines changed**

```bash
git diff -U0 -- vitest.config.js client/vite.config.js | grep -E "^[-+]" | grep -vE "^(\+\+\+|---)" | grep -vE "^[-+]\s*(//.*)?$"; echo "exit=$? (1 = only comments/blank lines changed)"
npm run lint > /dev/null 2>&1; echo "lint exit=$?"
npm run format:check > /dev/null 2>&1; echo "format exit=$?"
npm run test:scripts > /dev/null 2>&1; echo "scripts exit=$?"
npm run test -w client > "$SCRATCH/client-t11.txt" 2>&1; echo "client exit=$?"
```

Expected: `exit=1` from the first grep, meaning no code line changed, then four `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.js client/vite.config.js
git commit -q -F - <<'EOF'
chore: section and explain the Vitest and Vite configs

Comments only. Also removes a contradiction in the client coverage note,
which called the floors "whole percent" one paragraph before calling
them one decimal.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 12: VS Code hides generated output

**Files:**

- Create: `.vscode/settings.json`

- [ ] **Step 1: Write the settings**

`.vscode/settings.json`:

```jsonc
{
  // Generated output and local machine state, hidden from the explorer only.
  // Everything here still exists on disk and is gitignored.
  "files.exclude": {
    // VS Code's own default, repeated so this file does not depend on how
    // workspace settings merge with user settings.
    "**/.git": true,

    // Test and coverage reports (npm run test:coverage, npm run test:e2e)
    "**/coverage": true,
    "test-results": true,
    "playwright-report": true,
    "blob-report": true,

    // Build output (npm run build)
    "client/dist": true,

    // Local Postgres data and password (server/scripts/start-local-postgres.ps1)
    ".postgres-data": true,
    ".postgres-pw": true,

    // Agent tooling state
    "**/.claude-flow": true,
    "skills-lock.json": true
  }
}
```

- [ ] **Step 2: Formatting and ignore status**

```bash
git check-ignore -q .vscode/settings.json; echo "ignored exit=$? (1 = not ignored, good)"
npx prettier --check .vscode/settings.json; echo "format exit=$?"
```

Expected: `ignored exit=1`, `format exit=0`. If Prettier wants to reflow it, run `npx prettier --write .vscode/settings.json` and check that the comments survived.

- [ ] **Step 3: Commit**

```bash
git add .vscode/settings.json
git commit -q -F - <<'EOF'
chore: hide generated output from the VS Code explorer

Coverage, Playwright output, the client build, local Postgres state and
agent tooling state. Hidden only; nothing is removed.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 13: README layout and CLAUDE.md file organization

**Files:**

- Modify: `README.md` (the `## Repository Layout` section), `CLAUDE.md` (the `## File Organization` section)

- [ ] **Step 1: Replace the README's Repository Layout section**

Replace everything from `## Repository Layout` up to, but not including, `## Prerequisites` with:

````markdown
## Repository Layout

```text
.
|-- client/                   # React 18 + Vite app (npm workspace)
|   |-- vite.config.js        # dev and preview proxy, client test and coverage config
|   `-- src/
|       |-- main.jsx          # entry point
|       |-- App.jsx           # top-level routing and state
|       |-- app/              # app-wide logic: API client, cache, events, routing, units
|       |-- assets/           # static images
|       |-- components/       # shared components: modal portal, physique silhouette
|       |-- hooks/            # shared hooks: scroll lock, close on Escape
|       |-- pages/            # one folder per page: auth, dashboard, home, preview,
|       |                     #   workout-result
|       |-- styles/           # global CSS
|       `-- test/             # Vitest setup
|-- server/                   # Express 4 API (npm workspace)
|   |-- db/postgres/          # SQL migrations, applied in order
|   |-- prisma/               # Prisma schema
|   |-- scripts/              # local Postgres, migration runner, db push guard
|   `-- src/
|       |-- index.js          # app bootstrap, with corsPolicy, shutdown, staticClient
|       |-- db/               # Postgres pool, Prisma client, migration runner
|       |-- middleware/       # request context, error handler
|       |-- repositories/     # all Prisma data access
|       |-- routes/           # auth, dashboard, external APIs, generate, system
|       `-- services/         # auth, dashboard, external, http, platform
|-- e2e/                      # Playwright suites: smoke, a11y, deployable
|-- scripts/                  # repo tooling and Claude Code hook targets
|-- security/                 # audit-ci allowlist and advisory reviews
|-- docs/                     # deploy runbook, implementation plans, design specs
|-- .github/                  # CI and deploy workflows, Dependabot, CODEOWNERS
|-- .vscode/                  # hides generated output from the file tree
|-- Dockerfile                # production image: API plus client bundle
|-- docker-compose.yml        # local Postgres and Redis only
|-- render.yaml               # Render blueprint
|-- env.example               # template for server/.env
|-- eslint.config.js          # lint rules (defect classes, not style)
|-- .prettierrc.yaml          # formatting
|-- knip.jsonc                # unused files, exports and dependencies
|-- playwright.config.js      # E2E runner
|-- vitest.config.js          # tests for scripts/
`-- package.json              # npm workspaces and root scripts
```

Tests live in a `__tests__/` folder beside the code they cover.
````

- [ ] **Step 2: Replace CLAUDE.md's File Organization section**

Replace everything from `## File Organization` up to, but not including, `## Project Architecture` with:

```markdown
## File Organization

- NEVER save to root folder
- `client/src` — React 18 + Vite frontend source. Only `main.jsx` and `App.jsx` sit at
  this level; global CSS is in `client/src/styles/`
- `client/src/pages/<page>` — one folder per page: the page component
  (`<Name>Page.jsx` and its `.css`) plus its own parts in `views/`, `components/`,
  `hooks/` and `styles/`. Folder names are lowercase, kebab-case where needed
  (`workout-result/`)
- `server/src` — Express 4 API, services, routes. Only the app bootstrap
  (`index.js`, `corsPolicy.js`, `shutdown.js`, `staticClient.js`) stays at this level
- `server/src/services/<domain>` — `auth/`, `dashboard/`, `external/`, `http/`
  (request validation, API schemas, error responses) and `platform/` (metrics, error
  tracking, health, env validation)
- `server/src/db` — the Postgres pool, the Prisma client and the migration runner
- `server/src/repositories` — **all Prisma data access lives here.** Routes and services
  call these; nothing else should touch `prisma.*` directly
- `server/prisma` — the Prisma schema
- `server/db/postgres` — the SQL migrations, applied in order by `migrate:postgres`
- `server/scripts` — server operational scripts (local Postgres, migrations)
- **Tests live in a `__tests__/` folder beside the code they cover** —
  `views/__tests__/MealView.test.jsx` tests `views/MealView.jsx`. Every test config
  (Vitest, ESLint, coverage, knip) finds tests by the `*.test.*` name, not the folder,
  so a new `__tests__/` needs no config change. `e2e/` is the exception: it is already
  a test-only folder
- `docs/plans` — implementation plans, one file per effort, named `YYYY-MM-DD-name.md`
- `docs/specs` — design specs, named to match the plan they belong to
- `scripts/` — repo-level tooling (Claude Code hook targets live here)
- `security/` — the audit-ci allowlist (`audit-ci.json`) and the advisory reviews it is
  checked against
- The root holds only what a tool requires there. `CODEOWNERS` is in `.github/`, and
  `.vscode/settings.json` hides generated output from the file tree
```

Two corrections ride along, both checked against the tree. `staticClient.js` also sits at the `server/src` root. `server/prisma` holds only `schema.prisma`: the migrations are the SQL in `server/db/postgres`.

- [ ] **Step 3: Every path the new text names exists**

```bash
for p in client/src/main.jsx client/src/App.jsx client/src/styles client/src/pages/workout-result \
  server/src/staticClient.js server/src/services/auth server/src/services/platform \
  server/prisma/schema.prisma server/db/postgres security/audit-ci.json .github/CODEOWNERS \
  .vscode/settings.json client/src/pages/dashboard/views/__tests__/MealView.test.jsx \
  .prettierrc.yaml knip.jsonc; do
  [ -e "$p" ] || echo "MISSING $p"
done; echo "done"
npm run format:check > /dev/null 2>&1; echo "format exit=$?"
```

Expected: just `done`, with no `MISSING` lines, and `format exit=0`.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -q -F - <<'EOF'
docs: map the new layout in README and CLAUDE.md

README gets an annotated tree. CLAUDE.md's File Organization records
the __tests__/ convention, page folders and service domains, and
corrects two facts: staticClient.js is also bootstrap, and migrations
live in server/db/postgres rather than server/prisma.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
```

---

### Task 14: Final verification against the baseline

**Files:** none changed.

- [ ] **Step 1: Structural checks**

```bash
node "$SCRATCH/check-specifiers.mjs"; echo "specifiers exit=$?"
node "$SCRATCH/find-stale-paths.mjs" "$SCRATCH/dry-run.txt"; echo "stale exit=$?"
git ls-files | grep -E "\.test\.(js|jsx|mjs)$" | grep -v "/__tests__/"; echo "(nothing above = every test is in __tests__/)"
ls client/src/pages
```

Expected: `All 519 relative specifiers resolve.`, `No stale paths`, no stray tests, and `auth dashboard home preview workout-result` (folders only).

- [ ] **Step 2: Every gate, with the unit counts compared to the baseline**

```bash
npm run lint > "$SCRATCH/final-lint.txt" 2>&1; echo "lint exit=$?"
npm run format:check > "$SCRATCH/final-format.txt" 2>&1; echo "format exit=$?"
npm run knip > "$SCRATCH/final-knip.txt" 2>&1; echo "knip exit=$?"
npm run build > "$SCRATCH/final-build.txt" 2>&1; echo "build exit=$?"
grep -c "chunks are larger than 500 kB" "$SCRATCH/final-build.txt"
npm run test:scripts > "$SCRATCH/final-scripts.txt" 2>&1; echo "scripts exit=$?"
npm run test:coverage -w client > "$SCRATCH/final-client.txt" 2>&1; echo "client exit=$?"
npm run test:coverage -w server > "$SCRATCH/final-server.txt" 2>&1; echo "server exit=$?"
for f in "$SCRATCH"/final-{scripts,client,server}.txt; do
  echo "== $(basename "$f" | sed 's/final/before/')"
  sed 's/\x1b\[[0-9;]*m//g' "$f" | grep -E "Test Files|^ +Tests |All files"
done > "$SCRATCH/final-summary.txt"
diff "$SCRATCH/before-summary.txt" "$SCRATCH/final-summary.txt"; echo "diff exit=$?"
```

Expected: every gate `exit=0` and a `0` count for the chunk-size warning. `diff exit=1` is correct here, and the diff must be exactly one changed line: the scripts suite's `Tests` count, two higher than the baseline because Task 7 added two tests. Every other line, including both `All files` coverage lines and every `Test Files` count, must match. Anything else in the diff is a regression.

- [ ] **Step 3: E2E**

```bash
npm run test:e2e > "$SCRATCH/final-e2e.txt" 2>&1; echo "e2e exit=$?"
tail -3 "$SCRATCH/final-e2e.txt"
```

Expected: `e2e exit=0`, `19 passed`, the same as the Task 0 baseline. `npm run build` in Step 2 already rebuilt the bundle this suite runs against.

- [ ] **Step 4: The hook wiring still resolves**

```bash
node scripts/codex-handoff.mjs --hook > /dev/null 2>&1; echo "codex-handoff exit=$?"
node scripts/scrub-junk-files.cjs --dry-run > /dev/null 2>&1; echo "scrub exit=$?"
echo '{"prompt":"fix a bug"}' > "$SCRATCH/prompt.json"
node scripts/skill-router.mjs < "$SCRATCH/prompt.json" > /dev/null 2>&1; echo "skill-router exit=$?"
```

Expected: three `exit=0`.

- [ ] **Step 5: Review the branch as a whole**

```bash
git log --oneline chore/guard-neon-scaffolding..HEAD
git diff --stat chore/guard-neon-scaffolding..HEAD | tail -1
git status --porcelain
```

Expected: the spec commit, this plan's commit and the eleven task commits, and a clean status. Pushing and opening a PR are for the user to ask for. Nothing in this plan does either.
