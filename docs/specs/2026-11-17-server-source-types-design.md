# Type-checking the server's source (roadmap lane D1, phase 4), design

Status: **decided 2026-11-17** with the owner, measured; **applied 2026-11-19**, in #426
to #431, all live, with no floor PR. The plan is
`docs/plans/2026-11-17-server-source-types.md`, whose status says where the work went past
this text. Phase 3 is
`docs/specs/2026-11-16-client-data-layer-types-design.md`, which left response types to this
phase: "Response types come later, from the server, once its read side is checked".

## Owner's decisions

1. **The server's source is the next piece.** D1 has four pieces left: the server's source
   (53 files, 867 errors), the client's pages (82 files, 1,468 errors), the test files (about
   4,440 errors), and milestone M4 (`checkJs` on everywhere, markers removed). Phase 4 checks
   every unchecked source file in `server/src`. Not chosen: the client's pages first; the
   server's source and the pages in one spec.
2. **Express's types, and one declaration file.** `@types/express` and `@types/cors` become
   server devDependencies, installed under the 14-days-old rule and audited. One declaration
   file, `server/src/types/express.d.ts`, adds the app's four fields to Express's `Request`.
   It is a recorded exception to "types live in JSDoc": it declares types only, and nothing
   runs from it. Not chosen: the packages with an `AppRequest` typedef and a cast in each
   handler that reads those fields (about 130 casts); Express left `any`, with no new
   packages. _Added when the plan was written, for the owner's review:_ `@types/pg` joins
   them as a direct devDependency (finding 13), for the reason phase 3 gave `@types/react`
   its own entry.
3. **Response types are server-only, and named.** Each answer the client reads gets a named
   typedef beside the route that sends it, and no client file changes. The pages phase then
   swaps the client's `Dashboard = any` and its `.json()` reads for those names. Not chosen:
   wiring the client to them in this phase; checking the server with no named responses.
4. **Prisma is typed as `PrismaClient`.** Each repository's queries and rows are checked
   against `schema.prisma`, and the response typedefs derive from the schema rather than from
   hand-written copies, as phase 2's rule asks. The two Strava repositories, checked in C2
   with `prisma: any` and a hand-written typedef per mapped row, move to it too, so there is
   one way of doing it. Not chosen: keeping `prisma` `any`, with a hand-written typedef for
   each mapper's output.

## What was found

Measured on `c8116ec`, TypeScript 7.0.2, by running the server's `tsc -p tsconfig.json` with
`--checkJs true`. Every temporary edit was reverted.

1. **Checked today:** 22 of the server's 75 source files. `TYPE_CHECKED_FILES` is 67.
2. **The 53 unchecked files report 867 errors.** By code: TS7006 (a parameter with no type)
   369, TS2339 (a property not on the type) 307, 290 of them on `{}`, and TS7031 (a
   destructured parameter with no type) 117.

   | Group                                 | Files | Errors |
   | ------------------------------------- | ----: | -----: |
   | `src/` (`index.js` and the bootstrap) |     4 |     61 |
   | `db/`                                 |     3 |     16 |
   | `middleware/`                         |     2 |     14 |
   | `repositories/`                       |    10 |    245 |
   | `routes/`, top level                  |     6 |     62 |
   | `routes/dashboard/`                   |     7 |     61 |
   | `routes/external/`                    |     5 |     63 |
   | `routes/integrations/`                |     2 |     23 |
   | `services/auth/`                      |     2 |     98 |
   | `services/dashboard/`                 |     2 |    114 |
   | `services/external/`                  |     1 |     34 |
   | `services/http/`                      |     4 |     22 |
   | `services/platform/`                  |     5 |     54 |

   The largest are `dashboardDataBuildersService.js` (90), `sessionService.js` (71) and
   `workoutSessionRepository.js` (52). As in phase 3, a file's count is measured with every
   file checked; checked on its own, beside looser neighbours, it can report fewer.

3. **Express is untyped.** The server has no `@types/express` or `@types/cors`, so every
   `app`, `req` and `res` is `any`. Installing `@types/express` 5.0.6 and `@types/cors`
   2.8.19 in a scratch copy (Express is 5.3.0, cors 2.8.6) types them, and leaves the 867 at
   874: the app's own `Request` fields become errors.
4. **The app adds four fields to `Request`.** `middleware/requestContext.js` sets
   `req.requestId` and `req.log` (pino's `logger.child({ requestId })`);
   `services/auth/sessionService.js` sets `req.user` (the session's user, or `null`) and
   `req.csrfToken` (a string). The source reads them 72 (`user`), 39 (`log`), 12
   (`requestId`) and 6 (`csrfToken`) times. JSDoc cannot add a field to a library's
   interface, which is why decision 2 needs a declaration file.
5. **Defaulted parameters read as `{}`.** `input = {}` in the dashboard builders
   (`buildDashboard`, `buildWorkoutSessionEntry` and the rest) and `row = {}` in the mappers
   (`mapWorkoutSession` and the rest) make the checker infer `{}`, which accounts for the 290
   TS2339 errors on `{}`.
6. **Two no-op placeholders make calls look wrong.** `let reportServerError = () => {};` in
   `errorResponseService.js` and `captureException: () => {}` in `errorTrackingService.js`
   are replaced at startup by functions that take arguments, but the checker sees a function
   that takes none, so every call with arguments is a false TS2554.
7. **Some values are guarded by another check.** `getRedisClient()` in `httpCacheService.js`
   can return `null`, and is only reached after `redisReady()` has said it will not.
8. **Typing Prisma surfaces what `any` hid.** On three repositories, typing the client as
   `PrismaClient` left about the same count as `any` (92 against 91), but they were different
   errors: an `orderBy` literal widened to `string`, a `calorieDate` of `Date | null` passed
   to a column the schema requires, and a `plan` the checker still holds possibly `null`
   after a `plan?.planPayload` check.
9. **Twenty route modules take `(app, deps)`,** and each `deps` is a bag of functions that
   `index.js` builds, so neither is typed today.
10. **Two JSDoc forms work in TypeScript 7.0.2, probed.** `/** @type {const} */ ({ ... })`
    keeps a literal's type (`"asc"`, not `string`), and `/** @satisfies {T} */ (expr)` checks
    an expression against a type without changing it, catching both a wrong field type
    (TS2322) and an excess or misspelled key (TS2561).
11. **The tooling assumes JavaScript.** The header test in
    `scripts/__tests__/repo-invariants.test.mjs` covers `.js`, `.jsx`, `.mjs`, `.cjs` and
    `.css` only; knip's server project is `src/**/*.js`; server coverage includes `src/**`.
    A `.d.ts` must be held to the header rule and must not move a coverage figure.
12. **`CLAUDE.md` is at 39,598 of its 40,000-byte cap.** Phase 4's record goes in decision
    record 0017, with one short line in `CLAUDE.md` naming `server/src/types/`.
13. **`pg` is typed only by accident** (this and 14 were found when the plan was written).
    `db/postgres.js` imports `pg` 8.23.1, which ships no types. The `@types/pg` 8.23.1 that
    types it is installed because `@prisma/adapter-pg` depends on it, the position phase 3's
    decision 3 declined to leave `@types/react` in.
14. **CI type-checks without a generated Prisma client.** The `quality` job runs
    `npm run typecheck` straight after `npm ci`, and `prisma generate` runs only in the
    test and E2E jobs. `@prisma/client` 7.10.1 has no install script, and its types re-export
    `.prisma/client/default`, which only `prisma generate` writes. So decision 4's types
    exist locally and not in that job. What `tsc` reports there without them was not measured.

## Design

### Annotations only

Each of the 53 files gets `// @ts-check` below its header, and the JSDoc types its checker
asks for. Phase 3's rules hold unchanged:

- **No runtime change.** Every changed `.js` file parses to the same syntax tree as on
  `main`, and the server's test count and coverage are the same (lines may move only by a
  line Prettier splits).
- **A real defect is reported, not fixed in passing.** The annotation PR leaves it as it is
  and names it for the owner; its fix is a PR of its own, test first.
- **No `@ts-ignore` and no `@ts-expect-error`.** A cast, `/** @type {Type} */ (value)`, is
  allowed where the checker cannot see what the code guarantees, with a comment above it
  saying why the value is that type. No variable is added to hold a cast.
- **A caught error** read once is cast in place to `Error` (or what the code assumes), with
  a comment naming what throws there; one read more than once is
  `catch (/** @type {any} */ err)` with the same comment. No `instanceof` check is added.
- **Parameters** follow the readability SOP's rule 2.

### Express

- **`server/src/types/express.d.ts`** declares, in `declare global { namespace Express {
interface Request { ... } } }`:
  - `requestId: string`;
  - `log: import("pino").Logger`;
  - `user?: import("../services/auth/authUserService.js").AuthUser | null`, where `AuthUser`
    is a typedef for what `mapDbDocToUser` returns, added to `authUserService.js` in the
    same PR (the file itself is checked in PR 4);
  - `csrfToken?: string`.

  It opens with a header like every source file, and nothing imports it at runtime: the
  server's tsconfig already includes `src`.

- **Each `register…(app, deps)` function** types `app` as `import("express").Express` (or
  `Router` where it is one), so the handlers registered on it take their `req` and `res`
  types from Express with no annotation of their own.
- **A middleware declared on its own** is typed `import("express").RequestHandler` (or
  `ErrorRequestHandler`).
- **Each `deps`** gets a typedef in the route module that receives it, one `@property` per
  function, typed from the function `index.js` passes (`typeof import(...).name`) rather
  than written out again.

### Prisma

- **Each repository factory takes `{ prisma: import("@prisma/client").PrismaClient }`**, and
  its rows are Prisma's generated payload types. The two Strava repositories change from
  `prisma: any` to the same, and their hand-written row typedefs become the generated ones
  where the shapes agree.
- **A query constant whose literals widen** (`orderBy: { createdAt: "asc" }`) is declared
  with the Prisma input type it is passed as
  (`Prisma.GeneratedPlanOrderByWithRelationInput[]`), or checked against it with
  `@satisfies` where its literal type is read back (an `include` that a payload type names).
  `/** @type {const} */` is for an object only: it makes an array readonly, which Prisma's
  array inputs do not accept.
- **A value the schema requires but the code holds as nullable** is cast in place with the
  reason it is set there, or, if the code does not guarantee it, reported as a defect.

### Recurring patterns

- **Defaulted parameters (`input = {}`, `row = {}`).** The default stays, since it is
  runtime behaviour. The parameter is typed as what the source callers pass: a builder's
  input is the phase 2 body typedef it builds from (`WorkoutSessionBody` and the rest), a
  mapper's row is the Prisma payload. Where the code handles missing fields itself, the type
  is `Partial<…>`. Where `{}` is not assignable to that type, the default is cast to it in
  place, `(row = /** @type {Row} */ ({}))`, with a comment naming who leaves the argument
  out.
- **No-op placeholders** are declared with the type of the function that replaces them, so
  a call with arguments checks:
  `/** @type {(error: unknown, context?: object) => void} */ let reportServerError = () => {};`
- **A value another check guards** (`getRedisClient()` after `redisReady()`, `plan` once its
  payload is known to exist) is cast in place with that reason. No runtime check is added.

### Response types

- **Each answer the client reads** gets a `<Name>Response` typedef in the route file that
  sends it. Phase 3 counted 32 `.json()` reads in the client's data layer; the plan maps each
  to the route that answers it.
- **The typedef is derived, not copied.** It names the mapper's or builder's return,
  `Awaited<ReturnType<typeof import("…").buildDashboard>>`, or wraps it
  (`{ dashboard: Dashboard }`), so it follows the schema through the Prisma types.
- **The literal passed to `res.json(...)`** carries `/** @satisfies {NameResponse} */`, so a
  wrong or misspelled field is an error and the value's own type is unchanged.
- **No client file changes** (decision 3).

### Guard

In `scripts/__tests__/repo-invariants.test.mjs`, a test that every git-tracked, non-test
`.js` file in `server/src` carries `// @ts-check`. It is written test-first and
mutation-tested: a server source file with its pragma removed, and a new unchecked file in
`server/src/services/`, must each fail it. It lands with the last files, so it never needs an
allowance list. The header test widens to `.ts`, so the declaration file is held to the
header rule.

`TYPE_CHECKED_FILES` rises with each PR, from 67 to 120.

### Proof

- **The syntax tree is unchanged.** For each changed `.js` file, `main`'s copy and the
  branch's are parsed with acorn and compared with positions and raw text dropped, as in
  phase 2. A control mutant, one changed operator, must make the comparison fail.
- **Each newly checked file** must fail `npm run typecheck` on one wrong value typed into
  it and pass once restored, as in phase 3. Each mutation is written as a file with the Write
  tool and confirmed applied, and a control, the same mutation in a file still unchecked,
  shows the failure comes from the pragma.
- **Each response typedef** must fail on a misspelled field written into its `res.json(...)`
  literal.

### Recorded

Decision record 0017 gains a section on the server: what it covers, the guard, the
declaration file as the one exception to JSDoc and why, the Prisma typing, the response
typedefs and that the client adopts them in the pages phase. `CLAUDE.md`'s file organization
gains one line for `server/src/types/`, inside its byte cap.

## Testing

- **Typecheck** passes on each PR, with `TYPE_CHECKED_FILES` raised by the files it checks.
- **Mutations** as in "Guard" and "Proof".
- **No runtime change, measured:** the syntax-tree comparison, the server suite's count
  (3,072 today) and the exact covered and total statements, branches and functions, measured
  locally under the same conditions as `main` (a build on disk). Lines may move by a line
  Prettier splits or joins, and each such move is accounted for.
- **PR 2 also** confirms that ESLint, knip and server coverage ignore the declaration file
  (the coverage figures are unchanged with it present), runs audit-ci against
  `security/audit-ci.json`, and checks each added version's publish date.
- **E2E** runs on PR 2, which adds packages, and on PR 6, which checks the bootstrap. The
  syntax-tree comparison covers the rest.
- **Gates:** format:check, lint, knip, build, `npm test`, `test:scripts`, `test:coverage`.

## PRs

1. This spec and its plan.
2. The tooling (decision 2: the three packages, `express.d.ts`, the `AuthUser` typedef, the
   header test widened to `.ts`; finding 14: `prisma generate` before CI's typecheck, with a
   repo-invariant test that keeps it there), then `db/`, `middleware/`, `services/http/` and
   `services/platform/`: 14 files, about 106 errors.
3. `repositories/`: 10 files, about 245 errors, and the two Strava repositories moved to
   `PrismaClient`.
4. `services/auth/`, `services/dashboard/` and `services/external/httpCacheService.js`: 5
   files, about 246 errors.
5. `routes/`, with the response typedefs: 20 files, about 209 errors. If it runs past about
   250 errors once PR 4 has landed, it splits into `routes/dashboard/` and the rest.
6. `index.js`, `staticClient.js`, `shutdown.js` and `corsPolicy.js`, and the guard: 4 files,
   about 61 errors.
7. Close-out: decision record 0017, the line in `CLAUDE.md`, the roadmap's D1 status, the
   plan's status.

A defect found on the way is its own PR, test first, wherever the owner puts it. No floor PR
is expected: annotations add no statements, branches or functions.

## Out of scope

- Any client file, including the client's use of the response typedefs (the pages phase).
- Any change to what the server sends or accepts.
- The client's pages, the test files (supertest has no types), `server/scripts/`, and
  turning `checkJs` on in either workspace. Each is a later phase or a decision not to.
