import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
  withScope: vi.fn(),
  scope: { setTag: vi.fn(), setLevel: vi.fn() }
}));

// The service reads `sentryModule?.default || sentryModule` for CJS/ESM interop,
// and vitest throws on a mock that has no `default` export, so declare both and
// point them at the same spies.
vi.mock("@sentry/node", () => {
  const api = {
    init: sentry.init,
    captureException: sentry.captureException,
    flush: sentry.flush,
    withScope: sentry.withScope
  };
  return { ...api, default: api };
});

const { initErrorTracking, __testables } = await import("../errorTrackingService.js");

const toShortText = (value, maxLen = 160) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const createLogger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  sentry.withScope.mockImplementation((fn) => fn(sentry.scope));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("initErrorTracking without a DSN", () => {
  test("stays disabled and reports itself unconfigured", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const tracker = await initErrorTracking({ logger: createLogger(), toShortText });

    expect(tracker.enabled).toBe(false);
    expect(tracker.configured).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  test("exposes no-op hooks so callers need no null checks", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    const tracker = await initErrorTracking({ logger: createLogger(), toShortText });

    expect(() => tracker.captureException(new Error("boom"))).not.toThrow();
    await expect(tracker.flush(10)).resolves.toBeUndefined();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });
});

describe("initErrorTracking with a DSN", () => {
  const dsn = "https://public@example.ingest.sentry.io/1";

  test("initializes Sentry and reports itself enabled", async () => {
    vi.stubEnv("SENTRY_DSN", dsn);
    vi.stubEnv("SENTRY_ENVIRONMENT", "staging");
    vi.stubEnv("SENTRY_RELEASE", "v1.2.3");
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "0.25");

    const tracker = await initErrorTracking({ logger: createLogger(), toShortText });

    expect(tracker.enabled).toBe(true);
    expect(tracker.configured).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith({
      dsn,
      environment: "staging",
      release: "v1.2.3",
      tracesSampleRate: 0.25,
      dataCollection: __testables.DATA_COLLECTION
    });
  });

  // v11 collects request bodies and cookies unless told not to. On this server a
  // body is a password or a profile, and a cookie is a session token. Checked
  // against the real SDK with a failing POST: without this, the password and the
  // weight were both in the event that left the process.
  test("keeps request bodies, cookies and user data out of events", async () => {
    vi.stubEnv("SENTRY_DSN", dsn);
    await initErrorTracking({ logger: createLogger(), toShortText });

    const { dataCollection } = sentry.init.mock.calls[0][0];
    expect(dataCollection.httpBodies).toEqual([]);
    expect(dataCollection.cookies).toBe(false);
    expect(dataCollection.userInfo).toBe(false);
    expect(dataCollection.databaseQueryData).toBe(false);
  });

  test("sends release as undefined rather than an empty string", async () => {
    vi.stubEnv("SENTRY_DSN", dsn);
    vi.stubEnv("SENTRY_RELEASE", "");
    await initErrorTracking({ logger: createLogger(), toShortText });

    expect(sentry.init.mock.calls[0][0].release).toBeUndefined();
  });

  // A rate outside 0..1 is a configuration mistake that would otherwise be passed
  // straight to Sentry, so it is clamped rather than trusted.
  test.each([
    ["-1", 0],
    ["5", 1],
    ["not-a-number", 0],
    [undefined, 0]
  ])("clamps a traces sample rate of %s to %s", async (input, expected) => {
    vi.stubEnv("SENTRY_DSN", dsn);
    if (input === undefined) vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "");
    else vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", input);

    await initErrorTracking({ logger: createLogger(), toShortText });

    expect(sentry.init.mock.calls[0][0].tracesSampleRate).toBe(expected);
  });

  test("tags a captured exception with the request context", async () => {
    vi.stubEnv("SENTRY_DSN", dsn);
    const tracker = await initErrorTracking({ logger: createLogger(), toShortText });
    const error = new Error("boom");

    tracker.captureException(error, {
      requestId: "req-1",
      method: "POST",
      path: "/api/generate",
      status: 500
    });

    expect(sentry.scope.setTag).toHaveBeenCalledWith("request_id", "req-1");
    expect(sentry.scope.setTag).toHaveBeenCalledWith("http_method", "POST");
    expect(sentry.scope.setTag).toHaveBeenCalledWith("http_path", "/api/generate");
    expect(sentry.scope.setTag).toHaveBeenCalledWith("http_status", "500");
    expect(sentry.scope.setLevel).toHaveBeenCalledWith("error");
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });

  test("omits tags for context fields that were not supplied", async () => {
    vi.stubEnv("SENTRY_DSN", dsn);
    const tracker = await initErrorTracking({ logger: createLogger(), toShortText });

    tracker.captureException(new Error("boom"));

    expect(sentry.scope.setTag).not.toHaveBeenCalled();
    expect(sentry.captureException).toHaveBeenCalled();
  });

  test("delegates flush to Sentry with the supplied timeout", async () => {
    vi.stubEnv("SENTRY_DSN", dsn);
    const tracker = await initErrorTracking({ logger: createLogger(), toShortText });

    await tracker.flush(1234);

    expect(sentry.flush).toHaveBeenCalledWith(1234);
  });
});

// `toRate` is the one numeric helper on the server whose range check does not
// protect it: `toPositiveInt` and `parseRedisPort` reject the accidental 0 with
// `> 0` and a port range, but 0 is a legitimate sample rate, so a null or an
// empty env var coerced straight to a real 0.
//
// It was not a live bug, because the only call site passes 0 as the fallback
// and the two answers coincided. These pin the fallback apart from the
// accidental zero so that stays true if the default ever changes.
describe("toRate", () => {
  const { toRate } = __testables;

  test.each([
    ["null", null],
    ["an empty string", ""],
    ["undefined", undefined]
  ])("treats %s as absent and returns the fallback", (_label, value) => {
    expect(toRate(value, 0.5)).toBe(0.5);
  });

  // The counterpart: 0 is a real sample rate meaning "trace nothing", and an
  // operator who sets it deliberately must not silently get the default back.
  test.each([
    ["a number", 0],
    ["a string", "0"]
  ])("keeps an explicit zero given as %s", (_label, value) => {
    expect(toRate(value, 0.5)).toBe(0);
  });
});
