import { describe, expect, test, vi } from "vitest";

// index.js wires one forwarder to the error tracker into both 5xx paths: the
// error middleware, for errors that reach it, and sendErrorResponse, for
// errors a route catches and answers itself. This pins that both get the same
// function, so a route-caught 5xx is reported exactly as an uncaught one is.
// Both modules are the real ones, wrapped only to record what index.js hands
// them.

const { setErrorResponseTracker, createErrorHandler } = vi.hoisted(() => ({
  setErrorResponseTracker: vi.fn(),
  createErrorHandler: vi.fn()
}));

vi.mock("../services/http/errorResponseService.js", async (importOriginal) => {
  const original = await importOriginal();
  setErrorResponseTracker.mockImplementation(original.setErrorResponseTracker);
  return { ...original, setErrorResponseTracker };
});

vi.mock("../middleware/errorHandler.js", async (importOriginal) => {
  const original = await importOriginal();
  createErrorHandler.mockImplementation(original.createErrorHandler);
  return { ...original, createErrorHandler };
});

describe("error tracking wiring in index.js", () => {
  test("gives sendErrorResponse the forwarder the error middleware uses", async () => {
    await import("../index.js");

    expect(setErrorResponseTracker).toHaveBeenCalledTimes(1);
    const forwarder = setErrorResponseTracker.mock.calls[0][0];
    expect(createErrorHandler.mock.calls[0][0].captureException).toBe(forwarder);
    // Until startServer runs initErrorTracking the tracker is the disabled
    // one, so forwarding does nothing rather than throw.
    expect(() => forwarder(new Error("boom"), { status: 500 })).not.toThrow();
  });
});
