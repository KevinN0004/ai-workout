# Readability follow-up: Phases 0 and 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the red dependency audit, close the `.env.*` gap, and land #189 and the 14-PR readability stack on `main`, leaving `main` green with the stack tip's coverage as the baseline for Phase 2.

**Architecture:** Phases 0 and 1 of `docs/specs/2026-10-10-readability-follow-up-design.md`. Nothing here changes coverage: one lockfile bump, one ignore rule, one comment-only commit, and merges. Two small PRs branch from `main`; the comment fix is a commit on #199; the owner does the merges and the settings change.

**Tech Stack:** npm workspaces, audit-ci, GitHub (gh CLI), git, Vitest, Playwright.

---

## Conventions

- **Who does what.** Tasks marked **(owner)** change a GitHub setting or merge a PR, and only the owner does them. Every other task is done by the agent, which pushes branches and opens PRs but never merges.
- **Shell.** Git Bash, from the repo root:

  ```bash
  cd /d/ai-workout
  SCRATCH=/c/Users/nguye/AppData/Local/Temp/claude/d--ai-workout/<session>/scratchpad/run   # any folder outside the repo
  TOOLS="$SCRATCH/tools"
  ```

  `same-code.mjs` and `escapes-intact.mjs` are listed in full in `docs/plans/2026-09-29-code-readability.md`, Task 0. If `$TOOLS` does not hold them, copy them from there.

- **Never gate on a pipe.** Redirect to a file and read `$?`.
- **Never read, stat or print `server/.env`**, or any real `.env` file. Use git commands on names only.
- **Postgres** must be up for the server suite: `npm run postgres:local:start -w server`.
- **Commit trailer.** Every commit message ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.
- **Merge method.** Every merge in this plan uses **"Create a merge commit"** (`gh pr merge N --merge`). Squash and rebase merges conflict at every step of the stack.

---

### Task 1: Clear the two audit advisories with a lockfile-only bump

**Files:**

- Modify: `package-lock.json` (only)

- [ ] **Step 1: Branch from `main`**

```bash
git fetch origin
git switch -c fix/audit-advisories origin/main
git log --oneline -1
```

Expected: `9b85b7d Merge pull request #179 …`, or a later `main` if anything has merged since.

- [ ] **Step 2: Watch the audit fail**

```bash
npx --yes audit-ci@7.1.0 --config security/audit-ci.json > "$SCRATCH/audit-before.txt" 2>&1; echo "audit exit=$?"
grep -E "GHSA-pqg4-j6r4-53mv|GHSA-68fv-2mgg-jv7q" "$SCRATCH/audit-before.txt"
```

Expected: `audit exit=1`, and both advisory IDs in the output (shell-quote through `concurrently>shell-quote`, and source-map-js).

- [ ] **Step 3: Update the two packages in the lockfile only**

```bash
npm update concurrently source-map-js --package-lock-only > "$SCRATCH/npm-update.txt" 2>&1; echo "update exit=$?"
git status --porcelain
```

Expected: `update exit=0`, and `git status` lists only ` M package-lock.json`. `package.json` does not change, because `^10.0.5` already admits concurrently 10.0.6.

- [ ] **Step 4: Confirm the resolved versions**

```bash
node -e "const p=require('./package-lock.json').packages;for(const [k,v] of Object.entries(p))if(['concurrently','shell-quote','source-map-js'].some(n=>k===n||k.endsWith('/node_modules/'+n)||k==='node_modules/'+n))console.log(k,v.version)"
```

Expected: every `concurrently` entry at `10.0.6`, every `shell-quote` at `1.12.0` or later, and every `source-map-js` at `1.2.2` or later. No entry at shell-quote below `1.11.0` or source-map-js below `1.2.2`.

- [ ] **Step 5: Watch the audit pass**

```bash
npx --yes audit-ci@7.1.0 --config security/audit-ci.json > "$SCRATCH/audit-after.txt" 2>&1; echo "audit exit=$?"
```

Expected: `audit exit=0`. The only advisories left are the two prisma ones already allowlisted in `security/audit-ci.json`.

- [ ] **Step 6: Install from the new lockfile and run the gates**

```bash
npm ci > "$SCRATCH/ci.txt" 2>&1; echo "npm ci exit=$?"
npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"
npm run test:coverage > "$SCRATCH/coverage.txt" 2>&1; echo "test:coverage exit=$?"
npm run test:e2e > "$SCRATCH/e2e.txt" 2>&1; echo "test:e2e exit=$?"; tail -3 "$SCRATCH/e2e.txt"
```

Expected: every exit `0`, and `19 passed`. source-map-js is build tooling, so the build and coverage runs are what exercise the change.

- [ ] **Step 7: Commit and push**

```bash
git add package-lock.json
git commit -F - <<'EOF'
fix(deps): clear the shell-quote and source-map-js advisories

A lockfile-only update: concurrently 10.0.5 pinned shell-quote 1.9.0
(GHSA-pqg4-j6r4-53mv, critical) and 10.0.6 pins 1.12.0; source-map-js
moves to 1.2.2 (GHSA-68fv-2mgg-jv7q, high). Both are within the existing
semver ranges, so package.json is unchanged. The required "Lint, format,
audit" check fails on every open PR until this lands.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
git push -u origin fix/audit-advisories > "$SCRATCH/push.txt" 2>&1; echo "push exit=$?"
```

- [ ] **Step 8: Open the PR**

```bash
gh pr create --base main --head fix/audit-advisories \
  --title "fix(deps): clear the shell-quote and source-map-js advisories" \
  --body-file "$SCRATCH/pr-audit.md"
```

Write `$SCRATCH/pr-audit.md` first, with the Write tool. It covers: the two advisories with IDs and severity, why neither is reachable at runtime (shell-quote only through `npm run dev`; source-map-js only through build and test tooling, plus one prisma-config copy not traced), the before and after audit exits, the resolved versions from Step 4, the gate exits from Step 6, and a note that every open PR's audit check needs a fresh run after this merges (Task 5). End it with the claude-flow line.

---

### Task 2: Ignore `.env` variants

**Files:**

- Modify: `.gitignore:15-18`

- [ ] **Step 1: Branch from `main`**

```bash
git switch -c chore/ignore-env-variants origin/main
```

- [ ] **Step 2: Watch the variants go unignored**

```bash
git check-ignore -v .env.local server/.env.production client/.env.development.local > "$SCRATCH/ci-before.txt" 2>&1; echo "check-ignore exit=$?"
```

Expected: `check-ignore exit=1`, meaning none of the three names is ignored. The command checks names only; none of these files needs to exist.

- [ ] **Step 3: Add the rule**

Replace this block in `.gitignore`:

```gitignore
# ---- Secrets ----------------------------------------------------------------
# server/.env holds the Gemini key and the Postgres connection string. The
# committed template is env.example.
.env
```

with:

```gitignore
# ---- Secrets ----------------------------------------------------------------
# server/.env holds the Gemini key and the Postgres connection string. The
# committed template is env.example. Variants such as .env.local and
# server/.env.production, which Vite and other tools also read, are ignored too;
# the template's name has no leading dot, so the second rule never matches it.
.env
.env.*
```

- [ ] **Step 4: Watch the variants become ignored, and the template stay tracked**

```bash
git check-ignore -q .env.local; echo "a=$?"
git check-ignore -q server/.env.production; echo "b=$?"
git check-ignore -q client/.env.development.local; echo "c=$?"
git check-ignore -q env.example; echo "template=$?"
git ls-files -ci --exclude-standard > "$SCRATCH/tracked-ignored.txt"; echo "tracked-and-ignored lines: $(wc -l < "$SCRATCH/tracked-ignored.txt")"
```

Expected: `a=0`, `b=0`, `c=0`, `template=1`, and `tracked-and-ignored lines: 0`, so no tracked file becomes ignored.

- [ ] **Step 5: Gates, commit, push, PR**

```bash
npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"
git add .gitignore
git commit -F - <<'EOF'
chore: ignore .env variants

Only .env was ignored, so .env.local or server/.env.production could be
committed by a plain git add -A in a public repo. The template is named
env.example, with no leading dot, so the new rule cannot match it.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
git push -u origin chore/ignore-env-variants > "$SCRATCH/push2.txt" 2>&1; echo "push exit=$?"
gh pr create --base main --head chore/ignore-env-variants --title "chore: ignore .env variants" --body-file "$SCRATCH/pr-env.md"
```

`$SCRATCH/pr-env.md` gives the Step 2 and Step 4 results, says the change touches only `.gitignore`, and ends with the claude-flow line.

---

### Task 3: Turn on secret scanning and push protection (owner)

- [ ] **Step 1: Enable both**

In GitHub: the repository's **Settings → Advanced Security** (named "Code security" on older layouts), turn on **Secret Protection**, then **Push protection**. Or, with `gh` authenticated as the owner:

```bash
gh api -X PATCH repos/KevinN0004/ai-workout \
  -f 'security_and_analysis[secret_scanning][status]=enabled' \
  -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
```

- [ ] **Step 2: Confirm**

```bash
gh api repos/KevinN0004/ai-workout --jq '.security_and_analysis | {secret_scanning, secret_scanning_push_protection}'
```

Expected: both `"status": "enabled"`.

---

### Task 4: Merge the two Phase 0 PRs (owner)

- [ ] **Step 1: Merge Task 1's PR first**

Wait for its checks to go green (`gh pr checks <N> --watch`), then merge it with **"Create a merge commit"**.

- [ ] **Step 2: Wait for `main` to go green**

```bash
gh run list --branch main --limit 1
gh run watch <run-id>
```

Expected: the CI run on `main` succeeds, including "Lint, format, audit".

- [ ] **Step 3: Merge Task 2's PR the same way**, then wait for `main` again.

---

### Task 5: Refresh the blocked stack PRs' checks

A plain re-run reuses the old merge commit, which still has the vulnerable lockfile, so it stays red. Closing and reopening a PR fires the `reopened` event against the current `main`. Only the PRs whose audit check is red need this: #188, #195, #196, #197 and #198. #199 is refreshed by Task 7's push. #180–#187 passed before the advisories existed, and each merge onto `main` is checked by `main`'s own CI in Task 8.

- [ ] **Step 1: Reopen in pairs, waiting for each pair to finish**

Each CI run pulls `postgres:18` in four jobs, and a burst of reopens has already hit Docker Hub's unauthenticated rate limit once. So reopen two at a time:

```bash
for n in 188 195; do gh pr close $n; gh pr reopen $n; done
gh pr checks 188 --watch; gh pr checks 195 --watch
for n in 196 197; do gh pr close $n; gh pr reopen $n; done
gh pr checks 196 --watch; gh pr checks 197 --watch
gh pr close 198; gh pr reopen 198
gh pr checks 198 --watch
```

Expected: every check passes on each PR. If a job fails at "Initialize containers" with `toomanyrequests`, that is the rate limit, not the code. Wait ten minutes, then re-run that job: `gh run rerun <run-id> --failed`.

- [ ] **Step 2: Confirm the states**

```bash
for n in 188 195 196 197 198; do gh pr view $n --json number,mergeStateStatus -q '"\(.number) \(.mergeStateStatus)"'; done
```

Expected: each prints `CLEAN`.

---

### Task 6: Merge #189 (owner)

#189 pins the deploy checkout to the commit CI passed, so the deploys the stack's merges trigger each ship a commit that passed CI. It touches `.github/workflows/deploy.yml` and appends to `scripts/__tests__/repo-invariants.test.mjs`, and it merges clean onto the stack tip.

- [ ] **Step 1: Mark it ready and refresh its checks**

```bash
gh pr ready 189
gh pr close 189; gh pr reopen 189
gh pr checks 189 --watch
```

Expected: every check passes, including the audit, now that Task 1 is on `main`.

- [ ] **Step 2: Merge it with "Create a merge commit"**, then wait for the CI run on `main` to go green.

---

### Task 7: The comment-only errata commit on #199

Three headers run past the SOP's four lines of text, and the CORS comment and its twin in the test file are untrue. Fixing them on #199, the stack's last PR, keeps the stack's comments true when it lands, and the push also refreshes #199's checks.

**Files:**

- Modify: `server/src/corsPolicy.js:1-8` (header) and `:40` (comment)
- Modify: `server/src/__tests__/index.cors.test.js:66` (comment)
- Modify: `server/src/shutdown.js:1-8` (header, which is also the export's summary)
- Modify: `scripts/manual-deploy.mjs:2-31` (header, split into a header and a "Usage" block)

- [ ] **Step 1: Check out #199 and measure the headers**

```bash
git switch docs/readability-final-review
git pull --ff-only
git status --porcelain
```

Expected: a clean tree at `c483c6f` or later.

Create `$SCRATCH/header-text-lines.mjs` with the Write tool:

```js
// Prints how many lines of text each file's first comment holds: the count
// SOP rule 1 limits to four. Lines holding only a delimiter are not counted.
import { readFileSync } from "node:fs";

for (const file of process.argv.slice(2)) {
  let text = readFileSync(file, "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/^#!.*\r?\n/, "");
  const start = text.indexOf("/*");
  const end = text.indexOf("*/", start);
  const lines = text
    .slice(start + 2, end)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\*?\s?/, "").trim())
    .filter((line) => line && line !== "*");
  console.log(`${lines.length}\t${file}`);
}
```

```bash
node "$SCRATCH/header-text-lines.mjs" server/src/corsPolicy.js server/src/shutdown.js scripts/manual-deploy.mjs
```

Expected: `5`, `5` and `23`.

- [ ] **Step 2: Rewrite the `corsPolicy.js` header**

Replace:

```js
/**
 * The CORS origin allowlist.
 *
 * Extracted from index.js so the policy can be exercised directly rather than
 * only by booting the app and issuing a request. It is the control that decides
 * which sites may make authenticated cross-origin calls, so it is worth being
 * readable on its own.
 */
```

with:

```js
/**
 * The CORS origin allowlist: the control that decides which sites may make
 * credentialed cross-origin calls to the API. Kept apart from index.js so it
 * reads on its own; index.cors.test.js exercises it through the running app.
 */
```

No test calls `createCorsPolicy` directly (`git grep -n createCorsPolicy -- '*.test.js'` finds nothing), so the header says the policy is exercised through the app.

- [ ] **Step 3: Rewrite the untrue CORS comment**

In `server/src/corsPolicy.js`, inside `origin(origin, callback)`, replace:

```js
// Same-origin and non-browser callers send no Origin header.
```

with:

```js
// No Origin header: a non-browser caller, or a same-origin navigation or
// plain GET. A browser does send one on same-origin writes, and Chromium on
// the bundle's crossorigin script and stylesheet loads, so a deployment that
// serves its own page must list its own origin.
```

The second sentence is what a Chromium probe showed on 2026-10-09. `cors()` is mounted at `server/src/index.js` before the static client, so the bundle's own `crossorigin` loads pass through the allowlist.

- [ ] **Step 4: Rewrite its twin in the test file**

In `server/src/__tests__/index.cors.test.js`, inside the test "a caller that sends no Origin at all is served", replace:

```js
// Same-origin browser requests and non-browser callers send no Origin.
```

with:

```js
// Non-browser callers, and a browser's same-origin navigations and plain
// GETs, send no Origin.
```

- [ ] **Step 5: Trim the `shutdown.js` header**

Replace:

```js
/**
 * Builds the routine run on SIGTERM/SIGINT: stop accepting connections, drain,
 * then release every external resource before exiting.
 *
 * Dependencies are injected so the sequence is unit-testable by direct call.
 * That matters because Windows does not deliver POSIX signals to Node the way
 * the Linux CI runner does, so signal-driven tests would not run locally.
 */
```

with:

```js
/**
 * Builds the routine run on SIGTERM/SIGINT: stop accepting connections, drain,
 * then release every external resource before exiting. Its dependencies are
 * injected so the sequence can be tested by direct call: Windows does not
 * deliver POSIX signals to Node the way the Linux CI runner does.
 */
```

- [ ] **Step 6: Split the `manual-deploy.mjs` header**

Replace lines 2-31, from `/*` through ` */`, with a four-line header followed by a separate "Usage" block. The block holds the rest of the old header's text unchanged:

```js
/*
 * Does by hand what .github/workflows/deploy.yml does, in the same order, for
 * when Actions cannot run it: a billing block, an outage, or a deploy from a
 * machine rather than CI. The usage notes below list its steps, the variables
 * it reads, and why the order matters.
 */

/*
 * Usage
 *
 *   1. Validate the inputs                (the workflow does NOT do this)
 *   2. Apply migrations                   <- must precede the deploy
 *   3. Record the instance serving now, then POST the Render deploy hook
 *   4. Poll /api/ready until the NEW instance reports ready
 *
 * The ordering is the reason the workflow exists rather than letting Render
 * deploy on push: 002_password_changed_at.sql adds a column userReadRepository
 * selects on every user read, so code started against an unmigrated database
 * fails every authenticated request, not just the new routes. Migration failure
 * here stops the deploy, exactly as it does in the workflow.
 *
 * Reads three variables and never prints their values:
 *   PRODUCTION_DATABASE_URL   Neon POOLED string, with ?sslmode=verify-full
 *   RENDER_DEPLOY_HOOK_URL    Render -> the service -> Settings -> Deploy Hook
 *   RENDER_SERVICE_URL        https://<service>.onrender.com
 *
 *   node scripts/manual-deploy.mjs --dry-run   # check inputs, change nothing
 *   node scripts/manual-deploy.mjs             # migrate, deploy, wait
 *
 * The validation and the switch-over wait are exported and tested -- the Deploy
 * workflow imports the wait too, so the two cannot disagree about what "live"
 * means. The steps that change something run only when this file is invoked
 * directly, so importing it is inert.
 */
```

Keep line 1, `#!/usr/bin/env node`, as it is.

- [ ] **Step 7: Prove the change is comment-only, and the headers are within the limit**

```bash
node "$TOOLS/same-code.mjs" D:/ai-workout > "$SCRATCH/errata-same.txt" 2>&1; echo "same-code exit=$?"; cat "$SCRATCH/errata-same.txt"
node "$TOOLS/escapes-intact.mjs" D:/ai-workout > "$SCRATCH/errata-esc.txt" 2>&1; echo "escapes exit=$?"
node "$SCRATCH/header-text-lines.mjs" server/src/corsPolicy.js server/src/shutdown.js scripts/manual-deploy.mjs
```

Expected:

- `same-code exit=0`, with `same` for all four files and `comment-only: 4 source file(s)`;
- `escapes exit=0`;
- header counts of `3`, `4` and `4`.

- [ ] **Step 8: Gates**

```bash
npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"
npm -w server exec vitest run src/__tests__/index.cors.test.js > "$SCRATCH/cors.txt" 2>&1; echo "cors test exit=$?"
```

Expected: every exit `0`.

- [ ] **Step 9: Commit and push**

```bash
git add server/src/corsPolicy.js server/src/__tests__/index.cors.test.js server/src/shutdown.js scripts/manual-deploy.mjs
git commit -F - <<'EOF'
docs: errata for the readability stack's comments

The CORS comment said same-origin callers send no Origin header; browsers
send one on same-origin writes, and Chromium on the bundle's crossorigin
loads, so a deployment must list its own origin. Its twin in
index.cors.test.js is corrected too. The three headers past the SOP's four
lines are trimmed; manual-deploy.mjs keeps its notes in a separate Usage
block. Comment-only: same-code reports every file the same.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
echo "commit exit=$?"
git push > "$SCRATCH/push3.txt" 2>&1; echo "push exit=$?"
gh pr checks 199 --watch
```

Expected: `commit exit=0`, `push exit=0`, and every check on #199 passes.

- [ ] **Step 10: Note the commit in #199's description**

```bash
gh pr view 199 --json body -q .body > "$SCRATCH/pr199-body.md"
```

Add an "Errata" paragraph above the claude-flow line. Use a script written with the Write tool that refuses unless the attribution line is found exactly once. The paragraph names the commit, the five changes, and the Step 7 evidence. Then:

```bash
gh pr edit 199 --body-file "$SCRATCH/pr199-body.md"
```

---

### Task 8: Merge the stack in order (owner)

- [ ] **Step 1: Confirm every stack PR is mergeable**

```bash
for n in 180 181 182 183 184 185 186 187 188 195 196 197 198 199; do gh pr view $n --json number,mergeStateStatus -q '"\(.number) \(.mergeStateStatus)"'; done
```

Expected: each prints `CLEAN`.

- [ ] **Step 2: Merge one PR, then wait for `main`**

For each PR in this order: **#180, #181, #182, #183, #184, #185, #186, #187, #188, #195, #196, #197, #198, #199**:

1. Merge it with **"Create a merge commit"** (`gh pr merge <n> --merge`).
2. Wait for the CI run on `main` to finish green (`gh run list --branch main --limit 1`, then `gh run watch <id>`).
3. Merge the next one only after that.

Each green run on `main` triggers a deploy. The deploy workflow's concurrency group keeps at most one pending run, so a quick series collapses into a few deploys, and Task 6's #189 makes each deploy check out the commit CI passed.

**If a run on `main` fails:** stop. Do not merge further. Read the failing job's log, `gh run view <id> --log-failed`. A Docker `toomanyrequests` failure is the rate limit, so re-run that job. Anything else goes back to the agent before the next merge.

---

### Task 9: Confirm `main` and record the Phase 2 baseline

- [ ] **Step 1: Confirm `main` holds exactly the stack plus Phase 0 and #189**

```bash
git fetch origin
git diff --stat docs/readability-final-review origin/main
```

Expected: the only files listed are `package-lock.json` (Task 1), `.gitignore` (Task 2), `.github/workflows/deploy.yml` and `scripts/__tests__/repo-invariants.test.mjs` (#189). The stack's own files show no difference.

- [ ] **Step 2: Measure coverage on `main`**

```bash
git switch --detach origin/main
npm ci > "$SCRATCH/ci-main.txt" 2>&1; echo "npm ci exit=$?"
npm run test:coverage > "$SCRATCH/coverage-main.txt" 2>&1; echo "test:coverage exit=$?"
grep -E "All files|Tests " "$SCRATCH/coverage-main.txt"
```

Expected: `test:coverage exit=0`. Client and server statements, branches, functions and lines equal the stack tip's: client 98.72 / 93.73 / 98.79 / 99.36, server 94.30 / 86.70 / 95.43 / 95.66. Nothing in Phases 0 or 1 changes coverage, so any difference is a finding. Stop and report it.

- [ ] **Step 3: Phase report**

Report to the owner:

- each PR merged, with its merge commit;
- that `main`'s last CI run is green;
- the Step 2 coverage figures, which are Phase 2's baseline;
- anything deferred.

There is no floor PR for these phases, because coverage did not move.

---

### Task 10: The spec and plan PR

The spec and this plan sit on `docs/follow-up-sequence`, stacked on #199.

- [ ] **Step 1: Open it now** (agent)

```bash
git switch docs/follow-up-sequence
git push -u origin docs/follow-up-sequence > "$SCRATCH/push4.txt" 2>&1; echo "push exit=$?"
gh pr create --base main --head docs/follow-up-sequence \
  --title "docs: plan the readability follow-up" --body-file "$SCRATCH/pr-plan.md"
```

`$SCRATCH/pr-plan.md` says the PR adds the spec, this plan and their index rows; that it is stacked on #199; and that it changes no code. End it with the claude-flow line.

- [ ] **Step 2: Merge it after #199** (owner) with **"Create a merge commit"**. It touches only `docs/`, so Task 7's commit on #199 does not conflict with it.
