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
- Graceful shutdown on `SIGTERM`/`SIGINT`: stops accepting connections, drains, then
  releases the session store, Prisma, Postgres and the error tracker before exiting

## Project Layout

```text
server/
|-- scripts/                    # CLI entry points (migration runner, local Postgres)
|-- db/postgres/                # Postgres SQL migrations
|-- prisma/schema.prisma        # Prisma model mapping for Postgres tables
|-- src/
|   |-- index.js                # Express app setup, wiring, and server boot
|   |-- postgres.js             # Postgres readiness probe
|   |-- prisma.js               # Prisma Client setup
|   |-- postgresMigrations.js   # Transactional SQL migration runner
|   |-- shutdown.js             # Graceful shutdown sequence
|   |-- middleware/             # Request context and error handling
|   |-- routes/                 # API route registration
|   |-- repositories/           # All Prisma data access (see below)
|   `-- services/               # Auth, sessions, validation, caching, external APIs
`-- package.json
```

### Data access

Every Postgres read and write goes through `src/repositories/`. Routes and services call
these; nothing else touches `prisma.*` directly.

| Module | Responsibility |
| --- | --- |
| `userReadRepository.js` | Loads a user with all dashboard collections |
| `userRepository.js` | Profile, goals, password hash, calorie entries |
| `workoutSessionRepository.js` | Workout session writes |
| `mealLogRepository.js` | Meal log writes, day calorie totals, derived calorie entries |
| `progressMetricRepository.js` | Progress metric writes |
| `savedExerciseRepository.js` | Saved exercise add/remove, with dedup |
| `generatedPlanRepository.js` | Generated plan inserts |
| `dashboardCollectionRepository.js` | Paginated reads for all three collections |
| `userLookup.js` | UUID-or-legacy user id resolution — load-bearing |
| `rowValues.js` | Shared date and Decimal conversions |

Two conventions worth knowing before adding a write:

- **`upsert` is usually unavailable.** Uniqueness comes from *partial* unique indexes
  (`where legacy_id is not null`), which `schema.prisma` cannot express, so Prisma has no
  constraint to target. The repositories do an explicit read-then-write.
- **Collection caps are applied on read.** `userReadRepository` limits each collection
  with `take:`; nothing prunes the tables.

This replaced a MongoDB-shaped compatibility shim, retired in full — see
`docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md`.

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

## Operational Notes

- **Shutdown.** `SIGTERM`/`SIGINT` drains in-flight requests and closes every connection.
  `SHUTDOWN_TIMEOUT_MS` (default `10000`) forces exit if that stalls. Windows does not
  deliver POSIX signals to Node, so the sequence is injectable and unit-tested by direct
  call rather than by signalling a process.
- **Migrations are transactional.** Each file runs `begin`/SQL/`commit` on **one** checked-out
  connection. A failure rolls back and the file is not recorded, so a partial apply cannot
  be mistaken for a completed one.
- **Never run `prisma db push` against a real database.** It drops tables the schema does
  not declare. `schema_migrations` is declared as a model purely to protect it from that.
- **The upstream cache is per process.** Each replica keeps its own and multiplies
  upstream load; it is not shared state.
- **An upstream outage on `/api/air-quality/current` answers `200`, not an error.** The
  body carries `fallback: true`, null readings, and indoor guidance, so the dashboard
  panel degrades instead of failing. A thrown network error carries no status, defaults
  to 500, and takes the same path. Only a non-upstream status (a real 4xx) is returned as
  an error.
- **Absent upstream readings must be rejected before `Number()`.** `Number(null)` and
  `Number("")` are both `0`, so coercing first turns missing data into a measurement —
  this shipped twice as wrong health advice. See "External data: absent is not zero" in
  `CLAUDE.md`.

## Testing Notes

Server tests run against a real Postgres — there are no database mocks. Start one first
or roughly 40 tests fail with a connection error that is environmental, not a regression:

```bash
npm run postgres:local:start -w server
npm run test -w server
```

`vitest.config.js` sets `fileParallelism: false` deliberately. Suites share one database
and several call `prisma.appUser.deleteMany({})`, so running files in parallel let one
truncate rows another was mid-request on.
