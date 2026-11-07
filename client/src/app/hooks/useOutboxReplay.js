/**
 * Sends the outbox: the workout, meal and calorie entries kept on the device
 * because their first send failed. Called once, by App.
 */
import { useCallback, useEffect, useRef } from "react";
import useConnection from "../../hooks/useConnection";
import { classifySendFailure } from "../classifySendFailure";
import { readOutbox, removeFromOutbox } from "../outbox";
import { postLog, sendLog } from "../sendLog";

// How often to try again while an entry waits, in milliseconds.
const REPLAY_INTERVAL_MS = 30000;
// The Web Lock that keeps two tabs from sending the same outbox at once.
const OUTBOX_LOCK = "ai-workout-outbox";

/**
 * Sends `user`'s kept entries, oldest first and one at a time, when a user is
 * set, whenever the connection comes back, and every 30 seconds while online
 * (docs/specs/2026-11-06-offline-ready-pwa-design.md). A run stops at the
 * first entry that has to wait again; one the server refuses is dropped, with
 * its error through `setDashError`, and the run goes on. Each sent entry
 * leaves the outbox and the screen (`removeQueuedEntry`), its answer's
 * dashboard goes to `setDashboard`, and a run that saved any ends with one
 * toast. An answer that arrives after `captureAccount`'s account has gone
 * touches nothing.
 */
export default function useOutboxReplay({
  user,
  apiFetch,
  ensureCsrfToken,
  captureAccount,
  setDashboard,
  setDashError,
  showDashboardToast,
  removeQueuedEntry
}) {
  const offline = useConnection() === "offline";
  const runningRef = useRef(false);

  const run = useCallback(async () => {
    const isSameAccount = captureAccount();
    let saved = 0;
    for (const entry of readOutbox(user)) {
      const { data, error } = await sendLog(
        () => postLog(apiFetch, entry, `Unable to save ${entry.type}.`),
        ensureCsrfToken
      );
      if (!isSameAccount()) return;
      if (error && classifySendFailure(error) !== "drop") break;
      removeFromOutbox(user, entry.clientId);
      removeQueuedEntry(entry.item.id);
      if (error) {
        setDashError(error.message);
      } else {
        setDashboard(data.dashboard);
        saved += 1;
      }
    }
    if (saved) showDashboardToast(saved === 1 ? "1 entry saved." : `${saved} entries saved.`);
  }, [
    apiFetch,
    captureAccount,
    ensureCsrfToken,
    removeQueuedEntry,
    setDashError,
    setDashboard,
    showDashboardToast,
    user
  ]);

  // One run at a time in this tab, and, where the browser has Web Locks, in
  // every tab: a tab that cannot take the lock leaves the run to the one that
  // holds it.
  const replay = useCallback(async () => {
    if (runningRef.current || !readOutbox(user).length) return;
    runningRef.current = true;
    try {
      if (navigator.locks) {
        await navigator.locks.request(OUTBOX_LOCK, { ifAvailable: true }, (lock) => lock && run());
      } else {
        await run();
      }
    } finally {
      runningRef.current = false;
    }
  }, [run, user]);

  // Sends at once when there is a user and a connection, and every 30
  // seconds after, until either goes.
  useEffect(() => {
    if (!user || offline) return;
    replay();
    const timer = setInterval(replay, REPLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [offline, replay, user]);
}
