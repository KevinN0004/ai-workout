import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useProgression from "../useProgression";

// Pins how the dashboard reads the week's progression (roadmap B4) and
// answers it. apiFetch, the network boundary, is stubbed.

const NOW = new Date("2026-11-11T12:00:00");
const WEEK = { weekStart: "2026-11-09", deloadWeek: { active: false }, lifts: [] };

const respond = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });

// A promise and the functions that settle it, to stage two answers out of order.
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const dashboardOf = ({ planId = "plan-1", sessionIds = ["w-1"] } = {}) => ({
  plans: planId ? [{ id: planId }] : [],
  workoutSessions: sessionIds.map((id) => ({ id }))
});

const renderProgression = (initial) =>
  renderHook((props) => useProgression(props), { initialProps: initial });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useProgression: reading the week", () => {
  test("reads the week with today's local date, and holds it", async () => {
    const apiFetch = vi.fn(async () => respond({ progression: WEEK }));
    const { result } = renderProgression({ dashboard: dashboardOf(), notes: "", apiFetch });

    await waitFor(() => expect(result.current.progression).toEqual(WEEK));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/dashboard/progression?today=2026-11-11");
  });

  test("reads nothing without a plan, or without apiFetch", async () => {
    const apiFetch = vi.fn(async () => respond({ progression: WEEK }));
    const noPlan = renderProgression({
      dashboard: dashboardOf({ planId: null }),
      notes: "",
      apiFetch
    });
    const noFetch = renderProgression({ dashboard: dashboardOf(), notes: "", apiFetch: undefined });
    const noDashboard = renderProgression({ dashboard: null, notes: "", apiFetch });

    await act(async () => {});
    expect(apiFetch).not.toHaveBeenCalled();
    expect(noPlan.result.current.progression).toBeNull();
    expect(noFetch.result.current.progression).toBeNull();
    expect(noDashboard.result.current.progression).toBeNull();
  });

  test.each([
    ["a new newest plan", { dashboard: dashboardOf({ planId: "plan-2" }), notes: "" }],
    ["a changed profile note", { dashboard: dashboardOf(), notes: "sore knee" }],
    ["a newly saved session", { dashboard: dashboardOf({ sessionIds: ["w-2", "w-1"] }), notes: "" }]
  ])("reads the week again after %s", async (_label, next) => {
    const apiFetch = vi.fn(async () => respond({ progression: WEEK }));
    const { rerender } = renderProgression({ dashboard: dashboardOf(), notes: "", apiFetch });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    rerender({ ...next, apiFetch });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
  });

  test.each([
    ["an optimistic entry", dashboardOf({ sessionIds: ["optimistic-workout-1-a", "w-1"] })],
    ["a re-render with the same key", dashboardOf()]
  ])("does not read the week again for %s", async (_label, dashboard) => {
    const apiFetch = vi.fn(async () => respond({ progression: WEEK }));
    const { rerender } = renderProgression({ dashboard: dashboardOf(), notes: "", apiFetch });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    rerender({ dashboard, notes: "", apiFetch });
    await act(async () => {});

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  test("a plan removed hides the week it read", async () => {
    const apiFetch = vi.fn(async () => respond({ progression: WEEK }));
    const { result, rerender } = renderProgression({
      dashboard: dashboardOf(),
      notes: "",
      apiFetch
    });
    await waitFor(() => expect(result.current.progression).toEqual(WEEK));

    rerender({ dashboard: dashboardOf({ planId: null }), notes: "", apiFetch });

    expect(result.current.progression).toBeNull();
  });

  test("a failed read leaves the week null, and a thrown one too", async () => {
    const failed = renderProgression({
      dashboard: dashboardOf(),
      notes: "",
      apiFetch: vi.fn(async () => respond({ error: "nope" }, false))
    });
    const thrown = renderProgression({
      dashboard: dashboardOf(),
      notes: "",
      apiFetch: vi.fn(async () => {
        throw new Error("offline");
      })
    });

    await act(async () => {});
    expect(failed.result.current.progression).toBeNull();
    expect(thrown.result.current.progression).toBeNull();
  });

  test("an answer to an older read is dropped", async () => {
    const first = deferred();
    const second = deferred();
    const apiFetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderProgression({
      dashboard: dashboardOf(),
      notes: "",
      apiFetch
    });
    rerender({ dashboard: dashboardOf({ planId: "plan-2" }), notes: "", apiFetch });

    const newer = { ...WEEK, lifts: [{ key: "newer" }] };
    await act(async () => {
      second.resolve(respond({ progression: newer }));
    });
    await act(async () => {
      first.resolve(respond({ progression: WEEK }));
    });

    expect(result.current.progression).toEqual(newer);
  });

  test("an older read failing late does not clear the newer week", async () => {
    const first = deferred();
    const newer = { ...WEEK, lifts: [{ key: "newer" }] };
    const apiFetch = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(respond({ progression: newer }));
    const { result, rerender } = renderProgression({
      dashboard: dashboardOf(),
      notes: undefined,
      apiFetch
    });
    rerender({ dashboard: dashboardOf({ planId: "plan-2" }), notes: undefined, apiFetch });
    await waitFor(() => expect(result.current.progression).toEqual(newer));

    await act(async () => {
      first.resolve(respond({ error: "late" }, false));
    });

    expect(result.current.progression).toEqual(newer);
  });
});

describe("useProgression: answering", () => {
  const loaded = async (apiFetch) => {
    const hook = renderProgression({ dashboard: dashboardOf(), notes: "", apiFetch });
    await waitFor(() => expect(hook.result.current.progression).toEqual(WEEK));
    return hook;
  };

  test("a lift's answer is a PUT on its path, and the week it answers is swapped in", async () => {
    const answered = { ...WEEK, lifts: [{ key: "leg press", decision: "undo" }] };
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ progression: WEEK }))
      .mockResolvedValueOnce(respond({ progression: answered }));
    const { result } = await loaded(apiFetch);

    await act(async () => {
      await result.current.answer({ liftKey: "leg press", decision: "undo" });
    });

    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/dashboard/progression/2026-11-09/lifts/leg%20press",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "undo" })
      }
    );
    expect(result.current.progression).toEqual(answered);
    expect(result.current.error).toBe("");
  });

  test("the week's answer goes to the week's path, and taking one back is a DELETE", async () => {
    const apiFetch = vi.fn(async () => respond({ progression: WEEK }));
    const { result } = await loaded(apiFetch);

    await act(async () => {
      await result.current.answer({ decision: "normal" });
    });
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/dashboard/progression/2026-11-09/week",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ decision: "normal" }) })
    );

    await act(async () => {
      await result.current.answer({ liftKey: "leg press", decision: null });
    });
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/dashboard/progression/2026-11-09/lifts/leg%20press",
      { method: "DELETE" }
    );
  });

  test("a refused answer keeps the week and says why, and the next success clears it", async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ progression: WEEK }))
      .mockResolvedValueOnce(respond({ error: "Answers can only be given for this week." }, false))
      .mockRejectedValueOnce(new Error("Request timed out. Please try again."))
      .mockResolvedValueOnce(respond({}, false))
      .mockResolvedValueOnce(respond({ progression: WEEK }));
    const { result } = await loaded(apiFetch);
    const undo = () => result.current.answer({ liftKey: "leg press", decision: "undo" });

    await act(undo);
    expect(result.current.error).toBe("Answers can only be given for this week.");
    expect(result.current.progression).toEqual(WEEK);

    await act(undo);
    expect(result.current.error).toBe("Request timed out. Please try again.");

    await act(undo);
    expect(result.current.error).toBe("Could not save that answer. Try again.");

    await act(undo);
    expect(result.current.error).toBe("");
  });

  test("a refusal whose body is not JSON says the answer was not saved", async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ progression: WEEK }))
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        }
      });
    const { result } = await loaded(apiFetch);

    await act(() => result.current.answer({ liftKey: "leg press", decision: "undo" }));

    expect(result.current.error).toBe("Could not save that answer. Try again.");
    expect(result.current.progression).toEqual(WEEK);
  });

  test("an answer whose week has gone, or that fails without a reason, is handled", async () => {
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ progression: WEEK }))
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce(respond({ progression: null }));
    const { result } = await loaded(apiFetch);
    const undo = () => result.current.answer({ liftKey: "leg press", decision: "undo" });

    await act(undo);
    expect(result.current.error).toBe("Could not save that answer. Try again.");

    // The plan was replaced between the read and the answer.
    await act(undo);
    expect(result.current.progression).toBeNull();
  });

  test("of two answers in flight, the earlier one landing last is dropped", async () => {
    const first = deferred();
    const second = deferred();
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ progression: WEEK }))
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = await loaded(apiFetch);
    const latest = { ...WEEK, lifts: [{ key: "leg press", decision: "accept" }] };

    let pending;
    act(() => {
      pending = [
        result.current.answer({ liftKey: "leg press", decision: "undo" }),
        result.current.answer({ liftKey: "leg press", decision: "accept" })
      ];
    });
    await act(async () => {
      second.resolve(respond({ progression: latest }));
      await pending[1];
    });
    await act(async () => {
      first.resolve(respond({ progression: WEEK }));
      await pending[0];
    });

    expect(result.current.progression).toEqual(latest);
  });

  test("an earlier answer failing after a later one landed leaves no error", async () => {
    const first = deferred();
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ progression: WEEK }))
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(respond({ progression: WEEK }));
    const { result } = await loaded(apiFetch);

    let earlier;
    act(() => {
      earlier = result.current.answer({ liftKey: "leg press", decision: "undo" });
    });
    await act(() => result.current.answer({ liftKey: "leg press", decision: "accept" }));
    await act(async () => {
      first.resolve(respond({ error: "late" }, false));
      await earlier;
    });

    expect(result.current.error).toBe("");
  });

  test("an answer drops a read still in flight", async () => {
    const reread = deferred();
    const answered = { ...WEEK, lifts: [{ key: "leg press", decision: "undo" }] };
    const apiFetch = vi
      .fn()
      .mockResolvedValueOnce(respond({ progression: WEEK }))
      .mockReturnValueOnce(reread.promise)
      .mockResolvedValueOnce(respond({ progression: answered }));
    const { result, rerender } = await loaded(apiFetch);
    rerender({ dashboard: dashboardOf(), notes: "sore knee", apiFetch });

    await act(async () => {
      await result.current.answer({ liftKey: "leg press", decision: "undo" });
    });
    await act(async () => {
      reread.resolve(respond({ progression: WEEK }));
    });

    expect(result.current.progression).toEqual(answered);
  });

  test("with no week read, an answer does nothing", async () => {
    const apiFetch = vi.fn(async () => respond({ progression: null }));
    const { result } = renderProgression({ dashboard: dashboardOf(), notes: "", apiFetch });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.answer({ liftKey: "leg press", decision: "undo" });
    });

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
