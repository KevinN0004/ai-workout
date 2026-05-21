# AI Workout

AI Workout is a full-stack fitness planning app. The client guides a user through profile setup, body visualization, workout plan generation, and dashboard views. The server provides authentication, dashboard persistence, AI workout generation, and cached integrations with fitness, meal, weather, and air-quality APIs.

## Tech Stack

- React 18 and Vite for the frontend
- Express 4 for the API server
- MongoDB with Mongoose for user and dashboard data
- Optional Redis-backed sessions with in-memory fallback
- Google Gemini for weekly workout plan generation
- Vitest for client and server tests

## Repository Layout

```text
.
|-- client/          # React/Vite app
|-- server/          # Express API, models, services, routes, tests
|-- data/            # Legacy/local JSON data
|-- package.json     # npm workspaces and root scripts
`-- package-lock.json
```

## Prerequisites

- Node.js 20 or newer is recommended
- npm
- MongoDB running locally, or a MongoDB connection string
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
MONGODB_URI=mongodb://127.0.0.1:27017/ai_workout_backend
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
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/ai_workout_backend` |
| `MONGODB_STARTUP_REQUIRED` | Fail startup if MongoDB is unavailable | `true` in production, otherwise `false` |
| `CLIENT_ORIGIN` / `CLIENT_ORIGINS` | Allowed CORS origins, comma-separated | allow any origin when unset |
| `GEMINI_API_KEY` | Enables `/api/generate` | unset |
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

## More Docs

- [Client README](client/README.md)
- [Server README](server/README.md)
