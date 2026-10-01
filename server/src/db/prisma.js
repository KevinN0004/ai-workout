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
// Do not add `options: "-c timezone=UTC"` to this connection. A direct
// Postgres connection accepts it, but a pooler may not: PgBouncer before 1.20
// by default rejects any startup parameter it does not track, `options`
// included, and managed poolers vary. A pooled deploy would then fail to connect while a
// local setup without one never shows it.
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
 * runs first. Its failure aborts startup only when POSTGRES_STARTUP_REQUIRED is
 * on, which it is by default in production; otherwise the server starts
 * degraded.
 */
export const connectPrisma = async () => {
  await prisma.$connect();
  return prisma;
};

/** Closes the client's connection; the shutdown handler calls it. */
export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};
