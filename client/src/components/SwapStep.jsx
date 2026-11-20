/**
 * The step that swaps one exercise in a saved plan (roadmap C4): its
 * alternatives under the plan's rules, an area that bothers to narrow them, and
 * the swap. Shared: the plan hub's day details and the in-gym screen show it.
 */
// @ts-check
import { useEffect, useState } from "react";
import "./SwapStep.css";
import { fetchSwapOptions, swapExercise } from "../app/planSwaps";

/** @typedef {import("../app/network.js").Wire<import("../../../server/src/routes/dashboard/registerPlanSwapRoutes.js").PlanSwapOptionsResponse>} SwapOptions */
/** @typedef {import("../app/network.js").Wire<import("../../../server/src/routes/dashboard/registerPlanSwapRoutes.js").PlanSwappedResponse>["plan"]} SwappedPlan */

/** @param {string} text */
const capitalised = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
/** @param {string[]} needs */
const needsText = (needs) => (needs.length ? `Needs ${needs.join(", ")}` : "No equipment");

/**
 * The plan `onSwapped` receives is the server's answer, the plan as swapped.
 * @typedef {object} SwapStepProps
 * @property {import("../app/network.js").ApiFetch} apiFetch
 * @property {string} planId
 * @property {string} exercise
 * @property {(plan: SwappedPlan, name: string) => void} onSwapped
 * @property {() => void} onBack
 */

/**
 * Swaps `exercise` in the plan `planId` over `apiFetch`. It lists the
 * alternatives, asking again when an area is chosen or cleared, and a choice
 * swaps it and hands `onSwapped` the plan the server answers and the name of
 * the exercise swapped in. Back calls `onBack`. Each failure is said in an alert.
 * @param {SwapStepProps} props
 */
export default function SwapStep({ apiFetch, planId, exercise, onSwapped, onBack }) {
  const [area, setArea] = useState(/** @type {string | null} */ (null));
  // What the server answered for the area asked about, null while it is asked.
  const [answer, setAnswer] = useState(/** @type {SwapOptions | null} */ (null));
  // The areas a swap can name, kept once known, so the buttons stay put (and
  // keep focus) while the alternatives for a new area are asked for.
  const [areas, setAreas] = useState(/** @type {string[]} */ ([]));
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // Asks for the alternatives whenever the exercise or the area changes, and
  // drops an answer for an area that has changed since.
  useEffect(() => {
    let current = true;
    setAnswer(null);
    setError("");
    fetchSwapOptions(apiFetch, planId, exercise, area).then(
      (data) => {
        if (!current) return;
        setAnswer(data);
        setAreas(data.areas);
      },
      (err) => {
        if (current) setError(err.message);
      }
    );
    return () => {
      current = false;
    };
  }, [apiFetch, planId, exercise, area]);

  /** @param {{ name: string }} option */
  const choose = async (option) => {
    setSending(true);
    setError("");
    try {
      const plan = await swapExercise(apiFetch, planId, { from: exercise, to: option.name, area });
      onSwapped(plan, option.name);
    } catch (err) {
      // Everything swapExercise throws is an Error: its own with the server's
      // message, or fetch's DOMException or TypeError.
      setError(/** @type {Error} */ (err).message);
      setSending(false);
    }
  };

  // An alternative carries a cue only with the area it answers (candidatesFor in
  // the server's generatePlan.js), so each cue shown below has its area.
  const alternatives = answer?.alternatives ?? [];
  return (
    <section className="swap-step" aria-labelledby="swap-step-title">
      <h3 id="swap-step-title">Swap {exercise}</h3>
      {areas.length ? (
        <div className="swap-areas" role="group" aria-labelledby="swap-areas-label">
          <p id="swap-areas-label" className="muted">
            It bothers my…
          </p>
          {areas.map((name) => (
            <button
              key={name}
              type="button"
              className="ghost"
              aria-pressed={area === name}
              onClick={() => setArea(area === name ? null : name)}
            >
              {capitalised(name)}
            </button>
          ))}
        </div>
      ) : null}
      {answer || error ? null : <p className="muted">Finding alternatives…</p>}
      {error ? (
        <p className="swap-error" role="alert">
          {error}
        </p>
      ) : null}
      {answer && !alternatives.length ? (
        <p className="muted">Nothing else in the library fits this plan.</p>
      ) : null}
      {alternatives.length ? (
        <ul className="swap-options" aria-label="Alternatives">
          {alternatives.map((option) => (
            <li key={option.name}>
              <button type="button" disabled={sending} onClick={() => choose(option)}>
                <strong>{option.name}</strong>
                <span className="muted">{needsText(option.needs)}</span>
                {option.cue ? (
                  <span className="muted">
                    {capitalised(/** @type {string} */ (option.area))}: {option.cue}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="ghost" onClick={onBack}>
        Back
      </button>
    </section>
  );
}
