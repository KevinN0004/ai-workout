# AI Workout Server

The server is an Express API for AI Workout. It handles authentication, sessions, dashboard persistence, workout plan generation, external data lookups, request metrics, and health checks.

## Main Responsibilities

- User signup, login, logout, session lookup, and profile updates
- Cookie sessions with optional Redis storage and in-memory fallback
- CSRF protection for unsafe API methods
- Dashboard reads and writes for workouts, calories, goals, meals, progress metrics, plans, and saved exercises
- Postgres persistence through Prisma Client
- AI workout plan generation through Google Gemini
- Cached integrations for weather, air quality, exercise metadata, and meal search
- Health, readiness, metrics, logging, and optional Sentry error tracking

## Project Layout

```text
server/
|-- scripts/                    # One-off migration scripts
|-- db/postgres/                # Postgres SQL migrations
|-- prisma/schema.prisma        # Prisma model mapping for Postgres tables
|-- src/
|   |-- index.js                # Express app setup and server boot
|   |-- postgres.js             # Postgres readiness probe
|   |-- prisma.js               # Prisma Client setup
|   |-- middleware/             # Request context and error handling
|   |-- routes/                 # API route registration
|   `-- services/               # Auth, validation, caching, external APIs, builders
`-- package.json
```

## Development

From the repository root:

```bash
npm run dev:server
```

Or from `server/`:

```bash
npm run dev
```

The API listens on `http://localhost:5000` by default.

## Scripts

```bash
npm run dev                           # Start with node --watch
npm run start                         # Start normally
npm run test                          # Run Vitest once
npm run test:watch                    # Run Vitest in watch mode
npm run postgres:local:start          # Start workspace-local Postgres on 55432
npm run migrate:postgres              # Apply Postgres SQL migrations
npm run prisma:validate               # Validate the Prisma schema
npm run prisma:generate               # Generate Prisma Client
npm run prisma:studio                 # Open Prisma Studio
```

## Environment Variables

Create `server/.env` for local development. Useful defaults:

```env
PORT=5000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_workout
POSTGRES_STARTUP_REQUIRED=false
CLIENT_ORIGIN=http://localhost:5173
LOG_LEVEL=info
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
```

Optional Redis session storage:

```env
REDIS_URL=redis://localhost:6379
```

Or:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=
REDIS_TLS=false
```

Optional Postgres settings:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_workout
POSTGRES_STARTUP_REQUIRED=false
POSTGRES_SSL=false
POSTGRES_SSL_REJECT_UNAUTHORIZED=true
```

Postgres is the active application database. Startup probes Postgres and `/api/ready` reports its status.

For local development with the workspace-owned Postgres cluster:

```bash
npm run postgres:local:start
npm run migrate:postgres
npm run prisma:generate
```

Optional third-party settings:

```env
OPENAQ_API_KEY=
WGER_API_TOKEN=
SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0
SENTRY_ENVIRONMENT=development
SENTRY_RELEASE=
```

## API Groups

System:

- `GET /api/health`
- `GET /api/ready`
- `GET /api/metrics`
- `GET /api/csrf-token`

Auth and profile:

- `GET /api/auth/me`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/profile`
- `POST /api/profile`

Dashboard:

- `GET /api/dashboard`
- `GET /api/dashboard/workout-sessions`
- `GET /api/dashboard/meal-logs`
- `GET /api/dashboard/progress-metrics`
- `POST /api/dashboard/workout-sessions`
- `POST /api/dashboard/workouts`
- `POST /api/dashboard/calories`
- `POST /api/dashboard/goals`
- `POST /api/dashboard/meal-logs`
- `POST /api/dashboard/progress-metrics`
- `POST /api/dashboard/saved-exercises`
- `DELETE /api/dashboard/saved-exercises/:id`

Generation and external data:

- `POST /api/generate`
- `GET /api/weather/current`
- `GET /api/weather/recommendation`
- `GET /api/air-quality/current`
- `GET /api/wger/meta`
- `GET /api/wger/exercises`
- `GET /api/wger/exercises/:id`
- `GET /api/mealdb/search`

## Security Notes

- Session cookies are `HttpOnly`, `SameSite=Lax`, and marked `Secure` in production.
- The server issues a `csrfToken` cookie and requires a matching `X-CSRF-Token` header for unsafe methods.
- Passwords are hashed with Argon2id.
- Request logging redacts common sensitive fields by default.

## Testing Notes

Run only server tests from the repo root:

```bash
npm run postgres:local:start -w server
npm run test -w server
```
