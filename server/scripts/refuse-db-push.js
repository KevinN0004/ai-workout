#!/usr/bin/env node
/**
 * A signpost, not a lock.
 *
 * `prisma db push` reconciles the database to schema.prisma. Uniqueness on
 * several tables here comes from partial indexes (`where legacy_id is not
 * null`) and expression indexes (`lower(email)`, `lower(name)`), none of which
 * Prisma's schema language can express -- so pushing drops all eight of them,
 * silently, and duplicate rows become possible on tables the repositories treat
 * as unique.
 *
 * This cannot stop `npx prisma db push` typed directly. What it does is put the
 * reason in the place someone looks when they go hunting for a push script,
 * rather than leaving them to find nothing and reach for the raw command.
 *
 * The actual detection lives in server/src/postgresUniqueIndexes.test.js, which
 * asserts all eight still exist in the live database.
 */
process.stderr.write(
  [
    "",
    "  Refusing to run `prisma db push` on this project.",
    "",
    "  Uniqueness here relies on 8 partial and expression indexes that",
    "  schema.prisma cannot represent. `db push` reconciles the database to",
    "  that incomplete model, so it drops every one of them without an error,",
    "  and duplicate rows become possible on tables the repositories assume",
    "  are unique.",
    "",
    "  Use the migrations instead:",
    "",
    "      npm run migrate:postgres -w server",
    "",
    "  If you genuinely need to change the schema, add SQL to",
    "  server/db/postgres/ and let server/src/postgresUniqueIndexes.test.js",
    "  confirm the indexes survive.",
    ""
  ].join("\n") + "\n"
);
process.exit(1);
