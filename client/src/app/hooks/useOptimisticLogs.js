/**
 * Optimistic logging for the dashboard, and its toast: a workout, calorie or
 * meal entry shows at once, waits out an undo window, and only then is sent.
 * Called once, by App.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { OPTIMISTIC_UNDO_WINDOW_MS } from "../constants";

/**
 * Owns the pending log entries and the dashboard's toast. Returns the entries,
 * which App merges into the dashboard it renders; the toast with its show and
 * clear functions; `queueOptimisticLogCommit`, which the log handlers in
 * createAppEventHandlers call; and `clearOptimisticOperations`, which empties
 * the list and cancels every send not yet started. `setDashboard` and
 * `setDashError` are useDashboardData's: a send that succeeds replaces the
 * dashboard with the server's, and one that fails reports its error there.
 */
export default function useOptimisticLogs({ setDashboard, setDashError }) {
  // ---- State and refs -------------------------------------------------------
  const [optimisticLogEntries, setOptimisticLogEntries] = useState([]);
  const [dashboardToast, setDashboardToast] = useState(null);
  const dashboardToastTimeoutRef = useRef(null);
  const optimisticOpRef = useRef(new Map());

  // ---- Toast ----------------------------------------------------------------
  const clearDashboardToast = useCallback(() => {
    if (dashboardToastTimeoutRef.current) {
      clearTimeout(dashboardToastTimeoutRef.current);
      dashboardToastTimeoutRef.current = null;
    }
    setDashboardToast(null);
  }, []);

  const showDashboardToast = useCallback((message, tone = "success", options = {}) => {
    if (!message) return;
    if (dashboardToastTimeoutRef.current) {
      clearTimeout(dashboardToastTimeoutRef.current);
    }
    const nextToast = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      tone,
      message,
      actionLabel: options?.actionLabel || "",
      onAction: typeof options?.onAction === "function" ? options.onAction : null
    };
    // Milliseconds. A toast with an action stays longer, so there is time to
    // reach its button; a positive `durationMs` overrides both.
    const timeoutMs =
      Number(options?.durationMs) > 0
        ? Number(options.durationMs)
        : nextToast.onAction
          ? 5200
          : 3200;
    setDashboardToast(nextToast);
    dashboardToastTimeoutRef.current = setTimeout(() => {
      setDashboardToast((current) => (current?.id === nextToast.id ? null : current));
      dashboardToastTimeoutRef.current = null;
    }, timeoutMs);
  }, []);

  // On unmount only: a toast timer still pending is cleared, not left to fire.
  useEffect(() => {
    return () => {
      if (dashboardToastTimeoutRef.current) {
        clearTimeout(dashboardToastTimeoutRef.current);
      }
    };
  }, []);

  // ---- Optimistic log entries -----------------------------------------------
  const removeOptimisticEntry = useCallback((operationId) => {
    setOptimisticLogEntries((current) =>
      current.filter((entry) => entry.operationId !== operationId)
    );
  }, []);

  const clearOptimisticOperations = useCallback(() => {
    optimisticOpRef.current.forEach((operation) => {
      if (operation?.timerId) {
        clearTimeout(operation.timerId);
      }
    });
    optimisticOpRef.current.clear();
    setOptimisticLogEntries([]);
  }, []);

  const undoOptimisticOperation = useCallback(
    (operationId, { showToast = true } = {}) => {
      const operation = optimisticOpRef.current.get(operationId);
      if (!operation || operation.committing) return false;
      if (operation.timerId) {
        clearTimeout(operation.timerId);
      }
      optimisticOpRef.current.delete(operationId);
      removeOptimisticEntry(operationId);
      if (showToast) {
        showDashboardToast(operation.undoMessage || "Update undone.", "success");
      }
      return true;
    },
    [removeOptimisticEntry, showDashboardToast]
  );

  const queueOptimisticLogCommit = useCallback(
    ({ type, item, request, pendingMessage, successMessage, undoMessage }) => {
      const operationId = item.id;
      // Any earlier error clears, and the entry shows at once, ahead of any
      // already pending.
      setDashError("");
      setOptimisticLogEntries((current) => [
        {
          operationId,
          type,
          item: { ...item, isOptimistic: true },
          createdAt: Date.now()
        },
        ...current
      ]);

      // Sent when the window closes, after which the entry leaves the pending
      // list whatever the outcome: the server's dashboard replaces it on
      // success, and a failure is reported.
      const commit = async () => {
        const operation = optimisticOpRef.current.get(operationId);
        if (!operation) return;
        // From here undo is refused: the request is on its way.
        operation.committing = true;
        try {
          const data = await request();
          optimisticOpRef.current.delete(operationId);
          removeOptimisticEntry(operationId);
          setDashboard(data.dashboard);
          showDashboardToast(successMessage || "Saved.");
        } catch (err) {
          optimisticOpRef.current.delete(operationId);
          removeOptimisticEntry(operationId);
          const message = err?.message || `Unable to save ${type}.`;
          setDashError(message);
          showDashboardToast(message, "error");
        }
      };

      // Start the undo window, and offer Undo in a toast that outlasts it.
      const timerId = setTimeout(commit, OPTIMISTIC_UNDO_WINDOW_MS);
      optimisticOpRef.current.set(operationId, {
        type,
        timerId,
        committing: false,
        undoMessage
      });
      showDashboardToast(pendingMessage || "Saved locally.", "success", {
        actionLabel: "Undo",
        onAction: () => {
          undoOptimisticOperation(operationId, { showToast: true });
        },
        durationMs: OPTIMISTIC_UNDO_WINDOW_MS + 1000
      });
    },
    [removeOptimisticEntry, setDashError, setDashboard, showDashboardToast, undoOptimisticOperation]
  );

  // On unmount, every entry still inside its undo window is dropped, not sent.
  // clearOptimisticOperations is stable, so this runs only then.
  useEffect(() => {
    return () => {
      clearOptimisticOperations();
    };
  }, [clearOptimisticOperations]);

  return {
    optimisticLogEntries,
    dashboardToast,
    clearDashboardToast,
    showDashboardToast,
    queueOptimisticLogCommit,
    clearOptimisticOperations
  };
}
