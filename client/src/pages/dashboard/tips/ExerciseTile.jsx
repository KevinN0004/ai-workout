/**
 * One exercise card in the Guides view's smart picks and exercise list: image,
 * category, name, equipment and the top reason, with a Save button. Rendered by
 * TipsView.
 */
import { getExerciseImage } from "./recommendationUtils";

/**
 * `recommendation` is the exercise's scoreExercise entry for a smart pick, and
 * absent in the exercise list. Opening the card hands `onOpen` the exercise
 * with that entry attached, so the details modal can list its reasons; `onSave`
 * receives the exercise and the entry.
 */
export default function ExerciseTile({
  exercise,
  recommendation,
  onOpen,
  onSave,
  saved,
  isSaving
}) {
  const imageUrl = getExerciseImage(exercise);
  const equipmentText = (exercise.equipment || [])
    .map((item) => item?.name)
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");

  return (
    <article className="exercise-tile">
      {/* ---- The card, which opens the details ---- */}
      <button
        type="button"
        className="exercise-tile-open"
        onClick={() => onOpen(recommendation ? { ...exercise, recommendation } : exercise)}
      >
        <img src={imageUrl} alt={exercise.name} loading="lazy" />
        <div className="exercise-tile-meta card-shell">
          <div className="card-section-head">
            <p className="exercise-group">{exercise.category?.name || "Exercise"}</p>
            <h3>{exercise.name}</h3>
          </div>
          <div className="card-section-body">
            <p className="muted">{equipmentText || "Equipment details unavailable"}</p>
            {recommendation?.reasons?.[0] ? (
              <p className="muted">{recommendation.reasons[0]}</p>
            ) : null}
          </div>
        </div>
      </button>
      {/* ---- Save ---- */}
      <div className="exercise-tile-actions">
        <button
          type="button"
          className="ghost save-chip"
          disabled={saved || isSaving}
          onClick={() => onSave(exercise, recommendation)}
        >
          {saved ? "Saved" : isSaving ? "Saving..." : "Save to plan"}
        </button>
      </div>
    </article>
  );
}
