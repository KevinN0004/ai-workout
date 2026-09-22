import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

const prismaLog = process.env.NODE_ENV === "production" ? ["warn", "error"] : ["warn", "error"];

const globalPrisma = globalThis.__aiWorkoutPrismaClient;
// The session timezone is pinned in code rather than left to the connection
// string, because getting it wrong is silent and the failure is invisible in
// CI.
//
// The driver sends a JS Date as UTC wall-clock digits with no offset, and
// Postgres labels them with whatever the session zone is. Measured on a UTC-7
// host: an instant of 05:06:49Z stored as `05:06:49-07`, seven hours out. It
// has never surfaced because the driver drops the offset again on read, so a
// JS write followed by a JS read round-trips exactly -- and CI runs in UTC,
// where the offset is zero, so no suite could see it. What does NOT round-trip
// is anything Postgres itself writes: the set_updated_at trigger's now() came
// back 25,200,027 ms early, because the two conventions disagree.
//
// With the session pinned, both conventions agree and every stored instant is
// the real one. Measured: tz=UTC, skew 0ms.
//
// Note this is the app's own connection. postgres.js builds a second pool for
// migrations and the readiness probe, and carries the same option for the same
// reason.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
  options: "-c timezone=UTC"
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
