# Parked items, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Do the six items `docs/specs/2026-10-10-readability-follow-up-design.md` parked ("Parked": NowCast or AirNow, a `@layer` migration, gitleaks, the server allowing its own origin) plus the two the later plans parked beside them (the glance cards' failed-versus-not-run wording, and keyword matching in `detectTrack` and `detectInjuryFlags`), which the owner decided on 2026-10-24 to do. Eight PRs, then one floor PR for both sides.

**Architecture:** A follow-on phase under the spec's rules 1-7, which still apply. Two independent tracks, server and client, plus one CI-only PR that touches neither side's coverage. One PR at a time per track, each a new branch from current `origin/main` (rule 1). Every fix ships tests for everything it adds, passes the floors on its own and edits no floor (rule 2); one floor PR closes the phase (rule 3). Comments, and the CLAUDE.md and README passages that describe a behaviour, change with the code in the same PR (rule 4); this phase changes no record of measured state except the floor notes, so there is no separate records PR (rule 6). Client changes that alter what a page shows are proven by the Phase 4 capture tool's compare with an expectation file (rule 7). Every behaviour fix is test-first: the test is written, run against `main` and seen to fail for the bug's reason, then the fix makes it pass, then mutations show the test holds the fix.

**Tech Stack:** React 19.3, Vite 8.3 (Lightning CSS 1.33 in the build), Vitest 5.0.5 with v8 coverage, jsdom 30.1, Express 5.3, `cors` 2.8.6, Prisma 7.10, Postgres 18, Playwright 1.64 (E2E, axe and the capture tool), Node 24 (`.nvmrc`), GitHub Actions (`actions/checkout@v7`, `actions/setup-node@v7`), gh CLI.

**Status: a plan, not a measurement.** Unlike the open-items plan, nothing here was applied to a scratch copy, run, mutated or measured: the planning pass was read-only on the repository and started no server or database. What was run: `git log`/`show`/`blame`/`grep` over `main` at `62f8d80`; the live `gh api` read of the repository's security settings; and Node imports of the unchanged `planUtils.js` and `recommendationUtils.js` (pure modules, imported read-only from a scratch folder) to print today's answers and a draft of Task C2's matching, which is where every "today / after" pair in C2 comes from. Every quoted line of code was read on `62f8d80`. Every coverage effect below is a prediction from the code's shape; each task's Step "Coverage" says how to measure the real one, and the slack rule, not the prediction, is the gate. Where a fact about an upstream service could not be checked from public documentation, the task says so and makes checking it Step 1.

**`main` moved after the last floors.** `client/vite.config.js` and `server/vitest.config.js` were last re-measured on 2026-10-23 (`7d7a5d7`): client 98.93 / 94.44 / 99.11 / 99.55, floors 98.9 / 94.4 / 99.1 / 99.5; server 95.17 / 88.37 / 96.22 / 96.25, floors 95.1 / 88.3 / 96.2 / 96.2. #283 (`c194ad1`, the generate daily cap) merged after that and adds server code, so the server counts on `62f8d80` are not the note's. **Before the first server task, measure `main` once** (Conventions, "Exact coverage") and use that as the baseline for the slack arithmetic. No PR is open (`gh pr list`, 2026-10-24).

---

## Owner's decisions

**Decided 2026-10-24: the recommendation, (A) or (B) as marked, on every row.**

- **1:** (A), three states.
- **2:** (A), one flag with an explicit penalty of 14.
- **3:** (A), all three matchers.
- **4:** (A), NowCast from OpenAQ.
- **5:** (A), "Unknown".
- **6:** (B), own origin allowed, and `CLIENT_ORIGIN` optional in production.
- **7:** (B), `base.css` only, then stop.

Decisions 1, 4, 6 and 7 were asked directly; 2, 3 and 5 were taken at the recommendation, and the owner was told so. The tasks below are written to these answers.

The owner approved the eight items. Research found seven places where how to do one is a real choice, and one where the request rests on a premise that is no longer true (decision 1). Each task is written to the recommendation; the alternative is described well enough to re-plan only that task if it is chosen (spec, "What forces a re-check").

| #   | Task | The choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Options                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Recommended, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Trade-off                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | C1   | **What each glance card says when it has no reading.** The request reads as if both cards say "Unavailable" today. They do not: `2350e01` (2026-09-12) already split the headline into **"Couldn't check"** (an error is set) and **"Not checked yet"** (none is), with a Retry beside the first. CLAUDE.md's "A deliberate survivor" entry was not updated and still says "Unavailable", which is where the premise came from. The real remaining gap is that a **denied or unavailable location counts as a failed lookup** (`useDashboardData.js` sets `weatherError` to "Location permission was denied." and so on), so a visitor who said no to location sees "Couldn't check", the same as a server outage. | (A) Three states: a request that failed reads **"Couldn't load"**, a position the browser would not give (denied, unavailable, timed out, no geolocation) reads **"Unavailable"**, and a load that has not run yet keeps **"Not checked yet"**. (B) The request's two words literally: "Couldn't load" for a failed request, "Unavailable" for both the no-location and the not-yet-run states. (C) Rename only: "Couldn't check" becomes "Couldn't load"; location problems still read as a failure. (D) No code change: correct the stale CLAUDE.md entry only. | **(A).** It does what the request means (a failure reads differently from a lookup that never ran because of location) without making a temporary state read as permanent: "not yet run" happens when the dashboard opens on a view other than the summary, and the load runs the moment the visitor opens the summary (`App.jsx:164`, `shouldLoadAmbientData: dashView === "summary"`). Under (B) that visitor would read "Unavailable" for something that is about to load. | (A) needs one new piece of state per reading (the error's kind) threaded App → DashboardPage → card; (C) and (D) need none. Retry stays on every error under all four (a location timeout is worth retrying, and a visitor can re-allow location in site settings and retry).                                                                                                    |
| 2   | C2   | **What a lower-back note costs.** `detectInjuryFlags("Lower back")`, the planner's own "Lower back" option (`injuryOptions`, `app/constants.js:88`), raises both the `lower back` and the `back` rule, which carry identical keywords. A conflicting exercise (a deadlift) is penalised −14 and shows two near-identical reasons, "Potentially high stress for lower back." and "Potentially high stress for back." (printed by the scratch probe). Every other single injury costs −7. `client/README.md` records that "the ordering depends on that".                                                                                                                                                            | (A) One flag and one reason, and the `lower back` rule carries an explicit penalty of 14, so every ranking stays as it is today. (B) One flag at −7, like every other injury: a deadlift ranks seven points higher for a lower-back visitor than today. (C) Keep both flags; only drop the duplicate reason line.                                                                                                                                                                                                                                                 | **(A).** The duplicate reason is the visible bug; the doubled weight may be an accident, but it is a health-advice ranking, and a fix PR should not quietly make a risky movement rank higher. (A) makes the weight a stated number the owner can lower later.                                                                                                                                                                                                                | (A) gives the rule table a `penalty` field and `scoreExercise` reads it (one more branch); (B) is simpler and consistent but changes rankings; (C) keeps an accidental mechanism.                                                                                                                                                                                                |
| 3   | C2   | **Whether the third keyword matcher is in scope.** The same substring bug is in `buildContextCategories` (`recommendationUtils.js:117-129`), which reads the goal and today's plan lines: today "Cable fly" adds Abs (`ab` in `cable`), "Crunches" adds Cardio and Legs (`run` in `crunches`), "Warm-up walk" adds Arms, "Elegant flow" adds Legs and Calves, "Scorecard" adds Abs (all printed by the probe). Today's lines are Gemini's plan text, so this is the matcher a visitor reaches most.                                                                                                                                                                                                                | (A) Include it: one shared whole-word helper for all three. (B) Only the two functions named.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **(A).** CLAUDE.md: "Guarding the converter does not protect a caller that bypasses it", and grep every caller. Fixing two of three copies of one bug is how this class recurred.                                                                                                                                                                                                                                                                                             | Under (A) "Pushups" (one word) stops matching `push` unless listed; the task lists `pushup(s)` and `pullup(s)` as forms.                                                                                                                                                                                                                                                         |
| 4   | S2   | **Where the US AQI comes from.** Today it is the station's single latest PM2.5 value (`/v3/locations/{id}/latest`) through the EPA 2024 breakpoints, labelled "from the latest reading".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | (A) **EPA NowCast** from the same station's hourly averages (`GET /v3/sensors/{id}/hours`, same key). (B) **AirNow's own AQI** (its current-observations-by-location web service, a new `AIRNOW_API_KEY`, US reporting areas only, so OpenAQ stays for everywhere else). (C) **Open-Meteo's modelled `us_aqi`** (no key; a 24-hour rolling average over a CAMS model grid, 11 km in Europe and 45 km elsewhere, not a station). (D) Keep the instant reading and its label.                                                                                       | **(A).** It is the averaging the EPA designed for "is the air fine right now", it keeps one upstream and one key, it works outside the US, and it stays a measurement.                                                                                                                                                                                                                                                                                                        | (A): one more OpenAQ call per uncached lookup and a pure NowCast function to test. (B): a second upstream, key, cache, retry and env row, two code paths, and AirNow's response fields are documented only behind a login, so they could not be checked here. (C): simplest code, but a model, and a 24 h average reacts to a smoke plume a day late.                            |
| 5   | S2   | **What the card says when NowCast cannot be computed** (EPA: fewer than two of the three most recent hours valid, or a station that stopped reporting).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | (A) "Unknown", as for a station with no PM2.5 today. (B) Fall back to the latest single reading, labelled "from the latest reading", as today.                                                                                                                                                                                                                                                                                                                                                                                                                    | **(A).** It is what a station with no PM2.5 already does (`aqiBand(null)`, "errs indoors"), and it never presents a number the method says is not valid.                                                                                                                                                                                                                                                                                                                      | (A) shows "Unknown" more often at sparse stations; (B) keeps a number on screen with a weaker basis.                                                                                                                                                                                                                                                                             |
| 6   | S1   | **Whether `CLIENT_ORIGIN` stays required in production once the server allows its own origin.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | (A) The request's own origin is always allowed; `CLIENT_ORIGIN` stays required in production. (B) The same, and `CLIENT_ORIGIN` becomes optional in production; with it unset, production allows only its own origin (the loopback fallback becomes development-only). (C) Allow Render's `RENDER_EXTERNAL_URL` automatically instead of the request's origin. (D) Documentation only.                                                                                                                                                                            | **(B).** The README already says the client and API must be one origin (cookies are `SameSite=Lax`, every request path is relative), so in production the only origin that can ever work is the server's own. (B) removes the runbook's "awkward" step and the blank-page failure mode together.                                                                                                                                                                              | (B) relies on `Host` and, behind Render's proxy, `X-Forwarded-Proto` (`trust proxy` is already 1). A browser cannot set `Host`, so no cross-site page can claim to be same-origin; a non-browser caller can, but CORS never constrained those. (C) works only on Render and only on its `onrender.com` name, not a custom domain.                                                |
| 7   | L1   | **How much of the `@layer` migration to do.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | (A) None: close the parked item with a note. (B) **One PR:** `styles/base.css` into the lowest layer, its eight `!important` gone with the page overrides that only existed to beat them, and the page declarations that "never apply" today (because base wins their tie by loading last) deleted so they stay dead; nothing else layered. (C) (B), then the page, planner and view sheets into named layers, `!important` audited area by area (five to eight more PRs). (D) Everything at once.                                                                | **(B), then stop.** Honestly assessed below (Task L1): no visitor-visible bug motivates a migration; the one real cost of today's cascade is that `base.css` loads last and wins every tie, which forces `!important` escalation and leaves a dozen page declarations dead. (B) fixes exactly that.                                                                                                                                                                           | Moving `base.css` down wakes every page declaration that ties it; (B) deletes the ones documented as never applying, so the render stays identical, and the inventory step finds any undocumented tie before the change. (C) and (D) multiply that risk with no user benefit, and the capture tool does not see hover, focus or five of the seven lazily loaded dashboard views. |

**Made as defaults, not asked** (conventional; each task records it):

- **gitleaks (Task G):** the official action pinned by major tag (`gitleaks/gitleaks-action@v3`), as the workflow pins every action and Dependabot's `github-actions` group bumps; PR and push runs scan only their new commits, and a `workflow_dispatch` run scans the full history; the one-time full-history baseline is run locally before the PR and its result goes in the PR body; the config lives in `security/` beside the audit allowlist; the allowlist is by fixture value, not by path, so a real key pasted into a test is still caught; PR comments and artifact upload off.
- **Retry on the glance cards (Task C1):** offered for every error, as today.
- **NowCast staleness (Task S2):** hour 0 is the newest hour the station reported, used only when it ended within the last three hours.
- **Whole-word forms (Task C2):** a word matches with its plural and the few compounds a fitness note uses (`backache`, `kneecap`, `pushup`), listed explicitly rather than by a suffix rule.

---

## The tasks

Coverage cells are predictions from the code's shape (Status), not measurements.

| Order | Task | Track  | Item | Branch                                 | Change                                                                                                                 | Coverage effect (predicted)                                             | Capture                                    |
| ----- | ---- | ------ | ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| 0     | P    | -      | -    | `docs/parked-items-plan`               | This plan, landed by the coordinator as every phase plan has been                                                      | none                                                                    | -                                          |
| 1     | G    | CI     | 4    | `ci/gitleaks-secret-scan`              | A gitleaks job in `ci.yml`, its config and fixture allowlist in `security/`                                            | none (no `src` change)                                                  | -                                          |
| 2     | C1   | Client | 1    | `fix/glance-failed-versus-unavailable` | The cards tell a failed request ("Couldn't load") from no location ("Unavailable") and not yet run ("Not checked yet") | adds covered statements and about four branch arms                      | dashboard captures' headline text          |
| 3     | C2   | Client | 2    | `fix/whole-word-keyword-matching`      | `detectTrack`, `detectInjuryFlags` and `buildContextCategories` match whole words; a lower-back note is one flag       | adds about four functions' worth of covered code                        | identical                                  |
| 4     | S1   | Server | 5    | `fix/cors-allows-own-origin`           | The server's own origin is always allowed; `CLIENT_ORIGIN` optional in production                                      | adds covered code; deletes the four covered arms of the production rule | -                                          |
| 5     | S2   | Server | 3    | `feat/aqi-nowcast`                     | The US AQI is the EPA NowCast of the station's last twelve hours                                                       | adds a covered pure function and route arms                             | -                                          |
| 6     | C3   | Client | 3    | `feat/aqi-nowcast-label`               | The summary card says which basis the AQI has                                                                          | adds one covered branch                                                 | identical (captures stub `/api`)           |
| 7     | L1   | Client | 6    | `refactor/css-base-layer`              | `base.css` in the lowest `@layer`; its `!important` and the page rules that only fought it removed                     | none (CSS is not instrumented)                                          | identical, or exactly the inventory's list |
| 8     | F    | Both   | -    | `chore/parked-items-floors`            | Re-measure; raise each floor whose truncated measurement rose                                                          | -                                                                       | -                                          |

**Merge order.** G first: it is CI-only and then scans every later PR. Client: C1 → C2 → C3 → L1. Server: S1 → S2. C3 waits for S2 (it reads S2's new field). L1 goes last on the client track, because it is the riskiest and C1 changes the dashboard captures it compares against. F waits for both tracks.

**Shared files, so these cannot be built at the same time** (only one implementer uses the working tree anyway: the E2E ports, 4173/4174/5000, and Postgres are shared):

| File                                                                               | Tasks                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                                        | G (File Organization's `security/` line, a Security Rules bullet), C1 (the "deliberate survivor" entry), S2 (the absent-is-not-zero sweep's list of guarded helpers), L1 (a Build & Test bullet on the base layer; or, under decision 7 (A), F adds one sentence instead). S1 changes none (checked: `:638` and `:1034` stay true) |
| `README.md`                                                                        | S1 only (the `CLIENT_ORIGIN` rows and the deploy step); S2 checked, no line describes the score                                                                                                                                                                                                                                    |
| `server/README.md`                                                                 | S2 (the air-quality route's description)                                                                                                                                                                                                                                                                                           |
| `env.example`                                                                      | S1                                                                                                                                                                                                                                                                                                                                 |
| `render.yaml`, `docs/deploy-runbook.md`                                            | S1                                                                                                                                                                                                                                                                                                                                 |
| `playwright.config.js`                                                             | S1 (the E2E proof drops the server's own origin from `CLIENT_ORIGIN`)                                                                                                                                                                                                                                                              |
| `.github/workflows/ci.yml`                                                         | G only (S1 deliberately leaves the jobs' `CLIENT_ORIGIN` values alone)                                                                                                                                                                                                                                                             |
| `scripts/__tests__/repo-invariants.test.mjs`                                       | G (a new block); F reads it (the floor-note check)                                                                                                                                                                                                                                                                                 |
| `client/README.md`                                                                 | C2; L1 only if it describes the stylesheet order                                                                                                                                                                                                                                                                                   |
| `client/src/pages/dashboard/views/SummaryView.jsx`                                 | C3                                                                                                                                                                                                                                                                                                                                 |
| `client/src/pages/dashboard/tips/recommendationUtils.js`, `planUtils.js`           | C2                                                                                                                                                                                                                                                                                                                                 |
| `server/src/routes/external/registerAirQualityRoutes.js`, `externalDataService.js` | S2                                                                                                                                                                                                                                                                                                                                 |

No server task touches a client file and no client task a server file, so neither track can move the other's floors (spec, starting state).

---

## Conventions

The open-items plan's Conventions (`docs/plans/2026-10-22-readability-follow-up-open-items.md`, "Conventions") apply unchanged, and are not repeated in full. In short:

- **Shell.** Git Bash, from `D:\ai-workout` with an uppercase `D` (lowercase breaks Vitest). `SCRATCH` is a folder outside the repo; `TOOLS="$SCRATCH/pi-tools"` holds the Tools section's scripts and `SHOTS="$SCRATCH/pi-shots"` the captures. Never `cd` into a `src` folder (memory: the claude-flow hook then drops a `.jsonl` there and coverage logs `PARSE_ERROR`).
- **Exit codes.** Never gate on a pipe: redirect to a file, then read `$?`.
- **Secrets.** Never read, stat or print `server/.env` or any `.env*` file. If a permission rule blocks something, stop and say so. Task G's local scan runs against a **clone** made with `git clone --no-local D:/ai-workout "$SCRATCH/gl-clone"`, which carries only committed files, so no ignored `.env` is ever in front of the scanner.
- **One test file.** Server: `npm run test -w server -- <path>` (paths relative to `server/`), never `--root server` from the root. Client: `npm run test -w client -- <path>` (relative to `client/`).
- **Postgres** for every server run and for E2E: `npm run postgres:local:start -w server`, and `npm run prisma:generate -w server` after any `npm ci`. Read the `Tests` line before trusting a count.
- **Every task is a NEW branch** from `origin/main`: `git fetch origin && git switch -c <branch> origin/main`. Draft PR first. If `main` moves, merge it in (never rebase), re-run `test:coverage`, re-read the counts, and for a capture task re-capture both sides. `git merge-base --is-ancestor origin/main HEAD; echo $?` must print `0` before `gh pr ready`.
- **The edits.** Each task prints its change as the code before and after, quoted from `62f8d80`. Write each file change with the Edit tool (or a diff written with the Write tool and applied with `git apply`), never a heredoc: several changes hold regex backslashes, and a heredoc collapsed `\\b` to a backspace while this plan was being researched (CLAUDE.md, "When mutation-testing").
- **Byte-order marks.** `client/src/styles/index.css`, `client/src/styles/app.css` and `client/src/pages/home/preview/styles/layout.css` start with one (`ef bb bf`); most files do not. Before committing, `head -c 3 <file> | od -An -tx1` must print what it printed on `main`. The Edit tool keeps it; a rewrite with Write may not.
- **Formatting.** `npx prettier --write <changed files>` before the gates; re-read anything it reflows. Comment lines within 100 columns, CLAUDE.md prose within 92.
- **Comments (rule 4)** follow `docs/code-readability-sop.md`: a header on every new source file (one to four lines; `scripts/__tests__/repo-invariants.test.mjs` fails otherwise, and `file-header-allowlist.json` is never added to), a prose `/** */` summary on every export, present tense, every claim checked against the code.
- **Mutation checks.** `$TOOLS/mutate.mjs`, verbatim from `docs/plans/2026-10-15-readability-follow-up-phase-3-client.md` (Conventions, "Mutation checks"): it applies `[{ "file", "find", "text" }]` edits from a JSON file and **exits 2 when an edit did not apply**, so an unapplied mutation cannot read as a caught one. Write each mutation's JSON with the Write tool, use `String.raw` thinking for any pattern with a backslash (in JSON, a regex `\b` is written `\\b`), run each mutation alone after the fix is committed, restore with `git checkout -- <files>`, and confirm `git status --porcelain` prints nothing. A survivor is either a missing test (add it) or an equivalent mutant (say why, as CLAUDE.md's `verifyPassword` and `useBodyModel` entries do).
- **Exact coverage.** `npm run test:coverage -w <side> -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/<side>-cov.txt" 2>&1`, then `node "$TOOLS/counts.mjs" . <side>` (verbatim from `docs/plans/2026-10-16-readability-follow-up-phase-5.md`, Tools), which prints covered / total, the percentage to four decimals, the floor and the **slack** (`covered - floor / 100 × total`, which must stay 0 or more) and exits 1 below a floor. Measure the server **after** `npm run build`, so `staticClient.js`'s no-bundle arm is unreached as in CI's gate order. Record before and after in the PR body.
- **The gates on every PR.** Each redirected to a file, every exit `0`:

  ```bash
  npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
  npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
  npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "knip exit=$?"
  npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"; grep -E "index-.*\.js|larger than" "$SCRATCH/build.txt"
  npm run test:coverage > "$SCRATCH/cov.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files|Tests  " "$SCRATCH/cov.txt"
  npm run test:e2e > "$SCRATCH/e2e.txt" 2>&1; echo "test:e2e exit=$?"; tail -3 "$SCRATCH/e2e.txt"
  npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"; grep -E "Tests  " "$SCRATCH/scripts.txt"
  ```

  `build` before `test:coverage` (server branch count) and before `test:e2e` (it serves the bundle). No "larger than" warning. At most two E2E runs in ten minutes (memory: a third trips the credential limiter on the password-change test). `npm test` runs no coverage; CI runs `test:coverage`, so run that.

- **Screenshot compares (rule 7).** Phase 4's `capture.mjs`, verbatim (`docs/plans/2026-10-16-readability-follow-up-phase-4.md`, Tools; not re-printed here). It serves `client/dist` on 4174, stubs every `/api` request in the browser, denies geolocation, pins `Math.random` and the clock, and writes per capture a PNG, every element's computed style, eight boxes and the DOM. Each task that can change a page builds and captures before and after its change and compares with an expectation file; `compare` exits 0 only when every difference is listed and every listed change happened. Never widen an expectation to make a compare pass. The chain rule holds: a task's before-capture must compare `identical` to the previous client task's after-capture. Free a stuck preview server by port (`netstat -ano | grep ":4174 "`, then `taskkill //PID <pid> //F`).
- **Floors.** No fix PR edits a floor. Task F raises them once, after both tracks.
- **Merging.** Spec and quality reviews pass, checks green, `mergeStateStatus` `CLEAN`, then `gh pr merge <n> --merge` ("Create a merge commit"), and wait for CI on `main` to go green before the next task on that track.
- **Trailers.** Every commit ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

---

## Tools

Write each into `$TOOLS` with the Write tool. They run from the repo root and are never committed.

| Script             | Where it comes from                        | What it does                                                                            |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `mutate.mjs`       | Phase 3 client plan, Conventions, verbatim | Applies a JSON file's edits; exits 2 when one did not apply                             |
| `counts.mjs`       | Phase 5 plan, Tools, verbatim              | Exact counts, percentage, floor and slack per metric; exits 1 below a floor             |
| `capture.mjs`      | Phase 4 plan, Tools, verbatim              | The 44 captures and their compare                                                       |
| `props.mjs`        | Open-items plan, Tools, verbatim           | Prints chosen computed properties from one capture's style dump                         |
| `cascade-ties.mjs` | Task L1, Step 1 (described there)          | Lists every declaration `styles/base.css` wins by source order alone, per capture state |

---

## CI

### Task G: A gitleaks scan in CI

**Branch:** `ci/gitleaks-secret-scan` (first; touches no `src`, so no coverage effect on either side).

**What exists today.** Checked live on 2026-10-24 with `gh api repos/KevinN0004/ai-workout --jq .security_and_analysis`: `secret_scanning` and `secret_scanning_push_protection` are **enabled**, `secret_scanning_non_provider_patterns` and `secret_scanning_validity_checks` are **disabled**. So GitHub already blocks pushes of known provider tokens (a Google API key, a GitHub token) and alerts on any it finds. What it does not catch: generic, non-provider secrets (a random password or token assigned to `password`, `secret`, `apiKey`), which is exactly what gitleaks' `generic-api-key` rule is for, and the scan is not a visible, required PR check. gitleaks fills those two gaps; it does not replace GitHub's.

**What is in history.** No history-audit document exists in the repository (`git grep -i "credential-shaped\|history audit"` over `docs/`, `security/` and CLAUDE.md finds nothing), so this was checked here, read-only, over all 936 commits:

- **No secret-bearing file was ever committed.** `git log --all --format= --name-only` lists no `.env`, `.pem`, `id_rsa` or `credentials` path; the only env file is `.env.example` (`a5488cc`, renamed to `env.example` in `42f4e4f`), and every version of it holds empty keys and the development password `ai_workout_dev`.
- **No provider-shaped key appears in any commit**: `git log --all -p -G"AIza[0-9A-Za-z_-]{30}"` (the Gemini key format) prints nothing, and `git grep` over the tree for `AIza…`, `sk-…`, `ghp_…`, `AKIA…`, `xox[bp]-` and `-----BEGIN` prints nothing.
- **The credential-shaped strings are fixtures and documented defaults**, every one in the tree today: `postgres:postgres@localhost` (`ci.yml:88,167,266`, the CI service password); `postgres:ai_workout_dev@127.0.0.1:55432` (`env.example:7`, `README.md:123`, `server/README.md:113`, `CLAUDE.md:533`, `docs/plans/2026-09-06-foundation-hardening.md`); test URLs `fitness_user:secret@`, `u:secret@`, `u:p@`, `admin:hunter2@`, `user:pw@`, `postgres:pw@` (`postgres.test.js`, `errorHandler.test.js`, `envValidationService.test.js`, `manual-deploy.test.mjs`); test passwords `StrongPass123!`, `WrongPass123!`, `BrandNewPass456!`, `OriginalPass123!`, `RotatedPass456!`, `FirstPass123!`, `SecondPass456!`, `DeleteMePass123!`, `password123`, `old-pass`, `new-pass-123`, `old-secret`, `new-secret-1`, `e2e-password-123`, `e2e-password-456`, `a11y-password-123`; test CSRF and session tokens `issued-token`, `from-body`, `sess-retry`; and the `USER:PASSWORD@ep-something-pooler` placeholder in `docs/deploy-runbook.md:50`.

**Which of these gitleaks reports is not knowable without running it** (its `generic-api-key` rule fires on a keyword plus an entropy threshold, and `StrongPass123!` has 13 distinct characters in 14). So Step 1 runs the scan and the allowlist is built from what it actually reports, never from this list alone.

**Decisions taken as defaults (owner's table, "Made as defaults"):**

- **Pinning:** `gitleaks/gitleaks-action@v3`, a major tag, as every action in `ci.yml` is (`actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`), and `.github/dependabot.yml`'s `github-actions` group already bumps majors as reviewable PRs. The gitleaks binary the action downloads is pinned by `GITLEAKS_VERSION` to the release Step 1 scanned with, so CI and the local baseline use the same rules.
- **Diff or history:** on `pull_request` and `push`, only the new commits (the action's per-event behaviour; Step 1 confirms it in the action's source at the pinned tag); a `workflow_dispatch` run scans the full history, for after a gitleaks upgrade adds rules. History does not change without a force-push, which `main`'s protection forbids, so a scheduled full scan would re-read the same commits. The one-time full-history baseline is Step 1's local run.
- **Where the config lives:** `security/gitleaks.toml`, beside `security/audit-ci.json` (CLAUDE.md, File Organization: "`security/` — the audit-ci allowlist"), passed by `GITLEAKS_CONFIG`; not a root `gitleaks.toml` or `.gitleaksignore`, since the root "holds only what a tool requires there" and this tool takes a path.
- **How the allowlist matches:** by the fixture **value** (`regexes`, with `regexTarget = "match"`), plus `commits` for any finding that exists only in history. Not by path: a `__tests__/` path allowlist would wave through a real key pasted into a test.
- **Least privilege:** the job's `permissions` are `contents: read` and `pull-requests: read` (the action lists a PR's commits through the API); `GITLEAKS_ENABLE_COMMENTS: false`, so it needs no write scope; `GITLEAKS_ENABLE_UPLOAD_ARTIFACT: false`, because on a public repository a report artifact is downloadable and Step 4 has not yet shown what it contains.

**Files:**

- Modify: `.github/workflows/ci.yml` (the `on:` block, lines 3-8; a new `secrets` job after `quality`, before `test` at line 62)
- Create: `security/gitleaks.toml`
- Modify: `security/README.md` (a section beside the audit allowlist's)
- Modify: `CLAUDE.md` (File Organization's `security/` line; Security Rules, one bullet)
- Test: `scripts/__tests__/repo-invariants.test.mjs` (a block pinning the job to the config path, so the two cannot drift)

- [ ] **Step 1: Branch, read the action at the tag, and run the baseline**

```bash
git fetch origin && git switch -c ci/gitleaks-secret-scan origin/main
gh api repos/gitleaks/gitleaks-action/releases/latest --jq '.tag_name'
gh api repos/gitleaks/gitleaks/releases/latest --jq '.tag_name'
gh api repos/gitleaks/gitleaks-action/contents/README.md?ref=v3 --jq .content | base64 -d > "$SCRATCH/gl-action-readme.md"
```

Read the README at `v3` and the action's `src/` event handling (`gh api repos/gitleaks/gitleaks-action/contents/src?ref=v3`) for four things, and record each in the PR body: that `pull_request` scans the PR's commits and `push` the pushed range; what `workflow_dispatch` scans; the exact names of `GITLEAKS_VERSION`, `GITLEAKS_CONFIG`, `GITLEAKS_ENABLE_COMMENTS` and `GITLEAKS_ENABLE_UPLOAD_ARTIFACT` at v3 (the README read during planning confirmed the first three exist and that `GITLEAKS_LICENSE` is "required for organizations, not required for user accounts"; this repository is a user account's); and which API permission the PR path needs. If any differs from this plan, adjust the job, and say so.

Then the baseline, with the gitleaks release just found as `$GLV` (a tag like `v8.x.y`), against a clone so no ignored file is in view, with the Docker image mounted read-only:

```bash
git clone --no-local --quiet D:/ai-workout "$SCRATCH/gl-clone"
docker run --rm -v "$(cygpath -w "$SCRATCH/gl-clone"):/repo:ro" -v "$(cygpath -w "$SCRATCH"):/out" \
  "zricethezav/gitleaks:$GLV" git /repo --redact --report-format json --report-path /out/gl-baseline.json \
  > "$SCRATCH/gl-baseline.txt" 2>&1; echo "baseline exit=$?"
node -e 'const r=require(process.argv[1]);console.log(r.length);for(const f of r)console.log(f.RuleID,f.File,f.StartLine,f.Commit.slice(0,8))' "$SCRATCH/gl-baseline.json"
```

`--redact` keeps any real value out of the report and the log. Expected: exit `1` with a list of findings, every one in a test, a doc or `ci.yml`, matching the inventory above. **If any finding is not a fixture, stop**: that is a credential to rotate first (the owner's job), not one to allowlist.

- [ ] **Step 2: The failing check first**

Write the invariant test (a new `describe` in `scripts/__tests__/repo-invariants.test.mjs`, beside the hook-wiring blocks, in that file's style: read the file with `readFileSync`, assert on its text):

```js
describe("the secret scan", () => {
  const ci = readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");

  // The scan reads its allowlist from security/, and a moved or renamed file
  // would make it fall back to gitleaks' defaults, failing every PR on the
  // fixtures, or worse, being "fixed" by deleting the job.
  test("runs gitleaks with the config in security/", () => {
    expect(ci).toMatch(/uses: gitleaks\/gitleaks-action@v\d+/);
    expect(ci).toMatch(/GITLEAKS_CONFIG: security\/gitleaks\.toml/);
    expect(existsSync(path.join(repoRoot, "security/gitleaks.toml"))).toBe(true);
  });

  // gitleaks reads history, and a shallow checkout gives it one commit.
  test("checks out the full history for it", () => {
    const job = ci.slice(ci.indexOf("  secrets:"), ci.indexOf("  test:"));
    expect(job).toMatch(/fetch-depth: 0/);
  });
});
```

(Use the file's existing names for the repo root and its imports; read its top first.) Run `npm run test:scripts > "$SCRATCH/g-red.txt" 2>&1; echo "exit=$?"`. Expected: exit `1`, both tests failing (no job, no file).

- [ ] **Step 3: The config and the job**

`security/gitleaks.toml`, built from Step 1's findings. Its shape (every regex below must correspond to a Step 1 finding; drop any that matched nothing, and add one per finding not listed):

```toml
# The secret scan's configuration: gitleaks' default rules, plus an allowlist
# of the fixture values the test suites and docs use. Read by CI's secrets job.

[extend]
useDefault = true

[[allowlists]]
description = "Fixture passwords and tokens the test suites and E2E use"
regexTarget = "match"
regexes = [
  '''StrongPass123!''',
  '''(Wrong|BrandNew|Original|Rotated|First|Second|DeleteMe)Pass\d{3}!''',
  '''(e2e|a11y)-password-\d{3}''',
]

[[allowlists]]
description = "Connection strings with documented development or test passwords"
regexTarget = "match"
regexes = [
  '''postgres(ql)?://postgres:(postgres|ai_workout_dev|pw)@(localhost|127\.0\.0\.1)''',
  '''postgres(ql)?://(u|user|admin|fitness_user):(p|pw|secret|hunter2)@''',
  '''postgresql://USER:PASSWORD@''',
]
```

Each `regexes` entry is a TOML literal string (`'''…'''`), so its backslashes reach gitleaks as written. Write the file with the Write tool. If a finding lives only in a commit no longer in the tree, allowlist it by `commits = ["<sha>"]` in its own `[[allowlists]]` block with a description naming what it was.

`ci.yml`: add `workflow_dispatch:` under `on:` (after `pull_request:`), and the job after `quality` (lines 21-60):

```yaml
# gitleaks over the commits each push or PR adds (a manual run reads the whole
# history). GitHub's own secret scanning blocks provider tokens; this catches
# the generic ones, against the fixture allowlist in security/gitleaks.toml.
secrets:
  name: Secret scan
  runs-on: ubuntu-latest
  timeout-minutes: 10
  permissions:
    contents: read
    pull-requests: read
  steps:
    - name: Checkout
      uses: actions/checkout@v7
      with:
        fetch-depth: 0

    - name: Gitleaks
      uses: gitleaks/gitleaks-action@v3
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        GITLEAKS_CONFIG: security/gitleaks.toml
        GITLEAKS_VERSION: <Step 1's $GLV without the v>
        GITLEAKS_ENABLE_COMMENTS: false
        GITLEAKS_ENABLE_UPLOAD_ARTIFACT: false
```

Then re-run the baseline with the config, and the scripts test:

```bash
docker run --rm -v "$(cygpath -w "$PWD"):/repo:ro" "zricethezav/gitleaks:$GLV" git /repo --redact \
  --config /repo/security/gitleaks.toml > "$SCRATCH/gl-config.txt" 2>&1; echo "with config exit=$?"
npm run test:scripts > "$SCRATCH/g-green.txt" 2>&1; echo "exit=$?"
```

Run the Docker scan against the branch's working tree only after `git status --porcelain` shows nothing but this task's files (the tree, unlike the clone, holds ignored files; `git` mode reads commits, not the working tree, so commit first). Expected: `with config exit=0`, `exit=0`.

- [ ] **Step 4: Mutation checks (the scan must still bite)**

| Mutation                                                                                                                                                          | Expected                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Plant, on a throwaway branch, `const apiKey = "<32 random base62 characters>";` in a new `client/src/__tests__/leak.test.js`, commit, run Step 3's Docker command | exit `1`, one `generic-api-key` finding at that line: a value allowlist does not hide a new secret in a test path |
| Delete the `[[allowlists]]` blocks from the config, run the same command on the task branch                                                                       | exit `1`, the baseline's findings back: the allowlist is what clears them                                         |
| Delete `GITLEAKS_CONFIG` from the job                                                                                                                             | the Step 2 test fails                                                                                             |
| Remove `fetch-depth: 0`                                                                                                                                           | the Step 2 test fails                                                                                             |

Then the real CI proof, once the PR is open: push the planted commit to a **separate** throwaway branch, open a draft PR from it, and confirm the "Secret scan" job fails and that its log and job summary show the finding **redacted** (if the raw value is printed anywhere, replace the action with the CLI image run as in Step 3, which `--redact` controls, and say so in the PR). The planted value is random and was never a credential; GitHub's push protection does not block it because non-provider patterns are disabled. Close that PR and delete its branch (`gh pr close <n> --delete-branch`).

- [ ] **Step 5: Docs**

- `security/README.md`: a "Secret scan" section: what runs and when (PR and push: new commits; manual run: full history); that the allowlist is by value; how to add a fixture (a regex in the right block, never a path); that a finding which is not a fixture means rotating the credential first; that GitHub secret scanning and push protection are on and gitleaks complements them.
- `CLAUDE.md`, File Organization: "`security/` — the audit-ci allowlist (`audit-ci.json`) and the advisory reviews it is checked against" becomes "… and the gitleaks config (`gitleaks.toml`), whose allowlist names fixture values, never paths". Security Rules, after "NEVER commit `.env` files…": "- **A secret scan runs on every PR and push** (CI's secrets job, gitleaks, `security/gitleaks.toml`). A test fixture that trips it is allowlisted by its value, never by its path."
- `README.md`: nothing (it names no CI job individually; checked with `grep -n "Lint, format, audit\|jobs" README.md`).

- [ ] **Step 6: Gates and PR**

Gates (Conventions): `lint`, `format:check` (it formats the YAML, TOML is not Prettier's), `knip`, `test:scripts`, `build`; `test:coverage` and E2E must print `main`'s counts unchanged (no `src` change). Commit: `ci: scan each push and PR for secrets with gitleaks` with the body "GitHub's secret scanning blocks provider tokens; gitleaks adds the generic ones and a visible check. The allowlist names the fixture values the suites use, so a real key in a test is still caught." and the trailer. `git push -u origin ci/gitleaks-secret-scan`; `gh pr create --draft --base main --title "ci: scan each push and PR for secrets with gitleaks" --body-file "$SCRATCH/pr-g.md"`.

`pr-g.md` outline: what GitHub already does (the live settings read); what gitleaks adds; the action-source findings from Step 1; the full-history baseline (count of findings by rule and file, all fixtures, redacted); the allowlist and why by value; the mutation table and the planted-secret PR's failing run (link); permissions and why comments and artifacts are off; **an owner action after merge**: add "Secret scan" to `main`'s required checks (Settings → Branches), which this PR cannot do; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Client track

Four PRs, merged in order C1 → C2 → C3 → L1. C3 also waits for S2 on the server track.

### Task C1: A failed lookup reads "Couldn't load"; no location reads "Unavailable"

**Branch:** `fix/glance-failed-versus-unavailable` (client track, first). Written to decision 1's recommendation (A).

**What the card does today** (`client/src/pages/dashboard/components/DashboardAtAGlance.jsx`, `62f8d80`). The weather headline, lines 84-96:

```jsx
<p className="dashboard-glance-value">
  {weatherLoading
    ? weatherRecommendation
      ? "Refreshing..."
      : "Checking..."
    : weatherRecommendation?.workoutType === "outdoor"
      ? "Outdoor friendly"
      : weatherRecommendation?.workoutType === "indoor"
        ? "Indoor suggested"
        : weatherError
          ? "Couldn't check"
          : "Not checked yet"}
</p>
```

and the air-quality headline, lines 122-128:

```jsx
<p className="dashboard-glance-value">
  {airQualityLoading
    ? airSummary
      ? "Refreshing..."
      : "Checking..."
    : airSummary?.level || (airQualityError ? "Couldn't check" : "Not checked yet")}
</p>
```

Each note under the headline is `summary || error || placeholder` (lines 97-99, 129-131) and already carries the error text, and Retry shows whenever there is an error and a handler (lines 100, 132). This is `2350e01`'s work (2026-09-12, "tell a failed ambient lookup from one that never ran"), which replaced the single "Unavailable" that CLAUDE.md's entry still describes.

**Every state that reaches each card, traced.** The props come from `useDashboardData` (`client/src/app/hooks/useDashboardData.js`) through `App.jsx:150-158` and `:603-612` and `DashboardPage.jsx:103-112` and `:443-452`; `DashboardPage.jsx:219-220` derives `weatherRecommendation = weatherData?.recommendation || null` and `airSummary = airQualityData?.summary || null`.

| State                    | How it arises                                                                                                                                                                                                 | Props                | Headline today                                      | After (A)                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| First load running       | `loadWeatherRecommendation` sets loading, clears error (`:105-108`)                                                                                                                                           | loading, no reading  | Checking...                                         | unchanged                                                                    |
| Refresh running          | the same, over a reading (cached or earlier)                                                                                                                                                                  | loading, reading     | Refreshing...                                       | unchanged                                                                    |
| Reading                  | a 200 (`:124-132`), or the per-account cache (`:243-251`)                                                                                                                                                     | reading              | Outdoor friendly / Indoor suggested / the AQI level | unchanged (an error beside a reading still only shows in the note and Retry) |
| **Location refused**     | `getCurrentCoordinates` (`:82-101`) rejects with a `GeolocationPositionError`: code 1 denied, 2 unavailable, 3 timed out, else "Unable to access location." (`:139-149`, `:200-210`)                          | error, no reading    | Couldn't check                                      | **Unavailable**                                                              |
| **No geolocation API**   | `err.code === "GEO_NOT_AVAILABLE"` (`:83-86`); air reports its message (`:211-212`), weather falls to the generic branch (`:150-155`)                                                                         | error, no reading    | Couldn't check                                      | **Unavailable**                                                              |
| **Unusable coordinates** | `getCurrentCoordinates` throws "Unable to determine location coordinates." (`:97-98`), no code                                                                                                                | error, no reading    | Couldn't check                                      | **Unavailable**                                                              |
| **Request failed**       | a non-OK answer (`:119-122`), `fetchWithTimeout`'s timeout or a network error                                                                                                                                 | error, no reading    | Couldn't check                                      | **Couldn't load**                                                            |
| Not yet run              | the ambient auto-load runs only on the summary view (`:342-352`, `shouldLoadAmbientData: dashView === "summary"`, `App.jsx:164`), so a dashboard opened on any other view shows the strip with nothing loaded | no error, no reading | Not checked yet                                     | unchanged                                                                    |

Note what the request's premise missed: the server's fallback answers (`registerAirQualityRoutes.js:124-150` for an OpenAQ outage or a missing key, and the weather route's equivalent) are **200s with a reading** whose level is "Unknown", so an upstream outage reaches the card as a reading, not an error. "Couldn't load" is for the app's own request failing (a 4xx/5xx from our server, a timeout, the network).

**The fix.** The hook records the error's **kind** beside its text: `"location"` when no position was obtained, so no request was made, `"lookup"` when the request itself failed. One `let located = false`, set to `true` the line after `getCurrentCoordinates()` resolves, decides it in the catch, so every location failure (all five rows above) is classified the same way without listing their codes again. The card reads the kind only when there is an error and no reading.

**Files:**

- Modify: `client/src/app/hooks/useDashboardData.js` (two `useState`s at `:54` and `:58`; both loaders; `clearDashboardDataState` `:366-379`; the return `:381-399`; the hook's doc comment `:27-37`)
- Modify: `client/src/App.jsx` (`:150-158` destructure, `:605` and `:610` props)
- Modify: `client/src/pages/dashboard/DashboardPage.jsx` (`:105`, `:110` destructure; `:446`, `:451` the glance's props only; SummaryView does not take them)
- Modify: `client/src/pages/dashboard/components/DashboardAtAGlance.jsx` (props `:15-34`, the two headlines, the doc comment `:6-14`)
- Test: `client/src/pages/dashboard/components/__tests__/DashboardAtAGlance.test.jsx`, `client/src/app/hooks/__tests__/useDashboardData.test.jsx`, `client/src/pages/dashboard/__tests__/DashboardPage.test.jsx`, `client/src/__tests__/App.test.jsx`
- Modify: `CLAUDE.md` (the "A deliberate survivor is how you prove a branch is dead" entry, `:938-952`)

- [ ] **Step 1: Branch, the before-capture, and the wording on `main`**

```bash
git fetch origin && git switch -c fix/glance-failed-versus-unavailable origin/main
git grep -n "Couldn't check\|Not checked yet" -- client/src e2e
npm run build > "$SCRATCH/b-c1-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c1-before" > "$SCRATCH/c1-cap0.txt" 2>&1; echo "capture exit=$?"
grep -l "Couldn't check" "$SHOTS/c1-before/"*.dom.html | sed 's#.*/##' > "$SCRATCH/c1-couldnt.txt"; cat "$SCRATCH/c1-couldnt.txt"
grep -l "Not checked yet" "$SHOTS/c1-before/"*.dom.html | sed 's#.*/##'
```

Expected: the strings only in `DashboardAtAGlance.jsx` and its test, none in `e2e/`. The capture tool denies geolocation, so every capture on `/dashboard` with the summary view (`dash-loading`, `dash-summary`, `dash-workout-modal`, `dash-planner`, at each of their viewports, and `desktop-dash-summary-motion`) should show "Couldn't check" twice (the location-refused row), and `dash-meal-loading` and `dash-tips-loading` (other views, no auto-load) "Not checked yet". The two greps are the record of exactly which captures carry which; Step 6's expectations come from them.

- [ ] **Step 2: The failing tests**

`DashboardAtAGlance.test.jsx`: replace the two tests named "a failed lookup reads differently from one that never ran" (weather `:126-143`, air `:184-192`) with a table over both cards, and keep every other test:

```jsx
// Three different reasons for having no reading, and the headline, the line
// a visitor scans, names each: our request failed; the browser gave no
// position, so nothing was requested; or the summary view has not loaded
// yet. The note underneath carries the detail in every case.
describe.each([
  ["weather", "weatherError", "weatherErrorKind"],
  ["air", "airQualityError", "airQualityErrorKind"]
])("the %s card without a reading", (name, errorProp, kindProp) => {
  test.each([
    [
      "a request that failed",
      { [errorProp]: "Lookup failed", [kindProp]: "lookup" },
      "Couldn't load"
    ],
    [
      "no position from the browser",
      { [errorProp]: "Location permission was denied.", [kindProp]: "location" },
      "Unavailable"
    ],
    ["an error of no stated kind", { [errorProp]: "Lookup failed" }, "Couldn't load"],
    ["a load that has not run", {}, "Not checked yet"]
  ])("reads %s as expected", (_label, props, expected) => {
    renderGlance(props);

    expect(headline(name)).toBe(expected);
  });

  test("keeps the error text in the note", () => {
    renderGlance({ [errorProp]: "Location permission was denied.", [kindProp]: "location" });

    expect(note(name)).toBe("Location permission was denied.");
  });

  test("still offers Retry when the location was refused", () => {
    const handlers = { refreshWeatherRecommendation: vi.fn(), refreshAirQuality: vi.fn() };
    renderGlance({
      [errorProp]: "Location request timed out.",
      [kindProp]: "location",
      ...handlers
    });

    expect(within(card(name)).getByRole("button", { name: /^Retry/ })).toBeInTheDocument();
  });
});
```

Add `weatherErrorKind: ""` and `airQualityErrorKind: ""` to `DEFAULTS`, and update "a recommendation with no workout type" (`:115-119`) and "a reading with no level falls through to the not-checked wording" (`:194-200`): both still expect "Not checked yet" (no error), so they stay as written. "An error of no stated kind" pins the safe default: anything not known to be a location failure reads as a failure.

`useDashboardData.test.jsx`: beside the two geolocation tables (`:420-436` weather, `:782-798` air), add for each loader:

```jsx
test.each([
  ["denied", { error: geoError(1) }],
  ["unavailable", { error: geoError(2) }],
  ["timed out", { error: geoError(3) }]
])("a position the browser %s is a location failure, not a failed lookup", async (_label, geo) => {
  stubGeolocation(geo);
  const fetchMock = vi.fn(async () => jsonResponse({}));
  vi.stubGlobal("fetch", fetchMock);
  const { result } = ambient();

  await act(async () => result.current.loadWeatherRecommendation());

  await waitFor(() => expect(result.current.weatherErrorKind).toBe("location"));
  // Nothing was requested, which is what "Unavailable" claims.
  expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/weather"))).toBe(false);
});

test("no geolocation API at all is a location failure", async () => {
  vi.stubGlobal("navigator", {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({}))
  );
  const { result } = ambient();

  await act(async () => result.current.loadWeatherRecommendation());

  await waitFor(() => expect(result.current.weatherErrorKind).toBe("location"));
});

test("a request the server refuses is a failed lookup", async () => {
  stubGeolocation({ position: { coords: { latitude: 1, longitude: 2 } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ error: "down" }, 503))
  );
  const { result } = ambient();

  await act(async () => result.current.loadWeatherRecommendation());

  await waitFor(() => expect(result.current.weatherErrorKind).toBe("lookup"));
});

test("a new load clears the last error's kind", async () => {
  stubGeolocation({ error: geoError(1) });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({}))
  );
  const { result } = ambient();
  await act(async () => result.current.loadWeatherRecommendation());
  await waitFor(() => expect(result.current.weatherErrorKind).toBe("location"));

  stubGeolocation({ position: { coords: { latitude: 1, longitude: 2 } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ recommendation: {} }))
  );
  await act(async () => result.current.loadWeatherRecommendation());

  expect(result.current.weatherErrorKind).toBe("");
});
```

and the same four for `loadAirQuality` / `airQualityErrorKind` / `/api/air-quality`, plus one test that `clearDashboardDataState()` resets both kinds to `""`. Use the file's own helpers (`ambient`, `stubGeolocation`, `geoError`, `jsonResponse`); read their signatures first and adjust the calls (in particular, whether `jsonResponse` takes a status).

`DashboardPage.test.jsx`: add `"weatherErrorKind"` and `"airQualityErrorKind"` to `GLANCE_PROPS` (`:707-726`) and **not** to `SUMMARY_PROPS`, and one glance-only test that they are not crossed:

```jsx
test("the glance strip gets each card's own error kind", () => {
  renderPage({ dashView: "summary", weatherErrorKind: "location", airQualityErrorKind: "lookup" });

  expect(glance.props.weatherErrorKind).toBe("location");
  expect(glance.props.airQualityErrorKind).toBe("lookup");
});
```

`App.test.jsx`: the one test that runs the real hook. jsdom has no `navigator.geolocation` (check: `grep -rn "geolocation" client/src/test client/vitest.setup.* 2>/dev/null` prints nothing), so a signed-in `/dashboard` on the summary view auto-loads and fails with `GEO_NOT_AVAILABLE`:

```jsx
test("hands the dashboard the kind of each ambient failure", async () => {
  stubSession(sessionResponse({ user: { email: "ada@example.com" } }));
  await renderSettled("/dashboard");

  await waitFor(() => expect(dash.props.weatherErrorKind).toBe("location"));
  expect(dash.props.airQualityErrorKind).toBe("location");
});
```

Run:

```bash
npm run test -w client -- src/pages/dashboard/components/__tests__/DashboardAtAGlance.test.jsx src/app/hooks/__tests__/useDashboardData.test.jsx src/pages/dashboard/__tests__/DashboardPage.test.jsx src/__tests__/App.test.jsx > "$SCRATCH/c1-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |expected" "$SCRATCH/c1-red.txt" | head -20
```

Expected: exit `1`. The "Couldn't load" and "Unavailable" rows fail with `expected "Couldn't check" to be …`; the hook tests with `expected undefined to be 'location'`; the props tests on the missing keys. "A load that has not run" and "keeps the error text in the note" pass already, and say why in the PR: they pin what must not change.

- [ ] **Step 3: The fix**

`useDashboardData.js`, state (after `:54` and `:58`):

```js
const [weatherError, setWeatherError] = useState("");
// "location" when the browser gave no position, so nothing was requested;
// "lookup" when the request failed. Empty while there is no error.
const [weatherErrorKind, setWeatherErrorKind] = useState("");
```

and the same `airQualityErrorKind` after `airQualityError`. In `loadWeatherRecommendation`, the start (`:104-112`) becomes:

```js
    setWeatherLoading(true);
    setWeatherError("");
    setWeatherErrorKind("");
    // Set once a position is in hand: a failure before it is the browser's,
    // after it the request's.
    let located = false;
    try {
      // Locate the visitor, fetch for that spot, and cache the reading with
      // the time it arrived.
      const { latitude, longitude } = await getCurrentCoordinates();
      located = true;
```

and the catch, right after `if (weatherRequestRef.current !== requestId) return;` in the catch (`:136`):

```js
setWeatherErrorKind(located ? "lookup" : "location");
```

The same three edits in `loadAirQuality` (its start at `:166-172`, its catch guard at `:197`). `clearDashboardDataState` gains `setWeatherErrorKind("")` after `setWeatherError("")` and `setAirQualityErrorKind("")` after `setAirQualityError("")`; the return gains `weatherErrorKind` after `weatherError` and `airQualityErrorKind` after `airQualityError`. The hook's doc comment (`:27-37`), "each with its loading flag and error", becomes "each with its loading flag, its error and the error's kind (`"location"` when the browser gave no position, `"lookup"` when the request failed)".

`App.jsx`: `weatherErrorKind,` after `weatherError,` (`:152`) and `airQualityErrorKind,` after `airQualityError,` (`:156`); `weatherErrorKind={weatherErrorKind}` after `:605` and `airQualityErrorKind={airQualityErrorKind}` after `:610`.

`DashboardPage.jsx`: both names in the destructure after `:105` and `:110`, and passed to `DashboardAtAGlance` only, after `:446` and `:451`.

`DashboardAtAGlance.jsx`: `weatherErrorKind,` after `weatherError,` and `airQualityErrorKind,` after `airQualityError,` in the props. The weather headline's last arm:

```jsx
                    : weatherError
                      ? weatherErrorKind === "location"
                        ? "Unavailable"
                        : "Couldn't load"
                      : "Not checked yet"}
```

The air headline:

```jsx
                : airSummary?.level ||
                  (airQualityError
                    ? airQualityErrorKind === "location"
                      ? "Unavailable"
                      : "Couldn't load"
                    : "Not checked yet")}
```

The doc comment's last sentence, "The weather and air cards offer Retry while their last load has an error; a reading already on screen stays in place of the error text.", is followed by: "With no reading, their headline says why: "Couldn't load" when the request failed, "Unavailable" when the browser gave no position (`*ErrorKind` is "location"), so nothing was requested, and "Not checked yet" before the summary view's first load."

```bash
npx prettier --write client/src/app/hooks/useDashboardData.js client/src/App.jsx client/src/pages/dashboard/DashboardPage.jsx client/src/pages/dashboard/components/DashboardAtAGlance.jsx client/src/pages/dashboard/components/__tests__/DashboardAtAGlance.test.jsx client/src/app/hooks/__tests__/useDashboardData.test.jsx client/src/pages/dashboard/__tests__/DashboardPage.test.jsx client/src/__tests__/App.test.jsx
npm run test -w client -- src/pages/dashboard/components/__tests__/DashboardAtAGlance.test.jsx src/app/hooks/__tests__/useDashboardData.test.jsx src/pages/dashboard/__tests__/DashboardPage.test.jsx src/__tests__/App.test.jsx > "$SCRATCH/c1-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c1-green.txt"
git add client/src
git commit -m "fix(client): a failed lookup reads Couldn't load; no location reads Unavailable" -m "A denied, unavailable or timed-out location counted as a failed lookup, so the glance cards said Couldn't check when nothing had been requested. The hook now records whether a position was obtained, and the cards read Couldn't load for a request that failed, Unavailable when the browser gave no position, and Not checked yet before the first load." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`.

- [ ] **Step 4: Mutation checks**

| Mutation                                                                                     | Caught by                                                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| weather: `located = true;` deleted                                                           | "a request the server refuses is a failed lookup" (reads "location") |
| air: the same                                                                                | the air copy of that test                                            |
| weather: `setWeatherErrorKind(located ? "lookup" : "location")` → `… "location" : "lookup")` | every weather kind test                                              |
| weather: `setWeatherErrorKind("");` at the start deleted                                     | "a new load clears the last error's kind"                            |
| `clearDashboardDataState`: `setAirQualityErrorKind("")` deleted                              | the clear test                                                       |
| card: `weatherErrorKind === "location"` → `weatherErrorKind !== "lookup"`                    | "an error of no stated kind" (reads "Unavailable")                   |
| card: the air ternary's arms swapped                                                         | the air rows "Couldn't load" and "Unavailable"                       |
| `App.jsx`: `weatherErrorKind={weatherErrorKind}` deleted                                     | the App test                                                         |
| `DashboardPage.jsx`: the glance's two props swapped                                          | "the glance strip gets each card's own error kind"                   |

Each mutation alone, `git checkout -- client/src` after each, `git status --porcelain` empty.

- [ ] **Step 5: Coverage**

Predicted: two `useState` lines, three statements per loader (`setX("")`, `let located`, `located = true`, the catch's set), the clear and return lines, all reached; four new branch arms in the card (two ternaries) and two in the hook (`located ?`), all reached by Step 2's tables. No new function. Measure (Conventions) and record before and after; every client slack must stay 0 or more.

- [ ] **Step 6: The after-capture and the compare**

```bash
npm run build > "$SCRATCH/b-c1-1.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c1-after" > "$SCRATCH/c1-cap1.txt" 2>&1; echo "capture exit=$?"
grep -c "Unavailable" "$SHOTS/c1-after/"*dash-summary.dom.html
grep -l "Couldn't check\|Couldn't load" "$SHOTS/c1-after/"*.dom.html; echo "none expected above"
```

Write `$SHOTS/c1-expect.json`, one `png` entry whose `captures` regex lists exactly the capture names in `$SCRATCH/c1-couldnt.txt` (Step 1), for example:

```json
[
  {
    "kind": "png",
    "captures": "^(desktop|tablet|phone|wide)-dash-(loading|summary|workout-modal|planner)(-motion)?$"
  }
]
```

(narrow the viewport alternatives to the ones that file lists). The headline is a block `<p>` in a grid cell, so the shorter word changes no computed `width` or `height`, only pixels; if the compare reports a `style` or `rect` row, the expectation is wrong or the text wrapped differently: find out which before going on.

```bash
node "$TOOLS/capture.mjs" compare "$SHOTS/c1-before" "$SHOTS/c1-after" "$SHOTS/c1-expect.json" > "$SCRATCH/c1-cmp.txt" 2>&1; echo "compare exit=$?"; tail -3 "$SCRATCH/c1-cmp.txt"
```

Expected: `compare exit=0`, `0 unexpected; 0 expected but absent`; "Unavailable" twice in each dash-summary DOM; no "Couldn't" anywhere (the capture never makes a request fail); `dash-meal-loading` and `dash-tips-loading` unchanged ("Not checked yet").

- [ ] **Step 7: CLAUDE.md**

The entry at `CLAUDE.md:938-952` ends: "**Whether a failed lookup should read differently from one that has not happened is a copy decision, and it is still open** — collapsing the condition removed a branch that could not make that distinction, not the question of whether to make it." That has been untrue since `2350e01`. Replace the paragraph from "Both conditions have since been collapsed" to the end of the entry with (wrapped at 92 columns, indented as the entry is):

> Both conditions were later collapsed to the single string they always produced, which removed the mutations' target. The question they could not answer, whether a failed lookup should read differently from one that never ran, was then decided: the headline reads "Couldn't load" when our request failed, "Unavailable" when the browser gave no position so nothing was requested (the hook's `*ErrorKind`), and "Not checked yet" before the summary view's first load. The note under each card still carries the error text.

The two finished plans that list this as an open copy decision (`docs/plans/2026-10-17-readability-follow-up-phase-6.md:2246`, `docs/plans/2026-10-22-readability-follow-up-open-items.md:4837`) stay as they are: they are records of their phase.

- [ ] **Step 8: Gates and PR**

Gates (Conventions), with E2E (the smoke and a11y suites open the dashboard with geolocation denied, so the cards render "Unavailable" there; axe must still report zero violations). `git push -u origin fix/glance-failed-versus-unavailable`; `gh pr create --draft --base main --title "fix(client): a failed lookup reads Couldn't load; no location reads Unavailable" --body-file "$SCRATCH/pr-c1.md"`.

`pr-c1.md` outline: decision 1 and the corrected premise (`2350e01`, the stale CLAUDE.md entry); the state table; why the kind is decided by `located` rather than by error codes; the red run; the mutation table; coverage before and after; the compare and the captures it lists; the CLAUDE.md change; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge. Keep `$SHOTS/c1-after` for C2.

---

### Task C2: Keywords match whole words, and a lower-back note is one flag

**Branch:** `fix/whole-word-keyword-matching` (client track, after C1). Written to decision 2 (A) and decision 3 (A).

**The three matchers, as they are on `62f8d80`.**

`detectTrack`, `client/src/pages/dashboard/planUtils.js:95-120`:

```js
/**
 * Maps goal text to a track by keyword, tried in order: fat_loss, endurance,
 * recovery, and lean_strength when none match. A keyword matches anywhere in
 * the text, inside a longer word included. Of goalOptions, only "Build lean
 * strength and energy" has no keyword, and lean_strength is the track it is
 * meant for. The four names also key the meal templates here, the meal
 * suggestions in meal/data and the tips' categories.
 */
export const detectTrack = (goalText = "") => {
  const lower = goalText.toLowerCase();
  if (lower.includes("fat loss") || lower.includes("cut") || lower.includes("conditioning")) {
    return "fat_loss";
  }
  if (
    lower.includes("endurance") ||
    lower.includes("athletic") ||
    lower.includes("performance") ||
    lower.includes("cardio")
  ) {
    return "endurance";
  }
  if (lower.includes("mobility") || lower.includes("recovery") || lower.includes("joint")) {
    return "recovery";
  }
  return "lean_strength";
};
```

Callers: `MealView.jsx:62`, `TipsView.jsx:180`, `buildWeeklyMealPlan` (`planUtils.js:152`), and through it `useDashboardMetrics`. `detectInjuryFlags`, `client/src/pages/dashboard/tips/recommendationUtils.js:150-162`:

```js
/**
 * Each injury whose name appears in the text, with its risky keywords. Names
 * match anywhere, so "lower back" flags both "lower back" and "back", and an
 * exercise conflicting with them is penalised once for each.
 */
export const detectInjuryFlags = (injuryText) => {
  const source = normalizeText(injuryText);
  const active = [];
  for (const [injury, keywords] of Object.entries(injuryKeywordRules)) {
    if (source.includes(injury)) active.push({ injury, keywords });
  }
  return active;
};
```

over `injuryKeywordRules` (`:75-84`), whose `"lower back"` and `back` entries carry the same four keywords. Its one caller is `TipsView.jsx:194`, on `buildInjuryText(form?.injuries, user?.profile?.notes)`. `buildContextCategories` (`:117-129`), over `keywordCategoryMap` (`:16-34`), tests `sourceText.includes(rule.keyword)`; its one caller is `TipsView.jsx:184`, on the goal and today's plan lines. `scoreExercise` (`:201-292`) subtracts 7 per flag whose keyword appears in the exercise's name or description (`:273-281`).

**What is actually wrong.** "Lower back is a back issue" is right, and the matching is not wrong to find the back in it. What is wrong is that one mention raises **two** flags: the scratch probe (Status) printed, for the planner's own "Lower back" option against a "Romanian Deadlift", a score of **−14** and the reasons `["Potentially high stress for lower back.", "Potentially high stress for back.", "Fits your current filters."]`. Every other single injury costs −7 and gives one reason. `client/README.md:225-228` records this as "the double penalty", and that "the ordering depends on that". The second bug is the one in the parked item's name: every matcher finds its keyword **inside** longer words.

**Where each is reachable.** Verified on `62f8d80`:

- **Injury text is free text and the planner's choices**, so `detectInjuryFlags` is reachable in the app: the planner's injuries field offers `["None", "Lower back", "Knee", "Shoulder", "Hip", "Wrist/Elbow"]` (`app/constants.js:88`), and the profile's notes are a 500-character textarea (`settings/settingsFields.js:58`).
- **Today's plan lines are Gemini's text**, so `buildContextCategories`'s false positives are the ones a visitor meets most ("Crunches", "Cable fly", "Warm-up").
- **Goal text is closed in the UI**: `goalOptions` (five entries) is the only goal input (`settingsFields.js:52`, a select; `createDefaultPlannerForm` seeds from the profile, whose `goal` the server restricts to `allowedGoalValues`, `apiSchemaService.js:73`), and none of the five hits a substring bug. But `generatePlanBodySchema.goal` (`apiSchemaService.js:206`) is any string up to 120 characters, stored on the plan, and `TipsView`, `MealView` and `PlansView` read `dashboard.plans[0].goal` first. So `detectTrack`'s bug is **latent for the UI and live for an API caller's plan**. I checked the code paths; I did not check any database for stored free-text goals.

**The correct behaviour.** A keyword matches as a **whole word**: at a word boundary on both sides, case-insensitively, with the spellings each rule accepts **listed** (a plural, and the few compounds a fitness note uses: `backache`, `kneecap`, `pushup`) rather than derived by a suffix rule. A hyphen and a slash are boundaries, so "push-ups", "wrist/elbow" and "lower-back" still match. For injuries, the longest name wins: once "lower back" matches, the words it matched are removed before the shorter names are tried, so "back" is not raised again by the same words. Under decision 2 (A), the `lower back` flag carries an explicit penalty of 14, so every score a visitor sees today is unchanged except where the double flag came from two _different_ mentions (below).

**Inputs whose answers change** (every row printed by the probe, today's from the unchanged modules, the new from the draft below):

| Function                                | Input                                                                   | Today                              | After                                 |
| --------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- | ------------------------------------- |
| `detectTrack`                           | "Execute a strength block"                                              | fat_loss (`cut` in "execute")      | lean_strength                         |
| `detectTrack`                           | "Acute knee rehab, then strength"                                       | fat_loss                           | lean_strength                         |
| `detectTrack`                           | "Uppercut power for boxing"                                             | fat_loss                           | lean_strength                         |
| `detectTrack`                           | "Shortcut to strength", "Executive fitness"                             | fat_loss                           | lean_strength                         |
| `detectTrack`                           | "Disjointed schedule, build muscle"                                     | recovery (`joint`)                 | lean_strength                         |
| `detectInjuryFlags`                     | "Lower back", "lower back pain"                                         | lower back + back                  | lower back (penalty 14)               |
| `detectInjuryFlags`                     | "Lower back; knee"                                                      | lower back + back + knee           | lower back + knee                     |
| `detectInjuryFlags`                     | "lower back and upper back"                                             | lower back + back (−14 a deadlift) | lower back + back (−21: two mentions) |
| `detectInjuryFlags`                     | "relationship stress", "championship prep", "worship team", "ship deck" | hip                                | none                                  |
| `detectInjuryFlags`                     | "chip on my shoulder"                                                   | shoulder + hip                     | shoulder                              |
| `detectInjuryFlags`                     | "feedback welcome", "comeback after a setback"                          | back                               | none                                  |
| `buildContextCategories` (today's line) | "Cable fly", "Scorecard"                                                | + Abs                              | nothing added                         |
| `buildContextCategories`                | "Crunches"                                                              | + Cardio, Legs (`run`)             | nothing added                         |
| `buildContextCategories`                | "Warm-up walk"                                                          | + Arms                             | nothing added                         |
| `buildContextCategories`                | "Elegant flow"                                                          | + Legs, Calves                     | nothing added                         |

**Unchanged** (also printed): all five `goalOptions` and the server's default "Build strength and energy"; "Cutting phase", "Cut", "Fat Loss" → fat_loss; "Cardiovascular health", "Athleticism" → endurance; "Joint health" → recovery; "Wrist/Elbow" → wrist + elbow; "Hip", "Knee", "sore knees", "my hips ache", "bad kneecap", "backache", "back pain", "back-ache", "lower-back tweak", "low back pain", "shoulders tight"; "Ab wheel", "Core circuit", "Leg day", "Arms", "Running drills", "Pull-ups", "Push-ups", "Glute bridges", "Bicep curls". "Pushups" (one word) keeps `push` only because `pushup`/`pushups` are listed; the probe's draft without them dropped it, which is why the forms are explicit.

**Files:**

- Create: `client/src/pages/dashboard/wordMatch.js` (the shared helper; a page-level helper beside `planUtils.js`, which CLAUDE.md's File Organization names as the place for one)
- Create: `client/src/pages/dashboard/__tests__/wordMatch.test.js`
- Modify: `client/src/pages/dashboard/planUtils.js:95-120`
- Modify: `client/src/pages/dashboard/tips/recommendationUtils.js` (`:15-34`, `:74-84`, `:117-129`, `:150-162`, `:273-281`, the `scoreExercise` doc comment `:193-200`)
- Test: `client/src/pages/dashboard/__tests__/planUtils.test.js`, `client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js`
- Modify: `client/README.md:225-228`

- [ ] **Step 1: Branch, the before-capture, and every caller**

```bash
git fetch origin && git switch -c fix/whole-word-keyword-matching origin/main
git grep -n "detectTrack\|detectInjuryFlags\|buildContextCategories\|keywordCategoryMap\|injuryKeywordRules" -- client/src
git grep -n "\.includes(" -- client/src/pages/dashboard/planUtils.js client/src/pages/dashboard/tips/recommendationUtils.js
npm run build > "$SCRATCH/b-c2-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/c2-before" > "$SCRATCH/c2-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c1-after" "$SHOTS/c2-before"; echo "chain exit=$?"
```

Expected: the callers listed above and their tests; the `.includes(` sites are the three matchers plus `scoreExercise`'s exercise-side matching (`:233-268`, `:273-275`), which matches **our** short keywords against wger's names and descriptions and the equipment map against wger's equipment names. Those stay substring matches, on purpose: "squat" must find "Back Squat" and "Squats", and wger's names are structured data, not a visitor's prose. Say so in the PR. `identical`.

- [ ] **Step 2: The failing tests**

`wordMatch.test.js` (new):

```js
import { describe, expect, test } from "vitest";
import { hasWord, wordPattern } from "../wordMatch";

describe("hasWord", () => {
  test.each([
    ["cut", ["cut"], true],
    ["a cut phase", ["cut"], true],
    ["execute", ["cut"], false],
    ["haircut", ["cut"], false],
    ["push-ups", ["push"], true],
    ["wrist/elbow", ["elbow"], true],
    ["lower back pain", ["lower back"], true],
    ["lower-back", ["lower back"], false],
    ["knees", ["knee"], false],
    ["knees", ["knee", "knees"], true]
  ])("%j against %j is %s", (text, forms, expected) => {
    expect(hasWord(text, forms)).toBe(expected);
  });
});

describe("wordPattern", () => {
  test("with the g flag, replaces every whole-word match and nothing inside a word", () => {
    expect("back pain, backpack, back".replace(wordPattern(["back"], "g"), "_")).toBe(
      "_ pain, backpack, _"
    );
  });
});
```

`planUtils.test.js`, after "detectTrack maps the goal %s to its intended track":

```js
// A keyword is a whole word. As a substring, "cut" was found in "execute"
// and "joint" in "disjointed", which put those goals on the wrong track.
test.each([
  ["Execute a strength block", "lean_strength"],
  ["Acute knee rehab, then strength", "lean_strength"],
  ["Uppercut power for boxing", "lean_strength"],
  ["Shortcut to strength", "lean_strength"],
  ["Disjointed schedule, build muscle", "lean_strength"],
  ["Cutting phase", "fat_loss"],
  ["Cardiovascular health", "endurance"],
  ["Athleticism", "endurance"],
  ["Joint health", "recovery"]
])("detectTrack reads %j as %s", (goal, track) => {
  expect(detectTrack(goal)).toBe(track);
});
```

`recommendationUtils.test.js`: **replace** "raises both the back and lower back rules for a lower back note" (`:290-299`) and its comment with:

```js
// One mention, one flag. "back" is inside "lower back", and the substring
// match used to raise both rules, so a lower-back note showed two near-
// identical warnings. The doubled penalty that came with it is kept as a
// stated number (decision 2 of docs/plans/2026-10-24-parked-items.md).
test.each([["Lower back"], ["lower back pain"], ["LOWER BACK"]])(
  "raises the lower back rule alone for %j",
  (note) => {
    const flags = detectInjuryFlags(note);

    expect(flags.map((f) => f.injury)).toEqual(["lower back"]);
    expect(flags[0].penalty).toBe(14);
  }
);

test("raises back as well when a second mention names it", () => {
  expect(detectInjuryFlags("lower back and upper back").map((f) => f.injury)).toEqual([
    "lower back",
    "back"
  ]);
});

test.each([
  ["relationship stress"],
  ["championship prep"],
  ["worship team"],
  ["feedback welcome"],
  ["comeback after a setback"]
])("finds no injury inside a longer word in %j", (note) => {
  expect(detectInjuryFlags(note)).toEqual([]);
});

test.each([
  ["sore knees", "knee"],
  ["bad kneecap", "knee"],
  ["my hips ache", "hip"],
  ["backache", "back"],
  ["shoulders tight", "shoulder"],
  ["chip on my shoulder", "shoulder"]
])("reads %j as %s", (note, injury) => {
  expect(detectInjuryFlags(note).map((f) => f.injury)).toEqual([injury]);
});

test("gives every other injury the standard penalty", () => {
  expect(detectInjuryFlags("Knee").map((f) => f.penalty)).toEqual([7]);
});
```

In `describe("buildContextCategories")`, add:

```js
// Today's plan lines are Gemini's prose, so a keyword inside a longer word
// ("ab" in "cable", "run" in "crunches") used to favour the wrong category.
// Each row names a track whose own categories lack the one the false match
// added, so the row can tell the two behaviours apart.
const withLine = (track, line) =>
  buildContextCategories({ track, goalText: "", todayLines: [line] });
const without = (track) => buildContextCategories({ track, goalText: "", todayLines: [] });

test.each([
  ["Cable fly", "lean_strength"],
  ["Crunches", "lean_strength"],
  ["Warm-up walk", "recovery"],
  ["Elegant flow", "lean_strength"],
  ["Scorecard", "lean_strength"]
])("adds nothing for %j", (line, track) => {
  expect(withLine(track, line)).toEqual(without(track));
});

test.each([
  ["Ab wheel", "lean_strength", "Abs"],
  ["Running drills", "lean_strength", "Cardio"],
  ["Pushups", "recovery", "Chest"],
  ["Push-ups", "recovery", "Chest"],
  ["Leg day", "lean_strength", "Calves"]
])("still reads %j", (line, track, category) => {
  expect(without(track)).not.toContain(category);
  expect(withLine(track, line)).toContain(category);
});
```

In `describe("scoreExercise")`'s injuries block, add (beside "penalises once per conflicting injury"):

```js
// The ranking a lower-back visitor saw is kept: one flag now, at the 14
// the two flags added up to, and one reason instead of two.
test("a lower-back conflict costs 14 and gives one reason", () => {
  const deadlift = exercise({ name: "Romanian Deadlift" });
  const { score, reasons } = scoreExercise(
    deadlift,
    context({ injuryFlags: detectInjuryFlags("Lower back") })
  );

  expect(score).toBe(-14);
  expect(reasons.filter((r) => r.startsWith("Potentially high stress"))).toEqual([
    "Potentially high stress for lower back."
  ]);
});
```

The existing hand-built `kneeFlag` and `hipFlag` carry no `penalty`, and their tests expect −7 and −14: they pin the default for a flag with none.

```bash
npm run test -w client -- src/pages/dashboard/__tests__/wordMatch.test.js src/pages/dashboard/__tests__/planUtils.test.js src/pages/dashboard/tips/__tests__/recommendationUtils.test.js src/pages/dashboard/views/__tests__/TipsView.test.jsx src/pages/dashboard/views/__tests__/MealView.test.jsx > "$SCRATCH/c2-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |FAIL|Failed to resolve" "$SCRATCH/c2-red.txt" | head -20
```

Expected: exit `1`. `wordMatch.test.js` fails to import (no module); the detectTrack rows that change fail (`expected 'fat_loss' to be 'lean_strength'`), the unchanged ones pass; the lower-back and longer-word injury rows fail; "adds nothing for …" fails for each line; "a lower-back conflict costs 14 and gives one reason" fails on the two reasons (its score, −14, already holds). The "reads … as" rows pass already except "chip on my shoulder" (today shoulder + hip), "gives every other injury the standard penalty" fails (no `penalty` field yet), and the "still reads" rows pass already and pin what must not change.

- [ ] **Step 3: The fix**

`client/src/pages/dashboard/wordMatch.js` (new):

```js
/**
 * Whole-word matching for the dashboard's keyword rules: the goal's track, the
 * injury flags and the categories today's plan favours. Used by planUtils.js and
 * tips/recommendationUtils.js.
 */

/**
 * A pattern matching any of `forms` as a whole word, never inside a longer one,
 * so "cut" is not found in "execute". `forms` are lower-case words or phrases
 * of letters and spaces; each spelling to accept, a plural included, is listed.
 * Pass "g" as `flags` to replace every match.
 */
export const wordPattern = (forms, flags = "") =>
  new RegExp(String.raw`\b(?:${forms.join("|")})\b`, flags);

/** True when lower-cased `text` holds any of `forms` as a whole word. */
export const hasWord = (text, forms) => wordPattern(forms).test(text);
```

`planUtils.js`: add `import { hasWord } from "./wordMatch";` under the header, and replace `:95-120` with:

```js
// The words that put a goal on each track, tried in this order. Each is matched
// as a whole word, with the forms a goal might use listed.
const TRACK_WORDS = [
  ["fat_loss", ["fat loss", "cut", "cuts", "cutting", "conditioning"]],
  [
    "endurance",
    ["endurance", "athletic", "athleticism", "performance", "cardio", "cardiovascular"]
  ],
  ["recovery", ["mobility", "recovery", "joint", "joints"]]
];

/**
 * Maps goal text to a track by keyword, tried in order: fat_loss, endurance,
 * recovery, and lean_strength when none match. A keyword matches as a whole
 * word (TRACK_WORDS), so "cut" is not found in "execute". Of goalOptions, only
 * "Build lean strength and energy" has no keyword, and lean_strength is the
 * track it is meant for. The four names also key the meal templates here, the
 * meal suggestions in meal/data and the tips' categories.
 */
export const detectTrack = (goalText = "") => {
  const lower = goalText.toLowerCase();
  const match = TRACK_WORDS.find(([, words]) => hasWord(lower, words));
  return match ? match[0] : "lean_strength";
};
```

`recommendationUtils.js`: add `import { hasWord, wordPattern } from "../wordMatch";` under the header. `keywordCategoryMap` (`:16-34`) becomes `words` lists, each rule's comment unchanged ("Words in the goal or today's plan lines that favour more categories." gains ", matched whole"):

```js
const keywordCategoryMap = [
  { words: ["push", "pushup", "pushups"], categories: ["Chest", "Shoulders", "Arms"] },
  { words: ["pull", "pullup", "pullups"], categories: ["Back", "Arms", "Shoulders"] },
  { words: ["chest"], categories: ["Chest", "Shoulders"] },
  { words: ["back"], categories: ["Back"] },
  { words: ["shoulder", "shoulders"], categories: ["Shoulders"] },
  { words: ["arm", "arms"], categories: ["Arms"] },
  { words: ["bicep", "biceps"], categories: ["Arms"] },
  { words: ["tricep", "triceps"], categories: ["Arms"] },
  { words: ["leg", "legs"], categories: ["Legs", "Calves"] },
  { words: ["quad", "quads"], categories: ["Legs"] },
  { words: ["hamstring", "hamstrings"], categories: ["Legs"] },
  { words: ["glute", "glutes"], categories: ["Legs"] },
  { words: ["core"], categories: ["Abs"] },
  { words: ["ab", "abs"], categories: ["Abs"] },
  { words: ["cardio"], categories: ["Cardio"] },
  { words: ["conditioning"], categories: ["Cardio"] },
  { words: ["run", "runs", "running"], categories: ["Cardio", "Legs"] }
];
```

After `injuryKeywordRules` (`:74-84`), whose order now matters and whose comment says so ("… `lower back` first: detectInjuryFlags tries the names in this order"):

```js
// The words naming each injury, matched whole. Each set is removed from the
// note once matched, so "lower back" is one flag and its "back" is not a second.
const injuryNameForms = {
  "lower back": ["lower back"],
  back: ["back", "backs", "backache"],
  knee: ["knee", "knees", "kneecap", "kneecaps"],
  shoulder: ["shoulder", "shoulders"],
  hip: ["hip", "hips"],
  wrist: ["wrist", "wrists"],
  elbow: ["elbow", "elbows"]
};

// What a conflict costs: more than any single match earns. A lower-back
// conflict costs double, what its two overlapping rules added up to before
// they were one (client/README.md, "Exercise Recommendations").
const INJURY_PENALTY = 7;
const injuryPenalty = { "lower back": 14 };
```

`buildContextCategories`'s loop line becomes `if (hasWord(sourceText, rule.words)) categories.push(...rule.categories);`, and its doc comment's "A keyword matches anywhere, inside a longer word included." becomes "A keyword matches as a whole word.". `detectInjuryFlags` and its doc comment:

```js
/**
 * Each injury named in the text, with its risky keywords and what a conflict
 * costs. Names match as whole words, longest first, and the words one name
 * matched are not read again, so "lower back" is one flag, not two.
 */
export const detectInjuryFlags = (injuryText) => {
  let source = normalizeText(injuryText);
  const active = [];
  for (const [injury, keywords] of Object.entries(injuryKeywordRules)) {
    const forms = injuryNameForms[injury];
    if (!hasWord(source, forms)) continue;
    active.push({ injury, keywords, penalty: injuryPenalty[injury] ?? INJURY_PENALTY });
    source = source.replace(wordPattern(forms, "g"), " ");
  }
  return active;
};
```

In `scoreExercise` (`:278`), `score -= 7;` becomes `score -= flag.penalty ?? INJURY_PENALTY;`, and its doc comment's "each injury conflict costs more than any single match earns" gains "(7, or the flag's own penalty)".

```bash
npx prettier --write client/src/pages/dashboard/wordMatch.js client/src/pages/dashboard/planUtils.js client/src/pages/dashboard/tips/recommendationUtils.js client/src/pages/dashboard/__tests__/wordMatch.test.js client/src/pages/dashboard/__tests__/planUtils.test.js client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js
npm run test -w client -- src/pages/dashboard/__tests__/wordMatch.test.js src/pages/dashboard/__tests__/planUtils.test.js src/pages/dashboard/tips/__tests__/recommendationUtils.test.js src/pages/dashboard/views/__tests__/TipsView.test.jsx src/pages/dashboard/views/__tests__/MealView.test.jsx > "$SCRATCH/c2-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/c2-green.txt"
git add client/src
git commit -m "fix(client): keywords match whole words, and a lower-back note is one flag" -m "detectTrack, detectInjuryFlags and buildContextCategories found their keywords inside longer words (cut in execute, hip in relationship, run in crunches), and a lower-back note raised both the lower back and back rules, so its conflicts showed two warnings. A shared whole-word helper fixes all three; the lower-back rule keeps the 14-point penalty its two rules added up to, as a stated number." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`. Also `npm run knip` must stay clean: `wordMatch.js` exports two names, both imported.

- [ ] **Step 4: Mutation checks**

| Mutation                                                           | Caught by                                                                                      |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `wordMatch.js`: both `\b` removed from the pattern                 | `hasWord` "execute"/"haircut" rows, "finds no injury inside a longer word", "adds nothing for" |
| `detectInjuryFlags`: the `source = source.replace(…)` line deleted | "raises the lower back rule alone" (reads lower back + back)                                   |
| `injuryPenalty` `14` → `7`                                         | the `penalty` assertion and "costs 14 and gives one reason"                                    |
| `?? INJURY_PENALTY` in `scoreExercise` → `?? 0`                    | "penalises an exercise that conflicts with an injury" (hand-built flag reads 0)                |
| `"backache"` removed from `injuryNameForms.back`                   | "reads \"backache\" as back"                                                                   |
| `"pushups"` removed from `keywordCategoryMap`                      | "still reads \"Pushups\""                                                                      |
| `TRACK_WORDS`' first two entries swapped                           | **survives** at first: see below                                                               |

The last row is a **deliberate survivor**, run expecting it to survive: no goal in the tests names words from both the fat_loss and endurance lists, so their order is unobservable. Add one row to the `detectTrack reads` table, `["Cardio-focused cut", "fat_loss"]` (the probe printed fat_loss for "cardio-focused cut"), and re-run: the swap is then caught. Each mutation alone; `git checkout -- client/src` after each.

- [ ] **Step 5: Coverage**

Predicted: one new module with two covered functions and two statements; `detectTrack` loses its three `||` chains (all arms covered today, so covered and total fall together) and gains one `find` callback and one ternary; `detectInjuryFlags` gains a `??` (both arms covered: lower back, and every other injury); `scoreExercise`'s `??` has both arms covered (built flags carry a penalty, hand-built ones do not). Branches may move a little either way, because removing covered arms lowers the percentage: measure, and confirm every client slack stays 0 or more. If branch slack goes negative, it is the deleted `||` arms, and the fix is not a floor change: say so and stop.

- [ ] **Step 6: The after-capture and the compare** (into `$SHOTS/c2-after`). Expected `identical`: the capture states hold `/api/wger/` open (no exercise is scored), stub the profile with no notes, and use a goal from `goalOptions`, none of whose answers change.

- [ ] **Step 7: `client/README.md`**

Lines 225-228:

> - `detectInjuryFlags` matches injury names as substrings, and `back` is inside `lower back`, so a lower-back note raises **both** rules. They carry the same keywords, so a conflicting exercise is penalised twice. The ordering depends on that.

become:

> - Injury names, goal keywords and plan-line keywords match as **whole words** (`pages/dashboard/wordMatch.js`), with the plurals and compounds each rule accepts listed, so "hip" is not found in "relationship" nor "run" in "crunches". `lower back` is tried before `back`, and its words are not read again, so a lower-back note is one flag. That flag costs **14**, not 7: when the two rules overlapped, its conflicts were penalised twice, and the rankings a lower-back visitor saw are kept by stating the number instead.
>
>   The exercise side is still a substring match on purpose: "squat" must find "Back Squat" and "Squats" in wger's names.

and the first paragraph of the section ("subtracting `7` for each reported injury") becomes "subtracting `7` (`14` for a lower back) for each reported injury".

- [ ] **Step 8: Gates and PR**

Gates (Conventions). `git push -u origin fix/whole-word-keyword-matching`; `gh pr create --draft --base main --title "fix(client): keywords match whole words, and a lower-back note is one flag" --body-file "$SCRATCH/pr-c2.md"`. Outline: decisions 2 and 3; what was actually wrong (two flags, two reasons) and what is right (lower back is a back issue, once); where each matcher is reachable (detectTrack latent for the UI); the changed-inputs and unchanged tables; why the exercise side stays a substring match; the red run; mutations, with the deliberate survivor and the row that closes it; coverage before and after; the compare; the README change; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Server track

Two PRs, merged in order S1 → S2. Measure `main`'s server coverage once before S1 (Status): #283 merged after the last floor note.

### Task S1: The server allows its own origin

**Branch:** `fix/cors-allows-own-origin` (server track, first). Written to decision 6's recommendation (B).

**The policy today** (`server/src/corsPolicy.js`, `62f8d80`, lines 27-54):

```js
export const createCorsPolicy = (allowedOrigins = []) => {
  const allowedCorsOrigins = new Set(allowedOrigins);

  const isAllowedCorsOrigin = (origin) => {
    if (allowedCorsOrigins.has(origin)) return true;
    return allowedCorsOrigins.size === 0 && isLoopbackOrigin(origin);
  };

  const corsOptions = {
    origin(origin, callback) {
      // No Origin header: a non-browser caller, or a same-origin navigation or
      // plain GET. A browser does send one on same-origin writes, and Chromium on
      // the bundle's crossorigin script and stylesheet loads, so a deployment that
      // serves its own page must list its own origin.
      if (!origin) return callback(null, true);
      if (isAllowedCorsOrigin(origin)) return callback(null, true);
      // Tag as 4xx so a blocked origin is a client error, not a captured 5xx.
      const corsError = new Error("Origin not allowed by CORS.");
      corsError.status = 403;
      return callback(corsError);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-CSRF-Token"]
  };

  return { corsOptions, isAllowedCorsOrigin, isEmpty: allowedCorsOrigins.size === 0 };
};
```

`index.js:122-124` builds it from `CLIENT_ORIGIN || CLIENT_ORIGINS`, `:155-160` warns when the list is empty, and `:244` mounts `app.use(cors(corsOptions))` **app-wide, before** `registerClientStatic` (`:771`), so the bundle's own files go through it. `envValidationService.js:79-81` refuses to start in production without `CLIENT_ORIGIN`.

**What fails today, traced.** Nothing, when configured as the docs say. The failure is the configuration itself:

- **A deployment whose `CLIENT_ORIGIN` does not list its own URL serves a blank page in Chromium**: the `<script type="module" crossorigin>` and stylesheet loads carry `Origin`, the policy answers 403, and every write 403s too. `render.yaml:59-64`, `docs/deploy-runbook.md:155-166` and `README.md:393-398` each spend a paragraph warning about it, and the runbook calls it "the awkward one" because Render assigns the URL only after the service is created.
- **The same is true locally**: `npm run start` with `env.example`'s `CLIENT_ORIGIN=http://localhost:5173`, browsed at `http://localhost:5000`, 403s the bundle (the list is non-empty, so the loopback fallback is off). The E2E config works around it by listing both origins (`playwright.config.js:95-101`), and CI's container job by setting `CLIENT_ORIGIN=http://localhost:5000` (`ci.yml:198`).
- **Why the spec parked "automatically" rather than doing it:** it needs the request's own origin, which a plain `origin` callback cannot see (it gets the header only), and it is a security-relevant change to a credentialed CORS policy. Both are answered below.

**Why it is safe to allow the own origin, and to drop the production requirement.** `README.md:312-322`: "The client and the API must be served from one origin. This is a constraint, not a preference": every client request path is relative, and both cookies are `SameSite=Lax`. So in production the only origin that can work is the server's own, and the allowlist exists for development (Vite on 5173 proxies with the browser's `Origin` unchanged) and `vite preview` (4173).

**The design.** `cors` accepts an options **delegate** `(req, callback)`, called per request (cors 2.8.6, the installed version), so the origin check can compare the `Origin` header with the request's own origin, `${req.protocol}://${req.get("host")}`. `req.protocol` honours `X-Forwarded-Proto` because `index.js:172` sets `trust proxy` to 1 (Render terminates TLS). In production the loopback fallback is off, so an unset list means "own origin only"; outside production it is as today.

**The security trade-off, named.** The check trusts the `Host` header and, behind one proxy, `X-Forwarded-Proto`:

- **A browser cannot set `Host`.** A page on `https://evil.example` that calls the API sends `Origin: https://evil.example` and `Host: <our host>`; they differ, so it is refused as today. No cross-site page can make the two agree.
- **A non-browser caller can make them agree** (any `Origin`, any `Host`). It gains nothing: CORS only ever restrains browsers, and such a caller can already send no `Origin` at all, which is allowed today (`if (!origin)`). A test pins this as accepted rather than leaving it to be rediscovered.
- **DNS rebinding** (an attacker's name pointed at our IP) makes `Origin` and `Host` both the attacker's name and so "same-origin". The browser then holds no cookies for that name (ours are scoped to our host), so the request is anonymous, and the page is same-origin to itself whatever CORS says: no new access.
- **A proxy or CDN that rewrites `Host`** would make the check miss the real origin; such a deployment keeps `CLIENT_ORIGIN`, which still works exactly as today. Render forwards the original `Host`; **not verified here**, so the PR's post-merge check does it (Step 7).

**Files:**

- Modify: `server/src/corsPolicy.js` (the header comment, `createCorsPolicy`)
- Modify: `server/src/index.js:122-124`, `:155-160`, `:244`
- Modify: `server/src/services/platform/envValidationService.js:79-81` (delete the production rule)
- Test: `server/src/__tests__/index.cors.test.js`, `server/src/services/platform/__tests__/envValidationService.test.js:21-34`, new `server/src/__tests__/corsPolicy.test.js` (the production fallback, which the app-level suite cannot reach because it imports `index.js` with `NODE_ENV=test`)
- Modify: `playwright.config.js:95-101` (the E2E proof)
- Modify: `env.example:15-18`, `README.md:172`, `:393-398`, `:428`, `render.yaml:59-64`, `docs/deploy-runbook.md:121`, `:155-166`, `:324`

- [ ] **Step 1: Branch, and confirm the two workarounds and the one consumer**

```bash
git fetch origin && git switch -c fix/cors-allows-own-origin origin/main
git grep -n "createCorsPolicy\|corsOptions\|isAllowedCorsOrigin" -- server scripts
git grep -n "CLIENT_ORIGIN" -- .github playwright.config.js render.yaml docs/deploy-runbook.md README.md env.example server/src
```

Expected: `index.js` is the only consumer of `createCorsPolicy`; the two workarounds above; the docs lines listed in Files.

- [ ] **Step 2: The failing tests**

`index.cors.test.js`, a new `describe` after "CORS with an allowlist configured". `startApp` returns `http://127.0.0.1:<port>`, which is exactly what `fetch` sends as `Host`, so `baseUrl` **is** the server's own origin. The list is always set to another origin here, because with an empty list `127.0.0.1` is already allowed as loopback and the test could not tell the two rules apart:

```js
import http from "node:http";

// Sends a request with headers fetch will not let a test choose (Host).
const rawGet = (baseUrl, headers) =>
  new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}/api/health`, { headers }, (res) => {
      res.resume();
      resolve(res);
    });
    req.on("error", reject);
  });

describe("CORS and the server's own origin", () => {
  // The SPA is served from this origin, and a browser still sends Origin on its
  // writes and on the bundle's crossorigin loads, so its own origin must pass
  // whatever the list says.
  test("its own origin is allowed when the list names only others", async () => {
    const baseUrl = await startApp("https://app.example.com");

    const res = await get(baseUrl, baseUrl);

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(baseUrl);
  });

  test.each([
    ["another port on the same host", (base) => base.replace(/:\d+$/, ":1")],
    ["the same host over https", (base) => base.replace("http://", "https://")],
    ["the same port on another host", (base) => base.replace("127.0.0.1", "127.0.0.2")]
  ])("%s is not its own origin", async (_label, toOrigin) => {
    const baseUrl = await startApp("https://app.example.com");

    expect((await get(baseUrl, toOrigin(baseUrl))).status).toBe(403);
  });

  // trust proxy is 1: behind Render's TLS proxy the request arrives over http
  // with X-Forwarded-Proto: https, and its own origin is the https one.
  test("reads the scheme from X-Forwarded-Proto, as the proxy sets it", async () => {
    const baseUrl = await startApp("https://app.example.com");
    const httpsOrigin = baseUrl.replace("http://", "https://");

    const res = await rawGet(baseUrl, { Origin: httpsOrigin, "X-Forwarded-Proto": "https" });

    expect(res.statusCode).toBe(200);
  });

  // Accepted, and pinned so it stays a decision: a non-browser caller can send
  // a Host to match any Origin. It gains nothing, because CORS only restrains
  // browsers and such a caller can already send no Origin at all. A browser
  // cannot set Host, so no page on another site can do this.
  test("a caller that forges Host to match its Origin is let through", async () => {
    const baseUrl = await startApp("https://app.example.com");

    const res = await rawGet(baseUrl, { Origin: "http://evil.example", Host: "evil.example" });

    expect(res.statusCode).toBe(200);
  });

  test("a browser on another site, whose Host is ours, is still refused", async () => {
    const baseUrl = await startApp("https://app.example.com");

    expect((await get(baseUrl, "https://evil.example")).status).toBe(403);
  });
});
```

`corsPolicy.test.js` (new; header first, per the ratchet), driving the delegate directly with a minimal request:

```js
/** Unit tests for corsPolicy.js's production fallback, which index.cors.test.js cannot reach. */
import { describe, expect, test } from "vitest";
import { createCorsPolicy } from "../corsPolicy.js";

// What the cors middleware hands the delegate, reduced to what it reads.
const request = (origin, host = "api.example.com", protocol = "https") => ({
  headers: { origin },
  protocol,
  get: (name) => (name.toLowerCase() === "host" ? host : undefined)
});

// Runs the delegate and then the origin check it returns, as cors does.
const decide = (policy, req) =>
  new Promise((resolve) => {
    policy.corsOptionsDelegate(req, (err, options) => {
      if (err) return resolve({ err });
      options.origin(req.headers.origin, (originErr, allowed) =>
        resolve({ err: originErr, allowed })
      );
    });
  });

describe("createCorsPolicy in production (allowLoopback false)", () => {
  const policy = createCorsPolicy([], { allowLoopback: false });

  test("allows its own origin with no list at all", async () => {
    expect(await decide(policy, request("https://api.example.com"))).toEqual({
      err: null,
      allowed: true
    });
  });

  test("does not fall back to loopback", async () => {
    const { err } = await decide(policy, request("http://localhost:5173"));

    expect(err?.status).toBe(403);
  });
});

describe("createCorsPolicy outside production", () => {
  test("keeps the loopback fallback for an unset list", async () => {
    const policy = createCorsPolicy([]);

    expect(await decide(policy, request("http://localhost:5173"))).toEqual({
      err: null,
      allowed: true
    });
  });
});
```

`envValidationService.test.js`: replace "requires CLIENT_ORIGIN in production" (`:25-29`) with:

```js
// The server allows its own origin, which is the only one a single-origin
// deployment uses, so production no longer needs the list.
test("does not require CLIENT_ORIGIN in production", () => {
  expect(validateEnv({ ...validEnv, NODE_ENV: "production" })).toEqual([]);
});
```

Run:

```bash
npm run test -w server -- src/__tests__/index.cors.test.js src/__tests__/corsPolicy.test.js src/services/platform/__tests__/envValidationService.test.js > "$SCRATCH/s1-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |expected|is not a function" "$SCRATCH/s1-red.txt" | head -20
```

Expected: exit `1`: "its own origin is allowed" (403, not 200), "reads the scheme from X-Forwarded-Proto" and "a caller that forges Host" (403), every `corsPolicy.test.js` test (`policy.corsOptionsDelegate is not a function`), and "does not require CLIENT_ORIGIN in production" (one error). The three "is not its own origin" rows and "a browser on another site" pass already: they pin what must stay refused.

- [ ] **Step 3: The fix**

`corsPolicy.js`, after `isLoopbackOrigin`:

```js
// The origin this request was addressed to: its scheme (X-Forwarded-Proto behind
// the one proxy index.js trusts) and its Host header. A browser cannot set Host,
// so a page on another site cannot make its Origin equal this.
const requestOrigin = (req) => `${req.protocol}://${req.get("host")}`;
```

and `createCorsPolicy` with its doc comment:

```js
/**
 * Builds the policy from an explicit list of allowed origins.
 *
 * With credentials enabled, reflecting an arbitrary Origin would let any site
 * issue authenticated cross-origin calls, so an unset allowlist must fail
 * closed. The server's own origin always passes: the page it serves is
 * same-origin, yet a browser sends Origin on its writes, and Chromium on the
 * bundle's crossorigin script and stylesheet loads. For an unset list,
 * `allowLoopback` (index.js passes false in production) also lets loopback
 * origins through, which keeps `npm run dev` working with no configuration.
 *
 * Returns `corsOptionsDelegate`, which cors calls per request so the check can
 * see the request's own origin, and `isEmpty`, so the caller can warn about an
 * unset list without reaching back into the Set.
 */
export const createCorsPolicy = (allowedOrigins = [], { allowLoopback = true } = {}) => {
  const allowedCorsOrigins = new Set(allowedOrigins);

  const isAllowedCorsOrigin = (origin, ownOrigin) => {
    if (origin === ownOrigin) return true;
    if (allowedCorsOrigins.has(origin)) return true;
    return allowLoopback && allowedCorsOrigins.size === 0 && isLoopbackOrigin(origin);
  };

  const corsOptionsDelegate = (req, callback) => {
    callback(null, {
      origin(origin, done) {
        // No Origin header: a non-browser caller, or a same-origin navigation or
        // plain GET.
        if (!origin) return done(null, true);
        if (isAllowedCorsOrigin(origin, requestOrigin(req))) return done(null, true);
        // Tag as 4xx so a blocked origin is a client error, not a captured 5xx.
        const corsError = new Error("Origin not allowed by CORS.");
        corsError.status = 403;
        return done(corsError);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token"]
    });
  };

  return { corsOptionsDelegate, isAllowedCorsOrigin, isEmpty: allowedCorsOrigins.size === 0 };
};
```

`isAllowedCorsOrigin` stays exported in the return because nothing else needs changing to keep it; knip reports unused **exports**, not unused properties, so check `npm run knip` and drop it from the return if nothing reads it (nothing does on `62f8d80`: Step 1's grep). `requestOrigin` has no branch on purpose: a request with no `Host` (only a non-browser HTTP/1.0 caller sends one) yields `http://undefined`, which no browser's `Origin` can equal, so it falls through to the list as before; a `host ? … : ""` would be an arm the suite cannot reach.

The header comment's "the control that decides which sites may make credentialed cross-origin calls to the API" stays; add "The server's own origin always passes." as its second sentence.

`index.js:122-124`:

```js
const { corsOptionsDelegate, isEmpty: corsAllowlistIsEmpty } = createCorsPolicy(
  parseCsvEnv(process.env.CLIENT_ORIGIN || process.env.CLIENT_ORIGINS),
  { allowLoopback: process.env.NODE_ENV !== "production" }
);
```

`:155-160` (the message only, so no new branch at module scope, where the production arm would be unreachable from the suite):

```js
if (corsAllowlistIsEmpty) {
  logger.info(
    { event: "cors_allowlist_missing" },
    "CLIENT_ORIGIN is not set. Allowing this server's own origin, and loopback origins outside production."
  );
}
```

(`info`, not `warn`: in production an unset list is now a supported configuration, and a warning on every boot of a correct deploy would be noise. Nothing asserts the level: Step 1's grep for `cors_allowlist_missing` finds only this line.) `:244`: `app.use(cors(corsOptionsDelegate));`.

`envValidationService.js:79-81`: delete the production `CLIENT_ORIGIN` block, and update the function's doc comment if it lists what is required (read it).

`playwright.config.js:95-101`: the comment's "Both origins. … The deployable project talks to the server directly, from the server's own origin." becomes "The preview origin. The chromium project reaches the API through the preview proxy, which passes the browser's Origin header through unchanged, so express sees the preview origin on its POSTs and DELETEs. The deployable project talks to the server from the server's own origin, which corsPolicy.js allows without being listed: leaving it out here is what proves that.", and the value becomes `CLIENT_ORIGIN: baseURL,`.

```bash
npx prettier --write server/src/corsPolicy.js server/src/index.js server/src/services/platform/envValidationService.js server/src/__tests__/index.cors.test.js server/src/__tests__/corsPolicy.test.js server/src/services/platform/__tests__/envValidationService.test.js playwright.config.js
npm run test -w server -- src/__tests__/index.cors.test.js src/__tests__/corsPolicy.test.js src/services/platform/__tests__/envValidationService.test.js src/__tests__/index.test.js > "$SCRATCH/s1-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s1-green.txt"
git add server/src playwright.config.js
git commit -m "fix(server): allow the server's own origin without listing it" -m "The bundle the server serves is same-origin, yet a browser sends Origin on its writes and Chromium on its crossorigin loads, so a deployment whose CLIENT_ORIGIN did not list its own URL served a blank page. The CORS check now compares Origin with the request's own scheme and Host, and CLIENT_ORIGIN is no longer required in production, where an unset list allows the own origin only." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

Expected: `exit=0`.

- [ ] **Step 4: Mutation checks**

| Mutation                                                                                                          | Caught by                                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `if (origin === ownOrigin) return true;` deleted                                                                  | "its own origin is allowed when the list names only others", "allows its own origin with no list at all" |
| `requestOrigin`: `req.protocol` → `"http"`                                                                        | "reads the scheme from X-Forwarded-Proto"                                                                |
| `requestOrigin`: `req.get("host")` → `req.hostname` (drops the port)                                              | "its own origin is allowed…" (no port, no match)                                                         |
| `allowLoopback &&` deleted                                                                                        | "does not fall back to loopback"                                                                         |
| index.js: `!== "production"` → `=== "production"`                                                                 | the existing "CORS with no allowlist configured" loopback rows (the app suite runs with `NODE_ENV=test`) |
| `return allowLoopback && allowedCorsOrigins.size === 0 && …` → `return allowLoopback && isLoopbackOrigin(origin)` | "loopback stops being special once origins are named" (existing)                                         |

- [ ] **Step 5: Coverage**

Predicted: `corsPolicy.js` gains one function (`corsOptionsDelegate`) and one (`requestOrigin`), both covered, one `&&` arm (`allowLoopback`), covered both ways by the unit tests; `envValidationService.js` loses the production rule's `&&` chain (covered arms, so a small branch-percentage dip). Measure (with `client/dist` present), record before and after; every server slack 0 or more.

- [ ] **Step 6: Docs**

- `env.example:15-18`: the comment above `CLIENT_ORIGIN` says it lists the origins allowed to make credentialed calls besides the server's own, which always passes; development sets it to the Vite origin; production may leave it unset.
- `README.md:172` (the env table row): "Allowed CORS origins, comma-separated, besides the server's own, which is always allowed | loopback origins outside production when unset". `:428` (the production checklist row "Required when `NODE_ENV=production`"): delete the row, or reword to "Optional: the server's own origin is always allowed; list others only if a proxy rewrites `Host`". `:393-398` (deploy step 3): replace the `CLIENT_ORIGIN` sentences with "`CLIENT_ORIGIN` can stay unset: the server allows its own origin. Set it only if something in front of the service rewrites the `Host` header."
- `render.yaml:59-64`: the comment becomes "Optional. The server allows its own origin, which is the only one this single-origin deployment uses, so leave it blank unless a proxy in front rewrites Host." Keep the `- key: CLIENT_ORIGIN` / `sync: false` entry, so an existing service's value is not dropped by a Blueprint sync.
- `docs/deploy-runbook.md:121` ("See below — you may not know it yet") becomes "Leave blank (see below)"; `:155-166`, "`CLIENT_ORIGIN` is the awkward one.", becomes a short paragraph: it is optional, the server allows its own origin, and when to set it; `:324`, "The production preflight requires `DATABASE_URL` and `CLIENT_ORIGIN`", drops `and CLIENT_ORIGIN`.
- `CLAUDE.md`: nothing (`:1034` lists `CLIENT_ORIGIN` among `server/.env`'s keys, still true for development; `:638` is about dotenv in tests).

- [ ] **Step 7: Gates and PR**

Gates (Conventions), with E2E: **stop any server already on 5000 first** (`netstat -ano | grep ":5000 "`), because `reuseExistingServer` would otherwise run the suite against a server started with the old `CLIENT_ORIGIN`, and the deployable project's pass would prove nothing. Expected: both Playwright projects pass, the `deployable` one now with its own origin unlisted. `git push -u origin fix/cors-allows-own-origin`; `gh pr create --draft --base main --title "fix(server): allow the server's own origin without listing it" --body-file "$SCRATCH/pr-s1.md"`.

`pr-s1.md` outline: decision 6; what fails today (the misconfiguration, locally and deployed) and why the spec parked it; the single-origin constraint that makes it safe; the design (the delegate, `trust proxy`); the security trade-off list; the red run; mutations; coverage before and after; the E2E proof; the docs; **a post-merge check for the owner**: after the next deploy, clear `CLIENT_ORIGIN` on the Render service, redeploy, and load the site in Chrome (this exercises the own-origin path behind Render's proxy, which no test here can, and confirms Render forwards `Host` and `X-Forwarded-Proto`); if it fails, set `CLIENT_ORIGIN` back and the site works as before; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task S2: The US AQI is the EPA NowCast of the station's last twelve hours

**Branch:** `feat/aqi-nowcast` (server track, after S1). Written to decision 4 (A) and decision 5 (A). **If the owner picks another option for decision 4, this task is re-planned; the options are compared at the end of this section.**

**What the route scores today** (`server/src/routes/external/registerAirQualityRoutes.js`, `62f8d80`). It asks OpenAQ v3 for the nearest station (`openAqRequest("locations", { coordinates, radius, limit: 1 })`, `:38-42`), then that station's **latest** value per sensor (the `locations/<id>/latest` endpoint, `:60`), joins each to its sensor to learn the pollutant (`:63-78`), and scores PM2.5 alone (`:81-87`):

```js
// Score from PM2.5 alone. A station with no PM2.5 reading scores null and
// the "Unknown" band, never AQI 0.
const pm25Reading =
  pollutants.find((item) => ["pm25", "pm2.5", "pm2_5", "pm2p5"].includes(item.code)) || null;
const pm25 = pm25Reading?.value ?? null;
const aqiUs = pm25ToUsAqi(pm25);
const recommendation = aqiBand(aqiUs);
```

`pm25ToUsAqi` (`externalDataService.js:406-429`) applies the EPA's 2024 breakpoints with the EPA's one-decimal truncation; `aqiBand` (`:431-…`) maps the index to a level and indoor/outdoor advice. So the reading is the **single most recent value** the station reported for its PM2.5 sensor. OpenAQ's `latest` carries no averaging period, so what that value averages over depends on the station's provider (many reference monitors report hourly means; low-cost sensors report minutes). The EPA's breakpoints are defined for a 24-hour average and the EPA's real-time index is the **NowCast** of hourly means, so today's number is an instant reading on a scale built for averages. The summary card says so: "US AQI {n} from the latest reading" (`client/src/pages/dashboard/views/SummaryView.jsx:368`), the label Phase 2 added (spec, item 2.1).

**The options, with what each needs** (decision 4):

|                                    | (A) NowCast from OpenAQ                                                                                                                                                                                      | (B) AirNow's AQI                                                                                                                                | (C) Open-Meteo `us_aqi`                                                                                                | (D) Keep           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Upstream calls per uncached lookup | 3 (locations, latest, **hours**)                                                                                                                                                                             | 2 to 3 (AirNow, plus OpenAQ outside the US)                                                                                                     | 1 (and drop OpenAQ, or keep it for the pollutant list)                                                                 | 2                  |
| Key                                | the existing `OPENAQ_API_KEY`                                                                                                                                                                                | a new `AIRNOW_API_KEY` (free registration)                                                                                                      | none for non-commercial use                                                                                            | existing           |
| Coverage                           | wherever OpenAQ has a PM2.5 sensor with hourly data                                                                                                                                                          | AirNow reporting areas (US, plus some border stations); everyone else keeps OpenAQ's instant reading, so two code paths                         | global grid                                                                                                            | as today           |
| What the number is                 | a station measurement, EPA NowCast                                                                                                                                                                           | AirNow's published current AQI (its PM AQI is NowCast-based)                                                                                    | a **model** (CAMS, 11 km in Europe, 45 km elsewhere), PM as a **24-hour rolling mean**                                 | an instant reading |
| Caching                            | the hours call keyed by sensor and the hour, so nearby visitors share it                                                                                                                                     | a new cache entry and TTL                                                                                                                       | a new base URL and cache                                                                                               | as today           |
| Absent is not zero                 | an hour with `value: null` or `""` is a missing hour, never a zero hour; a measured 0 is kept                                                                                                                | every numeric field through `toFiniteNumber`                                                                                                    | the same                                                                                                               | as today           |
| Checked here                       | the `/v3/sensors/{id}/hours` path, its `datetime_from`, `datetime_to`, `limit`, `page` parameters and its `value`, `period.datetimeFrom/To.utc`, `coverage` fields (OpenAQ's API reference, read 2026-10-24) | the endpoint exists and takes latitude, longitude and distance; **its response fields are documented only behind a login and were not checked** | `us_aqi`, `us_aqi_pm2_5`, the 24 h rolling mean, the CAMS grid, `current` support (Open-Meteo's docs, read 2026-10-24) | -                  |

**Why (A).** The question the card answers is "is the air fine to train in now". NowCast is the EPA's method for exactly that: it leans on the newest hours when the air is changing (a smoke plume arriving) and averages more broadly when it is steady. It keeps one upstream and one key, works outside the US, stays a measurement rather than a model, and is a pure function over twelve numbers, testable to the decimal. (C)'s 24-hour mean would report a plume a day late; (B) doubles the external surface for US visitors only.

**The NowCast, as implemented** (the EPA's PM method, as AirNow publishes it): take the hourly means c₁ (newest) … c₁₂; it is valid only if at least two of c₁, c₂, c₃ exist; with cmin and cmax over the hours that exist, the weight is w = max(cmin / cmax, 0.5); NowCast = Σ wⁱ⁻¹·cᵢ / Σ wⁱ⁻¹ over the hours that exist, truncated to one decimal for PM2.5. **One deliberate deviation, a default (owner's table):** the EPA computes for the current clock hour, but OpenAQ's hourly data arrives with a lag this plan could not measure, so c₁ is **the newest hour the station reported**, used only if it ended within the last three hours; older than that, the NowCast is null. When it is null, the AQI is null and the band "Unknown" (decision 5 (A)), exactly as for a station with no PM2.5 today. A failed hours request is treated the same way: it degrades this one number, not the whole route, because the station and its other readings did arrive.

**Absent is not zero (CLAUDE.md).** The hourly `value` goes through `toFiniteNumber` before anything else, so `null`, `""` and an absent key are a **missing hour** (they do not count towards "two of three", and do not pull the average to 0), while a measured `0` is an hour of clean air. A negative value is a missing hour too, as `pm25ToUsAqi` already treats a negative reading (spec default 6). `cmax` of 0 (every hour measured clean) gives w = 1 by a guard, not a division by zero, and a NowCast of 0, which is AQI 0, a measurement.

**Files:**

- Modify: `server/src/services/external/externalDataService.js` (two new functions after `pm25ToUsAqi`, `:406`; the export list `:766-770`)
- Modify: `server/src/routes/external/registerAirQualityRoutes.js` (the header `:1-5`, deps `:15-26`, the readings loop `:69-78`, the score `:81-87`, the payload `:89-123`, the fallback `:142-148`)
- Modify: `server/src/index.js:426` and `:699` (the two new functions into the route deps)
- Test: `server/src/services/external/__tests__/airQuality.test.js`, `server/src/routes/external/__tests__/airQualityRoutes.test.js` (its `upstream` stub and the summary tests that pin the instant reading)
- Modify: `CLAUDE.md:181-183` (the sweep's list of guarded helpers), `server/README.md` (the air-quality route's description, if it describes the score; read `:155-170` first), `README.md` (nothing if no line describes the score; checked: `:227`, `:244-245`, `:431` name the key and TTL only)

- [ ] **Step 1: Branch, and read today's calls and the upstream's contract**

```bash
git fetch origin && git switch -c feat/aqi-nowcast origin/main
git grep -n "openAqRequest(" -- server/src
git grep -n "pm25ToUsAqi\|aqiBand" -- server/src client/src
```

Expected: two `openAqRequest` calls, both in this route; `pm25ToUsAqi` and `aqiBand` in the service, the route, `index.js` and the tests; nothing in `client/src`. Then, with `OPENAQ_API_KEY` available **only to the owner** (the plan never reads `server/.env`), ask the owner to run one live request and paste the shape (not the key): `curl -s -H "X-API-Key: $OPENAQ_API_KEY" "https://api.openaq.org/v3/sensors/<a PM2.5 sensor id>/hours?datetime_from=<13 h ago, ISO>&limit=24" | node -e 'const r=JSON.parse(require("fs").readFileSync(0));console.log(r.results.length, JSON.stringify(r.results.at(-1), null, 1).slice(0, 800))'`. Confirm: the results' `value` and `period.datetimeTo.utc` fields; their order; how far behind now the newest hour is (this is the lag the three-hour bound is for: if it is routinely more than two hours, raise the bound and say so in the PR). If the owner cannot run it, the task proceeds on the documented shape and the PR says the lag was not measured.

- [ ] **Step 2: The failing tests**

`airQuality.test.js`, a new `describe("pm25NowCast")`, the clock pinned (`vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-03-02T12:10:00Z"))`, `vi.useRealTimers()` in `afterEach`; fake **only** `Date`, because the route file's supertest and express rely on real timers), with a helper building an hour. Every expected value below was checked by hand against the formula; the two weighted cases compute their expectation in the test in the same order the implementation sums, so the floating-point result is identical, not merely close:

```js
// One OpenAQ hourly mean, ending `hoursAgo` whole hours before 12:00Z.
const hour = (hoursAgo, value) => ({
  value,
  period: { datetimeTo: { utc: new Date(Date.UTC(2026, 2, 2, 12 - hoursAgo)).toISOString() } }
});

describe("pm25NowCast", () => {
  test("of a steady twelve hours is that level", () => {
    const hours = Array.from({ length: 12 }, (_, i) => hour(i, 20));
    expect(pm25NowCast(hours)).toBe(20);
  });

  // The EPA's own worked example shape: rising air, weight floored at 0.5, so
  // the newest hours dominate. With c = 40, 20 and ten hours of 10, the weight
  // is max(10 / 40, 0.5) = 0.5.
  test("leans on the newest hours when the air is changing", () => {
    const hours = [
      hour(0, 40),
      hour(1, 20),
      ...Array.from({ length: 10 }, (_, i) => hour(i + 2, 10))
    ];
    const weights = Array.from({ length: 12 }, (_, i) => 0.5 ** i);
    const values = [40, 20, ...Array(10).fill(10)];
    const expected =
      values.reduce((s, v, i) => s + v * weights[i], 0) / weights.reduce((a, b) => a + b);

    expect(pm25NowCast(hours)).toBe(Math.floor(expected * 10) / 10);
  });

  test("uses the range ratio as the weight when it is above one half", () => {
    // min 30, max 40: w = 0.75.
    const hours = [hour(0, 40), hour(1, 30), hour(2, 40)];
    const w = 0.75;
    const expected = (40 + 30 * w + 40 * w * w) / (1 + w + w * w);

    expect(pm25NowCast(hours)).toBe(Math.floor(expected * 10) / 10);
  });

  test("needs two of the three newest hours", () => {
    expect(pm25NowCast([hour(0, 12), hour(3, 12), hour(4, 12)])).toBeNull();
    expect(pm25NowCast([hour(0, 12), hour(2, 12)])).not.toBeNull();
  });

  test("is null for a station that stopped reporting", () => {
    expect(pm25NowCast([hour(4, 12), hour(5, 12), hour(6, 12)])).toBeNull();
  });

  // Absent is not zero: a null, an empty string or a missing value is a missing
  // hour, which neither counts towards two of three nor pulls the mean to 0.
  test.each([[null], [""], [undefined]])("reads a %j hour as missing, not as 0", (absent) => {
    const hours = [hour(0, 30), hour(1, absent), hour(2, 30)];
    expect(pm25NowCast(hours)).toBe(30);
    expect(pm25NowCast([hour(0, 30), hour(1, absent), hour(2, absent)])).toBeNull();
  });

  test("keeps a measured zero", () => {
    expect(pm25NowCast([hour(0, 0), hour(1, 0), hour(2, 0)])).toBe(0);
  });

  test("reads a negative hour as a sensor fault, missing", () => {
    expect(pm25NowCast([hour(0, 30), hour(1, -5), hour(2, 30)])).toBe(30);
  });

  test.each([[undefined], [null], ["not a list"], [[{ value: 10 }]]])("is null for %j", (hours) => {
    expect(pm25NowCast(hours)).toBeNull();
  });
});

describe("nowCastHoursQuery", () => {
  // Floored to the hour, so every lookup within one hour asks the same thing
  // and hits the same cache entry.
  test("asks from thirteen hours before the current hour", () => {
    expect(nowCastHoursQuery()).toEqual({ datetime_from: "2026-03-01T23:00:00.000Z", limit: 24 });
  });
});
```

(Import both from the service the way this file imports `pm25ToUsAqi`; read its top.) `airQualityRoutes.test.js`: the `upstream` stub (`:94-98`) gains a third answer:

```js
const upstream = ({
  locations,
  latest,
  hours = [],
  locationsCache = "miss",
  latestCache = "miss",
  hoursCache = "miss"
}) =>
  vi
    .fn()
    .mockResolvedValueOnce({ data: { results: locations }, cache: locationsCache })
    .mockResolvedValueOnce({ data: { results: latest }, cache: latestCache })
    .mockResolvedValueOnce({ data: { results: hours }, cache: hoursCache });
```

Pin the clock in that file as above. **Rewrite** the tests that pin today's instant score, "reports the AQI the EPA table gives for the measured pm2.5" (`:281-291`) and "recognises %s as pm2.5" (`:295-304`), to give three steady hours of the same value and expect `summary.aqiUs` to be `pm25ToUsAqi(<that value>)` and a new `summary.pm25NowCast` to be the value; `summary.pm25` stays the latest reading. Add:

```js
test("asks for the PM2.5 sensor's hourly means", async () => {
  const openAqRequest = upstream({ locations: [station()], latest: [reading(1, 12)] });

  await get(buildApp(openAqRequest));

  expect(openAqRequest).toHaveBeenNthCalledWith(3, "sensors/1/hours", {
    datetime_from: "2026-03-01T23:00:00.000Z",
    limit: 24
  });
});

test("scores the NowCast, not the latest reading", async () => {
  const hours = [hour(0, 60), hour(1, 60), hour(2, 60)];
  const openAqRequest = upstream({ locations: [station()], latest: [reading(1, 5)], hours });

  const { body } = await get(buildApp(openAqRequest));

  expect(body.summary.pm25).toBe(5);
  expect(body.summary.pm25NowCast).toBe(60);
  expect(body.summary.aqiUs).toBe(pm25ToUsAqi(60));
});

test("reads Unknown when there are too few recent hours", async () => {
  const openAqRequest = upstream({
    locations: [station()],
    latest: [reading(1, 5)],
    hours: [hour(0, 60)]
  });

  const { body } = await get(buildApp(openAqRequest));

  expect(body.summary.aqiUs).toBeNull();
  expect(body.summary.level).toBe("Unknown");
  expect(body.summary.pm25).toBe(5);
});

test("reads Unknown, and still answers, when the hourly request fails", async () => {
  const openAqRequest = upstream({ locations: [station()], latest: [reading(1, 5)] });
  openAqRequest.mockReset();
  openAqRequest
    .mockResolvedValueOnce({ data: { results: [station()] }, cache: "miss" })
    .mockResolvedValueOnce({ data: { results: [reading(1, 5)] }, cache: "miss" })
    .mockRejectedValueOnce(Object.assign(new Error("openaq exploded"), { status: 502 }));

  const response = await get(buildApp(openAqRequest));

  expect(response.status).toBe(200);
  expect(response.body.fallback).toBeUndefined();
  expect(response.body.summary.level).toBe("Unknown");
  expect(response.body.pollutants).toHaveLength(1);
});

test("asks for no hours when the station has no PM2.5 sensor", async () => {
  const openAqRequest = upstream({
    locations: [station({ sensors: [sensor(2, "o3", "ppm")] })],
    latest: [reading(2, 0.03)]
  });

  await get(buildApp(openAqRequest));

  expect(openAqRequest).toHaveBeenCalledTimes(2);
});
```

(`hour` as in the service test; `buildApp` gains the two new deps from the same `createExternalDataService` call the file already makes.) Update "merges the cache status of both upstream calls" (`:390-…`) to all three, with the hours call's status merged in, and the fallback test (`:408-…`) to expect `pm25NowCast: null` in the fallback summary.

```bash
npm run test -w server -- src/services/external/__tests__/airQuality.test.js src/routes/external/__tests__/airQualityRoutes.test.js > "$SCRATCH/s2-red.txt" 2>&1; echo "exit=$?"; grep -E "Tests  |is not a function|expected" "$SCRATCH/s2-red.txt" | head -20
```

Expected: exit `1`: every `pm25NowCast` and `nowCastHoursQuery` test (`… is not a function`); the route's NowCast tests (no third call; `pm25NowCast` undefined). "asks for no hours when the station has no PM2.5 sensor" passes already (two calls today).

- [ ] **Step 3: The fix**

`externalDataService.js`, after `pm25ToUsAqi`:

```js
const HOUR_MS = 60 * 60 * 1000;
const NOWCAST_HOURS = 12;
// How old the newest hour may be. OpenAQ's hourly means arrive late, so the
// newest one the station reported stands in for the current hour, as long as
// it ended within this window.
const NOWCAST_MAX_AGE_MS = 3 * HOUR_MS;

// The EPA's NowCast for PM2.5: a weighted mean of the last twelve hourly means,
// the newest heaviest. The weight is min / max of the hours present, floored
// at 0.5, so steady air averages broadly and changing air leans on the newest
// hours. Valid only when two of the three newest hours are present. An hour
// whose value is absent (null, "", missing) or negative is a missing hour,
// never a zero one; a measured 0 is clean air. Returns null when not valid.
const pm25NowCast = (hours, nowMs = Date.now()) => {
  const byHour = new Map();
  for (const item of Array.isArray(hours) ? hours : []) {
    const value = toFiniteNumber(item?.value);
    const endMs = Date.parse(item?.period?.datetimeTo?.utc ?? "");
    if (value === null || value < 0 || !Number.isFinite(endMs)) continue;
    byHour.set(Math.floor(endMs / HOUR_MS), value);
  }
  if (!byHour.size) return null;
  const newest = Math.max(...byHour.keys());
  if (nowMs - newest * HOUR_MS > NOWCAST_MAX_AGE_MS) return null;
  const series = Array.from({ length: NOWCAST_HOURS }, (_, i) => byHour.get(newest - i) ?? null);
  if (series.slice(0, 3).filter((value) => value !== null).length < 2) return null;
  const present = series.filter((value) => value !== null);
  const max = Math.max(...present);
  const weight = max > 0 ? Math.max(Math.min(...present) / max, 0.5) : 1;
  let weighted = 0;
  let total = 0;
  series.forEach((value, i) => {
    if (value === null) return;
    weighted += value * weight ** i;
    total += weight ** i;
  });
  return Math.floor((weighted / total) * 10) / 10;
};

// The hours pm25NowCast reads: from thirteen hours before the current hour,
// floored to the hour so every lookup in that hour shares one cache entry.
const nowCastHoursQuery = (nowMs = Date.now()) => ({
  datetime_from: new Date(
    (Math.floor(nowMs / HOUR_MS) - NOWCAST_HOURS - 1) * HOUR_MS
  ).toISOString(),
  limit: 24
});
```

and both names in the returned object beside `pm25ToUsAqi`. (`?? ""` before `Date.parse` and `?? null` after `byHour.get` are both reached by the tests: an hour without a period, and a gap in the series.)

`registerAirQualityRoutes.js`: the header becomes "GET /api/air-quality/current: an OpenAQ station near the given coordinates, its latest readings, and the EPA NowCast of its PM2.5 hourly means scored as a US AQI with a training recommendation. Registered by externalRoutes.js."; the deps gain `pm25NowCast, nowCastHoursQuery`; the readings loop keeps the sensor id, `if (!byCode.has(parsed.code)) byCode.set(parsed.code, { ...parsed, sensorsId: entry?.sensorsId });`; the score becomes:

```js
// Score PM2.5's NowCast over the sensor's hourly means. No PM2.5 sensor,
// too few recent hours, or a failed hourly request each score null and the
// "Unknown" band, never AQI 0; the latest reading is still reported.
const pm25Reading =
  pollutants.find((item) => ["pm25", "pm2.5", "pm2_5", "pm2p5"].includes(item.code)) || null;
const pm25 = pm25Reading?.value ?? null;
const pm25SensorId = toNullableNumber(pm25Reading?.sensorsId, 1, 1000000000);
const hoursResponse =
  pm25SensorId === null
    ? null
    : await openAqRequest(`sensors/${Math.trunc(pm25SensorId)}/hours`, nowCastHoursQuery()).catch(
        () => null
      );
const pm25NowCastValue = pm25NowCast(hoursResponse?.data?.results);
const aqiUs = pm25ToUsAqi(pm25NowCastValue);
const recommendation = aqiBand(aqiUs);
```

The payload's `cache` gains `hours: hoursResponse?.cache ?? null` and `status: mergeCacheStatuses(locationResponse.cache, latestResponse.cache, hoursResponse?.cache)`; `summary` gains `pm25NowCast: pm25NowCastValue` after `pm25`; the outage fallback's `summary` gains `pm25NowCast: null`. The `pollutants` map must not leak `sensorsId` (it lists fields explicitly, so it does not; check). `index.js:426` and `:699`: add `pm25NowCast, nowCastHoursQuery` beside `pm25ToUsAqi`.

```bash
npx prettier --write server/src/services/external/externalDataService.js server/src/routes/external/registerAirQualityRoutes.js server/src/index.js server/src/services/external/__tests__/airQuality.test.js server/src/routes/external/__tests__/airQualityRoutes.test.js
npm run test -w server -- src/services/external/__tests__ src/routes/external/__tests__ src/__tests__/numericCoercion.contract.test.js src/__tests__/index.test.js > "$SCRATCH/s2-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests  " "$SCRATCH/s2-green.txt"
git add server/src
git commit -m "feat(server): score air quality as the EPA NowCast of the last twelve hours" -m "The US AQI came from the station's single latest PM2.5 value, on a scale the EPA defines for averages. It is now the NowCast of the PM2.5 sensor's hourly means from OpenAQ, the EPA's real-time method. Too few recent hours, or a failed hourly request, reads Unknown rather than a number; an absent hour is missing, never a zero." -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
```

- [ ] **Step 4: Mutation checks**

| Mutation                                                     | Caught by                                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `toFiniteNumber(item?.value)` → `Number(item?.value)`        | "reads a null hour as missing, not as 0" (and `""`): the absent hour becomes a 0 hour. This is the CLAUDE.md class; it must be caught |
| `value < 0 \|\|` deleted                                     | "reads a negative hour as a sensor fault"                                                                                             |
| `< 2` → `< 1`                                                | "needs two of the three newest hours"                                                                                                 |
| `NOWCAST_MAX_AGE_MS` check deleted                           | "is null for a station that stopped reporting"                                                                                        |
| `Math.max(…, 0.5)` → the bare ratio                          | "leans on the newest hours when the air is changing"                                                                                  |
| `max > 0 ? … : 1` → the ratio alone                          | "keeps a measured zero" (NaN)                                                                                                         |
| `weight ** i` → `weight ** (i + 1)` in one sum only          | the steady and changing tests                                                                                                         |
| `Math.floor(… * 10) / 10` deleted                            | "uses the range ratio as the weight" (an unrounded value)                                                                             |
| route: `pm25ToUsAqi(pm25NowCastValue)` → `pm25ToUsAqi(pm25)` | "scores the NowCast, not the latest reading"                                                                                          |
| route: `.catch(() => null)` deleted                          | "reads Unknown, and still answers, when the hourly request fails" (the whole-route fallback answers instead)                          |
| `Math.floor(nowMs / HOUR_MS)` → `nowMs / HOUR_MS`            | "asks from thirteen hours before the current hour"                                                                                    |

- [ ] **Step 5: Coverage**

Predicted: two covered functions and one callback in the service; the route's new ternary and `.catch` arrow both reached (the no-sensor test and the failing-hours test). Several new branch arms, all reached by Step 2. Measure, record before and after; every server slack 0 or more.

- [ ] **Step 6: Docs**

- `CLAUDE.md:181-183`, "`pm25ToUsAqi`, `aqiBand`, `toFiniteNumber`, `weatherCodeToText` and `toNumberOrNull` all guard;" gains `pm25NowCast` ("… and `pm25NowCast`, which reads an absent hour as a missing hour, all guard"). The numeric-coercion contract test enumerates single-value helpers; `pm25NowCast` takes a list, so it is pinned by its own tests instead, and the PR says so (CLAUDE.md: "Add a row when you add a helper": this is not that shape).
- `server/README.md`: wherever the air-quality route is described (read `:155-170` and grep `air-quality`), say the AQI is the EPA NowCast of the station's PM2.5 hourly means, three OpenAQ calls per uncached lookup, the hours one cached per sensor and hour.
- `README.md`: nothing (no line describes the score).

- [ ] **Step 7: Gates and PR**

Gates (Conventions), with E2E (geolocation is denied there, so the route is not reached; it must stay green). `git push -u origin feat/aqi-nowcast`; `gh pr create --draft --base main --title "feat(server): score air quality as the EPA NowCast of the last twelve hours" --body-file "$SCRATCH/pr-s2.md"`. Outline: decisions 4 and 5, with the options table; what the route scored and why that was the wrong scale; the NowCast, its deviation (newest reported hour, three-hour bound) and the lag measurement from Step 1, or that it was not measured; absent is not zero; the red run; mutations; coverage; the docs; that C3 relabels the card; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

## Client track, continued

C3 is placed here because it reads S2's new field and merges after it; L1 follows it as the client track's last task.

### Task C3: The summary card says what the AQI is based on

**Branch:** `feat/aqi-nowcast-label` (client track, after C2 **and** S2's merge).

**Today** (`client/src/pages/dashboard/views/SummaryView.jsx:366-370`):

```jsx
<p className="muted">
  {airSummary.primaryPollutant || "PM2.5"}: {airSummary.pm25 ?? "--"} ug/m3
  {airSummary.aqiUs !== null && airSummary.aqiUs !== undefined
    ? ` | US AQI ${airSummary.aqiUs} from the latest reading`
    : ""}
</p>
```

After S2, `aqiUs` is the NowCast's. A payload cached before S2 (the per-account air-quality cache, `useDashboardData.js:253-262`) has no `pm25NowCast`, and its `aqiUs` really is from the latest reading, so the label follows the payload rather than assuming:

```jsx
{
  airSummary.aqiUs !== null && airSummary.aqiUs !== undefined
    ? ` | US AQI ${airSummary.aqiUs} ${
        Number.isFinite(airSummary.pm25NowCast)
          ? "(NowCast, last 12 hours)"
          : "from the latest reading"
      }`
    : "";
}
```

`Number.isFinite` rather than `!= null`: it is the absent-is-not-zero shape, and a `pm25NowCast` of `0` (clean air, measured) is finite, so it is labelled NowCast.

**Files:** Modify `client/src/pages/dashboard/views/SummaryView.jsx:368`; Test `client/src/pages/dashboard/views/__tests__/SummaryView.test.jsx`.

- [ ] **Step 1: Branch, the before-capture** (`$SHOTS/c3-before`; chain-compare against `$SHOTS/c2-after`, `identical`). `git grep -n "from the latest reading" -- client/src` finds the one line and any test of it.
- [ ] **Step 2: The failing tests.** No test reads this line on `62f8d80` (`grep -n "latest reading\|aqiUs" client/src/pages/dashboard/views/__tests__/SummaryView.test.jsx` prints nothing), so this adds the first, in a new `describe("the air card's AQI line")` rendering SummaryView with the file's existing props helper and an `airQualityData` whose `summary` carries `level`, `guidance`, `pm25` and the fields below. A table: `{ aqiUs: 151, pm25NowCast: 60 }` → contains "US AQI 151 (NowCast, last 12 hours)"; `{ aqiUs: 0, pm25NowCast: 0 }` → "US AQI 0 (NowCast, last 12 hours)"; `{ aqiUs: 54 }` (a pre-S2 cached payload) → "US AQI 54 from the latest reading"; `{ aqiUs: null, pm25NowCast: null }` → no "US AQI". Red: the two NowCast rows fail.
- [ ] **Step 3: The fix** as above; the component's doc comment, if it describes the air card's line, gains "labelled NowCast when the payload carries one". Commit `feat(client): the air card says its AQI is a NowCast` with the trailer.
- [ ] **Step 4: Mutations:** `Number.isFinite(airSummary.pm25NowCast)` → `airSummary.pm25NowCast` (the `0` row reads "from the latest reading"); the two strings swapped (both NowCast rows).
- [ ] **Step 5: Coverage:** one ternary, both arms covered. Measure; slack 0 or more.
- [ ] **Step 6: Compare** (`$SHOTS/c3-after`): `identical`. The capture tool denies geolocation, so no air payload is ever rendered in a capture; the change is invisible to it, and the unit tests are the proof.
- [ ] **Step 7: Gates and PR.** `gh pr create --draft --base main --title "feat(client): the air card says its AQI is a NowCast" --body-file "$SCRATCH/pr-c3.md"`. Outline: S2's change; the cached-payload case and why the label reads the payload; the `0` row; the red run, mutations, coverage, compare; the gates; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

---

### Task L1: `styles/base.css` becomes the lowest cascade layer

**Branch:** `refactor/css-base-layer` (client track, last). Written to decision 7's recommendation (B). **This is the largest and riskiest item; read the assessment before starting, and if the owner chose (A), skip this task and record the decision in CLAUDE.md instead (Step 8's sentence, without the change).**

**The survey** (`62f8d80`, `git ls-files 'client/src/**/*.css'`): 49 stylesheets, 9,753 lines, no `@layer` anywhere, 143 `!important` declarations in 15 files. The largest counts are `pages/home/styles/core/layout.css` (47), `pages/home/preview/styles/layout/frame.css` (27), `pages/dashboard/styles/theme.css` (17), `pages/home/preview/styles/workout-week/break-apart.css` (12), `styles/base.css`, `pages/home/styles/forms-and-motion.css` and `pages/home/preview/styles/layout/base.css` (8 each).

**How the cascade is ordered today, and how conflicts are settled.** Order is import order. `App.jsx` imports the pages (`:6-9`: auth, dashboard, home, workout-result, each importing its stylesheet), `AppNotice` (`:23`, `notice.css`), then `styles/app.css` (`:41`, the planner's four sheets); `main.jsx` imports `App` (`:7`) and then `styles/index.css` (`:10`), which is only `@import "./base.css"`. So **`base.css` is the last sheet in the main CSS chunk and wins every tie against every page** (its own header says so: "it follows every stylesheet in the main CSS chunk and wins ties against them"). The seven lazily loaded dashboard views (`DashboardPage.jsx:17-23`) are separate CSS files appended when they load, so they beat `base.css` on ties. Conflicts are settled three ways, each documented in a comment beside it:

1. **Raising a selector** to outrank `base.css`: `.modal-submit.dashboard-workout-actions` (`dashboard/styles/workout-modal.css:202-209`, `dashboard/styles/responsive.css:96-102`), the ancestor-qualified one-column rules (`home/styles/responsive.css:54-58`).
2. **`!important`**: against **inline styles** App passes (`home/styles/core/layout.css:14-21`: "The !important background beats the inline radial gradient App passes HomePage, AuthPage…"), against **later page sheets** (`home/preview/styles/layout/frame.css:92-110`, pinning the header and contents lane over `responsive.css`), and **against `base.css`'s own `!important`** (`dashboard/styles/theme.css:343-358`: "styles/base.css declares .back-btn's colours and shadow !important, so the .back-btn selectors here have to be too"). CLAUDE.md's "`!important` transitions" are the walkthrough contents labels' (`home/preview/styles/layout/toc.css`), the second kind.
3. **Accepting the loss**: page declarations that tie a `base.css` rule and so **never apply**, recorded and left (spec default 9, "the cascade bugs no user can see … accepted"): `app/styles/planner/interactions.css:6-9` (`.planner-setup-modal .muted` colour, lost to `.modal .muted`), `home/preview/styles/personal.css:128-131` (`.preview-personal-form`'s gap and top margin, lost to `.form`), `home/styles/core/personal.css:24-32` (`.personal-form`'s grid columns, gap and top margin, lost to `.form`), `home/styles/forms-and-motion.css:233-245` (`.personal-hint`'s top margin, lost to `.muted`), `home/styles/responsive.css:184-…` (the Preview button's `padding-inline`, lost to `.ghost`).

**Is a migration worth doing? Honestly: a full one, no.** No visitor-visible bug motivates it: every conflict above is settled and commented, and the ones that lose are invisible by definition (default 9). A full migration would re-order 9,753 lines of cascade under three hazards, each of which has bitten this codebase in a smaller form:

- **Layered `!important` inverts.** An `!important` in an _earlier_ layer beats one in a later layer, and any layered `!important` beats every unlayered one. So moving a sheet with `!important` into a layer silently changes which `!important` wins, in the opposite direction to normal declarations.
- **The proof has blind spots.** The capture tool covers 44 states (Phase 4's Baseline): it does not hover, focus or press, and of the seven lazily loaded dashboard views it renders two, Meal and Tips, and those only in their loading state (Summary, which it renders, is not lazy). A layer change to Workouts', Calories', Plans', Settings' or the home view's sheets would be unproven by it.
- **Lightning CSS rewrites the build** (CLAUDE.md, "Lightning CSS rewrites every built rule"), so the built CSS cannot be read as written; the computed-style compare is the only reliable proof, with the blind spots above.

**What is worth doing is the one structural cost**: `base.css` loads last, so the shared base wins ties it should lose. That is why `theme.css` needs `!important`, why selectors are raised, and why five page declarations are dead. Putting **`base.css` alone** into a cascade layer (`@import "./base.css" layer(base)`) makes every unlayered page, planner and view rule beat it at any specificity, which is what a base is. That is decision 7 (B), one PR, and then stop.

**What (B) changes, and how it stays byte-identical.** Under a lower layer, every tie `base.css` wins today flips to the page. Three groups:

- **The dead declarations (group 3)** would start applying: a visible change to five places the owner accepted as invisible. To keep the render identical, **delete each dead declaration in the same PR** (it never applied, so deleting it changes nothing today, and after the layer change nothing wakes up), with its comment. This is a deletion of dead code, which the spec's rule 5 sequences last; it is CSS, which no coverage counts, so it moves no floor.
- **The raised selectors (group 1)** still win; they are left as they are (lowering them is churn with no effect), and their comments are corrected: they no longer _need_ the extra class, but it does no harm.
- **`base.css`'s eight `!important` (`:348-365`, the `.back-btn` gradient)** would, once layered, beat **every** unlayered `!important`, including `theme.css`'s white dashboard buttons: a visible regression. So they are removed in the same PR. Without them, `theme.css:343-358`'s seven `!important` exist for nothing (their comment says they exist only for `base.css`'s), so they are removed too, and its comment rewritten. The `.cta` half of that rule needs no `!important` either: its comment says "No other .cta rule inside .dashboard-page is !important".
- **Ties nobody documented** may exist. Step 1's inventory finds every one before the change, and each is handled as above (a dead declaration deleted, or listed as an expected difference with the owner's agreement). **If the inventory finds a tie whose page declaration should win and would visibly change the page, that is a new design question: stop and ask, do not widen the expectation.**

**Files** (the deletions and comment edits depend on Step 1's inventory; these are the known ones):

- Modify: `client/src/styles/index.css` (`@import "./base.css";` → `@import "./base.css" layer(base);`, and its comment; **it starts with a BOM**: edit with the Edit tool and check the bytes)
- Modify: `client/src/styles/base.css` (header comment `:1-4`; the eight `!important` at `:348-365`; the Google Fonts `@import` at `:7` may have to move to `index.css`, Step 3)
- Modify: `client/src/pages/dashboard/styles/theme.css:343-358`
- Modify (delete a dead declaration and its comment): `client/src/app/styles/planner/interactions.css:6-9`, `client/src/pages/home/preview/styles/personal.css:128-131`, `client/src/pages/home/styles/core/personal.css:24-32` (the three dead properties only; `align-items`, `align-content` and `width` stay if they apply, which the inventory says), `client/src/pages/home/styles/forms-and-motion.css:233-245` (the hint's top margin only), `client/src/pages/home/styles/responsive.css:184-…` (the Preview button's `padding-inline` only)
- Modify (comments that say `base.css` "loads later" and wins, which become untrue): `client/src/styles/app.css:1-3` ("imported by App after every page" stays true; check), `client/src/pages/dashboard/styles/workout-modal.css:202-204`, `client/src/pages/dashboard/styles/responsive.css:96-97`, `client/src/pages/dashboard/views/MealView.css:269-272`, `PlansView.css:142-…`, `TipsView.css:245-…` ("beat styles/base.css's .modal only because this sheet loads after the main CSS chunk" becomes "beat styles/base.css's .modal, which is in the lower base layer"), `client/src/pages/home/preview/PreviewStage.css:4`, `client/src/pages/home/preview/styles/layout/base.css:59-…`, `client/src/pages/home/styles/core/layout.css:213-214`, `client/src/pages/home/styles/responsive.css:1-3` and `:54-58`. `git grep -n -i "base\.css" -- 'client/src/**/*.css'` lists them all: 25 hits in 19 files on `62f8d80`, some of which name the walkthrough's own `layout/base.css` or `table-base.css` rather than `styles/base.css`; every one is re-read.
- Modify: `CLAUDE.md` (Build & Test, after "A CSS or motion change is proved by screenshot"), `client/README.md` if it describes the stylesheet order (grep `base.css`)

- [ ] **Step 1: Branch, the before-capture, and the inventory of ties**

```bash
git fetch origin && git switch -c refactor/css-base-layer origin/main
git grep -n "@layer" -- client/src; echo "expect none above"
git grep -n -i "base.css" -- 'client/src/**/*.css' > "$SCRATCH/l1-mentions.txt"; wc -l < "$SCRATCH/l1-mentions.txt"
npm run build > "$SCRATCH/b-l1-0.txt" 2>&1; echo "build exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/l1-before" > "$SCRATCH/l1-cap0.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/c3-after" "$SHOTS/l1-before"; echo "chain exit=$?"
```

Then write `$TOOLS/cascade-ties.mjs` with the Write tool. It is a scratch tool, never committed, and it was **not written or run during planning**, so its first run must pass the self-check below before its output is trusted. What it does:

1. Starts **Vite's dev server** (`createServer` from the client's `vite`, port 4176, `strictPort`), not the build: in development every stylesheet is its own `<style data-vite-dev-id="<absolute path>">`, so a rule's source file is known, which the minified bundle loses.
2. For each of the capture tool's states (copy `BASE_STATES` and its `reach` helpers from `capture.mjs`, with the same `/api` stubs, geolocation denied and clock), at desktop and phone widths, opens the page with Playwright's Chromium and a CDP session (`page.context().newCDPSession(page)`), enables `DOM` and `CSS`, and maps each `styleSheetId` to its file from `CSS.styleSheetAdded` (`header.ownerNode` → `DOM.describeNode({ backendNodeId })` → the `data-vite-dev-id` attribute).
3. For every element (`DOM.getDocument({ depth: -1 })`, then `DOM.querySelectorAll(root, "*")`), calls `CSS.getMatchedStylesForNode({ nodeId })`. For each property, it takes every matched author rule that declares it (`matchedCSSRules[i].rule.style.cssProperties`, skipping `disabled` and unparsed ones), with that rule's file, its **matching** selector's `specificity` (`rule.selectorList.selectors[j].specificity` for `j` in `matchingSelectors`), its `important` flag and its index in the list (Chromium returns matched rules in cascade order, lowest first).
4. Reports three lists, each row as `state | element path | property | base selector | other file:selector | value each`:
   - **Ties `base.css` wins by order**: a `base.css` declaration that is the property's winner while a declaration from another file has the **same importance and the same specificity** and an earlier index. These are exactly the declarations a lower layer flips.
   - **Page declarations beaten only by a `base.css` `!important`**: a non-important declaration from another file, on the same element and property, that would win on specificity or order but loses because `base.css`'s is `!important`. Removing those `!important` wakes these up, whatever the layer. `.back-btn` is used on the home stages (`HomePersonalStage.jsx:358`, `HomeVisualizerStage.jsx:64`, `HomeWorkoutStage.jsx:30`, `HomeWorkoutMeasure.jsx:29`), in the planner (`PlannerSetupModal.jsx:104`, which renders through a portal, possibly outside `.dashboard-page`) and in `DashboardHomeView.jsx:17`, so every one of those is checked.
   - **`base.css` `!important` that matches anything**: every matched `!important` declaration from `base.css`. These invert under a layer.
5. **Self-check, before anything is trusted:** the first list must contain each of group 3's five known ties (by property and selector pair), and the third must contain `.back-btn`'s declarations in a state that renders a back button (`dash-planner`, and the home stages). If either is missing, the tool is wrong, not the CSS: fix it.

Run it and keep the output: `node "$TOOLS/cascade-ties.mjs" . > "$SCRATCH/l1-ties.txt" 2>&1; echo "ties exit=$?"`. Classify every row of the first two lists (both are page declarations that do not apply today and would after the change): **dead** (the page declaration never applies; delete it), **raised elsewhere** (a more specific page rule already wins; nothing to do), or **would change** (stop and ask, as above). The PR body carries the table.

The inventory shares the capture tool's blind spots: states it does not render are not inventoried. Before Step 3, also grep `base.css`'s selectors against the five unrendered lazy views' sheets (`WorkoutsView.css`, `CaloriesView.css`, `PlansView.css`, `SettingsView.css`, `DashboardHomeView.css`) and the hover and focus rules: those sheets load **after** `base.css` already, so they win its ties today and still will, and the inventory cannot miss a flip there. Hover and focus rules in the main chunk that tie a `base.css` hover rule (`.ghost:hover`, `.back-btn:hover:not(:disabled)`, `.modal .ghost:hover`) are listed by hand from `git grep -n ":hover\|:focus" -- 'client/src/pages/home/**/*.css' 'client/src/pages/auth/*.css' 'client/src/app/styles/**/*.css'`, compared selector by selector, and classified the same way.

- [ ] **Step 2: No failing test first.** CSS is not instrumented and jsdom computes no cascade; the inventory and the capture compare are the proof (spec rule 7). The "test" that fails first is the inventory itself: run against `main`, its first list is non-empty, and after Step 3 it must be empty.

- [ ] **Step 3: The change**

`index.css`, with the Edit tool (keep the BOM):

```css
/* The global stylesheet, imported by main.jsx: base.css, the app's base layer, in the
   `base` cascade layer. Every page, planner and view rule is unlayered, so each beats it
   at any specificity; main.jsx imports this after App, but the order no longer matters. */

@import "./base.css" layer(base);
```

`base.css`'s header becomes "The app's base layer: … Imported by index.css into the `base` cascade layer, so any page, planner or view rule beats it whatever its specificity or order. Nothing here is `!important`: a layered `!important` would beat every page's." Delete `!important` from the eight declarations at `:348-365`. `theme.css:343-358`: delete the seven `!important` and replace the comment with "The dashboard's primary and back buttons are white. styles/base.css's .back-btn gradient is in the lower base layer, so these win without !important." Delete each dead declaration from Step 1's table, with its comment, and rewrite every comment from `$SCRATCH/l1-mentions.txt` that says `base.css` "loads later", "comes later", "lands after" or "wins ties", to say it is in the lower base layer.

Build, and check two things in the built CSS before capturing (search for declarations, never whole rules: CLAUDE.md, Lightning CSS):

```bash
npm run build > "$SCRATCH/b-l1-1.txt" 2>&1; echo "build exit=$?"
CSS=$(ls client/dist/assets/index-*.css); grep -o "@layer base" "$CSS" | head -1; echo "layer present above"
head -c 200 "$CSS"; echo
```

Expected: `@layer base` present, so the bundler honoured `layer(base)` (Vite inlines `@import`; whether that step keeps the layer was **not verified** during planning). If it is absent, wrap `base.css`'s rules in `@layer base { … }` in the file itself instead and say so. **The first rule of the built CSS must still be the Google Fonts `@import url("https://fonts.googleapis.com/…")`**: a browser ignores an `@import` that follows any other rule, so if the bundler placed it after `@layer base{`, the fonts would silently fall back to `system-ui` (the compare would show it as a PNG difference on every capture). If it moved, take the Google Fonts `@import` out of `base.css` and put it at the top of `index.css`, above the layered import, then rebuild and re-check.

- [ ] **Step 4: The inventory again, and the compare**

```bash
node "$TOOLS/cascade-ties.mjs" . > "$SCRATCH/l1-ties-after.txt" 2>&1; echo "ties exit=$?"
node "$TOOLS/capture.mjs" . "$SHOTS/l1-after" > "$SCRATCH/l1-cap1.txt" 2>&1; echo "capture exit=$?"
node "$TOOLS/capture.mjs" compare "$SHOTS/l1-before" "$SHOTS/l1-after" > "$SCRATCH/l1-cmp.txt" 2>&1; echo "compare exit=$?"; tail -3 "$SCRATCH/l1-cmp.txt"
```

Expected: the inventory's first list **empty** (no tie is decided by order any more: `base.css` loses all of them), its second and third empty (no `!important` left in `base.css`, so nothing is beaten by one); `compare exit=0`, last line `identical`. A `NOISE` line of a few pixels on a round button is the GPU (Phase 4's tool says so) and needs no expectation. Any other difference means a tie the inventory classified wrongly or missed: find it in the style rows, fix the classification, and re-run; do not write an expectation for it unless the owner agreed to that change (and then the PR lists it).

Then the hover check the capture cannot do: the open-items plan's `hover-probe.mjs` (`docs/plans/2026-10-22-readability-follow-up-open-items.md`, Tools), with its `TARGETS` replaced by the dashboard's back button and a `.cta`, and the home `.ghost` buttons, run on the before and after builds; the printed computed `background-image`, `color` and `box-shadow` (add them to its `read()`) must match line for line.

- [ ] **Step 5: Coverage unchanged** (CSS is not instrumented): `test:coverage` must print the counts after C3 exactly.

- [ ] **Step 6: Gates.** All of them, with E2E; the axe scans must still report zero violations (contrast is computed from the same colours, so a changed button colour would show there too).

- [ ] **Step 7: Docs**

`CLAUDE.md`, Build & Test, after the "A CSS or motion change is proved by screenshot" paragraph, a new bullet:

> - **`styles/base.css` is the `base` cascade layer** (`styles/index.css` imports it with `layer(base)`), and nothing else is layered. So any page, planner or view rule beats it at any specificity: never raise a selector or add `!important` to beat it. **Never add `!important` to `base.css`**: a layered `!important` beats every unlayered one, which is the reverse of what it looks like. Moving any other sheet into a layer is a decision, not a cleanup (`docs/plans/2026-10-24-parked-items.md`, Task L1, says why it was not done).

`client/README.md`: if it describes the stylesheet order (`grep -n "base.css\|stylesheet" client/README.md`), the same in a sentence.

- [ ] **Step 8: PR**

`git push -u origin refactor/css-base-layer`; `gh pr create --draft --base main --title "refactor(client): styles/base.css is the lowest cascade layer" --body-file "$SCRATCH/pr-l1.md"`. Outline: decision 7 and the honest assessment (why not a full migration); the survey numbers; the three ways conflicts were settled; the inventory tool, its self-check, and its before and after lists (the before list as a table with each row's classification); the deletions, each a declaration that never applied; the `!important` removed and why they had to go together; the built-CSS checks (`@layer base`, the fonts `@import` first); the compare's last line and the hover probe before and after; coverage unchanged; the CLAUDE.md rule; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line. Ancestor check, `gh pr ready`, `gh pr checks --watch`. Review, then merge.

**If decision 7 is (A):** no branch. Task F's PR adds one sentence to CLAUDE.md instead, under the same paragraph: "`styles/base.css` loads last and wins every tie against the pages; a `@layer` migration was considered and declined (`docs/plans/2026-10-24-parked-items.md`, decision 7). Beat it with a more specific selector, never with `!important`."

**If decision 7 is (C) or (D):** this task becomes the first of a series; each later sheet group (the planner, then each page) is its own PR with its own inventory run, and each group's `!important` is audited against the inversion rule before it moves. Re-plan before starting.

---

## Closing

### Task F: The floor PR, both sides

**Branch:** `chore/parked-items-floors`, once both tracks have merged (G, C1, C2, C3, L1 or its decision-7 alternative, S1, S2) and from the `main` they leave. Spec rule 3 and CLAUDE.md's floor rules: re-measure `main`, raise each floor whose measurement **truncated to one decimal** went up, update the measurement note beside it, never lower one. If a Dependabot PR that moves `vitest` or `@vitest/coverage-v8` is open, it merges first and F measures after it (the open-items plan's Task F did the same with #252), because the counting tool is what enforces the floor.

**No prediction is given here** (Status): every task above was planned, not measured. The floors on `main` before the phase are client 98.9 / 94.4 / 99.1 / 99.5 and server 95.1 / 88.3 / 96.2 / 96.2 (statements / branches / functions / lines; `client/vite.config.js:70-77`, `server/vitest.config.js:28-43`). Which rise is whatever Step 1 prints.

**Files:** `client/vite.config.js` (the "Measured …" note and `thresholds`), `server/vitest.config.js` (the note, with its CI and no-`client/dist` figures, and `thresholds`).

- [ ] **Step 1: Measure `main`, locally and in CI**

```bash
git fetch origin && git switch -c chore/parked-items-floors origin/main
npm ci > "$SCRATCH/ci-floor.txt" 2>&1; echo "npm ci exit=$?"
npm run prisma:generate -w server > "$SCRATCH/prisma-floor.txt" 2>&1; echo "prisma exit=$?"
npm run build > "$SCRATCH/build-floor.txt" 2>&1; echo "build exit=$?"
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc-floor.txt" 2>&1; echo "client exit=$?"
npm run test:coverage -w server -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/sc-floor.txt" 2>&1; echo "server exit=$?"
node "$TOOLS/counts.mjs" . client; node "$TOOLS/counts.mjs" . server
grep -E "Tests  " "$SCRATCH/cc-floor.txt" "$SCRATCH/sc-floor.txt"
```

Expected: every `exit=0`. Run each side twice: a figure that moves between runs of the same code is a test bug to find first (CLAUDE.md: C1's and S2's tests pin the clock for exactly this reason; check `git grep -n "new Date()\|Date.now()" -- <the files this phase changed>` against the tests that reach them). Then the server once more with `client/dist` moved aside (`mv client/dist "$SCRATCH/dist-aside"`, measure, `mv` it back) for the note's no-bundle figure. Then the last green CI run on `main`: `gh run list --branch main --workflow ci.yml --limit 1 --json databaseId -q '.[0].databaseId'`, then `gh run view <id> --log > "$SCRATCH/ci-log.txt"; grep -E "All files" "$SCRATCH/ci-log.txt"`, both Node versions. Where CI and local differ, floor from the lower (the server's branches read higher in CI, so they follow the local figure).

- [ ] **Step 2: Raise only the floors whose truncated measurement went up**

For each metric the candidate is `Math.floor(measured × 10) / 10` from the json-summary's covered / total (never from the text table's two decimals: memory, "Exact coverage for floors"); raise it only where it is higher than today's floor. Update each side's note to `Measured <date> (<four figures, two decimals, truncated>)`, and in the server's note the CI and no-`client/dist` figures beside the local one, as the existing note words them. `scripts/__tests__/repo-invariants.test.mjs` fails when a floor is not its note's figure truncated to one decimal, which proves the two were edited together. If no floor on a side rises, leave that file alone; if none rises on either, open no PR and record "no floor moved" in the phase report.

- [ ] **Step 3: Prove it, commit, open the PR**

```bash
npx prettier --write client/vite.config.js server/vitest.config.js
npm run test:coverage > "$SCRATCH/cov-floor2.txt" 2>&1; echo "test:coverage exit=$?"
node "$TOOLS/counts.mjs" . client; node "$TOOLS/counts.mjs" . server
npm run lint > "$SCRATCH/lint-floor.txt" 2>&1; echo "lint exit=$?"
npm run format:check > "$SCRATCH/fmt-floor.txt" 2>&1; echo "format:check exit=$?"
npm run test:scripts > "$SCRATCH/scripts-floor.txt" 2>&1; echo "test:scripts exit=$?"
git add client/vite.config.js server/vitest.config.js
git commit -m "chore(coverage): raise the floors after the parked items" -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
git push -u origin chore/parked-items-floors
gh pr create --base main --title "chore(coverage): raise the floors after the parked items" --body-file "$SCRATCH/pr-floors.md"
```

Expected: every `exit=0`; every slack 0 or more against the new floors. `pr-floors.md` follows the open-items plan's Task F body: the floors that moved and the rule; the PRs merged on each track; per side, Metric, Covered / total, Measured to four decimals, Floor before, Floor after, Slack; tests before and after; the CI run that agrees; the exits; the `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 4: Review, then merge.** The quality review recomputes each percentage and truncation from the counts in the body.

---

## Ordering, and why

| Order | Task | Why here                                                                                                                                                                          |
| ----- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | G    | CI-only, independent of both tracks, lowest risk; once merged it scans every later PR. Its only shared file with a later task is `CLAUDE.md` (different sections)                 |
| 2     | C1   | Small, client-only; changes the dashboard captures, so it goes before the other capture tasks and L1, which chain-compare against it                                              |
| 3     | C2   | Small, client-only, pure functions; no capture change                                                                                                                             |
| 4     | S1   | Security-relevant but contained (one module, its wiring, docs); first on the server track because S2 does not depend on it and it changes `README.md`, which S2 also touches      |
| 5     | S2   | The largest server change; depends on decision 4                                                                                                                                  |
| 6     | C3   | Reads S2's `pm25NowCast`, so it waits for S2's merge; tiny                                                                                                                        |
| 7     | L1   | The riskiest; last on the client track, so its before-capture already contains every other client change, and so the decision-7 answer can be revisited after the rest has landed |
| 8     | F    | After both tracks                                                                                                                                                                 |

The tracks are independent apart from C3 → S2: a server PR and a client PR may be drafted in parallel, but only one implementer uses the working tree at a time (E2E ports 4173/4174/5000, the dev port 4176 in L1, and Postgres are shared). Shared files are tabled under "The tasks".

---

## Closing the phase

When Task F merges (or is recorded as "no floor moved"), write the phase report (spec, "Closing a phase"): what merged on each track; coverage before (Step 1 of the first server task, and the client's note) and after (Task F's measurement); the seven decisions as taken or overridden; the two owner actions this phase hands over (Task G: make "Secret scan" a required check; Task S1: clear `CLIENT_ORIGIN` on Render and load the site in Chrome); and the table below. Check on `main` that CI is green (`gh run list --branch main --workflow ci.yml --limit 1`).

## Not in this phase

| Item                                                                                                                                                                             | Where it goes                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A full `@layer` migration (decision 7 (C) or (D))                                                                                                                                | Not done; Task L1 says why, and re-planning is needed before it starts                                                                                                                          |
| AirNow or Open-Meteo as the AQI source (decision 4 (B), (C))                                                                                                                     | Not taken; S2's options table keeps what each would need                                                                                                                                        |
| Making "Secret scan" a required check                                                                                                                                            | The owner, in branch protection, after Task G merges                                                                                                                                            |
| The exercise side of recommendation matching (`scoreExercise` matching our keywords inside wger's names)                                                                         | Deliberately a substring match: "squat" must find "Squats" (Task C2)                                                                                                                            |
| A goal stored as free text through `/api/generate`                                                                                                                               | Still accepted (`generatePlanBodySchema.goal`, any 120 characters); C2 only makes `detectTrack` read it by whole words. Restricting the field to `allowedGoalValues` is a separate API decision |
| Weather's `GEO_NOT_AVAILABLE` message ("Unable to refresh weather. Showing the last update." over a cached reading, where air says "Location is not available in this browser.") | Unchanged by C1, which only classifies it; the two messages differing is cosmetic and was not asked                                                                                             |
| The page declarations L1's inventory classifies as "would change"                                                                                                                | Each is an owner question raised in L1's PR, not a silent change                                                                                                                                |

## What was checked, and what was not

**Checked during planning (read-only), on `main` at `62f8d80`:** every quoted line of code; that the glance cards already say "Couldn't check" / "Not checked yet" (`2350e01`) and that CLAUDE.md's entry predates it; every state reaching those cards; today's answers of all three keyword matchers for every input C2 lists, and a draft of the whole-word versions (Node imports of the real modules); that goal text is closed in the UI and open through the generate API; that `injuryOptions` includes "Lower back"; the air route's two OpenAQ calls and the instant reading; OpenAQ's `/v3/sensors/{id}/hours` endpoint and fields, Open-Meteo's `us_aqi` averaging and grid, and that AirNow's current-observations endpoint takes latitude and longitude (public docs, 2026-10-24); the CI workflow's pinning style and Dependabot's actions group; GitHub secret scanning and push protection **enabled**, non-provider patterns **disabled** (live `gh api`); `main`'s branch protection (force-push disabled, six required checks); that no secret-bearing file or provider-format key is in any of the 936 commits, and the list of credential-shaped fixtures in the tree; `gitleaks-action`'s current major (`v3`) and that it needs no licence for a user account (its README); the CORS policy, its one consumer, the middleware order, `trust proxy` 1, the production preflight, and the two workarounds (E2E and the container job); Render's `RENDER_EXTERNAL_URL` (its docs); the CSS survey's counts, the import order that puts `base.css` last, and the documented ties.

**Not checked:** which strings gitleaks actually reports (Task G Step 1 runs it); `gitleaks-action@v3`'s per-event scan ranges and the exact environment variable names at that tag (Step 1 reads its source); whether its log or summary prints a raw value (Step 4's planted-secret run); AirNow's response fields (login-gated); OpenAQ's hourly-data lag and rate limits (Task S2 Step 1 asks the owner for one live request); whether Render forwards `Host` and `X-Forwarded-Proto` unchanged (Task S1's post-merge check); whether Vite 8's CSS `@import` inlining keeps `layer(base)` and the fonts `@import` first (Task L1 Step 3 checks the build); whether any database holds a free-text plan goal; every coverage effect (predicted from the code's shape, measured by each task). Nothing was built, run, captured or mutated against the repository.
