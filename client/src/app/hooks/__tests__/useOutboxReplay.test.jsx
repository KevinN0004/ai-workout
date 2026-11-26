/**
 * Pins useOutboxReplay: kept entries are sent oldest first, one at a time,
 * while online; a run stops at the first that has to wait, drops one the
 * server refuses, and ends with one toast for what it saved.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useOutboxReplay from "../useOutboxReplay";
import { addToOutbox, readOutbox } from "../../outbox";
import { markUnanswered } from "../../connection";

// The fake options hold every member the hook reads, each function a mock, with
// apiFetch a loose one; each answer only ok, status and json.
/** @typedef {import("../useOutboxReplay.js").OutboxReplayOptions} OutboxReplayOptions */
/** @typedef {Omit<import("vitest").Mocked<OutboxReplayOptions>, "apiFetch"> & { apiFetch: import("vitest").Mock }} FakeDeps */

const ada = { email: "ada@example.com" };
// A kept entry of a real log type, sent to its own route under /api/dashboard.
/**
 * @param {string} clientId
 * @param {import("../../outbox.js").LogType} [type]
 * @param {string} [route]
 */
const keep = (clientId, type = "workout", route = type) =>
  addToOutbox(ada, {
    clientId,
    type,
    url: `/api/dashboard/${route}`,
    body: { id: clientId },
    item: { id: `op-${clientId}` },
    queuedAt: 1
  });
/**
 * @param {number} status
 * @param {unknown} [body]
 */
const answer = (status, body = {}) =>
  /** @type {Response} */ (
    /** @type {unknown} */ ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body
    })
  );
/** @param {string} clientId */
const saved = (clientId) => answer(200, { dashboard: { saved: clientId } });
/** @param {import("vitest").Mock} apiFetch */
const sentIds = (apiFetch) => apiFetch.mock.calls.map(([, options]) => JSON.parse(options.body).id);

/** @type {FakeDeps} */
let deps;
/** @param {{ [K in keyof OutboxReplayOptions]?: unknown }} [overrides] */
const render = (overrides = {}) => {
  deps = /** @type {FakeDeps} */ (
    /** @type {unknown} */ ({
      user: ada,
      apiFetch: vi.fn(async (_url, options) => saved(JSON.parse(options.body).id)),
      ensureCsrfToken: vi.fn(async () => "fresh"),
      captureAccount: () => () => true,
      setDashboard: vi.fn(),
      setDashError: vi.fn(),
      showDashboardToast: vi.fn(),
      removeQueuedEntry: vi.fn(),
      ...overrides
    })
  );
  return renderHook(() => useOutboxReplay(deps));
};
const settle = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("navigator", { onLine: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("useOutboxReplay", () => {
  test("sends every kept entry, oldest first, and says how many were saved", async () => {
    keep("k1");
    keep("k2", "meal", "meal-logs");
    render();
    await settle();

    expect(sentIds(deps.apiFetch)).toEqual(["k1", "k2"]);
    expect(deps.apiFetch.mock.calls[1][0]).toBe("/api/dashboard/meal-logs");
    expect(readOutbox(ada)).toEqual([]);
    expect(deps.removeQueuedEntry.mock.calls).toEqual([["op-k1"], ["op-k2"]]);
    expect(deps.setDashboard).toHaveBeenLastCalledWith({ saved: "k2" });
    expect(deps.showDashboardToast).toHaveBeenCalledTimes(1);
    expect(deps.showDashboardToast).toHaveBeenCalledWith("2 entries saved.");
  });

  test("says one entry in the singular", async () => {
    keep("k1");
    render();
    await settle();

    expect(deps.showDashboardToast).toHaveBeenCalledWith("1 entry saved.");
  });

  test("sends one at a time: the next waits for the answer before it", async () => {
    keep("k1");
    keep("k2");
    /** @type {((value: unknown) => void) | undefined} */
    let answerFirst;
    render({
      apiFetch: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              answerFirst = resolve;
            })
        )
        .mockImplementation(async () => saved("k2"))
    });
    await settle();
    expect(deps.apiFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      // The first send has started, so its resolver is set.
      /** @type {(value: unknown) => void} */ (answerFirst)(saved("k1"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(deps.apiFetch).toHaveBeenCalledTimes(2);
  });

  test("stops at the first entry that has to wait, and keeps it and the rest", async () => {
    keep("k1");
    keep("k2");
    keep("k3");
    render({
      apiFetch: vi
        .fn()
        .mockResolvedValueOnce(saved("k1"))
        .mockResolvedValueOnce(answer(503, { error: "Busy." }))
    });
    await settle();

    expect(sentIds(deps.apiFetch)).toEqual(["k1", "k2"]);
    expect(readOutbox(ada).map((entry) => entry.clientId)).toEqual(["k2", "k3"]);
    expect(deps.showDashboardToast).toHaveBeenCalledWith("1 entry saved.");
  });

  test("a run that saves nothing says nothing", async () => {
    keep("k1");
    render({ apiFetch: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))) });
    await settle();

    expect(readOutbox(ada)).toHaveLength(1);
    expect(deps.showDashboardToast).not.toHaveBeenCalled();
  });

  test("drops an entry the server refuses, reports it, and goes on", async () => {
    keep("k1");
    keep("k2");
    render({
      apiFetch: vi
        .fn()
        .mockResolvedValueOnce(answer(400, { error: "Date and duration are required." }))
        .mockResolvedValueOnce(saved("k2"))
    });
    await settle();

    expect(readOutbox(ada)).toEqual([]);
    expect(deps.removeQueuedEntry.mock.calls).toEqual([["op-k1"], ["op-k2"]]);
    expect(deps.setDashError).toHaveBeenCalledWith("Date and duration are required.");
    expect(deps.showDashboardToast).toHaveBeenCalledWith("1 entry saved.");
  });

  test("falls back to a message naming the entry when the refusal has none", async () => {
    keep("k1", "calorie", "calories");
    render({ apiFetch: vi.fn(async () => answer(400)) });
    await settle();

    expect(deps.setDashError).toHaveBeenCalledWith("Unable to save calorie.");
  });

  test("does nothing while offline, and sends once the connection is back", async () => {
    keep("k1");
    markUnanswered();
    render();
    await settle();
    expect(deps.apiFetch).not.toHaveBeenCalled();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer(200))
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(sentIds(deps.apiFetch)).toEqual(["k1"]);
  });

  test("tries again every 30 seconds while an entry waits", async () => {
    keep("k1");
    render({
      apiFetch: vi.fn().mockResolvedValueOnce(answer(503)).mockResolvedValueOnce(saved("k1"))
    });
    await settle();
    expect(readOutbox(ada)).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });

    expect(readOutbox(ada)).toEqual([]);
  });

  test("does not start a second run while one is still out", async () => {
    keep("k1");
    render({ apiFetch: vi.fn(() => new Promise(() => {})) });
    await settle();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(90000);
    });

    expect(deps.apiFetch).toHaveBeenCalledTimes(1);
  });

  test("does nothing with no one signed in", async () => {
    keep("k1");
    render({ user: null });
    await settle();

    expect(deps.apiFetch).not.toHaveBeenCalled();
  });

  test("touches nothing once the account has signed out", async () => {
    keep("k1");
    render({ captureAccount: () => () => false });
    await settle();

    expect(readOutbox(ada)).toHaveLength(1);
    expect(deps.setDashboard).not.toHaveBeenCalled();
    expect(deps.removeQueuedEntry).not.toHaveBeenCalled();
  });

  describe("across tabs", () => {
    test("runs inside the outbox lock", async () => {
      keep("k1");
      const request = vi.fn((_name, _options, run) => run({ name: "ai-workout-outbox" }));
      vi.stubGlobal("navigator", { onLine: true, locks: { request } });
      render();
      await settle();

      expect(request).toHaveBeenCalledWith(
        "ai-workout-outbox",
        { ifAvailable: true },
        expect.any(Function)
      );
      expect(sentIds(deps.apiFetch)).toEqual(["k1"]);
    });

    test("leaves the run to the tab that holds the lock", async () => {
      keep("k1");
      vi.stubGlobal("navigator", {
        onLine: true,
        locks: { request: vi.fn((_name, _options, run) => run(null)) }
      });
      render();
      await settle();

      expect(deps.apiFetch).not.toHaveBeenCalled();
      expect(readOutbox(ada)).toHaveLength(1);
    });
  });
});
