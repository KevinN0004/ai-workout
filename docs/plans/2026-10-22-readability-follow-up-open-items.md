# Readability follow-up: open items, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the owner decisions and cleanups the readability follow-up (`docs/specs/2026-10-10-readability-follow-up-design.md`, Phases 0-6, all merged) left open: eight server fixes, eight client fixes and four cleanups, each with the approach the owner approved on 2026-10-18, then one floor PR for both sides and one records PR.

**Architecture:** A follow-on phase under the spec's rules 1-7, which still apply. Two independent tracks, server and client, merged one PR at a time per track, each PR a new branch from current `origin/main` (rule 1). Every fix ships tests for everything it adds, passes the floors on its own and edits no floor (rule 2); one floor PR closes the phase for both sides, as Phase 5's D3 did (rule 3). Comments change with the code, in the same PR (rule 4). The deletions come after every addition on their track (rule 5). CLAUDE.md, the one record these changes make untrue, is edited last (rule 6). The two CSS tasks are proven by the Phase 4 capture tool's compare, with an expectation file listing exactly the changes each expects (rule 7). Every fix is test-first: the test is written, run against `main` and seen to fail for the bug's reason, then the fix makes it pass, then mutations show the test holds the fix.

**Tech Stack:** React 19, Vite 8 (Lightning CSS), Vitest 5 with v8 coverage, jsdom 30, Express 5, Prisma 7, Postgres 18, node-redis 6, `@google/genai` 2.28, Playwright 1.64 (E2E, axe and the capture tool), GitHub (gh CLI).

**Status:** complete as a plan; nothing in it has been run against the repository except read-only commands. Every code change, test, mutation and count below was applied to scratch copies of `main` at `cb821a1` (`git archive main`, `node_modules` junctions to the repo's, a copy of `client/dist`, Postgres up, the server suite pointed at `server/.env` through `DOTENV_CONFIG_PATH` so the file was never read or printed) and measured there between 2026-10-18 and 2026-10-22. The diffs printed in each task are the scratch files after `prettier --write`, and each passed `eslint`.

**Dependabot #252** ("bump the minor-and-patch group with 16 updates") is open and is left alone by this plan. It bumps `vitest` and `@vitest/coverage-v8` (5.0.3 → 5.0.5), `jsdom` (30.1.2 → 30.1.3), `@playwright/test` and `@google/genai` (2.28.0 → 2.30.0) among others. Because it moves the coverage tool itself, it merges **before** the floor PR (the spec placed Dependabot's 2.5 the same way), and the floor PR measures after it. Its `@google/genai` bump does not touch Task S2's check: `FinishReason.MAX_TOKENS` is the string `"MAX_TOKENS"` in both versions (re-check with the grep in S2 Step 1 if #252 has merged).

## Decisions for the owner

The owner approved every item with its recommended approach on 2026-10-18, and every task below runs as written. Research turned up six places where the approach still left a real choice. Each task takes the recommendation; any can be overridden before its task starts, and only that task is re-planned (spec, "What forces a re-check").

| #   | Task | The choice                                                                                                  | Recommended, and taken                                                                                                                                                                                 | The alternative                                                                                                                                                                                     |
| --- | ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | S4   | How to undo a sign-up whose session could not be stored                                                     | **Delete the account again** before the 503, so a retry is a fresh sign-up. Sign-up keeps its meaning; a delete that fails too is logged and leaves today's behaviour                                  | Let a retry with the same password sign in. Turns sign-up into a second credential check, keeps the first attempt's profile and drops the retry's, and still 409s a retry with a different password |
| 2   | S3   | What `attachOptionalUser` does with a failure that is not the session store's (the account lookup throwing) | **Go on as anonymous**, as today: only a cookie the store cannot read is a 503, so a visitor can still get a plan while the database is unwell                                                         | Answer 503 for every lookup failure, so no signed-in visitor is ever served as anonymous, at the cost of refusing plans during a database blip                                                      |
| 3   | C1   | "Keep the cached signed-in state" during an outage                                                          | **There is no cached user to keep** (the client caches none, and the cookie is HttpOnly), so the signed-out page shows with a notice and the check is retried until it is answered                     | Cache the user in `localStorage` and render signed in from it while the check retries: a new feature, with its own staleness and privacy questions on a shared browser                              |
| 4   | C4   | Whether a send's **failure** also leaves a later entry's Undo toast up                                      | **Yes**: the failure still reaches the page's error line (`dashError`), so only the toast yields, and the later entry can still be undone                                                              | Let a failure replace the Undo toast, as a more urgent message, at the cost of that entry's Undo                                                                                                    |
| 5   | C6   | Plan generation's client deadline                                                                           | **A fixed 40 s** (`GENERATE_TIMEOUT_MS`): the server's default 30 s Gemini deadline plus room. A deployment that raises `GEMINI_TIMEOUT_MS` past about 35 s must raise it too, and the comment says so | No client deadline for generation (the server's own 504 bounds it), or a deadline the server reports. The first leaves a dead connection hanging; the second is a new API                           |
| 6   | C8   | The reduced-motion rule for `.home-page .ghost` also covers `.home-page .cta`, which shares its rule        | **Both**: they are one rule in `core/shell.css`, and stopping only `.ghost` would leave `/plan`'s buttons lifting under reduced motion                                                                 | `.ghost` only, the two buttons the owner item names                                                                                                                                                 |

Not a decision, recorded so it is not mistaken for one: S5's lock is an advisory lock because the row lock the owner's list offered first **deadlocks**, measured (Task S5).

**Baseline (`main` at `cb821a1`).** Measured in a scratch copy with `client/dist` present, every test passing:

| Side   | Tests | Statements            | Branches              | Functions             | Lines                 |
| ------ | ----- | --------------------- | --------------------- | --------------------- | --------------------- |
| Client | 2408  | 98.8634 (4871 / 4927) | 93.8403 (3184 / 3393) | 99.1115 (1004 / 1013) | 99.5072 (4442 / 4464) |
| Server | 1178  | 95.1363 (2269 / 2385) | 88.2950 (1652 / 1871) | 96.2121 (381 / 396)   | 96.2246 (2039 / 2119) |

These are the Phase 5 D3 counts the configs' notes record, exactly. Floors: client 98.8 / 93.8 / 99.1 / 99.5, server 95.1 / 88.2 / 96.2 / 96.2.

**How the floors compare.** Vitest fails a metric when `Math.floor(10000 × covered / total) / 100` is below its floor, so a metric passes exactly when `covered >= floor / 100 × total`. The **slack** is `covered - floor / 100 × total`, which must stay 0 or more:

| On `main`         | Covered / total | Slack |
| ----------------- | --------------- | ----- |
| Client statements | 4871 / 4927     | 3.12  |
| Client branches   | 3184 / 3393     | 1.37  |
| Client functions  | 1004 / 1013     | 0.12  |
| Client lines      | 4442 / 4464     | 0.32  |
| Server statements | 2269 / 2385     | 0.87  |
| Server branches   | 1652 / 1871     | 1.78  |
| Server functions  | 381 / 396       | 0.05  |
| Server lines      | 2039 / 2119     | 0.52  |

**What that means for every task.** Six of the eight metrics have less than one unit of slack, so a single uncovered statement, function or line a PR adds fails CI on that side: an added uncovered line costs about 0.995 of client line slack, an added uncovered server function 0.962 of function slack. Every task below adds only covered code, and each was measured to prove it. Adding covered items raises each slack a little (a covered function adds `1 - floor / 100`, 0.038 on the server), which is why Task S8, the one deletion of a covered server function, goes after the additions.

---

## The tasks

The cells are the change in covered / total against the task before it on its track, as measured.

| Order | Task | Track  | Item(s) | Branch                                       | Change                                                                                                   | Statements | Branches  | Functions | Lines     |
| ----- | ---- | ------ | ------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- | --------- | --------- | --------- |
| 0     | P    | -      | -       | `docs/open-items-plan`                       | This plan, and its line in `docs/README.md`, landed by the coordinator as every phase plan has been      |            |           |           |           |
| 1     | S1   | Server | 1       | `fix/postgres-pool-error-listener`           | The pool's `'error'` listener: logged, counted in `metrics.postgresPoolErrors`, never fatal              | +4 / +4    | +6 / +6   | +1 / +1   | +3 / +3   |
| 2     | S2   | Server | 2       | `fix/generate-refuses-truncated-plan`        | `finishReason === "MAX_TOKENS"` is a 502 "cut off, try again", not saved                                 | +3 / +3    | +4 / +4   | 0         | +3 / +3   |
| 3     | S3   | Server | 3, 7    | `fix/session-store-outage-answers`           | A 2 s reply deadline on every session command; `attachOptionalUser` answers 503 for an unreadable cookie | +3 / +3    | +2 / +2   | 0         | +3 / +3   |
| 4     | S4   | Server | 5, 6    | `fix/signup-signout-store-outage`            | A sign-up whose session fails is undone; sign-out retries its delete once                                | +6 / +6    | 0         | +1 / +1   | +5 / +5   |
| 5     | S5   | Server | 4       | `fix/meal-log-daily-sync-race`               | The day's calorie sync takes an advisory lock per user (a row lock deadlocks)                            | +1 / +1    | 0         | 0         | +1 / +1   |
| 6     | S6   | Server | 8       | `fix/env-validation-gemini-and-integers`     | The three GEMINI limits are validated; a fraction is refused; a contract pins check to reader            | +3 / +3    | +2 / +2   | 0         | +3 / +3   |
| 7     | S7   | Server | 17      | `docs/stale-shim-test-comments`              | Eight test comments that described the retired shim                                                      | 0          | 0         | 0         | 0         |
| 8     | S8   | Server | 19      | `chore/delete-strip-userid-field`            | Delete `stripUserIdField`; the integration test that reads a real row stays                              | −3 / −3    | −1 / −1   | −1 / −1   | −3 / −3   |
| 1     | C1   | Client | 9       | `fix/session-check-outage`                   | Only a 401 is signed out; otherwise a notice and a retry; `AppNotice`                                    | +21 / +21  | +6 / +6   | +3 / +3   | +20 / +20 |
| 2     | C2   | Client | 6       | `fix/logout-reports-unended-session`         | A sign-out the server could not finish says so, dismissibly                                              | +5 / +5    | +8 / +7   | +1 / +1   | +5 / +5   |
| 3     | C3   | Client | 10      | `fix/home-ranges-match-server`               | The home form's and the walkthrough's bounds, and the Continue gate, are the server's; contract extended | 0          | 0         | 0         | 0         |
| 4     | C4   | Client | 11, 12  | `fix/undo-toast-and-plan-after-logout`       | A later entry's Undo toast stays up; a plan for a signed-out account is dropped                          | +9 / +9    | +8 / +8   | 0         | +5 / +5   |
| 5     | C5   | Client | 13      | `fix/no-injury-phrasings`                    | "No injuries" and its common phrasings are not an injury note                                            | +2 / +2    | 0         | +1 / +1   | +2 / +2   |
| 6     | C6   | Client | 16      | `fix/api-fetch-timeout`                      | `apiFetch` and its token fetch have a deadline: 15 s, 40 s for generation, 5 s for logout                | +3 / +3    | +1 / +1   | 0         | +3 / +3   |
| 7     | C7   | Client | 14      | `fix/walkthrough-form-one-column`            | CSS: the walkthrough's form is one column on phones (capture compare)                                    | CSS        |           |           |           |
| 8     | C8   | Client | 15      | `fix/reduced-motion-hover-press`             | CSS: hover and press stop moving under reduced motion (capture compare and hover probe)                  | CSS        |           |           |           |
| 9     | C9   | Client | 18      | `chore/delete-unread-preview-profile-fields` | Delete `JOHN_DOE_PREVIEW_PROFILE.bodyFat` and `.personalComplete`                                        | 0          | 0         | 0         | 0         |
| 10    | C10  | Client | 20      | `chore/preview-derived-dead-fallbacks`       | Delete the eighteen fallbacks that cannot fire, proved by arithmetic and as deliberate survivors         | −5 / −6    | −11 / −29 | −1 / −1   | −4 / −4   |
| 11    | F    | Both   | -       | `chore/open-items-floors`                    | After #252 and both tracks: client branches 93.8 → 94.3, server branches 88.2 → 88.3, if measured so     |            |           |           |           |
| 12    | R    | Docs   | -       | `docs/open-items-records`                    | CLAUDE.md and the server and client READMEs where these changes made them untrue                         |            |           |           |           |

Merge order: the server track S1 → S8 and the client track C1 → C10, independently, one PR at a time on each; then Dependabot's #252; then F; then R. The order is forced at three points ("Ordering, and the cumulative arithmetic"): S8 after a task that adds a covered server function, C2 after C1, and F after #252.

---

## Conventions

- **Shell.** Git Bash, from `D:\ai-workout`, with an uppercase `D`: the lowercase path breaks Vitest. Set `SCRATCH` to a folder outside the repo and redirect output there; `TOOLS="$SCRATCH/oi-tools"` holds the Tools section's scripts and `SHOTS="$SCRATCH/oi-shots"` the captures. Never `cd` into a `src` folder.
- **Exit codes.** Never gate on a pipe: redirect to a file, then read `$?`.
- **Secrets.** Never read, stat or print `server/.env` or any `.env*` file. If a permission rule blocks something, stop and say so.
- **Running one server test file.** `npm run test -w server -- <path>` (paths relative to `server/`), never `npx vitest run <path> --root server` from the root (CLAUDE.md: dotenv reads `.env` from the working directory). One client test file: `npm run test -w client -- <path>` (paths relative to `client/`).
- **Postgres.** Every server run needs it: `npm run postgres:local:start -w server`, and a generated Prisma client after any `npm ci` (`npm run prisma:generate -w server`). Read the `Tests` line before trusting any count: with Postgres down about 110 server tests fail with "Can't reach database server". The two tracks share the database: agree a turn before running the server suite or the E2E suite while the other track might be.
- **Take `main`: every task is a NEW branch.** `git fetch origin && git switch -c <branch> origin/main`. Open the PR as a draft. If `main` moves before the PR is ready, merge it in (`git fetch origin && git merge origin/main`), never rebase, re-run `test:coverage` and re-read the counts (and, for a CSS task, re-capture both sides). Check `git merge-base --is-ancestor origin/main HEAD; echo $?` prints `0` before `gh pr ready`.
- **Resolving a conflict.** Keep the task's change. Keep `main`'s comments wherever they still describe the code, and rewrite any the change makes untrue, following `docs/code-readability-sop.md`.
- **The edits are diffs.** Each task prints its change as unified diffs against `main` at `cb821a1` plus the tasks before it on its track, already formatted by Prettier. Write each diff with the Write tool (never a heredoc: several hold backslashes and `//`), then `git apply --check <file>` and `git apply <file>`. Where `main` has moved, use `git apply --3way <file>`; the context lines are the anchors, the line numbers a guide. Every task's first diff is its tests alone, applied and run before the second, the fix. This file is Prettier-formatted, which writes a diff's blank context line (a single space) as an empty line; `git apply` reads an empty line as blank context, and every diff here was applied exactly as printed, to its base, in the scratch copies.
- **Byte-order marks.** None of the files these tasks edit or create starts with one (`ef bb bf`), checked on `cb821a1` for every file in every diff below; the two new files are written without one. Before committing, `head -c 3 <file> | od -An -tx1` must print what it printed on `main`.
- **Formatting.** Run `npx prettier --write <the files you changed>` before the gates and re-read anything it reflows. Comment lines stay within 100 columns.
- **Comments (spec rule 4)** follow `docs/code-readability-sop.md`: present tense, every claim checked against the code, no figure that lives elsewhere. Each task's diff already carries the comment changes its code forces; each task names them.
- **Mutation checks.** Write `$TOOLS/mutate.mjs` and each mutation's JSON with the Write tool. Run them after the fix is committed; restore with `git checkout -- <files>` and confirm `git status --porcelain` prints nothing. The tool exits 2 when an edit did not apply, so an unapplied mutation cannot read as a caught one. Every mutation listed below was run in the scratch copy, and the failures each task gives are what that run printed.
- **Exact coverage.** `npm run test:coverage -w <side> -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/<side>-cov.txt" 2>&1`, then `node "$TOOLS/counts.mjs" . <side>`, which prints covered / total, the percentage to four decimals, the floor and the slack per metric, and exits 1 below a floor. Measure the server **after** `npm run build`: with `client/dist` present, `staticClient.js`'s no-bundle arm goes unreached and server branches read one lower. Each task gives the counts it must print; if they differ, find out why before marking the PR ready (a merge on `main` from outside this plan, such as #252, can move them). What must hold is the slack.
- **The gates on every PR.** Each redirected to a file; every exit code must be `0`.

  ```bash
  npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
  npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
  npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "knip exit=$?"
  npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"; grep -E "index-.*\.js|larger than" "$SCRATCH/build.txt"
  npm run test:coverage > "$SCRATCH/cov.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files|Tests  " "$SCRATCH/cov.txt"
  npm run test:e2e > "$SCRATCH/e2e.txt" 2>&1; echo "test:e2e exit=$?"; tail -3 "$SCRATCH/e2e.txt"
  npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"; grep -E "Tests  " "$SCRATCH/scripts.txt"
  ```

  `build` runs before `test:coverage` for the server's branch count, and before `test:e2e`, which serves the built bundle. `test:scripts` holds the header ratchet: a new source file needs a header of one to four lines. The build must print no "larger than" warning. Run the E2E suite at most twice in ten minutes: a third run trips the credential limiter on the password-change test ("Too many attempts"), which is not a regression.

- **Screenshot compares (spec rule 7), Tasks C7 and C8 only.** Phase 4's `capture.mjs`, unchanged (Tools). Each CSS task builds and captures before its change and after it, and compares with an expectation file listing exactly the changes it expects; `compare` exits 0 only when every difference is listed and every listed change happened. Never widen an expectation to make a compare pass. A JavaScript task changes no capture unless it says so: C1's and C2's notice is never shown in a capture state, which stubs `/api/auth/me` with a 401 or a 200.
- **Floors.** No fix PR edits a floor. Task F raises them once, after #252 and every task on both tracks.
- **Merging.** A PR merges only after its spec and quality reviews pass, its checks are green, and it shows `mergeStateStatus` `CLEAN`. Merge with "Create a merge commit" (`gh pr merge <n> --merge`), then wait for CI on `main` to go green before the next task on that track.
- **Trailers.** Every commit ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

---

## Tools

Write each into `$TOOLS` with the Write tool, never a heredoc. They run from the repo root with Node 22 or 24 and need nothing installed.

| Script            | Where it comes from                                                                                                               | What it does                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `mutate.mjs`      | Phase 3's client plan (`docs/plans/2026-10-15-readability-follow-up-phase-3-client.md`, Conventions, "Mutation checks"), verbatim | Applies `[{ "file", "find", "text" }]` edits from a JSON file; exits 2 when one did not apply                                              |
| `counts.mjs`      | Phase 5's plan (`docs/plans/2026-10-16-readability-follow-up-phase-5.md`, Tools), verbatim                                        | Exact counts, percentage, floor and slack per metric for one workspace; exits 1 below a floor                                              |
| `capture.mjs`     | Phase 4's plan (`docs/plans/2026-10-16-readability-follow-up-phase-4.md`, Tools), verbatim                                        | The 44 captures, and their compare. `node capture.mjs <repoRoot> <outDir>`; `node capture.mjs compare <dirA> <dirB> [expect.json]`         |
| `props.mjs`       | below                                                                                                                             | Prints chosen computed properties of the captured elements whose key matches a pattern, from one `<name>.styles.json.gz`                   |
| `hover-probe.mjs` | below, for Task C8                                                                                                                | Hovers and presses C8's three buttons in a build, with and without reduced motion, and prints each one's transform and transition-duration |

`capture.mjs` serves `client/dist` on port 4174 and stubs every `/api` request in the browser (signed out: `/api/auth/me` answers 401; signed in: 200 with a fixed profile), so it needs no server and no database. Install Chromium for Playwright first if this machine has never run the E2E suite (`npx playwright install chromium`). A capture that crashes can leave its preview server on 4174: free it by port (`netstat -ano | grep ":4174 "`, then `taskkill //PID <pid> //F`).

`props.mjs`:

<!-- prettier-ignore -->
```js
/**
 * Prints chosen properties for the entries of one capture's style dump whose
 * "key label" matches a regex. Usage: node props.mjs <x.styles.json.gz> <regex> <prop,prop>
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const [file, re, props] = process.argv.slice(2);
const d = JSON.parse(gunzipSync(readFileSync(file)).toString());
for (const [key, label, diffs] of d.entries) {
  if (!new RegExp(re).test(`${key} ${label}`)) continue;
  const vals = props.split(",").map((p) => {
    const i = d.props.indexOf(p);
    return `${p}=${Object.hasOwn(diffs, i) ? diffs[i] : d.modes[i]}`;
  });
  console.log(`${label}${key.match(/::\w+$/)?.[0] ?? ""}  ${vals.join("  ")}`);
}
```

`hover-probe.mjs` (the capture tool cannot hover, so C8's transforms are read here; it serves on 4175, beside the capture tool's 4174):

<!-- prettier-ignore -->
```js
/**
 * Hovers and presses the buttons Task C8 covers, under prefers-reduced-motion
 * (and, for contrast, without it), in a build's client/dist, and prints each
 * one's computed transform and transition-duration while hovered and while
 * pressed. Serves the build with Vite's preview on port 4175 and answers
 * /api/auth/me with 401, so no server is needed.
 * Usage: node hover-probe.mjs <repoRoot>
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repoRoot = "D:/ai-workout"] = process.argv.slice(2);
const require = createRequire(path.join(repoRoot, "client", "package.json"));
const { preview } = await import(pathToFileURL(require.resolve("vite")).href);
const { chromium } = createRequire(path.join(repoRoot, "package.json"))("@playwright/test");

const PORT = 4175;
const TARGETS = [
  ["/", ".home-preview-btn"],
  ["/auth", ".auth-close"],
  ["/auth", ".auth-card-top .segmented button:not(.active)"]
];

const server = await preview({
  root: path.join(repoRoot, "client"),
  preview: { port: PORT, strictPort: true },
  logLevel: "error"
});
const browser = await chromium.launch();
try {
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const context = await browser.newContext({ reducedMotion, viewport: { width: 1440, height: 900 } });
    await context.route("**/api/**", (route) =>
      route.fulfill({ status: route.request().url().includes("/api/auth/me") ? 401 : 200, body: "{}", contentType: "application/json" })
    );
    const page = await context.newPage();
    for (const [url, selector] of TARGETS) {
      await page.goto(`http://localhost:${PORT}${url}`);
      const button = page.locator(selector).first();
      await button.waitFor();
      await button.hover();
      await page.waitForTimeout(600);
      const read = () =>
        button.evaluate((el) => {
          const s = getComputedStyle(el);
          return `${s.transform} | ${s.transitionDuration}`;
        });
      const hovered = await read();
      await page.mouse.down();
      await page.waitForTimeout(600);
      const pressed = await read();
      await page.mouse.up();
      console.log(`${reducedMotion.padEnd(13)} ${url.padEnd(6)} ${selector}\n  hover: ${hovered}\n  press: ${pressed}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
```

---

## Server track

Eight PRs, merged in order S1 → S8. None touches a client file or renders anything, so none takes a capture. S1 to S6 add covered code only; S7 changes comments only; S8 deletes a covered function and goes last because server functions have 0.05 of slack on `main`.

### Task S1: An idle Postgres connection that fails is logged, not fatal

**Branch:** `fix/postgres-pool-error-listener` (server track, first).

**The bug.** `server/src/db/postgres.js:84-97` opens a `pg` Pool and never listens for its `'error'` event. `pg` emits `'error'` on the pool when an idle client's connection fails: the database restarts, a failover, an administrator ending the session, a network blip while the client sits in the pool. A Node `EventEmitter` with no `'error'` listener throws the error, so the API process exits. index.js keeps the pool open for the life of the process (`startServer`, `index.js:761`), so the window is not only startup. `git grep -n "\.on(\"error\"" -- server/src` finds only the Redis client's listener (`sessionService.js`).

**The fix (owner-approved: log it and count it).** `connectPostgres` takes the pino `logger` and the `metrics` object index.js already has, and registers one `'error'` listener on every pool it opens. The listener counts the failure in a new `metrics.postgresPoolErrors` (seeded at 0 by `createMetrics`, reported by `/api/metrics` beside `authFailures`) and logs `postgres_pool_error` with the message cut to 300 characters, as `lastError` already is. It does not touch `postgresStatus`: the pool has already dropped the failed client and opens a new one for the next query, so the startup probe's status is still true. The migration script calls `connectPostgres()` with neither, and still gets the listener, so an idle connection cannot end it either; its own queries report a dead database.

**Why not in index.js.** An arrow function defined in `startServer` would be an uncovered function, statement and lines (the suite never runs `startServer`), and server functions have 0.05 of slack: it would fail CI. Inside `postgres.js` the listener is reachable from `postgres.test.js`'s mocked Pool, and index.js only changes the arguments of a call it already makes.

**Files:**

- Modify: `server/src/db/postgres.js:66-71` (the doc comment and signature), `:97` (the listener after the Pool is built)
- Modify: `server/src/services/platform/metricsService.js:38` (the counter)
- Modify: `server/src/routes/systemRoutes.js:166` (the payload)
- Modify: `server/src/index.js:761` (the call)
- Test: `server/src/db/__tests__/postgres.test.js`, `server/src/routes/__tests__/systemRoutes.test.js`, `server/src/services/platform/__tests__/metricsService.test.js`

- [ ] **Step 1: Branch, and confirm there is no listener**

```bash
git fetch origin && git switch -c fix/postgres-pool-error-listener origin/main
git grep -n "\.on(\"error\"" -- server/src
git grep -n "connectPostgres(" -- server
```

Expected: one listener, the Redis client's in `sessionService.js`; `connectPostgres(` called from `index.js:761` and `server/scripts/apply-postgres-migrations.js:20`, both with no arguments.

- [ ] **Step 2: The failing tests**

The mocked Pool gains an `on()` that records its listener, so a test can emit `'error'` by calling it. Write `$SCRATCH/s1-tests.diff`:

```diff
--- a/server/src/db/__tests__/postgres.test.js
+++ b/server/src/db/__tests__/postgres.test.js
@@ -12,7 +12,8 @@
   connect: null,
   end: null,
   query: null,
-  releases: 0
+  releases: 0,
+  listeners: {}
 }));

 vi.mock("pg", () => {
@@ -29,6 +30,12 @@
     end() {
       return pg.end();
     }
+
+    // Only 'error' matters here; the test emits it by calling the listener.
+    on(event, listener) {
+      pg.listeners[event] = listener;
+      return this;
+    }
   }
   return { Pool, default: { Pool } };
 });
@@ -54,6 +61,7 @@
   pg.poolArgs = [];
   pg.poolThrows = null;
   pg.releases = 0;
+  pg.listeners = {};
   pg.query = vi.fn();
   pg.connect = vi.fn(async () => workingClient());
   pg.end = vi.fn(async () => {});
@@ -365,6 +373,60 @@
   });
 });

+// pg emits 'error' on the pool when an idle client's connection drops. An
+// EventEmitter with no 'error' listener throws, which ends the process, so the
+// pool must always have one.
+describe("an idle connection failing", () => {
+  const env = { DATABASE_URL: "postgres://u:secret@host:5432/db" };
+
+  test("is logged and counted rather than thrown", async () => {
+    const logger = { error: vi.fn() };
+    const metrics = { postgresPoolErrors: 0 };
+    const { connectPostgres } = await loadPostgres();
+    await connectPostgres({ env, logger, metrics });
+
+    expect(() => pg.listeners.error(new Error("terminating connection"))).not.toThrow();
+
+    expect(metrics.postgresPoolErrors).toBe(1);
+    expect(logger.error).toHaveBeenCalledWith(
+      { event: "postgres_pool_error", error: "terminating connection" },
+      expect.any(String)
+    );
+  });
+
+  test("records a value that is not an Error as its text", async () => {
+    const logger = { error: vi.fn() };
+    const metrics = { postgresPoolErrors: 0 };
+    const { connectPostgres } = await loadPostgres();
+    await connectPostgres({ env, logger, metrics });
+
+    pg.listeners.error("socket closed");
+
+    expect(logger.error).toHaveBeenCalledWith(
+      { event: "postgres_pool_error", error: "socket closed" },
+      expect.any(String)
+    );
+  });
+
+  // The migration script opens the pool with neither; the listener is still
+  // there, so the script is not ended by an idle connection either.
+  test("is survived with no logger or metrics to report to", async () => {
+    const { connectPostgres } = await loadPostgres();
+    await connectPostgres({ env });
+
+    expect(() => pg.listeners.error("socket closed")).not.toThrow();
+  });
+
+  test("leaves the reported status alone", async () => {
+    const { connectPostgres, getPostgresStatus } = await loadPostgres();
+    await connectPostgres({ env });
+
+    pg.listeners.error(new Error("terminating connection"));
+
+    expect(getPostgresStatus()).toMatchObject({ connected: true, lastError: "" });
+  });
+});
+
 describe("closing", () => {
   const env = { DATABASE_URL: "postgres://u:secret@host:5432/db" };

--- a/server/src/routes/__tests__/systemRoutes.test.js
+++ b/server/src/routes/__tests__/systemRoutes.test.js
@@ -16,6 +16,7 @@
       requestsTotal: 7,
       rateLimited: 0,
       authFailures: 3,
+      postgresPoolErrors: 2,
       requestLatencyMs: {},
       routeLatencyMs: {},
       externalCache: { hits: 1, misses: 1 },
@@ -67,6 +68,16 @@
     expect(response.body.authFailures).toBe(3);
   });

+  // postgres.js counts every idle connection the pool lost; this is where the
+  // count is read.
+  test("reports the Postgres pool's connection errors", async () => {
+    const response = await request(buildApp({ metricsToken: "", isProduction: false })).get(
+      "/api/metrics"
+    );
+
+    expect(response.body.postgresPoolErrors).toBe(2);
+  });
+
   test("allows a request carrying the right token", async () => {
     const response = await request(buildApp({ metricsToken: "s3cret", isProduction: true }))
       .get("/api/metrics")
--- a/server/src/services/platform/__tests__/metricsService.test.js
+++ b/server/src/services/platform/__tests__/metricsService.test.js
@@ -77,6 +77,10 @@
     ]);
   });

+  test("starts the Postgres pool's error count at zero", () => {
+    expect(createMetrics().postgresPoolErrors).toBe(0);
+  });
+
   test("hands out independent buckets rather than one shared object", () => {
     const metrics = createMetrics();

```

```bash
git apply "$SCRATCH/s1-tests.diff"
npm run test -w server -- src/db/__tests__/postgres.test.js src/routes/__tests__/systemRoutes.test.js src/services/platform/__tests__/metricsService.test.js > "$SCRATCH/s1-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |TypeError|expected" "$SCRATCH/s1-red.txt" | head -10
```

Expected: `exit=1`, `Tests  6 failed | 85 passed (91)`. The four `an idle connection failing` tests fail with `TypeError: pg.listeners.error is not a function`, because `connectPostgres` registered no listener: the bug itself. The metrics test reads `expected undefined to be +0` and the payload test `expected undefined to be 2`, because the counter does not exist.

- [ ] **Step 3: The fix**

Write `$SCRATCH/s1-fix.diff`:

```diff
--- a/server/src/db/postgres.js
+++ b/server/src/db/postgres.js
@@ -66,9 +66,15 @@
 /**
  * Opens the pool and proves it with one `select 1`, then returns the status.
  * With no URL configured it opens nothing. On a failure it records the error in
- * the status, ends the half-open pool and rethrows.
+ * the status, ends the half-open pool and rethrows. An idle connection that
+ * fails later is logged to `logger` and counted in `metrics.postgresPoolErrors`
+ * when they are given (index.js gives both; the migration script neither).
  */
-export const connectPostgres = async ({ env = process.env } = {}) => {
+export const connectPostgres = async ({
+  env = process.env,
+  logger = null,
+  metrics = null
+} = {}) => {
   const config = resolvePostgresConfig(env);
   postgresStatus = {
     configured: config.configured,
@@ -95,6 +101,18 @@
           }
         : undefined
     });
+    // pg emits 'error' on the pool when an idle client's connection fails (the
+    // database restarted, or an administrator ended the session). With no
+    // listener Node throws it and the process exits. The pool has already
+    // dropped that client and opens a new one for the next query, so the error
+    // is reported and the status is left as it is.
+    postgresPool.on("error", (err) => {
+      if (metrics) metrics.postgresPoolErrors += 1;
+      logger?.error(
+        { event: "postgres_pool_error", error: cleanText(err?.message || String(err), 300) },
+        "An idle Postgres connection failed. The pool replaces it."
+      );
+    });

     const client = await postgresPool.connect();
     try {
--- a/server/src/index.js
+++ b/server/src/index.js
@@ -758,7 +758,7 @@
       process.env.NODE_ENV === "production"
     );
     try {
-      const postgresStatus = await connectPostgres();
+      const postgresStatus = await connectPostgres({ logger, metrics });
       await connectPrisma();
       postgresLastError = "";
       if (postgresStatus.configured) {
--- a/server/src/routes/systemRoutes.js
+++ b/server/src/routes/systemRoutes.js
@@ -164,6 +164,7 @@
       requestsTotal: metrics.requestsTotal,
       rateLimited: metrics.rateLimited,
       authFailures: metrics.authFailures,
+      postgresPoolErrors: metrics.postgresPoolErrors,
       requestLatencyMs: {
         ...summarizeLatencyBucket(metrics.requestLatencyMs),
         byRoute: routeLatency
--- a/server/src/services/platform/metricsService.js
+++ b/server/src/services/platform/metricsService.js
@@ -36,6 +36,7 @@
   requestsTotal: 0,
   authFailures: 0,
   rateLimited: 0,
+  postgresPoolErrors: 0,
   requestLatencyMs: initLatencyStats(),
   routeLatencyMs: {},
   externalCache: {
```

```bash
git apply "$SCRATCH/s1-fix.diff"
npx prettier --write server/src/db/postgres.js server/src/db/__tests__/postgres.test.js server/src/routes/systemRoutes.js server/src/routes/__tests__/systemRoutes.test.js server/src/services/platform/metricsService.js server/src/services/platform/__tests__/metricsService.test.js server/src/index.js
npm run test -w server -- src/db/__tests__/postgres.test.js src/routes/__tests__/systemRoutes.test.js src/services/platform/__tests__/metricsService.test.js > "$SCRATCH/s1-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s1-green.txt"
git add server/src
git commit -m "fix(server): an idle Postgres connection that fails is logged, not fatal" -m "pg emits 'error' on the pool when an idle client's connection drops, and with no listener Node throws it and the process exits. connectPostgres now registers one: it logs postgres_pool_error and counts it in metrics.postgresPoolErrors, which /api/metrics reports." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  91 passed (91)`.

**Comments.** The diff carries them: `connectPostgres`'s doc comment names the two new parameters and who passes them; the listener has a comment saying why it exists and why the status is left alone. `postgres.js`'s header ("index.js opens it at startup as a probe") and `getPostgresStatus`'s ("Nothing re-probes, so it changes only when connectPostgres or closePostgres runs") stay true, because the listener does not change the status. `metricsService.js`'s and `systemRoutes.js`'s headers name no counters, so nothing else changes.

- [ ] **Step 4: Mutation checks**

Write `$SCRATCH/mut-s1.json`, one mutation per entry, and run each alone (apply, run the two test files above, `git checkout -- server/src`):

| Mutation                                                                       | Caught by                                                                                      |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `postgresPool.on("error", (err) => {` → `postgresPool.on("unused", (err) => {` | all four `an idle connection failing` tests (`4 failed`)                                       |
| delete `if (metrics) metrics.postgresPoolErrors += 1;`                         | "is logged and counted rather than thrown"                                                     |
| `logger?.error(` → `logger?.info(`                                             | "is logged and counted rather than thrown", "records a value that is not an Error as its text" |
| delete `postgresPoolErrors: metrics.postgresPoolErrors,` (systemRoutes.js)     | "reports the Postgres pool's connection errors"                                                |

Each line was run in the scratch copy with exactly that result. Empty `git status --porcelain` after each.

- [ ] **Step 5: Coverage**

Expected, `main` then S1 (server, with `client/dist`):

| Metric     | `main`      | After S1    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 2269 / 2385 | 2273 / 2389 | 95.1444 | 95.1  | 1.06  |
| Branches   | 1652 / 1871 | 1658 / 1877 | 88.3324 | 88.2  | 2.49  |
| Functions  | 381 / 396   | 382 / 397   | 96.2217 | 96.2  | 0.09  |
| Lines      | 2039 / 2119 | 2042 / 2122 | 96.2300 | 96.2  | 0.64  |

Everything added is covered: four statements, three lines, one function and six branch arms, all reached (`postgres.js` at 41 / 41 arms; the `String(err)` arm needs the non-`Error` test, which is why it is there). Tests 1178 → 1184.

- [ ] **Step 6: Gates and PR**

Run the gates (Conventions). Then:

```bash
git push -u origin fix/postgres-pool-error-listener
gh pr create --draft --base main --title "fix(server): an idle Postgres connection that fails is logged, not fatal" --body-file "$SCRATCH/pr-s1.md"
```

`pr-s1.md` outline: the owner item and what `pg` does with an unheard `'error'`; why the listener lives in `postgres.js` (function slack); the red run (the six failures and their messages); the mutation table; the coverage table; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Then the ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task S2: A plan cut off at the token cap is refused, not served

**Branch:** `fix/generate-refuses-truncated-plan` (server track, after S1).

**The bug.** `server/src/routes/generateRoutes.js:303` reads only `result.text`. When Gemini stops at `maxOutputTokens` (GEMINI_MAX_OUTPUT_TOKENS, default 8192), the text is the plan so far: it passes the empty check, usually the length cap, and the weekday check (Monday's heading is near the top), so a half plan is served as whole and saved for a signed-in caller.

**What `@google/genai` returns.** `GenerateContentResponse.candidates[0].finishReason` is a `FinishReason`: `"STOP"` for a natural end, `"MAX_TOKENS"` for the cap (`node_modules/@google/genai/dist/genai.d.ts`, `export declare enum FinishReason`: "Token generation reached the configured maximum output tokens"). `response.text` is the first candidate's text parts joined, so it never says which. The same enum value is in 2.30.0, the version #252 moves to (checked in the published package's `dist/genai.d.ts`).

**The fix (owner-approved: refuse it with a clear, retryable error).** Before the text checks, a first candidate whose `finishReason` is `"MAX_TOKENS"` answers **502** with `"The plan was cut off before it was finished. Please try again."` and the request id, logs `generate_truncated` with the cap, and saves nothing, the same shape as the route's other refusals of a bad answer (empty, oversized). 502 because the upstream gave a bad answer, as for those; the client shows `payload.error` verbatim (`client/src/app/events.js:146-148`, `setError`), so the visitor reads the message and can press Generate again. Every other finish reason is left to the existing checks: a safety stop comes back with no text and is already "No plan generated."

**Why the string, not the enum.** `index.wiring.test.js` mocks `@google/genai` with a factory that returns only `GoogleGenAI`; importing `FinishReason` into the route would make it `undefined` under that mock, and `finishReason === undefined` would refuse every plan in that suite. The comment names the enum member instead.

**Files:**

- Modify: `server/src/routes/generateRoutes.js:303-307` (the check, and the comment over the answer checks)
- Test: `server/src/routes/__tests__/generateRoutes.equipment.test.js` (`buildApp` takes an optional `log`; two tests)

- [ ] **Step 1: Branch, and confirm the route reads only the text**

```bash
git fetch origin && git switch -c fix/generate-refuses-truncated-plan origin/main
git grep -n "finishReason\|candidates" -- server/src
grep -n "MAX_TOKENS = " node_modules/@google/genai/dist/genai.d.ts
```

Expected: no match in `server/src`; `MAX_TOKENS = "MAX_TOKENS",` once.

- [ ] **Step 2: The failing test**

Write `$SCRATCH/s2-tests.diff`:

```diff
--- a/server/src/routes/__tests__/generateRoutes.equipment.test.js
+++ b/server/src/routes/__tests__/generateRoutes.equipment.test.js
@@ -23,13 +23,13 @@

 let saveGeneratedPlan;

-const buildApp = (overrides = {}, { user, requestId } = {}) => {
+const buildApp = (overrides = {}, { user, requestId, log } = {}) => {
   const app = express();
   app.use(express.json());
   app.use((req, _res, next) => {
     if (user) req.user = user;
     if (requestId) req.requestId = requestId;
-    req.log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
+    req.log = log || { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
     next();
   });
   registerGenerateRoutes(app, {
@@ -398,6 +398,40 @@
       expect(response.status).toBe(200);
     });

+    // A reply cut off at the token cap still has text, often with every
+    // weekday heading, so only the finish reason tells it from a whole plan.
+    test("answers 502 and saves nothing for a plan cut off at the token cap", async () => {
+      generateContent.mockResolvedValue({
+        text: "Monday - Push\nBench press\nTuesday - Pull\nRows, 3 x",
+        candidates: [{ finishReason: "MAX_TOKENS" }]
+      });
+      const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
+      const app = buildApp({}, { user: { id: "u-1" }, log });
+
+      const response = await post(app);
+
+      expect(response.status).toBe(502);
+      expect(response.body.error).toMatch(/cut off/);
+      expect("requestId" in response.body).toBe(true);
+      expect(saveGeneratedPlan).not.toHaveBeenCalled();
+      expect(log.warn).toHaveBeenCalledWith(
+        expect.objectContaining({ event: "generate_truncated" }),
+        expect.any(String)
+      );
+    });
+
+    test("serves a plan the model finished", async () => {
+      generateContent.mockResolvedValue({
+        text: "Monday - Push",
+        candidates: [{ finishReason: "STOP" }]
+      });
+
+      const response = await post(buildApp());
+
+      expect(response.status).toBe(200);
+      expect(response.body.plan).toBe("Monday - Push");
+    });
+
     test("rejects a whitespace-only plan", async () => {
       generateContent.mockResolvedValue({ text: "  \n " });

```

```bash
git apply "$SCRATCH/s2-tests.diff"
npm run test -w server -- src/routes/__tests__/generateRoutes.equipment.test.js > "$SCRATCH/s2-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |AssertionError" "$SCRATCH/s2-red.txt"
```

Expected: `exit=1`, `Tests  1 failed | 58 passed (59)`: "answers 502 and saves nothing for a plan cut off at the token cap" with `expected 200 to be 502`, because the cut-off text was served. "serves a plan the model finished" passes already; it is the guard that the check refuses only the cap.

- [ ] **Step 3: The fix**

Write `$SCRATCH/s2-fix.diff`:

```diff
--- a/server/src/routes/generateRoutes.js
+++ b/server/src/routes/generateRoutes.js
@@ -296,9 +296,22 @@
       }
       const plan = typeof result?.text === "string" ? result.text : "";

-      // Check the answer. An empty or whitespace-only plan, or one longer than
-      // GEMINI_MAX_PLAN_CHARS, is a 502 and is not saved. One naming no weekday
-      // is logged and still served.
+      // Check the answer. A plan the model stopped at the token cap, an empty or
+      // whitespace-only plan, or one longer than GEMINI_MAX_PLAN_CHARS, is a 502
+      // and is not saved. One naming no weekday is logged and still served.
+      // "MAX_TOKENS" is @google/genai's FinishReason.MAX_TOKENS; a cut-off plan
+      // still has text, often every weekday heading, so only this tells it apart.
+      if (result?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
+        req.log?.warn(
+          { event: "generate_truncated", maxOutputTokens },
+          "Generated plan stopped at the token cap."
+        );
+        return res.status(502).json({
+          error: "The plan was cut off before it was finished. Please try again.",
+          requestId: req.requestId || ""
+        });
+      }
+
       if (!plan.trim()) {
         return res
           .status(502)
```

```bash
git apply "$SCRATCH/s2-fix.diff"
npx prettier --write server/src/routes/generateRoutes.js server/src/routes/__tests__/generateRoutes.equipment.test.js
npm run test -w server -- src/routes/__tests__/generateRoutes.equipment.test.js > "$SCRATCH/s2-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s2-green.txt"
git add server/src
git commit -m "fix(server): a plan cut off at the token cap is refused" -m "Gemini returns the text so far when it stops at maxOutputTokens, and it passed every check the route made. A first candidate whose finishReason is MAX_TOKENS is now a 502 with a message to try again, logged as generate_truncated, and nothing is saved." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  59 passed (59)`.

**Comments.** The comment over the answer checks ("Check the answer. An empty or whitespace-only plan, or one longer than GEMINI_MAX_PLAN_CHARS, is a 502 and is not saved.") now lists the cut-off plan first and says why the finish reason is needed and where the string comes from. The route's doc comment and the file header do not list the checks, so nothing else changes.

- [ ] **Step 4: Mutation checks**

| Mutation (`generateRoutes.js`)                                                     | Caught by                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `if (result?.candidates?.[0]?.finishReason === "MAX_TOKENS") {` → `if (false) {`   | "answers 502 and saves nothing for a plan cut off at the token cap" |
| the same line → `if (result?.candidates?.[0]?.finishReason) {` (refuse any finish) | "serves a plan the model finished"                                  |
| `event: "generate_truncated"` → `event: "generate_other"`                          | "answers 502 and saves nothing for a plan cut off at the token cap" |

Each was run in the scratch copy with exactly that one failure (`1 failed | 58 passed (59)`).

- [ ] **Step 5: Coverage**

Expected, after S1 then S2:

| Metric     | After S1    | After S2    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 2273 / 2389 | 2276 / 2392 | 95.1505 | 95.1  | 1.21  |
| Branches   | 1658 / 1877 | 1662 / 1881 | 88.3573 | 88.2  | 2.96  |
| Functions  | 382 / 397   | 382 / 397   | 96.2217 | 96.2  | 0.09  |
| Lines      | 2042 / 2122 | 2045 / 2125 | 96.2353 | 96.2  | 0.75  |

Three statements and lines and four branch arms (the `if` and the `requestId` fallback), all covered. Tests 1184 → 1186.

- [ ] **Step 6: Gates and PR**

Run the gates. `git push -u origin fix/generate-refuses-truncated-plan`, `gh pr create --draft --base main --title "fix(server): a plan cut off at the token cap is refused" --body-file "$SCRATCH/pr-s2.md"`. Outline: the owner item; what `finishReason` is and why `text` cannot tell; the status and message, and that the client shows it as written; why the string literal; the red run, the mutations, the coverage table; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task S3: A session store that never answers, and an unreadable cookie on `/api/generate`, are both 503s

**Branch:** `fix/session-store-outage-answers` (server track, after S2). Items 3 and 7: both are what the session layer answers while Redis is unwell, in the same file, and each is a few lines.

**Bug 3: a Redis that accepts commands and never answers.** S1 of Phase 3 set `commandOptions: { timeout: REDIS_COMMAND_TIMEOUT_MS }` (1.5 s) on the client. node-redis applies that timeout only while a command waits in its queue: once the command is written to the socket the timer is dropped (`@redis/client/dist/lib/client/commands-queue.js:410-436`, as the Phase 3 server plan's "Not in this phase" table records; its probe saw a written `SET` still pending at 8 s). So a paused container or a half-open connection leaves `createSession`, `getSessionByToken` and `deleteSession` waiting with no end, and every signed-in request with them.

**The fix (owner-approved: wrap the session commands in the existing `withTimeout`).** `runSessionCommand` is the one function every session command already goes through (create, read, the junk-key delete, delete), so it runs `command()` inside `withTimeout(…, REDIS_SESSION_REPLY_TIMEOUT_MS, "Redis did not answer within 2000ms.")`. A missed deadline is then the same as any other failed command: logged with the command's own event, kept as `redisLastError`, thrown as `SessionStoreUnavailableError`, answered 503. The deadline is 2 s: it covers the whole command, so it is longer than the 1.5 s queueing timeout, which still answers first while the client reconnects; and it stays inside the spec's "1-2 s" for S1. The command's own promise is left pending (node-redis owns it); `withTimeout` clears its timer when the command answers in time, so a healthy store leaves nothing behind.

**Bug 7: `attachOptionalUser` treats a store outage as anonymous.** `sessionService.js:442-455` catches every error from `getSessionUser`, sets `req.user = null` and goes on. On `/api/generate` (`index.js:629`) a signed-in caller during an outage is then charged the anonymous quota (`anonGenerateLimiter`) and the plan is not saved, with no sign that anything was wrong.

**The fix (owner-approved: 503 when a cookie is present but unreadable).** A `SessionStoreUnavailableError` is answered 503 through `sendErrorResponse`, as `requireAuth` does. That error can only come from a session cookie the store could not read: with no cookie, `getSessionByToken` returns `null` before it asks Redis, so an anonymous caller is still served during an outage (a test pins it). Any other failure, such as the account lookup throwing, keeps today's anonymous fallback: the visitor can still get a plan, and that is the case the existing "continues as anonymous" test now names. The client shows the 503's masked "Server error." in the planner, as it does for every other 5xx.

**Files:**

- Modify: `server/src/services/auth/sessionService.js:17` (the deadline constant after `REDIS_COMMAND_TIMEOUT_MS`), `:194-200` (`runSessionCommand`), `:437-455` (`attachOptionalUser` and its doc comment)
- Test: `server/src/services/auth/__tests__/sessionService.redis.test.js` (four tests), `server/src/services/auth/__tests__/sessionService.auth.test.js` (one test's comment and error text)

- [ ] **Step 1: Branch, and confirm the one path**

```bash
git fetch origin && git switch -c fix/session-store-outage-answers origin/main
git grep -n "runSessionCommand(" -- server/src/services/auth/sessionService.js
git grep -n "attachOptionalUser" -- server/src
```

Expected: the definition and four calls (create, get, the junk delete, delete); `attachOptionalUser` defined and returned in `sessionService.js`, wired once at `index.js:629`.

- [ ] **Step 2: The failing tests**

Two tests hang a command (a promise that never settles) under fake timers and read where the request stands at the deadline; two pin `attachOptionalUser` with a cookie and without one. The existing "continues as anonymous when the lookup throws" keeps its body; its comment, which says a store outage must not refuse anyone, is rewritten to the rule it now pins, and its error text stops calling an account-lookup failure "redis". Write `$SCRATCH/s3-tests.diff`:

```diff
--- a/server/src/services/auth/__tests__/sessionService.auth.test.js
+++ b/server/src/services/auth/__tests__/sessionService.auth.test.js
@@ -346,11 +346,12 @@
     expect(next).toHaveBeenCalledTimes(1);
   });

-  // The point of this middleware: a route open to anonymous callers must not
-  // start refusing everyone because the session store is unwell.
+  // A failure that is not the session store's, here the account lookup, does
+  // not refuse a route open to anonymous callers: the caller goes on as
+  // anonymous. A store outage is a 503 (sessionService.redis.test.js).
   test("continues as anonymous when the lookup throws", async () => {
     findUserById = vi.fn(async () => {
-      throw new Error("redis is on fire");
+      throw new Error("database is on fire");
     });
     const service = buildService();
     const token = await service.createSession("u-1");
--- a/server/src/services/auth/__tests__/sessionService.redis.test.js
+++ b/server/src/services/auth/__tests__/sessionService.redis.test.js
@@ -445,6 +445,89 @@
     );
   });

+  // node-redis drops its own timeout once a command is written, so a Redis
+  // that accepts the command and never answers (a paused container, a
+  // half-open socket) would hold the request open for good. The session
+  // commands have their own deadline, 2 s.
+  test("a read that is written and never answered fails at the reply deadline", async () => {
+    const { service } = await connected();
+    const token = await service.createSession("u-1");
+    fakeRedis.get = vi.fn(() => new Promise(() => {}));
+    vi.useFakeTimers();
+    try {
+      const outcome = service.getSessionUser(req(token)).then(
+        () => "answered",
+        (err) => err
+      );
+
+      await vi.advanceTimersByTimeAsync(2000);
+      const settled = await Promise.race([outcome, Promise.resolve("still waiting")]);
+
+      expect(settled).toBeInstanceOf(SessionStoreUnavailableError);
+      expect(service.getRedisLastError()).toMatch(/did not answer/);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  test("a write that is never answered refuses the session at the reply deadline", async () => {
+    const { service } = await connected();
+    fakeRedis.set = vi.fn(() => new Promise(() => {}));
+    vi.useFakeTimers();
+    try {
+      const outcome = service.createSession("u-1").then(
+        () => "answered",
+        (err) => err
+      );
+
+      await vi.advanceTimersByTimeAsync(1999);
+      expect(await Promise.race([outcome, Promise.resolve("still waiting")])).toBe("still waiting");
+      await vi.advanceTimersByTimeAsync(1);
+
+      expect(await Promise.race([outcome, Promise.resolve("still waiting")])).toBeInstanceOf(
+        SessionStoreUnavailableError
+      );
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  // /api/generate runs attachOptionalUser. A caller whose session cookie
+  // cannot be read is not anonymous: going on as anonymous would charge the
+  // anonymous quota and save nothing, while telling them nothing was wrong.
+  test("attachOptionalUser answers 503, not anonymous, when the read fails", async () => {
+    const { service } = await connected();
+    const token = await service.createSession("u-1");
+    fakeRedis.get = failing();
+    const res = buildRes();
+    const next = vi.fn();
+
+    await service.attachOptionalUser(
+      { ...req(token), log: { error: vi.fn(), warn: vi.fn() } },
+      res,
+      next
+    );
+
+    expect(res.statusCode).toBe(503);
+    expect(JSON.stringify(res.body)).not.toMatch(/on fire/);
+    expect(next).not.toHaveBeenCalled();
+  });
+
+  // With no cookie there is nothing to read, so the store is never asked and
+  // an anonymous caller is served during the outage.
+  test("attachOptionalUser still serves a caller with no session cookie", async () => {
+    const { service } = await connected();
+    fakeRedis.get = failing();
+    const request = { headers: {} };
+    const next = vi.fn();
+
+    await service.attachOptionalUser(request, buildRes(), next);
+
+    expect(request.user).toBeNull();
+    expect(next).toHaveBeenCalledTimes(1);
+    expect(fakeRedis.get).not.toHaveBeenCalled();
+  });
+
   test("requireAuth answers 503, not 401, when the read fails", async () => {
     const { service } = await connected();
     const token = await service.createSession("u-1");
```

```bash
git apply "$SCRATCH/s3-tests.diff"
npm run test -w server -- src/services/auth/__tests__/sessionService.redis.test.js src/services/auth/__tests__/sessionService.auth.test.js src/services/auth/__tests__/sessionService.test.js > "$SCRATCH/s3-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |AssertionError" "$SCRATCH/s3-red.txt"
```

Expected: `exit=1`, `Tests  3 failed | 121 passed (124)`. The two deadline tests read `expected 'still waiting' to be an instance of SessionStoreUnavailableError`: at 2 s the request is still waiting on Redis, which is bug 3. The `attachOptionalUser` 503 test reads `expected null to be 503`: the middleware answered nothing and went on, which is bug 7. "still serves a caller with no session cookie" passes already; it is the guard that the 503 is only for a cookie.

- [ ] **Step 3: The fix**

Write `$SCRATCH/s3-fix.diff`:

```diff
--- a/server/src/services/auth/sessionService.js
+++ b/server/src/services/auth/sessionService.js
@@ -16,6 +16,14 @@
 // get it too; both check isReady before using it.
 const REDIS_COMMAND_TIMEOUT_MS = 1500;

+// How long a session command may wait for Redis's answer, in ms. node-redis
+// drops the timeout above once a command is written, so a Redis that accepts
+// the command and never answers (a paused container, a half-open connection)
+// would leave the request waiting with no end. This deadline covers the whole
+// command, so it is longer than the queueing timeout, which answers first while
+// the client reconnects.
+const REDIS_SESSION_REPLY_TIMEOUT_MS = 2000;
+
 /**
  * Thrown by a session operation when Redis is the store and a command on it
  * failed. It carries status 503, and the Redis error as its `cause`.
@@ -191,12 +199,17 @@
     }
   };

-  // Runs one command while Redis is the session store. A failure is logged and
+  // Runs one command while Redis is the session store, within
+  // REDIS_SESSION_REPLY_TIMEOUT_MS. A failure or a missed deadline is logged and
   // kept as the store's last error, then thrown as SessionStoreUnavailableError:
   // reads consult only Redis, so a fallback would hide the failure, not fix it.
   const runSessionCommand = async (event, message, command) => {
     try {
-      const result = await command();
+      const result = await withTimeout(
+        command(),
+        REDIS_SESSION_REPLY_TIMEOUT_MS,
+        `Redis did not answer within ${REDIS_SESSION_REPLY_TIMEOUT_MS}ms.`
+      );
       redisLastError = "";
       return result;
     } catch (err) {
@@ -429,14 +442,19 @@
   };

   /**
-   * Resolves the session user when one is present but never rejects the request.
-   * Lets a route stay open to anonymous callers while still letting rate limiters
-   * and handlers tell the two apart.
+   * Resolves the session user when one is present, so a route can stay open to
+   * anonymous callers while rate limiters and handlers tell the two apart. A
+   * session cookie the unavailable store cannot read answers 503, as
+   * requireAuth does: going on as anonymous would charge the anonymous quota and
+   * save nothing. Any other lookup failure goes on as anonymous.
    */
   const attachOptionalUser = async (req, res, next) => {
     try {
       req.user = (await getSessionUser(req)) || null;
     } catch (err) {
+      if (err instanceof SessionStoreUnavailableError) {
+        return sendErrorResponse(req, res, err, 503);
+      }
       req.user = null;
       req.log?.warn(
         {
```

```bash
git apply "$SCRATCH/s3-fix.diff"
npx prettier --write server/src/services/auth/sessionService.js server/src/services/auth/__tests__/sessionService.redis.test.js server/src/services/auth/__tests__/sessionService.auth.test.js
npm run test -w server -- src/services/auth/__tests__/sessionService.redis.test.js src/services/auth/__tests__/sessionService.auth.test.js src/services/auth/__tests__/sessionService.test.js > "$SCRATCH/s3-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s3-green.txt"
git add server/src
git commit -m "fix(server): a silent session store, and an unreadable cookie on generate, answer 503" -m "node-redis drops its command timeout once a command is written, so a Redis that never answered held the request for good. Every session command now has a 2 s reply deadline through withTimeout, and a missed one is the store's 503. attachOptionalUser answers 503 for a session cookie the unavailable store cannot read, instead of going on as anonymous." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  124 passed (124)`.

**Comments.** The new constant says why it exists and why 2 s; `runSessionCommand`'s comment says the deadline is part of a failure; `attachOptionalUser`'s doc comment, which said it "never rejects the request", now says when it does and why. The file header ("while Redis is the store, a failed command is a 503") stays true, a missed deadline being a failed command. `generateRoutes.js:196-197` ("`req.user` is populated by attachOptionalUser, so a signed-in caller still gets their plan persisted") stays true.

- [ ] **Step 4: Mutation checks**

| Mutation (`sessionService.js`)                                        | Caught by                                                                                       |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `await withTimeout(command(), …)` → `await command()`                 | both deadline tests                                                                             |
| `REDIS_SESSION_REPLY_TIMEOUT_MS = 2000` → `2001`                      | both deadline tests (the write test pins "still waiting" at 1999 ms and the refusal at 2000 ms) |
| `if (err instanceof SessionStoreUnavailableError) {` → `if (false) {` | "attachOptionalUser answers 503, not anonymous, when the read fails"                            |
| the same line → `if (err) {` (every failure a 503)                    | "continues as anonymous when the lookup throws" (`sessionService.auth.test.js`)                 |

Each run alone in the scratch copy, with exactly those failures.

- [ ] **Step 5: Coverage**

| Metric     | After S2    | After S3    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 2276 / 2392 | 2279 / 2395 | 95.1566 | 95.1  | 1.36  |
| Branches   | 1662 / 1881 | 1664 / 1883 | 88.3696 | 88.2  | 3.19  |
| Functions  | 382 / 397   | 382 / 397   | 96.2217 | 96.2  | 0.09  |
| Lines      | 2045 / 2125 | 2048 / 2128 | 96.2406 | 96.2  | 0.86  |

Three statements and lines and the `instanceof` branch's two arms, all covered. Tests 1186 → 1190.

- [ ] **Step 6: Gates and PR**

Run the gates. `git push -u origin fix/session-store-outage-answers`; `gh pr create --draft --base main --title "fix(server): a silent session store, and an unreadable cookie on generate, answer 503" --body-file "$SCRATCH/pr-s3.md"`. Outline: the two owner items; node-redis's queue-only timeout (the Phase 3 note) and why one wrapper covers every command; why 2 s; who gets the 503 on generate and who still gets anonymous; the red run, mutations and coverage; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. The quality review should look at the anonymous-versus-503 rule specifically. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task S4: A sign-up whose session cannot be stored is undone, and sign-out retries its delete

**Branch:** `fix/signup-signout-store-outage` (server track, after S3). Items 5 and 6, server half; both are what `authRoutes.js` does when the session store fails after S1 of Phase 3. Item 6's client half is Task C2.

**Bug 5: the half-made sign-up.** `authRoutes.js:131-133` writes the account, then `createSession`. When the store is down the visitor gets a 503 ("Server error.") with no cookie, but the account stays. Their retry, once the store is back, finds it and answers **409 "Account already exists."**, for an account they were told was not made; only "Log in" with the same password works, which nothing tells them.

**Weighing the two approaches the owner offered.**

|                       | (a) Undo the sign-up: delete the account when its session cannot be stored                                           | (b) Let a retry with the same password sign in                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the visitor sees | the 503, then a retry that succeeds as a sign-up                                                                     | the 503, then a retry that succeeds as a sign-in                                                                                                                                                                             |
| What a retry stores   | the profile the retry sends                                                                                          | the profile the **first** attempt sent; the retry's is silently dropped                                                                                                                                                      |
| What sign-up means    | unchanged: it creates an account or refuses                                                                          | it becomes "create, or sign in if the password matches": a second credential check beside `/api/auth/login`, with its own timing and failure counting to get right (login's dummy-hash equalisation, `metrics.authFailures`) |
| When it does not help | the delete fails too (the database is down as well as Redis): the account stays, as today, and is logged             | the first attempt's password differs from the retry's: still a 409                                                                                                                                                           |
| Code                  | one `try` around `createSession`, one `deleteUser` (already in the route's deps, cascades, used by account deletion) | a verify on the 409 path, and a session and cookies there                                                                                                                                                                    |

**Recommendation: (a), and this task takes it.** It keeps sign-up's meaning, makes the server's state match what the visitor was told, and adds nothing to the authentication surface. (b) fixes the symptom by widening what sign-up does. Not a decision the owner needs to revisit unless they prefer (b).

**Bug 6: sign-out during an outage.** `authRoutes.js:317-323` clears both cookies, then deletes the session; a failed delete already answers 503 (Phase 3's S1), but the session stays valid in Redis for its TTL (7 days, `SESSION_TTL_MS`), and this browser, its cookie cleared, can never ask again. **The fix (owner-approved: retry, and report a failure honestly):** the delete is tried once more before the route gives up; a second failure is the 503 it already was. With S3's 2 s reply deadline, the worst case is about 4 s. The answer stays the masked "Server error." 503 (the client decides what to say; Task C2). Account deletion (`DELETE /api/auth/me`) keeps its single delete: its session names a user that no longer exists, which `getSessionUser` already rejects and deletes on first use.

**Files:**

- Modify: `server/src/routes/authRoutes.js:118-134` (sign-up: the comment and the undo), `:255-258` (the password route's comment, which compared itself with sign-up), `:317-323` (logout: the comment and the retry)
- Test: `server/src/routes/__tests__/authRoutes.test.js` (a `deleteUser` fake in the shared deps; two sign-up tests, one logout test, one logout test extended)

- [ ] **Step 1: Branch, and confirm the order**

```bash
git fetch origin && git switch -c fix/signup-signout-store-outage origin/main
grep -n "await createUser(newUser);\|const token = await createSession(newUser.id);\|if (token) await deleteSession(token);" server/src/routes/authRoutes.js
```

Expected: `createUser` then `createSession` in sign-up, and two single `deleteSession` calls (account deletion and logout).

- [ ] **Step 2: The failing tests**

The shared deps gain a `deleteUser` fake over the `rows` fixture, as production's deps carry one. Write `$SCRATCH/s4-tests.diff`:

```diff
--- a/server/src/routes/__tests__/authRoutes.test.js
+++ b/server/src/routes/__tests__/authRoutes.test.js
@@ -190,6 +190,13 @@
     deleteSession: vi.fn(async (token) => {
       sessions = sessions.filter((item) => item.token !== token);
     }),
+    // A stand-in for userRepository's deleteUser: drops the row, and reports
+    // whether there was one.
+    deleteUser: vi.fn(async ({ userId }) => {
+      const before = rows.length;
+      rows = rows.filter((item) => item.userId !== userId);
+      return rows.length < before;
+    }),
     clearSessionCookie: vi.fn(() => {
       cookieCalls.clearedSession += 1;
     }),
@@ -336,9 +343,8 @@
     expect(JSON.stringify(response.body)).not.toMatch(/connection terminated/);
   });

-  // The account is written before the session, so it exists and can sign in
-  // once the store is back; what must not happen is a cookie for a session
-  // that was never stored.
+  // The account is written before the session. What must not happen is a
+  // cookie for a session that was never stored.
   test("answers 503 with no cookie when the session store is unavailable", async () => {
     const app = buildApp({
       ...realCookieWriters(),
@@ -353,6 +359,50 @@
     expect(response.headers["set-cookie"]).toBeUndefined();
     expect(JSON.stringify(response.body)).not.toMatch(/on fire/);
   });
+
+  // The visitor was told the sign-up failed, so the account it wrote must not
+  // be left to answer their retry with 409.
+  test("undoes the account when its session cannot be stored, so a retry signs up", async () => {
+    let storeUp = false;
+    const app = buildApp({
+      createSession: async (userId) => {
+        if (!storeUp) throw storeDown();
+        sessions.push({ token: "sess-retry", userId });
+        return "sess-retry";
+      }
+    });
+
+    const first = await request(app).post("/api/auth/signup").send(signupBody());
+    expect(first.status).toBe(503);
+    expect(rows).toHaveLength(0);
+
+    storeUp = true;
+    const retry = await request(app).post("/api/auth/signup").send(signupBody());
+
+    expect(retry.status).toBe(200);
+    expect(rows).toHaveLength(1);
+  });
+
+  // The undo can fail too, with the database. The answer is still the
+  // session's 503, and the account left behind is recorded for an operator.
+  test("still answers 503, and records it, when the undo fails", async () => {
+    const app = buildApp({
+      createSession: async () => {
+        throw storeDown();
+      },
+      deleteUser: async () => {
+        throw new Error("connection terminated unexpectedly");
+      }
+    });
+
+    const response = await request(app).post("/api/auth/signup").send(signupBody());
+
+    expect(response.status).toBe(503);
+    expect(logError).toHaveBeenCalledWith(
+      expect.objectContaining({ event: "signup_undo_failed" }),
+      expect.any(String)
+    );
+  });
 });

 describe("POST /api/auth/login", () => {
@@ -1403,18 +1453,34 @@
   // This browser is signed out either way. The 503 says the session itself
   // could not be ended, so it stays valid in the store until it expires.
   test("answers 503, and still clears both cookies, when the store is unavailable", async () => {
-    const app = buildApp({
-      ...realCookieWriters(),
-      deleteSession: async () => {
-        throw storeDown();
-      }
+    const deleteSession = vi.fn(async () => {
+      throw storeDown();
     });
+    const app = buildApp({ ...realCookieWriters(), deleteSession });

     const response = await request(app).post("/api/auth/logout").set("Cookie", "sid=sess-1");

     expect(response.status).toBe(503);
+    expect(deleteSession).toHaveBeenCalledTimes(2);
     const cookies = response.headers["set-cookie"].join("\n");
     expect(cookies).toMatch(/^sid=;/m);
     expect(cookies).toMatch(/^csrfToken=;/m);
   });
+
+  // The cleared cookie means this browser cannot ask again, so the server
+  // tries the delete a second time before it gives up.
+  test("retries a failed delete once, and succeeds when the retry does", async () => {
+    const deleteSession = vi
+      .fn()
+      .mockRejectedValueOnce(storeDown())
+      .mockResolvedValueOnce(undefined);
+    const app = buildApp({ deleteSession });
+
+    const response = await request(app).post("/api/auth/logout").set("Cookie", "sid=sess-1");
+
+    expect(response.status).toBe(200);
+    expect(response.body).toEqual({ ok: true });
+    expect(deleteSession).toHaveBeenCalledTimes(2);
+    expect(deleteSession).toHaveBeenLastCalledWith("sess-1");
+  });
 });
```

```bash
git apply "$SCRATCH/s4-tests.diff"
npm run test -w server -- src/routes/__tests__/authRoutes.test.js > "$SCRATCH/s4-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |AssertionError" "$SCRATCH/s4-red.txt"
```

Expected: `exit=1`, `Tests  4 failed | 84 passed (88)`:

- "undoes the account when its session cannot be stored, so a retry signs up": `expected [ { …(8) } ] to have a length of +0 but got 1`, the account left behind (bug 5);
- "still answers 503, and records it, when the undo fails": `signup_undo_failed` never logged, because there is no undo;
- "answers 503, and still clears both cookies, when the store is unavailable": `expected "vi.fn()" to be called 2 times, but got 1 times` (bug 6);
- "retries a failed delete once, and succeeds when the retry does": `expected 503 to be 200`.

- [ ] **Step 3: The fix**

Write `$SCRATCH/s4-fix.diff`:

```diff
--- a/server/src/routes/authRoutes.js
+++ b/server/src/routes/authRoutes.js
@@ -117,8 +117,10 @@

       // Write the account, then sign it in: a session cookie and a new CSRF token.
       // A session store that is down fails createSession before either cookie
-      // is set, so the answer is a 503 with no cookie, and the account it
-      // leaves behind signs in once the store is back.
+      // is set, so the answer is a 503 with no cookie. The account is deleted
+      // again first: the visitor is told the sign-up failed, so a retry has to
+      // be a fresh sign-up, not a 409. If that delete fails too, the account
+      // stays (it signs in once the store is back) and the failure is logged.
       const { salt, hash, passwordAlgo } = await hashPassword(password);
       const newUser = {
         id: crypto.randomUUID(),
@@ -131,7 +133,20 @@
         dashboard: defaultDashboard()
       };
       await createUser(newUser);
-      const token = await createSession(newUser.id);
+      let token;
+      try {
+        token = await createSession(newUser.id);
+      } catch (sessionErr) {
+        try {
+          await deleteUser({ userId: newUser.id });
+        } catch (undoErr) {
+          req.log?.error(
+            { event: "signup_undo_failed", error: toShortText(String(undoErr), 240) },
+            "Could not delete the account of a sign-up whose session was not stored."
+          );
+        }
+        throw sessionErr;
+      }
       setSessionCookie(res, token, rememberMe);
       // A new CSRF token replaces the one the browser held while signed out.
       // useApiClient reads this cookie before every write, so the client's
@@ -254,8 +269,7 @@
       // up, since passwordChangedAt already rejects it, so a failure there is
       // logged and the change goes on. A failure to create the replacement
       // session still answers 503: the password has changed, but this device
-      // holds no valid session and signs in again with the new password, as
-      // a sign-up does when its session cannot be stored.
+      // holds no valid session and signs in again with the new password.
       const previousToken = parseCookies(req.headers.cookie || "").sid;
       if (previousToken) {
         try {
@@ -316,11 +330,12 @@
       const cookies = parseCookies(req.headers.cookie || "");
       const token = cookies.sid;
       // The cookies are cleared first, so this browser is signed out even when
-      // the delete fails. That failure still answers 503: the session itself
-      // stays valid in the store until it expires.
+      // the delete fails. It can then no longer end the session itself, so a
+      // failed delete is tried once more; a second failure answers 503, and the
+      // session stays valid in the store until it expires.
       clearSessionCookie(res);
       clearCsrfCookie(res);
-      if (token) await deleteSession(token);
+      if (token) await deleteSession(token).catch(() => deleteSession(token));
       res.json({ ok: true });
     } catch (err) {
       sendErrorResponse(req, res, err, sessionErrorStatus(err));
```

```bash
git apply "$SCRATCH/s4-fix.diff"
npx prettier --write server/src/routes/authRoutes.js server/src/routes/__tests__/authRoutes.test.js
npm run test -w server -- src/routes/__tests__/authRoutes.test.js > "$SCRATCH/s4-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s4-green.txt"
git add server/src
git commit -m "fix(server): undo a sign-up whose session cannot be stored; retry sign-out's delete" -m "A sign-up that answered 503 left its account behind, so the visitor's retry got 409. The account is now deleted again before the 503, and a failure to delete it is logged. Sign-out clears this browser's cookies before it deletes the session, so it can never ask again: a failed delete is now tried once more before the 503." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  88 passed (88)`.

**Comments.** Sign-up's comment said the account left behind "signs in once the store is back"; it now says the account is deleted again and why, and what happens when that fails. The password route's comment compared its own 503 with "a sign-up ... when its session cannot be stored", which is no longer alike, so the comparison goes. Logout's comment says why the delete is retried. The file header and `registerAuthRoutes`'s doc comment ("A route that reads or writes a session answers 503 when the session store is unavailable") stay true. In the tests, the existing sign-up 503 test's comment loses the same "signs in once the store is back" clause.

- [ ] **Step 4: Mutation checks**

| Mutation (`authRoutes.js`)                                                        | Caught by                                                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| delete `await deleteUser({ userId: newUser.id });`                                | "undoes the account…", "still answers 503, and records it…"                                                               |
| `event: "signup_undo_failed"` → `event: "signup_other"`                           | "still answers 503, and records it, when the undo fails"                                                                  |
| delete `throw sessionErr;`                                                        | "answers 503 with no cookie when the session store is unavailable", and both new sign-up tests                            |
| `deleteSession(token).catch(() => deleteSession(token))` → `deleteSession(token)` | both logout outage tests                                                                                                  |
| the retry's own failure swallowed (`.catch(() => {})` on the second call)         | "still clears cookies when the delete fails", "answers 503, and still clears both cookies, when the store is unavailable" |

Each run alone in the scratch copy, with exactly those failures.

- [ ] **Step 5: Coverage**

| Metric     | After S3    | After S4    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 2279 / 2395 | 2285 / 2401 | 95.1687 | 95.1  | 1.65  |
| Branches   | 1664 / 1883 | 1664 / 1883 | 88.3696 | 88.2  | 3.19  |
| Functions  | 382 / 397   | 383 / 398   | 96.2312 | 96.2  | 0.12  |
| Lines      | 2048 / 2128 | 2053 / 2133 | 96.2494 | 96.2  | 1.05  |

Six statements, five lines and one function (the retry's arrow), all covered; `try`/`catch` adds no branch. Tests 1190 → 1193.

- [ ] **Step 6: Gates and PR**

Run the gates; the E2E suite signs up and logs out against a healthy store, so it must stay green. `git push -u origin fix/signup-signout-store-outage`; `gh pr create --draft --base main --title "fix(server): undo a sign-up whose session cannot be stored; retry sign-out's delete" --body-file "$SCRATCH/pr-s4.md"`. Outline: the two owner items; the (a)/(b) table and why (a); why one retry and why account deletion keeps one; the red run, mutations and coverage; that Task C2 is the client half; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task S5: Two meals saved at once for the same day both count

**Branch:** `fix/meal-log-daily-sync-race` (server track, after S4).

**The bug.** `mealLogRepository.saveMealLogWithDailySync` (`:170-177`) runs, in one Prisma interactive transaction at Postgres's default READ COMMITTED, the meal's insert and then `syncDerivedCalorieEntry` (`:122-159`): it checks for a manual entry, sums the day's meals, reads the derived entry and creates or updates it. Two saves for the same user and day, overlapping (two tabs, a double tap, the optimistic queue flushing at logout), each sum only their own meal, because neither can see the other's uncommitted insert. Then either both find no derived entry and both create one with the same `legacy_id` (`meal-logs-<date>`), and the second blocks on `calorie_entries_user_legacy_idx` until the first commits and fails with a unique violation, rolling its meal back and answering 500; or the first commits before the second reads, and the second overwrites the day's total with its own meal alone. Either way the calories view is wrong or a meal is lost.

**Which atomic read-then-write.** CLAUDE.md's note holds here: `upsert` is not available, because the uniqueness is a partial unique index Prisma cannot target, and an upsert would not fix the stale sum anyway. The options, as measured in the scratch copy with the test below:

| Option                                                                      | Result                                                                                                                                                                                                                                                                           | Verdict                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `SELECT … FOR UPDATE` on the user's `app_users` row, at the top of the sync | **`40P01 deadlock detected`** on every run. Each save's meal insert already holds a `FOR KEY SHARE` lock on that row through `meal_logs.user_id`'s foreign key, and `FOR UPDATE` conflicts with `KEY SHARE`, so each waits for the other                                         | Rejected, measured                      |
| `FOR NO KEY UPDATE` on the same row                                         | Passes (measured): it does not conflict with `KEY SHARE`. But it is correct only because of a lock-mode detail a later edit could undo (the row lock above differs by two words and deadlocks), and it holds up every other write to the user's row for the transaction's length | Not chosen                              |
| `pg_advisory_xact_lock` keyed on the user, at the top of the sync           | Passes, five runs of five. Released at commit or rollback by Postgres itself; touches no table row, so no foreign key or other writer can deadlock with it                                                                                                                       | **Recommended, and this task takes it** |
| SERIALIZABLE transaction with a retry on `P2034`                            | Correct, but needs a retry loop and a bound on it, and turns a contention into wasted work and a possible 500 when the retries run out                                                                                                                                           | Not chosen                              |
| A unique index on `(user_id, calorie_date) where source = 'meal_logs'`      | Already effectively there through `legacy_id`, and it is what produces the collision: it turns the race into an error, not into a right total                                                                                                                                    | Does not fix it                         |

The lock key is `hashtextextended('meal-log-day:' || <user uuid>, 0)`, a bigint. Two users whose keys collide only take turns; no answer changes. It is per user rather than per user and day: the meals of one person are low-traffic, and one key per user is simpler to read than a hash of two values. `select 1 as locked from pg_advisory_xact_lock(…)` rather than `select pg_advisory_xact_lock(…)`, because the function returns `void`, which Prisma 7's `$queryRaw` cannot deserialize (measured: "Failed to deserialize column of type 'void'").

**Files:**

- Modify: `server/src/repositories/mealLogRepository.js:109-125` (the sync's doc comment and its first statement after the guard)
- Test: `server/src/routes/dashboard/write/__tests__/mealLogs.integration.test.js` (the race test; `$queryRaw` passed through the existing failing-client wrapper)

- [ ] **Step 1: Branch, and confirm the transaction's shape**

```bash
git fetch origin && git switch -c fix/meal-log-daily-sync-race origin/main
sed -n '122,141p;170,177p' server/src/repositories/mealLogRepository.js
grep -n "calorie_entries_user_legacy_idx" -A 2 server/db/postgres/001_foundation.sql
```

Expected: the sync's guard, manual check, sum and derived lookup; the transaction calling save then sync; the partial unique index `on calorie_entries (user_id, legacy_id) where legacy_id is not null`.

- [ ] **Step 2: The failing test**

A real race against Postgres, made certain rather than lucky: the test hands the repository a Prisma client whose transaction client pauses each save after its `mealLog.aggregate` (the day's sum) until the other save has summed too, or 300 ms have passed. On `main` both sums are read before either writes, every time. The existing "a failing derived-entry write rolls the meal back" test builds its own client from three delegates, so it also passes `$queryRaw` through, which the fix needs. Write `$SCRATCH/s5-tests.diff`:

```diff
--- a/server/src/routes/dashboard/write/__tests__/mealLogs.integration.test.js
+++ b/server/src/routes/dashboard/write/__tests__/mealLogs.integration.test.js
@@ -289,6 +289,7 @@
     const failingOver = (client) => ({
       appUser: client.appUser,
       mealLog: client.mealLog,
+      $queryRaw: (...args) => client.$queryRaw(...args),
       calorieEntry: {
         findFirst: (args) => client.calorieEntry.findFirst(args),
         create: () => Promise.reject(new Error("derived write failed")),
@@ -334,6 +335,75 @@
     expect(await prisma.calorieEntry.count()).toBe(0);
   });

+  // Two meals saved at once for the same day. Each save sums the day's meals
+  // in its own transaction, and neither can see the other's uncommitted meal,
+  // so without a lock each derives the day's entry from its own meal alone:
+  // the second write either collides with the first's entry (a unique
+  // violation, and its meal rolled back) or overwrites it with a total that
+  // leaves the first meal out. The barrier holds each save after its sum until
+  // the other has summed too, or 300 ms have passed, which makes that
+  // interleaving certain rather than lucky.
+  test("two meals saved at once for the same day both count", async () => {
+    const [user] = await prisma.appUser.findMany({ select: { id: true } });
+    let arrived = 0;
+    let releaseAll;
+    const allArrived = new Promise((resolve) => {
+      releaseAll = resolve;
+    });
+    const meet = async () => {
+      arrived += 1;
+      if (arrived >= 2) releaseAll();
+      await Promise.race([allArrived, new Promise((resolve) => setTimeout(resolve, 300))]);
+    };
+    // The transaction client, with mealLog.aggregate waiting at the barrier
+    // once its sum is read. Everything else is the real client.
+    const pausingAfterSum = (tx) =>
+      new Proxy(tx, {
+        get(target, prop) {
+          if (prop === "mealLog") {
+            return {
+              ...target.mealLog,
+              findFirst: (args) => target.mealLog.findFirst(args),
+              create: (args) => target.mealLog.create(args),
+              update: (args) => target.mealLog.update(args),
+              aggregate: async (args) => {
+                const sum = await target.mealLog.aggregate(args);
+                await meet();
+                return sum;
+              }
+            };
+          }
+          const value = Reflect.get(target, prop);
+          return typeof value === "function" ? value.bind(target) : value;
+        }
+      });
+    const racingPrisma = new Proxy(prisma, {
+      get(target, prop) {
+        if (prop === "$transaction") {
+          return (callback) => target.$transaction((tx) => callback(pausingAfterSum(tx)));
+        }
+        return Reflect.get(target, prop);
+      }
+    });
+    const { saveMealLogWithDailySync } = createMealLogRepository({ prisma: racingPrisma });
+
+    const results = await Promise.allSettled([
+      saveMealLogWithDailySync({
+        userId: user.id,
+        mealLog: { id: "race-1", date: "2026-06-21", name: "Oats", calories: 400 }
+      }),
+      saveMealLogWithDailySync({
+        userId: user.id,
+        mealLog: { id: "race-2", date: "2026-06-21", name: "Soup", calories: 300 }
+      })
+    ]);
+
+    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
+    expect(await prisma.mealLog.count()).toBe(2);
+    const entries = await prisma.calorieEntry.findMany({ select: { calories: true } });
+    expect(entries).toEqual([{ calories: 700 }]);
+  });
+
   test("saveMealLogWithDailySync returns null for an unknown user", async () => {
     const { saveMealLogWithDailySync } = createMealLogRepository({ prisma });
     const result = await saveMealLogWithDailySync({
```

```bash
git apply "$SCRATCH/s5-tests.diff"
npm run test -w server -- src/routes/dashboard/write/__tests__/mealLogs.integration.test.js > "$SCRATCH/s5-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |AssertionError|Unique constraint" "$SCRATCH/s5-red.txt"
```

Expected: `exit=1`, `Tests  1 failed | 21 passed (22)`, with `AssertionError: expected [ 'fulfilled', 'rejected' ] to deeply equal [ 'fulfilled', 'fulfilled' ]` and, logged, `Unique constraint failed on the constraint: calorie_entries_user_legacy_idx`: both saves created the day's entry, and the second lost its meal. Five runs in the scratch copy failed the same way.

- [ ] **Step 3: The fix**

Write `$SCRATCH/s5-fix.diff`:

```diff
--- a/server/src/repositories/mealLogRepository.js
+++ b/server/src/repositories/mealLogRepository.js
@@ -118,11 +118,22 @@
      *
      * Recomputing the whole day rather than adding a delta means this is correct
      * when an existing meal is edited, which the POST route allows by id.
+     *
+     * It first takes a transaction-level advisory lock keyed on the user. Inside
+     * saveMealLogWithDailySync's transaction the lock holds until commit, so two
+     * saves for one user take turns here: the second waits, then sums with the
+     * first's meal committed. Without it each would sum only its own meal
+     * (neither sees the other's uncommitted row), and the second write would
+     * either collide with the first's derived entry or overwrite it with a total
+     * missing a meal. Not a lock on the user's row: each save's meal insert
+     * already holds a key-share lock on that row through the foreign key, so two
+     * saves asking for FOR UPDATE deadlock.
      */
     const syncDerivedCalorieEntry = async ({ userId, date }) => {
       const userPk = await getUserPk(prisma, userId);
       const calorieDate = dateOnlyToDate(date);
       if (!userPk || !calorieDate) return null;
+      await prisma.$queryRaw`select 1 as locked from pg_advisory_xact_lock(hashtextextended(${`meal-log-day:${userPk}`}, 0))`;

       const manualEntry = await prisma.calorieEntry.findFirst({
         where: { userId: userPk, calorieDate, NOT: { source: DERIVED_CALORIE_SOURCE } },
```

```bash
git apply "$SCRATCH/s5-fix.diff"
npx prettier --write server/src/repositories/mealLogRepository.js server/src/routes/dashboard/write/__tests__/mealLogs.integration.test.js
for i in 1 2 3; do npm run test -w server -- src/routes/dashboard/write/__tests__/mealLogs.integration.test.js > "$SCRATCH/s5-green-$i.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s5-green-$i.txt"; done
git add server/src
git commit -m "fix(server): two meals saved at once for one day both count" -m "Each save summed the day's meals in its own transaction without seeing the other's uncommitted meal, so the second either collided with the first's derived entry (a unique violation, its meal rolled back) or overwrote it with a total missing a meal. The sync now takes a transaction-level advisory lock keyed on the user first, so saves for one user take turns. A row lock on app_users deadlocks against the meal insert's foreign-key lock." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: three `exit=0`, each `Tests  22 passed (22)`. The race test takes about 350 ms with the fix: the first save waits out the barrier's 300 ms while the second waits for the lock.

**Comments.** The sync's doc comment gains a paragraph: what the lock is, why it holds until commit, what goes wrong without it, and why it is not a row lock. The file header ("the save (with the day's calorie entry re-derived in the same transaction)") and `saveMealLogWithDailySync`'s comment stay true. CLAUDE.md's "upsert usually is not available" note stays true; no record changes.

- [ ] **Step 4: Mutation checks**

| Mutation (`mealLogRepository.js`)                                                                | Caught by                                                                                 |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| delete the `$queryRaw` lock                                                                      | "two meals saved at once for the same day both count" (the unique violation)              |
| the lock replaced by `select 1 as locked from app_users where id = ${userPk}::uuid for update`   | the same test, with `40P01 deadlock detected`: the documented reason the lock is advisory |
| `pg_advisory_xact_lock(` → `pg_try_advisory_lock(` (does not wait, and outlives the transaction) | the same test                                                                             |

- [ ] **Step 5: Coverage**

| Metric     | After S4    | After S5    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 2285 / 2401 | 2286 / 2402 | 95.1707 | 95.1  | 1.70  |
| Branches   | 1664 / 1883 | 1664 / 1883 | 88.3696 | 88.2  | 3.19  |
| Functions  | 383 / 398   | 383 / 398   | 96.2312 | 96.2  | 0.12  |
| Lines      | 2053 / 2133 | 2054 / 2134 | 96.2512 | 96.2  | 1.09  |

One statement and line, covered by every meal-log test. Tests 1193 → 1194.

- [ ] **Step 6: Gates and PR**

Run the gates; the E2E suite logs a workout, not a meal, so the race test is the proof. `git push -u origin fix/meal-log-daily-sync-race`; `gh pr create --draft --base main --title "fix(server): two meals saved at once for one day both count" --body-file "$SCRATCH/pr-s5.md"`. Outline: the owner item and the two ways the race goes wrong; the options table with the measured deadlock; why advisory and per user; the barrier and why the red is certain; the mutations, the coverage; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. The quality review should read the lock reasoning specifically. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task S6: The startup check covers the three GEMINI limits and refuses fractions

**Branch:** `fix/env-validation-gemini-and-integers` (server track, after S5).

**The bugs.** `server/src/services/platform/envValidationService.js:16-47`'s `NUMERIC_VARS` has no row for `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_TIMEOUT_MS` or `GEMINI_MAX_PLAN_CHARS`, which `generateRoutes.js:254-258` reads per request through `toPositiveInt`; so `GEMINI_TIMEOUT_MS=0` or `=30s` starts cleanly and every generation silently runs on the 30 s default. And the check accepts any finite number (`Number.isFinite`, `:79`), so `API_RATE_LIMIT_MAX=1500.5` passes while `toPositiveInt` (`index.js:263-267`, `Number.isInteger(parsed) && parsed > 0`) replaces it with 300: exactly what the file's own comment calls "worse than no floor: it tells the operator their setting took effect when it did not."

**The fix (owner-approved: add the three, and reject non-integers).** Three rows with `min: 1`, the same floor `toPositiveInt` applies. After the existing "must be a number" check, a value that is not a whole number gets `<NAME> must be a whole number (received <value>).` Every reader of a `NUMERIC_VARS` setting takes whole numbers only: `toPositiveInt` for all but three, `parseRedisPort` for `REDIS_PORT`, `app.listen` for `PORT`. The one exception, `WGER_DEFAULT_LANGUAGE` (`toNullableNumber(…, 1, 100)`, `index.js:335`), would take `2.5`, but a wger language id is a whole number, so refusing a fraction there is a correct, stricter check; the comment says so.

**The numeric-coercion contract.** CLAUDE.md asks for a row in `numericCoercion.contract.test.js` for each numeric helper, and `validateEnv` is not one (it returns messages). What the owner's "mind the contract test" protects here is agreement between the check and the reader, so the contract file gains one block that pins it: for ten values, from `"42"` and `" 42 "` through `"1e3"`, `"0x10"`, `"1500.5"`, `"0"`, `"-3"`, `"Infinity"` and `"lots"`, `validateEnv` accepts `GEMINI_TIMEOUT_MS=<value>` exactly when `toPositiveInt` keeps it. The existing `toPositiveInt` row is untouched; absent input still does not reach the check (`isBlank` comes first).

**Files:**

- Modify: `server/src/services/platform/envValidationService.js:7-15` (the comment), `:46` (three rows), `:82` (the whole-number check)
- Test: `server/src/services/platform/__tests__/envValidationService.test.js` (two tests), `server/src/__tests__/numericCoercion.contract.test.js` (one block)

- [ ] **Step 1: Branch, and confirm the gap**

```bash
git fetch origin && git switch -c fix/env-validation-gemini-and-integers origin/main
git grep -n "GEMINI_" -- server/src/services/platform/envValidationService.js
git grep -n "toPositiveInt(process.env.GEMINI\|process.env.GEMINI_MAX_OUTPUT_TOKENS" -- server/src
```

Expected: no match in the validation file; the three reads in `generateRoutes.js`.

- [ ] **Step 2: The failing tests**

Write `$SCRATCH/s6-tests.diff`:

```diff
--- a/server/src/services/platform/__tests__/envValidationService.test.js
+++ b/server/src/services/platform/__tests__/envValidationService.test.js
@@ -45,6 +45,31 @@
     expect(errors[0]).toContain("PORT must be <= 65535");
   });

+  // Every reader of these settings takes whole numbers only (toPositiveInt,
+  // parseRedisPort), and replaces anything else with its default. Accepting
+  // 1500.5 here would tell the operator the setting took when it did not.
+  test("rejects a setting that is not a whole number", () => {
+    const errors = validateEnv({ ...validEnv, API_RATE_LIMIT_MAX: "1500.5" });
+    expect(errors).toEqual(["API_RATE_LIMIT_MAX must be a whole number (received 1500.5)."]);
+  });
+
+  // generateRoutes.js reads these three per request through toPositiveInt.
+  test.each(["GEMINI_MAX_OUTPUT_TOKENS", "GEMINI_TIMEOUT_MS", "GEMINI_MAX_PLAN_CHARS"])(
+    "checks %s like every other limit",
+    (name) => {
+      expect(validateEnv({ ...validEnv, [name]: "0" })).toEqual([
+        `${name} must be >= 1 (received 0).`
+      ]);
+      expect(validateEnv({ ...validEnv, [name]: "lots" })).toEqual([
+        `${name} must be a number (received "lots").`
+      ]);
+      expect(validateEnv({ ...validEnv, [name]: "2.5" })).toEqual([
+        `${name} must be a whole number (received 2.5).`
+      ]);
+      expect(validateEnv({ ...validEnv, [name]: "9000" })).toEqual([]);
+    }
+  );
+
   test("ignores optional numeric settings that are unset or blank", () => {
     expect(
       validateEnv({ ...validEnv, ARGON2_TIME_COST: "", EXTERNAL_API_RETRIES: undefined })
--- a/server/src/__tests__/numericCoercion.contract.test.js
+++ b/server/src/__tests__/numericCoercion.contract.test.js
@@ -5,6 +5,7 @@
 import { __testables as errorTracking } from "../services/platform/errorTrackingService.js";
 import { __testables as apiSchema } from "../services/http/apiSchemaService.js";
 import { __testables as indexTestables } from "../index.js";
+import { validateEnv } from "../services/platform/envValidationService.js";

 // The invariant this file exists to hold:
 //
@@ -26,6 +27,23 @@
 // guard however it likes as long as the three absent forms agree and a measured
 // zero survives.

+// The startup check and the reader must agree on what a positive integer
+// setting is. A value the check passes but toPositiveInt replaces with its
+// default is a setting the operator was told took effect when it did not.
+describe("validateEnv accepts a positive integer setting exactly when toPositiveInt keeps it", () => {
+  test.each(["1", "42", " 42 ", "1e3", "0x10", "1500.5", "0", "-3", "Infinity", "lots"])(
+    "%j",
+    (value) => {
+      const accepted =
+        validateEnv({ DATABASE_URL: "postgresql://u@127.0.0.1/db", GEMINI_TIMEOUT_MS: value })
+          .length === 0;
+      const kept = indexTestables.toPositiveInt(value, -1) !== -1;
+
+      expect(accepted).toBe(kept);
+    }
+  );
+});
+
 const ABSENT = [
   ["null", null],
   ["an empty string", ""],
```

```bash
git apply "$SCRATCH/s6-tests.diff"
npm run test -w server -- src/services/platform/__tests__/envValidationService.test.js src/__tests__/numericCoercion.contract.test.js > "$SCRATCH/s6-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |×" "$SCRATCH/s6-red.txt"
```

Expected: `exit=1`, `Tests  9 failed | 73 passed (82)`: "rejects a setting that is not a whole number" and the three "checks GEMINI_… like every other limit" (each `expected [] to deeply equal [ Array(1) ]`: nothing refused), and the contract block's `"1500.5"`, `"0"`, `"-3"`, `"Infinity"` and `"lots"` (`expected true to be false`: the check passes a value the reader throws away). The five values both sides agree on pass already.

- [ ] **Step 3: The fix**

Write `$SCRATCH/s6-fix.diff`:

```diff
--- a/server/src/services/platform/envValidationService.js
+++ b/server/src/services/platform/envValidationService.js
@@ -5,11 +5,14 @@
  */

 // Every min/max here is meant to match what the corresponding reader in
-// index.js / sessionService.js actually accepts, not just what sounds
-// reasonable in isolation -- a floor the reader silently discards (falling
-// back to its default) is worse than no floor: it tells the operator their
-// setting took effect when it did not. Check the call site before changing
-// a bound. ARGON2_TIME_COST and ARGON2_MEMORY_COST carry floors stricter than
+// index.js / sessionService.js / generateRoutes.js actually accepts, not just
+// what sounds reasonable in isolation -- a floor the reader silently discards
+// (falling back to its default) is worse than no floor: it tells the operator
+// their setting took effect when it did not. Check the call site before
+// changing a bound. For the same reason every value must be a whole number:
+// toPositiveInt and parseRedisPort replace anything else with their default.
+// WGER_DEFAULT_LANGUAGE's reader would take a fraction, but a language id is
+// a whole number. ARGON2_TIME_COST and ARGON2_MEMORY_COST carry floors stricter than
 // toPositiveInt's. They are this app's floors, not limits argon2 enforces (the
 // library accepts lower costs), so lowering one is a security decision, not a
 // compatibility one.
@@ -43,7 +46,10 @@
   { name: "WGER_CACHE_TTL_SEC", min: 1 },
   { name: "MEALDB_CACHE_TTL_SEC", min: 1 },
   { name: "WGER_DEFAULT_LANGUAGE", min: 1, max: 100 },
-  { name: "SENTRY_SHUTDOWN_TIMEOUT_MS", min: 1 }
+  { name: "SENTRY_SHUTDOWN_TIMEOUT_MS", min: 1 },
+  { name: "GEMINI_MAX_OUTPUT_TOKENS", min: 1 },
+  { name: "GEMINI_TIMEOUT_MS", min: 1 },
+  { name: "GEMINI_MAX_PLAN_CHARS", min: 1 }
 ];

 // Only HTTP endpoints are parsed. Postgres and Redis connection strings are
@@ -80,6 +86,10 @@
       errors.push(`${name} must be a number (received "${env[name]}").`);
       continue;
     }
+    if (!Number.isInteger(value)) {
+      errors.push(`${name} must be a whole number (received ${value}).`);
+      continue;
+    }
     if (min !== undefined && value < min) {
       errors.push(`${name} must be >= ${min} (received ${value}).`);
     }
```

```bash
git apply "$SCRATCH/s6-fix.diff"
npx prettier --write server/src/services/platform/envValidationService.js server/src/services/platform/__tests__/envValidationService.test.js server/src/__tests__/numericCoercion.contract.test.js
npm run test -w server -- src/services/platform/__tests__/envValidationService.test.js src/__tests__/numericCoercion.contract.test.js > "$SCRATCH/s6-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s6-green.txt"
git add server/src
git commit -m "fix(server): the startup check covers the GEMINI limits and refuses fractions" -m "GEMINI_MAX_OUTPUT_TOKENS, GEMINI_TIMEOUT_MS and GEMINI_MAX_PLAN_CHARS were read through toPositiveInt but never checked at startup, and the check accepted any finite number, which toPositiveInt then replaced with its default. Both now fail at startup, and the contract test pins the check to the reader." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  82 passed (82)`.

**Comments.** The comment over `NUMERIC_VARS` names `generateRoutes.js` among the readers, says why a fraction is refused, and records the `WGER_DEFAULT_LANGUAGE` exception. `validateEnv`'s doc comment ("Checks `env` and returns one message per problem") stays true. README's environment section (`README.md:160`, "The server validates this environment at startup") becomes true of the three GEMINI rows too, and lists no per-variable check, so it does not change; `env.example` neither.

- [ ] **Step 4: Mutation checks**

| Mutation (`envValidationService.js`)               | Caught by                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `if (!Number.isInteger(value)) {` → `if (false) {` | 5 tests: the whole-number test, the three GEMINI tests, the contract's `"1500.5"` |
| delete the `GEMINI_TIMEOUT_MS` row                 | 6 tests: its GEMINI test and five contract values                                 |
| `GEMINI_MAX_PLAN_CHARS`'s `min: 1` → `min: 0`      | "checks GEMINI_MAX_PLAN_CHARS like every other limit"                             |

- [ ] **Step 5: Coverage**

| Metric     | After S5    | After S6    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 2286 / 2402 | 2289 / 2405 | 95.1767 | 95.1  | 1.85  |
| Branches   | 1664 / 1883 | 1666 / 1885 | 88.3820 | 88.2  | 3.43  |
| Functions  | 383 / 398   | 383 / 398   | 96.2312 | 96.2  | 0.12  |
| Lines      | 2054 / 2134 | 2057 / 2137 | 96.2564 | 96.2  | 1.21  |

Tests 1194 → 1208 (four in the service's suite, ten in the contract block).

- [ ] **Step 6: Gates and PR**

Run the gates. `git push -u origin fix/env-validation-gemini-and-integers`; `gh pr create --draft --base main --title "fix(server): the startup check covers the GEMINI limits and refuses fractions" --body-file "$SCRATCH/pr-s6.md"`. Outline: the two owner items; every reader takes whole numbers (and the WGER exception); the contract block and why it, not a helper row; the red run, mutations, coverage; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. A deployment whose environment holds a fraction or a GEMINI zero will now refuse to start, which is the point, and the PR says so. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task S7: Test comments that still describe the Mongo compatibility shim

**Branch:** `docs/stale-shim-test-comments` (server track; comment-only, so it can merge at any point on the track; it is placed here, after the fixes, so S8 can follow it). No coverage effect: the six files are `*.test.js`, which `server/vitest.config.js` excludes, and only comments change.

**What is untrue.** The shim (`services/prismaDataModels.js`) was retired in full (CLAUDE.md, "Data access"). Four integration suites under `server/src/routes/dashboard/write/__tests__/` open with a comment saying they pin a route "before" it moves "off the Mongo compatibility shim", and describe `$set`, `$push`, `extractFirstConcatEntry` and an aggregation pipeline that no longer exist; `workoutSessions`' also claims a "cap on dashboard.workouts" that none of its tests asserts (its tests: store, the alias, update in place, no duplicate ids, newest first, two validations, a default, auth, scope). `collectionReads.integration.test.js:186-189` explains the tie test by "the shim's sort()", while `loadCollectionPage` now orders by `[{ <sortField>: "desc" }, { id: "desc" }]` (`repositories/dashboardCollectionRepository.js:47`). **Found while checking, and in this PR:** three comments in `server/src/repositories/__tests__/userReadRepository.test.js` of the same kind. `:168-170` is untrue ("the shim's user read has to stop reporting it": the read is `userReadRepository`'s), and `:71-72` and `:304-306` tell the shim's history where the SOP asks for the present reason. Two mentions stay: `mealLogs.integration.test.js:161-163` cites `docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md` as where the derived-entry rules are specified, which is a reference rather than a claim about code, and `userReadRepository.test.js:26`'s `shim-` email prefix is fixture text. Each replacement below was checked against the suite's own tests and the repository it drives: `savedExerciseRepository.js:34,52` (id or case-insensitive name), `userRepository.js:24-52` (`updateGoals` reads, merges, writes), the workout route's two paths (`registerWorkoutAndGoalRoutes.js:34`).

**No failing test first, and no mutation step.** Nothing executable changes; the suites must print the same counts before and after.

**Files:**

- Modify: `server/src/routes/dashboard/write/__tests__/progressMetrics.integration.test.js:6-10`, `savedExercises.integration.test.js:6-13`, `userWrites.integration.test.js:6-12`, `workoutSessions.integration.test.js:6-13`
- Modify: `server/src/routes/dashboard/__tests__/collectionReads.integration.test.js:186-189`
- Modify: `server/src/repositories/__tests__/userReadRepository.test.js:70-72, 168-170, 304-306`

- [ ] **Step 1: Branch, and find every stale mention**

```bash
git fetch origin && git switch -c docs/stale-shim-test-comments origin/main
git grep -n -i "shim\|\$set\|\$push\|aggregation-pipeline\|extractFirstConcatEntry" -- server/src
```

Expected: the eight places this task changes, plus `mealLogs.integration.test.js:163` and `userReadRepository.test.js:26`, which stay (above); nothing in a source file. If the grep finds anything else, it is the same kind and goes in this PR too.

- [ ] **Step 2: The edit**

Write `$SCRATCH/s7.diff`:

```diff
--- a/server/src/repositories/__tests__/userReadRepository.test.js
+++ b/server/src/repositories/__tests__/userReadRepository.test.js
@@ -68,8 +68,7 @@
   });

   // Goals live in one JSON column, so a partial write must patch rather than
-  // replace. The shim expressed this as dotted $set paths; the repository does
-  // a read-merge-write. Either way this property is the one that matters.
+  // replace: the repository reads, merges and writes the column.
   test("updateGoals merges instead of replacing sibling keys", async () => {
     const doc = baseUserDoc();
     await createUserWithDashboard(doc);
@@ -164,9 +163,8 @@
     expect(await updatePasswordHash({ userId, hash: "x" })).toBe(false);
   });

-  // Saved-exercise writes moved to repositories/savedExerciseRepository.js.
-  // This still spans both: the repository removes the row, and the shim's user
-  // read has to stop reporting it.
+  // This spans two repositories: savedExerciseRepository removes the row, and
+  // userReadRepository's read of the user has to stop reporting it.
   test("removing a saved exercise clears it from the user's dashboard", async () => {
     const doc = baseUserDoc();
     await createUserWithDashboard(doc);
@@ -301,9 +299,8 @@
     expect(result.items[0].focus).toBe("Legs");
   });

-  // The caller has always asked for a secondary sort on id. The shim dropped it,
-  // leaving ordering among tied timestamps to Postgres; the repository honours
-  // it, so paging over ties cannot repeat or skip a row.
+  // The caller asks for a secondary sort on id, and the repository honours it,
+  // so paging over tied timestamps cannot repeat or skip a row.
   test("pages tied timestamps without repeating or dropping a row", async () => {
     const userId = await seedUser();
     const tied = new Date(Date.UTC(2026, 2, 2)).toISOString();
--- a/server/src/routes/dashboard/write/__tests__/progressMetrics.integration.test.js
+++ b/server/src/routes/dashboard/write/__tests__/progressMetrics.integration.test.js
@@ -3,11 +3,10 @@
 import { app } from "../../../../index.js";
 import { prisma } from "../../../../db/prisma.js";

-// Pins the behaviour of POST /api/dashboard/progress-metrics against real
-// Postgres before that route is migrated off the Mongo compatibility shim.
-// Written to guard a refactor, so it asserts observable behaviour only -- the
-// response shape and what ends up in the database -- and says nothing about
-// which data layer produced it.
+// Pins POST /api/dashboard/progress-metrics against real Postgres: the
+// response and what ends up in the database, an update in place for a resent
+// id, the validation, and that each user sees only their own metrics. It
+// asserts observable behaviour only, not how the repository writes the row.

 const getCsrf = async (agent) => {
   const response = await agent.get("/api/csrf-token");
--- a/server/src/routes/dashboard/write/__tests__/savedExercises.integration.test.js
+++ b/server/src/routes/dashboard/write/__tests__/savedExercises.integration.test.js
@@ -3,14 +3,10 @@
 import { app } from "../../../../index.js";
 import { prisma } from "../../../../db/prisma.js";

-// Pins the saved-exercise routes against real Postgres before they move off the
-// Mongo compatibility shim.
-//
-// Unlike the workout and meal pipelines, this one is genuinely live: the shim's
-// extractFirstConcatEntry matches this exact pipeline shape and routes it to an
-// upsert. So these tests pin working behaviour, not a dead path -- in
-// particular the two-way deduplication, by external exercise id or by
-// case-insensitive name.
+// Pins the saved-exercise routes against real Postgres: saving, the two-way
+// deduplication savedExerciseRepository does (by external exercise id, or by
+// name compared case-insensitively), removal by id, and that one user cannot
+// remove another's.

 const getCsrf = async (agent) => {
   const response = await agent.get("/api/csrf-token");
--- a/server/src/routes/dashboard/write/__tests__/userWrites.integration.test.js
+++ b/server/src/routes/dashboard/write/__tests__/userWrites.integration.test.js
@@ -3,13 +3,11 @@
 import { app } from "../../../../index.js";
 import { prisma } from "../../../../db/prisma.js";

-// Pins the remaining User write paths against real Postgres before they move
-// off the Mongo compatibility shim: profile $set, goals $set with dotted paths,
-// and the calories $push.
+// Pins the profile, goals and calories writes against real Postgres.
 //
-// The goals merge is the one with a sharp edge. The shim rebuilds the goals
-// JSON from the existing row and patches only the keys present, so sending one
-// goal must not erase the others. That is asserted directly.
+// The goals merge is the one with a sharp edge. userRepository.updateGoals
+// reads the stored goals and patches only the keys sent, so sending one goal
+// must not erase the others. That is asserted directly.

 const getCsrf = async (agent) => {
   const response = await agent.get("/api/csrf-token");
--- a/server/src/routes/dashboard/write/__tests__/workoutSessions.integration.test.js
+++ b/server/src/routes/dashboard/write/__tests__/workoutSessions.integration.test.js
@@ -3,14 +3,10 @@
 import { app } from "../../../../index.js";
 import { prisma } from "../../../../db/prisma.js";

-// Pins POST /api/dashboard/workouts and its /workout-sessions alias against real
-// Postgres before that route is migrated off the Mongo compatibility shim.
-//
-// Beyond the write itself, these tests pin the three properties the route's
-// Mongo aggregation-pipeline update claims to provide -- newest first, no
-// duplicate ids, and a cap on dashboard.workouts. They are asserted here as
-// observable behaviour so that removing the pipeline has to preserve them
-// rather than being taken on trust.
+// Pins POST /api/dashboard/workout-sessions and its /workouts alias against
+// real Postgres: the write, an update in place for a resent id, and the
+// dashboard the route answers with, its workouts newest first and with no
+// duplicate ids.

 const getCsrf = async (agent) => {
   const response = await agent.get("/api/csrf-token");
--- a/server/src/routes/dashboard/__tests__/collectionReads.integration.test.js
+++ b/server/src/routes/dashboard/__tests__/collectionReads.integration.test.js
@@ -183,10 +183,9 @@
     expect(response.body.pagination.total).toBe(0);
   });

-  // Paging with tied sort values must not drop or repeat a row. The shim's
-  // sort() reads only the first key of { createdAt: -1, _id: -1 }, so the
-  // tiebreaker the caller asks for is discarded and stability is left to
-  // Postgres. This asserts the property the caller actually wants.
+  // Paging with tied sort values must not drop or repeat a row.
+  // loadCollectionPage orders by the sort field and then by id, both
+  // descending, so rows sharing a timestamp keep one order from page to page.
   test("pages through rows with identical timestamps without loss or repeats", async () => {
     await seedWorkouts(6);
     const tied = new Date("2026-07-01T00:00:00.000Z");
```

```bash
git apply "$SCRATCH/s7.diff"
npx prettier --write server/src/routes/dashboard server/src/repositories/__tests__/userReadRepository.test.js
git grep -n -i "shim\|\$set\|\$push\|extractFirstConcatEntry" -- server/src
npm run test -w server -- src/routes/dashboard src/repositories > "$SCRATCH/s7-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s7-tests.txt"
git add server/src
git commit -m "docs(server): test comments no longer describe the retired shim" -m "Four integration suites said they pinned a route before it moved off the Mongo compatibility shim, the collection-paging tie test blamed the shim's sort(), and three repository tests told the shim's history or named its user read. Each now says what it pins against today's repositories." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: the grep prints only the two mentions that stay; `exit=0`, `Tests  136 passed (136)` (ten files, as in the scratch run after S6).

- [ ] **Step 3: Gates and PR.** Run the gates; `test:coverage` must print S6's counts exactly. `git push -u origin docs/stale-shim-test-comments`; `gh pr create --draft --base main --title "docs(server): test comments no longer describe the retired shim" --body-file "$SCRATCH/pr-s7.md"`. Outline: the item; for each comment, what it claimed and what the code it was checked against does; the grep before and after; counts unchanged; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task S8: Delete `stripUserIdField`, which strips nothing

**Branch:** `chore/delete-strip-userid-field` (server track, last). The one deletion on the server track (rule 5).

**Why it is dead.** `dashboardCollectionService.js:44-47` removes a `userId` key from each item `toCollectionPage` returns (`:59`). Its items are `loadCollectionPage`'s `rows.map(spec.mapRow)` (`repositories/dashboardCollectionRepository.js:54`), and the three mappers, `mapWorkoutSession`, `mapMealLog` and `mapProgressMetric`, each return an object literal with no `userId` key. Phase 5 checked this (its "Not in this phase" table) and kept the function as a guard; the owner has now chosen to delete it. `git grep -n "stripUserIdField" -- server client e2e` finds the definition and the one call.

**What still holds the property.** `collectionReads.integration.test.js:115-120`, "never leaks the internal userId field", reads a real row through the real route, and stays. Step 3's mutation shows it now guards the mappers directly: a mapper that copies `userId` fails it. The unit suite `dashboardReadRoutes.test.js` stubs the reader with items carrying `userId: "u-1"` and expected it stripped, which tested the deleted function rather than anything the repository returns; its stub drops the key, so the stub is what the mappers produce.

**Why last.** It removes a covered function. On `main`, server functions have 0.05 of slack, and alone this would leave 0.01 (380 / 395); S1 and S4 each add a covered function first, so after them it leaves 0.09.

**Files:**

- Modify: `server/src/services/dashboard/dashboardCollectionService.js:44-49, 59`
- Modify: `server/src/routes/dashboard/__tests__/dashboardReadRoutes.test.js:47`

- [ ] **Step 1: Branch, and confirm the producer**

```bash
git fetch origin && git switch -c chore/delete-strip-userid-field origin/main
git grep -n "stripUserIdField" -- server client e2e
git grep -n "userId" -- server/src/repositories/workoutSessionRepository.js server/src/repositories/mealLogRepository.js server/src/repositories/progressMetricRepository.js | grep -v "userId:\s*userPk\|{ userId\|userIdWhere\|getUserPk"
```

Expected: the definition and the call; the second grep shows no mapper line emitting a `userId` key (the matches it filters out are the write paths' `where` clauses and parameters). Read each `map*` function to confirm.

- [ ] **Step 2: No failing test first.** A pure deletion: no input that reaches it changes, because no item carries the key.

- [ ] **Step 3: The edit, and the guard that remains**

Write `$SCRATCH/s8.diff`:

```diff
--- a/server/src/routes/dashboard/__tests__/dashboardReadRoutes.test.js
+++ b/server/src/routes/dashboard/__tests__/dashboardReadRoutes.test.js
@@ -44,7 +44,7 @@

 beforeEach(() => {
   loadCollectionPage = vi.fn(async ({ collection }) => ({
-    items: [{ id: `${collection}-1`, userId: "u-1" }],
+    items: [{ id: `${collection}-1` }],
     total: 1
   }));
 });
--- a/server/src/services/dashboard/dashboardCollectionService.js
+++ b/server/src/services/dashboard/dashboardCollectionService.js
@@ -41,12 +41,8 @@
     };
   };

-  const stripUserIdField = (doc = {}) => {
-    const { userId: _omitUserId, ...rest } = doc;
-    return rest;
-  };
-
-  // Shape the repository page into the response envelope the routes expect.
+  // Shape the repository page into the response envelope the routes expect. The
+  // items are the repository's row mappers' output, which carries no owner id.
   const toCollectionPage = async ({ collection, userId, sortField, limit, offset }) => {
     const { items, total } = await loadCollectionPage({
       collection,
@@ -56,7 +52,7 @@
       offset
     });
     return {
-      items: items.map(stripUserIdField),
+      items,
       total,
       limit,
       offset,
```

```bash
git apply "$SCRATCH/s8.diff"
npx prettier --write server/src/services/dashboard/dashboardCollectionService.js server/src/routes/dashboard/__tests__/dashboardReadRoutes.test.js
git grep -n "stripUserIdField\|_omitUserId" -- server client e2e
npm run test -w server -- src/routes/dashboard > "$SCRATCH/s8-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s8-tests.txt"
git add server/src
git commit -m "chore(server): delete stripUserIdField, which strips nothing" -m "Every item is a row mapper's object literal, and no mapper emits a userId. The integration test that reads a real row and asserts no userId stays, and now guards the mappers directly." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: the grep prints nothing; `exit=0`.

Then the mutation that shows the remaining guard bites. Write `$SCRATCH/mut-s8.json`, adding `userId: row.userId,` as the first key of `mapWorkoutSession`'s object (`repositories/workoutSessionRepository.js:13-14`), apply it, run `npm run test -w server -- src/routes/dashboard/__tests__/collectionReads.integration.test.js`, restore. Expected: `Tests  1 failed | 11 passed (12)`, the failure "never leaks the internal userId field" (as in the scratch run).

**Comments.** The comment over `toCollectionPage` gains why the items need no stripping. No other comment names the function.

- [ ] **Step 4: Coverage**

| Metric     | After S7 (= S6) | After S8    | %       | Floor | Slack |
| ---------- | --------------- | ----------- | ------- | ----- | ----- |
| Statements | 2289 / 2405     | 2286 / 2402 | 95.1707 | 95.1  | 1.70  |
| Branches   | 1666 / 1885     | 1665 / 1884 | 88.3758 | 88.2  | 3.31  |
| Functions  | 383 / 398       | 382 / 397   | 96.2217 | 96.2  | 0.09  |
| Lines      | 2057 / 2137     | 2054 / 2134 | 96.2512 | 96.2  | 1.09  |

Everything removed was covered: three statements and lines, the function, and its default-parameter arm (`doc = {}`, which v8 counts as one covered arm). Tests unchanged at 1208.

- [ ] **Step 5: Gates and PR.** Run the gates. `git push -u origin chore/delete-strip-userid-field`; `gh pr create --draft --base main --title "chore(server): delete stripUserIdField, which strips nothing" --body-file "$SCRATCH/pr-s8.md"`. Outline: the producer chain; the guard that stays and the mutation that shows it; the stub change; the ordering and the function slack; the coverage table; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Client track

Ten PRs, merged in order C1 → C10. C1 to C6 add covered JavaScript; C7 and C8 are CSS, proven by capture compare; C9 and C10 are the deletions (rule 5). Every client PR also builds and captures before and after its change, and every one except C7 and C8 must compare `identical` (C1 and C2 add a stylesheet for an element no capture shows; that is checked, not assumed).

**The phase baseline capture.** Before C1, on `main`, clean: `npm run build`, then `node "$TOOLS/capture.mjs" . "$SHOTS/main-1"` and again into `"$SHOTS/main-2"`, then `node "$TOOLS/capture.mjs" compare "$SHOTS/main-1" "$SHOTS/main-2"`, which must print `identical` (the scratch copy of `cb821a1` did). `$SHOTS/main-1` is C1's before-capture; each later task's before-capture must compare `identical` to the previous task's after-capture.

### Task C1: A session check the server cannot answer is not "signed out"

**Branch:** `fix/session-check-outage` (client track, first).

**The bug.** `App.jsx:428-442`, on load, asks `/api/auth/me` and treats any non-OK answer as signed out (`if (!res.ok) return;`, leaving `user` null) and a network error the same (`setUser(null)`). During a session-store outage the server answers **503** precisely because it cannot tell (Phase 3's S1: "a 401 would likely log the user out"), but the client reads it as a 401: a signed-in visitor who reloads sees the signed-out home page, or a bare header on `/dashboard`, with nothing to say why, and must sign in again into the same outage.

**The fix (owner-approved: a 503 or a network error is "cannot check"; a 401 still means signed out).** Only a 401 is an answer of "signed out", and an OK answer is the user. Anything else (a 503, any other status, a network error, a timeout, a body that is not JSON) is no answer: App sets `sessionUnchecked`, shows a status notice over the page ("Can't reach the server to check your sign-in. Trying again..."), and asks again after 2, 5, 15 and then every 30 seconds until it gets an answer, when the notice goes. The request goes through `app/network.js`'s existing `fetchWithTimeout` (15 s), so a hung server counts as no answer instead of leaving the check pending for good. An unmount stops the asking (React's StrictMode mounts App twice in development, so without that two loops would run).

**Why not keep "the cached signed-in state".** The owner's wording suggested keeping a cached signed-in state. There is none to keep: the client caches no user (`user` starts `null`, and the dashboard cache is keyed by the user it cannot yet know), and the cookie is HttpOnly. So the visitor sees the page a signed-out visitor sees, with the notice saying the answer is not in, and the signed-in page arrives on its own when the server answers. Not an owner decision unless they want a cached user added, which would be a new feature.

**The notice.** A new shared component, `app/components/AppNotice.jsx` (`role="status"`, so it is announced), with its own small stylesheet `app/styles/notice.css`, fixed at the foot of the viewport so it moves no layout. C2 reuses it. App renders it after whichever page the route picks, through one `withNotice(page)` wrapper, so the four `return (` lines become `return withNotice(` and nothing inside them changes. With the notice hidden the DOM is exactly what it was (a fragment adds no element), and no capture state shows it (the capture tool answers `/api/auth/me` with 401 or 200), so the capture compare must print `identical`.

**Files:**

- Modify: `client/src/App.jsx` (two imports; `SESSION_RETRY_DELAYS_MS`; the `sessionUnchecked` state; the effect at `:428-442`; `withNotice` and the four returns)
- Modify: `client/src/app/network.js:1` (its header names its callers, and App's session check is a new one)
- Create: `client/src/app/components/AppNotice.jsx`, `client/src/app/styles/notice.css` (each with a header, as the ratchet requires)
- Test: `client/src/__tests__/App.test.jsx` (`sessionResponse` carries a status; six tests; one assertion loosened to allow the timeout's `signal`), `client/src/__tests__/App.planner.test.jsx` (its signed-out stub says 401)

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/session-check-outage origin/main
grep -n "api/auth/me" client/src/App.jsx
npm run build > "$SCRATCH/b-c1-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c1-before" > "$SCRATCH/c1-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/main-1" "$SHOTS/c1-before"; echo "chain exit=$?"
```

Expected: the one fetch at `:433`; `identical`.

- [ ] **Step 2: The failing tests**

`sessionResponse` gains a status (a refusal defaults to 401, so every existing test still means "signed out"), and `App.planner.test.jsx`'s stub says 401 for the same reason. Write `$SCRATCH/c1-tests.diff`:

```diff
--- a/client/src/__tests__/App.planner.test.jsx
+++ b/client/src/__tests__/App.planner.test.jsx
@@ -46,7 +46,11 @@
 beforeEach(() => {
   planner.props = null;
   window.history.pushState({}, "", "/");
-  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
+  // Signed out: the session check answers 401.
+  vi.stubGlobal(
+    "fetch",
+    vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
+  );
   render(<App />);
 });

--- a/client/src/__tests__/App.test.jsx
+++ b/client/src/__tests__/App.test.jsx
@@ -44,9 +44,13 @@
 // The session lookup fires on mount whatever the route, so every test needs a
 // fetch that settles.
 const stubSession = (impl) => vi.stubGlobal("fetch", vi.fn(impl));
+// A refusal is a 401 unless the test names another status.
 const sessionResponse =
-  (body, ok = true) =>
-  async () => ({ ok, json: async () => body });
+  (body, ok = true, status = ok ? 200 : 401) =>
+  async () => ({ ok, status, json: async () => body });
+
+const SESSION_NOTICE = /can't reach the server to check your sign-in/i;
+const sessionLookups = () => fetch.mock.calls.filter(([url]) => url === "/api/auth/me").length;

 // The session effect is three microtasks deep (fetch, json, setUser). Until it
 // settles, `user` is still its initial null -- so asserting "nobody is signed
@@ -212,9 +216,6 @@
     });

     test("a lookup that throws does not take the page down", async () => {
-      // Equivalent-mutant note: the catch's `setUser(null)` cannot be
-      // distinguished from doing nothing, because `user` is already null on the
-      // only render where this effect runs. Kept for the "does not throw" half.
       stubSession(() => Promise.reject(new Error("offline")));
       await renderSettled("/dashboard");

@@ -227,8 +228,114 @@
       render(<App />);

       await waitFor(() =>
-        expect(fetch).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" })
+        expect(fetch).toHaveBeenCalledWith(
+          "/api/auth/me",
+          expect.objectContaining({ credentials: "include" })
+        )
+      );
+    });
+  });
+
+  // A reload during a session-store outage gets a 503 from /api/auth/me. That
+  // is the server saying it cannot tell, not that nobody is signed in, so the
+  // visitor is told and the question is asked again until it has an answer.
+  describe("a session check the server cannot answer", () => {
+    beforeEach(() => {
+      vi.useFakeTimers();
+    });
+
+    afterEach(() => {
+      vi.useRealTimers();
+    });
+
+    test("a 503 is not read as signed out: it says so, then asks again", async () => {
+      const answers = [
+        sessionResponse({}, false, 503),
+        sessionResponse({ user: { email: "ada@example.com" } })
+      ];
+      stubSession((url) =>
+        url === "/api/auth/me" ? answers.shift()() : sessionResponse({}, false)()
+      );
+      await renderSettled("/dashboard");
+
+      expect(screen.getByRole("status")).toHaveTextContent(SESSION_NOTICE);
+      expect(sessionLookups()).toBe(1);
+
+      await act(async () => {
+        await vi.advanceTimersByTimeAsync(2000);
+      });
+
+      expect(sessionLookups()).toBe(2);
+      expect(dash.props.user).toEqual({ email: "ada@example.com" });
+      expect(screen.queryByText(SESSION_NOTICE)).not.toBeInTheDocument();
+    });
+
+    test("a network error is not read as signed out either", async () => {
+      stubSession(() => Promise.reject(new TypeError("Failed to fetch")));
+      await renderSettled("/");
+
+      expect(screen.getByRole("status")).toHaveTextContent(SESSION_NOTICE);
+    });
+
+    test("a 401 is signed out, with no notice and no second ask", async () => {
+      await renderSettled("/");
+      await act(async () => {
+        await vi.advanceTimersByTimeAsync(60000);
+      });
+
+      expect(screen.queryByText(SESSION_NOTICE)).not.toBeInTheDocument();
+      expect(sessionLookups()).toBe(1);
+    });
+
+    test("asks less often the longer the server cannot answer", async () => {
+      stubSession(sessionResponse({}, false, 503));
+      await renderSettled("/");
+      const lookupsAfter = async (ms) => {
+        await act(async () => {
+          await vi.advanceTimersByTimeAsync(ms);
+        });
+        return sessionLookups();
+      };
+
+      expect(await lookupsAfter(1999)).toBe(1);
+      expect(await lookupsAfter(1)).toBe(2);
+      expect(await lookupsAfter(5000)).toBe(3);
+      expect(await lookupsAfter(15000)).toBe(4);
+      expect(await lookupsAfter(30000)).toBe(5);
+      expect(await lookupsAfter(30000)).toBe(6);
+    });
+
+    test("stops asking once App is gone", async () => {
+      stubSession(sessionResponse({}, false, 503));
+      const { unmount } = await renderSettled("/");
+
+      unmount();
+      await act(async () => {
+        await vi.advanceTimersByTimeAsync(60000);
+      });
+
+      expect(sessionLookups()).toBe(1);
+    });
+
+    test("an answer that arrives after App is gone schedules nothing", async () => {
+      let answer;
+      stubSession((url) =>
+        url === "/api/auth/me"
+          ? new Promise((resolve) => {
+              answer = resolve;
+            })
+          : sessionResponse({}, false)()
       );
+      setPath("/");
+      const { unmount } = render(<App />);
+
+      unmount();
+      await act(async () => {
+        answer({ ok: false, status: 503, json: async () => ({}) });
+        await vi.advanceTimersByTimeAsync(60000);
+      });
+
+      expect(sessionLookups()).toBe(1);
     });
   });

```

```bash
git apply "$SCRATCH/c1-tests.diff"
npm run test -w client -- src/__tests__/App.test.jsx src/__tests__/App.planner.test.jsx src/__tests__/App.settingsProfile.test.jsx > "$SCRATCH/c1-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  | FAIL |Error" "$SCRATCH/c1-red.txt"
```

Expected: `exit=1`, `Tests  3 failed | 77 passed (80)`: "a 503 is not read as signed out: it says so, then asks again" and "a network error is not read as signed out either" (`Unable to find an accessible element with the role "status"`: nothing tells the visitor), and "asks less often the longer the server cannot answer" (`expected 1 to be 2`: it never asks again). The other three pass already: a 401 is signed out today, and with no retry there is nothing to stop.

- [ ] **Step 3: The fix**

Write `$SCRATCH/c1-fix.diff` (it creates the two files):

```diff
--- /dev/null
+++ b/client/src/app/components/AppNotice.jsx
@@ -0,0 +1,14 @@
+/**
+ * The notice App shows over every page about the session, fixed at the foot of
+ * the screen so it moves nothing on the page beneath it.
+ */
+import "../styles/notice.css";
+
+/** One line of status text, read out by screen readers when it appears. */
+export default function AppNotice({ message }) {
+  return (
+    <div className="app-notice" role="status">
+      <p>{message}</p>
+    </div>
+  );
+}
--- a/client/src/app/network.js
+++ b/client/src/app/network.js
@@ -1,4 +1,7 @@
-/** fetch with a deadline, for the dashboard's reads: useDashboardData's and useOlderLogPages'. */
+/**
+ * fetch with a deadline, for the dashboard's reads (useDashboardData's and
+ * useOlderLogPages') and App's session check.
+ */

 /**
  * fetch that aborts after `timeoutMs` and then rejects with a message fit to
--- /dev/null
+++ b/client/src/app/styles/notice.css
@@ -0,0 +1,26 @@
+/* AppNotice's line: fixed at the foot of the viewport and centred, over every page, so
+   it shifts no layout beneath it. */
+.app-notice {
+  position: fixed;
+  left: 50%;
+  bottom: 16px;
+  z-index: 1000;
+  transform: translateX(-50%);
+  display: flex;
+  align-items: center;
+  gap: 12px;
+  width: max-content;
+  max-width: calc(100vw - 32px);
+  padding: 10px 16px;
+  border: 1px solid rgba(255, 255, 255, 0.18);
+  border-radius: 12px;
+  background: rgba(12, 12, 12, 0.94);
+  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
+  color: #fff;
+  font-size: 0.9rem;
+  line-height: 1.4;
+}
+
+.app-notice p {
+  margin: 0;
+}
--- a/client/src/App.jsx
+++ b/client/src/App.jsx
@@ -20,11 +20,13 @@
   weekDays
 } from "./app/constants";
 import { buildScopedCacheKey } from "./app/cache";
+import AppNotice from "./app/components/AppNotice";
 import PlannerSetupModal from "./app/components/PlannerSetupModal";
 import { mergeOptimisticDashboard } from "./app/dashboard";
 import useApiClient from "./app/hooks/useApiClient";
 import useDashboardData from "./app/hooks/useDashboardData";
 import useOptimisticLogs from "./app/hooks/useOptimisticLogs";
+import { fetchWithTimeout } from "./app/network";
 import { parsePlanSections, extractLatestPlanByWeekday } from "./app/plans";
 import { resolveDashViewFromPath } from "./app/routing";
 import { createAppEventHandlers } from "./app/events";
@@ -38,6 +40,10 @@
 } from "./app/units";
 import "./styles/app.css";

+// How long the session check waits before asking again while the server cannot
+// answer it, in milliseconds: one delay per failed attempt, the last repeated.
+const SESSION_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];
+
 /**
  * Routes on window.location.pathname without a router: /auth, /plan and
  * /dashboard with its subpaths each have a page, and any other path renders
@@ -57,6 +63,8 @@
   const [plannerStep, setPlannerStep] = useState(1);
   const [route, setRoute] = useState(window.location.pathname);
   const [user, setUser] = useState(null);
+  // True while the session check has had no answer from the server it can trust.
+  const [sessionUnchecked, setSessionUnchecked] = useState(false);
   const [authMode, setAuthMode] = useState("login");
   const [authLoading, setAuthLoading] = useState(false);
   const [authError, setAuthError] = useState("");
@@ -425,20 +433,42 @@
     setDashView((current) => (current === routeDashView ? current : routeDashView));
   }, [route]);

-  // Once, on load: the session cookie is HttpOnly, so asking the server is the
-  // only way to learn who is signed in.
+  // On load: the session cookie is HttpOnly, so asking the server is the only
+  // way to learn who is signed in. Only a 401 means signed out. Any other
+  // failure, such as a 503 while the session store is down, a network error or
+  // a timeout, means the server could not say: the visitor is told so and the
+  // check is asked again, rather than shown the signed-out page as the answer.
+  // An unmount stops the asking.
   useEffect(() => {
+    let cancelled = false;
+    let retryTimer = null;
+    let attempt = 0;
     const loadSession = async () => {
+      let answered = false;
       try {
-        const res = await fetch("/api/auth/me", { credentials: "include" });
-        if (!res.ok) return;
-        const data = await res.json();
-        setUser(data.user || null);
+        const res = await fetchWithTimeout("/api/auth/me", { credentials: "include" });
+        if (res.ok) {
+          const data = await res.json();
+          setUser(data.user || null);
+          answered = true;
+        } else {
+          answered = res.status === 401;
+        }
       } catch {
-        setUser(null);
+        // No answer: a network error, a timeout or a body that is not JSON.
       }
+      if (cancelled) return;
+      setSessionUnchecked(!answered);
+      if (answered) return;
+      const delay = SESSION_RETRY_DELAYS_MS[Math.min(attempt, SESSION_RETRY_DELAYS_MS.length - 1)];
+      attempt += 1;
+      retryTimer = setTimeout(loadSession, delay);
     };
     loadSession();
+    return () => {
+      cancelled = true;
+      clearTimeout(retryTimer);
+    };
   }, []);

   // Fetches the CSRF token up front, so the first write need not wait for it.
@@ -467,8 +497,20 @@
   }, [go, route, user]);

   // ---- The page for the route -----------------------------------------------
+  // Every page renders with the session notice after it, while the session
+  // check is still waiting for an answer.
+  const sessionNotice = sessionUnchecked ? (
+    <AppNotice message="Can't reach the server to check your sign-in. Trying again..." />
+  ) : null;
+  const withNotice = (page) => (
+    <>
+      {page}
+      {sessionNotice}
+    </>
+  );
+
   if (route === "/auth" || route === "/auth/") {
-    return (
+    return withNotice(
       <AuthPage
         gradient={gradient}
         authMode={authMode}
@@ -498,7 +540,7 @@
   }

   if (route === "/plan" || route === "/plan/") {
-    return (
+    return withNotice(
       <WorkoutResultPage
         gradient={gradient}
         user={user}
@@ -512,7 +554,7 @@
   }

   if (isDashboardRoute) {
-    return (
+    return withNotice(
       <DashboardPage
         user={user}
         go={go}
@@ -568,7 +610,7 @@
     );
   }

-  return (
+  return withNotice(
     <HomePage
       gradient={gradient}
       user={user}
```

```bash
git apply "$SCRATCH/c1-fix.diff"
npx prettier --write client/src/App.jsx client/src/app/network.js client/src/app/components/AppNotice.jsx client/src/app/styles/notice.css client/src/__tests__/App.test.jsx client/src/__tests__/App.planner.test.jsx
npm run test -w client -- src/__tests__/App.test.jsx src/__tests__/App.planner.test.jsx src/__tests__/App.settingsProfile.test.jsx > "$SCRATCH/c1-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c1-green.txt"
npm run test:scripts > "$SCRATCH/c1-scripts.txt" 2>&1; echo "test:scripts exit=$?"
git add client/src
git commit -m "fix(client): a session check the server cannot answer is not signed out" -m "On load, any non-OK /api/auth/me, a 503 during a session-store outage included, read as signed out. Only a 401 does now. Any other failure shows a status notice and asks again after 2, 5, 15, then every 30 seconds, through fetchWithTimeout so a hung server counts too." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  80 passed (80)`; `test:scripts exit=0` (the two new files have headers).

**Comments.** The effect's comment says what each answer means and that an unmount stops the asking; the constant and the state each say what they hold; `withNotice` says why every page goes through it. `network.js`'s header, which named the dashboard's two readers as its only callers, adds App's session check. The test comment that called the catch's `setUser(null)` an equivalent mutant goes with the `setUser(null)` it described. App's header and doc comment do not list effects, so they do not change.

- [ ] **Step 4: Mutation checks**

| Mutation (`App.jsx`)                                                                | Caught by                                                                              |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `answered = res.status === 401;` → `answered = true;` (every refusal is signed out) | "a 503 is not read as signed out…", "asks less often…"                                 |
| `setSessionUnchecked(!answered);` → `setSessionUnchecked(false);`                   | "a 503 is not read as signed out…", "a network error is not read as signed out either" |
| `SESSION_RETRY_DELAYS_MS[Math.min(…)]` → `SESSION_RETRY_DELAYS_MS[attempt]`         | "asks less often the longer the server cannot answer" (past the list the delay is 0)   |
| delete `clearTimeout(retryTimer);`                                                  | "stops asking once App is gone"                                                        |
| delete `if (cancelled) return;`                                                     | "an answer that arrives after App is gone schedules nothing"                           |

- [ ] **Step 5: Coverage**

| Metric     | `main`      | After C1    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 4871 / 4927 | 4892 / 4948 | 98.8682 | 98.8  | 3.38  |
| Branches   | 3184 / 3393 | 3190 / 3399 | 93.8511 | 93.8  | 1.74  |
| Functions  | 1004 / 1013 | 1007 / 1016 | 99.1142 | 99.1  | 0.14  |
| Lines      | 4442 / 4464 | 4462 / 4484 | 99.5094 | 99.5  | 0.42  |

Everything added is covered: 21 statements, 6 branch arms, 3 functions (the effect's cleanup, `withNotice` and `AppNotice`) and 20 lines. Tests 2408 → 2414.

- [ ] **Step 6: The after-capture and the compare**

```bash
npm run build > "$SCRATCH/b-c1.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c1-after" > "$SCRATCH/c1-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c1-before" "$SHOTS/c1-after" > "$SCRATCH/c1-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c1-cmp.txt"
```

Expected: `compare exit=0`, last line `identical`. The scratch run of exactly this change printed `identical`, after one `NOISE desktop-dash-meal-loading-motion.png: 10 px, and no style, box or page-state difference` line (the tool drops differences under 64 pixels with no style change; the baseline's two runs of `main` compared `identical` with none). The main chunk grows from 484.95 kB to about 485.41 kB, and the main CSS from 131.65 kB to 132.00 kB; no size warning.

- [ ] **Step 7: Gates and PR**

Run the gates; the axe scans run on pages where the notice is absent, as here. `git push -u origin fix/session-check-outage`; `gh pr create --draft --base main --title "fix(client): a session check the server cannot answer is not signed out" --body-file "$SCRATCH/pr-c1.md"`. Outline: the owner item; what each answer now means; why there is no cached user to keep; the notice and the retry schedule; the red run, mutations and coverage; the capture compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task C2: A sign-out the server could not finish says so

**Branch:** `fix/logout-reports-unended-session` (client track, after C1). Item 6's client half; S4 is the server's.

**The bug.** `events.js:322-348`'s `onLogout` sends `POST /api/auth/logout` and ignores the answer: it signs out locally and goes home whether the server ended the session or answered 503 (the store could not delete it, so it stays valid until it expires). The visitor is told nothing, which is the "claiming success" the owner item names.

**What the client can do with that answer.** Weighed:

- **Stay signed in and retry.** Not possible: the server clears both cookies before it tries the delete (`authRoutes.js:321-322`), and the session cookie is HttpOnly, so the browser no longer holds anything to send. Keeping the cookies on a failure instead would leave a visitor who pressed Log out, perhaps on a shared machine, signed in. S4's server-side retry is the only retry there can be.
- **Sign out locally and say nothing** (today). Dishonest: the session is still valid for up to its TTL.
- **Sign out locally and say so.** Chosen. After the usual clears and `go("/")`, logout sets `signOutUnfinished` from the answer: true for any answer but OK, and for a request that never got one (a dead network, no CSRF token), false otherwise. App shows C1's `AppNotice`, with a Dismiss button: "Signed out on this device, but the server could not end your session. It stays valid until it expires." The notice goes when dismissed or when someone signs in (it renders only while `user` is null), and C1's session notice takes precedence if both apply.

The server's 503 body is the masked "Server error." (`sendErrorResponse`), so the wording is the client's; there is no figure for the TTL in it, because that lives in `server/src/index.js` (`SESSION_TTL_MS`).

**Files:**

- Modify: `client/src/app/events.js` (the doc comment, the destructure, `onLogout`)
- Modify: `client/src/App.jsx` (the `signOutUnfinished` state, passed to `createAppEventHandlers`, and the notice)
- Modify: `client/src/app/components/AppNotice.jsx` (an optional `onDismiss`), `client/src/app/styles/notice.css` (its button)
- Test: `client/src/app/__tests__/events.test.js` (three tests; the deps carry the setter), `client/src/app/__tests__/events.handlers.test.js` (its logout deps carry the setter), `client/src/__tests__/App.test.jsx` (the AuthPage mock records its props; three tests)

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/logout-reports-unended-session origin/main
npm run build > "$SCRATCH/b-c2-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c2-before" > "$SCRATCH/c2-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c1-after" "$SHOTS/c2-before"; echo "chain exit=$?"
```

Expected: `identical`.

- [ ] **Step 2: The failing tests**

Write `$SCRATCH/c2-tests.diff`:

```diff
--- a/client/src/app/__tests__/events.handlers.test.js
+++ b/client/src/app/__tests__/events.handlers.test.js
@@ -822,6 +822,7 @@
       user,
       go: vi.fn(),
       setUser: vi.fn(),
+      setSignOutUnfinished: vi.fn(),
       clearOptimisticOperations: vi.fn(),
       clearDashboardDataState: vi.fn(),
       clearDashboardToast: vi.fn(),
--- a/client/src/app/__tests__/events.test.js
+++ b/client/src/app/__tests__/events.test.js
@@ -74,6 +74,7 @@
     signupWeightUnit: "kg",
     authForm: { email: "person@example.com", password: "StrongPass123!" },
     setUser: vi.fn(),
+    setSignOutUnfinished: vi.fn(),
     authAutoSignIn: false,
     clearOptimisticOperations: vi.fn(),
     clearDashboardDataState: vi.fn(),
@@ -173,6 +174,22 @@
     expect(deps.go).toHaveBeenCalledWith("/");
   });

+  // The server's 503 says the session could not be ended, and stays valid in
+  // the store until it expires. The visitor is signed out here either way, and
+  // is told which of the two it was.
+  test("says nothing more when the server ended the session", async () => {
+    await build().onLogout();
+
+    expect(deps.setSignOutUnfinished).toHaveBeenCalledWith(false);
+  });
+
+  test("tells the visitor when the server could not end the session", async () => {
+    await build({ apiFetch: vi.fn(async () => ({ ok: false, status: 503 })) }).onLogout();
+
+    expect(deps.setUser).toHaveBeenCalledWith(null);
+    expect(deps.setSignOutUnfinished).toHaveBeenCalledWith(true);
+  });
+
   // Everything holding the previous account's data has to go, or the next
   // person at the same browser sees it.
   test("clears every piece of local dashboard state", async () => {
@@ -205,6 +222,12 @@
       expect(deps.go).toHaveBeenCalledWith("/");
     });

+    test("tells the visitor the session may still be open", async () => {
+      await build(failing()).onLogout();
+
+      expect(deps.setSignOutUnfinished).toHaveBeenCalledWith(true);
+    });
+
     test("still clears the dashboard data", async () => {
       await build(failing()).onLogout();

--- a/client/src/__tests__/App.test.jsx
+++ b/client/src/__tests__/App.test.jsx
@@ -19,8 +19,12 @@
   }
 }));

+const auth = vi.hoisted(() => ({ props: null }));
 vi.mock("../pages/auth/AuthPage", () => ({
-  default: () => <div data-testid="auth-page">Auth page</div>
+  default: (props) => {
+    auth.props = props;
+    return <div data-testid="auth-page">Auth page</div>;
+  }
 }));

 vi.mock("../pages/dashboard/DashboardPage", () => ({
@@ -552,6 +556,75 @@

       expect(posts).toEqual(["/api/dashboard/meal-logs", "/api/auth/logout"]);
     });
+
+    // Sign-out clears this browser's cookies whatever happens, so a 503 means
+    // the session itself is still valid in the store. The visitor is told,
+    // can dismiss it, and does not see it once someone signs in again.
+    describe("when the server could not end the session", () => {
+      const SIGN_OUT_NOTICE = /the server could not end your session/i;
+
+      const signedInThenOutage = () =>
+        vi.stubGlobal(
+          "fetch",
+          vi.fn(async (url) => {
+            const path = String(url);
+            if (path === "/api/auth/me" || path === "/api/auth/login") {
+              return {
+                ok: true,
+                status: 200,
+                json: async () => ({ user: { email: "ada@example.com" } })
+              };
+            }
+            if (path === "/api/csrf-token") {
+              return { ok: true, status: 200, json: async () => ({ csrfToken: "t" }) };
+            }
+            if (path === "/api/auth/logout") {
+              return { ok: false, status: 503, json: async () => ({ error: "Server error." }) };
+            }
+            return { ok: true, status: 200, json: async () => ({ dashboard: {} }) };
+          })
+        );
+
+      const logOut = async () => {
+        await renderSettled("/dashboard");
+        await waitFor(() => expect(dash.props.user).toBeTruthy());
+        await act(async () => {
+          await dash.props.onLogout();
+        });
+      };
+
+      test("says so after signing out here", async () => {
+        signedInThenOutage();
+        await logOut();
+
+        expect(home.props.user).toBeNull();
+        expect(screen.getByRole("status")).toHaveTextContent(SIGN_OUT_NOTICE);
+      });
+
+      test("can be dismissed", async () => {
+        signedInThenOutage();
+        await logOut();
+
+        await act(async () => {
+          screen.getByRole("button", { name: "Dismiss" }).click();
+        });
+
+        expect(screen.queryByText(SIGN_OUT_NOTICE)).not.toBeInTheDocument();
+      });
+
+      test("is gone once someone signs in again", async () => {
+        signedInThenOutage();
+        await logOut();
+        act(() => home.props.go("/auth"));
+
+        await act(async () => {
+          await auth.props.onAuthSubmit({ preventDefault() {} });
+        });
+
+        expect(dash.props.user).toEqual({ email: "ada@example.com" });
+        expect(screen.queryByText(SIGN_OUT_NOTICE)).not.toBeInTheDocument();
+      });
+    });
   });

   describe("the dashboard's pagination", () => {
```

```bash
git apply "$SCRATCH/c2-tests.diff"
npm run test -w client -- src/__tests__/App.test.jsx src/app/__tests__/events.test.js src/app/__tests__/events.handlers.test.js > "$SCRATCH/c2-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |×" "$SCRATCH/c2-red.txt"
```

Expected: `exit=1`, `Tests  5 failed | 221 passed (226)`. The three `events.test.js` tests fail with `expected "vi.fn()" to be called with arguments: [ true ]` (or `[ false ]`): logout never reports whether the server ended the session. "says so after signing out here" cannot find the `status` element, and "can be dismissed" cannot find a Dismiss button. "is gone once someone signs in again" passes already: with no notice there is nothing to outlive a sign-in. It is the guard for the `!user` condition.

- [ ] **Step 3: The fix**

Write `$SCRATCH/c2-fix.diff`:

```diff
--- a/client/src/app/components/AppNotice.jsx
+++ b/client/src/app/components/AppNotice.jsx
@@ -4,11 +4,19 @@
  */
 import "../styles/notice.css";

-/** One line of status text, read out by screen readers when it appears. */
-export default function AppNotice({ message }) {
+/**
+ * One line of status text, read out by screen readers when it appears, with a
+ * Dismiss button when `onDismiss` is given.
+ */
+export default function AppNotice({ message, onDismiss = null }) {
   return (
     <div className="app-notice" role="status">
       <p>{message}</p>
+      {onDismiss ? (
+        <button type="button" onClick={onDismiss}>
+          Dismiss
+        </button>
+      ) : null}
     </div>
   );
 }
--- a/client/src/app/events.js
+++ b/client/src/app/events.js
@@ -69,7 +69,8 @@
  * logout runs before anything else and waits on for at most
  * LOGOUT_FLUSH_CAP_MS; and the resets logout and account
  * deletion run, `clearOptimisticOperations`, `clearDashboardDataState`,
- * `clearDashboardToast` and `resetPersonalFlow`.
+ * `clearDashboardToast` and `resetPersonalFlow`; and `setSignOutUnfinished`,
+ * which logout sets when the server could not end the session.
  */
 export const createAppEventHandlers = ({
   apiFetch,
@@ -105,6 +106,7 @@
   signupWeightUnit,
   authForm,
   setUser,
+  setSignOutUnfinished,
   authAutoSignIn,
   clearOptimisticOperations,
   flushOptimisticOperations,
@@ -332,8 +334,10 @@
     // below and leave the previous account's dashboard on screen, with no sign
     // that Log out had not worked. A dead network, or apiFetch refusing to send
     // without a CSRF token, both get here.
+    let sessionEnded = false;
     try {
-      await apiFetch("/api/auth/logout", { method: "POST" });
+      const res = await apiFetch("/api/auth/logout", { method: "POST" });
+      sessionEnded = res.ok;
     } catch {
       // The cookie is HttpOnly and cannot be cleared from here, so the server
       // session may outlive this. Clearing what we can beats clearing nothing.
@@ -344,6 +348,9 @@
     clearDashboardToast();
     resetPersonalFlow();
     go("/");
+    // Any answer but OK, the server's 503 included, means the session may still
+    // be valid in the store until it expires, so the visitor is told.
+    setSignOutUnfinished(!sessionEnded);
   };

   const submitWorkout = async (event) => {
--- a/client/src/app/styles/notice.css
+++ b/client/src/app/styles/notice.css
@@ -24,3 +24,14 @@
 .app-notice p {
   margin: 0;
 }
+
+.app-notice button {
+  flex: none;
+  padding: 4px 10px;
+  border: 1px solid rgba(255, 255, 255, 0.3);
+  border-radius: 8px;
+  background: transparent;
+  color: #fff;
+  font: inherit;
+  cursor: pointer;
+}
--- a/client/src/App.jsx
+++ b/client/src/App.jsx
@@ -65,6 +65,8 @@
   const [user, setUser] = useState(null);
   // True while the session check has had no answer from the server it can trust.
   const [sessionUnchecked, setSessionUnchecked] = useState(false);
+  // True after a sign-out the server could not complete, until dismissed.
+  const [signOutUnfinished, setSignOutUnfinished] = useState(false);
   const [authMode, setAuthMode] = useState("login");
   const [authLoading, setAuthLoading] = useState(false);
   const [authError, setAuthError] = useState("");
@@ -372,6 +374,7 @@
     signupWeightUnit,
     authForm,
     setUser,
+    setSignOutUnfinished,
     authAutoSignIn,
     clearOptimisticOperations,
     flushOptimisticOperations,
@@ -497,10 +500,16 @@
   }, [go, route, user]);

   // ---- The page for the route -----------------------------------------------
-  // Every page renders with the session notice after it, while the session
-  // check is still waiting for an answer.
+  // Every page renders with the session notice after it: while the session
+  // check is still waiting for an answer, or after a sign-out the server could
+  // not complete, until it is dismissed or someone signs in.
   const sessionNotice = sessionUnchecked ? (
     <AppNotice message="Can't reach the server to check your sign-in. Trying again..." />
+  ) : signOutUnfinished && !user ? (
+    <AppNotice
+      message="Signed out on this device, but the server could not end your session. It stays valid until it expires."
+      onDismiss={() => setSignOutUnfinished(false)}
+    />
   ) : null;
   const withNotice = (page) => (
     <>
```

```bash
git apply "$SCRATCH/c2-fix.diff"
npx prettier --write client/src/App.jsx client/src/app/events.js client/src/app/components/AppNotice.jsx client/src/app/styles/notice.css client/src/__tests__/App.test.jsx client/src/app/__tests__/events.test.js client/src/app/__tests__/events.handlers.test.js
npm run test -w client -- src/__tests__/App.test.jsx src/app/__tests__/events.test.js src/app/__tests__/events.handlers.test.js > "$SCRATCH/c2-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c2-green.txt"
git add client/src
git commit -m "fix(client): a sign-out the server could not finish says so" -m "Logout ignored the server's answer. The browser is signed out either way, since the server clears the cookies first, but a 503 or a failed request leaves the session valid until it expires. Logout now records that, and App shows a dismissible notice until someone signs in." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  226 passed (226)`.

**Comments.** `createAppEventHandlers`' doc comment names the new setter; the new lines in `onLogout` say what any answer but OK means. The comment above the request ("Signing out locally must not depend on the request succeeding") stays true and stays. App's notice comment now covers both notices; `AppNotice`'s doc comment names `onDismiss`. The notice stylesheet's header still describes it.

- [ ] **Step 4: Mutation checks**

| Mutation                                                                             | Caught by                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `events.js`: `setSignOutUnfinished(!sessionEnded);` → `setSignOutUnfinished(false);` | 4 tests: both App notice tests and both events "tells the visitor…" tests                        |
| `events.js`: `sessionEnded = res.ok;` → `sessionEnded = true;`                       | 3 tests: both App notice tests and "tells the visitor when the server could not end the session" |
| `App.jsx`: `signOutUnfinished && !user ?` → `signOutUnfinished ?`                    | "is gone once someone signs in again"                                                            |
| `App.jsx`: `onDismiss={() => setSignOutUnfinished(false)}` → `onDismiss={() => {}}`  | "can be dismissed"                                                                               |

- [ ] **Step 5: Coverage**

| Metric     | After C1    | After C2    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 4892 / 4948 | 4897 / 4953 | 98.8694 | 98.8  | 3.44  |
| Branches   | 3190 / 3399 | 3198 / 3406 | 93.8931 | 93.8  | 3.17  |
| Functions  | 1007 / 1016 | 1008 / 1017 | 99.1150 | 99.1  | 0.15  |
| Lines      | 4462 / 4484 | 4467 / 4489 | 99.5094 | 99.5  | 0.45  |

Everything added is covered: five statements and lines, seven branch arms, the `onDismiss` arrow. Branches gain one more covered than total: the new App tests, which drive a real logout and a sign-in through App, reach one existing arm of `useOptimisticLogs.js` that nothing reached before (42 → 43 of its 50; per-file counts from the two runs' `coverage-summary.json`). Per file: `App.jsx` 183 / 183 statements and 81 / 81 branches, `events.js` 295 / 296 statements (its one uncovered statement is on `main` too), `AppNotice.jsx` 3 / 3 branches. Tests 2414 → 2420.

- [ ] **Step 6: The after-capture and the compare**

```bash
npm run build > "$SCRATCH/b-c2.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c2-after" > "$SCRATCH/c2-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c2-before" "$SHOTS/c2-after" > "$SCRATCH/c2-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c2-cmp.txt"
```

Expected: `compare exit=0`, last line `identical`, as the scratch run printed. The main chunk is about 485.75 kB; no size warning.

- [ ] **Step 7: Gates and PR**

Run the gates; the E2E suite's last smoke test deletes the account, and its logout path answers 200 against a healthy store, so no notice appears there. `git push -u origin fix/logout-reports-unended-session`; `gh pr create --draft --base main --title "fix(client): a sign-out the server could not finish says so" --body-file "$SCRATCH/pr-c2.md"`. Outline: the owner item and S4; the three options for the client and why "sign out and say so"; when the notice shows and goes; the red run, mutations, coverage, the compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task C3: The home form's and the walkthrough's ranges are the server's

**Branch:** `fix/home-ranges-match-server` (client track, after C2).

**The bug.** The home stage's personal form (`HomePersonalStage.jsx:106-107, 160-161, 172-173, 234-235`) and the walkthrough's read-only copy of it (`PreviewPersonalChapter.jsx:70-71, 96-97, 107-108, 147-148`) bound age to 10-99, height to 120-230 cm or 3-7 ft, and weight to 35-200 kg or 77-440 lb. The server (`apiSchemaService.js:61-63`, `profileBodySchema`) accepts age 10-120, height 100-260 cm and weight 25-400 kg, and sign-up and Settings already match it (Phase 3's C5b: `AuthPage.jsx:138-139, 206-207, 219-220, 284-285`; `settingsFields.js:26-40`: feet 3-8, inches 0-11, pounds 55-882). The browser's own validation then refuses the home form's Continue for a 110 cm child, a 7 ft 5 in adult or a 210 kg visitor, all of whom the server, and sign-up, would take; and the home form's answers are what prefill sign-up (`events.js`, `openSignupWithPrefilledProfile`). Phase 3's C5b left both forms out of its contract because neither posts.

**One more place the range lives.** `useBodyModel.js:162` gates Continue with its own `ageValue >= 10 && ageValue <= 99`, so widening only the input would let a visitor type 110 and still never continue. It moves to 120 with the inputs. The silhouette's own clamps (`useBodyModel`'s `clamp()` of each shape field) already bound what it draws, so a 260 cm or 400 kg entry draws at the clamp, as it does today for any value past it.

**The fix (owner-approved: match the server's bounds, extending the contract test).** Every bound copies sign-up's: age 10-120, 100-260 cm, 3-8 ft and 0-11 in, 25-400 kg or 55-882 lb. `serverBounds.contract.test.jsx` gains both forms: their metric inputs as rows in the same table (accepted at each bound, refused one step past, by the schema the server validates with), and their imperial inputs held equal to sign-up's, which `settingsFields.test.js` already pins against the conversions. The contract's header comment, which said the two forms are left out, now says why they are in.

**Files:**

- Modify: `client/src/pages/home/components/HomePersonalStage.jsx` (four bound pairs), `client/src/pages/home/preview/components/PreviewPersonalChapter.jsx` (four bound pairs), `client/src/pages/home/hooks/useBodyModel.js:160-162` (the age gate and its comment)
- Test: `client/src/__tests__/serverBounds.contract.test.jsx` (two render helpers, six rows, one imperial test, the header comment; `renderSignup` takes its units), `client/src/pages/home/preview/components/__tests__/PreviewPersonalChapter.test.jsx` (the weight bounds it pins), `client/src/pages/home/hooks/__tests__/useBodyModel.test.jsx` (the age boundaries)

- [ ] **Step 1: Branch, the before-capture, and every copy of the old bounds**

```bash
git fetch origin && git switch -c fix/home-ranges-match-server origin/main
git grep -n 'max="99"\|min="120"\|max="230"\|max="7"\|"35" : "77"\|"200" : "440"\|<= 99' -- client/src
npm run build > "$SCRATCH/b-c3-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c3-before" > "$SCRATCH/c3-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c2-after" "$SHOTS/c3-before"; echo "chain exit=$?"
```

Expected: the four pairs in each of the two components and `useBodyModel.js:162`, nothing else; `identical`.

- [ ] **Step 2: The failing tests**

Write `$SCRATCH/c3-tests.diff`:

```diff
--- a/client/src/pages/home/hooks/__tests__/useBodyModel.test.jsx
+++ b/client/src/pages/home/hooks/__tests__/useBodyModel.test.jsx
@@ -375,7 +375,7 @@
     test.each([
       ["empty", ""],
       ["too young", "9"],
-      ["too old", "100"],
+      ["too old", "121"],
       ["unusable", "grown up"]
     ])("is incomplete with a %s age", (_label, age) => {
       // An empty age coerces to 0, which the range check rejects -- the same
@@ -383,7 +383,8 @@
       expect(base({ age }).isPersonalComplete).toBe(false);
     });

-    test.each([["10"], ["99"]])("accepts an age of %s, at the boundary", (age) => {
+    // The server's range, profileBodySchema's age (10 to 120).
+    test.each([["10"], ["120"]])("accepts an age of %s, at the boundary", (age) => {
       expect(base({ age }).isPersonalComplete).toBe(true);
     });
   });
--- a/client/src/pages/home/preview/components/__tests__/PreviewPersonalChapter.test.jsx
+++ b/client/src/pages/home/preview/components/__tests__/PreviewPersonalChapter.test.jsx
@@ -151,8 +151,8 @@
     });

     test.each([
-      ["kg", "35", "200"],
-      ["lb", "77", "440"]
+      ["kg", "25", "400"],
+      ["lb", "55", "882"]
     ])("the weight field's bounds follow the %s unit", (weightUnit, min, max) => {
       // A kilogram range on a pounds field would reject every plausible entry.
       renderChapter({ weightUnit });
--- a/client/src/__tests__/serverBounds.contract.test.jsx
+++ b/client/src/__tests__/serverBounds.contract.test.jsx
@@ -4,6 +4,9 @@
 import CaloriesView from "../pages/dashboard/views/CaloriesView";
 import DashboardWorkoutModal from "../pages/dashboard/components/DashboardWorkoutModal";
 import MealLogPanel from "../pages/dashboard/meal/MealLogPanel";
+import HomePersonalStage from "../pages/home/components/HomePersonalStage";
+import PreviewPersonalChapter from "../pages/home/preview/components/PreviewPersonalChapter";
+import { toCmFromFeetInches, toFeetInchesFromCm, toKg, toLb } from "../app/units";
 import { fieldsForTab } from "../pages/dashboard/settings/settingsFields";
 import {
   caloriesBodySchema,
@@ -21,9 +24,12 @@
 // range tighter than the server's makes a value the server accepts
 // unenterable, and a looser one lets through a value the server answers 400.
 //
-// The home form and the walkthrough are left out: neither posts its fields,
-// and sign-up, which does, is here. Feet and inches, and pounds, are converted
-// before they are sent, and settingsFields.test.js pins how.
+// The home form and the walkthrough are here too. Neither posts its fields,
+// but the home form's answers prefill sign-up, which does, and the walkthrough
+// shows the same form: a narrower range would turn away a visitor sign-up
+// accepts. Feet and inches, and pounds, are converted before they are sent,
+// and settingsFields.test.js pins how; the imperial ranges of the three forms
+// are held to sign-up's below.

 const noop = () => {};

@@ -90,7 +96,51 @@
     />
   );

-const renderSignup = () =>
+const renderHomeForm = (heightUnit = "cm", weightUnit = "kg") =>
+  render(
+    <HomePersonalStage
+      personalPanelRef={{ current: null }}
+      personalMode="basic"
+      setPersonalMode={noop}
+      user={null}
+      onLogout={noop}
+      go={noop}
+      onPersonalSubmit={noop}
+      personal={{ heightCm: "", heightFeet: "", heightInches: "", weight: "", trainingDays: [] }}
+      onPersonalChange={noop}
+      heightUnit={heightUnit}
+      setHeightUnit={noop}
+      toFeetInchesFromCm={toFeetInchesFromCm}
+      toCmFromFeetInches={toCmFromFeetInches}
+      setPersonal={noop}
+      weightUnit={weightUnit}
+      setWeightUnit={noop}
+      toLb={toLb}
+      toKg={toKg}
+      trainingDayOptions={[]}
+      toggleTrainingDay={noop}
+      isPersonalComplete={false}
+      backBtnStyle={{}}
+      goToStage={noop}
+      isIntroTransitioning={false}
+      isStageTransitioning={false}
+    />
+  );
+
+const renderWalkthroughForm = (heightUnit = "cm", weightUnit = "kg") =>
+  render(
+    <PreviewPersonalChapter
+      previewPersonalCollapsed={false}
+      previewPersonalShifted={false}
+      previewBuilderStage={0}
+      previewFilledFields={{}}
+      heightUnit={heightUnit}
+      weightUnit={weightUnit}
+      getPreviewTextRows={() => 1}
+    />
+  );
+
+const renderSignup = (signupHeightUnit = "cm", signupWeightUnit = "kg") =>
   render(
     <AuthPage
       gradient={{}}
@@ -102,9 +152,9 @@
       onAuthChange={noop}
       signupProfileForm={{ heightCm: "", heightFeet: "", heightInches: "", weight: "" }}
       onSignupProfileChange={noop}
-      signupHeightUnit="cm"
+      signupHeightUnit={signupHeightUnit}
       setSignupHeightUnit={noop}
-      signupWeightUnit="kg"
+      signupWeightUnit={signupWeightUnit}
       setSignupWeightUnit={noop}
       toCmFromFeetInches={() => ""}
       toFeetInchesFromCm={() => ({ feet: "", inches: "" })}
@@ -192,7 +242,23 @@
   ],
   ["Sign-up: age", renderSignup, byName("age"), profileBodySchema.shape.age],
   ["Sign-up: height in cm", renderSignup, byName("heightCm"), profileBodySchema.shape.heightCm],
-  ["Sign-up: weight in kg", renderSignup, byName("weight"), profileBodySchema.shape.weightKg]
+  ["Sign-up: weight in kg", renderSignup, byName("weight"), profileBodySchema.shape.weightKg],
+  ["Home form: age", renderHomeForm, byName("age"), profileBodySchema.shape.age],
+  ["Home form: height in cm", renderHomeForm, byName("heightCm"), profileBodySchema.shape.heightCm],
+  ["Home form: weight in kg", renderHomeForm, byName("weight"), profileBodySchema.shape.weightKg],
+  ["Walkthrough: age", renderWalkthroughForm, byName("age"), profileBodySchema.shape.age],
+  [
+    "Walkthrough: height in cm",
+    renderWalkthroughForm,
+    byName("heightCm"),
+    profileBodySchema.shape.heightCm
+  ],
+  [
+    "Walkthrough: weight in kg",
+    renderWalkthroughForm,
+    byName("weight"),
+    profileBodySchema.shape.weightKg
+  ]
 ];

 const accepts = (field, value) => field.safeParse(value).success;
@@ -215,6 +281,26 @@
     expect(accepts(field, nudge(max + stepOf(input)))).toBe(false);
   });

+  // The imperial inputs have no schema of their own, so they are held to
+  // sign-up's, whose conversions settingsFields.test.js pins.
+  test.each([
+    ["the home form", renderHomeForm],
+    ["the walkthrough", renderWalkthroughForm]
+  ])("%s's feet, inches and pounds bounds are sign-up's", (_label, renderForm) => {
+    const boundsOf = () =>
+      ["heightFeet", "heightInches", "weight"].map((name) => {
+        const input = byName(name)();
+        return [name, input.min, input.max];
+      });
+    const { unmount } = renderSignup("ft", "lb");
+    const signup = boundsOf();
+    unmount();
+
+    renderForm("ft", "lb");
+
+    expect(boundsOf()).toEqual(signup);
+  });
+
   test("Goal: the weekly workouts offered are every count the server accepts", () => {
     renderCaloriesView();
     const offered = Array.from(screen.getByLabelText("Weekly workouts").options, (option) =>
```

```bash
git apply "$SCRATCH/c3-tests.diff"
npm run test -w client -- src/__tests__/serverBounds.contract.test.jsx src/pages/home/preview/components/__tests__/PreviewPersonalChapter.test.jsx src/pages/home/hooks/__tests__/useBodyModel.test.jsx src/pages/home/components/__tests__/HomePersonalStage.test.jsx > "$SCRATCH/c3-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |×" "$SCRATCH/c3-red.txt"
```

Expected: `exit=1`, `Tests  11 failed | 144 passed (155)`: the six new rows (each form's age, cm and kg: refused at a value the schema takes), both imperial tests (7 against 8 ft, 440 against 882 lb), both of the walkthrough's weight-bounds tests, and "accepts an age of 120, at the boundary" (Continue stays shut).

- [ ] **Step 3: The fix**

Write `$SCRATCH/c3-fix.diff`:

```diff
--- a/client/src/pages/home/components/HomePersonalStage.jsx
+++ b/client/src/pages/home/components/HomePersonalStage.jsx
@@ -104,7 +104,7 @@
             onChange={onPersonalChange}
             type="number"
             min="10"
-            max="99"
+            max="120"
             placeholder="28"
           />
         </label>
@@ -157,8 +157,8 @@
               value={personal.heightCm}
               onChange={onPersonalChange}
               type="number"
-              min="120"
-              max="230"
+              min="100"
+              max="260"
               placeholder="175"
             />
           ) : (
@@ -170,7 +170,7 @@
                   onChange={onPersonalChange}
                   type="number"
                   min="3"
-                  max="7"
+                  max="8"
                   placeholder="5"
                 />
                 <span className="height-unit">ft</span>
@@ -231,8 +231,8 @@
             value={personal.weight}
             onChange={onPersonalChange}
             type="number"
-            min={weightUnit === "kg" ? "35" : "77"}
-            max={weightUnit === "kg" ? "200" : "440"}
+            min={weightUnit === "kg" ? "25" : "55"}
+            max={weightUnit === "kg" ? "400" : "882"}
             placeholder={weightUnit === "kg" ? "72" : "160"}
           />
         </label>
--- a/client/src/pages/home/hooks/useBodyModel.js
+++ b/client/src/pages/home/hooks/useBodyModel.js
@@ -156,10 +156,11 @@
   }, [resolvedHeightCm, resolvedWeightKg]);

   // ---- Whether the personal step is complete --------------------------------
-  // The five fields HomePersonalStage's hint asks for.
+  // The five fields HomePersonalStage's hint asks for. The age range is the
+  // server's (profileBodySchema), as the form's own bounds are.
   const ageValue = useMemo(() => toNumberOrNull(personal.age), [personal.age]);
   const hasValidName = Boolean(personal.name?.trim());
-  const hasValidAge = ageValue !== null && ageValue >= 10 && ageValue <= 99;
+  const hasValidAge = ageValue !== null && ageValue >= 10 && ageValue <= 120;
   const isPersonalComplete =
     hasValidName &&
     hasValidAge &&
--- a/client/src/pages/home/preview/components/PreviewPersonalChapter.jsx
+++ b/client/src/pages/home/preview/components/PreviewPersonalChapter.jsx
@@ -68,7 +68,7 @@
               value={getFieldValue("age")}
               type="number"
               min="10"
-              max="99"
+              max="120"
               readOnly
             />
           </label>
@@ -93,8 +93,8 @@
                 name="heightCm"
                 value={getFieldValue("heightCm")}
                 type="number"
-                min="120"
-                max="230"
+                min="100"
+                max="260"
                 readOnly
               />
             ) : (
@@ -105,7 +105,7 @@
                     value={getFieldValue("heightFeet")}
                     type="number"
                     min="3"
-                    max="7"
+                    max="8"
                     readOnly
                   />
                   <span className="height-unit">ft</span>
@@ -144,8 +144,8 @@
               name="weight"
               value={getFieldValue("weight")}
               type="number"
-              min={weightUnit === "kg" ? "35" : "77"}
-              max={weightUnit === "kg" ? "200" : "440"}
+              min={weightUnit === "kg" ? "25" : "55"}
+              max={weightUnit === "kg" ? "400" : "882"}
               readOnly
             />
           </label>
```

```bash
git apply "$SCRATCH/c3-fix.diff"
npx prettier --write client/src/pages/home/components/HomePersonalStage.jsx client/src/pages/home/preview/components/PreviewPersonalChapter.jsx client/src/pages/home/hooks/useBodyModel.js client/src/__tests__/serverBounds.contract.test.jsx client/src/pages/home/preview/components/__tests__/PreviewPersonalChapter.test.jsx client/src/pages/home/hooks/__tests__/useBodyModel.test.jsx
npm run test -w client -- src/__tests__/serverBounds.contract.test.jsx src/pages/home/preview/components/__tests__/PreviewPersonalChapter.test.jsx src/pages/home/hooks/__tests__/useBodyModel.test.jsx src/pages/home/components/__tests__/HomePersonalStage.test.jsx > "$SCRATCH/c3-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c3-green.txt"
git add client/src
git commit -m "fix(client): the home form's and the walkthrough's ranges are the server's" -m "Both forms bounded age to 10-99, height to 120-230 cm and weight to 35-200 kg, narrower than the server and sign-up, so the browser refused a visitor sign-up would take; useBodyModel's Continue gate kept its own 99. All now copy sign-up's bounds, and the client/server contract test holds both forms to the schema." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  155 passed (155)`.

**Comments.** `useBodyModel`'s comment over the gate says where its range comes from; the contract test's header says why the two forms are in. Neither component's doc comment names a range. The HomePersonalStage hint ("Enter name, age, height, weight, and sex to continue.") names none either.

- [ ] **Step 4: Mutation checks**

| Mutation                                                       | Caught by                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `HomePersonalStage.jsx`: the age's `max="120"` → `max="99"`    | "Home form: age"                                                                                                 |
| `HomePersonalStage.jsx`: the feet's `max="8"` → `max="7"`      | "the home form's feet, inches and pounds bounds are sign-up's"                                                   |
| `PreviewPersonalChapter.jsx`: the pounds max `"882"` → `"440"` | "the walkthrough's feet, inches and pounds bounds are sign-up's", "the weight field's bounds follow the lb unit" |
| `useBodyModel.js`: `ageValue <= 120` → `ageValue <= 99`        | "accepts an age of 120, at the boundary"                                                                         |

- [ ] **Step 5: Coverage.** Unchanged, by measurement: client 4897 / 4953, 3198 / 3406, 1008 / 1017, 4467 / 4489, the counts after C2 (attribute values and a constant in an expression are neither statements nor branches). Tests 2420 → 2428 (six rows and two imperial tests).

- [ ] **Step 6: The after-capture and the compare**

```bash
npm run build > "$SCRATCH/b-c3.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c3-after" > "$SCRATCH/c3-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c3-before" "$SHOTS/c3-after" > "$SCRATCH/c3-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c3-cmp.txt"
```

Expected: `compare exit=0`, last line `identical`: only `min` and `max` attributes change, which move no pixel, style or box, and no capture state submits a form. The scratch run printed `identical` (with the same 10 px `NOISE` line on `desktop-dash-meal-loading-motion.png` C1 saw).

- [ ] **Step 7: Gates and PR.** Run the gates. `git push -u origin fix/home-ranges-match-server`; `gh pr create --draft --base main --title "fix(client): the home form's and the walkthrough's ranges are the server's" --body-file "$SCRATCH/pr-c3.md"`. Outline: the owner item; the old and new bounds beside the schema's; the Continue gate found while checking; the contract's two additions; the red run, mutations, coverage, compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task C4: A later entry's Undo toast stays up, and a plan for a signed-out account is dropped

**Branch:** `fix/undo-toast-and-plan-after-logout` (client track, after C3). Items 11 and 12: both are answers that arrive late, in the two places Phase 3's C3 taught to tell an account apart (`useOptimisticLogs.js` and `events.js`), and each is a few lines.

**Bug 11: an earlier entry's answer takes a later entry's Undo away.** Log entry A; two seconds later log entry B, whose toast offers Undo until its window closes. At 4.5 s A's window closes and A is sent. When A's answer arrives, `useOptimisticLogs.js:175` (`showDashboardToast(successMessage || "Saved.")`), or `:182` for a failure, replaces the toast on screen, which is B's, and with it B's Undo: B is then sent at 6.5 s with no way to call it off. Phase 3's C3c found this while writing its "a newer entry's Undo toast is left as it is" test, which covers only the "Saving..." step.

**The fix (owner-approved: keep an Undo toast until its window closes).** The hook keeps `undoToastIdRef`, the id of the toast on screen while it offers Undo: `showDashboardToast` sets it from the toast it shows (the toast's id when it has an action, else null), `clearDashboardToast` clears it, and an entry's own send clears it when the toast on screen is that entry's (the "Saving..." step, where its Undo is withdrawn). A send's answer then shows its toast only when no Undo is on offer. That covers the failure too: its message still reaches the page through `setDashError`, which DashboardPage renders as its error line (`DashboardPage.jsx:496`), so nothing is hidden; only the toast yields. Undo itself, a toast the visitor asks for (a goal saved, an exercise saved), and dismissing the toast by hand all replace or clear it as before.

**Bug 12: a plan generated while its visitor logs out still opens.** `events.js:150-171`'s `onSubmit` sets the result and goes to `/plan` (or the dashboard) whatever happened while Gemini was answering; C3a guarded only the saved copy (`data.savedPlan && isSameAccount()`). So a visitor who logs out during generation, or the next person at the browser, is taken to `/plan` and shown the previous account's plan. **The fix (owner-approved: drop the result when the account changes, reusing C3a's generation counter):** right after the answer is read, `if (!isSameAccount()) return;`. The plan is not shown, not added to the dashboard, and nothing navigates; `finally` still clears the loading state. The saved-copy check's own `isSameAccount()` then always passes, so it goes rather than stay as a second guard nothing can tell apart (CLAUDE.md's "one guard, not two"). A visitor who generates while signed out and signs in before the answer is the same account to the counter (only logout, account deletion and unmount bump it), so they still get their plan.

**Files:**

- Modify: `client/src/app/hooks/useOptimisticLogs.js` (the ref and its comment; `clearDashboardToast`, `showDashboardToast`, the commit's start, success and failure; the hook's doc comment)
- Modify: `client/src/app/events.js:150-156` (`onSubmit`)
- Test: `client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx` (four tests), `client/src/app/__tests__/events.test.js` (the test that pinned the old `onSubmit` behaviour, rewritten)

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/undo-toast-and-plan-after-logout origin/main
grep -n "showDashboardToast(successMessage\|showDashboardToast(message, \"error\")" client/src/app/hooks/useOptimisticLogs.js
grep -n "setResult(data.plan)\|data.savedPlan && isSameAccount()" client/src/app/events.js
npm run build > "$SCRATCH/b-c4-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c4-before" > "$SCRATCH/c4-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c3-after" "$SHOTS/c4-before"; echo "chain exit=$?"
```

- [ ] **Step 2: The failing tests**

The `onSubmit` test that read "shows the plan but keeps its saved copy off the dashboard" pinned bug 12 as intended behaviour; it is rewritten to the owner's rule. Write `$SCRATCH/c4-tests.diff`:

```diff
--- a/client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx
+++ b/client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx
@@ -684,3 +684,98 @@
     });
   });
 });
+
+// An earlier entry's send can answer while a later entry's Undo toast is up.
+// The Undo is the only way to call that later entry off, so the answer does
+// not replace it; a failure still reaches the page through setDashError.
+describe("an answer that arrives while a later entry offers Undo", () => {
+  // Entry one is sent at 4.5 s and answers when the test says; entry two is
+  // queued at 2 s, so its Undo toast is up, and its window open, until 6.5 s.
+  const stage = async (result, request) => {
+    act(() => result.current.queueOptimisticLogCommit(queue(undefined, { request })));
+    await act(async () => {
+      vi.advanceTimersByTime(2000);
+    });
+    act(() =>
+      result.current.queueOptimisticLogCommit(
+        queue(
+          { dashboard: {} },
+          { item: { id: "op-2", title: "Eggs" }, pendingMessage: "Eggs added. Undo?" }
+        )
+      )
+    );
+    await act(async () => {
+      vi.advanceTimersByTime(OPTIMISTIC_UNDO_WINDOW_MS - 2000);
+    });
+  };
+
+  test("a success leaves the later entry's Undo toast up", async () => {
+    const { result } = render();
+    const pending = deferred();
+    await stage(
+      result,
+      vi.fn(() => pending.promise)
+    );
+
+    await act(async () => {
+      pending.resolve({ dashboard: { mealLogs: [] } });
+    });
+
+    expect(setDashboard).toHaveBeenCalledWith({ mealLogs: [] });
+    expect(result.current.dashboardToast).toMatchObject({
+      message: "Eggs added. Undo?",
+      actionLabel: "Undo"
+    });
+  });
+
+  test("a failure leaves it up too, and still reports the error", async () => {
+    const { result } = render();
+    const pending = deferred();
+    await stage(
+      result,
+      vi.fn(() => pending.promise)
+    );
+
+    await act(async () => {
+      pending.reject(new Error("Server error."));
+    });
+
+    expect(setDashError).toHaveBeenLastCalledWith("Server error.");
+    expect(result.current.dashboardToast).toMatchObject({
+      message: "Eggs added. Undo?",
+      actionLabel: "Undo"
+    });
+  });
+
+  test("once the later entry is undone, the answer shows again", async () => {
+    const { result } = render();
+    const pending = deferred();
+    await stage(
+      result,
+      vi.fn(() => pending.promise)
+    );
+
+    act(() => result.current.dashboardToast.onAction());
+    await act(async () => {
+      pending.resolve({ dashboard: {} });
+    });
+
+    expect(result.current.dashboardToast).toMatchObject({ message: "Meal saved." });
+  });
+
+  test("once the toast is dismissed by hand, the answer shows again", async () => {
+    const { result } = render();
+    const pending = deferred();
+    await stage(
+      result,
+      vi.fn(() => pending.promise)
+    );
+
+    act(() => result.current.clearDashboardToast());
+    await act(async () => {
+      pending.resolve({ dashboard: {} });
+    });
+
+    expect(result.current.dashboardToast).toMatchObject({ message: "Meal saved." });
+  });
+});
--- a/client/src/app/__tests__/events.test.js
+++ b/client/src/app/__tests__/events.test.js
@@ -937,13 +937,17 @@
     expect(result).toEqual({ ok: true });
   });

-  test("onSubmit shows the plan but keeps its saved copy off the dashboard", async () => {
+  // The plan was asked for by the account that signed out, so neither it nor
+  // its saved copy is shown to whoever is at the browser now.
+  test("onSubmit drops the plan, its saved copy and the trip to /plan", async () => {
     await build(
       signedOutMidRequest({ plan: "Monday - Push", savedPlan: { id: "p-new" } })
     ).onSubmit(submitEvent());

-    expect(deps.setResult).toHaveBeenLastCalledWith("Monday - Push");
+    expect(deps.setResult).not.toHaveBeenCalledWith("Monday - Push");
     expect(deps.setDashboard).not.toHaveBeenCalled();
+    expect(deps.go).not.toHaveBeenCalled();
+    expect(deps.setLoading).toHaveBeenLastCalledWith(false);
   });
 });

```

```bash
git apply "$SCRATCH/c4-tests.diff"
npm run test -w client -- src/app/hooks/__tests__/useOptimisticLogs.test.jsx src/app/__tests__/events.test.js src/__tests__/App.test.jsx > "$SCRATCH/c4-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |×|AssertionError" "$SCRATCH/c4-red.txt"
```

Expected: `exit=1`, `Tests  3 failed | 208 passed (211)`: "a success leaves the later entry's Undo toast up" and "a failure leaves it up too, and still reports the error" (`expected { …(5) } to match object { message: 'Eggs added. Undo?', …(1) }`: the toast is A's answer, bug 11), and "onSubmit drops the plan, its saved copy and the trip to /plan" (`expected "vi.fn()" to not be called with arguments: [ 'Monday - Push' ]`, bug 12). The two "…the answer shows again" tests pass already; they are the guards that the hold is released.

- [ ] **Step 3: The fix**

Write `$SCRATCH/c4-fix.diff`:

```diff
--- a/client/src/app/events.js
+++ b/client/src/app/events.js
@@ -150,10 +150,12 @@
       }

       const data = await res.json();
+      // Generation can outlast a logout. A plan asked for by an account that is
+      // no longer signed in is dropped: not shown, not added to the dashboard,
+      // and no trip to /plan.
+      if (!isSameAccount()) return;
       setResult(data.plan);
-      // Generation can outlast a logout. The saved plan joins the dashboard only
-      // while the account that asked for it is still the one signed in.
-      if (data.savedPlan && isSameAccount()) {
+      if (data.savedPlan) {
         setDashboard((prev) =>
           prev ? { ...prev, plans: [data.savedPlan, ...(prev.plans || [])] } : prev
         );
--- a/client/src/app/hooks/useOptimisticLogs.js
+++ b/client/src/app/hooks/useOptimisticLogs.js
@@ -15,7 +15,8 @@
  * `flushOptimisticOperations`, which logout runs first: it sends every entry
  * still inside its undo window and resolves once every send has settled; and
  * `captureAccount`, which returns a check that stays true until the next
- * clear, for a request to read once its answer is in. `setDashboard` and
+ * clear, for a request to read once its answer is in. A send's answer shows in
+ * the toast unless the toast is offering a later entry's Undo, which stays. `setDashboard` and
  * `setDashError` are useDashboardData's: a send that succeeds replaces the
  * dashboard with the server's, and one that fails reports its error there.
  */
@@ -29,6 +30,10 @@
   // unmount all run. A request sent before the bump answers for an account
   // that is no longer on screen.
   const generationRef = useRef(0);
+  // The id of the toast on screen while it offers Undo, else null. A send's
+  // answer does not replace that toast: it is the only way to call its entry
+  // off, so it stays until that entry's own send starts.
+  const undoToastIdRef = useRef(null);

   // ---- Toast ----------------------------------------------------------------
   const clearDashboardToast = useCallback(() => {
@@ -36,6 +41,7 @@
       clearTimeout(dashboardToastTimeoutRef.current);
       dashboardToastTimeoutRef.current = null;
     }
+    undoToastIdRef.current = null;
     setDashboardToast(null);
   }, []);

@@ -61,6 +67,7 @@
         : nextToast.onAction
           ? 5200
           : 3200;
+    undoToastIdRef.current = nextToast.onAction ? nextToast.id : null;
     setDashboardToast(nextToast);
     dashboardToastTimeoutRef.current = setTimeout(() => {
       setDashboardToast((current) => (current?.id === nextToast.id ? null : current));
@@ -161,6 +168,7 @@
         // stops offering it, if the toast is still this entry's: a newer
         // entry's Undo is left. Its id stays, so its own timer still clears it.
         operation.committing = true;
+        if (undoToastIdRef.current === operation.undoToastId) undoToastIdRef.current = null;
         setDashboardToast((current) =>
           current?.id === operation.undoToastId
             ? { ...current, message: "Saving...", actionLabel: "", onAction: null }
@@ -172,14 +180,17 @@
           optimisticOpRef.current.delete(operationId);
           removeOptimisticEntry(operationId);
           setDashboard(data.dashboard);
-          showDashboardToast(successMessage || "Saved.");
+          // A later entry's Undo toast is left up (undoToastIdRef).
+          if (!undoToastIdRef.current) showDashboardToast(successMessage || "Saved.");
         } catch (err) {
           if (!isSameAccount()) return;
           optimisticOpRef.current.delete(operationId);
           removeOptimisticEntry(operationId);
           const message = err?.message || `Unable to save ${type}.`;
+          // The page shows the error either way; the toast yields to a later
+          // entry's Undo, as a success does.
           setDashError(message);
-          showDashboardToast(message, "error");
+          if (!undoToastIdRef.current) showDashboardToast(message, "error");
         }
       };

```

```bash
git apply "$SCRATCH/c4-fix.diff"
npx prettier --write client/src/app/hooks/useOptimisticLogs.js client/src/app/events.js client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx client/src/app/__tests__/events.test.js
npm run test -w client -- src/app/hooks/__tests__/useOptimisticLogs.test.jsx src/app/__tests__/events.test.js src/__tests__/App.test.jsx > "$SCRATCH/c4-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c4-green.txt"
git add client/src
git commit -m "fix(client): a later entry's Undo stays up; a plan for a signed-out account is dropped" -m "An earlier entry's answer replaced the toast on screen, which could be a later entry's Undo, so that entry was sent with no way to call it off. A send's answer now leaves an Undo toast up; a failure still reaches the page's error line. A plan that comes back after its account signed out was still shown and opened /plan; it is now dropped." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  211 passed (211)`.

**Comments.** The ref's comment says what it holds and why; the success and failure lines say they yield, and the failure's that the page still shows the error. The hook's doc comment gains one sentence on it. In `events.js` the comment over the account check replaces the one that said only the saved plan was kept off the dashboard. The C3c comment over the "Saving..." step ("A newer entry's Undo is left") stays true.

- [ ] **Step 4: Mutation checks**

| Mutation                                                                                                   | Caught by                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| success: drop `if (!undoToastIdRef.current)`                                                               | "a success leaves the later entry's Undo toast up"                                          |
| failure: drop `if (!undoToastIdRef.current)`                                                               | "a failure leaves it up too, and still reports the error"                                   |
| delete the commit's `if (undoToastIdRef.current === operation.undoToastId) undoToastIdRef.current = null;` | "reports success to the user", "surfaces the failure as an error, not a success" (existing) |
| delete `undoToastIdRef.current = null;` in `clearDashboardToast`                                           | "once the toast is dismissed by hand, the answer shows again"                               |
| `undoToastIdRef.current = nextToast.onAction ? nextToast.id : null;` → `= nextToast.id;`                   | "once the later entry is undone, the answer shows again"                                    |
| `events.js`: delete `if (!isSameAccount()) return;` in `onSubmit`                                          | "onSubmit drops the plan, its saved copy and the trip to /plan"                             |

The fifth was a survivor in the first scratch run, with only three tests; the undo test was added for it.

- [ ] **Step 5: Coverage**

| Metric     | After C3    | After C4    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 4897 / 4953 | 4906 / 4962 | 98.8714 | 98.8  | 3.54  |
| Branches   | 3198 / 3406 | 3206 / 3414 | 93.9074 | 93.8  | 3.67  |
| Functions  | 1008 / 1017 | 1008 / 1017 | 99.1150 | 99.1  | 0.15  |
| Lines      | 4467 / 4489 | 4472 / 4494 | 99.5105 | 99.5  | 0.47  |

Nine statements, eight branch arms and five lines, all covered: `useOptimisticLogs.js` 107 / 108 statements and 51 / 58 branches (100 / 101 and 43 / 50 before; its uncovered ones are `main`'s), and in `events.js` the new check's two arms replace the second guard's two, so its branch count holds. Tests 2428 → 2432.

- [ ] **Step 6: The after-capture and the compare** (as C3's Step 6, into `$SHOTS/c4-after`). Expected: `compare exit=0`, last line `identical`, as the scratch run printed (JavaScript only).

- [ ] **Step 7: Gates and PR.** Run the gates. `git push -u origin fix/undo-toast-and-plan-after-logout`; `gh pr create --draft --base main --title "fix(client): a later entry's Undo stays up; a plan for a signed-out account is dropped" --body-file "$SCRATCH/pr-c4.md"`. Outline: the two owner items, each with its timeline; the ref and when it is set and cleared; why a failure's toast yields too; the dropped plan and the removed second guard; the red run, mutations (with the survivor that added a test), coverage, compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task C5: "No injuries" in the profile notes is not an injury note

**Branch:** `fix/no-injury-phrasings` (client track, after C4).

**The bug.** TipsView's injury note is the planner's injuries answer and the profile's notes (`TipsView.jsx:177`, `buildInjuryText`), each left out when it is exactly `none`, `n/a` or `no` (`recommendationUtils.js:166-177`, Phase 3's C4). A note written as "No injuries", "No injuries.", "Nothing" or "injury-free" is kept, so the guide's "Injury Guardrails" card reads "Injury note detected: use controlled tempo, pain-free ranges, and swap high-risk patterns." (`buildGuideCards`), when the visitor said the opposite. Phase 3 recorded it as an owner decision.

**The fix (owner-approved: recognise common "none" phrasings, with tests).** One anchored pattern, `NO_INJURY_ANSWER`, replaces the three-word set: `none`, `nothing`, `nope`, `no`, `n/a` or `na`, `injury-free` or `injury free`, and `no [current|known] injuries|injury|limitations|issues|problems|pain`, optionally `… or …` a second of those. It is tested against the whole answer after lower-casing, collapsing runs of spaces and dropping closing `.` or `!`, so the three existing answers and their tests still hold. Because it is anchored at both ends, a note that goes on to name something ("No injuries except a sore knee", "Nothing major, lower back twinges") is kept whole, and `detectInjuryFlags` still finds the knee or the back in it. What a kept note then flags is the keyword matching the spec parks (`detectInjuryFlags`'s "back" inside "lower back"); this task does not touch it.

**Files:**

- Modify: `client/src/pages/dashboard/tips/recommendationUtils.js:164-177` (the pattern, `isNoInjuryAnswer`, `buildInjuryText`'s doc comment and filter)
- Modify: `client/src/pages/dashboard/views/TipsView.jsx:34-35` (its doc comment names the rule)
- Test: `client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js` (two tables)

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/no-injury-phrasings origin/main
git grep -n "NO_INJURY_ANSWERS\|buildInjuryText" -- client/src
npm run build > "$SCRATCH/b-c5-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c5-before" > "$SCRATCH/c5-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c4-after" "$SHOTS/c5-before"; echo "chain exit=$?"
```

Expected: the set and `buildInjuryText` in `recommendationUtils.js`, its import and one call in `TipsView.jsx`, its tests; `identical`.

- [ ] **Step 2: The failing tests**

Write `$SCRATCH/c5-tests.diff`:

```diff
--- a/client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js
+++ b/client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js
@@ -604,6 +604,44 @@
     }
   );

+  // A profile note is free text, so "no injuries" is said many ways. Each is
+  // read as the whole answer, with case, spacing and closing punctuation
+  // ignored.
+  test.each([
+    ["No injuries"],
+    ["no injury"],
+    ["No injuries."],
+    ["none!"],
+    ["Nothing"],
+    ["Nope"],
+    ["NA"],
+    ["n/a."],
+    ["No known injuries"],
+    ["No current injuries"],
+    ["No limitations"],
+    ["no issues"],
+    ["No problems"],
+    ["No pain"],
+    ["No injuries or limitations"],
+    ["Injury-free"],
+    ["injury free"],
+    ["  no   injuries  "]
+  ])("reads the note %j as no injury", (note) => {
+    expect(buildInjuryText("None", note)).toBe("");
+  });
+
+  // Only the whole answer counts, so a note that goes on to name something is
+  // kept, and the guide can still find the injury in it.
+  test.each([
+    ["No injuries except a sore knee"],
+    ["no pain running, but my left knee clicks"],
+    ["None of the above, shoulder only"],
+    ["Nothing major, lower back twinges"],
+    ["knee"]
+  ])("keeps the note %j", (note) => {
+    expect(buildInjuryText("None", note)).toBe(note);
+  });
+
   test("joins a real injury and a real note", () => {
     expect(buildInjuryText("Knee", "sore after runs")).toBe("Knee sore after runs");
   });
```

```bash
git apply "$SCRATCH/c5-tests.diff"
npm run test -w client -- src/pages/dashboard/tips/__tests__/recommendationUtils.test.js src/pages/dashboard/views/__tests__/TipsView.test.jsx > "$SCRATCH/c5-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c5-red.txt"
```

Expected: `exit=1`, `Tests  18 failed | 179 passed (197)`: every row of "reads the note … as no injury", each `expected '<the note>' to be ''`. The five "keeps the note …" rows pass already; they pin that the wider rule does not swallow a real note.

- [ ] **Step 3: The fix**

Write `$SCRATCH/c5-fix.diff`:

```diff
--- a/client/src/pages/dashboard/tips/recommendationUtils.js
+++ b/client/src/pages/dashboard/tips/recommendationUtils.js
@@ -161,19 +161,33 @@
   return active;
 };

-// Answers to "any injuries?" that mean there are none. The planner's injuries
-// field defaults to the first of them.
-const NO_INJURY_ANSWERS = new Set(["none", "n/a", "no"]);
+// Whole answers to "any injuries?" that mean there are none: the planner's
+// injuries field defaults to "None", and a profile note may say so in words
+// ("No injuries", "no known issues", "injury-free"). Anchored at both ends, so
+// a note that goes on to name something ("no injuries except a sore knee") is
+// a note.
+const NO_INJURY_ANSWER =
+  /^(none|nothing|nope|no|n\/?a|injury[- ]free|no (current |known )?(injur(y|ies)|limitations?|issues?|problems?|pain)( or (injur(y|ies)|limitations?|issues?|problems?|pain))?)$/;
+
+// Lower-cased, with runs of spaces collapsed and closing . ! dropped, so
+// "No  injuries." reads as "no injuries".
+const isNoInjuryAnswer = (value) =>
+  NO_INJURY_ANSWER.test(
+    value
+      .toLowerCase()
+      .replace(/\s+/g, " ")
+      .replace(/[.!]+$/, "")
+  );

 /**
  * The injury note the guide reads: the planner's injuries answer and the
  * profile's notes, trimmed and joined with a space, each left out when it is
- * empty or answers none, n/a or no.
+ * empty or is a whole answer meaning none (NO_INJURY_ANSWER).
  */
 export const buildInjuryText = (injuries, notes) =>
   [injuries, notes]
     .map((value) => String(value || "").trim())
-    .filter((value) => value && !NO_INJURY_ANSWERS.has(value.toLowerCase()))
+    .filter((value) => value && !isNoInjuryAnswer(value))
     .join(" ");

 /**
--- a/client/src/pages/dashboard/views/TipsView.jsx
+++ b/client/src/pages/dashboard/views/TipsView.jsx
@@ -31,8 +31,8 @@
  * equipment, today's plan lines, the weather and any injury note), a training
  * guide (buildGuideCards), and the exercise list. The search and filters drive
  * the one exercise load both lists share. An injury note is the planner form's
- * injuries plus the profile's notes, each left out when it answers none, n/a
- * or no (buildInjuryText). `onSaveExerciseToPlan` is saveExerciseToPlan in
+ * injuries plus the profile's notes, each left out when it is a whole answer
+ * meaning none, such as "None" or "No injuries" (buildInjuryText). `onSaveExerciseToPlan` is saveExerciseToPlan in
  * events.js, which resolves to `{ ok: true }` or `{ ok: false, error }`.
  */
 export default function TipsView({
```

```bash
git apply "$SCRATCH/c5-fix.diff"
npx prettier --write client/src/pages/dashboard/tips/recommendationUtils.js client/src/pages/dashboard/views/TipsView.jsx client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js
npm run test -w client -- src/pages/dashboard/tips/__tests__/recommendationUtils.test.js src/pages/dashboard/views/__tests__/TipsView.test.jsx > "$SCRATCH/c5-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c5-green.txt"
git add client/src
git commit -m "fix(client): \"No injuries\" in the profile notes is not an injury note" -m "Only an exact none, n/a or no was read as no injury, so a note saying No injuries, Nothing or injury-free turned on the guide's injury guardrails. One anchored pattern now reads the common phrasings as the whole answer; a note that goes on to name something is kept." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  197 passed (197)`.

**Comments.** The pattern's comment says what it matches and why it is anchored; `isNoInjuryAnswer` says what it normalises; `buildInjuryText`'s doc comment and TipsView's stop listing three words. The `describe("buildInjuryText")` comment in the test file ("The planner's injuries field defaults to "None", and a profile note can say "n/a"") stays true.

- [ ] **Step 4: Mutation checks**

| Mutation (`recommendationUtils.js`)           | Caught by                                                |
| --------------------------------------------- | -------------------------------------------------------- |
| the pattern's closing `$` dropped             | 4 tests: the kept notes that start with a none phrase    |
| `.replace(/[.!]+$/, "")` deleted              | 3 tests: "No injuries.", "none!", "n/a."                 |
| `.replace(/\s+/g, " ")` deleted               | " no injuries "                                          |
| `.toLowerCase()` deleted                      | 27 tests, the original "None", "N/A" and "No" among them |
| `\|injury[- ]free\|` removed from the pattern | "Injury-free", "injury free"                             |

- [ ] **Step 5: Coverage**

| Metric     | After C4    | After C5    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 4906 / 4962 | 4908 / 4964 | 98.8719 | 98.8  | 3.57  |
| Branches   | 3206 / 3414 | 3206 / 3414 | 93.9074 | 93.8  | 3.67  |
| Functions  | 1008 / 1017 | 1009 / 1018 | 99.1159 | 99.1  | 0.16  |
| Lines      | 4472 / 4494 | 4474 / 4496 | 99.5107 | 99.5  | 0.48  |

Two statements and lines and one function (`isNoInjuryAnswer`), covered. Tests 2432 → 2455.

- [ ] **Step 6: The after-capture and the compare** (as C3's Step 6, into `$SHOTS/c5-after`). Expected: `compare exit=0`, last line `identical`, as the scratch run printed (JavaScript only).

- [ ] **Step 7: Gates and PR.** Run the gates. `git push -u origin fix/no-injury-phrasings`; `gh pr create --draft --base main --title "fix(client): \"No injuries\" in the profile notes is not an injury note" --body-file "$SCRATCH/pr-c5.md"`. Outline: the owner item; the pattern, the normalising, and why anchored; what stays parked (keyword matching); the red run, mutations, coverage, compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task C6: Every `apiFetch` request has a deadline

**Branch:** `fix/api-fetch-timeout` (client track, after C5).

**The bug.** `useApiClient.js:41-61`'s `apiFetch`, which every write in the client goes through, calls `fetch` with no deadline, and so does `ensureCsrfToken`'s token fetch (`:27`). A server that accepts the connection and never answers leaves a save spinning, a generation spinning for good, and a logout waiting after its flush (Phase 3's C3b capped the flush at 5 s and left the request itself open, its "Not in this phase" table says). The dashboard's reads already have one: `app/network.js`'s `fetchWithTimeout` (15 s by default, 12 s as the dashboard calls it), which aborts and rejects with "Request timed out. Please try again."

**The fix (owner-approved: a default timeout with AbortController).** `apiFetch` sends through `fetchWithTimeout`, so the AbortController and the message are the ones the reads already use: 15 s by default (`API_TIMEOUT_MS`, network.js's own default), or the caller's `options.timeoutMs`, which is taken out of the options before they reach `fetch`. The token fetch gets the default too. Two callers name their own:

- **Plan generation**, `GENERATE_TIMEOUT_MS = 40000`. The server gives Gemini `GEMINI_TIMEOUT_MS` (30 s unless set) and answers 504 at it; the client waits that plus room for the save and the network, so the server's own 504, with its message, is what a slow generation shows. A deployment that raises `GEMINI_TIMEOUT_MS` past about 35 s has to raise this with it; the comment says so, and "Decisions for the owner" names the alternative.
- **Logout**, `LOGOUT_FLUSH_CAP_MS` (5 s), the cap its flush already has: the browser signs out whatever the answer, so there is no reason to wait longer for it. With S4 the server's worst case is about 4 s (two deletes at S3's 2 s deadline). A request that times out is a failed request, so C2's notice says the session may still be open, which is true.

Every handler already shows an error's message (`setError`, `setDashError`, `setAuthError`), so a timeout reads "Request timed out. Please try again." where its request's error would. No caller passes its own `signal` (`git grep -n "signal" -- client/src` finds only the reads that use plain `fetch`), so `fetchWithTimeout` replacing one costs nothing.

**Files:**

- Modify: `client/src/app/hooks/useApiClient.js` (header, import, `API_TIMEOUT_MS`, the doc comment, the token fetch, `apiFetch`)
- Modify: `client/src/app/network.js:1-4` (its header names its callers)
- Modify: `client/src/app/events.js` (`GENERATE_TIMEOUT_MS`; the two calls)
- Test: `client/src/app/hooks/__tests__/useApiClient.test.jsx` (four tests; one assertion loosened for the signal), `client/src/app/__tests__/events.test.js` (two tests; four logout assertions loosened to the method)

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/api-fetch-timeout origin/main
grep -n "fetch(" client/src/app/hooks/useApiClient.js
git grep -n "signal" -- client/src | grep -v __tests__
npm run build > "$SCRATCH/b-c6-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c6-before" > "$SCRATCH/c6-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c5-after" "$SHOTS/c6-before"; echo "chain exit=$?"
```

Expected: the two bare `fetch` calls; `signal` only in `network.js`, `useMealDbSearch.js` and `TipsView.jsx`; `identical`.

- [ ] **Step 2: The failing tests**

The hanging fetch ends only when its signal aborts, as a real one does; with no signal it never ends, which is the bug. Write `$SCRATCH/c6-tests.diff`:

```diff
--- a/client/src/app/hooks/__tests__/useApiClient.test.jsx
+++ b/client/src/app/hooks/__tests__/useApiClient.test.jsx
@@ -55,7 +55,10 @@
     const { current } = render();

     await expect(current.ensureCsrfToken()).resolves.toBe("issued-token");
-    expect(fetchMock).toHaveBeenCalledWith("/api/csrf-token", { credentials: "include" });
+    expect(fetchMock).toHaveBeenCalledWith(
+      "/api/csrf-token",
+      expect.objectContaining({ credentials: "include" })
+    );
   });

   // The endpoint sets the cookie as well as returning the token; the cookie is
@@ -267,4 +270,76 @@
       await expect(current.apiFetch("/api/dashboard")).rejects.toThrow("network down");
     });
   });
+
+  // A request the server never answers would leave its caller waiting for
+  // good: a save spinning, a sign-out that never finishes. Each one now gives
+  // up at a deadline, 15 s unless the caller names its own.
+  describe("a deadline", () => {
+    // A fetch that only ever ends by being aborted, as a real one does; with no
+    // signal to abort it, it never ends.
+    const hanging = () =>
+      vi.fn(
+        (_url, options) =>
+          new Promise((_resolve, reject) => {
+            options?.signal?.addEventListener("abort", () => {
+              const error = new Error("The operation was aborted.");
+              error.name = "AbortError";
+              reject(error);
+            });
+          })
+      );
+    const settledBy = async (promise, ms) => {
+      const outcome = promise.then(
+        () => "answered",
+        (error) => error.message
+      );
+      await vi.advanceTimersByTimeAsync(ms);
+      return Promise.race([outcome, Promise.resolve("still waiting")]);
+    };
+
+    beforeEach(() => {
+      vi.useFakeTimers();
+    });
+
+    afterEach(() => {
+      vi.useRealTimers();
+    });
+
+    test("gives up on a request the server never answers, at 15 s", async () => {
+      vi.stubGlobal("fetch", hanging());
+      const { current } = render();
+      const request = current.apiFetch("/api/dashboard");
+
+      expect(await settledBy(request, 14999)).toBe("still waiting");
+      expect(await settledBy(request, 1)).toBe("Request timed out. Please try again.");
+    });
+
+    test("waits as long as the caller asks", async () => {
+      vi.stubGlobal("fetch", hanging());
+      const { current } = render();
+      const request = current.apiFetch("/api/generate", { timeoutMs: 40000 });
+
+      expect(await settledBy(request, 39999)).toBe("still waiting");
+      expect(await settledBy(request, 1)).toBe("Request timed out. Please try again.");
+    });
+
+    test("gives up on the token fetch too", async () => {
+      vi.stubGlobal("fetch", hanging());
+      const { current } = render();
+      const request = current.apiFetch("/api/dashboard/meal-logs", { method: "POST" });
+
+      expect(await settledBy(request, 15000)).toBe("Request timed out. Please try again.");
+      expect(fetch).toHaveBeenCalledTimes(1);
+      expect(fetch.mock.calls[0][0]).toBe("/api/csrf-token");
+    });
+
+    test("does not hand timeoutMs on to fetch", async () => {
+      const { current } = render();
+
+      await current.apiFetch("/api/dashboard", { timeoutMs: 40000 });
+
+      expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("timeoutMs");
+      expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
+    });
+  });
 });
--- a/client/src/app/__tests__/events.test.js
+++ b/client/src/app/__tests__/events.test.js
@@ -121,7 +121,10 @@
     releaseFlush();
     await loggingOut;

-    expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
+    expect(deps.apiFetch).toHaveBeenCalledWith(
+      "/api/auth/logout",
+      expect.objectContaining({ method: "POST" })
+    );
   });

   // The wait is capped at LOGOUT_FLUSH_CAP_MS (5000 ms). A send that never
@@ -137,7 +140,10 @@
       expect(deps.apiFetch).not.toHaveBeenCalled();

       await vi.advanceTimersByTimeAsync(1);
-      expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
+      expect(deps.apiFetch).toHaveBeenCalledWith(
+        "/api/auth/logout",
+        expect.objectContaining({ method: "POST" })
+      );

       await loggingOut;
       expect(deps.clearOptimisticOperations).toHaveBeenCalledTimes(1);
@@ -154,7 +160,10 @@
     try {
       await build().onLogout();

-      expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
+      expect(deps.apiFetch).toHaveBeenCalledWith(
+        "/api/auth/logout",
+        expect.objectContaining({ method: "POST" })
+      );
       expect(vi.getTimerCount()).toBe(0);
     } finally {
       vi.useRealTimers();
@@ -164,7 +173,18 @@
   test("tells the server to end the session", async () => {
     await build().onLogout();

-    expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
+    expect(deps.apiFetch).toHaveBeenCalledWith(
+      "/api/auth/logout",
+      expect.objectContaining({ method: "POST" })
+    );
+  });
+
+  // The browser signs out whatever the answer, so the request gets the same
+  // cap as the flush before it, LOGOUT_FLUSH_CAP_MS.
+  test("waits no longer than 5 s for the server's answer", async () => {
+    await build().onLogout();
+
+    expect(deps.apiFetch.mock.calls[0][1].timeoutMs).toBe(5000);
   });

   test("clears the signed-in user and sends them home", async () => {
@@ -970,6 +990,16 @@
     expect(JSON.parse(options.body)).toEqual({ goal: "build muscle", days: 4 });
   });

+  // The server gives Gemini 30 s by default (GEMINI_TIMEOUT_MS), so the
+  // client's 15 s default would give up on every slow plan the server serves.
+  test("waits longer than the server's own generation deadline", async () => {
+    deps.apiFetch.mockResolvedValue(generated());
+
+    await build().onSubmit(submitEvent());
+
+    expect(deps.apiFetch.mock.calls[0][1].timeoutMs).toBe(40000);
+  });
+
   test("clears the previous result and error before starting", async () => {
     deps.apiFetch.mockResolvedValue(generated());

```

```bash
git apply "$SCRATCH/c6-tests.diff"
npm run test -w client -- src/app/hooks/__tests__/useApiClient.test.jsx src/app/__tests__/events.test.js src/app/__tests__/events.handlers.test.js src/__tests__/App.test.jsx > "$SCRATCH/c6-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |×|AssertionError" "$SCRATCH/c6-red.txt"
```

Expected: `exit=1`, `Tests  6 failed | 259 passed (265)`: the three hanging tests read `expected 'still waiting' to be 'Request timed out. Please try again.'` (no deadline anywhere); "does not hand timeoutMs on to fetch" reads `expected { timeoutMs: 40000, …(2) } to not have property "timeoutMs"`; the two `events.test.js` tests read `expected undefined to be 5000` and `40000`.

- [ ] **Step 3: The fix**

Write `$SCRATCH/c6-fix.diff`:

```diff
--- a/client/src/app/events.js
+++ b/client/src/app/events.js
@@ -18,6 +18,12 @@
 // still running when it passes may be lost: logout goes ahead without it.
 const LOGOUT_FLUSH_CAP_MS = 5000;

+// How long plan generation may take before the client gives up, in
+// milliseconds: the server's own deadline (GEMINI_TIMEOUT_MS, 30 s unless set)
+// plus room for the save and the network. A deployment that raises that
+// setting past about 35 s has to raise this with it.
+const GENERATE_TIMEOUT_MS = 40000;
+
 // Settles when `promise` does or after `ms`, whichever comes first, and clears
 // its timer either way, so a quick promise leaves no timer behind.
 const settleWithin = (promise, ms) => {
@@ -141,7 +147,8 @@
       const res = await apiFetch("/api/generate", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
-        body: JSON.stringify(form)
+        body: JSON.stringify(form),
+        timeoutMs: GENERATE_TIMEOUT_MS
       });

       if (!res.ok) {
@@ -338,7 +345,11 @@
     // without a CSRF token, both get here.
     let sessionEnded = false;
     try {
-      const res = await apiFetch("/api/auth/logout", { method: "POST" });
+      // Waited on no longer than the flush: the browser signs out either way.
+      const res = await apiFetch("/api/auth/logout", {
+        method: "POST",
+        timeoutMs: LOGOUT_FLUSH_CAP_MS
+      });
       sessionEnded = res.ok;
     } catch {
       // The cookie is HttpOnly and cannot be cleared from here, so the server
--- a/client/src/app/hooks/useApiClient.js
+++ b/client/src/app/hooks/useApiClient.js
@@ -1,18 +1,25 @@
 /**
  * The fetch every API write in the client goes through: it sends the session
- * cookie and adds the CSRF token. Called once, by App, which passes `apiFetch`
- * to createAppEventHandlers.
+ * cookie, adds the CSRF token and gives up at a deadline. Called once, by App,
+ * which passes `apiFetch` to createAppEventHandlers.
  */
 import { useCallback } from "react";
 import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../constants";
 import { readCookie } from "../cache";
+import { fetchWithTimeout } from "../network";
+
+// How long a request waits for an answer, in milliseconds, unless its caller
+// names `timeoutMs`: network.js's own default, which the dashboard's reads use.
+const API_TIMEOUT_MS = 15000;

 /**
  * Returns `apiFetch`, fetch with credentials included and, for any method other
  * than GET, HEAD or OPTIONS, the CSRF header set; and `ensureCsrfToken`, which
  * resolves the token, fetching one when no cookie holds it. Both are stable
  * across renders. `apiFetch` rejects before sending a write it has no token
- * for, or when fetching one fails.
+ * for, or when fetching one fails, and rejects with "Request timed out. Please
+ * try again." when the server has not answered within `options.timeoutMs`
+ * (API_TIMEOUT_MS by default), as does the token fetch.
  */
 export default function useApiClient() {
   // ---- CSRF token -----------------------------------------------------------
@@ -24,7 +31,7 @@
     if (existingToken) {
       return existingToken;
     }
-    const response = await fetch("/api/csrf-token", {
+    const response = await fetchWithTimeout("/api/csrf-token", {
       credentials: "include"
     });
     if (!response.ok) {
@@ -40,11 +47,12 @@
   // ---- Requests -------------------------------------------------------------
   const apiFetch = useCallback(
     async (url, options = {}) => {
-      const method = String(options?.method || "GET").toUpperCase();
-      const headers = new Headers(options?.headers || {});
+      const { timeoutMs = API_TIMEOUT_MS, ...requestOptions } = options;
+      const method = String(requestOptions.method || "GET").toUpperCase();
+      const headers = new Headers(requestOptions.headers || {});
       const nextOptions = {
-        ...options,
-        credentials: options?.credentials || "include",
+        ...requestOptions,
+        credentials: requestOptions.credentials || "include",
         headers
       };

@@ -55,7 +63,7 @@
         }
         headers.set(CSRF_HEADER_NAME, csrfToken);
       }
-      return fetch(url, nextOptions);
+      return fetchWithTimeout(url, nextOptions, timeoutMs);
     },
     [ensureCsrfToken]
   );
--- a/client/src/app/network.js
+++ b/client/src/app/network.js
@@ -1,6 +1,6 @@
 /**
  * fetch with a deadline, for the dashboard's reads (useDashboardData's and
- * useOlderLogPages') and App's session check.
+ * useOlderLogPages'), App's session check and every apiFetch request.
  */

 /**
```

```bash
git apply "$SCRATCH/c6-fix.diff"
npx prettier --write client/src/app/hooks/useApiClient.js client/src/app/network.js client/src/app/events.js client/src/app/hooks/__tests__/useApiClient.test.jsx client/src/app/__tests__/events.test.js
npm run test -w client -- src/app/hooks/__tests__/useApiClient.test.jsx src/app/__tests__/events.test.js src/app/__tests__/events.handlers.test.js src/__tests__/App.test.jsx > "$SCRATCH/c6-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c6-green.txt"
git add client/src
git commit -m "fix(client): every apiFetch request has a deadline" -m "apiFetch and its token fetch waited on a silent server for good. Both now go through network.js's fetchWithTimeout: 15 s by default, 40 s for plan generation (the server's 30 s Gemini deadline plus room), and logout's 5 s flush cap for the logout request." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, `Tests  265 passed (265)`.

**Comments.** `useApiClient.js`'s header and `apiFetch`'s doc comment say it gives up at a deadline and with what message; `API_TIMEOUT_MS` and `GENERATE_TIMEOUT_MS` each say where their number comes from; the logout call says why it shares the flush's cap. `network.js`'s header, which C1 gave App's session check, now names `apiFetch` as well. `LOGOUT_FLUSH_CAP_MS`'s own comment ("The longest logout waits for the sends it flushes") stays true; the doc comment on `createAppEventHandlers` names it for the flush, which it still is.

- [ ] **Step 4: Mutation checks**

| Mutation                                                                               | Caught by                                                                                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `fetchWithTimeout(url, nextOptions, timeoutMs)` → `fetchWithTimeout(url, nextOptions)` | "waits as long as the caller asks"                                                                                                   |
| the same → `fetch(url, nextOptions)`                                                   | "gives up on a request the server never answers, at 15 s", "waits as long as the caller asks", "does not hand timeoutMs on to fetch" |
| the token fetch back to `fetch`                                                        | "gives up on the token fetch too"                                                                                                    |
| `...requestOptions` → `...options` in `nextOptions`                                    | "does not hand timeoutMs on to fetch"                                                                                                |
| `API_TIMEOUT_MS = 15000` → `20000`                                                     | "gives up on a request the server never answers, at 15 s"                                                                            |
| `timeoutMs: GENERATE_TIMEOUT_MS` deleted                                               | "waits longer than the server's own generation deadline"                                                                             |
| `timeoutMs: LOGOUT_FLUSH_CAP_MS` deleted                                               | "waits no longer than 5 s for the server's answer"                                                                                   |

- [ ] **Step 5: Coverage**

| Metric     | After C5    | After C6    | %       | Floor | Slack |
| ---------- | ----------- | ----------- | ------- | ----- | ----- |
| Statements | 4908 / 4964 | 4911 / 4967 | 98.8726 | 98.8  | 3.60  |
| Branches   | 3206 / 3414 | 3207 / 3415 | 93.9092 | 93.8  | 3.73  |
| Functions  | 1009 / 1018 | 1009 / 1018 | 99.1159 | 99.1  | 0.16  |
| Lines      | 4474 / 4496 | 4477 / 4499 | 99.5110 | 99.5  | 0.49  |

Three statements and lines and the `timeoutMs` default's arm, covered. Tests 2455 → 2461.

- [ ] **Step 6: The after-capture and the compare** (as C3's Step 6, into `$SHOTS/c6-after`). Expected: `compare exit=0`, last line `identical`, as the scratch run printed (JavaScript only).

- [ ] **Step 7: Gates and PR.** Run the gates; the E2E suite drives sign-up, a workout and logout through `apiFetch` against a server that answers, so it must stay green. `git push -u origin fix/api-fetch-timeout`; `gh pr create --draft --base main --title "fix(client): every apiFetch request has a deadline" --body-file "$SCRATCH/pr-c6.md"`. Outline: the owner item; reusing `fetchWithTimeout`; the three deadlines and where each number comes from (and the GEMINI coupling); what a timeout shows; the red run, mutations, coverage, compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task C7: The walkthrough's copy of the personal form is one column on phones

**Branch:** `fix/walkthrough-form-one-column` (client track, after C6). CSS only.

**The bug.** Phase 4's K2 (`home/styles/responsive.css:135-137`) put the personal stage's form in one column under 720 px with `.home-stage-personal .personal-form`, and scoped it to the stage on purpose, leaving the walkthrough's read-only copy (`PreviewPersonalChapter.jsx:51`, `form personal-form advanced-mode preview-personal-form`) on `forms-and-motion.css:47-50`'s two-column advanced-mode grid. The same 720 px block puts each basic field in `grid-column: 1`, so on a 390 px phone Name, Age, Height, Weight and Sex each fill half the form, 132 px wide in a 280 px card, with the second column empty beside them: the cramped look K2 fixed on the stage, still on the walkthrough. Phase 4's table recorded it as an owner decision.

**The fix (owner-approved: one column on phones, proven by screenshot compare).** One more selector in K2's rule, `.preview-stage-panel .personal-form` (0,2,0): `.preview-stage-panel` is the walkthrough's panel (`PreviewStage.jsx:273`), which holds the form. It ties the 980 px `.personal-form.advanced-mode` and wins on order (forms-and-motion.css comes before responsive.css in `HomePage.css`), the same reasoning K2 recorded for its own selector. The block's comment, which said the walkthrough's copy keeps two columns, now says both go to one. The form's height does not change: the fields were already one to a row, in the first of two columns, and now take the whole width.

**Files:**

- Modify: `client/src/pages/home/styles/responsive.css:53-57` (the narrow-screen note) and `:135` (the selector)

- [ ] **Step 1: Branch, the before-capture, and today's columns**

```bash
git fetch origin && git switch -c fix/walkthrough-form-one-column origin/main
head -c 3 client/src/pages/home/styles/responsive.css | od -An -tx1
npm run build > "$SCRATCH/b-c7-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c7-before" > "$SCRATCH/c7-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c6-after" "$SHOTS/c7-before"; echo "chain exit=$?"
node "$TOOLS/props.mjs" "$SHOTS/c7-before/phone-preview-personal-info.styles.json.gz" "preview-personal-form$" grid-template-columns
```

Expected: `2f 2a 20` (no byte-order mark); `identical`; `grid-template-columns=132px 132px`.

- [ ] **Step 2: No failing test first.** CSS is not instrumented and jsdom computes no layout; the capture compare in Step 4 is the proof (spec rule 7).

- [ ] **Step 3: The edit**

Write `$SCRATCH/c7.diff`:

```diff
--- a/client/src/pages/home/styles/responsive.css
+++ b/client/src/pages/home/styles/responsive.css
@@ -51,10 +51,10 @@
 }

 /* ---- Narrow screens ------------------------------------------------------ */
-/* The personal stage's form goes to one column in both modes. Its selector names the stage,
-   to outrank styles/base.css's .form (which ties .personal-form and loads later) and
-   forms-and-motion.css's two-column advanced-mode rule. The walkthrough's copy of the form
-   keeps its two columns. */
+/* The personal stage's form, and the walkthrough's copy of it, go to one column in both
+   modes. Each selector names an ancestor, the stage's wrapper or the walkthrough's panel, to
+   outrank styles/base.css's .form (which ties .personal-form and loads later) and
+   forms-and-motion.css's two-column advanced-mode rule. */
 @media (max-width: 720px) {
   .home-page {
     width: 100%;
@@ -132,7 +132,8 @@
     justify-content: center;
   }

-  .home-stage-personal .personal-form {
+  .home-stage-personal .personal-form,
+  .preview-stage-panel .personal-form {
     grid-template-columns: 1fr;
   }

```

```bash
git apply "$SCRATCH/c7.diff"
npx prettier --write client/src/pages/home/styles/responsive.css
npm run build > "$SCRATCH/b-c7.txt" 2>&1; echo "build exit=$?"
grep -c "\.home-stage-personal \.personal-form,\.preview-stage-panel \.personal-form{grid-template-columns:1fr}" client/dist/assets/index-*.css
git grep -n "preview-stage-panel\|preview-personal-form" -- e2e/
git add client/src
git commit -m "fix(client): the walkthrough's personal form is one column on phones" -m "K2 stacked the personal stage's form under 720 px and left the walkthrough's copy on the two-column advanced-mode grid, so its fields filled half the card. One more selector in the same rule, naming the walkthrough's panel." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `build exit=0`; `1` (Lightning CSS keeps the two selectors on one rule, measured); no `e2e/` match.

- [ ] **Step 4: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/c7-after" > "$SCRATCH/c7-cap.txt" 2>&1; echo "capture exit=$?"
```

Write `$SHOTS/c7-expect.json`:

```json
[
  { "kind": "png", "captures": "^phone-preview-personal-info$" },
  {
    "kind": "style",
    "captures": "^phone-preview-personal-info$",
    "target": " form[.]form[.]personal-form[.]advanced-mode[.]preview-personal-form$",
    "prop": "^grid-template-columns$",
    "from": "132px 132px",
    "to": "280px"
  },
  {
    "kind": "style",
    "captures": "^phone-preview-generate$",
    "target": " form[.]form[.]personal-form[.]advanced-mode[.]preview-personal-form$",
    "prop": "^grid-template-columns$",
    "from": "161px 161px",
    "to": "338px"
  },
  {
    "kind": "style",
    "captures": "^phone-preview-(personal-info|generate)$",
    "prop": "^(width|inline-size|grid-template-columns|perspective-origin|transform-origin|left|inset-inline-start)$"
  },
  {
    "kind": "rect",
    "captures": "^phone-preview-(personal-info|generate)$",
    "target": "^[.](height-split|personal-form label)$"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/c7-before" "$SHOTS/c7-after" "$SHOTS/c7-expect.json" > "$SCRATCH/c7-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c7-cmp.txt"
```

Expected: `compare exit=0`, last line `159 difference(s); 0 unexpected; 0 expected but absent`, as the scratch run printed. All in two phone captures:

| Capture                       | Changes                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phone-preview-personal-info` | the PNG (45949 pixels); the form's `grid-template-columns` `132px 132px` → `280px`; Name, Age, Weight and Sex labels 132 → 280 px, the height label 149.56 → 280 px, the height pair's two fields `69.78px 69.78px` → `135px 135px`; the unit toggles' `left` follows; the `.personal-form label` and `.height-split` boxes widen at the same x and y |
| `phone-preview-generate`      | the same in computed style and boxes (`161px 161px` → `338px` there, where the form is laid out wider); no PNG change, because the form is collapsed into its label in that chapter                                                                                                                                                                   |

The two `grid-template-columns` changes are pinned exactly; the layout-derived properties (width, inline size, grid tracks, `left` and the two origins) may follow in those two captures only. No desktop or tablet capture changes (the rule is inside the 720 px block), the personal stage's own `phone-personal-advanced` does not change (K2 already stacked it), and no box moves down: the form's height is unchanged.

- [ ] **Step 5: Coverage unchanged** (client 4911 / 4967, 3207 / 3415, 1009 / 1018, 4477 / 4499, as after C6), **and the gates**. `git push -u origin fix/walkthrough-form-one-column`; `gh pr create --draft --base main --title "fix(client): the walkthrough's personal form is one column on phones" --body-file "$SCRATCH/pr-c7.md"`. Outline: the owner item and K2's scope; the selector and its specificity; before and after columns and the phone PNG; the compare's last line; coverage unchanged; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge. Keep `$SHOTS/c7-after` for C8.

---

### Task C8: Hover and press feedback stops moving under reduced motion

**Branch:** `fix/reduced-motion-hover-press` (client track, after C7). CSS only.

**The bug.** After Phase 4's M2, three controls still move under `prefers-reduced-motion: reduce`, all answering a hover or a press (Phase 4's motion table, rows "not in this phase"): the nav's Preview button and `/auth`'s close button, both `.home-page .ghost` (`core/shell.css:69-97`: a 2 px lift on hover and a press-in to 97 %, each over a 260 ms transition), and `/auth`'s login/sign-up toggle (`forms-and-motion.css:125-165`: a 1 px lift and the press-in, over 250 ms). Measured on `main` with `hover-probe.mjs` (Tools), under reduced motion: the Preview button hovers to `matrix(1, 0, 0, 1, 0, -2)` with `0.26s, 0.32s, 0.29s, 0.29s, 0.29s` of transitions, and presses to `matrix(0.97, 0, 0, 0.97, 0, 0)`. Nothing else reaches them: `.home-stage *` and `.auth-form *` (the two blanket blocks) do not contain the nav or the auth card's top row.

**The fix (owner-approved: stop it under reduced motion).** Two blocks, each beside the rules it stops, as CLAUDE.md's reduced-motion entry says this codebase does it:

- `core/shell.css`, after the white-button rules: under reduced motion `.home-page .ghost` and `.home-page .cta` have no transition, and their hover and press set `transform: none` at the same specificity, later in the file. The glow and colour still change on hover, at once. `.cta` is in the same rule as `.ghost`; it is included so `/plan`'s buttons (the one `.home-page` page with a `.cta` outside both blanket blocks) stop too (decision 6).
- `forms-and-motion.css`, after the toggle rules: the same for `.home-page .unit-toggle button` and `.home-page .segmented button`.

The pill sliding behind a toggle was already stopped by M2 (`core/shell.css:61-66`) and is unchanged. Without the preference, nothing changes: the eight `-motion` captures compare identical, and the probe reads the same lift and transitions as on `main`.

**Files:**

- Modify: `client/src/pages/home/styles/core/shell.css:104` (a block after `.home-page .ghost:disabled`)
- Modify: `client/src/pages/home/styles/forms-and-motion.css:166` (a block after the toggle `:active` rule)

- [ ] **Step 1: Branch, the before-capture, and the probe**

```bash
git fetch origin && git switch -c fix/reduced-motion-hover-press origin/main
head -c 3 client/src/pages/home/styles/core/shell.css | od -An -tx1; head -c 3 client/src/pages/home/styles/forms-and-motion.css | od -An -tx1
npm run build > "$SCRATCH/b-c8-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c8-before" > "$SCRATCH/c8-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c7-after" "$SHOTS/c8-before"; echo "chain exit=$?"
node "$TOOLS/hover-probe.mjs" D:/ai-workout > "$SCRATCH/c8-probe-before.txt" 2>&1; echo "probe exit=$?"; cat "$SCRATCH/c8-probe-before.txt"
```

Expected: `2f 2a 20` twice (no byte-order mark); `identical`; under both `reduce` and `no-preference`, every target hovers to a translate (`0, -2` for the two `.ghost` buttons, `0, -1` for the toggle) and presses to `matrix(0.97, 0, 0, 0.97, 0, 0)`, with its transitions listed.

- [ ] **Step 2: No failing test first.** CSS; the probe and the compare are the proof.

- [ ] **Step 3: The edit**

Write `$SCRATCH/c8.diff`:

```diff
--- a/client/src/pages/home/styles/core/shell.css
+++ b/client/src/pages/home/styles/core/shell.css
@@ -102,6 +102,23 @@
   box-shadow: none;
 }

+/* Under reduced motion these buttons change their glow at once on hover and press, and do
+   not lift or press in. That reaches the nav's Preview button and /auth's close button,
+   which no other reduced-motion block covers. */
+@media (prefers-reduced-motion: reduce) {
+  .home-page .ghost,
+  .home-page .cta {
+    transition: none;
+  }
+
+  .home-page .ghost:hover:not(:disabled),
+  .home-page .cta:hover:not(:disabled),
+  .home-page .ghost:active:not(:disabled),
+  .home-page .cta:active:not(:disabled) {
+    transform: none;
+  }
+}
+
 /* ---- Page title and text colours ----------------------------------------- */
 /* The home page renders no .title, so this styles AuthPage's and WorkoutResultPage's. */
 .home-page .title {
--- a/client/src/pages/home/styles/forms-and-motion.css
+++ b/client/src/pages/home/styles/forms-and-motion.css
@@ -164,6 +164,23 @@
   transform: scale(0.97);
 }

+/* Under reduced motion the toggle buttons change colour at once and do not lift or press
+   in; core/shell.css stops the pill behind them. That reaches /auth's login/sign-up toggle,
+   which sits outside .home-stage and .auth-form and so outside their blocks. */
+@media (prefers-reduced-motion: reduce) {
+  .home-page .unit-toggle button,
+  .home-page .segmented button {
+    transition: none;
+  }
+
+  .home-page .segmented button:hover,
+  .home-page .unit-toggle button:hover,
+  .home-page .segmented button:active,
+  .home-page .unit-toggle button:active {
+    transform: none;
+  }
+}
+
 /* ---- Toggle pop keyframes ------------------------------------------------ */
 @keyframes toggle-pop {
   0% {
```

```bash
git apply "$SCRATCH/c8.diff"
npx prettier --write client/src/pages/home/styles/core/shell.css client/src/pages/home/styles/forms-and-motion.css
npm run build > "$SCRATCH/b-c8.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/hover-probe.mjs" D:/ai-workout > "$SCRATCH/c8-probe-after.txt" 2>&1; echo "probe exit=$?"; cat "$SCRATCH/c8-probe-after.txt"
git add client/src
git commit -m "fix(client): hover and press feedback stops moving under reduced motion" -m "The nav's Preview button, /auth's close button and its login/sign-up toggle still lifted on hover and pressed in under prefers-reduced-motion: reduce, because no reduced-motion block reached them. Each rule now has one beside it: no transition, and no transform on hover or press. The glow and colour still change, at once." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected, the probe after: under `reduce`, every target reads `none | 0s` hovered and pressed; under `no-preference`, exactly what it read before (as the scratch run printed for both).

- [ ] **Step 4: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/c8-after" > "$SCRATCH/c8-cap.txt" 2>&1; echo "capture exit=$?"
```

Write `$SHOTS/c8-expect.json`:

```json
[
  {
    "kind": "style",
    "captures": "^(desktop|phone)-(intro|personal|personal-advanced|visualizer|preview-(result|dashboard|generate|scrolled))$|^tablet-personal-advanced$",
    "target": " button[.]ghost[.]home-preview-btn$",
    "prop": "^transition-property$",
    "from": "transform, box-shadow, background-color, border-color, color",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-auth-(login|signup)$",
    "target": " button[.]ghost[.]icon-button[.]auth-close$",
    "prop": "^transition-property$",
    "from": "transform, box-shadow, background-color, border-color, color",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-auth-(login|signup)$",
    "target": "/section\\[1\\]/div\\[1\\]/div\\[1\\]/button\\[[12]\\] button([.]active)?$",
    "prop": "^transition-property$",
    "from": "color, transform",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone|tablet)-(intro|personal|personal-advanced|visualizer|preview-(result|dashboard|generate|scrolled)|auth-(login|signup))$",
    "target": " button[.]ghost[.]home-preview-btn$| button[.]ghost[.]icon-button[.]auth-close$|/section\\[1\\]/div\\[1\\]/div\\[1\\]/button\\[[12]\\] button([.]active)?$",
    "prop": "^transition-(property|duration|timing-function|delay|behavior)$"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/c8-before" "$SHOTS/c8-after" "$SHOTS/c8-expect.json" > "$SCRATCH/c8-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/c8-cmp.txt"
```

Expected: `compare exit=0`, last line `145 difference(s); 0 unexpected; 0 expected but absent`, as the scratch run printed. Every difference is one of the five transition longhands (`transition-property`, `-duration`, `-timing-function`, `-delay`, `-behavior`), on:

| Element                                | Captures                                                                                                                                                                                            | `transition-property`                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| the nav's Preview button               | the 17 home and walkthrough states (desktop and phone `intro`, `personal`, `personal-advanced`, `visualizer`, `preview-result`, `-dashboard`, `-generate`, `-scrolled`; tablet `personal-advanced`) | `transform, box-shadow, background-color, border-color, color` → `none` |
| `/auth`'s close button                 | desktop and phone `auth-login`, `auth-signup`                                                                                                                                                       | the same                                                                |
| the login/sign-up toggle's two buttons | the same four                                                                                                                                                                                       | `color, transform` → `none`                                             |

No PNG changes (nothing is hovered in a capture), no box moves, no `-motion` capture changes, and `preview-personal-info`, captured without the preference, does not change either. The three transition-property changes are pinned exactly; the other four longhands may follow on those elements only.

- [ ] **Step 5: Coverage unchanged** (as after C7), **and the gates**; the axe scans must still report zero violations. `git push -u origin fix/reduced-motion-hover-press`; `gh pr create --draft --base main --title "fix(client): hover and press feedback stops moving under reduced motion" --body-file "$SCRATCH/pr-c8.md"`. Outline: the owner item and Phase 4's table; the probe before and after; the two blocks and why beside their rules; `.cta` (decision 6); the compare's last line; coverage unchanged; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task C9: Delete the walkthrough profile's two fields nothing reads

**Branch:** `chore/delete-unread-preview-profile-fields` (client track, after C8). The first of the two client deletions (rule 5).

**What goes.** `JOHN_DOE_PREVIEW_PROFILE.bodyFat` (`home/preview/constants.js:30`) and `.personalComplete` (`:45`). The profile is read in exactly one place, `usePreviewDerivedData.js:102-134`, which spreads it into `activePreviewProfile` and then names the fields it uses; neither of these is among them, and nothing reads them off `activePreviewProfile` either (`activePreviewProfile` is used only inside the hook). Phase 5's C3 deleted the body-fat derivation that once read `bodyFat`, and `personalComplete` was flagged unread in #186. Checked:

```bash
git grep -n "personalComplete" -- client server e2e
git grep -n "JOHN_DOE_PREVIEW_PROFILE\|activePreviewProfile" -- client/src | grep -v "usePreviewDerivedData.js:"
git grep -n "activePreviewProfile\.\(bodyFat\|personalComplete\)\|JOHN_DOE\.\(bodyFat\|personalComplete\)\|18\.4" -- client/src
```

Expected: `personalComplete` only at `constants.js:45`; the profile's only other mentions are its import and the hook's test, which reads `JOHN_DOE.name`, `.equipment`, `.focuses`, `.trainingDays`, `.duration`, `.environment` and `.goal`, never these two and never the whole object; `18.4` only in `constants.js:30` and in `SettingsView.test.jsx`, where it is a separate fixture's body fat.

**No failing test first.** A deletion of data no code reads; the suite is the proof.

**Files:**

- Modify: `client/src/pages/home/preview/constants.js:30, 44-45`

- [ ] **Step 1: Branch, the before-capture, and the greps above**

```bash
git fetch origin && git switch -c chore/delete-unread-preview-profile-fields origin/main
npm run build > "$SCRATCH/b-c9-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c9-before" > "$SCRATCH/c9-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c8-after" "$SHOTS/c9-before"; echo "chain exit=$?"
```

- [ ] **Step 2: The edit**

Write `$SCRATCH/c9.diff`:

```diff
--- a/client/src/pages/home/preview/constants.js
+++ b/client/src/pages/home/preview/constants.js
@@ -27,7 +27,6 @@
   sex: "Male",
   heightCm: 183,
   weightKg: 84,
-  bodyFat: 18.4,
   activity: "Moderate",
   sleep: "7 - 8 hours",
   timeline: "12 weeks to build lean strength",
@@ -41,8 +40,7 @@
   duration: "50",
   environment: "Commercial",
   equipment: ["Full gym access"],
-  focuses: ["Strength", "Conditioning", "Core"],
-  personalComplete: true
+  focuses: ["Strength", "Conditioning", "Core"]
 };

 // The personal chapter's select menus, which the walkthrough sets whole instead
```

```bash
git apply "$SCRATCH/c9.diff"
npx prettier --write client/src/pages/home/preview/constants.js
npm run test -w client -- src/pages/home > "$SCRATCH/c9-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c9-tests.txt"
git add client/src
git commit -m "chore(client): delete the walkthrough profile's two unread fields" -m "JOHN_DOE_PREVIEW_PROFILE.bodyFat and .personalComplete are spread into activePreviewProfile and never read there or anywhere else." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

**Comments.** The profile's comment ("The sample visitor. usePreviewDerivedData takes from here each field the visitor's profile and planner form leave empty.") stays true. CLAUDE.md does not name either field.

- [ ] **Step 3: Coverage, compare, gates, PR.** Coverage is unchanged, by measurement: 4911 / 4967, 3207 / 3415, 1009 / 1018, 4477 / 4499, 2461 tests, the counts after C6 (object literal properties are not instrumented). The compare against `$SHOTS/c9-before` must print `identical`: the scratch run printed `identical` (a `NOISE` line of 10 px on one loading capture, as in C1). Then the gates. `git push -u origin chore/delete-unread-preview-profile-fields`; `gh pr create --draft --base main --title "chore(client): delete the walkthrough profile's two unread fields" --body-file "$SCRATCH/pr-c9.md"`. Outline: the greps and their results; counts unchanged; the compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task C10: `usePreviewDerivedData.js`'s eighteen fallbacks that cannot fire

**Branch:** `chore/preview-derived-dead-fallbacks` (client track, last). The second client deletion.

**What was traced.** On `main` the file has 33 uncovered branch arms (187 / 220). Fifteen are the `String(x ?? "")` block that builds `previewPersonalTargets` (`:442-458`), which CLAUDE.md already records as unreachable and this task leaves alone. The other eighteen, with each one's producer:

| Arms (line on `main`)                   | The fallback                                                                                                      | Why it cannot fire                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (`:247`)                              | `trainingDays.length \|\| 4`                                                                                      | `previewWeekPlan` tops its training days up to `targetWorkoutDays = clamp(max(set.size, days, PREVIEW_WEEK_MIN_WORKOUT_DAYS), 1, 7)`, and `PREVIEW_WEEK_MIN_WORKOUT_DAYS` is 5 (`constants.js:159`), so `trainingDays.length` is at least 5, never 0                                                                                                                              |
| 1 (`:296`)                              | `find(… === todayName) \|\| previewWeekPlan[0]`                                                                   | `previewWeekPlan` is `PREVIEW_WEEK_DAY_ORDER.map(…)`, one entry per day in order, and `getPreviewWeekdayName` (`preview/utils.js:59-64`) only ever returns a member of `PREVIEW_WEEK_DAY_ORDER`, so the find always succeeds                                                                                                                                                      |
| 1 each (`:297`, `:302`, `:306`, `:402`) | `todayPlan?.workout \|\| ""`, `?.meta \|\| "50 min"`, `?.day \|\| todayName`, `?.session \|\| "Training Session"` | every entry has a non-empty `day`, `session`, `workout` and `meta`: rest days get fixed strings, training days `TRAINING_TEMPLATES[i]`, `TRAINING_EXERCISE_TEMPLATES[i]` and `` `${sessionDuration} - ${environmentLabel}` ``                                                                                                                                                     |
| 3 and the statement (`:316`)            | `if (!nextTrainingPlan) … = trainingDays[0] \|\| previewWeekPlan[0]`                                              | the walk tries offsets 1 to 7, which come back round to today, so it visits every day, and the plan always holds at least one training day                                                                                                                                                                                                                                        |
| 2 (`:354`)                              | `bestStreak \|\| completedWorkouts \|\| 1`                                                                        | a plan with a training day has a run of at least 1                                                                                                                                                                                                                                                                                                                                |
| 1 (`:359`)                              | `dayPlan.meta \|\| "50 min"`                                                                                      | as the four above                                                                                                                                                                                                                                                                                                                                                                 |
| 6 (`:370-376`)                          | `daysToGoal`'s `: null`, and the pace text's "At this pace…" (with its plural) and "Log a workout…"               | `completedWorkouts = clamp(trainingDays.length, 0, weeklyGoal)` and `trainingDays.length >= weeklyGoal` (both read the same `days`, the plan's target is the larger of it and 5, and both clamp to 7), so `remainingWorkouts` is always 0 and `avgDailyWorkouts` always positive: the text is always "Weekly workout goal reached.", which the summary's own comment already says |

**The proof, two ways, as CLAUDE.md asks.** The arithmetic is above. Mechanically, as a deliberate survivor: all twelve fallback expressions replaced at once with sentinels (`|| 999`, `|| null`, `"SENTINEL"`, a sentinel next-plan object, the pace strings), on the scratch copy after C9, and the whole client suite passes, 2461 of 2461; then the home suites (`src/pages/home`, 667 tests) again under a `NODE_OPTIONS=--import` preload that moves the clock one to six days on, so every weekday is today once: all pass. The walk to the next training day is the one fallback that depends on the date, which is why the sweep is part of the proof (CLAUDE.md's coverage entry on the weekday-dependent arm).

**The fix (owner-approved: delete the ones that provably cannot fire).** Each fallback goes, and the code says why it is not needed: today's entry is read by index (`previewWeekPlan[todayIndex]`, `todayIndex` from `PREVIEW_WEEK_DAY_ORDER.indexOf(todayName)`), which is what the construction guarantees; the `?.` and the `String(… || …)` around its fields go; the closing `if (!nextTrainingPlan)` goes; the streak is `Math.min(bestStreak, weeklyGoal)`; the pace text is the one string it can be. The comments that state the invariants now carry them. **None of the eighteen is reachable, so there is nothing to cover with a test.** The fifteen `String(x ?? "")` arms stay, as CLAUDE.md decided.

**Files:**

- Modify: `client/src/pages/home/preview/hooks/usePreviewDerivedData.js:241-250, 291-316, 342-376, 379, 402`

- [ ] **Step 1: Branch, the before-capture, and the arms**

```bash
git fetch origin && git switch -c chore/preview-derived-dead-fallbacks origin/main
npm run build > "$SCRATCH/b-c10-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c10-before" > "$SCRATCH/c10-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c9-after" "$SHOTS/c10-before"; echo "chain exit=$?"
npm run test:coverage -w client -- --coverage.reporter=json --coverage.reporter=json-summary > "$SCRATCH/c10-cov0.txt" 2>&1; echo "exit=$?"
node -e 'const c=Object.entries(require("./client/coverage/coverage-final.json")).find(([p])=>p.endsWith("usePreviewDerivedData.js"))[1];let u=0,t=0;for(const[id,arms]of Object.entries(c.b))arms.forEach((n,i)=>{t++;if(!n){u++;console.log(c.branchMap[id].loc.start.line,c.branchMap[id].type,i)}});console.log(`${t-u}/${t}`)'
```

Expected: `identical`; 33 uncovered arms listed, `187/220`, the eighteen of the table and the fifteen at lines 442-458.

- [ ] **Step 2: The deliberate survivors.** Write `$SCRATCH/c10-survivors.json` (twelve edits, one per fallback expression, each replacing the fallback with a sentinel; Tools' `mutate.mjs` applies them in order) and run the suite and the weekday sweep:

```json
[
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "Math.round(requestedGoalDays) : trainingDays.length || 4,",
    "text": "Math.round(requestedGoalDays) : trainingDays.length || 999,"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "previewWeekPlan.find((item) => item.day === todayName) || previewWeekPlan[0];",
    "text": "previewWeekPlan.find((item) => item.day === todayName) || null;"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "String(todayPlan?.workout || \"\")",
    "text": "String(todayPlan?.workout || \"SENTINEL - A - B\")"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "String(todayPlan?.meta || \"50 min\")",
    "text": "String(todayPlan?.meta || \"SENTINEL\")"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "PREVIEW_WEEK_DAY_ORDER.indexOf(todayPlan?.day || todayName)",
    "text": "PREVIEW_WEEK_DAY_ORDER.indexOf(todayPlan?.day || \"SENTINEL\")"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "if (!nextTrainingPlan) nextTrainingPlan = trainingDays[0] || previewWeekPlan[0];",
    "text": "if (!nextTrainingPlan) nextTrainingPlan = { day: \"SENTINEL\" };"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "Math.min(bestStreak || completedWorkouts || 1, weeklyGoal)",
    "text": "Math.min(bestStreak || 999, weeklyGoal)"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "duration: String(dayPlan.meta || \"50 min\")",
    "text": "duration: String(dayPlan.meta || \"SENTINEL\")"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "avgDailyWorkouts > 0 ? Math.ceil(remainingWorkouts / avgDailyWorkouts) : null;",
    "text": "avgDailyWorkouts > 0 ? Math.ceil(remainingWorkouts / avgDailyWorkouts) : \"SENTINEL\";"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "? `At this pace, ${daysToGoal} day${daysToGoal === 1 ? \"\" : \"s\"} to reach ${weeklyGoal} workouts.`",
    "text": "? `SENTINEL ${daysToGoal === 1 ? \"one\" : \"many\"}`"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": ": \"Log a workout to start your pace estimate.\";",
    "text": ": \"SENTINEL\";"
  },
  {
    "file": "client/src/pages/home/preview/hooks/usePreviewDerivedData.js",
    "find": "String(todayPlan?.session || \"Training Session\")",
    "text": "String(todayPlan?.session || \"SENTINEL\")"
  }
]
```

Write `$TOOLS/shift-date.mjs`:

<!-- prettier-ignore -->
```js
/**
 * A NODE_OPTIONS=--import preload that moves the real clock by SHIFT_DAYS days:
 * `new Date()` and `Date.now()` read the shifted time; a Date built from an
 * argument is unchanged. Usage: NODE_OPTIONS="--import file:///.../shift-date.mjs" SHIFT_DAYS=3 ...
 */
const shiftMs = Number(process.env.SHIFT_DAYS || 0) * 86400000;
const RealDate = Date;
class ShiftedDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + shiftMs);
    else super(...args);
  }
  static now() {
    return RealDate.now() + shiftMs;
  }
}
globalThis.Date = ShiftedDate;
```

```bash
node "$TOOLS/mutate.mjs" "$SCRATCH/c10-survivors.json"
npm run test -w client > "$SCRATCH/c10-surv.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c10-surv.txt"
P="file:///$(cygpath -m "$TOOLS/shift-date.mjs")"
for d in 1 2 3 4 5 6; do SHIFT_DAYS=$d NODE_OPTIONS="--import $P" npm run test -w client -- src/pages/home > "$SCRATCH/c10-surv-$d.txt" 2>&1; echo "shift $d exit=$?"; grep -E "Tests  " "$SCRATCH/c10-surv-$d.txt"; done
git checkout -- client/src; git status --porcelain
```

Expected: `exit=0`, `Tests  2461 passed (2461)`; six `exit=0`, each `Tests  667 passed (667)`; an empty status. Every fallback survives: nothing any test can reach depends on it, on any weekday. (Check the preload took: `SHIFT_DAYS=3 NODE_OPTIONS="--import $P" node -e 'console.log(new Date().toDateString())'` prints three days on.)

- [ ] **Step 3: The deletion**

Write `$SCRATCH/c10.diff`:

```diff
--- a/client/src/pages/home/preview/hooks/usePreviewDerivedData.js
+++ b/client/src/pages/home/preview/hooks/usePreviewDerivedData.js
@@ -239,12 +239,13 @@
   const previewDashboardSummary = useMemo(() => {
     // ---- The weekly goal and the workouts done ------------------------------
     // Every planned training day counts as done, and the plan always holds at
-    // least as many as the goal, so progress is always full and the pace text
-    // below always says the goal is reached.
+    // least as many as the goal, and at least PREVIEW_WEEK_MIN_WORKOUT_DAYS, so
+    // progress is always full and the pace text below is always the goal
+    // reached.
     const trainingDays = previewWeekPlan.filter((item) => item.isTraining);
     const requestedGoalDays = Number(activePreviewProfile.days);
     const weeklyGoal = clamp(
-      Number.isFinite(requestedGoalDays) ? Math.round(requestedGoalDays) : trainingDays.length || 4,
+      Number.isFinite(requestedGoalDays) ? Math.round(requestedGoalDays) : trainingDays.length,
       1,
       PREVIEW_WEEK_DAY_ORDER.length
     );
@@ -290,30 +291,31 @@

     // ---- Today and the next session -----------------------------------------
     // Today is the real weekday when the summary is built; nothing rebuilds it
-    // at midnight. The next session is the first training day after today,
-    // going round the week.
+    // at midnight. previewWeekPlan holds one entry per day of
+    // PREVIEW_WEEK_DAY_ORDER, in that order, each with its session, workout and
+    // meta filled in, and getPreviewWeekdayName always names one of those days,
+    // so today's entry is the one at today's index. The next session is the
+    // first training day after today, going round the week: offsets 1 to 7 come
+    // back to today, and the plan always holds training days, so one is found.
     const todayName = getPreviewWeekdayName(new Date());
-    const todayPlan = previewWeekPlan.find((item) => item.day === todayName) || previewWeekPlan[0];
-    const todayWorkoutLines = String(todayPlan?.workout || "")
+    const todayIndex = PREVIEW_WEEK_DAY_ORDER.indexOf(todayName);
+    const todayPlan = previewWeekPlan[todayIndex];
+    const todayWorkoutLines = todayPlan.workout
       .split(" - ")
       .map((line) => line.trim())
       .filter(Boolean)
       .slice(0, 3);
-    const todayDuration = String(todayPlan?.meta || "50 min")
-      .split(" - ")[0]
-      .trim();
+    const todayDuration = todayPlan.meta.split(" - ")[0].trim();

-    const todayIndex = Math.max(0, PREVIEW_WEEK_DAY_ORDER.indexOf(todayPlan?.day || todayName));
     let nextTrainingPlan = null;
     for (let offset = 1; offset <= PREVIEW_WEEK_DAY_ORDER.length; offset += 1) {
       const nextIndex = (todayIndex + offset) % PREVIEW_WEEK_DAY_ORDER.length;
       const candidate = previewWeekPlan[nextIndex];
-      if (candidate?.isTraining) {
+      if (candidate.isTraining) {
         nextTrainingPlan = candidate;
         break;
       }
     }
-    if (!nextTrainingPlan) nextTrainingPlan = trainingDays[0] || previewWeekPlan[0];

     // ---- Trend series, a value per day of the week --------------------------
     // Calories 2% over the goal on training days and 10% under it on rest days,
@@ -340,7 +342,8 @@

     // ---- Streak, recent activity, the overview's settings and the pace ------
     // The streak is the longest run of training days from Monday to Sunday,
-    // not wrapping round, held between 1 and the weekly goal.
+    // not wrapping round, held to the weekly goal. The plan always holds a
+    // training day, so it is at least 1.
     let runningStreak = 0;
     let bestStreak = 0;
     previewWeekPlan.forEach((dayPlan) => {
@@ -351,32 +354,22 @@
         runningStreak = 0;
       }
     });
-    const streakDays = Math.max(1, Math.min(bestStreak || completedWorkouts || 1, weeklyGoal));
+    const streakDays = Math.min(bestStreak, weeklyGoal);

     const recentActivity = trainingDays.slice(0, 4).map((dayPlan) => ({
       day: dayPlan.day,
       session: dayPlan.session,
-      duration: String(dayPlan.meta || "50 min")
-        .split(" - ")[0]
-        .trim()
+      duration: dayPlan.meta.split(" - ")[0].trim()
     }));
     const focusPicks = activePreviewProfile.focuses.slice(0, 3);
     const environmentText = String(activePreviewProfile.environment);
     const equipmentList = activePreviewProfile.equipment.slice(0, 3);
     const scheduleText = `${weeklyGoal} days - ${Number(activePreviewProfile.duration) || 50} min`;
-    const avgDailyWorkouts = completedWorkouts / 7;
-    const remainingWorkouts = Math.max(weeklyGoal - completedWorkouts, 0);
-    const daysToGoal =
-      avgDailyWorkouts > 0 ? Math.ceil(remainingWorkouts / avgDailyWorkouts) : null;
-    const goalPaceText =
-      remainingWorkouts === 0
-        ? "Weekly workout goal reached."
-        : avgDailyWorkouts > 0
-          ? `At this pace, ${daysToGoal} day${daysToGoal === 1 ? "" : "s"} to reach ${weeklyGoal} workouts.`
-          : "Log a workout to start your pace estimate.";
+    // Always the goal reached: see the weekly goal above.
+    const goalPaceText = "Weekly workout goal reached.";

     // ---- Today's meals: a training-day menu or a rest-day one ---------------
-    const mealPlan = todayPlan?.isTraining
+    const mealPlan = todayPlan.isTraining
       ? {
           breakfast: "Greek yogurt + oats + berries",
           lunch: "Chicken rice bowl with mixed greens",
@@ -399,7 +392,7 @@
       equipmentList,
       focusPicks,
       todayName,
-      todaySession: String(todayPlan?.session || "Training Session"),
+      todaySession: todayPlan.session,
       todayDuration,
       todayWorkoutLines,
       todayMealPlan: mealPlan,
```

```bash
git apply "$SCRATCH/c10.diff"
npx prettier --write client/src/pages/home/preview/hooks/usePreviewDerivedData.js
npm run test -w client -- src/pages/home > "$SCRATCH/c10-tests.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c10-tests.txt"
for d in 1 2 3 4 5 6; do SHIFT_DAYS=$d NODE_OPTIONS="--import $P" npm run test -w client -- src/pages/home/preview > "$SCRATCH/c10-sweep-$d.txt" 2>&1; echo "shift $d exit=$?"; done
git add client/src
git commit -m "chore(client): delete usePreviewDerivedData's eighteen fallbacks that cannot fire" -m "Each guarded a week-plan entry, a training day or a pace the plan's construction already guarantees: one entry per weekday with every field filled, at least five training days, and the goal always met. Proved by arithmetic and as deliberate survivors across all seven weekdays; today's entry is now read by index." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`, the same counts as before the deletion; six `exit=0` (the scratch run: 366 passed on each day).

**Comments.** The weekly goal's comment adds the minimum of five that makes the pace text constant; the "Today and the next session" comment states the two invariants the index read and the walk rely on; the streak's comment says why it is at least 1; the pace line points at the goal's comment. CLAUDE.md's coverage entry says "The file's other uncovered arms are `||` and `?:` fallbacks on the derived week and dashboard figures (`todayPlan?.workout || ""` and the like)": that becomes untrue here and is Task R's (rule 6).

- [ ] **Step 4: Coverage**

| Metric     | After C9 (= C6) | After C10   | %       | Floor | Slack |
| ---------- | --------------- | ----------- | ------- | ----- | ----- |
| Statements | 4911 / 4967     | 4906 / 4961 | 98.8914 | 98.8  | 4.53  |
| Branches   | 3207 / 3415     | 3196 / 3386 | 94.3887 | 93.8  | 19.93 |
| Functions  | 1009 / 1018     | 1008 / 1017 | 99.1150 | 99.1  | 0.15  |
| Lines      | 4477 / 4499     | 4473 / 4495 | 99.5106 | 99.5  | 0.48  |

The file goes from 193 / 194 statements, 187 / 220 branches, 31 / 31 functions and 172 / 172 lines to 188 / 188, 176 / 191, 30 / 30 and 168 / 168: 29 arms go, the eighteen uncovered and eleven covered ones beside them; one uncovered statement and five covered go; the `find` callback, a covered function, goes. The fifteen arms left uncovered are the `String(x ?? "")` block. Tests unchanged at 2461.

- [ ] **Step 5: Compare, gates, PR.** The compare against `$SHOTS/c10-before` must print `identical`: the scratch run printed `identical` (a `NOISE` line of 10 px on one loading capture, as in C1). Then the gates. `git push -u origin chore/preview-derived-dead-fallbacks`; `gh pr create --draft --base main --title "chore(client): delete usePreviewDerivedData's eighteen fallbacks that cannot fire" --body-file "$SCRATCH/pr-c10.md"`. Outline: the trace table; the survivors run and the weekday sweep; the deletion; the coverage table; the compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. The quality review should re-derive the table's invariants from the code. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Closing

### Task F: The floor PR, both sides

**Branch:** `chore/open-items-floors`. Modelled on Phase 5's D3: one PR for both configs, once both tracks have merged **and Dependabot's #252 has**, from the `main` they leave (#252 moves `vitest` and `@vitest/coverage-v8` from 5.0.3 to 5.0.5, the tool that does the counting, so the floors are measured on the version that will enforce them). Rule 3: re-measure `main`, raise each floor whose truncated measurement went up, update the notes; never lower one.

**Expected measurement** (the cumulative scratch runs: the server tree after S1 to S8, the client tree after C1 to C10; on Vitest 5.0.3, before #252):

| Side   | Metric     | Covered / total | %       | Note figure | Floor now | Floor after | Spare after |
| ------ | ---------- | --------------- | ------- | ----------- | --------- | ----------- | ----------- |
| Client | Statements | 4906 / 4961     | 98.8914 | 98.89       | 98.8      | 98.8        | 4.53        |
| Client | Branches   | 3196 / 3386     | 94.3887 | 94.38       | 93.8      | **94.3**    | 3.00        |
| Client | Functions  | 1008 / 1017     | 99.1150 | 99.11       | 99.1      | 99.1        | 0.15        |
| Client | Lines      | 4473 / 4495     | 99.5106 | 99.51       | 99.5      | 99.5        | 0.48        |
| Server | Statements | 2286 / 2402     | 95.1707 | 95.17       | 95.1      | 95.1        | 1.70        |
| Server | Branches   | 1665 / 1884     | 88.3758 | 88.37       | 88.2      | **88.3**    | 1.43        |
| Server | Functions  | 382 / 397       | 96.2217 | 96.22       | 96.2      | 96.2        | 0.09        |
| Server | Lines      | 2054 / 2134     | 96.2512 | 96.25       | 96.2      | 96.2        | 1.09        |

Client tests 2461, server 1208. Two floors are expected to rise: client branches 93.8 → 94.3 (C10's deletion of eighteen unreachable arms does most of it) and server branches 88.2 → 88.3. The server's branch figure is the one with `client/dist` present, as its note requires.

**Files:**

- Modify: `client/vite.config.js:70-77` (the note and `thresholds`)
- Modify: `server/vitest.config.js:29-43` (the note and `thresholds`)

- [ ] **Step 1: Measure `main`, locally and in CI**

```bash
git fetch origin && git switch -c chore/open-items-floors origin/main
git log --oneline -1 --grep "minor-and-patch" origin/main
npm ci > "$SCRATCH/ci-floor.txt" 2>&1; echo "npm ci exit=$?"
npm run prisma:generate -w server > "$SCRATCH/prisma-floor.txt" 2>&1; echo "prisma exit=$?"
npm run build > "$SCRATCH/build-floor.txt" 2>&1; echo "build exit=$?"
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-floor.txt" 2>&1; echo "client exit=$?"
npm run test:coverage -w server -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/sc-floor.txt" 2>&1; echo "server exit=$?"
node "$TOOLS/counts.mjs" . client; node "$TOOLS/counts.mjs" . server
grep -E "Tests  " "$SCRATCH/cc-floor.txt" "$SCRATCH/sc-floor.txt"
```

Expected: #252's merge commit found (if not, stop: it merges first); every `exit=0`; the counts in the table, unless #252's coverage bump moved them, in which case floor from what this step prints, not from the table. Run the server line twice: a figure that moves between runs of the same code is a test bug to find first. Then measure the server once more with `client/dist` moved aside (`mv client/dist "$SCRATCH/dist-aside"`, measure, `mv` it back), for the note's second figure (expected one branch higher, as on `main`, where it reads 1653 against 1652). Then read the last green CI run on `main` for both coverage jobs on Node 22 and 24: `gh run list --branch main --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId'`, then `gh run view <id> --log | grep -E "All files"`. Where CI and local differ, floor from the lower.

- [ ] **Step 2: Raise only the floors whose truncated measurement went up**

For each metric the candidate is `Math.floor(measured × 10) / 10`; raise only where it is higher than today's floor. In `client/vite.config.js`, replace lines 70-77:

<!-- prettier-ignore -->
```js
      // Measured 2026-10-17 (98.86 / 93.84 / 99.11 / 99.50), the same locally
      // and in CI.
      thresholds: {
        statements: 98.8,
        branches: 93.8,
        functions: 99.1,
        lines: 99.5
      }
```

with (the expected figures; use Step 1's):

<!-- prettier-ignore -->
```js
      // Measured <date> (98.89 / 94.38 / 99.11 / 99.51), the same locally
      // and in CI.
      thresholds: {
        statements: 98.8,
        branches: 94.3,
        functions: 99.1,
        lines: 99.5
      }
```

In `server/vitest.config.js`, in the note at lines 29-37, replace `Measured 2026-10-17 (95.13 / 88.29 / 96.21 / 96.22)` with `Measured <date> (95.17 / 88.37 / 96.22 / 96.25)`, `(88.77 against 88.29 on 2026-10-17)` with `(<CI figure> against 88.37 on <date>)` and `(88.29 against 88.34)` with `(88.37 against <the no-dist figure>)`; and in `thresholds`, `branches: 88.2` with `branches: 88.3`. The note figures are the summary's two decimals, truncated (94.3887 is 94.38), and R2's test in `repo-invariants.test.mjs` fails when a floor is not its note's figure truncated to one decimal, which is the check that the two were edited together. If no floor on a side rises, leave that file alone; if none rises on either, open no PR and record "no floor moved".

- [ ] **Step 3: Prove it, commit, open the PR**

```bash
npx prettier --write client/vite.config.js server/vitest.config.js
npm run test:coverage > "$SCRATCH/cov-floor2.txt" 2>&1; echo "test:coverage exit=$?"
node "$TOOLS/counts.mjs" . client; node "$TOOLS/counts.mjs" . server
npm run lint > "$SCRATCH/lint-floor.txt" 2>&1; echo "lint exit=$?"
npm run format:check > "$SCRATCH/fmt-floor.txt" 2>&1; echo "format:check exit=$?"
npm run test:scripts > "$SCRATCH/scripts-floor.txt" 2>&1; echo "test:scripts exit=$?"
git add client/vite.config.js server/vitest.config.js
git commit -m "chore(coverage): raise the floors after the open items" -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
git push -u origin chore/open-items-floors
gh pr create --base main --title "chore(coverage): raise the floors after the open items" --body-file "$SCRATCH/pr-floors.md"
```

Expected: every `exit=0`, every slack 0 or more against the new floors (the table's last column). `pr-floors.md` follows Phase 5's D3 body: the floors that moved and the rule; the PRs merged on each track and #252; per side, Metric, Covered / total, Measured to four decimals, Floor before, Floor after, Spare; the tests before (2408 and 1178) and after; the CI run that agrees; the exits; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 4: Review, then merge.** The quality review recomputes each percentage and truncation from the counts in the body.

---

### Task R: The records these changes make untrue

**Branch:** `docs/open-items-records` (after Task F; rule 6: records of state are edited once, at the end). Docs only: no coverage, no capture, no E2E effect. Each change was checked against the code as it stands after the tasks above, in the scratch trees.

| #   | File and line on `cb821a1`                                           | Now says                                                                                                                                                                                                       | Becomes                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Made untrue by                                         |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | `CLAUDE.md:456-457`                                                  | "Hover and press feedback still moves under reduced motion, which that plan leaves to the owner."                                                                                                              | "Hover and press feedback, which none of those blocks reached, has its own beside the white buttons (`core/shell.css`) and the toggle buttons (`forms-and-motion.css`)."                                                                                                                                                                                                                                                                                                | C8                                                     |
| 2   | `CLAUDE.md:732-735`                                                  | "The file's other uncovered arms are `\|\|` and `?:` fallbacks on the derived week and dashboard figures (`todayPlan?.workout \|\| ""` and the like); trace each one's producer before writing a test for it." | "Its other uncovered arms were `\|\|` and `?:` fallbacks on the derived week and dashboard figures, each guarding something the week plan's construction already guarantees (one entry per weekday, every field filled, at least five training days, the goal always met). Each was traced, proved dead by arithmetic and as a deliberate survivor on all seven weekdays, and deleted; the fifteen in the `String(x ?? "")` block are what is left."                    | C10                                                    |
| 3   | `CLAUDE.md:127-135`                                                  | "Two things to know before adding a write:", then the two bullets                                                                                                                                              | "Three things …", and a third bullet: "**A write derived from other rows takes a lock.** `syncDerivedCalorieEntry` sums the day's meals, and two saves in their own transactions each miss the other's uncommitted meal, so it first takes `pg_advisory_xact_lock` keyed on the user. Not `FOR UPDATE` on `app_users`: each meal insert already holds a key-share lock on that row through its foreign key, and two saves asking for `FOR UPDATE` deadlock (measured)." | S5 (a new record: the next derived write needs it)     |
| 4   | `CLAUDE.md:110`                                                      | "… a failed session command answers 503 and never falls back to memory"                                                                                                                                        | the same, then: "; a command Redis accepts and never answers fails at a 2 s deadline, the same 503"                                                                                                                                                                                                                                                                                                                                                                     | S3                                                     |
| 5   | `server/README.md:259-260`                                           | "`REDIS_COMMAND_TIMEOUT_MS` (1.5 s) bounds how long a command waits to reach the socket, so that answer comes quickly."                                                                                        | the same, then: "Once written, a command is no longer bounded by it, so `runSessionCommand` gives each session command a 2 s deadline for its answer (`REDIS_SESSION_REPLY_TIMEOUT_MS`)."                                                                                                                                                                                                                                                                               | S3                                                     |
| 6   | `server/README.md:222-224`                                           | "… A signed-in caller gets their plan persisted; an anonymous one gets the plan and nothing is written."                                                                                                       | the same, then: "A caller whose session cookie cannot be read because the session store is down gets a 503, not the anonymous quota."                                                                                                                                                                                                                                                                                                                                   | S3                                                     |
| 7   | `client/README.md:86`                                                | "Use `src/app/network.js` when a request should have an explicit timeout."                                                                                                                                     | "`apiFetch` has a deadline of its own: 15 s, or the caller's `timeoutMs` (40 s for plan generation, 5 s for logout), and a request past it rejects with "Request timed out. Please try again." Both it and the dashboard's reads go through `src/app/network.js`'s `fetchWithTimeout`."                                                                                                                                                                                 | C6                                                     |
| 8   | `client/README.md:161-162`                                           | "… so a failed request may leave the server session alive — clearing what we can is deliberate."                                                                                                               | the same, then: "When it does, or the server answers anything but OK, App says so with a dismissible notice (`AppNotice`) until someone signs in."                                                                                                                                                                                                                                                                                                                      | C2                                                     |
| 9   | `client/README.md`, "Saving a Log Entry", after its second paragraph | (nothing)                                                                                                                                                                                                      | "A send's answer, success or failure, does not replace a later entry's Undo toast while that entry's window is open; a failure still shows as the dashboard's error line."                                                                                                                                                                                                                                                                                              | C4 (a new record of a rule a later change could break) |

Not changed, and why: `README.md`'s environment section says the server "validates this environment at startup", which S6 makes true of three more variables without making anything untrue; `docs/deploy-runbook.md` names none of these behaviours; the CLAUDE.md coverage entries that name `useOptimisticLogs.js`, `events.js` and `App.jsx` list them as well covered, which they still are.

- [ ] **Step 1: Branch, and re-read each line on the merged `main`**

```bash
git fetch origin && git switch -c docs/open-items-records origin/main
grep -n "Hover and press feedback still moves\|The file's other uncovered\|Two things to know before adding a write\|never falls back to memory" CLAUDE.md
grep -n "that answer comes quickly\|an anonymous one gets the plan and nothing is written" server/README.md
grep -n "Use \`src/app/network.js\`\|what we can is deliberate\|## Saving a Log Entry" client/README.md
```

Expected: each phrase once. If a line has moved, the anchor is the text, not the number.

- [ ] **Step 2: The edits.** Apply the table with the Edit tool, keeping CLAUDE.md's prose lines within 92 columns and its list continuations indented as their neighbours are (Prettier keeps Markdown line breaks). Then:

```bash
npx prettier --write CLAUDE.md server/README.md client/README.md
grep -n "still moves under reduced motion\|todayPlan?.workout\|Two things to know before adding a write" CLAUDE.md
npm run format:check > "$SCRATCH/fmt-r.txt" 2>&1; echo "format:check exit=$?"
npm run test:scripts > "$SCRATCH/scripts-r.txt" 2>&1; echo "test:scripts exit=$?"
git add CLAUDE.md server/README.md client/README.md
git commit -m "docs: records that match the open items" -m "CLAUDE.md and the server and client READMEs said hover motion still ran under reduced motion, pointed at preview fallbacks since deleted, and did not record the meal sync's lock, the session reply deadline, the generate route's 503, apiFetch's deadline, the sign-out notice or the Undo toast rule." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: the grep prints nothing; both exits `0` (R2's floor test reads the configs, not CLAUDE.md, so it is unaffected).

- [ ] **Step 3: Gates and PR.** `lint`, `format:check`, `test:scripts`; `test:coverage` must print Task F's counts exactly. `git push -u origin docs/open-items-records`; `gh pr create --draft --base main --title "docs: records that match the open items" --body-file "$SCRATCH/pr-r.md"`. Outline: the table, each row with the task that made it necessary and what it was checked against; the grep; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Ordering, and the cumulative arithmetic

Every row was measured: a scratch copy of `cb821a1` with the tasks up to that row applied in order, `vitest run --coverage` with a `json-summary` reporter, the counts read from `coverage-summary.json`, every test passing. The server was measured with `client/dist` present. Each cell is covered / total, the percentage to four decimals, and the slack against today's floor in brackets.

**Server** (floors 95.1 / 88.2 / 96.2 / 96.2):

| After  | Statements                  | Branches                    | Functions                 | Lines                       | Tests |
| ------ | --------------------------- | --------------------------- | ------------------------- | --------------------------- | ----- |
| `main` | 2269 / 2385, 95.1363 (0.87) | 1652 / 1871, 88.2950 (1.78) | 381 / 396, 96.2121 (0.05) | 2039 / 2119, 96.2246 (0.52) | 1178  |
| S1     | 2273 / 2389, 95.1444 (1.06) | 1658 / 1877, 88.3324 (2.49) | 382 / 397, 96.2217 (0.09) | 2042 / 2122, 96.2300 (0.64) | 1184  |
| S2     | 2276 / 2392, 95.1505 (1.21) | 1662 / 1881, 88.3573 (2.96) | 382 / 397, 96.2217 (0.09) | 2045 / 2125, 96.2353 (0.75) | 1186  |
| S3     | 2279 / 2395, 95.1566 (1.36) | 1664 / 1883, 88.3696 (3.19) | 382 / 397, 96.2217 (0.09) | 2048 / 2128, 96.2406 (0.86) | 1190  |
| S4     | 2285 / 2401, 95.1687 (1.65) | 1664 / 1883, 88.3696 (3.19) | 383 / 398, 96.2312 (0.12) | 2053 / 2133, 96.2494 (1.05) | 1193  |
| S5     | 2286 / 2402, 95.1707 (1.70) | 1664 / 1883, 88.3696 (3.19) | 383 / 398, 96.2312 (0.12) | 2054 / 2134, 96.2512 (1.09) | 1194  |
| S6, S7 | 2289 / 2405, 95.1767 (1.85) | 1666 / 1885, 88.3820 (3.43) | 383 / 398, 96.2312 (0.12) | 2057 / 2137, 96.2564 (1.21) | 1208  |
| S8     | 2286 / 2402, 95.1707 (1.70) | 1665 / 1884, 88.3758 (3.31) | 382 / 397, 96.2217 (0.09) | 2054 / 2134, 96.2512 (1.09) | 1208  |

**The server order is forced at one point: S8 goes after S1 or S4.** S8 deletes a covered function, and on `main` server functions have 0.05 of slack: alone, S8 would leave 380 / 395 = 96.2025, a slack of 0.01, which passes, but with nothing to spare for any later change. S1 and S4 each add a covered function, which is what makes room. Every other server task adds only covered code, so S1 to S7 can merge in any order without failing a floor; the order given is the plan's (S3 before S4, because S4's worst case, two deletes, is bounded by S3's deadline, and S7 before S8 so the two cleanups land together). Each of S1 to S6 adds tests and covered code and so raises at least one slack.

**Client** (floors 98.8 / 93.8 / 99.1 / 99.5; C3, C7, C8 and C9 change no count):

| After    | Statements                  | Branches                     | Functions                   | Lines                       | Tests      |
| -------- | --------------------------- | ---------------------------- | --------------------------- | --------------------------- | ---------- |
| `main`   | 4871 / 4927, 98.8634 (3.12) | 3184 / 3393, 93.8403 (1.37)  | 1004 / 1013, 99.1115 (0.12) | 4442 / 4464, 99.5072 (0.32) | 2408       |
| C1       | 4892 / 4948, 98.8682 (3.38) | 3190 / 3399, 93.8511 (1.74)  | 1007 / 1016, 99.1142 (0.14) | 4462 / 4484, 99.5094 (0.42) | 2414       |
| C2, C3   | 4897 / 4953, 98.8694 (3.44) | 3198 / 3406, 93.8931 (3.17)  | 1008 / 1017, 99.1150 (0.15) | 4467 / 4489, 99.5099 (0.45) | 2420, 2428 |
| C4       | 4906 / 4962, 98.8714 (3.54) | 3206 / 3414, 93.9074 (3.67)  | 1008 / 1017, 99.1150 (0.15) | 4472 / 4494, 99.5105 (0.47) | 2432       |
| C5       | 4908 / 4964, 98.8719 (3.57) | 3206 / 3414, 93.9074 (3.67)  | 1009 / 1018, 99.1159 (0.16) | 4474 / 4496, 99.5107 (0.48) | 2455       |
| C6 to C9 | 4911 / 4967, 98.8726 (3.60) | 3207 / 3415, 93.9092 (3.73)  | 1009 / 1018, 99.1159 (0.16) | 4477 / 4499, 99.5110 (0.49) | 2461       |
| C10      | 4906 / 4961, 98.8914 (4.53) | 3196 / 3386, 94.3887 (19.93) | 1008 / 1017, 99.1150 (0.15) | 4473 / 4495, 99.5106 (0.48) | 2461       |

**The client order is forced in one way and free otherwise.** C2 reuses C1's `AppNotice`, so C1 goes first; C6's diff anchors on C2's and C4's `events.js` lines, so it follows them (if it is taken earlier, its two `events.js` hunks are rewritten against `main`'s text, with no coverage effect). C10 removes a covered function and goes last as a deletion (rule 5), though by the arithmetic it would pass anywhere: it raises statements and branches and leaves functions at 0.15. Client lines is the tightest metric throughout (0.32 on `main`, 0.48 at the end): any task that added an uncovered line would fail, and none does.

**The CSS tasks.** C7 and C8 are proven by capture compare with expectation files (each "0 unexpected; 0 expected but absent" in the scratch run); every other client task compares `identical`. The chain was checked end to end in the scratch copies: `main` → C1 → … → C10, each after-capture the next task's before-capture.

**The two tracks.** No server task touches a client file and no client task a server file, so neither track can move the other's floors (spec, starting state). Two pairs are halves of one owner item and read better merged close together, but neither depends on the other: S4 with C2 (sign-out), S3 with C1 (the outage's two halves). Task F waits for both tracks and #252; Task R waits for Task F.

**What the scratch measurement did not run.** The E2E suite and the axe scans need the built bundle beside a running server and were not run against the scratch copies; every PR runs them as a gate. The capture set shows each state at desktop and phone widths (two at tablet width too); C7's selector was also checked in the built CSS, and C8's hover and press, which no capture can show, with `hover-probe.mjs`.

---

## Closing the phase

When Task R merges, write the phase report (spec, "Closing a phase"): what merged on each track, with #252 and Task F; the coverage before (the Baseline) and after (Task F's measurement); the six decisions as taken or overridden; and the table below. Check on `main` that CI is green (`gh run list --branch main --workflow ci.yml --limit 1`) and that R2's floor test passes.

## Not in this phase

| Item                                                                                                                                         | Where it goes                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| NowCast or AirNow's own AQI (the PM2.5 averaging period), a `@layer` migration, gitleaks, the server allowing its own origin automatically   | Parked by the spec, unchanged                                                                                                              |
| `detectTrack` matching keywords inside longer words ("cut"), and `detectInjuryFlags` flagging "back" inside "lower back"                     | Parked by the spec. C5 changes which notes count as no injury and leaves the matching alone; `client/README.md` records the double penalty |
| Dependabot #252                                                                                                                              | Left alone; it merges before Task F (Status)                                                                                               |
| A late _failure_ answer in `events.js` (an error message after logout) and `changePassword`'s success toast, which C3a left unguarded        | Accepted by Phase 3, unchanged. C4 drops a late plan, which carries account data; these carry none                                         |
| What the client shows for a 503 from `/api/generate` during a store outage (S3): the masked "Server error." in the planner, as for every 5xx | Unchanged. A clearer message would need `sendErrorResponse` to pass a 5xx message through, which its masking rule exists to prevent        |
| Account deletion's session delete (`DELETE /api/auth/me`), which S4 does not retry                                                           | Kept single: the session it leaves names a deleted user, which `getSessionUser` rejects and deletes on first use (Task S4)                 |
| A cached signed-in user for C1's outage notice                                                                                               | Decision 3: a new feature, not taken                                                                                                       |
| A server-reported generation deadline for C6                                                                                                 | Decision 5: not taken                                                                                                                      |
| `usePreviewDerivedData.js`'s fifteen `String(x ?? "")` arms                                                                                  | Left, as CLAUDE.md decided; C10 deletes only the other eighteen                                                                            |
| Whether a failed weather or air-quality lookup should read differently from one not yet made (CLAUDE.md, the `DashboardAtAGlance` entry)     | Copy decision, still open                                                                                                                  |
| The cascade bugs Phase 4 accepted, and #188's declarations that never apply                                                                  | Accepted under default #9, unchanged                                                                                                       |
| `apiFetch` callers that might one day pass their own `signal`                                                                                | None does today (C6, Step 1); `fetchWithTimeout` replaces a caller's signal, and its doc comment says so                                   |
