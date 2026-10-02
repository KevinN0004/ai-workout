/**
 * An invisible copy of the workout stage, rendered by HomePage on every stage
 * so useHomeStageFlow can measure the workout panel's size before that stage is
 * mounted.
 */

/**
 * Mirrors HomeWorkoutStage's markup and `samplePlan` without its handlers,
 * back-button style or error line. `.stage-measure` (layout.css) hides it, it
 * is hidden from assistive technology, and its buttons are out of the tab
 * order.
 */
export default function HomeWorkoutMeasure({
  workoutMeasureShellRef,
  workoutMeasureRef,
  samplePlan
}) {
  return (
    <div className="stage-measure" aria-hidden="true">
      <main className="content">
        <div className="home-stage">
          <div className="workout-stage-shell" ref={workoutMeasureShellRef}>
            {/* ---- Header and Generate Workout ---- */}
            <section
              className="panel center-panel stage-panel workout-stage-panel"
              ref={workoutMeasureRef}
            >
              <div className="workout-header">
                <button type="button" className="back-btn workout-back-arrow" tabIndex={-1}>
                  <svg
                    className="workout-back-arrow-icon"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12.75 4.75L7.5 10L12.75 15.25"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <h2>Workout Generation</h2>
              </div>
              <div className="stage-actions workout-generate-row">
                <button className="cta" type="button" tabIndex={-1}>
                  Generate Workout
                </button>
              </div>
            </section>

            {/* ---- Sample weekly plan ---- */}
            <section className="panel muted-panel stage-panel">
              <h2>Sample Weekly Plan</h2>
              <div className="grid">
                {samplePlan.map((block) => (
                  <article key={`measure-${block.day}`} className="plan-card">
                    <h3>{block.day}</h3>
                    <ul>
                      {block.blocks.map((line) => (
                        <li key={`${block.day}-${line}`}>{line}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
