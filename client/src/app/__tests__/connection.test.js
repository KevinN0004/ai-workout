/**
 * Pins the connection store: offline when the browser says so or the last
 * request got no answer, online on the next answer, and a probe of
 * /api/health every 30 seconds only while offline and watched.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// A fresh module per test, so no state carries from one test to the next. Its
// subscribe is wrapped so every subscription ends with the test: a copy left
// subscribed would keep its window listeners and answer later tests' events.
let leaves = [];
const loadStore = async () => {
  vi.resetModules();
  const store = await import("../connection.js");
  const subscribeConnection = (listener) => {
    const leave = store.subscribeConnection(listener);
    leaves.push(leave);
    return leave;
  };
  return { ...store, subscribeConnection };
};

let onLine;

beforeEach(() => {
  vi.useFakeTimers();
  onLine = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => onLine);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
  );
});

afterEach(() => {
  leaves.forEach((leave) => leave());
  leaves = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the connection store", () => {
  test("starts online when the browser is", async () => {
    const { getConnection } = await loadStore();

    expect(getConnection()).toBe("online");
  });

  test("is offline while the browser reports no network", async () => {
    const { getConnection } = await loadStore();
    onLine = false;

    expect(getConnection()).toBe("offline");
  });

  test("goes offline when a request gets no answer, and online on the next answer", async () => {
    const { getConnection, markAnswered, markUnanswered } = await loadStore();

    markUnanswered();
    expect(getConnection()).toBe("offline");

    markAnswered();
    expect(getConnection()).toBe("online");
  });

  test("tells each subscriber once per change, and not after it leaves", async () => {
    const { markAnswered, markUnanswered, subscribeConnection } = await loadStore();
    const listener = vi.fn();
    const leave = subscribeConnection(listener);

    markUnanswered();
    markUnanswered();
    expect(listener).toHaveBeenCalledTimes(1);

    markAnswered();
    markAnswered();
    expect(listener).toHaveBeenCalledTimes(2);

    leave();
    markUnanswered();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("tells subscribers when the browser goes offline and online", async () => {
    const { subscribeConnection } = await loadStore();
    const listener = vi.fn();
    subscribeConnection(listener);

    onLine = false;
    window.dispatchEvent(new Event("offline"));
    expect(listener).toHaveBeenCalledTimes(1);

    onLine = true;
    window.dispatchEvent(new Event("online"));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("stops listening to the browser once the last subscriber leaves", async () => {
    const { subscribeConnection } = await loadStore();
    const listener = vi.fn();
    const leave = subscribeConnection(listener);

    leave();
    window.dispatchEvent(new Event("offline"));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("the probe", () => {
  const healthChecks = () => fetch.mock.calls.filter(([url]) => url === "/api/health").length;

  test("asks /api/health every 30 seconds while offline and watched", async () => {
    const { markUnanswered, subscribeConnection } = await loadStore();
    subscribeConnection(() => {});
    markUnanswered();

    await vi.advanceTimersByTimeAsync(29999);
    expect(healthChecks()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(healthChecks()).toBe(1);
    await vi.advanceTimersByTimeAsync(30000);
    expect(healthChecks()).toBe(2);
  });

  test("an answer brings the connection back online and stops the probe", async () => {
    const { getConnection, markUnanswered, subscribeConnection } = await loadStore();
    subscribeConnection(() => {});
    markUnanswered();
    fetch.mockImplementation(() => Promise.resolve({ ok: true, status: 200 }));

    await vi.advanceTimersByTimeAsync(30000);
    expect(getConnection()).toBe("online");

    await vi.advanceTimersByTimeAsync(90000);
    expect(healthChecks()).toBe(1);
  });

  test("an error status is still an answer", async () => {
    const { getConnection, markUnanswered, subscribeConnection } = await loadStore();
    subscribeConnection(() => {});
    markUnanswered();
    fetch.mockImplementation(() => Promise.resolve({ ok: false, status: 503 }));

    await vi.advanceTimersByTimeAsync(30000);

    expect(getConnection()).toBe("online");
  });

  test("gives up on a probe that has not answered in 10 seconds", async () => {
    const { markUnanswered, subscribeConnection } = await loadStore();
    subscribeConnection(() => {});
    markUnanswered();
    let signal;
    fetch.mockImplementation((_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    });

    await vi.advanceTimersByTimeAsync(30000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(signal.aborted).toBe(true);
  });

  test("does not run while no one is watching", async () => {
    const { markUnanswered } = await loadStore();
    markUnanswered();

    await vi.advanceTimersByTimeAsync(120000);

    expect(healthChecks()).toBe(0);
  });

  test("stops when the last subscriber leaves", async () => {
    const { markUnanswered, subscribeConnection } = await loadStore();
    const leave = subscribeConnection(() => {});
    markUnanswered();

    leave();
    await vi.advanceTimersByTimeAsync(120000);

    expect(healthChecks()).toBe(0);
  });

  test("asks at once when the browser comes back online", async () => {
    const { subscribeConnection } = await loadStore();
    subscribeConnection(() => {});
    onLine = false;
    window.dispatchEvent(new Event("offline"));

    onLine = true;
    window.dispatchEvent(new Event("online"));

    expect(healthChecks()).toBe(1);
  });

  // The probe is the backstop for an online event that never comes, as under
  // Playwright's Firefox offline emulation: navigator.onLine turns true with no
  // event, and the store, offline only because the browser said so, must still
  // find out once the server answers.
  test("an answer brings the page back online when the browser's online event never came", async () => {
    const { getConnection, subscribeConnection } = await loadStore();
    onLine = false;
    const listener = vi.fn();
    subscribeConnection(listener);
    expect(getConnection()).toBe("offline");

    onLine = true;
    fetch.mockImplementation(() => Promise.resolve({ ok: true, status: 200 }));
    await vi.advanceTimersByTimeAsync(30000);

    expect(listener).toHaveBeenCalled();
    expect(getConnection()).toBe("online");
    await vi.advanceTimersByTimeAsync(90000);
    expect(healthChecks()).toBe(1);
  });
});
