/**
 * The step that swaps one exercise in a saved plan (roadmap C4): its
 * alternatives under the plan's rules, an area that bothers to narrow them, and
 * the swap. Shared: the plan hub's day details and the in-gym screen show it.
 */
import { useEffect, useState } from "react";
import "./SwapStep.css";
import { fetchSwapOptions, swapExercise } from "../app/planSwaps";

const capitalised = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const needsText = (needs) => (needs.length ? `Needs ${needs.join(", ")}` : "No equipment");

/**
 * Swaps `exercise` in the plan `planId` over `apiFetch`. It lists the
 * alternatives, asking again when an area is chosen or cleared, and a choice
 * swaps it and hands `onSwapped` the plan the server answers and the name of
 * the exercise swapped in. Back calls `onBack`. Each failure is said in an alert.
 */
export default function SwapStep({ apiFetch, planId, exercise, onSwapped, onBack }) {
  const [area, setArea] = useState(null);
  // What the server answered for the area asked about, null while it is asked.
  const [answer, setAnswer] = useState(null);
  // The areas a swap can name, kept once known, so the buttons stay put (and
  // keep focus) while the alternatives for a new area are asked for.
  const [areas, setAreas] = useState([]);
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

  const choose = async (option) => {
    setSending(true);
    setError("");
    try {
      const plan = await swapExercise(apiFetch, planId, { from: exercise, to: option.name, area });
      onSwapped(plan, option.name);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

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
                    {capitalised(option.area)}: {option.cue}
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
