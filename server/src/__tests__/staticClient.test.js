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

const buildApp = () => {
  const app = express();

  // API routes registered first, exactly as index.js does, so the fallback
  // has something real to shadow if it is written wrongly.
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  const mounted = registerClientStatic(app, {
    express,
    existsSync: fs.existsSync,
    distPath,
    logger: { warn: vi.fn(), info: vi.fn() }
  });

  return { app, mounted };
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
