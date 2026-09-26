import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as Sentry from "@sentry/react";
import { initErrorTracking } from "../errorTracking.js";

// The SDK is the boundary: what matters here is whether it is started, with
// what, and what it is handed -- not what it then does over the network.
vi.mock("@sentry/react", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  replayIntegration: vi.fn(() => ({ name: "Replay" }))
}));

const DSN = "https://publickey@o123.ingest.us.sentry.io/456";

const initConfig = () => Sentry.init.mock.calls[0][0];

// A loader the test controls, so it decides when the SDK "arrives".
const deferredLoad = () => {
  let arrive;
  let fail;
  const pending = new Promise((resolve, reject) => {
    arrive = () => resolve(Sentry);
    fail = reject;
  });
  return { load: () => pending, arrive, fail };
};

const throwOnWindow = (init) => window.dispatchEvent(new ErrorEvent("error", init));

// jsdom has no PromiseRejectionEvent, so the reason rides a plain event.
const rejectOnWindow = (reason) => {
  const event = new Event("unhandledrejection");
  event.reason = reason;
  window.dispatchEvent(event);
};

// The very handlers that were added, not merely some handler of that type.
const expectListenersReleased = (added, removed) => {
  for (const type of ["error", "unhandledrejection"]) {
    const [, handler] = added.mock.calls.find(([addedType]) => addedType === type);
    expect(removed).toHaveBeenCalledWith(type, handler);
  }
};

beforeEach(() => {
  // Pinned rather than inherited, so a developer's own client/.env.local
  // cannot turn the "no DSN" cases on.
  vi.stubEnv("VITE_SENTRY_DSN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("initErrorTracking", () => {
  test.each([
    ["absent", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["null", null]
  ])("stays off, and never fetches the SDK, when the DSN is %s", async (_label, dsn) => {
    const load = vi.fn();

    await expect(initErrorTracking(dsn, load)).resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  test("loads the SDK and reads the DSN the bundle was built with", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", DSN);

    // No loader passed: this is the real dynamic import of errorTrackingSdk.js,
    // resolving to the mocked SDK.
    await expect(initErrorTracking()).resolves.toBe(true);
    expect(initConfig().dsn).toBe(DSN);
  });

  test("trims a DSN pasted with surrounding whitespace", async () => {
    await initErrorTracking(`  ${DSN}\n`);

    expect(initConfig().dsn).toBe(DSN);
  });

  test("starts tracing and replay at the configured sample rates", async () => {
    await initErrorTracking(DSN);

    const config = initConfig();
    expect(config.integrations).toEqual([{ name: "BrowserTracing" }, { name: "Replay" }]);
    expect(config.tracesSampleRate).toBe(1.0);
    expect(config.replaysSessionSampleRate).toBe(0.1);
    expect(config.replaysOnErrorSampleRate).toBe(1.0);
  });

  test("keeps replay's masking defaults", async () => {
    await initErrorTracking(DSN);

    // Any option passed here is a chance to switch masking off; profile data
    // (weight, body fat, age) would then be recorded verbatim.
    expect(Sentry.replayIntegration).toHaveBeenCalledWith();
  });

  test("leaves trace propagation at its same-origin default", async () => {
    await initErrorTracking(DSN);

    // Setting it replaces the default rather than adding to it, and the
    // snippet this was adapted from named "localhost" -- which would trace
    // the dev server and nothing in production.
    expect(initConfig()).not.toHaveProperty("tracePropagationTargets");
  });

  test("reports what was thrown before the SDK arrived", async () => {
    const { load, arrive } = deferredLoad();
    const started = initErrorTracking(DSN, load);

    // A crash while mounting, a cross-origin "Script error." that carries only
    // a message, and a rejected promise -- all before the chunk has loaded.
    const crash = new Error("mount failed");
    throwOnWindow({ error: crash });
    throwOnWindow({ message: "Script error." });
    const rejection = new Error("request failed");
    rejectOnWindow(rejection);
    expect(Sentry.captureException).not.toHaveBeenCalled();

    arrive();
    await expect(started).resolves.toBe(true);

    expect(Sentry.captureException.mock.calls).toEqual([[crash], ["Script error."], [rejection]]);
  });

  test("stops listening once the SDK's own handlers are running", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { load, arrive } = deferredLoad();
    const started = initErrorTracking(DSN, load);
    arrive();
    await started;

    // Anything later is the SDK's to catch. A listener left behind would not
    // double-report -- the held errors were already flushed -- but it would go
    // on collecting errors nothing will ever send, so it is asserted directly.
    expectListenersReleased(added, removed);
  });

  test("holds at most ten errors while it waits", async () => {
    const { load, arrive } = deferredLoad();
    const started = initErrorTracking(DSN, load);

    for (let frame = 0; frame < 25; frame += 1) {
      throwOnWindow({ error: new Error(`frame ${frame}`) });
    }
    arrive();
    await started;

    expect(Sentry.captureException).toHaveBeenCalledTimes(10);
    expect(Sentry.captureException.mock.calls[0][0].message).toBe("frame 0");
  });

  test("gives up quietly when the SDK chunk cannot load", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { load, fail } = deferredLoad();
    const started = initErrorTracking(DSN, load);

    fail(new Error("Failed to fetch dynamically imported module"));

    await expect(started).resolves.toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
    // Nothing is left listening for errors that no SDK will ever report.
    expectListenersReleased(added, removed);
  });
});
