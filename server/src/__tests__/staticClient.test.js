import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { registerClientStatic, resolveClientDistPath } from "../staticClient.js";

// The client bundle and the API must share an origin -- see the header comment
// in staticClient.js for why that is forced rather than chosen.
//
// These tests build a REAL temporary bundle on disk rather than faking the
// filesystem. An earlier draft pointed at a path that did not exist, which
// made the key assertion useless: sendFile on a missing file fails and
// Express answers 404 anyway, so a broken /api guard and a working one both
// produced 404 and the test could not tell them apart. With a real
// index.html the fallback returns 200 and a known marker, so shadowing is
// visible.
const SHELL = "<!doctype html><html><body><div id=root>SPA_SHELL_MARKER</div></body></html>";
const ASSET = "console.log('bundled asset');";

let distPath;

beforeAll(() => {
  distPath = fs.mkdtempSync(path.join(os.tmpdir(), "ai-workout-dist-"));
  fs.writeFileSync(path.join(distPath, "index.html"), SHELL);
  fs.mkdirSync(path.join(distPath, "assets"));
  fs.writeFileSync(path.join(distPath, "assets", "app.js"), ASSET);
});

afterAll(() => {
  fs.rmSync(distPath, { recursive: true, force: true });
});

// Far above any one test's request count, so only the limiter tests below,
// which pass their own, ever meet the shell's limit.
const OUT_OF_THE_WAY = 1000;

const buildApp = ({ limit = OUT_OF_THE_WAY } = {}) => {
  const app = express();
  const metrics = { rateLimited: 0 };
  const requestLog = { warn: vi.fn() };

  // Stands in for requestContext.js, which attaches the per-request logger.
  app.use((req, _res, next) => {
    req.log = requestLog;
    next();
  });

  // API routes registered first, exactly as index.js does, so the fallback
  // has something real to shadow if it is written wrongly.
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  const mounted = registerClientStatic(app, {
    express,
    existsSync: fs.existsSync,
    distPath,
    logger: { warn: vi.fn(), info: vi.fn() },
    metrics,
    shellRateLimit: { windowMs: 60_000, limit }
  });

  return { app, mounted, metrics, requestLog };
};

// Vite's asset filenames are content-addressed, so they can be cached
// indefinitely -- but the shell must never be, or a visitor holds a cached
// page pointing at a hashed bundle the next deploy has already removed, and
// only a hard refresh clears it. The two policies have to differ, which is why
// this goes through setHeaders rather than the blanket maxAge option.
describe("cache headers", () => {
  test("hashed assets are immutable for a year", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/assets/app.js");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("immutable");
    expect(response.headers["cache-control"]).toContain("max-age=31536000");
  });

  test("the shell is not cached", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("SPA_SHELL_MARKER");
    // Express's default here is `public, max-age=0`, which revalidates but is
    // still a cache entry. no-cache is the explicit instruction.
    expect(response.headers["cache-control"]).toContain("no-cache");
  });

  test("a client route served by the fallback is not cached either", async () => {
    // The fallback does not pass through express.static, so it needs its own
    // header -- a route that is cached is the same defect as a cached shell.
    const response = await request(buildApp().app).get("/dashboard/settings");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-cache");
  });
});

describe("registerClientStatic", () => {
  test("mounts when the bundle is present", () => {
    expect(buildApp().mounted).toBe(true);
  });

  test("declines, without throwing, when the bundle has not been built", () => {
    const onMissing = vi.fn();
    const mounted = registerClientStatic(express(), {
      express,
      existsSync: () => false,
      distPath: "/nowhere",
      logger: { warn: vi.fn(), info: vi.fn() },
      onMissing
    });

    // `npm run dev:server` never builds the client. Refusing to start would
    // break the ordinary development path, so this warns rather than crashing.
    expect(mounted).toBe(false);
    expect(onMissing).toHaveBeenCalled();
  });

  test("serves a built asset", async () => {
    const response = await request(buildApp().app).get("/assets/app.js");

    expect(response.status).toBe(200);
    expect(response.text).toContain("bundled asset");
  });

  test("serves the shell for a client route", async () => {
    const response = await request(buildApp().app).get("/dashboard/settings");

    expect(response.status).toBe(200);
    expect(response.text).toContain("SPA_SHELL_MARKER");
  });

  test("serves the shell at the root", async () => {
    const response = await request(buildApp().app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("SPA_SHELL_MARKER");
  });

  test("leaves a registered API route alone", async () => {
    const response = await request(buildApp().app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  // The assertion that matters most. Without the /api guard, a mistyped API
  // path answers 200 with the SPA shell, and the caller fails while parsing
  // HTML as JSON rather than on the status -- turning a clear 404 into a
  // confusing client-side crash.
  test("does not shadow an unknown /api path with the shell", async () => {
    const response = await request(buildApp().app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.text).not.toContain("SPA_SHELL_MARKER");
  });

  test("does not shadow the bare /api path either", async () => {
    const response = await request(buildApp().app).get("/api");

    expect(response.status).toBe(404);
    expect(response.text).not.toContain("SPA_SHELL_MARKER");
  });

  test("leaves a non-GET request to an unknown path as a 404", async () => {
    // app.get covers GET and HEAD only, so a POST falls through. Handing an
    // HTML page to a POST would mask a wrong method as success.
    const response = await request(buildApp().app).post("/not-a-route");

    expect(response.status).toBe(404);
    expect(response.text).not.toContain("SPA_SHELL_MARKER");
  });
});

// The fallback reads index.html from disk on every request, and nothing else
// limits it: the five limiters in index.js cover /api only. Each case builds
// its own app, so each starts with a fresh memory store.
describe("the shell's rate limit", () => {
  test("answers 429 once the limit is passed", async () => {
    const { app } = buildApp({ limit: 2 });

    const first = await request(app).get("/");
    const second = await request(app).get("/dashboard/settings");
    const limited = await request(app).get("/dashboard");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "Too many page requests. Please try again shortly." });
    expect(limited.text).not.toContain("SPA_SHELL_MARKER");
  });

  test("counts a limited request in the metrics the operator reads", async () => {
    const { app, metrics } = buildApp({ limit: 1 });

    await request(app).get("/");
    expect(metrics.rateLimited).toBe(0);
    await request(app).get("/");

    expect(metrics.rateLimited).toBe(1);
  });

  test("logs a limited request without its query string", async () => {
    const { app, requestLog } = buildApp({ limit: 1 });

    await request(app).get("/");
    await request(app).get("/dashboard?latitude=40.712776&longitude=-74.005974");

    expect(requestLog.warn).toHaveBeenCalledTimes(1);
    expect(requestLog.warn.mock.calls[0][0]).toMatchObject({
      event: "rate_limited",
      scope: "spa_fallback",
      method: "GET",
      path: "/dashboard"
    });
  });

  // Hashed assets are what a page load fetches most, and express.static
  // answers them before the fallback is reached, so they never count.
  test("leaves built assets alone", async () => {
    const { app } = buildApp({ limit: 1 });

    await request(app).get("/");
    expect((await request(app).get("/")).status).toBe(429);
    const assets = await Promise.all([1, 2, 3].map(() => request(app).get("/assets/app.js")));

    expect(assets.map((response) => response.status)).toEqual([200, 200, 200]);
  });

  // An unknown /api path passes through the fallback to its 404. The /api
  // limiter in index.js has already counted it, so the shell's must not.
  test("does not count an /api path that passes through", async () => {
    const { app } = buildApp({ limit: 1 });

    const missing = await Promise.all([1, 2, 3].map(() => request(app).get("/api/nope")));
    const shell = await request(app).get("/");

    expect(missing.map((response) => response.status)).toEqual([404, 404, 404]);
    expect(shell.status).toBe(200);
  });

  test("still serves the shell without caching it while under the limit", async () => {
    const response = await request(buildApp({ limit: 1 }).app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toContain("no-cache");
    expect(response.headers["ratelimit-limit"]).toBe("1");
  });
});

describe("resolveClientDistPath", () => {
  test("defaults to the client workspace's build output", () => {
    expect(resolveClientDistPath()).toMatch(/client[\\/]dist$/);
  });

  test("honours an override, resolved to an absolute path", () => {
    const resolved = resolveClientDistPath("some/where/else");

    expect(resolved).toMatch(/some[\\/]where[\\/]else$/);
    expect(path.isAbsolute(resolved)).toBe(true);
  });
});
