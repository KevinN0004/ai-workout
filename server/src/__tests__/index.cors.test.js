import http from "node:http";
import net from "node:net";
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

// Sends a request with headers fetch will not let a test choose (Host).
const rawGet = (baseUrl, headers) =>
  new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}/api/health`, { headers }, (res) => {
      res.resume();
      resolve(res);
    });
    req.on("error", reject);
  });

// Sends an HTTP/1.0 request with no Host header at all, which node's server
// accepts only for 1.0, and resolves with the status code.
const getWithoutHost = (baseUrl, origin) =>
  new Promise((resolve, reject) => {
    const { port } = new URL(baseUrl);
    let response = "";
    const socket = net.connect(Number(port), "127.0.0.1", () => {
      socket.write(`GET /api/health HTTP/1.0\r\nOrigin: ${origin}\r\n\r\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("end", () => resolve(Number(response.split(" ")[1])));
    socket.on("error", reject);
  });

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
    // Non-browser callers, and a browser's same-origin navigations and plain
    // GETs, send no Origin.
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

// startApp's address is what fetch sends as Host, so baseUrl IS the server's own
// origin. The list always names another origin here: with an empty list
// 127.0.0.1 already passes as loopback, and the two rules could not be told
// apart. This suite imports index.js with NODE_ENV=test, so trust proxy is off.
describe("CORS and the server's own origin", () => {
  // The SPA is served from this origin, and a browser still sends Origin on its
  // writes and on the bundle's crossorigin loads, so its own origin must pass
  // whatever the list says.
  test("its own origin is allowed when the list names only others", async () => {
    const baseUrl = await startApp("https://app.example.com");

    const res = await get(baseUrl, baseUrl);

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(baseUrl);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test.each([
    ["another port on the same host", (base) => base.replace(/:\d+$/, ":1")],
    ["the same host with no port", (base) => base.replace(/:\d+$/, "")],
    ["the same host over https", (base) => base.replace("http://", "https://")],
    ["the same port on another host", (base) => base.replace("127.0.0.1", "127.0.0.2")],
    ["the same port under another name", (base) => base.replace("127.0.0.1", "localhost")]
  ])("%s is not its own origin", async (_label, toOrigin) => {
    const baseUrl = await startApp("https://app.example.com");

    const res = await get(baseUrl, toOrigin(baseUrl));

    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  // The attack the rule must never let through: a page on another site calls
  // the API. Its browser sets Host to ours and Origin to its own, and no page
  // can change either, so they differ.
  test("a browser on another site, whose Host is ours, is still refused", async () => {
    const baseUrl = await startApp("https://app.example.com");

    const res = await get(baseUrl, "https://evil.example");

    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("a Host whose port differs from the Origin's is refused", async () => {
    const baseUrl = await startApp("https://app.example.com");
    const { port } = new URL(baseUrl);

    const res = await rawGet(baseUrl, { Origin: baseUrl, Host: `127.0.0.1:${Number(port) + 1}` });

    expect(res.statusCode).toBe(403);
  });

  // Without trust proxy the scheme is the socket's, and a forwarded one is a
  // header any caller can send, so it must not move the own origin.
  test("X-Forwarded-Proto is ignored while trust proxy is off", async () => {
    const baseUrl = await startApp("https://app.example.com");
    const httpsOrigin = baseUrl.replace("http://", "https://");

    const forwarded = await rawGet(baseUrl, { Origin: httpsOrigin, "X-Forwarded-Proto": "https" });
    const socketScheme = await rawGet(baseUrl, { Origin: baseUrl, "X-Forwarded-Proto": "https" });

    expect(forwarded.statusCode).toBe(403);
    expect(socketScheme.statusCode).toBe(200);
  });

  // A request with no Host has no own origin, so nothing can equal it: not the
  // address it reached, and not the "http://undefined" a template would build.
  test.each([
    ["the address it reached", (base) => base],
    ["the origin an unchecked Host would build", () => "http://undefined"]
  ])("a request with no Host is not its own origin for %s", async (_label, toOrigin) => {
    const baseUrl = await startApp("https://app.example.com");

    expect(await getWithoutHost(baseUrl, toOrigin(baseUrl))).toBe(403);
  });

  test("a request with no Host still reaches a listed origin", async () => {
    const baseUrl = await startApp("https://app.example.com");

    expect(await getWithoutHost(baseUrl, "https://app.example.com")).toBe(200);
  });

  // Outside production the own origin counts only when it is loopback, because
  // of DNS rebinding: a page on http://evil.test:<port> points evil.test at
  // 127.0.0.1, and its browser then sends a Host and an Origin that agree. A
  // developer's server answers any Host, so this must stay refused.
  test("in development, a rebound name whose Host and Origin agree is refused", async () => {
    const baseUrl = await startApp("https://app.example.com");
    const { port } = new URL(baseUrl);

    const res = await rawGet(baseUrl, {
      Origin: `http://evil.test:${port}`,
      Host: `evil.test:${port}`
    });

    expect(res.statusCode).toBe(403);
  });

  // The same request a forging non-browser caller sends. In production it is
  // let through (corsPolicy.test.js pins that); in development it is refused.
  test("in development, a caller that forges a non-loopback Host to match is refused", async () => {
    const baseUrl = await startApp("https://app.example.com");

    const res = await rawGet(baseUrl, { Origin: "http://evil.example", Host: "evil.example" });

    expect(res.statusCode).toBe(403);
  });

  test("in development, its own origin under another loopback name is allowed", async () => {
    const baseUrl = await startApp("https://app.example.com");
    const localhostOrigin = baseUrl.replace("127.0.0.1", "localhost");

    const res = await rawGet(baseUrl, {
      Origin: localhostOrigin,
      Host: localhostOrigin.replace("http://", "")
    });

    expect(res.statusCode).toBe(200);
  });
});
