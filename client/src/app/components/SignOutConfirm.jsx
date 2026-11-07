/**
 * Asks before a sign-out that would lose entries kept on the device and not
 * yet sent (docs/specs/2026-11-06-offline-ready-pwa-design.md). Rendered by App.
 */
import ModalPortal from "../../components/ModalPortal";

/**
 * Open while `count`, the entries still unsent, is above 0. Sign out anyway
 * runs `onConfirm`; Cancel, Escape and the backdrop run `onCancel`.
 */
export default function SignOutConfirm({ count, onCancel, onConfirm }) {
  const lost =
    count === 1
      ? "1 entry hasn't reached the server and will be lost."
      : `${count} entries haven't reached the server and will be lost.`;

  return (
    <ModalPortal open={count > 0} onClose={onCancel}>
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-out-confirm-title"
        aria-describedby="sign-out-confirm-text"
        onClick={onCancel}
      >
        <div className="modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <h3 id="sign-out-confirm-title">Sign out?</h3>
          </div>
          <p id="sign-out-confirm-text">{lost}</p>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="cta" onClick={onConfirm}>
              Sign out anyway
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
