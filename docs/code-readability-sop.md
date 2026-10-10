# Code readability SOP

How a source file in this repository is commented and ordered, and how to prove a
readability change altered nothing. It applies to every file you create or edit.

Why this exists and how it was decided: `docs/specs/2026-09-29-code-readability-design.md`.
The effort that brought the existing tree up to it: `docs/plans/2026-09-29-code-readability.md`.

## The rules

### 1. A header, first in the file

Every non-test source file — `.js`, `.jsx`, `.mjs`, `.cjs`, `.css` — opens with a comment of
one to four lines of text, **above the imports**, saying what the module is for and what
owns or uses it. A line holding only a delimiter (`/**`, `/*`, `*/` or `//`) does not count.

- For a factory, also say what it is given and what it returns.
- For a stylesheet, name the component or page it styles, and say so when it depends on
  its position in the import order.
- A header is not a changelog and not a table of contents.
- A tool directive (`eslint-disable`, `prettier-ignore`) is not a header. If a file needs
  one, it goes below the header.

`scripts/__tests__/repo-invariants.test.mjs` fails on a file in its scope that does not
open with a header. The scope is every tracked `.js`, `.jsx`, `.mjs`, `.cjs` and `.css` file
under `client/src`, `server/src`, `server/scripts`, `scripts` and `e2e`, plus every
`*.config.js`, leaving out tests: `*.test.*` and `*.spec.*` files, anything in a
`__tests__/` folder, and `client/src/test/setup.js`. `server/vitest.setup.js` is test setup
too, and is outside the scope because it sits in none of those folders.

Its allowlist, `scripts/__tests__/file-header-allowlist.json`, is empty, so every file in
that scope must open with a header. **Never add a file to it:** a new file gets a header
instead. `ALLOWLIST_SIZE` in the test pins the list's length, so an entry also means raising
that constant, which review should refuse.

### 2. A summary on every export

Every exported function, component and hook has a `/** */` comment directly above it, in
prose: what it is for, what it returns, and anything it assumes.

- Use `@param` only for a shape the reader cannot guess — a factory's dependency object, an
  options bag. Do not restate a parameter the name already explains.
- No `@returns {string}`-style types. Nothing checks them, so they drift.
- An export may go without one only when its name and signature already say all of that.
  If you leave one bare, say which in the PR.

### 3. Inside functions: say why

- **Every effect** (`useEffect`, `useLayoutEffect`) gets one line saying what it keeps in
  sync and why that trigger. The exception is a hook whose only effect is already
  explained by the hook's own summary.
- **A function of 40 or more lines** gets section comments naming its steps. In JSX, write
  them as `{/* ---- Step name ---- */}`.
- **A table of tuning numbers** — fallback sizes, clamp bounds, animation timings — gets one
  comment giving the units and where the numbers come from.
- **Comments explain why, not what.** `// set loading to true` above `setLoading(true)` is
  noise. `// cleared before the request so a retry never shows the last error` is not.
- **An `eslint-disable` carries its reason** in the comment above it, as every existing one
  does.
- **Every claim is checked against the code it names**, including code in other files,
  before it is written. A comment that says something the code does not do is worse than
  none, and none of the scanners can catch one.
- **No numbers that live elsewhere.** A cap, a count or a line number defined in another
  file changes without the comment noticing. Name where it lives instead: "capped on read
  by userReadRepository", not "capped at 200".

No test enforces rules 2 and 3. To measure them, run the scanner in the plan
(`docs/plans/2026-09-29-code-readability.md`, Task 0, Steps 2–3): `scan.mjs`, then
`area.mjs` for a per-file checklist.

### 4. Present tense

A comment states the reason the code is the way it is **now**.

- Provenance goes: "Task 3 of docs/plans/…", "reinstated from commit c2c820f", "a ~110-line
  pipeline used to sit here". Git history and the plans already hold it, and it goes stale
  the moment the code moves on.
- A guard's rationale stays, rewritten in the present: "without this, a null reading
  becomes 0 °C".
- A warning against one specific past regression may name it once, when naming it is what
  stops someone reintroducing it.

### 5. Order within a file

**JS:** header → imports → module constants → private helpers → exports.

- Imports: packages first, then local modules, then stylesheets and assets.
- A value inside a component or hook that depends on neither props nor state — a literal
  table, a fixed duration — moves to module scope, so it is built once and is visible at the
  top of the file.

**Two hard limits, because in both places order _is_ behaviour:**

- **Never reorder hook calls.** Effects run in declaration order. Group a long component
  with section comments, not by moving its hooks.
- **Never move CSS rules, or middleware and route registration in `server/src/index.js`.**
  The cascade and the Express stack both depend on position. Add section banners instead.

**CSS:** header → section banners dividing the file into its parts. Rules stay where they
are.

### 6. New code only

These apply to what you write, not to what already exists:

- a new colour goes through a custom property (`var(--…)`), not a literal;
- a new `!important` carries a comment saying what it overrides;
- a new file has no byte-order mark. Leave existing ones alone: removing them is a separate
  change.

### 7. Tests

A new test file opens with a header saying what it pins and what it stubs — the idiom most
existing suites follow. Test files are outside the ratchet.

## Formats

**JS header** — a block comment, above the imports:

```js
/**
 * Prisma-native persistence for meal logs: the row mapper the API returns, the
 * save, and the calorie entry derived from each day's meals.
 */
import { dateOnlyToDate, toDateOnly, toIso, toNumberOrNull } from "./rowValues.js";
```

**CSS header** — after the byte-order mark if the file has one, before the first rule:

```css
/* Dashboard drawer and backdrop: the slide-in navigation opened from the header's
   menu button. Loaded by DashboardPage.css after theme.css, whose tokens it uses. */
```

**Section banners** in JS and CSS, padded with dashes to column 80:

```js
// ---- Rate limiters ----------------------------------------------------------
```

```css
/* ---- Backdrop ------------------------------------------------------------ */
```

In JSX, a banner is a comment among the element's children, on one line and not padded:

```jsx
<div className="modal plan-modal">
  {/* ---- Header: title and close ---- */}
  <div className="modal-header">
    <h2>Your plan</h2>
  </div>
</div>
```

## Checklists

Work through the one that matches the file. Every box is a question to answer, not a
comment to add for its own sake.

**Plain module** (`app/units.js`, `repositories/rowValues.js`)

- [ ] Header first: what the module is for, and who uses it
- [ ] Every export summarised
- [ ] Any tuning table explained (units, origin)
- [ ] No provenance in comments
- [ ] Imports in order; module constants above helpers, helpers above exports

**React component** (`views/MealView.jsx`)

- [ ] Header first: what it renders, and which page or component renders it
- [ ] The component's summary says what its props are for when that is not obvious
- [ ] Every effect has its one line
- [ ] Over 40 lines: `{/* ---- … ---- */}` sections in the JSX, and section comments above
      groups of hooks — without moving the hooks
- [ ] Literal constants inside the body moved to module scope

**Hook** (`hooks/useCloseOnEscape.js`)

- [ ] Header and summary: what state it owns, what it returns, what it expects of its
      caller
- [ ] Every effect explained, or the only effect explained by the summary
- [ ] Refs and timers grouped under a section comment when there are many

**Factory or route registrar** (`services/auth/sessionService.js`, `routes/authRoutes.js`)

- [ ] Header: what it builds or registers, and where it is wired up
- [ ] The summary names the dependency object's non-obvious members (`@param` here is fine)
- [ ] Each route handler of 40+ lines has section comments: validate, load, write, respond
- [ ] Nothing reordered in `index.js`: banners only

**Stylesheet**

- [ ] Header first (after the byte-order mark, if there is one): what it styles, who
      imports it, and whether its position in the import order matters
- [ ] Section banners for each part of the component, and for any `@media` or
      `@keyframes` block
- [ ] No rules moved, no values changed

**Config file** (`*.config.js`)

- [ ] Header: what the tool is configured for, and which `npm run` script reads it
- [ ] Every non-default setting has its reason beside it

## Proving a change is readability-only

A readability change is proven, not asserted. Keep **comments** and **code** in separate
commits: a comment-only commit can be proven to change nothing, and a commit that mixes the
two cannot.

**For a comment-only commit:**

1. **Client:** build before and after, and compare. The build strips comments, so the
   output must be byte-identical:

   ```bash
   npm -w client run build > /dev/null 2>&1; echo "build exit=$?"
   rm -rf /tmp/dist-before && cp -r client/dist /tmp/dist-before
   # ...make the comment edits...
   npm -w client run build > /dev/null 2>&1; echo "build exit=$?"
   diff -r /tmp/dist-before client/dist > /dev/null; echo "identical exit=$?"   # must be 0
   ```

   This was verified in both directions on 2026-09-29: comment edits left `client/dist`
   identical, and a one-character code change altered every chunk's hash.

2. **Server and scripts** have no bundle. Use the syntax-tree checker from the plan
   (`docs/plans/2026-09-29-code-readability.md`, Task 0, `same-code.mjs`). Copy it
   to a scratch directory and run it from there. It parses every changed file at `HEAD`
   and in the working tree with the repo's own espree and postcss, discards comments and
   positions, and exits 1 if anything else differs. Run it **before** committing.

3. Test counts unchanged: `npm test`, and compare the `Tests` lines with the run before
   your change.

**For a commit that moves code** — module constants, import order — run the full set:
`npm test`, `npm run test:coverage` (above both floors), `npm run lint` (0 errors, 0
warnings), `npm run knip`, `npm run format:check`, `npm run build` and `npm run test:e2e`.

**For a change to CSS that moves or merges rules**, which comment-only proofs cannot cover,
capture full-page screenshots and computed-style dumps before and after with a paused page
clock, and compare them. Use the capture tool listed in the plan, Task 13, Step 1: it pauses
the clock, checks from the DOM that each capture shows the state its file is named for, and
writes every element's computed style beside each screenshot. Task 12's earlier listing
does not pause the clock, so it never photographs Personal Info (Findings §14).

## Examples from this codebase

**A summary to copy** — `saveMealLog` in `server/src/repositories/mealLogRepository.js`
says what it does, why it does not use `upsert`, and what it returns on failure:

```js
/**
 * Inserts a meal, or updates the existing row carrying the same legacy id for
 * this user. Read-then-write rather than `upsert` for the same reason as the
 * other repositories: `meal_logs_user_legacy_idx` is a partial unique index,
 * which schema.prisma cannot express.
 *
 * Returns null when the user cannot be resolved.
 */
```

**A header to copy** — `client/src/hooks/useCloseOnEscape.js` says what the hook is for
and what it makes possible elsewhere, which is why its one effect needs no comment of its
own.

**Provenance, rewritten in the present.** Before:

```js
/**
 * Prisma-native persistence for meal logs.
 *
 * Task 3 of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md.
 */
```

After — the plan reference goes, and what the file does takes its place:

```js
/**
 * Prisma-native persistence for meal logs: the row mapper the API returns, the
 * save, and the calorie entry derived from each day's meals.
 */
```

**An effect, explained.** Before (`client/src/App.jsx`):

```js
useEffect(() => {
  const onPop = () => setRoute(window.location.pathname);
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}, []);
```

After:

```js
// `go` navigates with pushState, which fires no event, so the browser's back and
// forward buttons are the only route changes this has to hear about.
useEffect(() => {
  const onPop = () => setRoute(window.location.pathname);
  window.addEventListener("popstate", onPop);
  return () => window.removeEventListener("popstate", onPop);
}, []);
```

## Known debt this SOP does not cover

Recorded so nobody mistakes it for an oversight:

- Many existing declarations hard-code a colour or carry `!important`; the rules above
  apply to new ones only.
- Some files carry a byte-order mark and the rest do not.
- `.height-split`, `.height-field`, `.height-field input` and `.height-unit` are styled by
  both `AuthPage.css` and `home/styles/forms-and-motion.css`.
- Large files are not split. `CLAUDE.md` explains why length alone is not a reason.
