# Readability follow-up: Phase 3 server track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the server column of Phase 3 of `docs/specs/2026-10-10-readability-follow-up-design.md` (S1 to S5), one PR at a time: sessions that fail closed when Redis is down, route-caught 5xx reported to Sentry, three small correctness fixes, the metrics and CSRF notes, then one floor PR.

**Architecture:** Every task is a new branch from the current `origin/main` and one PR. The order is S1, S2, S3a, S3b, S3c, S4, S5, and each PR merges before the next is marked ready. S3 is split into three PRs because its three fixes touch unrelated files. Each fix ships a test that fails for the bug's reason, covers every statement, branch and function it adds, keeps every server coverage floor, and leaves the floors alone. S5 raises them once. The client track runs in parallel and never forces a re-check here.

**Tech Stack:** Express 5, node-redis (`redis` / `@redis/client` 6.3.0), `@sentry/node` 11.5.0, Prisma, Vitest 5 with v8 coverage, supertest, Docker Compose (Redis, for S1's boot check), GitHub (gh CLI).

**Baseline (`main` at `74de371`, measured 2026-10-10):**

| Side   | Tests | Statements        | Branches          | Functions       | Lines             |
| ------ | ----- | ----------------- | ----------------- | --------------- | ----------------- |
| Server | 1127  | 94.50 (2234/2364) | 86.97 (1643/1889) | 95.56 (366/383) | 95.75 (2007/2096) |

The floors are 94.5 / 86.9 / 95.5 / 95.7 (`server/vitest.config.js`). CI run 38072876537 on `74de371` reads server branches at 87.4 on Node 22 and Node 24; the other three match local.

Slack is `covered - floor% × total`: how far a metric sits above the least its floor accepts. Vitest passes a metric exactly when its slack is 0 or more, because it floors the percentage to two decimals before comparing (`node_modules/@vitest/istanbul-lib-coverage/dist/index.mjs`, `percent()`).

| Metric     | Slack on `main` | One new uncovered item | One covered item deleted |
| ---------- | --------------- | ---------------------- | ------------------------ |
| Statements | 0.020           | fails (-0.945)         | fails (-0.055)           |
| Branches   | 1.459           | passes (-0.869)        | passes (-0.131)          |
| Functions  | 0.235           | fails (-0.955)         | passes (-0.045)          |
| Lines      | 1.128           | passes (-0.957)        | passes (-0.043)          |

So on `main`, deleting even one covered statement fails CI. Covering a statement that was uncovered adds a whole 1.0 of slack, and adding a covered one adds 0.055. Each task below says what it adds, removes and newly covers, and what the scratch measurement of its changed files showed.

---

## Conventions

- **Shell.** Git Bash, from `D:\ai-workout`. Set `SCRATCH` to any folder outside the repo, and `TOOLS="$SCRATCH/tools"`. Redirect command output there. Never `cd` into a `src` folder: a persisted working directory there makes the claude-flow hook drop a `.jsonl` under `src`, and coverage then logs `PARSE_ERROR`.
- **Exit codes.** Never gate on a pipe: redirect output to a file, then read `$?`.
- **Secrets.** Never read, stat or print `server/.env`.
- **Server suite.** It needs Postgres (`npm run postgres:local:start -w server`) and a generated Prisma client (`npm run prisma:generate -w server`) after any `npm ci`. The new tests in this plan need neither: every one of them is DB-free, and the targeted runs below can be done without Postgres. The gates cannot.
- **Take `main`.** Every task starts a NEW branch from the current `origin/main`: `git fetch origin && git switch -c <branch> origin/main`. If `main` moves while the PR is open, take it by merging, never by rebasing: `git fetch origin && git merge origin/main`, then re-run the gates. This avoids force-pushing, and the push gives GitHub a fresh merge ref.
- **Line numbers** are those of the file on `74de371`, before any edit in the task. Where an earlier task in this plan shifts them, the task says so. Every edit also quotes or names the text it replaces, so match on the text: an edit near the top of a file moves every line number below it.
- **Resolving a conflict.** Keep the PR's code change. Keep `main`'s comments wherever they still describe the code. Rewrite any comment that the PR's change makes untrue, following `docs/code-readability-sop.md`: present tense, every claim checked against the code, no numbers copied from elsewhere. After resolving, `git diff origin/main` must show only the PR's intended change and the comment rewrites it forces.
- **Tools.** Copy `same-code.mjs` and `mutate.mjs` into `$TOOLS` from `docs/plans/2026-09-29-code-readability.md`, Task 0, Steps 4 and 5, if `$TOOLS` does not hold them. Then write the two below into `$TOOLS` with the Write tool, never a heredoc.

  `$TOOLS/floor-check.mjs` reads the exact counts and the floors:

  ```js
  /**
   * Compares server/coverage/coverage-summary.json with the floors in
   * server/vitest.config.js. For each metric it prints covered/total, the exact
   * percentage, the floor, and the slack: covered minus floor% of total, which
   * is how far the metric sits above the least its floor accepts. Vitest passes
   * a metric exactly when its slack is 0 or more. Exits 1 when any is negative.
   *
   * Usage: node floor-check.mjs <repoRoot>
   */
  import { readFileSync } from "node:fs";
  import path from "node:path";

  const root = process.argv[2] || "D:/ai-workout";
  const summaryPath = path.join(root, "server/coverage/coverage-summary.json");
  const { total } = JSON.parse(readFileSync(summaryPath, "utf8"));
  const config = readFileSync(path.join(root, "server/vitest.config.js"), "utf8");
  const thresholds = config.match(/thresholds:\s*\{([\s\S]*?)\}/)[1];

  let below = false;
  for (const metric of ["statements", "branches", "functions", "lines"]) {
    const floor = Number(thresholds.match(new RegExp(String.raw`${metric}:\s*([\d.]+)`))[1]);
    const { covered, total: count } = total[metric];
    const slack = covered - (floor / 100) * count;
    if (slack < 0) below = true;
    console.log(
      `${metric.padEnd(10)} ${covered}/${count} = ${((100 * covered) / count).toFixed(4)}` +
        `  floor ${floor}  slack ${slack.toFixed(3)}${slack < 0 ? "  BELOW FLOOR" : ""}`
    );
  }
  process.exit(below ? 1 : 0);
  ```

  Checked against `main`'s counts it prints slack 0.020 / 1.459 / 0.235 / 1.128 and exits 0; with statements one lower it prints `BELOW FLOOR` and exits 1.

  `$TOOLS/run-mutants.mjs` uses `mutate.mjs`'s edit format and its rule that an edit which does not apply is a failure, and adds a test run and a restore per mutant:

  ```js
  /**
   * Runs each mutant in a JSON list against the server suite and puts every
   * file back afterwards. A mutant is "caught" when its tests fail. One whose
   * edit does not apply, or that survives, fails the run.
   *
   * Usage, from the repo root: node run-mutants.mjs <mutants.json>
   *   mutants.json: [{ "name": "...", "tests": "src/a.test.js src/b.test.js",
   *                    "edits": [{ "file": "server/src/...", "find": "...", "text": "..." }] }]
   */
  import { spawnSync } from "node:child_process";
  import { readFileSync, writeFileSync } from "node:fs";

  const mutants = JSON.parse(readFileSync(process.argv[2], "utf8"));
  let bad = 0;
  for (const { name, tests, edits } of mutants) {
    const originals = new Map();
    let applied = true;
    for (const { file, find, text } of edits) {
      if (!originals.has(file)) originals.set(file, readFileSync(file, "utf8"));
      const src = readFileSync(file, "utf8");
      const at = src.indexOf(find);
      if (at === -1) {
        applied = false;
        break;
      }
      writeFileSync(file, src.slice(0, at) + text + src.slice(at + find.length));
    }
    let verdict = "NOT APPLIED";
    if (applied) {
      const run = spawnSync(
        process.execPath,
        ["../node_modules/vitest/vitest.mjs", "run", ...tests.split(" ")],
        { cwd: "server", encoding: "utf8" }
      );
      verdict = run.status === 0 ? "SURVIVED" : "caught";
    }
    for (const [file, text] of originals) writeFileSync(file, text);
    if (verdict !== "caught") bad += 1;
    console.log(`${verdict.padEnd(11)} ${name}`);
  }
  process.exit(bad ? 1 : 0);
  ```

- **Mutation lists** are JSON files written with the Write tool, never a heredoc or an argument: Git Bash rewrites an argument that starts with `//`. Each `find` must match the file exactly, so a CRLF working copy shows as `NOT APPLIED` rather than as a pass. After a run, `git diff --stat` must show only the task's own changes.
- **Exact coverage.** The text table rounds, so every coverage claim comes from the counts:

  ```bash
  npm run test:coverage -w server -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cov-server.txt" 2>&1; echo "server coverage exit=$?"
  node "$TOOLS/floor-check.mjs" D:/ai-workout > "$SCRATCH/floor-check.txt" 2>&1; echo "floor-check exit=$?"; cat "$SCRATCH/floor-check.txt"
  ```

  Both exits must be `0`. Record the four lines in the PR body.

- **The gates on every PR.** Each one is redirected to a file, and its exit code must be `0`.

  ```bash
  npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
  npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
  npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "knip exit=$?"
  npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"
  npm run test:coverage > "$SCRATCH/cov.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files|Tests  " "$SCRATCH/cov.txt"
  npm run test:e2e > "$SCRATCH/e2e.txt" 2>&1; echo "test:e2e exit=$?"; tail -3 "$SCRATCH/e2e.txt"
  ```

- **Also on every PR,** because the spec's Verification asks for the header ratchet and `npm run test:coverage` does not run it: `npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"`, plus the exact-coverage block above.
- **Floors.** No fix PR edits a floor. Task S5 raises them once.
- **Merging.** A PR merges only after its spec and quality reviews pass, its checks are green, and it shows `mergeStateStatus` `CLEAN`. Merge with **"Create a merge commit"**, then wait for the CI run on `main` to go green before starting the next task.
- **Trailers.** Every commit ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.
- **Reviews.** The spec review reads the task against the Phase 3 server column and the defaults table of `docs/specs/2026-10-10-readability-follow-up-design.md`, and against this plan. The quality review reads the diff for correctness, `docs/code-readability-sop.md`, and whether each new test fails for the bug's reason. Fix rounds continue until both pass.
- **The other track.** A client-track merge forces no re-check here (spec, "What forces a re-check"). A server-track merge means the next server PR merges `main` and re-runs the gates and the exact-coverage block.

---

### Task S1: Sessions fail closed when Redis is down

While Redis is the session store, every session operation today swallows a Redis failure. A failed write falls back to an in-memory map that no read consults, so sign-in answers 200 with a session nobody can read; a failed read answers 401, then issues a second DEL that waits out its own timeout; a failed sign-out delete answers 200 and leaves the session alive. Each command waits node-redis's 5 s default first. After this task a failed command throws `SessionStoreUnavailableError`, every route that reads or writes a session answers 503, nothing falls back to memory, and each command fails after 1.5 s.

**What the installed client does, measured 2026-10-12** with `redis` and `@redis/client` 6.3.0 against a fake RESP2 server on loopback that was killed after connecting:

| Client option                       | `SET` while reconnecting                   |
| ----------------------------------- | ------------------------------------------ |
| defaults                            | rejected after 5008 ms (`TimeoutError`)    |
| `commandOptions: { timeout: 1500 }` | rejected after 1512 ms (`TimeoutError`)    |
| `disableOfflineQueue: true`         | rejected after 0 ms (`ClientOfflineError`) |
| timeout 1500, server alive but mute | still pending at the 8 s cap               |

The code behind it, under `node_modules/@redis/client/dist/lib/`:

- `defaults.js:5` sets `DEFAULT_COMMAND_TIMEOUT = 5000`, and `client/index.js:466` applies it as `this._commandOptions = { timeout: DEFAULT_COMMAND_TIMEOUT, ...options.commandOptions }`.
- `client/index.js:1126-1142` (`sendCommand`) queues a command while the socket is open but not ready, unless `disableOfflineQueue` is set, which rejects it at once.
- `client/commands-queue.js:194-246` (`addCommand`) arms the timeout as an `AbortSignal.timeout` on each queued command, and `commands-queue.js:410-436` (`commandsToWrite`) removes it once the command is written to the socket. So the timeout bounds the wait to reach the socket, which is the whole of a reconnect, and not a reply from a server that accepted the command and went quiet.
- `client/socket.js:322-353` (`#onSocketError`) asks the reconnect strategy with retries `0` when a ready socket drops, reconnects at once, and then `#connect(1)` passes 1, 2, 3 for each failed attempt. This is the 6.3.0 change from node-redis #3465; #3433 makes a strategy that gives up emit `terminated`.

**Decision: `commandOptions: { timeout: 1500 }`.** It bounds an outage at 1.5 s, and it still lets a command issued during the immediate reconnect after a dropped connection succeed once the client is ready again. `disableOfflineQueue` would fail that command too. `socket.socketTimeout` is an idle timeout (`client/socket.js:303-310`): with no `pingInterval` set it would close a healthy idle connection every 1.5 s. A Redis that accepts commands and never answers, such as a paused container, stays unbounded, as it is on `main` today. That is recorded under "Not in this phase" for the owner.

**Default #1 applies.** A signed-in request while Redis is down answers 503. Checked on `main`: the client has no 401-specific branch (`git grep -n "401" -- client/src ':!**/__tests__/**'` finds none). On load, `App.jsx`'s session check leaves the user signed out on any non-OK answer, and `onLogout` in `client/src/app/events.js` clears local state whatever the server answers. So 503 is chosen because it is true, not because the client would treat a 401 differently today.

**`/api/ready` and recovery.** `systemRoutes.js:64` computes `redisConnected = redisSessionsEnabled() && Boolean(redisClient()?.isReady)` per request, and line 99 reports `mode: redisConnected ? "redis" : "in_memory_fallback"`. During an outage `redisSessionsEnabled()` stays true and `isReady` is false, so it says `in_memory_fallback`. That was already half untrue (writes went to memory, reads did not), and after this task it is wholly untrue. This task reports `"unavailable"` for that state and keeps `"in_memory_fallback"` for Redis never configured or failed at startup, the only reader of which is `server/src/__tests__/index.test.js:236` and that case is unchanged. Recovery is node-redis's own reconnect loop driven by `redisReconnectStrategy` (`sessionService.js:118-124`), which this task does not change: after a drop it waits 1 s, 2 s, 4 s, 8 s, 16 s, then 30 s for each further attempt. So readiness returns to `"redis"` within one backoff step of Redis restarting, which is about 2 s after a short outage and at most 30 s after a long one. Three things prove it: a unit test pins the strategy's post-startup waits and that it never gives up; a readiness test flips one client's `isReady` and sees `"unavailable"` then `"redis"` on the next request with no restart; and Step 14's boot check stops and restarts a real Redis and times the recovery.

**Files:**

- Modify: `server/src/services/auth/sessionService.js` (header 1-6, imports 7-9, reconnect comment 111-116, after `pruneExpiredInMemorySessions` 147-154, client options 184-199, `createSession` 266-287, `getSessionByToken` 289-318, `deleteSession` 320-336, `requireAuth` catch 380-382)
- Modify: `server/src/routes/systemRoutes.js` (64, 99)
- Modify: `server/src/routes/authRoutes.js` (import 7, summary 9-15, catches at 66, 140, 195, 251, 277, 290, comments at 116 and 183, logout 281-292)
- Test: `server/src/services/auth/__tests__/sessionService.redis.test.js` (header 1-10, after 72, after 134, after 195, replace 257-388)
- Test: `server/src/routes/__tests__/systemRoutes.test.js` (before 99)
- Test: `server/src/routes/__tests__/authRoutes.test.js` (import 7, after 61, after 298, after 585, after 800, after 928, replace 1042-1053, replace 1223-1234)

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/sessions-fail-closed origin/main
```

- [ ] **Step 2: The session-service tests**

In `sessionService.redis.test.js`, make five edits.

(a) Replace lines 1-10 (the imports and the header comment) with:

```js
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createSessionService, SessionStoreUnavailableError } from "../sessionService.js";

// The Redis-backed session paths. Reaching them needs the redis module mocked
// rather than a dependency injected; the fake below is a node-redis lookalike.
//
// The behaviour worth having is failing closed. While Redis is the store, a
// failed command records the error and throws SessionStoreUnavailableError,
// which the routes answer with a 503. Nothing falls back to memory, so no
// session exists that only one process can read, and a caller whose session
// could not be checked is never told it does not exist.
```

(b) After line 72 (``const req = (token) => ({ headers: { cookie: `sid=${token}` } });``), add:

```js
// Just enough of an express response for requireAuth.
const buildRes = () => {
  const res = {
    statusCode: null,
    body: null,
    status: vi.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload) => {
      res.body = payload;
      return res;
    })
  };
  return res;
};

// Makes one fake command fail the way a dropped connection does.
const failing = (message = "redis is on fire") =>
  vi.fn(async () => {
    throw new Error(message);
  });
```

(c) After the `pins RESP2 when configured with %s` test, which ends at line 134, add:

```js
// node-redis queues a command while it reconnects and fails it only after
// its own 5 s default, so a sign-in during an outage would hang that long
// before its 503. Both configuration shapes get the shorter limit.
test.each([
  ["a url", { REDIS_URL: "redis://localhost:6379" }],
  ["a host and port", { REDIS_HOST: "cache.internal", REDIS_PORT: "6380" }]
])("gives every command a 1.5 s timeout when configured with %s", async (_label, env) => {
  await connected({}, env);

  expect(createClient.mock.calls[0][0].commandOptions).toEqual({ timeout: 1500 });
});
```

(d) After the `connecting` describe block, which closes at line 195, add:

```js
// Recovery after an outage is node-redis's reconnect loop, driven by this
// strategy; /api/ready reads the client's live state, so it reports "redis"
// again as soon as a reconnect succeeds. node-redis 6.3 asks the strategy with
// retries 0 when a ready socket drops, reconnects at once, then passes 1, 2,
// 3... for each failed attempt.
describe("reconnecting", () => {
  const strategyOf = () => createClient.mock.calls[0][0].socket.reconnectStrategy;

  test("after startup, never gives up, doubling from 1 s to a 30 s cap", async () => {
    await connected();

    const waits = [1, 2, 3, 4, 5, 6, 50].map((retries) => strategyOf()(retries));

    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  // Before startup settles the strategy is bounded, so a Redis that is down at
  // boot cannot hold the server back from listen(): it returns an Error after
  // five retries, which ends connect().
  test("during startup, gives up after five retries", async () => {
    let waits = [];
    fakeRedis.connect = vi.fn(async () => {
      waits = [0, 1, 4, 5].map((retries) => strategyOf()(retries));
    });

    await connected();

    expect(waits.slice(0, 3)).toEqual([100, 200, 1000]);
    expect(waits[3]).toBeInstanceOf(Error);
  });
});
```

(e) Replace lines 257-388 (the comment `// The reason the fallback exists: ...` and the whole `describe("when Redis fails after connecting", ...)` block) with:

```js
// A command failing while Redis is the store: the session operation refuses
// with a 503 rather than inventing an answer, and leaves nothing in memory.
describe("when Redis fails after connecting", () => {
  test("a failed write refuses the session rather than returning a token", async () => {
    const { service } = await connected();
    fakeRedis.set = failing();

    await expect(service.createSession("u-1")).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    expect(service.getRedisLastError()).toMatch(/redis is on fire/);
  });

  // The token the failed write would have used resolves to nobody even after
  // closeSessionStore switches the service to its in-memory map, so nothing was
  // written there either.
  test("a failed write leaves no session in memory", async () => {
    const { service } = await connected();
    fakeRedis.set = failing();
    await expect(service.createSession("u-1")).rejects.toThrow();
    const token = fakeRedis.set.mock.calls[0][0].slice("session:sid:".length);

    await service.closeSessionStore();

    expect(await service.getSessionUser(req(token))).toBeNull();
  });

  test("a failed write is reported to an operator", async () => {
    const { service } = await connected();
    fakeRedis.set = failing();

    await expect(service.createSession("u-1")).rejects.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_session_create_failed" }),
      expect.any(String)
    );
  });

  test("the error carries status 503 and the Redis failure as its cause", async () => {
    const { service } = await connected();
    fakeRedis.set = failing();

    const err = await service.createSession("u-1").catch((caught) => caught);

    expect(err.status).toBe(503);
    expect(err.cause.message).toBe("redis is on fire");
  });

  test("a failed read rejects rather than resolving to nobody", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = failing();

    await expect(service.getSessionUser(req(token))).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );
    expect(service.getRedisLastError()).toMatch(/redis is on fire/);
  });

  // A delete after a failed read would wait out its own timeout during the
  // same outage, and could not remove anything the failed read could not see.
  test("a failed read issues no cleanup delete", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = failing();

    await expect(service.getSessionUser(req(token))).rejects.toThrow();

    expect(fakeRedis.del).not.toHaveBeenCalled();
  });

  test("a failed read of junk still refuses rather than returning nobody", async () => {
    const { service } = await connected();
    fakeRedis.store.set("session:sid:junk", "{not json");
    fakeRedis.del = failing();

    await expect(service.getSessionUser(req("junk"))).rejects.toBeInstanceOf(
      SessionStoreUnavailableError
    );
  });

  test("a failed delete rejects, so sign-out can report it", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.del = failing();

    await expect(service.deleteSession(token)).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "redis_session_delete_failed" }),
      expect.any(String)
    );
  });

  // node-redis rejects with Error objects, but the recorded text must not
  // depend on that.
  test("records a rejection that is not an Error as its text", async () => {
    const { service } = await connected();
    fakeRedis.get = vi.fn(async () => {
      throw "socket gone";
    });

    await expect(service.getSessionUser(req("any"))).rejects.toThrow();

    expect(service.getRedisLastError()).toBe("socket gone");
  });

  test("requireAuth answers 503, not 401, when the read fails", async () => {
    const { service } = await connected();
    const token = await service.createSession("u-1");
    fakeRedis.get = failing();
    const res = buildRes();
    const next = vi.fn();

    await service.requireAuth({ ...req(token), log: { error: vi.fn() } }, res, next);

    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/on fire/);
    expect(next).not.toHaveBeenCalled();
  });

  // A success after a failure clears the recorded error, so the status does
  // not keep reporting a problem that has passed, and the next sign-in is
  // stored in Redis as normal.
  test("a later success clears the recorded error and stores the session", async () => {
    const { service } = await connected();
    const working = fakeRedis.set;
    fakeRedis.set = failing();
    await expect(service.createSession("u-1")).rejects.toThrow();
    expect(service.getRedisLastError()).toBeTruthy();

    fakeRedis.set = working;
    const token = await service.createSession("u-2");

    expect(service.getRedisLastError()).toBe("");
    expect(await service.getSessionUser(req(token))).toMatchObject({ id: "u-2" });
  });
});
```

The block it replaces held eleven tests. Eight of them pinned the behaviour this task removes, not three: the three named in the research (a failed write returns a token; a blip's session cannot be read back; sign-out leaves the blip's entry in memory), plus "a failed read resolves to nobody", "a failed read still tries to clear the key", "survives the cleanup failing too", "a failed delete is recorded rather than thrown" and "a later success clears the recorded error". All eight are replaced above, and "a failed write is reported to an operator" is kept with its call made to reject.

- [ ] **Step 3: Watch them fail**

```bash
npm -w server exec vitest run src/services/auth/__tests__/sessionService.redis.test.js > "$SCRATCH/s1-red.txt" 2>&1; echo "exit=$?"; grep -E "✓|×|Tests " "$SCRATCH/s1-red.txt" | head -50
```

Expected: `exit=1`, `13 failed | 21 passed`. The two `gives every command a 1.5 s timeout` rows fail with `expected undefined to deeply equal { timeout: 1500 }`. The write tests fail with `promise resolved "'<48 hex>'" instead of rejecting`, because `createSession` falls back to memory and returns a token. The read tests fail with `promise resolved "null" instead of rejecting`, the delete test with `promise resolved "undefined"`, and `requireAuth answers 503` with `expected 401 to be 503`. The error-shape test fails with `expected undefined to be 503`: there is no error to read. The two `reconnecting` tests pass on `main` by design. They pin the recovery path, which this task must not change, and they cover the two statements of `redisReconnectStrategy` the suite never reached (lines 119 and 121).

- [ ] **Step 4: The service**

In `server/src/services/auth/sessionService.js`, replace lines 1-9 (header and imports) with:

```js
/**
 * Sessions and CSRF: the session store (Redis if configured and connected at
 * startup, else memory, chosen once; while Redis is the store, a failed command
 * is a 503, never a fallback to memory), the session and CSRF cookies, and the
 * middleware requiring a signed-in user or a matching CSRF token. Built in index.js.
 */
import crypto from "crypto";
import { createClient } from "redis";
import { sendErrorResponse } from "../http/errorResponseService.js";

// How long a Redis command may wait to reach the socket, in ms. node-redis
// queues commands while it reconnects and its own limit is 5 s, so without this
// a sign-in during an outage waits that long for its 503. 1.5 s still rides out
// the immediate reconnect that follows a dropped connection.
const REDIS_COMMAND_TIMEOUT_MS = 1500;

/**
 * Thrown by a session operation when Redis is the store and a command on it
 * failed. It carries status 503, and the Redis error as its `cause`.
 */
export class SessionStoreUnavailableError extends Error {
  constructor(cause) {
    super("Session store unavailable.", { cause });
    this.name = "SessionStoreUnavailableError";
    this.status = 503;
  }
}

/**
 * The status a route answers for an error from a session operation: 503 when
 * the session store was unavailable, because the server could not check the
 * session, where a 401 would say there is none; 500 for anything else.
 */
export const sessionErrorStatus = (err) =>
  err instanceof SessionStoreUnavailableError ? 503 : 500;
```

Replace the reconnect comment's last line, line 114, `  // so a Redis blip during normal operation still recovers on its own.`, with:

```js
// so a Redis blip during normal operation still recovers on its own. When a
// ready connection drops, node-redis reconnects at once and then passes
// retries 1, 2, 3... here for each failed attempt, so the waits run 1 s, 2 s,
// 4 s and on up to 30 s.
```

After `pruneExpiredInMemorySessions`, which ends at line 154, add:

```js
// Runs one command while Redis is the session store. A failure is logged and
// kept as the store's last error, then thrown as SessionStoreUnavailableError:
// reads consult only Redis, so a fallback would hide the failure, not fix it.
const runSessionCommand = async (event, message, command) => {
  try {
    const result = await command();
    redisLastError = "";
    return result;
  } catch (err) {
    redisLastError = cleanText(err?.message || String(err), 260);
    logger.error({ event, error: redisLastError }, message);
    throw new SessionStoreUnavailableError(err);
  }
};

// A stored value that is not JSON, or names no user, is not a session.
const parseStoredSession = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return parsed && cleanText(parsed.userId, 120) ? parsed : null;
  } catch {
    return null;
  }
};
```

In `initSessionStore`, keep the RESP2 comment (lines 184-186) and replace lines 187-199 (the two `createClient` calls) with:

```js
const clientOptions = {
  RESP: 2,
  commandOptions: { timeout: REDIS_COMMAND_TIMEOUT_MS }
};
client = hasSocketConfig
  ? createClient({
      ...clientOptions,
      username: redisUsername,
      password: redisPassword || undefined,
      socket: {
        ...socketOptions,
        host: redisHost,
        port: redisPort,
        tls: redisTls
      }
    })
  : createClient({ ...clientOptions, url: redisUrl, socket: socketOptions });
```

Replace lines 266-336 (`createSession`, `getSessionByToken` and `deleteSession`) with:

```js
const createSession = async (userId) => {
  const token = crypto.randomBytes(24).toString("hex");
  const session = { userId, createdAt: Date.now() };
  if (redisSessionsEnabled && redisClient) {
    await runSessionCommand("redis_session_create_failed", "Redis create session failed.", () =>
      redisClient.set(sessionRedisKey(token), JSON.stringify(session), {
        EX: Math.floor(sessionTtlMs / 1000)
      })
    );
    return token;
  }
  pruneExpiredInMemorySessions();
  inMemorySessions.set(token, session);
  return token;
};

const getSessionByToken = async (token) => {
  if (!token) return null;
  if (redisSessionsEnabled && redisClient) {
    const key = sessionRedisKey(token);
    const raw = await runSessionCommand(
      "redis_session_get_failed",
      "Redis get session failed.",
      () => redisClient.get(key)
    );
    if (!raw) return null;
    const session = parseStoredSession(raw);
    // Junk under a session key is removed, so it is not parsed again on every
    // request.
    if (!session) {
      await runSessionCommand("redis_session_delete_failed", "Redis delete session failed.", () =>
        redisClient.del(key)
      );
    }
    return session;
  }
  pruneExpiredInMemorySessions();
  return inMemorySessions.get(token) || null;
};

const deleteSession = async (token) => {
  if (!token) return;
  if (redisSessionsEnabled && redisClient) {
    await runSessionCommand("redis_session_delete_failed", "Redis delete session failed.", () =>
      redisClient.del(sessionRedisKey(token))
    );
    return;
  }
  inMemorySessions.delete(token);
};
```

The three log events and their messages are the ones `main` already writes, so anything searching the logs for them keeps working. An unparseable stored value no longer logs `redis_session_get_failed`: it is junk, not a Redis failure.

In `requireAuth`, replace line 381, `      sendErrorResponse(req, res, err, 500);`, with:

```js
sendErrorResponse(req, res, err, sessionErrorStatus(err));
```

- [ ] **Step 5: Watch the service tests pass**

```bash
npm -w server exec vitest run src/services/auth/__tests__/ > "$SCRATCH/s1-svc-green.txt" 2>&1; echo "exit=$?"; grep -E "Test Files|Tests " "$SCRATCH/s1-svc-green.txt"
```

Expected: `exit=0`, 4 files and 167 tests passed. `sessionService.test.js`'s startup-fallback tests still pass: the fallback to memory when Redis cannot connect at boot is unchanged.

- [ ] **Step 6: The readiness tests**

In `server/src/routes/__tests__/systemRoutes.test.js`, add this block before `describe("the probes stay open", ...)` at line 99:

```js
describe("GET /api/ready reports which store sessions are using", () => {
  const readyWith = (overrides) =>
    request(buildApp({ redisConfigured: () => true, ...overrides })).get("/api/ready");

  test("redis while its client can serve commands", async () => {
    const response = await readyWith({
      redisSessionsEnabled: () => true,
      redisClient: () => ({ isReady: true })
    });

    expect(response.status).toBe(200);
    expect(response.body.dependencies.redis).toEqual({
      configured: true,
      connected: true,
      mode: "redis"
    });
  });

  // Sessions answer 503 while the client reconnects. They do not fall back to
  // memory, so the mode must not say they do.
  test("unavailable while Redis is the store but its client is reconnecting", async () => {
    const response = await readyWith({
      redisSessionsEnabled: () => true,
      redisClient: () => ({ isReady: false })
    });

    expect(response.status).toBe(503);
    expect(response.body.dependencies.redis).toEqual({
      configured: true,
      connected: false,
      mode: "unavailable"
    });
  });

  test("in_memory_fallback when Redis failed to connect at startup", async () => {
    const response = await readyWith({
      redisSessionsEnabled: () => false,
      redisClient: () => null
    });

    expect(response.status).toBe(503);
    expect(response.body.dependencies.redis.mode).toBe("in_memory_fallback");
  });

  // Recovery is node-redis's own reconnect loop. Readiness reads the client's
  // state on every request, so it follows a reconnect without a restart.
  test("reports redis again on the next request once the client is ready", async () => {
    const client = { isReady: false };
    const app = buildApp({
      redisConfigured: () => true,
      redisSessionsEnabled: () => true,
      redisClient: () => client
    });
    const during = await request(app).get("/api/ready");

    client.isReady = true;
    const after = await request(app).get("/api/ready");

    expect(during.body.dependencies.redis.mode).toBe("unavailable");
    expect(after.status).toBe(200);
    expect(after.body.dependencies.redis.mode).toBe("redis");
  });
});
```

Run:

```bash
npm -w server exec vitest run src/routes/__tests__/systemRoutes.test.js > "$SCRATCH/s1-ready-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/s1-ready-red.txt"
```

Expected: `exit=1`, `2 failed | 11 passed`. Both failures read `in_memory_fallback` where `unavailable` is expected. The other two new tests pin what already holds.

- [ ] **Step 7: The readiness mode**

In `server/src/routes/systemRoutes.js`, after line 64 (`const redisConnected = ...`), add:

```js
// "unavailable" while Redis is the store but cannot serve commands: sessions
// then answer 503 rather than fall back. Memory holds them only when Redis
// was never configured or did not connect at startup.
const redisMode = redisConnected
  ? "redis"
  : redisSessionsEnabled()
    ? "unavailable"
    : "in_memory_fallback";
```

and replace line 99, `          mode: redisConnected ? "redis" : "in_memory_fallback"`, with:

```js
mode: redisMode;
```

Re-run Step 6's command. Expected: `exit=0`, 13 passed.

- [ ] **Step 8: The route tests**

In `server/src/routes/__tests__/authRoutes.test.js`, make eight edits.

(a) Replace line 7, `import { parseCookies } from "../../services/auth/sessionService.js";`, with:

```js
import {
  createSessionService,
  parseCookies,
  SessionStoreUnavailableError
} from "../../services/auth/sessionService.js";
```

(b) After `buildApp`, which ends at line 61, add:

```js
// What sessionService throws when Redis is the store and a command fails.
const storeDown = () => new SessionStoreUnavailableError(new Error("redis is on fire"));

// The real cookie writers, for the tests that read what reached the response's
// Set-Cookie header rather than what the recording stubs saw.
const realCookieWriters = () => {
  const { setSessionCookie, setCsrfCookie, clearSessionCookie, clearCsrfCookie } =
    createSessionService({
      cleanText,
      logger: { info() {}, warn() {}, error() {} },
      toShortText: (value) => String(value ?? ""),
      findUserById: async () => null,
      sessionTtlMs: 60000,
      cookieSecure: "",
      csrfCookieName: "csrfToken",
      csrfHeaderName: "x-csrf-token",
      csrfUnsafeMethods: new Set(["POST"]),
      redisSessionKeyPrefix: "session:sid:"
    });
  return { setSessionCookie, setCsrfCookie, clearSessionCookie, clearCsrfCookie };
};
```

(c) In the signup describe, after `answers 500 without detail when the store fails` (ends at line 298), add:

```js
// The account is written before the session, so it exists and can sign in
// once the store is back; what must not happen is a cookie for a session
// that was never stored.
test("answers 503 with no cookie when the session store is unavailable", async () => {
  const app = buildApp({
    ...realCookieWriters(),
    createSession: async () => {
      throw storeDown();
    }
  });

  const response = await request(app).post("/api/auth/signup").send(signupBody());

  expect(response.status).toBe(503);
  expect(response.headers["set-cookie"]).toBeUndefined();
  expect(JSON.stringify(response.body)).not.toMatch(/on fire/);
});
```

(d) In the login describe, after `answers 500 without detail when the lookup fails` (ends at line 585), add:

```js
test("answers 503 with no cookie when the session store is unavailable", async () => {
  const app = buildApp(realCookieWriters());
  await registered(app);
  deps.createSession.mockRejectedValueOnce(storeDown());

  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "person@example.com", password: "StrongPass123!" });

  expect(response.status).toBe(503);
  expect(response.headers["set-cookie"]).toBeUndefined();
});
```

(e) In the password describe, before `does not leak whether the failure was the password or the session` (line 802), add:

```js
test("answers 503 when the replacement session cannot be stored", async () => {
  const app = passwordApp();
  const cookie = await signUpAndGetCookie(app);
  deps.createSession.mockRejectedValueOnce(storeDown());

  const response = await request(app)
    .post("/api/auth/password")
    .set("Cookie", cookie)
    .send({ currentPassword: signupBody().password, newPassword: "BrandNewPass456!" });

  expect(response.status).toBe(503);
});
```

(f) In the `DELETE /api/auth/me` describe, after `requires a signed-in user` (lines 925-928), add:

```js
test("answers 503 when the session store cannot drop the session", async () => {
  const app = deleteApp({ deleteUser: async () => true });
  const cookie = await signUpAndGetCookie(app);
  deps.deleteSession.mockRejectedValueOnce(storeDown());

  const response = await request(app)
    .delete("/api/auth/me")
    .set("Cookie", cookie)
    .send({ password: signupBody().password });

  expect(response.status).toBe(503);
});
```

(g) Replace `answers 500 without detail when the session store fails` (lines 1042-1053) with:

```js
test("answers 500 without detail when the lookup fails", async () => {
  const app = buildApp({
    getSessionUser: async () => {
      throw new Error("connection terminated unexpectedly");
    }
  });

  const response = await request(app).get("/api/auth/me");

  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toMatch(/connection terminated/);
});

// The session may well exist: the store could not be asked. A 401 would say
// there is none.
test("answers 503 without detail when the session store is unavailable", async () => {
  const app = buildApp({
    getSessionUser: async () => {
      throw storeDown();
    }
  });

  const response = await request(app).get("/api/auth/me");

  expect(response.status).toBe(503);
  expect(JSON.stringify(response.body)).not.toMatch(/on fire/);
});
```

(h) Replace `still clears cookies when the session store fails` (lines 1223-1234). On `main` that test's name is untrue: the route throws before it clears anything, and the test asserts only the 500. Replace it with:

```js
test("still clears cookies when the delete fails", async () => {
  const app = buildApp({
    deleteSession: async () => {
      throw new Error("connection terminated unexpectedly");
    }
  });

  const response = await request(app).post("/api/auth/logout").set("Cookie", "sid=sess-1");

  expect(response.status).toBe(500);
  expect(JSON.stringify(response.body)).not.toMatch(/connection terminated/);
  expect(cookieCalls.clearedSession).toBe(1);
  expect(cookieCalls.clearedCsrf).toBe(1);
});

// This browser is signed out either way. The 503 says the session itself
// could not be ended, so it stays valid in the store until it expires.
test("answers 503, and still clears both cookies, when the store is unavailable", async () => {
  const app = buildApp({
    ...realCookieWriters(),
    deleteSession: async () => {
      throw storeDown();
    }
  });

  const response = await request(app).post("/api/auth/logout").set("Cookie", "sid=sess-1");

  expect(response.status).toBe(503);
  const cookies = response.headers["set-cookie"].join("\n");
  expect(cookies).toMatch(/^sid=;/m);
  expect(cookies).toMatch(/^csrfToken=;/m);
});
```

Run:

```bash
npm -w server exec vitest run src/routes/__tests__/authRoutes.test.js > "$SCRATCH/s1-auth-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |AssertionError" "$SCRATCH/s1-auth-red.txt"
```

Expected: `exit=1`, `7 failed | 75 passed`. Six fail with `expected 500 to be 503`, because every catch answers a fixed 500. `still clears cookies when the delete fails` fails with `expected +0 to be 1`: the route clears the cookies only after the delete succeeds.

- [ ] **Step 9: The routes**

In `server/src/routes/authRoutes.js`:

(a) After line 7, `import { sendErrorResponse } from "../services/http/errorResponseService.js";`, add:

```js
import { sessionErrorStatus } from "../services/auth/sessionService.js";
```

(b) Replace lines 13-14 of the summary, ` * reports at present. Signup and login both start a session that defaults to` / ` * "remember me".`, with:

```js
 * reports at present. Signup and login both start a session that defaults to
 * "remember me". A route that reads or writes a session answers 503 when the
 * session store is unavailable (see sessionErrorStatus), and 500 otherwise.
```

(c) In each of these six catch blocks, replace `sendErrorResponse(req, res, err, 500);` with `sendErrorResponse(req, res, err, sessionErrorStatus(err));`: `GET /api/auth/me` (line 66), signup (140), login (195), password (251), `DELETE /api/auth/me` (277) and logout (290). Leave `POST /api/profile` (line 91) at 500: nothing in its `try` touches the session store.

(d) Replace the signup comment at line 116, `      // Write the account, then sign it in: a session cookie and a new CSRF token.`, with:

```js
// Write the account, then sign it in: a session cookie and a new CSRF token.
// A session store that is down fails createSession before either cookie
// is set, so the answer is a 503 with no cookie, and the account it
// leaves behind signs in once the store is back.
```

(e) Replace the login comment at line 183, `      // Sign in: a session cookie and a new CSRF token.`, with:

```js
// Sign in: a session cookie and a new CSRF token, both set only once
// createSession has stored the session.
```

(f) Replace the logout handler, lines 281-292, with:

```js
app.post("/api/auth/logout", async (req, res) => {
  try {
    const cookies = parseCookies(req.headers.cookie || "");
    const token = cookies.sid;
    // The cookies are cleared first, so this browser is signed out even when
    // the delete fails. That failure still answers 503: the session itself
    // stays valid in the store until it expires.
    clearSessionCookie(res);
    clearCsrfCookie(res);
    if (token) await deleteSession(token);
    res.json({ ok: true });
  } catch (err) {
    sendErrorResponse(req, res, err, sessionErrorStatus(err));
  }
});
```

Run:

```bash
npm -w server exec vitest run src/routes/__tests__/authRoutes.test.js src/routes/__tests__/systemRoutes.test.js src/services/auth/__tests__/ > "$SCRATCH/s1-green.txt" 2>&1; echo "exit=$?"; grep -E "Test Files|Tests " "$SCRATCH/s1-green.txt"
```

Expected: `exit=0`, 6 files passed.

- [ ] **Step 10: Comments made true**

Check each against the code before committing:

- `sessionService.js` header: now says a failed command is a 503, never a fallback. It is still four lines of text.
- The `createSessionService` summary ("falls back to memory when it is not or cannot connect") stays true: the startup fallback is unchanged.
- The reconnect comment now gives the waits after a drop; the `reconnecting` tests pin them.
- `authRoutes.js`: the summary, the signup and login comments, and the logout comment, as written in Step 9.
- `systemRoutes.js`: the new `redisMode` comment.
- `sessionService.redis.test.js`: the header no longer claims the fallback is "the behaviour worth having", and no comment in the file describes a memory fallback after a failed command. Check with `git grep -n "fallback" -- server/src/services/auth/__tests__/sessionService.redis.test.js`: the remaining hits must describe the startup fallback or `closeSessionStore`.
- These stay true and need no edit, because they describe Redis unreachable at boot or unset, which this task leaves alone: `README.md:411-414`, `docs/deploy-runbook.md:305-309`, `render.yaml:29-34` and `env.example:52`. The two one-line summaries that say sessions have an "in-memory fallback", `README.md:10` and CLAUDE.md line 110, are records, which the spec edits once at the end (rule 6): they are listed under "Not in this phase" for Phase 6.

- [ ] **Step 11: Commit**

```bash
git add server/src/services/auth/sessionService.js server/src/routes/authRoutes.js server/src/routes/systemRoutes.js server/src/services/auth/__tests__/sessionService.redis.test.js server/src/routes/__tests__/authRoutes.test.js server/src/routes/__tests__/systemRoutes.test.js
git commit -F - <<'EOF'
fix(sessions): fail closed when Redis is down

While Redis is the session store, a failed command throws
SessionStoreUnavailableError and the routes answer 503. Sign-in and
sign-up set no cookie, a signed-in request is a 503 rather than a 401,
and a failed sign-out delete is a 503 that still clears this browser's
cookies. Nothing falls back to memory, and a failed read no longer
issues a cleanup delete. Every command gets a 1.5 s timeout, so an
outage fails in 1.5 s rather than node-redis's 5 s default.

/api/ready reports mode "unavailable" during an outage instead of
"in_memory_fallback". The fallback to memory when Redis cannot connect
at startup is unchanged.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 12: Mutation check**

Write `$SCRATCH/s1-mutants.json` with the Write tool:

```json
[
  {
    "name": "fallback restored: a failed command resolves instead of throwing",
    "tests": "src/services/auth/__tests__/sessionService.redis.test.js",
    "edits": [
      {
        "file": "server/src/services/auth/sessionService.js",
        "find": "      throw new SessionStoreUnavailableError(err);",
        "text": "      return null;"
      }
    ]
  },
  {
    "name": "no command timeout",
    "tests": "src/services/auth/__tests__/sessionService.redis.test.js",
    "edits": [
      {
        "file": "server/src/services/auth/sessionService.js",
        "find": "        commandOptions: { timeout: REDIS_COMMAND_TIMEOUT_MS }\n",
        "text": ""
      }
    ]
  },
  {
    "name": "cleanup delete back in a failed read",
    "tests": "src/services/auth/__tests__/sessionService.redis.test.js",
    "edits": [
      {
        "file": "server/src/services/auth/sessionService.js",
        "find": "      throw new SessionStoreUnavailableError(err);",
        "text": "      if (event === \"redis_session_get_failed\") await redisClient.del(\"x\").catch(() => {});\n      throw new SessionStoreUnavailableError(err);"
      }
    ]
  },
  {
    "name": "requireAuth answers 500 again",
    "tests": "src/services/auth/__tests__/sessionService.redis.test.js",
    "edits": [
      {
        "file": "server/src/services/auth/sessionService.js",
        "find": "      sendErrorResponse(req, res, err, sessionErrorStatus(err));",
        "text": "      sendErrorResponse(req, res, err, 500);"
      }
    ]
  },
  {
    "name": "sessionErrorStatus always 500",
    "tests": "src/routes/__tests__/authRoutes.test.js",
    "edits": [
      {
        "file": "server/src/services/auth/sessionService.js",
        "find": "err instanceof SessionStoreUnavailableError ? 503 : 500",
        "text": "500"
      }
    ]
  },
  {
    "name": "logout clears cookies after the delete again",
    "tests": "src/routes/__tests__/authRoutes.test.js",
    "edits": [
      {
        "file": "server/src/routes/authRoutes.js",
        "find": "      clearSessionCookie(res);\n      clearCsrfCookie(res);\n      if (token) await deleteSession(token);\n",
        "text": "      if (token) await deleteSession(token);\n      clearSessionCookie(res);\n      clearCsrfCookie(res);\n"
      }
    ]
  },
  {
    "name": "signup sets a cookie before the session is stored",
    "tests": "src/routes/__tests__/authRoutes.test.js",
    "edits": [
      {
        "file": "server/src/routes/authRoutes.js",
        "find": "      await createUser(newUser);\n      const token = await createSession(newUser.id);\n      setSessionCookie(res, token, rememberMe);\n      setCsrfCookie(res, crypto.randomBytes(24).toString(\"hex\"));\n",
        "text": "      await createUser(newUser);\n      setCsrfCookie(res, crypto.randomBytes(24).toString(\"hex\"));\n      const token = await createSession(newUser.id);\n      setSessionCookie(res, token, rememberMe);\n"
      }
    ]
  },
  {
    "name": "readiness reports in_memory_fallback during an outage again",
    "tests": "src/routes/__tests__/systemRoutes.test.js",
    "edits": [
      {
        "file": "server/src/routes/systemRoutes.js",
        "find": "        ? \"unavailable\"",
        "text": "        ? \"in_memory_fallback\""
      }
    ]
  },
  {
    "name": "post-startup reconnect gives up",
    "tests": "src/services/auth/__tests__/sessionService.redis.test.js",
    "edits": [
      {
        "file": "server/src/services/auth/sessionService.js",
        "find": "    if (redisStartupSettled) return Math.min(500 * 2 ** Math.min(retries, 6), 30000);",
        "text": "    if (redisStartupSettled) return retries > 10 ? false : Math.min(500 * 2 ** Math.min(retries, 6), 30000);"
      }
    ]
  }
]
```

```bash
node "$TOOLS/run-mutants.mjs" "$SCRATCH/s1-mutants.json" > "$SCRATCH/s1-mutants.txt" 2>&1; echo "mutants exit=$?"; cat "$SCRATCH/s1-mutants.txt"; git status --short
```

Expected: `mutants exit=0`, all nine `caught`, and `git status --short` empty. This was run in a scratch copy of `74de371` on 2026-10-12, and all nine were caught.

- [ ] **Step 13: Coverage, exact**

Run the exact-coverage block from Conventions, with Postgres up. Every metric's slack must be 0 or more.

What changes, and what covers it:

| Added                                                                       | Covered by                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SessionStoreUnavailableError` constructor (function)                       | `a failed write refuses the session rather than returning a token`                                                                               |
| `sessionErrorStatus` (function; ternary, 2 branches)                        | 503 arm: `requireAuth answers 503, not 401, when the read fails`; 500 arm: `GET /api/auth/me` `answers 500 without detail when the lookup fails` |
| `runSessionCommand` (function; `err?.message \|\| String(err)`, 2 branches) | Error: `a failed write ...`; non-Error: `records a rejection that is not an Error as its text`                                                   |
| `parseStoredSession` (function; `&&` and ternary, 4 branches; catch)        | `reads a session back`, `removes a stored value that is not a usable session`, `treats an unparseable stored value the same way`                 |
| `if (!session)` in `getSessionByToken` (2 branches)                         | `reads a session back` and `removes a stored value that is not a usable session`                                                                 |
| Four command closures (functions)                                           | `writes the session under the prefixed key with a ttl`, `reads a session back`, `removes a stored value ...`, `deletes the key on sign-out`      |
| `redisMode` nested ternary (2 more branches)                                | the three mode tests in Step 6                                                                                                                   |

Removed: the three catch blocks with their `err?.message || String(err)` pairs (one arm of each was never covered), the cleanup `try`/`catch` in `getSessionByToken`, and the `!parsed || !cleanText(...)` condition. Newly covered: `redisReconnectStrategy`'s lines 119 and 121, and `authRoutes.js`'s catches at 251 and 277.

Measured in a scratch copy with the DB-free suites that reach these files, which gives a lower bound because the integration suites add to it:

| File                | Statements           | Branches             | Functions     | Lines                |
| ------------------- | -------------------- | -------------------- | ------------- | -------------------- |
| `sessionService.js` | 227/233 → 238/242    | 127/143 → 132/143    | 35/35 → 43/43 | 208/212 → 218/221    |
| `authRoutes.js`     | 117/120 → 119/120    | 51/60 → 51/60        | 9/9 → 9/9     | 108/110 → 110/110    |
| `systemRoutes.js`   | +1 covered, +1 total | +7 covered, +2 total | unchanged     | +1 covered, +1 total |

Applied to `main`'s totals, that is about 2248/2374 statements (slack +4.6), 1649/1891 branches (+5.7), 374/391 functions (+0.6) and 2020/2106 lines (+4.6). The full-suite measurement is the gate, not this estimate.

- [ ] **Step 14: Boot check against a real Redis**

This proves the fast failure, the cookies and the recovery on a running server. It signs up one account and deletes it at the end.

**(1)** Start Docker Desktop if `docker ps > /dev/null 2>&1; echo "docker exit=$?"` does not print `0`. If Docker cannot start, stop and report: do not skip this step.
**(2)** Start Redis and Postgres: `docker compose up -d redis > "$SCRATCH/redis-up.txt" 2>&1; echo "redis exit=$?"`, and Postgres as for the server suite.
**(3)** Write `$SCRATCH/s1-boot-check.mjs` with the Write tool:

```js
/**
 * Drives a running server through a Redis outage and back: sign-in and session
 * checks must answer 503 within 2.5 s with no session cookie, readiness must
 * say "unavailable", and after Redis restarts readiness must say "redis" again
 * and the session made before the outage must still work. Exits 1 on any FAIL.
 *
 * Usage: node s1-boot-check.mjs [baseUrl] [repoRoot]
 */
import { execFileSync } from "node:child_process";

const [base = "http://127.0.0.1:5055", repo = "D:/ai-workout"] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const compose = (...args) =>
  execFileSync("docker", ["compose", ...args], { cwd: repo, stdio: "pipe" });

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

// One browser's cookies, filled from Set-Cookie when a call asks to keep them.
const jar = new Map();
const keepCookies = (setCookies) => {
  for (const line of setCookies) {
    const [pair] = line.split(";");
    const at = pair.indexOf("=");
    const name = pair.slice(0, at);
    const value = pair.slice(at + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
};

const call = async (method, path, { body, keep = true, timeoutMs = 10000 } = {}) => {
  const headers = { Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") };
  if (body) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = jar.get("csrfToken") || "";
  const startedAt = Date.now();
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const json = await response.json().catch(() => ({}));
  const setCookies = response.headers.getSetCookie();
  if (keep) keepCookies(setCookies);
  return { status: response.status, json, setCookies, elapsedMs: Date.now() - startedAt };
};

const waitFor = async (label, predicate, limitMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < limitMs) {
    try {
      if (await predicate()) return Date.now() - startedAt;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`${label}: not within ${limitMs} ms`);
};

const email = `s1-boot-${Date.now()}@example.test`;
const password = "StrongPass123!";
const profile = {
  firstName: "Boot",
  lastName: "Check",
  age: 30,
  heightCm: 175,
  weightKg: 70,
  sex: "Female",
  activity: "Moderate"
};

// ---- Redis up -----------------------------------------------------------------
await waitFor(
  "server health",
  async () => (await call("GET", "/api/health")).status === 200,
  60000
);
const before = await call("GET", "/api/ready");
check(
  "ready before the outage",
  before.json?.dependencies?.redis?.mode === "redis",
  JSON.stringify(before.json?.dependencies?.redis)
);
await call("GET", "/api/csrf-token");
const signup = await call("POST", "/api/auth/signup", { body: { email, password, profile } });
check("sign-up while Redis is up", signup.status === 200, `status ${signup.status}`);
const sessionBeforeOutage = jar.get("sid");

// ---- Redis down ---------------------------------------------------------------
compose("stop", "redis");
await sleep(1000);
const during = await call("GET", "/api/ready");
check(
  "readiness reports the outage",
  during.status === 503 && during.json?.dependencies?.redis?.mode === "unavailable",
  `status ${during.status}, mode ${during.json?.dependencies?.redis?.mode}`
);
const me = await call("GET", "/api/auth/me");
check(
  "a signed-in check answers 503, fast",
  me.status === 503 && me.elapsedMs < 2500,
  `status ${me.status}, ${me.elapsedMs} ms`
);
const login = await call("POST", "/api/auth/login", { body: { email, password }, keep: false });
check(
  "sign-in answers 503, fast, with no Set-Cookie",
  login.status === 503 && login.elapsedMs < 2500 && login.setCookies.length === 0,
  `status ${login.status}, ${login.elapsedMs} ms, ${login.setCookies.length} cookies`
);
const logout = await call("POST", "/api/auth/logout", { keep: false });
check(
  "sign-out answers 503 and still clears both cookies",
  logout.status === 503 &&
    logout.setCookies.some((line) => line.startsWith("sid=;")) &&
    logout.setCookies.some((line) => line.startsWith("csrfToken=;")),
  `status ${logout.status}`
);

// ---- Redis back ---------------------------------------------------------------
compose("start", "redis");
const recoveredInMs = await waitFor(
  "readiness back to redis",
  async () => {
    const ready = await call("GET", "/api/ready");
    return ready.status === 200 && ready.json?.dependencies?.redis?.mode === "redis";
  },
  40000
);
check(
  "readiness reports redis again",
  true,
  `${(recoveredInMs / 1000).toFixed(1)} s after the restart`
);
jar.set("sid", sessionBeforeOutage);
const meAfter = await call("GET", "/api/auth/me");
check(
  "the session made before the outage still works",
  meAfter.status === 200,
  `status ${meAfter.status}`
);
const loginAfter = await call("POST", "/api/auth/login", { body: { email, password } });
check(
  "sign-in works again and sets a session cookie",
  loginAfter.status === 200 && loginAfter.setCookies.some((line) => line.startsWith("sid=")),
  `status ${loginAfter.status}`
);

// ---- Observation only: a Redis that hangs rather than closes ---------------------
compose("pause", "redis");
const hung = await call("GET", "/api/auth/me", { timeoutMs: 6000 }).catch((err) => ({
  status: err.name
}));
console.log(
  `INFO  a session check while Redis is paused: ${hung.status} (${hung.elapsedMs ?? 6000} ms or more)`
);
compose("unpause", "redis");
await waitFor(
  "Redis answering after unpause",
  async () => (await call("GET", "/api/auth/me")).status === 200,
  15000
);

// ---- Clean up -------------------------------------------------------------------
const removed = await call("DELETE", "/api/auth/me", { body: { password } });
check("the test account is deleted", removed.status === 200, `status ${removed.status}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
```

It was checked with `node --check` but not run, because Docker was not running when this plan was written.

**(4)** Start the server on its own port, in the background (the Bash tool's `run_in_background`). The empty `REDIS_HOST` and `REDIS_PORT` matter: `initSessionStore` prefers a host and port over a URL, and dotenv leaves a key alone when it is present but empty, so this forces the local Redis whatever `server/.env` says. `SENTRY_DSN=` keeps the check out of any real Sentry project.

```bash
REDIS_URL=redis://127.0.0.1:6379 REDIS_HOST= REDIS_PORT= SENTRY_DSN= PORT=5055 npm run start -w server > "$SCRATCH/s1-server.log" 2>&1
```

**(5)** Before running the check, confirm the database is local: `grep postgres_connected "$SCRATCH/s1-server.log"` must show a `databaseUrl` on `127.0.0.1` or `localhost` (the line redacts the credentials). If it does not, stop the server and report: the check writes an account. Also confirm `grep -c redis_connected "$SCRATCH/s1-server.log"` prints `1`.
**(6)** Run the check:

```bash
node "$SCRATCH/s1-boot-check.mjs" http://127.0.0.1:5055 D:/ai-workout > "$SCRATCH/s1-boot.txt" 2>&1; echo "boot check exit=$?"; cat "$SCRATCH/s1-boot.txt"
grep -E "redis_session_(get|create|delete)_failed" "$SCRATCH/s1-server.log" | head -5
```

Expected: `boot check exit=0`, every line `PASS`, and the sign-in and session-check timings between about 1.5 s and 2.5 s. Record the recovery time it prints: with the backoff above it should be a few seconds for this short outage, and the check allows up to 40 s. Record the `INFO` line too; it is expected to show the request still pending after 6 s (`TimeoutError`), which is the paused-Redis gap recorded under "Not in this phase". The grep must show the three failure events.
**(7)** Stop the server. Stopping the background shell can leave `node src/index.js` running, so find it by port and stop it in PowerShell: `Get-NetTCPConnection -LocalPort 5055 -State Listen | Select-Object OwningProcess`, then `Stop-Process -Id <that id>`. Leave Redis running for the E2E gate.

- [ ] **Step 15: Gates, push, PR**

Run the gates and the extra checks from Conventions. Then:

```bash
git push -u origin fix/sessions-fail-closed
gh pr create --base main --title "fix(sessions): fail closed when Redis is down" --body-file "$SCRATCH/pr-s1.md"
gh pr checks --watch
```

`pr-s1.md` covers:

- the bug as it stands on `main`, with the 5008 ms measurement and the 200-then-401 sequence;
- the decision for `commandOptions.timeout` over `disableOfflineQueue` and `socketTimeout`, with the `node_modules` lines cited above and the probe table;
- default #1, with the finding that the client has no 401-specific branch today;
- the readiness mode change, and that `in_memory_fallback` keeps its meaning for the startup case;
- the eight rewritten tests and why each changed;
- the account a failed sign-up leaves behind, which signs in once the store is back;
- the boot check output, including the recovery time and the `INFO` line;
- the gate results and the four `floor-check` lines;
- the trailer `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

- [ ] **Step 16: Review, then merge.** Run the spec review, then the quality review. Then merge as Conventions says.

---

### Task S2: Route-caught 5xx reach Sentry

Only errors that reach the error middleware are reported (`middleware/errorHandler.js:20-31`). A route that catches its own error answers through `sendErrorResponse`, which only logs `route_error`; its header says "Nothing here reports to error tracking". So a database outage caught in a route, and after S1 a session store outage in `requireAuth`, never reaches Sentry.

**The call sites, counted on `main`.** `git grep -n "sendErrorResponse(" -- server/src ':!**/__tests__/**'` prints 28 lines. One is the summary comment at `errorResponseService.js:25`, so there are 27 calls: `authRoutes.js` 7, `registerDashboardReadRoutes.js` 4, `registerWorkoutAndGoalRoutes.js` 3, `registerMealAndMetricRoutes.js` 2, `registerSavedExerciseRoutes.js` 2, `generateRoutes.js` 1, `sessionService.js` (`requireAuth`) 1, and the external routes 7 (`registerWgerRoutes.js` 3, `registerWeatherRoutes.js` 2, `registerAirQualityRoutes.js` 1, `registerMealDbRoutes.js` 1). The research's 28 counted the comment. The external routes pass the upstream status and answer a 500, 502, 503 or 504 with a 200 fallback first (`platformHealthService.js:11-12`), so they reach `sendErrorResponse` with a 5xx only for some other 5xx status.

**Decisions.**

- **Injection.** A module-level setter in `errorResponseService.js`, called once by `index.js` with the same forwarder it gives the error middleware. Every call site keeps importing `sendErrorResponse` directly, so no route changes. A factory passed through `deps` would touch every route registrar, and routing each site through `next(err)` would change 27 call sites, their log event and their payloads.
- **No double capture.** `sendErrorResponse` answers the request itself and never calls `next(err)`, and the error middleware never calls `sendErrorResponse`, so an error goes to exactly one of them. A test mounts both and asserts one report. Sentry would also drop a second capture of the same Error object (`node_modules/@sentry/core/build/cjs/client.js:153`, `checkOrSetAlreadyCaught` in `utils/misc.js:113-126`).
- **Direct 5xx answers with no Error object stay unreported.** They are `generateRoutes.js:214` (500, no Gemini key), `:301-304` (504, the deadline), `:316-318` (502, an empty plan) and `:326-329` (502, an oversized plan); `registerAirQualityRoutes.js:51` (502, a station with no id); and the not-ready 503 in `/api/ready` (`systemRoutes.js:110` on `main`, 118 after S1). Each answers a condition the route has already recognised, with a fixed message, so there is no exception to diagnose and no stack to group by: an Error made at the line would only point at the line the log already names. The no-key 500 is configuration that repeats on every request, the timeout and the oversized plan already log their own warnings, and the readiness 503 is deliberate. Reporting them would also mean either a second reporting path or sending them through `sendErrorResponse`, which would mask "Missing GEMINI_API_KEY." as "Server error.".
- **The two missing request ids** from Phase 2 are added: the no-key 500 in `generateRoutes.js` and the 502 in `registerAirQualityRoutes.js` get `requestId: req.requestId || ""`, as #192 did for its two 502s.
- **Dedupe is kept.** `@sentry/node` 11.2 and later enable `dedupeIntegration` by default (`node_modules/@sentry/node/build/cjs/sdk/index.js:35`). It drops an event that matches the one immediately before it by exception type, message, fingerprint and stack (`node_modules/@sentry/core/build/cjs/integrations/dedupe.js`). During a Redis outage, a run of identical `requireAuth` 503s therefore sends one event until a different error is captured between them, while 503s from different routes, which have different stacks, are each sent. **Decision point for the owner:** keep the default, which this plan does; or remove it in `errorTrackingService.js` with `integrations: (defaults) => defaults.filter((integration) => integration.name !== "Dedupe")`; or sample. Name it in the PR body.

**Files:**

- Modify: `server/src/services/http/errorResponseService.js` (the whole file, 45 lines)
- Modify: `server/src/index.js` (an import after line 37; the error handler block, 732-740)
- Modify: `server/src/routes/generateRoutes.js` (214)
- Modify: `server/src/routes/external/registerAirQualityRoutes.js` (51)
- Modify: `server/src/services/platform/errorTrackingService.js` (header, 1-5)
- Create: `server/src/services/http/__tests__/errorResponseService.test.js`
- Create: `server/src/__tests__/index.errorTracking.test.js`
- Test: `server/src/routes/__tests__/generateRoutes.equipment.test.js` (`buildApp`, 25-44; after 227)
- Test: `server/src/routes/external/__tests__/airQualityRoutes.test.js` (`buildApp`, 47-61; after 185)

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/report-route-caught-5xx origin/main
```

- [ ] **Step 2: The `sendErrorResponse` tests**

Create `server/src/services/http/__tests__/errorResponseService.test.js`:

```js
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { sendErrorResponse, setErrorResponseTracker } from "../errorResponseService.js";
import { createErrorHandler } from "../../../middleware/errorHandler.js";

// The error response route handlers send when they catch their own error: the
// masked payload, the log line, and the report to error tracking for a 5xx.
// The tracker is a stub that records what it is given; the logger is a stub
// on the request, as requestContext.js attaches the real one.

let capture;

const buildReq = (overrides = {}) => ({
  requestId: "req-1",
  method: "POST",
  originalUrl: "/api/thing",
  log: { error: vi.fn() },
  ...overrides
});

const buildRes = () => {
  const res = {
    statusCode: null,
    body: null,
    status: vi.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload) => {
      res.body = payload;
      return res;
    })
  };
  return res;
};

beforeEach(() => {
  capture = vi.fn();
  setErrorResponseTracker(capture);
});

afterEach(() => {
  setErrorResponseTracker(() => {});
});

describe("reporting to error tracking", () => {
  test("reports a 5xx with the request it came from", () => {
    const err = new Error("connection terminated unexpectedly");

    sendErrorResponse(buildReq(), buildRes(), err, 500);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(err, {
      requestId: "req-1",
      method: "POST",
      path: "/api/thing",
      status: 500
    });
  });

  test("reports a 503 too", () => {
    sendErrorResponse(buildReq(), buildRes(), new Error("store down"), 503);

    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ status: 503 })
    );
  });

  // A 4xx is the caller's mistake, not the server's, and would only be noise.
  test("does not report a 4xx", () => {
    sendErrorResponse(buildReq(), buildRes(), new Error("Not found."), 404);

    expect(capture).not.toHaveBeenCalled();
  });

  test("reports a status that is not an integer as the 500 it answers", () => {
    const res = buildRes();

    sendErrorResponse(buildReq(), res, new Error("boom"), "teapot");

    expect(res.statusCode).toBe(500);
    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ status: 500 })
    );
  });

  test("still answers when the tracker throws", () => {
    setErrorResponseTracker(() => {
      throw new Error("sentry is down too");
    });
    const res = buildRes();

    sendErrorResponse(buildReq(), res, new Error("boom"), 500);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Server error.", requestId: "req-1" });
  });

  // Before index.js sets a tracker, as in every suite that never imports it,
  // a 5xx is answered and nothing is reported.
  test("answers a 5xx when no tracker has been set", async () => {
    vi.resetModules();
    const fresh = await import("../errorResponseService.js");
    const res = buildRes();

    fresh.sendErrorResponse(buildReq(), res, new Error("boom"), 500);

    expect(res.statusCode).toBe(500);
  });

  // The route answers itself and never calls next(err), so the error
  // middleware, which reports through the same tracker, never sees it.
  test("reports a route-caught error once, with the error middleware mounted", async () => {
    const app = express();
    app.get("/boom", (req, res) => {
      sendErrorResponse(req, res, new Error("caught here"), 500);
    });
    app.use(
      createErrorHandler({
        logger: { error: vi.fn() },
        toShortText: (value) => String(value ?? ""),
        captureException: capture
      })
    );

    const response = await request(app).get("/boom");

    expect(response.status).toBe(500);
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe("the response", () => {
  test("masks a 5xx message and carries the request id", () => {
    const res = buildRes();

    sendErrorResponse(buildReq(), res, new Error("relation app_users does not exist"), 500);

    expect(res.body).toEqual({ error: "Server error.", requestId: "req-1" });
  });

  test("keeps a 4xx message", () => {
    const res = buildRes();

    sendErrorResponse(buildReq(), res, new Error("Not found."), 404);

    expect(res.body.error).toBe("Not found.");
  });

  test("falls back to the generic text for a 4xx that carries none", () => {
    const res = buildRes();

    sendErrorResponse(buildReq(), res, {}, 400);

    expect(res.body.error).toBe("Server error.");
  });

  test("logs a thrown value that is not an Error as its text", () => {
    const req = buildReq();

    sendErrorResponse(req, buildRes(), "plain string failure", 500);

    expect(req.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "route_error", error: "plain string failure" }),
      expect.any(String)
    );
  });
});
```

The last three tests in "the response" pin what already holds. They are here because they reach the four branches of this file the suite never took (`errorResponseService.js:19`, `:20`, `:28`, `:37` on `main`).

- [ ] **Step 3: Watch them fail**

```bash
npm -w server exec vitest run src/services/http/__tests__/errorResponseService.test.js > "$SCRATCH/s2-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |TypeError" "$SCRATCH/s2-red.txt" | head -20
```

Expected: `exit=1`, all 11 fail with `TypeError: setErrorResponseTracker is not a function`, raised by the `beforeEach`. On `main` nothing can give `sendErrorResponse` a tracker.

- [ ] **Step 4: The service**

Replace the whole of `server/src/services/http/errorResponseService.js` with:

```js
/**
 * The error response for route handlers that catch their own errors: the
 * unmasked message is logged (no stack), a 5xx is reported to error tracking,
 * and the response carries a masked message and the request id.
 */
const GENERIC_SERVER_ERROR = "Server error.";

// Replaced once by index.js through setErrorResponseTracker. Until then, as in
// every suite that never imports index.js, a 5xx is logged and not reported.
let reportServerError = () => {};

/**
 * Mirrors the masking rule in middleware/errorHandler.js for handlers that catch
 * their own errors: 5xx responses never carry the underlying message, because
 * Prisma and pg errors embed schema, constraint, and connection detail.
 * A 4xx keeps its message, and that includes an upstream API's:
 * externalDataService keeps an upstream 4xx's status, so the external routes
 * pass that API's own error text, or the service's fixed fallback, through to
 * the browser.
 */
const safeErrorMessage = (err, status = 500) => {
  if (status >= 500) return GENERIC_SERVER_ERROR;
  const message = typeof err?.message === "string" ? err.message.trim() : "";
  return message || GENERIC_SERVER_ERROR;
};

/**
 * Sets the function sendErrorResponse reports a 5xx through, called as
 * `capture(error, { requestId, method, path, status })`. index.js passes the
 * same forwarder it gives the error middleware, so both reach one tracker.
 */
export const setErrorResponseTracker = (capture) => {
  reportServerError = capture;
};

/**
 * Logs the full error server-side, reports a 5xx to error tracking, then
 * responds with the masked payload. Returns the response so handlers can
 * `return sendErrorResponse(...)`. Reported once: it answers the request
 * itself and never calls `next(err)`, so the error middleware does not see it.
 */
export const sendErrorResponse = (req, res, err, status = 500) => {
  const resolvedStatus = Number.isInteger(status) ? status : 500;
  const context = {
    requestId: req?.requestId || "",
    method: req?.method,
    path: req?.originalUrl || req?.url,
    status: resolvedStatus
  };
  req?.log?.error(
    {
      event: "route_error",
      ...context,
      error:
        typeof err?.message === "string" ? err.message.slice(0, 300) : String(err).slice(0, 300)
    },
    "Route handler error."
  );
  if (resolvedStatus >= 500) {
    try {
      reportServerError(err, context);
    } catch {
      // Error tracking must never break the response.
    }
  }
  return res.status(resolvedStatus).json({
    error: safeErrorMessage(err, resolvedStatus),
    requestId: context.requestId
  });
};
```

The `route_error` log line keeps its fields and their order (`event`, `requestId`, `method`, `path`, `status`, `error`), and the response body is unchanged.

Re-run Step 3's command. Expected: `exit=0`, 11 passed.

- [ ] **Step 5: The wiring test**

Create `server/src/__tests__/index.errorTracking.test.js`:

```js
import { describe, expect, test, vi } from "vitest";

// index.js wires one forwarder to the error tracker into both 5xx paths: the
// error middleware, for errors that reach it, and sendErrorResponse, for
// errors a route catches and answers itself. This pins that both get the same
// function, so a route-caught 5xx is reported exactly as an uncaught one is.
// Both modules are the real ones, wrapped only to record what index.js hands
// them.

const { setErrorResponseTracker, createErrorHandler } = vi.hoisted(() => ({
  setErrorResponseTracker: vi.fn(),
  createErrorHandler: vi.fn()
}));

vi.mock("../services/http/errorResponseService.js", async (importOriginal) => {
  const original = await importOriginal();
  setErrorResponseTracker.mockImplementation(original.setErrorResponseTracker);
  return { ...original, setErrorResponseTracker };
});

vi.mock("../middleware/errorHandler.js", async (importOriginal) => {
  const original = await importOriginal();
  createErrorHandler.mockImplementation(original.createErrorHandler);
  return { ...original, createErrorHandler };
});

describe("error tracking wiring in index.js", () => {
  test("gives sendErrorResponse the forwarder the error middleware uses", async () => {
    await import("../index.js");

    expect(setErrorResponseTracker).toHaveBeenCalledTimes(1);
    const forwarder = setErrorResponseTracker.mock.calls[0][0];
    expect(createErrorHandler.mock.calls[0][0].captureException).toBe(forwarder);
    // Until startServer runs initErrorTracking the tracker is the disabled
    // one, so forwarding does nothing rather than throw.
    expect(() => forwarder(new Error("boom"), { status: 500 })).not.toThrow();
  });
});
```

It imports `index.js`, which builds the app without connecting anything, as `index.cors.test.js` does, so it needs no database.

```bash
npm -w server exec vitest run src/__tests__/index.errorTracking.test.js > "$SCRATCH/s2-wire-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |AssertionError" "$SCRATCH/s2-wire-red.txt"
```

Expected: `exit=1`, with `AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`: `index.js` never sets a tracker.

- [ ] **Step 6: The wiring**

In `server/src/index.js`, after line 37 (`} from "./services/http/apiSchemaService.js";`), add:

```js
import { setErrorResponseTracker } from "./services/http/errorResponseService.js";
```

Replace lines 732-740 (the `app.use(createErrorHandler({ ... }))` block) with:

```js
// The one path to error tracking, for the error middleware and for routes that
// answer their own 5xx through sendErrorResponse. It reads errorTracker when
// called, because startServer replaces it after this module has run.
const reportToErrorTracker = (error, context = {}) => {
  errorTracker.captureException(error, context);
};
setErrorResponseTracker(reportToErrorTracker);

app.use(
  createErrorHandler({
    logger,
    toShortText,
    captureException: reportToErrorTracker
  })
);
```

The error middleware stays last and in place (SOP rule 5): only the function it is given moves into a named constant.

```bash
npm -w server exec vitest run src/__tests__/index.errorTracking.test.js src/__tests__/index.cors.test.js src/__tests__/index.securityHeaders.test.js src/middleware/__tests__/errorHandler.test.js > "$SCRATCH/s2-wire-green.txt" 2>&1; echo "exit=$?"; grep -E "Test Files|Tests " "$SCRATCH/s2-wire-green.txt"
```

Expected: `exit=0`, 4 files passed.

- [ ] **Step 7: The request-id tests**

In `server/src/routes/__tests__/generateRoutes.equipment.test.js`, replace the first lines of `buildApp` (lines 25-29):

```js
const buildApp = (overrides = {}, { user } = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.user = user;
```

with:

```js
const buildApp = (overrides = {}, { user, requestId } = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.user = user;
    if (requestId) req.requestId = requestId;
```

and after `refuses to run when no client was built` (ends at line 227) add:

```js
// The id the request's log lines carry, so a report of this 500 can be found
// in them.
test("carries the request id when it refuses to run", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");

  const response = await post(buildApp({}, { requestId: "req-gen-1" }));

  expect(response.status).toBe(500);
  expect(response.body.requestId).toBe("req-gen-1");
});
```

In `server/src/routes/external/__tests__/airQualityRoutes.test.js`, replace the first three lines of `buildApp` (lines 47-49):

```js
const buildApp = (openAqRequest) => {
  const app = express();
  registerAirQualityRoutes(app, {
```

with:

```js
const buildApp = (openAqRequest, { requestId } = {}) => {
  const app = express();
  app.use((req, _res, next) => {
    if (requestId) req.requestId = requestId;
    next();
  });
  registerAirQualityRoutes(app, {
```

and after `returns 502 when the station arrives without a usable id` (ends at line 185) add:

```js
test("carries the request id on that 502", async () => {
  const openAqRequest = vi
    .fn()
    .mockResolvedValueOnce({ data: { results: [station({ id: null })] }, cache: "miss" });

  const response = await get(buildApp(openAqRequest, { requestId: "req-aq-1" }));

  expect(response.status).toBe(502);
  expect(response.body.requestId).toBe("req-aq-1");
});
```

The existing tests on both paths send no request id, so between them the two new `req.requestId || ""` expressions have both operands covered.

```bash
npm -w server exec vitest run src/routes/__tests__/generateRoutes.equipment.test.js src/routes/external/__tests__/airQualityRoutes.test.js > "$SCRATCH/s2-id-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |AssertionError" "$SCRATCH/s2-id-red.txt"
```

Expected: `exit=1`, `2 failed | 89 passed`, with `expected undefined to be 'req-gen-1'` and `expected undefined to be 'req-aq-1'`.

- [ ] **Step 8: The request ids**

In `server/src/routes/generateRoutes.js`, replace line 214, `        return res.status(500).json({ error: "Missing GEMINI_API_KEY." });`, with:

```js
return res.status(500).json({ error: "Missing GEMINI_API_KEY.", requestId: req.requestId || "" });
```

In `server/src/routes/external/registerAirQualityRoutes.js`, replace line 51, `        return res.status(502).json({ error: "OpenAQ response missing location id." });`, with:

```js
return res
  .status(502)
  .json({ error: "OpenAQ response missing location id.", requestId: req.requestId || "" });
```

Re-run Step 7's command. Expected: `exit=0`, 91 passed.

- [ ] **Step 9: Comments made true**

- `errorResponseService.js`: the header and both summaries, as written in Step 4. "Nothing here reports to error tracking" is gone.
- `server/src/services/platform/errorTrackingService.js`, lines 2-4. Replace:

```js
 * Sentry error tracking, on only when SENTRY_DSN is set. index.js initialises it
 * at startup, the error middleware reports 5xx errors through it, and the
 * shutdown handler flushes it.
```

with:

```js
 * Sentry error tracking, on only when SENTRY_DSN is set. index.js initialises it
 * at startup, the error middleware and sendErrorResponse report 5xx errors
 * through it, and the shutdown handler flushes it.
```

- `index.js`: the new comment above `reportToErrorTracker`.
- These stay true: `middleware/errorHandler.js`'s header and summary, and the comment at `index.js:246-248` on the "Missing GEMINI_API_KEY." 500.

- [ ] **Step 10: Commit**

```bash
git add server/src/services/http/errorResponseService.js server/src/index.js server/src/routes/generateRoutes.js server/src/routes/external/registerAirQualityRoutes.js server/src/services/platform/errorTrackingService.js server/src/services/http/__tests__/errorResponseService.test.js server/src/__tests__/index.errorTracking.test.js server/src/routes/__tests__/generateRoutes.equipment.test.js server/src/routes/external/__tests__/airQualityRoutes.test.js
git commit -F - <<'EOF'
fix(errors): report route-caught 5xx to Sentry

sendErrorResponse reports any 5xx it answers to error tracking, through
the forwarder index.js also gives the error middleware, so a database
outage caught in a route, or a session store outage in requireAuth,
reaches Sentry. It answers the request itself and never calls
next(err), so each error is reported once. The missing-key 500 in
/api/generate and the missing-location-id 502 in the air-quality route
now carry the request id.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 11: Mutation check**

Write `$SCRATCH/s2-mutants.json` with the Write tool:

```json
[
  {
    "name": "reports every status, 4xx included",
    "tests": "src/services/http/__tests__/errorResponseService.test.js",
    "edits": [
      {
        "file": "server/src/services/http/errorResponseService.js",
        "find": "  if (resolvedStatus >= 500) {",
        "text": "  if (resolvedStatus >= 400) {"
      }
    ]
  },
  {
    "name": "misses a plain 500",
    "tests": "src/services/http/__tests__/errorResponseService.test.js",
    "edits": [
      {
        "file": "server/src/services/http/errorResponseService.js",
        "find": "  if (resolvedStatus >= 500) {",
        "text": "  if (resolvedStatus > 500) {"
      }
    ]
  },
  {
    "name": "a throwing tracker breaks the response",
    "tests": "src/services/http/__tests__/errorResponseService.test.js",
    "edits": [
      {
        "file": "server/src/services/http/errorResponseService.js",
        "find": "    try {\n      reportServerError(err, context);\n    } catch {\n      // Error tracking must never break the response.\n    }",
        "text": "    reportServerError(err, context);"
      }
    ]
  },
  {
    "name": "index.js never sets the tracker",
    "tests": "src/__tests__/index.errorTracking.test.js",
    "edits": [
      {
        "file": "server/src/index.js",
        "find": "setErrorResponseTracker(reportToErrorTracker);\n",
        "text": ""
      }
    ]
  },
  {
    "name": "index.js gives the two paths different forwarders",
    "tests": "src/__tests__/index.errorTracking.test.js",
    "edits": [
      {
        "file": "server/src/index.js",
        "find": "    captureException: reportToErrorTracker\n",
        "text": "    captureException: (error, context = {}) => errorTracker.captureException(error, context)\n"
      }
    ]
  },
  {
    "name": "generate's missing-key 500 drops its request id",
    "tests": "src/routes/__tests__/generateRoutes.equipment.test.js",
    "edits": [
      {
        "file": "server/src/routes/generateRoutes.js",
        "find": "{ error: \"Missing GEMINI_API_KEY.\", requestId: req.requestId || \"\" }",
        "text": "{ error: \"Missing GEMINI_API_KEY.\", requestId: \"\" }"
      }
    ]
  },
  {
    "name": "air quality's 502 drops its request id",
    "tests": "src/routes/external/__tests__/airQualityRoutes.test.js",
    "edits": [
      {
        "file": "server/src/routes/external/registerAirQualityRoutes.js",
        "find": "requestId: req.requestId || \"\" }",
        "text": "requestId: \"\" }"
      }
    ]
  }
]
```

```bash
node "$TOOLS/run-mutants.mjs" "$SCRATCH/s2-mutants.json" > "$SCRATCH/s2-mutants.txt" 2>&1; echo "mutants exit=$?"; cat "$SCRATCH/s2-mutants.txt"; git status --short
```

Expected: `mutants exit=0`, all seven `caught`, `git status --short` empty. All seven were caught in the scratch run.

- [ ] **Step 12: Coverage, exact**

Run the exact-coverage block from Conventions.

| Added                                                                       | Covered by                                                                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `setErrorResponseTracker` (function)                                        | every test in `errorResponseService.test.js` (its `beforeEach`)                                           |
| the default `reportServerError` no-op (function)                            | `answers a 5xx when no tracker has been set`, and every route suite that answers a 5xx without `index.js` |
| `if (resolvedStatus >= 500)` (2 branches)                                   | `reports a 5xx with the request it came from`; `does not report a 4xx`                                    |
| the `try`/`catch` around the report                                         | `still answers when the tracker throws`                                                                   |
| `req.requestId \|\| ""` in two routes (2 branches each)                     | the two new request-id tests, and the existing tests of those paths, which send none                      |
| `setErrorResponseTracker(reportToErrorTracker)` in `index.js` (1 statement) | any suite that imports `index.js`                                                                         |

Removed: the second `req?.requestId || ""` in `sendErrorResponse`, now read from `context`. Newly covered: the four branches of `errorResponseService.js` named in Step 2.

Measured in a scratch copy with the DB-free suites that reach these files: `errorResponseService.js` 10/10 → 17/17 statements, 14/18 → 18/18 branches, 2/2 → 4/4 functions, 9/9 → 16/16 lines; `generateRoutes.js` and `registerAirQualityRoutes.js` each +2 branches, both covered. Every metric's slack rises: about +0.4 statements, +4.5 branches, +0.1 functions and +0.3 lines on top of whatever S1 left.

- [ ] **Step 13: Gates, push, PR**

Run the gates and the extra checks from Conventions. Then:

```bash
git push -u origin fix/report-route-caught-5xx
gh pr create --base main --title "fix(errors): report route-caught 5xx to Sentry" --body-file "$SCRATCH/pr-s2.md"
gh pr checks --watch
```

`pr-s2.md` covers:

- the 27 call sites, with the per-file count, and why the research's 28 was one too many;
- the injection, and why it rules out a double report;
- the direct 5xx answers that stay unreported, and why;
- the two request ids;
- the dedupe decision point, quoted from the Decisions above;
- the gate results and the four `floor-check` lines;
- the trailer `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

- [ ] **Step 14: Review, then merge.**

---

### Tasks S3a, S3b and S3c: three small correctness fixes, as three PRs

The spec's S3 is split into three PRs because the three fixes touch unrelated files and have nothing to share: the env check is `envValidationService.js` and its test; the OpenAQ fast path is `externalDataService.js`, its retry test and three documents; the collection loading is the dashboard collection service, the read routes, `index.js` and a new route test. Each can be reverted alone, each is reviewed against its own invariant, and S3a moves no coverage at all, which keeps its measurement trivially clean. They run in the order below, each from the `main` the previous one merged into.

---

### Task S3a: Validate the credential limiter's two settings

`index.js:278-282` reads `CREDENTIAL_RATE_LIMIT_WINDOW_MS` and `CREDENTIAL_RATE_LIMIT_MAX` through `toPositiveInt`, which falls back to its default on anything unusable. `NUMERIC_VARS` (`envValidationService.js:16-45`) lists the other four limiter pairs but not these, so a typo silently restores the default instead of failing the startup preflight.

**Files:**

- Modify: `server/src/services/platform/envValidationService.js` (after line 24)
- Test: `server/src/services/platform/__tests__/envValidationService.test.js` (before line 103)

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/credential-limit-env-rows origin/main
```

- [ ] **Step 2: The failing test**

In `envValidationService.test.js`, add before `rejects a WGER_DEFAULT_LANGUAGE above the reader's 1..100 range` (line 103):

```js
// index.js reads both through toPositiveInt, which falls back to its default
// on anything unusable, so without these rows a typo would quietly loosen
// or tighten the limit on password re-verification.
test.each([
  ["CREDENTIAL_RATE_LIMIT_WINDOW_MS", "ten minutes", "must be a number"],
  ["CREDENTIAL_RATE_LIMIT_WINDOW_MS", "500", "must be >= 1000"],
  ["CREDENTIAL_RATE_LIMIT_MAX", "ten", "must be a number"],
  ["CREDENTIAL_RATE_LIMIT_MAX", "0", "must be >= 1"]
])("rejects %s=%s", (name, value, message) => {
  const errors = validateEnv({ ...validEnv, [name]: value });
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain(`${name} ${message}`);
});

test("accepts the credential limiter's documented defaults", () => {
  expect(
    validateEnv({
      ...validEnv,
      CREDENTIAL_RATE_LIMIT_WINDOW_MS: "600000",
      CREDENTIAL_RATE_LIMIT_MAX: "10"
    })
  ).toEqual([]);
});
```

```bash
npm -w server exec vitest run src/services/platform/__tests__/envValidationService.test.js > "$SCRATCH/s3a-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |AssertionError" "$SCRATCH/s3a-red.txt"
```

Expected: `exit=1`, `4 failed | 20 passed`, each with `expected [] to have a length of 1 but got +0`: the validator ignores both settings. The defaults test passes on `main` by design.

- [ ] **Step 3: The two rows**

In `envValidationService.js`, after line 24, `  { name: "AUTH_RATE_LIMIT_MAX", min: 1 },`, add:

```js
  { name: "CREDENTIAL_RATE_LIMIT_WINDOW_MS", min: 1000 },
  { name: "CREDENTIAL_RATE_LIMIT_MAX", min: 1 },
```

The bounds match the other four limiter pairs. Re-run Step 2's command. Expected: `exit=0`, 24 passed.

- [ ] **Step 4: Comments made true.** The comment above `NUMERIC_VARS` (lines 7-15) stays true: both readers are `toPositiveInt`, which rejects zero and below, and the 1000 ms window floor is the one every limiter window already carries. `README.md:200` and `env.example:102-103` already document both settings, so neither changes.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/platform/envValidationService.js server/src/services/platform/__tests__/envValidationService.test.js
git commit -F - <<'EOF'
fix(env): validate the credential limiter's two settings

CREDENTIAL_RATE_LIMIT_WINDOW_MS and CREDENTIAL_RATE_LIMIT_MAX join the
startup preflight with the bounds the other limiter pairs carry, so a
typo fails the boot instead of silently restoring the default.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 6: Mutation check**

Write `$SCRATCH/s3a-mutants.json` with the Write tool:

```json
[
  {
    "name": "no window row",
    "tests": "src/services/platform/__tests__/envValidationService.test.js",
    "edits": [
      {
        "file": "server/src/services/platform/envValidationService.js",
        "find": "  { name: \"CREDENTIAL_RATE_LIMIT_WINDOW_MS\", min: 1000 },\n",
        "text": ""
      }
    ]
  },
  {
    "name": "no max row",
    "tests": "src/services/platform/__tests__/envValidationService.test.js",
    "edits": [
      {
        "file": "server/src/services/platform/envValidationService.js",
        "find": "  { name: \"CREDENTIAL_RATE_LIMIT_MAX\", min: 1 },\n",
        "text": ""
      }
    ]
  },
  {
    "name": "window floor too low",
    "tests": "src/services/platform/__tests__/envValidationService.test.js",
    "edits": [
      {
        "file": "server/src/services/platform/envValidationService.js",
        "find": "  { name: \"CREDENTIAL_RATE_LIMIT_WINDOW_MS\", min: 1000 },",
        "text": "  { name: \"CREDENTIAL_RATE_LIMIT_WINDOW_MS\", min: 1 },"
      }
    ]
  }
]
```

```bash
node "$TOOLS/run-mutants.mjs" "$SCRATCH/s3a-mutants.json" > "$SCRATCH/s3a-mutants.txt" 2>&1; echo "mutants exit=$?"; cat "$SCRATCH/s3a-mutants.txt"; git status --short
```

Expected: `mutants exit=0`, three `caught`, `git status --short` empty.

- [ ] **Step 7: Coverage, exact.** Run the exact-coverage block from Conventions. Two array entries add no statement, branch or function, and the loop's arms are already covered, so all four counts must equal those of the `main` this branch started from. If any count moved, stop and find out why before going on.

- [ ] **Step 8: Gates, push, PR**

Run the gates and the extra checks from Conventions. Then:

```bash
git push -u origin fix/credential-limit-env-rows
gh pr create --base main --title "fix(env): validate the credential limiter's two settings" --body-file "$SCRATCH/pr-s3a.md"
gh pr checks --watch
```

`pr-s3a.md` covers the gap, the two rows and their bounds, the unchanged counts, the gate results, and ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`. It also says why S3 is three PRs, from the section above.

- [ ] **Step 9: Review, then merge.**

---

### Task S3b: A missing OpenAQ key fails at once

`openAqRequest` checks for the key inside `runExternalRequestWithRetry` (`externalDataService.js:241-246`) and throws status 503, which `isRetriableExternalError` (lines 136-141) treats as retriable. With the defaults (`EXTERNAL_API_RETRIES` 2 and a 250 ms base delay, `index.js:300-304`) each request waits 250 + 500 ms before the route falls back, and logs two `external_api_retry` warnings. No retry can supply a key. After this task the check runs before the wrapper, the 503 reaches the route's fallback at once, and one `openaq_api_key_missing` warning per request takes the retry warnings' place as the operator's signal.

The check stays inside `readThroughExternalCache`'s `requestFn`, so a stale cached reading is still served when one exists. A missing key no longer counts toward `metrics.externalApiFailures.openAq` or records a latency, because no request is made; say so in the PR.

**Files:**

- Modify: `server/src/services/external/externalDataService.js` (summary 16-18; `openAqRequest`'s `requestFn`, 240-246 and its close at 314)
- Modify: `README.md` (425), `docs/deploy-runbook.md` (145-147), `render.yaml` (99-100)
- Test: `server/src/services/external/__tests__/externalRetry.test.js` (after line 189)

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/openaq-missing-key-fast-path origin/main
```

- [ ] **Step 2: The failing test**

Append to `externalRetry.test.js`, after its last line (189):

```js
// A missing OpenAQ key is configuration, not an outage: no retry can supply
// one, so retrying only holds the request through the backoff before the route
// falls back.
describe("a missing OpenAQ key", () => {
  const withoutKey = () =>
    buildService({
      openAqBaseUrl: "https://example.invalid/v3",
      openAqApiKey: "",
      openAqTimeoutMs: 50,
      openAqCacheTtlSec: 60
    });

  test("fails at once, without a retry or a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { service, metrics, logger } = withoutKey();

    await expect(service.openAqRequest("locations")).rejects.toMatchObject({ status: 503 });

    expect(metrics.externalApiRetries.openAq).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "external_api_retry" })
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The route answers with its fallback body, so the log is where an operator
  // sees that the key is missing.
  test("logs a warning naming the setting", async () => {
    const { service, logger } = withoutKey();

    await expect(service.openAqRequest("locations")).rejects.toThrow();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "openaq_api_key_missing",
        message: expect.stringContaining("OPENAQ_API_KEY")
      })
    );
  });
});
```

`buildService` in this file uses `externalApiRetries: 2` and a 1 ms base delay, so the red run is fast and the retry count is the proof rather than a clock.

```bash
npm -w server exec vitest run src/services/external/__tests__/externalRetry.test.js > "$SCRATCH/s3b-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |AssertionError" "$SCRATCH/s3b-red.txt"
```

Expected: `exit=1`, `2 failed | 10 passed`. The first fails with `expected 2 to be undefined`: both retries ran. The second fails because no `openaq_api_key_missing` warning exists.

- [ ] **Step 3: The fast path**

In `externalDataService.js`, replace lines 240-246:

```js
      requestFn: async () =>
        runExternalRequestWithRetry("openAq", async () => {
          if (!openAqApiKey) {
            const err = new Error("OpenAQ API key is not configured. Set OPENAQ_API_KEY.");
            err.status = 503;
            throw err;
          }
```

with:

```js
      requestFn: async () => {
        // Checked before the retry wrapper, because no retry can supply a key:
        // the 503 reaches the route's fallback at once, and this warning is
        // the one place the cause shows.
        if (!openAqApiKey) {
          const message = "OpenAQ API key is not configured. Set OPENAQ_API_KEY.";
          logger.warn({ event: "openaq_api_key_missing", message });
          const err = new Error(message);
          err.status = 503;
          throw err;
        }
        return runExternalRequestWithRetry("openAq", async () => {
```

The rest of the wrapped function keeps its indentation. Then close the new block: replace lines 314-315,

```js
        })
    });
```

(the end of the wrapped function and of the `readThroughExternalCache` call, just above `  };` and `const openAqParameterLabel`), with:

```js
        });
      }
    });
```

In the summary, replace line 18:

```js
 *   from `externalApiRetryBaseDelayMs`.
```

with:

```js
 *   from `externalApiRetryBaseDelayMs`. A missing OpenAQ key fails at once.
```

```bash
npm -w server exec vitest run src/services/external/__tests__/ src/routes/external/__tests__/ > "$SCRATCH/s3b-green.txt" 2>&1; echo "exit=$?"; grep -E "Test Files|Tests " "$SCRATCH/s3b-green.txt"
```

Expected: `exit=0`, 8 files passed. `externalRequests.test.js`'s `refuses with a 503 when no api key is configured, without calling fetch` still passes, and so does every air-quality route test.

- [ ] **Step 4: Comments and records made true**

Three records say the missing key shows as `external_api_retry` warnings, which is no longer true:

- `README.md:425`, the `OPENAQ_API_KEY` row. In its second cell, replace the end of the sentence:

  ```text
  the server logs `external_api_retry` warnings naming the missing key
  ```

  with:

  ```text
  the server logs an `openaq_api_key_missing` warning for each request
  ```

  The new cell is exactly as long as the old (195 characters), so Prettier does not re-pad the table.

- `docs/deploy-runbook.md:146-147`. Replace these two lines, keeping their three-space indent:

  ```text
     the place to spot it is the server log: `external_api_retry` warnings that
     name the missing key.
  ```

  with:

  ```text
     the place to spot it is the server log: an `openaq_api_key_missing`
     warning for each air-quality request.
  ```

- `render.yaml:99-100`. Replace these two comment lines, keeping their indent:

  ```yaml
  # sees no error status; the server log is where it shows, as
  # `external_api_retry` warnings naming the missing key.
  ```

  with:

  ```yaml
  # sees no error status; the server log is where it shows, as an
  # `openaq_api_key_missing` warning for each air-quality request.
  ```

Check: `git grep -n "external_api_retry" -- README.md docs/deploy-runbook.md render.yaml` prints nothing. These stay true: the comment in `registerAirQualityRoutes.js:123-125` (the fallback covers the status a missing key raises) and the one in `externalRequests.test.js:398-400`.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/external/externalDataService.js server/src/services/external/__tests__/externalRetry.test.js README.md docs/deploy-runbook.md render.yaml
git commit -F - <<'EOF'
fix(air-quality): a missing OpenAQ key fails at once

The key is checked before the retry wrapper, because no retry can
supply one. The 503 reaches the route's fallback at once instead of
after 750 ms of backoff, and one openaq_api_key_missing warning per
request replaces the two external_api_retry warnings as the signal.
The README, the runbook and render.yaml say so.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 6: Mutation check**

Write `$SCRATCH/s3b-mutants.json` with the Write tool:

```json
[
  {
    "name": "a missing key goes on into the retry wrapper",
    "tests": "src/services/external/__tests__/externalRetry.test.js",
    "edits": [
      {
        "file": "server/src/services/external/externalDataService.js",
        "find": "          throw err;\n        }\n        return runExternalRequestWithRetry(\"openAq\"",
        "text": "        }\n        return runExternalRequestWithRetry(\"openAq\""
      }
    ]
  },
  {
    "name": "no warning for a missing key",
    "tests": "src/services/external/__tests__/externalRetry.test.js",
    "edits": [
      {
        "file": "server/src/services/external/externalDataService.js",
        "find": "          logger.warn({ event: \"openaq_api_key_missing\", message });\n",
        "text": ""
      }
    ]
  }
]
```

```bash
node "$TOOLS/run-mutants.mjs" "$SCRATCH/s3b-mutants.json" > "$SCRATCH/s3b-mutants.txt" 2>&1; echo "mutants exit=$?"; cat "$SCRATCH/s3b-mutants.txt"; git status --short
```

Expected: `mutants exit=0`, both `caught`, `git status --short` empty.

- [ ] **Step 7: Coverage, exact**

Run the exact-coverage block from Conventions. The `if` moves and keeps both arms (covered by this test and by every keyed request test); the block body adds two statements (the `message` constant and the warning), both covered. Measured in a scratch copy: `externalDataService.js` statements 353/365 → 355/367 and lines 313/319 → 315/321, branches and functions unchanged. Every metric's slack stays the same or rises.

- [ ] **Step 8: Gates, push, PR**

Run the gates and the extra checks from Conventions. Then:

```bash
git push -u origin fix/openaq-missing-key-fast-path
gh pr create --base main --title "fix(air-quality): a missing OpenAQ key fails at once" --body-file "$SCRATCH/pr-s3b.md"
gh pr checks --watch
```

`pr-s3b.md` covers the 750 ms the defaults spent, the new warning and the three records it changes, the metrics a missing key no longer moves, the gate results and the `floor-check` lines, and ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

- [ ] **Step 9: Review, then merge.**

---

### Task S3c: A paginated route reads only its own collection

`GET /api/dashboard/workout-sessions`, `/meal-logs` and `/progress-metrics` each call `getDashboardCollections` (`registerDashboardReadRoutes.js:36`, `:58`, `:80`), which loads all three collections "even for a route that answers with one", as its own comment at `dashboardCollectionService.js:84` says. Each collection is a `findMany` and a `count` (`dashboardCollectionRepository.js:49-52`), so each route runs six queries to use two. After this task each paginated route loads one collection through a new `getDashboardCollection`, and `GET /api/dashboard` still loads all three.

The two loaders share one `loadPage` and one table of sort fields, so neither can drift from the other. The three route handlers stay three handlers: folding them into a loop would delete covered statements for no behaviour, which this phase avoids (spec rule 5). The route test is new and DB-free; `collectionReads.integration.test.js` covers the same routes against Postgres and must stay green.

**Files:**

- Modify: `server/src/services/dashboard/dashboardCollectionService.js` (header 1-5, summary 8-10, `getDashboardCollections` 58-114, the returned object 150-154)
- Modify: `server/src/routes/dashboard/registerDashboardReadRoutes.js` (the whole file, 96 lines)
- Modify: `server/src/index.js` (the `dashboardCollectionService` destructuring, 488-489 on `74de371`; the `getDashboardCollections` entry in `registerApiRoutes`' deps, 692. S2 adds one import line above both, so after S2 they are 489-490 and 693)
- Create: `server/src/routes/dashboard/__tests__/dashboardReadRoutes.test.js`

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/dashboard-collection-scoped-reads origin/main
```

- [ ] **Step 2: The failing test**

Create `server/src/routes/dashboard/__tests__/dashboardReadRoutes.test.js`:

```js
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { registerDashboardReadRoutes } from "../registerDashboardReadRoutes.js";
import { createDashboardCollectionService } from "../../../services/dashboard/dashboardCollectionService.js";
import {
  buildDashboard,
  cleanText,
  toNullableNumber
} from "../../../services/dashboard/dashboardDataBuildersService.js";

// The dashboard read routes over the real collection service, with only the
// repository reader stubbed: what this pins is which collections each route
// asks the database for. collectionReads.integration.test.js covers the same
// routes against Postgres.

let loadCollectionPage;

const paginatedPaths = [
  "/api/dashboard/workout-sessions",
  "/api/dashboard/meal-logs",
  "/api/dashboard/progress-metrics"
];

const buildApp = ({ user = { id: "u-1", dashboard: {} } } = {}) => {
  const service = createDashboardCollectionService({
    cleanText,
    toNullableNumber,
    defaultLimit: 50,
    maxLimit: 200,
    loadCollectionPage,
    buildDashboard
  });
  const app = express();
  registerDashboardReadRoutes(app, {
    ...service,
    requireAuth: (req, _res, next) => {
      req.user = user;
      next();
    }
  });
  return app;
};

beforeEach(() => {
  loadCollectionPage = vi.fn(async ({ collection }) => ({
    items: [{ id: `${collection}-1`, userId: "u-1" }],
    total: 1
  }));
});

describe("the paginated routes", () => {
  // Each collection is a findMany and a count, so loading all three to answer
  // with one ran four queries for nothing.
  test.each([
    ["/api/dashboard/workout-sessions", "workoutSessions", "createdAt"],
    ["/api/dashboard/meal-logs", "mealLogs", "loggedAt"],
    ["/api/dashboard/progress-metrics", "progressMetrics", "loggedAt"]
  ])("%s reads only its own collection", async (path, collection, sortField) => {
    const response = await request(buildApp()).get(`${path}?limit=5&offset=10`);

    expect(response.status).toBe(200);
    expect(loadCollectionPage).toHaveBeenCalledTimes(1);
    expect(loadCollectionPage).toHaveBeenCalledWith({
      collection,
      userId: "u-1",
      sortField,
      limit: 5,
      offset: 10
    });
    expect(response.body).toEqual({
      [collection]: [{ id: `${collection}-1` }],
      pagination: { total: 1, limit: 5, offset: 10, source: "collection" }
    });
  });

  test("reads the default first page when the query names none", async () => {
    await request(buildApp()).get("/api/dashboard/meal-logs");

    expect(loadCollectionPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 })
    );
  });

  // requireAuth always supplies a user with an id; without one the loader
  // answers an empty page rather than query for nobody.
  test("answers an empty page, without a query, for a user with no id", async () => {
    const response = await request(buildApp({ user: {} })).get("/api/dashboard/workout-sessions");

    expect(response.body).toEqual({
      workoutSessions: [],
      pagination: { total: 0, limit: 0, offset: 0, source: "collection" }
    });
    expect(loadCollectionPage).not.toHaveBeenCalled();
  });

  test.each(paginatedPaths)(
    "%s refuses a limit above the maximum, without a read",
    async (path) => {
      const response = await request(buildApp()).get(`${path}?limit=5000`);

      expect(response.status).toBe(400);
      expect(loadCollectionPage).not.toHaveBeenCalled();
    }
  );
});

describe("GET /api/dashboard", () => {
  test("still reads all three collections", async () => {
    const response = await request(buildApp()).get("/api/dashboard");

    expect(response.status).toBe(200);
    const collections = loadCollectionPage.mock.calls.map(([args]) => args.collection);
    expect(collections.sort()).toEqual(["mealLogs", "progressMetrics", "workoutSessions"]);
  });

  test("answers empty collections, without a query, for a user with no id", async () => {
    const response = await request(buildApp({ user: {} })).get("/api/dashboard");

    expect(response.body.dashboard.workoutSessions).toEqual([]);
    expect(response.body.pagination.mealLogs).toEqual({
      total: 0,
      limit: 0,
      offset: 0,
      source: "collection"
    });
    expect(loadCollectionPage).not.toHaveBeenCalled();
  });
});

describe("a failed read", () => {
  test.each(["/api/dashboard", ...paginatedPaths])("%s answers a masked 500", async (path) => {
    loadCollectionPage = vi.fn(async () => {
      throw new Error('relation "meal_logs" does not exist');
    });

    const response = await request(buildApp()).get(path);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/meal_logs/);
  });
});
```

Only the first `test.each` fails on `main`. The rest pin behaviour that must not change, and they reach code no suite reaches on `main`: the read routes' four catch blocks and two of their validation returns (`registerDashboardReadRoutes.js:23`, `:49`, `:56`, `:71`, `:78`, `:93`), and `getDashboardCollections`' empty-user arm (`dashboardCollectionService.js:61-62`).

```bash
npm -w server exec vitest run src/routes/dashboard/__tests__/dashboardReadRoutes.test.js > "$SCRATCH/s3c-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |AssertionError" "$SCRATCH/s3c-red.txt"
```

Expected: `exit=1`, `3 failed | 11 passed`, each with `expected "vi.fn()" to be called 1 times, but got 3 times`.

- [ ] **Step 3: The service**

In `server/src/services/dashboard/dashboardCollectionService.js`, replace lines 1-5 (the header) with:

```js
/**
 * The paginated dashboard: a page of one collection for the per-collection
 * routes, and the dashboard response that combines a page of each with the
 * rest of the stored dashboard. Built once in index.js over
 * dashboardCollectionRepository's reader.
 */

// The three collections, and the field each one's pages are ordered by.
const COLLECTION_SORT_FIELDS = {
  workoutSessions: "createdAt",
  mealLogs: "loggedAt",
  progressMetrics: "loggedAt"
};

const emptyPage = () => ({ items: [], total: 0, limit: 0, offset: 0, source: "collection" });
```

Replace lines 8-10 of the factory's summary:

```js
 * Builds the service. Returns the pagination parser and the collection loader
 * the dashboard read routes use, and `buildDashboardResponse`, which the read
 * and write routes both answer with.
```

with:

```js
 * Builds the service. Returns the pagination parser and the one-collection
 * loader the paginated read routes use, and `buildDashboardResponse`, which the
 * read and write routes both answer with.
```

Replace `getDashboardCollections`, lines 58-114, with:

```js
// One page of one collection: the caller's pagination for it, else the
// default first page.
const loadPage = (collection, userId, pagination = {}) => {
  const { limit, offset } = { ...parseDashboardPagination({}, defaultLimit), ...pagination };
  return toCollectionPage({
    collection,
    userId,
    sortField: COLLECTION_SORT_FIELDS[collection],
    limit,
    offset
  });
};

// One collection, for the paginated routes. No user id: an empty page,
// without a query.
const getDashboardCollection = async (user, collection, pagination) => {
  const userId = cleanText(user?.id, 120);
  if (!userId) return emptyPage();
  return loadPage(collection, userId, pagination);
};

// All three, for the full dashboard. No user id: an empty page of each,
// without a query.
const getDashboardCollections = async (user, pagination = {}) => {
  const userId = cleanText(user?.id, 120);
  if (!userId) {
    return { workoutSessions: emptyPage(), mealLogs: emptyPage(), progressMetrics: emptyPage() };
  }

  const [workoutSessions, mealLogs, progressMetrics] = await Promise.all([
    loadPage("workoutSessions", userId, pagination.workoutSessions),
    loadPage("mealLogs", userId, pagination.mealLogs),
    loadPage("progressMetrics", userId, pagination.progressMetrics)
  ]);

  return {
    workoutSessions,
    mealLogs,
    progressMetrics
  };
};
```

and in the returned object at the end of the factory (lines 150-154), replace `getDashboardCollections,` with `getDashboardCollection,`. `buildDashboardResponse` still calls `getDashboardCollections`, which is now private to the factory.

- [ ] **Step 4: The routes and the wiring**

Replace the whole of `server/src/routes/dashboard/registerDashboardReadRoutes.js` with:

```js
/**
 * The dashboard's read routes: the whole dashboard in one response, and one
 * paginated route per collection. Registered by dashboardRoutes.js.
 */
import { dashboardPaginationQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

/**
 * Registers GET /api/dashboard and the workout-session, meal-log and
 * progress-metric collection routes, all behind `requireAuth`. The other three
 * members it takes from `deps` come from the dashboard collection service built
 * in index.js.
 */
export const registerDashboardReadRoutes = (app, deps) => {
  const { requireAuth, buildDashboardResponse, parseDashboardPagination, getDashboardCollection } =
    deps;

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const response = await buildDashboardResponse(req.user);
      return res.json(response);
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  // One page of one collection each, and only that collection is read. `limit`
  // and `offset` are validated here and defaulted by parseDashboardPagination.
  // `pagination.total` counts the user's whole collection, not the page, so the
  // caller can tell whether there is another page to ask for.
  app.get("/api/dashboard/workout-sessions", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const page = await getDashboardCollection(
        req.user,
        "workoutSessions",
        parseDashboardPagination(queryInput)
      );
      return res.json({
        workoutSessions: page.items,
        pagination: {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          source: page.source
        }
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.get("/api/dashboard/meal-logs", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const page = await getDashboardCollection(
        req.user,
        "mealLogs",
        parseDashboardPagination(queryInput)
      );
      return res.json({
        mealLogs: page.items,
        pagination: {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          source: page.source
        }
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.get("/api/dashboard/progress-metrics", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const page = await getDashboardCollection(
        req.user,
        "progressMetrics",
        parseDashboardPagination(queryInput)
      );
      return res.json({
        progressMetrics: page.items,
        pagination: {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          source: page.source
        }
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
```

The response bodies are field for field what they were.

In `server/src/index.js`, replace:

```js
const { parseDashboardPagination, getDashboardCollections, buildDashboardResponse } =
  dashboardCollectionService;
```

with:

```js
const { parseDashboardPagination, getDashboardCollection, buildDashboardResponse } =
  dashboardCollectionService;
```

and in the object passed to `registerApiRoutes`, replace the line `  getDashboardCollections,` (just below `  parseDashboardPagination,`) with `  getDashboardCollection,`. Check that nothing else used the old name: `git grep -n "getDashboardCollections" -- server/src` must list only `dashboardCollectionService.js`.

```bash
npm -w server exec vitest run src/routes/dashboard/__tests__/dashboardReadRoutes.test.js src/services/dashboard/ > "$SCRATCH/s3c-green.txt" 2>&1; echo "exit=$?"; grep -E "Test Files|Tests " "$SCRATCH/s3c-green.txt"
```

Expected: `exit=0`, 2 files passed (the new route test's 14 and `dashboardDataBuildersService.test.js`). Then, with Postgres up, the integration suite that drives these routes through the real app:

```bash
npm -w server exec vitest run src/routes/dashboard/__tests__/collectionReads.integration.test.js > "$SCRATCH/s3c-int.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/s3c-int.txt"
```

Expected: `exit=0`, every test passed. A missed rename in `index.js` shows here as a 500.

- [ ] **Step 5: Comments made true**

- `dashboardCollectionService.js`: the header and the factory summary as written in Step 3, and the comments on the three loaders. The comment "All three pages load at once, even for a route that answers with one." is gone with the code it described.
- `registerDashboardReadRoutes.js`: the comment above the paginated routes now says only that collection is read. Its header and summary stay true.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/dashboard/dashboardCollectionService.js server/src/routes/dashboard/registerDashboardReadRoutes.js server/src/index.js server/src/routes/dashboard/__tests__/dashboardReadRoutes.test.js
git commit -F - <<'EOF'
fix(dashboard): a paginated route reads only its own collection

The workout-session, meal-log and progress-metric routes each loaded
all three collections, a findMany and a count apiece, to answer with
one. They now call getDashboardCollection, which loads one; the full
dashboard still loads all three. Both share one page loader and one
table of sort fields. The response bodies are unchanged.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 7: Mutation check**

Write `$SCRATCH/s3c-mutants.json` with the Write tool:

```json
[
  {
    "name": "the one-collection loader reads all three again",
    "tests": "src/routes/dashboard/__tests__/dashboardReadRoutes.test.js",
    "edits": [
      {
        "file": "server/src/services/dashboard/dashboardCollectionService.js",
        "find": "    return loadPage(collection, userId, pagination);",
        "text": "    return (await getDashboardCollections(user, { [collection]: pagination }))[collection];"
      }
    ]
  },
  {
    "name": "meal logs ordered by the wrong field",
    "tests": "src/routes/dashboard/__tests__/dashboardReadRoutes.test.js",
    "edits": [
      {
        "file": "server/src/services/dashboard/dashboardCollectionService.js",
        "find": "  mealLogs: \"loggedAt\",",
        "text": "  mealLogs: \"createdAt\","
      }
    ]
  },
  {
    "name": "the full dashboard skips a collection",
    "tests": "src/routes/dashboard/__tests__/dashboardReadRoutes.test.js",
    "edits": [
      {
        "file": "server/src/services/dashboard/dashboardCollectionService.js",
        "find": "      loadPage(\"mealLogs\", userId, pagination.mealLogs),",
        "text": "      emptyPage(),"
      }
    ]
  },
  {
    "name": "a page ignores the caller's pagination",
    "tests": "src/routes/dashboard/__tests__/dashboardReadRoutes.test.js",
    "edits": [
      {
        "file": "server/src/services/dashboard/dashboardCollectionService.js",
        "find": "    const { limit, offset } = { ...parseDashboardPagination({}, defaultLimit), ...pagination };",
        "text": "    const { limit, offset } = parseDashboardPagination({}, defaultLimit);"
      }
    ]
  }
]
```

```bash
node "$TOOLS/run-mutants.mjs" "$SCRATCH/s3c-mutants.json" > "$SCRATCH/s3c-mutants.txt" 2>&1; echo "mutants exit=$?"; cat "$SCRATCH/s3c-mutants.txt"; git status --short
```

Expected: `mutants exit=0`, all four `caught`, `git status --short` empty. All four were caught in the scratch run.

- [ ] **Step 8: Coverage, exact**

Run the exact-coverage block from Conventions.

| Added                                                           | Covered by                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `emptyPage` (function)                                          | both no-id tests                                                                              |
| `loadPage` (function; its default parameter, 1 branch)          | the paginated tests (pagination passed) and `still reads all three collections` (none passed) |
| `getDashboardCollection` (function; `if (!userId)`, 2 branches) | `reads only its own collection` and the paginated no-id test                                  |
| `COLLECTION_SORT_FIELDS` (1 statement)                          | module load                                                                                   |

Removed: the three per-collection pagination constants and their `pagination.x || {}` fallbacks (six branch operands), and the three inline empty pages. Newly covered: the six route statements and `getDashboardCollections`' empty-user arm named in Step 2.

Measured in a scratch copy with the new test alone: `dashboardCollectionService.js` 34/35 statements, 17/18 branches, 9/9 functions, 32/32 lines (the one gap is `stripUserIdField`'s non-object guard at line 35 on `main`, which no Prisma row reaches); `registerDashboardReadRoutes.js` 31/31, 6/6, 5/5, 28/28. Against `main`'s full-suite figures for the two files (25/27, 19/21, 6/6, 25/26 and 28/34, 4/6, 5/5, 27/31) that is about +7.3 statements, +2.6 branches, +0.1 functions and +5.1 lines of slack.

- [ ] **Step 9: Gates, push, PR**

Run the gates and the extra checks from Conventions. Then:

```bash
git push -u origin fix/dashboard-collection-scoped-reads
gh pr create --base main --title "fix(dashboard): a paginated route reads only its own collection" --body-file "$SCRATCH/pr-s3c.md"
gh pr checks --watch
```

`pr-s3c.md` covers the six queries per route on `main` and the two after, the shared loader, the unchanged response bodies, the integration run, the gate results and the `floor-check` lines, and ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

- [ ] **Step 10: Review, then merge.**

---

### Task S4: `authFailures` in the metrics, the CSRF reissue pinned, and a true test-setup header

Three small things, one PR, three commits so the comment-only one can be proven alone.

- **`metrics.authFailures`** is incremented on every failed password check (`authRoutes.js:157`, `:163`, `:209`, `:262`) and initialised in `metricsService.js:37`, but `/api/metrics` never reports it, and `authRoutes.js:12-13` says "which nothing reports at present". Default #7: expose it. `docs/deploy-runbook.md:149` and `render.yaml:104` already say `/api/metrics` reports `authFailures`; this makes them true.
- **The CSRF reissue.** Sign-up and sign-in each set a fresh CSRF token (`authRoutes.js:131` and `:186` on `74de371`). `git log -S"setCsrfCookie(res, crypto.randomBytes(24)"` finds two commits: `7f145e5` ("argon2id conversion", 2026-03-02), which added the CSRF check itself in the same change, and `9804f04` ("refactor + integration tests", the same day), which moved the routes out of `index.js`. Neither message, nor any comment, plan or spec, gives a reason. So the comment says what the code does, and invents none. The client reads the cookie before every write (`client/src/app/hooks/useApiClient.js:24-29` and `:55-61`), which is what makes the replacement take effect, and the comment says that too, because it is checked. No test pins the replacement today: a mutant that keeps the signed-out token when one is sent survives the whole of `authRoutes.test.js` on `main` (measured in a scratch copy), because no test sends one.
- **`server/vitest.setup.js`'s header** says "Twelve call sites across eight test files". On `74de371`, `git grep -n "deleteMany({})" -- server/src` lists 12 call sites in 10 files. Following CLAUDE.md, the header names the command that lists them instead of a count. Two of its paragraphs are also history ("the suite had no setupFiles", "which is what this branch was built for"), which SOP rule 4 asks to rewrite in the present tense now that the file is being edited. That rewrite is a decision this plan makes; the PR names it.

**Files:**

- Modify: `server/vitest.setup.js` (the comment, lines 5-27)
- Modify: `server/src/routes/authRoutes.js` (the two `setCsrfCookie` lines, 131 and 186 on `74de371`; the summary, 12-13)
- Modify: `server/src/routes/systemRoutes.js` (the comment above `metricsGuard`, 113-114 on `74de371`; the payload, 156. S1 adds eight lines above both)
- Test: `server/src/routes/__tests__/authRoutes.test.js` (before `remembers the session by default` and before `remembers the session when the field is omitted`, lines 273 and 447 on `74de371`)
- Test: `server/src/routes/__tests__/systemRoutes.test.js` (before `allows a request carrying the right token`, line 60)

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/auth-metrics-and-csrf-notes origin/main
```

- [ ] **Step 2: The test-setup header (comment only)**

In `server/vitest.setup.js`, replace lines 5-27 (the `/** ... */` comment below `dotenv.config`) with:

```js
/**
 * Refuses to run the server suite against anything but a local database.
 *
 * Several suites run `prisma.appUser.deleteMany({})` with no `where` -- an
 * unscoped truncate of the account table; `git grep -n "deleteMany({})" --
 * server/src` lists them. Every AppUser relation carries `onDelete: Cascade`,
 * so each one also removes that account's workout sessions, meal logs, progress
 * metrics, calorie entries, generated plans and saved exercises. That is correct
 * for a disposable local database and catastrophic anywhere else.
 *
 * `prisma.js` resolves its connection from `dotenv.config()` and
 * `process.env.DATABASE_URL` -- the same file, resolved the same way, in tests
 * as in production -- and this is the only check on where that URL points. A
 * `server/.env` holding a staging or production URL would otherwise let
 * `npm test` delete every account in it, and a real DATABASE_URL first appears
 * in someone's `server/.env` exactly when they prepare a deployment.
 *
 * This turns that silent catastrophe into a startup error. It deliberately has
 * no escape hatch: an env var to bypass it would be set by the same person, in
 * the same file, under the same time pressure that causes the mistake.
 */
```

"The only check" was verified on `74de371`: `server/vitest.config.js:19` names this file as the suite's only `setupFiles` entry, and nothing in `server/src/db` checks the host. The file is outside the header ratchet's scope (SOP rule 1), so its position below the imports stays.

Prove it is comment-only, then commit it alone:

```bash
node "$TOOLS/same-code.mjs" D:/ai-workout > "$SCRATCH/s4-same.txt" 2>&1; echo "same-code exit=$?"; cat "$SCRATCH/s4-same.txt"
git add server/vitest.setup.js
git commit -F - <<'EOF'
docs(test-setup): name where the truncating suites are listed

The header counted the deleteMany({}) call sites, and the count had
drifted: it named twelve sites in eight files. It now gives the command
that lists them, and its history is rewritten in the present tense.
Comment only.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `same-code exit=0`, with `server/vitest.setup.js` reported the same.

- [ ] **Step 3: The CSRF reissue test**

In `server/src/routes/__tests__/authRoutes.test.js`, add before `remembers the session by default` (in the signup describe):

```js
// The browser arrives holding the token ensureCsrfTokenCookie issued while it
// was signed out. Signup replaces it rather than keeping it.
test("issues a new csrf token rather than keeping the one it was sent", async () => {
  await request(buildApp())
    .post("/api/auth/signup")
    .set("Cookie", "csrfToken=signed-out-token")
    .send(signupBody());

  expect(cookieCalls.csrf).toHaveLength(1);
  expect(cookieCalls.csrf[0]).toMatch(/^[0-9a-f]{48}$/);
  expect(cookieCalls.csrf[0]).not.toBe("signed-out-token");
});
```

and before `remembers the session when the field is omitted` (in the login describe):

```js
test("issues a new csrf token rather than keeping the one it was sent", async () => {
  const app = buildApp();
  await registered(app);

  await request(app)
    .post("/api/auth/login")
    .set("Cookie", "csrfToken=signed-out-token")
    .send({ email: "person@example.com", password: "StrongPass123!" })
    .expect(200);

  expect(cookieCalls.csrf).toHaveLength(1);
  expect(cookieCalls.csrf[0]).toMatch(/^[0-9a-f]{48}$/);
  expect(cookieCalls.csrf[0]).not.toBe("signed-out-token");
});
```

These pass on `main`, by design: there is no bug, only an unpinned behaviour. The proof that they bite is Step 7's mutants, which survive `main`'s suite and are caught by this one.

- [ ] **Step 4: The CSRF comments**

In `server/src/routes/authRoutes.js`, in signup, replace:

```js
      setSessionCookie(res, token, rememberMe);
      setCsrfCookie(res, crypto.randomBytes(24).toString("hex"));
      res.json({
        user: {
          id: newUser.id,
```

with:

```js
      setSessionCookie(res, token, rememberMe);
      // A new CSRF token replaces the one the browser held while signed out.
      // useApiClient reads this cookie before every write, so the client's
      // next request sends the new token.
      setCsrfCookie(res, crypto.randomBytes(24).toString("hex"));
      res.json({
        user: {
          id: newUser.id,
```

and in login, replace:

```js
      setSessionCookie(res, token, rememberMe);
      setCsrfCookie(res, crypto.randomBytes(24).toString("hex"));
      res.json({
        user: {
          id: user.id,
```

with:

```js
      setSessionCookie(res, token, rememberMe);
      // Replaces the signed-out CSRF token, as signup does.
      setCsrfCookie(res, crypto.randomBytes(24).toString("hex"));
      res.json({
        user: {
          id: user.id,
```

Run the auth route suite, then commit:

```bash
npm -w server exec vitest run src/routes/__tests__/authRoutes.test.js > "$SCRATCH/s4-auth.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/s4-auth.txt"
git add server/src/routes/authRoutes.js server/src/routes/__tests__/authRoutes.test.js
git commit -F - <<'EOF'
test(auth): pin the CSRF token reissued at sign-up and sign-in

Both routes replace the token the browser held while signed out, and no
test said so: keeping the old token when one is sent passed the whole
suite. The tests send one and require a new one. The comments say what
the code does; no reason for the reissue is recorded anywhere, so none
is given.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`, every test passed.

- [ ] **Step 5: The `authFailures` test**

In `server/src/routes/__tests__/systemRoutes.test.js`, add before `allows a request carrying the right token` (line 60):

```js
// authRoutes.js counts every failed password check; this is where the count
// is read.
test("reports the failed password checks", async () => {
  const response = await request(buildApp({ metricsToken: "", isProduction: false })).get(
    "/api/metrics"
  );

  expect(response.body.authFailures).toBe(3);
});
```

`buildApp` in this file already seeds `authFailures: 3`, and the production test above it already asserts the closed endpoint leaks no `authFailures`.

```bash
npm -w server exec vitest run src/routes/__tests__/systemRoutes.test.js > "$SCRATCH/s4-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |AssertionError" "$SCRATCH/s4-red.txt"
```

Expected: `exit=1`, one failure, `expected undefined to be 3`.

- [ ] **Step 6: Expose it**

In `server/src/routes/systemRoutes.js`, in the `/api/metrics` payload, replace `      rateLimited: metrics.rateLimited,` with:

```js
      rateLimited: metrics.rateLimited,
      authFailures: metrics.authFailures,
```

Replace the first two lines of the comment above `metricsGuard`:

```js
// The payload maps the route surface (per-route latency and request totals)
// and counts rate-limited requests live, so it is not for the open internet.
```

with:

```js
// The payload maps the route surface (per-route latency and request totals)
// and counts rate-limited requests and failed password checks live, so it is
// not for the open internet.
```

In `server/src/routes/authRoutes.js`'s summary, replace:

```js
 * failed password check counts toward `metrics.authFailures`, which nothing
 * reports at present. Signup and login both start a session that defaults to
```

with:

```js
 * failed password check counts toward `metrics.authFailures`, which
 * /api/metrics reports. Signup and login both start a session that defaults to
```

Re-run Step 5's command. Expected: `exit=0`. Then commit:

```bash
git add server/src/routes/systemRoutes.js server/src/routes/authRoutes.js server/src/routes/__tests__/systemRoutes.test.js
git commit -F - <<'EOF'
feat(metrics): report authFailures in /api/metrics

Every failed password check was counted and nothing reported the count.
The metrics payload now carries it, behind the same guard as the rest,
which is what the runbook and render.yaml already said it did.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 7: Mutation check**

Write `$SCRATCH/s4-mutants.json` with the Write tool:

```json
[
  {
    "name": "signup keeps the signed-out csrf token",
    "tests": "src/routes/__tests__/authRoutes.test.js",
    "edits": [
      {
        "file": "server/src/routes/authRoutes.js",
        "find": "      setCsrfCookie(res, crypto.randomBytes(24).toString(\"hex\"));\n      res.json({\n        user: {\n          id: newUser.id,",
        "text": "      setCsrfCookie(\n        res,\n        parseCookies(req.headers.cookie || \"\").csrfToken || crypto.randomBytes(24).toString(\"hex\")\n      );\n      res.json({\n        user: {\n          id: newUser.id,"
      }
    ]
  },
  {
    "name": "login keeps the signed-out csrf token",
    "tests": "src/routes/__tests__/authRoutes.test.js",
    "edits": [
      {
        "file": "server/src/routes/authRoutes.js",
        "find": "      setCsrfCookie(res, crypto.randomBytes(24).toString(\"hex\"));\n      res.json({\n        user: {\n          id: user.id,",
        "text": "      setCsrfCookie(\n        res,\n        parseCookies(req.headers.cookie || \"\").csrfToken || crypto.randomBytes(24).toString(\"hex\")\n      );\n      res.json({\n        user: {\n          id: user.id,"
      }
    ]
  },
  {
    "name": "metrics payload drops authFailures",
    "tests": "src/routes/__tests__/systemRoutes.test.js",
    "edits": [
      {
        "file": "server/src/routes/systemRoutes.js",
        "find": "      authFailures: metrics.authFailures,\n",
        "text": ""
      }
    ]
  }
]
```

```bash
node "$TOOLS/run-mutants.mjs" "$SCRATCH/s4-mutants.json" > "$SCRATCH/s4-mutants.txt" 2>&1; echo "mutants exit=$?"; cat "$SCRATCH/s4-mutants.txt"; git status --short
```

Expected: `mutants exit=0`, all three `caught`, `git status --short` empty.

For the PR body, show the gap the CSRF tests close. Write the first two entries of the list above into `$SCRATCH/s4-csrf-mutants.json` with the Write tool; their `find` strings match `main` as well, because the new comments sit above the line they replace. Then:

```bash
git switch --detach origin/main
node "$TOOLS/run-mutants.mjs" "$SCRATCH/s4-csrf-mutants.json" > "$SCRATCH/s4-csrf-main.txt" 2>&1; echo "mutants exit=$?"; cat "$SCRATCH/s4-csrf-main.txt"
git switch fix/auth-metrics-and-csrf-notes
```

Expected on `main`: `mutants exit=1`, both `SURVIVED`. That is the point: `main`'s suite cannot tell a reissued token from a kept one. In the scratch copy of `74de371` both survived `main`'s suite and both were caught by this one.

The metrics mutant deletes the new line rather than adding `authFailures: undefined` above it. An object literal keeps the last of two equal keys, so an added line above the real one would change nothing and "survive", which is a broken mutant, not a weak test. This happened while writing the plan.

- [ ] **Step 8: Coverage, exact**

Run the exact-coverage block from Conventions. A property in an object literal adds no statement, branch or function, `vitest.setup.js` is outside the measured `src/**`, and the rest of the PR is comments and tests, so all four counts must equal those of the `main` this branch started from.

- [ ] **Step 9: Gates, push, PR**

Run the gates and the extra checks from Conventions. Then:

```bash
git push -u origin fix/auth-metrics-and-csrf-notes
gh pr create --base main --title "feat(metrics): authFailures in /api/metrics; pin the CSRF reissue; true test-setup header" --body-file "$SCRATCH/pr-s4.md"
gh pr checks --watch
```

`pr-s4.md` covers:

- `authFailures`, default #7, and the two records it makes true;
- the CSRF history (`7f145e5`, `9804f04`, no reason recorded), the mutants that survived `main`, and that the comments describe without explaining;
- the recount (12 sites in 10 files), the decision to name the command instead of the number, and the present-tense rewrite of the header's history;
- the `same-code` result for the comment-only commit, the unchanged counts, and the gate results;
- the trailer `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

- [ ] **Step 10: Review, then merge.**

---

### Task S5: The server floor PR

Modelled on Phase 2's Task 6 and PR #204. It starts only after S4 has merged and the CI run on `main` has gone green. It touches one file.

**Files:**

- Modify: `server/vitest.config.js` (the measurement comment, lines 28-33, and `thresholds`, lines 34-39)

- [ ] **Step 1: Branch and measure `main`**

```bash
git fetch origin && git switch -c chore/phase-3-server-floors origin/main
npm ci > "$SCRATCH/ci-floor.txt" 2>&1; echo "npm ci exit=$?"
npm run prisma:generate -w server > "$SCRATCH/prisma-floor.txt" 2>&1; echo "prisma exit=$?"
npm run test:coverage -w server -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cov-floor.txt" 2>&1; echo "server coverage exit=$?"; grep -E "Tests  " "$SCRATCH/cov-floor.txt"
```

Postgres must be up. Then compute each metric's exact value and its one-decimal truncation from the counts, never from the rounded text table:

```bash
node -e '
const s = require("D:/ai-workout/server/coverage/coverage-summary.json").total;
for (const m of ["statements", "branches", "functions", "lines"]) {
  const { covered, total } = s[m];
  console.log(m.padEnd(10), `${covered}/${total}`, (100 * covered / total).toFixed(4), "truncated", Math.floor(1000 * covered / total) / 10);
}' > "$SCRATCH/floors.txt" 2>&1; echo "exit=$?"; cat "$SCRATCH/floors.txt"
```

- [ ] **Step 2: Read the CI-versus-local branch pair**

```bash
gh run list --branch main --workflow CI --limit 1 --json databaseId,headSha,conclusion > "$SCRATCH/ci-run.json"; cat "$SCRATCH/ci-run.json"
git rev-parse HEAD
```

The run's `headSha` must equal `HEAD` and its `conclusion` must be `success`; if not, wait for the run on this commit. Then:

```bash
gh run view <databaseId> --log > "$SCRATCH/ci-main.log" 2>&1; echo "log exit=$?"
grep -E "All files" "$SCRATCH/ci-main.log" | sed 's/\x1b\[[0-9;]*m//g' | cut -c1-200
```

Each `Tests (Node 22)` and `Tests (Node 24)` job prints two `All files` lines: the client's first, the server's second. On `74de371` the server lines read `94.5 | 87.4 | 95.56 | 95.75` on both. Record the server branch figure for each Node version, and whether the other three match the local measurement.

- [ ] **Step 3: Raise each floor whose truncation went up**

For each metric the new floor is its truncated value from Step 1, set only where that is higher than today's floor (94.5 / 86.9 / 95.5 / 95.7). Never lower one. The branch floor follows the local figure, the lower of the two, as the config comment says.

Then rewrite the measurement comment in `server/vitest.config.js` (lines 28-33), keeping its sentence on why the floors use one decimal, so it names the date, the four measured figures to two decimals, and the CI pair:

```js
// A ratchet, not a target -- see the note in client/vite.config.js.
// Measured YYYY-MM-DD (SS.SS / BB.BB / FF.FF / LL.LL), floored one
// decimal below. Branches read higher in CI than locally (CC.CC against
// BB.BB on YYYY-MM-DD), so the floor follows the local figure, the lower
// of the two. One decimal rather than whole percent, which would leave
// up to a point of measured coverage free to slip without tripping
// anything.
```

with every `YYYY-MM-DD`, `SS.SS`, `BB.BB`, `FF.FF`, `LL.LL` and `CC.CC` replaced by the values from Steps 1 and 2 (`toFixed(2)` of the exact percentages). If CI and local agree on branches, replace the CI sentence with "CI and local read the same on YYYY-MM-DD." rather than keeping a pair that no longer exists.

If no truncated value went up, open no PR. Say so in the report to the coordinator, with the Step 1 figures, and stop here.

- [ ] **Step 4: Prove it**

Re-run the exact-coverage block from Conventions. `floor-check` must exit `0`, and its slack lines are the PR body's headroom table. Then run the gates and the extra checks from Conventions.

- [ ] **Step 5: Commit, push, PR**

```bash
git add server/vitest.config.js
git commit -m "chore(coverage): raise the server floors after Phase 3" -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
git push -u origin chore/phase-3-server-floors
gh pr create --base main --title "chore(coverage): raise the server floors after Phase 3" --body-file "$SCRATCH/pr-s5.md"
gh pr checks --watch
```

`pr-s5.md` follows #204's shape:

- one paragraph: which PRs Phase 3's server track merged (S1, S2, S3a, S3b, S3c, S4, with their numbers), that only the server floors move, and that each floor is the measured value truncated to one decimal, raised only where that is higher;
- a table per metric: covered / total, measured to four decimals, floor before, floor after (bold where it moved);
- the test count, from 1127 at the phase's start;
- the CI-versus-local branch pair and the run id it came from;
- a headroom table from `floor-check`: for each metric, covered and the least the new floor accepts, and how many new uncovered items each metric can take;
- the verification list (`test:coverage`, `floor-check`, lint, format:check, and the other gates), each with its exit code;
- the trailer `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

- [ ] **Step 6: Review, then merge.** The spec review checks that no floor went down and that each raised floor equals its truncation (spec rule 3).

---

## Not in this phase

Each is left alone here on purpose, with where it goes.

| Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Where it goes                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Merging #192's `parsePositiveInt` with `index.js`'s private `toPositiveInt` (`index.js:262`). It lives in `server/src/routes/generateRoutes.js:31`, not in `dashboardDataBuildersService.js` as the Phase 2 plan said                                                                                                                                                                                                                                                                              | Phase 5, deletions                                                         |
| The concurrent same-day meal-save race in `mealLogRepository.saveMealLogWithDailySync`                                                                                                                                                                                                                                                                                                                                                                                                             | Owner decision                                                             |
| The Postgres pool in `server/src/db/postgres.js` has no `'error'` listener                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner decision                                                             |
| A plan cut off at the token cap is served, because `finishReason` is never read: `generateRoutes.js:310` reads only `result.text`                                                                                                                                                                                                                                                                                                                                                                  | Owner decision                                                             |
| **A Redis that accepts commands and never answers** (a paused container, a half-open connection) is not bounded by S1's command timeout: node-redis drops the timer once a command is written (`@redis/client/dist/lib/client/commands-queue.js:410-436`), and the probe saw a written `SET` still pending at 8 s. S1's boot check records it as `INFO`. The fix would be to wrap the session commands in `sessionService`'s existing `withTimeout`, or to set `pingInterval` with `socketTimeout` | Owner decision                                                             |
| `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_TIMEOUT_MS` and `GEMINI_MAX_PLAN_CHARS`, read per request through `parsePositiveInt` (`generateRoutes.js:264-272`), are not in `NUMERIC_VARS`: the gap S3a closes for the credential limiter, again                                                                                                                                                                                                                                                            | Owner decision; it would be a PR shaped like S3a                           |
| `NUMERIC_VARS` accepts a non-integer such as `1500.5` (`Number.isFinite`), which every `toPositiveInt` reader then discards for its default, the case its own comment calls worse than no floor                                                                                                                                                                                                                                                                                                    | Owner decision                                                             |
| After S1, a sign-up whose session cannot be stored leaves the account behind: it signs in once the store is back, and a retried sign-up answers 409                                                                                                                                                                                                                                                                                                                                                | Owner decision (creating the session first would change the route's order) |
| After S1, a failed sign-out clears this browser's cookies but leaves the session valid in Redis until its TTL (`SESSION_TTL_MS`, `index.js:256`)                                                                                                                                                                                                                                                                                                                                                   | Owner decision                                                             |
| `attachOptionalUser` treats a session store outage as anonymous, so `/api/generate` during an outage runs under the anonymous quota and saves nothing. Unchanged by S1                                                                                                                                                                                                                                                                                                                             | Owner decision                                                             |
| On load, the client treats any non-OK `/api/auth/me` as signed out (`App.jsx`'s session check), so during an outage a reload shows the signed-out page although the cookie is intact                                                                                                                                                                                                                                                                                                               | Client track, owner decision                                               |
| Two guards no input reaches: `tokensMatch`'s empty-token check (`sessionService.js:78`), because `requireCsrfToken` rejects an empty token first; and `stripUserIdField`'s non-object guard (`dashboardCollectionService.js:35`), because the repository returns mapped rows                                                                                                                                                                                                                       | Phase 5, deletions                                                         |
| Provenance in test comments that this phase does not otherwise touch: `collectionReads.integration.test.js:6-11` ("before loadCollectionPage is migrated off the Mongo compatibility shim", "the way the plan originally assumed"), and `authRoutes.test.js`'s "Task 4b" and "Task 5" notes                                                                                                                                                                                                        | Phase 6, records, or a later readability sweep                             |
| `README.md:10` and CLAUDE.md line 110 say sessions have an "in-memory fallback". After S1 that is true only for Redis unreachable at startup                                                                                                                                                                                                                                                                                                                                                       | Phase 6, R1 and R3                                                         |
