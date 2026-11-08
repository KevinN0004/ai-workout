/**
 * Asks before Cancel workout discards logged sets (roadmap B6). Rendered by the
 * session page.
 */
import ModalPortal from "../../../components/ModalPortal";

/**
 * Open while `count`, the sets logged, is above 0. Discard runs `onDiscard`;
 * Keep training, Escape and the backdrop run `onKeep`.
 */
export default function DiscardConfirm({ count, onDiscard, onKeep }) {
  return (
    <ModalPortal open={count > 0} onClose={onKeep}>
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-session-title"
        aria-describedby="discard-session-text"
        onClick={onKeep}
      >
        <div className="modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <h3 id="discard-session-title">Discard this workout?</h3>
          </div>
          <p id="discard-session-text">
            {count === 1 ? "1 set will be lost." : `${count} sets will be lost.`}
          </p>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onDiscard}>
              Discard
            </button>
            <button type="button" className="cta" onClick={onKeep}>
              Keep training
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
