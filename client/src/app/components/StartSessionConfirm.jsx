/**
 * Asks what to do when a new in-gym session is started while one is open
 * (roadmap B6): resume the open one, or discard it and start the new one.
 * Rendered by App.
 */
// @ts-check
import ModalPortal from "../../components/ModalPortal";
import { loggedSetCount, startedAtText } from "../workoutSession";

/** @typedef {import("../workoutSession.js").WorkoutSession} WorkoutSession */

/**
 * @typedef {object} StartSessionConfirmProps
 * @property {WorkoutSession | null} openSession
 * @property {boolean} waiting
 * @property {() => void} onResume
 * @property {() => void} onReplace
 * @property {() => void} onCancel
 */

/**
 * Open while `waiting` (a new session waits). It names `openSession`'s start
 * and logged sets. Resume runs `onResume`, Discard and start `onReplace`, and
 * Escape and the backdrop `onCancel`, which keeps everything as it was.
 * @param {StartSessionConfirmProps} props
 */
export default function StartSessionConfirm({
  openSession,
  waiting,
  onResume,
  onReplace,
  onCancel
}) {
  const open = Boolean(waiting && openSession);
  // `open` holds only when there is an open session, which Boolean() does not
  // tell the checker, so the two reads below say so.
  const sets = open ? loggedSetCount(/** @type {WorkoutSession} */ (openSession)) : 0;
  const detail = open
    ? `Started ${startedAtText(/** @type {WorkoutSession} */ (openSession))}, with ${sets} ${sets === 1 ? "set" : "sets"} logged.`
    : "";

  return (
    <ModalPortal open={open} onClose={onCancel}>
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-session-title"
        aria-describedby="start-session-text"
        onClick={onCancel}
      >
        <div className="modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <h3 id="start-session-title">A workout is in progress</h3>
          </div>
          <p id="start-session-text">{detail}</p>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onReplace}>
              Discard and start
            </button>
            <button type="button" className="cta" onClick={onResume}>
              Resume
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
