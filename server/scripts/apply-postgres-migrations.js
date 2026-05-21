import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { closePostgres, connectPostgres, getPostgresPool } from "../src/postgres.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../db/postgres");

const run = async () => {
  const status = await connectPostgres();
  if (!status.configured) {
    throw new Error("Set DATABASE_URL or POSTGRES_URL before running Postgres migrations.");
  }

  const pool = getPostgresPool();
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const existing = await pool.query("select 1 from schema_migrations where filename = $1", [
      file
    ]);
    if (existing.rowCount > 0) {
      console.log(`[postgres:migrate] skipped ${file}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await pool.query("begin");
    try {
      await pool.query(sql);
      await pool.query("insert into schema_migrations (filename) values ($1)", [file]);
      await pool.query("commit");
      console.log(`[postgres:migrate] applied ${file}`);
    } catch (err) {
      await pool.query("rollback");
      throw err;
    }
  }
};

run()
  .catch((err) => {
    console.error("[postgres:migrate] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgres();
  });
