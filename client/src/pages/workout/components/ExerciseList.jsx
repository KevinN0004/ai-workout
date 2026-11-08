/**
 * The session page's list of exercises: jump to one, skip or restore one, and
 * add one by name (roadmap B6). Folded away until opened, except while the
 * session has no exercises.
 */
import { useState } from "react";

/**
 * Lists `session`'s exercises, the current one marked. `onGoTo(index)` jumps
 * to one, `onSkip(index)` skips or restores one, and `onAdd({ name, kind })`
 * adds one.
 */
export default function ExerciseList({ session, onGoTo, onSkip, onAdd }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("reps");

  const add = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    onAdd({ name, kind });
    setName("");
    setKind("reps");
  };

  return (
    <details className="session-exercises" open={!session.exercises.length}>
      <summary>Exercises ({session.exercises.length})</summary>
      <ol className="session-exercise-list" aria-label="Exercises">
        {session.exercises.map((exercise, index) => {
          const planned = Math.max(exercise.plannedSets, exercise.sets.length);
          return (
            <li key={exercise.key} className={exercise.skipped ? "is-skipped" : undefined}>
              <button
                type="button"
                className="session-exercise-jump"
                aria-current={index === session.current ? "step" : undefined}
                onClick={() => onGoTo(index)}
              >
                {`${exercise.name}, ${exercise.sets.length} of ${planned} sets`}
              </button>
              <button
                type="button"
                className="ghost session-exercise-skip"
                aria-label={`${exercise.skipped ? "Restore" : "Skip"} ${exercise.name}`}
                onClick={() => onSkip(index)}
              >
                {exercise.skipped ? "Restore" : "Skip"}
              </button>
            </li>
          );
        })}
      </ol>

      <form className="session-add" onSubmit={add}>
        <label>
          Exercise name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={140} />
        </label>
        <div className="segmented" role="group" aria-label="Counted in">
          <button
            type="button"
            className={kind === "reps" ? "active" : undefined}
            aria-pressed={kind === "reps"}
            onClick={() => setKind("reps")}
          >
            Reps
          </button>
          <button
            type="button"
            className={kind === "seconds" ? "active" : undefined}
            aria-pressed={kind === "seconds"}
            onClick={() => setKind("seconds")}
          >
            Seconds
          </button>
        </div>
        <button type="submit" className="ghost">
          Add exercise
        </button>
      </form>
    </details>
  );
}
