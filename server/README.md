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

| Module                             | Responsibility                                               |
| ---------------------------------- | ------------------------------------------------------------ |
| `userReadRepository.js`            | Loads a user with all dashboard collections                  |
| `userRepository.js`                | Profile, goals, password hash, calorie entries               |
| `workoutSessionRepository.js`      | Workout session writes                                       |
| `mealLogRepository.js`             | Meal log writes, day calorie totals, derived calorie entries |
| `progressMetricRepository.js`      | Progress metric writes                                       |
| `savedExerciseRepository.js`       | Saved exercise add/remove, with dedup                        |
| `generatedPlanRepository.js`       | Generated plan inserts                                       |
| `dashboardCollectionRepository.js` | Paginated reads for all three collections                    |
| `userLookup.js`                    | UUID-or-legacy user id resolution — load-bearing             |
| `rowValues.js`                     | Shared date and Decimal conversions                          |

Two conventions worth knowing before adding a write:

- **`upsert` is usually unavailable.** Uniqueness comes from _partial_ unique indexes
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
GEMINI_MODEL=gemini-3.5-flash-lite
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

## Plan Generation

`POST /api/generate` is **open to anonymous callers by design** — the anonymous quota is
enforced by the rate limiters mounted on the path in `index.js`. A signed-in caller gets
their plan persisted; an anonymous one gets the plan and nothing is written.

`buildGenerationEquipmentContext` (exported from `routes/generateRoutes.js`) decides what
the model is told the user can train with, and two of its branches are easy to break:

- **"Full gym access" is a shorthand, not a room.** It expands to every commercial
  capability rather than being passed through as one label.
- **Anything whose environment is not `"commercial"` falls to the home map.** A typo in
  the environment silently changes which equipment vocabulary is used.

The prompt asks for weekday headings and a `"Coach Notes:"` section by name because
`client/src/app/plans.js` parses exactly those. **That contract crosses the client/server
boundary with nothing type-checking it** — changing the wording here breaks plan parsing
there, and only the generate-route tests will say so.

## Sessions

Redis-backed when `REDIS_URL`, or `REDIS_HOST` **and** a valid `REDIS_PORT`, are set;
in-memory otherwise. A host without a usable port counts as _no_ configuration rather
than a broken one, and a failed connection falls back to memory and disconnects the
client so it does not retry and log forever.

**The two cookies differ deliberately.** `sid` is `HttpOnly` so script cannot read it;
the CSRF cookie is **not**, because the client has to read it to echo it back in a header
for the double-submit check to mean anything. `appendSetCookieHeader` accumulates rather
than overwrites — signup writes both on one response, and overwriting would silently drop
whichever went first. Remember-me is the presence or absence of `Max-Age` on `sid`.

**Known inconsistency in the Redis fallback.** When Redis is connected:

- `createSession` catches a write failure and falls back to the in-memory map.
- `getSessionByToken` consults **only** Redis — a miss returns null; memory is never read.
- `deleteSession` returns after the Redis delete and never touches memory.

So a session created during a Redis blip is written to memory but cannot be read back —
the user is signed out on their next request — and sign-out cannot clear it. It is not
inert either: if Redis is later disabled (including by `closeSessionStore`), those
entries begin resolving as live sessions. There are tests pinning both halves.

Making the read fall back to memory would fix the sign-out but would also let a _deleted_
session return, so this wants a decision about which store is authoritative rather than a
patch.

## Security Notes

- Session cookies are `HttpOnly`, `SameSite=Lax`, and marked `Secure` in production.
- The server issues a `csrfToken` cookie and requires a matching `X-CSRF-Token` header for unsafe methods.
- Passwords are hashed with Argon2id. Rows predating that are pbkdf2, and a successful
  login rehashes them in place. A failed rehash is logged and the sign-in still succeeds —
  the upgrade must not cost a user their session over a write they did not ask for.
- **Login does not reveal whether an account exists.** A wrong password and an unknown
  address return the same status and body, and the unknown-address path still verifies
  against a dummy hash so the two take comparable time. Returning early there would make
  the login form an oracle for which addresses are registered.
- **Signup does not validate the shape of an email**, only that it is a non-empty string
  of at most 254 characters (`signupBodySchema`). The address is a login identifier and
  the app sends no mail, so this is a data-quality gap rather than a hole; adding a format
  check would reject addresses existing rows may already hold.
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
- **Every external route answers `200` on an upstream outage, not an error.** Air quality,
  both weather routes, all three wger routes and the mealdb search each return
  `fallback: true` with empty or null readings, so the panel degrades instead of failing.
  A thrown network error carries no status, defaults to 500, and takes the same path.
  Only a non-upstream status (a real 4xx) is returned as an error — so **a 200 from these
  routes is not proof the upstream is healthy.** `/api/wger/exercises` goes further and
  re-parses the query in its fallback, so the client's paging survives an outage instead
  of silently resetting to page one.
- **`/api/wger/exercises` implements the text search itself.** wger has none, so with a
  `q` the route asks upstream for a wider page (`limit * 4`, floored at 100, capped at
  200), filters on name, description, category and muscle names, then cuts back to the
  requested limit. `count` is the _filtered_ length in that case, not the upstream total —
  reporting the total would claim results that are not in the response.
- **`/api/wger/exercises/:id` asks twice.** wger returns nothing at all for an exercise
  with no translation in the requested language, so a first attempt with the language
  filter is followed by one without it, and only then a 404. Removing the retry turns a
  findable exercise into a not-found.
- **Absent upstream readings must be rejected before `Number()`.** `Number(null)` and
  `Number("")` are both `0`, so coercing first turns missing data into a measurement —
  this shipped twice as wrong health advice. See "External data: absent is not zero" in
  `CLAUDE.md`.

## Testing Notes

Server tests run against a real Postgres — there are no database mocks. Start one first,
or 107 of the 1083 tests fail (and 27 skip) with `Can't reach database server` — measured
2026-09-28, and environmental, not a regression:

```bash
npm run postgres:local:start -w server
npm run test -w server
```

`vitest.config.js` sets `fileParallelism: false` deliberately. Suites share one database
and several call `prisma.appUser.deleteMany({})`, so running files in parallel let one
truncate rows another was mid-request on.
