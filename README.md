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

- Node.js `^22.13 || >=24` (see `.nvmrc`; development is on Node 24)
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

### Local dependencies with Docker

`docker-compose.yml` brings up Postgres and Redis only. The app is deliberately not containerised, so Vite and `node --watch` keep running natively.

```bash
docker compose up -d               # Postgres on 55432, Redis on 6379
npm -w server run migrate:postgres # the container starts empty
```

Then set in `server/.env`:

```text
DATABASE_URL=postgresql://postgres:ai_workout_dev@127.0.0.1:55432/ai_workout
```

Compose and `npm run postgres:local:start -w server` both bind **55432** and are therefore mutually exclusive — use one or the other, not both.

Redis is opt-in: the server falls back to in-memory sessions unless `REDIS_URL` is set, so starting the container alone changes nothing. To use it, set `REDIS_URL=redis://127.0.0.1:6379`.

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

A complete template lives in [`env.example`](env.example). Copy it to `server/.env` and fill
in the values that matter for your setup. The server validates this environment at startup and
reports every problem at once, rather than failing on the first one it happens to hit.

Common server variables:

| Variable                                                                    | Purpose                                                                                    | Default                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `PORT`                                                                      | API server port                                                                            | `5000`                                                      |
| `DATABASE_URL` / `POSTGRES_URL`                                             | Postgres connection string                                                                 | unset                                                       |
| `POSTGRES_STARTUP_REQUIRED`                                                 | Fail startup if Postgres is unavailable                                                    | `true` in production, otherwise `false`                     |
| `POSTGRES_SSL`                                                              | Enable TLS for Postgres connections                                                        | `false`                                                     |
| `POSTGRES_SSL_REJECT_UNAUTHORIZED`                                          | Reject untrusted Postgres TLS certificates                                                 | `true`                                                      |
| `CLIENT_ORIGIN` / `CLIENT_ORIGINS`                                          | Allowed CORS origins, comma-separated                                                      | loopback origins only when unset; set this before deploying |
| `GEMINI_API_KEY`                                                            | Enables `/api/generate`                                                                    | unset                                                       |
| `ANON_GENERATE_RATE_LIMIT_MAX`                                              | Plan generations allowed per IP without signing in                                         | `3`                                                         |
| `ANON_GENERATE_RATE_LIMIT_WINDOW_MS`                                        | Window for the anonymous generation quota                                                  | `86400000` (24h)                                            |
| `GEMINI_MODEL`                                                              | Gemini model for workout generation                                                        | `gemini-1.5-flash`                                          |
| `REDIS_URL`                                                                 | Redis connection URL for sessions                                                          | unset                                                       |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | Socket-style Redis config (takes precedence over `REDIS_URL`)                              | unset                                                       |
| `REDIS_CONNECT_TIMEOUT_MS`                                                  | How long startup waits for Redis before falling back to in-memory sessions                 | `10000`                                                     |
| `REDIS_STARTUP_REQUIRED`                                                    | Fail startup when Redis is configured but unreachable, instead of using in-memory sessions | `false`                                                     |
| `SHUTDOWN_TIMEOUT_MS`                                                       | Grace period for draining requests and closing connections on SIGTERM/SIGINT               | `10000`                                                     |
| `SENTRY_DSN`                                                                | Enables Sentry error tracking                                                              | unset                                                       |
| `SENTRY_ENVIRONMENT`                                                        | Environment tag sent to Sentry                                                             | `NODE_ENV`, else `development`                              |
| `SENTRY_RELEASE`                                                            | Release tag sent to Sentry                                                                 | unset                                                       |
| `SENTRY_TRACES_SAMPLE_RATE`                                                 | Sentry trace sampling, clamped to 0–1                                                      | `0`                                                         |
| `SENTRY_SHUTDOWN_TIMEOUT_MS`                                                | How long shutdown waits for Sentry to flush                                                | `2000`                                                      |
| `LOG_LEVEL`                                                                 | Pino log level                                                                             | `info`                                                      |
| `LOG_REDACT_PATHS`                                                          | Extra comma-separated log paths to redact, on top of the defaults                          | unset                                                       |

Rate limiting. Each bucket is separate; a request can be counted by more than one.

| Variable                                                        | Purpose                                                                                                                                                                             | Default                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `API_RATE_LIMIT_WINDOW_MS` / `API_RATE_LIMIT_MAX`               | Global limit on everything under `/api`                                                                                                                                             | `900000` (15m) / `300` |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX`             | Limit on signup and login                                                                                                                                                           | `600000` (10m) / `25`  |
| `CREDENTIAL_RATE_LIMIT_WINDOW_MS` / `CREDENTIAL_RATE_LIMIT_MAX` | Limit on `POST /api/auth/password` and `DELETE /api/auth/me` (a signed-in caller re-verifying their own password); shared between the two, and does not apply to `GET /api/auth/me` | `600000` (10m) / `10`  |
| `GENERATE_RATE_LIMIT_WINDOW_MS` / `GENERATE_RATE_LIMIT_MAX`     | Limit on `/api/generate` for everyone                                                                                                                                               | `600000` (10m) / `20`  |

Password hashing. These are Argon2id cost parameters — raising them makes login slower
and more expensive to attack.

| Variable             | Purpose                | Default |
| -------------------- | ---------------------- | ------- |
| `ARGON2_TIME_COST`   | Iterations             | `3`     |
| `ARGON2_MEMORY_COST` | Memory in KiB          | `19456` |
| `ARGON2_PARALLELISM` | Parallel lanes         | `1`     |
| `ARGON2_HASH_LENGTH` | Output length in bytes | `32`    |

Dashboard pagination and external-API behaviour.

| Variable                             | Purpose                                       | Default      |
| ------------------------------------ | --------------------------------------------- | ------------ |
| `DASHBOARD_COLLECTION_DEFAULT_LIMIT` | Page size when a request does not ask for one | `50`         |
| `DASHBOARD_COLLECTION_MAX_LIMIT`     | Largest page size a request may ask for       | `200`        |
| `EXTERNAL_API_RETRIES`               | Retry attempts per upstream call              | `2`          |
| `EXTERNAL_API_RETRY_BASE_DELAY_MS`   | Base backoff between retries                  | `250`        |
| `EXTERNAL_CACHE_MAX_ENTRIES`         | Entries held in the in-process upstream cache | `500`        |
| `EXTERNAL_CACHE_STALE_TTL_SEC`       | How long a stale entry may still be served    | `21600` (6h) |
| `OPEN_METEO_CACHE_TTL_SEC`           | Fresh-cache window for weather                | `300`        |
| `OPENAQ_CACHE_TTL_SEC`               | Fresh-cache window for air quality            | `180`        |
| `WGER_CACHE_TTL_SEC`                 | Fresh-cache window for exercise data          | `900`        |
| `MEALDB_CACHE_TTL_SEC`               | Fresh-cache window for meal search            | `900`        |

`NODE_ENV` is read directly rather than configured: `production` enables HSTS, `Secure`
cookies and `trust proxy`, and makes Postgres required at startup. `VITEST` is set by the
test runner and suppresses the automatic `startServer()` call.

The upstream cache is **per process and in memory**, so each replica keeps its own and
multiplies upstream load accordingly.

External API variables:

| Variable                | Purpose                  | Default                 |
| ----------------------- | ------------------------ | ----------------------- |
| `OPEN_METEO_BASE_URL`   | Weather API base URL     | Open-Meteo forecast API |
| `OPENAQ_BASE_URL`       | Air quality API base URL | OpenAQ v3               |
| `OPENAQ_API_KEY`        | Optional OpenAQ key      | unset                   |
| `WGER_BASE_URL`         | Exercise API base URL    | wger API                |
| `WGER_API_TOKEN`        | Optional wger token      | unset                   |
| `WGER_DEFAULT_LANGUAGE` | wger language ID         | `2`                     |
| `MEALDB_BASE_URL`       | Meal search API base URL | TheMealDB v1            |

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
