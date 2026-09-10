import { afterEach, describe, expect, test, vi } from "vitest";
import { createExternalDataService } from "./externalDataService.js";
import { cleanText, toNullableNumber } from "./dashboardDataBuildersService.js";

// The wger and MealDB HTTP wrappers -- the last uncovered part of
// externalDataService. Driven with a pass-through cache and a stubbed fetch,
// the same way externalRetry.test.js drives fetchOpenMeteo. What is under test
// is the url they build, the auth header, and how an upstream refusal or a
// timeout becomes an error carrying a status the routes can act on.

// Matches the real readThroughExternalCache contract: callers destructure
// { data, cache }, not the { payload, cacheStatus } the cache stores internally.
const passThroughCache = async ({ requestFn }) => ({
  data: await requestFn(),
  cache: "miss"
});

const buildRequesters = (overrides = {}) =>
  createExternalDataService({
    cleanText,
    toNullableNumber,
    readThroughExternalCache: passThroughCache,
    buildExternalCacheKey: (service, parts) => `${service}:${JSON.stringify(parts)}`,
    metrics: { externalApiFailures: {}, externalApiRetries: {} },
    logger: { info() {}, warn() {}, error() {} },
    toShortText: (value) => String(value ?? ""),
    recordExternalApiLatency: () => {},
    externalApiRetries: 0,
    externalApiRetryBaseDelayMs: 0,
    wgerBaseUrl: "https://wger.example/api/v2/",
    wgerTimeoutMs: 50,
    wgerCacheTtlSec: 60,
    mealDbBaseUrl: "https://mealdb.example/api/1/",
    mealDbTimeoutMs: 50,
    mealDbCacheTtlSec: 60,
    ...overrides
  });

const okJson = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body)
});

const failJson = (status, body = {}) => ({
  ok: false,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body)
});

const abortingFetch = () =>
  vi.fn(async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  });

const urlOf = (fetchMock) => new URL(String(fetchMock.mock.calls[0][0]));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("wgerRequest", () => {
  test("joins the base url and endpoint without doubling the slash", async () => {
    const fetchMock = vi.fn(async () => okJson({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().wgerRequest("/exerciseinfo/");

    expect(urlOf(fetchMock).pathname).toBe("/api/v2/exerciseinfo/");
  });

  test("puts the query on the url", async () => {
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().wgerRequest("exerciseinfo/", { query: { limit: 15, language: 2 } });

    const url = urlOf(fetchMock);
    expect(url.searchParams.get("limit")).toBe("15");
    expect(url.searchParams.get("language")).toBe("2");
  });

  // wger takes a repeated key for a multi-value filter rather than a list.
  test("repeats a key for each value in a list", async () => {
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().wgerRequest("exerciseinfo/", { query: { muscles: [4, 5] } });

    expect(urlOf(fetchMock).searchParams.getAll("muscles")).toEqual(["4", "5"]);
  });

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""]
  ])("omits a parameter that is %s", async (_label, value) => {
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().wgerRequest("exerciseinfo/", {
      query: { limit: 15, category: value }
    });

    expect(urlOf(fetchMock).searchParams.has("category")).toBe(false);
  });

  test("skips empty entries inside a list", async () => {
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().wgerRequest("exerciseinfo/", {
      query: { muscles: [4, null, "", 5] }
    });

    expect(urlOf(fetchMock).searchParams.getAll("muscles")).toEqual(["4", "5"]);
  });

  test("sends the api token when one is configured", async () => {
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters({ wgerApiToken: "secret-token" }).wgerRequest("exerciseinfo/");

    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "Token secret-token" });
  });

  // wger's public catalogue works unauthenticated, so no token is not an error.
  test("sends no auth header when there is no token", async () => {
    const fetchMock = vi.fn(async () => okJson({}));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters({ wgerApiToken: "" }).wgerRequest("exerciseinfo/");

    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  test("returns the parsed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ results: [{ id: 1 }] }))
    );

    const result = await buildRequesters().wgerRequest("exerciseinfo/");

    expect(result.data).toEqual({ results: [{ id: 1 }] });
  });

  test("treats an unreadable body as empty rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("not json");
        }
      }))
    );

    const result = await buildRequesters().wgerRequest("exerciseinfo/");

    expect(result.data).toEqual({});
  });

  describe("errors", () => {
    // A 5xx upstream becomes a 502, so the route reports a bad gateway rather
    // than claiming the failure was its own.
    test("maps a 5xx to 502", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => failJson(503, { detail: "down" }))
      );

      await expect(buildRequesters().wgerRequest("exerciseinfo/")).rejects.toMatchObject({
        status: 502,
        message: "down"
      });
    });

    test("passes a 4xx through unchanged", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => failJson(404, { detail: "Not found." }))
      );

      await expect(buildRequesters().wgerRequest("exerciseinfo/")).rejects.toMatchObject({
        status: 404,
        message: "Not found."
      });
    });

    test.each([
      ["detail", { detail: "from detail" }, "from detail"],
      ["reason", { reason: "from reason" }, "from reason"],
      ["message", { message: "from message" }, "from message"],
      ["nothing usable", {}, "Wger request failed."]
    ])("takes the message from %s", async (_label, body, expected) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => failJson(400, body))
      );

      await expect(buildRequesters().wgerRequest("exerciseinfo/")).rejects.toThrow(expected);
    });

    // The abort is this request's own timeout firing, so it is reported as a
    // gateway timeout rather than as a generic aborted fetch.
    test("turns an abort into a 504", async () => {
      vi.stubGlobal("fetch", abortingFetch());

      await expect(buildRequesters().wgerRequest("exerciseinfo/")).rejects.toMatchObject({
        status: 504,
        message: "Wger request timed out."
      });
    });

    test("lets any other failure through as it is", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw new Error("socket hang up");
        })
      );

      await expect(buildRequesters().wgerRequest("exerciseinfo/")).rejects.toThrow(
        "socket hang up"
      );
    });
  });
});

describe("mealDbRequest", () => {
  test("builds the url and query", async () => {
    const fetchMock = vi.fn(async () => okJson({ meals: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().mealDbRequest("search.php", { s: "penne" });

    const url = urlOf(fetchMock);
    expect(url.pathname).toBe("/api/1/search.php");
    expect(url.searchParams.get("s")).toBe("penne");
  });

  test("returns the parsed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okJson({ meals: [{ idMeal: "1" }] }))
    );

    const result = await buildRequesters().mealDbRequest("search.php", { s: "penne" });

    expect(result.data).toEqual({ meals: [{ idMeal: "1" }] });
  });

  // This one reads the body as text and parses it itself, so an empty or
  // non-JSON response has to fall back rather than throw.
  test("treats an empty body as no data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => "" }))
    );

    const result = await buildRequesters().mealDbRequest("search.php", { s: "penne" });

    expect(result.data).toEqual({});
  });

  test("treats an unparseable body as no data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => "<html>oops</html>" }))
    );

    const result = await buildRequesters().mealDbRequest("search.php", { s: "penne" });

    expect(result.data).toEqual({});
  });

  test("maps a 5xx to 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failJson(500, { message: "down" }))
    );

    await expect(
      buildRequesters().mealDbRequest("search.php", { s: "penne" })
    ).rejects.toMatchObject({ status: 502 });
  });

  test("passes a 4xx through unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failJson(429, { message: "slow down" }))
    );

    await expect(
      buildRequesters().mealDbRequest("search.php", { s: "penne" })
    ).rejects.toMatchObject({ status: 429, message: "slow down" });
  });

  test("falls back to its own message when the body carries none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failJson(400, {}))
    );

    await expect(buildRequesters().mealDbRequest("search.php", { s: "penne" })).rejects.toThrow(
      "MealDB request failed."
    );
  });

  test("turns an abort into a 504", async () => {
    vi.stubGlobal("fetch", abortingFetch());

    await expect(
      buildRequesters().mealDbRequest("search.php", { s: "penne" })
    ).rejects.toMatchObject({ status: 504, message: "MealDB request timed out." });
  });
});
