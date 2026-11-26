# Type-checking the pages and the tests, then checkJs on (D1 phase 5 and M4), Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `.js` and `.jsx` file under `client/src` and `server/src`, source and tests, is
type-checked with `checkJs` on and no pragma left, the client reads each server answer through
its named type, and nothing that runs changes.

**Design:** `docs/specs/2026-11-19-pages-tests-and-checkjs-design.md`. Its findings, the
owner's five decisions (one spec for the rest of D1; tests strict but for implicit `any`; M4
reaches both `src` trees only; pragmas first, then the flip; `@types/supertest`) and its
design are not repeated here except where a task needs the exact form.

**Tech Stack:** TypeScript 7.0.2 over JSDoc, React 19, Vite, Vitest with v8 coverage and
Testing Library, Express 5.3, Prisma 7.10, supertest 7.3, acorn with acorn-jsx, Playwright,
gh CLI.

**Status: done 2026-11-26** (#433 to #457, all live; main `0f74ef6`). Every file, line and
count below was read or measured on `6ea2274`. Every `.js` and `.jsx` file under
`client/src` and `server/src` is checked with `checkJs` on and no pragma left (M4, #457). Each
annotation PR's syntax trees matched `main`'s, its client build was byte-identical and its
test counts and coverage matched, so there was no floor PR. These are the places the work
departs from the text below.

- **#434, outside the plan.** A new advisory on `effect` (under the Prisma CLI) failed every
  PR's audit, so a root `overrides` pins a patched release, and the withdrawn picomatch
  allowlist entry was dropped (the owner's choice).
- **#435, the reads.** `LogSavedResponse` is a union, not a `@template`; `sendLog` returns a
  discriminated union; `planSwaps.js` and `strava.js`'s `send` return `Promise<unknown>`,
  each export casting what it reads.
- **#436, a page.** `AuthPage`'s `rows="3"` became `rows={3}` with a test for it (the owner's
  choice), the one string-valued numeric attribute in the client.
- **Tests, more than the plan's PRs.** The plan's PRs 8 to 12 became 14: #441, #442, #447
  and #448 for the server tests, #449 and #450 for Task 11, and #451, #454, #455 and #456
  for Task 12, which measured over 450 errors and was split by folder. Between them came
  guards and practices the owner decided on 2026-11-23 to 2026-11-25:
  - #443 types each uninitialized `let` in a test, and #446 each named helper's parameters,
    each held by a repo-invariant test;
  - #445 gives the tests real silent loggers;
  - #452 checks stub services and partial deps with `@satisfies`, and #453 builds the
    external services from real deps (`toPositiveInt` moved from `index.js` to
    `dashboardDataBuildersService.js` for it).
- **#444, a defect.** `SummaryView` stopped being passed two update times it never shows.
- **Fixtures fixed in passing (F)**, each listed in its PR: the external retry test's cache
  fake, a missing `.js` import, the `"meal log"` and route-segment log types, and a stale
  `personal` prop in three page tests.
- **Found, not changed:** `HomePageProps["user"]` drops `null`; `DashboardAtAGlanceProps`
  requires two retry handlers the component treats as optional; the integration test's
  pre-B1 workout form and the week chapter's numeric outline offsets are stale fixtures.
- **#457, M4.** 409 files, not 408: the extra one is #453's helper. The `let` and helper
  guards, which postdate the plan, now read every test file; the config guard keeps the
  source configs' `exclude` check.

---

## Conventions

- One PR at a time, each on a new branch from current `origin/main`. Report after each, and
  merge only on the owner's OK, with a standalone `gh pr merge N --merge`, then watch main's
  CI and Deploy until "Live: the new instance reported ready".
- No PR edits a floor line. None is expected to move a figure; if one does, stop and report.
- Commits end with `Co-Authored-By: claude-flow <ruv@ruv.net>`. PR bodies end with
  `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.
- Every command starts with `cd "D:/ai-workout"`, uppercase drive. Never `cd` into a
  workspace or `src`: run `npm -w client …`, `npm -w server …`, or `npx tsc -p client/…`.
  Scratch files go in the session scratchpad, under `d1p5/` and `tools/`.
- **Gates before each PR:** `npm test`, `npm run lint`, `npm run typecheck`,
  `npm run format:check`, `npm run knip`, `npm run build`, `npm run test:scripts`. Postgres
  on 55432 first (`npm run postgres:local:start -w server`; if it does not return, check that
  55432 is LISTENING and carry on).
- **Measure before each PR.** Typing one area changes what the next reports. On the PR's base,
  add the PR's pragmas on a scratch branch, count each workspace's errors, and discard the
  branch. A PR whose count is past about 450 splits in two, each half with its own baseline.
  The counts in the tables are from `6ea2274`, every file checked at once.
- **The no-runtime-change check**, run on `main` before the PR's first edit, saved under
  `d1p5/prN-before/`, and again on the finished branch:
  1. **The syntax trees.** `node <scratchpad>/tools/ast-compare.mjs origin/main` prints
     `SAME` for every changed `.js` and `.jsx` file under both `src` trees and exits 0. Then
     `--control <one changed file>` must exit 1. The tool is below.
  2. **The client build**, `npm -w client run build`, then
     `node <scratchpad>/tools/dist-hash.mjs > d1p5/prN-before/dist.txt`. The branch's list must
     be identical (the build is deterministic, phase 3 found).
  3. **Each suite and its coverage.** With the client build on disk:
     `npm -w client run test:coverage -- --coverage.reporter=json-summary --coverage.reporter=text-summary`
     and the same for `server`. Keep each run's `Tests` line and the `total` block of
     `<side>/coverage/coverage-summary.json`. Counts and the covered and total statements,
     branches and functions must match. Lines may move by the lines Prettier splits or joins
     around an annotation; account for each such move per file in the PR, and treat any other
     change as a failure.
- **Mutations** are written to a JSON file with the Write tool and run by the scratchpad's
  `tools/mutate-types.mjs`, which confirms each applied and restores the file byte for byte.
  A type mutation uses `"suites": { "typecheck": ["client"] }` (or `["server"]`); KILLED
  means the typecheck failed. Each PR's list ends with **one control**: the same kind of
  mutation in a file the PR leaves unchecked, which must SURVIVE.
- **Each file's own errors:** after adding a pragma, `npm run typecheck -w <side>` lists them.
  A file checked beside unchecked neighbours can report fewer than the table.

### The syntax-tree tool

Replace `<scratchpad>/tools/ast-compare.mjs` with this, which reads both workspaces and JSX:

```js
// Compares each changed .js and .jsx file under client/src and server/src with its
// copy on a base ref as syntax trees, positions, raw text and comments dropped, so a
// JSDoc cast's parentheses vanish. Exits 1 if any differ. `--control <file>` flips
// that file's first `===` in memory first, so a run that still says SAME is broken.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const REPO = "D:/ai-workout";
const require = createRequire(`${REPO}/package.json`);
const Parser = require("acorn").Parser.extend(require("acorn-jsx")());
const args = process.argv.slice(2);
const controlAt = args.indexOf("--control");
const control = controlAt === -1 ? null : args[controlAt + 1];
const base = args.find((arg, i) => !arg.startsWith("--") && i !== controlAt + 1) || "origin/main";
const git = (...gitArgs) =>
  execFileSync("git", gitArgs, { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 28 });

const files = git("diff", "--name-only", "--diff-filter=M", base, "--", "client/src", "server/src")
  .split("\n")
  .filter((file) => /\.jsx?$/.test(file));
if (control && !files.includes(control)) {
  console.error(`control ${control} is not a changed file`);
  process.exit(2);
}
const tree = (text) =>
  JSON.stringify(
    Parser.parse(text, { ecmaVersion: "latest", sourceType: "module" }),
    (key, value) =>
      key === "start" || key === "end" || key === "raw"
        ? undefined
        : typeof value === "bigint"
          ? `${value}n`
          : value
  );

let differ = 0;
for (const file of files) {
  let now = readFileSync(path.join(REPO, file), "utf8");
  if (file === control) now = now.replace("===", "!==");
  const same = tree(git("show", `${base}:${file}`)) === tree(now);
  if (!same) differ += 1;
  console.log(`${same ? "SAME  " : "DIFFER"} ${file}`);
}
console.log(`${files.length} files, ${differ} differ`);
process.exit(differ ? 1 : 0);
```

`acorn` and `acorn-jsx` (5.3.2) are at the repository root's `node_modules`, through ESLint's
espree. If `createRequire` cannot find either, stop and report rather than installing it.
JSX text keeps its whitespace in the tree (`JSXText.value`), so a Prettier rewrap inside JSX
shows as DIFFER: account for each such file by hand, from the diff, in the PR.

### The build-hash tool

`<scratchpad>/tools/dist-hash.mjs`:

```js
// Prints the sha256 of every file under client/dist, one per line, sorted by path,
// so two builds compare with a plain diff.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIST = "D:/ai-workout/client/dist";
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  );
for (const file of walk(DIST).sort()) {
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  console.log(`${hash}  ${path.relative(DIST, file).replaceAll("\\", "/")}`);
}
```

## Recurring patterns

Phase 3's patterns A (a parameter's `@param`), B (state that starts empty), C (a caught
error), D (props), E (a ref) and F (a real defect), in
`docs/plans/2026-11-16-client-data-layer-types.md`, and phase 4's G to M, in
`docs/plans/2026-11-17-server-source-types.md`, hold as written, with the owner's catch rule:
an error read once is cast in place; one read more than once is
`catch (/** @type {any} */ err)`, each with a comment naming what throws. Never add a
variable to hold a cast. No `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` anywhere. This
phase adds these.

**N. An answer read** (spec, "Response types in the client"). The `.json()` that holds the
answer is cast in place through `Wire`:

```js
const data = /** @type {Wire<SignedInResponse>} */ (await res.json());
```

with `Wire` and the response named at the top of the file:

```js
/**
 * @template T
 * @typedef {import("./network.js").Wire<T>} Wire
 */
/** @typedef {import("../../../server/src/routes/authRoutes.js").SignedInResponse} SignedInResponse */
```

If the generic typedef form above does not resolve in TypeScript 7.0.2, write
`import("./network.js").Wire<SignedInResponse>` in the cast itself; probe it once in Task 2
and use one form throughout.

**O. An error read.** The `.json()` in a `!res.ok` branch:

```js
const payload = /** @type {ErrorBody} */ (await res.json().catch(() => ({})));
```

A read that holds either (one `.json()` before the `ok` check, as `send` in `planSwaps.js`
and `strava.js` and the answer in `useProgression.js` do) is cast to `ErrorBody` in the
helper; the helper's caller casts what it returns, `/** @type {Wire<PlanSwappedResponse>} */
(await send(…))`. One that names a single route is cast to `Wire<XResponse> & ErrorBody`.

**P. A test fixture.** A literal passed where the code takes a typed value is declared with
that type, `/** @type {Dashboard} */ const dashboard = { … };`, which is not a cast and needs
no comment. One that is deliberately partial is cast in place,
`/** @type {Dashboard} */ ({ workouts: [] })`, under one comment per file:
"each fixture here holds only the fields the test reads". A fixture whose fields contradict
the type (a string where the type has a number) is not cast: it is either a test of bad input,
which then says so and casts through `unknown`, or F.

**Q. A DOM query in a test.** `container.querySelector(…)` is `Element | null`. Cast it in
place to the element the test expects, `/** @type {HTMLInputElement} */
(container.querySelector("input"))`, under one comment per file: "the test fails at once if
an element is missing". Testing Library's `getBy…` already returns an `HTMLElement`; cast only
where an element-specific field is read (`value`, `checked`).

**R. A mock.** A `vi.fn()` passed where a typed function is expected is declared with that
type, `/** @type {import("vitest").Mock<ApiFetch>} */ const apiFetch = vi.fn();`. Its
callback's parameters may stay untyped (decision 2). A spy on a module export,
`vi.spyOn(module, "name")`, needs nothing.

## Shared types

| Typedef               | Declared in                                        | Shape                                                                                      |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `NotWireSafe<T, D>`   | `client/src/app/network.js`                        | the dotted path of the first `any`, `Date` or `Decimal` field in `T`, or `never` (Task 2c) |
| `Wire<T>`             | `client/src/app/network.js`                        | `T` when `NotWireSafe<T>` is `never`, else `{ notWireSafe: NotWireSafe<T> }`               |
| `ErrorBody`           | `server/src/services/http/errorResponseService.js` | `{ error?: string, requestId?: string }`                                                   |
| `Dashboard`           | `client/src/app/dashboard.js`                      | `DashboardResponse["dashboard"]`, replacing `any`                                          |
| `DashboardPagination` | `client/src/app/dashboard.js`                      | `DashboardResponse["pagination"]`                                                          |
| `<Name>Response`      | the server route file that sends it (phase 4)      | named where read, pattern N                                                                |
| `UnknownList`         | (none)                                             | `toJsonArray` returns `unknown[]` (Task 2d)                                                |

## The client's reads

Every `.json()` under `client/src`, tests excluded, on `6ea2274`, with what it is cast to.
"either" is pattern O's combined read.

| File                                        |    Line | Route                                    | Cast                                                               |
| ------------------------------------------- | ------: | ---------------------------------------- | ------------------------------------------------------------------ |
| `app/events.js`                             |     281 | `POST /api/generate`                     | `ErrorBody`                                                        |
| `app/events.js`                             |     285 | `POST /api/generate`                     | `Wire<GenerateResponse>`                                           |
| `app/events.js`                             |     422 | `POST /api/auth/signup`                  | `ErrorBody`                                                        |
| `app/events.js`                             |     425 | `POST /api/auth/signup`                  | `Wire<SignupResponse>`                                             |
| `app/events.js`                             |     442 | `POST /api/auth/login`                   | `ErrorBody`                                                        |
| `app/events.js`                             |     445 | `POST /api/auth/login`                   | `Wire<LoginResponse>`                                              |
| `app/events.js`                             |     694 | `POST /api/dashboard/goals`              | `ErrorBody`                                                        |
| `app/events.js`                             |     697 | `POST /api/dashboard/goals`              | `Wire<GoalsSavedResponse>`                                         |
| `app/events.js`                             |     730 | `POST /api/profile`                      | `ErrorBody`                                                        |
| `app/events.js`                             |     733 | `POST /api/profile`                      | `Wire<ProfileSavedResponse>`                                       |
| `app/events.js`                             |     766 | `POST /api/auth/password`                | `ErrorBody`                                                        |
| `app/events.js`                             |     793 | `DELETE /api/auth/me`                    | `ErrorBody`                                                        |
| `app/events.js`                             |     899 | `POST /api/dashboard/progress-metrics`   | `ErrorBody`                                                        |
| `app/events.js`                             |     902 | `POST /api/dashboard/progress-metrics`   | `Wire<ProgressMetricSavedResponse>`                                |
| `app/events.js`                             |     928 | `POST /api/dashboard/saved-exercises`    | `ErrorBody`                                                        |
| `app/events.js`                             |     931 | `POST /api/dashboard/saved-exercises`    | `Wire<SavedExerciseSavedResponse>`                                 |
| `app/events.js`                             |     955 | `DELETE …/saved-exercises/:id`           | `ErrorBody`                                                        |
| `app/events.js`                             |     958 | `DELETE …/saved-exercises/:id`           | `Wire<SavedExerciseRemovedResponse>`                               |
| `app/events.js`                             |     985 | `DELETE /api/dashboard/workouts/:id`     | `ErrorBody`                                                        |
| `app/events.js`                             |     988 | `DELETE /api/dashboard/workouts/:id`     | `Wire<WorkoutDeletedResponse>`                                     |
| `app/events.js`                             |     118 | (a comment)                              | the note "every `res.json()` below reads one as any" is removed    |
| `app/sendLog.js`                            |      34 | the three logs `sendLog` posts           | `@template T`, the read `Promise<Wire<T>>`; callers name T (2e)    |
| `app/sendLog.js`                            |      35 | the same                                 | `ErrorBody`                                                        |
| `app/hooks/useDashboardData.js`             |     176 | `GET /api/weather/recommendation`        | `ErrorBody`                                                        |
| `app/hooks/useDashboardData.js`             |     179 | the same                                 | `Wire<WeatherRecommendationResponse>`                              |
| `app/hooks/useDashboardData.js`             |     245 | `GET /api/air-quality/current`           | `ErrorBody`                                                        |
| `app/hooks/useDashboardData.js`             |     248 | the same                                 | `Wire<AirQualityResponse>`                                         |
| `app/hooks/useDashboardData.js`             |     370 | `GET /api/dashboard`                     | `ErrorBody`                                                        |
| `app/hooks/useDashboardData.js`             |     373 | the same                                 | `Wire<DashboardResponse>`                                          |
| `app/hooks/useApiClient.js`                 |      54 | `GET /api/csrf-token`                    | `Wire<CsrfTokenResponse>`, read after `ok` with a `.catch`         |
| `app/planSwaps.js`                          |      36 | `/api/dashboard/plans/:planId/swaps`     | either: `ErrorBody` in `send`, callers cast its result             |
| `app/strava.js`                             |      27 | `/api/integrations/strava` and its verbs | either: `ErrorBody` in `send`, callers cast its result             |
| `App.jsx`                                   |     541 | `GET /api/auth/me`                       | `Wire<AuthMeResponse>`                                             |
| `pages/dashboard/hooks/useOlderLogPages.js` |      45 | `GET …/meal-logs`, `…/progress-metrics`  | `Wire<MealLogsResponse> \| Wire<ProgressMetricsResponse>` (Task 7) |
| `pages/dashboard/hooks/useProgression.js`   |      49 | `GET /api/dashboard/progression`         | `Wire<ProgressionResponse>` (Task 7)                               |
| `pages/dashboard/hooks/useProgression.js`   |      79 | `PUT`/`DELETE` lift and week             | `Wire<ProgressionAnsweredResponse> & ErrorBody` (Task 7)           |
| `pages/dashboard/meal/useMealDbSearch.js`   | 58, 127 | `GET /api/mealdb/search`                 | `Wire<MealDbSearchResponse>` (Task 7)                              |
| `pages/dashboard/views/TipsView.jsx`        |      97 | `GET /api/wger/meta`                     | `Wire<WgerMetaResponse>` (Task 6)                                  |
| `pages/dashboard/views/TipsView.jsx`        |     145 | `GET /api/wger/exercises`                | `Wire<WgerExercisesResponse>` (Task 6)                             |

Line numbers move as files change; find each read by its route. The page reads are cast in the
PR that checks their file.

## Files

| File                                                            | Change                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `client/tsconfig.json`                                          | `include` gains `express.d.ts` (Task 2); `exclude` the tests (Task 8); `checkJs` (M4) |
| `client/tsconfig.test.json`, `server/tsconfig.test.json`        | new (Task 8)                                                                          |
| `server/tsconfig.json`                                          | `exclude` the tests (Task 8); `checkJs` (M4)                                          |
| `client/package.json`, `server/package.json`                    | `typecheck` runs both programs (Task 8); `@types/supertest` (server, Task 8)          |
| `client/src/app/network.js`                                     | `NotWireSafe` and `Wire` (Task 2)                                                     |
| `client/src/app/dashboard.js`, `events.js`, `sendLog.js`, …     | the reads, per the table (Task 2)                                                     |
| `server/src/services/http/errorResponseService.js`              | `ErrorBody` (Task 2)                                                                  |
| `server/src/services/dashboard/dashboardDataBuildersService.js` | `StoredDashboard`'s lists (Task 2)                                                    |
| `server/src/repositories/rowValues.js` and its callers          | `toJsonArray` returns `unknown[]` (Task 2)                                            |
| `server/src/services/integrations/stravaService.js`             | `connections` and `imports` typed (Task 2)                                            |
| 82 files in `client/src/pages`                                  | `// @ts-check` and JSDoc (Tasks 3 to 7)                                               |
| 21 places in three server files                                 | a declaration's type (Task 8)                                                         |
| 206 test files                                                  | `// @ts-check` and JSDoc (Tasks 8 to 12)                                              |
| 408 files                                                       | the pragma removed (Task 13)                                                          |
| `scripts/__tests__/repo-invariants.test.mjs`                    | the reads rule, the pages and tests guards, the test configs, then M4's one guard     |
| `CLAUDE.md`, `docs/code-readability-sop.md`                     | M4's rewrite (Task 13)                                                                |
| `docs/adr/0017-type-checking-through-jsdoc.md`                  | phase 5 and M4 (Task 14)                                                              |

---

## Task 1: Spec and plan (PR 1, `docs/d1p5-spec-plan`)

- [ ] The spec is committed on the branch. Add this plan, and list both in `docs/README.md`
      under Plans and Specs, after phase 4's entries, as
      `[2026-11-19 — Type-checking the pages and the tests, then checkJs on, D1 phase 5 and M4](...)`.
- [ ] `npx prettier --check` on the three files, `npm run test:scripts`.
- [ ] Commit, push, open the PR, report, wait for the OK, merge, watch Deploy.

## Task 2: Response types in the client (PR 2, `feat/d1p5-responses`)

### 2a. Baseline

- [ ] On `main`: the no-runtime-change check (build hashes, both suites and coverage), saved
      under `d1p5/pr2-before/`.

### 2b. The client program reads the Request fields

- [ ] In `client/tsconfig.json`, `"include": ["src"]` becomes
      `"include": ["src", "../server/src/types/express.d.ts"]`, and the header comment gains
      one sentence: "It also loads the server's `Request` fields, for the route modules a
      client JSDoc type names."
- [ ] `npm run typecheck`. Expected: exit 0, unchanged (no client file names a route module
      yet).

### 2c. `Wire` and `ErrorBody`

- [ ] In `client/src/app/network.js`, below `ApiFetch`:

```js
/**
 * The first field of `T` that JSON would not deliver as typed, as a dotted path
 * ("dashboard.calories.any"): an `any`, a `Date`, which arrives as a string, or a
 * Prisma `Decimal`. `never` when there is none. `D` counts the depth, so a type
 * that refers to itself stops.
 * @template T
 * @template {unknown[]} [D=[]]
 * @typedef {D["length"] extends 8 ? never : 0 extends (1 & T) ? "any" : T extends Date ? "Date" : T extends { toDecimalPlaces: Function } ? "Decimal" : T extends readonly (infer U)[] ? NotWireSafe<U, [...D, 0]> : T extends Function ? never : T extends object ? { [K in keyof T]-?: NotWireSafe<T[K], [...D, 0]> extends never ? never : `${K & string}.${NotWireSafe<T[K], [...D, 0]> & string}` }[keyof T] : never} NotWireSafe
 */

/**
 * A server answer's type as the client may trust it: `T` when every field arrives
 * as typed, else an object whose one field names the field that would not, so a
 * read through it fails the typecheck. Each `.json()` answer is cast through it.
 * @template T
 * @typedef {[NotWireSafe<T>] extends [never] ? T : { notWireSafe: NotWireSafe<T> }} Wire
 */
```

- [ ] In `server/src/services/http/errorResponseService.js`, below its imports:

```js
/**
 * What the server answers a failed request with: the message, and on a 5xx the
 * request's id for the logs. The client reads it from a `!res.ok` answer, which
 * may also be no JSON at all, so both fields are optional.
 * @typedef {{ error?: string, requestId?: string }} ErrorBody
 */
```

- [ ] Probe pattern N's generic import form (a `@template T` typedef of
      `import("./network.js").Wire<T>`) in `events.js`; if TypeScript rejects it, use the inline form. Record the
      form chosen in the PR.

### 2d. The server's `any`s, type only

Run the probe first, in a throwaway checked file `client/src/zz-wire-probe.js` (header,
pragma, one `/** @type {NotWireSafe<X>} */ export const x = 1;` per response): the errors list
each offending path. Expected on `6ea2274`: 12 of 31, from the three roots below. Delete the
file after, and after each root's fix re-run it.

- [ ] **`StoredDashboard`'s lists** (`dashboardDataBuildersService.js`). Each of `workouts`,
      `workoutSessions`, `calories`, `mealLogs`, `progressMetrics`, `plans` and
      `savedExercises` becomes the list `mapUser` builds:

```js
/** @typedef {NonNullable<ReturnType<typeof import("../../repositories/userReadRepository.js").mapUser>>["dashboard"]} MappedDashboard */

/**
 * The dashboard as an account row stores it: the lists mapUser loads, each
 * optional, and the goals as saved.
 * @typedef {object} StoredDashboard
 * @property {MappedDashboard["workouts"]} [workouts]
 * @property {MappedDashboard["workoutSessions"]} [workoutSessions]
 * @property {MappedDashboard["calories"]} [calories]
 * @property {MappedDashboard["mealLogs"]} [mealLogs]
 * @property {MappedDashboard["progressMetrics"]} [progressMetrics]
 * @property {MappedDashboard["plans"]} [plans]
 * @property {MappedDashboard["savedExercises"]} [savedExercises]
 * @property {{ targetWeight?: unknown, targetCalories?: unknown, weeklyWorkouts?: unknown }} [goals]
 */
```

      If `buildDashboard(user?.dashboard)` in `dashboardCollectionService.js` then fails
      because `AuthUser`'s dashboard is typed differently, read what `mapDbDocToUser` puts
      there: if it is the same lists, type it the same; if it is not, F.

- [ ] **`toJsonArray`** (`repositories/rowValues.js`) gets `@returns {unknown[]}`, so a JSON
      column no longer reads as `any`. Then `npm run typecheck -w server` lists each of its
      16 callers that relied on an element type. Each casts its result in place:
  - a relation list in `mapUser` (`related.calorieEntries` and the rest) to the Prisma rows
    `UserRelations` names, one comment in the file: "related holds the rows Prisma loaded,
    or nothing";
  - a JSON list column (a plan's `equipment` and `focuses`, a saved exercise's `muscles` and
    `equipment`, a workout's `exercises`) to the type the builder that writes it returns,
    read from `dashboardDataBuildersService.js`, one comment per file: "the column holds the
    list its builder wrote".
- [ ] **`stravaService`'s deps** (`services/integrations/stravaService.js`): `connections` is
      `ReturnType<typeof import("../../repositories/stravaConnectionRepository.js").createStravaConnectionRepository>`
      and `imports` the import repository's, in place of `any`. What that surfaces is typed
      or, if a call is wrong, F.
- [ ] The probe reports `never` for every response. Delete it; `git status` is clean of it.

### 2e. The reads

- [ ] `app/dashboard.js`: `@typedef {any} Dashboard` becomes
      `@typedef {import("../../../server/src/routes/dashboard/registerDashboardReadRoutes.js").DashboardResponse["dashboard"]} Dashboard`,
      its comment "The dashboard the server answers with, as `GET /api/dashboard` sends it.",
      and `DashboardPagination` beside it.
- [ ] Each read in the table's non-page rows, cast per its row (patterns N and O).
- [ ] `sendLog.js`: `@template T`, `@returns {Promise<{ data?: Wire<T>, error?: SendError }>}`;
      each caller in `events.js` names its answer where it reads `data`.
- [ ] `npm run typecheck`. What fails now is the client reading the server's real types:
      a field the client reads under another name, or reads as a type it is not, is F; a
      read the types cannot follow (a union) is narrowed by the code already or cast with its
      reason.

### 2f. The reads rule, test-first

- [ ] Add to `describe("type-checked files")`:

```js
// D1 phase 5: each answer the client reads is cast in place, the answer through
// Wire (which fails the typecheck on a field JSON would not deliver as typed) and
// an error to ErrorBody (docs/specs/2026-11-19-pages-tests-and-checkjs-design.md).
// The page reads are cast as each page is checked (Tasks 6 and 7); Task 7 empties this.
const UNCAST_PAGE_READS = [
  "client/src/pages/dashboard/hooks/useOlderLogPages.js",
  "client/src/pages/dashboard/hooks/useProgression.js",
  "client/src/pages/dashboard/meal/useMealDbSearch.js",
  "client/src/pages/dashboard/views/TipsView.jsx"
];

test("every .json() read in the client is cast", () => {
  const reads = sources
    .filter(({ file }) => file.startsWith("client/src/") && !isTest(file))
    .flatMap(({ file, lines }) => {
      const text = lines.join("\n");
      return [...text.matchAll(/\.json\(\)/g)].map((match) => {
        const before = text.slice(Math.max(0, match.index - 240), match.index);
        const cast = before.slice(before.lastIndexOf(";") + 1).match(/@type \{([^}]*)\}/);
        return { file, cast: cast?.[1] ?? null };
      });
    });
  expect(reads.length, "the sweep found too few reads").toBeGreaterThanOrEqual(35);
  const bad = reads
    .filter(({ file }) => !UNCAST_PAGE_READS.includes(file))
    .filter(({ cast }) => !cast || !(cast === "ErrorBody" || cast.includes("Wire<")))
    .map(({ file, cast }) => `${file}: ${cast ?? "no cast"}`);
  expect(bad, "cast each answer to Wire<XResponse> and each error to ErrorBody").toEqual([]);
});
```

- [ ] Run it before 2e is finished: FAIL, listing the reads not yet cast (and `events.js`'s
      comment that mentions `res.json()`, until 2e removes it). Then PASS. On `6ea2274` there
      are 39 reads, 7 of them in the four page files, which Tasks 6 and 7 cast and take out of
      `UNCAST_PAGE_READS`; Task 7 removes the array.

### 2g. Prove and ship

- [ ] Mutations: a misspelled field read through each answer cast in `events.js` (one),
      `useDashboardData.js` (one), `App.jsx`, `sendLog.js`'s caller; a `Date` field added to
      `MealLogsResponse` (the reads rule's typecheck must fail through `Wire`); a
      `/** @type {any} */` field in `StoredDashboard`; a cast written without `Wire<` (the
      `scripts` suite); and the control, a misspelled read in an unchecked page file.
      Expected: all KILLED but the control.
- [ ] The no-runtime-change check against `pr2-before/`; the gates; `npm run test:e2e`; ship.

## Tasks 3 to 7: the pages

Each: baseline as `d1p5/prN-before/`; measure (Conventions); add `// @ts-check` below each
file's header (the scratchpad's `tools/add-ts-check.mjs`); `npm run typecheck -w client`
after each file, exit 0 before the next; raise `TYPE_CHECKED_FILES` (stage new files first,
as the test counts tracked files); mutations, one wrong value in each file plus the control;
the no-runtime-change check; the gates; ship.

Props follow pattern D: up to three typed inline, more in a `<Name>Props` typedef beside the
component. A page reads the server's types through `Dashboard`, the `<Name>Response`s and the
phase 2 body types, never a copy of their fields. A prop passed down from `DashboardPage`
names the type of what `DashboardPage` receives from `App.jsx`
(`Parameters<typeof DashboardPage>[0]["x"]` or the typedef `App.jsx` already builds).

### Task 3: `auth/`, `workout/`, `workout-result/` (PR 3, `feat/d1p5-pages-session`)

| File                                    | Errors |
| --------------------------------------- | -----: |
| `auth/AuthPage.jsx`                     |     27 |
| `workout/SessionPage.jsx`               |     28 |
| `workout/clockText.js`                  |      2 |
| `workout/restAlert.js`                  |      2 |
| `workout/components/DiscardConfirm.jsx` |      3 |
| `workout/components/ElapsedTime.jsx`    |      1 |
| `workout/components/ExerciseList.jsx`   |      8 |
| `workout/components/RestTimer.jsx`      |      4 |
| `workout/components/SessionSignIn.jsx`  |      1 |
| `workout/components/SetPanel.jsx`       |      9 |
| `workout/hooks/useNow.js`               |      1 |
| `workout/hooks/useRestTimer.js`         |      2 |
| `workout/hooks/useSessionState.js`      |      3 |
| `workout/hooks/useWakeLock.js`          |      2 |
| `workout-result/WorkoutResultPage.jsx`  |     23 |

- [ ] `TYPE_CHECKED_FILES` 120 to 135. Control: a wrong value in an unchecked `home/` file.

### Task 4: `home/` top level, `hooks/`, `components/` (PR 4, `feat/d1p5-pages-home`)

| File                                          | Errors |
| --------------------------------------------- | -----: |
| `home/HomePage.jsx`                           |     27 |
| `home/hooks/useBodyModel.js`                  |     18 |
| `home/hooks/useHomeStageFlow.js`              |     45 |
| `home/components/HomeIntroStage.jsx`          |      7 |
| `home/components/HomePersonalStage.jsx`       |     29 |
| `home/components/HomeVisualizerStage.jsx`     |      8 |
| `home/components/HomeWorkoutMeasure.jsx`      |      5 |
| `home/components/HomeWorkoutStage.jsx`        |     10 |
| `home/components/PhysiqueSilhouette2D.jsx`    |      2 |
| `home/components/physique/geometry.js`        |     64 |
| `home/components/physique/guideLayout.js`     |     47 |
| `home/components/physique/outlineGeometry.js` |    107 |
| `home/components/physique/outlineUtils.js`    |     29 |
| `home/components/physique/palette.js`         |      2 |
| `home/components/physique/templateOutline.js` |     44 |

- [ ] The geometry files take points and outlines: declare `Point` (`{ x: number, y: number }`)
      and the outline types once, in `physique/math.js` (checked already) or the module that
      builds them, and import them elsewhere.
- [ ] If the measured count is past 450, split: `physique/` first (PR 4a), the rest second.
- [ ] `TYPE_CHECKED_FILES` 135 to 150. Control: a wrong value in an unchecked `preview/` file.

### Task 5: `home/preview/` (PR 5, `feat/d1p5-pages-preview`)

| File                                                    | Errors |
| ------------------------------------------------------- | -----: |
| `home/preview/PreviewStage.jsx`                         |     15 |
| `home/preview/constants.js`                             |      0 |
| `home/preview/utils.js`                                 |     10 |
| `home/preview/components/PreviewDashboardChapter.jsx`   |     10 |
| `home/preview/components/PreviewPersonalChapter.jsx`    |      8 |
| `home/preview/components/PreviewToc.jsx`                |      8 |
| `home/preview/components/PreviewWorkoutWeekChapter.jsx` |     23 |
| `home/preview/hooks/usePreviewChapterFlow.js`           |     31 |
| `home/preview/hooks/usePreviewDerivedData.js`           |     17 |
| `home/preview/hooks/usePreviewWeekOutline.js`           |     13 |
| `home/preview/hooks/usePreviewWeekParticleAnimation.js` |     90 |

- [ ] The particle animation's canvas and `requestAnimationFrame` handles are state that
      starts empty (B and E): declare each at its first value.
- [ ] `TYPE_CHECKED_FILES` 150 to 161. Control: a wrong value in an unchecked `dashboard/` file.

### Task 6: `dashboard/views/`, `dashboard/components/` (PR 6, `feat/d1p5-pages-views`)

| File                                             | Errors |
| ------------------------------------------------ | -----: |
| `dashboard/views/CaloriesView.jsx`               |     29 |
| `dashboard/views/DashboardHomeView.jsx`          |      1 |
| `dashboard/views/MealView.jsx`                   |     14 |
| `dashboard/views/PlansView.jsx`                  |     45 |
| `dashboard/views/SettingsView.jsx`               |     13 |
| `dashboard/views/SummaryView.jsx`                |     53 |
| `dashboard/views/TipsView.jsx`                   |     31 |
| `dashboard/views/WorkoutsView.jsx`               |     32 |
| `dashboard/components/DashboardAtAGlance.jsx`    |     20 |
| `dashboard/components/DashboardBottomNav.jsx`    |      2 |
| `dashboard/components/DashboardDrawer.jsx`       |      7 |
| `dashboard/components/DashboardHeader.jsx`       |      9 |
| `dashboard/components/DashboardWorkoutModal.jsx` |     14 |
| `dashboard/components/ExerciseCard.jsx`          |     15 |
| `dashboard/components/PlanDaySwaps.jsx`          |     10 |
| `dashboard/components/ProgressPanel.jsx`         |     15 |
| `dashboard/components/WeekProgression.jsx`       |     28 |

- [ ] `TipsView.jsx`'s two reads (the reads table), removed from `UNCAST_PAGE_READS`.
- [ ] `TYPE_CHECKED_FILES` 161 to 178. Control: a wrong value in an unchecked
      `dashboard/meal/` file.

### Task 7: the rest of `dashboard/`, and the pages guard (PR 7, `feat/d1p5-pages-dashboard`)

#### 7a. The guard, test-first

```js
// D1 phase 5: the client's pages are checked whole, so a page file added there
// is checked from its first commit (docs/specs/2026-11-19-pages-tests-and-checkjs-design.md).
test("every page file is checked", () => {
  const pages = sources.filter(({ file }) => file.startsWith("client/src/pages/") && !isTest(file));
  expect(pages.length, "the sweep found too few page files").toBeGreaterThanOrEqual(84);
  const unchecked = pages.filter((source) => !checked.includes(source)).map(({ file }) => file);
  expect(unchecked, "add // @ts-check below the header of each").toEqual([]);
});
```

- [ ] `npm run test:scripts`. Expected: FAIL, listing exactly the 24 files below.

#### 7b. Check the last 24

| File                                          | Errors |
| --------------------------------------------- | -----: |
| `dashboard/DashboardPage.jsx`                 |     70 |
| `dashboard/planUtils.js`                      |     25 |
| `dashboard/planWeek.js`                       |      8 |
| `dashboard/wordMatch.js`                      |      2 |
| `dashboard/hooks/useDashboardMetrics.js`      |     47 |
| `dashboard/hooks/useOlderLogPages.js`         |      6 |
| `dashboard/hooks/useProgression.js`           |     11 |
| `dashboard/meal/MealCoursePanel.jsx`          |      4 |
| `dashboard/meal/MealDetailsModal.jsx`         |      7 |
| `dashboard/meal/MealLogPanel.jsx`             |     16 |
| `dashboard/meal/MealSearchPanel.jsx`          |      8 |
| `dashboard/meal/MealSections.jsx`             |      5 |
| `dashboard/meal/useMealDbSearch.js`           |     14 |
| `dashboard/meal/utils.js`                     |     23 |
| `dashboard/meal/data/fallbackImage.js`        |      0 |
| `dashboard/meal/data/index.js`                |      0 |
| `dashboard/meal/data/recommendations.js`      |      0 |
| `dashboard/settings/SettingsAccountPanel.jsx` |      5 |
| `dashboard/settings/SettingsEditForm.jsx`     |     23 |
| `dashboard/settings/SettingsStravaPanel.jsx`  |     17 |
| `dashboard/settings/settingsFields.js`        |      2 |
| `dashboard/tips/ExerciseDetailsModal.jsx`     |      9 |
| `dashboard/tips/ExerciseTile.jsx`             |      7 |
| `dashboard/tips/recommendationUtils.js`       |     36 |

- [ ] The four page reads in the reads table (`useOlderLogPages.js`, `useProgression.js` twice,
      `useMealDbSearch.js` twice); `UNCAST_PAGE_READS` is then empty, and is removed.
- [ ] `TYPE_CHECKED_FILES` 178 to 202. `npm run test:scripts` PASS.

#### 7c. Prove it

- [ ] Guard mutations, with the `scripts` suite: the pragma removed from
      `client/src/pages/dashboard/planWeek.js`; a staged, unchecked
      `client/src/pages/dashboard/d1p5-probe.js` (a header and one export). Both must fail the
      guard; delete the probe after.
- [ ] Type mutations, one per file; the control, a wrong value in a page test file.
- [ ] The no-runtime-change check; the gates; `npm run test:e2e`; ship.

## Task 8: The test programs, then the server's `db/` and `middleware/` tests (PR 8, `feat/d1p5-test-tooling`)

### 8a. Baseline, and `@types/supertest`

- [ ] Baseline as `d1p5/pr8-before/`.
- [ ] Install, no newer than 14 days before the day it runs (2026-11-05 if run on
      2026-11-19):

```bash
cd "D:/ai-workout" && npm install -D -w server @types/supertest@^7.2.1 --before=2026-11-05 --prefer-dedupe
```

- [ ] Check each added version's publish date (`npm view <name>@<v> time --json`), including
      what `@types/supertest` brings (`@types/superagent`, `@types/methods`,
      `@types/cookiejar`), is on or before the `--before` date, and run
      `npx --yes audit-ci@7.1.0 --config security/audit-ci.json`. Expected: exit 0. `npm run
knip`: if it reports the package unused, stop and report rather than adding an ignore.

### 8b. The 21 declarations

The test program checks source under `noImplicitAny: false`, which does not widen a
variable declared `null` or `[]`. Before writing either config, measure the source alone:
`npx tsc -p server/tsconfig.json --noImplicitAny false`. Expected: 21 errors, 17 in
`routes/external/registerAirQualityRoutes.js` (lines 234 to 342), 3 in
`services/external/externalDataService.js` (406, 992, 993), 1 in `routes/generateRoutes.js`
(221).

- [ ] Give each variable behind them its type at the declaration (pattern L):
      `/** @type {StationPick | null} */ let best = null;`, named from the values the code
      assigns it. A declaration's `@type` is not a cast and needs no comment.
- [ ] `npx tsc -p server/tsconfig.json --noImplicitAny false` exits 0, `npm run typecheck`
      exits 0, and the syntax trees of the three files are SAME.
- [ ] The same for the client: `npx tsc -p client/tsconfig.json --noImplicitAny false` exits 0
      (it does on `6ea2274`; Tasks 2 to 7 may change that, and each place is fixed the same way).

### 8c. The configs, test-first

- [ ] Replace the test `%s/tsconfig.json keeps strict on and checkJs off` with:

```js
// The source program keeps strict on, and leaves the tests to their own program
// (docs/specs/2026-11-19-pages-tests-and-checkjs-design.md, decision 2).
test.each(WORKSPACES)("%s/tsconfig.json keeps strict on and checkJs off", (workspace) => {
  const file = path.join(repoRoot, workspace, "tsconfig.json");
  expect(existsSync(file), `${workspace}/tsconfig.json is missing`).toBe(true);
  const config = JSON.parse(stripJsonComments(readFileSync(file, "utf8")));
  expect(config.compilerOptions.strict, "strict is what makes the check worth having").toBe(true);
  expect(config.compilerOptions.checkJs, "files opt in one at a time until milestone M4").toBe(
    false
  );
  expect(config.exclude, "the tests are the test program's").toEqual(
    expect.arrayContaining(["src/**/*.test.js", "src/**/__tests__/**"])
  );
});

// Tests are checked as strictly as source, except that a mock's untyped parameter
// may stay any: the test program differs from the source program by that one option.
test.each(WORKSPACES)(
  "%s/tsconfig.test.json is the source program, implicit any allowed",
  (workspace) => {
    const file = path.join(repoRoot, workspace, "tsconfig.test.json");
    expect(existsSync(file), `${workspace}/tsconfig.test.json is missing`).toBe(true);
    const config = JSON.parse(stripJsonComments(readFileSync(file, "utf8")));
    expect(config.extends).toBe("./tsconfig.json");
    expect(config.compilerOptions).toEqual({ noImplicitAny: false });
    expect(config.exclude, "an inherited exclude would drop every test").toEqual([]);
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, workspace, "package.json"), "utf8"));
    expect(pkg.scripts.typecheck).toBe("tsc -p tsconfig.json && tsc -p tsconfig.test.json");
  }
);
```

- [ ] `npm run test:scripts`. Expected: FAIL on the missing `exclude` and the missing files.
- [ ] `client/tsconfig.json` gains
      `"exclude": ["src/**/*.test.js", "src/**/*.test.jsx", "src/**/__tests__/**", "src/test/**"]`;
      `server/tsconfig.json` gains `"exclude": ["src/**/*.test.js", "src/**/__tests__/**"]`.
      Each header comment gains: "The tests are checked by `tsconfig.test.json`."
- [ ] `client/tsconfig.test.json`:

```jsonc
{
  // The client's test program (roadmap lane D1, decision record 0017): the source
  // program's options with noImplicitAny off, so a mock's untyped parameter is any
  // while every fixture and call is still checked. It checks each source file a test
  // imports under these options too, so source must pass both programs.
  "extends": "./tsconfig.json",
  "compilerOptions": { "noImplicitAny": false },
  "include": [
    "src/**/*.test.js",
    "src/**/*.test.jsx",
    "src/**/__tests__/**",
    "src/test/**",
    "../server/src/types/express.d.ts"
  ],
  "exclude": []
}
```

- [ ] `server/tsconfig.test.json`, the same comment with "server's", and
      `"include": ["src/**/*.test.js", "src/**/__tests__/**", "src/types/**"]`.
- [ ] Each workspace's `package.json`: `"typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.test.json"`.
- [ ] `npm run test:scripts` PASS; `npm run typecheck` exit 0 (no test file has a pragma yet,
      so the test programs check only the source the tests import, which 8b made pass).
- [ ] The guard "every // @ts-check comes before its file's first statement" already sweeps
      test files; confirm it still passes.

### 8d. The server's `db/` and `middleware/` tests

Add the pragma to each test file, run `npm run typecheck -w server`, type what it reports
with patterns P, Q and R. Relaxed counts on `6ea2274`: `db/` 43 (the most in
`db/__tests__/postgres.test.js`, 22), `middleware/` 30, over 8 files.

- [ ] `TYPE_CHECKED_FILES` 202 to 210.
- [ ] Mutations: one wrong value in each test file (a fixture field misspelled, or a typed
      function called with a wrong argument); one through `supertest`'s types where a file
      uses it (`.expect("200")` given a status as the wrong type, if the types reject it, else
      a misspelled method); the control, the same mutation in an unchecked test file.
- [ ] The no-runtime-change check (the test files' trees, and both suites' counts and
      coverage); the gates; ship.

## Task 9: Server tests, `repositories/`, `routes/`, `__tests__/` (PR 9, `feat/d1p5-server-tests-routes`)

Relaxed counts on `6ea2274`: `repositories/` 81 (8 files; `userReadRepository.test.js` 43,
`workoutSessionRepository.test.js` 18), `routes/` 165 (25 files; `airQualityRoutes.test.js`
40, `wgerRoutes.test.js` 20), `__tests__/` 76 (12 files; `index.test.js` 34). 45 files, about
322, before `@types/supertest`, which may add some.

- [ ] Measure first; over 450, split `routes/` into its own PR.
- [ ] A fixture built for Prisma (`userReadRepository.test.js`) is declared with the Prisma
      type the mapper takes (P); a partial row is cast under the file's one comment.
- [ ] `TYPE_CHECKED_FILES` 210 to 255. Mutations as in 8d, one per file; the control.
- [ ] The no-runtime-change check; the gates; ship.

## Task 10: Server tests, `services/` (PR 10, `feat/d1p5-server-tests-services`)

Relaxed count on `6ea2274`: 408 over 35 files; `integrations/__tests__/stravaService.test.js`
93, `planning/__tests__/swaps.test.js` 44, `external/__tests__/airQuality.test.js` 42,
`auth/__tests__/sessionService.auth.test.js` 36, `sessionService.redis.test.js` 24,
`platform/__tests__/rateLimitStore.test.js` 17.

- [ ] Measure first; over 450, split `integrations/` and `auth/` into their own PR.
- [ ] `stravaService.test.js` builds `connections` and `imports` fakes: each is declared with
      the repository types Task 2d gave `stravaService`'s deps (R), and a fake missing a method
      the service calls is F.
- [ ] Then the server's tests guard, test-first, beside the source guard:

```js
// D1 phase 5: every test file is checked by its workspace's test program.
test.each(WORKSPACES)("every %s test file is checked", (workspace) => {
  const tests = sources.filter(
    ({ file }) =>
      file.startsWith(`${workspace}/src/`) && (isTest(file) || file.startsWith("client/src/test/"))
  );
  expect(tests.length, "the sweep found too few test files").toBeGreaterThanOrEqual(
    workspace === "client" ? 118 : 88
  );
  const unchecked = tests.filter((source) => !checked.includes(source)).map(({ file }) => file);
  expect(unchecked, "add // @ts-check below the header of each").toEqual([]);
});
```

      Expected before the last pragma: FAIL for `server` listing exactly this PR's unchecked
      files, and FAIL for `client` (all 118). Write the client half as `test.skip` until
      Task 12, and say so in the PR.

- [ ] `TYPE_CHECKED_FILES` 255 to 290. Guard mutations (a pragma removed from one server test,
      a staged unchecked `server/src/services/__tests__/d1p5-probe.test.js`); type mutations
      one per file; the control.
- [ ] The no-runtime-change check; the gates; ship.

## Task 11: Client tests, `app/`, `hooks/`, `components/`, `__tests__/` (PR 11, `feat/d1p5-client-tests-app`)

Relaxed counts on `6ea2274`: `app/` 436 (38 files; `events.handlers.test.js` 93,
`events.test.js` 82, `useOptimisticLogs.test.jsx` 62, `useDashboardData.test.jsx` 42),
`__tests__/` 152 (6 files; `App.test.jsx` 107), `hooks/` 12, `components/` 10,
`src/test/setup.js` 0. 51 files, about 610.

- [ ] Measure first. Over 450, as expected here: `app/` first (PR 11a,
      `feat/d1p5-client-tests-app`), the rest second (PR 11b, `feat/d1p5-client-tests-shared`),
      each with its own baseline.
- [ ] `AppEventDeps` fakes in `events.*.test.js` are declared `AppEventDeps` with the members
      the test does not use cast in under the file's one comment (P); `setUser`, `go` and the
      other setters the fakes read back (TS2339 on the fake object) are part of that declared
      type, not new fields.
- [ ] `TYPE_CHECKED_FILES` 290 to 341. Mutations one per file; the control.
- [ ] The no-runtime-change check; the gates; ship.

## Task 12: Client tests, `pages/`, and the client tests guard (PR 12, `feat/d1p5-client-tests-pages`)

Relaxed counts on `6ea2274`: `pages/dashboard/` 418, `pages/home/` 228, the rest 40; 67
files, about 686: `DashboardPage.test.jsx` 67, `progress.test.js` 60,
`useHomeStageFlow.test.jsx` 50, `WorkoutsView.test.jsx` 49,
`DashboardPage.integration.test.jsx` 35, `WeekProgression.test.jsx` 34,
`MealView.test.jsx` 27. Typing the pages (Tasks 3 to 7) changes these most.

- [ ] Measure first. Over 450, as expected: `pages/dashboard/` first (PR 12a), `pages/home/`
      and the rest with the guard second (PR 12b).
- [ ] A page's props in a test are declared with the page's `<Name>Props` (P).
- [ ] The client half of the tests guard: `test.skip` becomes `test`; FAIL listing exactly the
      last PR's files; PASS once they are checked.
- [ ] `TYPE_CHECKED_FILES` 341 to 408: every file under both `src` trees. Guard mutations, as
      in Task 10, in the client. Type mutations one per file; the control is now in no
      unchecked file, so it is a wrong value in `e2e/smoke.spec.js`, which no program reads.
- [ ] The no-runtime-change check; the gates; `npm run test:e2e`; ship.

## Task 13: M4 (PR 13, `feat/d1p5-checkjs`)

### 13a. The one guard, test-first

- [ ] In `describe("type-checked files")`, replace "every // @ts-check comes before its file's
      first statement", "TYPE_CHECKED_FILES matches the files that are checked", "every source
      file in the client's data layer is checked", "every source file in the server is
      checked", "every page file is checked", "every %s test file is checked" and
      "%s/tsconfig.json keeps strict on and checkJs off" (with its comment and
      `TYPE_CHECKED_FILES`, `PRAGMA` and `checked`) with:

```js
// Milestone M4 of lane D1: every file under client/src and server/src is checked,
// by the source program or the test program, because checkJs is on in all four
// configs. A pragma would now say nothing, so none is written
// (docs/specs/2026-11-19-pages-tests-and-checkjs-design.md).
const CONFIGS = WORKSPACES.flatMap((workspace) =>
  ["tsconfig.json", "tsconfig.test.json"].map((name) => `${workspace}/${name}`)
);

test.each(CONFIGS)("%s checks every file it includes, strictly", (config) => {
  const raw = JSON.parse(stripJsonComments(readFileSync(path.join(repoRoot, config), "utf8")));
  const base = config.endsWith(".test.json")
    ? JSON.parse(
        stripJsonComments(readFileSync(path.join(repoRoot, config.replace(".test", "")), "utf8"))
      )
    : { compilerOptions: {} };
  const options = { ...base.compilerOptions, ...raw.compilerOptions };
  expect(options.strict, "strict is what makes the check worth having").toBe(true);
  expect(options.checkJs, "checkJs checks every file; nothing opts in").toBe(true);
});

test("no file under either src carries a type-check pragma", () => {
  expect(sources.length, "the sweep found too few files").toBeGreaterThanOrEqual(408);
  const marked = sources
    .filter(({ lines }) => lines.some((line) => /^\s*\/\/\s*@ts-(?:check|nocheck)\b/.test(line)))
    .map(({ file }) => file);
  expect(marked, "remove the pragma: checkJs checks the file already").toEqual([]);
});
```

      The test-program assertions of Task 8c ("is the source program, implicit any allowed")
      stay as they are, and the reads rule (2f) stays.

- [ ] "every body typedef is named by a checked client file" reads `checked`, which goes:
      it reads every client source file instead (`sources.filter(({ file }) =>
file.startsWith("client/") && !isTest(file))`), and its name becomes "every body
      typedef is named by a client file".
- [ ] `npm run test:scripts`. Expected: FAIL on `checkJs` (four configs) and on the 408 marked
      files.

### 13b. The flip

- [ ] `checkJs: true` in `client/tsconfig.json` and `server/tsconfig.json` (the test configs
      inherit it), and each header comment rewritten: "Every file under `src` is checked
      (milestone M4); there is no pragma to add."
- [ ] Remove every `// @ts-check` line under both `src` trees with a script written with the
      Write tool (`d1p5/remove-pragmas.mjs`): for each tracked `.js` and `.jsx` file, drop the
      one line that is exactly `// @ts-check`, keeping the file's line endings (check with
      `git ls-files --eol` before and after), and drop a blank line it leaves doubled. Then
      `npx prettier --check` on the changed files.
- [ ] `npm run typecheck`. Expected: exit 0 with the same errors as before (none): every file
      was already checked. If a file reports an error now, it was never truly checked (a
      pragma TypeScript ignored), which the position guard should have caught: stop, report,
      and fix the file in this PR.
- [ ] `npm run test:scripts` PASS.

### 13c. The record of the rule

- [ ] `CLAUDE.md`, Conventions: the type-checking bullet ("Type checking is per file, through
      JSDoc …") is rewritten for M4, shorter than it is now:
      "**Type checking is through JSDoc, with `checkJs` on** ([0017](docs/adr/0017-type-checking-through-jsdoc.md)).
      Every file under `client/src` and `server/src` is checked, tests by `tsconfig.test.json`
      with implicit `any` allowed; there is no pragma. Every parameter the checker cannot
      infer gets a `@param {Type}` (`docs/code-readability-sop.md`, rule 2). Client source
      names server code only inside a JSDoc `import()` type; runtime imports of server code
      stay in tests." Build & Test: `npm run typecheck` becomes
      "tsc, strict, both programs in each workspace". `npm run test:scripts` holds `CLAUDE.md`
      under its byte cap.
- [ ] `docs/code-readability-sop.md`, rule 2: the clauses for a file "without `// @ts-check`"
      and "with `// @ts-check`" become one: every file is checked, so each JSDoc type is
      checked and cannot drift.

### 13d. Prove it

- [ ] The syntax trees: every one of the 408 files SAME (a comment line removed).
- [ ] The control that now must be caught: a new staged file with no pragma,
      `client/src/app/d1p5-probe.js`, a header and `export const n = Math.max("x");`.
      Expected: the typecheck fails on it. Delete it after. And `// @ts-check` added back to one file: KILLED by the
      `scripts` suite.
- [ ] Mutations, one per workspace and program (a wrong value in a source file and in a test
      file of each).
- [ ] The build hashes, both suites and coverage identical; the gates; `npm run test:e2e`;
      ship.

## Task 14: Close-out (PR 14, `docs/d1p5-close-out`)

- [ ] `docs/adr/0017-type-checking-through-jsdoc.md`: a section "The pages, the tests and
      checkJs on (phase 5 and M4)", decided 2026-11-19: what it covers; the two programs per
      workspace and why tests allow implicit `any`; source passing both; `@types/supertest`;
      the client's reads through `Wire` and `ErrorBody`, and the reads rule; patterns N to R;
      the guards M4 replaced with one; what stays out (`e2e/`, `scripts/`, `server/scripts/`,
      the configs). The Decision section's last sentence ("Roadmap milestone M4 turns `checkJs`
      on …") becomes past tense, and Guards is rewritten for M4.
- [ ] The roadmap: `status/D1` with ArtifactData (`if_version`), done, naming M4 reached.
- [ ] This plan's status: done, with the PRs and every departure from the text above. The
      spec's status: applied.
- [ ] `npx prettier --check` on the edited files, `npm run test:scripts`. Ship.
