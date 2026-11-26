/**
 * The notice App shows over every page about the session or a new version,
 * fixed at the foot of the screen so it moves nothing on the page beneath it.
 */
import "../styles/notice.css";

/**
 * @typedef {object} AppNoticeProps
 * @property {string} message
 * @property {string} [actionLabel]
 * @property {(() => void) | null} [onAction]
 * @property {(() => void) | null} [onDismiss]
 */

/**
 * One line of status text, read out by screen readers when it appears. It
 * offers an action named `actionLabel` when `onAction` comes with it, and a
 * Dismiss button when `onDismiss` is given, in that order.
 * @param {AppNoticeProps} props
 */
export default function AppNotice({
  message,
  actionLabel = "",
  onAction = null,
  onDismiss = null
}) {
  return (
    <div className="app-notice" role="status">
      <p>{message}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
