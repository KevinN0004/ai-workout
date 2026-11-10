/**
 * The in-gym session screen at /workout (roadmap B6): one exercise at a time,
 * its next set logged with Done, a rest timer that buzzes and beeps, the sets
 * done with Undo, the exercise list, and Finish or Cancel. Kept on the device.
 */
import { useState } from "react";
import "./SessionPage.css";
import { readJsonCache, writeJsonCache } from "../../app/cache";
import { fromLoadKg } from "../../app/exerciseSets";
import {
  addExercise,
  adjustRest,
  endRest,
  goTo,
  loggedSetCount,
  logSet,
  replaceExercise,
  skipExercise,
  undoLastSet
} from "../../app/workoutSession";
import DiscardConfirm from "./components/DiscardConfirm";
import ElapsedTime from "./components/ElapsedTime";
import ExerciseList from "./components/ExerciseList";
import RestTimer from "./components/RestTimer";
import SwapStep from "../../components/SwapStep";
import SetPanel from "./components/SetPanel";
import useSessionState from "./hooks/useSessionState";
import useWakeLock from "./hooks/useWakeLock";
import { beep, buzz, unlockAudio } from "./restAlert";

const UNIT = { metric: "kg", imperial: "lb" };
// The Sound switch, kept for the device rather than the account, and on until
// turned off.
const SOUND_KEY = "ai-workout-session-sound-v1";

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
 * and Dashboard runs `onLeave`, which keeps the session for later. In a session
 * from a plan, an exercise can be swapped over `apiFetch` (roadmap C4): the plan
 * the server answers goes to `onPlanChanged`, and the session takes the new one.
 */
export default function SessionPage({
  user,
  initialSession,
  system,
  onFinish,
  onDiscard,
  onLeave,
  apiFetch,
  onPlanChanged
}) {
  const { session, update, kept } = useSessionState(user, initialSession);
  const [confirming, setConfirming] = useState(false);
  // The index of the exercise being swapped, or null.
  const [swapping, setSwapping] = useState(null);

  // The plan as swapped goes to the dashboard, and the session takes the new
  // exercise's prescription from the session's plan day. A plan that no longer
  // holds it there, as after a change on another device, leaves the session.
  const swapped = (plan, name) => {
    onPlanChanged(plan);
    const prescription = plan.payload.days
      .filter((day) => day.index === session.planDayIndex)
      .flatMap((day) => day.prescriptions ?? [])
      .find((entry) => entry.name === name);
    if (prescription) update(replaceExercise(session, swapping, prescription));
    setSwapping(null);
  };
  const [sound, setSound] = useState(() => readJsonCache(SOUND_KEY) !== false);
  // What the live region says: a rest starting, and a rest over.
  const [announcement, setAnnouncement] = useState("");
  useWakeLock();
  const exercise = session.exercises[session.current];
  const count = loggedSetCount(session);
  const last = session.current === session.exercises.length - 1;

  const cancel = () => {
    if (count) setConfirming(true);
    else onDiscard();
  };

  const toggleSound = () => {
    setSound(!sound);
    writeJsonCache(SOUND_KEY, !sound);
    unlockAudio();
  };

  // Done is a tap, so it also unlocks the audio the rest's end will beep with.
  const logDone = (set) => {
    unlockAudio();
    update(logSet(session, set, Date.now()));
    setAnnouncement(`Rest ${exercise.restSeconds} seconds`);
  };

  const restOver = () => {
    buzz();
    if (sound) beep();
    setAnnouncement("Rest over");
  };

  return (
    <main className="session-page">
      <header className="session-header">
        <button type="button" className="ghost" onClick={onLeave}>
          Dashboard
        </button>
        <div className="session-heading">
          <h1>{session.title}</h1>
          <ElapsedTime startedAt={session.startedAt} />
        </div>
        <button
          type="button"
          className="ghost session-sound"
          aria-pressed={sound}
          onClick={toggleSound}
        >
          Sound<span aria-hidden="true">{sound ? " on" : " off"}</span>
        </button>
      </header>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

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

          <SetPanel exercise={exercise} system={system} onDone={logDone} />

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

          {session.restEndsAt !== null ? (
            <RestTimer
              restEndsAt={session.restEndsAt}
              onAdjust={(seconds) => update(adjustRest(session, seconds, Date.now()))}
              onSkip={() => update(endRest(session))}
              onEnd={restOver}
            />
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

      {swapping === null ? (
        <ExerciseList
          session={session}
          onGoTo={(index) => update(goTo(session, index))}
          onSkip={(index) => update(skipExercise(session, index))}
          onAdd={(added) => update(addExercise(session, added))}
          onSwap={setSwapping}
        />
      ) : (
        <SwapStep
          apiFetch={apiFetch}
          planId={session.planId}
          exercise={session.exercises[swapping].name}
          onSwapped={swapped}
          onBack={() => setSwapping(null)}
        />
      )}

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
