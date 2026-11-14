/**
 * The Connected Apps tab's Strava panel (roadmap C2,
 * docs/specs/2026-11-12-strava-import-design.md): connect with Strava's own
 * button, the connection and its last sync, Sync now, and the disconnect.
 */
import { useEffect, useRef, useState } from "react";
import OfflineHint from "../../../components/OfflineHint";
import useConnection from "../../../hooks/useConnection";
import { describeAge } from "../../../app/describeAge";
import {
  disconnectStrava,
  fetchStravaState,
  readStravaResult,
  startStravaConnect,
  syncChangedWorkouts,
  syncStrava
} from "../../../app/strava";
import connectWithStrava from "./assets/btn_strava_connect_with_orange.svg";
import "./SettingsStravaPanel.css";

// One line per result the server's redirect from Strava can carry
// (registerStravaRoutes.js, the callback).
const RESULT_MESSAGES = {
  connected: "Strava is connected. New activities will arrive here.",
  cancelled: "Connecting Strava was cancelled.",
  "no-access": "Strava did not share your activities. Connect again, and allow access to them.",
  limit: "Strava isn't accepting more connections for this app yet.",
  taken: "That Strava account is already connected to another account here.",
  unavailable: "Strava could not be reached. Try again in a few minutes.",
  failed: "Connecting Strava did not finish. Try again."
};

const DISCONNECTED = "Strava is disconnected, and the workouts imported from it are removed.";

/** @param {string} result */
const resultMessage = (result) =>
  Object.hasOwn(RESULT_MESSAGES, result) ? RESULT_MESSAGES[result] : "";

// What a sync answered, in words: skipped inside the throttle, not finished,
// or the counts.
const syncMessage = (answer) => {
  if (answer.skipped) return "Synced a moment ago. Try again in a minute.";
  if (answer.error) return "The sync didn't finish. Try again later.";
  if (!syncChangedWorkouts(answer)) return "Sync finished. Nothing new.";
  const { imported, updated, removed } = answer;
  return `Sync finished: ${imported} new, ${updated} updated, ${removed} removed.`;
};

// A sync time later than this device's clock reads as just now: the server's
// clock can run ahead.
const lastSyncedText = (iso) =>
  iso ? `Last synced ${describeAge(Date.parse(iso), Date.now()) || "just now"}` : "Not synced yet";

/**
 * Reads the connection from the server on opening, and shows what it can do:
 * "Not available" without Strava on the server, Strava's Connect button, or the
 * connected account with Sync now and Disconnect, or Reconnect when Strava
 * refused the tokens. Connecting leaves for Strava's page; the server sends the
 * visitor back with a result, which shows once. A sync that changed workouts,
 * and a disconnect, call `onImportsChange` (App's reloadDashboard), since the
 * dashboard's copy is then stale. Offline, every action is disabled.
 */
export default function SettingsStravaPanel({ apiFetch, onImportsChange }) {
  const offline = useConnection() === "offline";
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  // The action running: "connect", "sync" or "disconnect", or "".
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(() =>
    resultMessage(readStravaResult(window.location.search))
  );
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef(null);
  const blocked = Boolean(busy) || offline;

  // Loads the connection on opening the tab.
  useEffect(() => {
    fetchStravaState(apiFetch).then(setState, (err) => setLoadError(err.message));
  }, [apiFetch]);

  // Takes Strava's result out of the address once it is read, so a reload or
  // a return to the tab does not show it again.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("strava")) return;
    url.searchParams.delete("strava");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`
    );
  }, []);

  // Revealing the confirm unmounts Disconnect, which had focus; Cancel takes
  // it, the choice that changes nothing (as SettingsAccountPanel does).
  useEffect(() => {
    if (confirming) cancelRef.current.focus();
  }, [confirming]);

  // After a sync or a disconnect, the state is read again for its new time,
  // error or connection. A failed read leaves the panel as it was.
  const reload = () => fetchStravaState(apiFetch).then(setState, () => {});

  const connect = async () => {
    setBusy("connect");
    setError("");
    try {
      window.location.assign(await startStravaConnect(apiFetch));
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  };

  const sync = async () => {
    setBusy("sync");
    setError("");
    setNotice("");
    try {
      const answer = await syncStrava(apiFetch, { manual: true });
      setNotice(syncMessage(answer));
      if (syncChangedWorkouts(answer)) onImportsChange();
      await reload();
    } catch (err) {
      setError(err.message);
    }
    setBusy("");
  };

  const disconnect = async () => {
    setBusy("disconnect");
    setError("");
    setNotice("");
    try {
      await disconnectStrava(apiFetch);
      setConfirming(false);
      setNotice(DISCONNECTED);
      onImportsChange();
      await reload();
    } catch (err) {
      setError(err.message);
    }
    setBusy("");
  };

  const renderConnected = () => (
    <>
      <p>{state.athleteName ? `Connected as ${state.athleteName}` : "Connected to Strava"}</p>
      <p className="muted">{lastSyncedText(state.lastSyncedAt)}</p>
      {state.needsReconnect ? (
        <p>Strava needs you to connect again before it can sync.</p>
      ) : (
        state.lastSyncError && (
          <p className="muted">The last sync didn&apos;t finish. It will try again.</p>
        )
      )}
      {confirming ? (
        <div className="settings-strava-confirm">
          <p>Your workouts imported from Strava will be removed.</p>
          <div className="settings-strava-actions">
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy === "disconnect"}
            >
              Cancel
            </button>
            <button type="button" onClick={disconnect} disabled={blocked}>
              {busy === "disconnect" ? "Disconnecting..." : "Confirm disconnect"}
            </button>
            <OfflineHint />
          </div>
        </div>
      ) : (
        <div className="settings-strava-actions">
          {state.needsReconnect ? (
            <button type="button" onClick={connect} disabled={blocked}>
              Reconnect Strava
            </button>
          ) : (
            <button type="button" onClick={sync} disabled={blocked}>
              {busy === "sync" ? "Syncing..." : "Sync now"}
            </button>
          )}
          <button type="button" onClick={() => setConfirming(true)} disabled={blocked}>
            Disconnect
          </button>
          <OfflineHint />
        </div>
      )}
    </>
  );

  const renderBody = () => {
    if (loadError) {
      return (
        <p className="error" role="alert">
          {loadError}
        </p>
      );
    }
    if (!state) return <p className="muted">Checking your Strava connection...</p>;
    if (!state.available) return <p className="muted">Not available</p>;
    if (state.connected) return renderConnected();
    return (
      <>
        <p className="muted">Import the activities you record on Strava as workouts here.</p>
        <div className="settings-strava-actions">
          <button
            type="button"
            className="settings-strava-connect"
            onClick={connect}
            disabled={blocked}
          >
            <img src={connectWithStrava} alt="Connect with Strava" width="237" height="48" />
          </button>
          <OfflineHint />
        </div>
      </>
    );
  };

  return (
    <div className="settings-strava">
      <h4>Strava</h4>
      {notice && <p role="status">{notice}</p>}
      {renderBody()}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
