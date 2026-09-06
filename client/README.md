# AI Workout Client

The client is a React 18 + Vite application for the AI Workout user experience. It includes the profile onboarding flow, responsive dashboard, workout plan UI, meal and exercise discovery views, and client-side API helpers.

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
|   |-- App.jsx                 # Top-level routing and app state
|   |-- app/                    # Shared constants, hooks, routing, cache, API helpers
|   |-- components/             # Shared UI and visualization components
|   |-- pages/                  # Page-level views
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
npm run test       # Run Vitest once
npm run test:watch # Run Vitest in watch mode
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

The main chunk is ~402 kB (~128 kB gzipped) and the build emits no size warning. Two
things keep it there:

- **`jspdf` is imported dynamically**, inside the export handler in `app/events.js`.
  It is ~386 kB on its own — roughly half the bundle — and most sessions never export a
  PDF. Turning that back into a static import would undo the split silently, since the
  build would still succeed.
- **Dashboard views are `React.lazy`-loaded**, so each is fetched on first visit.

If `npm run build` starts warning about chunks over 500 kB, something was pulled back
onto the eager path.

## Testing Notes

Tests use Vitest, jsdom, and Testing Library. The setup file is `src/test/setup.js`.

`components/physique/geometry.js` guards its HMR block on `import.meta.hot?.data`, not
on `import.meta.hot`. That is deliberate and load-bearing for tests: under vitest
`import.meta.hot` is truthy while its data bag is undefined, so the unguarded version
threw on import and made the module — and everything importing it — impossible to test.
Simplifying that guard back would silently disable about 20 tests.

Run only client tests from the repo root:

```bash
npm run test -w client
```

Coverage is `npm run test:coverage -w client`, currently 56.9% statements / 36.6%
branches. Prefer the logic modules to the view components when adding tests —
`app/units.js` and `pages/dashboard/tips/recommendationUtils.js` are both above 98%
and were worth far more than their line count.

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
