import nodeFs from "fs/promises";
import path from "path";

// Matches what console.log did before no-console landed. Callers that want
// the progress lines elsewhere -- the tests do -- inject `log`.
const logToStdout = (message) => {
  process.stdout.write(`${message}\n`);
};

/**
 * Applies every unapplied .sql file in `migrationsDir`, in filename order.
 *
 * `fs` is injectable so the transaction sequence can be tested without touching
 * the filesystem. Returns the filenames applied during this run.
 */
export const applyMigrations = async ({
  pool,
  migrationsDir,
  log = logToStdout,
  fs = nodeFs
}) => {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  const applied = [];
  for (const file of files) {
    const existing = await pool.query("select 1 from schema_migrations where filename = $1", [
      file
    ]);
    if (existing.rowCount > 0) {
      log(`[postgres:migrate] skipped ${file}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");

    // begin/migration/commit must share one connection. pool.query() checks out
    // an arbitrary idle client per call, so a pooled transaction can straddle
    // connections and leave the rollback running against one that never began.
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
      applied.push(file);
      log(`[postgres:migrate] applied ${file}`);
    } catch (err) {
      try {
        await client.query("rollback");
      } catch {
        // The connection may already be unusable; the original error matters more.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return applied;
};
