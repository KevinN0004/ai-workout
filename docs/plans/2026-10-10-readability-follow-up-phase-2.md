# Readability follow-up: Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the five open fix PRs (#190, #193, #192, #191, #194) on the readability-commented `main`, one at a time, then raise the coverage floors once.

**Architecture:** Phase 2 of `docs/specs/2026-10-10-readability-follow-up-design.md`. Each PR takes `main` with a merge, not a rebase. Its conflicts are resolved so that the PR's code change lands, and the comments describing that code are made true. #190 also gains the EPA 2024 PM2.5 table. The server track runs #190, then #193, then #192. #191 touches no measured code, and #194 bumps the coverage tool, so #194 goes last. One floor PR closes the phase.

**Tech Stack:** Express 5, Prisma, Vitest with v8 coverage, GitHub (gh CLI).

**Baseline (`main` at `7ec2438`, measured 2026-10-10):**

| Side   | Tests | Statements | Branches | Functions | Lines |
| ------ | ----- | ---------- | -------- | --------- | ----- |
| Client | 2311  | 98.72      | 93.73    | 98.79     | 99.36 |
| Server | 1099  | 94.3       | 86.7     | 95.43     | 95.66 |

The floors are client 98.7 / 93.7 / 98.7 / 99.3 (`client/vite.config.js`) and server 94.3 / 86.7 / 95.4 / 95.6 (`server/vitest.config.js`). Server statements and branches, and client statements and functions, have no slack.

---

## Conventions

- **Shell.** Git Bash, from `D:\ai-workout`. Set `SCRATCH` to any folder outside the repo, and redirect command output there.
- **Exit codes.** Never gate on a pipe: redirect output to a file, then read `$?`.
- **Secrets.** Never read, stat or print `server/.env`.
- **Server suite.** It needs Postgres (`npm run postgres:local:start -w server`) and a generated Prisma client (`npm run prisma:generate -w server`) after any `npm ci`.
- **Take `main` by merging, never by rebasing.** `git fetch origin && git merge origin/main`. This avoids force-pushing a PR branch, and the push gives GitHub a fresh merge ref. Phase 1 showed that close and reopen does not do that.
- **Resolving a conflict.** Keep the PR's code change. Keep `main`'s comments wherever they still describe the code. Rewrite any comment that the PR's change makes untrue, following `docs/code-readability-sop.md`: present tense, every claim checked against the code, no numbers copied from elsewhere. After resolving, `git diff origin/main` must show only the PR's intended change and the comment rewrites it forces.
- **The gates on every PR.** Each one is redirected to a file, and its exit code must be `0`.

  ```bash
  npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
  npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
  npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "knip exit=$?"
  npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"
  npm run test:coverage > "$SCRATCH/cov.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files|Tests  " "$SCRATCH/cov.txt"
  npm run test:e2e > "$SCRATCH/e2e.txt" 2>&1; echo "test:e2e exit=$?"; tail -3 "$SCRATCH/e2e.txt"
  ```

- **Floors.** No fix PR edits a floor. Task 6 raises them once.
- **Merging.** A PR merges only after its spec and quality reviews pass, its checks are green, and it shows `mergeStateStatus` `CLEAN`. Merge with **"Create a merge commit"**, then wait for the CI run on `main` to go green before starting the next task.
- **Trailers.** Every commit ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every edited PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

---

### Task 1: #190, PM2.5 truncation plus the EPA 2024 table

**Files:**

- Modify: `server/src/services/external/externalDataService.js` (the `pm25ToUsAqi` function)
- Modify: `server/src/services/external/__tests__/airQuality.test.js` (the `pm25ToUsAqi` describe block)
- Modify: `client/src/pages/dashboard/views/SummaryView.jsx` (the `US AQI` string, about line 368)

- [ ] **Step 1: Take `main`**

```bash
git fetch origin
git switch fix/pm25-aqi-band-gaps
git pull --ff-only
git merge origin/main
```

Expected: one conflict, in `externalDataService.js`. The conflict is between `main`'s comment ("…as they stood before its 2024 revision… this does not, so a value in the gap… falls through to 500") and #190's truncation. Resolve it by taking Step 3's function body below, then `git add` the file. Do not commit yet.

- [ ] **Step 2: Write the failing tests**

Replace the `describe("pm25ToUsAqi", …)` block in `airQuality.test.js` with:

```js
describe("pm25ToUsAqi", () => {
  test("returns null rather than a number for absent input", () => {
    expect(pm25ToUsAqi(null)).toBeNull();
    expect(pm25ToUsAqi(undefined)).toBeNull();
    expect(pm25ToUsAqi("")).toBeNull();
  });

  test("returns null for values that are not usable concentrations", () => {
    expect(pm25ToUsAqi("smoggy")).toBeNull();
    expect(pm25ToUsAqi(Number.NaN)).toBeNull();
    expect(pm25ToUsAqi(Number.POSITIVE_INFINITY)).toBeNull();
    expect(pm25ToUsAqi(-1)).toBeNull();
  });

  test("keeps a measured zero, given as a number or a numeric string", () => {
    expect(pm25ToUsAqi(0)).toBe(0);
    expect(pm25ToUsAqi("0")).toBe(0);
  });

  // The EPA's 2024 breakpoints. Each pair is (concentration, published AQI) at
  // the edge of a band, which is where an off-by-one in the table would show.
  test.each([
    [0, 0],
    [9.0, 50],
    [9.1, 51],
    [35.4, 100],
    [35.5, 101],
    [55.4, 150],
    [55.5, 151],
    [125.4, 200],
    [125.5, 201],
    [225.4, 300],
    [225.5, 301],
    [325.4, 500]
  ])("maps %s ug/m3 to AQI %s", (pm25, expected) => {
    expect(pm25ToUsAqi(pm25)).toBe(expected);
  });

  // An unrounded reading between two bands' published edges. Truncating to one
  // decimal, as the EPA does, puts it at the lower band's top.
  test.each([
    [9.05, 50],
    [35.45, 100],
    [55.45, 150],
    [125.45, 200],
    [225.45, 300]
  ])("scores %s ug/m3, between two bands, as AQI %s", (pm25, expected) => {
    expect(pm25ToUsAqi(pm25)).toBe(expected);
  });

  test("interpolates within a band rather than snapping to its edges", () => {
    // Midpoint of the first band: 4.5 ug/m3 sits halfway to AQI 50.
    expect(pm25ToUsAqi(4.5)).toBe(25);
  });

  test("extends the top band's slope past its last breakpoint", () => {
    // 425.3 is one band-width (99.9 ug/m3) past 325.4, so it scores one
    // band-height (199) past 500, and still reads as hazardous.
    expect(pm25ToUsAqi(425.3)).toBe(699);
    expect(aqiBand(pm25ToUsAqi(425.3)).level).toBe("Hazardous");
  });

  test("rises monotonically across the whole range", () => {
    const samples = [0, 5, 9, 20, 35, 50, 80, 125, 200, 230, 325, 400];
    const values = samples.map(pm25ToUsAqi);
    values.forEach((value, index) => {
      if (index === 0) return;
      expect(value).toBeGreaterThanOrEqual(values[index - 1]);
    });
  });
});
```

Run:

```bash
npm -w server exec vitest run src/services/external/__tests__/airQuality.test.js > "$SCRATCH/aqi-red.txt" 2>&1; echo "exit=$?"; grep -E "✓|×|Tests " "$SCRATCH/aqi-red.txt" | head -40
```

Expected: `exit=1`. The pre-2024 table still in the merged code fails these: the 2024 edge rows from 9.0/50 to 325.4/500, the between-bands rows, the interpolation test and the extrapolation test. The absent and zero tests pass.

- [ ] **Step 3: The function**

Replace the body of `pm25ToUsAqi` in `externalDataService.js` with:

```js
const pm25ToUsAqi = (pm25) => {
  if (pm25 === null || pm25 === undefined || pm25 === "") return null;
  const value = Number(pm25);
  if (!Number.isFinite(value) || value < 0) return null;
  // The US EPA's PM2.5 breakpoints from its 2024 revision. Each band maps a
  // concentration range in ug/m3 linearly onto an AQI range. The EPA
  // truncates a reading to one decimal before the lookup, which is what puts
  // a value between two bands' published edges into the lower band, and it
  // extends the top band's slope past its last breakpoint rather than
  // capping the index.
  const truncated = Math.floor(value * 10) / 10;
  const points = [
    { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
    { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200 },
    { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300 },
    { cLow: 225.5, cHigh: 325.4, iLow: 301, iHigh: 500 }
  ];
  const interpolate = ({ cLow, cHigh, iLow, iHigh }) =>
    Math.round(iLow + ((truncated - cLow) / (cHigh - cLow)) * (iHigh - iLow));
  const band = points.find((point) => truncated <= point.cHigh);
  return interpolate(band || points[points.length - 1]);
};
```

The first band starts at 0.0 and truncation leaves no value between bands, so `find` on the upper edge is enough. Anything above 325.4 falls to the last band and extrapolates on its slope.

- [ ] **Step 4: Watch the tests pass**

```bash
npm -w server exec vitest run src/services/external/__tests__/airQuality.test.js src/routes/external/__tests__/airQualityRoutes.test.js > "$SCRATCH/aqi-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/aqi-green.txt"
```

Expected: `exit=0`. If `airQualityRoutes.test.js` asserts an AQI number from the old table, update that assertion to the 2024 value. Compute it with Step 3's formula, and say so in the commit.

- [ ] **Step 5: Say where the figure comes from**

In `client/src/pages/dashboard/views/SummaryView.jsx`, change the template's `` ` | US AQI ${airSummary.aqiUs}` `` to `` ` | US AQI ${airSummary.aqiUs} from the latest reading` ``. The server always scores OpenAQ's latest reading, so the label is unconditional: it adds no branch, and no test change is needed unless a test pins the old string. Check with `git grep -n "US AQI" client/src`. If one does, update it to match.

- [ ] **Step 6: Gates, commit, push**

Run the gates from Conventions. Coverage must be at or above every floor. The rewrite removes the dead `|| 1` branch and adds no new branch, so the server's branch figure should not fall.

```bash
git add -A server/src/services/external client/src/pages/dashboard/views/SummaryView.jsx
git commit -F - <<'EOF'
fix(air-quality): score PM2.5 on the EPA's 2024 table

Merges main, where the readability comments landed. On top of #190's
truncation to one decimal, the breakpoints move to the EPA's 2024
revision (Good up to 9.0, Unhealthy and Very unhealthy narrowed,
Hazardous 225.5-325.4) and the top band's slope extends past 325.4 as
the EPA's guidance says, rather than capping at 500. The summary card
says the figure comes from the latest reading.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
git push
gh pr ready 190
gh pr checks 190 --watch
```

Update #190's PR body to describe the merged change: the truncation, the 2024 table, extrapolation, the label, the test rows, and the gate results.

- [ ] **Step 7: Review, then merge.** Run the spec review, then the quality review. Then merge as Conventions says.

---

### Task 2: #193, the meal-log transaction

**Files:** the PR's own files: `server/src/repositories/mealLogRepository.js`, `server/src/routes/dashboard/write/registerMealAndMetricRoutes.js`, `server/src/index.js`, and `server/src/routes/dashboard/write/__tests__/mealLogs.integration.test.js`.

- [ ] **Step 1: Take `main`**

```bash
git fetch origin
git switch fix/meal-calorie-sync-overflow
git pull --ff-only
git merge origin/main
```

Expected: one conflict, in `mealLogRepository.js`. Resolve it per Conventions. #193 wraps the meal log and the daily-calorie sync in one `$transaction` and clamps the day's total to the column's limit. Rewrite every comment in the file that describes the old non-transactional write so it describes the transactional one.

- [ ] **Step 2: Check the change still reads as one thing**

```bash
git diff origin/main --stat
git diff origin/main -- server/src/repositories/mealLogRepository.js
```

Expected: only the PR's four files, and only the PR's change plus the forced comment rewrites.

- [ ] **Step 3: Gates, commit the merge, push**

Run the gates from Conventions, with Postgres up. The integration test exercises both arms of the transaction. If coverage shows an uncovered arm in the changed code, add an integration test for it before committing.

```bash
git commit -F - <<'EOF'
Merge main into fix/meal-calorie-sync-overflow

Resolves the conflict with the readability comments in
mealLogRepository.js; the comments now describe the transactional write.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
git push
gh pr ready 193
gh pr checks 193 --watch
```

- [ ] **Step 4: Review, then merge.**

---

### Task 3: #192, the Gemini guardrails

**Files:** the PR's own files: `server/src/routes/generateRoutes.js`, `server/src/services/dashboard/dashboardDataBuildersService.js`, `server/src/__tests__/numericCoercion.contract.test.js`, `server/src/routes/__tests__/generateRoutes.equipment.test.js`, `README.md` and `env.example`.

- [ ] **Step 1: Take `main`**

```bash
git fetch origin
git switch fix/gemini-generation-guardrails
git pull --ff-only
git merge origin/main
```

Expected: conflicts in `generateRoutes.js` and `dashboardDataBuildersService.js`. Resolve them per Conventions. #192 adds a token cap, a 30 s timeout that answers 504, a length cap that answers 502, and prompt framing. The comments `main` added to these routes describe the generation flow, so rewrite any that the new limits make incomplete. One example is a comment listing the route's responses.

- [ ] **Step 2: The new export**

The PR (#192) exports `parsePositiveInt` from `dashboardDataBuildersService.js` and adds it to the numeric-coercion contract test. Check two things:

- it has a `/** */` summary, as SOP rule 2 requires;
- its contract row passes. It must give the absent answer for `null`, `""` and `undefined`. Zero is outside its domain, so its row has `zeroIsValid: false`.

`server/src/index.js` has a private `toPositiveInt` that does the same job. Do not merge the two here; note it in the PR body as a follow-up.

- [ ] **Step 3: Gates, commit the merge, push**

Run the gates from Conventions. #192 adds the most new branches of the fix PRs, and its tests are named for each arm. If server branches come in under 86.7, find the uncovered arm in the coverage report (`server/coverage/`) and add the test for it before committing.

```bash
git commit -F - <<'EOF'
Merge main into fix/gemini-generation-guardrails

Resolves the conflicts with the readability comments in generateRoutes.js
and dashboardDataBuildersService.js; the comments now include the token
cap, the timeout and the length cap.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
git push
gh pr ready 192
gh pr checks 192 --watch
```

- [ ] **Step 4: Review, then merge.**

---

### Task 4: #191, portable Claude tooling

**Files:** the PR's own files. The two that need work are `scripts/run-claude-helper.cjs` (its header) and `scripts/__tests__/repo-invariants.test.mjs` (the merge conflict).

- [ ] **Step 1: Take `main`**

```bash
git fetch origin
git switch chore/portable-claude-tooling
git pull --ff-only
git merge origin/main
```

Expected: one conflict, in `repo-invariants.test.mjs`. Keep both sides. `main` added the header ratchet's describe block, and #189 added a deploy-checkout test at the end of the file. #191 adds its hook-wiring tests. None replaces another.

- [ ] **Step 2: Watch the header ratchet fail on the new file**

```bash
npm run test:scripts > "$SCRATCH/scripts-red.txt" 2>&1; echo "exit=$?"; grep -n "run-claude-helper" "$SCRATCH/scripts-red.txt" | head
```

Expected: `exit=1`. The ratchet's missing-header test names `scripts/run-claude-helper.cjs`, because its `"use strict";` sits above its comment.

- [ ] **Step 3: Move the header above the directive**

In `scripts/run-claude-helper.cjs`, move the block comment so the file reads: the shebang line, then the comment, then `"use strict";`. That is the shape `scripts/scrub-junk-files.cjs` uses. If the comment runs past four lines of text, make it a four-line header and put the rest in a second block below `"use strict";`. Do not change the code.

- [ ] **Step 4: Watch the ratchet pass, then run the gates**

```bash
npm run test:scripts > "$SCRATCH/scripts-green.txt" 2>&1; echo "test:scripts exit=$?"
node scripts/codex-handoff.mjs --hook > /dev/null 2>&1; echo "codex-handoff exit=$?"
node scripts/scrub-junk-files.cjs --dry-run > /dev/null 2>&1; echo "scrub exit=$?"
```

Expected: every exit `0`. Then run the gates from Conventions. #191 changes no measured code, so the coverage figures equal the baseline.

- [ ] **Step 5: Commit, push, review, merge**

```bash
git add scripts/run-claude-helper.cjs scripts/__tests__/repo-invariants.test.mjs
git commit -F - <<'EOF'
Merge main into chore/portable-claude-tooling

Keeps the header ratchet, #189's deploy test and this PR's hook tests in
repo-invariants.test.mjs, and moves run-claude-helper.cjs's header above
"use strict" so the ratchet, which allows no exceptions, passes.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
git push
gh pr ready 191
gh pr checks 191 --watch
```

---

### Task 5: #194, the Dependabot bump

It bumps `@vitest/coverage-v8`, which can move the measured percentages with no code change, so it goes last.

- [ ] **Step 1: Have Dependabot rebase it**

```bash
gh pr comment 194 --body "@dependabot rebase"
```

Wait for Dependabot to push. Its PR timeline shows the force-push, and `gh pr view 194 --json headRefOid` changes. Then run `gh pr checks 194 --watch`.

- [ ] **Step 2: Measure it locally**

```bash
git fetch origin
git switch --detach origin/dependabot/npm_and_yarn/minor-and-patch-22ca527d62
npm ci > "$SCRATCH/ci194.txt" 2>&1; echo "npm ci exit=$?"
npm run prisma:generate -w server > /dev/null 2>&1
```

Then run the gates from Conventions. The audit must still pass:

```bash
npx --yes audit-ci@7.1.0 --config security/audit-ci.json > "$SCRATCH/audit194.txt" 2>&1; echo "audit exit=$?"
```

If coverage drops below a floor with no code change, the coverage tool's counting changed. Stop and report the before and after figures per metric. Do not lower a floor.

- [ ] **Step 3: Review, then merge.** The quality review reads each bumped package's release notes for anything that changes behaviour.

---

### Task 6: The phase's floor PR

**Files:**

- Modify: `client/vite.config.js` (the `thresholds` block, and its measurement comment)
- Modify: `server/vitest.config.js` (the `thresholds` block, and its measurement comment)

- [ ] **Step 1: Measure `main`**

```bash
git fetch origin
git switch -c chore/phase-2-floors origin/main
npm ci > "$SCRATCH/ci-floor.txt" 2>&1; npm run prisma:generate -w server > /dev/null 2>&1
npm run test:coverage > "$SCRATCH/cov-floor.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files" "$SCRATCH/cov-floor.txt"
```

- [ ] **Step 2: Raise every floor whose truncated measurement went up**

For each of the eight metrics, the new floor is the measured value truncated to one decimal place. Raise the floor only where that is higher than today's. Never lower one. Update each config's measurement comment to "Measured 2026-MM-DD", with the date and the four figures.

- [ ] **Step 3: Prove it, commit, PR**

```bash
npm run test:coverage > "$SCRATCH/cov-floor2.txt" 2>&1; echo "test:coverage exit=$?"
git add client/vite.config.js server/vitest.config.js
git commit -m "chore(coverage): raise the floors after Phase 2" -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
git push -u origin chore/phase-2-floors
gh pr create --base main --title "chore(coverage): raise the floors after Phase 2" --body-file "$SCRATCH/pr-floors.md"
```

`pr-floors.md` gives the before and after figures for each metric, and says which floors moved and why. If no truncated value went up, open no PR, and say so in the phase report.

- [ ] **Step 4: Review, then merge.**

---

### Task 7: Phase report

Report to the owner:

- each PR merged, with its merge commit;
- `main`'s last CI conclusion;
- coverage before and after per metric, and the floors raised;
- anything moved to a later phase, such as merging #192's `parsePositiveInt` with `toPositiveInt`.
