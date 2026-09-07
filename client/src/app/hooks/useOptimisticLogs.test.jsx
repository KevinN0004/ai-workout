import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useOptimisticLogs from "./useOptimisticLogs";
import { OPTIMISTIC_UNDO_WINDOW_MS } from "../constants";

// The optimistic log layer: an entry appears on the dashboard before anything
// is sent, and the request is held back for an undo window so the write can
// still be called off. Previously 27% covered.
//
// What makes it worth testing is that it decides what a user sees about data
// that is not saved yet -- and, when a save fails, whether the entry they typed
// quietly stays on screen looking saved.

let setDashboard;
let setDashError;

const render = () => {
  const hook = renderHook(() => useOptimisticLogs({ setDashboard, setDashError }));
  return hook;
};

const queue = (result, overrides = {}) => ({
  type: "meal log",
  item: { id: "op-1", title: "Porridge" },
  request: vi.fn(async () => result),
  pendingMessage: "Saved locally.",
  successMessage: "Meal saved.",
  undoMessage: "Meal discarded.",
  ...overrides
});

// The undo window has to elapse before anything is sent.
const runUndoWindow = async () => {
  await act(async () => {
    vi.advanceTimersByTime(OPTIMISTIC_UNDO_WINDOW_MS);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  setDashboard = vi.fn();
  setDashError = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("queueOptimisticLogCommit", () => {
  test("shows the entry immediately, before anything is sent", () => {
    const { result } = render();
    const options = queue({ dashboard: {} });

    act(() => result.current.queueOptimisticLogCommit(options));

    expect(result.current.optimisticLogEntries).toHaveLength(1);
    expect(options.request).not.toHaveBeenCalled();
  });

  test("marks the entry as optimistic so the view can style it", () => {
    const { result } = render();

    act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));

    expect(result.current.optimisticLogEntries[0].item).toMatchObject({
      title: "Porridge",
      isOptimistic: true
    });
  });

  test("puts the newest entry first", () => {
    const { result } = render();

    act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue({ dashboard: {} }, { item: { id: "op-2", title: "Eggs" } })
      )
    );

    expect(result.current.optimisticLogEntries.map((e) => e.operationId)).toEqual(["op-2", "op-1"]);
  });

  test("clears any standing dashboard error", () => {
    const { result } = render();

    act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));

    expect(setDashError).toHaveBeenCalledWith("");
  });

  // The whole point of the window: nothing is sent until it closes, so an undo
  // prevents the write rather than having to compensate for it.
  test("holds the request back for the whole undo window", async () => {
    const { result } = render();
    const options = queue({ dashboard: {} });

    act(() => result.current.queueOptimisticLogCommit(options));

    await act(async () => {
      vi.advanceTimersByTime(OPTIMISTIC_UNDO_WINDOW_MS - 1);
    });
    expect(options.request).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(options.request).toHaveBeenCalledTimes(1);
  });

  describe("when the save succeeds", () => {
    test("replaces the optimistic entry with the server's dashboard", async () => {
      const { result } = render();
      const dashboard = { workouts: [{ id: "w1" }] };

      act(() => result.current.queueOptimisticLogCommit(queue({ dashboard })));
      await runUndoWindow();

      expect(setDashboard).toHaveBeenCalledWith(dashboard);
      expect(result.current.optimisticLogEntries).toHaveLength(0);
    });

    test("reports success to the user", async () => {
      const { result } = render();

      act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));
      await runUndoWindow();

      expect(result.current.dashboardToast).toMatchObject({
        message: "Meal saved.",
        tone: "success"
      });
    });

    test("records no error", async () => {
      const { result } = render();

      act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));
      await runUndoWindow();

      expect(setDashError).toHaveBeenCalledTimes(1);
      expect(setDashError).toHaveBeenCalledWith("");
    });
  });

  describe("when the save fails", () => {
    const failing = (message = "network down") =>
      queue(undefined, {
        request: vi.fn(async () => {
          throw new Error(message);
        })
      });

    // The entry has to go. Leaving it on screen would show the user something
    // that looks saved and is not.
    test("takes the entry back off the dashboard", async () => {
      const { result } = render();

      act(() => result.current.queueOptimisticLogCommit(failing()));
      await runUndoWindow();

      expect(result.current.optimisticLogEntries).toHaveLength(0);
    });

    test("surfaces the failure as an error, not a success", async () => {
      const { result } = render();

      act(() => result.current.queueOptimisticLogCommit(failing()));
      await runUndoWindow();

      expect(setDashError).toHaveBeenLastCalledWith("network down");
      expect(result.current.dashboardToast).toMatchObject({
        message: "network down",
        tone: "error"
      });
    });

    test("names the operation when the error carries no message", async () => {
      const { result } = render();
      const options = queue(undefined, {
        request: vi.fn(async () => {
          throw new Error("");
        })
      });

      act(() => result.current.queueOptimisticLogCommit(options));
      await runUndoWindow();

      expect(setDashError).toHaveBeenLastCalledWith("Unable to save meal log.");
    });

    test("does not touch the dashboard", async () => {
      const { result } = render();

      act(() => result.current.queueOptimisticLogCommit(failing()));
      await runUndoWindow();

      expect(setDashboard).not.toHaveBeenCalled();
    });
  });
});

describe("undo", () => {
  // Undo is reachable only through the pending toast's action.
  const undoVia = (result) => {
    act(() => result.current.dashboardToast.onAction());
  };

  test("is offered on the pending toast", () => {
    const { result } = render();

    act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));

    expect(result.current.dashboardToast).toMatchObject({
      message: "Saved locally.",
      actionLabel: "Undo"
    });
    expect(typeof result.current.dashboardToast.onAction).toBe("function");
  });

  test("removes the entry", () => {
    const { result } = render();

    act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));
    undoVia(result);

    expect(result.current.optimisticLogEntries).toHaveLength(0);
  });

  // The request must never happen, not merely be reversed afterwards.
  test("stops the request from ever being sent", async () => {
    const { result } = render();
    const options = queue({ dashboard: {} });

    act(() => result.current.queueOptimisticLogCommit(options));
    undoVia(result);
    await runUndoWindow();
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    expect(options.request).not.toHaveBeenCalled();
    expect(setDashboard).not.toHaveBeenCalled();
  });

  test("confirms it to the user", () => {
    const { result } = render();

    act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));
    undoVia(result);

    expect(result.current.dashboardToast).toMatchObject({
      message: "Meal discarded.",
      tone: "success"
    });
  });

  test("falls back to a generic message when none was given", () => {
    const { result } = render();

    act(() =>
      result.current.queueOptimisticLogCommit(queue({ dashboard: {} }, { undoMessage: undefined }))
    );
    undoVia(result);

    expect(result.current.dashboardToast.message).toBe("Update undone.");
  });

  // Once the window has closed the request is in flight, and pretending it can
  // be called off would leave the dashboard disagreeing with the server.
  test("does nothing once the request has already gone", async () => {
    const { result } = render();
    const options = queue({ dashboard: { workouts: [] } });

    act(() => result.current.queueOptimisticLogCommit(options));
    const pendingToast = result.current.dashboardToast;
    await runUndoWindow();

    act(() => pendingToast.onAction());

    expect(options.request).toHaveBeenCalledTimes(1);
    expect(setDashboard).toHaveBeenCalled();
  });

  test("undoing twice is harmless", () => {
    const { result } = render();

    act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));
    const toast = result.current.dashboardToast;
    act(() => toast.onAction());
    act(() => toast.onAction());

    expect(result.current.optimisticLogEntries).toHaveLength(0);
  });

  test("undoes only the operation it belongs to", async () => {
    const { result } = render();
    const first = queue({ dashboard: {} });
    const second = queue({ dashboard: {} }, { item: { id: "op-2", title: "Eggs" } });

    act(() => result.current.queueOptimisticLogCommit(first));
    const firstToast = result.current.dashboardToast;
    act(() => result.current.queueOptimisticLogCommit(second));

    act(() => firstToast.onAction());

    expect(result.current.optimisticLogEntries.map((e) => e.operationId)).toEqual(["op-2"]);

    await runUndoWindow();
    expect(first.request).not.toHaveBeenCalled();
    expect(second.request).toHaveBeenCalledTimes(1);
  });
});

describe("toasts", () => {
  test("ignores an empty message", () => {
    const { result } = render();

    act(() => result.current.showDashboardToast(""));

    expect(result.current.dashboardToast).toBeNull();
  });

  test("dismisses itself after the default window", () => {
    const { result } = render();

    act(() => result.current.showDashboardToast("Saved."));
    expect(result.current.dashboardToast).not.toBeNull();

    act(() => vi.advanceTimersByTime(3200));
    expect(result.current.dashboardToast).toBeNull();
  });

  // A toast carrying an action needs longer, because it has to be clickable.
  test("stays longer when it offers an action", () => {
    const { result } = render();

    act(() =>
      result.current.showDashboardToast("Saved locally.", "success", {
        actionLabel: "Undo",
        onAction: () => {}
      })
    );

    act(() => vi.advanceTimersByTime(3200));
    expect(result.current.dashboardToast).not.toBeNull();

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.dashboardToast).toBeNull();
  });

  test("honours an explicit duration", () => {
    const { result } = render();

    act(() => result.current.showDashboardToast("Saved.", "success", { durationMs: 100 }));

    act(() => vi.advanceTimersByTime(99));
    expect(result.current.dashboardToast).not.toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.dashboardToast).toBeNull();
  });

  test.each([
    ["zero", 0],
    ["negative", -5],
    ["not a number", "soon"]
  ])("falls back to the default for a %s duration", (_label, durationMs) => {
    const { result } = render();

    act(() => result.current.showDashboardToast("Saved.", "success", { durationMs }));

    act(() => vi.advanceTimersByTime(3200));
    expect(result.current.dashboardToast).toBeNull();
  });

  test("ignores an action that is not callable", () => {
    const { result } = render();

    act(() =>
      result.current.showDashboardToast("Saved.", "success", {
        actionLabel: "Undo",
        onAction: "nope"
      })
    );

    expect(result.current.dashboardToast.onAction).toBeNull();
  });

  // A newer toast replaces an older one, and the older one's timer must not
  // then dismiss the newer.
  test("a later toast is not dismissed by an earlier one's timer", () => {
    const { result } = render();

    act(() => result.current.showDashboardToast("First.", "success", { durationMs: 1000 }));
    act(() => vi.advanceTimersByTime(900));
    act(() => result.current.showDashboardToast("Second.", "success", { durationMs: 1000 }));

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.dashboardToast?.message).toBe("Second.");

    act(() => vi.advanceTimersByTime(900));
    expect(result.current.dashboardToast).toBeNull();
  });

  test("can be dismissed by hand", () => {
    const { result } = render();

    act(() => result.current.showDashboardToast("Saved."));
    act(() => result.current.clearDashboardToast());

    expect(result.current.dashboardToast).toBeNull();
  });
});

describe("clearOptimisticOperations", () => {
  test("drops every pending entry", () => {
    const { result } = render();

    act(() => result.current.queueOptimisticLogCommit(queue({ dashboard: {} })));
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue({ dashboard: {} }, { item: { id: "op-2", title: "Eggs" } })
      )
    );
    act(() => result.current.clearOptimisticOperations());

    expect(result.current.optimisticLogEntries).toHaveLength(0);
  });

  // Used on sign-out. A queued write must not fire against the next account.
  test("cancels the pending requests as well as the entries", async () => {
    const { result } = render();
    const options = queue({ dashboard: {} });

    act(() => result.current.queueOptimisticLogCommit(options));
    act(() => result.current.clearOptimisticOperations());
    await runUndoWindow();

    expect(options.request).not.toHaveBeenCalled();
  });
});

describe("unmounting", () => {
  test("cancels a queued request rather than firing it into a dead view", async () => {
    const { result, unmount } = render();
    const options = queue({ dashboard: {} });

    act(() => result.current.queueOptimisticLogCommit(options));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(OPTIMISTIC_UNDO_WINDOW_MS + 1000);
    });

    expect(options.request).not.toHaveBeenCalled();
    expect(setDashboard).not.toHaveBeenCalled();
  });

  test("clears a standing toast timer", () => {
    const { result, unmount } = render();

    act(() => result.current.showDashboardToast("Saved."));

    expect(() => {
      unmount();
      vi.advanceTimersByTime(10000);
    }).not.toThrow();
  });
});
