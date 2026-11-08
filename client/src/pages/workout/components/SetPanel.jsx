/**
 * The set being logged on the session page: steppers for the reps (or seconds)
 * and the load, the optional RPE, and Done (roadmap B6).
 */
import { useState } from "react";
import { fromLoadKg } from "../../../app/exerciseSets";
import { draftFor, stepAmount, stepLoad } from "../../../app/workoutSession";

const RPE_CHOICES = [5, 6, 7, 8, 9, 10];
const UNIT = { metric: "kg", imperial: "lb" };
const LOAD_STEP_TEXT = { metric: "2.5 kg", imperial: "5 lb" };

/**
 * Opens with `exercise`'s next set (draftFor) and calls `onDone(set)` with the
 * set as shown. Another exercise, or a set logged or undone, starts it from the
 * new draft. Loads show in `system`'s unit and stay in kg.
 */
export default function SetPanel({ exercise, system, onDone }) {
  const [set, setSet] = useState(() => draftFor(exercise));
  // The draft is reset during render rather than by remounting, so the Done
  // button stays the same element and keeps keyboard focus after a set.
  const draftKey = `${exercise.key}:${exercise.sets.length}`;
  const [shownFor, setShownFor] = useState(draftKey);
  if (shownFor !== draftKey) {
    setShownFor(draftKey);
    setSet(draftFor(exercise));
  }
  const seconds = exercise.kind === "seconds";
  const loadText =
    set.loadKg === null ? "Bodyweight" : `${fromLoadKg(set.loadKg, system)} ${UNIT[system]}`;

  const stepAmountBy = (direction) =>
    setSet((current) => ({
      ...current,
      amount: stepAmount(current.amount, direction, exercise.kind)
    }));
  const stepLoadBy = (direction) =>
    setSet((current) => ({ ...current, loadKg: stepLoad(current.loadKg, direction, system) }));
  // A second tap on the chosen RPE clears it: an RPE is never assumed.
  const chooseRpe = (rpe) =>
    setSet((current) => ({ ...current, rpe: current.rpe === rpe ? null : rpe }));

  return (
    <div className="set-panel">
      <div className="stepper">
        <button
          type="button"
          className="stepper-button"
          aria-label={seconds ? "5 seconds less" : "One rep fewer"}
          onClick={() => stepAmountBy(-1)}
        >
          −
        </button>
        <p className="stepper-value">
          <output id="set-amount" aria-label={seconds ? "Seconds" : "Reps"}>
            {set.amount}
          </output>
          <span className="stepper-unit" aria-hidden="true">
            {seconds ? "seconds" : "reps"}
            {exercise.perSide ? " a side" : ""}
          </span>
        </p>
        <button
          type="button"
          className="stepper-button"
          aria-label={seconds ? "5 seconds more" : "One rep more"}
          onClick={() => stepAmountBy(1)}
        >
          +
        </button>
      </div>

      <div className="stepper">
        <button
          type="button"
          className="stepper-button"
          aria-label={`${LOAD_STEP_TEXT[system]} lighter`}
          onClick={() => stepLoadBy(-1)}
        >
          −
        </button>
        <p className="stepper-value stepper-value-load">
          <output id="set-load" aria-label="Load">
            {loadText}
          </output>
        </p>
        <button
          type="button"
          className="stepper-button"
          aria-label={`${LOAD_STEP_TEXT[system]} heavier`}
          onClick={() => stepLoadBy(1)}
        >
          +
        </button>
      </div>

      <div className="rpe-group" role="group" aria-label="RPE, optional">
        {RPE_CHOICES.map((rpe) => (
          <button
            key={rpe}
            type="button"
            aria-label={`RPE ${rpe}`}
            aria-pressed={set.rpe === rpe}
            onClick={() => chooseRpe(rpe)}
          >
            {rpe}
          </button>
        ))}
      </div>

      <button type="button" className="cta session-done" onClick={() => onDone(set)}>
        Done
      </button>
    </div>
  );
}
