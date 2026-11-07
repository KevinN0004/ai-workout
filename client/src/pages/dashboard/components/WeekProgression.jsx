/**
 * The week's loads for one plan day (roadmap B4): under the day's details, each
 * lift's load in the region's unit, its change and why, with Undo, or Go up and
 * Keep, and the deload week's banner with Train normally.
 */
import OfflineHint from "../../../components/OfflineHint";
import useConnection from "../../../hooks/useConnection";
import { liftKeyOf } from "../planUtils";

// What each change reads as, from the load in the unit shown.
const CHANGE_TEXT = {
  up: ({ from, target }, unit) => `Up to ${target} ${unit}, from ${from}`,
  ask: ({ from, target }, unit) => `Up to ${target} ${unit}? Now ${from}`,
  deload: ({ from, target }, unit) => `Lighter: ${target} ${unit}, from ${from}`,
  hold: ({ from }, unit) => `Hold at ${from} ${unit}`
};

// The answers each change offers before it is answered: the visible label, the
// rest of the button's name, and the decision it sends.
const CHANGE_ANSWERS = {
  up: [{ label: "Undo", rest: "the step up for", decision: "undo" }],
  deload: [{ label: "Undo", rest: "the lighter load for", decision: "undo" }],
  ask: [
    { label: "Go up", rest: "on", decision: "accept" },
    { label: "Keep", rest: "the load on", decision: "decline" }
  ]
};

// A button whose visible label is short and whose full name, read by assistive
// technology, says what it acts on. The space is its own text node: one at the
// start of the hidden span is trimmed from the name.
const AnswerButton = ({ label, rest, onClick, disabled }) => (
  <button type="button" className="ghost week-lift-answer" onClick={onClick} disabled={disabled}>
    {label} <span className="visually-hidden">{rest}</span>
  </button>
);

/**
 * Renders `week`, the dashboard's progression, for one day's `prescriptions`:
 * a line per lift the week holds, in the day's order, with loads in kg or lb
 * by `system`. Every answer goes through `onAnswer({ liftKey, decision })`,
 * the week's own without a `liftKey`, and a null decision takes one back.
 * Offline, every answer is disabled: the server keeps them.
 * `error` is why the last answer failed. Nothing renders without a week, or
 * when the day holds none of its lifts outside a deload week.
 */
export default function WeekProgression({ week, prescriptions, system, onAnswer, error }) {
  const offline = useConnection() === "offline";
  if (!week) return null;
  const unit = system === "imperial" ? "lb" : "kg";
  const byKey = new Map(week.lifts.map((lift) => [lift.key, lift]));
  const lifts = prescriptions.flatMap((prescription) => {
    const lift = prescription.reps ? byKey.get(liftKeyOf(prescription.name)) : undefined;
    return lift ? [lift] : [];
  });
  const deloadWeek = week.deloadWeek;
  if (!lifts.length && !deloadWeek?.active) return null;

  return (
    <section className="week-progression" aria-labelledby="week-progression-heading">
      <h4 id="week-progression-heading">This week&apos;s loads</h4>
      <OfflineHint />

      {/* ---- The deload week ---- */}
      {deloadWeek?.active && deloadWeek.decision === null ? (
        <div className="week-deload-banner">
          <p>
            <strong>Lighter week:</strong> {deloadWeek.reason}
          </p>
          <button
            type="button"
            className="ghost"
            disabled={offline}
            onClick={() => onAnswer({ decision: "normal" })}
          >
            Train normally
          </button>
        </div>
      ) : null}
      {deloadWeek?.active && deloadWeek.decision === "normal" ? (
        <div className="week-deload-banner">
          <p>Training normally this week.</p>
          <AnswerButton
            label="Take back"
            rest="training normally"
            disabled={offline}
            onClick={() => onAnswer({ decision: null })}
          />
        </div>
      ) : null}

      {/* ---- Each lift ---- */}
      {lifts.length ? (
        <ul className="week-lift-list">
          {lifts.map((lift) => {
            const load = lift[unit];
            const text = load ? CHANGE_TEXT[lift.change](load, unit) : "No load to set";
            const answers = lift.decision
              ? [{ label: "Take back", rest: "your answer for", decision: null }]
              : (CHANGE_ANSWERS[lift.change] ?? []);
            return (
              <li key={lift.key} className={`week-lift week-lift-${lift.change}`}>
                <p className="week-lift-line">
                  <strong>{lift.name}</strong>: {text}
                </p>
                <p className="muted week-lift-why">{lift.why}</p>
                {answers.length ? (
                  <div className="week-lift-answers">
                    {answers.map(({ label, rest, decision }) => (
                      <AnswerButton
                        key={label}
                        label={label}
                        rest={`${rest} ${lift.name}`}
                        disabled={offline}
                        onClick={() => onAnswer({ liftKey: lift.key, decision })}
                      />
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
