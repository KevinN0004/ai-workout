# AI Workout Server

The server is an Express API for AI Workout. It handles authentication, sessions, dashboard persistence, workout plan generation, external data lookups, request metrics, and health checks.

## Main Responsibilities

- User signup, login, logout, session lookup, and profile updates
- Cookie sessions with optional Redis storage and in-memory fallback
- CSRF protection for unsafe API methods
- Dashboard reads and writes for workouts, calories, goals, meals, progress metrics, plans, and saved exercises
- Optional Postgres connectivity and migrations for the staged relational-data switch
- AI workout plan generation through Google Gemini
- Cached integrations for weather, air quality, exercise metadata, and meal search
- Health, readiness, metrics, logging, and optional Sentry error tracking

## Project Layout

```text
server/
|-- scripts/                    # One-off migration scripts
|-- db/postgres/                # Postgres SQL migrations
|-- src/
|   |-- index.js                # Express app setup and server boot
|   |-- db.js                   # Mongoose connection
|   |-- postgres.js             # Optional Postgres connection
|   |-- middleware/             # Request context and error handling
|   |-- models/                 # Mongoose models
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
npm run migrate:dashboard-activities  # Run the dashboard activity migration
npm run migrate:postgres              # Apply Postgres SQL migrations
```

## Environment Variables

Create `server/.env` for local development. Useful defaults:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/ai_workout_backend
MONGODB_STARTUP_REQUIRED=false
# Optional during the staged relational migration:
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/ai_workout
# POSTGRES_STARTUP_REQUIRED=false
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

When `DATABASE_URL` or `POSTGRES_URL` is set, startup probes Postgres and `/api/ready` reports its status. Existing routes still use MongoDB until each repository/service is migrated.

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
npm run test -w server
```

Some integration tests use `mongodb-memory-server`, so the first run may need to download MongoDB binaries if they are not already cached.
