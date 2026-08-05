# AI Workout

AI Workout is a full-stack fitness planning app. The client guides a user through profile setup, body visualization, workout plan generation, and dashboard views. The server provides authentication, dashboard persistence, AI workout generation, and cached integrations with fitness, meal, weather, and air-quality APIs.

## Tech Stack

- React 18 and Vite for the frontend
- Express 4 for the API server
- Postgres with Prisma Client for user and dashboard data
- Optional Redis-backed sessions with in-memory fallback
- Google Gemini for weekly workout plan generation
- Vitest for client and server tests

## Repository Layout

```text
.
|-- client/          # React/Vite app
|-- server/          # Express API, services, routes, tests
|-- package.json     # npm workspaces and root scripts
`-- package-lock.json
```

## Prerequisites

- Node.js 20 or newer is recommended
- npm
- Postgres running locally, or use the workspace-owned local Postgres helper
- Optional: Redis for persistent sessions across server restarts
- Optional: a Gemini API key for AI plan generation

## Getting Started

Install dependencies from the repository root:

```bash
npm install
```

Create `server/.env` and start with:

```env
PORT=5000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_workout
CLIENT_ORIGIN=http://localhost:5173
GEMINI_API_KEY=
```

Run the full app in development:

```bash
npm run dev
```

The client runs on `http://localhost:5173` and proxies `/api` requests to the server on `http://localhost:5000`.

## Root Scripts

```bash
npm run dev          # Run client and server together
npm run dev:client   # Run only the Vite client
npm run dev:server   # Run only the Express server
npm run build        # Build the client
npm run start        # Start the server
npm run test         # Run client and server tests
```

## Environment Variables

Common server variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | API server port | `5000` |
| `DATABASE_URL` / `POSTGRES_URL` | Postgres connection string | unset |
| `POSTGRES_STARTUP_REQUIRED` | Fail startup if Postgres is unavailable | `true` in production, otherwise `false` |
| `POSTGRES_SSL` | Enable TLS for Postgres connections | `false` |
| `POSTGRES_SSL_REJECT_UNAUTHORIZED` | Reject untrusted Postgres TLS certificates | `true` |
| `CLIENT_ORIGIN` / `CLIENT_ORIGINS` | Allowed CORS origins, comma-separated | loopback origins only when unset; set this before deploying |
| `GEMINI_API_KEY` | Enables `/api/generate` | unset |
| `ANON_GENERATE_RATE_LIMIT_MAX` | Plan generations allowed per IP without signing in | `3` |
| `ANON_GENERATE_RATE_LIMIT_WINDOW_MS` | Window for the anonymous generation quota | `86400000` (24h) |
| `GEMINI_MODEL` | Gemini model for workout generation | `gemini-1.5-flash` |
| `REDIS_URL` | Redis connection URL for sessions | unset |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | Socket-style Redis config | unset |
| `SENTRY_DSN` | Enables Sentry error tracking | unset |
| `LOG_LEVEL` | Pino log level | `info` |

External API variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `OPEN_METEO_BASE_URL` | Weather API base URL | Open-Meteo forecast API |
| `OPENAQ_BASE_URL` | Air quality API base URL | OpenAQ v3 |
| `OPENAQ_API_KEY` | Optional OpenAQ key | unset |
| `WGER_BASE_URL` | Exercise API base URL | wger API |
| `WGER_API_TOKEN` | Optional wger token | unset |
| `WGER_DEFAULT_LANGUAGE` | wger language ID | `2` |
| `MEALDB_BASE_URL` | Meal search API base URL | TheMealDB v1 |

## API Overview

The server exposes:

- System: `GET /api/health`, `GET /api/ready`, `GET /api/metrics`, `GET /api/csrf-token`
- Auth/profile: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET/POST /api/profile`
- Dashboard: `GET /api/dashboard`, `GET /api/dashboard/workout-sessions`, `GET /api/dashboard/meal-logs`, `GET /api/dashboard/progress-metrics`
- Dashboard writes: workout sessions, workout aliases, calories, goals, meal logs, progress metrics, and saved exercises under `/api/dashboard`
- Generation: `POST /api/generate`
- External data: weather, air quality, wger exercise data, and MealDB meal search under `/api`

Unsafe API methods require a CSRF token. The frontend obtains it from `/api/csrf-token`, stores the cookie, and sends it in the `X-CSRF-Token` header.

## Testing

Run all tests:

```bash
npm run test
```

Run one workspace:

```bash
npm run test -w client
npm run test -w server
```

Run the Postgres migration after setting `DATABASE_URL` or `POSTGRES_URL`:

```bash
npm run migrate:postgres -w server
```

Generate or validate the Prisma client/schema:

```bash
npm run prisma:generate -w server
npm run prisma:validate -w server
```

## More Docs

- [Client README](client/README.md)
- [Server README](server/README.md)
