/**
 * A plan day's exercises for swapping (roadmap C4), in the day's details: Swap
 * on each, and on a swapped one what it replaced and why, with an Undo. Both
 * need the server, so both are disabled offline.
 */
import { useState } from "react";
import { undoExerciseSwap } from "../../../app/planSwaps";
import OfflineHint from "../../../components/OfflineHint";
import useConnection from "../../../hooks/useConnection";

/**
 * The day's `prescriptions` of the plan `planId`. Swap hands the exercise's
 * name to `onSwap`; Undo takes the swap back over `apiFetch` and hands the plan
 * the server answers to `onPlanChanged`, and says why in an alert when it fails.
 */
export default function PlanDaySwaps({ apiFetch, planId, prescriptions, onSwap, onPlanChanged }) {
  const offline = useConnection() === "offline";
  const [error, setError] = useState("");

  const undo = async (name) => {
    setError("");
    try {
      onPlanChanged(await undoExerciseSwap(apiFetch, planId, name));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="plan-day-swaps" aria-labelledby="plan-day-swaps-title">
      <h4 id="plan-day-swaps-title">Swap an exercise</h4>
      <ul className="plan-day-swap-list">
        {prescriptions.map(({ name, swappedFrom, swapReason }) => (
          <li key={name}>
            <span className="plan-day-swap-name">{name}</span>
            {swappedFrom ? (
              <span className="muted">
                {`Swapped from ${swappedFrom.prescription.name}${swapReason ? ` (${swapReason})` : ""}`}
              </span>
            ) : null}
            <span className="plan-day-swap-actions">
              {swappedFrom ? (
                <button
                  type="button"
                  className="ghost"
                  aria-label={`Undo the swap of ${name}`}
                  disabled={offline}
                  onClick={() => undo(name)}
                >
                  Undo
                </button>
              ) : null}
              <button
                type="button"
                className="ghost"
                aria-label={`Swap ${name}`}
                disabled={offline}
                onClick={() => onSwap(name)}
              >
                Swap
              </button>
            </span>
          </li>
        ))}
      </ul>
      <OfflineHint />
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
