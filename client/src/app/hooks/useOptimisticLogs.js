import { useCallback, useEffect, useRef, useState } from "react";
import { OPTIMISTIC_UNDO_WINDOW_MS } from "../constants";

export default function useOptimisticLogs({ setDashboard, setDashError }) {
  const [optimisticLogEntries, setOptimisticLogEntries] = useState([]);
  const [dashboardToast, setDashboardToast] = useState(null);
  const dashboardToastTimeoutRef = useRef(null);
  const optimisticOpRef = useRef(new Map());

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

  useEffect(() => {
    return () => {
      if (dashboardToastTimeoutRef.current) {
        clearTimeout(dashboardToastTimeoutRef.current);
      }
    };
  }, []);

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

      const commit = async () => {
        const operation = optimisticOpRef.current.get(operationId);
        if (!operation) return;
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
