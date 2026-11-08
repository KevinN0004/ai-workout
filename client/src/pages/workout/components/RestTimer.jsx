/**
 * The rest timer on the session page (roadmap B6): the time left in large
 * digits, −15 s, +15 s and Skip rest, and "Rest over" once it ends. The digits
 * are not announced; the page's live region says when a rest starts and ends.
 */
import clockText from "../clockText";
import useRestTimer from "../hooks/useRestTimer";

const STEP_SECONDS = 15;

/**
 * The rest that ends at `restEndsAt`. −15 s and +15 s call `onAdjust` with the
 * change in seconds, Skip rest calls `onSkip`, and `onEnd` runs when the rest
 * is seen to end in time (useRestTimer).
 */
export default function RestTimer({ restEndsAt, onAdjust, onSkip, onEnd }) {
  const { remaining, over } = useRestTimer(restEndsAt, onEnd);

  return (
    <section className="rest-timer" aria-label="Rest">
      <p className="rest-digits">{over ? "Rest over" : clockText(remaining)}</p>
      {over ? null : (
        <div className="rest-actions">
          <button type="button" className="ghost" onClick={() => onAdjust(-STEP_SECONDS)}>
            −15 s
          </button>
          <button type="button" className="ghost" onClick={() => onAdjust(STEP_SECONDS)}>
            +15 s
          </button>
          <button type="button" className="ghost" onClick={onSkip}>
            Skip rest
          </button>
        </div>
      )}
    </section>
  );
}
