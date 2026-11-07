/**
 * Optimistic logging for the dashboard, and its toast: a workout, calorie or
 * meal entry shows at once, waits out an undo window, and only then is sent.
 * Called once, by App.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { classifySendFailure } from "../classifySendFailure";
import { OPTIMISTIC_UNDO_WINDOW_MS } from "../constants";
import { addToOutbox, readOutbox } from "../outbox";
import { sendLog } from "../sendLog";

const KEPT_MESSAGE = "Saved on this device. It will be sent when you're back online.";

// An outbox entry as the dashboard shows it: pending, and marked not sent yet.
const toKeptEntry = ({ type, item, queuedAt }) => ({
  operationId: item.id,
  type,
  item: { ...item, isOptimistic: true, isQueued: true },
  createdAt: queuedAt
});

/**
 * Owns the pending log entries and the dashboard's toast. Returns the entries,
 * which App merges into the dashboard it renders; the toast with its show and
 * clear functions; `queueOptimisticLogCommit`, which the log handlers in
 * createAppEventHandlers call; `clearOptimisticOperations`, which empties the
 * list, cancels every send not yet started and disowns every send already out;
 * `flushOptimisticOperations`, which logout runs first: it sends every entry
 * still inside its undo window and resolves once every send has settled; and
 * `captureAccount`, which returns a check that stays true until the next
 * clear, for a request to read once its answer is in. A send's answer shows in
 * the toast unless the toast is offering a later entry's Undo, which stays. `setDashboard` and
 * `setDashError` are useDashboardData's: a send that succeeds replaces the
 * dashboard with the server's, and one that fails reports its error there.
 *
 * A log queued with an `outbox` ({ clientId, url, body }) is kept rather than
 * lost when its send fails in a way a later send can fix: it goes to `user`'s
 * outbox and stays on screen with `isQueued`, and a CSRF refusal is retried
 * once with a token from `ensureCsrfToken({ refresh: true })`
 * (docs/specs/2026-11-06-offline-ready-pwa-design.md). `user`'s kept entries
 * are on screen from the start, and `removeQueuedEntry` takes one off once
 * useOutboxReplay has sent it.
 */
export default function useOptimisticLogs({ setDashboard, setDashError, user, ensureCsrfToken }) {
  // ---- State and refs -------------------------------------------------------
  const [optimisticLogEntries, setOptimisticLogEntries] = useState([]);
  const [dashboardToast, setDashboardToast] = useState(null);
  const dashboardToastTimeoutRef = useRef(null);
  const optimisticOpRef = useRef(new Map());
  // Bumped by clearOptimisticOperations, which logout, account deletion and
  // unmount all run. A request sent before the bump answers for an account
  // that is no longer on screen.
  const generationRef = useRef(0);
  // The id of the toast on screen while it offers Undo, else null. A send's
  // answer does not replace that toast: it is the only way to call its entry
  // off, so it stays until that entry's own send starts.
  const undoToastIdRef = useRef(null);

  // ---- Toast ----------------------------------------------------------------
  const clearDashboardToast = useCallback(() => {
    if (dashboardToastTimeoutRef.current) {
      clearTimeout(dashboardToastTimeoutRef.current);
      dashboardToastTimeoutRef.current = null;
    }
    undoToastIdRef.current = null;
    setDashboardToast(null);
  }, []);

  // Returns the new toast's id, which a queued entry keeps so that its send
  // can tell whether the toast on screen is still its own.
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
    undoToastIdRef.current = nextToast.onAction ? nextToast.id : null;
    setDashboardToast(nextToast);
    dashboardToastTimeoutRef.current = setTimeout(() => {
      setDashboardToast((current) => (current?.id === nextToast.id ? null : current));
      dashboardToastTimeoutRef.current = null;
    }, timeoutMs);
    return nextToast.id;
  }, []);

  // On unmount only: a toast timer still pending is cleared, not left to fire.
  useEffect(() => {
    return () => {
      if (dashboardToastTimeoutRef.current) {
        clearTimeout(dashboardToastTimeoutRef.current);
      }
    };
  }, []);

  // ---- The account a request belongs to -------------------------------------
  const captureAccount = useCallback(() => {
    const generation = generationRef.current;
    return () => generationRef.current === generation;
  }, []);

  // ---- Optimistic log entries -----------------------------------------------
  const removeOptimisticEntry = useCallback((operationId) => {
    setOptimisticLogEntries((current) =>
      current.filter((entry) => entry.operationId !== operationId)
    );
  }, []);

  // Marks an entry not sent yet, once it is kept on the device.
  const markKept = useCallback((operationId) => {
    setOptimisticLogEntries((current) =>
      current.map((entry) =>
        entry.operationId === operationId
          ? { ...entry, item: { ...entry.item, isQueued: true } }
          : entry
      )
    );
  }, []);

  const clearOptimisticOperations = useCallback(() => {
    generationRef.current += 1;
    optimisticOpRef.current.forEach((operation) => {
      if (operation?.timerId) {
        clearTimeout(operation.timerId);
      }
    });
    optimisticOpRef.current.clear();
    setOptimisticLogEntries([]);
  }, []);

  // Never rejects: each send catches and reports its own failure.
  const flushOptimisticOperations = useCallback(async () => {
    const sends = [];
    optimisticOpRef.current.forEach((operation) => {
      if (!operation.committing) {
        clearTimeout(operation.timerId);
        operation.send();
      }
      sends.push(operation.sending);
    });
    await Promise.all(sends);
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
    ({ type, item, request, outbox, pendingMessage, successMessage, undoMessage }) => {
      const operationId = item.id;
      // The account the entry is kept for, if it has to be: the one signed in
      // when it was logged.
      const owner = user;
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
      // success, and a failure is reported. An answer that arrives after a
      // logout or a deletion touches nothing, since the list, the dashboard
      // and the toast are the next account's by then.
      const isSameAccount = captureAccount();
      const commit = async () => {
        const operation = optimisticOpRef.current.get(operationId);
        if (!operation) return;
        // From here undo is refused: the request is on its way. So the toast
        // stops offering it, if the toast is still this entry's: a newer
        // entry's Undo is left. Its id stays, so its own timer still clears it.
        operation.committing = true;
        if (undoToastIdRef.current === operation.undoToastId) undoToastIdRef.current = null;
        setDashboardToast((current) =>
          current?.id === operation.undoToastId
            ? { ...current, message: "Saving...", actionLabel: "", onAction: null }
            : current
        );
        const { data, error } = await sendLog(request, ensureCsrfToken);
        if (!isSameAccount()) return;
        optimisticOpRef.current.delete(operationId);
        if (!error) {
          removeOptimisticEntry(operationId);
          setDashboard(data.dashboard);
          // A later entry's Undo toast is left up (undoToastIdRef).
          if (!undoToastIdRef.current) showDashboardToast(successMessage || "Saved.");
          return;
        }
        // A failure a later send can fix keeps the entry on the device and on
        // screen, marked not sent yet, for useOutboxReplay to send. One the
        // device cannot store is reported like any other failure.
        const kept =
          outbox &&
          classifySendFailure(error) !== "drop" &&
          addToOutbox(owner, { ...outbox, type, item, queuedAt: Date.now() });
        if (kept) {
          markKept(operationId);
          if (!undoToastIdRef.current) showDashboardToast(KEPT_MESSAGE);
          return;
        }
        removeOptimisticEntry(operationId);
        const message = error.message || `Unable to save ${type}.`;
        // The page shows the error either way; the toast yields to a later
        // entry's Undo, as a success does.
        setDashError(message);
        if (!undoToastIdRef.current) showDashboardToast(message, "error");
      };

      // Start the undo window, and offer Undo in a toast that outlasts it. The
      // timer runs `send`, and flushOptimisticOperations can run it sooner;
      // `sending` keeps the started send for the flush to wait on.
      const queued = { type, timerId: null, committing: false, undoMessage, sending: null };
      queued.send = () => {
        queued.sending = commit();
        return queued.sending;
      };
      queued.timerId = setTimeout(queued.send, OPTIMISTIC_UNDO_WINDOW_MS);
      optimisticOpRef.current.set(operationId, queued);
      queued.undoToastId = showDashboardToast(pendingMessage || "Saved locally.", "success", {
        actionLabel: "Undo",
        onAction: () => {
          undoOptimisticOperation(operationId, { showToast: true });
        },
        durationMs: OPTIMISTIC_UNDO_WINDOW_MS + 1000
      });
    },
    [
      captureAccount,
      ensureCsrfToken,
      markKept,
      removeOptimisticEntry,
      setDashError,
      setDashboard,
      showDashboardToast,
      undoOptimisticOperation,
      user
    ]
  );

  // The entries kept for this account are on screen from the start, and again
  // whenever `user` is replaced, a profile save included, without doubling any.
  useEffect(() => {
    if (!user) return;
    const kept = readOutbox(user).map(toKeptEntry);
    if (!kept.length) return;
    const keptIds = new Set(kept.map((entry) => entry.operationId));
    setOptimisticLogEntries((current) => [
      ...current.filter((entry) => !keptIds.has(entry.operationId)),
      ...kept
    ]);
  }, [user]);

  // On unmount, every entry still inside its undo window is dropped, not sent.
  // clearOptimisticOperations is stable, so this runs only then.
  useEffect(() => {
    return () => {
      clearOptimisticOperations();
    };
  }, [clearOptimisticOperations]);

  return {
    optimisticLogEntries,
    removeQueuedEntry: removeOptimisticEntry,
    dashboardToast,
    clearDashboardToast,
    showDashboardToast,
    queueOptimisticLogCommit,
    clearOptimisticOperations,
    flushOptimisticOperations,
    captureAccount
  };
}
