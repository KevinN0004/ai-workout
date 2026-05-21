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

## API Access

Use `src/app/hooks/useApiClient.js` for unsafe requests. It ensures the CSRF cookie exists and sends `X-CSRF-Token` with `POST`, `PUT`, `PATCH`, and `DELETE` requests.

Use `src/app/network.js` when a request should have an explicit timeout.

## Testing Notes

Tests use Vitest, jsdom, and Testing Library. The setup file is `src/test/setup.js`.

Run only client tests from the repo root:

```bash
npm run test -w client
```
