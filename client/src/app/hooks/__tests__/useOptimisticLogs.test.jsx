import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useOptimisticLogs from "../useOptimisticLogs";
import { OPTIMISTIC_UNDO_WINDOW_MS } from "../../constants";

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

// A request the test releases by hand, so a logout can be staged while it is
// still out.
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("captureAccount", () => {
  test("stays true until the operations are cleared", () => {
    const { result } = render();

    const isSameAccount = result.current.captureAccount();
    expect(isSameAccount()).toBe(true);

    act(() => result.current.clearOptimisticOperations());
    expect(isSameAccount()).toBe(false);
  });

  test("a check captured after the clear belongs to the new account", () => {
    const { result } = render();

    act(() => result.current.clearOptimisticOperations());

    expect(result.current.captureAccount()()).toBe(true);
  });
});

// Logout and account deletion clear the operations while a send may still be
// out. Its answer belongs to an account that is no longer on screen, and the
// dashboard it carries would otherwise be cached under the next account.
describe("a send still out when the account signs out", () => {
  test("a late success touches neither the dashboard nor the toast", async () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );
    await runUndoWindow();

    act(() => result.current.clearOptimisticOperations());
    await act(async () => {
      pending.resolve({ dashboard: { mealLogs: [{ id: "previous-account" }] } });
    });

    expect(setDashboard).not.toHaveBeenCalled();
    expect(result.current.dashboardToast?.message).not.toBe("Meal saved.");
  });

  test("a late failure reports nothing", async () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );
    await runUndoWindow();

    act(() => result.current.clearOptimisticOperations());
    await act(async () => {
      pending.reject(new Error("network down"));
    });

    expect(setDashError).not.toHaveBeenCalledWith("network down");
    expect(result.current.dashboardToast?.tone).not.toBe("error");
  });
});

// Logout's first step. An entry still inside its undo window has been told it
// is saved, so it is sent at once, on the account's own session, and logout
// waits for every send the account started before it ends that session.
describe("flushOptimisticOperations", () => {
  test("sends an entry still inside its undo window at once", async () => {
    const { result } = render();
    const options = queue({ dashboard: { mealLogs: [] } });
    act(() => result.current.queueOptimisticLogCommit(options));

    await act(async () => {
      await result.current.flushOptimisticOperations();
    });

    expect(options.request).toHaveBeenCalledTimes(1);
    expect(setDashboard).toHaveBeenCalledWith({ mealLogs: [] });
  });

  test("does not send it a second time when its window would have closed", async () => {
    const { result } = render();
    const options = queue({ dashboard: {} });
    act(() => result.current.queueOptimisticLogCommit(options));

    await act(async () => {
      await result.current.flushOptimisticOperations();
    });
    await runUndoWindow();

    expect(options.request).toHaveBeenCalledTimes(1);
  });

  test("waits for a send that was already out", async () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );
    await runUndoWindow();

    let settled = false;
    let flushing;
    act(() => {
      flushing = result.current.flushOptimisticOperations().then(() => {
        settled = true;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);

    await act(async () => {
      pending.resolve({ dashboard: {} });
      await flushing;
    });
    expect(settled).toBe(true);
  });

  test("settles at once with nothing queued", async () => {
    const { result } = render();

    await expect(result.current.flushOptimisticOperations()).resolves.toBeUndefined();
  });
});

// The request starts when the undo window closes, while the Undo toast lasts a
// second longer. Undo can no longer stop it, so the toast stops offering it,
// but only when it is still this entry's own toast.
describe("once the send has started", () => {
  test("the toast stops offering Undo", async () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );

    await runUndoWindow();

    expect(result.current.dashboardToast).toMatchObject({
      message: "Saving...",
      actionLabel: "",
      onAction: null
    });
  });

  // Logout sends the entry before its window closes, through the same send.
  test("the toast stops offering Undo when logout sends it early", () => {
    const { result } = render();
    const pending = deferred();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => pending.promise) })
      )
    );

    act(() => {
      result.current.flushOptimisticOperations();
    });

    expect(result.current.dashboardToast).toMatchObject({
      message: "Saving...",
      actionLabel: "",
      onAction: null
    });
  });

  test("a newer entry's Undo toast is left as it is", async () => {
    const { result } = render();
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(undefined, { request: vi.fn(() => new Promise(() => {})) })
      )
    );
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(
          { dashboard: {} },
          { item: { id: "op-2", title: "Eggs" }, pendingMessage: "Eggs added. Undo?" }
        )
      )
    );

    // The first entry's window closes and its send starts; the second's has
    // two seconds to go.
    await act(async () => {
      vi.advanceTimersByTime(OPTIMISTIC_UNDO_WINDOW_MS - 2000);
    });

    expect(result.current.dashboardToast).toMatchObject({
      message: "Eggs added. Undo?",
      actionLabel: "Undo"
    });
  });
});

// An earlier entry's send can answer while a later entry's Undo toast is up.
// The Undo is the only way to call that later entry off, so the answer does
// not replace it; a failure still reaches the page through setDashError.
describe("an answer that arrives while a later entry offers Undo", () => {
  // Entry one is sent at 4.5 s and answers when the test says; entry two is
  // queued at 2 s, so its Undo toast is up, and its window open, until 6.5 s.
  const stage = async (result, request) => {
    act(() => result.current.queueOptimisticLogCommit(queue(undefined, { request })));
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    act(() =>
      result.current.queueOptimisticLogCommit(
        queue(
          { dashboard: {} },
          { item: { id: "op-2", title: "Eggs" }, pendingMessage: "Eggs added. Undo?" }
        )
      )
    );
    await act(async () => {
      vi.advanceTimersByTime(OPTIMISTIC_UNDO_WINDOW_MS - 2000);
    });
  };

  test("a success leaves the later entry's Undo toast up", async () => {
    const { result } = render();
    const pending = deferred();
    await stage(
      result,
      vi.fn(() => pending.promise)
    );

    await act(async () => {
      pending.resolve({ dashboard: { mealLogs: [] } });
    });

    expect(setDashboard).toHaveBeenCalledWith({ mealLogs: [] });
    expect(result.current.dashboardToast).toMatchObject({
      message: "Eggs added. Undo?",
      actionLabel: "Undo"
    });
  });

  test("a failure leaves it up too, and still reports the error", async () => {
    const { result } = render();
    const pending = deferred();
    await stage(
      result,
      vi.fn(() => pending.promise)
    );

    await act(async () => {
      pending.reject(new Error("Server error."));
    });

    expect(setDashError).toHaveBeenLastCalledWith("Server error.");
    expect(result.current.dashboardToast).toMatchObject({
      message: "Eggs added. Undo?",
      actionLabel: "Undo"
    });
  });

  test("once the later entry is undone, the answer shows again", async () => {
    const { result } = render();
    const pending = deferred();
    await stage(
      result,
      vi.fn(() => pending.promise)
    );

    act(() => result.current.dashboardToast.onAction());
    await act(async () => {
      pending.resolve({ dashboard: {} });
    });

    expect(result.current.dashboardToast).toMatchObject({ message: "Meal saved." });
  });

  test("once the toast is dismissed by hand, the answer shows again", async () => {
    const { result } = render();
    const pending = deferred();
    await stage(
      result,
      vi.fn(() => pending.promise)
    );

    act(() => result.current.clearDashboardToast());
    await act(async () => {
      pending.resolve({ dashboard: {} });
    });

    expect(result.current.dashboardToast).toMatchObject({ message: "Meal saved." });
  });
});
