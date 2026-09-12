import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resolvePostgresConfig } from "./postgres.js";

// The connection layer. Two things here carry real risk: the redaction that
// keeps the database password out of anything that reports status, and the
// failure path of connectPostgres, which has to leave no half-open pool behind
// and must not swallow the error that caused it.

const pg = vi.hoisted(() => ({
  poolArgs: [],
  poolThrows: null,
  connect: null,
  end: null,
  query: null,
  releases: 0
}));

vi.mock("pg", () => {
  class Pool {
    constructor(args) {
      if (pg.poolThrows) throw pg.poolThrows;
      pg.poolArgs.push(args);
    }

    connect() {
      return pg.connect();
    }

    end() {
      return pg.end();
    }
  }
  return { Pool, default: { Pool } };
});

// Module state (the pool and the status) lives at module scope, so each test
// gets its own copy of the module rather than whatever the last one left.
const loadPostgres = async () => {
  vi.resetModules();
  return import("./postgres.js");
};

const workingClient = () => ({
  query: vi.fn(async (...args) => {
    pg.query?.(...args);
    return { rows: [{ "?column?": 1 }] };
  }),
  release: vi.fn(() => {
    pg.releases += 1;
  })
});

beforeEach(() => {
  pg.poolArgs = [];
  pg.poolThrows = null;
  pg.releases = 0;
  pg.query = vi.fn();
  pg.connect = vi.fn(async () => workingClient());
  pg.end = vi.fn(async () => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolvePostgresConfig", () => {
  test("is disabled when no Postgres URL is configured", () => {
    const config = resolvePostgresConfig({});

    expect(config.configured).toBe(false);
    expect(config.databaseUrl).toBe("");
    expect(config.safeDatabaseUrl).toBe("");
    expect(config.ssl).toBe(false);
  });

  test("accepts DATABASE_URL and redacts credentials in status output", () => {
    const config = resolvePostgresConfig({
      DATABASE_URL: "postgres://fitness_user:secret@localhost:5432/ai_workout",
      POSTGRES_SSL: "true",
      POSTGRES_SSL_REJECT_UNAUTHORIZED: "false"
    });

    expect(config.configured).toBe(true);
    expect(config.databaseUrl).toBe("postgres://fitness_user:secret@localhost:5432/ai_workout");
    expect(config.safeDatabaseUrl).toBe("postgres://redacted:redacted@localhost:5432/ai_workout");
    expect(config.ssl).toBe(true);
    expect(config.sslRejectUnauthorized).toBe(false);
  });

  test("falls back to POSTGRES_URL when DATABASE_URL is not set", () => {
    const config = resolvePostgresConfig({ POSTGRES_URL: "postgres://u:p@host:5432/db" });

    expect(config.configured).toBe(true);
    expect(config.databaseUrl).toBe("postgres://u:p@host:5432/db");
  });

  test("prefers DATABASE_URL when both are set", () => {
    const config = resolvePostgresConfig({
      DATABASE_URL: "postgres://u:p@primary:5432/db",
      POSTGRES_URL: "postgres://u:p@secondary:5432/db"
    });

    expect(config.databaseUrl).toContain("primary");
  });

  test("trims surrounding whitespace off the URL", () => {
    const config = resolvePostgresConfig({ DATABASE_URL: "  postgres://u:p@host:5432/db \n" });

    expect(config.databaseUrl).toBe("postgres://u:p@host:5432/db");
  });

  test("a URL of only whitespace counts as not configured", () => {
    expect(resolvePostgresConfig({ DATABASE_URL: "   " }).configured).toBe(false);
  });

  test.each([
    ["a number", 5432],
    ["an object", { toString: () => "postgres://u:p@host/db" }],
    ["a boolean", true]
  ])("%s is not accepted as a URL", (_label, DATABASE_URL) => {
    // Coercing instead of type-checking would turn 5432 into the string
    // "5432" and report a configured database that cannot exist.
    const config = resolvePostgresConfig({ DATABASE_URL });

    expect(config.configured).toBe(false);
    expect(config.databaseUrl).toBe("");
  });
});

describe("keeping the password out of the status", () => {
  const safeFor = (databaseUrl) => resolvePostgresConfig({ DATABASE_URL: databaseUrl });

  test("both the user and the password are replaced", () => {
    const { safeDatabaseUrl } = safeFor("postgres://admin:hunter2@db.internal:5432/ai_workout");

    expect(safeDatabaseUrl).not.toContain("hunter2");
    expect(safeDatabaseUrl).not.toContain("admin");
    expect(safeDatabaseUrl).toContain("db.internal:5432");
  });

  test("a URL that cannot be parsed is still stripped", () => {
    // The parser is the first line of defence; this is the second. Something
    // malformed enough to throw must not fall through with its password
    // intact, because the whole point of this value is that it gets logged.
    const { safeDatabaseUrl } = safeFor("postgres//admin:hunter2@db.internal:5432/ai_workout");

    expect(safeDatabaseUrl).not.toContain("hunter2");
    expect(safeDatabaseUrl).not.toContain("admin");
    expect(safeDatabaseUrl).toContain("[redacted]");
  });

  test("a user with no password is still replaced", () => {
    const { safeDatabaseUrl } = safeFor("postgres://admin@db.internal:5432/ai_workout");

    expect(safeDatabaseUrl).not.toContain("admin");
    expect(safeDatabaseUrl).toContain("redacted");
  });

  test("a user with no password is still replaced when the URL cannot be parsed", () => {
    // Both halves of the fallback matter independently: the password group in
    // that regex is optional, and without the `?` a credential-carrying URL
    // with no password would not match at all and would pass straight through.
    const { safeDatabaseUrl } = safeFor("postgres//admin@db.internal:5432/ai_workout");

    expect(safeDatabaseUrl).not.toContain("admin");
    expect(safeDatabaseUrl).toContain("[redacted]");
  });

  test("a URL with no credentials at all is left alone", () => {
    const { safeDatabaseUrl } = safeFor("postgres://db.internal:5432/ai_workout");

    expect(safeDatabaseUrl).not.toContain("redacted");
    expect(safeDatabaseUrl).toContain("db.internal");
  });

  test("an over-long URL is truncated before anything is done with it", () => {
    const { databaseUrl } = safeFor(`postgres://u:p@host/${"x".repeat(2000)}`);

    expect(databaseUrl).toHaveLength(1000);
  });
});

describe("reading the SSL switches", () => {
  const sslFor = (env) => resolvePostgresConfig({ DATABASE_URL: "postgres://u:p@host/db", ...env });

  test.each([["1"], ["true"], ["yes"], ["on"], ["TRUE"], ["  On  "]])(
    "%s turns SSL on",
    (value) => {
      expect(sslFor({ POSTGRES_SSL: value }).ssl).toBe(true);
    }
  );

  test.each([["0"], ["false"], ["no"], ["off"], ["OFF"]])("%s turns SSL off", (value) => {
    expect(sslFor({ POSTGRES_SSL: value }).ssl).toBe(false);
  });

  test.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["something else", "maybe"]
  ])("%s leaves SSL at its default of off", (_label, value) => {
    expect(sslFor({ POSTGRES_SSL: value }).ssl).toBe(false);
  });

  test.each([
    ["missing", undefined],
    ["empty", ""],
    ["something else", "perhaps"]
  ])("%s leaves certificate checking at its default of on", (_label, value) => {
    // This one defaults the other way, and defaulting it to off would accept
    // any certificate at all.
    expect(sslFor({ POSTGRES_SSL_REJECT_UNAUTHORIZED: value }).sslRejectUnauthorized).toBe(true);
  });

  test("certificate checking can be turned off deliberately", () => {
    expect(sslFor({ POSTGRES_SSL_REJECT_UNAUTHORIZED: "false" }).sslRejectUnauthorized).toBe(false);
  });
});

describe("connecting", () => {
  const env = { DATABASE_URL: "postgres://u:secret@host:5432/db" };

  test("does nothing at all when no URL is configured", async () => {
    const { connectPostgres, getPostgresPool } = await loadPostgres();

    const status = await connectPostgres({ env: {} });

    expect(status).toEqual({
      configured: false,
      connected: false,
      lastError: "",
      databaseUrl: ""
    });
    expect(pg.poolArgs).toHaveLength(0);
    expect(getPostgresPool()).toBeNull();
  });

  test("opens a pool and proves it works before reporting success", async () => {
    const { connectPostgres, getPostgresPool, getPostgresStatus } = await loadPostgres();

    const status = await connectPostgres({ env });

    expect(status.connected).toBe(true);
    expect(status.configured).toBe(true);
    expect(status.lastError).toBe("");
    expect(pg.query).toHaveBeenCalledWith("select 1");
    expect(pg.releases).toBe(1);
    expect(getPostgresPool()).not.toBeNull();
    expect(getPostgresStatus().connected).toBe(true);
  });

  test("the reported URL is the redacted one", async () => {
    const { connectPostgres } = await loadPostgres();

    const status = await connectPostgres({ env });

    expect(status.databaseUrl).not.toContain("secret");
  });

  test("passes the connection string and no SSL when SSL is off", async () => {
    const { connectPostgres } = await loadPostgres();

    await connectPostgres({ env });

    expect(pg.poolArgs[0].connectionString).toBe(env.DATABASE_URL);
    expect(pg.poolArgs[0].ssl).toBeUndefined();
  });

  test.each([
    ["on", "true", true],
    ["off", "false", false]
  ])("passes SSL with certificate checking %s", async (_label, reject, expected) => {
    const { connectPostgres } = await loadPostgres();

    await connectPostgres({
      env: { ...env, POSTGRES_SSL: "true", POSTGRES_SSL_REJECT_UNAUTHORIZED: reject }
    });

    expect(pg.poolArgs[0].ssl).toEqual({ rejectUnauthorized: expected });
  });
});

describe("when connecting fails", () => {
  const env = { DATABASE_URL: "postgres://u:secret@host:5432/db" };

  test("rethrows rather than reporting a healthy connection", async () => {
    pg.connect = vi.fn(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:5432");
    });
    const { connectPostgres, getPostgresStatus, getPostgresPool } = await loadPostgres();

    await expect(connectPostgres({ env })).rejects.toThrow("ECONNREFUSED");

    const status = getPostgresStatus();
    expect(status.connected).toBe(false);
    expect(status.configured).toBe(true);
    expect(status.lastError).toContain("ECONNREFUSED");
    // A pool that was opened and then failed its probe must not be left behind.
    expect(pg.end).toHaveBeenCalledTimes(1);
    expect(getPostgresPool()).toBeNull();
  });

  test("releases the client even when the probe query is what failed", async () => {
    const release = vi.fn();
    pg.connect = vi.fn(async () => ({
      query: vi.fn(async () => {
        throw new Error("relation does not exist");
      }),
      release
    }));
    const { connectPostgres } = await loadPostgres();

    await expect(connectPostgres({ env })).rejects.toThrow("relation does not exist");

    expect(release).toHaveBeenCalledTimes(1);
  });

  test("a failure while closing the broken pool does not hide the original error", async () => {
    pg.connect = vi.fn(async () => {
      throw new Error("the real problem");
    });
    pg.end = vi.fn(async () => {
      throw new Error("and another one while cleaning up");
    });
    const { connectPostgres, getPostgresPool } = await loadPostgres();

    await expect(connectPostgres({ env })).rejects.toThrow("the real problem");
    expect(getPostgresPool()).toBeNull();
  });

  test("a failure before the pool exists has nothing to clean up", async () => {
    // A malformed connection string can make the constructor itself throw, so
    // the cleanup has to cope with there being no pool to close.
    pg.poolThrows = new Error("invalid connection string");
    const { connectPostgres, getPostgresPool, getPostgresStatus } = await loadPostgres();

    await expect(connectPostgres({ env })).rejects.toThrow("invalid connection string");

    expect(pg.end).not.toHaveBeenCalled();
    expect(getPostgresPool()).toBeNull();
    expect(getPostgresStatus().lastError).toContain("invalid connection string");
  });

  test("an over-long error message is truncated before it is stored", async () => {
    pg.connect = vi.fn(async () => {
      throw new Error("x".repeat(1000));
    });
    const { connectPostgres, getPostgresStatus } = await loadPostgres();

    await expect(connectPostgres({ env })).rejects.toThrow();

    expect(getPostgresStatus().lastError).toHaveLength(300);
  });

  test("a thrown value that is not an Error is still reported", async () => {
    pg.connect = vi.fn(async () => {
      throw "just a string";
    });
    const { connectPostgres, getPostgresStatus } = await loadPostgres();

    await expect(connectPostgres({ env })).rejects.toBe("just a string");

    expect(getPostgresStatus().lastError).toBe("just a string");
  });
});

describe("closing", () => {
  const env = { DATABASE_URL: "postgres://u:secret@host:5432/db" };

  test("does nothing when there is no pool to close", async () => {
    const { closePostgres } = await loadPostgres();

    await expect(closePostgres()).resolves.toBeUndefined();
    expect(pg.end).not.toHaveBeenCalled();
  });

  test("ends the pool and forgets it", async () => {
    const { connectPostgres, closePostgres, getPostgresPool, getPostgresStatus } =
      await loadPostgres();
    await connectPostgres({ env });

    await closePostgres();

    expect(pg.end).toHaveBeenCalledTimes(1);
    expect(getPostgresPool()).toBeNull();
    expect(getPostgresStatus().connected).toBe(false);
  });

  test("closing twice is harmless", async () => {
    const { connectPostgres, closePostgres } = await loadPostgres();
    await connectPostgres({ env });

    await closePostgres();
    await closePostgres();

    expect(pg.end).toHaveBeenCalledTimes(1);
  });

  test("closing keeps the rest of the status rather than clearing it", async () => {
    const { connectPostgres, closePostgres, getPostgresStatus } = await loadPostgres();
    await connectPostgres({ env });

    await closePostgres();

    expect(getPostgresStatus().configured).toBe(true);
    expect(getPostgresStatus().databaseUrl).not.toContain("secret");
  });
});

describe("the status it hands out", () => {
  test("is a copy, so a caller cannot rewrite it", async () => {
    const { getPostgresStatus } = await loadPostgres();

    const status = getPostgresStatus();
    status.connected = true;
    status.lastError = "made up";

    expect(getPostgresStatus().connected).toBe(false);
    expect(getPostgresStatus().lastError).toBe("");
  });
});
