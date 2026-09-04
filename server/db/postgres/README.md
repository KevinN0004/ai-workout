# Postgres Migration Foundation

This directory contains the relational schema for AI Workout's Postgres persistence.
The Prisma schema in `server/prisma/schema.prisma` maps onto these tables.

Apply migrations after setting `DATABASE_URL` or `POSTGRES_URL`:

```bash
npm run migrate:postgres -w server
npm run prisma:generate -w server
```

The first schema keeps flexible AI and external API payloads in `jsonb`, while modeling users, sessions, meals, metrics, calories, plans, and saved exercises with relational keys and indexes.
