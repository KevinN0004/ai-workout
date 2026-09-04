import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { closePostgres, connectPostgres, getPostgresPool } from "../src/postgres.js";
import { applyMigrations } from "../src/postgresMigrations.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../db/postgres");

const run = async () => {
  const status = await connectPostgres();
  if (!status.configured) {
    throw new Error("Set DATABASE_URL or POSTGRES_URL before running Postgres migrations.");
  }

  await applyMigrations({ pool: getPostgresPool(), migrationsDir });
};

run()
  .catch((err) => {
    console.error("[postgres:migrate] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgres();
  });
