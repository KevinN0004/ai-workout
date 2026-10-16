# Readability follow-up: Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase 4 of the readability follow-up, the client's motion and CSS track: honour reduced motion where script and pseudo-elements escape it today (M1, M2), fix the four cascade bugs a visitor can see (K1 to K4), then raise the client floors once (K5).

**Architecture:** Phase 4 of `docs/specs/2026-10-10-readability-follow-up-design.md`, client track only. Every task is a new branch from current `origin/main` and one PR, merged one at a time. M1 is the only task that adds JavaScript branches, so it is test-first with mutation checks. M2 and K1 to K4 are CSS only: they add no statement, branch or function, and each is proven instead by a screenshot and computed-style compare against the merged state of `main`, which must show exactly the differences the task lists (spec rule 7). The expected differences are written as a JSON file the capture tool checks mechanically. K5 raises the floors.

**Tech Stack:** React 19, Vite 8 (Lightning CSS), Vitest 5 with v8 coverage, jsdom 30, anime.js 4.5, Playwright 1.60 (E2E, axe, and the capture tool), GitHub (gh CLI).

**Baseline (`main` at `96bee73`, 2026-10-16):**

| Side   | Tests | Statements          | Branches            | Functions           | Lines               |
| ------ | ----- | ------------------- | ------------------- | ------------------- | ------------------- |
| Client | 2438  | 98.83 (4904 / 4962) | 93.87 (3216 / 3426) | 99.02 (1014 / 1024) | 99.46 (4471 / 4495) |

The counts are PR #227's, measured on `d9c2931`, and were measured again on `96bee73` for this plan (a scratch copy of its client and server sources, `vitest run --coverage` with a `json-summary` reporter): identical, 2438 tests. The floors are 98.8 / 93.8 / 99 / 99.4 (`client/vite.config.js:72-77`, measurement note at 70-71). Headroom:

| Metric     | Covered | Least the floor accepts         | Spare |
| ---------- | ------- | ------------------------------- | ----- |
| Statements | 4904    | 4903 (98.8% of 4962 is 4902.46) | 1     |
| Branches   | 3216    | 3214 (93.8% of 3426 is 3213.59) | 2     |
| Functions  | 1014    | 1014 (99% of 1024 is 1013.76)   | 0     |
| Lines      | 4471    | 4469 (99.4% of 4495 is 4468.03) | 2     |

**Bundle.** `npm run build` on `96bee73`: main chunk `index-DdYy61By.js` 488.09 kB (gzip 149.84 kB), against Vite's 500 kB warning; main CSS `index-BDwWHwN0.css` 134.72 kB. The lazy view sheets are separate files (`MealView-*.css`, `TipsView-*.css` and five more) that load after the main CSS. M1 adds about 0.05 kB to the main chunk (measured: 488.14 kB); the CSS tasks add a few hundred bytes of CSS and nothing to the JavaScript.

**Screenshot baseline (captured 2026-10-16 on `96bee73`, twice, `compare` exit 0 between the runs).** The Tools section's `capture.mjs`, against the built `client/dist`, took 44 captures in about two minutes:

| Viewport         | States                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| desktop 1440×900 | `intro`, `personal`, `personal-advanced`, `visualizer`, `preview-personal-info`, `preview-generate`, `preview-result`, `preview-dashboard`, `preview-scrolled`, `auth-login`, `auth-signup`, `dash-loading`, `dash-summary`, `dash-meal-loading`, `dash-tips-loading`, `dash-workout-modal`, `dash-planner`, and eight `-motion` copies: `personal`, `visualizer`, `auth-login`, `auth-signup`, `dash-loading`, `dash-meal-loading`, `dash-tips-loading`, `dash-planner` |
| tablet 900×900   | `personal-advanced`, `dash-workout-modal`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| phone 390×844    | the same 17 states as desktop, without the `-motion` copies                                                                                                                                                                                                                                                                                                                                                                                                              |

- **Reduced motion:** every state is captured under `prefers-reduced-motion: reduce` except `preview-personal-info` (the walkthrough leaves Personal Info at once under reduced motion) and the eight `-motion` copies, which run with `no-preference` to prove a reduced-motion rule changes nothing without the preference.
- **Per capture:** a full-page PNG; `<name>.styles.json.gz`, `getComputedStyle` of every element and its `::before` and `::after` for all 581 to 593 properties Chromium enumerates plus every declared custom property; `<name>.rects.json`, the boxes of eight selectors (the walkthrough's root and contents lane, the bottom bar, the workout modal's metrics grid and action buttons, the advanced fields, the personal form's labels, the height fields); `<name>.dom.html`. `preview-scrolled` also writes `<name>.viewport.png`.
- **What it serves and stubs:** Vite's preview server on port 4174 serves `client/dist`. Every `/api` request is answered in the browser by a page route: signed out (`/api/auth/me` 401) for the home and `/auth` states; signed in, with an empty dashboard and a fixed profile, for the dashboard states. `dash-loading` holds `/api/dashboard` open, `dash-meal-loading` holds `/api/mealdb/`, `dash-tips-loading` holds `/api/wger/`, so their skeletons stay up. No server and no database are needed. Locale `en-US`, zone UTC, geolocation denied, `Math.random` pinned to 0.5, and the page clock installed at 2026-09-29T12:00Z and paused.

Motion still running under `prefers-reduced-motion: reduce` on `96bee73`, from the baseline dumps (`motion-left.mjs`, Tools). Phase 4 removes every row except the last four:

| Where                                                                         | Element                                                               | Running                                               | Fixed by          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ----------------- |
| `visualizer` (inline styles, not in the dump's transition columns)            | `.physique-render-surface`, mid-pulse `scaleX(0.9953) scaleY(1.0078)` | anime.js entrance and pulse                           | M1                |
| home `personal`, `personal-advanced`, walkthrough `preview-generate`, `/auth` | `.segmented::before`, `.unit-toggle::before`                          | `transform 1.4s`                                      | M2                |
| `auth-login`                                                                  | the remember-me tick, `input::before`                                 | `transform 0.16s`                                     | M2                |
| `dash-planner`                                                                | `.planner-env-toggle::before`                                         | `transform 0.36s`                                     | M2                |
| every walkthrough state                                                       | `.preview-jump-label` (four)                                          | `opacity, transform 0.16s, 0.22s`                     | M2                |
| `dash-loading`                                                                | `.dashboard-skeleton-bar`, `-chip`, `-block` (seven)                  | `dash-skeleton-shimmer 1.15s`                         | M2                |
| `dash-meal-loading`                                                           | `.meal-skeleton-card` (three)                                         | `meal-skeleton-shimmer 1.1s`                          | M2                |
| `dash-tips-loading`                                                           | `.tips-skeleton-card` (three)                                         | `tips-skeleton-shimmer 1.1s`                          | M2                |
| the opening scroll (not in a capture; `scroll-probe.mjs`, Tools)              | the page                                                              | smooth scroll                                         | M1                |
| every home state                                                              | the nav's Preview button, `.home-preview-btn`                         | hover transitions                                     | not in this phase |
| `/auth`                                                                       | the login/sign-up toggle's two buttons                                | `color, transform 0.32s, 0.25s`                       | not in this phase |
| `/auth`                                                                       | the close button, `.auth-close`                                       | hover transitions                                     | not in this phase |
| `dash-meal-loading`                                                           | `.meal-course-pill`                                                   | `border-color, background 0.15s` (colour, not motion) | not in this phase |

The walkthrough's Generating spinner (`.preview-builder-generating::after`, `home/preview/styles/personal.css:528`) is already stopped under reduced motion by `home/preview/styles/responsive.css:305`'s `animation: none`, and no task touches it. Every compare below checks that it does not change.

---

## Conventions

- **Shell.** Git Bash, from `D:\ai-workout`. Set `SCRATCH` to any folder outside the repo, and redirect command output there. `TOOLS="$SCRATCH/p4-tools"` holds the Tools section's scripts and `SHOTS="$SCRATCH/p4-shots"` the captures. Never `cd` into a `src` folder: run Vitest with `--root client` from the repo root.
- **Exit codes.** Never gate on a pipe: redirect output to a file, then read `$?`.
- **Secrets.** Never read, stat or print `server/.env` or any `.env*` file. If a permission rule blocks something, stop and say so.
- **Server suite.** `npm run test:coverage` and `npm run test:e2e` need Postgres (`npm run postgres:local:start -w server`) and a generated Prisma client (`npm run prisma:generate -w server`) after any `npm ci`. The server track shares the database, so agree a turn with it before running either.
- **Ports.** The capture tool serves on 4174, so it never collides with the E2E suite's 4173 or the server's 5000. A capture that crashes can leave its preview server running: free 4174 by port (`netstat -ano | grep ":4174 "`, then `taskkill //PID <pid> //F`), never by stopping the shell task alone, which leaves the `node` process behind.
- **Take `main`: every task is a NEW branch.** Start each task with `git fetch origin && git switch -c <branch> origin/main`. Open the PR as a draft. If `main` moves before the PR is marked ready, take it by merging, never by rebasing: `git fetch origin && git merge origin/main`, then re-run `test:coverage`, re-capture both sides of the compare (below), and mark it ready with `gh pr ready`.
- **Resolving a conflict.** Keep the task's change. Keep `main`'s comments wherever they still describe the code, and rewrite any the change makes untrue, following `docs/code-readability-sop.md`: present tense, every claim checked against the code, no numbers that live elsewhere. After resolving, `git diff origin/main` shows only the task's change and the comment rewrites it forces.
- **Line numbers** are on `96bee73`. Every edit is anchored by the full text it replaces, which each task quotes; the number is a guide. M1, M2 and K3 all edit `home/styles/forms-and-motion.css`, M1 and M2 both edit `home/preview/styles/responsive.css`, M2 and K1 both edit `home/preview/styles/layout/frame.css`, M2 and K2 both edit `auth/AuthPage.css`, and M2 and K4 both edit `dashboard/styles/responsive.css`. So after the first of a pair merges, the later task's anchors are still exact (each task's anchor text already includes the earlier task's change where they touch), but its numbers shift.
- **Byte-order marks.** Eight of the stylesheets these tasks edit start with one (`ef bb bf`): `app/styles/planner/motion.css`, `home/preview/styles/layout/frame.css`, `home/preview/styles/layout/base.css`, `dashboard/styles/responsive.css`, `dashboard/styles/glance-loading.css`, `dashboard/styles/workout-modal.css`, `dashboard/styles/theme.css` and `dashboard/styles/navigation.css`. Keep each one: before committing, `head -c 3 <file> | od -An -tx1` must print what it printed on `main`. The Edit tool keeps them.
- **Formatting.** Code here is written to Prettier's settings (`.prettierrc.yaml`, width 100), and every change in this plan passed `prettier --check` in a scratch copy of the tree. Still run `npx prettier --write <the files you changed>` before the gates, and re-read any edit Prettier reflows. Comment lines stay within 100 columns, and every new section banner is copied from the one the task gives (80 columns).
- **Moving CSS rules.** The SOP's rule 5 ("never move CSS rules") governs readability changes. K3 moves one `@media` block on purpose, because its position is the bug; nothing else in this phase moves a rule.
- **The gates on every PR.** Each is redirected to a file, and its exit code must be `0`.

  ```bash
  npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
  npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
  npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "knip exit=$?"
  npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"; grep -E "index-.*\.js|larger than" "$SCRATCH/build.txt"
  npm run test:coverage > "$SCRATCH/cov.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files|Tests  " "$SCRATCH/cov.txt"
  npm run test:e2e > "$SCRATCH/e2e.txt" 2>&1; echo "test:e2e exit=$?"; tail -3 "$SCRATCH/e2e.txt"
  npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"
  ```

  The E2E suite includes the axe scans (`e2e/a11y.spec.js`: the login and sign-up forms, the dashboard and an open modal) and runs against the built bundle, which is why `build` comes first. `test:scripts` holds the header ratchet, which CI runs in its lint job. The build output must show no "larger than" chunk warning.

- **Exact coverage.** The text table rounds. Read the counts: `npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc.txt" 2>&1`, then `node -e "const t=require('./client/coverage/coverage-summary.json').total; for (const k of ['statements','branches','functions','lines']) console.log(k, t[k].covered + '/' + t[k].total, (100*t[k].covered/t[k].total).toFixed(4))"`. A CSS-only task must print exactly the counts it started from, and the same `Tests` line: no CSS is instrumented, so any change means the branch touched JavaScript.
- **Screenshot compares (spec rule 7).** The phase baseline is `main` at `96bee73`, captured once, before M1 (Task M1, Step 2). Each later task compares against the merged state of `main` it branches from, as the spec's Verification table says, and that state is the previous task's after-capture; the chain is checked, not assumed. For every task:

  1. **Before.** On the new branch, before any change: `npm run build > "$SCRATCH/b0.txt" 2>&1`, then `node "$TOOLS/capture.mjs" . "$SHOTS/<task>-before" > "$SCRATCH/<task>-cap0.txt" 2>&1; echo "capture exit=$?"`. If the previous task's after-capture is on disk, `node "$TOOLS/capture.mjs" compare "$SHOTS/<previous>-after" "$SHOTS/<task>-before"` must print `identical`. If it does not, something besides the previous task changed `main`'s client: find it before going on.
  2. **After.** With the change committed: `npm run build`, then `node "$TOOLS/capture.mjs" . "$SHOTS/<task>-after"`.
  3. **Compare.** Write the task's expectations with the Write tool to `$SHOTS/<task>-expect.json`, then `node "$TOOLS/capture.mjs" compare "$SHOTS/<task>-before" "$SHOTS/<task>-after" "$SHOTS/<task>-expect.json" > "$SCRATCH/<task>-cmp.txt" 2>&1; echo "compare exit=$?"`. Exit `0` means every difference is one the file lists and every entry in the file matched at least one. Otherwise it prints `UNEXPECTED` and `EXPECTED BUT ABSENT` lines: stop, and either fix the change or, if the prediction was wrong, say so in the PR with the evidence. Never widen an expectation to make a compare pass.
  4. **Record.** Run the compare once more with `CAPTURE_DIFF_OUT="$SCRATCH/<task>-diff.txt"` set, which writes every difference one per line, and attach its summary to the PR body.

  Each task's expectations were predicted on 2026-10-16 by applying its change, cumulatively after the tasks before it, to a scratch copy of `96bee73`'s client, building that copy and capturing it with the same tool. Each task says what that run showed.

- **Mutation checks.** Only M1 adds branches. Write `$SCRATCH/mutate.mjs` with the Write tool, copied from Phase 3's plan (`docs/plans/2026-10-15-readability-follow-up-phase-3-client.md`, Conventions, "Mutation checks"): it applies `[{ "file", "find", "text" }]` edits from a JSON file and exits 2 when one did not apply. Write each edits file with the Write tool, never a heredoc or an argument. Run mutations after the fix is committed, restore with `git checkout -- <files>`, and confirm `git status --porcelain` prints nothing.
- **Visible text.** No task here changes text a visitor reads, and none renames a class an `e2e/` selector uses (`git grep -n "<class>" e2e/` for any selector a task rescopes).
- **Floors.** No fix PR edits a floor. K5 raises them once.
- **Merging.** A PR merges only after its spec and quality reviews pass, its checks are green, and it shows `mergeStateStatus` `CLEAN`. Merge with **"Create a merge commit"** (`gh pr merge <n> --merge`), then wait for the CI run on `main` to go green before starting the next task.
- **Trailers.** Every commit ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

---

## Tools

Write each of these once, with the Write tool, into `$TOOLS` (any scratch folder outside the repo; never a heredoc, because three of them hold backslashes). They run from the repo root with Node 22 or 24, and find Vite and Playwright through the repo's own `node_modules`, so they need nothing installed. Install Chromium for Playwright first if this machine has never run the E2E suite: `npx playwright install chromium`.

| Script             | What it does                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capture.mjs`      | The phase's capture tool (Baseline lists what it captures). `node capture.mjs <repoRoot> <outDir>` captures; `compare <dirA> <dirB> [expect.json]` compares |
| `motion-left.mjs`  | Lists, per capture, every element or pseudo-element that still has a transition or an animation. `node motion-left.mjs <dir> [captureRegex]`                |
| `png-diff.mjs`     | Says how many pixels two PNGs differ in, and where. `node png-diff.mjs <repoRoot> <a.png> <b.png>`                                                          |
| `scroll-probe.mjs` | Samples the walkthrough's opening scroll from a scrolled-down page, with and without reduced motion. `node scroll-probe.mjs <repoRoot> [port]`              |
| `props.mjs`        | Prints chosen computed properties from one style dump. `node props.mjs <dump.styles.json.gz> <regex> <prop,prop>`                                           |

`capture.mjs` grew from the code-readability plan's tool (`docs/plans/2026-09-29-code-readability.md`, Task 13, Step 1), which captured only the home stages and the walkthrough, had no expectation check, and loaded Google Fonts over the network. Three things were found while proving it on `96bee73`, and each is now handled: two captures of the same build differed in a few hundred pixels and a 0.015 px button width when a Google Fonts face arrived late, so the tool blocks Google Fonts and draws the fallback faces every time; a hover left by the last click expanded a different contents chip once K1 moved the lane, so the pointer is parked in the bottom-right corner before each capture; and the `-motion` dashboard captures sometimes differ in about ten anti-aliased pixels at the edge of the round profile button with every style identical, so `compare` reports a PNG difference of at most 64 pixels, in a capture with no style, box or page-state difference, as `NOISE` and does not count it (nothing in a stylesheet can change pixels without changing a computed style). Everything else it inherits: the paused clock moved only by `runFor`, the DOM check before each capture, the settled animations, the full computed-style dump, and waits that poll from Node because after `page.clock.install` Playwright's own `waitForFunction` and `locator.waitFor` stop re-checking.

`capture.mjs`:

<!-- prettier-ignore -->
```js
/**
 * Phase 4's capture tool. Screenshots, a computed-style dump of every element and
 * its ::before and ::after, and the boxes of a few elements, for the home page, the
 * walkthrough, /auth and the signed-in dashboard, at desktop, tablet and phone
 * widths. Serves the built bundle (client/dist) with Vite's preview server on 4174,
 * so build first. The API is answered from inside the browser (page routes), so no
 * server or database is needed, and a request can be held open to show a loading
 * skeleton. The page clock is paused and moved only by runFor. Google Fonts is
 * blocked, so every run draws the same fallback faces whatever the network does.
 *
 * Usage: node capture.mjs <repoRoot> <outDir>
 *        node capture.mjs compare <dirA> <dirB> [expect.json]
 *
 * compare exits 0 when the two runs match, or, given expect.json, when every
 * difference is one the file lists and every entry in the file matched one.
 * Run it from the repo root: it decodes differing PNGs in Playwright's Chromium,
 * and sets aside as NOISE a PNG within NOISE_PIXELS whose capture has no other
 * difference. CAPTURE_ONLY="desktop-auth-login,phone-auth-login" captures just
 * those; CAPTURE_DIFF_OUT=<file> writes every difference compare finds.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

// ---- Compare ----------------------------------------------------------------
// A dump stores, per property, its most common value, and per entry only the
// values that differ from it; decodeDump rebuilds every entry in full.
const decodeDump = (file) => {
  const dump = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
  const entries = new Map();
  for (const [key, label, diffs] of dump.entries) {
    const values = {};
    dump.props.forEach((prop, i) => {
      values[prop] = Object.hasOwn(diffs, i) ? diffs[i] : dump.modes[i];
    });
    entries.set(key, { label, values });
  }
  return { meta: dump.meta, props: dump.props, entries };
};

// Every difference between two runs, as rows of
// { capture, kind: "png" | "style" | "rect" | "meta", target, prop, from, to }.
const diffRuns = (dirA, dirB) => {
  const names = [...new Set([...readdirSync(dirA), ...readdirSync(dirB)])].sort();
  const rows = [];
  const read = (dir, n) => (existsSync(path.join(dir, n)) ? path.join(dir, n) : null);
  for (const n of names.filter((x) => x.endsWith(".png"))) {
    const a = read(dirA, n);
    const b = read(dirB, n);
    if (!a || !b || !readFileSync(a).equals(readFileSync(b)))
      rows.push({ capture: n.replace(/\.png$/, ""), kind: "png", target: n, prop: "", from: a ? "" : "(absent)", to: b ? "" : "(absent)" });
  }
  for (const n of names.filter((x) => x.endsWith(".styles.json.gz"))) {
    const capture = n.replace(/\.styles\.json\.gz$/, "");
    const a = read(dirA, n);
    const b = read(dirB, n);
    if (!a || !b) {
      rows.push({ capture, kind: "style", target: "(file)", prop: "", from: a ? "" : "(absent)", to: b ? "" : "(absent)" });
      continue;
    }
    const da = decodeDump(a);
    const db = decodeDump(b);
    for (const k of Object.keys({ ...da.meta, ...db.meta }))
      if (JSON.stringify(da.meta[k]) !== JSON.stringify(db.meta[k]))
        rows.push({ capture, kind: "meta", target: "meta", prop: k, from: JSON.stringify(da.meta[k]), to: JSON.stringify(db.meta[k]) });
    const props = [...new Set([...da.props, ...db.props])];
    for (const key of new Set([...da.entries.keys(), ...db.entries.keys()])) {
      const ea = da.entries.get(key);
      const eb = db.entries.get(key);
      const target = `${key} ${(ea || eb).label}`;
      if (!ea || !eb) {
        rows.push({ capture, kind: "style", target, prop: "(entry)", from: ea ? "present" : "(absent)", to: eb ? "present" : "(absent)" });
        continue;
      }
      for (const prop of props) {
        const va = ea.values[prop] ?? "(absent)";
        const vb = eb.values[prop] ?? "(absent)";
        if (va !== vb) rows.push({ capture, kind: "style", target, prop, from: va, to: vb });
      }
    }
  }
  for (const n of names.filter((x) => x.endsWith(".rects.json"))) {
    const capture = n.replace(/\.rects\.json$/, "");
    const ra = read(dirA, n) ? JSON.parse(readFileSync(read(dirA, n), "utf8")) : {};
    const rb = read(dirB, n) ? JSON.parse(readFileSync(read(dirB, n), "utf8")) : {};
    for (const sel of new Set([...Object.keys(ra), ...Object.keys(rb)]))
      if (JSON.stringify(ra[sel]) !== JSON.stringify(rb[sel]))
        rows.push({ capture, kind: "rect", target: sel, prop: "", from: JSON.stringify(ra[sel] ?? null), to: JSON.stringify(rb[sel] ?? null) });
  }
  return rows;
};

// An expectation: { "captures": "<regex>", "kind": "png|style|rect|meta",
// "target": "<regex>", "prop": "<regex>", "from": "<exact>", "to": "<exact>" }.
// Absent fields match anything. A row is expected when some entry matches it.
const matches = (exp, row) =>
  (exp.kind === undefined || exp.kind === row.kind) &&
  (exp.captures === undefined || new RegExp(exp.captures).test(row.capture)) &&
  (exp.target === undefined || new RegExp(exp.target).test(row.target)) &&
  (exp.prop === undefined || new RegExp(exp.prop).test(row.prop)) &&
  (exp.from === undefined || exp.from === row.from) &&
  (exp.to === undefined || exp.to === row.to);

const fmt = (r) =>
  `${r.capture} [${r.kind}] ${r.target}${r.prop ? ` ${r.prop}` : ""}${r.kind === "png" ? "" : `: ${JSON.stringify(r.from)} -> ${JSON.stringify(r.to)}`}`;

// Counts the pixels two PNGs differ in, decoded in Chromium's canvas.
const countPixels = async (browser, fileA, fileB) => {
  const page = await browser.newPage();
  const url = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
  const count = await page.evaluate(async ([ua, ub]) => {
    const load = (src) => new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.src = src; });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return Infinity;
    const pixels = (img) => {
      const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, img.width, img.height).data;
    };
    const [da, db] = [pixels(ia), pixels(ib)];
    let n = 0;
    for (let i = 0; i < da.length; i += 4)
      if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || da[i + 3] !== db[i + 3]) n += 1;
    return n;
  }, [url(fileA), url(fileB)]);
  await page.close();
  return count;
};

// Rasterisation noise: a PNG that differs in at most NOISE_PIXELS pixels while
// the same capture's styles, boxes and page state are all identical. Nothing in
// a stylesheet can change pixels without changing a computed style, so such a
// difference is the GPU's anti-aliasing, seen at the edge of a round button.
const NOISE_PIXELS = 64;
const dropNoise = async (rows, dirA, dirB) => {
  const pngs = rows.filter((r) => r.kind === "png" && !r.from && !r.to);
  if (!pngs.length) return { rows, noise: [] };
  const { chromium } = createRequire(path.join(process.cwd(), "package.json"))("@playwright/test");
  const browser = await chromium.launch();
  const noise = [];
  try {
    for (const r of pngs) {
      const n = await countPixels(browser, path.join(dirA, r.target), path.join(dirB, r.target));
      r.prop = Number.isFinite(n) ? `${n} px` : "size changed";
      const base = r.capture.replace(/\.viewport$/, "");
      const otherRows = rows.some((o) => o.kind !== "png" && o.capture === base);
      if (n <= NOISE_PIXELS && !otherRows) noise.push(r);
    }
  } finally {
    await browser.close();
  }
  return { rows: rows.filter((r) => !noise.includes(r)), noise };
};

if (process.argv[2] === "compare") {
  const [dirA, dirB, expectFile] = process.argv.slice(3);
  const all = diffRuns(dirA, dirB);
  const { rows, noise } = await dropNoise(all, dirA, dirB);
  for (const r of noise) console.log(`NOISE ${r.target}: ${r.prop}, and no style, box or page-state difference`);
  if (process.env.CAPTURE_DIFF_OUT) writeFileSync(process.env.CAPTURE_DIFF_OUT, rows.map(fmt).join("\n") + "\n");
  if (!expectFile) {
    const byCapture = new Map();
    for (const r of rows) byCapture.set(r.capture, [...(byCapture.get(r.capture) || []), r]);
    for (const [capture, list] of byCapture) {
      const kinds = [...new Set(list.map((r) => r.kind))].join(", ");
      console.log(`DIFFER ${capture}: ${list.length} difference(s) (${kinds}); first: ${fmt(list[0])}`);
    }
    console.log(rows.length ? `${rows.length} difference(s) in ${byCapture.size} capture(s)` : "identical");
    process.exit(rows.length ? 1 : 0);
  }
  const expected = JSON.parse(readFileSync(expectFile, "utf8"));
  const unexpected = rows.filter((r) => !expected.some((e) => matches(e, r)));
  const unmet = expected.filter((e) => !rows.some((r) => matches(e, r)));
  for (const r of unexpected) console.log(`UNEXPECTED ${fmt(r)}`);
  for (const e of unmet) console.log(`EXPECTED BUT ABSENT ${JSON.stringify(e)}`);
  console.log(`${rows.length} difference(s); ${unexpected.length} unexpected; ${unmet.length} expected but absent`);
  process.exit(unexpected.length || unmet.length ? 1 : 0);
}

// ---- Capture setup ----------------------------------------------------------
const [repoRoot = "D:/ai-workout", outDir = "shots"] = process.argv.slice(2);
const require = createRequire(path.join(repoRoot, "client", "package.json"));
const { preview } = await import(pathToFileURL(require.resolve("vite")).href);
const { chromium } = createRequire(path.join(repoRoot, "package.json"))("@playwright/test");

const PORT = 4174; // not 4173, which the E2E suite's preview uses
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 900, height: 900 },
  phone: { width: 390, height: 844 }
};
const START = new Date("2026-09-29T12:00:00Z");
// The boxes recorded in <name>.rects.json, for what a style dump cannot show:
// where a position: fixed element actually sits.
const RECT_SELECTORS = [
  ".preview-stage-panel",
  ".preview-side-tab",
  ".dashboard-bottom-nav",
  ".dashboard-workout-grid-metrics",
  ".dashboard-workout-actions button",
  ".advanced-fields-inner",
  ".personal-form label",
  ".height-split"
];

const USER = {
  id: "capture-user",
  email: "capture@example.test",
  profile: {
    firstName: "Jordan",
    lastName: "Lee",
    name: "Jordan Lee",
    age: 28,
    heightCm: 175,
    weightKg: 72,
    sex: "Female",
    bodyFat: null,
    activity: "Moderate",
    notes: "",
    sleep: "",
    timeline: "",
    experience: "",
    nutrition: "",
    cardio: "",
    goal: "",
    trainingDays: [],
    updatedAt: "2026-09-29T12:00:00.000Z"
  }
};
const page0 = (total = 0) => ({ total, limit: 20, offset: 0, source: "table" });
const DASHBOARD = {
  dashboard: {
    workouts: [],
    workoutSessions: [],
    calories: [],
    mealLogs: [],
    progressMetrics: [],
    plans: [],
    savedExercises: [],
    goals: { targetWeight: 160, targetCalories: 2200, weeklyWorkouts: 3 }
  },
  pagination: { workoutSessions: page0(), mealLogs: page0(), progressMetrics: page0() }
};

// Answers every /api request from the browser. `hold` lists path prefixes left
// unanswered, which keeps their loading state on screen.
const routeApi = async (context, { signedIn, hold = [] }, unmocked) => {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    if (hold.some((h) => p.startsWith(h))) return; // never answered
    const json = (status, body) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (p === "/api/csrf-token") return json(200, { csrfToken: "capture-token" });
    if (p === "/api/auth/me") return signedIn ? json(200, { user: USER }) : json(401, { error: "Not signed in" });
    if (p === "/api/dashboard") return json(200, DASHBOARD);
    if (p === "/api/mealdb/search") return json(200, { meals: [] });
    if (p === "/api/wger/meta") return json(200, { categories: [], muscles: [], equipment: [] });
    if (p === "/api/wger/exercises") return json(200, { exercises: [] });
    unmocked.add(p);
    return json(404, { error: "not mocked" });
  });
};

// Waits poll from Node on real time. After page.clock.install, Playwright's own
// waitForFunction and locator.waitFor re-check on animation frames, which the
// paused clock stops, so they would never check again.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitUntil = async (page, predicate, arg, label) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await page.evaluate(predicate, arg)) return;
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${label}`);
};
// Moves the page clock in small steps, letting React render between them.
const advance = async (page, totalMs, stepMs = 50) => {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    await page.clock.runFor(Math.min(stepMs, totalMs - elapsed));
    await sleep(25);
  }
};
// Moves the clock until the predicate holds: lazy views and Suspense reveals
// wait on timers as well as on the network.
const advanceUntil = async (page, predicate, arg, label) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await page.evaluate(predicate, arg)) return;
    await page.clock.runFor(50);
    await sleep(50);
  }
  throw new Error(`timed out waiting for ${label}`);
};
const hasText = (text) => document.body.innerText.includes(text);
const has = (selector) => Boolean(document.querySelector(selector));
const selectedTab = () =>
  document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() ?? null;
const tocSettled = () =>
  !document.querySelector(".preview-jump-chip.is-expanding, .preview-jump-chip.is-contracting");

// ---- States -----------------------------------------------------------------
// Each starts from a fresh context (empty storage) and a load of `path`, and
// `check` returns null when the page shows what the capture is named for.
const HOME = { signedIn: false };
const SIGNED_IN = { signedIn: true };
const ALL = ["desktop", "phone"];
const reachPreviewTab = (tab) => async (page) => {
  await page.getByRole("button", { name: "Preview" }).click();
  await advance(page, 1000);
  await page.getByRole("tab", { name: tab }).click();
  await waitUntil(page, (name) => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim() === name, tab, `the ${tab} chapter`);
  await advance(page, 800); // the contents chips' switch (PREVIEW_TOC_SWITCH_MS)
};
const previewCheck = ([expectedTab, marker, absent]) => {
  const selected = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim();
  if (selected !== expectedTab) return `selected tab is ${selected}`;
  if (!document.querySelector(marker)) return `no ${marker}`;
  if (absent && document.querySelector(absent)) return `found ${absent}`;
  return null;
};
const reachPersonal = async (page) => {
  await page.getByRole("button", { name: "Get Started" }).click();
  await advance(page, 3000);
  await waitUntil(page, hasText, "Full name", "the personal form");
};
const BASE_STATES = [
  {
    name: "intro", motion: "reduce", path: "/", api: HOME, viewports: ALL,
    reach: (page) => waitUntil(page, hasText, "Get Started", "the intro"),
    check: () =>
      document.querySelector(".home-intro-panel") &&
      !document.querySelector(".home-stage-preview, .home-stage-personal, .home-stage-visualizer, .home-stage-workout")
        ? null
        : "not the intro"
  },
  {
    name: "personal", motion: "reduce", path: "/", api: HOME, viewports: ALL, reach: reachPersonal,
    check: () => (document.querySelector(".home-stage-personal .personal-form.basic-mode") ? null : "not the basic personal form")
  },
  {
    name: "personal-advanced", motion: "reduce", path: "/", api: HOME, viewports: ["desktop", "tablet", "phone"],
    reach: async (page) => {
      await reachPersonal(page);
      await page.getByRole("button", { name: "Advanced", exact: true }).click();
      await advanceUntil(page, has, ".personal-form.advanced-mode", "advanced mode");
      await advance(page, 1600);
    },
    check: () => (document.querySelector(".home-stage-personal .personal-form.advanced-mode") ? null : "not advanced mode")
  },
  {
    // The physique stage, 2000 ms after Continue: the entrance (1400 ms) has
    // ended and the pulse, if it runs, is part-way through its first cycle.
    name: "visualizer", motion: "reduce", path: "/", api: HOME, viewports: ALL,
    reach: async (page) => {
      await reachPersonal(page);
      await page.getByPlaceholder("Jordan Lee").fill("Jordan Lee");
      await page.getByPlaceholder("28").fill("28");
      await page.getByPlaceholder("5", { exact: true }).fill("5");
      await page.getByPlaceholder("9", { exact: true }).fill("9");
      await page.getByPlaceholder("160").fill("160");
      await page.locator('select[name="sex"]').selectOption({ index: 1 });
      await page.getByRole("button", { name: "Continue" }).click();
      await advanceUntil(page, has, ".home-stage-visualizer .physique-render-surface", "the physique stage");
      await advance(page, 2000);
    },
    check: () => (document.querySelector(".home-stage-visualizer .physique-render-surface") ? null : "not the physique stage")
  },
  {
    // Reduced motion moves Personal Info straight on to Generate, so this one
    // plays with motion: at 4500 ms the notes have finished typing and four
    // days are lit, and the form collapses between 4700 and 4800 ms.
    name: "preview-personal-info", motion: "no-preference", path: "/", api: HOME, viewports: ALL,
    reach: async (page) => {
      await page.getByRole("button", { name: "Preview" }).click();
      await advance(page, 4500);
    },
    check: () => {
      const tab = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim();
      if (tab !== "Personal Info") return `selected tab is ${tab}`;
      const sequence = document.querySelector(".preview-personal-sequence");
      const shell = document.querySelector(".preview-personal-form-shell");
      if (!sequence || sequence.classList.contains("is-generate-view")) return "generate view";
      if (!shell || shell.classList.contains("is-collapsed")) return "form collapsed";
      const lit = document.querySelectorAll(".preview-personal-form .day-toggle-btn.active").length;
      if (lit !== 4) return `${lit} training days lit`;
      const notes = document.querySelector('.preview-personal-form textarea[name="notes"]');
      if (notes?.value !== "Minor left-knee sensitivity during deep squats.") return "notes still typing";
      return null;
    }
  },
  ...[
    ["preview-generate", "Generate", ".preview-personal-sequence.is-generate-view.builder-stage-6", null],
    ["preview-result", "Result", ".preview-week-plan.is-outline-active.is-headers-visible.is-rows-visible", ".preview-week-plan.is-typing, .preview-week-plan.is-scan-once"],
    ["preview-dashboard", "Dashboard", ".preview-dashboard-view .preview-dashboard-card.is-visible", ".preview-dashboard-view .preview-dashboard-card:not(.is-visible)"]
  ].map(([name, tab, marker, absent]) => ({
    name, motion: "reduce", path: "/", api: HOME, viewports: ALL, reach: reachPreviewTab(tab),
    check: previewCheck, checkArg: [tab, marker, absent]
  })),
  {
    // The Result chapter scrolled 400px further down, with a viewport-only
    // screenshot as well: where the fixed contents lane sits after a scroll.
    name: "preview-scrolled", motion: "reduce", path: "/", api: HOME, viewports: ALL, viewportShot: true,
    reach: async (page) => {
      await reachPreviewTab("Result")(page);
      await page.evaluate(() => window.scrollBy({ top: 400, behavior: "instant" }));
    },
    check: previewCheck,
    checkArg: ["Result", ".preview-week-plan.is-rows-visible", null]
  },
  {
    name: "auth-login", motion: "reduce", path: "/auth", api: HOME, viewports: ALL,
    reach: (page) => waitUntil(page, has, ".auth-page .auth-form", "the login form"),
    check: () => (document.querySelector(".auth-page .auth-card:not(.auth-card-profile)") ? null : "not login mode")
  },
  {
    name: "auth-signup", motion: "reduce", path: "/auth", api: HOME, viewports: ALL,
    reach: async (page) => {
      await waitUntil(page, has, ".auth-page .auth-form", "the login form");
      await page.getByRole("button", { name: "Sign Up" }).click();
      await advanceUntil(page, has, ".auth-card-profile .height-split", "the sign-up fields");
      await advance(page, 1600);
    },
    check: () => (document.querySelector(".auth-card-profile .height-split") ? null : "not sign-up mode")
  },
  {
    name: "dash-loading", motion: "reduce", path: "/dashboard", api: { ...SIGNED_IN, hold: ["/api/dashboard"] }, viewports: ALL,
    reach: (page) => advanceUntil(page, has, ".dashboard-loading-skeleton", "the dashboard skeleton"),
    check: () => (document.querySelector(".dashboard-loading-skeleton .dashboard-skeleton-block") ? null : "no skeleton")
  },
  {
    name: "dash-summary", motion: "reduce", path: "/dashboard", api: SIGNED_IN, viewports: ALL,
    reach: async (page) => {
      await advanceUntil(page, hasText, "Today's training snapshot", "the summary");
      await advance(page, 1000);
    },
    check: () => (document.querySelector(".dashboard-page") && !document.querySelector(".dashboard-loading-skeleton") ? null : "not the summary")
  },
  {
    name: "dash-meal-loading", motion: "reduce", path: "/dashboard/meal", api: { ...SIGNED_IN, hold: ["/api/mealdb/"] }, viewports: ALL,
    reach: (page) => advanceUntil(page, has, ".meal-view .meal-skeleton-card", "the meal skeleton"),
    check: () => (document.querySelector(".meal-view .meal-skeleton-card") ? null : "no meal skeleton")
  },
  {
    name: "dash-tips-loading", motion: "reduce", path: "/dashboard/tips", api: { ...SIGNED_IN, hold: ["/api/wger/"] }, viewports: ALL,
    reach: (page) => advanceUntil(page, has, ".tips-view .tips-skeleton-card", "the tips skeleton"),
    check: () => (document.querySelector(".tips-view .tips-skeleton-card") ? null : "no tips skeleton")
  },
  {
    name: "dash-workout-modal", motion: "reduce", path: "/dashboard", api: SIGNED_IN, viewports: ["desktop", "tablet", "phone"],
    reach: async (page) => {
      await advanceUntil(page, hasText, "Today's training snapshot", "the summary");
      await page.getByRole("button", { name: "Add workout" }).first().click();
      await advanceUntil(page, has, ".dashboard-workout-modal", "the workout modal");
      await advance(page, 1000);
    },
    check: () => (document.querySelector(".dashboard-workout-modal .dashboard-workout-grid-metrics") ? null : "no workout modal")
  },
  {
    name: "dash-planner", motion: "reduce", path: "/dashboard", api: SIGNED_IN, viewports: ALL,
    reach: async (page) => {
      await advanceUntil(page, hasText, "Today's training snapshot", "the summary");
      await page.getByRole("button", { name: "Update plan" }).click();
      await advanceUntil(page, has, ".planner-setup-modal .planner-env-toggle", "the planner");
      await advance(page, 1000);
    },
    check: () => (document.querySelector(".planner-setup-modal .planner-env-toggle") ? null : "no planner")
  }
];
// The same pages without reduced motion, at desktop only: the reduced-motion
// rules must change nothing here.
const MOTION_COPIES = ["personal", "visualizer", "auth-login", "auth-signup", "dash-loading", "dash-meal-loading", "dash-tips-loading", "dash-planner"];
const STATES = [
  ...BASE_STATES,
  ...BASE_STATES.filter((s) => MOTION_COPIES.includes(s.name)).map((s) => ({
    ...s, name: `${s.name}-motion`, motion: "no-preference", viewports: ["desktop"]
  }))
];

// Finishes every finite animation and cancels every infinite one, as the
// screenshot's animations: "disabled" does, so the dump records the frame the
// screenshot shows.
const settleAnimations = () => {
  for (const animation of document.getAnimations()) {
    if (!animation.effect || animation.playbackRate === 0) continue;
    const { endTime } = animation.effect.getComputedTiming();
    try {
      if (Number.isFinite(endTime)) animation.finish();
      else animation.cancel();
    } catch {
      // Left as it is, as Playwright does.
    }
  }
};

// getComputedStyle for every element, ::before and ::after, every property:
// the standard ones Chromium enumerates and every custom property declared.
const dumpStyles = () => {
  const customs = new Set();
  const addCustoms = (style) => {
    for (let i = 0; i < style.length; i += 1) if (style[i].startsWith("--")) customs.add(style[i]);
  };
  const walkRules = (rules) => {
    for (const rule of rules) {
      if (rule.style) addCustoms(rule.style);
      if (rule.cssRules) walkRules(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) walkRules(sheet.cssRules);
  const elements = [document.documentElement, ...document.documentElement.querySelectorAll("*")];
  for (const el of elements) if (el.style) addCustoms(el.style);
  const rootStyle = getComputedStyle(document.documentElement);
  const standard = [];
  for (let i = 0; i < rootStyle.length; i += 1) if (!rootStyle[i].startsWith("--")) standard.push(rootStyle[i]);
  const props = [...standard.sort(), ...[...customs].sort()];
  const paths = new Map();
  const pathOf = (el) => {
    if (paths.has(el)) return paths.get(el);
    let index = 1;
    for (let sib = el.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.tagName === el.tagName) index += 1;
    const own = `${el.tagName.toLowerCase()}[${index}]`;
    const result = el.parentElement ? `${pathOf(el.parentElement)}/${own}` : own;
    paths.set(el, result);
    return result;
  };
  const rows = [];
  for (const el of elements) {
    const cls = typeof el.className === "string" ? el.className.trim().replace(/\s+/g, ".") : "";
    const label = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}`;
    for (const pseudo of [null, "::before", "::after"]) {
      const cs = getComputedStyle(el, pseudo);
      rows.push([`${pathOf(el)}${pseudo ?? ""}`, label, props.map((p) => cs.getPropertyValue(p))]);
    }
  }
  const modes = props.map((_, i) => {
    const counts = new Map();
    let best = "";
    let bestCount = -1;
    for (const row of rows) {
      const c = (counts.get(row[2][i]) || 0) + 1;
      counts.set(row[2][i], c);
      if (c > bestCount) [best, bestCount] = [row[2][i], c];
    }
    return best;
  });
  const entries = rows.map(([key, label, values]) => {
    const diffs = {};
    values.forEach((v, i) => {
      if (v !== modes[i]) diffs[i] = v;
    });
    return [key, label, diffs];
  });
  return { meta: { url: location.href, scrollX, scrollY, elements: elements.length }, props, modes, entries };
};

const rectsOf = (selectors) => {
  const out = {};
  for (const sel of selectors) {
    const list = [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 100) / 100);
    });
    if (list.length) out[sel] = list;
  }
  return out;
};

// ---- Capture ----------------------------------------------------------------
mkdirSync(outDir, { recursive: true });
const only = process.env.CAPTURE_ONLY ? new Set(process.env.CAPTURE_ONLY.split(",")) : null;
const server = await preview({ root: path.join(repoRoot, "client"), preview: { port: PORT, strictPort: true }, logLevel: "error" });
const browser = await chromium.launch();
const unmocked = new Set();
try {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    for (const state of STATES) {
      const name = `${viewportName}-${state.name}`;
      if (!state.viewports.includes(viewportName) || (only && !only.has(name))) continue;
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", timezoneId: "UTC", permissions: [] });
      // The typing animation draws a random delay per character.
      await context.addInitScript(() => {
        Math.random = () => 0.5;
      });
      await routeApi(context, state.api, unmocked);
      // styles/base.css imports Google Fonts. A face that arrives late, or a new
      // version of one, would change the pixels between two runs of the same code.
      await context.route(
        (url) => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com",
        (route) => route.abort()
      );
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: state.motion });
      await page.clock.install({ time: START });
      await page.clock.pauseAt(new Date(START.getTime() + 1000));
      await page.goto(`http://localhost:${PORT}${state.path}`);
      await advance(page, 500);
      await state.reach(page);
      // The pointer is left where reach last clicked, and a :hover there (a
      // lifted button, an expanded contents chip) would follow the layout
      // rather than the code. The bottom-right corner is empty on every page.
      await page.mouse.move(viewport.width - 2, viewport.height - 2);
      await page.evaluate(() => document.fonts.ready);
      // Real time only, for images to decode and any smooth scroll to end.
      let lastScroll = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await sleep(100);
        const scroll = await page.evaluate(() => `${scrollX},${scrollY}`);
        if (scroll === lastScroll && attempt >= 5) break;
        lastScroll = scroll;
      }
      const mismatch = await page.evaluate(state.check, state.checkArg ?? null);
      if (mismatch) throw new Error(`${name}: the page does not show ${state.name}: ${mismatch}`);
      if (!(await page.evaluate(tocSettled))) throw new Error(`${name}: the contents chips are still switching`);
      await page.evaluate(settleAnimations);
      const dump = await page.evaluate(dumpStyles);
      writeFileSync(path.join(outDir, `${name}.styles.json.gz`), gzipSync(JSON.stringify(dump)));
      writeFileSync(path.join(outDir, `${name}.rects.json`), JSON.stringify(await page.evaluate(rectsOf, RECT_SELECTORS), null, 1));
      if (state.viewportShot)
        await page.screenshot({ path: path.join(outDir, `${name}.viewport.png`), animations: "disabled", caret: "hide" });
      await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true, animations: "disabled", caret: "hide" });
      writeFileSync(path.join(outDir, `${name}.dom.html`), await page.evaluate(() => document.documentElement.outerHTML));
      const recheck = await page.evaluate(state.check, state.checkArg ?? null);
      if (recheck) throw new Error(`${name}: changed during the capture: ${recheck}`);
      const tab = await page.evaluate(selectedTab);
      await context.close();
      console.log(`captured ${name} (motion ${state.motion}, tab ${tab}, ${dump.meta.elements} elements, ${dump.props.length} properties, scroll ${dump.meta.scrollX},${dump.meta.scrollY})`);
    }
  }
  if (unmocked.size) console.log(`unmocked API paths (answered 404): ${[...unmocked].sort().join(", ")}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
```

`motion-left.mjs`:

<!-- prettier-ignore -->
```js
// Lists, per capture, the entries that still carry a transition or an animation.
// Usage: node motion-left.mjs <dir> [captureRegex]
import { readdirSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
const [dir, re = "."] = process.argv.slice(2);
for (const n of readdirSync(dir).filter((x) => x.endsWith(".styles.json.gz") && new RegExp(re).test(x)).sort()) {
  const d = JSON.parse(gunzipSync(readFileSync(path.join(dir, n))).toString());
  const idx = (p) => d.props.indexOf(p);
  const get = (diffs, p) => (Object.hasOwn(diffs, idx(p)) ? diffs[idx(p)] : d.modes[idx(p)]);
  const out = new Map();
  for (const [key, label, diffs] of d.entries) {
    const td = get(diffs, "transition-duration");
    const tp = get(diffs, "transition-property");
    const an = get(diffs, "animation-name");
    const ad = get(diffs, "animation-duration");
    const moving = td.split(",").some((v) => parseFloat(v) > 0) || (an !== "none" && ad.split(",").some((v) => parseFloat(v) > 0));
    if (!moving) continue;
    const pseudo = key.endsWith("::before") ? "::before" : key.endsWith("::after") ? "::after" : "";
    const sig = `${label}${pseudo} | transition ${tp} ${td} | animation ${an} ${ad}`;
    out.set(sig, (out.get(sig) || 0) + 1);
  }
  console.log(`== ${n.replace(".styles.json.gz", "")}: ${[...out.values()].reduce((a, b) => a + b, 0)}`);
  for (const [sig, c] of out) console.log(`  ${c}x ${sig}`);
}
```

`png-diff.mjs`:

<!-- prettier-ignore -->
```js
/**
 * Where two PNGs differ: their sizes, the number of differing pixels and the box
 * around them, decoded in Chromium's canvas. Usage: node png-diff.mjs <repoRoot> <a.png> <b.png>
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const [repoRoot, a, b] = process.argv.slice(2);
const { chromium } = createRequire(path.join(repoRoot, "package.json"))("@playwright/test");
const url = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ([ua, ub]) => {
      const load = (src) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(ua), load(ub)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const data = (img) => {
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const da = data(ia);
      const db = data(ib);
      let count = 0;
      let [x0, y0, x1, y1] = [w, h, -1, -1];
      for (let y = 0; y < h; y += 1)
        for (let x = 0; x < w; x += 1) {
          const i = (y * w + x) * 4;
          if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || da[i + 3] !== db[i + 3]) {
            count += 1;
            x0 = Math.min(x0, x);
            y0 = Math.min(y0, y);
            x1 = Math.max(x1, x);
            y1 = Math.max(y1, y);
          }
        }
      return { a: `${ia.width}x${ia.height}`, b: `${ib.width}x${ib.height}`, count, box: count ? [x0, y0, x1, y1] : null };
    },
    [url(a), url(b)]
  );
  console.log(`${path.basename(a)}: A ${result.a}, B ${result.b}, ${result.count} pixel(s) differ${result.box ? `, in x ${result.box[0]}-${result.box[2]}, y ${result.box[1]}-${result.box[3]}` : ""}`);
} finally {
  await browser.close();
}
```

`scroll-probe.mjs`:

<!-- prettier-ignore -->
```js
/**
 * How the walkthrough's opening scroll moves: from the personal stage scrolled
 * down, opens the walkthrough from the sticky nav and samples scrollY every
 * 40 ms of real time. An instant scroll reaches its end by the first sample; a
 * smooth one passes through values in between. Prints one line per motion
 * setting. Usage: node scroll-probe.mjs <repoRoot> [port]
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [repoRoot, port = "4175"] = process.argv.slice(2);
const require = createRequire(path.join(repoRoot, "client", "package.json"));
const { preview } = await import(pathToFileURL(require.resolve("vite")).href);
const { chromium } = createRequire(path.join(repoRoot, "package.json"))("@playwright/test");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await preview({ root: path.join(repoRoot, "client"), preview: { port: Number(port), strictPort: true }, logLevel: "error" });
const browser = await chromium.launch();
try {
  for (const motion of ["reduce", "no-preference"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US", timezoneId: "UTC" });
    await context.route("**/api/**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(`http://localhost:${port}/`);
    await page.getByRole("button", { name: "Get Started" }).click();
    await page.waitForSelector(".home-stage-personal .personal-form");
    await sleep(1500);
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
    await sleep(300);
    const before = await page.evaluate(() => scrollY);
    await page.getByRole("button", { name: "Preview" }).click();
    const samples = [];
    for (let i = 0; i < 25; i += 1) {
      samples.push(await page.evaluate(() => Math.round(scrollY)));
      await sleep(40);
    }
    const end = samples.at(-1);
    const between = samples.filter((v) => v !== end && v !== samples[0]).length;
    console.log(`${motion}: scrollY before ${Math.round(before)}; samples ${samples.join(",")}; in-between samples ${between}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
```

`props.mjs`:

<!-- prettier-ignore -->
```js
// Prints chosen properties for entries whose "key label" matches a regex.
// Usage: node props.mjs <dump.styles.json.gz> <regex> <prop,prop,...>
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const [file, re, props] = process.argv.slice(2);
const d = JSON.parse(gunzipSync(readFileSync(file)).toString());
for (const [key, label, diffs] of d.entries) {
  if (!new RegExp(re).test(`${key} ${label}`)) continue;
  const vals = props.split(",").map((p) => { const i = d.props.indexOf(p); return `${p}=${Object.hasOwn(diffs, i) ? diffs[i] : d.modes[i]}`; });
  console.log(`${label}${key.match(/::\w+$/)?.[0] ?? ""}  ${vals.join("  ")}`);
}
```

**Prove the tools before Task M1.** On `main`, clean:

```bash
npm run build > "$SCRATCH/b-main.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/main-1" > "$SCRATCH/cap-main-1.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/main-2" > "$SCRATCH/cap-main-2.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/main-1" "$SHOTS/main-2"; echo "compare exit=$?"
grep -c "^captured " "$SCRATCH/cap-main-1.txt"
```

Expected: three `exit=0`, `identical`, and `44`. `$SHOTS/main-1` is the phase baseline, and it is M1's before-capture.

---

### Task M1: A reduced-motion gate for the physique stage and the opening scroll

Two script-driven motions ignore `prefers-reduced-motion`, and no stylesheet can reach either:

- **The physique stage's entrance and pulse.** `useHomeStageFlow.js`'s first effect (lines 496-533) runs an anime.js timeline on `.visual-stage` and `.physique-render-surface` (opacity and scale, `UNIFIED_ANIMATION_MS`), then starts `animate(renderSurfaceEl, { scaleX: [1, 0.994, 1], scaleY: [1, 1.01, 1], duration: 4300, delay: 520, loop: true })` (lines 520-527). anime.js writes inline styles, and `home/styles/forms-and-motion.css:309-315`'s `.home-stage *` block stops only CSS animations and transitions. The baseline's reduced-motion `visualizer` capture shows the pulse mid-cycle: `.physique-render-surface` has the inline `transform: scale(1) scaleX(0.9953) scaleY(1.0078)`. The pulse starts by itself, lasts past five seconds and runs beside other content, which is the one gap in this phase that touches a Level A criterion (WCAG 2.2 SC 2.2.2).
- **The walkthrough's opening scroll.** `PreviewStage.jsx:149` calls `scrollIntoView({ behavior: "smooth", block: "start" })`. An explicit `behavior` overrides CSS `scroll-behavior`, so `home/preview/styles/responsive.css:286-288`'s reduced-motion `html.preview-smooth-scroll { scroll-behavior: auto }` never applies to it. `scroll-probe.mjs` on `96bee73`, from the personal stage scrolled to 194 at 390 px: under `reduce` the samples run `194,180,90,26,7,0`, a smooth scroll. From a page already at the top the scroll has nowhere to go, which is why every walkthrough capture ends at the same scroll position either way.

**How the gate is read: at effect time, not by a subscribing hook.** The hook already reads `window.matchMedia("(prefers-reduced-motion: reduce)").matches` at event time in two places (line 132 for the morph, line 408 for Get Started), and so do `usePreviewChapterFlow.js:105` and `usePreviewWeekParticleAnimation.js:97`. The visualizer effect reads it the same way. A `usePrefersReducedMotion` hook built on a change listener would add at least two functions (the subscribe and the snapshot), and functions has no headroom. It would also have to join the effect's dependencies, so flipping the setting while the stage is open would cancel and replay the entrance. The research gave a third reason: that a subscribing hook would disturb deliberate exhaustive-deps disables. That is not true of this hook, which has none (`git grep -n eslint-disable client/src` finds three, in `usePreviewChapterFlow.js:424`, `usePreviewWeekParticleAnimation.js:428` and `PhysiqueSilhouette2D.jsx:32`); it would hold only if those two preview hooks were moved onto the shared hook too.

**What reduced motion renders: the entrance's last frame.** HomePage mounts `HomeVisualizerStage` only on the visualizer stage (`HomePage.jsx:225`), so each entry starts from fresh elements with no inline style, and the stylesheet already draws them at the entrance's end state (opacity 1, no transform). So the gate returns before either animation is created, after the existing `cancel()` calls, which still stop anything a previous entry left running.

**The scroll leaves its behaviour to the page, rather than reading the preference.** Dropping `behavior: "smooth"` makes `scrollIntoView` use the scrolling box's computed `scroll-behavior`, which the walkthrough's stylesheets already set to `smooth` (`layout/base.css:8-11`) and to `auto` under reduced motion (`responsive.css:286-288`). The class that carries both is on `<html>` before the scroll starts: the effect that adds it (`PreviewStage.jsx:176-183`) is declared before the mount effect (`199-205`), React runs them in that order, and the scroll waits two more frames. A test pins that order. This adds no statement and no branch, keeps one source of truth for the walkthrough's scrolling, and was checked in Chromium with the change applied to a scratch build: under `reduce` the samples go `194,0,0`, instant, and under `no-preference` `194,180,58,18,3,0`, still smooth. The alternative, `behavior: prefersReducedMotion ? "auto" : "smooth"`, adds a branch and a second statement of the same rule.

**Files:**

- Modify: `client/src/pages/home/hooks/useHomeStageFlow.js:40-46` (the summary), `:492-495` (the effect's comment) and `:504` (the gate goes after this line)
- Modify: `client/src/pages/home/preview/PreviewStage.jsx:147-150` (`scrollPreviewIntoView`) and `:193-198` (the mount effect's comment)
- Modify: `client/src/pages/home/styles/forms-and-motion.css:307-308` (the reduced-motion note)
- Modify: `client/src/pages/home/preview/styles/responsive.css:282-284` (the reduced-motion note)
- Test: `client/src/pages/home/hooks/__tests__/useHomeStageFlow.test.jsx:9-25` (the animejs mock), `:69` (`beforeEach`), and two tests before `"tears down when the visitor leaves the stage"` (`:1049`)
- Test: `client/src/pages/home/preview/__tests__/PreviewStage.test.jsx:303-307` (the scroll test, replaced by two)

**New statements, branches and functions, and what runs each:**

| Added                                                                                                   | Run by                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useHomeStageFlow.js`: the `if` and its `return undefined` (2 statements, 1 line), one `if` with 2 arms | the true arm by "under reduced motion, runs neither…"; the false arm by "plays the entrance…" and the two existing visualizer tests that build both surfaces |
| `PreviewStage.jsx`: none; one object property goes                                                      | "scrolls itself into view on arrival, leaving the behaviour to the page"                                                                                     |

Measured in a scratch copy of `96bee73` with this task applied (Step 10 repeats it): statements 4906 / 4964, branches 3218 / 3428, functions 1014 / 1024, lines 4472 / 4496, with 2441 tests.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-reduced-motion-script origin/main
```

- [ ] **Step 2: The before-capture**

If the Tools section's proof ran on this same `main`, `$SHOTS/main-1` is the before-capture: `cp -r "$SHOTS/main-1" "$SHOTS/m1-before"`. Otherwise run that proof now. Then confirm the gap from the dump: `node "$TOOLS/props.mjs" "$SHOTS/m1-before/desktop-visualizer.styles.json.gz" "physique-render-surface$" transform` prints `transform=matrix(0.9953, 0, 0, 1.0078, 0, 0)`.

- [ ] **Step 3: Write the failing tests**

In `client/src/pages/home/hooks/__tests__/useHomeStageFlow.test.jsx`, replace lines 9-15:

```js
const anime = vi.hoisted(() => ({ adds: [] }));

vi.mock("animejs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createTimeline: (...args) => {
```

with:

```js
const anime = vi.hoisted(() => ({ adds: [], animates: [] }));

vi.mock("animejs", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // The visualizer's pulse is a lone animate call, recorded the same way.
    animate: (target, params) => {
      anime.animates.push({ target, params });
      return actual.animate(target, params);
    },
    createTimeline: (...args) => {
```

In the `beforeEach` (lines 67-70), after `anime.adds.length = 0;`, add:

```js
anime.animates.length = 0;
```

Inside `describe("the visualizer stage animation", …)`, insert before `test("tears down when the visitor leaves the stage", …)` (line 1049):

```js
test("plays the entrance on both surfaces and starts the pulse", () => {
  const { result } = render();
  const cleanup = buildVisualPanel(result);
  try {
    act(() => result.current.goToStage("visualizer"));

    const panel = result.current.visualPanelRef.current;
    const surface = panel.querySelector(".physique-render-surface");
    expect(anime.adds.map(({ target }) => target)).toEqual([
      panel.querySelector(".visual-stage"),
      surface
    ]);
    expect(anime.animates).toHaveLength(1);
    expect(anime.animates[0].target).toBe(surface);
    expect(anime.animates[0].params.loop).toBe(true);
  } finally {
    cleanup();
  }
});

test("under reduced motion, runs neither and leaves both surfaces as drawn", () => {
  // The stylesheet's reduced-motion block cannot reach styles a script
  // writes inline, so the hook has to skip these itself.
  stubMatchMedia(true);
  const { result } = render();
  const cleanup = buildVisualPanel(result);
  try {
    act(() => result.current.goToStage("visualizer"));

    const panel = result.current.visualPanelRef.current;
    expect(anime.adds).toEqual([]);
    expect(anime.animates).toEqual([]);
    expect(panel.querySelector(".visual-stage").getAttribute("style")).toBeNull();
    expect(panel.querySelector(".physique-render-surface").getAttribute("style")).toBeNull();
  } finally {
    cleanup();
  }
});
```

(Prettier indents these two tests to sit inside the `describe`.)

In `client/src/pages/home/preview/__tests__/PreviewStage.test.jsx`, replace lines 303-307:

```js
test("scrolls itself into view on arrival", () => {
  renderPreview();

  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
});
```

with:

```js
test("scrolls itself into view on arrival, leaving the behaviour to the page", () => {
  // An explicit behavior would override html.preview-smooth-scroll's
  // scroll-behavior, including the instant one under reduced motion.
  renderPreview();

  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
});

test("puts preview-smooth-scroll on <html> before it scrolls", () => {
  // That class's rules decide how the scroll moves, so it must be there
  // when the scroll starts.
  let classOnScroll = null;
  scrollIntoView.mockImplementation(() => {
    classOnScroll = document.documentElement.classList.contains("preview-smooth-scroll");
  });

  renderPreview();

  expect(classOnScroll).toBe(true);
});
```

- [ ] **Step 4: Watch them fail**

```bash
npx vitest run src/pages/home/hooks/__tests__/useHomeStageFlow.test.jsx src/pages/home/preview/__tests__/PreviewStage.test.jsx --root client > "$SCRATCH/m1-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |AssertionError" "$SCRATCH/m1-red.txt"
```

Expected (as the scratch run showed): `exit=1`, `Tests  2 failed | 87 passed (89)`:

- "under reduced motion, runs neither and leaves both surfaces as drawn": `AssertionError: expected [ …(2) ] to deeply equal []`, the two timeline adds;
- "scrolls itself into view on arrival, leaving the behaviour to the page": `expected "vi.fn()" to be called with arguments: [ { block: 'start' } ]`, because it received `behavior: "smooth"` as well.

"plays the entrance…" and "puts preview-smooth-scroll on <html> before it scrolls" pass already: they pin behaviour the fix must keep.

- [ ] **Step 5: Gate the entrance and the pulse**

In `client/src/pages/home/hooks/useHomeStageFlow.js`, replace the summary's last paragraph, lines 40-46:

```js
 * Both animations switch straight to the next stage under
 * `prefers-reduced-motion`, and when what they would animate is missing or,
 * for the morph, has no size. The visualizer's entrance and pulse (the first
 * effect) run under reduced motion too: they are script-driven, so the
 * stylesheet's reduced-motion block does not reach them. `samplePlanLength`
 * and `personalMode` are read only to re-measure a panel whose size they
 * change.
```

with:

```js
 * Both animations switch straight to the next stage under
 * `prefers-reduced-motion`, and when what they would animate is missing or,
 * for the morph, has no size. Under the same preference the visualizer's
 * entrance and pulse (the first effect) do not run, and the stage shows as its
 * stylesheet draws it. `samplePlanLength` and `personalMode` are read only to
 * re-measure a panel whose size they change.
```

Replace the effect's comment, lines 492-495:

```js
// Runs the visualizer's entrance and starts its slow pulse whenever that
// stage is entered. After the morph the entrance plays out while the stage is
// still hidden under the clone, so it is seen only on Back and on the paths
// that skip the morph. Leaving the stage, or unmounting, stops both.
```

with:

```js
// Runs the visualizer's entrance and starts its slow pulse whenever that
// stage is entered, unless the visitor prefers reduced motion. After the
// morph the entrance plays out while the stage is still hidden under the
// clone, so it is seen only on Back and on the paths that skip the morph.
// Leaving the stage, or unmounting, stops both.
```

Replace lines 504-506:

```js
    if (!stageEl || !renderSurfaceEl) return undefined;

    visualIntroTimelineRef.current = createTimeline({
```

with:

```js
    if (!stageEl || !renderSurfaceEl) return undefined;
    // anime.js writes these styles inline, where the stylesheet's reduced-motion
    // block cannot reach, so the preference is read here, as the morph and Get
    // Started read it. Left alone, both elements show the entrance's last frame.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    visualIntroTimelineRef.current = createTimeline({
```

- [ ] **Step 6: Leave the opening scroll's behaviour to the page**

In `client/src/pages/home/preview/PreviewStage.jsx`, replace lines 147-150:

```jsx
const scrollPreviewIntoView = () => {
  if (!previewStageRef.current) return;
  previewStageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
};
```

with:

```jsx
// Passes no behavior, so the page's scroll-behavior decides: smooth while
// `preview-smooth-scroll` is on <html>, instant under reduced motion.
const scrollPreviewIntoView = () => {
  if (!previewStageRef.current) return;
  previewStageRef.current.scrollIntoView({ block: "start" });
};
```

Replace the mount effect's comment, lines 193-198:

```jsx
// On mount, the first chapter, and two animation frames on, once the stage
// has been painted, a smooth scroll that brings its top up to the page's
// scroll padding. The index already starts at 0, so the reset changes nothing
// here. The frames are not cancelled, so a PreviewStage that unmounts before
// they run reaches scrollPreviewIntoView with no element, which its null
// check covers.
```

with:

```jsx
// On mount, the first chapter, and two animation frames on, once the stage
// has been painted, a scroll that brings its top up to the page's scroll
// padding. It is smooth, because the effect above has already put
// `preview-smooth-scroll` on <html>, unless the visitor prefers reduced
// motion. The index already starts at 0, so the reset changes nothing here.
// The frames are not cancelled, so a PreviewStage that unmounts before they
// run reaches scrollPreviewIntoView with no element, which its null check
// covers.
```

(Both blocks sit two spaces in, inside the component.)

- [ ] **Step 7: The two stylesheet notes that named these gaps**

In `client/src/pages/home/styles/forms-and-motion.css`, replace lines 307-308:

```css
   /auth and /plan render no .home-stage at all. Motion driven from script is out of reach:
   the physique stage's entrance and pulse, and the walkthrough's opening scroll. */
```

with:

```css
   /auth and /plan render no .home-stage at all. Motion driven from script is out of reach,
   so useHomeStageFlow skips the physique stage's entrance and pulse itself, and
   PreviewStage's opening scroll takes html.preview-smooth-scroll's scroll-behavior. */
```

In `client/src/pages/home/preview/styles/responsive.css`, replace lines 282-284:

```css
   inside .home-stage, with !important. Neither reaches the contents chips' labels, whose
   !important transition in layout/frame.css wins, nor PreviewStage's opening scroll, which
   asks for smooth scrolling from script. */
```

with:

```css
   inside .home-stage, with !important. Neither reaches the contents chips' labels, whose
   !important transition in layout/frame.css wins. The first rule below also makes
   PreviewStage's opening scroll instant, since that scroll leaves its behavior to the page. */
```

Comments only: the build strips them, so these two edits cannot move a pixel. `layout/base.css:6-7` already says the right thing ("responsive.css's reduced-motion block turns the smooth scrolling off") and is left alone.

- [ ] **Step 8: Watch them pass, and commit**

```bash
npx vitest run src/pages/home/hooks/__tests__/useHomeStageFlow.test.jsx src/pages/home/preview/__tests__/PreviewStage.test.jsx --root client > "$SCRATCH/m1-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/m1-green.txt"
npx prettier --write client/src/pages/home/hooks/useHomeStageFlow.js client/src/pages/home/preview/PreviewStage.jsx client/src/pages/home/hooks/__tests__/useHomeStageFlow.test.jsx client/src/pages/home/preview/__tests__/PreviewStage.test.jsx client/src/pages/home/styles/forms-and-motion.css client/src/pages/home/preview/styles/responsive.css
git add client/src/pages/home/hooks/useHomeStageFlow.js client/src/pages/home/preview/PreviewStage.jsx client/src/pages/home/hooks/__tests__/useHomeStageFlow.test.jsx client/src/pages/home/preview/__tests__/PreviewStage.test.jsx client/src/pages/home/styles/forms-and-motion.css client/src/pages/home/preview/styles/responsive.css
git commit -F - <<'EOF'
fix(client): honour reduced motion in the physique stage and the opening scroll

anime.js writes the visualizer's entrance and endless pulse as inline
styles, which the home page's reduced-motion block cannot reach, so the
hook now reads the preference when the stage opens and skips both. The
walkthrough's opening scroll asked for smooth scrolling explicitly, which
overrode the walkthrough's own reduced-motion scroll-behavior; it now
leaves the behaviour to the page.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`, `Tests  89 passed (89)`.

- [ ] **Step 9: Mutation checks**

Write `$SCRATCH/mut-m1-drop.json` (removes the gate):

```json
[
  {
    "file": "client/src/pages/home/hooks/useHomeStageFlow.js",
    "find": "    if (window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches) return undefined;\n\n    visualIntroTimelineRef",
    "text": "\n    visualIntroTimelineRef"
  }
]
```

`$SCRATCH/mut-m1-invert.json` (inverts it):

```json
[
  {
    "file": "client/src/pages/home/hooks/useHomeStageFlow.js",
    "find": "    if (window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches) return undefined;",
    "text": "    if (!window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches) return undefined;"
  }
]
```

`$SCRATCH/mut-m1-smooth.json` (puts the explicit behaviour back):

```json
[
  {
    "file": "client/src/pages/home/preview/PreviewStage.jsx",
    "find": "scrollIntoView({ block: \"start\" })",
    "text": "scrollIntoView({ behavior: \"smooth\", block: \"start\" })"
  }
]
```

For each, in turn:

```bash
node "$SCRATCH/mutate.mjs" "$SCRATCH/mut-m1-drop.json"
npx vitest run src/pages/home/hooks/__tests__/useHomeStageFlow.test.jsx src/pages/home/preview/__tests__/PreviewStage.test.jsx --root client > "$SCRATCH/m1-mut.txt" 2>&1; echo "exit=$?"; grep -E "^ *×" "$SCRATCH/m1-mut.txt"
git checkout -- client/src/pages/home; git status --porcelain
```

Expected, as the scratch run showed (a CRLF working copy would make the first two finds miss; `mutate.mjs` then exits 2, so check with `git ls-files --eol` and re-check out the file):

| Mutant | exit | Failing                                                                  |
| ------ | ---- | ------------------------------------------------------------------------ |
| drop   | 1    | "under reduced motion, runs neither and leaves both surfaces as drawn"   |
| invert | 1    | that test and "plays the entrance on both surfaces and starts the pulse" |
| smooth | 1    | "scrolls itself into view on arrival, leaving the behaviour to the page" |

Each followed by an empty `git status --porcelain`.

- [ ] **Step 10: Exact coverage**

Run the exact-coverage commands from Conventions. Expected: `statements 4906/4964`, `branches 3218/3428`, `functions 1014/1024`, `lines 4472/4496`, and `Tests  2441 passed (2441)` in `cc.txt`. Every floor holds, with one more statement of headroom than before (3) and functions still at none.

- [ ] **Step 11: The after-capture and the compare**

```bash
npm run build > "$SCRATCH/b-m1.txt" 2>&1; echo "build exit=$?"; grep -E "index-.*\.js" "$SCRATCH/b-m1.txt"
node "$TOOLS/capture.mjs" . "$SHOTS/m1-after" > "$SCRATCH/m1-cap.txt" 2>&1; echo "capture exit=$?"
```

Write `$SHOTS/m1-expect.json`:

```json
[
  { "kind": "png", "captures": "^(desktop|phone)-visualizer$" },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-visualizer$",
    "target": " div[.]visual-stage$",
    "prop": "^transform$",
    "from": "matrix(1, 0, 0, 1, 0, 0)",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-visualizer$",
    "target": " div[.]physique-render-surface$",
    "prop": "^transform$",
    "from": "matrix(0.9953, 0, 0, 1.0078, 0, 0)",
    "to": "none"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/m1-before" "$SHOTS/m1-after" "$SHOTS/m1-expect.json" > "$SCRATCH/m1-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/m1-cmp.txt"
```

Expected: `compare exit=0`, last line `6 difference(s); 0 unexpected; 0 expected but absent`, exactly what the scratch run printed. The six:

| Capture                                  | Changes                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `desktop-visualizer`, `phone-visualizer` | the PNG (62002 and 25676 pixels in the scratch run: the silhouette at its drawn size instead of mid-pulse)           |
| the same two                             | `.visual-stage` `transform`: `matrix(1, 0, 0, 1, 0, 0)` → `none` (the entrance's inline `scale(1)` is never written) |
| the same two                             | `.physique-render-surface` `transform`: `matrix(0.9953, 0, 0, 1.0078, 0, 0)` → `none` (no pulse)                     |

Everything else is identical, including `desktop-visualizer-motion`, where the entrance and pulse still run, every walkthrough state (the opening scroll ends where it did, since each walkthrough capture starts at the top of the page), and the spinner's `::after`. If the compare prints a `NOISE` line, it is a PNG within 64 pixels whose capture has no other difference; it is not counted.

Then the scroll, which no capture can see:

```bash
node "$TOOLS/scroll-probe.mjs" . 4175 > "$SCRATCH/m1-scroll.txt" 2>&1; echo "probe exit=$?"; cat "$SCRATCH/m1-scroll.txt"
```

Expected: `exit=0`; the `reduce` line has `in-between samples 0` and its second sample is already `0`; the `no-preference` line still has in-between samples (4 in the scratch run). On `main` both lines have them.

- [ ] **Step 12: Gates**

Run the gates from Conventions. The main chunk line reads about 488.14 kB, and the build shows no size warning. Nothing the E2E or axe specs look at moves: they never open the physique stage, and the walkthrough is not in them.

- [ ] **Step 13: Push and open the PR**

```bash
git push -u origin fix/client-reduced-motion-script
gh pr create --draft --base main --title "fix(client): honour reduced motion in the physique stage and the opening scroll" --body-file "$SCRATCH/pr-m1.md"
gh pr ready
gh pr checks --watch
```

`pr-m1.md` outline:

- **What changed:** the effect-time gate in `useHomeStageFlow`'s visualizer effect; `scrollIntoView` without `behavior`; the four comments.
- **Why:** inline styles from anime.js, SC 2.2.2 for the pulse; the explicit `behavior` beating the walkthrough's own reduced-motion `scroll-behavior`. Why an effect-time read and not a subscribing hook (functions headroom, replaying the entrance; and the correction to the research's exhaustive-deps reason). Why the scroll drops `behavior` rather than reading the preference, with the effect order that makes it safe.
- **Tests:** the four tests, which two failed first and how; the three mutants.
- **Coverage:** before and after counts per metric.
- **Captures:** the compare's last line, the PNGs that changed, and the scroll probe's two lines on `main` and on the branch.
- **Gates:** each exit code, and the main chunk's size.
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 14: Review, then merge.** Run the spec review, then the quality review, with fix rounds until both pass. Then merge as Conventions says. Keep `$SHOTS/m1-after`: it is M2's expected before-capture.

---

### Task M2: Reduced-motion CSS for the pills, the tick, the labels and the shimmers

Seven CSS motions survive `prefers-reduced-motion: reduce` on `main` (the Baseline's table, read from the dumps). Two causes cover them:

- **`*` selects no pseudo-elements.** The toggles' pills (`home/styles/core/shell.css:34-50`, `transform var(--home-animation-ms)`, 1.4 s), the remember-me tick (`auth/AuthPage.css:163-176`, 0.16 s) and the planner's environment pill (`app/styles/planner/interactions.css:26-42`, 0.36 s) are each a `::before` with its own `transition`. The reduced-motion blocks nearest them, `.home-stage *` (`forms-and-motion.css:309-315`), `.auth-form *` (`AuthPage.css:430-435`) and `.planner-setup-modal *` (`planner/motion.css:78-85`), select elements only. The login/sign-up toggle sits outside `.auth-form`, and `/auth` renders no `.home-stage`, so nothing at all reaches its pill.
- **An `!important` rule out-ranks the reduced-motion blocks** (root cause 3 of the research's six: higher specificity or `!important` defeating the intended rule). `home/preview/styles/layout/frame.css:118-123` gives the contents chips' labels `transition: … !important` at (0,2,0) and (0,4,0). Between two `!important` declarations specificity decides, so it beats `.home-stage *`'s (0,1,0); and it beats `preview/styles/responsive.css`'s non-important `transition: none` whatever the specificity. The only override is another `!important` with the same selectors, later in the order.
- **The three shimmers have no reduced-motion rule at all**, and where the rule goes is a load-order question (root cause 1, ties lost to load order). The first-load skeleton's shimmer (`dashboard/styles/glance-loading.css:82-93`) is in the main CSS chunk. MealView's and TipsView's (`MealView.css:174-185`, `TipsView.css:103-114`) are in their views' lazy chunks, which load after the main chunk, so an `animation: none` of equal specificity in a main-chunk sheet would lose to them. Each lazy sheet therefore carries its own block, after its shimmer. The main-chunk one goes into `dashboard/styles/responsive.css`'s existing block: `DashboardPage.css` imports `responsive.css` last, after `glance-loading.css`, and the built CSS confirms it lands later.

**What is deliberately not changed.**

- **No global reset.** The `*, *::before, *::after { animation-duration: .01ms !important; … }` safety net stays out. It cannot replace M1 (script) or the `frame.css` override (its `*` loses the `!important` specificity contest), so it would be in addition to every rule here, not instead of them. It would also change the computed `animation-*` and `transition-*` of every element in the app under reduced motion, so this task's compare could not list what it expects, which is what rule 7 requires. The research's other argument, that it would cut the Generating spinner to one iteration, does not hold: `home/preview/styles/responsive.css:305-307` already sets the spinner's `::after` to `animation: none` under reduced motion. That spinner is the only progress cue among the infinite animations, and this task leaves it exactly as it is (the compare checks).
- **Motion that only answers a hover or a press stays:** the nav's Preview button and `/auth`'s close button (`.home-page .ghost`'s transitions), and the login/sign-up toggle's two buttons (`forms-and-motion.css:137-139`). They are listed in "Not in this phase".

**Files:**

- Modify: `client/src/pages/home/styles/core/shell.css:53-56` (a reduced-motion block after the pill rules)
- Modify: `client/src/pages/auth/AuthPage.css:424-432` (the reduced-motion note and selector list)
- Modify: `client/src/app/styles/planner/motion.css:75-81` (the same)
- Modify: `client/src/pages/home/preview/styles/layout/frame.css:116-123` (a note, and a reduced-motion block after the labels' rule)
- Modify: `client/src/pages/home/preview/styles/responsive.css:282-283` and `client/src/pages/home/styles/forms-and-motion.css:301-306` (the notes that named the labels and pills as gaps)
- Modify: `client/src/pages/dashboard/styles/responsive.css:153-160` (the dashboard's reduced-motion block), `client/src/pages/dashboard/styles/glance-loading.css:81` (a note)
- Modify: `client/src/pages/dashboard/views/MealView.css:167` and the end of the file (`:422`); `client/src/pages/dashboard/views/TipsView.css:96` and the end (`:396`)

No JavaScript changes, so no statement, branch or function is added; the exact counts must stay at M1's (Step 6).

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/client-reduced-motion-css origin/main
npm run build > "$SCRATCH/b-m2-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/m2-before" > "$SCRATCH/m2-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/m1-after" "$SHOTS/m2-before"; echo "chain exit=$?"
node "$TOOLS/motion-left.mjs" "$SHOTS/m2-before" "^(desktop|phone)-(?!.*-motion|preview-personal-info)" > "$SCRATCH/m2-left-before.txt"
```

Expected: `exit=0` three times, the chain compare `identical`, and `m2-left-before.txt` listing the seven motions of the Baseline's M2 rows (pills, tick, planner pill, labels, three shimmers) plus the four hover rows.

- [ ] **Step 2: The pills, everywhere they are drawn**

In `client/src/pages/home/styles/core/shell.css`, after the rule at lines 53-56:

```css
.home-page .segmented.pos-1::before,
.home-page .unit-toggle.pos-1::before {
  transform: translateX(100%);
}
```

add:

```css
/* ---- Reduced motion ------------------------------------------------------ */
/* The pill moves under the chosen button at once. Every page that renders these toggles
   carries home-page, and no other reduced-motion block selects their ::before. */
@media (prefers-reduced-motion: reduce) {
  .home-page .segmented::before,
  .home-page .unit-toggle::before {
    transition: none;
  }
}
```

Same selectors as the rule that sets the transition, (0,2,1), later in the same file, so it wins. It covers the home stages, the walkthrough's copy of the form, and `/auth` (which carries `home-page`); `/plan` renders no toggle. The planner's environment toggle is also `.segmented`, but it renders through ModalPortal into `<body>`, outside every `.home-page`, so Step 4 handles it.

- [ ] **Step 3: The remember-me tick**

In `client/src/pages/auth/AuthPage.css`, replace lines 424-432:

```css
/* Turns off CSS animations and transitions on the form and everything in it: its width
   change, the sign-up fields' reveal and the checkbox. * selects no pseudo-elements, so the
   checkbox's tick (::before) still scales in and the unit toggles' pills (::before, from
   home/styles/core/shell.css) still slide. Outside the form, the login/sign-up toggle's pill
   still slides, its buttons keep their colour and hover transitions (forms-and-motion.css),
   and the close button keeps its hover transition. */
@media (prefers-reduced-motion: reduce) {
  .auth-form,
  .auth-form * {
```

with:

```css
/* Turns off CSS animations and transitions on the form, everything in it and their
   pseudo-elements: its width change, the sign-up fields' reveal, the checkbox and its tick.
   home/styles/core/shell.css stops the toggles' pills, the login/sign-up one outside the
   form included. Outside the form, the login/sign-up toggle's buttons keep their colour and
   hover transitions (forms-and-motion.css), and the close button keeps its hover transition. */
@media (prefers-reduced-motion: reduce) {
  .auth-form,
  .auth-form *,
  .auth-form *::before,
  .auth-form *::after {
```

The declarations are `!important`, so `.auth-form *::before` (0,1,1) beats the tick's normal (0,3,2) rule.

- [ ] **Step 4: The planner's environment pill**

In `client/src/app/styles/planner/motion.css` (it starts with a byte-order mark; keep it), replace lines 75-81:

```css
/* Turns off every CSS animation and transition on the setup modal, its backdrop and its
   descendants. A pseudo-element is not a descendant, so the environment toggle's pill
   (::before in interactions.css) still slides. */
@media (prefers-reduced-motion: reduce) {
  .planner-backdrop,
  .planner-setup-modal,
  .planner-setup-modal * {
```

with:

```css
/* Turns off every CSS animation and transition on the setup modal, its backdrop, its
   descendants and their pseudo-elements, the environment toggle's pill (::before in
   interactions.css) among them. */
@media (prefers-reduced-motion: reduce) {
  .planner-backdrop,
  .planner-setup-modal,
  .planner-setup-modal *,
  .planner-setup-modal *::before,
  .planner-setup-modal *::after {
```

- [ ] **Step 5: The contents labels, and the two notes that named these gaps**

In `client/src/pages/home/preview/styles/layout/frame.css` (byte-order mark; keep it), replace lines 116-123:

```css
/* This !important transition outranks the reduced-motion blocks in responsive.css and in
   home/styles/forms-and-motion.css, so the labels still fade and slide under reduced motion. */
.preview-stage-panel .preview-jump-label,
.preview-stage-panel .preview-side-tab .preview-jump-chip .preview-jump-label {
  transition:
    opacity var(--preview-motion-fast) var(--preview-motion-ease),
    transform 220ms var(--preview-motion-ease) !important;
}
```

with:

```css
/* This transition is !important, so it outranks the reduced-motion blocks in responsive.css
   and home/styles/forms-and-motion.css. The block below turns it off with the same
   selectors, since only a later !important declaration of equal specificity beats it. */
.preview-stage-panel .preview-jump-label,
.preview-stage-panel .preview-side-tab .preview-jump-chip .preview-jump-label {
  transition:
    opacity var(--preview-motion-fast) var(--preview-motion-ease),
    transform 220ms var(--preview-motion-ease) !important;
}

/* ---- Reduced motion ------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .preview-stage-panel .preview-jump-label,
  .preview-stage-panel .preview-side-tab .preview-jump-chip .preview-jump-label {
    transition: none !important;
  }
}
```

The file's header (lines 1-4) says its `!important` rules "keep … the labels' transition", which stays true outside reduced motion, so it is left alone.

In `client/src/pages/home/preview/styles/responsive.css`, replace lines 282-283 (as M1 left them):

```css
   inside .home-stage, with !important. Neither reaches the contents chips' labels, whose
   !important transition in layout/frame.css wins. The first rule below also makes
```

with:

```css
   inside .home-stage, with !important. Both lose to the contents chips' labels' !important
   transition, which layout/frame.css switches off itself. The first rule below also makes
```

In `client/src/pages/home/styles/forms-and-motion.css`, replace lines 301-306:

```css
/* Turns off CSS animations and transitions on .home-stage and every element in it, which
   covers each stage and the walkthrough. * selects no pseudo-elements,
   so the mode and unit toggles' pills (::before, core/shell.css) keep their transition;
   home/preview/styles/responsive.css stops the walkthrough's spinner and scan. The chips'
   labels keep the more specific !important transition home/preview/styles/layout/frame.css
   gives them. Outside .home-stage the nav's Preview button keeps its hover transition, and
```

with:

```css
/* Turns off CSS animations and transitions on .home-stage and every element in it, which
   covers each stage and the walkthrough. * selects no pseudo-elements, so core/shell.css
   stops the mode and unit toggles' pills itself, and home/preview/styles/responsive.css the
   walkthrough's spinner and scan. The chips' labels' more specific !important transition
   beats this block, so home/preview/styles/layout/frame.css switches it off. Outside
   .home-stage the nav's Preview button keeps its hover transition, and
```

- [ ] **Step 6: The three shimmers**

In `client/src/pages/dashboard/styles/responsive.css` (byte-order mark; keep it), replace lines 153-160:

```css
/* Opens the drawer and its backdrop without their entrance animations. Nothing else in the
   dashboard's stylesheets is switched off: the drawer buttons' hover transition, the views'
   card and pill hover transitions and all three loading skeletons' shimmers still run. */
@media (prefers-reduced-motion: reduce) {
  .drawer-backdrop,
  .drawer {
    animation: none;
  }
```

with:

```css
/* Opens the drawer and its backdrop without their entrance animations, and holds the
   first-load skeleton's shimmer (glance-loading.css) still; MealView.css and TipsView.css
   hold their own skeletons'. The drawer buttons' hover transition and the views' card and
   pill hover transitions still run. */
@media (prefers-reduced-motion: reduce) {
  .drawer-backdrop,
  .drawer {
    animation: none;
  }

  .dashboard-skeleton-bar,
  .dashboard-skeleton-chip,
  .dashboard-skeleton-block {
    animation: none;
  }
```

In `client/src/pages/dashboard/styles/glance-loading.css` (byte-order mark; keep it), replace line 81:

```css
/* The shimmer: a gradient wider than the element, slid across it on a loop. */
```

with:

```css
/* The shimmer: a gradient wider than the element, slid across it on a loop. responsive.css
   holds it still under reduced motion. */
```

In `client/src/pages/dashboard/views/MealView.css`, replace line 167, `/* No reduced-motion rule stops this shimmer. */`, with:

```css
/* The reduced-motion block at the end of this file holds the shimmer still. */
```

and append at the end of the file, after the closing `}` of the smallest-screens block (line 422):

```css
/* ---- Reduced motion ------------------------------------------------------ */
/* Here rather than in the dashboard's responsive.css: this sheet loads later, in the view's
   chunk, so a rule there would lose the tie with the shimmer above. */
@media (prefers-reduced-motion: reduce) {
  .meal-view .meal-skeleton-card {
    animation: none;
  }
}
```

In `client/src/pages/dashboard/views/TipsView.css`, replace line 96 the same way, and append after line 396:

```css
/* ---- Reduced motion ------------------------------------------------------ */
/* Here rather than in the dashboard's responsive.css: this sheet loads later, in the view's
   chunk, so a rule there would lose the tie with the shimmer above. */
@media (prefers-reduced-motion: reduce) {
  .tips-view .tips-skeleton-card {
    animation: none;
  }
}
```

- [ ] **Step 7: Check the order in the built CSS, and commit**

```bash
npx prettier --write client/src/pages/home/styles/core/shell.css client/src/pages/auth/AuthPage.css client/src/app/styles/planner/motion.css client/src/pages/home/preview/styles/layout/frame.css client/src/pages/home/preview/styles/responsive.css client/src/pages/home/styles/forms-and-motion.css client/src/pages/dashboard/styles/responsive.css client/src/pages/dashboard/styles/glance-loading.css client/src/pages/dashboard/views/MealView.css client/src/pages/dashboard/views/TipsView.css
for f in client/src/app/styles/planner/motion.css client/src/pages/home/preview/styles/layout/frame.css client/src/pages/dashboard/styles/responsive.css client/src/pages/dashboard/styles/glance-loading.css; do printf "%s " "$f"; head -c 3 "$f" | od -An -tx1; done
npm run build > "$SCRATCH/b-m2.txt" 2>&1; echo "build exit=$?"
CSS=$(ls client/dist/assets/index-*.css)
for pat in '.home-page .segmented:before,.home-page .unit-toggle:before{' '.dashboard-skeleton-bar,.dashboard-skeleton-chip,.dashboard-skeleton-block{' '.preview-stage-panel .preview-jump-label,.preview-stage-panel .preview-side-tab .preview-jump-chip .preview-jump-label{'; do printf "%.40s " "$pat"; grep -bo -F "$pat" "$CSS" | cut -d: -f1 | tr '\n' ' '; echo; done
grep -o "@media (prefers-reduced-motion:reduce){.auth-form[^}]*}" "$CSS"
grep -o "@media (prefers-reduced-motion:reduce){.planner-backdrop[^}]*}" "$CSS"
for v in MealView TipsView; do f=$(ls client/dist/assets/$v-*.css); printf "%s " $v; grep -bo -F "skeleton-card{" "$f" | cut -d: -f1 | tr '\n' ' '; grep -o "@media (prefers-reduced-motion:reduce){[^}]*skeleton-card[^}]*}" "$f"; done
```

Expected: every byte-order mark line prints `ef bb bf`, `build exit=0`, and each of the first three lines shows two offsets, the second (the reduced-motion rule) larger than the first (the rule it overrides). The scratch build printed `37347 37849`, `20861 31530` and `59129 59413`; the numbers move with any earlier change, the order must not. Lightning CSS writes `.auth-form *::before` as `.auth-form :before`, which selects the same pseudo-elements, so the two `@media` lines read `…,.auth-form :before,.auth-form :after{transition:none!important;animation:none!important}` and the planner's likewise. Each lazy sheet shows the skeleton card's offset (MealView's shimmer rule, then its `.meal-skeleton-card` again only inside the `@media` at the end; the scratch build had `2189 5364` and TipsView `1172 5095`), followed by the `@media (prefers-reduced-motion:reduce){… skeleton-card{animation:none}` text.

```bash
git add client/src
git commit -F - <<'EOF'
fix(client): stop the pills, the tick, the labels and the shimmers under reduced motion

The toggles' pills, the remember-me tick and the planner's environment
pill are ::before pseudo-elements, which the reduced-motion blocks'
universal selectors never matched. The contents chips' labels kept an
!important transition that out-ranked every reduced-motion rule. The
three loading skeletons had no reduced-motion rule at all; the two in
lazy view chunks get their own, because a main-chunk rule would lose
the tie with them.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 8: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/m2-after" > "$SCRATCH/m2-cap.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/motion-left.mjs" "$SHOTS/m2-after" "^(desktop|phone)-(?!.*-motion|preview-personal-info)" > "$SCRATCH/m2-left-after.txt"; grep -v "^==" "$SCRATCH/m2-left-after.txt" | sort | uniq -c
```

Expected: only the hover rows remain in `m2-left-after.txt`: `button.ghost.home-preview-btn`, `/auth`'s two toggle buttons (`button` and `button.active`, `color, transform 0.32s, 0.25s`), `button.ghost.icon-button.auth-close`, and the two `button.meal-course-pill` rows.

Write `$SHOTS/m2-expect.json`:

```json
[
  {
    "kind": "style",
    "captures": "^(desktop|tablet|phone)-(personal|personal-advanced|preview-generate|auth-login|auth-signup)$",
    "target": "::before (div[.]segmented|span[.]unit-toggle)[.]",
    "prop": "^transition-duration$",
    "from": "1.4s",
    "to": "0s"
  },
  {
    "kind": "style",
    "captures": "^(desktop|tablet|phone)-(personal|personal-advanced|preview-generate|auth-login|auth-signup)$",
    "target": "::before (div[.]segmented|span[.]unit-toggle)[.]",
    "prop": "^transition-property$",
    "from": "transform",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|tablet|phone)-(personal|personal-advanced|preview-generate|auth-login|auth-signup)$",
    "target": "::before (div[.]segmented|span[.]unit-toggle)[.]",
    "prop": "^transition-timing-function$",
    "from": "cubic-bezier(0.22, 1, 0.36, 1)",
    "to": "ease"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-planner$",
    "target": "::before div[.]segmented[.]planner-env-toggle",
    "prop": "^transition-duration$",
    "from": "0.36s",
    "to": "0s"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-planner$",
    "target": "::before div[.]segmented[.]planner-env-toggle",
    "prop": "^transition-property$",
    "from": "transform",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-planner$",
    "target": "::before div[.]segmented[.]planner-env-toggle",
    "prop": "^transition-timing-function$",
    "from": "cubic-bezier(0.22, 1, 0.36, 1)",
    "to": "ease"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-auth-login$",
    "target": "::before input$",
    "prop": "^transition-duration$",
    "from": "0.16s",
    "to": "0s"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-auth-login$",
    "target": "::before input$",
    "prop": "^transition-property$",
    "from": "transform",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-(auth-login|auth-signup|dash-planner)$",
    "target": "::(before|after) ",
    "prop": "^transition-property$",
    "from": "all",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-preview-(generate|result|dashboard|scrolled)$",
    "target": " span[.]preview-jump-label$",
    "prop": "^transition-behavior$",
    "from": "normal, normal",
    "to": "normal"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-preview-(generate|result|dashboard|scrolled)$",
    "target": " span[.]preview-jump-label$",
    "prop": "^transition-delay$",
    "from": "0s, 0s",
    "to": "0s"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-preview-(generate|result|dashboard|scrolled)$",
    "target": " span[.]preview-jump-label$",
    "prop": "^transition-duration$",
    "from": "0.16s, 0.22s",
    "to": "0s"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-preview-(generate|result|dashboard|scrolled)$",
    "target": " span[.]preview-jump-label$",
    "prop": "^transition-property$",
    "from": "opacity, transform",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-preview-(generate|result|dashboard|scrolled)$",
    "target": " span[.]preview-jump-label$",
    "prop": "^transition-timing-function$",
    "from": "cubic-bezier(0.22, 0.8, 0.2, 1), cubic-bezier(0.22, 0.8, 0.2, 1)",
    "to": "ease"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-loading$",
    "target": " (div|span)[.]dashboard-skeleton-(bar|chip|block)",
    "prop": "^animation-name$",
    "from": "dash-skeleton-shimmer",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-loading$",
    "target": " (div|span)[.]dashboard-skeleton-(bar|chip|block)",
    "prop": "^animation-duration$",
    "from": "1.15s",
    "to": "0s"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-meal-loading$",
    "target": " div[.]meal-skeleton-card$",
    "prop": "^animation-name$",
    "from": "meal-skeleton-shimmer",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-tips-loading$",
    "target": " div[.]tips-skeleton-card$",
    "prop": "^animation-name$",
    "from": "tips-skeleton-shimmer",
    "to": "none"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-(meal|tips)-loading$",
    "target": " div[.](meal|tips)-skeleton-card$",
    "prop": "^animation-duration$",
    "from": "1.1s",
    "to": "0s"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-(loading|meal-loading|tips-loading)$",
    "target": " (div|span)[.](dashboard-skeleton-(bar|chip|block)|meal-skeleton-card|tips-skeleton-card)",
    "prop": "^animation-iteration-count$",
    "from": "infinite",
    "to": "1"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-dash-(loading|meal-loading|tips-loading)$",
    "target": " (div|span)[.](dashboard-skeleton-(bar|chip|block)|meal-skeleton-card|tips-skeleton-card)",
    "prop": "^animation-timing-function$",
    "from": "linear",
    "to": "ease"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/m2-before" "$SHOTS/m2-after" "$SHOTS/m2-expect.json" > "$SCRATCH/m2-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/m2-cmp.txt"
```

Expected: `compare exit=0`, last line `955 difference(s); 0 unexpected; 0 expected but absent`, as the scratch run printed. **No PNG and no box changes anywhere**: the captures settle every animation before the screenshot, so a stopped transition and a finished one draw the same frame. All 955 are `transition-*` or `animation-*` longhands going to their initial values, in 25 reduced-motion captures:

| Captures (desktop, phone; tablet where captured)                                 | Element                                                                                                    | Change                                                                                                                       |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `personal`, `personal-advanced`, `preview-generate`, `auth-login`, `auth-signup` | `.segmented::before`, `.unit-toggle::before`                                                               | `transition-duration` 1.4s → 0s, `-property` transform → none, `-timing-function` cubic-bezier(0.22, 1, 0.36, 1) → ease      |
| `dash-planner`                                                                   | `.planner-env-toggle::before`                                                                              | the same three, from 0.36s                                                                                                   |
| `auth-login`                                                                     | the tick, `input::before`                                                                                  | `transition-duration` 0.16s → 0s, `-property` transform → none                                                               |
| `auth-login`, `auth-signup`, `dash-planner`                                      | every other `::before` and `::after` under `.auth-form` and `.planner-setup-modal`, none of which is drawn | `transition-property` all → none (the initial value of a pseudo-element that has no transition is `all`, with a 0s duration) |
| `preview-generate`, `preview-result`, `preview-dashboard`, `preview-scrolled`    | the four `.preview-jump-label`                                                                             | all five `transition-*` longhands to their initial values (`none`, `0s`, `ease`, `normal`)                                   |
| `dash-loading`, `dash-meal-loading`, `dash-tips-loading`                         | the seven dashboard skeleton pieces and the three cards in each view                                       | `animation-name` → none, `-duration` → 0s, `-iteration-count` infinite → 1, `-timing-function` linear → ease                 |

Unchanged, and checked by the same compare: every `-motion` capture (so nothing changes without the preference), `preview-personal-info`, the spinner's `::after` in `preview-generate`, every PNG and every box.

- [ ] **Step 9: Coverage unchanged, and the gates**

Run the exact-coverage commands. Expected: exactly M1's counts (4906/4964, 3218/3428, 1014/1024, 4472/4496) and 2441 tests. Then the gates from Conventions. The axe scan's login, sign-up, dashboard and modal pages are among those whose computed styles change, but only in `transition-*` and `animation-*` longhands, which axe does not read; the scan must still report zero violations.

- [ ] **Step 10: Push and open the PR**

```bash
git push -u origin fix/client-reduced-motion-css
gh pr create --draft --base main --title "fix(client): stop the pills, the tick, the labels and the shimmers under reduced motion" --body-file "$SCRATCH/pr-m2.md"
gh pr ready
gh pr checks --watch
```

`pr-m2.md` outline:

- **What changed:** each rule, with the cause it answers (pseudo-elements, `!important`, no rule) and why each sits where it does (same file and selectors; the lazy chunks).
- **What did not:** the global reset and why; the spinner, already stopped and unchanged; the hover transitions left.
- **Captures:** the compare's last line; `motion-left.mjs` before and after.
- **Coverage:** unchanged, with the counts.
- **Gates:** each exit code.
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 11: Review, then merge.** As Conventions says. Keep `$SHOTS/m2-after` for K1.

---

### Task K1: The walkthrough's contents lane stays fixed to the viewport

The contents lane, `.preview-side-tab`, is `position: fixed` (`home/preview/styles/layout/frame.css:67-88`, pinned with `!important` at `:101-110`). `styles/base.css:173-179` gives every `.panel` `backdrop-filter: blur(8px)`, and the walkthrough's root is `<section className="panel preview-stage-panel stage-panel">` (`PreviewStage.jsx:269-273`). A `backdrop-filter` makes its element the containing block of every `position: fixed` descendant, so the lane is fixed to the root, not to the viewport, and scrolls away with it. This is root cause 6 of the research's six (a containing-block side effect). `core/layout.css:211-234` strips transforms, filters and `will-change` from the stage and its children for exactly this reason, but not `backdrop-filter`.

On `96bee73` the lane is misplaced in every chapter, not only after a scroll, because its `left: 0` and `top: clamp(47px, 11.1vh, 128px)` are measured from the root instead of the viewport. The baseline's `rects.json` files: at 1440×900, with the root at (24, 107), the lane is at `[24, 206.89]` where a viewport-fixed lane sits at `[0, 99.89]`; at 390×844, root at (16, 97.5) before any scroll, the lane is at `[16, 191.17]` instead of `[0, 93.67]`. In `phone-preview-scrolled` (the Result chapter after `scrollBy(0, 400)`, which the page clamps to 194) the root is at top -74.5 and the lane at 19.17, sliding up with the page. #188's "panel top 331, lane 442 after a 400 px scroll" came from a minimal copy, not from the app, and missed that the offset is there before any scroll.

**The fix and where it goes.** `.preview-stage-panel { backdrop-filter: none }` alone would not work: it ties `.panel` at (0,1,0), and `styles/base.css` is last in the main CSS chunk (`main.jsx` imports `styles/index.css` after `App`), so `.panel` wins the tie. `layout/base.css:61-66` already has the walkthrough's own, more specific copy for exactly this, `.home-page .preview-stage-panel.panel` (0,3,0), which clears the background, border, shadow and padding `.panel` gives the root. The declaration joins it. It needs no `!important`: nothing more specific sets `backdrop-filter` on the root (`git grep -n "backdrop-filter" -- "client/src/**/*.css"` lists every rule; none other matches it). The root's background is already transparent, so the blur had nothing to draw except the black page behind it.

**Files:**

- Modify: `client/src/pages/home/preview/styles/layout/base.css:58-66` (byte-order mark; keep it)
- Modify: `client/src/pages/home/preview/styles/layout/frame.css:64-66` (the lane's note; byte-order mark)
- Modify: `client/src/pages/home/styles/core/layout.css:211-214` (the stage's note)

CSS only: no statement, branch or function changes.

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/client-walkthrough-lane origin/main
npm run build > "$SCRATCH/b-k1-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/k1-before" > "$SCRATCH/k1-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/m2-after" "$SHOTS/k1-before"; echo "chain exit=$?"
cat "$SHOTS/k1-before/phone-preview-scrolled.rects.json"
```

Expected: `identical`, and `".preview-side-tab": [[16, 19.17, 156.75, 160]]` (the file is pretty-printed one number per line).

- [ ] **Step 2: Clear the root's backdrop filter**

In `client/src/pages/home/preview/styles/layout/base.css`, replace lines 58-66:

```css
/* The rule above again, more specific: it clears the background, border, shadow and padding
   that styles/base.css's .panel and core/shell.css's .home-page .panel give the root.
   .panel's border-radius and backdrop-filter still apply (see frame.css). */
.home-page .preview-stage-panel.panel {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}
```

with:

```css
/* The rule above again, more specific: it clears the background, border, shadow and padding
   that styles/base.css's .panel and core/shell.css's .home-page .panel give the root, and
   .panel's backdrop-filter, which would make the root the containing block of the contents
   lane's position: fixed (frame.css). .panel's border-radius still applies. */
.home-page .preview-stage-panel.panel {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  backdrop-filter: none;
}
```

- [ ] **Step 3: The two notes that said the lane scrolls**

In `client/src/pages/home/preview/styles/layout/frame.css`, replace lines 64-66:

```css
/* position: fixed, but not to the viewport: styles/base.css's .panel gives the walkthrough's
   root backdrop-filter, which makes the root its containing block, so the lane scrolls with
   the walkthrough. */
```

with:

```css
/* position: fixed to the viewport, so the lane stays put while the page scrolls. A
   transform, filter or backdrop-filter on the stage or the walkthrough's root would make that
   element its containing block instead: core/layout.css and layout/base.css clear them. */
```

In `client/src/pages/home/styles/core/layout.css`, replace lines 211-214:

```css
/* The walkthrough stage and its panel get no animation, transform, filter or will-change,
   any of which would make them the containing block of the contents lane's position: fixed.
   styles/base.css's .panel still gives the panel backdrop-filter, which does the same, so the
   lane scrolls with the panel (see home/preview/styles/layout/frame.css). */
```

with:

```css
/* The walkthrough stage and its panel get no animation, transform, filter or will-change,
   any of which would make them the containing block of the contents lane's position: fixed
   (home/preview/styles/layout/frame.css). home/preview/styles/layout/base.css clears the
   backdrop-filter styles/base.css's .panel gives the panel, which would do the same. */
```

- [ ] **Step 4: Build, check the cascade, commit**

```bash
npx prettier --write client/src/pages/home/preview/styles/layout/base.css client/src/pages/home/preview/styles/layout/frame.css client/src/pages/home/styles/core/layout.css
for f in client/src/pages/home/preview/styles/layout/base.css client/src/pages/home/preview/styles/layout/frame.css; do printf "%s " "$f"; head -c 3 "$f" | od -An -tx1; done
npm run build > "$SCRATCH/b-k1.txt" 2>&1; echo "build exit=$?"
grep -o "\.home-page \.preview-stage-panel\.panel{[^}]*}" client/dist/assets/index-*.css
git add client/src
git commit -F - <<'EOF'
fix(client): keep the walkthrough's contents lane fixed to the viewport

styles/base.css gives every .panel a backdrop-filter, which made the
walkthrough's root the containing block of its position: fixed contents
lane, so the lane scrolled away with the page. The walkthrough's own,
more specific copy of the panel rule now clears it.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: both marks `ef bb bf`, `build exit=0`, and the built rule ending `…padding:0!important;backdrop-filter:none}`.

- [ ] **Step 5: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/k1-after" > "$SCRATCH/k1-cap.txt" 2>&1; echo "capture exit=$?"
cat "$SHOTS/k1-after/phone-preview-scrolled.rects.json"
```

Write `$SHOTS/k1-expect.json`:

```json
[
  {
    "kind": "png",
    "captures": "^(desktop|phone)-preview-(personal-info|generate|result|dashboard|scrolled)([.]viewport)?$"
  },
  {
    "kind": "style",
    "captures": "^(desktop|phone)-preview-",
    "target": " section[.]panel[.]preview-stage-panel[.]stage-panel$",
    "prop": "^backdrop-filter$",
    "from": "blur(8px)",
    "to": "none"
  },
  {
    "kind": "rect",
    "captures": "^desktop-preview-",
    "target": "^[.]preview-side-tab$",
    "to": "[[0,99.89,156.75,149]]"
  },
  {
    "kind": "rect",
    "captures": "^phone-preview-",
    "target": "^[.]preview-side-tab$",
    "to": "[[0,93.67,156.75,160]]"
  },
  {
    "kind": "style",
    "captures": "^desktop-preview-",
    "target": " div[.]preview-side-tab$",
    "prop": "^(bottom|inset-block-end)$",
    "from": "518.109px",
    "to": "651.109px"
  },
  {
    "kind": "style",
    "captures": "^desktop-preview-",
    "target": " div[.]preview-side-tab$",
    "prop": "^(right|inset-inline-end)$",
    "from": "1235.25px",
    "to": "1283.25px"
  },
  {
    "kind": "style",
    "captures": "^phone-preview-",
    "target": " div[.]preview-side-tab$",
    "prop": "^(bottom|inset-block-end)$",
    "from": "458.328px",
    "to": "590.328px"
  },
  {
    "kind": "style",
    "captures": "^phone-preview-",
    "target": " div[.]preview-side-tab$",
    "prop": "^(right|inset-inline-end)$",
    "from": "201.25px",
    "to": "233.25px"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/k1-before" "$SHOTS/k1-after" "$SHOTS/k1-expect.json" > "$SCRATCH/k1-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/k1-cmp.txt"
```

Expected: `compare exit=0`, last line `72 difference(s); 0 unexpected; 0 expected but absent`, as the scratch run printed. Every difference is in the ten walkthrough captures and the two `preview-scrolled.viewport` PNGs:

| Captures                                                                             | Changes                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all five walkthrough states, desktop and phone                                       | the PNG; `.preview-stage-panel` `backdrop-filter`: `blur(8px)` → `none`                                                                                                                                                     |
| desktop, at the top of the page (`personal-info`, `generate`, `result`, `dashboard`) | the lane's box `[24, 206.89, 156.75, 149]` → `[0, 99.89, 156.75, 149]`: it was offset by the root's own left (24) and top (107), and now sits at `left: 0` and `clamp(47px, 11.1vh, 128px)` of the viewport                 |
| desktop `preview-scrolled` (the page scrolls only 22 px)                             | `[24, 184.89, …]` → `[0, 99.89, …]`                                                                                                                                                                                         |
| phone, at the top                                                                    | `[16, 191.17, 156.75, 160]` → `[0, 93.67, 156.75, 160]`                                                                                                                                                                     |
| phone `preview-scrolled` (scrolled 194)                                              | `[16, 19.17, …]` → `[0, 93.67, …]`: the lane no longer slides up with the page                                                                                                                                              |
| the same lanes                                                                       | the resolved `bottom` / `inset-block-end` and `right` / `inset-inline-end`, which follow the containing block: desktop 518.109px → 651.109px and 1235.25px → 1283.25px, phone 458.328px → 590.328px and 201.25px → 233.25px |

Nothing outside the walkthrough changes: the home stages, `/auth` and the dashboard keep their `.panel` blur, and no other element of the walkthrough moves. So the bug was larger than the research said: the lane was misplaced in every chapter, not only after a scroll, by the root's offset from the viewport.

- [ ] **Step 6: Coverage unchanged, and the gates.** The exact counts are M1's; then the gates from Conventions.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin fix/client-walkthrough-lane
gh pr create --draft --base main --title "fix(client): keep the walkthrough's contents lane fixed to the viewport" --body-file "$SCRATCH/pr-k1.md"
gh pr ready
gh pr checks --watch
```

`pr-k1.md` outline: the containing-block cause and the rule it comes from; why the declaration goes in `.home-page .preview-stage-panel.panel` (the tie with `.panel`, which loads last); the lane's box before and after on phone and desktop, with `preview-scrolled.viewport.png` from both sides attached; the compare's last line; coverage unchanged; gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 8: Review, then merge.** Keep `$SHOTS/k1-after` for K2.

---

### Task K2: The phone form layouts

Two narrow-screen one-column rules never apply.

- **The home stage's personal form** (`home/styles/responsive.css:154-156`, inside `@media (max-width: 720px)`): `.personal-form { grid-template-columns: 1fr }`. The form is `<form className="form personal-form …">` (`HomePersonalStage.jsx:86`). In basic mode `styles/base.css:196-201`'s `.form` (`repeat(auto-fit, minmax(220px, 1fr))`) ties it at (0,1,0) and comes later in the bundle; the auto-fit still reaches one column at 390 px, so basic mode looks right by accident. In advanced mode `forms-and-motion.css:11-13`'s 980 px `.personal-form.advanced-mode` (0,2,0) is more specific and keeps two columns, while the same 720 px block puts each basic field in `grid-column: 1`, so they fill half the form. Root causes 1 (a tie lost to load order) and 3 (a more specific rule). Baseline, `phone-personal-advanced`: the form is `144px 144px`, and Name, Age, Height, Weight and Sex are each 144 px wide in a 304 px form (#188 reported 149 px at 400 px).
- **`/auth`'s height fields** (`auth/AuthPage.css:418-420`, inside `@media (max-width: 520px)`): `.height-split { grid-template-columns: 1fr }`. `/auth` carries `home-page`, AuthPage.css is the first sheet in the main chunk, and `forms-and-motion.css:186-191`'s unconditional `.height-split` ties it at (0,1,0) and comes later, so the feet and inches stay side by side. Root causes 2 (home sheets bleeding into /auth) and 1. Baseline, `phone-auth-signup`: `157px 157px` (#187 reported 162 px at 400 px).

**The fix: name an ancestor, rather than move anything.** `.home-stage-personal .personal-form` (0,2,0) beats `.form` on specificity and beats the 980 px advanced-mode rule on order (forms-and-motion.css comes before responsive.css in `HomePage.css`, and K3's move keeps it in forms-and-motion.css). `.home-stage-personal` is the stage's own wrapper (`HomePage.jsx:175-178`, `home-stage home-stage-${homeStage}`), so the walkthrough's read-only copy of the form, `.preview-personal-form`, which is also `.personal-form` and also in advanced mode, keeps its two columns (132 px each at 390 px): it is a scaled demo with its own narrow-screen rules in `home/preview/styles/`, and K2 is about the form a visitor fills in. `.auth-form .height-split` (0,2,0) is AuthPage's own scope: the height fields render inside `<form className="auth-form …">`.

**Files:**

- Modify: `client/src/pages/home/styles/responsive.css:54-58` (the narrow-screen note) and `:154-156`
- Modify: `client/src/pages/auth/AuthPage.css:319-321` (the height fields' note) and `:418-420`

M2 also edits `AuthPage.css`, further down (its reduced-motion block), so these line numbers hold after M2 merges. CSS only: no statement, branch or function changes.

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/client-phone-forms origin/main
npm run build > "$SCRATCH/b-k2-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/k2-before" > "$SCRATCH/k2-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/k1-after" "$SHOTS/k2-before"; echo "chain exit=$?"
node "$TOOLS/props.mjs" "$SHOTS/k2-before/phone-personal-advanced.styles.json.gz" "form[.]form[.]personal-form" grid-template-columns
node "$TOOLS/props.mjs" "$SHOTS/k2-before/phone-auth-signup.styles.json.gz" "div[.]height-split$" grid-template-columns
```

Expected: `identical`, then `grid-template-columns=144px 144px` and `grid-template-columns=157px 157px`.

- [ ] **Step 2: The personal stage's form**

In `client/src/pages/home/styles/responsive.css`, replace lines 54-58:

```css
/* The personal form's one-column rule never applies: in basic mode styles/base.css's .form
   ties it and loads later (its auto-fit still drops to one column on the narrowest screens),
   and in advanced mode forms-and-motion.css's two-column rule is more specific, so the fields
   this block puts in column 1 fill half the form. .header-top, .header-left and .auth-actions
   match nothing. */
```

with:

```css
/* The personal stage's form goes to one column in both modes. Its selector names the stage,
   to outrank styles/base.css's .form (which ties .personal-form and loads later) and
   forms-and-motion.css's two-column advanced-mode rule. The walkthrough's copy of the form
   keeps its two columns. .header-top, .header-left and .auth-actions match nothing. */
```

and lines 154-156:

```css
.personal-form {
  grid-template-columns: 1fr;
}
```

with:

```css
.home-stage-personal .personal-form {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 3: `/auth`'s height fields**

In `client/src/pages/auth/AuthPage.css`, replace lines 319-321:

```css
/* home/styles/forms-and-motion.css has the same four selectors and comes later in the
   bundle, so where the two differ its values win, and its .height-split also beats the
   one-column .height-split in this file's smallest-screens block. On this page .height-unit
```

with:

```css
/* home/styles/forms-and-motion.css has the same four selectors and comes later in the
   bundle, so where the two differ its values win. The smallest-screens block's one-column
   rule is scoped to .auth-form, which out-ranks its .height-split. On this page .height-unit
```

and lines 418-420:

```css
.height-split {
  grid-template-columns: 1fr;
}
```

with:

```css
.auth-form .height-split {
  grid-template-columns: 1fr;
}
```

- [ ] **Step 4: Build, check, commit**

```bash
npx prettier --write client/src/pages/home/styles/responsive.css client/src/pages/auth/AuthPage.css
npm run build > "$SCRATCH/b-k2.txt" 2>&1; echo "build exit=$?"
grep -c "\.home-stage-personal \.personal-form{grid-template-columns:1fr}" client/dist/assets/index-*.css
grep -c "\.auth-form \.height-split{grid-template-columns:1fr}" client/dist/assets/index-*.css
git grep -n "home-stage-personal\|height-split" e2e/
git add client/src
git commit -F - <<'EOF'
fix(client): stack the personal form and the height fields on phones

Both one-column rules tied a rule that loads later or out-ranked them:
styles/base.css's .form and forms-and-motion.css's advanced-mode
columns for the personal form, forms-and-motion.css's .height-split on
/auth. Each now names its own ancestor.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `build exit=0`, `1` and `1`, and no `e2e/` match.

- [ ] **Step 5: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/k2-after" > "$SCRATCH/k2-cap.txt" 2>&1; echo "capture exit=$?"
```

Write `$SHOTS/k2-expect.json`:

```json
[
  { "kind": "png", "captures": "^phone-(personal-advanced|auth-signup)$" },
  {
    "kind": "style",
    "captures": "^phone-personal-advanced$",
    "target": " form[.]form[.]personal-form[.]advanced-mode$",
    "prop": "^grid-template-columns$",
    "from": "144px 144px",
    "to": "304px"
  },
  {
    "kind": "style",
    "captures": "^phone-auth-(login|signup)$",
    "target": " div[.]height-split$",
    "prop": "^grid-template-columns$",
    "from": "157px 157px",
    "to": "324px"
  },
  {
    "kind": "style",
    "captures": "^phone-auth-(login|signup)$",
    "target": " div[.]height-split$",
    "prop": "^grid-template-rows$",
    "from": "43px",
    "to": "43px 43px"
  },
  {
    "kind": "style",
    "captures": "^phone-(personal-advanced|auth-signup|auth-login)$",
    "prop": "^(width|inline-size|height|block-size|grid-template-columns|grid-template-rows|perspective-origin|transform-origin|left|inset-inline-start)$"
  },
  { "kind": "rect", "captures": "^phone-auth-(login|signup)$", "target": "^[.]height-split$" },
  {
    "kind": "rect",
    "captures": "^phone-personal-advanced$",
    "target": "^[.](height-split|personal-form label)$"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/k2-before" "$SHOTS/k2-after" "$SHOTS/k2-expect.json" > "$SCRATCH/k2-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/k2-cmp.txt"
```

Expected: `compare exit=0`, last line `187 difference(s); 0 unexpected; 0 expected but absent`, as the scratch run printed. All in three phone captures:

| Capture                   | Changes                                                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phone-personal-advanced` | the PNG (45110 pixels); the form's `grid-template-columns` `144px 144px` → `304px`; Name, Age, Height, Weight and Sex go from 144 px to 304 px wide (`personal-form label` boxes), the height pair from 166.53 to 304 px, and the widths, tracks and origins of their inputs and unit toggles follow |
| `phone-auth-signup`       | the PNG, which grows 53 px taller; `.height-split` `157px 157px` → `324px`, rows `43px` → `43px 43px`, box height 43 → 96; the sign-up fields, the form, the page and `<html>` each 53 px taller                                                                                                     |
| `phone-auth-login`        | the same `.height-split` change in the sign-up fields, which stay mounted, collapsed, in login mode; no PNG change                                                                                                                                                                                   |

The expectation file pins the two `grid-template-columns` changes exactly, and lets the layout-derived properties (`width`, `inline-size`, `height`, `block-size`, grid tracks, `left` and the two origins) follow anywhere in those three captures only. `phone-personal` (basic mode), already one column through `.form`'s auto-fit, does not change, nor does the walkthrough's form in any `phone-preview-*` capture, nor any desktop or tablet capture: both rules sit inside their narrow-screen blocks.

- [ ] **Step 6: Coverage unchanged, and the gates.** The axe scan's sign-up form is one of the changed pages (at Desktop Chrome's 1280 px it is above the 520 px breakpoint, so its layout does not change there); it must still report zero violations.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin fix/client-phone-forms
gh pr create --draft --base main --title "fix(client): stack the personal form and the height fields on phones" --body-file "$SCRATCH/pr-k2.md"
gh pr ready
gh pr checks --watch
```

`pr-k2.md` outline: the two ties and the specificity each new selector has; why the walkthrough's copy is left at two columns; before and after `grid-template-columns` and the phone PNGs; the compare's last line; coverage unchanged; gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 8: Review, then merge.** Keep `$SHOTS/k2-after` for K3.

---

### Task K3: The advanced fields between 721 and 980 px, and the workout modal's metrics row

- **The advanced fields stay in three columns down to 721 px.** `home/styles/forms-and-motion.css:10-29` is `@media (max-width: 980px)`, whose last rule is `.advanced-fields-inner { grid-template-columns: repeat(2, minmax(0, 1fr)) }`. The unconditional `.advanced-fields-inner` (`:60-66`, three columns) has the same specificity and comes after it in the same file, so it wins at every width until `home/styles/responsive.css`'s 720 px block. Root cause 1 (a tie lost to order), within one file. Baseline, `tablet-personal-advanced` (900 px): the form is `384.797px 384.797px` (the media block's other rules do apply, being more specific), and `.advanced-fields-inner` is `251.188px 251.203px 251.203px` beneath it.
- **The workout modal's Sets, Reps and Intensity row is 22.7 px wide.** `dashboard/styles/workout-modal.css:136-140` gives `.dashboard-workout-grid` twelve columns; `.dashboard-workout-grid-exercise` (`:166-169`) keeps them; the exercises field spans all twelve (`.dashboard-workout-field-full`, `span 12`), but the metrics grid inside, `<div className="dashboard-workout-grid dashboard-workout-grid-metrics">` (`DashboardWorkoutModal.jsx:121`), sets no `grid-column`, so it takes one track. Root cause 5 (a layout that is mis-defined rather than out-ranked). Baseline, `desktop-dash-workout-modal`: the metrics grid is `width: 22.6719px` with tracks `72px 72px 150px`, so its three fields overflow a 23 px box at their minimum widths instead of filling the section (#187 estimated "about 23 px" by arithmetic). Below 720 px `dashboard/styles/responsive.css:84-89` makes both grids one column, which hides it, so `phone-dash-workout-modal` is the control: it must not change. At 900 px the modal's two sections stack (`workout-modal.css:215-220`), and the row is still one track of twelve, so `tablet-dash-workout-modal` changes too.

**The fixes.**

- **Move the 980 px block below the unconditional rule**, inside the same file, so the tie goes the other way. The block's other four rules are (0,2,0) or (0,3,0) and apply today; nothing between their old and new positions sets `grid-template-columns` or `grid-column` on the elements they match (the rules in between style `.advanced-fields-wrap`, which only `grid-column: 1 / -1` touches, on a different element), so moving them changes nothing for them, and the compare checks that. This is the one deliberate rule move in the phase (Conventions, "Moving CSS rules").
- **Give the metrics grid `grid-column: 1 / -1`** in its own rule, so it spans every track its parent has: twelve above 720 px, one below.

**Files:**

- Modify: `client/src/pages/home/styles/forms-and-motion.css:6-29` (removed) and after `:60-66` (the block, with a new note)
- Modify: `client/src/pages/dashboard/styles/workout-modal.css:164-165` (a note) and `:171-175` (byte-order mark; keep it)

M1 and M2 also edit `forms-and-motion.css`, near its reduced-motion block (lines 301-308), so these line numbers hold after they merge. CSS only: no statement, branch or function changes.

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/client-medium-grids origin/main
npm run build > "$SCRATCH/b-k3-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/k3-before" > "$SCRATCH/k3-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/k2-after" "$SHOTS/k3-before"; echo "chain exit=$?"
node "$TOOLS/props.mjs" "$SHOTS/k3-before/tablet-personal-advanced.styles.json.gz" "advanced-fields-inner$" grid-template-columns
node "$TOOLS/props.mjs" "$SHOTS/k3-before/desktop-dash-workout-modal.styles.json.gz" "dashboard-workout-grid-metrics$" width,grid-column-start,grid-column-end
```

Expected: `identical`; `grid-template-columns=251.188px 251.203px 251.203px`; `width=22.6719px grid-column-start=auto grid-column-end=auto`.

- [ ] **Step 2: Move the medium-screen block below the rule it ties**

In `client/src/pages/home/styles/forms-and-motion.css`, delete lines 6-30 (the banner, its note, the `@media` block and the blank line after it):

```css
/* ---- Advanced mode on medium screens ------------------------------------- */
/* Its .advanced-fields-inner rule never applies: the unconditional one below ties it and
   comes later, so down to responsive.css's narrow-screen breakpoint the advanced fields
   stay in three columns. */
@media (max-width: 980px) {
  .personal-form.advanced-mode {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .personal-form.advanced-mode .field-name {
    grid-column: 1 / -1;
  }

  .personal-form.advanced-mode .field-age,
  .personal-form.advanced-mode .field-height,
  .personal-form.advanced-mode .field-weight,
  .personal-form.advanced-mode .field-sex {
    grid-column: auto;
  }

  .advanced-fields-inner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

so the file goes from its header straight to `/* ---- Advanced fields reveal ----…`. Then, after the unconditional rule (lines 60-66 before the deletion):

```css
.advanced-fields-inner {
  overflow: hidden;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
```

insert:

```css
/* ---- Advanced mode on medium screens ------------------------------------- */
/* Two columns for the form and for the advanced fields. It sits after the unconditional
   .advanced-fields-inner, which it ties, so that it wins; responsive.css takes both to one
   column on narrow screens. */
@media (max-width: 980px) {
  .personal-form.advanced-mode {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .personal-form.advanced-mode .field-name {
    grid-column: 1 / -1;
  }

  .personal-form.advanced-mode .field-age,
  .personal-form.advanced-mode .field-height,
  .personal-form.advanced-mode .field-weight,
  .personal-form.advanced-mode .field-sex {
    grid-column: auto;
  }

  .advanced-fields-inner {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

The file's header (lines 1-4) names "the advanced fields' reveal" first and says nothing about order, so it stays.

- [ ] **Step 3: The metrics row spans its grid**

In `client/src/pages/dashboard/styles/workout-modal.css`, replace lines 164-165:

```css
/* Keeps .dashboard-workout-grid's twelve columns. The metrics grid inside it sets no
   grid-column, so it takes one of them until responsive.css makes both one column. */
```

with:

```css
/* Keeps .dashboard-workout-grid's twelve columns; the exercises field spans them all, and
   so does the metrics grid inside it. */
```

and lines 171-172:

```css
.dashboard-workout-grid-metrics {
  grid-template-columns: minmax(72px, 0.8fr) minmax(72px, 0.8fr) minmax(150px, 1.4fr);
```

with:

```css
.dashboard-workout-grid-metrics {
  grid-column: 1 / -1;
  grid-template-columns: minmax(72px, 0.8fr) minmax(72px, 0.8fr) minmax(150px, 1.4fr);
```

- [ ] **Step 4: Build, check the order, commit**

```bash
npx prettier --write client/src/pages/home/styles/forms-and-motion.css client/src/pages/dashboard/styles/workout-modal.css
printf "workout-modal.css "; head -c 3 client/src/pages/dashboard/styles/workout-modal.css | od -An -tx1
npm run build > "$SCRATCH/b-k3.txt" 2>&1; echo "build exit=$?"
CSS=$(ls client/dist/assets/index-*.css)
grep -bo -F ".advanced-fields-inner{overflow:hidden" "$CSS" | cut -d: -f1
grep -bo -F ".advanced-fields-inner{grid-template-columns:repeat(2,minmax(0,1fr))}" "$CSS" | cut -d: -f1
grep -c -F ".dashboard-workout-grid-metrics{grid-column:1/-1;" "$CSS"
git add client/src
git commit -F - <<'EOF'
fix(client): two-column advanced fields on medium screens, and a full-width metrics row

The medium-screen block sat above the unconditional .advanced-fields-inner
it ties, so the advanced fields kept three columns down to 721px; it now
follows it. The workout modal's Sets, Reps and Intensity grid took one
of its parent's twelve tracks, about 23px; it now spans them all.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `ef bb bf`, `build exit=0`, then two offsets with the second larger than the first (the two-column rule now comes after the three-column one; on `main` it is the other way round), and `1`.

- [ ] **Step 5: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/k3-after" > "$SCRATCH/k3-cap.txt" 2>&1; echo "capture exit=$?"
```

Write `$SHOTS/k3-expect.json`:

```json
[
  {
    "kind": "png",
    "captures": "^(tablet-personal-advanced|desktop-dash-workout-modal|tablet-dash-workout-modal)$"
  },
  {
    "kind": "style",
    "captures": "^tablet-personal-advanced$",
    "target": " div[.]advanced-fields-inner$",
    "prop": "^grid-template-columns$",
    "from": "251.188px 251.203px 251.203px",
    "to": "384.797px 384.797px"
  },
  {
    "kind": "style",
    "captures": "^(desktop|tablet|phone)-dash-workout-modal$",
    "target": " div[.]dashboard-workout-grid[.]dashboard-workout-grid-metrics$",
    "prop": "^grid-column-start$",
    "from": "auto",
    "to": "1"
  },
  {
    "kind": "style",
    "captures": "^(desktop|tablet|phone)-dash-workout-modal$",
    "target": " div[.]dashboard-workout-grid[.]dashboard-workout-grid-metrics$",
    "prop": "^grid-column-end$",
    "from": "auto",
    "to": "-1"
  },
  {
    "kind": "style",
    "captures": "^desktop-dash-workout-modal$",
    "target": " div[.]dashboard-workout-grid[.]dashboard-workout-grid-metrics$",
    "prop": "^width$",
    "from": "22.6719px",
    "to": "404.062px"
  },
  {
    "kind": "style",
    "captures": "^tablet-dash-workout-modal$",
    "target": " div[.]dashboard-workout-grid[.]dashboard-workout-grid-metrics$",
    "prop": "^width$",
    "from": "51.75px",
    "to": "753px"
  },
  {
    "kind": "style",
    "captures": "^(tablet-personal-advanced|desktop-dash-workout-modal|tablet-dash-workout-modal)$",
    "prop": "^(width|inline-size|height|block-size|grid-template-columns|grid-template-rows|perspective-origin|transform-origin)$"
  },
  {
    "kind": "rect",
    "captures": "^tablet-personal-advanced$",
    "target": "^[.](advanced-fields-inner|personal-form label)$"
  },
  {
    "kind": "rect",
    "captures": "^(desktop|tablet)-dash-workout-modal$",
    "target": "^[.]dashboard-workout-grid-metrics$"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/k3-before" "$SHOTS/k3-after" "$SHOTS/k3-expect.json" > "$SCRATCH/k3-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/k3-cmp.txt"
```

Expected: `compare exit=0`, last line `197 difference(s); 0 unexpected; 0 expected but absent`, as the scratch run printed:

| Capture                      | Changes                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tablet-personal-advanced`   | the PNG, now taller; `.advanced-fields-inner` `251.188px 251.203px 251.203px` → `384.797px 384.797px`, matching the form's own two columns; its box 420.5 → 510 px tall; the advanced fields' widths follow |
| `desktop-dash-workout-modal` | the PNG (8503 pixels); the metrics grid `grid-column` `auto` → `1 / -1`, `width` 22.6719px → 404.062px, tracks `72px 72px 150px` → `101.344px 101.344px 177.375px`, and its three fields follow             |
| `tablet-dash-workout-modal`  | the PNG; the same `grid-column`, `width` 51.75px → 753px, tracks to `194.391px 194.406px 340.203px`                                                                                                         |
| `phone-dash-workout-modal`   | only `grid-column-start` `auto` → `1` and `grid-column-end` `auto` → `-1` on the metrics grid: below 720 px its parent has one track, so nothing moves and the PNG is identical                             |

Unchanged: `desktop-personal-advanced` (above 980 px the media block does not apply) and `phone-personal-advanced` (responsive.css's one column still wins), which shows the moved block's other rules apply exactly as before.

A supplementary look between the breakpoints, not part of the gate: `CAPTURE_ONLY=tablet-personal-advanced` against builds of both sides shows the same change; the tool's tablet viewport is 900 px, inside 721-980.

- [ ] **Step 6: Coverage unchanged, and the gates.**

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin fix/client-medium-grids
gh pr create --draft --base main --title "fix(client): two-column advanced fields on medium screens, and a full-width metrics row" --body-file "$SCRATCH/pr-k3.md"
gh pr ready
gh pr checks --watch
```

`pr-k3.md` outline: the same-file tie and why the block is moved rather than out-specified (it is the only rule in the file written to win by order, and moving it makes the written order the intended one; the compare shows its other rules unchanged); the metrics grid's missing `grid-column`; before and after tracks and widths at 900 and 1440 px, with the PNGs; the phone control; the compare's last line; coverage unchanged; gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 8: Review, then merge.** Keep `$SHOTS/k3-after` for K4.

---

### Task K4: The bottom navigation's borders, and the workout modal's buttons

- **The bottom navigation draws no borders.** `dashboard/styles/navigation.css:178-210` styles the bar and its buttons with `var(--dash-card-border-strong)`, `var(--dash-card-border)` and `var(--dash-text)`. `theme.css:10-26` defines the `--dash-*` tokens on `.dashboard-page` and `.drawer` only, and DashboardPage renders `DashboardBottomNav` beside `.dashboard-page`, not inside it. A `var()` with no value makes its declaration invalid at computed-value time, so `border: 1px solid var(…)` computes to its longhands' initial values: no border. Root cause 4 (custom properties out of scope at the use site). The bar shows only below 720 px (`dashboard/styles/responsive.css:136-138`), so `phone-dash-summary` and the other phone dashboard states carry it.
- **The workout modal's Cancel and Save buttons are centred.** The row is `<div className="modal-submit dashboard-workout-actions">` (`DashboardWorkoutModal.jsx:192`). `workout-modal.css:203-207`'s `.dashboard-workout-actions { justify-content: flex-end }` ties `styles/base.css:417-422`'s `.modal-submit { justify-content: center }` at (0,1,0), and `styles/base.css` is last in the main chunk, so `center` wins (baseline, `desktop-dash-workout-modal`: `justify-content: center`). The narrow-screen `justify-content: stretch` in `dashboard/styles/responsive.css:97-101` loses the same way. Root cause 1 (a tie lost to load order).

**The fixes.**

- **Set the tokens on the bar too**, by adding `.dashboard-bottom-nav` to theme.css's token rule. The buttons inherit them. This is the smallest change that makes the existing `var()`s valid; moving the bar inside `.dashboard-page` would be a markup change that also changes its stacking and containing block.
- **Name both classes on the action row**, `.modal-submit.dashboard-workout-actions` (0,2,0), in `workout-modal.css` and in `responsive.css`'s narrow-screen rule. Both have to move together: raising only the first would make it out-rank the narrow-screen rule's `gap: 8px` and `flex-direction: column-reverse`, which apply today.

**Files:**

- Modify: `client/src/pages/dashboard/styles/theme.css:7-11` (byte-order mark; keep it)
- Modify: `client/src/pages/dashboard/styles/navigation.css:3-4` and `:175-177` (two notes; byte-order mark)
- Modify: `client/src/pages/dashboard/styles/workout-modal.css:201-203` (byte-order mark)
- Modify: `client/src/pages/dashboard/styles/responsive.css:97` (byte-order mark)

M2 also edits `dashboard/styles/responsive.css`, further down (its reduced-motion block), and K3 edits `workout-modal.css` at lines 164-172, above this task's lines, adding one, so after K3 merges the action row's note starts at line 202. CSS only: no statement, branch or function changes.

- [ ] **Step 1: Branch, and the before-capture**

```bash
git fetch origin && git switch -c fix/client-bottom-nav-and-actions origin/main
npm run build > "$SCRATCH/b-k4-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/k4-before" > "$SCRATCH/k4-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/k3-after" "$SHOTS/k4-before"; echo "chain exit=$?"
node "$TOOLS/props.mjs" "$SHOTS/k4-before/phone-dash-summary.styles.json.gz" "nav[.]dashboard-bottom-nav$" border-top-style,border-top-width,border-top-color
node "$TOOLS/props.mjs" "$SHOTS/k4-before/desktop-dash-workout-modal.styles.json.gz" "modal-submit[.]dashboard-workout-actions$" justify-content
```

Expected: `identical`; `border-top-style=none border-top-width=0px border-top-color=…`; `justify-content=center`.

- [ ] **Step 2: Put the tokens on the bar**

In `client/src/pages/dashboard/styles/theme.css`, replace lines 7-11:

```css
/* Set on .drawer as well, because DashboardPage renders the drawer beside .dashboard-page
   rather than inside it. DashboardBottomNav is beside it too and is not covered, so the
   tokens navigation.css gives the bottom bar resolve to nothing. */
.dashboard-page,
.drawer {
```

with:

```css
/* Set on .drawer and .dashboard-bottom-nav as well, because DashboardPage renders the
   drawer and DashboardBottomNav beside .dashboard-page rather than inside it. */
.dashboard-page,
.drawer,
.dashboard-bottom-nav {
```

In `client/src/pages/dashboard/styles/navigation.css`, replace lines 3-4:

```css
   fifth by DashboardPage.css; it uses theme.css's tokens, which reach the drawer and the
   profile menu but not the bottom bar. */
```

with:

```css
   fifth by DashboardPage.css; it uses theme.css's tokens, which theme.css sets on the
   drawer and the bottom bar as well as the page. */
```

and lines 175-177:

```css
/* Hidden until responsive.css shows it on narrow screens. DashboardPage renders the bar
   beside .dashboard-page, where theme.css sets no tokens, so every var(--dash-*) here is
   invalid: the bar and its buttons draw no border. */
```

with:

```css
/* Hidden until responsive.css shows it on narrow screens. DashboardPage renders the bar
   beside .dashboard-page, so theme.css sets the --dash-* tokens on the bar itself. */
```

- [ ] **Step 3: The action row names both its classes**

In `client/src/pages/dashboard/styles/workout-modal.css`, replace lines 201-203:

```css
/* The row is also .modal-submit, whose justify-content in styles/base.css ties this one and
   comes later, so the buttons are centred; responsive.css's stretch loses the same way. */
.dashboard-workout-actions {
```

with:

```css
/* The row is also .modal-submit, so the selector names both: styles/base.css's
   .modal-submit centres the buttons, and alone this class would tie it and lose, since that
   sheet comes later. responsive.css's narrow-screen rule names both for the same reason. */
.modal-submit.dashboard-workout-actions {
```

In `client/src/pages/dashboard/styles/responsive.css`, replace line 97:

```css
  .dashboard-workout-actions {
```

with:

```css
  .modal-submit.dashboard-workout-actions {
```

(Line 103's `.dashboard-workout-actions .ghost, .dashboard-workout-actions .cta` rule styles the buttons, which `.modal-submit` does not touch, so it stays.)

- [ ] **Step 4: Build, check, commit**

```bash
npx prettier --write client/src/pages/dashboard/styles/theme.css client/src/pages/dashboard/styles/navigation.css client/src/pages/dashboard/styles/workout-modal.css client/src/pages/dashboard/styles/responsive.css
for f in theme navigation workout-modal responsive; do printf "%s " $f; head -c 3 client/src/pages/dashboard/styles/$f.css | od -An -tx1; done
npm run build > "$SCRATCH/b-k4.txt" 2>&1; echo "build exit=$?"
CSS=$(ls client/dist/assets/index-*.css)
grep -c -F ".dashboard-page,.drawer,.dashboard-bottom-nav{--dash-page-bg:" "$CSS"
grep -o -F ".modal-submit.dashboard-workout-actions{justify-content:flex-end" "$CSS"
git grep -n "dashboard-bottom-nav\|dashboard-workout-actions" e2e/
git add client/src
git commit -F - <<'EOF'
fix(client): borders on the bottom navigation, and the workout modal's buttons to the right

DashboardBottomNav renders beside .dashboard-page, outside every element
the --dash-* tokens are set on, so its borders were invalid and drew
nothing; the tokens are now set on the bar as well. The workout modal's
action row tied styles/base.css's .modal-submit, which loads later and
centred the buttons; both of its rules now name both classes.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: four `ef bb bf`, `build exit=0`, `1`, the `flex-end` rule printed, and no `e2e/` match.

- [ ] **Step 5: The after-capture and the compare**

```bash
node "$TOOLS/capture.mjs" . "$SHOTS/k4-after" > "$SCRATCH/k4-cap.txt" 2>&1; echo "capture exit=$?"
```

Write `$SHOTS/k4-expect.json`:

```json
[
  {
    "kind": "png",
    "captures": "^(phone-dash-(loading|summary|meal-loading|tips-loading|workout-modal|planner)|(desktop|tablet)-dash-workout-modal)$"
  },
  { "kind": "style", "captures": "-dash-", "target": "/nav.1.[^ ]* ", "prop": "^--dash-" },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": " nav[.]dashboard-bottom-nav$",
    "prop": "^border-(top|right|bottom|left|block-start|block-end|inline-start|inline-end)-style$",
    "from": "none",
    "to": "solid"
  },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": " nav[.]dashboard-bottom-nav$",
    "prop": "^border-(top|right|bottom|left|block-start|block-end|inline-start|inline-end)-width$",
    "from": "0px",
    "to": "1px"
  },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": " nav[.]dashboard-bottom-nav$",
    "prop": "^border-(top|right|bottom|left|block-start|block-end|inline-start|inline-end)-color$",
    "to": "rgb(125, 125, 125)"
  },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": "/nav.1./button.[0-9]. button$",
    "prop": "^border-.*-style$",
    "from": "none",
    "to": "solid"
  },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": "/nav.1./button.[0-9]. button$",
    "prop": "^border-.*-width$",
    "from": "0px",
    "to": "1px"
  },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": "/nav.1./button.[0-9]. button$",
    "prop": "^border-.*-color$",
    "to": "rgb(74, 74, 74)"
  },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": "/nav.1./button.[0-9]. button[.]active$",
    "prop": "^border-.*-style$",
    "from": "none",
    "to": "solid"
  },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": "/nav.1./button.[0-9]. button[.]active$",
    "prop": "^border-.*-width$",
    "from": "0px",
    "to": "1px"
  },
  {
    "kind": "style",
    "captures": "-dash-",
    "target": "/nav.1./button.[0-9]. button[.]active$",
    "prop": "^border-.*-color$",
    "to": "rgb(125, 125, 125)"
  },
  {
    "kind": "style",
    "captures": "^phone-dash-",
    "target": "/nav.1.",
    "prop": "^(width|inline-size|height|block-size|grid-template-columns|grid-template-rows|perspective-origin|transform-origin|top|inset-block-start)$"
  },
  {
    "kind": "rect",
    "captures": "^phone-dash-",
    "target": "^[.]dashboard-bottom-nav$",
    "from": "[[12,778.31,366,55.69]]",
    "to": "[[12,774.31,366,59.69]]"
  },
  {
    "kind": "style",
    "captures": "^(desktop|tablet)-dash-workout-modal$",
    "target": " div[.]modal-submit[.]dashboard-workout-actions$",
    "prop": "^justify-content$",
    "from": "center",
    "to": "flex-end"
  },
  {
    "kind": "style",
    "captures": "^phone-dash-workout-modal$",
    "target": " div[.]modal-submit[.]dashboard-workout-actions$",
    "prop": "^justify-content$",
    "from": "center",
    "to": "stretch"
  },
  {
    "kind": "rect",
    "captures": "^(desktop|tablet)-dash-workout-modal$",
    "target": "^[.]dashboard-workout-actions button$"
  }
]
```

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/k4-before" "$SHOTS/k4-after" "$SHOTS/k4-expect.json" > "$SCRATCH/k4-cmp.txt" 2>&1; echo "compare exit=$?"; tail -1 "$SCRATCH/k4-cmp.txt"
```

Expected: `compare exit=0`, last line `6979 difference(s); 0 unexpected; 0 expected but absent`, as the scratch run printed. The count is large because the bar is in the DOM of every dashboard state, hidden (`display: none`) above 720 px, and every one of its elements and pseudo-elements gains all fourteen `--dash-*` custom properties, which the dump records. What the expectation file allows, in the 17 dashboard captures only:

| Where                                    | Changes                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| every element under the bar, and the bar | the fourteen `--dash-*` properties, from absent to theme.css's values                                                                                                                                                           |
| the bar, `nav.dashboard-bottom-nav`      | every `border-*-style` `none` → `solid`, `border-*-width` `0px` → `1px`, `border-*-color` → `rgb(125, 125, 125)` (`--dash-card-border-strong`)                                                                                  |
| its four buttons, and the active one     | the same, with colour `rgb(74, 74, 74)` (`--dash-card-border`), and `rgb(125, 125, 125)` for the active one                                                                                                                     |
| phone only, where the bar is shown       | the PNG of each of the six phone dashboard states (about 8000 pixels: the bar's borders); the bar 4 px taller (box `[12, 778.31, 366, 55.69]` → `[12, 774.31, 366, 59.69]`) and its buttons 2 px taller and a fraction narrower |
| the workout modal's action row           | `justify-content` `center` → `flex-end` at 1440 and 900 px, where both buttons move to the right edge (the PNGs, and the buttons' boxes); `center` → `stretch` at 390 px, where the column-reverse row looks the same           |

The buttons' text colour does not change: `var(--dash-text)` was invalid, so the colour was inherited, and it inherited the same white the token now gives. Nothing outside the bar and the action row changes, on any page.

- [ ] **Step 6: Coverage unchanged, and the gates.** The axe scan's open modal is the workout modal at 1280 px, whose buttons move right; contrast and names do not change, and it must still report zero violations.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin fix/client-bottom-nav-and-actions
gh pr create --draft --base main --title "fix(client): borders on the bottom navigation, and the workout modal's buttons to the right" --body-file "$SCRATCH/pr-k4.md"
gh pr ready
gh pr checks --watch
```

`pr-k4.md` outline: the out-of-scope tokens and why they are set on the bar rather than the bar moved; the tie with `.modal-submit` and why both rules move together; before and after borders and `justify-content`, with the phone summary and desktop modal PNGs; the compare's last line; coverage unchanged; gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 8: Review, then merge.** K4 is the phase's last CSS change; `$SHOTS/k4-after` is what `main` should capture as until Phase 5.

---

### Task K5: The client floor PR

Modelled on PR #227 (Phase 3's C6), client side only. M1 is the only task here that moves a count, so the expected measurement is M1's: statements 4906 / 4964 (98.8316), branches 3218 / 3428 (93.8740), functions 1014 / 1024 (99.0234), lines 4472 / 4496 (99.4662). Truncated to one decimal those are 98.8 / 93.8 / 99 / 99.4, today's floors, so **the expected outcome is that no floor rises and no PR is opened**. Measure anyway: a merge on `main` from outside this plan can move the counts.

**Files:**

- Modify, only if a floor rises: `client/vite.config.js:70-77` (the measurement note and `thresholds`)

- [ ] **Step 1: Measure `main`, locally and in CI**

```bash
git fetch origin
git switch -c chore/phase-4-client-floors origin/main
npm ci > "$SCRATCH/ci-floor.txt" 2>&1; echo "npm ci exit=$?"
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cov-floor.txt" 2>&1; echo "test:coverage exit=$?"
node -e "const t=require('./client/coverage/coverage-summary.json').total; for (const k of ['statements','branches','functions','lines']) console.log(k, t[k].covered + '/' + t[k].total, (100*t[k].covered/t[k].total).toFixed(4))"
grep -E "Tests  " "$SCRATCH/cov-floor.txt"
```

Expected: `exit=0` for both, the four counts above, and `Tests  2441 passed (2441)`. Then read the same four figures from the last green CI run on `main`: `gh run list --branch main --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId'`, then `gh run view <id> --log | grep -E "All files"` for the client coverage job on Node 22 and Node 24. They must agree with the local run; if they do not, record both, and floor from the lower.

- [ ] **Step 2: Raise only a floor whose truncated measurement went up**

For each metric the candidate is `Math.floor(measured * 10) / 10`. Raise the floor in `thresholds` only where that is higher than today's (98.8 / 93.8 / 99 / 99.4); never lower one. Prettier writes a whole number without `.0`, as `functions: 99` shows.

If none rises, which is the prediction: open no PR, delete the branch (`git switch main && git branch -D chore/phase-4-client-floors`), and record in the phase report the counts, the CI figures and "no floor moved". Stop here.

If one does, replace the note at lines 70-71:

```js
// Measured 2026-10-16 (98.83 / 93.87 / 99.02 / 99.46), the same locally
// and in CI.
```

with the date of the run and its four figures to two decimals, keeping "the same locally and in CI" only if Step 1 showed that.

- [ ] **Step 3: Prove it, commit, open the PR** (only if Step 2 changed the file)

```bash
npm run test:coverage -w client > "$SCRATCH/cov-floor2.txt" 2>&1; echo "test:coverage exit=$?"
npm run lint > "$SCRATCH/lint-floor.txt" 2>&1; echo "lint exit=$?"
npm run format:check > "$SCRATCH/fmt-floor.txt" 2>&1; echo "format:check exit=$?"
npm run test:scripts > "$SCRATCH/scripts-floor.txt" 2>&1; echo "test:scripts exit=$?"
git add client/vite.config.js
git commit -m "chore(coverage): raise the client floors after Phase 4" -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
git push -u origin chore/phase-4-client-floors
gh pr create --base main --title "chore(coverage): raise the client floors after Phase 4" --body-file "$SCRATCH/pr-floors.md"
```

`pr-floors.md` follows #227's body: the floors that moved and the rule; the Phase 4 PRs merged, M1 to K4, with their numbers; a table of Metric, Covered / total, Measured to four decimals, Floor before, Floor after, Spare; the tests before (2438) and after; the CI run that agrees; the verification exits; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 4: Review, then merge.** The quality review recomputes each percentage and its truncation from the counts in the body.

---

## Not in this phase

PR numbers are the readability effort's reports: S7-n is bug n in #187, S8-n bug n in #188.

| Item                                                                                                                                                                                                                                                                                                                                                                                             | Where it goes                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| The invisible or harmless cascade bugs, accepted by default #9: App's gradient under `.home-page { background: #000 !important }` (S8-8); the week table's `min-height` on cells (S8-9); SummaryView's band colours (S7-6); `.auth-card-top .segmented button { flex }` on a grid item (S7-12); the `.height-unit` colours (S8-12); the walkthrough form's label, select and day colours (S8-13) | Accepted. Their rules are removed only where they die with deleted code (Phase 5)                                                               |
| Smaller visible-on-inspection ties left as they are: `.personal-form`'s own gap and top margin losing to `.form` (S8-3), `.muted-panel`'s background and `.personal-hint`'s margin (S8-10), the Preview button's narrow-screen padding (S8-11), `.planner-setup-modal .muted`'s colour (S7-2), `.auth-page .title`'s margin (S7-11)                                                              | Accepted under default #9: each is a few pixels of spacing or a grey a shade off, and none is in the spec's K list. Owner's call to promote any |
| The contents lane's narrow-screen `top`, `max-height` and `z-index` (S8-7), the walkthrough's narrow-screen font sizes losing to the `:is()` rule (S8-15), the title's reduced-motion rule doing nothing on its own (S8-16), a contracting chip's label never fading out (S8-14)                                                                                                                 | Accepted. S8-16 is moot: `.home-stage *` already stops the title                                                                                |
| The `.plan-modal` rules that never apply (S7-1)                                                                                                                                                                                                                                                                                                                                                  | Phase 5, D1, with GeneratedPlanModal                                                                                                            |
| The dead and never-matching selectors listed for the readability effort's PR 11 (`.workout-list`, `.planner-setup-modal .modal-actions .back-btn` and the rest)                                                                                                                                                                                                                                  | Phase 5, as deletions                                                                                                                           |
| The walkthrough's copy of the personal form keeps two columns on phones (132 px each at 390 px). K2 scopes its rule to the home stage on purpose                                                                                                                                                                                                                                                 | Owner decision; one more selector in K2's rule if wanted                                                                                        |
| Motion left under reduced motion after M2, all of it answering a hover or a press: the nav's Preview button and `/auth`'s close button (`.home-page .ghost`'s lift and glow), the login/sign-up toggle's two buttons (`forms-and-motion.css:137-139`, colour and a 1 px lift). MealView's course pills keep a colour transition, which is not motion                                             | Owner decision (WCAG 2.2 SC 2.3.3 is AAA). Two selectors in M2's `shell.css` block would stop the first two                                     |
| A global `prefers-reduced-motion` reset                                                                                                                                                                                                                                                                                                                                                          | Out, as M2 explains. Revisit only if a new gap appears that the targeted blocks cannot reach                                                    |
| A shared, subscribing `usePrefersReducedMotion` hook for the four event-time reads                                                                                                                                                                                                                                                                                                               | Not needed for M1. Would cost functions coverage, and would have to be reconciled with the two preview hooks' deliberate dependency lists       |
| The other portalled dashboard modals miss the `--dash-*` tokens too (#187's note). No rule they match reads a token today, so nothing renders differently                                                                                                                                                                                                                                        | Accepted; K4 adds the bottom bar only                                                                                                           |
| `@layer`                                                                                                                                                                                                                                                                                                                                                                                         | Parked by the spec                                                                                                                              |
| CLAUDE.md has no entry on reduced motion or on the capture tool. Recording that Phase 4 exists, and where its capture tool lives (this plan), belongs with the other records                                                                                                                                                                                                                     | Phase 6, R1                                                                                                                                     |

---
