import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createExternalDataService } from "./externalDataService.js";

// The retry and backoff layer around every upstream call. The AQI maths are
// covered elsewhere; this is the part that decides how many times a failing
// upstream gets hit and how long a user waits for the answer.
//
// Driven through fetchOpenMeteo rather than by reaching for the internal
// helper, so the tests exercise the surface the routes actually call. The cache
// wrapper is a pass-through so the request runs on every call.

const passThroughCache = async ({ requestFn }) => ({
  payload: await requestFn(),
  cacheStatus: "miss"
});

const buildService = (overrides = {}) => {
  const metrics = { externalApiFailures: {}, externalApiRetries: {} };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const recordExternalApiLatency = vi.fn();
  const service = createExternalDataService({
    cleanText: (value, maxLen = 200) =>
      typeof value === "string" ? value.trim().slice(0, maxLen) : "",
    toNullableNumber: (value) => (Number.isFinite(Number(value)) ? Number(value) : null),
    readThroughExternalCache: passThroughCache,
    buildExternalCacheKey: () => "key",
    metrics,
    logger,
    toShortText: (value) => String(value ?? ""),
    recordExternalApiLatency,
    externalApiRetries: 2,
    externalApiRetryBaseDelayMs: 1,
    openMeteoBaseUrl: "https://example.invalid/forecast",
    openMeteoTimeoutMs: 50,
    openMeteoCacheTtlSec: 60,
    ...overrides
  });
  return { service, metrics, logger, recordExternalApiLatency };
};

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const failResponse = (status, body = {}) => ({ ok: false, status, json: async () => body });

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("external request retry", () => {
  test("returns the payload without retrying when the first call succeeds", async () => {
    const fetchMock = vi.fn(async () => okResponse({ current: { temperature_2m: 12 } }));
    vi.stubGlobal("fetch", fetchMock);
    const { service, metrics } = buildService();

    const result = await service.fetchOpenMeteo({ latitude: 1, longitude: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(metrics.externalApiRetries.openMeteo).toBeUndefined();
    expect(result.payload).toBeTruthy();
  });

  test("retries a 5xx up to the configured limit, then gives up", async () => {
    const fetchMock = vi.fn(async () => failResponse(503, { reason: "upstream down" }));
    vi.stubGlobal("fetch", fetchMock);
    const { service, metrics } = buildService();

    await expect(service.fetchOpenMeteo({ latitude: 1, longitude: 2 })).rejects.toThrow();

    // 1 initial attempt + 2 retries.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(metrics.externalApiRetries.openMeteo).toBe(2);
  });

  // Retrying a 4xx burns quota and delays an error the caller cannot fix.
  test("does not retry a 4xx", async () => {
    const fetchMock = vi.fn(async () => failResponse(400, { reason: "bad latitude" }));
    vi.stubGlobal("fetch", fetchMock);
    const { service, metrics } = buildService();

    await expect(service.fetchOpenMeteo({ latitude: 999 })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(metrics.externalApiRetries.openMeteo).toBeUndefined();
  });

  test("succeeds on a retry after a transient failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failResponse(500, { reason: "blip" }))
      .mockResolvedValueOnce(okResponse({ current: { temperature_2m: 15 } }));
    vi.stubGlobal("fetch", fetchMock);
    const { service, metrics } = buildService();

    const result = await service.fetchOpenMeteo({ latitude: 1, longitude: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(metrics.externalApiRetries.openMeteo).toBe(1);
    expect(result.payload).toBeTruthy();
  });

  test("honours a retry budget of zero", async () => {
    const fetchMock = vi.fn(async () => failResponse(500));
    vi.stubGlobal("fetch", fetchMock);
    const { service } = buildService({ externalApiRetries: 0 });

    await expect(service.fetchOpenMeteo({ latitude: 1 })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("retries a thrown network error, which carries no status", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { service, metrics } = buildService();

    await expect(service.fetchOpenMeteo({ latitude: 1 })).rejects.toThrow("socket hang up");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(metrics.externalApiRetries.openMeteo).toBe(2);
  });

  test("records latency for every attempt, not just the last", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failResponse(500))
    );
    const { service, recordExternalApiLatency } = buildService();

    await expect(service.fetchOpenMeteo({ latitude: 1 })).rejects.toThrow();

    expect(recordExternalApiLatency).toHaveBeenCalledTimes(3);
    expect(recordExternalApiLatency.mock.calls.every(([name]) => name === "openMeteo")).toBe(true);
  });

  test("logs each retry with the service and attempt number", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failResponse(500))
    );
    const { service, logger } = buildService();

    await expect(service.fetchOpenMeteo({ latitude: 1 })).rejects.toThrow();

    const retryLogs = logger.warn.mock.calls.filter(
      ([entry]) => entry?.event === "external_api_retry"
    );
    expect(retryLogs).toHaveLength(2);
    expect(retryLogs.map(([entry]) => entry.attempt)).toEqual([1, 2]);
    expect(retryLogs.every(([entry]) => entry.service === "openMeteo")).toBe(true);
  });

  // base * 2^attempt, so with base 1 the waits are 1ms then 2ms.
  test("backs off exponentially between attempts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => failResponse(500))
    );
    const { service, logger } = buildService({ externalApiRetryBaseDelayMs: 10 });

    await expect(service.fetchOpenMeteo({ latitude: 1 })).rejects.toThrow();

    const waits = logger.warn.mock.calls
      .filter(([entry]) => entry?.event === "external_api_retry")
      .map(([entry]) => entry.waitTimeMs);
    expect(waits).toEqual([10, 20]);
  });

  test("omits empty query parameters rather than sending blanks", async () => {
    const fetchMock = vi.fn(async () => okResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const { service } = buildService();

    await service.fetchOpenMeteo({ latitude: 1, longitude: null, extra: "", keep: "yes" });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("latitude")).toBe("1");
    expect(url.searchParams.has("longitude")).toBe(false);
    expect(url.searchParams.has("extra")).toBe(false);
    expect(url.searchParams.get("keep")).toBe("yes");
    // Always requested so upstream timestamps come back in the caller's zone.
    expect(url.searchParams.get("timezone")).toBe("auto");
  });
});
