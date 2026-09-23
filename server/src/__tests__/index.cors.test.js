import { afterEach, describe, expect, test, vi } from "vitest";

// CORS here runs with credentials enabled, which is what makes it worth
// testing: reflecting an arbitrary Origin would let any site issue
// authenticated cross-origin calls with the visitor's session cookie. The
// allowlist is read from the environment once at import, so each mode gets a
// freshly imported app rather than a shared one.
//
// Re-importing is safe: index.js exports startServer rather than calling it,
// and prisma.js caches its client on globalThis outside production, so no
// second database client is created.

let running = [];

// Both variables are always set explicitly, never deleted. index.js calls
// dotenv.config() at module scope, and dotenv fills in keys that are absent --
// so deleting one and re-importing hands the app whatever the environment file
// says rather than the empty allowlist the test asked for. Setting it to an
// empty string leaves it present, which dotenv leaves alone.
const startApp = async (clientOrigin) => {
  vi.resetModules();
  const previous = [process.env.CLIENT_ORIGIN, process.env.CLIENT_ORIGINS];
  process.env.CLIENT_ORIGIN = clientOrigin ?? "";
  process.env.CLIENT_ORIGINS = "";

  let app;
  try {
    ({ app } = await import("../index.js"));
  } finally {
    // Assigning undefined to process.env stores the string "undefined", so a
    // variable that was absent has to be deleted rather than assigned back.
    ["CLIENT_ORIGIN", "CLIENT_ORIGINS"].forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  running.push(server);
  return `http://127.0.0.1:${server.address().port}`;
};

const get = (baseUrl, origin) =>
  fetch(`${baseUrl}/api/health`, origin === undefined ? {} : { headers: { Origin: origin } });

afterEach(async () => {
  const servers = running;
  running = [];
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve);
        })
    )
  );
});

describe("CORS with no allowlist configured", () => {
  // The loopback fallback is what keeps `npm run dev` working without extra
  // configuration. It must not become a way in for anyone else.
  const openApp = () => startApp(undefined);

  test("a caller that sends no Origin at all is served", async () => {
    // Same-origin browser requests and non-browser callers send no Origin.
    const baseUrl = await openApp();

    const res = await get(baseUrl, undefined);

    expect(res.status).toBe(200);
  });

  test.each([
    ["localhost", "http://localhost:5173"],
    ["127.0.0.1", "http://127.0.0.1:4173"],
    ["IPv6 loopback", "http://[::1]:4173"],
    ["loopback over https", "https://localhost:5173"]
  ])("a request from %s is allowed", async (_label, origin) => {
    const baseUrl = await openApp();

    const res = await get(baseUrl, origin);

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test.each([
    ["an unrelated site", "https://app.example.com"],
    ["a host that merely ends in localhost", "https://evil-localhost"],
    ["a subdomain trick", "https://localhost.evil.example.com"],
    ["a host that starts with the loopback address", "http://127.0.0.1.evil.example.com"],
    ["a userinfo trick", "https://evil.example.com/?x=localhost"]
  ])("a request from %s is refused", async (_label, origin) => {
    // These are the strings a substring check would wave through. The check is
    // on the parsed hostname, so none of them is loopback.
    const baseUrl = await openApp();

    const res = await get(baseUrl, origin);

    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("an Origin that is not a URL at all is refused rather than throwing", async () => {
    const baseUrl = await openApp();

    const res = await get(baseUrl, "not-a-url");

    expect(res.status).toBe(403);
  });
});

describe("CORS with an allowlist configured", () => {
  test("a named origin is allowed", async () => {
    const baseUrl = await startApp("https://app.example.com");

    const res = await get(baseUrl, "https://app.example.com");

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("every origin in the list is allowed", async () => {
    const baseUrl = await startApp("https://app.example.com, https://admin.example.com");

    const first = await get(baseUrl, "https://app.example.com");
    const second = await get(baseUrl, "https://admin.example.com");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  test("an origin not in the list is refused", async () => {
    const baseUrl = await startApp("https://app.example.com");

    const res = await get(baseUrl, "https://evil.example.com");

    expect(res.status).toBe(403);
  });

  test("loopback stops being special once origins are named", async () => {
    // The fallback exists only for the unconfigured case. A deployment that
    // names its origins has not asked for localhost to be trusted as well, and
    // treating it as permanently allowed would leave a hole open in production.
    const baseUrl = await startApp("https://app.example.com");

    const res = await get(baseUrl, "http://localhost:5173");

    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("a caller with no Origin is still served", async () => {
    const baseUrl = await startApp("https://app.example.com");

    expect((await get(baseUrl, undefined)).status).toBe(200);
  });
});
