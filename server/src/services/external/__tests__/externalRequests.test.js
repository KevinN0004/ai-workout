import { afterEach, describe, expect, test, vi } from "vitest";
import { createExternalDataService } from "../externalDataService.js";
import { cleanText, toNullableNumber } from "../../dashboard/dashboardDataBuildersService.js";

// The four HTTP wrappers in externalDataService. Driven with a pass-through
// cache and a stubbed fetch. What is under test is the url they build, the auth
// header, and how an upstream refusal or a timeout becomes an error carrying a
// status the routes can act on.
//
// This file used to say wger and MealDB were "the last uncovered part" of the
// service. They were not: `openAqRequest` was 79 lines that never executed,
// because the air-quality route tests stub that function as their network
// boundary -- so the thing being stubbed was never itself exercised. It is the
// request layer for the surface where the null-pm2.5-as-AQI-0 bug shipped.
// externalRetry.test.js drives fetchOpenMeteo's happy and retry paths; its
// guard and timeout paths are covered here.

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
    openMeteoBaseUrl: "https://openmeteo.example/v1/forecast",
    openMeteoTimeoutMs: 50,
    openMeteoCacheTtlSec: 60,
    openAqBaseUrl: "https://openaq.example/v3/",
    openAqApiKey: "test-key",
    openAqTimeoutMs: 50,
    openAqCacheTtlSec: 60,
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

// OpenAQ reads the body with text() and parses it itself, rather than json(),
// so it needs a response shape the json-based helpers above do not provide.
const rawText = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
  json: async () => JSON.parse(body)
});

describe("openAqRequest", () => {
  test("joins the base url and endpoint without doubling the slash", async () => {
    const fetchMock = vi.fn(async () => rawText(200, JSON.stringify({ results: [] })));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().openAqRequest("/locations");

    expect(urlOf(fetchMock).href).toBe("https://openaq.example/v3/locations");
  });

  test("puts the query on the url", async () => {
    const fetchMock = vi.fn(async () => rawText(200, JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().openAqRequest("locations", { coordinates: "40,-75", radius: 12000 });

    const url = urlOf(fetchMock);
    expect(url.searchParams.get("coordinates")).toBe("40,-75");
    expect(url.searchParams.get("radius")).toBe("12000");
  });

  // A blank parameter is not a filter. Sending it would narrow the upstream
  // query rather than leaving it unconstrained.
  test.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""]
  ])("omits a parameter that is %s", async (_label, value) => {
    const fetchMock = vi.fn(async () => rawText(200, JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().openAqRequest("locations", { radius: value, keep: "yes" });

    const url = urlOf(fetchMock);
    expect(url.searchParams.has("radius")).toBe(false);
    expect(url.searchParams.get("keep")).toBe("yes");
  });

  test("sends the api key as a header rather than on the url", async () => {
    const fetchMock = vi.fn(async () => rawText(200, JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);

    await buildRequesters().openAqRequest("locations");

    expect(fetchMock.mock.calls[0][1].headers["X-API-Key"]).toBe("test-key");
    expect(urlOf(fetchMock).search).toBe("");
  });

  // Without a key every request comes back 401. Failing before the call with a
  // 503 says "this deployment is not configured" rather than letting a missing
  // key look like an upstream outage.
  test("refuses with a 503 when no api key is configured, without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      buildRequesters({ openAqApiKey: "" }).openAqRequest("locations")
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("reports a runtime without fetch as a 500", async () => {
    vi.stubGlobal("fetch", undefined);

    await expect(buildRequesters().openAqRequest("locations")).rejects.toMatchObject({
      status: 500
    });
  });

  test("returns the parsed body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rawText(200, JSON.stringify({ results: [{ id: 7 }] })))
    );

    const { data } = await buildRequesters().openAqRequest("locations");

    expect(data).toEqual({ results: [{ id: 7 }] });
  });

  test("treats an empty body as no data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rawText(200, ""))
    );

    const { data } = await buildRequesters().openAqRequest("locations");

    expect(data).toEqual({});
  });

  // Unlike the other three wrappers, an unparseable body is kept as the raw
  // string rather than discarded, because the error branch below reports it.
  test("keeps an unparseable body as raw text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => rawText(200, "<html>nope</html>"))
    );

    const { data } = await buildRequesters().openAqRequest("locations");

    expect(data).toBe("<html>nope</html>");
  });

  describe("errors", () => {
    test("maps a 5xx to 502", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => rawText(503, JSON.stringify({ message: "upstream down" })))
      );

      await expect(buildRequesters().openAqRequest("locations")).rejects.toMatchObject({
        status: 502,
        message: "upstream down"
      });
    });

    test("passes a 4xx through unchanged", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => rawText(429, JSON.stringify({ message: "slow down" })))
      );

      await expect(buildRequesters().openAqRequest("locations")).rejects.toMatchObject({
        status: 429,
        message: "slow down"
      });
    });

    // OpenAQ reports validation failures as an array of entries rather than as
    // a single message, and the first one is the useful part.
    test.each([
      ["msg", { msg: "bad radius" }],
      ["message", { message: "bad radius" }],
      ["detail", { detail: "bad radius" }]
    ])("takes the first entry %s when the body is an array", async (_label, entry) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => rawText(422, JSON.stringify([entry, { msg: "ignored" }])))
      );

      await expect(buildRequesters().openAqRequest("locations")).rejects.toThrow("bad radius");
    });

    test.each([
      ["message", { message: "by message" }],
      ["detail", { detail: "by detail" }],
      ["error", { error: "by error" }]
    ])("takes %s from an object body", async (_label, body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => rawText(400, JSON.stringify(body)))
      );

      await expect(buildRequesters().openAqRequest("locations")).rejects.toThrow(
        Object.values(body)[0]
      );
    });

    test("falls back to the raw body when it did not parse", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => rawText(400, "plain text refusal"))
      );

      await expect(buildRequesters().openAqRequest("locations")).rejects.toThrow(
        "plain text refusal"
      );
    });

    test("falls back to its own message when the body carries none", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => rawText(400, JSON.stringify({})))
      );

      await expect(buildRequesters().openAqRequest("locations")).rejects.toThrow(
        "OpenAQ request failed."
      );
    });

    test("turns an abort into a 504", async () => {
      vi.stubGlobal("fetch", abortingFetch());

      await expect(buildRequesters().openAqRequest("locations")).rejects.toMatchObject({
        status: 504,
        message: "OpenAQ request timed out."
      });
    });
  });
});

// externalRetry.test.js drives fetchOpenMeteo's happy path, its retry budget and
// its query building. What is left are the ways it refuses before or instead of
// returning a body.
describe("fetchOpenMeteo", () => {
  test("reports a runtime without fetch as a 500", async () => {
    vi.stubGlobal("fetch", undefined);

    await expect(buildRequesters().fetchOpenMeteo({ latitude: 40 })).rejects.toMatchObject({
      status: 500
    });
  });

  test("turns an abort into a 504", async () => {
    vi.stubGlobal("fetch", abortingFetch());

    await expect(buildRequesters().fetchOpenMeteo({ latitude: 40 })).rejects.toMatchObject({
      status: 504,
      message: "Open-Meteo request timed out."
    });
  });

  // The body is read with `.json().catch(() => ({}))`, so a refusal that is not
  // JSON must still produce the wrapper's own message rather than a parse error.
  test("treats an unparseable error body as empty and uses its own message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => {
          throw new SyntaxError("not json");
        }
      }))
    );

    await expect(buildRequesters().fetchOpenMeteo({ latitude: 40 })).rejects.toMatchObject({
      status: 400,
      message: "Open-Meteo request failed."
    });
  });

  test("reports the upstream reason when it gives one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ reason: "latitude out of range" })
      }))
    );

    await expect(buildRequesters().fetchOpenMeteo({ latitude: 999 })).rejects.toMatchObject({
      status: 502,
      message: "latitude out of range"
    });
  });
});
