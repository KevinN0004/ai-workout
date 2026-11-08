/**
 * Asks what to do when a new in-gym session is started while one is open
 * (roadmap B6): resume the open one, or discard it and start the new one.
 * Rendered by App.
 */
import ModalPortal from "../../components/ModalPortal";
import { loggedSetCount, startedAtText } from "../workoutSession";

/**
 * Open while `waiting` (a new session waits). It names `openSession`'s start
 * and logged sets. Resume runs `onResume`, Discard and start `onReplace`, and
 * Escape and the backdrop `onCancel`, which keeps everything as it was.
 */
export default function StartSessionConfirm({
  openSession,
  waiting,
  onResume,
  onReplace,
  onCancel
}) {
  const open = Boolean(waiting && openSession);
  const sets = open ? loggedSetCount(openSession) : 0;
  const detail = open
    ? `Started ${startedAtText(openSession)}, with ${sets} ${sets === 1 ? "set" : "sets"} logged.`
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
