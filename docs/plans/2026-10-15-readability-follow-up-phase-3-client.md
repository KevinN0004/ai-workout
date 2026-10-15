# Readability follow-up: Phase 3 client track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the client column of Phase 3: blocked storage no longer blanks the app, a blank weight is no reading, a save cannot reach the next account, older logs page in, four form and parsing bugs and five date, bounds, locale, routing and label fixes, then raise the client floors once.

**Architecture:** Phase 3, client column, of `docs/specs/2026-10-10-readability-follow-up-design.md`. Every task is a new branch from current `origin/main` and one PR, merged one at a time on the client track while the server track runs beside it. Each fix is test-first and covers every statement, branch and function it adds, because client statements and functions have no headroom. No fix PR edits a floor; C6 raises them once. C3 and C5 are split into separate PRs (C3a–C3d, C5a–C5e), and each task says why.

**Tech Stack:** React 19, Vite 8, Vitest 5 with v8 coverage, jsdom 30, Testing Library, Playwright (E2E and axe), GitHub (gh CLI).

**Baseline (`main` at `74de371`, measured 2026-10-10):**

| Side   | Tests | Statements          | Branches            | Functions         | Lines               |
| ------ | ----- | ------------------- | ------------------- | ----------------- | ------------------- |
| Client | 2311  | 98.72 (4783 / 4845) | 93.73 (3158 / 3369) | 98.79 (986 / 998) | 99.36 (4371 / 4399) |

The client floors are 98.7 / 93.7 / 98.7 / 99.3 (`client/vite.config.js:69-74`). Headroom, from the counts:

| Metric     | Covered | Least the floor accepts         | Spare |
| ---------- | ------- | ------------------------------- | ----- |
| Statements | 4783    | 4783 (98.7% of 4845 is 4782.02) | 0     |
| Branches   | 3158    | 3157 (93.7% of 3369 is 3156.75) | 1     |
| Functions  | 986     | 986 (98.7% of 998 is 985.03)    | 0     |
| Lines      | 4371    | 4369 (99.3% of 4399 is 4368.21) | 2     |

One new uncovered statement or function fails CI. So every task below lists each statement, branch and function it adds and the test that runs it.

---

## Conventions

- **Shell.** Git Bash, from `D:\ai-workout`. Set `SCRATCH` to any folder outside the repo, and redirect command output there.
- **Exit codes.** Never gate on a pipe: redirect output to a file, then read `$?`.
- **Secrets.** Never read, stat or print `server/.env`.
- **Server suite.** It needs Postgres (`npm run postgres:local:start -w server`) and a generated Prisma client (`npm run prisma:generate -w server`) after any `npm ci`. The server track runs the same suite against the same database, and both suites clear the same tables, so never run `test:coverage` or `test:e2e` while the server track is running its own. Agree a turn with it.
- **Take `main`: every task is a NEW branch.** Start each task with `git fetch origin && git switch -c <branch> origin/main`. Open the PR as a draft. If `main` moves before the PR is marked ready (a merge on either track), take it by merging, never by rebasing: `git fetch origin && git merge origin/main`. That avoids force-pushing, and the push gives GitHub a fresh merge ref. Then re-run `test:coverage` and mark it ready with `gh pr ready`.
- **Resolving a conflict.** Keep the task's code change. Keep `main`'s comments wherever they still describe the code. Rewrite any comment that the change makes untrue, following `docs/code-readability-sop.md`: present tense, every claim checked against the code, no numbers copied from elsewhere. After resolving, `git diff origin/main` must show only the task's change and the comment rewrites it forces.
- **Line numbers** are on `74de371`. An earlier task in this plan shifts some of them, so every edit is anchored by the code it quotes, and the number is only a guide.
- **Formatting.** Code in this plan is written to Prettier's settings (`.prettierrc.yaml`, width 100), but run `npx prettier --write <the files you changed>` before the gates, and re-read any edit Prettier reflows.
- **The gates on every PR.** Each one is redirected to a file, and its exit code must be `0`.

  ```bash
  npm run lint > "$SCRATCH/lint.txt" 2>&1; echo "lint exit=$?"
  npm run format:check > "$SCRATCH/fmt.txt" 2>&1; echo "format:check exit=$?"
  npm run knip > "$SCRATCH/knip.txt" 2>&1; echo "knip exit=$?"
  npm run build > "$SCRATCH/build.txt" 2>&1; echo "build exit=$?"
  npm run test:coverage > "$SCRATCH/cov.txt" 2>&1; echo "test:coverage exit=$?"; grep -E "All files|Tests  " "$SCRATCH/cov.txt"
  npm run test:e2e > "$SCRATCH/e2e.txt" 2>&1; echo "test:e2e exit=$?"; tail -3 "$SCRATCH/e2e.txt"
  ```

  Every task here also runs `npm run test:scripts > "$SCRATCH/scripts.txt" 2>&1; echo "test:scripts exit=$?"`. CI runs it in its lint job, and it holds the header ratchet, which fails on a new source file without a header. The E2E suite runs against the built bundle, which is why `build` comes before it.

- **Exact coverage.** The text table rounds. When a task needs to know whether it kept the headroom, read the counts: `npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cc.txt" 2>&1`, then `node -e "const t=require('./client/coverage/coverage-summary.json').total; for (const k of ['statements','branches','functions','lines']) console.log(k, t[k].covered + '/' + t[k].total, (100*t[k].covered/t[k].total).toFixed(4))"`.
- **Clock and zone.** A test whose branches follow `new Date()` pins the clock with `vi.useFakeTimers()` and `vi.setSystemTime`. A test about a calendar date also pins the zone. Assigning `TZ` in the shell does not reach Node on this machine, as CLAUDE.md says. Assigning `process.env.TZ` inside the test process does: Node applies it at once. That was verified on 2026-10-10 in a Vitest jsdom worker on this machine, where the hour of the epoch read 9 under `Asia/Tokyo`, 0 under `UTC` and 16 under `America/Los_Angeles`. So a date test:
  - assigns `process.env.TZ`;
  - sets the system time after that, because a local-time `new Date(y, m, d, h)` built before the change is a different instant;
  - restores the zone in `afterEach` by assigning the name captured at load, `Intl.DateTimeFormat().resolvedOptions().timeZone`. `delete process.env.TZ` does not restore it.

  A test pinned to `America/Los_Angeles` discriminates in CI (UTC) and locally alike.

- **Mutation checks.** Write this tool once, with the Write tool, to `$SCRATCH/mutate.mjs`. It applies edits from a JSON file and fails loudly when an edit did not apply, so a missed edit can never read as "the test still passed". Write each edits file with the Write tool too, never a heredoc or an argument: Git Bash rewrites arguments, and a heredoc collapses backslashes.

  ```js
  /**
   * Applies a list of edits read from a JSON file, and exits 2 if any edit did
   * not apply. Usage: node mutate.mjs <edits.json>, run from the repo root.
   * edits.json: [{ "file": "...", "find": "...", "text": "..." }], first match.
   */
  import { readFileSync, writeFileSync } from "node:fs";

  const edits = JSON.parse(readFileSync(process.argv[2], "utf8"));
  for (const { file, find, text } of edits) {
    const src = readFileSync(file, "utf8");
    const at = src.indexOf(find);
    if (at === -1) {
      console.error(`MUTATION NOT APPLIED: ${JSON.stringify(find)} not found in ${file}`);
      process.exit(2);
    }
    const next = src.slice(0, at) + text + src.slice(at + find.length);
    writeFileSync(file, next);
    if (readFileSync(file, "utf8") === src) {
      console.error(`MUTATION NOT APPLIED: ${file} is unchanged`);
      process.exit(2);
    }
    console.log(`mutated ${file}`);
  }
  ```

  Run mutations after the fix is committed. Apply one edits file, run the named test file, expect it to fail, then restore with `git checkout -- <files>` and confirm `git status --porcelain` prints nothing. Several entries with the same `find` replace successive matches, which is how one edits file mutates every copy of a guard.

- **Visible text.** When a task changes text a user can see, grep `e2e/` for the old and new strings before the gates (`git grep -n "<text>" e2e/`). The E2E suite includes the axe scan (`e2e/a11y.spec.js`).
- **Floors.** No fix PR edits a floor. Task C6 raises them once.
- **Merging.** A PR merges only after its spec and quality reviews pass, its checks are green, and it shows `mergeStateStatus` `CLEAN`. Merge with **"Create a merge commit"** (`gh pr merge <n> --merge`), then wait for the CI run on `main` to go green before starting the next task.
- **Trailers.** Every commit ends with `Co-Authored-By: claude-flow <ruv@ruv.net>`. Every PR body ends with `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)`.

---

### Task C1: Survive blocked site data (cache helpers and a root error boundary)

When a browser blocks site data while cookies still work, reading the `window.localStorage` property throws a `SecurityError`. `cache.js` reads it in each helper's `if` guard, outside the `try`, at lines 23, 35 and 45. The cache effects in `useDashboardData.js` (lines 223, 235, 246 and 258) run as soon as a user is set, so the throw escapes one of them. There is no error boundary, so React removes the whole tree, and the page goes blank. The same throw in `deleteAccount` (`events.js:549`, `scopedCacheKeysToClear.forEach(removeJsonCache)`) comes after the server has already deleted the account and after `setUser(null)`. It skips `go("/")` and the `{ ok: true }` return, so the visitor is left on a signed-out dashboard header, and `SettingsAccountPanel`'s `await` rejects.

The fix reads storage inside each `try`. That alone fixes every path, `deleteAccount` included: `removeJsonCache` can no longer throw, so `events.js` needs no change, and a test pins it.

A hand-written root boundary is added as defence in depth: about 25 lines, not `react-error-boundary`, because the main chunk is about 486 kB against the 500 kB warning.

- **Where it lives.** `client/src/app/components/AppErrorBoundary.jsx`. CLAUDE.md's File Organization allows only `main.jsx` and `App.jsx` at `client/src` itself. `client/src/components/` is for code shared by more than one page or by another shared module. A page folder is a route. The boundary is none of those: main.jsx renders it once, around the whole app, so it is app-shell code. `client/src/app/components/` is where the shell's own components already live: App renders `PlannerSetupModal` and `GeneratedPlanModal` from there.
- **Why it calls `reportError`.** In React 19, an error a boundary catches goes to `onCaughtError`, which only logs it to the console (`defaultOnCaughtError` in react-dom 19.3.0). An uncaught one goes to `reportGlobalError`, which is how Sentry's global handler sees it today. Without the call, adding the boundary would hide every render crash from Sentry. `reportError` is a browser global, and ESLint's `globals.browser` knows it. jsdom 30 does not have it, so the tests stub it.

**Files:**

- Modify: `client/src/app/cache.js:1-53` (header, `readJsonCache`, `writeJsonCache`, `removeJsonCache`)
- Create: `client/src/app/components/AppErrorBoundary.jsx`
- Modify: `client/src/main.jsx:1-19`
- Test: `client/src/app/__tests__/cache.test.js` (new describe after line 107, before `describe("readCookie"` at 109)
- Test: `client/src/app/hooks/__tests__/useDashboardData.test.jsx` (inside `describe("cache"`, after the test at 199-210)
- Test: `client/src/app/__tests__/events.handlers.test.js` (inside `describe("scoped cache"`, after the test at 858-876)
- Create: `client/src/app/components/__tests__/AppErrorBoundary.test.jsx`
- Create: `client/src/__tests__/main.test.jsx`

**New statements, branches and functions, and what runs each:**

| Added                                                                                                                                                 | Run by                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cache.js`: no new statement or branch. Each guard loses its third operand, `!window.localStorage` (three covered arms go)                            | the existing cache tests                                                                                                                          |
| `AppErrorBoundary`: the `state` field, `getDerivedStateFromError`, `componentDidCatch` and `render` (3 functions, 6 statements, one `if` with 2 arms) | `AppErrorBoundary.test.jsx`: the children arm by "renders its children…", the fallback arm and both lifecycle methods by the throwing-child tests |
| `main.jsx`: no new statement. Its 2 existing statements, uncovered on `main`, become covered                                                          | `main.test.jsx`                                                                                                                                   |

Branches go from 3158/3369 to 3157/3368 (93.74%, still one to spare). Statements gain 8 covered, and functions gain 3.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-blocked-storage origin/main
```

- [ ] **Step 2: Write the failing cache tests**

In `client/src/app/__tests__/cache.test.js`, insert this between the end of `describe("removeJsonCache", …)` (line 107) and `describe("readCookie", …)` (line 109):

```js
// Blocking site data makes the localStorage property itself throw, before any
// getItem, setItem or removeItem can be tried. The spy is restored by the
// afterEach at the top of this file, before it clears storage.
const blockSiteData = () =>
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });

describe("when the browser blocks site data", () => {
  test("readJsonCache returns null", () => {
    blockSiteData();
    expect(readJsonCache("k")).toBeNull();
  });

  test("writeJsonCache does nothing", () => {
    blockSiteData();
    expect(() => writeJsonCache("k", { a: 1 })).not.toThrow();
  });

  test("removeJsonCache does nothing", () => {
    blockSiteData();
    expect(() => removeJsonCache("k")).not.toThrow();
  });
});
```

- [ ] **Step 3: Watch them fail**

```bash
npx vitest run src/app/__tests__/cache.test.js --root client > "$SCRATCH/c1-red1.txt" 2>&1; echo "exit=$?"; grep -E "✓|×|Tests " "$SCRATCH/c1-red1.txt" | tail -8
```

Expected: `exit=1`, with the three new tests failing on `SecurityError: The operation is insecure.`. The read test throws from `readJsonCache`. The write and remove tests fail with "expected [Function] to not throw an error". The getter throws inside each `if` guard, before the `try`.

- [ ] **Step 4: Write the failing caller tests**

In `client/src/app/hooks/__tests__/useDashboardData.test.jsx`, inside `describe("cache", …)`, after the test `"survives unparseable cached JSON"` (lines 199-210), add:

```js
test("still loads when the browser blocks site data", async () => {
  // Every cache effect reads window.localStorage as soon as there is a
  // user, and with site data blocked that read throws a SecurityError.
  // Restored here rather than by the beforeEach, which clears storage
  // before it restores mocks.
  const getter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  try {
    const dashboard = { workouts: [{ id: "w1" }], goals: {} };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ dashboard }))
    );

    const { result } = render({ weatherCacheKey: WEATHER_KEY, airCacheKey: AIR_KEY });

    await waitFor(() => expect(result.current.dashboard).toEqual(dashboard));
    expect(result.current.dashError).toBe("");
  } finally {
    getter.mockRestore();
  }
});
```

In `client/src/app/__tests__/events.handlers.test.js`, inside `describe("scoped cache", …)`, after the test `"deletion still succeeds when removeItem throws"` (lines 858-876), add:

```js
test("deletion still finishes when the browser blocks site data", async () => {
  // The server has already deleted the account by the time the cache is
  // cleared, so a throw here would leave the visitor on a signed-out
  // dashboard instead of home. Restored before this describe's afterEach,
  // which removes the keys through window.localStorage.
  const deps = clearDeps();
  const { handlers } = buildDeps({
    ...deps,
    apiFetch: vi.fn(async () => jsonResponse({ ok: true }))
  });
  const getter = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  });
  try {
    const result = await handlers.deleteAccount("old-pass");

    expect(result).toEqual({ ok: true });
    expect(deps.go).toHaveBeenCalledWith("/");
  } finally {
    getter.mockRestore();
  }
});
```

- [ ] **Step 5: Watch them fail**

```bash
npx vitest run src/app/hooks/__tests__/useDashboardData.test.jsx src/app/__tests__/events.handlers.test.js --root client > "$SCRATCH/c1-red2.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c1-red2.txt" | tail -8
```

Expected: `exit=1`, with exactly the two new tests failing:

- the hook test: `render()` throws `SecurityError: The operation is insecure.` from the dashboard restore effect, because React 19's `act` rethrows an effect's error. Vitest may also report an unhandled rejection of the same error, from the async loader's `readJsonCache` at `useDashboardData.js:278`;
- the deletion test: `deleteAccount` rejects with the same `SecurityError`, so `result` is never assigned.

- [ ] **Step 6: Read storage inside each `try`**

Replace lines 1-53 of `client/src/app/cache.js` (the header, and the three storage helpers with their summaries) with:

```js
/**
 * localStorage helpers for the per-account caches (dashboard, weather, air
 * quality), and the cookie reader useApiClient takes the CSRF token from. Any
 * storage failure is swallowed, reaching window.localStorage included, since a
 * cache that cannot be used only costs a page its head start.
 */

/**
 * The storage key for one account's copy of a cache, `prefix:scope`, scoped by
 * `userId`, else `email`, else "anonymous". The server's auth responses carry
 * `id` rather than `userId`, so for a signed-in user the scope is the email.
 */
export const buildScopedCacheKey = (prefix, user) => {
  const scope = user?.userId || user?.email || "anonymous";
  return `${prefix}:${scope}`;
};

/**
 * The parsed entry under `key`, or null when there is no key, no storage, no
 * entry, no valid JSON, or storage throws.
 */
export const readJsonCache = (key) => {
  if (!key || typeof window === "undefined") return null;
  try {
    // The property is read inside the try: with site data blocked, reading it
    // throws a SecurityError before getItem is reached.
    const raw = window.localStorage?.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Stores `value` as JSON under `key`; does nothing without a key or usable storage. */
export const writeJsonCache = (key, value) => {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked site data, a full quota or a private mode: the write is skipped.
  }
};

/** Deletes the entry under `key`, if storage is there to delete it from. */
export const removeJsonCache = (key) => {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(key);
  } catch {
    // Ignore a failed removal: deleteAccount calls this for each cache key
    // after the account is gone, and a throw would skip the rest of them and its
    // redirect home.
  }
};
```

`readCookie` (lines 55-74) is unchanged. The `?.` keeps the existing "localStorage is unavailable" tests passing: a getter that returns `undefined` short-circuits. Optional chaining is not counted as a branch: the coverage tool counts `if`, `?:`, `&&`, `||`, `??`, `switch` and default values only (checked in `ast-v8-to-istanbul`).

- [ ] **Step 7: Watch the storage tests pass**

```bash
npx vitest run src/app/__tests__/cache.test.js src/app/hooks/__tests__/useDashboardData.test.jsx src/app/__tests__/events.handlers.test.js --root client > "$SCRATCH/c1-green1.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c1-green1.txt"
```

Expected: `exit=0`.

- [ ] **Step 8: Commit the storage fix**

```bash
git add client/src/app/cache.js client/src/app/__tests__/cache.test.js client/src/app/hooks/__tests__/useDashboardData.test.jsx client/src/app/__tests__/events.handlers.test.js
git commit -F - <<'EOF'
fix(client): read localStorage inside the cache helpers' try

With site data blocked, reading window.localStorage throws a
SecurityError. Each helper read it in its guard, outside the try, so the
throw escaped the cache effects in useDashboardData and blanked the app
for a signed-in visitor, and escaped deleteAccount after the server had
deleted the account, skipping its redirect home.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 9: Write the failing boundary tests**

Create `client/src/app/components/__tests__/AppErrorBoundary.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import AppErrorBoundary from "../AppErrorBoundary";

// Pins the root error boundary: a child that throws while rendering or in an
// effect leaves a message on screen instead of an empty page, and the error
// still reaches reportError, the way an uncaught one would. jsdom has no
// reportError, so it is stubbed. console.error is silenced because React logs
// every error a boundary catches.

const ThrowsWhileRendering = () => {
  throw new Error("render failed");
};

const ThrowsInAnEffect = () => {
  useEffect(() => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  }, []);
  return <p>Loaded</p>;
};

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AppErrorBoundary", () => {
  test("renders its children while nothing throws", () => {
    render(
      <AppErrorBoundary>
        <p>Dashboard</p>
      </AppErrorBoundary>
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("replaces a child that throws while rendering with a message", () => {
    render(
      <AppErrorBoundary>
        <ThrowsWhileRendering />
      </AppErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Reload the page to try again.");
  });

  test("catches a throw from an effect too", () => {
    // The blocked-storage crash came from an effect, not from a render.
    render(
      <AppErrorBoundary>
        <ThrowsInAnEffect />
      </AppErrorBoundary>
    );

    expect(screen.queryByText("Loaded")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  test("reports what it caught, as an uncaught error is reported", () => {
    render(
      <AppErrorBoundary>
        <ThrowsWhileRendering />
      </AppErrorBoundary>
    );

    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "render failed" }));
  });
});
```

Create `client/src/__tests__/main.test.jsx`:

```jsx
import { act } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// Pins the wiring in main.jsx: App renders inside the root error boundary, so
// a crash anywhere in it leaves a message in #root rather than an empty page.
// App is replaced by one that always throws. reportError, which jsdom lacks,
// is stubbed, and console.error is silenced because React logs the caught
// error. Error tracking stays off: the test build has no VITE_SENTRY_DSN.
vi.mock("../App.jsx", () => ({
  default: () => {
    throw new Error("App crashed");
  }
}));

beforeEach(() => {
  vi.stubGlobal("reportError", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
  const root = document.createElement("div");
  root.id = "root";
  document.body.appendChild(root);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a crash in App leaves a message in #root, not an empty page", async () => {
  await act(async () => {
    await import("../main.jsx");
  });

  expect(document.getElementById("root").textContent).toContain("Reload the page to try again.");
  expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: "App crashed" }));
});
```

- [ ] **Step 10: Watch them fail**

```bash
npx vitest run src/app/components/__tests__/AppErrorBoundary.test.jsx src/__tests__/main.test.jsx --root client > "$SCRATCH/c1-red3.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |Error" "$SCRATCH/c1-red3.txt" | head -10
```

Expected: `exit=1`.

- `AppErrorBoundary.test.jsx` fails to load, because `../AppErrorBoundary` does not exist.
- `main.test.jsx` fails because nothing catches App's throw. Either `act` rethrows `Error: App crashed`, or `#root` is empty and the `toContain` assertion fails.

The import of `main.jsx` through a mocked App was checked in a scratch Vitest run on 2026-10-10: it renders into `#root`.

- [ ] **Step 11: Write the boundary and wire it**

Create `client/src/app/components/AppErrorBoundary.jsx`:

```jsx
/**
 * The root error boundary: main.jsx renders App inside it, so a crash anywhere
 * in the app leaves a message on screen rather than an empty page.
 */
import { Component } from "react";

/**
 * Renders `children` until one of them throws while rendering or in an effect,
 * then a message asking for a reload. React only logs an error a boundary
 * catches, so componentDidCatch passes it to reportError, which is how an
 * uncaught error reaches Sentry's global handler (app/errorTracking.js). Errors
 * in event handlers and async code never reach a boundary.
 */
export default class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    reportError(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page">
        <h1>Something went wrong</h1>
        <p role="alert">Reload the page to try again.</p>
      </main>
    );
  }
}
```

`.page` (`client/src/styles/base.css:63-68`) gives the fallback the app's padding and white text on its dark background.

Replace `client/src/main.jsx` (all 19 lines) with:

```jsx
/**
 * The client's entry point, loaded by index.html: starts error tracking, then
 * renders App, inside the root error boundary, into #root under StrictMode.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AppErrorBoundary from "./app/components/AppErrorBoundary.jsx";
import { initErrorTracking } from "./app/errorTracking.js";
import "./styles/index.css";

// Before the first render, so a crash while mounting is held and reported once
// the SDK has loaded.
initErrorTracking();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
```

- [ ] **Step 12: Watch them pass**

```bash
npx vitest run src/app/components/__tests__/AppErrorBoundary.test.jsx src/__tests__/main.test.jsx --root client > "$SCRATCH/c1-green2.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c1-green2.txt"
```

Expected: `exit=0`, 5 tests.

- [ ] **Step 13: Commit the boundary**

```bash
git add client/src/app/components/AppErrorBoundary.jsx client/src/app/components/__tests__/AppErrorBoundary.test.jsx client/src/main.jsx client/src/__tests__/main.test.jsx
git commit -F - <<'EOF'
feat(client): render App inside a root error boundary

A crash anywhere in the tree now leaves a short message instead of an
empty page. The boundary hands what it catches to reportError, since
React 19 only logs a caught error and Sentry's global handler would
otherwise never see it. Hand-written rather than react-error-boundary,
to keep the main chunk clear of the size warning.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 14: Mutation checks**

Write `$SCRATCH/mut-c1-cache.json`. It puts the property read back in the guard:

```json
[
  {
    "file": "client/src/app/cache.js",
    "find": "  if (!key || typeof window === \"undefined\") return null;",
    "text": "  if (!key || typeof window === \"undefined\" || !window.localStorage) return null;"
  }
]
```

```bash
node "$SCRATCH/mutate.mjs" "$SCRATCH/mut-c1-cache.json"
npx vitest run src/app/__tests__/cache.test.js src/app/hooks/__tests__/useDashboardData.test.jsx --root client > "$SCRATCH/c1-mut1.txt" 2>&1; echo "exit=$?"
git checkout -- client/src/app/cache.js; git status --porcelain
```

Expected: `exit=1`, with "readJsonCache returns null" and "still loads when the browser blocks site data" failing, and an empty status.

Write `$SCRATCH/mut-c1-boundary.json`. It drops the boundary from main.jsx, then the report from the boundary:

```json
[
  {
    "file": "client/src/main.jsx",
    "find": "    <AppErrorBoundary>\n      <App />\n    </AppErrorBoundary>",
    "text": "    <App />"
  },
  {
    "file": "client/src/app/components/AppErrorBoundary.jsx",
    "find": "    reportError(error);",
    "text": ""
  }
]
```

```bash
node "$SCRATCH/mutate.mjs" "$SCRATCH/mut-c1-boundary.json"
npx vitest run src/__tests__/main.test.jsx src/app/components/__tests__/AppErrorBoundary.test.jsx --root client > "$SCRATCH/c1-mut2.txt" 2>&1; echo "exit=$?"; grep -E "×" "$SCRATCH/c1-mut2.txt"
git checkout -- client/src/main.jsx client/src/app/components/AppErrorBoundary.jsx; git status --porcelain
```

Expected: `exit=1`, with the `main.test.jsx` test and "reports what it caught…" failing, and an empty status.

- [ ] **Step 15: Comments made true**

Check each against the code, as SOP rule 3 requires:

- the `cache.js` header no longer limits "swallowed" to getItem, setItem and removeItem;
- the `readJsonCache` summary says "or storage throws";
- `writeJsonCache` has a summary, and its catch comment names the failures it skips;
- the `main.jsx` header names the boundary;
- `AppErrorBoundary.jsx` has a header of at most 4 lines and a prose summary on its export.

Nothing in `events.js` describes the throw, so it needs no change. Its comment at lines 534-537 is about when the keys are built.

- [ ] **Step 16: Gates**

Run the gates from Conventions, plus `npm run test:scripts`. Visible text changes only on a crash, which no E2E test causes, so the E2E and axe specs should pass unchanged. Expected coverage: at or above every floor, with statements and functions up.

- [ ] **Step 17: Push and open the PR**

```bash
git push -u origin fix/client-blocked-storage
gh pr create --draft --base main --title "fix(client): survive blocked site data" --body-file "$SCRATCH/pr-c1.md"
gh pr ready
gh pr checks --watch
```

`pr-c1.md` outline:

- **What changed:** the property read moves inside each helper's `try`, and a root error boundary is added, wired in `main.jsx`, reporting through `reportError`.
- **Why:** the blank-page mechanism; the `deleteAccount` path, fixed by the same change and pinned by a test; and why a hand-written boundary, with its location and the File Organization reasoning.
- **Tests:** each test and the assertion that failed first; the two mutation checks.
- **Coverage:** before and after counts per metric.
- **Gates:** each exit code.
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 18: Review, then merge.** Run the spec review, then the quality review, with fix rounds until both pass. Then merge as Conventions says.

---

### Task C2: A shared `toNumberOrNull`, so a blank weight is no reading

`useDashboardMetrics.js:325-326` picks the weight-trend rows with `Number.isFinite(Number(item?.weightLb))`. `Number(null)` and `Number("")` are both 0, so a metric logged without a weight reads as "Latest weight 0 lb" and skews the delta. The comment above it (lines 322-324) already says so. The server stores a blank weight as `null`: `progressMetricBodySchema` turns `""` into `null` (`server/src/services/http/apiSchemaService.js:170`).

The contract test lists helpers, so this inline coercion was invisible to it. The fix moves it into a shared helper with a contract row.

- **Where the helper lives.** In `client/src/app/units.js`, beside `getLocalDateKey`. CLAUDE.md's File Organization keeps shared non-component code in `client/src/app/`. `units.js` is already the shared module of form-value helpers, read by the home flow, sign-up, the dashboard and the profile mapping, so adding to it beats creating a file.
- **What it does not reuse.**
  - `toMetricNumber` (`useDashboardMetrics.js:43-46`) is `Number(value || 0)` on purpose, for sums.
  - `toProfileNumber` (`app/profileMapping.js:19-23`) has the same shape, but its name is wrong for dashboard code. Folding it, and `useBodyModel`'s private `toFiniteNumber`, into the new helper would delete code, which belongs to Phase 5 (see "Not in this phase").

**Files:**

- Modify: `client/src/app/units.js:1-5` (header) and after line 77 (new export)
- Modify: `client/src/pages/dashboard/hooks/useDashboardMetrics.js:6-8` (imports) and `:322-326` (weight filter)
- Test: `client/src/__tests__/numericCoercion.contract.test.js:1-35` (header comment and the table)
- Test: `client/src/pages/dashboard/hooks/__tests__/useDashboardMetrics.test.jsx` (after the test at 407-418)

**New statements, branches and functions, and what runs each:** `toNumberOrNull` adds 1 function, 4 statements and 7 branch arms: the three-operand `||`, the `if` and the `?:`. The contract row runs every arm: `null`, `""`, `undefined`, `"not-a-number"`, `0`, `"0"` and `"1"`. The filter's predicate changes but adds no branch.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-absent-weight origin/main
```

- [ ] **Step 2: Write the failing tests**

In `client/src/__tests__/numericCoercion.contract.test.js`, replace lines 1-35 (the imports, the header comment, `ABSENT` and `helpers`) with:

```js
import { describe, expect, test } from "vitest";
import { toFiniteNumber } from "../pages/home/components/physique/math";
import { toProfileNumber } from "../app/profileMapping";
import { toNumberOrNull } from "../app/units";

// The client half of the invariant asserted in
// server/src/__tests__/numericCoercion.contract.test.js:
//
//   Absent input must never become a measured zero.
//
// `Number(null)` and `Number("")` are both 0 and both finite, so a helper that
// coerces before it guards turns "no reading" into a real-looking measurement.
// On the client it has shipped as an unentered body fat modelled at 3%, a
// silhouette dimension collapsing to its minimum because a null bypassed the
// caller's fallback, and a metric logged without a weight shown as "Latest
// weight 0 lb".
//
// Add a row when you add a numeric helper.

const ABSENT = [
  ["null", null],
  ["an empty string", ""],
  ["undefined", undefined]
];

const helpers = [
  {
    name: "toFiniteNumber (physique/math)",
    call: (value) => toFiniteNumber(value, 42),
    absent: 42
  },
  {
    name: "toProfileNumber (app/profileMapping)",
    call: (value) => toProfileNumber(value),
    absent: null
  },
  {
    name: "toNumberOrNull (app/units)",
    call: (value) => toNumberOrNull(value),
    absent: null
  }
];
```

In `client/src/pages/dashboard/hooks/__tests__/useDashboardMetrics.test.jsx`, after the test `"rows with an unusable weight are ignored"` (lines 407-418), inside the same describe, add:

```js
// The server stores a weight left blank as null, and the form sends "".
// Either is no reading, and must never be a weight of 0 lb. An absent key
// is in the table because it always behaved, which is what made the
// other two hard to see.
test.each([
  ["null", null],
  ["an empty string", ""],
  ["an absent key", undefined]
])("a newest metric whose weight is %s is not a reading", (_label, weightLb) => {
  const metrics = render({
    dashboard: {
      progressMetrics: [
        { id: "p3", date: "2026-03-01", weightLb, bodyFatPct: 18 },
        { id: "p2", date: "2026-02-20", weightLb: 172 },
        { id: "p1", date: "2026-02-10", weightLb: 175 }
      ]
    }
  });

  expect(metrics.weeklyTrends.latestWeight).toBe(172);
  expect(metrics.weeklyTrends.weightDelta).toBe(-3);
});

test("metrics with only blank weights report no latest weight at all", () => {
  const metrics = render({
    dashboard: {
      progressMetrics: [
        { id: "p2", date: "2026-03-01", weightLb: null },
        { id: "p1", date: "2026-02-20", weightLb: "" }
      ]
    }
  });

  expect(metrics.weeklyTrends.latestWeight).toBeNull();
  expect(metrics.weeklyTrends.weightDelta).toBeNull();
});
```

The describe's `beforeEach` already pins the clock to `2026-03-02T12:00:00.000Z`.

- [ ] **Step 3: Watch them fail**

```bash
npx vitest run src/__tests__/numericCoercion.contract.test.js src/pages/dashboard/hooks/__tests__/useDashboardMetrics.test.jsx --root client > "$SCRATCH/c2-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c2-red.txt" | head -20
```

Expected: `exit=1`.

- Every `toNumberOrNull (app/units)` row fails with `TypeError: toNumberOrNull is not a function`.
- The `null` and `""` weight cases fail with `expected 0 to be 172`.
- "only blank weights" fails with `expected 0 to be null`.
- The absent-key case passes, as it always has.

- [ ] **Step 4: Add the helper**

In `client/src/app/units.js`, replace the header (lines 1-5) with:

```js
/**
 * Units, locale and form-value helpers shared by the home flow and its preview,
 * sign-up, the dashboard and the profile mapping: name splitting, the visitor's
 * measurement system, today's local date key, height and weight conversion, and
 * reading a value that may be absent as a number or null.
 */
```

After `getLocalDateKey` (ends at line 77), add:

```js
/**
 * A value as a number, or null when it is absent (null, undefined or "") or
 * not a number. It guards before it coerces, because `Number(null)` and
 * `Number("")` are both 0: testing afterwards would turn a missing reading into
 * a measured zero, while a measured 0 stays 0. Same shape as toNumberOrNull in
 * the server's repositories/rowValues.js.
 */
export const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
```

- [ ] **Step 5: Use it for the weight**

In `client/src/pages/dashboard/hooks/useDashboardMetrics.js`, after `import { buildLinePath } from "../../../app/linePath";` (line 8), add:

```js
import { toNumberOrNull } from "../../../app/units";
```

Replace lines 322-326:

```js
// The latest weight by date, and its change since the one before.
// Number(null) is 0, which is finite, so a metric logged without a weight
// passes this filter as a reading of 0 lb.
const weightTrendCandidates = [...progressMetrics].filter((item) =>
  Number.isFinite(Number(item?.weightLb))
);
```

with:

```js
// The latest weight by date, and its change since the one before. A metric
// logged without a weight carries null or "", which toNumberOrNull reads as
// no reading rather than as 0 lb.
const weightTrendCandidates = [...progressMetrics].filter(
  (item) => toNumberOrNull(item?.weightLb) !== null
);
```

The `Number(...)` reads at lines 333 and 335 stay as they are: every row that reaches them holds a finite weight.

- [ ] **Step 6: Watch them pass**

```bash
npx vitest run src/__tests__/numericCoercion.contract.test.js src/pages/dashboard/hooks/__tests__/useDashboardMetrics.test.jsx src/app/__tests__/units.test.js --root client > "$SCRATCH/c2-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c2-green.txt"
```

Expected: `exit=0`.

- [ ] **Step 7: Commit**

```bash
git add client/src/app/units.js client/src/pages/dashboard/hooks/useDashboardMetrics.js client/src/__tests__/numericCoercion.contract.test.js client/src/pages/dashboard/hooks/__tests__/useDashboardMetrics.test.jsx
git commit -F - <<'EOF'
fix(dashboard): a metric logged without a weight is no reading

The weight trend filtered with Number.isFinite(Number(weightLb)), and
Number(null) and Number("") are both 0, so a blank weight showed as
"Latest weight 0 lb". The coercion moves into a shared toNumberOrNull in
app/units.js, the server's rowValues shape, with a row in the client
numeric-coercion contract test.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 8: Mutation checks**

Write `$SCRATCH/mut-c2.json`. It turns the helper into the coerce-first shape, by dropping the guard:

```json
[
  {
    "file": "client/src/app/units.js",
    "find": "  if (value === null || value === undefined || value === \"\") return null;\n  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : null;\n};\n",
    "text": "  const parsed = Number(value);\n  return Number.isFinite(parsed) ? parsed : null;\n};\n"
  }
]
```

```bash
node "$SCRATCH/mutate.mjs" "$SCRATCH/mut-c2.json"
npx vitest run src/__tests__/numericCoercion.contract.test.js src/pages/dashboard/hooks/__tests__/useDashboardMetrics.test.jsx --root client > "$SCRATCH/c2-mut.txt" 2>&1; echo "exit=$?"; grep -E "×" "$SCRATCH/c2-mut.txt" | head
git checkout -- client/src/app/units.js; git status --porcelain
```

Expected: `exit=1`, with the `toNumberOrNull` rows for `null` and `""` failing, and the `null` and `""` weight cases failing. Before restoring, `git diff client/src/app/units.js` must show the change inside `toNumberOrNull`, the only function in the file with that guard.

Then a second edits file, `$SCRATCH/mut-c2b.json`, which brings back the inline filter:

```json
[
  {
    "file": "client/src/pages/dashboard/hooks/useDashboardMetrics.js",
    "find": ".filter((item) => toNumberOrNull(item?.weightLb) !== null)",
    "text": ".filter((item) => Number.isFinite(Number(item?.weightLb)))"
  }
]
```

Run the same commands with `mut-c2b.json`, restore `useDashboardMetrics.js`, and expect the two weight cases and "only blank weights" to fail.

- [ ] **Step 9: Comments made true**

- The `units.js` header lists the new helper, at 4 lines.
- `toNumberOrNull` has its summary.
- The weight comment in `useDashboardMetrics.js` no longer describes the bug.
- The contract test's header names the third shipped instance.

- [ ] **Step 10: Gates.** Run the gates from Conventions, plus `npm run test:scripts`. No visible text changes for a visitor whose weights are all filled in.

- [ ] **Step 11: Push and open the PR**

```bash
git push -u origin fix/client-absent-weight
gh pr create --draft --base main --title "fix(dashboard): a metric logged without a weight is no reading" --body-file "$SCRATCH/pr-c2.md"
gh pr ready
gh pr checks --watch
```

`pr-c2.md` outline:

- **What changed:** the helper, the filter and the contract row.
- **Why:** the shipped symptom, and why the contract test could not see an inline coercion.
- **Where the helper lives, and what it deliberately does not reuse:** `toMetricNumber` and `toProfileNumber`.
- **Tests, mutations, coverage counts and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 12: Review, then merge.**

---

## Task C3: optimistic logs and logout, in four PRs

The spec's C3 row has four pieces, and they separate cleanly, so each gets its own PR:

| PR  | Change                                                                                         | Why it stands alone                                                                                      |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| C3a | A generation counter, so a request still out at logout cannot write state for the next account | A correctness guard on every post-`await` write. It changes no visible behaviour for one account         |
| C3b | Logout first sends the entries still inside their undo window (default #2)                     | A behaviour change to logout, reviewable apart from the guard it relies on                               |
| C3c | Undo is withdrawn once the send starts (bug I)                                                 | A toast change only, with visible text ("Saving...")                                                     |
| C3d | "Show more" fetches older meal logs and metrics (default #3)                                   | A new network feature in other files: `useDashboardData`, `DashboardPage`, `WorkoutsView` and a new hook |

C3a to C3c all edit `useOptimisticLogs.js`, so they run in that order. Each task's code assumes the ones before it have merged. All three hook changes, with every test below, were run together against the existing suite in a scratch Vitest run on 2026-10-10. The 31 existing and 13 new tests passed. Against `main`'s hook, the new tests that should fail did.

### Task C3a: A late answer cannot write state for the next account

`clearOptimisticOperations` (`useOptimisticLogs.js:77-85`) cancels only the sends that have not started. A commit past `committing = true` (line 127) keeps going. When its request resolves, it calls `setDashboard(data.dashboard)` and shows a toast (lines 132-133), whether or not the account has changed.

While signed out, the cache write is skipped, because the key is `""` (`App.jsx:124-127`). But when the next account signs in in the same tab, the key becomes theirs while `dashboard` still holds the previous account's. The write effect (`useDashboardData.js:256-262`) then files that dashboard under the new account's key. The restore paths keep `current || cached`, so the new account sees it until its own fetch lands.

**The post-`await` writes in `events.js` have the same shape, and every one needs the check.** The research named four, and there are six:

| Line | Handler                | What a late answer writes                                                            |
| ---- | ---------------------- | ------------------------------------------------------------------------------------ |
| 133  | `onSubmit`             | merges `savedPlan` into the dashboard. Generation is slow enough to outlast a logout |
| 433  | `submitGoals`          | `setDashboard` and the toast                                                         |
| 469  | `submitProfile`        | `setUser((prev) => …)`, which puts the old profile on the next user                  |
| 618  | `submitProgressMetric` | `setDashboard`, the form reset and the toast                                         |
| 648  | `saveExerciseToPlan`   | `setDashboard` and the toast                                                         |
| 670  | `removeSavedExercise`  | `setDashboard` and the toast                                                         |

Each gets the same guard on its success path. The failure paths are left alone in `events.js`, for three reasons:

- they write only a message;
- the next account's dashboard load clears `dashError` (`useDashboardData.js:288`);
- guarding them would double the new branches for a toast at most.

`useOptimisticLogs`'s own commit guards both paths, as the spec asks: "that covers setDashboard, the toast and the cache write". The cache write is covered because the late `setDashboard` never happens.

**One mechanism, in one place.** `useOptimisticLogs` owns a `generationRef`, which `clearOptimisticOperations` bumps. Logout, account deletion and unmount all run that. It exposes `captureAccount()`, which returns `isSameAccount()`:

- each queued commit captures it when queued;
- each `events.js` handler captures it before it sends, and checks it once the answer is in.

**Files:**

- Modify: `client/src/app/hooks/useOptimisticLogs.js` (summary 9-17, refs 19-23, a new section before line 70, `clearOptimisticOperations` 77-85, `queueOptimisticLogCommit` 104-160, the return 170-177)
- Modify: `client/src/app/events.js` (summary 46-55, destructuring 92, `onSubmit` 110-136, `submitGoals` 419-434, `submitProfile` 448-469, `submitProgressMetric` 604-618, `saveExerciseToPlan` 635-650, `removeSavedExercise` 659-672)
- Modify: `client/src/App.jsx:161-171` (hook destructuring) and `:369` (handler argument)
- Test: `client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx` (append after line 470)
- Test: `client/src/app/__tests__/events.test.js` (`deps` at 46-98; a new describe after line 803)
- Test: `client/src/app/__tests__/events.handlers.test.js` (`buildDeps` at 15-39)

**New statements, branches and functions, and what runs each:**

| Added                                                                          | Run by                                                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `captureAccount` and the checker it returns (2 functions)                      | the `captureAccount` tests, and every commit                                                                                          |
| the generation bump (1 statement)                                              | every `clearOptimisticOperations` test                                                                                                |
| two `if (!isSameAccount()) return;` in the commit (4 arms)                     | the false arms by the existing success and failure tests; the true arms by "a late success…" and "a late failure…"                    |
| six captures and six guards in `events.js` (one `if` or one `&&` operand each) | the false arms by the existing handler tests; the true arms by the new "an answer that arrives after the account signed out" describe |

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-late-answers-after-logout origin/main
```

- [ ] **Step 2: Write the failing hook tests**

Append to the end of `client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx`:

```jsx
// A request the test releases by hand, so a logout can be staged while it is
// still out.
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("captureAccount", () => {
  test("stays true until the operations are cleared", () => {
    const { result } = render();

    const isSameAccount = result.current.captureAccount();
    expect(isSameAccount()).toBe(true);

    act(() => result.current.clearOptimisticOperations());
    expect(isSameAccount()).toBe(false);
  });

  test("a check captured after the clear belongs to the new account", () => {
    const { result } = render();

    act(() => result.current.clearOptimisticOperations());

    expect(result.current.captureAccount()()).toBe(true);
  });
});

// Logout and account deletion clear the operations while a send may still be
// out. Its answer belongs to an account that is no longer on screen, and the
// dashboard it carries would otherwise be cached under the next account.
describe("a send still out when the account signs out", () => {
  test("a late success touches neither the dashboard nor the toast", async () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );
    await runUndoWindow();

    act(() => result.current.clearOptimisticOperations());
    await act(async () => {
      pending.resolve({ dashboard: { mealLogs: [{ id: "previous-account" }] } });
    });

    expect(setDashboard).not.toHaveBeenCalled();
    expect(result.current.dashboardToast?.message).not.toBe("Meal saved.");
  });

  test("a late failure reports nothing", async () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );
    await runUndoWindow();

    act(() => result.current.clearOptimisticOperations());
    await act(async () => {
      pending.reject(new Error("network down"));
    });

    expect(setDashError).not.toHaveBeenCalledWith("network down");
    expect(result.current.dashboardToast?.tone).not.toBe("error");
  });
});
```

- [ ] **Step 3: Write the failing handler tests**

In `client/src/app/__tests__/events.test.js`, inside the `beforeEach` that builds `deps` (lines 46-98), add after `showDashboardToast: vi.fn(),` (line 91):

```js
    // The account never changes in these tests unless one says so.
    captureAccount: () => () => true,
```

Insert this describe after the end of `describe("direct submissions", …)` (line 803), before the comment above `describe("onSubmit", …)`:

```js
// A write still out when its account signs out. The answer arrives for an
// account that is no longer on screen, and must not reach the next one: the
// dashboard it carries would be cached under the next account's key.
describe("an answer that arrives after the account signed out", () => {
  // The account changes while the request is out: captured as the same
  // account before it, read as a different one after.
  const signedOutMidRequest = (body) => {
    let sameAccount = true;
    return {
      captureAccount: () => () => sameAccount,
      apiFetch: vi.fn(async () => {
        sameAccount = false;
        return jsonResponse(body);
      })
    };
  };

  test.each([
    ["submitGoals", (handlers) => handlers.submitGoals(submitEvent())],
    ["submitProgressMetric", (handlers) => handlers.submitProgressMetric(submitEvent())],
    ["saveExerciseToPlan", (handlers) => handlers.saveExerciseToPlan({ name: "Row" })],
    ["removeSavedExercise", (handlers) => handlers.removeSavedExercise("s1")]
  ])("%s leaves the dashboard and the toast alone", async (_name, run) => {
    await run(build(signedOutMidRequest({ dashboard: { goals: {} } })));

    expect(deps.setDashboard).not.toHaveBeenCalled();
    expect(deps.showDashboardToast).not.toHaveBeenCalled();
  });

  test.each([
    ["saveExerciseToPlan", (handlers) => handlers.saveExerciseToPlan({ name: "Row" })],
    ["removeSavedExercise", (handlers) => handlers.removeSavedExercise("s1")]
  ])("%s still tells its caller the write went through", async (_name, run) => {
    const result = await run(build(signedOutMidRequest({ dashboard: { goals: {} } })));

    expect(result).toEqual({ ok: true, data: { dashboard: { goals: {} } } });
  });

  test("submitProfile leaves the next user's profile alone and still reports success", async () => {
    const result = await build(
      signedOutMidRequest({ profile: { firstName: "Ada" } })
    ).submitProfile({ name: "Ada" });

    expect(deps.setUser).not.toHaveBeenCalled();
    expect(deps.showDashboardToast).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  test("onSubmit shows the plan but keeps its saved copy off the dashboard", async () => {
    await build(
      signedOutMidRequest({ plan: "Monday - Push", savedPlan: { id: "p-new" } })
    ).onSubmit(submitEvent());

    expect(deps.setResult).toHaveBeenLastCalledWith("Monday - Push");
    expect(deps.setDashboard).not.toHaveBeenCalled();
  });
});
```

In `client/src/app/__tests__/events.handlers.test.js`, inside `buildDeps` (lines 15-39), add after `showDashboardToast: vi.fn(),` (line 24):

```js
    captureAccount: () => () => true,
```

- [ ] **Step 4: Watch them fail**

```bash
npx vitest run src/app/hooks/__tests__/useOptimisticLogs.test.jsx src/app/__tests__/events.test.js src/app/__tests__/events.handlers.test.js --root client > "$SCRATCH/c3a-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c3a-red.txt" | head -20
```

Expected: `exit=1`, failing only the new tests.

- The two `captureAccount` tests fail with `TypeError: result.current.captureAccount is not a function`.
- "a late success…" fails with `expected "spy" to not be called` (`setDashboard` ran with the previous account's dashboard).
- "a late failure…" fails because `setDashError` received `"network down"`.
- Each handler case fails because `setDashboard`, `setUser` or the toast ran. The two "still tells its caller" cases pass already.

Every existing handler test still passes: `captureAccount` is supplied but not yet called.

- [ ] **Step 5: The counter in `useOptimisticLogs`**

In `client/src/app/hooks/useOptimisticLogs.js`, replace the summary (lines 9-17) with:

```js
/**
 * Owns the pending log entries and the dashboard's toast. Returns the entries,
 * which App merges into the dashboard it renders; the toast with its show and
 * clear functions; `queueOptimisticLogCommit`, which the log handlers in
 * createAppEventHandlers call; `clearOptimisticOperations`, which empties the
 * list, cancels every send not yet started and disowns every send already out;
 * and `captureAccount`, which returns a check that stays true until the next
 * clear, for a request to read once its answer is in. `setDashboard` and
 * `setDashError` are useDashboardData's: a send that succeeds replaces the
 * dashboard with the server's, and one that fails reports its error there.
 */
```

Replace the refs (lines 22-23):

```js
const dashboardToastTimeoutRef = useRef(null);
const optimisticOpRef = useRef(new Map());
```

with:

```js
const dashboardToastTimeoutRef = useRef(null);
const optimisticOpRef = useRef(new Map());
// Bumped by clearOptimisticOperations, which logout, account deletion and
// unmount all run. A request sent before the bump answers for an account
// that is no longer on screen.
const generationRef = useRef(0);
```

Insert a section directly above `  // ---- Optimistic log entries -----------------------------------------------` (line 70):

```js
// ---- The account a request belongs to -------------------------------------
const captureAccount = useCallback(() => {
  const generation = generationRef.current;
  return () => generationRef.current === generation;
}, []);
```

In `clearOptimisticOperations` (lines 77-85), add the bump as its first line:

```js
  const clearOptimisticOperations = useCallback(() => {
    generationRef.current += 1;
    optimisticOpRef.current.forEach((operation) => {
```

In `queueOptimisticLogCommit`, replace the commit (lines 120-141, from `      // Sent when the window closes…` to the closing `      };` of `commit`) with:

```js
// Sent when the window closes, after which the entry leaves the pending
// list whatever the outcome: the server's dashboard replaces it on
// success, and a failure is reported. An answer that arrives after a
// logout or a deletion touches nothing, since the list, the dashboard
// and the toast are the next account's by then.
const isSameAccount = captureAccount();
const commit = async () => {
  const operation = optimisticOpRef.current.get(operationId);
  if (!operation) return;
  // From here undo is refused: the request is on its way.
  operation.committing = true;
  try {
    const data = await request();
    if (!isSameAccount()) return;
    optimisticOpRef.current.delete(operationId);
    removeOptimisticEntry(operationId);
    setDashboard(data.dashboard);
    showDashboardToast(successMessage || "Saved.");
  } catch (err) {
    if (!isSameAccount()) return;
    optimisticOpRef.current.delete(operationId);
    removeOptimisticEntry(operationId);
    const message = err?.message || `Unable to save ${type}.`;
    setDashError(message);
    showDashboardToast(message, "error");
  }
};
```

Replace its dependency list (line 159):

```js
[removeOptimisticEntry, setDashError, setDashboard, showDashboardToast, undoOptimisticOperation];
```

with:

```js
[
  captureAccount,
  removeOptimisticEntry,
  setDashError,
  setDashboard,
  showDashboardToast,
  undoOptimisticOperation
];
```

In the returned object (lines 170-177), add `captureAccount` after `clearOptimisticOperations`:

```js
    queueOptimisticLogCommit,
    clearOptimisticOperations,
    captureAccount
  };
```

- [ ] **Step 6: The guards in `events.js`**

Replace the summary of `createAppEventHandlers` (lines 46-55) with:

```js
/**
 * Builds the handlers from App's state and setters, all passed in one object.
 * Rebuilt every render, each handler sees the values of the render that built
 * it. The members that need a word: `apiFetch` (useApiClient, which adds the
 * CSRF header to writes); `queueOptimisticLogCommit` and `showDashboardToast`
 * (useOptimisticLogs, which shows a workout, calorie or meal log as pending and
 * sends it after the undo window); `captureAccount` (useOptimisticLogs), which
 * every handler that writes account state after an await calls before it
 * sends and checks once the answer is in; and the resets logout and account
 * deletion run, `clearOptimisticOperations`, `clearDashboardDataState`,
 * `clearDashboardToast` and `resetPersonalFlow`.
 */
```

In the destructured parameters, after `clearOptimisticOperations,` (line 92), add:

```js
  captureAccount,
```

In `onSubmit`, after `setResult("");` (line 114), add:

```js
const isSameAccount = captureAccount();
```

Replace lines 130-136:

```js
      const data = await res.json();
      setResult(data.plan);
      if (data.savedPlan) {
```

with:

```js
      const data = await res.json();
      setResult(data.plan);
      // Generation can outlast a logout. The saved plan joins the dashboard only
      // while the account that asked for it is still the one signed in.
      if (data.savedPlan && isSameAccount()) {
```

The rest of that `if` block is unchanged.

In `submitGoals`, replace:

```js
    event.preventDefault();
    setDashError("");
    try {
      const res = await apiFetch("/api/dashboard/goals", {
```

with:

```js
    event.preventDefault();
    setDashError("");
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch("/api/dashboard/goals", {
```

Then replace:

```js
const data = await res.json();
setDashboard(data.dashboard);
showDashboardToast("Goals updated.");
```

with:

```js
const data = await res.json();
// The account that sent this has signed out since: its dashboard must not
// reach whoever is signed in now.
if (!isSameAccount()) return;
setDashboard(data.dashboard);
showDashboardToast("Goals updated.");
```

In `submitProfile`, replace:

```js
  const submitProfile = async (draft, units = { heightUnit, weightUnit }) => {
    try {
```

with:

```js
  const submitProfile = async (draft, units = { heightUnit, weightUnit }) => {
    const isSameAccount = captureAccount();
    try {
```

Then replace:

```js
const data = await res.json();
// Only the user is updated, deliberately. `personal` is the home flow's
```

with:

```js
const data = await res.json();
// Saved, but for an account that has signed out since: its profile must
// not land on whoever is signed in now.
if (!isSameAccount()) return { ok: true };
// Only the user is updated, deliberately. `personal` is the home flow's
```

In `submitProgressMetric`, replace:

```js
    event.preventDefault();
    setDashError("");
    try {
      const res = await apiFetch("/api/dashboard/progress-metrics", {
```

with:

```js
    event.preventDefault();
    setDashError("");
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch("/api/dashboard/progress-metrics", {
```

Then replace:

```js
      const data = await res.json();
      setDashboard(data.dashboard);
      setProgressForm({
```

with:

```js
      const data = await res.json();
      // As in submitGoals: an answer for an account that has signed out since
      // is dropped.
      if (!isSameAccount()) return;
      setDashboard(data.dashboard);
      setProgressForm({
```

In `saveExerciseToPlan`, replace:

```js
    setDashError("");
    try {
      const res = await apiFetch("/api/dashboard/saved-exercises", {
```

with:

```js
    setDashError("");
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch("/api/dashboard/saved-exercises", {
```

Then replace:

```js
const data = await res.json();
setDashboard(data.dashboard);
showDashboardToast("Exercise saved to your plan.");
```

with:

```js
const data = await res.json();
// As in submitGoals. The caller still hears that the save went through.
if (!isSameAccount()) return { ok: true, data };
setDashboard(data.dashboard);
showDashboardToast("Exercise saved to your plan.");
```

In `removeSavedExercise`, replace:

```js
    setDashError("");
    try {
      const res = await apiFetch(`/api/dashboard/saved-exercises/${entryId}`, {
```

with:

```js
    setDashError("");
    const isSameAccount = captureAccount();
    try {
      const res = await apiFetch(`/api/dashboard/saved-exercises/${entryId}`, {
```

Then replace:

```js
const data = await res.json();
setDashboard(data.dashboard);
showDashboardToast("Saved exercise removed.");
```

with:

```js
const data = await res.json();
// As in submitGoals. The caller still hears that the removal went through.
if (!isSameAccount()) return { ok: true, data };
setDashboard(data.dashboard);
showDashboardToast("Saved exercise removed.");
```

- [ ] **Step 7: Wire it in App**

In `client/src/App.jsx`, replace the hook's destructuring (lines 161-171):

```js
  const {
    optimisticLogEntries,
    dashboardToast,
    clearDashboardToast,
    showDashboardToast,
    queueOptimisticLogCommit,
    clearOptimisticOperations
  } = useOptimisticLogs({
```

with:

```js
  const {
    optimisticLogEntries,
    dashboardToast,
    clearDashboardToast,
    showDashboardToast,
    queueOptimisticLogCommit,
    clearOptimisticOperations,
    captureAccount
  } = useOptimisticLogs({
```

In the `createAppEventHandlers({ … })` call, replace:

```js
    clearOptimisticOperations,
    clearDashboardDataState,
```

with:

```js
    clearOptimisticOperations,
    captureAccount,
    clearDashboardDataState,
```

- [ ] **Step 8: Watch them pass**

```bash
npx vitest run src/app/hooks/__tests__/useOptimisticLogs.test.jsx src/app/__tests__/events.test.js src/app/__tests__/events.handlers.test.js src/__tests__/App.settingsProfile.test.jsx src/__tests__/App.test.jsx --root client > "$SCRATCH/c3a-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c3a-green.txt"
```

Expected: `exit=0`. `App.settingsProfile.test.jsx` drives a real profile save through App's wiring, so it is the test that proves App passes `captureAccount`.

- [ ] **Step 9: Commit**

```bash
git add client/src/app/hooks/useOptimisticLogs.js client/src/app/events.js client/src/App.jsx client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx client/src/app/__tests__/events.test.js client/src/app/__tests__/events.handlers.test.js
git commit -F - <<'EOF'
fix(client): drop an answer that arrives after its account signed out

A queued log already sending at logout, and the six handlers that write
account state after an await, all wrote their answer whether or not the
account had changed. When the next account signed in in the same tab,
the dashboard cache then filed the previous account's dashboard under
the new key. useOptimisticLogs now keeps a generation that
clearOptimisticOperations bumps, and captureAccount() gives each request
a check to read once its answer is in.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 10: Mutation checks**

Write `$SCRATCH/mut-c3a-hook.json`. It makes the check always pass:

```json
[
  {
    "file": "client/src/app/hooks/useOptimisticLogs.js",
    "find": "return () => generationRef.current === generation;",
    "text": "return () => true;"
  }
]
```

```bash
node "$SCRATCH/mutate.mjs" "$SCRATCH/mut-c3a-hook.json"
npx vitest run src/app/hooks/__tests__/useOptimisticLogs.test.jsx --root client > "$SCRATCH/c3a-mut1.txt" 2>&1; echo "exit=$?"; grep -E "×" "$SCRATCH/c3a-mut1.txt"
git checkout -- client/src/app/hooks/useOptimisticLogs.js; git status --porcelain
```

Expected: `exit=1`, with "stays true until the operations are cleared", "a late success…" and "a late failure…" failing.

Write `$SCRATCH/mut-c3a-events.json`, with six identical entries, so that every capture in `events.js` becomes a check that always passes:

```json
[
  {
    "file": "client/src/app/events.js",
    "find": "const isSameAccount = captureAccount();",
    "text": "const isSameAccount = () => true;"
  },
  {
    "file": "client/src/app/events.js",
    "find": "const isSameAccount = captureAccount();",
    "text": "const isSameAccount = () => true;"
  },
  {
    "file": "client/src/app/events.js",
    "find": "const isSameAccount = captureAccount();",
    "text": "const isSameAccount = () => true;"
  },
  {
    "file": "client/src/app/events.js",
    "find": "const isSameAccount = captureAccount();",
    "text": "const isSameAccount = () => true;"
  },
  {
    "file": "client/src/app/events.js",
    "find": "const isSameAccount = captureAccount();",
    "text": "const isSameAccount = () => true;"
  },
  {
    "file": "client/src/app/events.js",
    "find": "const isSameAccount = captureAccount();",
    "text": "const isSameAccount = () => true;"
  }
]
```

Run it against `src/app/__tests__/events.test.js`, then restore `events.js`. Expected: the four "leaves the dashboard and the toast alone" cases, the `submitProfile` case and the `onSubmit` case fail. A seventh entry would fail with `MUTATION NOT APPLIED`, which also confirms there are exactly six captures.

Write `$SCRATCH/mut-c3a-app.json`. It drops the wiring:

```json
[
  {
    "file": "client/src/App.jsx",
    "find": "    captureAccount,\n    clearDashboardDataState,",
    "text": "    clearDashboardDataState,"
  }
]
```

Run it against `src/__tests__/App.settingsProfile.test.jsx`, then restore `App.jsx`. Expected: it fails, because `submitProfile` throws `captureAccount is not a function` before it sends, so the profile POST never happens. If it passes, stop: the wiring has no guard. Add an App-level test that saves through `dash.props.onSaveProfile` before going on.

- [ ] **Step 11: Comments made true**

- The `useOptimisticLogs` summary names `captureAccount` and the disowning clear.
- The new ref and the commit say why a late answer touches nothing.
- The `createAppEventHandlers` summary names `captureAccount`.
- Each guard has its line. Check the "As in submitGoals" cross-references point at a comment that exists.
- The test comment above "cancels the pending requests as well as the entries" (`useOptimisticLogs.test.jsx:432`) still holds.

- [ ] **Step 12: Gates.** Run the gates from Conventions, plus `npm run test:scripts`. No visible text changes.

- [ ] **Step 13: Push and open the PR**

```bash
git push -u origin fix/client-late-answers-after-logout
gh pr create --draft --base main --title "fix(client): drop an answer that arrives after its account signed out" --body-file "$SCRATCH/pr-c3a.md"
gh pr ready
gh pr checks --watch
```

`pr-c3a.md` outline:

- **The sequence:** a request out at logout, the next sign-in in the same tab, the cache write under the new key.
- **The mechanism**, and the six `events.js` sites, with why each needs it.
- **Why failure paths in `events.js` are left alone.**
- **Tests, the three mutation checks, coverage counts and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 14: Review, then merge.**

---

### Task C3b: Logout sends the entries still inside their undo window

Default #2. Today, logout drops an entry still inside its 4.5 s window: `onLogout` calls `clearOptimisticOperations`, which cancels its timer. Its toast had already said "Saved locally".

A scratch run of `App` on `main`, signed in, with one meal queued and then Log out, recorded the POSTs `["/api/auth/logout"]`. The meal never reached the server.

The entries must be sent before the logout request. Once the session ends, the server refuses them. And logout must wait for those sends, because the browser may send two requests on parallel connections, so the logout could land first.

`flushOptimisticOperations` therefore starts every pending send at once, and resolves when every send the account started has settled, sends already out included. It never rejects: each send catches its own failure.

**Logout waits for the flush for at most 5 s, the owner's decision.** `apiFetch` has no timeout, so a send that hangs would otherwise hold logout indefinitely. After `LOGOUT_FLUSH_CAP_MS` (5000), logout sends its own request and clears the state whether or not the sends have finished.

This means a save still running at the cap can be lost. It may be refused once the session ends, or it may land after it, in which case C3a's counter keeps its answer off the screen.

The cap lives in `events.js`, because the wait is logout's policy, not the hook's. `client/src/` has no helper that can bound an arbitrary promise. Its only timeout, `fetchWithTimeout` in `app/network.js`, aborts a fetch it makes itself. So `events.js` gets a three-line private `settleWithin`. It races the flush against a timer and clears the timer either way, so logout never waits the full cap when the sends settle sooner, and never leaves a timer behind.

The cap and its tests were run in a scratch Vitest run on 2026-10-15. `main`'s `events.js` was copied with three changes: C3b's flush wiring, then C3b with the cap, then the cap with its timer left uncleared. The three `onLogout` tests below were run against each copy:

| Copy                          | "sends the pending entries first" | "stops waiting at the cap"               | "does not wait for the cap"   |
| ----------------------------- | --------------------------------- | ---------------------------------------- | ----------------------------- |
| C3b without the cap           | passed                            | failed: `apiFetch` not called at 5000 ms | passed                        |
| C3b with the cap              | passed                            | passed                                   | passed                        |
| The cap, timer left uncleared | passed                            | passed                                   | failed: `expected 1 to be +0` |

**Files:**

- Modify: `client/src/app/hooks/useOptimisticLogs.js` (summary; the queueing at the end of `queueOptimisticLogCommit`; a new `flushOptimisticOperations` after `clearOptimisticOperations`; the return)
- Modify: `client/src/app/events.js` (module constants and helpers 17-18; summary 46-57 as left by C3a; destructuring; `onLogout` 302-320)
- Modify: `client/src/App.jsx` (the hook destructuring and the handler argument, as left by C3a)
- Test: `client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx` (append)
- Test: `client/src/app/__tests__/events.test.js` (`deps`; `describe("onLogout", …)` at 99-169)
- Test: `client/src/app/__tests__/events.handlers.test.js` (`buildDeps`)
- Test: `client/src/__tests__/App.test.jsx` (a new describe before the file's last `});`)

**New statements, branches and functions, and what runs each:**

| Added                                                                                                                                                                                                                               | Run by                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `send` (1 function, 2 statements)                                                                                                                                                                                                   | every existing test that lets the undo window close, and the flush tests                                                        |
| `flushOptimisticOperations` and its `forEach` callback (2 functions)                                                                                                                                                                | the four flush tests                                                                                                            |
| its `if (!operation.committing)` (2 arms)                                                                                                                                                                                           | the true arm by "sends an entry still inside its undo window at once"; the false arm by "waits for a send that was already out" |
| `LOGOUT_FLUSH_CAP_MS` (1 statement)                                                                                                                                                                                                 | module load                                                                                                                     |
| `settleWithin`, its `Promise` executor and its `finally` callback (3 functions; the helper's declaration and the statements in its body: `let timerId`, `const cap`, the `setTimeout` assignment, the `return`, the `clearTimeout`) | every `onLogout` test. Each one calls it, and each one's flush settles or hits the cap, so the `finally` callback runs too      |
| `await settleWithin(flushOptimisticOperations(), LOGOUT_FLUSH_CAP_MS)` in `onLogout` (1 statement)                                                                                                                                  | every `onLogout` test                                                                                                           |

The cap adds **no branch**: it is a race, not a condition. Every statement and function it adds runs in every `onLogout` test, which matters with zero headroom on statements and functions. The scratch run checked behaviour, not coverage, so confirm it with the exact counts from Conventions after Step 7: statements and functions must each gain at least as many covered as total.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-logout-sends-pending-logs origin/main
```

- [ ] **Step 2: Write the failing tests**

Append to `client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx` (the `deferred` helper is C3a's, earlier in the file):

```jsx
// Logout's first step. An entry still inside its undo window has been told it
// is saved, so it is sent at once, on the account's own session, and logout
// waits for every send the account started before it ends that session.
describe("flushOptimisticOperations", () => {
  test("sends an entry still inside its undo window at once", async () => {
    const { result } = render();
    const options = queue({ dashboard: { mealLogs: [] } });
    act(() => result.current.queueOptimisticLogCommit(options));

    await act(async () => {
      await result.current.flushOptimisticOperations();
    });

    expect(options.request).toHaveBeenCalledTimes(1);
    expect(setDashboard).toHaveBeenCalledWith({ mealLogs: [] });
  });

  test("does not send it a second time when its window would have closed", async () => {
    const { result } = render();
    const options = queue({ dashboard: {} });
    act(() => result.current.queueOptimisticLogCommit(options));

    await act(async () => {
      await result.current.flushOptimisticOperations();
    });
    await runUndoWindow();

    expect(options.request).toHaveBeenCalledTimes(1);
  });

  test("waits for a send that was already out", async () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );
    await runUndoWindow();

    let settled = false;
    let flushing;
    act(() => {
      flushing = result.current.flushOptimisticOperations().then(() => {
        settled = true;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);

    await act(async () => {
      pending.resolve({ dashboard: {} });
      await flushing;
    });
    expect(settled).toBe(true);
  });

  test("settles at once with nothing queued", async () => {
    const { result } = render();

    await expect(result.current.flushOptimisticOperations()).resolves.toBeUndefined();
  });
});
```

In `client/src/app/__tests__/events.test.js`, in the `deps` built by `beforeEach`, after C3a's `captureAccount: () => () => true,`, add:

```js
    flushOptimisticOperations: vi.fn(async () => {}),
```

In the same file, at the start of `describe("onLogout", …)` (line 99), before its first test, add:

```js
// The entries still inside their undo window go first, on this account's
// session. The server refuses them once logout has ended it, and two
// requests in flight together can land in either order.
test("sends the pending entries before it ends the session", async () => {
  let releaseFlush;
  const flushOptimisticOperations = vi.fn(
    () =>
      new Promise((resolve) => {
        releaseFlush = resolve;
      })
  );

  const loggingOut = build({ flushOptimisticOperations }).onLogout();
  await Promise.resolve();

  expect(flushOptimisticOperations).toHaveBeenCalledTimes(1);
  expect(deps.apiFetch).not.toHaveBeenCalled();

  releaseFlush();
  await loggingOut;

  expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
});

// The wait is capped at LOGOUT_FLUSH_CAP_MS (5000 ms). A send that never
// settles must not keep the user signed in. The clock is faked, so the cap is
// reached by advancing it rather than by waiting.
test("stops waiting at the cap while a send is still out", async () => {
  vi.useFakeTimers();
  try {
    const flushOptimisticOperations = vi.fn(() => new Promise(() => {}));

    const loggingOut = build({ flushOptimisticOperations }).onLogout();
    await vi.advanceTimersByTimeAsync(4999);
    expect(deps.apiFetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });

    await loggingOut;
    expect(deps.clearOptimisticOperations).toHaveBeenCalledTimes(1);
    expect(deps.go).toHaveBeenCalledWith("/");
  } finally {
    vi.useRealTimers();
  }
});

// With no clock advanced at all, logout still finishes, and it leaves no
// timer behind, so a quick flush never costs the user the cap.
test("does not wait for the cap when the sends settle sooner", async () => {
  vi.useFakeTimers();
  try {
    await build().onLogout();

    expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
```

In `client/src/app/__tests__/events.handlers.test.js`, in `buildDeps`, after C3a's `captureAccount: () => () => true,`, add:

```js
    flushOptimisticOperations: vi.fn(async () => {}),
```

In `client/src/__tests__/App.test.jsx`, add this describe as the last block inside `describe("App", …)`, before the file's final `});`:

```jsx
// The whole path: the meal form's handler queues the entry behind its undo
// window, and Log out, wired through createAppEventHandlers to the hook,
// must send it before the session ends. The network is the only boundary
// stubbed.
describe("logging out", () => {
  test("sends a log still inside its undo window before the logout request", async () => {
    const posts = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options = {}) => {
        const path = String(url);
        if (options.method === "POST") posts.push(path);
        if (path === "/api/auth/me") {
          return { ok: true, json: async () => ({ user: { email: "ada@example.com" } }) };
        }
        if (path === "/api/csrf-token") {
          return { ok: true, json: async () => ({ csrfToken: "t" }) };
        }
        if (path.startsWith("/api/dashboard")) {
          return { ok: true, json: async () => ({ dashboard: { mealLogs: [] } }) };
        }
        return { ok: true, json: async () => ({}) };
      })
    );
    await renderSettled("/dashboard");
    await waitFor(() => expect(dash.props.user).toBeTruthy());

    act(() => dash.props.submitMealLog({ preventDefault() {} }));
    await act(async () => {
      await dash.props.onLogout();
    });

    expect(posts).toEqual(["/api/dashboard/meal-logs", "/api/auth/logout"]);
  });
});
```

- [ ] **Step 3: Watch them fail**

```bash
npx vitest run src/app/hooks/__tests__/useOptimisticLogs.test.jsx src/app/__tests__/events.test.js src/__tests__/App.test.jsx --root client > "$SCRATCH/c3b-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c3b-red.txt" | head -12
```

Expected: `exit=1`.

- The four flush tests fail with `TypeError: result.current.flushOptimisticOperations is not a function`.
- "sends the pending entries before it ends the session" fails because `flushOptimisticOperations` was never called and `apiFetch` already was.
- "stops waiting at the cap…" fails on its 4999 ms assertion, because `main` never waits and `apiFetch` has already run. It also fails against the flush without the cap, at the 5000 ms assertion (Step 9).
- "does not wait for the cap…" passes on `main`, which does not wait at all. It is the guard on the cap's own timer, and fails if that timer is not cleared (Step 9).
- The App test fails with `expected [ '/api/auth/logout' ] to deeply equal [ '/api/dashboard/meal-logs', '/api/auth/logout' ]`. That is the recording the scratch run made on `main`.

- [ ] **Step 4: The flush in `useOptimisticLogs`**

In the hook's summary, replace the end of the sentence that C3a wrote:

```js
 * list, cancels every send not yet started and disowns every send already out;
 * and `captureAccount`, which returns a check that stays true until the next
 * clear, for a request to read once its answer is in. `setDashboard` and
```

with:

```js
 * list, cancels every send not yet started and disowns every send already out;
 * `flushOptimisticOperations`, which logout runs first: it sends every entry
 * still inside its undo window and resolves once every send has settled; and
 * `captureAccount`, which returns a check that stays true until the next
 * clear, for a request to read once its answer is in. `setDashboard` and
```

Directly after `clearOptimisticOperations`'s closing `}, []);`, add:

```js
// Never rejects: each send catches and reports its own failure.
const flushOptimisticOperations = useCallback(async () => {
  const sends = [];
  optimisticOpRef.current.forEach((operation) => {
    if (!operation.committing) {
      clearTimeout(operation.timerId);
      operation.send();
    }
    sends.push(operation.sending);
  });
  await Promise.all(sends);
}, []);
```

At the end of `queueOptimisticLogCommit`, replace:

```js
      // Start the undo window, and offer Undo in a toast that outlasts it.
      const timerId = setTimeout(commit, OPTIMISTIC_UNDO_WINDOW_MS);
      optimisticOpRef.current.set(operationId, {
        type,
        timerId,
        committing: false,
        undoMessage
      });
      showDashboardToast(pendingMessage || "Saved locally.", "success", {
```

with:

```js
      // Start the undo window, and offer Undo in a toast that outlasts it. The
      // timer runs `send`, and flushOptimisticOperations can run it sooner;
      // `sending` keeps the started send for the flush to wait on.
      const queued = { type, timerId: null, committing: false, undoMessage, sending: null };
      queued.send = () => {
        queued.sending = commit();
        return queued.sending;
      };
      queued.timerId = setTimeout(queued.send, OPTIMISTIC_UNDO_WINDOW_MS);
      optimisticOpRef.current.set(operationId, queued);
      showDashboardToast(pendingMessage || "Saved locally.", "success", {
```

The object is named `queued`, not `operation`, so that `commit`'s own `operation` does not shadow it. `undoOptimisticOperation` and `clearOptimisticOperations` read `timerId` and `committing` as before.

In the returned object, add `flushOptimisticOperations` after `clearOptimisticOperations`:

```js
    clearOptimisticOperations,
    flushOptimisticOperations,
    captureAccount
  };
```

The unmount effect's comment, "On unmount, every entry still inside its undo window is dropped, not sent", stays true: unmount clears and does not flush.

- [ ] **Step 5: Logout calls it first, for at most 5 s**

In `client/src/app/events.js`, directly above `const buildOptimisticId = (type) =>` (line 17), add the module constant and the private helper:

```js
// The longest logout waits for the sends it flushes, in milliseconds. A save
// still running when it passes may be lost: logout goes ahead without it.
const LOGOUT_FLUSH_CAP_MS = 5000;

// Settles when `promise` does or after `ms`, whichever comes first, and clears
// its timer either way, so a quick promise leaves no timer behind.
const settleWithin = (promise, ms) => {
  let timerId;
  const cap = new Promise((resolve) => {
    timerId = setTimeout(resolve, ms);
  });
  return Promise.race([promise, cap]).finally(() => clearTimeout(timerId));
};
```

The order follows SOP rule 5: module constants, then private helpers, then exports. `settleWithin` passes a rejection through, but the flush it wraps never rejects.

In the summary of `createAppEventHandlers`, replace:

```js
 * sends and checks once the answer is in; and the resets logout and account
 * deletion run, `clearOptimisticOperations`, `clearDashboardDataState`,
 * `clearDashboardToast` and `resetPersonalFlow`.
```

with:

```js
 * sends and checks once the answer is in; `flushOptimisticOperations`, which
 * logout runs before anything else and waits on for at most
 * LOGOUT_FLUSH_CAP_MS; and the resets logout and account
 * deletion run, `clearOptimisticOperations`, `clearDashboardDataState`,
 * `clearDashboardToast` and `resetPersonalFlow`.
```

In the destructured parameters, after `clearOptimisticOperations,`, add:

```js
  flushOptimisticOperations,
```

Replace the start of `onLogout` (lines 302-309):

```js
  const onLogout = async () => {
    // Signing out locally must not depend on the request succeeding. The button
    // is wired straight to this, so an uncaught rejection would skip every clear
    // below and leave the previous account's dashboard on screen, with no sign
    // that Log out had not worked. A dead network, or apiFetch refusing to send
    // without a CSRF token, both get here.
    try {
```

with:

```js
  const onLogout = async () => {
    // The entries still inside their undo window go first, on this account's
    // session: their toast said they were saved, and the server refuses them
    // once the session ends. The flush waits for every send this account
    // started, but for no longer than LOGOUT_FLUSH_CAP_MS. A send still
    // running then may be lost, because logout goes ahead without it rather
    // than leaving the user signed in behind a request that may never answer.
    await settleWithin(flushOptimisticOperations(), LOGOUT_FLUSH_CAP_MS);
    // Signing out locally must not depend on the request succeeding. The button
    // is wired straight to this, so an uncaught rejection would skip every clear
    // below and leave the previous account's dashboard on screen, with no sign
    // that Log out had not worked. A dead network, or apiFetch refusing to send
    // without a CSRF token, both get here.
    try {
```

`deleteAccount` does not flush. Its entries belong to an account that is about to cease to exist. Sends already out are disowned by C3a's counter.

- [ ] **Step 6: Wire it in App**

In `client/src/App.jsx`, in the hook's destructuring, replace:

```js
    clearOptimisticOperations,
    captureAccount
  } = useOptimisticLogs({
```

with:

```js
    clearOptimisticOperations,
    flushOptimisticOperations,
    captureAccount
  } = useOptimisticLogs({
```

In the `createAppEventHandlers({ … })` call, replace:

```js
    clearOptimisticOperations,
    captureAccount,
    clearDashboardDataState,
```

with:

```js
    clearOptimisticOperations,
    flushOptimisticOperations,
    captureAccount,
    clearDashboardDataState,
```

- [ ] **Step 7: Watch them pass**

```bash
npx vitest run src/app/hooks/__tests__/useOptimisticLogs.test.jsx src/app/__tests__/events.test.js src/app/__tests__/events.handlers.test.js src/__tests__/App.test.jsx --root client > "$SCRATCH/c3b-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c3b-green.txt"
```

Expected: `exit=0`.

- [ ] **Step 8: Commit**

```bash
git add client/src/app/hooks/useOptimisticLogs.js client/src/app/events.js client/src/App.jsx client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx client/src/app/__tests__/events.test.js client/src/app/__tests__/events.handlers.test.js client/src/__tests__/App.test.jsx
git commit -F - <<'EOF'
fix(client): logout sends the logs still inside their undo window

Logout cancelled an entry still inside its undo window, after its toast
had said "Saved locally". It now flushes first: every pending entry is
sent at once on the account's own session, and logout waits for every
send the account started before it asks the server to end the session,
for at most LOGOUT_FLUSH_CAP_MS (5 s). A save still running at the cap
may be lost: logout goes ahead rather than wait on a request that may
never answer.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 9: Mutation checks**

Write `$SCRATCH/mut-c3b.json`. It drops the flush from logout:

```json
[
  {
    "file": "client/src/app/events.js",
    "find": "    await settleWithin(flushOptimisticOperations(), LOGOUT_FLUSH_CAP_MS);\n",
    "text": ""
  }
]
```

Run it against `src/app/__tests__/events.test.js src/__tests__/App.test.jsx`, then restore `events.js`. Expected: "sends the pending entries before it ends the session" and the App test fail. "stops waiting at the cap…" fails too, at its 4999 ms assertion.

Write `$SCRATCH/mut-c3b-cap.json`. It removes the cap but keeps the flush, which is the C3b drafted before the owner's decision:

```json
[
  {
    "file": "client/src/app/events.js",
    "find": "await settleWithin(flushOptimisticOperations(), LOGOUT_FLUSH_CAP_MS);",
    "text": "await flushOptimisticOperations();"
  }
]
```

Run it against `src/app/__tests__/events.test.js`, then restore `events.js`. Expected: "stops waiting at the cap while a send is still out" fails at the 5000 ms assertion: `expected "vi.fn()" to be called with arguments: [ '/api/auth/logout', … ]`. The flush never settles, so logout never reaches its request.

Write `$SCRATCH/mut-c3b-timer.json`. It stops clearing the cap's timer:

```json
[
  {
    "file": "client/src/app/events.js",
    "find": ".finally(() => clearTimeout(timerId))",
    "text": ""
  }
]
```

Run it against `src/app/__tests__/events.test.js`, then restore `events.js`. Expected: "does not wait for the cap when the sends settle sooner" fails with `expected 1 to be +0`, because a timer is left pending.

ESLint would flag `timerId` as assigned but never read in this mutant. That is irrelevant here: only the test result is checked.

Write `$SCRATCH/mut-c3b-hook.json`, applied and restored one entry at a time (two runs):

```json
[
  {
    "file": "client/src/app/hooks/useOptimisticLogs.js",
    "find": "      if (!operation.committing) {",
    "text": "      if (false) {"
  }
]
```

```json
[
  {
    "file": "client/src/app/hooks/useOptimisticLogs.js",
    "find": "      sends.push(operation.sending);",
    "text": ""
  }
]
```

Run each against `src/app/hooks/__tests__/useOptimisticLogs.test.jsx`, then restore.

- The first mutation fails "sends an entry still inside its undo window at once".
- The second fails "waits for a send that was already out".

- [ ] **Step 10: Comments made true**

- The hook's summary names the flush.
- The comments on the queueing and on the flush say why.
- The `events.js` summary names the flush and its cap.
- The `onLogout` comment says why the flush comes first, and says in plain words that a send still running at the cap may be lost.
- `LOGOUT_FLUSH_CAP_MS` carries its unit and that consequence.
- `settleWithin` says what it settles on and why its timer is cleared.
- Check that "Signing out locally must not depend on the request succeeding" still holds. The flush cannot reject, and the cap bounds how long it can stall, so it does.

- [ ] **Step 11: Gates.** Run the gates from Conventions, plus `npm run test:scripts`. The E2E suite deletes its account rather than logging out, so it does not exercise the flush. The App test above is the end-to-end check.

- [ ] **Step 12: Push and open the PR**

```bash
git push -u origin fix/client-logout-sends-pending-logs
gh pr create --draft --base main --title "fix(client): logout sends the logs still inside their undo window" --body-file "$SCRATCH/pr-c3b.md"
gh pr ready
gh pr checks --watch
```

`pr-c3b.md` outline:

- **Default #2, and the scratch recording on `main`.**
- **Why the flush is awaited before the logout request.**
- **Why `deleteAccount` does not flush.**
- **The 5 s cap:** logout waits for the flush for at most `LOGOUT_FLUSH_CAP_MS` (5000 ms), the owner's decision, because `apiFetch` has no timeout. Say plainly: a save still running at the cap may be lost, since logout sends its own request and clears the state without it. Its late answer, if any, is kept off the screen by C3a's counter. The logout request itself is still uncapped, as it is today.
- **Why a private `settleWithin`:** `client/src` has no helper that bounds an arbitrary promise. `fetchWithTimeout` only aborts its own fetch.
- **The two fake-timer tests,** the three cap mutations, and their results.
- **Coverage:** the cap adds 3 functions, a few statements and no branch, all run by every `onLogout` test. Give the exact counts before and after for statements and functions.
- **Tests, the remaining mutations, coverage counts and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 13: Review, then merge.**

---

### Task C3c: Undo is withdrawn once the send starts

Bug I. The send starts when the undo window closes (`useOptimisticLogs.js:144`), but the Undo toast lasts the window plus 1000 ms (line 156). For that second, Undo is on offer:

- pressing it clears the toast first (`DashboardPage.jsx:510-515`);
- then `undoOptimisticOperation` refuses silently, because the entry is `committing` (line 90);
- and the entry saves anyway.

At commit start, the toast becomes an action-less "Saving..." (three dots, as the client's other progress strings are written). It changes only if it is still this entry's own Undo toast. A newer entry's Undo toast, which replaced it, is left alone.

`showDashboardToast` now returns the toast's id, so the queued entry can keep it. The replacement keeps that id, so the toast's own timer still clears it 1000 ms later. The success or error toast replaces it when the answer arrives.

**Files:**

- Modify: `client/src/app/hooks/useOptimisticLogs.js` (`showDashboardToast` 34-59; the commit and the queueing in `queueOptimisticLogCommit`, as left by C3b)
- Test: `client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx` (append)

**New statements, branches and functions, and what runs each:**

| Added                                                                                       | Run by                                                                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `return nextToast.id` (1 statement)                                                         | every toast test                                                                                                   |
| the `setDashboardToast` updater in the commit (1 function, 1 statement, a `?:` with 2 arms) | "the toast stops offering Undo" for the replacing arm; "a newer entry's Undo toast is left as it is" for the other |

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-undo-withdrawn-at-send origin/main
```

- [ ] **Step 2: Write the failing tests**

Append to `client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx`:

```jsx
// The request starts when the undo window closes, while the Undo toast lasts a
// second longer. Undo can no longer stop it, so the toast stops offering it,
// but only when it is still this entry's own toast.
describe("once the send has started", () => {
  test("the toast stops offering Undo", async () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );

    await runUndoWindow();

    expect(result.current.dashboardToast).toMatchObject({
      message: "Saving...",
      actionLabel: "",
      onAction: null
    });
  });

  test("a newer entry's Undo toast is left as it is", async () => {
    const { result } = render();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => new Promise(() => {})) })
      )
    );
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(
          { dashboard: {} },
          { item: { id: "op-2", title: "Eggs" }, pendingMessage: "Eggs added. Undo?" }
        )
      )
    );

    // The first entry's window closes and its send starts; the second's has
    // two seconds to go.
    await act(async () => {
      vi.advanceTimersByTime(OPTIMISTIC_UNDO_WINDOW_MS - 2000);
    });

    expect(result.current.dashboardToast).toMatchObject({
      message: "Eggs added. Undo?",
      actionLabel: "Undo"
    });
  });
});
```

- [ ] **Step 3: Watch them fail**

```bash
npx vitest run src/app/hooks/__tests__/useOptimisticLogs.test.jsx --root client > "$SCRATCH/c3c-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c3c-red.txt"
```

Expected: `exit=1`, with "the toast stops offering Undo" failing, because the toast is still `{ message: "Saved locally.", actionLabel: "Undo" }`. "a newer entry's Undo toast is left as it is" passes already: it is the guard for the condition added in Step 4.

- [ ] **Step 4: Withdraw Undo at commit start**

In `showDashboardToast`, add a comment above the `useCallback`, and a `return` at its end. Replace:

```js
  const showDashboardToast = useCallback((message, tone = "success", options = {}) => {
```

with:

```js
  // Returns the new toast's id, which a queued entry keeps so that its send
  // can tell whether the toast on screen is still its own.
  const showDashboardToast = useCallback((message, tone = "success", options = {}) => {
```

and replace:

```js
    dashboardToastTimeoutRef.current = setTimeout(() => {
      setDashboardToast((current) => (current?.id === nextToast.id ? null : current));
      dashboardToastTimeoutRef.current = null;
    }, timeoutMs);
  }, []);
```

with:

```js
    dashboardToastTimeoutRef.current = setTimeout(() => {
      setDashboardToast((current) => (current?.id === nextToast.id ? null : current));
      dashboardToastTimeoutRef.current = null;
    }, timeoutMs);
    return nextToast.id;
  }, []);
```

In the commit, replace:

```js
        // From here undo is refused: the request is on its way.
        operation.committing = true;
        try {
```

with:

```js
        // From here undo is refused: the request is on its way. So the toast
        // stops offering it, if the toast is still this entry's: a newer
        // entry's Undo is left. Its id stays, so its own timer still clears it.
        operation.committing = true;
        setDashboardToast((current) =>
          current?.id === operation.undoToastId
            ? { ...current, message: "Saving...", actionLabel: "", onAction: null }
            : current
        );
        try {
```

At the end of `queueOptimisticLogCommit`, replace:

```js
      showDashboardToast(pendingMessage || "Saved locally.", "success", {
```

with:

```js
      queued.undoToastId = showDashboardToast(pendingMessage || "Saved locally.", "success", {
```

The options object and closing `});` that follow are unchanged. The `setDashboardToast` setter is stable, so the dependency list does not change.

- [ ] **Step 5: Watch them pass**

```bash
npx vitest run src/app/hooks/__tests__/useOptimisticLogs.test.jsx src/pages/dashboard/__tests__/DashboardPage.integration.test.jsx --root client > "$SCRATCH/c3c-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c3c-green.txt"
```

Expected: `exit=0`. The existing "does nothing once the request has already gone" still passes: it holds the old toast's `onAction` and calls it directly, and the refusal is unchanged.

- [ ] **Step 6: Commit**

```bash
git add client/src/app/hooks/useOptimisticLogs.js client/src/app/hooks/__tests__/useOptimisticLogs.test.jsx
git commit -F - <<'EOF'
fix(client): stop offering Undo once a log is on its way

The Undo toast outlived the undo window by a second, and pressing it in
that second cleared the toast and did nothing, while the entry saved
anyway. When the send starts, the entry's own toast now reads
"Saving..." with no action. A newer entry's Undo toast is left alone.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 7: Mutation checks**

Write `$SCRATCH/mut-c3c.json`, applied and restored one entry at a time (two runs). The first removes the replacement. The second drops the own-toast check:

```json
[
  {
    "file": "client/src/app/hooks/useOptimisticLogs.js",
    "find": "? { ...current, message: \"Saving...\", actionLabel: \"\", onAction: null }",
    "text": "? current"
  }
]
```

```json
[
  {
    "file": "client/src/app/hooks/useOptimisticLogs.js",
    "find": "current?.id === operation.undoToastId",
    "text": "true"
  }
]
```

Run each against `src/app/hooks/__tests__/useOptimisticLogs.test.jsx`, then restore.

- The first mutation fails "the toast stops offering Undo".
- The second fails "a newer entry's Undo toast is left as it is".

- [ ] **Step 8: Comments made true**

- `showDashboardToast` says what its return value is for.
- The commit's comment covers the toast change.
- The hook's summary still holds: it does not describe the toast's content.

- [ ] **Step 9: Visible text.** `git grep -n "Saving\|Undo" e2e/` should print nothing. Then run the gates from Conventions, plus `npm run test:scripts`. The smoke spec waits on the workout POST and asserts no toast, so it is unaffected.

- [ ] **Step 10: Push and open the PR**

```bash
git push -u origin fix/client-undo-withdrawn-at-send
gh pr create --draft --base main --title "fix(client): stop offering Undo once a log is on its way" --body-file "$SCRATCH/pr-c3c.md"
gh pr ready
gh pr checks --watch
```

`pr-c3c.md` outline:

- **Bug I's mechanism**, with its line references.
- **Why the toast changes only when it is still the entry's own.**
- **What the visitor now sees.**
- **Accepted:** a slow save's "Saving..." clears 1000 ms after the send starts, before the answer.
- **Tests, mutations, coverage counts and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 11: Review, then merge.**

---

### Task C3d: "Show more" pages older meal logs and metrics

Default #3. `buildDashboardResponse` replaces `mealLogs` and `progressMetrics` with the first page of each (`server/src/services/dashboard/dashboardCollectionService.js:115-150`). The default page size is `DASHBOARD_COLLECTION_DEFAULT_LIMIT` (`server/src/index.js:294-297`). Workouts and calories are not cut to a page. The dashboard carries the lists `userReadRepository` loads, which are capped on read (`COLLECTION_LIMITS`, `server/src/repositories/userReadRepository.js:32-39`), and `useDashboardMetrics` merges `workouts` with the first page of sessions.

The server already has, and tests, a paged GET per collection:

- `GET /api/dashboard/meal-logs` and `GET /api/dashboard/progress-metrics`, registered in `server/src/routes/dashboard/registerDashboardReadRoutes.js:53-95`;
- query `limit` (1-200) and `offset` (0-100000), validated by `dashboardPaginationQuerySchema` (`server/src/routes/dashboard/validation.js:8-13`);
- answer `{ mealLogs | progressMetrics: [...], pagination: { total, limit, offset, source } }`, newest first;
- pinned by `server/src/routes/dashboard/__tests__/collectionReads.integration.test.js`.

The client calls those paths only with POST (`events.js:353, 575, 608`), and it discards the `pagination` that `GET /api/dashboard` returns.

The server track's S3 changes those routes to load only the collection they answer with. The response shape stays the same.

**Design:**

- **The totals.** `useDashboardData` keeps the `pagination` from each dashboard load. App passes it to DashboardPage, and DashboardPage passes it to the Logs view (`WorkoutsView`).
- **The fetching.** A new hook, `pages/dashboard/hooks/useOlderLogPages.js`, which only the Logs view uses, so it lives with the dashboard page (File Organization). For one collection, it fetches the next page with `fetchWithTimeout`, the reader `useDashboardData` uses. GET needs no CSRF token.
- **The offset.** The next page starts after the server rows the dashboard holds, not counting a pending entry.
- **The first fetch copies in the dashboard's page as it stands.** A log saved while the view is open pushes that page's oldest row onto the next page. Without the copy, that row would fall between the two.
- **The button.** "Show more" reveals held rows first, as today. Once they run out, it also fetches the next page. The button stays while the server's total says there is more.
- **What is fetched lasts until the view unmounts.**

The design, the hook, the view change and every test below were run in a scratch Vitest run on 2026-10-10:

- 87 tests passed: the existing `WorkoutsView` suite, the new view tests and the hook's;
- the four new view tests failed against `main`'s `WorkoutsView`, unable to find "Show more meals" or "Show more metrics".

**Files:**

- Create: `client/src/pages/dashboard/hooks/useOlderLogPages.js`
- Modify: `client/src/app/hooks/useDashboardData.js` (summary 19-27, state 37-48, loader 295-299, `clearDashboardDataState` 354-366, return 368-385)
- Modify: `client/src/App.jsx` (`useDashboardData` destructuring 136-153; DashboardPage props 535-589)
- Modify: `client/src/pages/dashboard/DashboardPage.jsx` (summary 58-65, props 66-117, the WorkoutsView element 295-304)
- Modify: `client/src/pages/dashboard/views/WorkoutsView.jsx` (imports 5-7, helpers 24-25, summary 27-33, props 34-43, state and lists 44-88, the meal and metric buttons 235-239 and 270-274)
- Modify: `client/src/app/network.js:1` (header)
- Create test: `client/src/pages/dashboard/hooks/__tests__/useOlderLogPages.test.jsx`
- Test: `client/src/pages/dashboard/views/__tests__/WorkoutsView.test.jsx` (import line 1; a new describe before the file's last `});`)
- Test: `client/src/app/hooks/__tests__/useDashboardData.test.jsx` (a new describe inside `describe("useDashboardData", …)`, after `describe("clearDashboardDataState", …)` ends at line 307)
- Test: `client/src/pages/dashboard/__tests__/DashboardPage.test.jsx` (after the test at 534-541)
- Test: `client/src/__tests__/App.test.jsx` (a new describe after C3b's)

**New statements, branches and functions, and what runs each:**

| Added                                                                                         | Run by                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useOlderLogPages`, its `filter` callback and `loadMore` (3 functions)                        | every hook test                                                                                                                                   |
| `started ? :` ×3 (6 arms)                                                                     | the false arms by any first fetch; the true arms by "asks for the page after the last one it fetched"                                             |
| `typeof knownTotal === "number" && …` (2 arms)                                                | "has nothing more to offer without a total" and "has more while…"                                                                                 |
| `if (!res.ok)` (2 arms)                                                                       | "a refused request…" and any good page                                                                                                            |
| `Array.isArray(...) ? :` (2 arms)                                                             | "a body without the collection…" and any good page                                                                                                |
| `useDashboardData`: `data.pagination \|\| null` (2 arms)                                      | "has none until a response carries them" and "keeps the totals…"                                                                                  |
| `WorkoutsView`: `mergeById` and its 2 callbacks (3 functions)                                 | every render with meal logs or metrics                                                                                                            |
| `showMore` and its `if` (1 function, 2 arms)                                                  | the fetch tests for the fetching arm; "rows the dashboard still holds are not fetched" for the other                                              |
| the two `\|\| older….hasMore` operands                                                        | the fetch tests                                                                                                                                   |
| the two `older….error &&` (4 arms)                                                            | the failure tests and any render without an error                                                                                                 |
| the two new `useMemo` callbacks and their `Array.isArray(...) ? … : []` (2 functions, 4 arms) | every render. Both ternaries move out of the two list memos they replace, so the same tests reach the same arms, and the arm counts do not change |

The two replaced list memos lose their callbacks as the two new ones gain theirs, so the function count is net zero there too. If `test:coverage` reports a new uncovered arm in `WorkoutsView.jsx`, the HTML report (`client/coverage/src/pages/dashboard/views/WorkoutsView.jsx.html`) names it. Add the test that reaches it before going on. For an `Array.isArray` arm, that is a render with `mealLogs={undefined}` or `progressMetrics={undefined}` expecting the empty-state text.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c feat/client-older-log-pages origin/main
```

- [ ] **Step 2: Write the failing hook tests**

Create `client/src/pages/dashboard/hooks/__tests__/useOlderLogPages.test.jsx`:

```jsx
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import useOlderLogPages from "../useOlderLogPages";

// Pins how the Logs view pages past the dashboard's first page: which offset
// it asks for, what it keeps, and when it stops. fetch is stubbed at the
// network boundary; fetchWithTimeout around it is the real one.

const PATH = "/api/dashboard/meal-logs";

const row = (id, extra = {}) => ({ id, date: "2026-01-01", ...extra });

const respond = (body, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

const stubFetch = (...responses) => {
  const fetchMock = vi.fn();
  responses.forEach((response) => fetchMock.mockResolvedValueOnce(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const render = ({ heldItems = [row("a"), row("b")], total } = {}) =>
  renderHook(() => useOlderLogPages({ path: PATH, collection: "mealLogs", heldItems, total }));

const requestedUrl = (fetchMock, call = 0) => String(fetchMock.mock.calls[call][0]);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useOlderLogPages", () => {
  test("has nothing more to offer without a total", () => {
    // A cached dashboard carries no pagination, so the server's size is unknown.
    const { result } = render({ total: undefined });

    expect(result.current.hasMore).toBe(false);
  });

  test("has more while the dashboard holds fewer rows than the server", () => {
    expect(render({ total: 5 }).result.current.hasMore).toBe(true);
    expect(render({ total: 2 }).result.current.hasMore).toBe(false);
  });

  test("asks for the page that starts after the rows the dashboard holds", async () => {
    const fetchMock = stubFetch(respond({ mealLogs: [], pagination: { total: 5 } }));
    const { result } = render({ total: 5 });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(requestedUrl(fetchMock)).toBe(`${PATH}?limit=50&offset=2`);
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  test("does not count a pending entry towards the offset", async () => {
    const fetchMock = stubFetch(respond({ mealLogs: [], pagination: { total: 3 } }));
    const { result } = render({
      heldItems: [row("optimistic-1", { isOptimistic: true }), row("a")],
      total: 3
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(requestedUrl(fetchMock)).toBe(`${PATH}?limit=50&offset=1`);
  });

  test("keeps the dashboard's page beside the one it fetched", async () => {
    stubFetch(respond({ mealLogs: [row("c"), row("d")], pagination: { total: 4 } }));
    const { result } = render({ total: 4 });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(result.current.hasMore).toBe(false);
  });

  test("asks for the page after the last one it fetched", async () => {
    const fetchMock = stubFetch(
      respond({ mealLogs: [row("c"), row("d")], pagination: { total: 6 } }),
      respond({ mealLogs: [row("e"), row("f")], pagination: { total: 6 } })
    );
    const { result } = render({ total: 6 });

    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.hasMore).toBe(true);
    await act(async () => {
      await result.current.loadMore();
    });

    expect(requestedUrl(fetchMock, 1)).toBe(`${PATH}?limit=50&offset=4`);
    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(result.current.hasMore).toBe(false);
  });

  test("a refused request says so and keeps what it had", async () => {
    stubFetch(respond({}, false));
    const { result } = render({ total: 5 });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.error).toBe("Unable to load older entries. Try again.");
    expect(result.current.items).toEqual([]);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  test("a body without the collection is an empty page, and paging stops", async () => {
    stubFetch(respond({}));
    const { result } = render({ total: 5 });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBe("");
  });
});
```

- [ ] **Step 3: Write the failing view and wiring tests**

In `client/src/pages/dashboard/views/__tests__/WorkoutsView.test.jsx`, change line 1 to:

```js
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

and add this describe as the last block inside `describe("WorkoutsView", …)`, before the file's final `});`:

```jsx
// The dashboard holds only the first page of meal logs and metrics. Past it,
// "Show more" asks the collection's paged route for the next page. fetch is
// stubbed at the network boundary.
describe("pages past the dashboard's first", () => {
  const COLLECTIONS = [
    ["mealLogs", "meals", "Show more meals", "/api/dashboard/meal-logs"],
    ["progressMetrics", "progress", "Show more metrics", "/api/dashboard/progress-metrics"]
  ];

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each(COLLECTIONS)(
    "%s: Show more fetches the next page once the held rows run out",
    async (prop, name, label, path) => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          [prop]: [dated("2025-12-30"), dated("2025-12-31")],
          pagination: { total: 5 }
        })
      }));
      vi.stubGlobal("fetch", fetchMock);
      renderView({ [prop]: many(3), pagination: { [prop]: { total: 5 } } });

      fireEvent.click(within(section(name)).getByText(label));

      await waitFor(() => expect(rowsIn(name)).toHaveLength(5));
      expect(String(fetchMock.mock.calls[0][0])).toBe(`${path}?limit=50&offset=3`);
      expect(within(section(name)).queryByText(label)).toBeNull();
    }
  );

  test.each(COLLECTIONS)(
    "%s: a page that fails to load says so and keeps the button",
    async (prop, name, label) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
      );
      renderView({ [prop]: many(3), pagination: { [prop]: { total: 5 } } });

      fireEvent.click(within(section(name)).getByText(label));

      expect(await within(section(name)).findByRole("alert")).toHaveTextContent(
        "Unable to load older entries. Try again."
      );
      expect(within(section(name)).getByText(label)).toBeInTheDocument();
    }
  );

  test("rows the dashboard still holds are not fetched", () => {
    // 45 held rows: the first Show more reveals the last five without asking
    // the server, even though the server has more.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderView({ mealLogs: many(45), pagination: { mealLogs: { total: 120 } } });

    fireEvent.click(screen.getByText("Show more meals"));

    expect(rowsIn("meals")).toHaveLength(45);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

In `client/src/app/hooks/__tests__/useDashboardData.test.jsx`, inside `describe("useDashboardData", …)`, after `describe("clearDashboardDataState", …)` closes (line 307), add:

```jsx
// The dashboard response carries each collection's total. The Logs view
// reads it to know whether there is a page past the first.
describe("pagination", () => {
  const pagination = { mealLogs: { total: 120, limit: 50, offset: 0, source: "collection" } };

  test("keeps the totals the dashboard response carries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ dashboard: { goals: {} }, pagination }))
    );

    const { result } = render();

    await waitFor(() => expect(result.current.dashboardPagination).toEqual(pagination));
  });

  test("has none until a response carries them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ dashboard: { goals: {} } }))
    );

    const { result } = render();

    await waitFor(() => expect(result.current.dashLoading).toBe(false));
    expect(result.current.dashboardPagination).toBeNull();
  });

  test("drops them with the rest of the dashboard state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ dashboard: { goals: {} }, pagination }))
    );
    const { result } = render();
    await waitFor(() => expect(result.current.dashboardPagination).toEqual(pagination));

    act(() => result.current.clearDashboardDataState());

    expect(result.current.dashboardPagination).toBeNull();
  });
});
```

In `client/src/pages/dashboard/__tests__/DashboardPage.test.jsx`, after the test `"a view name it does not know falls back to the summary"` (lines 534-541), add (the enclosing describe already uses real timers):

```jsx
test("the Logs view gets the dashboard's pagination", async () => {
  const dashboardPagination = { mealLogs: { total: 120 } };
  renderPage({ dashView: "workouts", dashboardPagination });

  await screen.findByTestId("workouts-view");

  expect(workoutsView.props.pagination).toBe(dashboardPagination);
});
```

In `client/src/__tests__/App.test.jsx`, after C3b's `describe("logging out", …)`, add:

```jsx
describe("the dashboard's pagination", () => {
  test("is handed from the dashboard response to the dashboard page", async () => {
    const pagination = { mealLogs: { total: 120 } };
    stubSession(async (url) => ({
      ok: true,
      json: async () =>
        String(url).startsWith("/api/dashboard")
          ? { dashboard: { mealLogs: [] }, pagination }
          : { user: { email: "ada@example.com" } }
    }));

    await renderSettled("/dashboard");

    await waitFor(() => expect(dash.props.dashboardPagination).toEqual(pagination));
  });
});
```

- [ ] **Step 4: Watch them fail**

```bash
npx vitest run src/pages/dashboard/hooks/__tests__/useOlderLogPages.test.jsx src/pages/dashboard/views/__tests__/WorkoutsView.test.jsx src/app/hooks/__tests__/useDashboardData.test.jsx src/pages/dashboard/__tests__/DashboardPage.test.jsx src/__tests__/App.test.jsx --root client > "$SCRATCH/c3d-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests |Error" "$SCRATCH/c3d-red.txt" | head -20
```

Expected: `exit=1`.

- The hook file fails to load: `../useOlderLogPages` does not exist.
- The four `WorkoutsView` fetch and failure cases fail with `Unable to find an element with the text: Show more meals` (or `metrics`).
- "keeps the totals…" and "drops them…" time out in `waitFor`, because `dashboardPagination` is `undefined`. "has none until…" fails with `expected undefined to be null`.
- The DashboardPage and App tests fail with `expected undefined to be` the pagination object.
- "rows the dashboard still holds are not fetched" passes already.

- [ ] **Step 5: The hook**

Create `client/src/pages/dashboard/hooks/useOlderLogPages.js`:

```js
/**
 * "Show more" past the dashboard's first page of one log collection. The Logs
 * view (WorkoutsView) calls it for meal logs and for progress metrics, and it
 * fetches each older page from that collection's paged GET route.
 */
import { useState } from "react";
import { fetchWithTimeout } from "../../../app/network";

// Rows per request, inside the limit dashboardPaginationQuerySchema accepts
// (server/src/routes/dashboard/validation.js).
const LOG_PAGE_SIZE = 50;

/**
 * Pages through `collection` ("mealLogs" or "progressMetrics") from `path`,
 * its paged route. `heldItems` is the list the dashboard already holds, pending
 * entries included, and `total` the collection's size from the dashboard
 * response, or undefined when that is unknown, as it is for a cached
 * dashboard. Returns `items`, the rows fetched so far; `hasMore`, whether the
 * server holds rows past them; `loading`; `error`; and `loadMore`, which asks
 * for the next page. What it has fetched lasts until the view unmounts.
 */
export default function useOlderLogPages({ path, collection, heldItems, total }) {
  const [fetched, setFetched] = useState({ items: [], nextOffset: null, total: undefined });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // A pending entry is not on the server yet, so it does not count towards the
  // offset of the next page.
  const heldServerItems = heldItems.filter((item) => !item?.isOptimistic);
  const started = fetched.nextOffset !== null;
  const nextOffset = started ? fetched.nextOffset : heldServerItems.length;
  const knownTotal = started ? fetched.total : total;
  const hasMore = typeof knownTotal === "number" && nextOffset < knownTotal;

  const loadMore = async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        limit: String(LOG_PAGE_SIZE),
        offset: String(nextOffset)
      });
      const res = await fetchWithTimeout(`${path}?${query}`, { credentials: "include" }, 12000);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      const page = Array.isArray(data?.[collection]) ? data[collection] : [];
      // The first fetch copies in the dashboard's page as it stands. A log
      // saved while the view is open pushes that page's oldest row onto the
      // next one, and without the copy it would fall between the two.
      setFetched({
        items: [...(started ? fetched.items : heldServerItems), ...page],
        nextOffset: nextOffset + page.length,
        total: data?.pagination?.total
      });
    } catch {
      setError("Unable to load older entries. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return { items: fetched.items, hasMore, loading, error, loadMore };
}
```

The 12000 ms deadline is the one `useDashboardData` gives its own reads.

- [ ] **Step 6: Keep the totals in `useDashboardData`**

In `client/src/app/hooks/useDashboardData.js`, replace the summary's first two lines (20-21):

```js
 * Owns the dashboard, weather and air-quality state, each with its loading flag
 * and error, and returns it with `setDashboard` and `setDashError` for the
```

with:

```js
 * Owns the dashboard, weather and air-quality state, each with its loading flag
 * and error, and `dashboardPagination`, the collection totals the last
 * dashboard load carried (null until one does), for the Logs view. It returns
 * them with `setDashboard` and `setDashError` for the
```

After `const [dashError, setDashError] = useState("");` (line 40), add:

```js
const [dashboardPagination, setDashboardPagination] = useState(null);
```

In the loader, replace:

```js
if (cancelled || dashboardRequestRef.current !== requestId) return;
setDashboard(data.dashboard);
applyGoalFormFromDashboard(data.dashboard, setGoalForm);
```

with:

```js
if (cancelled || dashboardRequestRef.current !== requestId) return;
setDashboard(data.dashboard);
setDashboardPagination(data.pagination || null);
applyGoalFormFromDashboard(data.dashboard, setGoalForm);
```

In `clearDashboardDataState`, after `setDashError("");`, add:

```js
setDashboardPagination(null);
```

In the returned object, after `setDashError,`, add:

```js
    dashboardPagination,
```

The write handlers' responses also carry `pagination`, and they are not read. The totals can therefore go stale by the logs saved since the last load. See "Not in this phase".

- [ ] **Step 7: Pass them through App and DashboardPage**

In `client/src/App.jsx`, in the `useDashboardData` destructuring, after `setDashError,` (line 141), add:

```js
    dashboardPagination,
```

In the `<DashboardPage … />` props, after `dashError={dashError}`, add:

```jsx
dashboardPagination = { dashboardPagination };
```

In `client/src/pages/dashboard/DashboardPage.jsx`, in the summary (lines 58-65), replace:

```js
 * the weather and air-quality readings (useDashboardData), the forms, and the
```

with:

```js
 * the weather and air-quality readings and the dashboard's pagination totals
 * (useDashboardData), the forms, and the
```

In the destructured props, after `dashError,` (line 81), add:

```js
  dashboardPagination,
```

In the WorkoutsView element (lines 295-304), after `progressMetrics={progressMetrics}`, add:

```jsx
pagination = { dashboardPagination };
```

- [ ] **Step 8: Page in the Logs view**

In `client/src/pages/dashboard/views/WorkoutsView.jsx`, replace the imports (lines 5-7):

```js
import { useMemo, useState } from "react";
import { getLocalDateKey } from "../../../app/units";
import "./WorkoutsView.css";
```

with:

```js
import { useMemo, useState } from "react";
import { getLocalDateKey } from "../../../app/units";
import useOlderLogPages from "../hooks/useOlderLogPages";
import "./WorkoutsView.css";
```

After `sortByDateDesc` (lines 24-25), add:

```js
// The dashboard's rows, then each fetched row whose id it does not already
// hold: useOlderLogPages' list starts with a copy of the dashboard's page.
const mergeById = (held, older) => {
  const heldIds = new Set(held.map((item) => item?.id));
  return [...held, ...older.filter((item) => !heldIds.has(item?.id))];
};
```

Replace the component's summary (lines 27-33) with:

```js
/**
 * The four lists arrive deduplicated from useDashboardMetrics. Each shows
 * INITIAL_VISIBLE_ROWS and grows by ROW_BATCH_SIZE on "Show more". Workouts and
 * calories page over rows the dashboard already holds. Meal logs and metrics
 * do too, and once those run out "Show more" also fetches the next page
 * (useOlderLogPages), for as long as `pagination`, the dashboard response's,
 * says the server holds more. Both Add workout buttons set the workout form's
 * date to today and open the Log workout modal; the other empty states link to
 * the view where that log is entered.
 */
```

In the props, after `progressMetrics,` (line 38), add:

```js
  pagination,
```

After the `visibleRows` state (ends at line 50), add:

```js
// Meal logs and metrics past the dashboard's first page come from their
// paged routes, a page at a time, once the rows the dashboard holds run out.
const heldMealLogs = useMemo(() => (Array.isArray(mealLogs) ? mealLogs : []), [mealLogs]);
const heldProgressMetrics = useMemo(
  () => (Array.isArray(progressMetrics) ? progressMetrics : []),
  [progressMetrics]
);
const olderMeals = useOlderLogPages({
  path: "/api/dashboard/meal-logs",
  collection: "mealLogs",
  heldItems: heldMealLogs,
  total: pagination?.mealLogs?.total
});
const olderMetrics = useOlderLogPages({
  path: "/api/dashboard/progress-metrics",
  collection: "progressMetrics",
  heldItems: heldProgressMetrics,
  total: pagination?.progressMetrics?.total
});
```

The two held lists are memoised so that the merged lists below do not recompute on every render. `react-hooks/exhaustive-deps` warns about a fresh `[]` in a dependency list otherwise.

Replace the two list memos (lines 60-67):

```js
const mealLogItems = useMemo(
  () => sortByDateDesc(Array.isArray(mealLogs) ? mealLogs : []),
  [mealLogs]
);
const progressLogs = useMemo(
  () => sortByDateDesc(Array.isArray(progressMetrics) ? progressMetrics : []),
  [progressMetrics]
);
```

with:

```js
const mealLogItems = useMemo(
  () => sortByDateDesc(mergeById(heldMealLogs, olderMeals.items)),
  [heldMealLogs, olderMeals.items]
);
const progressLogs = useMemo(
  () => sortByDateDesc(mergeById(heldProgressMetrics, olderMetrics.items)),
  [heldProgressMetrics, olderMetrics.items]
);
```

After `expandRows` (lines 86-88), add:

```js
// The next batch of rows. Once every row held is on screen it fetches the
// next page as well, and the batch fills in when the page arrives.
const showMore = (key, rows, older) => {
  if (rows.length <= visibleRows[key]) older.loadMore();
  expandRows(key);
};
```

Replace the meal button (lines 235-239):

```jsx
{
  mealLogItems.length > visibleRows.meals && (
    <button type="button" className="ghost" onClick={() => expandRows("meals")}>
      Show more meals
    </button>
  );
}
```

with:

```jsx
{
  (mealLogItems.length > visibleRows.meals || olderMeals.hasMore) && (
    <button
      type="button"
      className="ghost"
      disabled={olderMeals.loading}
      onClick={() => showMore("meals", mealLogItems, olderMeals)}
    >
      Show more meals
    </button>
  );
}
{
  olderMeals.error && (
    <p className="muted" role="alert">
      {olderMeals.error}
    </p>
  );
}
```

Replace the metrics button (lines 270-274):

```jsx
{
  progressLogs.length > visibleRows.progress && (
    <button type="button" className="ghost" onClick={() => expandRows("progress")}>
      Show more metrics
    </button>
  );
}
```

with:

```jsx
{
  (progressLogs.length > visibleRows.progress || olderMetrics.hasMore) && (
    <button
      type="button"
      className="ghost"
      disabled={olderMetrics.loading}
      onClick={() => showMore("progress", progressLogs, olderMetrics)}
    >
      Show more metrics
    </button>
  );
}
{
  olderMetrics.error && (
    <p className="muted" role="alert">
      {olderMetrics.error}
    </p>
  );
}
```

- [ ] **Step 9: The reader's header**

Replace line 1 of `client/src/app/network.js`:

```js
/** fetch with a deadline, for the dashboard's reads in useDashboardData. */
```

with:

```js
/** fetch with a deadline, for the dashboard's reads: useDashboardData's and useOlderLogPages'. */
```

- [ ] **Step 10: Watch them pass**

```bash
npx vitest run src/pages/dashboard src/app/hooks/__tests__/useDashboardData.test.jsx src/__tests__/App.test.jsx --root client > "$SCRATCH/c3d-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c3d-green.txt"
```

Expected: `exit=0`. The `src/pages/dashboard` filter includes `DashboardPage.integration.test.jsx`, whose Logs view now renders through the real hook with no pagination. It must not fetch.

- [ ] **Step 11: Commit**

```bash
git add client/src/pages/dashboard/hooks/useOlderLogPages.js client/src/pages/dashboard/hooks/__tests__/useOlderLogPages.test.jsx client/src/app/hooks/useDashboardData.js client/src/App.jsx client/src/pages/dashboard/DashboardPage.jsx client/src/pages/dashboard/views/WorkoutsView.jsx client/src/app/network.js client/src/pages/dashboard/views/__tests__/WorkoutsView.test.jsx client/src/app/hooks/__tests__/useDashboardData.test.jsx client/src/pages/dashboard/__tests__/DashboardPage.test.jsx client/src/__tests__/App.test.jsx
git commit -F - <<'EOF'
feat(dashboard): Show more fetches older meal logs and metrics

The dashboard response carries only the first page of each, and the
client never called the paged GET routes the server already has. The
Logs view now asks them for the next page once its held rows run out,
for as long as the dashboard's pagination totals say there is more.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

- [ ] **Step 12: Mutation checks**

Write `$SCRATCH/mut-c3d.json`, applied and restored one entry at a time (five runs). Each entry names the test file to run and the test it must fail:

```json
[
  {
    "file": "client/src/pages/dashboard/hooks/useOlderLogPages.js",
    "find": "items: [...(started ? fetched.items : heldServerItems), ...page],",
    "text": "items: [...(started ? fetched.items : []), ...page],"
  }
]
```

```json
[
  {
    "file": "client/src/pages/dashboard/hooks/useOlderLogPages.js",
    "find": "offset: String(nextOffset)",
    "text": "offset: \"0\""
  }
]
```

```json
[
  {
    "file": "client/src/pages/dashboard/hooks/useOlderLogPages.js",
    "find": ".filter((item) => !item?.isOptimistic)",
    "text": ".filter(() => true)"
  }
]
```

```json
[
  {
    "file": "client/src/pages/dashboard/views/WorkoutsView.jsx",
    "find": " || olderMeals.hasMore",
    "text": ""
  }
]
```

```json
[
  {
    "file": "client/src/app/hooks/useDashboardData.js",
    "find": "setDashboardPagination(data.pagination || null);",
    "text": "setDashboardPagination(null);"
  }
]
```

| Mutation | Run                                            | Must fail                                              |
| -------- | ---------------------------------------------- | ------------------------------------------------------ |
| 1        | `useOlderLogPages.test.jsx`                    | "keeps the dashboard's page beside the one it fetched" |
| 2        | `useOlderLogPages.test.jsx`                    | the three offset tests                                 |
| 3        | `useOlderLogPages.test.jsx`                    | "does not count a pending entry towards the offset"    |
| 4        | `WorkoutsView.test.jsx`                        | the meal-log fetch and failure cases                   |
| 5        | `useDashboardData.test.jsx` and `App.test.jsx` | "keeps the totals…" and the App test                   |

- [ ] **Step 13: Comments made true**

- The `useDashboardData` summary names `dashboardPagination`.
- The DashboardPage summary names the totals.
- The `WorkoutsView` summary no longer says "nothing is fetched here".
- The `network.js` header names both readers.
- The new hook has a header of at most 4 lines and a summary.
- The comment above `LOG_PAGE_SIZE` names where the limit lives, not the number.

- [ ] **Step 14: Visible text.** `git grep -n "Show more\|older entries" e2e/` should print nothing. Then run the gates from Conventions, plus `npm run test:scripts`, which checks the new hook's header. Check the main chunk in `build.txt`: WorkoutsView is lazy, so the new hook should land in its chunk, not the main one.

- [ ] **Step 15: Push and open the PR**

```bash
git push -u origin feat/client-older-log-pages
gh pr create --draft --base main --title "feat(dashboard): Show more fetches older meal logs and metrics" --body-file "$SCRATCH/pr-c3d.md"
gh pr ready
gh pr checks --watch
```

`pr-c3d.md` outline:

- **Default #3:** the routes, their query and response shape, and that the server tests them.
- **The design:** the totals, the offset, the first-page copy and its reason, and the lifetime.
- **What is accepted:** totals can lag by the logs saved since the last load; workouts and calories still page client-side only, over the read-capped lists the dashboard carries.
- **Tests, mutations, coverage counts and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 16: Review, then merge.**

---

### Task C4: Forms and parsing (bugs A, B, C and E)

One PR, as the spec groups them. Four bugs in four files, each a small pure-logic fix with its own regression test, and none changes another's code. Each gets its own commit, so a reviewer can read them apart.

| Bug | Where                                                   | What happens                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `HomePersonalStage.jsx:122-141`, `AuthPage.jsx:172-193` | Clicking the height unit already in use converts the other unit's empty fields and wipes the entry, on the home flow and on sign-up. The weight toggles are safe: `toLb(w, "lb")` and `toKg(w, "kg")` return the number unchanged                                   |
| B   | `app/plans.js:6, 20, 81`                                | The first line anywhere that starts "Tip", "Tips", "Note" or "Notes" ends the days. The prompt asks for guidance on every day (`server/src/routes/generateRoutes.js:46`), so a tip inside a day truncates the plan, in the plan views and in today's recommendation |
| C   | `TipsView.jsx:176`, `recommendationUtils.js:310-312`    | The planner's injuries field defaults to "None" (`constants.js:185`), and any non-empty text reads as a note, so every default user is told "Injury note detected"                                                                                                  |
| E   | `planUtils.js:102-113`                                  | "Cardio" matches no keyword and falls to `lean_strength`                                                                                                                                                                                                            |

The brief says `goalOptions` was deleted as dead. On `main` it is live. Commit `a498ff2` reinstated it (`client/src/app/constants.js:15-21`). Settings' goal select (`settingsFields.js:52`) and `createDefaultPlannerForm` (`constants.js:181`) read it, and `app/__tests__/constants.test.js` pins it equal to the server's `allowedGoalValues`. It is the list the loop test uses.

**Files:**

- Modify: `client/src/pages/home/components/HomePersonalStage.jsx:119-145`
- Modify: `client/src/pages/auth/AuthPage.jsx:9-17` (summary) and `:169-196`
- Modify: `client/src/app/plans.js:1-100`
- Modify: `client/src/pages/dashboard/tips/recommendationUtils.js` (after `detectInjuryFlags`, 150-162)
- Modify: `client/src/pages/dashboard/views/TipsView.jsx` (imports 10-20, summary 27-36, line 176)
- Modify: `client/src/pages/dashboard/planUtils.js:95-113`
- Test: `client/src/pages/home/components/__tests__/HomePersonalStage.test.jsx` (after the test at 170-178)
- Test: `client/src/pages/auth/__tests__/AuthPage.test.jsx` (after the test at 169-179)
- Test: `client/src/app/__tests__/plans.test.js` (the test at 148-156 is rewritten; new tests at 156 and before 248)
- Test: `client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js` (imports 2-12; append)
- Test: `client/src/pages/dashboard/views/__tests__/TipsView.test.jsx` (import; after the test at 570-578)
- Test: `client/src/pages/dashboard/__tests__/planUtils.test.js` (imports 1-2; after line 10)

**New statements, branches and functions, and what runs each:**

| Added                                                                                                                                                                                                                                                                 | Run by                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A: four `if (… === unit) return;` (4 statements, 8 arms)                                                                                                                                                                                                              | the true arms by the new "clicking the unit already in use" tests; the false arms by the existing switching tests |
| B: `WEEKDAY_NAMES`, `isWeekdayHeading` with its `some` callback, `findNotesStart` with its `findIndex` callback (4 functions); the `&&` in `findNotesStart` (2 arms). `weekdayMap` and `isWeekdayHeader` inside `parsePlanSections` go, replaced by the shared helper | every plans test; the `&&` right arm by any plan with lines after its last weekday                                |
| C: `NO_INJURY_ANSWERS`, `buildInjuryText` with its two callbacks (3 functions); `value \|\| ""` and `value && !…` (4 arms). TipsView's two `\|\| ""` (4 arms, covered) move into the helper                                                                           | the `buildInjuryText` tests                                                                                       |
| E: one `\|\| lower.includes("cardio")` operand (1 arm)                                                                                                                                                                                                                | the goal loop's "Cardio" row                                                                                      |

**Bug A**

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-forms-and-parsing origin/main
```

- [ ] **Step 2: Write the failing toggle tests**

In `client/src/pages/home/components/__tests__/HomePersonalStage.test.jsx`, inside `describe("switching height units", …)`, after the test `"an empty height converts to an empty one rather than a zero"` (lines 170-178), add:

```jsx
// The unit already in use has nothing to convert from: the other unit's
// fields were never typed into, so converting them would wipe the entry.
test.each([
  ["ft", "ft/in", { heightFeet: "5", heightInches: "9" }],
  ["cm", "cm", { heightCm: "175" }]
])("clicking %s while it is already the unit keeps what was typed", (heightUnit, label, typed) => {
  const { setPersonal, setHeightUnit } = renderStage({ heightUnit, personal: typed });

  fireEvent.click(unitButton(label));

  expect(setPersonal).not.toHaveBeenCalled();
  expect(setHeightUnit).not.toHaveBeenCalled();
});
```

In `client/src/pages/auth/__tests__/AuthPage.test.jsx`, inside `describe("switching height units", …)`, after the test `"%s is the unit that decides which input is shown"` (lines 169-179), add:

```jsx
// As on the home form: the unit already in use has nothing to convert.
test.each([
  ["ft", "ft/in"],
  ["cm", "cm"]
])("clicking %s while it is already the unit leaves the entry alone", (signupHeightUnit, label) => {
  const onSignupProfileChange = vi.fn();
  const setSignupHeightUnit = vi.fn();
  renderSignup({ signupHeightUnit, onSignupProfileChange, setSignupHeightUnit });

  fireEvent.click(unitButton("Height units", label));

  expect(onSignupProfileChange).not.toHaveBeenCalled();
  expect(setSignupHeightUnit).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Watch them fail**

```bash
npx vitest run src/pages/home/components/__tests__/HomePersonalStage.test.jsx src/pages/auth/__tests__/AuthPage.test.jsx --root client > "$SCRATCH/c4a-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c4a-red.txt"
```

Expected: `exit=1`, with the four new cases failing on `expected "spy" to not be called`. The home form's spy is `setPersonal`, which received the updater that writes the empty conversion. The sign-up form's spy is `onSignupProfileChange`.

- [ ] **Step 4: Return early on the unit in use**

In `client/src/pages/home/components/HomePersonalStage.jsx`, replace the ft/in button's handler opening (lines 122-123):

```jsx
                onClick={() => {
                  const next = toFeetInchesFromCm(personal.heightCm);
```

with:

```jsx
                onClick={() => {
                  // Already in feet: the centimetre field was never typed into,
                  // and converting it would wipe the entry.
                  if (heightUnit === "ft") return;
                  const next = toFeetInchesFromCm(personal.heightCm);
```

Replace the cm button's handler opening (lines 135-136):

```jsx
                onClick={() => {
                  setPersonal((prev) => ({
```

with:

```jsx
                onClick={() => {
                  // Already in centimetres, for the same reason.
                  if (heightUnit === "cm") return;
                  setPersonal((prev) => ({
```

In `client/src/pages/auth/AuthPage.jsx`, replace the ft/in handler's opening (lines 172-173):

```jsx
                          onClick={() => {
                            const next = toFeetInchesFromCm(signupProfileForm.heightCm);
```

with:

```jsx
                          onClick={() => {
                            if (signupHeightUnit === "ft") return;
                            const next = toFeetInchesFromCm(signupProfileForm.heightCm);
```

Replace the cm handler's opening (lines 184-185):

```jsx
                          onClick={() => {
                            setSignupField(
                              "heightCm",
```

with:

```jsx
                          onClick={() => {
                            if (signupHeightUnit === "cm") return;
                            setSignupField(
                              "heightCm",
```

In the AuthPage summary, replace:

```js
 * their `required` does not block a login. The ft/in button fills feet and
 * inches from the centimetres field and the cm button does the reverse; the lb
 * and kg buttons convert the weight from the unit in use. All four use App's
```

with:

```js
 * their `required` does not block a login. The ft/in button fills feet and
 * inches from the centimetres field and the cm button does the reverse, and
 * either does nothing when its unit is already in use, since there is nothing
 * to convert from; the lb and kg buttons convert the weight from the unit in
 * use. All four use App's
```

Keep the rest of the summary's sentence (`converters from app/units.js. …`) as it is, and let Prettier reflow the comment if it needs to.

- [ ] **Step 5: Watch them pass, and commit**

```bash
npx vitest run src/pages/home/components/__tests__/HomePersonalStage.test.jsx src/pages/auth/__tests__/AuthPage.test.jsx src/pages/home/__tests__/HomePage.test.jsx --root client > "$SCRATCH/c4a-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c4a-green.txt"
git add client/src/pages/home/components/HomePersonalStage.jsx client/src/pages/auth/AuthPage.jsx client/src/pages/home/components/__tests__/HomePersonalStage.test.jsx client/src/pages/auth/__tests__/AuthPage.test.jsx
git commit -F - <<'EOF'
fix(forms): clicking the height unit in use keeps the entry

Each toggle converted from the other unit's fields, which are blank
until the visitor switches, so clicking the highlighted unit wiped what
had been typed, on the home form and on sign-up.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

**Bug B**

- [ ] **Step 6: Write the failing plan tests**

In `client/src/app/__tests__/plans.test.js`, replace the test at lines 148-156:

```js
// A model that leads with its notes leaves nothing above them, and the
// whole plan is read as notes.
test("produces no days when the notes heading comes first", () => {
  const { days, notes } = parsePlanSections(plan("Notes: warm up first", "Monday", "Bench"));

  expect(days).toEqual([]);
  expect(notes).toEqual(["warm up first", "Monday", "Bench"]);
});
```

with:

```js
// A notes heading counts only below the last weekday heading, so a model
// that leads with its notes still has its week read. Those notes sit above
// the first weekday and are dropped with the rest of the preamble.
test("still reads the week when a notes heading comes first", () => {
  const { days, notes } = parsePlanSections(plan("Notes: warm up first", "Monday", "Bench"));

  expect(days).toEqual([{ title: "Monday", lines: ["Bench"] }]);
  expect(notes).toEqual([]);
});

// The prompt asks for guidance on every day, so a tip inside a day is
// expected output, and only the closing section is the notes.
test.each(["Tip: keep rest at 90s", "Note: go lighter if your knee aches"])(
  "keeps %s inside the day it appears in",
  (line) => {
    const { days, notes } = parsePlanSections(
      plan(
        "Monday - Push",
        "Bench press 4x6",
        line,
        "Tuesday - Pull",
        "Barbell row 4x6",
        "Coach Notes: sleep well"
      )
    );

    expect(days).toEqual([
      { title: "Monday - Push", lines: ["Bench press 4x6", line] },
      { title: "Tuesday - Pull", lines: ["Barbell row 4x6"] }
    ]);
    expect(notes).toEqual(["sleep well"]);
  }
);
```

That rewrite changes what a pinned test expects. The old test recorded that a plan opening with its notes loses its whole week. The new behaviour keeps the week, which is the point of the fix. Say so in the PR.

In `describe("extractLatestPlanByWeekday", …)`, before the test `"agrees with parsePlanSections about which lines belong to a day"` (line 248), add:

```js
test("keeps a tip inside a day rather than ending the week at it", () => {
  const week = extractLatestPlanByWeekday(
    dashboard(
      plan(
        "Monday - Push",
        "Bench",
        "Tip: brace hard",
        "Tuesday - Pull",
        "Rows",
        "Coach Notes: rest"
      )
    )
  );

  expect(week).toEqual({ Monday: ["Bench", "Tip: brace hard"], Tuesday: ["Rows"] });
});
```

- [ ] **Step 7: Watch them fail**

```bash
npx vitest run src/app/__tests__/plans.test.js --root client > "$SCRATCH/c4b-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c4b-red.txt"
```

Expected: `exit=1`, with four failures.

- "still reads the week…": days are `[]`.
- Both "keeps … inside the day" cases: Monday stops at "Bench press 4x6", Tuesday is missing, and the tip line opens the notes.
- "keeps a tip inside a day…": the week is `{ Monday: ["Bench"] }`.

These four tests, with the change below, were run in a scratch Vitest run on 2026-10-10. All 43 plans tests passed, and the same four failed against `main`.

- [ ] **Step 8: Look for the notes only below the last weekday**

In `client/src/app/plans.js`, replace line 6:

```js
const hasNotesHeading = (line) => /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\b/i.test(line);
```

with:

```js
const WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

const isWeekdayHeading = (line) => {
  const lower = line.toLowerCase();
  return WEEKDAY_NAMES.some((day) => lower.startsWith(day));
};

const hasNotesHeading = (line) => /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\b/i.test(line);

// The notes open at the first notes heading below the last weekday heading. A
// "Tip:" or "Note:" line above that sits inside a day and belongs to it.
const findNotesStart = (lines) => {
  const lastWeekday = lines.findLastIndex(isWeekdayHeading);
  return lines.findIndex((line, index) => index > lastWeekday && hasNotesHeading(line));
};
```

Replace `parsePlanSections`'s summary (lines 8-13):

```js
/**
 * Splits a plan into `days`, each a `title` line and the `lines` under it, and
 * `notes`. A line starting with a weekday name opens a day; the first notes
 * heading (Coach notes, Tips, Notes) and everything after it are notes. Text
 * with no weekday heading becomes one "Your plan" day.
 */
```

with:

```js
/**
 * Splits a plan into `days`, each a `title` line and the `lines` under it, and
 * `notes`. A line starting with a weekday name opens a day. The first notes
 * heading (Coach notes, Tips, Notes) below the last weekday heading, and
 * everything after it, are notes; one higher up is a line of its day. Text
 * with no weekday heading becomes one "Your plan" day.
 */
```

Replace line 20:

```js
const notesStart = rawLines.findIndex((line) => hasNotesHeading(line));
```

with:

```js
const notesStart = findNotesStart(rawLines);
```

Replace lines 37-51:

```js
// Cut what is left into days at each weekday heading.
const weekdayMap = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"]
];
const isWeekdayHeader = (line) => weekdayMap.some(([key]) => line.toLowerCase().startsWith(key));

const dayIndices = lines
  .map((line, index) => (isWeekdayHeader(line) ? index : -1))
  .filter((index) => index >= 0);
```

with:

```js
// Cut what is left into days at each weekday heading.
const dayIndices = lines
  .map((line, index) => (isWeekdayHeading(line) ? index : -1))
  .filter((index) => index >= 0);
```

In `extractLatestPlanByWeekday`'s summary (lines 67-72), replace `lines under that day's heading, notes left out.` with `lines under that day's heading, the notes (as parsePlanSections finds them) left out.`. Replace line 81:

```js
const notesStart = lines.findIndex((line) => hasNotesHeading(line));
```

with:

```js
const notesStart = findNotesStart(lines);
```

`findLastIndex` is ES2023. Node 22 has it, and so does every browser the Vite 8 build targets by default.

- [ ] **Step 9: Watch them pass, and commit**

```bash
npx vitest run src/app/__tests__/plans.test.js src/pages/workout-result/__tests__/WorkoutResultPage.test.jsx --root client > "$SCRATCH/c4b-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c4b-green.txt"
git add client/src/app/plans.js client/src/app/__tests__/plans.test.js
git commit -F - <<'EOF'
fix(plans): a tip inside a day no longer cuts the plan short

The first line anywhere starting "Tip" or "Note" opened the notes, so a
day's own guidance ended the week there. Both parsers now look for the
notes heading only below the last weekday heading, through one shared
helper.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

**Bug C**

- [ ] **Step 10: Write the failing injury tests**

In `client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js`, add `buildInjuryText,` to the import list (lines 2-12), after `buildGuideCards,`, and append to the end of the file:

```js
// The planner's injuries field defaults to "None", and a profile note can say
// "n/a". Those answer the question with no injury, so they are not a note.
describe("buildInjuryText", () => {
  test.each([["None"], ["none"], ["N/A"], ["n/a"], ["No"], ["  none  "]])(
    "reads the answer %s as no injury",
    (answer) => {
      expect(buildInjuryText(answer, "")).toBe("");
      expect(buildInjuryText("", answer)).toBe("");
    }
  );

  test("joins a real injury and a real note", () => {
    expect(buildInjuryText("Knee", "sore after runs")).toBe("Knee sore after runs");
  });

  test("keeps a real note beside a None answer", () => {
    expect(buildInjuryText("None", "lower back twinges")).toBe("lower back twinges");
  });

  test("reads absent values as nothing", () => {
    expect(buildInjuryText(undefined, null)).toBe("");
  });
});
```

In `client/src/pages/dashboard/views/__tests__/TipsView.test.jsx`, add after line 3:

```js
import { createDefaultPlannerForm } from "../../../../app/constants";
```

Inside `describe("the three views", …)`, after the test `"the guide always has something to say"` (lines 570-578), add:

```jsx
test("a planner left at its default injuries answer reads as no injury note", async () => {
  // Built from what the planner stores: its injuries default is "None".
  withExercises([]);
  renderView({ form: createDefaultPlannerForm() });
  await waitFor(() => expect(fetch).toHaveBeenCalled());

  setView("guides");

  expect(screen.getByText(/No injury note detected/)).toBeInTheDocument();
});
```

- [ ] **Step 11: Watch them fail**

```bash
npx vitest run src/pages/dashboard/tips/__tests__/recommendationUtils.test.js src/pages/dashboard/views/__tests__/TipsView.test.jsx --root client > "$SCRATCH/c4c-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c4c-red.txt"
```

Expected: `exit=1`.

- Every `buildInjuryText` test fails with `TypeError: buildInjuryText is not a function`.
- The TipsView test fails with `Unable to find an element with the text: /No injury note detected/`: the card reads "Injury note detected: …".

- [ ] **Step 12: Read none, n/a and no as no injury**

In `client/src/pages/dashboard/tips/recommendationUtils.js`, after `detectInjuryFlags` (ends at line 162), add:

```js
// Answers to "any injuries?" that mean there are none. The planner's injuries
// field defaults to the first of them.
const NO_INJURY_ANSWERS = new Set(["none", "n/a", "no"]);

/**
 * The injury note the guide reads: the planner's injuries answer and the
 * profile's notes, trimmed and joined with a space, each left out when it is
 * empty or answers none, n/a or no.
 */
export const buildInjuryText = (injuries, notes) =>
  [injuries, notes]
    .map((value) => String(value || "").trim())
    .filter((value) => value && !NO_INJURY_ANSWERS.has(value.toLowerCase()))
    .join(" ");
```

In `client/src/pages/dashboard/views/TipsView.jsx`, add `buildInjuryText` to the `recommendationUtils` import (lines 10-20), after `buildGuideCards`. Replace line 176:

```js
const injuryText = `${form?.injuries || ""} ${user?.profile?.notes || ""}`.trim();
```

with:

```js
const injuryText = buildInjuryText(form?.injuries, user?.profile?.notes);
```

In the TipsView summary, replace `An injury note is the planner form's injuries plus the profile's notes.` with `An injury note is the planner form's injuries plus the profile's notes, each left out when it answers none, n/a or no (buildInjuryText).`.

Scoring is unchanged: `detectInjuryFlags` looks for injury names, and "none" contains none of them.

- [ ] **Step 13: Watch them pass, and commit**

```bash
npx vitest run src/pages/dashboard/tips/__tests__/recommendationUtils.test.js src/pages/dashboard/views/__tests__/TipsView.test.jsx --root client > "$SCRATCH/c4c-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c4c-green.txt"
git add client/src/pages/dashboard/tips/recommendationUtils.js client/src/pages/dashboard/views/TipsView.jsx client/src/pages/dashboard/tips/__tests__/recommendationUtils.test.js client/src/pages/dashboard/views/__tests__/TipsView.test.jsx
git commit -F - <<'EOF'
fix(guides): "None" is not an injury note

The planner's injuries field defaults to "None", and any text read as a
note, so every default user was told "Injury note detected". The note is
now built by buildInjuryText, which leaves out an answer of none, n/a or
no.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

**Bug E**

- [ ] **Step 14: Write the failing goal test**

In `client/src/pages/dashboard/__tests__/planUtils.test.js`, after line 2, add:

```js
import { goalOptions } from "../../../app/constants";
```

Inside `describe("planUtils", …)`, after the first test (ends at line 10), add:

```js
// Every goal the form offers, and the track it is meant to land on. A goal
// added to goalOptions without a row here fails the first test.
const INTENDED_TRACKS = {
  "Build lean strength and energy": "lean_strength",
  "Fat loss + conditioning": "fat_loss",
  Mobility: "recovery",
  Recovery: "recovery",
  Cardio: "endurance"
};

test("has an intended track for every goal the form offers", () => {
  expect(Object.keys(INTENDED_TRACKS).sort()).toEqual([...goalOptions].sort());
});

test.each(goalOptions)("detectTrack maps the goal %s to its intended track", (goal) => {
  expect(detectTrack(goal)).toBe(INTENDED_TRACKS[goal]);
});
```

- [ ] **Step 15: Watch it fail**

```bash
npx vitest run src/pages/dashboard/__tests__/planUtils.test.js --root client > "$SCRATCH/c4e-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c4e-red.txt"
```

Expected: `exit=1`, with only the `Cardio` row failing: `expected 'lean_strength' to be 'endurance'`.

- [ ] **Step 16: Add the keyword**

In `client/src/pages/dashboard/planUtils.js`, replace the summary's sentence `Of goalOptions, "Cardio" has no keyword and so lands on lean_strength.` with `Every one of goalOptions has a keyword, so only free text naming none lands on lean_strength.`. Replace:

```js
if (lower.includes("endurance") || lower.includes("athletic") || lower.includes("performance")) {
  return "endurance";
}
```

with:

```js
if (
  lower.includes("endurance") ||
  lower.includes("athletic") ||
  lower.includes("performance") ||
  lower.includes("cardio")
) {
  return "endurance";
}
```

- [ ] **Step 17: Watch it pass, and commit**

```bash
npx vitest run src/pages/dashboard/__tests__/planUtils.test.js src/pages/dashboard/views/__tests__/MealView.test.jsx --root client > "$SCRATCH/c4e-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c4e-green.txt"
git add client/src/pages/dashboard/planUtils.js client/src/pages/dashboard/__tests__/planUtils.test.js
git commit -F - <<'EOF'
fix(dashboard): the Cardio goal maps to the endurance track

"Cardio", one of the five goals Settings offers, matched no keyword and
fell to lean_strength, so its meal plan and guide were the strength
ones. A loop over goalOptions now pins each goal to its track.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

**All four**

- [ ] **Step 18: Mutation checks**

One edits file per fix, each applied, run against its own test file, then restored:

| Edits file      | `find` → `text`                                                                                                  | Test file                                          | Must fail                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `mut-c4a1.json` | `client/src/pages/home/components/HomePersonalStage.jsx`: `if (heightUnit === "ft") return;` → `` (empty)        | `HomePersonalStage.test.jsx`                       | the `ft` case                              |
| `mut-c4a2.json` | `client/src/pages/auth/AuthPage.jsx`: `if (signupHeightUnit === "cm") return;` → ``                              | `AuthPage.test.jsx`                                | the `cm` case                              |
| `mut-c4b.json`  | `client/src/app/plans.js`: `index > lastWeekday && ` → ``                                                        | `plans.test.js`                                    | the four new plans tests                   |
| `mut-c4c.json`  | `client/src/pages/dashboard/tips/recommendationUtils.js`: `!NO_INJURY_ANSWERS.has(value.toLowerCase())` → `true` | `recommendationUtils.test.js`, `TipsView.test.jsx` | the none/n/a/no rows and the TipsView test |
| `mut-c4e.json`  | `client/src/pages/dashboard/planUtils.js`: ` \|\|\n    lower.includes("cardio")` → ``                            | `planUtils.test.js`                                | the `Cardio` row                           |

For example, `mut-c4b.json`:

```json
[{ "file": "client/src/app/plans.js", "find": "index > lastWeekday && ", "text": "" }]
```

and `mut-c4e.json`:

```json
[
  {
    "file": "client/src/pages/dashboard/planUtils.js",
    "find": " ||\n    lower.includes(\"cardio\")",
    "text": ""
  }
]
```

- [ ] **Step 19: Comments made true**

- The AuthPage summary covers the toggle that does nothing.
- HomePersonalStage's two new comments.
- `plans.js`: the notes helper's comment and both summaries.
- `recommendationUtils.js`: the new helper's summary. The `NO_INJURY_ANSWERS` comment names no number.
- The TipsView summary.
- The `detectTrack` summary no longer names Cardio as the exception.

- [ ] **Step 20: Visible text.** The guide card text changes for default users. `git grep -n "Injury note\|ft/in" e2e/` should print nothing. The signup spec fills the default ft fields without touching a toggle. Then run the gates from Conventions, plus `npm run test:scripts`.

- [ ] **Step 21: Push and open the PR**

```bash
git push -u origin fix/client-forms-and-parsing
gh pr create --draft --base main --title "fix(client): forms and parsing (height toggle, plan notes, injury default, Cardio goal)" --body-file "$SCRATCH/pr-c4.md"
gh pr ready
gh pr checks --watch
```

`pr-c4.md` outline:

- **One section per bug:** the mechanism with line references, the fix, the test, and the mutation.
- **The rewritten plans test**, and why its old expectation was the bug.
- **`goalOptions` is live on `main`:** it was reinstated in `a498ff2`, and it is the list the loop test uses.
- **Known limits:**
  - a tip inside the LAST day still opens the notes;
  - "No injuries" as free text still reads as a note, since only the exact answers none, n/a and no are left out.
- **Coverage counts and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 22: Review, then merge.**

---

## Task C5: dates, bounds, locale, routing and a label, in five PRs

The spec's C5 row holds five unrelated fixes in different files, so each is its own PR. They share no code, and no test, except that C5a's two date bugs share a cause and a test technique, so they ride together:

| PR  | Bugs                                                        | Files                                                                |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| C5a | F and G: a bare date read as UTC midnight                   | `MealLogPanel.jsx`, `DashboardPage.jsx`, `useDashboardMetrics.js`    |
| C5b | H: client bounds narrower than the server's                 | `CaloriesView.jsx`, `DashboardWorkoutModal.jsx`, a new contract test |
| C5c | L: a script subtag read as the region                       | `app/units.js`                                                       |
| C5d | J: `/dashboard/constructor` resolves to an inherited member | `app/routing.js` and two comments                                    |
| C5e | default #4: "Back to home"                                  | `DashboardHomeView.jsx`                                              |

### Task C5a: Local dates for meal logs and the next workout

Bug F. "Log first meal" fills the date with `new Date().toISOString().slice(0, 10)` (`MealLogPanel.jsx:162`), which is the UTC date. Every other log form uses `getLocalDateKey()` (`app/units.js:71-77`). In the evening west of UTC, the meal is dated tomorrow.

Bug G. DashboardPage's `nextWorkout` (lines 160-175) parses a bare `YYYY-MM-DD` with `new Date(value)`, which reads it as UTC midnight. It then compares that with `todayStart`, which is local midnight.

The arithmetic decides which zones it hits. `new Date("2026-09-11")` is 2026-09-11T00:00Z. In Los Angeles in September (UTC-7), local midnight on the 11th is 2026-09-11T07:00Z. The signed difference, 7 h, is the offset. So west of UTC, UTC midnight is earlier than local midnight, today's workout fails the `>= todayStart` filter, and it is labelled "Latest". East of UTC (Tokyo, 2026-09-10T15:00Z), UTC midnight is later, and it passes. In UTC the two are equal, so it passes. `useDashboardMetrics`' private `parseDateValue` already reads a bare date as local midnight. DashboardPage now uses it.

Tests pin both the clock and the zone (Conventions, "Clock and zone"):

- The Los Angeles rows fail on the unfixed code in any zone, CI's UTC included.
- The Tokyo and UTC rows pin the other two sides.
- A scratch Vitest run on 2026-10-10 confirmed both premises on `main`. Under `America/Los_Angeles`, UTC midnight on 2026-09-11 is 7 h before local midnight. `MealLogPanel` at 2026-09-11T03:00Z seeds `"2026-09-11"`, while `getLocalDateKey()` gives `"2026-09-10"`.

**Files:**

- Modify: `client/src/pages/dashboard/meal/MealLogPanel.jsx:1-14` (header, import, summary) and `:162`
- Modify: `client/src/pages/dashboard/hooks/useDashboardMetrics.js:10-20` (`parseDateValue` exported with a summary)
- Modify: `client/src/pages/dashboard/DashboardPage.jsx:13` (import) and `:150-166` (comment and `parseDateAsTime`)
- Test: `client/src/pages/dashboard/views/__tests__/MealView.test.jsx` (a constant after the imports; a test in `describe("the empty state's Log first meal button"`, lines 657-690)
- Test: `client/src/pages/dashboard/__tests__/DashboardPage.test.jsx` (a constant after the mocks; the test at 208-231 is replaced)

**New statements, branches and functions, and what runs each:** none in `MealLogPanel`. `getLocalDateKey()` replaces an expression in the same `||`. In DashboardPage, `parseDateAsTime` becomes one expression with one `|| 0` (2 arms), replacing an `if` and a `?:` (4 arms):

- the valid-date arm is run by every next-workout test;
- the `0` arm by "a workout with no date is not treated as upcoming" and "an unparseable date does not take the page down".

`parseDateValue` is already covered. Exporting it adds nothing.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-local-dates origin/main
```

- [ ] **Step 2: Write the failing tests**

In `client/src/pages/dashboard/views/__tests__/MealView.test.jsx`, after the imports (line 5), add:

```js
// The zone the run started in, restored after each test that pins its own.
const SYSTEM_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
```

Inside `describe("the empty state's Log first meal button", …)`, after the test `"keeps a date and meal type the visitor already chose"`, add:

```jsx
test("seeds the local date, not the UTC one", async () => {
  // 03:00 UTC on 11 September is still the evening of the 10th in Los
  // Angeles (UTC-7), so the UTC date is a day ahead there. The zone is
  // set before the clock, so the instant is the one named.
  process.env.TZ = "America/Los_Angeles";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T03:00:00Z"));
  try {
    const { setMealLogForm } = renderView();
    await vi.waitFor(() => expect(coursePill("All courses")).toBeTruthy());

    fireEvent.click(screen.getByText("Log first meal"));

    expect(setMealLogForm.mock.calls.at(-1)[0]({}).date).toBe("2026-09-10");
  } finally {
    vi.useRealTimers();
    process.env.TZ = SYSTEM_ZONE;
  }
});
```

In `client/src/pages/dashboard/__tests__/DashboardPage.test.jsx`, after the last `vi.mock(…)` block and before `const USER`, add:

```js
// The zone the run started in, restored after each test that pins its own.
const SYSTEM_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
```

Replace the test at lines 208-231, `"a session dated today is labelled by timezone, which is a bug"` with its comment block, with:

```js
// A bare YYYY-MM-DD is a calendar date, so a session dated today is ahead
// of the visitor wherever they are. Read as UTC midnight it would sit
// before local midnight west of UTC, and be labelled "Latest", as though
// already done. Los Angeles is the zone that tells the two readings apart;
// UTC and Tokyo pin the other two sides of it.
test.each(["America/Los_Angeles", "UTC", "Asia/Tokyo"])(
  "a session dated today is upcoming in %s",
  (zone) => {
    process.env.TZ = zone;
    vi.setSystemTime(new Date(2026, 8, 11, 12, 0, 0));
    try {
      renderPage(withWorkouts([{ id: "today", date: "2026-09-11" }]));

      expect(nextWorkout().id).toBe("today");
      expect(nextWorkout().context).toBe("Upcoming");
    } finally {
      process.env.TZ = SYSTEM_ZONE;
    }
  }
);
```

The file's `beforeEach` has already installed fake timers. The test sets the clock again after it sets the zone, so local noon on 11 September is noon in the zone under test.

The replaced test pinned the bug on purpose, with a `westOfUtc` ternary. The PR says it is gone.

- [ ] **Step 3: Watch them fail**

```bash
npx vitest run src/pages/dashboard/views/__tests__/MealView.test.jsx src/pages/dashboard/__tests__/DashboardPage.test.jsx --root client > "$SCRATCH/c5a-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c5a-red.txt"
```

Expected: `exit=1`, failing exactly:

- "seeds the local date, not the UTC one", with `expected '2026-09-11' to be '2026-09-10'`;
- "a session dated today is upcoming in America/Los_Angeles", with `expected 'Latest' to be 'Upcoming'`.

The UTC and Tokyo rows pass.

- [ ] **Step 4: The meal log's date**

In `client/src/pages/dashboard/meal/MealLogPanel.jsx`, after the header (lines 1-4), add:

```js
import { getLocalDateKey } from "../../../app/units";
```

Replace the summary (lines 6-14):

```js
/**
 * A controlled form over MealView's meal-log form, saved by `onSubmitMealLog`
 * (submitMealLog in events.js). The list shows the first few of `safeMealLogs`,
 * which arrive most recently logged first. With none, "Log first meal" fills in
 * a date and a meal type where the form has none, then focuses the name field
 * through `mealLogNameInputRef`. The date it fills is the UTC one
 * (toISOString), not getLocalDateKey's, so in the evening west of UTC it is
 * tomorrow.
 */
```

with:

```js
/**
 * A controlled form over MealView's meal-log form, saved by `onSubmitMealLog`
 * (submitMealLog in events.js). The list shows the first few of `safeMealLogs`,
 * which arrive most recently logged first. With none, "Log first meal" fills in
 * today's local date (getLocalDateKey, as the other log forms do) and a meal
 * type where the form has none, then focuses the name field through
 * `mealLogNameInputRef`.
 */
```

Replace line 162:

```jsx
                  date: prev?.date || new Date().toISOString().slice(0, 10),
```

with:

```jsx
                  date: prev?.date || getLocalDateKey(),
```

- [ ] **Step 5: The next workout's date**

In `client/src/pages/dashboard/hooks/useDashboardMetrics.js`, replace lines 10-12:

```js
// A Date or null. A bare YYYY-MM-DD is read as local midnight: `new Date` would
// read it as UTC midnight, which west of UTC falls on the previous local day.
const parseDateValue = (value) => {
```

with:

```js
/**
 * A date value as a Date, or null when it is missing or does not parse. A bare
 * YYYY-MM-DD is read as local midnight: `new Date` would read it as UTC
 * midnight, which west of UTC falls on the previous local day. DashboardPage
 * reads the next workout's date through it too.
 */
export const parseDateValue = (value) => {
```

In `client/src/pages/dashboard/DashboardPage.jsx`, replace line 13:

```js
import useDashboardMetrics from "./hooks/useDashboardMetrics";
```

with:

```js
import useDashboardMetrics, { parseDateValue } from "./hooks/useDashboardMetrics";
```

Replace lines 156-165:

```js
  // The glance panel's workout: the earliest dated today or later, else the
  // most recent. The dates go through `new Date`, which reads a bare
  // YYYY-MM-DD as UTC midnight, so west of UTC a workout dated today falls
  // before local midnight and is not counted as upcoming.
  const nextWorkout = useMemo(() => {
    const parseDateAsTime = (value) => {
      if (!value) return 0;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
    };
```

with:

```js
  // The glance panel's workout: the earliest dated today or later, else the
  // most recent. A bare YYYY-MM-DD is read as local midnight, as
  // useDashboardMetrics reads it, so a workout dated today counts as upcoming
  // in every time zone. A missing or unparseable date is 0, long past.
  const nextWorkout = useMemo(() => {
    const parseDateAsTime = (value) => parseDateValue(value)?.getTime() || 0;
```

The hook-order comment above it (lines 150-155) is unchanged.

- [ ] **Step 6: Watch them pass, and commit**

```bash
npx vitest run src/pages/dashboard --root client > "$SCRATCH/c5a-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c5a-green.txt"
git add client/src/pages/dashboard/meal/MealLogPanel.jsx client/src/pages/dashboard/hooks/useDashboardMetrics.js client/src/pages/dashboard/DashboardPage.jsx client/src/pages/dashboard/views/__tests__/MealView.test.jsx client/src/pages/dashboard/__tests__/DashboardPage.test.jsx
git commit -F - <<'EOF'
fix(dashboard): read a bare date as a local calendar date

"Log first meal" seeded the UTC date, a day ahead in the evening west of
UTC, and the glance panel parsed a workout's YYYY-MM-DD as UTC midnight,
so west of UTC today's workout was labelled "Latest". The first now
uses getLocalDateKey and the second useDashboardMetrics' parseDateValue.
The tests pin the zone at runtime, so they tell the two apart in CI.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

- [ ] **Step 7: Mutation checks**

```json
[
  {
    "file": "client/src/pages/dashboard/meal/MealLogPanel.jsx",
    "find": "prev?.date || getLocalDateKey()",
    "text": "prev?.date || new Date().toISOString().slice(0, 10)"
  },
  {
    "file": "client/src/pages/dashboard/DashboardPage.jsx",
    "find": "parseDateValue(value)?.getTime() || 0",
    "text": "new Date(value).getTime() || 0"
  }
]
```

Write that to `$SCRATCH/mut-c5a.json` and apply it. Run the two test files, and expect exactly the two Los Angeles tests to fail. Then restore both files.

- [ ] **Step 8: Comments made true**

- The MealLogPanel summary no longer describes the UTC date.
- `parseDateValue`'s new `/** */` summary.
- DashboardPage's comment no longer describes the bug.
- The WorkoutsView comment on `toSortTime` ("unlike useDashboardMetrics' parseDateValue") still holds.

- [ ] **Step 9: Gates.** Run the gates from Conventions, plus `npm run test:scripts`. Visible change: the glance panel heading reads "Upcoming workout" for today's session, west of UTC. `git grep -n "Latest workout\|Upcoming workout" e2e/` should print nothing.

- [ ] **Step 10: Push and open the PR**

```bash
git push -u origin fix/client-local-dates
gh pr create --draft --base main --title "fix(dashboard): read a bare date as a local calendar date" --body-file "$SCRATCH/pr-c5a.md"
gh pr ready
gh pr checks --watch
```

`pr-c5a.md` outline:

- **Both bugs**, with the arithmetic.
- **The runtime-`TZ` technique:** why it discriminates in CI, how it is restored, and that it was checked on this machine. CLAUDE.md's claim that `TZ` cannot be set is about the shell, and is corrected in Phase 6.
- **The replaced test that pinned the bug.**
- **Mutations, coverage counts and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 11: Review, then merge.**

---

### Task C5b: Client bounds match the server's, with a contract test

Bug H. Every numeric input whose value a dashboard or sign-up form posts was paired with the schema field the server validates it with (`server/src/services/http/apiSchemaService.js`). Each server field was probed with `safeParse` at the client's bounds and one step beyond, in a scratch run on 2026-10-10.

Four pairs disagree, all with the client tighter than the server. That makes a value the server accepts unenterable:

| Input                                                     | Client (`main`) | Server                                       |
| --------------------------------------------------------- | --------------- | -------------------------------------------- |
| Goal view, daily calories (`CaloriesView.jsx:95-96`)      | 1200-5000       | 800-10000 (`caloriesBodySchema`, line 140)   |
| Goal view, target calories (`CaloriesView.jsx:168-169`)   | 1200-4000       | 1200-4500 (`goalsBodySchema`, line 147)      |
| Goal view, weekly workouts (`CaloriesView.jsx:190-193`)   | options 2-5     | 1-7 (line 148)                               |
| Log workout, duration (`DashboardWorkoutModal.jsx:80-81`) | 10-180          | 5-360 (`workoutSessionBodySchema`, line 127) |

Every other pair already matches:

- the Goal view's target weight, weight, body fat, waist and resting heart rate;
- the meal log's calories, protein, carbs and fat;
- the workout's sets, reps and intensity;
- sign-up's age, height in cm and weight in kg;
- Settings' age, body fat, height in cm and weight in kg.

The contract test pins them all, so a later edit on either side fails the suite. Settings' feet and inches, and both forms' pounds, are permissive or converted by design (`settingsFields.test.js` pins that). They stay out.

The home form and the walkthrough have narrower ranges too. But neither posts its fields, so they are out of the contract (see "Not in this phase").

**The test reads the client's bounds from the rendered forms**, as they ship, and **imports the server's schemas**, as `app/__tests__/constants.test.js` imports the server's lists. It lives at `client/src/__tests__/serverBounds.contract.test.jsx`, beside `numericCoercion.contract.test.js`, because it spans pages.

This test was run against `main`'s forms in a scratch Vitest run on 2026-10-10:

- exactly the four rows above failed: calories, target calories and duration with `expected true to be false` (the server accepted a value one step past the client's bound), and weekly workouts with `expected [ 2, 3, 4, 5 ] to deeply equal [ 1, 2, 3, 4, 5, 6, 7 ]`;
- the other 19 cases passed.

**Files:**

- Create test: `client/src/__tests__/serverBounds.contract.test.jsx`
- Modify: `client/src/pages/dashboard/views/CaloriesView.jsx:95-96, 168-169, 190-193`
- Modify: `client/src/pages/dashboard/components/DashboardWorkoutModal.jsx:80-81`

**New statements, branches and functions:** none. Attribute values and three `<option>` elements are markup.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-server-bounds origin/main
```

- [ ] **Step 2: Write the failing contract test**

Create `client/src/__tests__/serverBounds.contract.test.jsx`:

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import AuthPage from "../pages/auth/AuthPage";
import CaloriesView from "../pages/dashboard/views/CaloriesView";
import DashboardWorkoutModal from "../pages/dashboard/components/DashboardWorkoutModal";
import MealLogPanel from "../pages/dashboard/meal/MealLogPanel";
import { fieldsForTab } from "../pages/dashboard/settings/settingsFields";
import {
  caloriesBodySchema,
  goalsBodySchema,
  mealLogBodySchema,
  profileBodySchema,
  progressMetricBodySchema,
  workoutSessionBodySchema
} from "../../../server/src/services/http/apiSchemaService.js";

// Every numeric input whose value is posted to a route with a numeric schema,
// held to that schema's range. The client's bounds are attributes on rendered
// inputs, so each form is rendered and read as it ships; the server's are
// probed through the schema it validates with, imported directly. A client
// range tighter than the server's makes a value the server accepts
// unenterable, and a looser one lets through a value the server answers 400.
//
// The home form and the walkthrough are left out: neither posts its fields,
// and sign-up, which does, is here. Feet and inches, and pounds, are converted
// before they are sent, and settingsFields.test.js pins how.

const noop = () => {};

const renderCaloriesView = () =>
  render(
    <CaloriesView
      goalForm={{ targetWeight: "", targetCalories: "", weeklyWorkouts: "3" }}
      setGoalForm={noop}
      avgCalories={0}
      calorieGoal={2200}
      calorieDelta={0}
      buildLinePath={() => ""}
      calorieSeries={[]}
      workoutSeries={[]}
      last7Keys={[]}
      submitCalories={noop}
      calorieForm={{ calories: "" }}
      setCalorieForm={noop}
      calories={[]}
      goalPaceText=""
      submitGoals={noop}
      progressMetrics={[]}
      progressForm={{
        date: "",
        weightLb: "",
        bodyFatPct: "",
        waistCm: "",
        restingHr: "",
        notes: ""
      }}
      setProgressForm={noop}
      submitProgressMetric={noop}
    />
  );

const renderMealLogPanel = () =>
  render(
    <MealLogPanel
      safeMealLogForm={{
        date: "",
        mealType: "breakfast",
        name: "",
        calories: "",
        proteinG: "",
        carbsG: "",
        fatG: "",
        notes: ""
      }}
      safeMealLogs={[]}
      updateMealLogForm={noop}
      onSubmitMealLog={noop}
      mealLogNameInputRef={{ current: null }}
    />
  );

const renderWorkoutModal = () =>
  render(
    <DashboardWorkoutModal
      open
      workoutForm={{}}
      setWorkoutForm={noop}
      onClose={noop}
      onSubmit={noop}
    />
  );

const renderSignup = () =>
  render(
    <AuthPage
      gradient={{}}
      authMode="signup"
      onAuthModeChange={noop}
      go={noop}
      onAuthSubmit={noop}
      authForm={{ email: "", password: "" }}
      onAuthChange={noop}
      signupProfileForm={{ heightCm: "", heightFeet: "", heightInches: "", weight: "" }}
      onSignupProfileChange={noop}
      signupHeightUnit="cm"
      setSignupHeightUnit={noop}
      signupWeightUnit="kg"
      setSignupWeightUnit={noop}
      toCmFromFeetInches={() => ""}
      toFeetInchesFromCm={() => ({ feet: "", inches: "" })}
      toKg={() => ""}
      toLb={() => ""}
      showPassword={false}
      setShowPassword={noop}
      authAutoSignIn={false}
      setAuthAutoSignIn={noop}
      authLoading={false}
      authError=""
    />
  );

const byLabel = (label) => () => screen.getByLabelText(label);
// The sign-up inputs sit in labels that also hold the unit toggle, so their
// label text is ambiguous; their names are not.
const byName = (name) => () => document.querySelector(`input[name="${name}"]`);

const INPUTS = [
  [
    "Goal: daily calories",
    renderCaloriesView,
    byLabel("Calories"),
    caloriesBodySchema.shape.calories
  ],
  [
    "Goal: target weight",
    renderCaloriesView,
    byLabel("Target weight (lb)"),
    goalsBodySchema.shape.targetWeight
  ],
  [
    "Goal: target calories",
    renderCaloriesView,
    byLabel("Target calories"),
    goalsBodySchema.shape.targetCalories
  ],
  [
    "Goal: weight",
    renderCaloriesView,
    byLabel("Weight lb"),
    progressMetricBodySchema.shape.weightLb
  ],
  [
    "Goal: body fat",
    renderCaloriesView,
    byLabel("Body fat (%)"),
    progressMetricBodySchema.shape.bodyFatPct
  ],
  [
    "Goal: waist",
    renderCaloriesView,
    byLabel("Waist (cm)"),
    progressMetricBodySchema.shape.waistCm
  ],
  [
    "Goal: resting heart rate",
    renderCaloriesView,
    byLabel("Resting HR"),
    progressMetricBodySchema.shape.restingHr
  ],
  ["Meal log: calories", renderMealLogPanel, byLabel("Calories"), mealLogBodySchema.shape.calories],
  [
    "Meal log: protein",
    renderMealLogPanel,
    byLabel("Protein (g)"),
    mealLogBodySchema.shape.proteinG
  ],
  ["Meal log: carbs", renderMealLogPanel, byLabel("Carbs (g)"), mealLogBodySchema.shape.carbsG],
  ["Meal log: fat", renderMealLogPanel, byLabel("Fat (g)"), mealLogBodySchema.shape.fatG],
  [
    "Workout: duration",
    renderWorkoutModal,
    byLabel("Duration (minutes)"),
    workoutSessionBodySchema.shape.duration
  ],
  ["Workout: sets", renderWorkoutModal, byLabel("Sets"), workoutSessionBodySchema.shape.sets],
  ["Workout: reps", renderWorkoutModal, byLabel("Reps"), workoutSessionBodySchema.shape.reps],
  [
    "Workout: intensity",
    renderWorkoutModal,
    byLabel("Intensity (RPE 1-10)"),
    workoutSessionBodySchema.shape.intensityRpe
  ],
  ["Sign-up: age", renderSignup, byName("age"), profileBodySchema.shape.age],
  ["Sign-up: height in cm", renderSignup, byName("heightCm"), profileBodySchema.shape.heightCm],
  ["Sign-up: weight in kg", renderSignup, byName("weight"), profileBodySchema.shape.weightKg]
];

const accepts = (field, value) => field.safeParse(value).success;
const stepOf = (input) => (input.step ? Number(input.step) : 1);
// 2 - 0.1 and 250 + 0.1 must be the decimals they look like.
const nudge = (value) => Number(value.toFixed(4));

describe("client input bounds match the server's", () => {
  // Accepted at both of the client's bounds and refused one step past each, so
  // the two ranges are equal to the input's own precision.
  test.each(INPUTS)("%s", (_label, renderForm, findInput, field) => {
    renderForm();
    const input = findInput();
    const min = Number(input.min);
    const max = Number(input.max);

    expect(accepts(field, min)).toBe(true);
    expect(accepts(field, max)).toBe(true);
    expect(accepts(field, nudge(min - stepOf(input)))).toBe(false);
    expect(accepts(field, nudge(max + stepOf(input)))).toBe(false);
  });

  test("Goal: the weekly workouts offered are every count the server accepts", () => {
    renderCaloriesView();
    const offered = Array.from(screen.getByLabelText("Weekly workouts").options, (option) =>
      Number(option.value)
    );
    const accepted = Array.from({ length: 15 }, (_, count) => count).filter((count) =>
      accepts(goalsBodySchema.shape.weeklyWorkouts, count)
    );

    expect(offered).toEqual(accepted);
  });

  // Settings declares its bounds as data, so they are read rather than
  // rendered. These are the metric ones; the unit conversions are pinned in
  // settingsFields.test.js.
  test.each([
    ["age", (field) => field.bounds, profileBodySchema.shape.age],
    ["bodyFat", (field) => field.bounds, profileBodySchema.shape.bodyFat],
    ["heightCm", (field) => field.bounds.cm, profileBodySchema.shape.heightCm],
    ["weight", (field) => field.bounds.kg, profileBodySchema.shape.weightKg]
  ])("Settings: %s", (name, boundsOf, field) => {
    const [min, max] = boundsOf(fieldsForTab("profile").find((entry) => entry.name === name));

    expect(accepts(field, min)).toBe(true);
    expect(accepts(field, max)).toBe(true);
    expect(accepts(field, min - 1)).toBe(false);
    expect(accepts(field, max + 1)).toBe(false);
  });
});
```

Prettier will break some `INPUTS` rows past width 100. Let it, and keep one array per row.

The server import goes three levels up from `client/src/__tests__` to the repo root. A client test may import server modules (CLAUDE.md), and this one only reads schemas. Like `profileContract.test.js`, which imports the same file, it pulls in `zod` and `dashboardDataBuildersService.js` and nothing that opens a connection.

- [ ] **Step 3: Watch it fail**

```bash
npx vitest run src/__tests__/serverBounds.contract.test.jsx --root client > "$SCRATCH/c5b-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c5b-red.txt"
```

Expected: `exit=1`, failing exactly "Goal: daily calories", "Goal: target calories", "Workout: duration" and "Goal: the weekly workouts offered…". 4 failed, 19 passed.

- [ ] **Step 4: Widen the four**

In `client/src/pages/dashboard/views/CaloriesView.jsx`:

- In the daily calories input (lines 95-96), change `min="1200"` to `min="800"` and `max="5000"` to `max="10000"`.
- In the target calories input (lines 168-169), change `max="4000"` to `max="4500"`.
- Replace the weekly workouts options (lines 190-193):

```jsx
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
```

with:

```jsx
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                  <option value="6">6</option>
                  <option value="7">7</option>
```

A stored goal of 1, 6 or 7 now has a matching option, where React used to show the first option while state held another value.

In `client/src/pages/dashboard/components/DashboardWorkoutModal.jsx`, in the duration input (lines 80-81), change `min="10"` to `min="5"` and `max="180"` to `max="360"`.

- [ ] **Step 5: Watch it pass, and commit**

```bash
npx vitest run src/__tests__/serverBounds.contract.test.jsx src/pages/dashboard/views/__tests__/CaloriesView.test.jsx src/pages/dashboard/components/__tests__/DashboardWorkoutModal.test.jsx --root client > "$SCRATCH/c5b-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c5b-green.txt"
git add client/src/__tests__/serverBounds.contract.test.jsx client/src/pages/dashboard/views/CaloriesView.jsx client/src/pages/dashboard/components/DashboardWorkoutModal.jsx
git commit -F - <<'EOF'
fix(dashboard): log and goal inputs accept what the server accepts

Daily calories (1200-5000 against the server's 800-10000), target
calories (max 4000 against 4500), weekly workouts (2-5 against 1-7) and
workout duration (10-180 against 5-360) blocked values the server takes.
A contract test now renders every posted numeric input and probes the
server schema it is validated with.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

- [ ] **Step 6: Mutation check**

```json
[
  {
    "file": "client/src/pages/dashboard/views/CaloriesView.jsx",
    "find": "min=\"800\"",
    "text": "min=\"1200\""
  },
  {
    "file": "client/src/pages/dashboard/views/CaloriesView.jsx",
    "find": "                  <option value=\"7\">7</option>\n",
    "text": ""
  }
]
```

Write that to `$SCRATCH/mut-c5b.json`, apply it, run the contract test, and expect "Goal: daily calories" and the weekly workouts test to fail. Restore `CaloriesView.jsx`.

- [ ] **Step 7: Comments made true.** No code comment names these bounds. The new test's header says what it pins and what it leaves out, as SOP rule 7 asks.

- [ ] **Step 8: Gates.** The visible change is the validation range of four inputs and three new options. The smoke spec fills the duration with 45, inside both ranges. `git grep -n "Weekly workouts\|Duration (minutes)" e2e/` shows only that fill. Run the gates from Conventions, plus `npm run test:scripts`.

- [ ] **Step 9: Push and open the PR**

```bash
git push -u origin fix/client-server-bounds
gh pr create --draft --base main --title "fix(dashboard): log and goal inputs accept what the server accepts" --body-file "$SCRATCH/pr-c5b.md"
gh pr ready
gh pr checks --watch
```

`pr-c5b.md` outline:

- **Every pair**, with the four that moved.
- **How the contract reads each side.**
- **What it leaves out, and why:** the home form and walkthrough; feet, inches and pounds.
- **The scratch run's red result on `main`.**
- **Mutation and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 10: Review, then merge.**

---

### Task C5c: `Intl.Locale` reads the region

Bug L. `getRegionFromLocale` (`app/units.js:27-44`) takes the second subtag whenever there is one. So `zh-Hant-TW` gives `"HANT"` and `en-Latn-US` gives `"LATN"`, and a US visitor whose browser names the script is shown metric.

The fix asks `Intl.Locale` first, after turning `_` into `-`, since it takes hyphens only. It falls back to the second subtag only when the tag will not parse.

Checked in Node 24 on 2026-10-10:

| Tag                        | `Intl.Locale(...).region` |
| -------------------------- | ------------------------- |
| `zh-Hant-TW`               | `TW`                      |
| `en-Latn-US`               | `US`                      |
| `en_US`, after the replace | `US`                      |
| `en`, `zh-Hant`            | `undefined`               |
| `cnr`                      | `ME`                      |
| `es-419`                   | `419`                     |
| `en--US`, `!!!`, `x`, `""` | throws `RangeError`       |

**Files:**

- Modify: `client/src/app/units.js:27-44`
- Test: `client/src/app/__tests__/units.test.js` (inside `describe("getRegionFromLocale"`, 55-85, and `describe("getPreferredMeasurementSystem"`, from 86)

**New statements, branches and functions, and what runs each:** the `if` that returns for no locale is kept. `.region || ""` has 2 arms: `"en-US"` for one and `"en"` for the other. The fallback's `?:` has 2 arms: `"en--us"` for one and `"!!!"` for the other. The old second-subtag `if` and `region ? :` go, and the latter's uncovered arm at line 40 with them.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-locale-region origin/main
```

- [ ] **Step 2: Write the failing tests**

In `client/src/app/__tests__/units.test.js`, inside `describe("getRegionFromLocale", …)`, after the test `"returns nothing for a bare language"` (lines 65-69), add:

```js
// A script subtag sits between the language and the region, so the second
// subtag is not always the region.
test.each([
  ["zh-Hant-TW", "TW"],
  ["en-Latn-US", "US"],
  ["sr-Latn-RS", "RS"]
])("reads the region, not the script, out of %s", (locale, expected) => {
  expect(getRegionFromLocale(locale)).toBe(expected);
});

test("a script with no region gives no region", () => {
  expect(getRegionFromLocale("zh-Hant")).toBe("");
});

// Intl.Locale refuses a doubled separator; the fallback still reads the
// second subtag, as before.
test("a tag Intl.Locale cannot parse falls back to its second subtag", () => {
  expect(getRegionFromLocale("en--us")).toBe("US");
});
```

Replace the comment above `"returns nothing for a bare language"` (lines 65-66):

```js
// A bare language has no region in the tag, so it falls through to Intl,
// which does not invent one either.
```

with:

```js
// A bare language has no region, and Intl.Locale does not invent one.
```

Inside `describe("getPreferredMeasurementSystem", …)`, after the `chooses imperial for %s` test (lines 92-96), add:

```js
test("chooses imperial for a US locale that names its script", () => {
  withLanguages(["en-Latn-US"]);

  expect(getPreferredMeasurementSystem()).toBe("imperial");
});
```

- [ ] **Step 3: Watch them fail**

```bash
npx vitest run src/app/__tests__/units.test.js --root client > "$SCRATCH/c5c-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c5c-red.txt"
```

Expected: `exit=1`.

- The three script rows fail with `expected 'HANT' to be 'TW'`, then the same for `'LATN'`.
- "a script with no region" fails with `expected 'HANT' to be ''`.
- The `en-Latn-US` system test fails with `expected 'metric' to be 'imperial'`.
- The fallback test passes already. It is the guard for Step 4's `catch`.

- [ ] **Step 4: Ask `Intl.Locale` first**

Replace lines 27-44 of `client/src/app/units.js`:

```js
/**
 * The region of a locale tag, upper-cased ("en-US" and "en_us" both give "US"),
 * or "" when there is none. It takes the second subtag when there is one, so it
 * assumes language-REGION; a bare language is asked of Intl.Locale.
 */
export const getRegionFromLocale = (locale) => {
  if (!locale || typeof locale !== "string") return "";
  const localeParts = locale.split(/[-_]/).filter(Boolean);
  if (localeParts.length > 1 && localeParts[1]) {
    return localeParts[1].toUpperCase();
  }
  try {
    const parsed = new Intl.Locale(locale);
    return parsed.region ? parsed.region.toUpperCase() : "";
  } catch {
    return "";
  }
};
```

with:

```js
/**
 * The region of a locale tag, upper-cased ("en-US" and "en_us" both give "US"),
 * or "" when there is none. Intl.Locale reads the tag, so a script subtag is not
 * taken for the region ("zh-Hant-TW" gives "TW"). A tag it cannot parse falls
 * back to its second subtag.
 */
export const getRegionFromLocale = (locale) => {
  if (!locale || typeof locale !== "string") return "";
  try {
    // Intl.Locale takes hyphens only, and returns the region upper-cased.
    return new Intl.Locale(locale.replace(/_/g, "-")).region || "";
  } catch {
    const localeParts = locale.split(/[-_]/).filter(Boolean);
    return localeParts.length > 1 ? localeParts[1].toUpperCase() : "";
  }
};
```

The tests that stub `Intl.DateTimeFormat` in `usePreviewDerivedData.test.jsx` leave `Intl.Locale` alone, so the preview's region chain still sees the real one.

- [ ] **Step 5: Watch them pass, and commit**

```bash
npx vitest run src/app/__tests__/units.test.js src/pages/home/preview/hooks/__tests__/usePreviewDerivedData.test.jsx src/pages/dashboard/views/__tests__/SettingsView.test.jsx src/__tests__/App.test.jsx --root client > "$SCRATCH/c5c-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c5c-green.txt"
git add client/src/app/units.js client/src/app/__tests__/units.test.js
git commit -F - <<'EOF'
fix(units): a script subtag is not the region

getRegionFromLocale took the second subtag, so "zh-Hant-TW" gave "HANT"
and "en-Latn-US" gave "LATN", and a US visitor whose browser names its
script was shown metric. It now asks Intl.Locale, and falls back to the
second subtag only for a tag Intl.Locale cannot parse.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

- [ ] **Step 6: Mutation check**

```json
[
  {
    "file": "client/src/app/units.js",
    "find": "    return new Intl.Locale(locale.replace(/_/g, \"-\")).region || \"\";",
    "text": "    throw new Error(\"skip Intl.Locale\");"
  }
]
```

Write that to `$SCRATCH/mut-c5c.json`. Apply it, run `units.test.js`, expect the script rows and "a script with no region" to fail, and restore `units.js`. The JSON's `/_/g` holds no backslash, so it needs no `String.raw`.

- [ ] **Step 7: Comments made true.** The summary no longer says it "assumes language-REGION". The test comment on a bare language no longer says it "falls through to Intl".

- [ ] **Step 8: Gates.** No E2E test sets a script-tagged locale. Run the gates from Conventions, plus `npm run test:scripts`.

- [ ] **Step 9: Push and open the PR**

```bash
git push -u origin fix/client-locale-region
gh pr create --draft --base main --title "fix(units): a script subtag is not the region" --body-file "$SCRATCH/pr-c5c.md"
gh pr ready
gh pr checks --watch
```

`pr-c5c.md` outline:

- **The bug**, with the table of tags checked in Node.
- **Why the fallback stays.**
- **Tests, mutation, coverage counts and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 10: Review, then merge.**

---

### Task C5d: `/dashboard/constructor` is not a view

Bug J. `resolveDashViewFromPath` returns `DASHBOARD_ROUTE_VIEW_MAP[slug] || null` (`app/routing.js:22`) over a plain object (`constants.js:191-201`). So `constructor`, `toString`, `hasOwnProperty` and `__proto__` resolve to members every object inherits.

App then sets `dashView` to a function (`App.jsx:444-446`). `shouldLoadAmbientData: dashView === "summary"` (line 156) is false, so weather and air never load. DashboardPage falls back to the summary (line 254), and no nav item is active.

`Object.hasOwn` fixes the lookup without changing the map's shape. It is ES2022 and inside the Vite 8 build's default targets. `__proto__` in an object literal sets the prototype rather than an own key, so `Object.hasOwn(map, "__proto__")` is false.

**Files:**

- Modify: `client/src/app/routing.js:7-23`
- Modify: `client/src/App.jsx:440-442` (comment)
- Modify: `client/src/pages/dashboard/DashboardPage.jsx:251-253` (comment)
- Test: `client/src/app/__tests__/routing.test.js` (after line 44)
- Test: `client/src/__tests__/App.test.jsx` (after the test at 157-165)

**New statements, branches and functions, and what runs each:** a `?:` (2 arms) replaces `|| null` (2 arms). Every known slug runs one arm, and `/dashboard/nope` with the four inherited names runs the other.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-inherited-route-slugs origin/main
```

- [ ] **Step 2: Write the failing tests**

In `client/src/app/__tests__/routing.test.js`, before the describe's closing `});` (line 45), add:

```js
// The map is a plain object, so a slug naming a member every object inherits
// must still be unknown rather than resolve to that member.
test.each([["constructor"], ["toString"], ["hasOwnProperty"], ["__proto__"]])(
  "/dashboard/%s resolves to null",
  (slug) => {
    expect(resolveDashViewFromPath(`/dashboard/${slug}`)).toBeNull();
  }
);
```

In `client/src/__tests__/App.test.jsx`, after the test `"a dashboard path it does not recognise leaves the view alone"` (lines 157-165), add:

```jsx
test("a slug naming an inherited member opens the summary", () => {
  // As a view, Object itself is a function, and a function as dashView
  // turns off the summary's weather and air-quality load.
  setPath("/dashboard/constructor");
  render(<App />);

  expect(dash.props.dashView).toBe("summary");
});
```

- [ ] **Step 3: Watch them fail**

```bash
npx vitest run src/app/__tests__/routing.test.js src/__tests__/App.test.jsx --root client > "$SCRATCH/c5d-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c5d-red.txt"
```

Expected: `exit=1`.

- The four routing rows fail with `expected [Function …] to be null`. For `__proto__`, it is `expected {} to be null`, because the prototype is `Object.prototype`.
- The App test fails with `expected [Function Object] to be 'summary'`.

- [ ] **Step 4: Own keys only**

Replace lines 7-23 of `client/src/app/routing.js`:

```js
/**
 * "/dashboard" (with or without a trailing slash) is the summary, and
 * "/dashboard/<slug>/..." is the view DASHBOARD_ROUTE_VIEW_MAP gives the slug.
 * Null for any path outside /dashboard, and for a slug the map does not know,
 * except a slug naming a member every object inherits: the map is a plain
 * object, so /dashboard/constructor resolves to that member rather than null.
 */
export const resolveDashViewFromPath = (path) => {
  if (path === "/dashboard" || path === "/dashboard/") {
    return "summary";
  }
  if (!path.startsWith("/dashboard/")) {
    return null;
  }
  const slug = path.slice("/dashboard/".length).split("/")[0];
  return DASHBOARD_ROUTE_VIEW_MAP[slug] || null;
};
```

with:

```js
/**
 * "/dashboard" (with or without a trailing slash) is the summary, and
 * "/dashboard/<slug>/..." is the view DASHBOARD_ROUTE_VIEW_MAP gives the slug.
 * Null for any path outside /dashboard, and for a slug that is not one of the
 * map's own keys, so /dashboard/constructor is null rather than the member
 * every object inherits.
 */
export const resolveDashViewFromPath = (path) => {
  if (path === "/dashboard" || path === "/dashboard/") {
    return "summary";
  }
  if (!path.startsWith("/dashboard/")) {
    return null;
  }
  const slug = path.slice("/dashboard/".length).split("/")[0];
  return Object.hasOwn(DASHBOARD_ROUTE_VIEW_MAP, slug) ? DASHBOARD_ROUTE_VIEW_MAP[slug] : null;
};
```

In `client/src/App.jsx`, replace lines 440-442:

```js
// The URL picks the dashboard view on every route change, back and forward
// included. A path that names no view leaves the last one as it was, except a
// slug that routing.js resolves to an inherited member, which replaces it.
```

with:

```js
// The URL picks the dashboard view on every route change, back and forward
// included. A path that names no view leaves the last one as it was.
```

In `client/src/pages/dashboard/DashboardPage.jsx`, replace lines 251-253:

```js
// A name outside the list falls back to the summary. App can hand over one:
// DASHBOARD_ROUTE_VIEW_MAP is a plain object, so a slug such as
// /dashboard/constructor resolves to an inherited member rather than null.
```

with:

```js
// A name outside the list falls back to the summary. App only hands over the
// names routing.js maps, so this guards the page rather than a path the app
// takes.
```

The fallback stays. Deleting it would be a Phase 5 deletion, and `DashboardPage.test.jsx`'s "a view name it does not know falls back to the summary" still covers it.

- [ ] **Step 5: Watch them pass, and commit**

```bash
npx vitest run src/app/__tests__/routing.test.js src/__tests__/App.test.jsx src/pages/dashboard/__tests__/DashboardPage.test.jsx --root client > "$SCRATCH/c5d-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c5d-green.txt"
git add client/src/app/routing.js client/src/App.jsx client/src/pages/dashboard/DashboardPage.jsx client/src/app/__tests__/routing.test.js client/src/__tests__/App.test.jsx
git commit -F - <<'EOF'
fix(routing): a slug naming an inherited member is not a view

The route map is a plain object, so /dashboard/constructor resolved to
Object itself, and a function as dashView turned off the summary's
weather and air-quality load. Only the map's own keys resolve now.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

- [ ] **Step 6: Mutation check**

```json
[
  {
    "file": "client/src/app/routing.js",
    "find": "Object.hasOwn(DASHBOARD_ROUTE_VIEW_MAP, slug) ? DASHBOARD_ROUTE_VIEW_MAP[slug] : null",
    "text": "DASHBOARD_ROUTE_VIEW_MAP[slug] || null"
  }
]
```

Write that to `$SCRATCH/mut-c5d.json`. Apply it, run `routing.test.js` and `App.test.jsx`, expect the new tests to fail, and restore `routing.js`.

- [ ] **Step 7: Comments made true.** The routing summary, the App comment and the DashboardPage comment no longer describe the inherited-member path.

- [ ] **Step 8: Gates.** Run the gates from Conventions, plus `npm run test:scripts`. No visible text changes.

- [ ] **Step 9: Push and open the PR**

```bash
git push -u origin fix/client-inherited-route-slugs
gh pr create --draft --base main --title "fix(routing): a slug naming an inherited member is not a view" --body-file "$SCRATCH/pr-c5d.md"
gh pr ready
gh pr checks --watch
```

`pr-c5d.md` outline:

- **The four names** and what each did.
- **Why `Object.hasOwn` over `Map` or `Object.create(null)`:** the map's shape and literal syntax stay.
- **The three comments**, and why the DashboardPage fallback stays.
- **Tests, mutation and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 10: Review, then merge.**

---

### Task C5e: "Back to dashboard"

Default #4. `DashboardHomeView` (reached only at `/dashboard/home`) has a "Back to home" button that calls `go("/")`. App then sends any signed-in visitor on `/` to `/dashboard` (`App.jsx:483-488`), and the view only renders when signed in. So the label promises the landing page and the visitor gets the summary.

The button is relabelled "Back to dashboard" and goes to `/dashboard` directly. App's route effect then resolves the summary view. The paragraph above it, "Return to the main home planner.", becomes untrue with the label, so it changes too.

The view is at 0% on `main` (0/2 statements, 0/2 functions; DashboardPage's tests stub it), so its new test raises both counts.

**Files:**

- Modify: `client/src/pages/dashboard/views/DashboardHomeView.jsx:1-22`
- Create test: `client/src/pages/dashboard/views/__tests__/DashboardHomeView.test.jsx`

**New statements, branches and functions, and what runs each:** none added. The component and its click handler, both uncovered today, are run by the new test.

- [ ] **Step 1: Branch**

```bash
git fetch origin && git switch -c fix/client-back-to-dashboard origin/main
```

- [ ] **Step 2: Write the failing test**

Create `client/src/pages/dashboard/views/__tests__/DashboardHomeView.test.jsx`:

```jsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import DashboardHomeView from "../DashboardHomeView";

// Pins where the dashboard's Home view sends a visitor. It only renders for a
// signed-in visitor, whom App would send from "/" straight back to
// /dashboard, so the button names and goes to the dashboard. `go` is a spy.

test("the button goes back to the dashboard", () => {
  const go = vi.fn();
  render(<DashboardHomeView go={go} />);

  fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));

  expect(go).toHaveBeenCalledWith("/dashboard");
});

test("says where the button goes", () => {
  render(<DashboardHomeView go={vi.fn()} />);

  expect(screen.getByText("Return to your dashboard summary.")).toBeInTheDocument();
});
```

- [ ] **Step 3: Watch it fail**

```bash
npx vitest run src/pages/dashboard/views/__tests__/DashboardHomeView.test.jsx --root client > "$SCRATCH/c5e-red.txt" 2>&1; echo "exit=$?"; grep -E "×|Tests " "$SCRATCH/c5e-red.txt"
```

Expected: `exit=1`, both failing with `Unable to find an accessible element with the role "button" and name "Back to dashboard"` and `Unable to find an element with the text: Return to your dashboard summary.`.

- [ ] **Step 4: Relabel and retarget**

Replace `client/src/pages/dashboard/views/DashboardHomeView.jsx` (all 22 lines) with:

```jsx
/**
 * The dashboard's Home view, a link back to the dashboard summary. Reached only
 * at /dashboard/home: neither the drawer nor the bottom nav lists it. Rendered
 * by DashboardPage, which loads it lazily.
 */
import "./DashboardHomeView.css";

/**
 * "Back to dashboard" goes to /dashboard, the summary. The view renders only
 * for a signed-in visitor, and App would send one on "/" back to /dashboard
 * anyway, so the landing page is not a destination it can offer.
 */
export default function DashboardHomeView({ go }) {
  return (
    <section className="panel dashboard-home-view">
      <p className="muted">Return to your dashboard summary.</p>
      <button type="button" className="back-btn" onClick={() => go("/dashboard")}>
        Back to dashboard
      </button>
    </section>
  );
}
```

`DashboardHomeView.css` styles `.dashboard-home-view` and the `.back-btn`, not the text, so the longer label needs no CSS change. Check the view at 390 px wide in the browser if the reviewer asks.

- [ ] **Step 5: Watch it pass, and commit**

```bash
npx vitest run src/pages/dashboard/views/__tests__/DashboardHomeView.test.jsx src/pages/dashboard/__tests__/DashboardPage.test.jsx --root client > "$SCRATCH/c5e-green.txt" 2>&1; echo "exit=$?"; grep -E "Tests " "$SCRATCH/c5e-green.txt"
git add client/src/pages/dashboard/views/DashboardHomeView.jsx client/src/pages/dashboard/views/__tests__/DashboardHomeView.test.jsx
git commit -F - <<'EOF'
fix(dashboard): the Home view's button says Back to dashboard

"Back to home" went to "/", which App sends a signed-in visitor away
from, back to /dashboard. The button now names that destination and goes
there directly.

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
```

Expected: `exit=0`.

- [ ] **Step 6: Mutation check**

```json
[
  {
    "file": "client/src/pages/dashboard/views/DashboardHomeView.jsx",
    "find": "go(\"/dashboard\")",
    "text": "go(\"/\")"
  }
]
```

Write that to `$SCRATCH/mut-c5e.json`. Apply it, run the new test, expect "the button goes back to the dashboard" to fail, and restore the view.

- [ ] **Step 7: Comments made true.** The header and the summary describe the new destination.

- [ ] **Step 8: Visible text.** `git grep -n "Back to home\|Back to dashboard\|main home planner" e2e/` should print nothing. Then run the gates from Conventions, plus `npm run test:scripts`. The axe scan does not visit `/dashboard/home`.

- [ ] **Step 9: Push and open the PR**

```bash
git push -u origin fix/client-back-to-dashboard
gh pr create --draft --base main --title "fix(dashboard): the Home view's button says Back to dashboard" --body-file "$SCRATCH/pr-c5e.md"
gh pr ready
gh pr checks --watch
```

`pr-c5e.md` outline:

- **Default #4, and the redirect** that made "Back to home" untrue.
- **The paragraph change.**
- **That the view goes from 0% covered to covered.**
- **Mutation and gates.**
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 10: Review, then merge.**

---

### Task C6: The client floor PR

Modelled on Phase 2's Task 6 and PR #204, client side only. The server track raises its own floors in S5.

**Files:**

- Modify: `client/vite.config.js:48-74` (the measurement note in the comment, and `thresholds`)

- [ ] **Step 1: Measure `main`**

```bash
git fetch origin
git switch -c chore/phase-3-client-floors origin/main
npm ci > "$SCRATCH/ci-floor.txt" 2>&1; echo "npm ci exit=$?"
npm run test:coverage -w client -- --coverage.reporter=text --coverage.reporter=json-summary > "$SCRATCH/cov-floor.txt" 2>&1; echo "test:coverage exit=$?"
node -e "const t=require('./client/coverage/coverage-summary.json').total; for (const k of ['statements','branches','functions','lines']) console.log(k, t[k].covered + '/' + t[k].total, (100*t[k].covered/t[k].total).toFixed(4))"
```

Expected: `exit=0` for both, and four lines of exact counts. Record the `Tests` line from `cov-floor.txt` too.

- [ ] **Step 2: Raise every floor whose truncated measurement went up**

For each metric, the candidate floor is `Math.floor(measured * 10) / 10`. Raise the floor in `thresholds` only where that is higher than today's (98.7 / 93.7 / 98.7 / 99.3). Never lower one.

In the comment above `thresholds`, after the line ``// Re-measure with `npm run test:coverage -w client` before changing them.``, add the measurement note, in the style the server config uses:

```js
// Measured 2026-MM-DD (SS.SS / BB.BB / FF.FF / LL.LL), floored one
// decimal below.
```

Use the date of the run and the four figures, to two decimals. If no truncated value went up, open no PR and say so in the phase report.

- [ ] **Step 3: Prove it, commit, open the PR**

```bash
npm run test:coverage -w client > "$SCRATCH/cov-floor2.txt" 2>&1; echo "test:coverage exit=$?"
npm run lint > "$SCRATCH/lint-floor.txt" 2>&1; echo "lint exit=$?"
npm run format:check > "$SCRATCH/fmt-floor.txt" 2>&1; echo "format:check exit=$?"
npm run test:scripts > "$SCRATCH/scripts-floor.txt" 2>&1; echo "test:scripts exit=$?"
git add client/vite.config.js
git commit -m "chore(coverage): raise the client floors after Phase 3" -m "Co-Authored-By: claude-flow <ruv@ruv.net>"
git push -u origin chore/phase-3-client-floors
gh pr create --base main --title "chore(coverage): raise the client floors after Phase 3" --body-file "$SCRATCH/pr-floors.md"
```

Expected: every exit `0`. `pr-floors.md` follows #204's body:

- **What changed:** which floors moved, the rule (truncate, raise only, never lower), and the Phase 3 client PRs merged, C1 to C5e, with their numbers.
- **A table:** Metric, Covered / total, Measured to four decimals, Floor before, Floor after. Use the counts from Step 1.
- **The client tests before (2311) and after.**
- **A headroom table:** covered against the least each new floor accepts, so the next phase knows which metrics have none.
- **Verification:** `test:coverage` with the new floors, lint, format:check, test:scripts.
- The `🤖 Generated with [claude-flow](https://github.com/ruvnet/claude-flow)` line.

- [ ] **Step 4: Review, then merge.** The quality review recomputes each percentage and its truncation from the counts in the body.

---

## Not in this phase

| Item                                                                                                                                                                                                                                                | Where it goes                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Bug M: GeneratedPlanModal, its state, its tests and its `.plan-modal` CSS                                                                                                                                                                           | Phase 5, D1                                                                        |
| Bug N: the "Enviroment" typo (`PlannerSetupModal.jsx:25`, pinned in two tests)                                                                                                                                                                      | Phase 5, D2                                                                        |
| Bug O: the dead CSRF fallback in `useApiClient.js:57`                                                                                                                                                                                               | Phase 5, D2                                                                        |
| The reduced-motion gates, the reduced-motion CSS and the four visible cascade fixes                                                                                                                                                                 | Phase 4, M1, M2 and K1 to K4                                                       |
| Folding `toProfileNumber` (`app/profileMapping.js`) and `useBodyModel`'s private `toFiniteNumber` into C2's `toNumberOrNull`: each would delete a copy                                                                                              | Phase 5, as a deletion, or left as it is. Owner's call                             |
| `usePreviewDerivedData.js:149`'s `previewBodyFat`, the last `Number.isFinite(Number(…))` in the client, computed for nothing (PR #186)                                                                                                              | Phase 5, as a deletion                                                             |
| `IMPERIAL_REGION_CODES` duplicated in `app/units.js` and `home/preview/constants.js` (PR #196)                                                                                                                                                      | Phase 5                                                                            |
| The home form's and the walkthrough's ranges (age 10-99, height 120-230 cm or 3-7 ft, weight 35-200 kg) are narrower than the server's. Neither posts its fields, so C5b's contract leaves them out, but a 110 cm visitor cannot try the visualiser | Owner decision; parked                                                             |
| An earlier entry's success toast replaces a later entry's Undo toast. Found while writing C3c's test, and present on `main` today                                                                                                                   | Owner decision; a follow-up beside C3c's withdrawn Undo if wanted                  |
| A late _failure_ answer in `events.js` (an error message and toast after logout) and `changePassword`'s success toast are not guarded by C3a. They carry no account data                                                                            | Accepted, and stated in C3a's PR                                                   |
| A plan generated while its visitor logs out still opens on `/plan` (`setResult` and `go`). C3a keeps only the saved copy off the dashboard                                                                                                          | Owner decision                                                                     |
| C3d's totals lag by the logs saved since the last dashboard load: the write responses carry `pagination`, and nothing reads it                                                                                                                      | Accepted, and stated in C3d's PR. Reading it would touch every write handler       |
| A "Tip:" or "Note:" line inside the last day still opens the notes. C4 looks below the last weekday heading                                                                                                                                         | Accepted, and stated in C4's PR. Preferring a "Coach Notes" heading would close it |
| `detectTrack` matches keywords inside longer words ("cut"), and `detectInjuryFlags` flags "back" inside "lower back" (PR #184 item 17, not verified)                                                                                                | Parked                                                                             |
| CLAUDE.md's "`TZ` does not reach Node on this machine" holds for the shell only. Runtime `process.env.TZ` does reach it, and C5a relies on that                                                                                                     | Phase 6, R1                                                                        |
| CLAUDE.md's note that `goalOptions` was deleted as dead. It was reinstated in `a498ff2`                                                                                                                                                             | Phase 6, R1                                                                        |
| Free text such as "No injuries" in the profile notes still reads as an injury note. C4 leaves out only an exact none, n/a or no                                                                                                                     | Owner decision                                                                     |
| `apiFetch` has no timeout. C3b caps logout's wait for its flushed sends at 5 s (decided), but the logout request itself, and every other write, still has no deadline                                                                               | Parked                                                                             |
