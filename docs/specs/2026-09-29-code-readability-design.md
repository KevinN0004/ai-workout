# Code readability — design

Date: 2026-09-29
Branch: `chore/readability-sop`, from `main` at `9b85b7d`.

## Goal

Make every source file readable by someone who did not write it: say what each module is
for, what each export does, why each effect and each non-obvious step exists, and keep the
parts of each file in a predictable order. The folder-level grouping was settled on
2026-09-23 (`docs/specs/2026-09-23-repo-layout-reorganization-design.md`) and is not
reopened here; this effort works _inside_ files.

Success means:

- a written standard, `docs/code-readability-sop.md`, that says what a readable file
  looks like here and how to prove a readability change altered nothing;
- every in-scope file brought up to it, one area per PR;
- a test that fails when a new source file arrives without a header, so the result does
  not decay.

## Decisions

Four choices were put to the owner and settled before this was written.

| Question                 | Decision                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| How far beyond comments  | Comments and in-file tidying first; consolidation of duplicates and split CSS afterwards |
| Comment style            | Prose "why" JSDoc, matching the repositories — no `@param`/`@returns` boilerplate        |
| Keeping it from decaying | A ratchet test with a shrink-only allowlist, plus one line in the PR template            |
| Sequencing               | One PR per area, most-read first                                                         |

Rejected: typed JSDoc on every export (roughly triples comment volume, and nothing checks
the types, so they drift); an ESLint `jsdoc` rule (`CLAUDE.md` records that ESLint is scoped
to defect classes, not style); splitting large files (`CLAUDE.md` treats length as a smell,
not a limit, and asks for single-export files to be left whole).

## Baseline

Measured on 2026-09-29 against `9b85b7d`, over all **396** tracked files. Every JS, JSX,
MJS and CJS file was parsed with espree (ESLint's own parser) and every CSS file with
postcss, so the numbers below are counts of syntax, not of lines that look like comments.
The scanner is reproduced in the plan, so each figure can be re-measured.

"Comment" below excludes tool directives (`eslint-disable`, `@vitest-environment` and the
like). "Header" means a comment before the first statement that is not an import.

### JavaScript source (tests excluded): 150 files, 21,686 lines of code

| Area                              | Files | Comment lines per code line | With a header | With no comment at all | Exports with a comment |
| --------------------------------- | ----- | --------------------------- | ------------- | ---------------------- | ---------------------- |
| server/repositories               | 10    | 0.43                        | 10            | 0                      | 2 / 20                 |
| server bootstrap, db, middleware  | 9     | 0.20                        | 5             | 0                      | 4 / 14                 |
| server/services                   | 15    | 0.10                        | 3             | 2                      | 7 / 37                 |
| server/routes                     | 17    | 0.07                        | 2             | 11                     | 0 / 20                 |
| client/app                        | 16    | 0.09                        | 3             | 6                      | 3 / 30                 |
| client/pages/dashboard            | 32    | 0.02                        | 2             | 19                     | 1 / 42                 |
| client/pages/home (not preview)   | 16    | 0.01                        | 1             | 11                     | 1 / 21                 |
| client/pages/home/preview         | 11    | 0.01                        | 0             | 6                      | 0 / 18                 |
| client/pages/auth, workout-result | 2     | 0.01                        | 0             | 1                      | 0 / 2                  |
| other (scripts, configs, shared)  | 22    | 0.04–1.09                   | 10            | 3                      | 6 / 15                 |
| **Total**                         | 150   | **0.07**                    | **36**        | **59**                 | **24 / 219**           |

"Exports" counts exported functions, components and hooks; "with a comment" means one ends
on the line directly above.

- **98 functions of 40 or more lines have no comment inside them or directly above.** The
  largest: `buildPhysiqueSilhouetteGeometry` (889 lines), `useHomeStageFlow` (525),
  `useBodyModel` (444), `AuthPage` (394), `HomePersonalStage` (352).
- **45 of 46 effects** (`useEffect`/`useLayoutEffect`) have no comment at the effect saying
  why it exists. A few are explained elsewhere — `useCloseOnEscape`'s by the hook's own
  header, `usePreviewChapterFlow`'s by a dependency note at its foot — so this overstates
  the gap slightly; it does not overstate it much.
- **Server repositories are the model to copy.** Every one has a header, and
  `saveMealLog`'s JSDoc says what it does, why it does not use `upsert`, and what it returns
  on failure.

### CSS: 49 files, 9,913 lines

- **7 comments in total.** No file has a header; 44 have no comment at all.
- 597 declarations hard-code a colour, against 535 `var()` uses and 204 custom-property
  definitions. 143 `!important`, 33 literal `z-index` values.
- Byte-order marks are inconsistent: 19 CSS files and 4 JS files carry one.

### Grouping inside and across files

- **The walkthrough's styles live in two places.** `home/styles/core/preview.css`, and the
  preview rules in `home/styles/core/personal.css` and `layout.css`, define **27** root-level
  selectors that `home/preview/styles/` defines again. Both sets load whenever the home page
  renders, so which declaration wins depends on load order.
- **Dead-CSS candidates.** `.preview-fields-grid`, `.preview-field-row` and its three
  descendants are defined in both of those places and referenced by no JS, JSX or HTML file,
  including through template-built class names. They match the textarea grid that
  `CLAUDE.md` records as removed from `PreviewStage`. Candidates, not confirmed: see PR 11.
- **Duplicated helpers.** Four groups of top-level functions have character-for-character
  identical bodies: `getRegionFromLocale` (`app/units.js`,
  `home/preview/utils.js`); `buildLinePath` and `buildPreviewLinePath`; `toJsonObject`
  (`userReadRepository.js`, `userRepository.js`); and `toProfileNumber`, `useBodyModel`'s
  `toFiniteNumber` and the server's `toNumberOrNull`. Fourteen names are defined in more
  than one file, among them `clamp` (4) and `toJsonArray` (4).
- **`server/src/index.js` is 836 lines** with configuration, service construction and
  middleware wiring interleaved and no section markers. It is the most-changed source file
  in the repository — 31 of the 502 commits since 2026-07-01 — and `CLAUDE.md` still gives
  its length as ~697.
- **Static values inside hooks.** `useHomeStageFlow` rebuilds `stageOrder` and its timing
  constants on every render, inside the hook body.
- `HomePage.jsx` imports its stylesheet first and its local modules in no order; every
  other file follows packages → local → styles.

### Comments that record history

31 comments match a history pattern ("used to", "Task 3 of docs/plans/…", a PR number, a
commit hash). Two are false positives that describe current behaviour. The other **29**:

- **11 provenance references.** Nine are in the headers of **8** repository files, which
  open with "Task N of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md"; one cites
  PR #178 (`client/vite.config.js`); one cites commit `c2c820f`
  (`dashboardDataBuildersService.js`).
- **18 "used to" narratives**, from `GeneratedPlanModal.jsx` to
  `registerMealAndMetricRoutes.js`. Some carry a real guard rationale in past tense; some
  only describe code that has been deleted.

### Already healthy

No `TODO`/`FIXME`/`HACK`, and no commented-out code (the ten lines that look like it are
prose ending in a semicolon). Every `eslint-disable` carries its reason in the comment
above it. 88 of 126 test files have a header. The root configs were commented by the
layout effort. Import order is clean everywhere but `HomePage.jsx`.

## 1. The standard

This is what `docs/code-readability-sop.md` says. It applies to every non-test source file.

**A header, first in the file.** One to four lines, above the imports: what the module is
for, and what owns or uses it. For a factory, what it is given and what it returns. For a
stylesheet, what component or page it styles, and — when it matters — that it depends on
its position in the import order. A header is not a changelog. The repositories currently
place theirs below the imports; they move up, which is itself a comment-only change.

**A `/** */` summary on every export** — function, component, hook. Prose: what it is for,
what it returns, what it assumes. `@param` only for a shape the reader cannot guess, such
as a factory's dependency object. An export may go without one only when its name and
signature already say all of that, and a PR that leaves one bare names it.

**Inside functions:**

- every effect gets one line saying what it keeps in sync and why that trigger — unless it
  is the only effect in a hook whose header already says so;
- a function of 40 or more lines gets section comments naming its steps (in JSX,
  `{/* … */}`);
- a table of tuning numbers — fallback sizes, clamp bounds, animation timings — gets one
  comment giving its units and where the numbers come from;
- comments say _why_. `// set loading to true` is not written.

**Present tense.** A comment states the current reason. Provenance goes — "Task 3 of
docs/plans/…", "reinstated from commit …", "a ~110-line pipeline used to sit here" — because
git history and the plans already hold it. A guard's rationale stays, rewritten in the
present ("without this, a null reading becomes 0 °C"). A warning against one specific
past regression may name it once.

**Order within a JS file:** header → imports (packages, then local modules, then styles and
assets) → module constants → private helpers → exports. A value inside a component or hook
that depends on neither props nor state moves to module scope.

**Two hard limits, because order is behaviour in both:**

- **Hook calls are never reordered.** Effects run in declaration order. A component is
  grouped with section comments, not by moving its hooks.
- **Middleware and route registration in `index.js`, and CSS rules anywhere, are never
  moved.** They get section banners only.

**New code only.** New colours go through a custom property; a new `!important` carries a
comment saying what it overrides; new files carry no byte-order mark. The existing 597
colours, 143 `!important`s and 23 byte-order marks are left alone.

**Tests.** A new test file opens with a header saying what it pins and what it stubs, the
idiom 88 existing test files already follow. Test files are outside the ratchet.

## 2. Verification

**Every area PR has two commits, and each gets the proof that fits it.**

The **comments commit** changes no code, and that is proven, not asserted:

- **Client:** `npm -w client run build` produces a byte-identical `client/dist`. Verified on
  2026-09-29 in both directions: a JSDoc block added to `app/units.js` and a banner added
  to `dashboard/styles/toast.css` left `client/dist` identical (`diff -r` exit 0), and a
  one-character change to a string literal in `units.js` changed every chunk's content hash.
- **Server and scripts,** which have no bundle: a scratch checker parses each changed file
  at the parent commit and at HEAD with espree, with comments and positions dropped, and
  requires identical syntax trees. The plan proves the checker by mutation before it is
  relied on: a comment-only edit must pass, and a one-token code edit must fail.
- Test counts unchanged on all three suites.

The **tidy commit** — constants to module scope, header moves, import order — changes code,
so it gets the full set of gates: test counts unchanged, `npm run test:coverage` above both
floors, `npm run lint` at 0 errors and 0 warnings, `npm run knip`, `npm run format:check`,
`npm run build`, and `npm run test:e2e`.

**Quality is measured per PR.** The ratchet sees only headers. Each area PR runs the
scanner over its own files and reports before and after: headers, exports documented,
effects commented, long functions with section comments. The target is 100% on each, and
any exception is named in the PR.

## 3. Enforcement

A new `describe` block in `scripts/__tests__/repo-invariants.test.mjs`, reading an allowlist
from `scripts/__tests__/file-header-allowlist.json`. It uses a hand-written check like its
neighbours, so it adds no dependency.

**In scope:** tracked `.js`, `.jsx`, `.mjs`, `.cjs` and `.css` files under `client/src`,
`server/src`, `server/scripts`, `scripts` and `e2e`, and every tracked `*.config.js`; excluding
`*.test.*`, `*.spec.*`, anything under `__tests__/`, and `client/src/test/setup.js`. That is
**198** files today.

**The rule:** after a byte-order mark and a shebang, the first non-blank line is a comment
that is not a tool directive. **13** of the 198 pass today, so the allowlist starts at
**185** entries.

**Three assertions:**

1. every in-scope file not on the allowlist has a header;
2. every allowlisted file still **lacks** one — a file that gains a header has to leave the
   list, so the list only shrinks, and at zero the block has nothing left to allow;
3. every allowlisted path is a tracked file, so a rename or deletion cannot leave a stale
   entry behind.

Each assertion is shown to bite by mutation before the PR merges.

`.github/pull_request_template.md` gains one checkbox: new or changed source files follow
`docs/code-readability-sop.md`.

## 4. The PRs

### Phase 1: comments and tidying

Counts measured from the baseline scan. The nine area PRs cover all 198 in-scope files with
none left over, and their "no header" column sums to the 185 on the allowlist.

| PR  | Area                                                                                         | Files | No header | Exports without a comment | Effects without a comment | Long functions without a comment | History comments |
| --- | -------------------------------------------------------------------------------------------- | ----- | --------- | ------------------------- | ------------------------- | -------------------------------- | ---------------- |
| 0   | The SOP, the ratchet and its allowlist, the PR-template line, the `docs/` index, `CLAUDE.md` | —     | —         | —                         | —                         | —                                | —                |
| 1   | Server bootstrap, middleware, routes                                                         | 23    | 21        | 23                        | 0                         | 14                               | 5                |
| 2   | Server services, repositories, db, server scripts and config                                 | 31    | 25        | 55                        | 0                         | 14                               | 12               |
| 3   | Client shell: `App.jsx`, `main.jsx`, `app/`, shared `components/` and `hooks/`, Vite config  | 22    | 20        | 30                        | 21                        | 14                               | 5                |
| 4   | Dashboard page (JS)                                                                          | 32    | 32        | 41                        | 12                        | 24                               | 3                |
| 5   | Home page (JS), including the physique silhouette                                            | 16    | 16        | 20                        | 6                         | 21                               | 2                |
| 6   | Preview walkthrough, auth and workout-result pages (JS)                                      | 13    | 13        | 20                        | 6                         | 10                               | 2                |
| 7   | CSS: global, planner, dashboard, auth, workout-result                                        | 25    | 25        | —                         | —                         | —                                | —                |
| 8   | CSS: home and preview                                                                        | 24    | 24        | —                         | —                         | —                                | —                |
| 9   | Tooling: `scripts/`, `e2e/`, root configs                                                    | 12    | 9         | 6                         | 0                         | 1                                | 2                |

"History comments" counts pattern matches before the two false positives are removed.

PR 0 also corrects `CLAUDE.md`'s "~697 lines" for `index.js`. PR 1 gives `index.js` section
banners — imports, environment preflight, logging, security headers, configuration,
repositories, services, rate limiters, middleware, routes, startup, exports — without
moving any `app.use` or route registration. PR 2 rewrites the eight repository headers.
PRs 7 and 8 add headers and section banners only; no rule moves.

### Phase 2: consolidation

Each changes behaviour, so each carries its own proof.

**PR 10 — duplicated helpers.** Every pair is re-read before it is merged; the scan is a
lead, not a verdict.

- To merge, where the bodies are verbatim or are meant to agree: `getRegionFromLocale`;
  `buildLinePath` with `buildPreviewLinePath`, into `client/src/app/` because two pages use
  it; `toJsonObject`, and `toJsonArray` if its four copies match, into
  `repositories/rowValues.js`; `parseDateValue`, whose two copies are both on the dashboard
  page; `cleanText`, `validateQuery` and `validateParams` if their bodies match.
- To leave: one-liners such as `clamp` and `roundTo`, where an import across pages costs
  more than the copy; client/server pairs, which have no shared runtime module; the numeric
  coercion helpers that `numericCoercion.contract.test.js` enumerates, unless their rows are
  updated in the same PR.
- Proof: all gates, and the contract test still enumerating every remaining helper.

**PR 11 — dead CSS.** A sweep of every class selector in every stylesheet against every
`className` in the JSX, including template-built names, then each candidate confirmed by
hand before deletion — `.preview-field*` first. Proof: full-page screenshots byte-identical
before and after, plus the E2E and axe suites.

**PR 12 — one home for the walkthrough's styles.** The walkthrough rules in
`home/styles/core/` move into `home/preview/styles/`, and the 27 duplicated selectors are
merged in today's cascade order, so whichever declaration wins now still wins. The plan
first establishes from the built CSS which copy loads later. Proof: screenshots of every
home stage and every preview chapter, at desktop and phone widths, pixel-identical before
and after.

## Out of scope

- Splitting or restructuring files and functions.
- The existing hard-coded colours, `!important`s and literal `z-index` values.
- Byte-order-mark normalisation.
- The four `.height-*` selectors defined by both `AuthPage.css` and
  `home/styles/forms-and-motion.css`: two pages, not the split this effort consolidates.
- Existing test files, and the prose of Markdown documents.
- `docs/plans/**` and existing `docs/specs/**`, which are dated records.

## Documents

- this spec;
- `docs/plans/2026-09-29-code-readability.md` — the implementation plan, one task per PR,
  listing every file each area PR covers, with the scanner, the syntax-tree checker and the
  ratchet test written out in full;
- `docs/code-readability-sop.md` — the standing SOP. Undated, because it is kept current,
  like `docs/deploy-runbook.md`: the rules from §1, a checklist per kind of file (plain
  module, React component, hook, factory or route registrar, stylesheet, config), the
  verification procedure from §2 as steps to run, and worked examples from this codebase.

`docs/README.md` lists all three.
