import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchWithTimeout } from "./network.js";

const abortError = () => {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchWithTimeout", () => {
  test("returns the response and forwards the caller's options", async () => {
    const response = { ok: true };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWithTimeout("/api/thing", { method: "POST" });

    expect(result).toBe(response);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/thing");
    expect(options.method).toBe("POST");
    // The abort signal has to reach fetch, or the timeout cannot cancel it.
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test("works with no options at all", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWithTimeout("/api/thing")).resolves.toEqual({ ok: true });
  });

  test("turns an AbortError into a message a user can act on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError()));

    await expect(fetchWithTimeout("/api/thing")).rejects.toThrow(
      "Request timed out. Please try again."
    );
  });

  test("rethrows any other failure untouched", async () => {
    const failure = new Error("connection refused");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));

    // Not wrapped, not renamed -- the caller needs the original.
    await expect(fetchWithTimeout("/api/thing")).rejects.toBe(failure);
  });

  test("clears the timer whether the request succeeds or fails", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await fetchWithTimeout("/api/thing");
    expect(clearSpy).toHaveBeenCalledTimes(1);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(fetchWithTimeout("/api/thing")).rejects.toThrow("boom");
    // A leaked timer would hold the process open and abort a later request.
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  test("aborts once the timeout elapses", async () => {
    vi.useFakeTimers();
    try {
      // Resolve only when the signal aborts, so the timer is what ends it.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (url, options) =>
            new Promise((_resolve, reject) => {
              options.signal.addEventListener("abort", () => reject(abortError()));
            })
        )
      );

      const pending = fetchWithTimeout("/api/thing", {}, 50);
      const assertion = expect(pending).rejects.toThrow("Request timed out. Please try again.");
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
