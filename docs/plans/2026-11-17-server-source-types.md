# Type-checking the server's source (D1 phase 4), Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every source file in `server/src` is type-checked, each answer the client reads has
a named type, and a guard keeps new server files checked, with no change to what runs.

**Design:** `docs/specs/2026-11-17-server-source-types-design.md`. Its findings, the owner's
four decisions (the server's source; Express's types and one declaration file; named,
server-only responses; Prisma as `PrismaClient`) and the design's patterns are not repeated
here except where a task needs the exact form.

**Tech Stack:** TypeScript 7.0.2 over JSDoc, Express 5.3, Prisma 7.10 (`prisma-client-js`),
pino 10, zod 4, Vitest with v8 coverage, acorn, Playwright, gh CLI.

**Status: planned 2026-11-17.** Every file, line and count below was read or measured on
`c8116ec`.

---

## Conventions

- One PR at a time, each on a new branch from current `origin/main`. Report after each, and
  merge only on the owner's OK, with a standalone `gh pr merge N --merge`, then watch main's
  CI and Deploy until "Live: the new instance reported ready".
- No PR edits a floor line. None is expected to move a figure; if one does, stop and report.
- Commits end with `Co-Authored-By: claude-flow <ruv@ruv.net>`. PR bodies end with
  `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.
- Every command starts with `cd "D:/ai-workout"`, uppercase drive. Never `cd` into `src`.
  Scratch files go in the session scratchpad, under `d1p4/` and `tools/`.
- **Gates before each PR:** `npm test`, `npm run lint`, `npm run typecheck`,
  `npm run format:check`, `npm run knip`, `npm run build`, `npm run test:scripts`. Postgres
  on 55432 first (`npm run postgres:local:start -w server`; if it does not return, check that
  55432 is LISTENING and carry on).
- **The no-runtime-change check**, run on `main` before the PR's first edit, saved as
  `d1p4/prN-before.txt`, and again on the finished branch:
  1. **The syntax trees.** `node <scratchpad>/tools/ast-compare.mjs origin/main` prints
     `SAME` for every changed `.js` file under `server/src` and exits 0. Then
     `node <scratchpad>/tools/ast-compare.mjs origin/main --control <one changed file>`
     must exit 1: the control flips that file's first `===` in memory, which proves the
     comparison sees a real change. The tool is below.
  2. **The suite and coverage**, with a client build on disk (`npm -w client run build`
     first: server branches read one lower without it):
     `npm -w server run test:coverage -- --coverage.reporter=json-summary --coverage.reporter=text-summary`.
     Keep the run's `Tests` line and the `total` block of
     `server/coverage/coverage-summary.json`. The count (3,072 on `c8116ec`) and the covered
     and total statements, branches and functions must match. Lines may move by the lines
     Prettier splits or joins around an annotation; account for each such move in the PR,
     and treat any other change as a failure.
- **Mutations** are written to a JSON file with the Write tool and run by the scratchpad's
  `tools/mutate-types.mjs`, which confirms each applied and restores the file byte for byte.
  A type mutation uses `"suites": { "typecheck": ["server"] }`; KILLED means typecheck
  failed. Each PR's list ends with **one control**: the same kind of mutation in a server test
  file, which is never checked, and which must SURVIVE. It shows the kills come from the
  pragmas.
- **Each file's own errors:** after adding a pragma, `npm run typecheck -w server` lists
  them. The counts below are from the all-files measurement; a file checked beside unchecked
  neighbours can report fewer.

### The syntax-tree tool

Write it once, with the Write tool, as `<scratchpad>/tools/ast-compare.mjs`:

```js
// Compares each changed server .js file with its copy on a base ref as syntax
// trees, positions, raw text and comments dropped, so a JSDoc cast's parentheses
// vanish. Exits 1 if any differ. `--control <file>` flips that file's first
// `===` in memory first, so a run that still says SAME is a broken comparison.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const REPO = "D:/ai-workout";
const { parse } = createRequire(`${REPO}/package.json`)("acorn");
const args = process.argv.slice(2);
const controlAt = args.indexOf("--control");
const control = controlAt === -1 ? null : args[controlAt + 1];
const base = args.find((arg, i) => !arg.startsWith("--") && i !== controlAt + 1) || "origin/main";
const git = (...gitArgs) =>
  execFileSync("git", gitArgs, { cwd: REPO, encoding: "utf8", maxBuffer: 1 << 26 });

const files = git("diff", "--name-only", base, "--", "server/src")
  .split("\n")
  .filter((file) => file.endsWith(".js"));
if (control && !files.includes(control)) {
  console.error(`control ${control} is not a changed file`);
  process.exit(2);
}
const tree = (text) =>
  JSON.stringify(parse(text, { ecmaVersion: "latest", sourceType: "module" }), (key, value) =>
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

Acorn is at the repository root's `node_modules` (a dependency of the toolchain, not of
either workspace). If `createRequire` cannot find it, stop and report rather than installing
it.

## Recurring patterns

Phase 3's patterns A (a parameter's `@param`), C (a caught error) and F (a real defect)
hold as written in `docs/plans/2026-11-16-client-data-layer-types.md`, with the owner's
catch rule: an error read once is cast in place, `/** @type {Error} */ (err).message`; one
read more than once is `catch (/** @type {any} */ err)`, each with a comment naming what
throws there. Never add a variable to hold a cast. No `@ts-ignore` and no `@ts-expect-error`
anywhere. The server adds these.

**G. A route module's `app` and `deps`** (finding 9):

```js
/** @typedef {ReturnType<typeof import("../../services/dashboard/dashboardCollectionService.js").createDashboardCollectionService>} DashboardCollectionService */

/**
 * What index.js hands the dashboard's read routes; one property per member they read.
 * @typedef {object} DashboardReadDeps
 * @property {import("express").RequestHandler} requireAuth Rejects a request with no session.
 * @property {DashboardCollectionService["getDashboardCollection"]} getDashboardCollection
 *   Reads one page of one of the user's collections.
 */

/**
 * Registers the dashboard's read routes.
 * @param {import("express").Express} app
 * @param {DashboardReadDeps} deps
 */
export const registerDashboardReadRoutes = (app, deps) => {
```

Each `@property` names the function `index.js` passes, by `typeof` or `ReturnType`, rather
than writing its signature out. Once `app` is typed, an inline handler,
`app.get(path, requireAuth, async (req, res) => …)`, takes `req` and `res` from Express and
needs no annotation. A handler built by a factory (`answer(...)` in
`registerProgressionRoutes.js`) gets `@returns {import("express").RequestHandler}`.

**H. A Prisma repository** (decision 4):

```js
/**
 * A workout session row as the repository reads it, with its sets.
 * @typedef {import("@prisma/client").Prisma.WorkoutSessionGetPayload<{ include: typeof WORKOUT_SESSION_INCLUDE }>} WorkoutSessionRow
 */

/**
 * Creates the workout session repository.
 * @param {{ prisma: import("@prisma/client").PrismaClient }} deps
 */
export const createWorkoutSessionRepository = ({ prisma }) => {
```

A function that runs inside a transaction takes
`import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient`.
A query constant is declared with the input type it is passed as:

```js
/** @type {import("@prisma/client").Prisma.GeneratedPlanOrderByWithRelationInput[]} */
export const GENERATED_PLAN_ORDER = [{ createdAt: "desc" }, { id: "desc" }];
```

An `include` that a payload type reads back keeps its literal `true`s with `@satisfies`:
`export const WORKOUT_SESSION_INCLUDE = /** @satisfies {import("@prisma/client").Prisma.WorkoutSessionInclude} */ ({ … });`.
If the payload then types a relation as `boolean` rather than the related rows, add
`/** @type {const} */` inside it as well, and check the include holds no array (a `const`
array is readonly, which Prisma's array inputs reject).

**I. A defaulted parameter** (finding 5). The default stays. The parameter is typed as what
the source callers pass; where `{}` is not assignable to that type, the default is cast:

```js
// Both callers pass a row (the repository and mapUser); the default guards a bare call.
/**
 * Maps a saved exercise row to the shape the dashboard sends.
 * @param {import("@prisma/client").SavedExercise} [row]
 */
export const mapSavedExercise = (row = /** @type {import("@prisma/client").SavedExercise} */ ({})) => ({
```

Where the function itself tolerates missing fields (reads each with `?.` or a fallback), the
type is `Partial<…>` and needs no cast. `env = {}` typed `NodeJS.ProcessEnv` needs none
either.

**J. A no-op placeholder** (finding 6), declared with the type of what replaces it:

```js
// Replaced once by index.js through setErrorResponseTracker. Until then, as in
// every suite that never imports index.js, a 5xx is logged and not reported.
/** @type {(error: unknown, context?: import("../platform/errorTrackingService.js").ErrorContext) => void} */
let reportServerError = () => {};
```

**K. A value another check guards** (finding 7), cast in place with the guard named:

```js
// redisReady() has just said the client exists and is ready.
const raw = await /** @type {NonNullable<ReturnType<typeof getRedisClient>>} */ (
  getRedisClient()
).get(key);
```

**L. A state variable that starts empty** is declared at its first value:
`/** @type {import("pg").Pool | null} */ let postgresPool = null;`. This declares a type, so
it needs no comment.

**M. A response** (decision 3), per "Response types" below.

## Shared types

Declared once, in the module that owns the shape, and imported elsewhere with
`import("<path>").<Name>`:

| Typedef          | Declared in                                 | Shape                                                                                                                                                         |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthUser`       | `services/auth/authUserService.js`          | `NonNullable<Awaited<ReturnType<ReturnType<typeof createAuthUserService>["findUserById"]>>>`                                                                  |
| `ErrorContext`   | `services/platform/errorTrackingService.js` | `{ requestId?: string, method?: string, path?: string, status?: number }`: the fields `captureException` reads                                                |
| `ErrorTracker`   | `services/platform/errorTrackingService.js` | `{ enabled: boolean, configured: boolean, captureException: (error: unknown, context?: ErrorContext) => void, flush: (timeoutMs?: number) => Promise<void> }` |
| `Metrics`        | `services/platform/metricsService.js`       | `ReturnType<typeof createMetrics>`                                                                                                                            |
| `LatencyStats`   | `services/platform/metricsService.js`       | `ReturnType<typeof initLatencyStats>`                                                                                                                         |
| `Logger`         | (none)                                      | `import("pino").Logger` everywhere; a parameter that defaults to `null` is `import("pino").Logger \| null`                                                    |
| the row types    | each repository                             | Prisma's payload types, pattern H                                                                                                                             |
| `<Name>Response` | the route file that sends it                | pattern M                                                                                                                                                     |

`AuthUser` is derived from `createAuthUserService`, so it reads `any` fields until Task 4
types `mapDbDocToUser`'s source, and tightens then with no edit of its own.

## Response types

- **A typedef per route whose body a client file reads.** Before writing one, confirm the
  read: `grep` the path under `client/src` (tests excluded) and find the `.json()` on its
  answer. A route no client file reads gets none, and the PR lists it.
- **Named after the path and verb**: `GET /api/dashboard/meal-logs` is `MealLogsResponse`,
  `POST` to it `MealLogSavedResponse`, `GET /api/auth/me` `AuthMeResponse`.
- **Derived, not written out.** The typedef names what the route sends, through the
  builder's or mapper's type:

```js
/** @typedef {Awaited<ReturnType<DashboardCollectionService["getDashboardCollection"]>>} CollectionPage */

/**
 * What GET /api/dashboard/meal-logs answers: one page of the user's meal logs.
 * @typedef {object} MealLogsResponse
 * @property {ReturnType<typeof import("../../repositories/mealLogRepository.js").mapMealLog>[]} mealLogs
 * @property {Pick<CollectionPage, "total" | "limit" | "offset" | "source">} pagination
 */
```

The fields come from the route's own `res.json(...)`; the types of their values come from
the functions that build them. Where a shared function returns a union across collections
(`getDashboardCollection` takes the collection's name), the `@satisfies` fails on
`page.items`: cast it in place to the one collection's rows, "the `mealLogs` page holds
meal logs", rather than widening the response.

- **Each success `res.json(...)`** for that route carries the typedef:
  `res.json(/** @satisfies {MealLogsResponse} */ ({ mealLogs: page.items, pagination: { … } }));`. An error answer
  (sent through `sendErrorResponse`, or a `{ error }` literal) carries none.
- **The routes the client calls** (from `client/src`, tests excluded), by file:

| Route file                                               | Paths                                                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `routes/authRoutes.js`                                   | `GET` and `DELETE /api/auth/me`; `POST /api/auth/login`, `/signup`, `/logout`, `/password`; `GET` and `POST /api/profile` |
| `routes/systemRoutes.js`                                 | `GET /api/csrf-token`, `GET /api/health`                                                                                  |
| `routes/dashboard/registerDashboardReadRoutes.js`        | `GET /api/dashboard`, `/meal-logs`, `/progress-metrics`, `/workout-sessions`                                              |
| `routes/dashboard/write/registerWorkoutAndGoalRoutes.js` | `POST /api/dashboard/workout-sessions`, `/calories`, `/goals`; `DELETE /api/dashboard/workouts/:id`                       |
| `routes/dashboard/write/registerMealAndMetricRoutes.js`  | `POST /api/dashboard/meal-logs`, `/progress-metrics`                                                                      |
| `routes/dashboard/write/registerSavedExerciseRoutes.js`  | `POST /api/dashboard/saved-exercises`, `DELETE /api/dashboard/saved-exercises/:id`                                        |
| `routes/dashboard/registerPlanSwapRoutes.js`             | `/api/dashboard/plans/:planId/swaps`, each verb it registers                                                              |
| `routes/dashboard/registerProgressionRoutes.js`          | `GET /api/dashboard/progression`; `PUT` and `DELETE` on the lift and week paths                                           |
| `routes/generateRoutes.js`                               | `POST /api/generate`                                                                                                      |
| `routes/integrations/registerStravaRoutes.js`            | `GET` and `DELETE /api/integrations/strava`, `POST …/connect`, `POST …/sync` (the callback redirects)                     |
| `routes/external/registerAirQualityRoutes.js`            | `GET /api/air-quality/current`                                                                                            |
| `routes/external/registerWeatherRoutes.js`               | `GET /api/weather/recommendation` (`/current` only if a client file reads it)                                             |
| `routes/external/registerMealDbRoutes.js`                | `GET /api/mealdb/search`                                                                                                  |
| `routes/external/registerWgerRoutes.js`                  | `GET /api/wger/exercises`, `GET /api/wger/meta` (`/exercises/:id` only if read)                                           |

## Files

| File                                           | Change                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `server/package.json`, `package-lock.json`     | devDependencies `@types/express`, `@types/cors`, `@types/pg`                                |
| `server/src/types/express.d.ts`                | new: the four `Request` fields                                                              |
| `.github/workflows/ci.yml`                     | the `quality` job generates the Prisma client before `npm run typecheck`                    |
| 53 files in `server/src`                       | `// @ts-check` and JSDoc types                                                              |
| `server/src/repositories/strava*Repository.js` | `prisma: any` to `PrismaClient`; generated row types                                        |
| `scripts/__tests__/repo-invariants.test.mjs`   | header scope to `.ts`; CI's generate step; `TYPE_CHECKED_FILES` 67 to 120; the server guard |
| `docs/adr/0017-type-checking-through-jsdoc.md` | phase 4's section (Task 7)                                                                  |
| `CLAUDE.md`                                    | one line for `server/src/types/` (Task 7)                                                   |

---

## Task 1: Spec and plan (PR 1, `docs/d1p4-spec-plan`)

- [ ] The spec is committed on the branch. Add this plan, and list both in `docs/README.md`
      under Plans and Specs, after phase 3's entries, as
      `[2026-11-17 — Type-checking the server's source, D1 phase 4](...)`.
- [ ] `npx prettier --check` on the three files, `npm run test:scripts`.
- [ ] Commit, push, open the PR, report, wait for the OK, merge, watch Deploy.

## Task 2: Tooling, then `db/`, `middleware/`, `services/http/`, `services/platform/` (PR 2, `feat/d1p4-tooling`)

### 2a. Baseline

- [ ] On `main`: the no-runtime-change check's suite and coverage, saved as
      `d1p4/pr2-before.txt`.

### 2b. The packages

- [ ] Install, no newer than 14 days:

```bash
cd "D:/ai-workout" && npm install -D -w server @types/express@^5.0.6 @types/cors@^2.8.19 @types/pg@^8.23.1 --before=2026-11-03 --prefer-dedupe
```

- [ ] Check each added version's publish date (`npm view <name>@<v> time --json`) is on or
      before 2026-11-03; that `@types/pg` resolves to one copy (`npm ls @types/pg`), the one
      `@prisma/adapter-pg` already used; and run
      `npx --yes audit-ci@7.1.0 --config security/audit-ci.json`. Expected: exit 0.
- [ ] `npm run typecheck`. Expected: exit 0, the same 67 files clean. If a checked file now
      fails because Express is typed (the checked Strava routes or `routes/dashboard/validation.js`),
      type what it names with pattern G and list it in the PR.
- [ ] `npm run knip`. Expected: exit 0. If knip reports an `@types` package as unused, stop
      and report rather than adding an ignore.

### 2c. The declaration file, test-first

- [ ] In `scripts/__tests__/repo-invariants.test.mjs`, widen the header test's scope:
      `/\.(js|jsx|mjs|cjs|css)$/` becomes `/\.(js|jsx|mjs|cjs|css|ts)$/` in `isInScope`.
- [ ] Create `server/src/types/express.d.ts` **without** a header first, holding only
      `export {};`, `git add` it, and run `npm run test:scripts`. Expected: FAIL, naming
      `server/src/types/express.d.ts` as a file with no header. This proves the widened
      scope reaches it.
- [ ] Write the file in full:

```ts
// The app's own fields on Express's Request: middleware/requestContext.js sets
// requestId and log, services/auth/sessionService.js sets user and csrfToken.
// Types only; nothing imports or runs this file (decision record 0017).
export {};

declare global {
  namespace Express {
    interface Request {
      /** The id requestContext gives each request. */
      requestId: string;
      /** pino's child logger, bound to requestId. */
      log: import("pino").Logger;
      /** The signed-in user, or null when there is no live session. */
      user?: import("../services/auth/authUserService.js").AuthUser | null;
      /** This session's CSRF token. */
      csrfToken?: string;
    }
  }
}
```

- [ ] Add `AuthUser` to `services/auth/authUserService.js`, below its header and imports,
      leaving the file unchecked (Task 4 checks it):

```js
/**
 * The signed-in user the session middleware puts on `req.user`: what findUserById
 * resolves to, less its null.
 * @typedef {NonNullable<Awaited<ReturnType<ReturnType<typeof createAuthUserService>["findUserById"]>>>} AuthUser
 */
```

- [ ] `npm run test:scripts` PASS, `npm run typecheck` PASS.
- [ ] Confirm the tools leave it alone: `npx eslint server/src/types/express.d.ts` reports
      the file as ignored or matched by no configuration, not linted; `npm run knip` exits 0;
      `npx prettier --check server/src/types/express.d.ts` passes. The coverage figures in
      2f must equal `pr2-before.txt` with the file present: if `total` gains a file, stop and
      report.

### 2d. CI generates the Prisma client before typecheck, test-first

- [ ] Add to the "type-checked files" block of `repo-invariants.test.mjs`, after
      "CI runs npm run typecheck":

```js
// Decision 4 types the repositories from Prisma's generated client, which only
// `prisma generate` writes, so the job that type-checks must generate it first
// (docs/specs/2026-11-17-server-source-types-design.md, finding 14).
test("CI generates the Prisma client before it type-checks", () => {
  const ci = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  const quality = ci.slice(ci.indexOf("  quality:"), ci.indexOf("  secrets:"));
  const generate = quality.indexOf("run: npm -w server run prisma:generate");
  expect(generate, "the quality job must run prisma:generate").toBeGreaterThan(-1);
  expect(generate, "and before npm run typecheck").toBeLessThan(
    quality.indexOf("run: npm run typecheck")
  );
});
```

- [ ] `npm run test:scripts`. Expected: FAIL on "the quality job must run prisma:generate".
      If `ci.indexOf("  secrets:")` is not the job after `quality`, slice to the next job's
      key instead and say so in the PR.
- [ ] In `.github/workflows/ci.yml`'s `quality` job, before the Typecheck step:

```yaml
# The repositories are typed from Prisma's generated client, which only
# `prisma generate` writes (decision record 0017).
- name: Generate Prisma Client
  run: npm -w server run prisma:generate
```

- [ ] `npm run test:scripts`. Expected: PASS. If the PR's CI run shows `prisma generate`
      needs `DATABASE_URL` there, give the step the test job's local placeholder URL as its
      `env`, never a secret, and say so in the PR.

### 2e. Check the 14 files

Add `// @ts-check` to each, run `npm run typecheck -w server`, and type what it reports.

| File                                         | Errors | Beyond plain parameters                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/postgres.js`                             |     10 | `postgresPool` is `import("pg").Pool \| null` (L); `metrics` defaults to `null`, so `@param {import("../services/platform/metricsService.js").Metrics \| null} [metrics]`; the two caught errors (C)                                                                                                        |
| `db/postgresMigrations.js`                   |      3 |                                                                                                                                                                                                                                                                                                             |
| `db/prisma.js`                               |      3 | `prismaLog` is `/** @type {import("@prisma/client").Prisma.LogLevel[]} */`; the two `globalThis.__aiWorkoutPrismaClient` reads cast `globalThis` in place to `typeof globalThis & { __aiWorkoutPrismaClient?: import("@prisma/client").PrismaClient }`, "the cache key this module sets outside production" |
| `middleware/errorHandler.js`                 |      7 | returns `import("express").ErrorRequestHandler`; `captureException` is `ErrorTracker["captureException"]`, which clears the TS2554                                                                                                                                                                          |
| `middleware/requestContext.js`               |      7 | returns `import("express").RequestHandler`; `logger: import("pino").Logger`                                                                                                                                                                                                                                 |
| `services/http/errorResponseService.js`      |      6 | `reportServerError` (J)                                                                                                                                                                                                                                                                                     |
| `services/http/requestLogPath.js`            |      1 | `@param {import("express").Request} req`                                                                                                                                                                                                                                                                    |
| `services/http/requestValidationService.js`  |      4 | `req` and `res` from Express                                                                                                                                                                                                                                                                                |
| `services/http/validationMessages.js`        |     11 | `tooSmall` and `tooBig` get `@type {Record<string, (bound: number \| bigint) => string>}`; `issue` is zod's issue type if zod 4.6.7 exports one by name (`import("zod").core.$ZodIssue`), else a typedef of the fields read                                                                                 |
| `services/platform/envValidationService.js`  |     17 | `@param {NodeJS.ProcessEnv} [env]` (I, no cast)                                                                                                                                                                                                                                                             |
| `services/platform/errorTrackingService.js`  |     13 | declare `ErrorContext` and `ErrorTracker`; `disabledTracker` returns `ErrorTracker`, which types its no-op (J); `context = {}` is `@param {ErrorContext} [context]` (I, no cast); the caught error (C)                                                                                                      |
| `services/platform/metricsService.js`        |      6 | declare `Metrics` and `LatencyStats`; `recordLatencyStats`'s `bucket` is `LatencyStats`                                                                                                                                                                                                                     |
| `services/platform/platformHealthService.js` |      1 |                                                                                                                                                                                                                                                                                                             |
| `services/platform/rateLimitStore.js`        |     17 | `redisStore` is `RedisStore \| null` and `initOptions` `import("express-rate-limit").Options \| null` (L); `method` is the union of the store methods `runWithFallback` is called with, read from its callers; `logger` defaults to `null`; the caught error (C)                                            |

- [ ] After each file: `npm run typecheck -w server` exits 0 before the next.
- [ ] Raise `TYPE_CHECKED_FILES` from 67 to 81; `git add` the files first, as the test counts
      tracked files.

### 2f. Prove and ship

- [ ] Write `d1p4/pr2-mutations.json`: one wrong value in each of the 14 files (a call with
      a wrong argument where the file calls its own typed function, else a mistyped
      declaration, as phase 3's 2d shows); one for the declaration file, `req.requestId = 1`
      added inside `requestContext.js`'s middleware; one for J, `reportServerError(err, 5)`;
      and the control, the `requestId` mutation's twin in a server test file. Read each `find`
      from the file as it then is, so each applies once. Expected: 16 KILLED, the control
      SURVIVED, each confirmed applied.
- [ ] The no-runtime-change check against `pr2-before.txt`. The `.d.ts` must not appear in
      the coverage `total`.
- [ ] The gates, and `npm run test:e2e` (packages were added). Commit, push, open the PR with
      the figures and the publish dates, report, wait for the OK.

## Task 3: The repositories (PR 3, `feat/d1p4-repositories`)

- [ ] Baseline as `d1p4/pr3-before.txt`.
- [ ] Check these 10 with patterns H and I, and move the two Strava repositories to H:

| File                                      | Errors | Beyond plain parameters                                                                                                                                                                                                                         |
| ----------------------------------------- | -----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboardCollectionRepository.js`        |      7 | its one TS7053 (an index by a `string`): a `Record` or a key union, from what the code indexes with                                                                                                                                             |
| `generatedPlanRepository.js`              |     36 | `GENERATED_PLAN_ORDER` (H); `mapGeneratedPlan`'s `row` (I); finding 8's `plan` after `plan?.planPayload`: cast with the reason if the check guarantees it, else F                                                                               |
| `mealLogRepository.js`                    |     34 | `lockUserCalorieWrites(prisma, …)` takes a transaction client (H); `mapMealLog`'s `row` (I); finding 8's `calorieDate` of `Date \| null` for a required column: if a caller can pass `null`, F; if the code rules it out, cast with that reason |
| `progressMetricRepository.js`             |     20 | `mapProgressMetric`'s `row` (I)                                                                                                                                                                                                                 |
| `progressionDecisionRepository.js`        |     11 |                                                                                                                                                                                                                                                 |
| `savedExerciseRepository.js`              |     32 | `mapSavedExercise`'s `row` (I, the example above)                                                                                                                                                                                               |
| `userLookup.js`                           |      5 | `getUserPk(prisma, …)` takes either client (H); `legacyField` is the union of the field names its callers pass                                                                                                                                  |
| `userReadRepository.js`                   |     29 | `mapUser(row, related = {})`: `row` is the user row, `related` the relations it reads (I)                                                                                                                                                       |
| `userRepository.js`                       |     19 |                                                                                                                                                                                                                                                 |
| `workoutSessionRepository.js`             |     52 | `WORKOUT_SESSION_INCLUDE` with `@satisfies` (H); `WorkoutSessionRow` from it; `mapWorkoutSession`'s `row` (I)                                                                                                                                   |
| `stravaConnectionRepository.js` (checked) |      — | `prisma: any` becomes `PrismaClient` (H); each hand-written row typedef becomes the generated model where the fields agree; where they differ, report it rather than reconciling it                                                             |
| `stravaImportRepository.js` (checked)     |      — | the same                                                                                                                                                                                                                                        |

- [ ] Before checking anything, confirm Prisma's types are what the checker sees:
      `npm -w server run prisma:generate`, then in a throwaway checked file
      `server/src/zz-prisma-probe.js` (header and pragma), assign
      `/** @type {import("@prisma/client").Prisma.SavedExerciseCreateInput} */ const x = { nope: 1 };`
      and see `npm run typecheck -w server` fail with TS2353 or TS2561. Delete the file and
      confirm `git status` is clean of it.
- [ ] A defect a type shows (pattern F) is left as it is, listed in the PR with file and line,
      and reported to the owner.
- [ ] `TYPE_CHECKED_FILES` 81 to 91.
- [ ] Mutations: one per file, the two Strava repositories included (12); three more for the Prisma typing, a misspelled field in a
      `create` call's `data`, a string for a `Date` column in a `where`, a row typedef's field
      read under a name the schema does not have (in a Strava repository); and the control.
      Expected: 15 KILLED, the control SURVIVED.
- [ ] The no-runtime-change check matches; the gates; ship.

## Task 4: The services (PR 4, `feat/d1p4-services`)

- [ ] Baseline as `d1p4/pr4-before.txt`.
- [ ] Check these 5:

| File                                                 | Errors | Beyond plain parameters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/auth/authUserService.js`                   |     27 | `mapDbDocToUser`'s `source` is `userReadRepository`'s mapped user (`ReturnType<typeof mapUser>`); `mapUserToDbDoc`'s `doc` is declared with the type of what it returns, with `profile?` and `dashboard?`, since the code adds them after; `dummyPasswordRecordPromise` (L)                                                                                                                                                                                                                                                                       |
| `services/auth/sessionService.js`                    |     71 | `redisClient` is `ReturnType<typeof createClient> \| null` and `timer` `ReturnType<typeof setTimeout> \| null` (L); the parsed cookies are `Record<string, string>`; the `createClient` options (TS2322, TS2345): `redisPort` is non-null when `hasSocketConfig` is true (line 245 says so), cast with that reason; if `tls`'s `boolean` still fails redis's union, cast `socket` in place to `import("redis").RedisClientOptions["socket"]`, "tls is the boolean the environment sets; redis's type splits it by literal"; the caught errors (C) |
| `services/dashboard/dashboardCollectionService.js`   |     24 | its deps from the repositories' types (G's `typeof` form)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `services/dashboard/dashboardDataBuildersService.js` |     90 | each `build…(input = {})`: `input` is the phase 2 body typedef its route validates (`WorkoutSessionBody`, `MealLogBody`, `ProgressMetricBody`, `SavedExerciseBody`, `ProfileBody`, `GoalsBody`), or the stored value it rebuilds; a builder called with both takes their union; `Partial<…>` where the builder reads every field with a fallback (I)                                                                                                                                                                                              |
| `services/external/httpCacheService.js`              |     34 | `serializeCacheKeyPart` gets `@returns {string}` (it recurses); `operation` is `"read" \| "write"`; the two `getRedisClient()` reads after `redisReady()` (K); `...statuses` is `@param {...string} statuses`; the caught error (C)                                                                                                                                                                                                                                                                                                               |

- [ ] Where a builder's input type and what a route passes disagree, check which is right:
      if the call is right and the typedef too narrow, widen the `@param`; if the call
      passes the wrong thing, F.
- [ ] `TYPE_CHECKED_FILES` 91 to 96.
- [ ] Mutations: one per file; two more in `dashboardDataBuildersService.js`, a builder given
      a misspelled body field and one given a number for a string; one for `AuthUser`, which
      now reads real fields, `req.user.emial` in a checked file; and the control. Expected:
      8 KILLED, the control SURVIVED.
- [ ] The no-runtime-change check matches; the gates; ship.

## Task 5: The routes and their response types (PR 5, `feat/d1p4-routes`)

- [ ] Baseline as `d1p4/pr5-before.txt`.
- [ ] Measure first: with Tasks 2 to 4 merged, add the 20 pragmas on a scratch branch and
      count `npm run typecheck -w server`'s errors. Over 250, split the PR: `routes/dashboard/`
      first (PR 5a, `feat/d1p4-routes-dashboard`), the other 13 files second (PR 5b,
      `feat/d1p4-routes`), each with its own baseline and check.
- [ ] Check these 20 with patterns G and M:

| File                                                     | Errors | Beyond plain parameters                                                                                                                                 |
| -------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/authRoutes.js`                                   |     19 | the caught error (C); responses per the table                                                                                                           |
| `routes/dashboardRoutes.js`                              |      2 |                                                                                                                                                         |
| `routes/externalRoutes.js`                               |      2 |                                                                                                                                                         |
| `routes/generateRoutes.js`                               |     15 | the caught error (C); `POST /api/generate`'s response                                                                                                   |
| `routes/registerApiRoutes.js`                            |      2 |                                                                                                                                                         |
| `routes/systemRoutes.js`                                 |     22 | `metrics` is `Metrics`, which types `requestLatencyMs`'s fields                                                                                         |
| `routes/dashboard/registerDashboardReadRoutes.js`        |     10 |                                                                                                                                                         |
| `routes/dashboard/registerDashboardWriteRoutes.js`       |      2 |                                                                                                                                                         |
| `routes/dashboard/registerPlanSwapRoutes.js`             |     17 | the paths registered in a loop keep `app`'s types                                                                                                       |
| `routes/dashboard/registerProgressionRoutes.js`          |     10 | `answer(...)` returns `import("express").RequestHandler`                                                                                                |
| `routes/dashboard/write/registerMealAndMetricRoutes.js`  |      6 |                                                                                                                                                         |
| `routes/dashboard/write/registerSavedExerciseRoutes.js`  |      6 |                                                                                                                                                         |
| `routes/dashboard/write/registerWorkoutAndGoalRoutes.js` |     10 |                                                                                                                                                         |
| `routes/external/registerAirQualityRoutes.js`            |     11 | the caught `err` reads `status` (C, "the external data service throws an Error with the upstream's status")                                             |
| `routes/external/registerMealDbRoutes.js`                |      8 | the same                                                                                                                                                |
| `routes/external/registerWeatherRoutes.js`               |     11 | the same, twice                                                                                                                                         |
| `routes/external/registerWgerRoutes.js`                  |     23 | the same, three times; the upstream `query` object, which gains `category`, `muscles` and `equipment` after it is built, is declared with them optional |
| `routes/external/validation.js`                          |     10 | the options parameter, read for `fallbackPath` and `message`, gets a typedef (I)                                                                        |
| `routes/integrations/registerStravaRoutes.js`            |     16 |                                                                                                                                                         |
| `routes/integrations/registerStravaWebhook.js`           |      7 |                                                                                                                                                         |

- [ ] Each caught error's comment names what throws, read from the service the route calls,
      not assumed: confirm the thrower sets `status` before writing that it does.
- [ ] The response typedefs, per "Response types". List in the PR each route that got one,
      and each the client calls that did not, with why.
- [ ] `TYPE_CHECKED_FILES` 96 to 116.
- [ ] Mutations: one per file; one per response file, a misspelled field in one
      `res.json(...)` literal (14), which `@satisfies` must catch; one handler reading
      `req.user.emial`; and the control. Expected: all KILLED but the control.
- [ ] The no-runtime-change check matches; the gates; ship.

## Task 6: The bootstrap and the guard (PR 6, `feat/d1p4-bootstrap`)

### 6a. The guard, test-first

- [ ] Add to `describe("type-checked files")`, after the data-layer test:

```js
// D1 phase 4: the server's source is checked whole, so a file added there is
// checked from its first commit (docs/specs/2026-11-17-server-source-types-design.md).
test("every source file in the server is checked", () => {
  const server = sources.filter(({ file }) => file.startsWith("server/src/") && !isTest(file));
  expect(server.length, "the sweep found too few server files").toBeGreaterThanOrEqual(75);
  const unchecked = server.filter((source) => !checked.includes(source)).map(({ file }) => file);
  expect(unchecked, "add // @ts-check below the header of each").toEqual([]);
});
```

- [ ] `npm run test:scripts`. Expected: FAIL, listing exactly `server/src/index.js`,
      `server/src/staticClient.js`, `server/src/shutdown.js` and `server/src/corsPolicy.js`.

### 6b. Check the last four

| File              | Errors | Beyond plain parameters                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corsPolicy.js`   |     11 | the error given a `status` is built `/** @type {Error & { status?: number }} */ (new Error(…))`, with why, as phase 3 built `GEO_NOT_AVAILABLE`                                                                                                                                                                                                                              |
| `index.js`        |     19 | Express and cors are typed by Task 2; the `logger` and `metrics` errors (TS2322) clear once their parameters are typed, so re-run before acting on them; `readThroughExternalCache` passed to the checked `createExternalDataService` (TS2322): if the passed function is right and the declared parameter too narrow, widen that declaration, else F; the caught errors (C) |
| `shutdown.js`     |     11 | `new Promise((resolve) => …)` resolved with no value (TS2810): `/** @type {Promise<void>} */ (new Promise(…))`, "it resolves with nothing once the server has closed"; probe that this clears it before using it; the caught error (C)                                                                                                                                       |
| `staticClient.js` |     20 | the options object gets a `RegisterClientStaticOptions` typedef (`express`, `existsSync`, `distPath`, `metrics`, `logger`, `onMissing`, `shellRateLimit`), each from what `index.js` passes; `logger` and `onMissing` default to `null`                                                                                                                                      |

- [ ] `TYPE_CHECKED_FILES` 116 to 120. `npm run test:scripts`. Expected: PASS.

### 6c. Prove it

- [ ] Guard mutations, with the `scripts` suite: remove the pragma from
      `server/src/shutdown.js`; add an unchecked `server/src/services/d1p4-probe.js` (a header
      and one export; staged, as the sweep reads tracked files). Both must fail the new test;
      delete the probe after.
- [ ] Type mutations: one in each of the four files; and the control. Expected: all KILLED
      but the control.
- [ ] The no-runtime-change check matches; the gates, and `npm run test:e2e`; ship.

## Task 7: Close-out (PR 7, `docs/d1p4-close-out`)

- [ ] `docs/adr/0017-type-checking-through-jsdoc.md`: a section "The server's source
      (phase 4)", decided 2026-11-17: what it covers; the guard; `express.d.ts` as the one
      declaration file and why JSDoc cannot do its job; the three `@types` packages; Prisma
      typed as `PrismaClient`, with CI generating the client before typecheck; the response
      typedefs, derived and checked with `@satisfies`, which the client adopts in the pages
      phase; patterns G to L.
- [ ] `CLAUDE.md`, File Organization, after the `server/src/repositories` line, one line:
      ``- `server/src/types` — declaration files only: `express.d.ts` adds the app's `Request` fields``.
      `npm run test:scripts` holds `CLAUDE.md` under `CLAUDE_MD_MAX_BYTES`; if the line
      breaks it, shorten the line, not another.
- [ ] The roadmap: `status/D1` with ArtifactData (`if_version`), still active (pages, tests
      and M4 left), naming phase 4 done.
- [ ] This plan's status: done, with the PRs and every departure from the text above. The
      spec's status: applied.
- [ ] `npx prettier --check` on the edited files, `npm run test:scripts`. Ship.
