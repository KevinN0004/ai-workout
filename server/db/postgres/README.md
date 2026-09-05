# Postgres Migration Foundation

This directory holds the relational schema for AI Workout's Postgres persistence.
`server/prisma/schema.prisma` maps onto these tables; the SQL here is the source of truth.

Apply migrations after setting `DATABASE_URL` or `POSTGRES_URL`:

```bash
npm run migrate:postgres -w server
npm run prisma:generate -w server
```

## What is modelled

Seven tables: `app_users`, `workout_sessions`, `meal_logs`, `progress_metrics`,
`calorie_entries`, `generated_plans`, `saved_exercises`. Flexible AI and external-API
payloads are kept in `jsonb`; everything else is relational with foreign keys and indexes.

**Auth sessions are not in Postgres.** They live in Redis when it is configured and in
process memory otherwise — see `services/sessionService.js`. The `workout_sessions` table
is a training log, not a session store.

## Two things that will bite you

**Six of the unique indexes are partial** (`where legacy_id is not null`, and one on
`external_exercise_id`). `schema.prisma` cannot express partial indexes, so Prisma does
not know they exist and `upsert` has no constraint to target. The repositories in
`server/src/repositories/` do an explicit read-then-write instead. That is deliberate.

**Never run `prisma db push` against a real database.** It drops tables the Prisma schema
does not declare. `schema_migrations` — the migration runner's bookkeeping — is declared
as a model in `schema.prisma` purely so push cannot delete it. Losing those rows would
make the runner re-apply every migration from scratch.

## How migrations run

`server/src/postgresMigrations.js` applies each unapplied `.sql` file in filename order,
recording it in `schema_migrations`. Each file runs `begin`/SQL/`commit` on **one**
checked-out connection, so a failure rolls back cleanly and the file is not recorded — a
partial apply cannot be mistaken for a completed one.

`001_foundation.sql` is idempotent (25 of its 33 DDL statements carry `if not exists`).
New migrations need not be, which is exactly why the transaction matters.
