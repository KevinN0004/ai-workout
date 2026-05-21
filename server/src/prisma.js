import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

const prismaLog =
  process.env.NODE_ENV === "production"
    ? ["warn", "error"]
    : ["warn", "error"];

const globalPrisma = globalThis.__aiWorkoutPrismaClient;
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
