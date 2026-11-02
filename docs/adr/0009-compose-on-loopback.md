# 0009. Publish the compose ports on 127.0.0.1

Accepted. First recorded in `CLAUDE.md` on 2026-09-12 (`24567b3`); moved here on 2026-11-02.

## Decision

`docker-compose.yml` publishes Postgres and Redis on `127.0.0.1`, so that on Windows
starting it beside the native helper fails at once instead of silently answering from the
other instance. The two instances keep separate passwords.

## Background

**Both published ports bind `127.0.0.1` on purpose, and the prefix is load-bearing.**
Docker's default is `0.0.0.0`, and `start-local-postgres.ps1` binds `127.0.0.1` — and on
Windows those two do **not** collide. Before this was fixed, `docker compose up -d`
succeeded while every `localhost` connection kept reaching the native instance: compose
looked healthy, `migrate:postgres` printed `skipped 001_foundation.sql` because the
_native_ database already had it, and the container sat at zero tables with no error
anywhere. Measured both ways on 2026-09-12, holding `127.0.0.1:55432` with a dummy
listener:

- publishing `0.0.0.0:55432` — container starts, shadowing the native instance
- publishing `127.0.0.1:55432` — `Error response from daemon: ports are not available`

So the collision the comment in `docker-compose.yml` always claimed is now real, and
picking the wrong one fails immediately instead of silently. Do not drop the prefix. It
also stops publishing a development database on every interface; nothing needs that,
because the app runs natively and connects over loopback.

**The two instances do not share a password.** Compose uses `POSTGRES_PASSWORD`
(default `ai_workout_dev`), which is what `env.example` already spells out:
`postgresql://postgres:ai_workout_dev@127.0.0.1:55432/ai_workout`. The PowerShell helper
generates its own instead, so a `server/.env` written for one will fail against the other
with `password authentication failed for user "postgres"` (SQLSTATE 28P01). That is the
expected symptom of switching sides, not a broken container — and it was invisible until
the port binding was fixed, because the shadowed connection was authenticating against
the native instance all along.
