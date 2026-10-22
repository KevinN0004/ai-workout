/**
 * The notice App shows over every page about the session, fixed at the foot of
 * the screen so it moves nothing on the page beneath it.
 */
import "../styles/notice.css";

/** One line of status text, read out by screen readers when it appears. */
export default function AppNotice({ message }) {
  return (
    <div className="app-notice" role="status">
      <p>{message}</p>
    </div>
  );
}
