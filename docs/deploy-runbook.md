# Deploy Runbook — Render + Neon + Upstash (free tier)

Step-by-step for the first deployment. Follow it in order; steps 1 and 2 produce
values that step 3 needs.

Architecture and the reasoning behind these choices are in the Deployment section
of [`README.md`](../README.md). This file is the doing.

---

## Before you start

You need three accounts, none of which require a card:

| Service                            | What it runs   |
| ---------------------------------- | -------------- |
| [neon.com](https://neon.com)       | Postgres       |
| [upstash.com](https://upstash.com) | Redis          |
| [render.com](https://render.com)   | The app itself |

Plus a Google AI Studio key for plan generation, if you want that working. The
app runs without it; `/api/generate` returns an error and nothing else is
affected.

Three services rather than one because **Render's own free Postgres expires
after 30 days** and **its free Redis loses data on restart**. Redis holds three
things here — sessions, rate limit counters, and the cache of upstream API
responses — so a store that empties on restart signs everyone out, resets every
quota, and drops the cache's stale window, which is the exact problem Redis was
added to solve.

Set aside about 30 minutes. Most of it is waiting for the first Docker build.

---

## Step 1 — Neon (Postgres)

1. Sign up and create a project. Any region; pick the one nearest you.
2. On the project dashboard find the connection string. **Choose the pooled
   one** — Neon labels it "Pooled connection", and it usually has `-pooler` in
   the hostname.
3. Append `?sslmode=verify-full` (replacing `?sslmode=require` if Neon supplied
   that).

You want something shaped like:

```text
postgresql://USER:PASSWORD@ep-something-pooler.region.aws.neon.tech/neondb?sslmode=verify-full
```

**Why `verify-full` rather than the `require` Neon hands you.** Today they are
the same connection: `pg` treats `require` as an alias for `verify-full`, and
both resolve to a verified TLS session — measured, not assumed. But `pg` warns
on every boot that its next major adopts libpq semantics, where `require`
encrypts **without verifying the certificate**. Writing `verify-full` now pins
the behaviour you already have, and silences the warning. It is not a change of
behaviour; it is the same behaviour spelled so it cannot drift.

**Do not add any other query parameters.** The pooled endpoint is PgBouncer,
which accepts only four startup parameters and errors on anything else. An
earlier version of this app passed `options=-c timezone=UTC` and would have been
refused outright; the timezone is now set by the database instead
(`server/db/postgres/003_utc_timezone.sql`).

The `sslmode` is required because the Prisma adapter takes no separate `ssl`
option, so TLS has to travel in the URL.

Keep this string. You will paste it twice — once into Render, once into GitHub.

---

## Step 2 — Upstash (Redis)

1. Sign up and create a Redis database. Pick the region closest to the Render
   region you will choose in step 3.
2. Copy the connection URL beginning `rediss://` — two s's, which means TLS.

```text
rediss://default:PASSWORD@something.upstash.io:6379
```

Use a database dedicated to this deployment rather than one you already point a
local `server/.env` at. Sharing one means a development credential becomes a
production credential, and rotating it later stops being a choice you remember
to make.

Free tier is 256 MB and 500,000 commands per month. Budget more than one command
per request: the global rate limiter costs one on every `/api` call, an
authenticated request adds a session read, and a route backed by an upstream API
adds a cache read plus a write on a miss. Still generous for personal use, but
not the one-read-per-request it was when Redis only held sessions.

Size is not the constraint. Cached upstream responses are the largest entries at
roughly 15 KB, and the cache is capped well below the 256 MB ceiling.

**This is not optional in practice.** Render's free tier spins down after 15
minutes idle, and every in-memory fallback is lost on each wake. Without Redis
you would be signed out several times a day, the anonymous plan-generation quota
that guards the Gemini key would reset each time, and the cache would lose the
six-hour buffer that serves old data when an upstream is down.

---

## Step 3 — Render (the app)

1. Sign up, then **New → Blueprint**.
2. Connect the GitHub repository and select the `main` branch. Render reads
   [`render.yaml`](../render.yaml) and proposes one web service named
   `ai-workout`.
3. It will prompt for the values `render.yaml` marks `sync: false`. Two you
   already have; the rest are explained beneath the table:

   | Key               | Value                                |
   | ----------------- | ------------------------------------ |
   | `DATABASE_URL`    | The Neon string from step 1          |
   | `REDIS_URL`       | The Upstash string from step 2       |
   | `CLIENT_ORIGIN`   | See below — you may not know it yet  |
   | `GEMINI_API_KEY`  | Google AI Studio key, or blank       |
   | `SENTRY_DSN`      | See below — strongly recommended     |
   | `VITE_SENTRY_DSN` | See below — optional                 |
   | `OPENAQ_API_KEY`  | See below — required for air quality |
   | `METRICS_TOKEN`   | Any long random string, or blank     |

   **`SENTRY_DSN`** — sign up at [sentry.io](https://sentry.io), create a Node
   project, copy the DSN. The error tracking is already built and tested; this
   is the only thing it was missing. Without it a production 500 exists only in
   Render's log viewer, which on the free tier is thin. You will not know when
   the app breaks.

   **`VITE_SENTRY_DSN`** — the same for the browser: create a React project and
   copy its DSN. It is read twice, by the Docker build (which bakes it into the
   bundle) and by the server (which adds its ingest host to the CSP), so a
   change only takes effect on a fresh build, not a restart. Leave it blank and
   the client reports nothing.

   **`OPENAQ_API_KEY`** — free key from
   [openaq.org](https://openaq.org). Not optional: the service throws
   `"OpenAQ API key is not configured"` without one. The route catches it and
   the dashboard shows an error card rather than breaking, so the symptom is a
   permanently dead air-quality panel rather than an outage.

   **`METRICS_TOKEN`** — guards `/api/metrics`, which reports `authFailures`,
   per-route latency and request totals. Generate any long random string and
   send it as the `X-Metrics-Token` header to read metrics. **Leaving it blank
   closes the endpoint in production** rather than publishing it, so blank is
   safe — the choice is between "closed" and "readable by you".

4. **`CLIENT_ORIGIN` is the awkward one.** It must be this service's own public
   URL, which Render assigns when the service is created. If you can see the
   assigned URL during setup, use it. If not, put a placeholder, let the service
   be created, then set it properly under **Environment** and redeploy.

   It looks like `https://ai-workout.onrender.com`, with no trailing slash.

   The server refuses to start in production without it. Same-origin serving
   means CORS is barely exercised, but the startup check is unconditional.

5. Create the service. The first Docker build takes several minutes.

**Do not enable auto-deploy.** `render.yaml` sets `autoDeployTrigger: "off"`
deliberately: migrations must run before new code starts, and that is what the
GitHub workflow in step 5 does. If Render offers to deploy on push, decline.

---

## Step 4 — GitHub secrets

Repository → **Settings → Secrets and variables → Actions → New repository
secret**. Add three:

| Secret                    | Value                                                         |
| ------------------------- | ------------------------------------------------------------- |
| `PRODUCTION_DATABASE_URL` | The same Neon string from step 1                              |
| `RENDER_DEPLOY_HOOK_URL`  | Render → your service → **Settings → Deploy Hook** → copy URL |
| `RENDER_SERVICE_URL`      | Your Render URL, e.g. `https://ai-workout.onrender.com`       |

The deploy hook is a secret URL that triggers a deploy when POSTed to. Treat it
like a password.

---

## Step 5 — First deploy

Run the workflow manually the first time, so you can watch it:

Repository → **Actions → Deploy → Run workflow → main**.

It does three things in order:

1. **Applies migrations** against `PRODUCTION_DATABASE_URL`. Every unapplied
   `.sql` in `server/db/postgres/`, in filename order, recorded in a
   `schema_migrations` table so re-running is a no-op.
2. **Triggers the Render deploy** via the hook.
3. **Waits for `/api/ready`** to report `ready`, polling for up to ~15 minutes.

**The ordering is the point.** `002_password_changed_at.sql` adds a column the
app selects on _every_ user read, so a server started against an unmigrated
database fails every authenticated request — not just the new routes. Migration
failure stops the deploy.

**Then turn on automatic deploys.** Once that manual run reports ready, add a
repository variable (a variable, not a secret): Repository → **Settings →
Secrets and variables → Actions → Variables → New repository variable**, named
`AUTO_DEPLOY` with the value `true`. From then on the workflow also runs
automatically whenever CI passes on `main`.

Until it is set, those automatic runs are skipped rather than failed, which is
what keeps `main` from showing a red Deploy after every merge before any of this
exists. A manual run is never gated by the variable.

### If Actions cannot run it

A billing block, a GitHub outage, or a deploy from a machine rather than CI all
leave the workflow unable to start — and it is the only thing that applies
migrations, so the deploy is blocked with it. `scripts/manual-deploy.mjs` does
the same four things in the same order from a terminal:

```bash
PRODUCTION_DATABASE_URL="..." \
RENDER_DEPLOY_HOOK_URL="..." \
RENDER_SERVICE_URL="https://..." \
  node scripts/manual-deploy.mjs --dry-run   # check the inputs, change nothing
```

Drop `--dry-run` to migrate, trigger the hook, and poll `/api/ready`. It never
prints the values it reads. Migration failure stops it before the hook is
POSTed, which is the same ordering guarantee the workflow gives.

It also checks the things the workflow does not, because a bad `DATABASE_URL`
there fails after the point of no return: a localhost host is refused outright,
and a missing `sslmode=verify-full`, a non-pooled endpoint, or a query parameter
PgBouncer would reject each warn.

---

## Verifying it worked

```bash
curl https://YOUR-APP.onrender.com/api/health
curl https://YOUR-APP.onrender.com/api/ready
```

- `/api/health` — liveness. Returns `{"status":"ok",...}` and touches no
  dependency.
- `/api/ready` — the deploy gate. Should report `"status":"ready"` with
  `postgres` and `redis` both connected.

**Know what `/api/ready` does and does not tell you.** The `redis` flag is live.
The `postgres` flag is a **boot snapshot** — written once when the process
started and never re-probed, so after a successful start it reads `connected`
forever, including while the database is down. That is deliberate: this path is
polled continuously, and a query per poll would hold Neon awake and consume its
free compute allowance. It answers "did this instance start correctly", which is
exactly what a deploy needs, and nothing more.

**Then check the app actually runs, in a browser.** This is the step that
matters and the one easiest to skip:

```bash
curl -s https://YOUR-APP.onrender.com/ | grep -q 'id="root"' && echo "shell served"
```

That proves only that the HTML arrived. **curl does not execute anything**, so
it cannot tell a working app from a blank page. Open the site, and confirm you
see the landing content and **an empty browser console**. A response-header
mistake — a Content-Security-Policy that blocks the app's own bundle, say —
produces a 200, a valid shell, a passing health check and a white screen. That
exact defect shipped once here, which is why `e2e/deployable.spec.js` now loads
this page in a real browser on every CI run.

Then sign up. A successful signup exercises the whole stack: Postgres write,
argon2 hash, session in Redis, and the client bundle served from the same
origin.

---

## Troubleshooting

**The deploy failed its health check but the service looks up.**
Check `REDIS_URL` first. A configured-but-unreachable Redis makes the app fall
back to in-memory sessions, and `/api/ready` then reports `not_ready`
permanently — by design, because sessions would not survive a spin-down. The
process is running and telling you something is wrong.

**Every request fails with a database error after a deploy.**
Migrations did not run. Check the Deploy workflow's "Apply migrations" step.
Never deploy by hitting the Render hook directly; that skips the migration.

**Connection refused / "unsupported startup parameter".**
Something added a startup option to `DATABASE_URL`. Neon's pooled endpoint
rejects anything outside `client_encoding`, `datestyle`, `timezone` and
`standard_conforming_strings`. Strip it back to the plain string plus
`?sslmode=verify-full`.

**The server will not start, complaining about environment.**
The production preflight requires `DATABASE_URL` and `CLIENT_ORIGIN`, and reports
every problem at once rather than the first. Read the whole message.

**Timestamps look seven hours out.**
`003_utc_timezone.sql` did not run, or the service has not restarted since it
did. The setting applies to sessions established after it runs.

---

## What to expect, and is not a fault

**The first request after 15 minutes idle takes 30–60 seconds.** Free instances
spin down. Neon adds about half a second on top, waking from its own idle. This
is the free tier working as sold, not a problem with the app.

**Sessions survive the spin-down** because they are in Upstash, not in memory.
That is the whole reason for the third service.

**750 instance hours per month** on Render's free tier. With spin-down you will
not approach it.

---

## Uptime monitoring, and optionally killing the cold starts

On a tier that spins down, **you cannot tell "asleep" from "broken" by looking**.
A monitor is what distinguishes them.

Either free tier works — [UptimeRobot](https://uptimerobot.com) gives 50
monitors at 5-minute intervals, [Better Stack](https://betterstack.com) gives 10
at 3 minutes. You need one. Point it at:

```text
https://YOUR-APP.onrender.com/api/health
```

**`/api/health`, not `/api/ready`.** Health is liveness and touches nothing.
Ready reports Postgres and Redis, so a brief database blip would page you about
something that recovers on its own. Use ready for deploys, health for uptime.

### The side effect, which may be the point

Any interval under 15 minutes stops the service ever spinning down, which
**eliminates the 30–60 second cold start**. That is not free, and the arithmetic
is tight:

|                                  | Hours   |
| -------------------------------- | ------- |
| Render free allowance            | 750     |
| A 30-day month, always awake     | 720     |
| A **31-day month**, always awake | **744** |

So permanent warmth fits, with **6 hours of headroom in a 31-day month**. That
covers one service and nothing else. If you ever add a second free service, or
a month runs long, you will exceed it and Render suspends until the reset.

If that is too tight, monitor on a schedule instead — say 07:00 to 23:00, which
is roughly 496 hours a month and leaves real slack. You get alerting all day and
accept a cold start for the first visitor each morning.

**Decide deliberately rather than by accident.** Adding a 5-minute monitor
without noticing it consumes your entire allowance is the kind of thing that
surfaces as an unexplained outage three weeks later.

### Why the warm-up does not also exhaust Neon

Keeping the app awake does **not** keep the database awake, and that is the only
reason this trick is affordable. Neon's free plan allows **100 CU-hours per
project per month** — [its own docs put that at "enough to run a 0.25 CU compute
for 400 hours per month"](https://neon.com/faqs/free-plan-limits-and-quotas),
against roughly 730 hours in a month. So Neon cannot be awake continuously on
the free plan; it has to spend most of the month suspended.

It does, because nothing the monitor touches reaches the database:

- `/api/health` returns a static object — no Postgres, no Redis.
- `/api/ready` reports a **boot snapshot**, so it does not query either.
- There is no periodic or background database work anywhere in the server.

Neon therefore wakes only on real user traffic and suspends five minutes later,
and no CU-hours accrue while it is suspended.

**This is load-bearing, and it is easy to break without noticing.** If
`/api/ready` is ever changed to run a live `select 1` — which looks like an
obvious improvement, and is the first thing anyone would reach for — a
five-minute monitor would poll it about 8,600 times a month and the database
would never suspend. At the 0.25 CU minimum that is roughly **182 CU-hours
against a 100 CU-hour cap: exhausted in about 17 days, every month.**

So if you ever want live dependency state, put it on a path that nothing polls.
`server/src/routes/systemRoutes.js` records the same warning next to the code.

---

## When a deploy goes wrong

**Code rolls back. Migrations do not.** That asymmetry is the whole of this
section.

Render keeps previous deploys: **your service → Deploys → the last good one →
Rollback**. That restores the container in a minute or two and is the right
first move when the new code is bad.

But the database is still migrated. Whether that is safe depends on the
migration:

- **Additive** — a new nullable column, which is all of `001`–`003` — is safe to
  roll back past. The old code ignores the column.
- **Destructive** — dropping or narrowing a column — is **not**. The old code
  expects what the migration removed, so rolling back the container leaves you
  worse off than the bad deploy.

So before writing any migration that is not purely additive, work out what
rolling back would do. The safe pattern is two deploys: add the new shape, ship
code using it, and only remove the old shape once nothing reads it.

### Restoring data

Neon free includes **6 hours** of point-in-time restore history, or 1 GB of
changes, whichever comes first — plus **one manual snapshot**.

Six hours is short. If someone deletes data on Friday and you notice on Monday,
point-in-time will not reach it.

**Take the manual snapshot once the first deploy is verified**, from the Neon
console. It is the only thing that will still be there next week.

To restore: Neon console → your branch → **Restore**, pick a timestamp within
the window. It restores to a point in time rather than applying a backup file,
so it is quick.

---

## Limits worth knowing before you rely on it

Verified against the providers' current terms on 2026-09-23. The ones that bite
are not the headline numbers — they are the metered allowances underneath.

**Neon free** — scale-to-zero after 5 minutes, automatic wake, data persists.

- **100 CU-hours per project per month**, which is 400 hours of awake time at
  the 0.25 CU minimum. See the section above for why the uptime monitor does
  not spend these.
- **0.5 GB storage per project, and exceeding it blocks writes.** Not a slow
  degradation — the app stops being able to save anything.
- 6 hours of point-in-time history, plus one manual snapshot.

**Upstash free** — 256 MB, 500k commands/month, 10 GB/month bandwidth, TLS
included. Data persists. Roughly one command per authenticated request, so the
command budget is generous for personal use.

**Render free** — 512 MB RAM, spins down after 15 minutes, ~1 minute to wake, no
shell access. Docker services are supported on this tier.

- **750 instance hours per _workspace_ per month**, not per service.
- **Outbound bandwidth and build pipeline minutes also draw on the workspace
  allowance.** This is the only limit here that can produce an actual charge:
  exceeding bandwidth is billed, or suspends the service if no payment method
  is on file. Exceeding pipeline minutes disables new builds until the reset.
  Every merge to `main` triggers a full Docker build, so builds are the thing
  to watch.

**Sentry free (Developer)** — 5k errors/month, **one user**, 30-day retention,
unlimited projects, email alerts. Ample for an app this size; the single seat is
the limit you would hit first if anyone joined you.

**GitHub Actions** — **2,000 minutes/month and 500 MB of artifact storage,
because this repository is private.** Public repositories are unlimited. Measured
on a real run, CI costs about **13 billed minutes** (six jobs, each rounded up),
and a working deploy adds up to ~16 more, because `Wait for the service to come
back ready` polls for 15 minutes. A pull request plus its merge is therefore
roughly 30–45 minutes, or about 45–65 full cycles a month.

Two consequences worth holding onto:

- **Nothing prunes the database.** Collection caps are applied on _read_
  (`take:` in `userReadRepository.js`), and the only deletes are user-initiated.
  Rows accumulate indefinitely while the UI looks bounded, and the destination
  is Neon's write-blocking 0.5 GB cap. Years away at personal scale, but it ends
  in a hard failure rather than a warning.
- **Making the repository public would remove the Actions limit entirely.**
  That is a decision about your code being public, not a technical one.

If the app becomes something you actually depend on, the first thing to pay for
is Render, to stop the cold starts.

---

## If you move off Render later

Very little here is Render-specific. `render.yaml` and the deploy hook are; the
`Dockerfile` is not, and it is the actual deployable. Any host that runs a
container with a Postgres and Redis URL will work. Keep two properties:

- **Same origin.** The client bundle must be served by the app process. It
  cannot reach a cross-origin API — every call is a relative path and the
  cookies are `SameSite=Lax`.
- **Migrate before cutover.** Whatever replaces the workflow must keep that
  order.
