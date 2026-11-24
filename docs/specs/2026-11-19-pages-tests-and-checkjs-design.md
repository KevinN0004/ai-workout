# Type-checking the pages and the tests, then checkJs on (roadmap lane D1, phase 5 and M4), design

Status: **decided 2026-11-19** with the owner, measured. The plan is
`docs/plans/2026-11-19-pages-tests-and-checkjs.md`. Phase 4 is
`docs/specs/2026-11-17-server-source-types-design.md`, whose decision 3 left the client's use
of the server's response typedefs to this phase.

## Owner's decisions

1. **The rest of D1 is one spec.** It covers the client's pages (82 files, 1,468 errors), the
   test files in both workspaces (206 files, about 4,550 errors under full strict) and
   milestone M4 (`checkJs` on, the pragmas removed). Not chosen: the pages only, with the tests
   and M4 in a spec of their own; the response types only.
2. **Tests are checked strictly, except that an implicit `any` is allowed.** Each workspace
   gains a test program, `tsconfig.test.json`, which is the source program with
   `noImplicitAny` off. A fixture or a call is still checked against the real types, but a
   mock's untyped parameter stays `any`. Not chosen: full strict, which would add about 2,450
   annotations, mostly on `vi.fn` callbacks; leaving the tests unchecked.
3. **M4 reaches both `src` trees, and no further.** Every file the two source configs and the
   two test configs include is checked: `client/src` and `server/src`, source and tests.
   `e2e/`, `scripts/`, `server/scripts/` and the config files (`vite.config.js`,
   `vitest.config.js`, `eslint.config.js`, `playwright.config.js`, `server/vitest.setup.js`)
   stay unchecked. Not chosen: adding `e2e/` and `server/scripts/`; every JavaScript file in
   the repository.
4. **Pragmas first, then the flip.** As in phases 3 and 4, each file gets `// @ts-check` in
   an annotation-only PR, with a guard per area once the area is done. M4 is then one PR that
   turns `checkJs` on and removes every pragma. Not chosen: turning `checkJs` on first with a
   `// @ts-nocheck` on each failing file (about 200 suppression markers, against the rule
   that bans `@ts-ignore`); the tests before the pages, which would type a test against a page
   whose props are still `any`.
5. **`@types/supertest` becomes a server devDependency** (finding 9), installed under the
   14-days-old rule and audited, so each `supertest` call and the answer it reads are checked.
   Not chosen: leaving `supertest` `any`, which the relaxed rule allows.

## What was found

Measured on `6ea2274`, TypeScript 7.0.2, by running each workspace's `tsc -p tsconfig.json`
with `--checkJs true`, and again with `--noImplicitAny false` as well. Every temporary file was
removed.

1. **Checked today:** 120 of the 408 git-tracked `.js` and `.jsx` files under the two `src`
   trees: every server source file and every client source file outside `pages/`, plus
   `pages/dashboard/progress.js` and `pages/home/components/physique/math.js`.
   `TYPE_CHECKED_FILES` is 120.
2. **The 82 unchecked page files report 1,468 errors.** With `noImplicitAny` off they report
   175, so most are a parameter or a binding with no type (TS7006 and TS7031).

   | Group                                                             | Files | Errors |
   | ----------------------------------------------------------------- | ----: | -----: |
   | `auth/`, `workout/`, `workout-result/`                            |    15 |    116 |
   | `home/` (top level, `hooks/`, `components/`)                      |    15 |    444 |
   | `home/preview/`                                                   |    11 |    225 |
   | `dashboard/views/`, `dashboard/components/`                       |    17 |    338 |
   | `dashboard/` (top level, `meal/`, `hooks/`, `settings/`, `tips/`) |    24 |    345 |

   As in phases 3 and 4, a file's count is measured with every file checked; checked beside
   looser neighbours, it can report fewer.

3. **The 206 test files report about 4,550 errors under full strict**, 2,306 in the client's
   118 (117 test files and `src/test/setup.js`) and 2,247 in the server's 88. With
   `noImplicitAny` off: 1,296 and 803.

   | Client tests, `noImplicitAny` off                                 | Errors |
   | ----------------------------------------------------------------- | -----: |
   | `app/`                                                            |    436 |
   | `pages/dashboard/`                                                |    418 |
   | `pages/home/`                                                     |    228 |
   | `__tests__/` (App, main and the contract tests)                   |    152 |
   | `pages/` (auth, workout, workout-result), `hooks/`, `components/` |     62 |

   | Server tests, `noImplicitAny` off | Errors |
   | --------------------------------- | -----: |
   | `services/`                       |    408 |
   | `routes/`                         |    165 |
   | `repositories/`                   |     81 |
   | `__tests__/`                      |     76 |
   | `db/`, `middleware/`              |     73 |

   Typing the pages changes what their tests see, so each test PR is re-measured first.

4. **Today's checked client files pass with `noImplicitAny` off; 21 server places do not.**
   Each is a variable declared `null` or `[]` that strict mode widens as it is assigned: 17
   in `registerAirQualityRoutes.js`, 3 in `externalDataService.js` and 1 in
   `generateRoutes.js`. With `noImplicitAny` off TypeScript does not widen it, so it stays
   `null` (or `never[]`) and every later read is an error. A test program checks each source
   file a test imports under its own options, so these 21 fail it.
5. **No `Date` or `Decimal` reaches the client.** A probe over the server's response typedefs
   found neither in any of them: the mappers already return strings and numbers, which is what
   JSON delivers.
6. **12 of the 31 response typedefs contain an `any`, from three roots** (swept when the
   plan was written):
   - `StoredDashboard`'s lists are `unknown`, and `buildDashboard`'s `Array.isArray` turns
     each into `any[]`: `dashboard.calories`, `plans`, `savedExercises` and `workouts`, in
     `DashboardResponse` and the eight responses built on it;
   - `toJsonArray` in `rowValues.js` returns `any[]`, so a JSON list column reads as `any`:
     a plan's `equipment` and `focuses` (`GenerateResponse`, `PlanSwappedResponse`), a saved
     exercise's `muscles` and `equipment` (`SavedExerciseSavedResponse`) and a workout's
     `exercises` (`WorkoutSessionSavedResponse`);
   - `stravaService`'s `connections` dependency is `any`, so every field of
     `StravaStateResponse` read from its row is `any`.
7. **The client program cannot read a route module's types yet.** It does not include
   `server/src/types/express.d.ts`, so a client file that names a type from
   `authRoutes.js` or `registerDashboardReadRoutes.js` makes the client's typecheck fail on
   `req.user` (TS2339).
8. **The client reads 40 `.json()` answers.** 21 are in `events.js`, 6 in
   `useDashboardData.js`, and the rest in `App.jsx`, `sendLog.js`, `strava.js`,
   `planSwaps.js`, `useApiClient.js` and four page files. Each `!res.ok` branch reads
   `payload?.error` from `await res.json().catch(() => ({}))`; the server answers every error
   as `{ error: string }`, once with a `requestId` beside it.
9. **`supertest` has no types.** 32 server test files import `supertest` 7.3.1, which ships
   none. Under full strict each import is TS7016; with `noImplicitAny` off it is not an error,
   and `supertest` reads as `any`. `@types/supertest` 7.2.1 was published 2026-07-14.
10. **The guards assume pragmas.** `repo-invariants.test.mjs` checks where each `// @ts-check`
    sits, that `TYPE_CHECKED_FILES` equals the number of checked files, that both configs keep
    `checkJs` false, and that every data-layer and server source file carries a pragma.
    `CLAUDE.md` (39,694 of its 40,000 bytes) and SOP rule 2 describe a file as checked by its
    pragma.

## Design

### Annotations only

Phases 3 and 4's rules hold, for source and tests alike:

- **No runtime change.** Every changed file parses to the same syntax tree as on `main`; the
  client build is byte-identical; the test count and coverage are the same (lines may move
  only by a line Prettier splits or joins).
- **A real defect is reported, not fixed in passing.** Its fix is a PR of its own, test first.
- **No `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck`.** A cast is allowed where the
  checker cannot see what the code guarantees, with a comment saying why, and no variable is
  added to hold one.
- **A caught error** read once is cast in place; one read more than once is
  `catch (/** @type {any} */ err)` with a comment naming what throws.
- **Phase 4's patterns G to M** apply where they fit: a defaulted parameter typed as its
  callers pass it (I), state declared at its first value (L), a guarded value cast in place
  with its reason (K).
- **In a test file, a mock's untyped parameter may stay `any`.** That is the latitude
  decision 2 meant to give. `noImplicitAny: false` gives more, found in PR 9 and recorded
  here:
  - **A `let` with no initializer is `any`**, so nothing done with it is checked. Each one
    in a checked test file names its type on the line above (decided 2026-11-23), and a
    repo-invariant test holds that.
  - **An empty `[]` and a helper's untyped parameter stay `any`.**
  - **A field read through a JavaScript function's return type is not checked**, such as
    `ReturnType<typeof mapUser>`. TypeScript gives a `.js` file's object literals an open
    type, so a misspelled field reads as `any`.
- **A logger in a test is a real one** (decided 2026-11-23): `pino({ level: "silent" })`,
  which writes nothing, with `vi.spyOn` on each method the test reads, not an object of
  `vi.fn()`s cast through `unknown`. A child logger inherits its parent's spies. This changes
  how a test runs, so its PR is proved by the same test count and coverage and a
  byte-identical build, not by syntax trees, and by a misspelled method caught in each file.

### Response types in the client

The first implementation PR, before any page:

- **The client program includes `../server/src/types/express.d.ts`**, so the route modules
  it reaches type-check under the client's options too (finding 7).
- **`Dashboard` is the server's type.** In `app/dashboard.js`, `@typedef {any} Dashboard`
  becomes `DashboardResponse["dashboard"]`, with the pagination named beside it, and
  `events.js`'s note that every `res.json()` reads as `any` goes.
- **Each success read is cast in place to its named response, through `Wire`**,
  `const data = /** @type {Wire<SignedInResponse>} */ (await res.json());`. That cast is where
  the client trusts the network, so it is the one place each type is asserted. Acorn drops the
  parentheses and the build drops the comment, so neither the syntax tree nor the bundle
  changes.
- **Each error read is cast to `ErrorBody`,** a new `{ error?: string, requestId?: string }`
  typedef beside the server's error sender in `services/http/errorResponseService.js`.
- **`sendLog` is generic,** `@template T` with `data?: T`, so each caller names its answer.
- **No `any` is left in a response typedef the client reads** (finding 6). The server's
  annotations are tightened, type only, at the three roots: `StoredDashboard`'s lists,
  `toJsonArray`'s callers, and `stravaService`'s `connections`.
- **The guard is a type, `Wire<T>`,** in the checked fetch module, `app/network.js`,
  beside `ApiFetch` (a new module of types alone would add a file to the coverage report).
  `Wire<T>` is `T` itself when no field of it is `any`, `Date` or `Decimal`, else
  `{ notWireSafe: <path> }`, so every read through the cast fails the typecheck and the error
  names the field (`"dashboard.calories.any"`). It is the probe that found finding 6, made
  permanent, and it holds a later field that JSON would deliver as something else. A
  repo-invariant test holds the rule that every `.json()` success cast in `client/src` goes
  through `Wire<`. This replaces a test that would run `tsc` itself, as the spec first had
  it.

### Pages

Each page file gets `// @ts-check` below its header and the JSDoc its checker asks for.

- **Props** follow phase 3: up to three typed inline in the `@param`, more in a
  `<Name>Props` typedef beside the component.
- **A page reads the server's types through the data layer.** Its props name `Dashboard`,
  the `<Name>Response` types and the phase 2 body types, not a copy of their fields.
- **The guard.** "every page file is checked", in `repo-invariants.test.mjs`, fails on a
  non-test page file without the pragma. It is written test-first, lands with the last page
  files, and fails if its sweep finds fewer than 84 files.

### Tests

- **Two programs per workspace.** `tsconfig.json` stays the source program and gains an
  `exclude` for `**/*.test.*`, `**/__tests__/**` and, in the client, `src/test/**`. A new
  `tsconfig.test.json` extends it, includes the test files, and sets `noImplicitAny: false`.
  Each workspace's `typecheck` script runs both.
- **Source passes both programs.** The test program checks every source file a test imports
  under the relaxed options, so the 21 server places in finding 4 each get their type at the
  declaration (pattern L: a `@type` on a declaration, which leaves the syntax tree
  unchanged). They land with the test tooling.
- **Each test config's `types`** is its source config's, with nothing added unless a
  measurement shows a need. `@types/supertest` is a package, not a `types` entry
  (decision 5).
- **The guard.** "every test file is checked" in both workspaces, written test-first, landing
  with the last test files.
- **Repo-invariant tests** hold each test config to its source config: it extends it, and
  differs only by `noImplicitAny: false` and its `include`.

### M4

One PR, after every file carries a pragma:

- `checkJs: true` in all four configs.
- Every `// @ts-check` under both `src` trees is removed (408 files today).
- The pragma-position test, `TYPE_CHECKED_FILES` and the per-area guards are replaced by one
  guard: all four configs have `checkJs` and `strict` on, and no `@ts-check` or `@ts-nocheck`
  is left under either `src`.
- The `CLAUDE.md` lines that describe a file as checked by its pragma are rewritten in the
  same PR, since they are false once it merges, inside the byte cap. SOP rule 2 drops its
  clause on unchecked files.

### Proof

- **The syntax tree is unchanged** for each changed file, compared with acorn against `main`
  as in phase 4, with a control mutant that must make the comparison fail.
- **The client build is byte-identical** (each built file's sha256).
- **Each newly checked file** fails the typecheck on one wrong value typed into it, and a
  control, the same mutation in a file still unchecked, survives. In M4 the control becomes a
  type error in a file that never carried a pragma, which must now be caught.
- **The response-type guard** fails on an `any` and on a `Date` written into a response
  typedef, the `Wire<` rule fails on a cast written without it, and each response cast fails
  on a misspelled field read through it.

### Recorded

Decision record 0017 gains a section on this phase and on M4: the two programs and why tests
allow an implicit `any`, the response types in the client and their guard, and the end of
the pragmas. `CLAUDE.md` changes only where M4 makes it false.

## Testing

- **Typecheck** passes on each PR, with `TYPE_CHECKED_FILES` raised by the files it checks
  until M4 retires it.
- **Mutations** as in "Proof".
- **No runtime change, measured:** the syntax-tree comparison, the client build's hashes,
  each suite's count, and the exact covered and total statements, branches and functions,
  measured under the same conditions as `main` (a client build on disk for the server).
- **The test-tooling PR also** runs audit-ci against `security/audit-ci.json` and checks the
  publish date of `@types/supertest`.
- **E2E** runs on the response-types PR, the last pages PR and M4.
- **Gates:** format:check, lint, knip, build, `npm test`, `test:scripts`, `test:coverage`.

## PRs

1. This spec and its plan.
2. Response types in the client, and the server's `any`s tightened, with the response-type
   guard: about 12 files.
3. Pages: `auth/`, `workout/`, `workout-result/`: 15 files, about 116 errors.
4. Pages: `home/` top level, `hooks/`, `components/`: 15 files, about 444 errors.
5. Pages: `home/preview/`: 11 files, about 225 errors.
6. Pages: `dashboard/views/`, `dashboard/components/`: 17 files, about 338 errors.
7. Pages: the rest of `dashboard/`, and the pages guard: 24 files, about 345 errors.
8. Test tooling (the two test configs, the `exclude`s, the 21 declarations, the `typecheck`
   scripts, `@types/supertest`, the config tests), then the server's `db/` and `middleware/`
   tests: 8 files, about 73 errors.
9. Server tests: `repositories/`, `routes/`, `__tests__/`: 45 files, about 322 errors.
10. Server tests: `services/`: 35 files, about 408 errors.
11. Client tests: `app/`, `hooks/`, `components/`, `__tests__/`, `src/test/setup.js`: 51
    files, about 610 errors.
12. Client tests: `pages/`, and the tests guard: 67 files, about 686 errors.
13. M4.
14. Close-out: decision record 0017, the plan's and spec's status, the roadmap's D1 status.

A PR past about 450 errors once re-measured splits in two. A defect found on the way is its
own PR, test first. No floor PR is expected: annotations add no statements, branches or
functions.

## Out of scope

- Any change to what the client sends or the server answers.
- `e2e/`, `scripts/`, `server/scripts/` and the config files (decision 3).
- Turning on `noImplicitAny` for the tests later, or any option beyond `strict`.
