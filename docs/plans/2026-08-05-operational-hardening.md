# Operational Hardening Implementation Plan

> **STATUS: COMPLETE.** All five tasks are implemented and merged. Kept as a
> record of what was changed and why.
>
> | Task                               | Shipped in |
> | ---------------------------------- | ---------- |
> | 1 · Bound route metric cardinality | `6bf111d`  |
> | 2 · Transactional migrations       | PR #5      |
> | 3 · `closeSessionStore()`          | PR #4      |
> | 4 · Injectable shutdown sequence   | PR #4      |
> | 5 · Wire SIGTERM/SIGINT            | PR #4      |
>
> Two items listed under Out of Scope below remain genuinely open and are worth
> follow-ups: the Prisma/SQL unique-index drift, and the dependency CVEs.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three deploy-blocking operational defects found in the audit: unbounded metric cardinality, non-transactional migrations, and the absence of graceful shutdown.

**Architecture:** Each fix extracts its logic into a small, dependency-injected module that can be unit-tested without real infrastructure, then wires that module into the existing entry point. This follows the codebase's established `createXService({ deps })` factory pattern and keeps `index.js` as thin wiring.

**Tech Stack:** Node 20+ (ESM), Express 4, Vitest, `pg` Pool, Prisma, `node-redis` v4, pino.

---

## Research Findings

These were verified against the running server, not assumed. They drive the design decisions below.

**1. Metric cardinality leak is broader than 404s.** `sanitizeRoutePath` falls back to the caller-supplied path whenever `req.route` is absent. Probing a live server produced these `routeLatencyMs` keys:

| Request                                               | Key recorded                      |
| ----------------------------------------------------- | --------------------------------- |
| `GET /api/health` (matched)                           | `GET /api/health`                 |
| `GET /api/wger/exercises/999` (matched, param)        | `GET /api/wger/exercises/:id`     |
| `GET /api/nope-unmatched-xyz` (404)                   | `GET /api/nope-unmatched-xyz`     |
| `POST /api/attacker-controlled-25896` (CSRF-rejected) | `POST /attacker-controlled-25896` |

The last row matters most: **CSRF-rejected POSTs leak too**, and they need no session and no valid token, so an unauthenticated caller can grow the map. Note the missing `/api` prefix — `app.use("/api", ...)` strips the mount path, and the middleware ends the response before Express restores `req.url`.

Matched routes already collapse params to `:id`, so `req.route.path` is bounded by the number of declared routes. That makes it the safe source of truth, with a single fixed bucket for everything else. No LRU or cap is needed — the key space becomes (declared routes + 1) × methods.

**2. `pool.query` cannot hold a transaction.** `apply-postgres-migrations.js` issues `begin`, the migration SQL, and `commit` as three separate `pool.query()` calls. Each call checks out an arbitrary idle client, so the transaction can straddle connections and the `rollback` in the catch block may run on a connection that never began one. It is currently masked because `001_foundation.sql` is idempotent (25 `if not exists` clauses out of 33 DDL statements).

The test must assert `pool.connect()` is used, because a "same client" assertion would pass against the old code — with one query in flight at a time, a pool usually hands back the same idle client. Asserting the checkout is what fails deterministically against the current implementation.

**3. Shutdown primitives already exist but are unused.** `closePostgres()` (`postgres.js:102`) and `disconnectPrisma()` (`prisma.js:33`) are exported and never called. There is **no** Redis close function — one must be added. `app.listen()`'s return value is discarded, so there is no server handle to close. `http.Server#closeIdleConnections` and `closeAllConnections` are both available on the installed Node.

**4. Windows cannot test signals.** The dev machine is Windows, where Node does not receive POSIX signals the way CI (ubuntu-latest) does. Therefore the shutdown _sequence_ is extracted into `createShutdownHandler` and unit-tested by direct invocation with an injected `exit`; only the one-line `process.on` wiring is untested locally.

---

## File Structure

| File                                           | Responsibility                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `server/src/middleware/requestContext.js`      | _Modify._ Bound route-metric cardinality.                               |
| `server/src/middleware/requestContext.test.js` | _Modify._ Add cardinality regression test.                              |
| `server/src/postgresMigrations.js`             | _Create._ Transactional migration runner (importable, no side effects). |
| `server/src/postgresMigrations.test.js`        | _Create._ Fake-pool tests for commit/rollback/checkout.                 |
| `server/scripts/apply-postgres-migrations.js`  | _Modify._ Reduce to a thin CLI wrapper.                                 |
| `server/src/shutdown.js`                       | _Create._ Injectable shutdown sequence.                                 |
| `server/src/shutdown.test.js`                  | _Create._ Ordering, idempotency, failure, timeout tests.                |
| `server/src/services/sessionService.js`        | _Modify._ Add `closeSessionStore()`.                                    |
| `server/src/services/sessionService.test.js`   | _Modify._ Cover `closeSessionStore()`.                                  |
| `server/src/index.js`                          | _Modify._ Capture server handle, wire signal handlers.                  |
| `README.md`                                    | _Modify._ Document `SHUTDOWN_TIMEOUT_MS`.                               |

The migration logic goes in `src/` rather than `scripts/` for one concrete reason: the current script calls `run()` at module scope, so importing it in a test would execute a real migration. Splitting logic from entry point avoids needing a main-module guard.

---

### Task 1: Bound route metric cardinality

**Files:**

- Modify: `server/src/middleware/requestContext.js:3-8`
- Test: `server/src/middleware/requestContext.test.js`

- [x] **Step 1: Write the failing test**

Append this test inside the existing `describe("requestContext middleware", ...)` block in `server/src/middleware/requestContext.test.js`, after the last test:

```javascript
test("collapses unrouted requests into one bucket so metrics stay bounded", () => {
  const metrics = {
    requestsTotal: 0,
    requestLatencyMs: {},
    routeLatencyMs: {}
  };
  const logger = {
    child: vi.fn(() => ({ info: vi.fn() }))
  };
  const middleware = createRequestContextMiddleware({
    metrics,
    logger,
    toShortText: () => ""
  });

  // 404s and middleware rejections (CSRF, rate limit) arrive with no req.route
  // and a caller-supplied path. Each must not mint its own metric key.
  for (const path of ["/api/random-a", "/api/random-b", "/api/random-c"]) {
    const req = { headers: {}, method: "GET", path, originalUrl: path };
    const res = createResponseHarness();
    middleware(req, res, vi.fn());
    res.finish();
  }

  expect(Object.keys(metrics.routeLatencyMs)).toEqual(["GET <unmatched>"]);
  expect(metrics.routeLatencyMs["GET <unmatched>"].count).toBe(3);
});

test("still records a key per matched route", () => {
  const metrics = {
    requestsTotal: 0,
    requestLatencyMs: {},
    routeLatencyMs: {}
  };
  const logger = {
    child: vi.fn(() => ({ info: vi.fn() }))
  };
  const middleware = createRequestContextMiddleware({
    metrics,
    logger,
    toShortText: () => ""
  });

  const req = {
    headers: {},
    method: "GET",
    path: "/api/wger/exercises/999",
    originalUrl: "/api/wger/exercises/999",
    route: { path: "/api/wger/exercises/:id" }
  };
  const res = createResponseHarness();
  middleware(req, res, vi.fn());
  res.finish();

  expect(metrics.routeLatencyMs["GET /api/wger/exercises/:id"].count).toBe(1);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/middleware/requestContext.test.js --root server`

Expected: FAIL. The first new test reports three keys instead of one — something like:

```
AssertionError: expected [ 'GET /api/random-a', 'GET /api/random-b', 'GET /api/random-c' ] to deeply equal [ 'GET <unmatched>' ]
```

The second new test passes already (it documents behaviour we must not break).

- [x] **Step 3: Write minimal implementation**

In `server/src/middleware/requestContext.js`, replace the `sanitizeRoutePath` function (lines 3-8) with:

```javascript
const UNMATCHED_ROUTE_LABEL = "<unmatched>";

// Only paths Express actually matched become metric keys. Express collapses
// params (`/api/wger/exercises/:id`), so that set is bounded by the declared
// routes. Anything answered before routing -- 404s, CSRF and rate-limit
// rejections -- carries a caller-supplied path, and keying on it would let an
// unauthenticated client grow routeLatencyMs without bound.
const sanitizeRoutePath = (req) => {
  const routePath = req?.route?.path;
  if (typeof routePath === "string" && routePath) return routePath;
  return UNMATCHED_ROUTE_LABEL;
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/middleware/requestContext.test.js --root server`

Expected: PASS, 4 tests.

- [x] **Step 5: Verify against the live server**

```bash
cd server && PORT=5095 REDIS_URL= REDIS_HOST= REDIS_PORT= node src/index.js &
sleep 5
for i in 1 2 3; do curl -s -o /dev/null "http://127.0.0.1:5095/api/junk-$RANDOM"; done
for i in 1 2 3; do curl -s -o /dev/null -X POST "http://127.0.0.1:5095/api/junk-$RANDOM" -d '{}'; done
curl -s http://127.0.0.1:5095/api/health > /dev/null
curl -s http://127.0.0.1:5095/api/metrics
```

Expected: `byRoute` contains `GET <unmatched>` (count 3), `POST <unmatched>` (count 3), `GET /api/health`, `GET /api/metrics` — and **no** key containing `junk`.

Stop the server before continuing.

- [x] **Step 6: Commit**

```bash
git add server/src/middleware/requestContext.js server/src/middleware/requestContext.test.js
git commit -m "fix: bound route metric cardinality to declared routes"
```

---

### Task 2: Make migrations genuinely transactional

**Files:**

- Create: `server/src/postgresMigrations.js`
- Create: `server/src/postgresMigrations.test.js`
- Modify: `server/scripts/apply-postgres-migrations.js` (full rewrite)

- [x] **Step 1: Write the failing test**

Create `server/src/postgresMigrations.test.js`:

```javascript
import { describe, expect, test, vi } from "vitest";
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/postgresMigrations.test.js --root server`

Expected: FAIL with `Failed to load ./postgresMigrations.js` — the module does not exist yet.

- [x] **Step 3: Write minimal implementation**

Create `server/src/postgresMigrations.js`:

```javascript
import nodeFs from "fs/promises";
import path from "path";

/**
 * Applies every unapplied .sql file in `migrationsDir`, in filename order.
 *
 * `fs` is injectable so the transaction sequence can be tested without touching
 * the filesystem. Returns the filenames applied during this run.
 */
export const applyMigrations = async ({ pool, migrationsDir, log = console.log, fs = nodeFs }) => {
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
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/postgresMigrations.test.js --root server`

Expected: PASS, 3 tests.

- [x] **Step 5: Rewrite the CLI script to use it**

Replace the entire contents of `server/scripts/apply-postgres-migrations.js` with:

```javascript
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
```

- [x] **Step 6: Verify the real migration path still works**

```bash
npm -w server run migrate:postgres
```

Expected: `[postgres:migrate] skipped 001_foundation.sql` (already applied), exit code 0.

Then confirm it is genuinely idempotent against a fresh database and that the full suite still passes:

```bash
npm -w server run test
```

Expected: all tests pass.

- [x] **Step 7: Commit**

```bash
git add server/src/postgresMigrations.js server/src/postgresMigrations.test.js server/scripts/apply-postgres-migrations.js
git commit -m "fix: run each migration in a real transaction on one connection"
```

---

### Task 3: Add a Redis close function

**Files:**

- Modify: `server/src/services/sessionService.js`
- Test: `server/src/services/sessionService.test.js`

This is split from the shutdown sequence because it is the one missing primitive — `closePostgres` and `disconnectPrisma` already exist.

- [x] **Step 1: Write the failing test**

Append to the `describe("initSessionStore", ...)` block in `server/src/services/sessionService.test.js`:

```javascript
test("closeSessionStore is safe when no Redis client was ever created", async () => {
  const service = buildService();
  await service.initSessionStore({});

  await expect(service.closeSessionStore()).resolves.toBeUndefined();
  expect(service.isRedisSessionsEnabled()).toBe(false);
  expect(service.getRedisClient()).toBeNull();
});

test("closeSessionStore disconnects the client and disables Redis sessions", async () => {
  const service = buildService({ redisConnectTimeoutMs: 300 });
  await service.initSessionStore({ REDIS_HOST: "127.0.0.1", REDIS_PORT: "1" });

  await service.closeSessionStore();

  expect(service.isRedisSessionsEnabled()).toBe(false);
  expect(service.getRedisClient()).toBeNull();
}, 15000);
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/sessionService.test.js --root server`

Expected: FAIL with `service.closeSessionStore is not a function`.

- [x] **Step 3: Write minimal implementation**

In `server/src/services/sessionService.js`, add this function immediately after `attachOptionalUser`:

```javascript
/**
 * Releases the Redis connection so a shutdown is not held open by it.
 * Safe to call when Redis was never configured or already fell back.
 */
const closeSessionStore = async () => {
  const client = redisClient;
  redisClient = null;
  redisSessionsEnabled = false;
  await closeRedisClientQuietly(client);
};
```

Then add `closeSessionStore,` to the returned object, immediately after `attachOptionalUser,`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/sessionService.test.js --root server`

Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add server/src/services/sessionService.js server/src/services/sessionService.test.js
git commit -m "feat: add closeSessionStore to release the Redis connection"
```

---

### Task 4: Build the shutdown sequence

**Files:**

- Create: `server/src/shutdown.js`
- Create: `server/src/shutdown.test.js`

- [x] **Step 1: Write the failing test**

Create `server/src/shutdown.test.js`:

```javascript
import { afterEach, describe, expect, test, vi } from "vitest";
import { createShutdownHandler } from "./shutdown.js";

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
});

const buildDeps = (overrides = {}) => {
  const order = [];
  const httpServer = {
    close: vi.fn((cb) => {
      order.push("http");
      cb();
    }),
    closeIdleConnections: vi.fn()
  };
  return {
    order,
    httpServer,
    deps: {
      logger: createLogger(),
      toShortText: (value) => String(value || ""),
      getHttpServer: () => httpServer,
      closeSessionStore: vi.fn(async () => {
        order.push("session");
      }),
      disconnectPrisma: vi.fn(async () => {
        order.push("prisma");
      }),
      closePostgres: vi.fn(async () => {
        order.push("postgres");
      }),
      flushErrorTracker: vi.fn(async () => {
        order.push("flush");
      }),
      shutdownTimeoutMs: 5000,
      exit: vi.fn(),
      ...overrides
    }
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("createShutdownHandler", () => {
  test("stops the server, releases every resource in order, and exits 0", async () => {
    const { order, httpServer, deps } = buildDeps();
    const shutdown = createShutdownHandler(deps);

    await shutdown("SIGTERM");

    expect(order).toEqual(["http", "session", "prisma", "postgres", "flush"]);
    // Idle keep-alive sockets keep close() pending until they time out.
    expect(httpServer.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  test("ignores repeat signals once shutdown is under way", async () => {
    const { deps } = buildDeps();
    const shutdown = createShutdownHandler(deps);

    await shutdown("SIGTERM");
    await shutdown("SIGINT");

    expect(deps.closePostgres).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  test("exits 1 when a resource fails to close", async () => {
    const { deps } = buildDeps({
      closePostgres: vi.fn(async () => {
        throw new Error("pool stuck");
      })
    });
    const shutdown = createShutdownHandler(deps);

    await shutdown("SIGTERM");

    expect(deps.exit).toHaveBeenCalledWith(1);
    expect(deps.logger.error).toHaveBeenCalled();
  });

  test("forces exit when shutdown outlives the timeout", async () => {
    vi.useFakeTimers();
    const { deps } = buildDeps({
      // Never invokes the callback, so close() never settles.
      getHttpServer: () => ({ close: vi.fn(), closeIdleConnections: vi.fn() })
    });
    const shutdown = createShutdownHandler(deps);

    shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(5000);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  test("tolerates a missing http server", async () => {
    const { deps } = buildDeps({ getHttpServer: () => null });
    const shutdown = createShutdownHandler(deps);

    await shutdown("SIGTERM");

    expect(deps.exit).toHaveBeenCalledWith(0);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shutdown.test.js --root server`

Expected: FAIL with `Failed to load ./shutdown.js`.

- [x] **Step 3: Write minimal implementation**

Create `server/src/shutdown.js`:

```javascript
/**
 * Builds the routine run on SIGTERM/SIGINT: stop accepting connections, drain,
 * then release every external resource before exiting.
 *
 * Dependencies are injected so the sequence is unit-testable by direct call.
 * That matters because Windows does not deliver POSIX signals to Node the way
 * the Linux CI runner does, so signal-driven tests would not run locally.
 */
export const createShutdownHandler = ({
  logger,
  toShortText,
  getHttpServer,
  closeSessionStore,
  disconnectPrisma,
  closePostgres,
  flushErrorTracker,
  shutdownTimeoutMs = 10000,
  exit = (code) => process.exit(code)
}) => {
  let shuttingDown = false;

  return async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ event: "shutdown_started", signal }, "Shutdown signal received.");

    const forceExit = setTimeout(() => {
      logger.error(
        { event: "shutdown_timeout", signal, shutdownTimeoutMs },
        "Shutdown did not finish in time. Forcing exit."
      );
      exit(1);
    }, shutdownTimeoutMs);
    // Never let the guard timer itself hold the process open.
    if (typeof forceExit.unref === "function") forceExit.unref();

    try {
      const httpServer = getHttpServer();
      if (httpServer) {
        await new Promise((resolve) => {
          httpServer.close(() => resolve());
          // close() waits on idle keep-alive sockets; drop them so it can finish.
          httpServer.closeIdleConnections?.();
        });
      }
      await closeSessionStore();
      await disconnectPrisma();
      await closePostgres();
      await flushErrorTracker();

      clearTimeout(forceExit);
      logger.info({ event: "shutdown_complete", signal }, "Shutdown complete.");
      exit(0);
    } catch (err) {
      clearTimeout(forceExit);
      logger.error(
        {
          event: "shutdown_failed",
          signal,
          error: toShortText(err?.message || String(err), 300)
        },
        "Shutdown failed."
      );
      exit(1);
    }
  };
};
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shutdown.test.js --root server`

Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add server/src/shutdown.js server/src/shutdown.test.js
git commit -m "feat: add an injectable graceful shutdown sequence"
```

---

### Task 5: Wire shutdown into the server

**Files:**

- Modify: `server/src/index.js` (imports, env var, `startServer`)
- Modify: `README.md`

- [x] **Step 1: Import the new pieces**

In `server/src/index.js`, update the two existing imports and add one:

```javascript
import { closePostgres, connectPostgres, getPostgresStatus } from "./postgres.js";
import { connectPrisma, disconnectPrisma, prisma } from "./prisma.js";
import { createShutdownHandler } from "./shutdown.js";
```

- [x] **Step 2: Add the timeout setting**

Immediately after the `redisConnectTimeoutMs` line, add:

```javascript
const shutdownTimeoutMs = toPositiveInt(process.env.SHUTDOWN_TIMEOUT_MS, 10000);
```

- [x] **Step 3: Capture the server handle and register handlers**

In `startServer`, replace this block:

```javascript
app.listen(port, () => {
  logger.info({ event: "server_started", port }, `Server listening on http://localhost:${port}`);
});
```

with:

```javascript
const httpServer = app.listen(port, () => {
  logger.info({ event: "server_started", port }, `Server listening on http://localhost:${port}`);
});

const handleShutdown = createShutdownHandler({
  logger,
  toShortText,
  getHttpServer: () => httpServer,
  closeSessionStore: sessionService.closeSessionStore,
  disconnectPrisma,
  closePostgres,
  flushErrorTracker: () => errorTracker.flush(sentryShutdownTimeoutMs),
  shutdownTimeoutMs
});
// Registered here rather than at module scope so importing `app` in tests
// does not attach process-wide handlers.
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
```

- [x] **Step 4: Document the setting**

In `README.md`, add this row to the server variables table, directly after the `REDIS_STARTUP_REQUIRED` row:

```markdown
| `SHUTDOWN_TIMEOUT_MS` | Grace period for draining requests and closing connections on SIGTERM/SIGINT | `10000` |
```

- [x] **Step 5: Verify the whole suite and a real boot**

```bash
npm -w server run test
npm -w client run test
npm -w client run build
```

Expected: all green.

Then confirm the server still starts and serves:

```bash
cd server && PORT=5095 REDIS_URL= REDIS_HOST= REDIS_PORT= node src/index.js &
sleep 5
curl -s -o /dev/null -w "health -> %{http_code}\n" http://127.0.0.1:5095/api/health
```

Expected: `health -> 200`. Stop the server.

- [x] **Step 6: Verify graceful shutdown on Linux**

Signals cannot be exercised on the Windows dev machine, so use the Linux container that already runs Postgres, or skip to CI. If Docker is available:

```bash
docker run --rm -v "$(pwd)":/app -w /app/server node:20 sh -c '
  PORT=5095 REDIS_URL= REDIS_HOST= REDIS_PORT= DATABASE_URL= node src/index.js &
  PID=$!
  sleep 5
  kill -TERM $PID
  wait $PID
  echo "exit code: $?"
'
```

Expected: logs show `shutdown_started` then `shutdown_complete`, and `exit code: 0`.

If Docker is unavailable, record that this step was skipped — the unit tests in Task 4 cover the sequence, and only the two `process.on` lines remain unverified.

- [x] **Step 7: Commit**

```bash
git add server/src/index.js README.md
git commit -m "feat: shut down cleanly on SIGTERM and SIGINT"
```

---

## Out of Scope

Deliberately excluded — these were in the audit but are not deploy-blocking, and folding them in would widen the diff:

- **Prisma schema/SQL drift** (7 missing `@@unique` declarations). Only bites if someone runs `prisma db push`. Worth a follow-up.
- **Dependency updates** (`jspdf` 4.2.1, `express` 4.22.2). Note that plain `npm audit fix` takes the tree from 29 to 39 vulnerabilities and must not be used.
- **Pagination tiebreaker** dropped by the Prisma shim's `sort()`.
- **Node version drift** (CI on 20, dev on 24, no `engines` field).
- **JSON 404 handler** for unmatched `/api` routes.

## Verification Summary

On completion, all of the following must hold:

- `npm -w server run test` — passes with 12 new tests (2 requestContext, 3 postgresMigrations, 2 sessionService, 5 shutdown), taking the server suite from 58 to 70. The 2 pre-existing requestContext tests must stay green.
- `npm -w client run test` and `npm -w client run build` — unchanged and green.
- `/api/metrics` shows no caller-supplied path segments after hitting junk routes.
- `npm -w server run migrate:postgres` — still idempotent.
- SIGTERM drains and exits 0 (on Linux/CI).
