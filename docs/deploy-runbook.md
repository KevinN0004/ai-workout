# Deploy Runbook — Render + Neon + Upstash (free tier)

Step-by-step for the first deployment. Follow it in order; steps 1 and 2 produce
values that step 3 needs.

Architecture and the reasoning behind these choices are in the Deployment section
of [`README.md`](../README.md). This file is the doing.

---

## Before you start

You need three accounts, none of which require a card:

| Service                            | What it runs     |
| ---------------------------------- | ---------------- |
| [neon.com](https://neon.com)       | Postgres         |
| [upstash.com](https://upstash.com) | Redis (sessions) |
| [render.com](https://render.com)   | The app itself   |

Plus a Google AI Studio key for plan generation, if you want that working. The
app runs without it; `/api/generate` returns an error and nothing else is
affected.

Three services rather than one because **Render's own free Postgres expires
after 30 days** and **its free Redis loses data on restart**. Redis holds
sessions here, so a store that empties on restart signs everyone out — which is
the exact problem Redis was added to solve.

Set aside about 30 minutes. Most of it is waiting for the first Docker build.

---

## Step 1 — Neon (Postgres)

1. Sign up and create a project. Any region; pick the one nearest you.
2. On the project dashboard find the connection string. **Choose the pooled
   one** — Neon labels it "Pooled connection", and it usually has `-pooler` in
   the hostname.
3. Append `?sslmode=require` if it is not already there.

You want something shaped like:

```text
postgresql://USER:PASSWORD@ep-something-pooler.region.aws.neon.tech/neondb?sslmode=require
```

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

Free tier is 256 MB and 500,000 commands per month. Each authenticated request
does roughly one session read, so this is generous for personal use.

**This is not optional in practice.** Render's free tier spins down after 15
minutes idle, and the in-memory session fallback is lost on every wake — without
Redis you would be signed out several times a day.

---

## Step 3 — Render (the app)

1. Sign up, then **New → Blueprint**.
2. Connect the GitHub repository and select the `main` branch. Render reads
   [`render.yaml`](../render.yaml) and proposes one web service named
   `ai-workout`.
3. It will prompt for four values. Three you have:

   | Key              | Value                                     |
   | ---------------- | ----------------------------------------- |
   | `DATABASE_URL`   | The Neon string from step 1               |
   | `REDIS_URL`      | The Upstash string from step 2            |
   | `GEMINI_API_KEY` | Your Google AI Studio key, or leave blank |
   | `CLIENT_ORIGIN`  | See below — you may not know it yet       |

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

After the first time, the workflow also runs automatically when CI passes on
`main`.

---

## Verifying it worked

```bash
curl https://YOUR-APP.onrender.com/api/health
curl https://YOUR-APP.onrender.com/api/ready
```

- `/api/health` — liveness. Returns `{"status":"ok",...}` and touches no
  dependency.
- `/api/ready` — the real check. Should report `"status":"ready"` with
  `postgres` and `redis` both connected.

Then open the site and sign up. A successful signup exercises the whole stack:
Postgres write, argon2 hash, session in Redis, and the client bundle served from
the same origin.

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
`?sslmode=require`.

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

## Limits worth knowing before you rely on it

- **Neon free**: scale-to-zero after 5 minutes, automatic wake. Data persists.
- **Upstash free**: 256 MB, 500k commands/month. Data persists.
- **Render free**: 512 MB RAM, spins down, no shell access.

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
