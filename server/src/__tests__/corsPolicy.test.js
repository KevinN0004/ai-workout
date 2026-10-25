// Unit tests for corsPolicy.js: the production fallback, and trust proxy on, which
// index.cors.test.js cannot reach because it imports index.js with NODE_ENV=test.
import cors from "cors";
import express from "express";
import request from "supertest";
import { describe, expect, test } from "vitest";
import { createCorsPolicy } from "../corsPolicy.js";

// What the cors middleware hands the delegate, reduced to what it reads. The
// Host goes in a headers object, so a test can leave it out entirely.
const fakeRequest = (origin, headers = { host: "api.example.com" }, protocol = "https") => ({
  headers: { ...headers, origin },
  protocol,
  get: (name) => headers[name.toLowerCase()]
});

// Runs the delegate and then the origin check it returns, as cors does.
const decide = (policy, req) =>
  new Promise((resolve) => {
    policy.corsOptionsDelegate(req, (err, options) => {
      if (err) return resolve({ err });
      options.origin(req.headers.origin, (originErr, allowed) =>
        resolve({ err: originErr, allowed })
      );
    });
  });

const allowed = { err: null, allowed: true };

describe("createCorsPolicy in production (development false)", () => {
  const policy = createCorsPolicy([], { development: false });

  test("allows its own origin with no list at all", async () => {
    expect(await decide(policy, fakeRequest("https://api.example.com"))).toEqual(allowed);
  });

  // In production any own origin counts, loopback or not: the host routes by
  // Host (Render does), so a request naming another host never reaches us.
  test("allows a non-loopback own origin", async () => {
    const req = fakeRequest("https://service.example", { host: "service.example" });

    expect(await decide(policy, req)).toEqual(allowed);
  });

  // Accepted, and pinned so it stays a decision: in production a non-browser
  // caller can send a Host to match any Origin. It gains nothing, because CORS
  // only restrains browsers and such a caller can already send no Origin at all.
  test("lets through a caller that forges Host to match its Origin", async () => {
    const req = fakeRequest("https://evil.example", { host: "evil.example" });

    expect(await decide(policy, req)).toEqual(allowed);
  });

  test("does not fall back to loopback", async () => {
    const { err } = await decide(policy, fakeRequest("http://localhost:5173"));

    expect(err?.status).toBe(403);
  });

  test("refuses every other origin", async () => {
    const { err } = await decide(policy, fakeRequest("https://evil.example"));

    expect(err?.status).toBe(403);
  });

  test("still allows an origin it lists", async () => {
    const listed = createCorsPolicy(["https://app.example.com"], { development: false });

    expect(await decide(listed, fakeRequest("https://app.example.com"))).toEqual(allowed);
  });

  // A sandboxed frame or an opaque redirect sends the literal Origin "null",
  // which no scheme and Host can spell.
  test('refuses the opaque Origin "null"', async () => {
    const { err } = await decide(policy, fakeRequest("null"));

    expect(err?.status).toBe(403);
  });

  // A missing or empty Host leaves the request with no own origin: it must not
  // turn into one a caller can name, such as "https://undefined" or "https://".
  test.each([
    ["no Host", {}, "https://undefined"],
    ["an empty Host", { host: "" }, "https://"]
  ])("%s never matches", async (_label, headers, origin) => {
    const { err } = await decide(policy, fakeRequest(origin, headers));

    expect(err?.status).toBe(403);
  });
});

describe("createCorsPolicy outside production", () => {
  test("keeps the loopback fallback for an unset list", async () => {
    const policy = createCorsPolicy([]);

    expect(await decide(policy, fakeRequest("http://localhost:5173"))).toEqual(allowed);
  });

  test("allows its own origin there too, when it is loopback", async () => {
    const policy = createCorsPolicy(["https://app.example.com"]);
    const req = fakeRequest("http://127.0.0.1:5000", { host: "127.0.0.1:5000" }, "http");

    expect(await decide(policy, req)).toEqual(allowed);
  });

  // DNS rebinding: a page on http://evil.test:5000 points evil.test at
  // 127.0.0.1, and its writes then reach a developer's server with a Host and an
  // Origin that agree. That server answers any Host, so a non-loopback own
  // origin is refused here.
  test.each([
    ["a rebound name", "evil.test:5000", "http://evil.test:5000"],
    ["a public name", "api.example.com", "https://api.example.com"]
  ])("refuses a non-loopback own origin: %s", async (_label, host, origin) => {
    const policy = createCorsPolicy(["https://app.example.com"]);
    const req = fakeRequest(origin, { host }, new URL(origin).protocol.replace(":", ""));

    const { err } = await decide(policy, req);

    expect(err?.status).toBe(403);
  });
});

// The scheme half of the own origin is req.protocol, which honours
// X-Forwarded-Proto only when trust proxy is set (index.js sets it in production,
// where Render terminates TLS). These run the production policy (development
// false, so any own origin counts) through real express.
const appWith = ({ trustProxy }) => {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);
  app.use(cors(createCorsPolicy([], { development: false }).corsOptionsDelegate));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(err.status ?? 500).end());
  return app;
};

const probe = (app, headers) => {
  const req = request(app).get("/api/health");
  for (const [name, value] of Object.entries(headers)) req.set(name, value);
  return req;
};

describe("the own origin with trust proxy on, as behind Render's proxy", () => {
  const app = appWith({ trustProxy: true });

  test("is the https origin the proxy forwards", async () => {
    const res = await probe(app, {
      Host: "app.example.com",
      Origin: "https://app.example.com",
      "X-Forwarded-Proto": "https"
    });

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  test("is not the http origin once the proxy says https", async () => {
    const res = await probe(app, {
      Host: "app.example.com",
      Origin: "http://app.example.com",
      "X-Forwarded-Proto": "https"
    });

    expect(res.status).toBe(403);
  });

  test("is the socket's scheme when no proxy header arrives", async () => {
    const res = await probe(app, { Host: "app.example.com", Origin: "https://app.example.com" });

    expect(res.status).toBe(403);
  });

  // The forwarded scheme moves only the scheme: a page on another site still
  // names its own host, which is not ours.
  test("still refuses another site's page", async () => {
    const res = await probe(app, {
      Host: "app.example.com",
      Origin: "https://evil.example",
      "X-Forwarded-Proto": "https"
    });

    expect(res.status).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("refuses a Host whose port differs from the Origin's", async () => {
    const res = await probe(app, {
      Host: "app.example.com:8443",
      Origin: "https://app.example.com",
      "X-Forwarded-Proto": "https"
    });

    expect(res.status).toBe(403);
  });

  // X-Forwarded-Host is not read: the own origin is built from Host, so a
  // forwarded host cannot stand in for it.
  test("ignores X-Forwarded-Host", async () => {
    const res = await probe(app, {
      Host: "app.example.com",
      Origin: "https://evil.example",
      "X-Forwarded-Proto": "https",
      "X-Forwarded-Host": "evil.example"
    });

    expect(res.status).toBe(403);
  });
});

describe("the own origin with trust proxy off", () => {
  const app = appWith({ trustProxy: false });

  test("ignores X-Forwarded-Proto", async () => {
    const res = await probe(app, {
      Host: "app.example.com",
      Origin: "https://app.example.com",
      "X-Forwarded-Proto": "https"
    });

    expect(res.status).toBe(403);
  });

  test("is the socket's http origin", async () => {
    const res = await probe(app, {
      Host: "app.example.com",
      Origin: "http://app.example.com",
      "X-Forwarded-Proto": "https"
    });

    expect(res.status).toBe(200);
  });
});
