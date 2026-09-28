import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

// Was a ternary whose two arms were the same list, so the condition decided
// nothing. Queries are deliberately not logged in either environment: they
// carry user data and, on the server, would defeat the logger's redaction.
const prismaLog = ["warn", "error"];

const globalPrisma = globalThis.__aiWorkoutPrismaClient;
// The session timezone is UTC, and it is set by the DATABASE rather than here
// -- see server/db/postgres/003_utc_timezone.sql.
//
// This connection briefly carried `options: "-c timezone=UTC"` instead. That
// works against a direct Postgres connection and **fails against a pooled
// one**: PgBouncer tracks only client_encoding, datestyle, timezone and
// standard_conforming_strings in startup packets and errors on anything else,
// and `options` is not on that list. Every managed Postgres worth deploying on
// fronts the database with exactly that, so the parameter was a deploy blocker
// hiding behind a local setup that had no pooler.
//
// Do not reintroduce it. If the timezone is ever wrong, the database default
// is the thing to check -- `show timezone` on a new connection --  and
// prisma.test.js asserts it on every run.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL || ""
});

export const prisma =
  globalPrisma ||
  new PrismaClient({
    adapter,
    log: prismaLog
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__aiWorkoutPrismaClient = prisma;
}

export const connectPrisma = async () => {
  await prisma.$connect();
  return prisma;
};

export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};
