import { describe, expect, test } from "vitest";
import {
  createExternalApiLatencyRecorder,
  createMetrics,
  initLatencyStats,
  recordLatencyStats
} from "./metricsService.js";

// These three guards were the last uncovered statements in index.js. They were
// not untested because anyone judged them unimportant -- they were module-scope
// privates in a 778-line file, reachable only by booting the whole app. Moving
// them here is what made them assertable.

const cleanText = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

describe("recordLatencyStats", () => {
  test("folds a duration into an empty bucket", () => {
    const bucket = initLatencyStats();

    recordLatencyStats(bucket, 40);

    expect(bucket).toEqual({ count: 1, totalMs: 40, maxMs: 40, lastMs: 40 });
  });

  test("accumulates count and total, and keeps the largest as the max", () => {
    const bucket = initLatencyStats();

    recordLatencyStats(bucket, 40);
    recordLatencyStats(bucket, 10);

    // lastMs is the most recent, not the smallest -- the two differ here on
    // purpose, because a bucket that reported the min as "last" would look
    // identical on a monotonically rising series.
    expect(bucket).toEqual({ count: 2, totalMs: 50, maxMs: 40, lastMs: 10 });
  });

  // The caller measures with Date.now() deltas, so a clock adjustment mid
  // request can produce a negative. Recording one would corrupt the running
  // total and the max for the lifetime of the process.
  test.each([
    ["a negative duration", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY]
  ])("ignores %s", (_label, durationMs) => {
    const bucket = initLatencyStats();

    recordLatencyStats(bucket, durationMs);

    expect(bucket).toEqual({ count: 0, totalMs: 0, maxMs: 0, lastMs: 0 });
  });

  // Zero is a real measurement -- a sub-millisecond request -- not an absence.
  test("records a zero duration rather than discarding it", () => {
    const bucket = initLatencyStats();

    recordLatencyStats(bucket, 0);

    expect(bucket.count).toBe(1);
  });

  test("does nothing, and does not throw, without a bucket", () => {
    expect(() => recordLatencyStats(null, 40)).not.toThrow();
    expect(() => recordLatencyStats(undefined, 40)).not.toThrow();
  });
});

describe("createMetrics", () => {
  test("seeds the four upstreams so /api/metrics reports them from boot", () => {
    const metrics = createMetrics();

    expect(Object.keys(metrics.externalApiLatencyMs).sort()).toEqual([
      "mealDb",
      "openAq",
      "openMeteo",
      "wger"
    ]);
  });

  test("hands out independent buckets rather than one shared object", () => {
    const metrics = createMetrics();

    recordLatencyStats(metrics.externalApiLatencyMs.wger, 12);

    expect(metrics.externalApiLatencyMs.wger.count).toBe(1);
    expect(metrics.externalApiLatencyMs.openMeteo.count).toBe(0);
    expect(metrics.requestLatencyMs.count).toBe(0);
  });

  test("gives each call its own metrics object", () => {
    const first = createMetrics();
    const second = createMetrics();

    first.requestsTotal += 1;

    expect(second.requestsTotal).toBe(0);
  });
});

describe("createExternalApiLatencyRecorder", () => {
  const build = () => {
    const metrics = createMetrics();
    return { metrics, record: createExternalApiLatencyRecorder({ metrics, cleanText }) };
  };

  test("folds a latency into the named upstream's bucket", () => {
    const { metrics, record } = build();

    record("openMeteo", 25);

    expect(metrics.externalApiLatencyMs.openMeteo).toEqual({
      count: 1,
      totalMs: 25,
      maxMs: 25,
      lastMs: 25
    });
  });

  test("creates a bucket for an upstream that was not seeded", () => {
    const { metrics, record } = build();

    record("somethingNew", 11);

    expect(metrics.externalApiLatencyMs.somethingNew).toEqual({
      count: 1,
      totalMs: 11,
      maxMs: 11,
      lastMs: 11
    });
  });

  // Found by mutation: seeding the new key with an existing bucket instead of a
  // fresh one produces identical numbers on the assertion above, because the
  // bucket it would alias is also zeroed at that point. The aliasing is a real
  // defect -- every later external latency would also be folded into request
  // latency -- so the neighbours have to be checked, not just the new key.
  test("seeds a new upstream with its own bucket rather than an alias", () => {
    const { metrics, record } = build();

    record("somethingNew", 11);

    expect(metrics.externalApiLatencyMs.somethingNew.count).toBe(1);
    expect(metrics.requestLatencyMs.count).toBe(0);
    expect(metrics.externalApiLatencyMs.openMeteo.count).toBe(0);
  });

  // The key set must stay bounded. If a caller could push an arbitrary or empty
  // name in, externalApiLatencyMs would grow without limit -- the same reasoning
  // as the route-path sanitising in requestContext.js.
  test.each([
    ["an empty string", ""],
    ["whitespace only", "   "],
    ["a non-string", 42],
    ["null", null],
    ["undefined", undefined]
  ])("drops %s as a service name", (_label, serviceName) => {
    const { metrics, record } = build();
    const before = Object.keys(metrics.externalApiLatencyMs).length;

    record(serviceName, 25);

    expect(Object.keys(metrics.externalApiLatencyMs).length).toBe(before);
  });

  test("trims a padded service name rather than keying on the padding", () => {
    const { metrics, record } = build();

    record("  openMeteo  ", 25);

    expect(metrics.externalApiLatencyMs.openMeteo.count).toBe(1);
    expect(metrics.externalApiLatencyMs["  openMeteo  "]).toBeUndefined();
  });

  test("passes a bad duration through to the same guard", () => {
    const { metrics, record } = build();

    record("openMeteo", -5);

    expect(metrics.externalApiLatencyMs.openMeteo.count).toBe(0);
  });
});
