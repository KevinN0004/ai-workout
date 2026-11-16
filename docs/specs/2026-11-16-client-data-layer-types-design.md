# Type-checking the client's data layer (roadmap lane D1, phase 3), design

Status: **decided 2026-11-16** with the owner, measured. The plan is
`docs/plans/2026-11-16-client-data-layer-types.md`. Phase 2 is
`docs/specs/2026-11-14-api-body-types-design.md`, which left its callers to this phase: "the
types prove each builder's output against the schema's declared fields for the inputs the
builder declares, not what an unchecked caller passes in. Phase 3 checks the callers."

## Owner's decisions

1. **The client's data layer.** Phase 3 checks every unchecked source file in
   `client/src/app/` (its `hooks/` and `components/` included), `client/src/hooks/`,
   `client/src/components/`, `client/src/App.jsx` and `client/src/main.jsx`: 37 files. Not
   chosen: only `events.js` and `App.jsx`; every client file with `checkJs` on; both
   workspaces with `checkJs` on.
2. **Response bodies stay `any`, for now.** What the server answers keeps the `any` that
   `Response.json()` returns, so phase 3 types parameters, props and state, and changes nothing
   at runtime. Response types come later, from the server, once its read side is checked, as
   phase 2's rule has it: types come from the server, not from hand-written copies. Not
   chosen: hand-written client typedefs for responses; `unknown` narrowed by runtime checks.
3. **The tooling's types, as dev dependencies.** `client/tsconfig.json` lists `vite/client`
   and `vite-plugin-pwa/react` in `types`, and `@types/react` and `@types/react-dom` become
   client devDependencies, installed under the 14-days-old rule and audited. Nothing reaches
   the bundle. Not chosen: the tsconfig types alone, with the two `react-dom` imports cast and
   JSX resting on the `@types/react` that Testing Library happens to bring in.

## What was found

Measured on `84acc55`, TypeScript 7.0.2, by running each workspace's `tsc -p tsconfig.json`
with `--checkJs true`. Nothing was changed.

1. **Checked today:** 8 of the client's 128 source files and 22 of the server's 75
   (`TYPE_CHECKED_FILES` is 30).
2. **`checkJs` on everywhere reports about 7,150 errors.** In source files: client 1,993,
   server 867. In test files: client 2,168, server 2,127. In source, most are a parameter with
   no type: TS7031 and TS7006 make up 1,380 of the client's 1,993.
3. **The client's pages hold most of its errors.** `pages/dashboard` reports 696 in 38 files
   and `pages/home` 678 in 25, mostly component props.
4. **The data layer reports 393 errors in 37 unchecked files.** Six more files there are
   checked already: `exerciseSets.js`, `plans.js`, `profileMapping.js`, `requestBodies.js`,
   `units.js` and `workoutSession.js`. Four of the 37 report none: `constants.js`,
   `errorTrackingSdk.js`, `OfflineHint.jsx` and `useConnection.js`.

   | File                                   | Errors |
   | -------------------------------------- | -----: |
   | `app/events.js`                        |    110 |
   | `app/hooks/useOptimisticLogs.js`       |     45 |
   | `App.jsx`                              |     39 |
   | `app/components/PlannerSetupModal.jsx` |     34 |
   | `app/hooks/useDashboardData.js`        |     26 |
   | `app/planSwaps.js`                     |     16 |
   | `hooks/useFocusTrap.js`                |     13 |
   | `components/SwapStep.jsx`              |     12 |
   | `app/strava.js`                        |     11 |
   | the other 28 files                     |     87 |

   A file's count is measured with every file checked. Checked on its own, beside unchecked
   neighbours whose types are looser, it can report fewer.

5. **Responses arrive as `any`.** `useApiClient`'s `apiFetch` returns `fetch`'s `Response`,
   and `Response.json()` is typed `Promise<any>` in the DOM library. The 37 files read 32
   bodies through `.json()`: 20 in `events.js`, 6 in `useDashboardData.js`, and one or two in
   `useApiClient.js`, `App.jsx`, `planSwaps.js`, `sendLog.js` and `strava.js`.
6. **No component is checked yet.** None of the 30 checked files is a `.jsx` component, so
   phase 3 sets how props are typed.
7. **`CLAUDE.md` is at 39,598 of its 40,000-byte cap**, so this phase's record goes in decision
   record 0017 and the readability SOP, not in `CLAUDE.md`.
8. **The tooling's types are not loaded.** The client tsconfig's `types` is `[]`, so a CSS
   import (4 files), an SVG import (15, in `PlannerSetupModal.jsx`), `import.meta.env` and
   `virtual:pwa-register/react` are errors: 21 in all. With `types` set to `vite/client` and
   `vite-plugin-pwa/react`, both already installed, all 21 clear (probed). `@types/react`
   19.3.0 is installed only as a dependency of `@testing-library/react`, and
   `@types/react-dom` not at all, so `react-dom` and `react-dom/client` are untyped (TS7016).
9. **State that starts empty reads as `never` or `null`.** `useState(null)` and
   `useState([])` make the checker infer `null` and `never[]`, which accounts for most of the
   non-parameter errors in `useOptimisticLogs.js`, `useDashboardData.js`, `SwapStep.jsx` and
   `App.jsx`.
10. **The planner form is typed as the server's body,** since phase 2 gave
    `createDefaultPlannerForm` the `@returns` `GeneratePlanBody`, whose coerced fields read as
    `unknown`. `App.jsx`'s toggles spread `prev.equipment` and `prev.focuses`, 9 errors.
11. **A caught error is `unknown`** under `strict`, so a `catch` that reads `err.message` or
    `err.code` is an error: 10 in `events.js`, more in the hooks.

## Design

### Annotations only

Each of the 37 files gets `// @ts-check` below its header, and the JSDoc types its checker
asks for. Nothing else changes:

- **No runtime change.** Each PR's built JavaScript is byte-identical to `main`'s, and its
  test count and coverage are the same (lines may move only by a line Prettier splits).
- **A real defect is reported, not fixed in passing.** Where checking exposes code that
  behaves wrongly, the annotation PR leaves it as it is, and it goes to the owner. Its fix is a
  PR of its own, test first.
- **No `@ts-ignore` and no `@ts-expect-error`.** A cast, `/** @type {Type} */ (value)`, is
  allowed where the checker cannot see what the code guarantees, with a comment above it
  saying why the value is that type.
- **A response body stays `any`** where `.json()` returns it, with a one-line comment saying
  so. Where the body is handed on, the receiving parameter is typed `any` with the same note,
  so the gap is visible at each place it crosses.

### Conventions

- **Parameters** follow the readability SOP's rule 2: a `@param {Type} name` line for each one
  the checker cannot infer, and a `@returns` only where the inferred return is wider than the
  truth.
- **Component props.** A component with up to three props types them inline:

  ```js
  /**
   * Asks before ending the session, or keeps it going.
   * @param {{ open: boolean, onConfirm: () => void, onCancel: () => void }} props
   */
  ```

  One with more gets a typedef in its own file, one `@property` line per prop, each with its
  description, so the summary need not list them:

  ```js
  /**
   * @typedef {object} PlannerSetupModalProps
   * @property {boolean} open Whether the modal is showing.
   * …
   */
  ```

- **A shape two files share is declared once**, as a `@typedef` in the module that owns it,
  and imported elsewhere with a JSDoc `import()` type: for example the optimistic log entry
  (`useOptimisticLogs.js`) and the outbox item (`outbox.js`). Where a shape is built from a
  response, its fields are typed as far as the client's own code fixes them, and the rest is
  `any` with the note above. A response the client passes around whole, the dashboard, gets a
  name, `@typedef {any} Dashboard` in `app/dashboard.js` with the note, so a later phase
  replaces one line.
- **State and refs that start empty are typed at their initial value**:
  `useState(/** @type {Toast | null} */ (null))`, `useRef(/** @type {number | null} */ (null))`.
  This declares the state's type, so it needs no comment, unlike a cast.
- **A caught error is cast to what the code already assumes**, with a comment naming what
  throws there: `/** @type {Error & { status?: number }} */ (err)` after a send, whose throwers
  all raise an `Error`. No `instanceof` check is added: that would change behaviour.
- **The planner form gets its own type**, `PlannerForm` in `requestBodies.js`:
  `GeneratePlanBody` intersected with the fields as the form holds them (`equipment` and
  `focuses` are `string[]`). It stays assignable to the body, so phase 2's check still holds,
  and `createDefaultPlannerForm` returns it.

### Guard

In `scripts/__tests__/repo-invariants.test.mjs`, a test that every non-test `.js` and `.jsx`
file in the data layer (the three folders and two files of decision 1) carries `// @ts-check`.
A new file there is then checked from its first commit, which is what `checkJs` would give
these folders, without turning it on for the pages. It is written test-first and
mutation-tested: a data-layer file with its pragma removed, and a new unchecked file added to
`src/app/`, must each fail it. It lands with the last files, so it never needs an allowance
list.

`TYPE_CHECKED_FILES` rises with each PR, from 30 to 67.

### Proof that each file is checked

For each newly checked file, `npm run typecheck` must fail on one wrong value typed into it, a
number where a string is declared or a missing argument, and pass once restored. Each mutation
is written as a file with the Write tool and confirmed applied before its result counts, as in
phase 2.

### Recorded

Decision record 0017 gains a section on the data layer: what it covers, the guard, that
responses stay `any` until the server's read side is checked, the props convention, and the
client tsconfig's `types` with the two `@types` packages (its "`types` to `[]`" line no longer
holds for the client). The readability SOP's rule 2 gains the props convention.

## Testing

- **Typecheck** passes on each PR, with `TYPE_CHECKED_FILES` raised by the files it checks.
- **Mutations** as in "Guard" and "Proof that each file is checked".
- **No runtime change, measured:** every built JS file's hash matches `main`'s, since JSDoc
  and a cast's parentheses do not reach the minified bundle. The client suite's count and the
  exact covered and total statements, branches and functions match too. Lines may move by a
  line Prettier splits or joins around an annotation (+1 covered, +1 total in phase 1), and
  each such move is accounted for in the PR.
- **E2E** runs on each PR, as each one touches the client.
- **Gates:** format:check, lint, knip, build, `npm test`, `test:scripts`. PR 2 also runs
  audit-ci against `security/audit-ci.json` and checks each added version's publish date.

## PRs

1. This spec and its plan.
2. The tooling's types (decision 3), then the 16 small modules in `src/app/`: `activeSession`,
   `cache`, `classifySendFailure`,
   `connection`, `constants`, `dashboard`, `describeAge`, `errorTracking`, `errorTrackingSdk`,
   `linePath`, `network`, `outbox`, `planSwaps`, `routing`, `sendLog`, `strava`. About 73 errors.
3. Shared hooks and components: `src/hooks/` (4), `src/components/` (3), and
   `AppErrorBoundary`, `AppNotice`, `SignOutConfirm` and `StartSessionConfirm` in
   `src/app/components/`. About 45 errors.
4. `src/app/hooks/`: `useApiClient`, `useDashboardData`, `useOptimisticLogs`,
   `useOutboxReplay`, `useStravaSync`, `useWorkerUpdate`. About 90 errors.
5. `events.js`. About 110 errors.
6. `PlannerSetupModal.jsx`, `App.jsx` and `main.jsx`, and the guard. About 75 errors.
7. Close-out: decision record 0017, the SOP, the roadmap's D1 status, the plan's status.

No floor PR is expected: annotations add no statements, branches or functions.

## Out of scope

- Response types, and any change to what the server sends or the client sends.
- The pages (`src/pages/`), which hold most of the client's errors, and the server's unchecked
  files. Each is a later phase or a decision not to.
- Test files, and turning `checkJs` on in either workspace.
