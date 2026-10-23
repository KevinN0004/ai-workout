/**
 * The notice App shows over every page about the session, fixed at the foot of
 * the screen so it moves nothing on the page beneath it.
 */
import "../styles/notice.css";

/**
 * One line of status text, read out by screen readers when it appears, with a
 * Dismiss button when `onDismiss` is given.
 */
export default function AppNotice({ message, onDismiss = null }) {
  return (
    <div className="app-notice" role="status">
      <p>{message}</p>
      {onDismiss ? (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
