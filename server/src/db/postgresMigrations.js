/**
 * The migration runner: applies each .sql file in a directory once, in its own
 * transaction, and records it in `schema_migrations`. Called by
 * server/scripts/apply-postgres-migrations.js.
 */
import nodeFs from "fs/promises";
import path from "path";

// process.stdout rather than console.log, which the no-console lint rule bars
// in server code. Callers that want the progress lines elsewhere -- the tests
// do -- inject `log`.
/** @param {string} message */
const logToStdout = (message) => {
  process.stdout.write(`${message}\n`);
};

/**
 * The calls the runner makes on a pool's connection: a pg PoolClient has them.
 * @typedef {object} MigrationClient
 * @property {(sql: string, values?: unknown[]) => Promise<unknown>} query
 * @property {() => void} release
 */

/**
 * The calls the runner makes on its pool: a pg Pool has them.
 * @typedef {object} MigrationPool
 * @property {(sql: string, values?: unknown[]) => Promise<{ rowCount: number | null }>} query
 * @property {() => Promise<MigrationClient>} connect
 */

/**
 * The two file reads the runner makes: fs/promises has them.
 * @typedef {object} MigrationFs
 * @property {(dir: string) => Promise<string[]>} readdir
 * @property {(file: string, encoding: "utf8") => Promise<string>} readFile
 */

/**
 * Applies every unapplied .sql file in `migrationsDir`, in filename order.
 *
 * `fs` is injectable so the transaction sequence can be tested without touching
 * the filesystem. Returns the filenames applied during this run.
 *
 * @param {object} deps
 * @param {MigrationPool} deps.pool
 * @param {string} deps.migrationsDir
 * @param {(message: string) => void} [deps.log]
 * @param {MigrationFs} [deps.fs]
 */
export const applyMigrations = async ({ pool, migrationsDir, log = logToStdout, fs = nodeFs }) => {
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
    // pg leaves rowCount null only for a command that reports no count; a select
    // always reports one.
    if (/** @type {number} */ (existing.rowCount) > 0) {
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
