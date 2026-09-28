# AI Workout

AI Workout is a full-stack fitness planning app. The client guides a user through profile setup, body visualization, workout plan generation, and dashboard views. The server provides authentication, dashboard persistence, AI workout generation, and cached integrations with fitness, meal, weather, and air-quality APIs.

## Tech Stack

- React 19 and Vite for the frontend
- Express 5 for the API server
- Postgres with Prisma Client for user and dashboard data
- Optional Redis-backed sessions with in-memory fallback
- Google Gemini for weekly workout plan generation
- Vitest for client and server tests

## Repository Layout

```text
.
|-- client/                   # React 19 + Vite app (npm workspace)
|   |-- vite.config.js        # dev and preview proxy, client test and coverage config
|   `-- src/
|       |-- main.jsx          # entry point
|       |-- App.jsx           # top-level routing and state
|       |-- app/              # app-wide logic: API client, cache, events, routing, units
|       |-- assets/           # static images
|       |-- components/       # shared components: modal portal
|       |-- hooks/            # shared hooks: scroll lock, close on Escape
|       |-- pages/            # one folder per route: auth, dashboard, home,
|       |                     #   workout-result; home also holds the preview
|       |                     #   walkthrough and physique silhouette, which only it uses
|       |-- styles/           # global CSS
|       `-- test/             # Vitest setup
|-- server/                   # Express 5 API (npm workspace)
|   |-- db/postgres/          # SQL migrations, applied in order
|   |-- prisma/               # Prisma schema
|   |-- scripts/              # local Postgres, migration runner, db push guard
|   `-- src/
|       |-- index.js          # app bootstrap, with corsPolicy, shutdown, staticClient
|       |-- db/               # Postgres pool, Prisma client, migration runner
|       |-- middleware/       # request context, error handler
|       |-- repositories/     # all Prisma data access
|       |-- routes/           # auth, dashboard, external APIs, generate, system
|       `-- services/         # auth, dashboard, external, http, platform
|-- e2e/                      # Playwright suites: smoke, a11y, deployable
|-- scripts/                  # repo tooling and Claude Code hook targets
|-- security/                 # audit-ci allowlist and advisory reviews
|-- docs/                     # deploy runbook, implementation plans, design specs
|-- .github/                  # CI and deploy workflows, Dependabot, PR template, CODEOWNERS
|-- .vscode/                  # hides generated output from the file tree
|-- .claude/settings.json     # Claude Code hook wiring and permission allowlist
|-- .githooks/                # pre-commit guard against committing agent scaffolding
|-- .mcp.json                 # MCP servers for Claude Code sessions
|-- CLAUDE.md                 # working notes and rules for Claude Code sessions
|-- Dockerfile                # production image: API plus client bundle
|-- docker-compose.yml        # local Postgres and Redis only
|-- render.yaml               # Render blueprint
|-- env.example               # template for server/.env
|-- eslint.config.js          # lint rules (defect classes, not style)
|-- .prettierrc.yaml          # formatting
|-- knip.jsonc                # unused files, exports and dependencies
|-- playwright.config.js      # E2E runner
|-- vitest.config.js          # tests for scripts/
`-- package.json              # npm workspaces and root scripts
```

Tests live in a `__tests__/` folder beside the code they cover.

Other root dotfiles (`.gitignore`, `.gitattributes`, `.npmrc`, `.nvmrc`, `.dockerignore`,
`.prettierignore`, `.git-blame-ignore-revs`) stay at the root because that is where git,
npm, nvm, Docker, Prettier and GitHub look for them.

## Prerequisites

- Node.js `^22.22.2 || ^24.15.0 || >=26` (see `.nvmrc`; development is on Node 24). Node 25 is not supported: vitest 5 and jsdom 30 both reject it, and `.npmrc` sets `engine-strict`, so `npm ci` fails on it
- npm
- Postgres running locally, or use the workspace-owned local Postgres helper
- Optional: Redis for persistent sessions across server restarts
- Optional: a Gemini API key for AI plan generation

## Getting Started

Install dependencies from the repository root:

```bash
npm install
```

Create `server/.env` from the template, start a local Postgres, apply the migrations and
run the app:

```bash
cp env.example server/.env
npm run postgres:local:start -w server   # or: docker compose up -d (see below)
npm -w server run migrate:postgres       # a new database starts empty
npm run dev
```

There are two ways to run Postgres locally. Both bind **55432**, so use one or the other:

- **`npm run postgres:local:start -w server`** starts a workspace-owned Postgres from a
  local install (it prefers 18, then 17, then 16) and writes its own `DATABASE_URL`, with
  a generated password, into `server/.env`.
- **`docker compose up -d`** starts Postgres 18 in a container. The `DATABASE_URL` in
  `env.example` already matches it.

Plan generation needs a `GEMINI_API_KEY` in `server/.env`; everything else works without
one.

The client runs on `http://localhost:5173` and proxies `/api` requests to the server on `http://localhost:5000`.

### Local dependencies with Docker

`docker-compose.yml` brings up Postgres and Redis only. The app is deliberately not containerised, so Vite and `node --watch` keep running natively.

```bash
docker compose up -d               # Postgres 18 on 55432, Redis 8 on 6379
npm -w server run migrate:postgres # the container starts empty
```

`server/.env` needs the `DATABASE_URL` from `env.example`:

```text
DATABASE_URL=postgresql://postgres:ai_workout_dev@127.0.0.1:55432/ai_workout
```

Compose and `npm run postgres:local:start -w server` both bind **55432** and are therefore mutually exclusive — use one or the other, not both.

Compose keeps its data in the `postgres18-data` volume. A volume left over from before the
move to Postgres 18 (`postgres-data`) holds files the 18 server cannot read, so it is not
reused. Remove it with `docker volume rm ai-workout_postgres-data` if you no longer need it.

Redis is opt-in: without `REDIS_URL` the server keeps sessions, rate limit counters and the external response cache in memory, so starting the container alone changes nothing. To use it, set `REDIS_URL=redis://127.0.0.1:6379`.

## Root Scripts

```bash
npm run dev            # Run client and server together
npm run dev:client     # Run only the Vite client
npm run dev:server     # Run only the Express server (node --watch)
npm run build          # Build the client
npm run start          # Start the server
npm test               # Scripts, client and server tests
npm run test:scripts   # Tests for scripts/ only
npm run test:coverage  # Client and server tests with coverage floors -- what CI runs
npm run test:e2e       # Playwright E2E and accessibility suites (build first)
npm run test:e2e:ui    # The same in Playwright's UI mode
npm run lint           # ESLint across the repository
npm run lint:fix       # ESLint with fixes applied
npm run format         # Prettier --write
npm run format:check   # Prettier check -- what CI runs
npm run knip           # Unused files, exports and dependencies
```

Workspace scripts are listed in the [client](client/README.md) and
[server](server/README.md) READMEs.

## Environment Variables

A complete template lives in [`env.example`](env.example). Copy it to `server/.env` and fill
in the values that matter for your setup. The server validates this environment at startup and
reports every problem at once, rather than failing on the first one it happens to hit.

Common server variables:

| Variable                                                                    | Purpose                                                                                  | Default                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `PORT`                                                                      | API server port                                                                          | `5000`                                                      |
| `DATABASE_URL` / `POSTGRES_URL`                                             | Postgres connection string                                                               | unset                                                       |
| `POSTGRES_STARTUP_REQUIRED`                                                 | Fail startup if Postgres is unavailable                                                  | `true` in production, otherwise `false`                     |
| `POSTGRES_SSL`                                                              | Enable TLS — **only when `DATABASE_URL` carries no `sslmode`**, which otherwise wins     | `false`                                                     |
| `POSTGRES_SSL_REJECT_UNAUTHORIZED`                                          | Reject untrusted TLS certificates; same precedence caveat as `POSTGRES_SSL`              | `true`                                                      |
| `CLIENT_ORIGIN` / `CLIENT_ORIGINS`                                          | Allowed CORS origins, comma-separated                                                    | loopback origins only when unset; set this before deploying |
| `GEMINI_API_KEY`                                                            | Enables `/api/generate`                                                                  | unset                                                       |
| `ANON_GENERATE_RATE_LIMIT_MAX`                                              | Plan generations allowed per IP without signing in                                       | `3`                                                         |
| `ANON_GENERATE_RATE_LIMIT_WINDOW_MS`                                        | Window for the anonymous generation quota                                                | `86400000` (24h)                                            |
| `GEMINI_MODEL`                                                              | Gemini model for workout generation                                                      | `gemini-3.5-flash-lite`                                     |
| `REDIS_URL`                                                                 | Redis URL backing sessions, rate limit counters and the external cache                   | unset                                                       |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS` | Socket-style Redis config (takes precedence over `REDIS_URL`)                            | unset                                                       |
| `REDIS_CONNECT_TIMEOUT_MS`                                                  | How long startup waits for Redis before falling back to memory                           | `10000`                                                     |
| `REDIS_STARTUP_REQUIRED`                                                    | Fail startup when Redis is configured but unreachable, instead of falling back to memory | `false`                                                     |
| `SHUTDOWN_TIMEOUT_MS`                                                       | Grace period for draining requests and closing connections on SIGTERM/SIGINT             | `10000`                                                     |
| `SENTRY_DSN`                                                                | Enables Sentry error tracking                                                            | unset                                                       |
| `SENTRY_ENVIRONMENT`                                                        | Environment tag sent to Sentry                                                           | `NODE_ENV`, else `development`                              |
| `SENTRY_RELEASE`                                                            | Release tag sent to Sentry                                                               | unset                                                       |
| `SENTRY_TRACES_SAMPLE_RATE`                                                 | Sentry trace sampling, clamped to 0–1                                                    | `0`                                                         |
| `SENTRY_SHUTDOWN_TIMEOUT_MS`                                                | How long shutdown waits for Sentry to flush                                              | `2000`                                                      |
| `VITE_SENTRY_DSN`                                                           | Browser Sentry DSN, read by the client **build** and by the server's CSP                 | unset                                                       |
| `LOG_LEVEL`                                                                 | Pino log level                                                                           | `info`                                                      |
| `LOG_REDACT_PATHS`                                                          | Extra comma-separated log paths to redact, on top of the defaults                        | unset                                                       |
| `METRICS_TOKEN`                                                             | Guards `/api/metrics` via `x-metrics-token`; unset, it is closed in production           | unset                                                       |

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

| Variable                             | Purpose                                                                                                | Default      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------ |
| `DASHBOARD_COLLECTION_DEFAULT_LIMIT` | Page size when a request does not ask for one                                                          | `50`         |
| `DASHBOARD_COLLECTION_MAX_LIMIT`     | Largest page size a request may ask for                                                                | `200`        |
| `EXTERNAL_API_RETRIES`               | Retry attempts per upstream call                                                                       | `2`          |
| `EXTERNAL_API_RETRY_BASE_DELAY_MS`   | Base backoff between retries                                                                           | `250`        |
| `EXTERNAL_CACHE_MAX_ENTRIES`         | Entries held in the in-memory fallback cache; with `REDIS_URL` set the cache is bounded by TTL instead | `500`        |
| `EXTERNAL_CACHE_STALE_TTL_SEC`       | How long a stale entry may still be served                                                             | `21600` (6h) |
| `OPEN_METEO_CACHE_TTL_SEC`           | Fresh-cache window for weather                                                                         | `300`        |
| `OPENAQ_CACHE_TTL_SEC`               | Fresh-cache window for air quality                                                                     | `180`        |
| `WGER_CACHE_TTL_SEC`                 | Fresh-cache window for exercise data                                                                   | `900`        |
| `MEALDB_CACHE_TTL_SEC`               | Fresh-cache window for meal search                                                                     | `900`        |

`NODE_ENV` is read directly rather than configured: `production` enables HSTS, `Secure`
cookies and `trust proxy`, and makes Postgres required at startup. `VITEST` is set by the
test runner and suppresses the automatic `startServer()` call.

The upstream cache lives in Redis when `REDIS_URL` is set, so replicas share it and it
survives a restart. Without Redis it is **per process and in memory**: each replica keeps
its own and multiplies upstream load accordingly.

External API variables:

| Variable                | Purpose                                                        | Default                 |
| ----------------------- | -------------------------------------------------------------- | ----------------------- |
| `OPEN_METEO_BASE_URL`   | Weather API base URL                                           | Open-Meteo forecast API |
| `OPENAQ_BASE_URL`       | Air quality API base URL                                       | OpenAQ v3               |
| `OPENAQ_API_KEY`        | OpenAQ key; without it air quality always reads as unavailable | unset                   |
| `WGER_BASE_URL`         | Exercise API base URL                                          | wger API                |
| `WGER_API_TOKEN`        | Optional wger token                                            | unset                   |
| `WGER_DEFAULT_LANGUAGE` | wger language ID                                               | `2`                     |
| `MEALDB_BASE_URL`       | Meal search API base URL                                       | TheMealDB v1            |

## API Overview

The server exposes:

- System: `GET /api/health`, `GET /api/ready`, `GET /api/metrics`, `GET /api/csrf-token`
- Auth/profile: `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password`, `DELETE /api/auth/me`, `GET/POST /api/profile`
- Dashboard: `GET /api/dashboard`, `GET /api/dashboard/workout-sessions`, `GET /api/dashboard/meal-logs`, `GET /api/dashboard/progress-metrics`
- Dashboard writes: workout sessions, workout aliases, calories, goals, meal logs, progress metrics, and saved exercises under `/api/dashboard`
- Generation: `POST /api/generate`
- External data: weather, air quality, wger exercise data, and MealDB meal search under `/api`

Unsafe API methods require a CSRF token. The frontend obtains it from `/api/csrf-token`, stores the cookie, and sends it in the `X-CSRF-Token` header.

## Testing

Run all tests:

```bash
npm test
```

Run one workspace:

```bash
npm run test -w client
npm run test -w server
```

The server tests need a running Postgres; without one, about a hundred of them fail
with `Can't reach database server`, which is environmental, not a regression.

Before calling a change ready, run what CI runs. `npm test` measures no coverage, and
both workspaces enforce coverage floors:

```bash
npm run test:coverage
npm run lint && npm run format:check && npm run knip
```

The E2E and accessibility suites run the client and server together against the built
bundle; see [`e2e/README.md`](e2e/README.md):

```bash
npm -w client run build
npm run test:e2e
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

## Deployment

**The client and the API must be served from one origin.** This is a constraint,
not a preference, and deploying the bundle to a static host separate from the API
does not work:

- every request the client makes is a relative path — each `/api/...` call in
  `client/src` is a literal, with no base-URL constant — so a bundle served from
  another host sends `/api/auth/me` to that host, and CORS is never reached
- both the session and CSRF cookies are `SameSite=Lax`, so even with an absolute
  URL the session would not be attached to a cross-site request

The `/api` proxy that makes development work lives in `client/vite.config.js` and
covers the dev server and `vite preview` only. Nothing proxies in production.

The server therefore serves `client/dist` itself, so one process is the whole
deployable. Set `CLIENT_DIST_PATH` only if the bundle is not at `client/dist`.
If the build is missing the server logs `client_bundle_missing` and serves the
API alone, which is what `npm run dev:server` does every day.

### Container

`Dockerfile` builds one image containing the API and the bundle. It is
deliberately platform-agnostic — `docker-compose.yml` is for local Postgres and
Redis and does not build it.

```bash
docker build -t ai-workout .
docker run --rm -p 5000:5000 --env-file server/.env ai-workout
```

### Release order

**Run migrations before starting the new code, not after.**
`002_password_changed_at.sql` adds a column `userReadRepository` selects on
every user read, so a server started against an unmigrated database fails every
authenticated request, not only the new routes:

```bash
npm run migrate:postgres -w server   # release step, before the cutover
```

The image does not run migrations itself, so that ordering stays explicit.

### Free deployment: Render + Neon + Upstash

Three services, none needing a card. They are split because **Render's own free
database and cache are both unusable here** — its free Postgres expires after 30
days, and its free Key Value loses data on restart, which would empty the
session store and sign every user out.

| Layer    | Service            | Free terms                           |
| -------- | ------------------ | ------------------------------------ |
| App      | Render web service | Docker, 512 MB, 750 h/month          |
| Postgres | Neon               | scale-to-zero at 5 min, ~570 ms wake |
| Redis    | Upstash            | 256 MB, 500k commands/month          |

512 MB is enough: argon2id is configured at 19 MiB per hash.

**Setup, in order:**

1. **Neon** — create a project, copy the **pooled** connection string, and append
   `?sslmode=verify-full`. The `sslmode` because the Prisma adapter takes no
   separate `ssl` option, so TLS has to ride the URL; `verify-full` rather than
   `require` because `pg` resolves them identically today but warns that its
   next major weakens `require` to skip certificate verification.

   Pooled works because nothing here asks the connection for a startup parameter
   PgBouncer refuses. That is deliberate: the session timezone is set by the
   database (`003_utc_timezone.sql`) rather than per connection. An earlier
   version passed `options=-c timezone=UTC`, which PgBouncer rejects outright —
   it tracks only `client_encoding`, `datestyle`, `timezone` and
   `standard_conforming_strings` and errors on anything else. **Do not add
   startup options to this URL**; a pooled endpoint will refuse the connection
   rather than ignore them.

2. **Upstash** — create a Redis database and copy the `rediss://` URL, which is
   already TLS.
3. **Render** — New → Blueprint, point it at this repo. `render.yaml` declares
   the service; Render will prompt for each secret it marks `sync: false`, and a
   comment beside each one in `render.yaml` says what it is for and whether it is
   required.
   Set `CLIENT_ORIGIN` to the service's own URL once Render assigns it, e.g.
   `https://ai-workout.onrender.com` — the production preflight refuses to start
   without it, even though same-origin serving means CORS is barely exercised.
4. **GitHub** — add three repository secrets: `PRODUCTION_DATABASE_URL` (the same
   Neon URL), `RENDER_DEPLOY_HOOK_URL` (Render → the service → Settings → Deploy
   Hook) and `RENDER_SERVICE_URL`.

**Deploys are triggered by CI, not by pushing.** `render.yaml` sets
`autoDeployTrigger: "off"` and `.github/workflows/deploy.yml` applies migrations
first, then calls the deploy hook, then waits for the _new_ instance to report
ready on `/api/ready` — Render keeps the old one answering until the new one
passes its health check, so a bare ready proves nothing. That ordering is
the point — see the release-order note above. Automatic deploys stay off until the
repository variable `AUTO_DEPLOY` is set to `true`; until then the run after each
green CI is skipped, and the first deploy is started by hand (see
[`docs/deploy-runbook.md`](docs/deploy-runbook.md), Step 5).

**Two behaviours worth expecting rather than debugging:**

- **The first request after 15 minutes idle takes 30–60 seconds.** Free instances
  spin down. Neon adds ~570 ms on top, waking from its own idle.
- **If a deploy fails its health check, check `REDIS_URL` first.** A configured
  but unreachable Redis makes the app fall back to in-memory sessions, and
  `/api/ready` then reports `not_ready` permanently by design. The process is
  up; it is telling you sessions would not survive a spin-down.

### What production needs

| Setting                          | Why                                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`            | Enables the env preflight and the production defaults                                                                                                                                               |
| `DATABASE_URL`                   | Required. Add `?sslmode=verify-full` for TLS — the Prisma adapter takes no separate `ssl` option, so it has to ride the URL                                                                         |
| `CLIENT_ORIGIN`                  | Required when `NODE_ENV=production`                                                                                                                                                                 |
| `REDIS_URL`                      | Without it sessions, rate limit counters and the external cache are in-memory: a restart signs everyone out, resets every quota, and drops the cache stale window                                   |
| `GEMINI_API_KEY`                 | Plan generation returns an error without it                                                                                                                                                         |
| `OPENAQ_API_KEY`                 | Without it air quality always reads as unavailable. The route answers 200 with `fallback: true`, so the browser sees no error; the server logs `external_api_retry` warnings naming the missing key |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | Server and browser error reporting. Unset, production errors reach only the host's logs                                                                                                             |
| `METRICS_TOKEN`                  | Opens `/api/metrics` to callers who send it; unset, the endpoint stays closed in production                                                                                                         |
| `POSTGRES_STARTUP_REQUIRED`      | Defaults to true in production; leave it                                                                                                                                                            |

Probes: `/api/health` is liveness and touches no dependency; `/api/ready`
reports Postgres and Redis and is the one a load balancer should gate traffic
on.

## More Docs

- [Deploy runbook](docs/deploy-runbook.md) — step-by-step first deployment on the
  free tier, and what to check when it goes wrong
- [Client README](client/README.md)
- [Server README](server/README.md)
- [Migrations README](server/db/postgres/README.md) — the schema, and the two things
  about it that will bite you
- [E2E README](e2e/README.md) — the browser suites, and how to run them
- [Scripts README](scripts/README.md) — repo tooling and Claude Code hook targets
- [Security README](security/README.md) — how audit findings are accepted and expire
- [Docs index](docs/README.md) — the runbook, plans and specs
- [`CLAUDE.md`](CLAUDE.md) — working notes and the reasoning behind the non-obvious
  decisions
