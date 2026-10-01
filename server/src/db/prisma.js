/**
 * The app's one Prisma client, over the pg driver adapter. index.js injects it
 * into every repository, connects it at startup and disconnects it on shutdown.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

// Queries are deliberately not logged, in any environment: they carry user
// data and, on the server, would defeat the logger's redaction.
const prismaLog = ["warn", "error"];

const globalPrisma = globalThis.__aiWorkoutPrismaClient;
// The session timezone is UTC, and it is set by the DATABASE rather than here
// -- see server/db/postgres/003_utc_timezone.sql.
//
// Do not add `options: "-c timezone=UTC"` to this connection. That works
// against a direct Postgres connection and **fails against a pooled one**:
// PgBouncer tracks only client_encoding, datestyle, timezone and
// standard_conforming_strings in startup packets and errors on anything else,
// and `options` is not on that list. Every managed Postgres worth deploying on
// fronts the database with exactly that, so the parameter is a deploy blocker
// that a local setup without a pooler never shows.
//
// If the timezone is ever wrong, the database default is the thing to check
// -- `show timezone` on a new connection --  and prisma.test.js asserts it on
// every run.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL || ""
});

export const prisma =
  globalPrisma ||
  new PrismaClient({
    adapter,
    log: prismaLog
  });

// Cached outside production, so a test that re-imports this module reuses the
// client rather than opening a second one.
if (process.env.NODE_ENV !== "production") {
  globalThis.__aiWorkoutPrismaClient = prisma;
}

/**
 * Calls `$connect()` and returns the client. Over the pg driver adapter that
 * opens no connection -- it resolves even when the database is unreachable --
 * so the startup check that fails fast is connectPostgres, which index.js
 * runs first.
 */
export const connectPrisma = async () => {
  await prisma.$connect();
  return prisma;
};

/** Closes the client's connection; the shutdown handler calls it. */
export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};
