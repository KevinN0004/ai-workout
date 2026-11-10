/**
 * The session page's list of exercises: jump to one, skip, restore or swap one,
 * and add one by name (roadmap B6, C4). Folded away until opened, except while
 * the session has no exercises.
 */
import { useState } from "react";
import OfflineHint from "../../../components/OfflineHint";
import useConnection from "../../../hooks/useConnection";

/**
 * Lists `session`'s exercises, the current one marked. `onGoTo(index)` jumps
 * to one, `onSkip(index)` skips or restores one, and `onAdd({ name, kind })`
 * adds one. `onSwap(index)` swaps an exercise from the plan with no sets logged
 * (roadmap C4); only a plan session has one, and it needs the server, so Swap is
 * disabled offline.
 */
export default function ExerciseList({ session, onGoTo, onSkip, onAdd, onSwap }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("reps");
  const offline = useConnection() === "offline";

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
              {exercise.plannedSets && !exercise.sets.length ? (
                <button
                  type="button"
                  className="ghost session-exercise-skip"
                  aria-label={`Swap ${exercise.name}`}
                  disabled={offline}
                  onClick={() => onSwap(index)}
                >
                  Swap
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {session.planId ? <OfflineHint /> : null}

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
