# Postgres Migration Foundation

This directory contains the staged relational schema for moving AI Workout from MongoDB-first persistence toward Postgres.

Apply migrations after setting `DATABASE_URL` or `POSTGRES_URL`:

```bash
npm run migrate:postgres -w server
```

Migration order:

1. Keep MongoDB as the active runtime store.
2. Add new relational features in Postgres first.
3. Backfill existing users and dashboard activity into Postgres.
4. Route reads through service/repository boundaries.
5. Flip write paths one model at a time.
6. Remove MongoDB only after parity tests and production backfill are complete.

The first schema keeps flexible AI and external API payloads in `jsonb`, while modeling users, sessions, meals, metrics, calories, plans, and saved exercises with relational keys and indexes.
