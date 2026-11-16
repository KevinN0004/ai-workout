# Type-checking the client's data layer (D1 phase 3), Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every source file in the client's data layer (`src/app/`, `src/hooks/`,
`src/components/`, `App.jsx`, `main.jsx`) is type-checked, and a guard keeps new files there
checked, with no change to what runs.

**Design:** `docs/specs/2026-11-16-client-data-layer-types-design.md`. Its findings and the
owner's three decisions (the data layer; responses stay `any`; the tooling's types as dev
dependencies) are not repeated here.

**Tech Stack:** TypeScript 7.0.2 over JSDoc, React 19.3, Vite 8 and vite-plugin-pwa 2,
Vitest 5 with v8 coverage, Playwright, gh CLI.

**Status: not started.** Every file, line and count below was read or measured on `84acc55`.

---

## Conventions

- One PR at a time, each on a new branch from current `origin/main`. Report after each, and
  merge only on the owner's OK, with a standalone `gh pr merge N --merge`, then watch main's
  CI and Deploy until "Live: the new instance reported ready".
- No PR edits a floor line. None is expected to move a figure; if one does, stop and report.
- Commits end with `Co-Authored-By: claude-flow <ruv@ruv.net>`. PR bodies end with
  `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.
- Every command starts with `cd "D:/ai-workout"`, uppercase drive. Never `cd` into `src`.
- **Gates before each PR:** `npm test`, `npm run lint`, `npm run typecheck`,
  `npm run format:check`, `npm run knip`, `npm run build`, `npm run test:scripts`, then
  `npm run test:e2e` (Postgres on 55432 first).
- **The no-runtime-change check**, run on `main` before the PR's first edit and again on the
  finished branch; every figure must match:
  1. `npm -w client run test:coverage -- --coverage.reporter=json-summary --coverage.reporter=text-summary`:
     the `Tests` count, and the covered and total counts of statements, branches, functions
     and lines.
  2. `npm -w client run build`, then the size of every file in `client/dist/assets/*.js`
     (`ls -l client/dist/assets/*.js | awk '{print $5, $9}'`). JSDoc does not reach the
     bundle, so the sizes match byte for byte. PR 2 alone may differ in no file: its new
     packages are types only.
- **Mutations** are written to a JSON file with the Write tool and run by the scratchpad's
  `tools/mutate-types.mjs`, which confirms each applied. A type mutation uses the
  `typecheck` suite: `"suites": { "typecheck": ["client"] }`. KILLED means typecheck failed.
- **Each file's own errors:** after adding a pragma, `npm run typecheck -w client` lists them.
  The counts in each task are from the all-files measurement; a file checked beside unchecked
  neighbours can report fewer.

## Recurring patterns

These are the only forms phase 3 uses. Each is annotation only.

**A. A parameter the checker cannot infer** (TS7006, TS7031), per the SOP's rule 2:

```js
/**
 * Drops `user`'s entry with this `clientId`.
 * @param {CacheUser} user
 * @param {string} clientId
 */
export const removeFromOutbox = (user, clientId) => {
```

Destructured parameters are typed as one object:
`@param {{ url: string, body: unknown }} request`.

**B. State or a ref that starts empty** (finding 9). The initial value carries the type, which
declares it, so no comment is needed:

```js
const [dashboardToast, setDashboardToast] = useState(/** @type {Toast | null} */ (null));
const [entries, setEntries] = useState(/** @type {OptimisticEntry[]} */ ([]));
const timeoutRef = useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
```

**C. A caught error** (finding 11), cast to what the code already reads, with the comment
naming what throws:

```js
} catch (caught) {
  // Everything apiFetch and postLog throw is an Error, some with the answer's status.
  const err = /** @type {import("./sendLog.js").SendError} */ (caught);
```

Where the variable is used once, cast in place instead of renaming it:
`/** @type {Error} */ (err).message`. Never add an `instanceof` test: that changes behaviour.

**D. A response body** keeps `any`, with the note at the place it arrives:

```js
// The server's answer is not typed yet (D1 phase 3 spec, decision 2).
const payload = await res.json();
```

A parameter that receives one is typed `any` with the same note, except the dashboard, which
uses the `Dashboard` alias from `app/dashboard.js` (Task 2).

**E. Component props**: inline up to three props, a `<Name>Props` typedef beyond that:

```js
/**
 * A one-line notice above the page, with an optional action or dismiss button.
 * @param {AppNoticeProps} props
 */
```

**F. A real defect.** If a type shows code that behaves wrongly, do not change it. Note the
file and line, finish the PR without it, and report it to the owner with the PR. Its fix is a
separate PR, test first.

No `@ts-ignore` and no `@ts-expect-error` anywhere.

## Shared types

Declared once, in the module that owns the shape, and imported elsewhere with
`import("<path>").<Name>`:

| Typedef           | Declared in                      | Shape                                                                                                                                 |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `CacheUser`       | `app/cache.js`                   | `{ userId?: string, email?: string } \| null \| undefined`: the fields `buildScopedCacheKey` reads                                    |
| `ApiFetch`        | `app/network.js`                 | `(url: string, options?: RequestInit & { timeoutMs?: number }) => Promise<Response>`                                                  |
| `SendError`       | `app/sendLog.js`                 | `Error & { status?: number }`                                                                                                         |
| `EnsureCsrfToken` | `app/sendLog.js`                 | `(options?: { refresh?: boolean }) => Promise<string>`                                                                                |
| `LogType`         | `app/outbox.js`                  | `"workout" \| "calories" \| "meal"`, checked against the three call sites in `events.js` (Task 5) before it is narrowed from `string` |
| `OutboxEntry`     | `app/outbox.js`                  | `{ clientId: string, type: string, url: string, body: unknown, item: any, queuedAt: number }`                                         |
| `Dashboard`       | `app/dashboard.js`               | `any`, with the note: the server's dashboard, typed once its read side is                                                             |
| `Toast`           | `app/hooks/useOptimisticLogs.js` | `{ id: string, tone: string, message: string, actionLabel: string, onAction: (() => void) \| null }`                                  |
| `OptimisticEntry` | `app/hooks/useOptimisticLogs.js` | `{ operationId: string, type: string, item: any, createdAt: number }`                                                                 |
| `PlannerForm`     | `app/requestBodies.js`           | `GeneratePlanBody & { equipment: string[], focuses: string[] }`, plus any other field App's errors show as `unknown`                  |

`LogType`: keep `type: string` in `OutboxEntry` unless every writer passes one of the three
literals; check `events.js`'s three `queueOptimisticLogCommit` calls in Task 5 and narrow only
then.

## Files

| File                                           | Change                                                          |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `client/tsconfig.json`                         | `types`: `vite/client`, `vite-plugin-pwa/react`; header comment |
| `client/package.json`, `package-lock.json`     | devDependencies `@types/react`, `@types/react-dom`              |
| 37 files in the data layer                     | `// @ts-check` and JSDoc types                                  |
| `client/src/app/requestBodies.js`              | `PlannerForm`; `createDefaultPlannerForm` returns it            |
| `scripts/__tests__/repo-invariants.test.mjs`   | `TYPE_CHECKED_FILES` 30 to 67; the data-layer guard             |
| `docs/adr/0017-type-checking-through-jsdoc.md` | phase 3's section (Task 7)                                      |
| `docs/code-readability-sop.md`                 | rule 2: the props convention (Task 7)                           |

---

## Task 1: Spec and plan (PR 1, `docs/d1p3-spec-plan`)

- [ ] The spec is committed on the branch. Add this plan, and list both in `docs/README.md`
      under Plans and Specs, after phase 2's entries, as
      `[2026-11-16 — Type-checking the client's data layer, D1 phase 3](...)`.
- [ ] `npx prettier --check` on the three files, `npm run test:scripts`.
- [ ] Commit, push, open the PR, report, wait for the OK, merge, watch Deploy.

## Task 2: Tooling types and the small `src/app` modules (PR 2, `feat/d1p3-app-modules`)

### 2a. Baseline

- [ ] On `main`: run the no-runtime-change check and keep its figures in the scratchpad as
      `d1p3/pr2-before.txt`.

### 2b. The tooling's types

- [ ] In `client/tsconfig.json`, set `"types": ["vite/client", "vite-plugin-pwa/react"]`, and
      replace the header's second sentence onward with:

```jsonc
// Type-checks the client's JavaScript (roadmap lane D1, decision record 0017).
// A file is checked when `// @ts-check` sits below its header; every other
// file is read for its types and reports nothing. Nothing is built from this
// file: Vite and Vitest transform the sources themselves. `types` loads Vite's
// own declarations (CSS and asset imports, import.meta.env) and the PWA
// plugin's virtual module.
```

- [ ] Install the React types, no newer than 14 days:

```bash
cd "D:/ai-workout" && npm install -D -w client @types/react@^19.3.0 @types/react-dom@^19 --before=2026-11-02 --prefer-dedupe
```

- [ ] Check each added version's publish date (`npm view @types/react-dom@<v> time --json`)
      is on or before 2026-11-02, that `@types/react` resolves to one copy
      (`npm ls @types/react`), and run
      `npx --yes audit-ci@7.1.0 --config security/audit-ci.json`. Expected: exit 0.
- [ ] `npm run typecheck`. Expected: exit 0, the same 30 files clean. If a checked file now
      fails because `@types/react` changed version, stop and report.
- [ ] `npm run knip`. Expected: exit 0. If knip reports either `@types` package as unused,
      stop and report rather than adding an ignore.

### 2c. Check the 16 modules

Add `// @ts-check` to each, run `npm run typecheck -w client`, and type what it reports with
patterns A to D.

| File                     | Errors | Beyond plain parameters                                                                                             |
| ------------------------ | -----: | ------------------------------------------------------------------------------------------------------------------- |
| `activeSession.js`       |      4 |                                                                                                                     |
| `cache.js`               |      7 | declare `CacheUser`                                                                                                 |
| `classifySendFailure.js` |      1 | `@param {import("./sendLog.js").SendError \| null \| undefined} error`                                              |
| `connection.js`          |      4 |                                                                                                                     |
| `constants.js`           |      0 | pragma only; `DASHBOARD_ROUTE_VIEW_MAP` gets `@type {Record<string, string>}` if `routing.js` needs it              |
| `dashboard.js`           |      2 | declare `Dashboard`                                                                                                 |
| `describeAge.js`         |      2 |                                                                                                                     |
| `errorTracking.js`       |      6 | `import.meta.env` is cleared by 2b                                                                                  |
| `errorTrackingSdk.js`    |      0 | pragma only                                                                                                         |
| `linePath.js`            |      3 |                                                                                                                     |
| `network.js`             |      2 | declare `ApiFetch`; the caught `error` reads `.name`: pattern C, "fetch rejects with a DOMException or a TypeError" |
| `outbox.js`              |      7 | declare `OutboxEntry`; `readOutbox` returns `OutboxEntry[]`                                                         |
| `planSwaps.js`           |     16 | `apiFetch: ApiFetch`; `fallback: string`; the swap body's parameters from the builders' own types                   |
| `routing.js`             |      2 | `@param {string} path`; `DASHBOARD_ROUTE_VIEW_MAP[slug]` indexes a typed record                                     |
| `sendLog.js`             |      6 | declare `SendError` and `EnsureCsrfToken`; `send: () => Promise<any>` (pattern D)                                   |
| `strava.js`              |     11 | `apiFetch: ApiFetch`; the state it parses stays `any` (pattern D)                                                   |

- [ ] After each file: `npm run typecheck -w client` exits 0 before the next.
- [ ] Raise `TYPE_CHECKED_FILES` in `scripts/__tests__/repo-invariants.test.mjs` from 30 to 46;
      `git add` the files first, as the guard counts tracked files.

### 2d. Prove each file is checked

- [ ] Write `d1p3/pr2-mutations.json` with one entry per file, each a wrong value inside that
      file, for example:

```json
[
  {
    "name": "outbox.js: a number for clientId",
    "file": "client/src/app/outbox.js",
    "find": "const kept = readOutbox(user).filter((existing) => existing.clientId !== clientId);",
    "replace": "const kept = readOutbox(user).filter((existing) => existing.clientId !== clientId);\n  removeFromOutbox(user, 42);",
    "suites": { "typecheck": ["client"] }
  },
  {
    "name": "constants.js: a string typed as a number",
    "file": "client/src/app/constants.js",
    "find": "export const OUTBOX_CACHE_PREFIX",
    "replace": "/** @type {number} */\nconst d1p3Probe = \"x\";\nexport const OUTBOX_CACHE_PREFIX",
    "suites": { "typecheck": ["client"] }
  }
]
```

- [ ] A file with functions gets a call with a wrong argument, as `outbox.js` above; a file
      without, a mistyped declaration, as `constants.js`. Read each `find` from the file as it
      is then, so each applies exactly once.
- [ ] Run it. Expected: 16 of 16 KILLED, each confirmed applied.

### 2e. Measure and ship

- [ ] The no-runtime-change check on the branch: every figure matches `pr2-before.txt`.
- [ ] The gates. Commit, push, open the PR with the figures, report, wait for the OK.

## Task 3: Shared hooks and components (PR 3, `feat/d1p3-shared-ui`)

- [ ] Baseline: the no-runtime-change check on `main`, as `d1p3/pr3-before.txt`.
- [ ] Check these 11, with patterns A to E:

| File                                     | Errors | Beyond plain parameters                                                                                                                                                                                                                           |
| ---------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/useBodyScrollLock.js`             |      1 |                                                                                                                                                                                                                                                   |
| `hooks/useCloseOnEscape.js`              |      3 |                                                                                                                                                                                                                                                   |
| `hooks/useConnection.js`                 |      0 | pragma only                                                                                                                                                                                                                                       |
| `hooks/useFocusTrap.js`                  |     13 | `openTraps` gets a type (TS7034); `opener` is `document.activeElement`, an `Element` to the checker: cast to `HTMLElement \| null`, "the active element of an HTML page is an HTMLElement, or null", which `opener?.focus?.()` already allows for |
| `components/ModalPortal.jsx`             |      4 | `react-dom` is typed by Task 2's package                                                                                                                                                                                                          |
| `components/OfflineHint.jsx`             |      0 | pragma only                                                                                                                                                                                                                                       |
| `components/SwapStep.jsx`                |     12 | state that starts `null` (pattern B); the caught `err` (pattern C); props typedef                                                                                                                                                                 |
| `app/components/AppErrorBoundary.jsx`    |      2 | `@param {unknown} error` on `getDerivedStateFromError` and `componentDidCatch`                                                                                                                                                                    |
| `app/components/AppNotice.jsx`           |      2 | `AppNoticeProps`: `message`, `actionLabel?`, `onAction?`, `onDismiss?`                                                                                                                                                                            |
| `app/components/SignOutConfirm.jsx`      |      3 | props inline or typedef by count                                                                                                                                                                                                                  |
| `app/components/StartSessionConfirm.jsx` |      5 | props inline or typedef by count                                                                                                                                                                                                                  |

- [ ] `TYPE_CHECKED_FILES` 46 to 57.
- [ ] Mutations, one per file as in 2d: a call with a wrong argument where the file calls one
      of its own typed functions (`focusEdge(container, "yes")` in `useFocusTrap.js`), else the
      mistyped declaration. Add one for the props convention: `AppNoticeProps.onAction` typed
      `string`, which must fail where `AppNotice` passes it to `onClick`. Expected: 12 of 12
      KILLED.
- [ ] The no-runtime-change check matches; the gates; ship.

## Task 4: The app hooks (PR 4, `feat/d1p3-app-hooks`)

- [ ] Baseline as `d1p3/pr4-before.txt`.
- [ ] Check these 6:

| File                   | Errors | Beyond plain parameters                                                                                                                                                                                                                                                                                    |
| ---------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useApiClient.js`      |      5 | `options`: `@param {RequestInit & { timeoutMs?: number }} [options]`; `apiFetch` matches `ApiFetch`, `ensureCsrfToken` matches `EnsureCsrfToken`                                                                                                                                                           |
| `useDashboardData.js`  |     26 | the `GEO_NOT_AVAILABLE` error: `/** @type {Error & { code?: string }} */ (new Error(...))`, with why; caught `err` reads `code` and `message` (pattern C, `GeolocationPositionError` or that error); timestamps start `null` (pattern B); `dashboard` is `Dashboard`                                       |
| `useOptimisticLogs.js` |     45 | declare `Toast` and `OptimisticEntry`; `optimisticOpRef` holds `Map<string, Operation>` with a local `Operation` typedef (`type`, `timerId`, `committing`, `undoMessage`, `sending`, `send?`, `undoToastId?`), and `queued` is declared `/** @type {Operation} */`; `showDashboardToast`'s `options` typed |
| `useOutboxReplay.js`   |      9 | caught error (pattern C); entries are `OutboxEntry`                                                                                                                                                                                                                                                        |
| `useStravaSync.js`     |      4 |                                                                                                                                                                                                                                                                                                            |
| `useWorkerUpdate.js`   |      1 | the virtual module is typed by Task 2's `types`                                                                                                                                                                                                                                                            |

- [ ] `TYPE_CHECKED_FILES` 57 to 63.
- [ ] Mutations, one per file. Two more in `useOptimisticLogs.js`, since its types are the
      most built: a toast with `tone: 1`, and an entry pushed without `operationId`. Expected:
      8 of 8 KILLED.
- [ ] The no-runtime-change check matches; the gates; ship.

## Task 5: `events.js` (PR 5, `feat/d1p3-events`)

- [ ] Baseline as `d1p3/pr5-before.txt`.
- [ ] `createAppEventHandlers(deps)`: declare `@typedef {object} AppEventDeps` above it, one
      `@property` per member it reads, typed from the hook or setter that supplies it in
      `App.jsx` (`ApiFetch`, `EnsureCsrfToken`, the `useState` setters as
      `React.Dispatch<React.SetStateAction<T>>`, `queueOptimisticLogCommit` from
      `useOptimisticLogs`'s return type). Where `App.jsx` is still unchecked, type a member by
      what `events.js` does with it.
- [ ] The ten caught errors at lines 216, 351, 593, 634, 660, 679, 787, 813, 838 and 866:
      pattern C, with the comment naming the throwers on that path.
- [ ] Every `res.json()` (20): pattern D.
- [ ] Each call into `requestBodies.js` is now checked against the builder's parameters. A
      mismatch there is the gap phase 2 named: if the call is right and the builder's parameter
      is too narrow, widen the parameter; if the call passes the wrong thing, pattern F.
- [ ] `LogType`: if the three `queueOptimisticLogCommit` calls pass `"workout"`,
      `"calories"` and `"meal"`, narrow `OutboxEntry.type` and `OptimisticEntry.type` to it.
- [ ] `TYPE_CHECKED_FILES` 63 to 64.
- [ ] Mutations: a misspelled field passed to one builder, a number for a string to another,
      a handler called without a required dep. Expected: 3 of 3 KILLED.
- [ ] The no-runtime-change check matches; the gates; ship.

## Task 6: The modal, `App.jsx`, `main.jsx` and the guard (PR 6, `feat/d1p3-app`)

### 6a. The guard, test-first

- [ ] Add to `describe("type-checked files")` in `scripts/__tests__/repo-invariants.test.mjs`,
      after the `TYPE_CHECKED_FILES` test:

```js
// D1 phase 3: the client's data layer is checked whole, so a file added there is
// checked from its first commit (docs/specs/2026-11-16-client-data-layer-types-design.md).
const DATA_LAYER = /^client\/src\/(?:(?:app|hooks|components)\/|(?:App|main)\.jsx$)/;
const isTest = (file) => /(?:^|\/)__tests__\/|\.test\.[cm]?jsx?$/.test(file);

test("every source file in the client's data layer is checked", () => {
  const layer = sources.filter(({ file }) => DATA_LAYER.test(file) && !isTest(file));
  expect(layer.length, "the sweep found too few data-layer files").toBeGreaterThanOrEqual(43);
  const unchecked = layer.filter((source) => !checked.includes(source)).map(({ file }) => file);
  expect(unchecked, "add // @ts-check below the header of each").toEqual([]);
});
```

- [ ] `npm run test:scripts`. Expected: FAIL, listing exactly `PlannerSetupModal.jsx`,
      `App.jsx` and `main.jsx`.

### 6b. Check the last three

| File                                   | Errors | Beyond plain parameters                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/components/PlannerSetupModal.jsx` |     34 | the 15 SVG imports are typed by Task 2; `PlannerSetupModalProps`; the thumbnail map indexed by a `string` gets `@type {Record<string, { image: string, tone: string }>}`; the two maps indexed by `any` get typed keys                                                                                           |
| `App.jsx`                              |     39 | `user` state starts `null` (pattern B, the auth answer, `any`); the planner form state is `PlannerForm`, and `createDefaultPlannerForm` in `requestBodies.js` returns `PlannerForm`; `equipmentOptionsByEnv[prev.environment]` indexes a typed record; the `AppNotice` props errors clear once Task 3 typed them |
| `main.jsx`                             |      2 | `react-dom/client` is typed by Task 2; `document.getElementById("root")` is non-null: cast with that reason                                                                                                                                                                                                      |

- [ ] `PlannerForm` in `requestBodies.js`, with the file's other typedefs:

```js
/**
 * The planner form as App holds it: the generate body, with the fields zod
 * coerces (and so types as `unknown`) given the types the form keeps them in.
 * @typedef {GeneratePlanBody & { equipment: string[], focuses: string[] }} PlannerForm
 */
```

- [ ] Give `createDefaultPlannerForm` the `@returns {PlannerForm}`. Add a field to the
      intersection only if `App.jsx`'s errors name it.
- [ ] `TYPE_CHECKED_FILES` 64 to 67. `npm run test:scripts`. Expected: PASS.

### 6c. Prove it

- [ ] Guard mutations, in `d1p3/pr6-mutations.json` with the `scripts` suite: remove the
      pragma from `client/src/app/outbox.js`; add an unchecked file
      `client/src/app/d1p3-probe.js` (a header and one export; staged, as the sweep reads
      tracked files). Both must fail the new test; delete the probe after.
- [ ] Type mutations: one in each of the three files, and a `PlannerForm` with
      `equipment: number[]` (which must fail where App spreads it). Expected: all KILLED.
- [ ] The no-runtime-change check matches; the gates; ship.

## Task 7: Close-out (PR 7, `docs/d1p3-close-out`)

- [ ] `docs/adr/0017-type-checking-through-jsdoc.md`: a section "The client's data layer
      (phase 3)", decided 2026-11-16: what the data layer is; the guard; responses stay `any`,
      named where passed whole (`Dashboard`), until the server's read side is checked; the
      props convention; patterns B and C; the client tsconfig's `types` and the two `@types`
      packages, and that its "`types` to `[]`" now holds for the server only.
- [ ] `docs/code-readability-sop.md`, rule 2: the props convention in two sentences.
- [ ] The roadmap: `status/D1` with ArtifactData (`if_version`), still active (pages and
      server left), naming phase 3 done.
- [ ] This plan's status: done, with the PRs and every departure from the text above. The
      spec's status: applied.
- [ ] `npx prettier --check` on the edited files, `npm run test:scripts` (the record paths
      exist; `CLAUDE.md` untouched). Ship.
