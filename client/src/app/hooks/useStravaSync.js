/**
 * The quiet Strava catch-up on entering the dashboard (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md, "The client"). Called once, by
 * App.
 */
import { useEffect, useRef } from "react";
import useConnection from "../../hooks/useConnection";
import { syncChangedWorkouts, syncStrava } from "../strava";

/**
 * Asks the server to catch up with Strava once each time a signed-in visitor
 * enters the dashboard routes, and calls `reloadDashboard` when the sync
 * imported, updated or removed a workout. `accountKey` is App's account-scoped
 * dashboard cache key, empty while signed out, so a profile save, which
 * replaces the user, does not sync again. Offline it waits for the connection.
 * A refused or failed sync is dropped without a word: without Strava on the
 * server it is expected, and the server records its own failures.
 */
export default function useStravaSync({ accountKey, isDashboardRoute, apiFetch, reloadDashboard }) {
  const offline = useConnection() === "offline";
  // The account this dashboard visit has synced for, or "" before it has.
  const syncedRef = useRef("");

  // Syncs on entering the dashboard, and re-arms on leaving it or signing out.
  useEffect(() => {
    if (!isDashboardRoute || !accountKey) {
      syncedRef.current = "";
      return;
    }
    if (offline || syncedRef.current === accountKey) return;
    syncedRef.current = accountKey;
    syncStrava(apiFetch, { manual: false }).then(
      (answer) => {
        if (syncChangedWorkouts(answer)) reloadDashboard();
      },
      () => {}
    );
  }, [accountKey, apiFetch, isDashboardRoute, offline, reloadDashboard]);
}
