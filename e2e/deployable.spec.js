import { expect, test } from "@playwright/test";

// The only browser coverage of the thing that actually deploys.
//
// Every other test here talks to `vite preview`, which serves the shipped
// bundle but is not the shipped server: it has no helmet, so no response
// header express sets is visible to it, and it proxies only /api. The CI
// container job does smoke the express origin, but with
// `curl | grep 'id="root"'` -- and curl does not enforce CSP, so it passes
// against a page that cannot run.
//
// That combination shipped a blank page. `default-src 'none'` was correct
// while this process served JSON only; once it began serving the SPA it
// blocked the bundle's own script and stylesheet, and #root stayed empty.
// `/api/ready` answered 200 throughout, so the deploy reported success.
//
// This project points a browser at the express origin. If it passes, the
// deployable renders.

/**
 * Collects the two independent signals a CSP violation produces: the console
 * report, and the request failing with errorText "csp". Either alone can miss
 * a case, and the console text is what makes a failure readable.
 */
const watchForCspViolations = (page) => {
  const consoleViolations = [];
  const blockedRequests = [];

  page.on("console", (message) => {
    const text = message.text();
    if (/Content Security Policy|violates the following/i.test(text)) {
      consoleViolations.push(text);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText === "csp") blockedRequests.push(request.url());
  });

  return { consoleViolations, blockedRequests };
};

test.describe("the express-served deployable", () => {
  test("renders the app, with no CSP violations", async ({ page }) => {
    const { consoleViolations, blockedRequests } = watchForCspViolations(page);

    await page.goto("/", { waitUntil: "networkidle" });

    // Assert on the violations before the render, so a failure names the
    // directive that broke rather than only reporting an empty page.
    expect(consoleViolations).toEqual([]);
    expect(blockedRequests).toEqual([]);

    // The bundle executed. An empty #root is exactly what the CSP defect
    // produced, and it is indistinguishable from a served shell by curl.
    const rootContent = await page.locator("#root").innerHTML();
    expect(rootContent.length).toBeGreaterThan(0);
    await expect(page.locator("#root")).toContainText(/\S/);
  });

  test("loads the font chain the stylesheet asks for", async ({ page }) => {
    const { consoleViolations } = watchForCspViolations(page);

    await page.goto("/", { waitUntil: "networkidle" });

    // The built CSS @imports fonts.googleapis.com, which then resolves font
    // files from fonts.gstatic.com -- two directives, style-src and font-src.
    // Asserting the computed family alone would pass on the system fallback,
    // so check that faces actually loaded too.
    const loadedFaces = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.size;
    });
    expect(loadedFaces).toBeGreaterThan(0);

    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily).toContain("Space Grotesk");

    expect(consoleViolations).toEqual([]);
  });

  test("reaches its own API from its own origin", async ({ page }) => {
    const { consoleViolations, blockedRequests } = watchForCspViolations(page);

    const responses = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/")) responses.push(response.url());
    });

    await page.goto("/", { waitUntil: "networkidle" });

    // connect-src. The app calls /api/auth/me on load; a 401 for an anonymous
    // visitor is the expected answer, and what matters is that the request was
    // made at all rather than refused by the policy.
    expect(responses.length).toBeGreaterThan(0);
    expect(consoleViolations).toEqual([]);
    expect(blockedRequests).toEqual([]);
  });

  test("serves a client route from the shell but still 404s an unknown /api path", async ({
    page
  }) => {
    // The SPA fallback and its /api guard, exercised through the same origin
    // that serves them rather than through the preview proxy.
    const clientRoute = await page.goto("/dashboard/settings");
    expect(clientRoute.status()).toBe(200);
    expect(clientRoute.headers()["content-type"]).toContain("text/html");

    const missingApi = await page.request.get("/api/definitely-not-a-route");
    expect(missingApi.status()).toBe(404);
    expect(await missingApi.text()).not.toContain('id="root"');
  });

  test("caches hashed assets immutably and the shell not at all", async ({ page }) => {
    // Vite's filenames are content-addressed precisely so they can be cached
    // forever. The shell must not be, or a visitor keeps a cached page
    // pointing at a bundle that no longer exists.
    const shell = await page.request.get("/");
    expect(shell.headers()["cache-control"]).toContain("no-cache");

    await page.goto("/", { waitUntil: "networkidle" });
    const assetUrl = await page.evaluate(() => {
      const script = document.querySelector('script[src*="/assets/"]');
      return script ? script.getAttribute("src") : "";
    });
    expect(assetUrl).toContain("/assets/");

    const asset = await page.request.get(assetUrl);
    expect(asset.headers()["cache-control"]).toContain("immutable");
    expect(asset.headers()["cache-control"]).toContain("max-age=31536000");
  });
});
