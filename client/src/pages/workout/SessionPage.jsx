/**
 * The in-gym session screen at /workout (roadmap B6): one exercise at a time,
 * its next set pre-filled to step and log with Done, the sets done with Undo,
 * the exercise list, and Finish or Cancel. Kept on the device as it changes.
 */
import { useState } from "react";
import "./SessionPage.css";
import { fromLoadKg } from "../../app/exerciseSets";
import {
  addExercise,
  goTo,
  loggedSetCount,
  logSet,
  skipExercise,
  undoLastSet
} from "../../app/workoutSession";
import DiscardConfirm from "./components/DiscardConfirm";
import ExerciseList from "./components/ExerciseList";
import SetPanel from "./components/SetPanel";
import useSessionState from "./hooks/useSessionState";

const UNIT = { metric: "kg", imperial: "lb" };

/** A load in kg as the region shows it, with its unit, or null for none. */
const loadText = (loadKg, system) => {
  const shown = fromLoadKg(loadKg, system);
  return shown ? `${shown} ${UNIT[system]}` : null;
};

/** One logged set as the Sets done list reads it. */
const setText = (exercise, set, index, system) => {
  const amount = exercise.kind === "seconds" ? `${set.amount} seconds` : `${set.amount} reps`;
  const parts = [amount, loadText(set.loadKg, system) ?? "bodyweight"];
  if (set.rpe !== null) parts.push(`RPE ${set.rpe}`);
  return `Set ${index + 1}: ${parts.join(", ")}`;
};

/**
 * The session for `user`, from `initialSession`, with loads in `system`'s unit.
 * Finish hands the session to `onFinish`, a confirmed Cancel runs `onDiscard`,
 * and Dashboard runs `onLeave`, which keeps the session for later.
 */
export default function SessionPage({
  user,
  initialSession,
  system,
  onFinish,
  onDiscard,
  onLeave
}) {
  const { session, update, kept } = useSessionState(user, initialSession);
  const [confirming, setConfirming] = useState(false);
  const exercise = session.exercises[session.current];
  const count = loggedSetCount(session);
  const last = session.current === session.exercises.length - 1;

  const cancel = () => {
    if (count) setConfirming(true);
    else onDiscard();
  };

  return (
    <main className="session-page">
      <header className="session-header">
        <button type="button" className="ghost" onClick={onLeave}>
          Dashboard
        </button>
        <h1>{session.title}</h1>
      </header>

      {!kept ? (
        <p className="session-warning" role="alert">
          This device isn&apos;t keeping this workout. Finish it before you close the app.
        </p>
      ) : null}

      {exercise ? (
        <section className="session-exercise" aria-labelledby="session-exercise-name">
          <p className="session-position">
            {`Exercise ${session.current + 1} of ${session.exercises.length} · ${
              exercise.plannedSets > exercise.sets.length
                ? `Set ${exercise.sets.length + 1} of ${exercise.plannedSets}`
                : `Set ${exercise.sets.length + 1}`
            }`}
          </p>
          <h2 id="session-exercise-name">{exercise.name}</h2>
          {exercise.targetText ? (
            <p className="session-target">
              {[exercise.targetText, loadText(exercise.targetLoadKg, system)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}

          <SetPanel
            exercise={exercise}
            system={system}
            onDone={(set) => update(logSet(session, set, Date.now()))}
          />

          {exercise.sets.length ? (
            <ol className="session-sets" aria-label="Sets done">
              {exercise.sets.map((set, index) => (
                <li key={index}>
                  <span>{setText(exercise, set, index, system)}</span>
                  {index === exercise.sets.length - 1 ? (
                    <button
                      type="button"
                      className="ghost session-undo"
                      aria-label={`Undo set ${index + 1}`}
                      onClick={() => update(undoLastSet(session))}
                    >
                      Undo
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}

          <div className="session-move">
            <button
              type="button"
              className="ghost"
              disabled={session.current === 0}
              onClick={() => update(goTo(session, session.current - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={
                exercise.plannedSets && exercise.sets.length >= exercise.plannedSets
                  ? "cta"
                  : "ghost"
              }
              disabled={last}
              onClick={() => update(goTo(session, session.current + 1))}
            >
              Next exercise
            </button>
          </div>
        </section>
      ) : (
        <p className="session-empty">Add your first exercise below.</p>
      )}

      <ExerciseList
        session={session}
        onGoTo={(index) => update(goTo(session, index))}
        onSkip={(index) => update(skipExercise(session, index))}
        onAdd={(added) => update(addExercise(session, added))}
      />

      <footer className="session-footer">
        <button type="button" className="ghost" onClick={cancel}>
          Cancel workout
        </button>
        <button type="button" className="cta" disabled={!count} onClick={() => onFinish(session)}>
          Finish
        </button>
      </footer>

      <DiscardConfirm
        count={confirming ? count : 0}
        onDiscard={onDiscard}
        onKeep={() => setConfirming(false)}
      />
    </main>
  );
}
