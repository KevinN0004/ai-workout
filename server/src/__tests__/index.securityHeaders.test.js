import request from "supertest";
import { describe, expect, test } from "vitest";
import { app } from "../index.js";

// The CSP had no test at all, which is how it came to block the application's
// own bundle. `default-src 'none'` was right while this process served JSON;
// once it began serving the SPA from its own origin it blocked the script and
// the stylesheet, and the page rendered empty while /api/ready still answered
// 200 -- so every automated check, including the container smoke test, passed.
//
// These are the cheap guard. e2e/deployable.spec.js is the one that proves the
// page actually runs; a header can be well-formed and still wrong.

const getCsp = async () => {
  const response = await request(app).get("/api/health");
  return String(response.headers["content-security-policy"] || "");
};

/** Reads one directive's value out of the policy string. */
const directive = (policy, name) => {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  return found ? found.slice(name.length).trim() : "";
};

describe("the content security policy", () => {
  test("is sent at all", async () => {
    expect(await getCsp()).not.toBe("");
  });

  test("still denies everything by default", async () => {
    // The allowances below are additions to a closed default, not a relaxation
    // of it. If this ever becomes 'self' the rest of the policy stops meaning
    // what it appears to mean.
    expect(directive(await getCsp(), "default-src")).toBe("'none'");
  });

  test("allows the bundle's own script and stylesheet", async () => {
    const policy = await getCsp();

    // Without these two the application renders a blank page. That is not a
    // hypothetical: it is the defect this file exists for.
    expect(directive(policy, "script-src")).toContain("'self'");
    expect(directive(policy, "style-src")).toContain("'self'");
  });

  test("allows the Google Fonts chain the stylesheet depends on", async () => {
    const policy = await getCsp();

    // The built CSS @imports googleapis, whose response then points at
    // gstatic. Allowing one without the other loads a stylesheet that cannot
    // fetch its own fonts, so both are named.
    expect(directive(policy, "style-src")).toContain("https://fonts.googleapis.com");
    expect(directive(policy, "font-src")).toContain("https://fonts.gstatic.com");
  });

  test("allows the app to call its own API", async () => {
    // connect-src falls back to default-src when absent, so omitting it means
    // every fetch is refused -- including the /api/auth/me the client issues
    // on load.
    expect(directive(await getCsp(), "connect-src")).toContain("'self'");
  });

  test("allows the image hosts the app actually renders from", async () => {
    const imgSrc = directive(await getCsp(), "img-src");

    expect(imgSrc).toContain("'self'");
    // wger serves exercise imagery, placehold.co stands in when it has none,
    // themealdb the meal thumbnails. data:/blob: are the PDF export path.
    expect(imgSrc).toContain("https://wger.de");
    expect(imgSrc).toContain("https://placehold.co");
    expect(imgSrc).toContain("https://www.themealdb.com");
    expect(imgSrc).toContain("data:");
    expect(imgSrc).toContain("blob:");
  });

  test("does not reach for 'unsafe-inline'", async () => {
    // The usual reflex when a stylesheet is blocked, and it was not needed
    // here: React applies its style prop through the CSSOM, which style-src
    // does not govern. Verified in a browser with zero violations. Adding it
    // later should be a deliberate decision, not a debugging leftover.
    expect(await getCsp()).not.toContain("unsafe-inline");
  });

  test("keeps the framing and object protections", async () => {
    const policy = await getCsp();

    expect(directive(policy, "frame-ancestors")).toBe("'none'");
    expect(directive(policy, "object-src")).toBe("'none'");
  });
});
