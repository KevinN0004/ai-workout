import { describe, expect, test } from "vitest";
import { applyMigrations } from "./postgresMigrations.js";

const firstWord = (sql) => String(sql).trim().split(/\s+/)[0].toLowerCase();

/**
 * Records which connection every statement ran on. `pool.query` is tagged
 * "pool"; each `pool.connect()` hands back a distinctly tagged client. That
 * distinction is the point: a transaction split across "pool" calls is exactly
 * the defect under test.
 */
const createFakePool = ({ failOnSqlContaining = null } = {}) => {
  const calls = [];
  const checkedOut = [];
  let seq = 0;

  const makeClient = (tag) => ({
    tag,
    released: false,
    query: async (sql) => {
      const text = String(sql);
      calls.push({ tag, verb: firstWord(text), text });
      if (failOnSqlContaining && text.includes(failOnSqlContaining)) {
        throw new Error("migration boom");
      }
      if (text.includes("from schema_migrations")) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release() {
      this.released = true;
    }
  });

  const poolClient = makeClient("pool");

  return {
    calls,
    checkedOut,
    query: (sql) => poolClient.query(sql),
    connect: async () => {
      seq += 1;
      const client = makeClient(`client-${seq}`);
      checkedOut.push(client);
      return client;
    }
  };
};

const readFile = async () => "create table demo (id int);";
const readdir = async () => ["001_demo.sql"];

describe("applyMigrations", () => {
  test("runs begin, migration, and commit on one checked-out connection", async () => {
    const pool = createFakePool();

    const applied = await applyMigrations({
      pool,
      migrationsDir: "/migrations",
      log: () => {},
      fs: { readdir, readFile }
    });

    expect(applied).toEqual(["001_demo.sql"]);
    // The defect: without an explicit checkout the transaction has no
    // guaranteed connection and the rollback can be a no-op.
    expect(pool.checkedOut).toHaveLength(1);

    const txTag = pool.checkedOut[0].tag;
    const txVerbs = pool.calls.filter((c) => c.tag === txTag).map((c) => c.verb);
    expect(txVerbs).toEqual(["begin", "create", "insert", "commit"]);

    expect(pool.calls.some((c) => c.tag === "pool" && c.verb === "begin")).toBe(false);
    expect(pool.checkedOut[0].released).toBe(true);
  });

  test("rolls back on the same connection and rethrows when a migration fails", async () => {
    const pool = createFakePool({ failOnSqlContaining: "create table demo" });

    await expect(
      applyMigrations({
        pool,
        migrationsDir: "/migrations",
        log: () => {},
        fs: { readdir, readFile }
      })
    ).rejects.toThrow("migration boom");

    const txTag = pool.checkedOut[0].tag;
    const txVerbs = pool.calls.filter((c) => c.tag === txTag).map((c) => c.verb);
    expect(txVerbs).toEqual(["begin", "create", "rollback"]);
    expect(txVerbs).not.toContain("commit");
    expect(pool.checkedOut[0].released).toBe(true);
  });

  test("skips migrations already recorded in schema_migrations", async () => {
    const pool = createFakePool();
    pool.query = async (sql) => {
      const text = String(sql);
      pool.calls.push({ tag: "pool", verb: firstWord(text), text });
      if (text.includes("from schema_migrations")) return { rowCount: 1, rows: [{}] };
      return { rowCount: 0, rows: [] };
    };

    const applied = await applyMigrations({
      pool,
      migrationsDir: "/migrations",
      log: () => {},
      fs: { readdir, readFile }
    });

    expect(applied).toEqual([]);
    expect(pool.checkedOut).toHaveLength(0);
  });
});
