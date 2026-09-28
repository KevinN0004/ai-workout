# AI Workout Client

The client is a React 19 + Vite application for the AI Workout user experience. It includes the profile onboarding flow, responsive dashboard, workout plan UI, meal and exercise discovery views, and client-side API helpers.

## Main Features

- Multi-step home flow for profile capture, body visualization, workout setup, and preview
- Authentication screens for login and signup
- Dashboard routes for summary, workout logs, goals, weekly plans, meal prep, exercise guides, and settings
- Workout plan generation modal with PDF export support
- CSRF-aware API helper for authenticated writes
- Local caching for dashboard, weather, and air-quality data

## Project Layout

```text
client/
|-- index.html
|-- vite.config.js
|-- src/
|   |-- main.jsx                # Entry point
|   |-- App.jsx                 # Top-level routing and app state
|   |-- app/                    # Shared constants, hooks, routing, cache, API helpers
|   |-- assets/                 # Static images
|   |-- components/             # Shared UI components
|   |-- hooks/                  # Shared hooks
|   |-- pages/                  # One folder per route, with its own parts
|   |-- styles/                 # Global CSS
|   `-- test/                   # Vitest setup
`-- package.json
```

## Development

From the repository root:

```bash
npm run dev:client
```

Or from `client/`:

```bash
npm run dev
```

The app serves on `http://localhost:5173`. Vite proxies `/api` to `http://localhost:5000`, so run the server too for authenticated and generated-plan workflows.

## Scripts

```bash
npm run dev        # Start Vite
npm run build      # Build production assets
npm run preview    # Preview the production build
npm run test          # Run Vitest once
npm run test:watch    # Run Vitest in watch mode
npm run test:coverage # Run with coverage and its floors -- what CI runs
```

## Routing

Routing is handled in `src/App.jsx` with browser history state rather than a router package.

- `/` - Home onboarding flow
- `/auth` - Login and signup
- `/plan` - Generated workout plan result view
- `/dashboard` - Dashboard summary
- `/dashboard/workouts` - Workout and activity logs
- `/dashboard/calories` - Calorie and goal tracking
- `/dashboard/plans` - Weekly plan view
- `/dashboard/meal` - Meal planning and logs
- `/dashboard/tips` - Exercise guide recommendations
- `/dashboard/settings` - User settings
- `/dashboard/home` - Dashboard home view

Every dashboard view except the summary is `React.lazy`-loaded and ships as its own
chunk. Adding a view means adding it to `DASH_VIEW_TO_ROUTE` in `DashboardPage.jsx` and
to `DASHBOARD_ROUTE_VIEW_MAP` in `app/constants.js` — the first maps view to URL, the
second maps URL back to view.

## API Access

Use `src/app/hooks/useApiClient.js` for unsafe requests. It ensures the CSRF cookie exists and sends `X-CSRF-Token` with `POST`, `PUT`, `PATCH`, and `DELETE` requests.

Use `src/app/network.js` when a request should have an explicit timeout.

## Bundle Notes

The main chunk is ~487 kB (~149 kB gzipped) and the build emits no size warning, but
only ~13 kB separates it from the 500 kB threshold. It was ~407 kB until React 19, which
alone added the difference. Two things keep it under:

- **`jspdf` is imported dynamically**, inside the export handler in `app/events.js`.
  It is ~399 kB on its own and most sessions never export a PDF. Turning that back into
  a static import would push the main chunk far past the threshold and undo the split
  silently, since the build would still succeed.
- **Dashboard views are `React.lazy`-loaded**, so each is fetched on first visit.

If `npm run build` starts warning about chunks over 500 kB, check first whether
something was pulled back onto the eager path; if nothing was, the margin ran out.

## Testing Notes

Tests use Vitest, jsdom, and Testing Library. The setup file is `src/test/setup.js`.

**Mocking a module the app constructs with `new`.** `app/__tests__/events.test.js` mocks `jspdf`,
which `events.js` loads on demand and calls as `new jsPDF(...)`. `vi.fn()` returns an
arrow function, and arrows are not constructable — so a factory of the shape
`vi.mock("jspdf", () => ({ jsPDF: vi.fn(...) }))` throws _"is not a constructor"_ before
the spy is ever reached. What you see is the spy reporting **zero calls**, which reads
exactly like the mock not being applied. Export a function expression that delegates to
the spy instead:

```js
const jsPDF = vi.fn(() => pdfDoc);
vi.mock("jspdf", () => ({
  jsPDF: function jsPDFMock(...args) {
    return jsPDF(...args);
  }
}));
```

`pages/home/components/physique/geometry.js` guards its HMR block on `import.meta.hot?.data`, not
on `import.meta.hot`. That is deliberate and load-bearing for tests: under vitest
`import.meta.hot` is truthy while its data bag is undefined, so the unguarded version
threw on import and made the module — and everything importing it — impossible to test.
Simplifying that guard back would silently disable about 20 tests.

Run only client tests from the repo root:

```bash
npm run test -w client
```

Coverage is `npm run test:coverage -w client`: 98.68% statements / 93.62% branches as
of 2026-09-28, against a ratchet in `vite.config.js` that must be raised, never
lowered. Judge where a test is worth writing by whether the code _computes_ anything,
not by its file suffix: several `*View.jsx` components carry real derivation, and
`CLAUDE.md` records which files' remaining uncovered branches are unreachable rather
than untested.

## Requests and Sign-out

`app/hooks/useApiClient.js` wraps every call. Two defaults there are invisible when
they work and expensive when they do not:

- `credentials` defaults to `"include"`. Without it the session cookie is not sent and
  every request is anonymous.
- The method is upper-cased before the safe-method check, so a lowercase `"post"` still
  gets a CSRF token rather than being treated as a read and sent unprotected.

A state-changing request whose CSRF token cannot be obtained **throws instead of being
sent**, so the failure surfaces as a message rather than an unexplained 403.

`onLogout` in `app/events.js` clears local state inside a `try`/`catch`, and the order
matters. The button is wired straight to the handler with nothing catching it, so when
the request was awaited bare, a rejection skipped every clear and left the previous
account's dashboard on screen. Both a dead network and `apiFetch` refusing to send
without a CSRF token reach that path. The session cookie is HttpOnly and cannot be
cleared from here, so a failed request may leave the server session alive — clearing
what we can is deliberate.

## Logging an Entry

Workout, calorie and meal submissions go through the optimistic queue; goals, progress
metrics and saved exercises write directly. The difference shows in when the form is
cleared: the optimistic handlers clear immediately because the queue owns the failure,
the direct ones only once the write has landed.

**Empty is not zero.** A workout's `duration`, `sets`, `reps` and `intensityRpe`, and a
meal's macros, are written as `field ? Number(field) : null` so an unfilled field stays
null. A zero-minute session would drag the weekly totals down and a zero-calorie meal
the daily average. `submitCalories` is the exception — `Number(calories || 0)` makes an
empty field `0` — so the three do not agree.

## Saving a Log Entry

`app/hooks/useOptimisticLogs.js` shows a new log entry on the dashboard straight away
and **holds the request back for `OPTIMISTIC_UNDO_WINDOW_MS` (4.5s)** before sending it.
The window is a delay, not a compensation: an undo inside it means the write never
happens, rather than being reversed afterwards. Shortening that timer to zero would make
undo silently useless while every test about the entry appearing still passed — there is
one asserting the request is not called before the window closes.

If the save fails, the optimistic entry is **removed** rather than left on screen. An
entry that stays would look saved and would not be. Undo is refused once the request is
in flight (`operation.committing`), because calling it off at that point would leave the
dashboard disagreeing with the server.

`clearOptimisticOperations` cancels the queued requests as well as clearing the entries;
that is what stops a write queued before a sign-out firing against the next account.

## Generated Plan Parsing

`app/plans.js` parses the plan text Gemini returns. Two things to know:

- **Weekday headings are matched with `startsWith`**, so markdown emphasis defeats them.
  `**Monday - Push**`, `## Monday` and `- Monday` are all invisible, and the week
  collapses into a single "Your plan" section instead of failing visibly.
- **The two parsers disagree about a plan with no weekday headings.**
  `parsePlanSections` falls back to one "Your plan" section, so the Plans view still
  renders; `extractLatestPlanByWeekday` has no fallback and returns `{}`, so the
  dashboard's today panel is empty for the same plan. A test asserts both halves
  together so the asymmetry cannot be half-fixed.

## Exercise Recommendations

`pages/dashboard/tips/recommendationUtils.js` ranks exercises for the Tips view by
adding up matches — category focus `+5`, available equipment `+3`, today's planned
muscles `+2`, and so on — and subtracting `7` for each reported injury the exercise
conflicts with.

**That subtraction is a ranking penalty, not an exclusion.** An exercise matching the
focus, the equipment, the goal wording and today's muscles banks 12 points, so a single
`-7` still leaves it at 5 — above a safe exercise that matches almost nothing. A
movement someone has been told to avoid can therefore still appear, ranked lower.
Excluding one outright needs a filter, not a bigger penalty.

Two details that are not obvious from reading the file:

- `detectInjuryFlags` matches injury names as substrings, and `back` is inside
  `lower back`, so a lower-back note raises **both** rules. They carry the same
  keywords, so a conflicting exercise is penalised twice. The ordering depends on that.
- `getExerciseImage` picks the entry flagged `isMain` that has a url, then falls back to
  `images[0]` — positionally, not to the first entry that has a url. An `images[0]`
  carrying no url yields the placeholder even when a later image would have served.
