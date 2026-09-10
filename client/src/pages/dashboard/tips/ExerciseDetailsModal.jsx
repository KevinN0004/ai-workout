import ModalPortal from "../../../components/ModalPortal";
import { getExerciseImage, resolveMediaUrl } from "./recommendationUtils";

export default function ExerciseDetailsModal({
  selectedExercise,
  onClose,
  onSave,
  isSaved,
  isSaving
}) {
  if (!selectedExercise) return null;

  return (
    <ModalPortal open={Boolean(selectedExercise)}>
      <div
        className="modal-backdrop dashboard-modal-backdrop"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="modal dashboard-modal exercise-modal"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-header">
            <h3>{selectedExercise.name}</h3>
            <button
              type="button"
              className="ghost icon-button"
              aria-label="Close"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <div className="exercise-modal-content">
            <img
              className="exercise-modal-image"
              src={getExerciseImage(selectedExercise)}
              alt={selectedExercise.name}
            />
            <div className="exercise-modal-body">
              <p className="exercise-target">
                <strong>Category:</strong> {selectedExercise.category?.name || "Unknown"}
              </p>
              <p className="exercise-focus">
                <strong>Primary muscles:</strong>{" "}
                {(selectedExercise.muscles || [])
                  .map((item) => item.name)
                  .filter(Boolean)
                  .slice(0, 4)
                  .join(", ") || "Not specified"}
              </p>
              <p className="exercise-focus">
                <strong>Equipment:</strong>{" "}
                {(selectedExercise.equipment || [])
                  .map((item) => item.name)
                  .filter(Boolean)
                  .join(", ") || "Not specified"}
              </p>
              <div className="tips-save-actions">
                <button
                  type="button"
                  className="cta save-modal-button"
                  disabled={isSaved || isSaving}
                  onClick={() => onSave(selectedExercise, selectedExercise?.recommendation)}
                >
                  {isSaved ? "Saved to plan" : isSaving ? "Saving..." : "Save to my plan"}
                </button>
              </div>
              {selectedExercise.description ? (
                <p className="exercise-what">{selectedExercise.description}</p>
              ) : (
                <p className="muted">No description provided for this exercise.</p>
              )}

              {selectedExercise?.recommendation?.reasons?.length ? (
                <section className="exercise-details-open">
                  <h4>Why this was recommended</h4>
                  <ul>
                    {selectedExercise.recommendation.reasons.map((reason) => (
                      <li key={`${selectedExercise.id}-${reason}`}>{reason}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(selectedExercise.videos || []).length ? (
                <div className="video-links">
                  {(selectedExercise.videos || []).slice(0, 2).map((item) => (
                    <a
                      key={`${selectedExercise.id}-video-${item.id || item.url}`}
                      href={resolveMediaUrl(item.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="video-link"
                    >
                      Watch reference video
                    </a>
                  ))}
                </div>
              ) : (
                <p className="muted">No video links available for this exercise.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
