/**
 * The home page's last stage: the Generate Workout button, which opens the
 * planner, and the sample weekly plan. Rendered by HomePage while its stage is
 * "workout".
 */

/**
 * `workoutShellRef` is what useHomeStageFlow's morph measures for this stage,
 * with `workoutPanelRef` as its fallback. `error` is App's error from
 * generating a plan or preparing its PDF, shown under the button.
 */
export default function HomeWorkoutStage({
  workoutShellRef,
  workoutPanelRef,
  backBtnStyle,
  onBack,
  isIntroTransitioning,
  isStageTransitioning,
  openPlannerFromProfile,
  error,
  samplePlan
}) {
  return (
    <div className="workout-stage-shell" ref={workoutShellRef}>
      {/* ---- Header, Generate Workout and the error ---- */}
      <section className="panel center-panel stage-panel workout-stage-panel" ref={workoutPanelRef}>
        <div className="workout-header">
          <button
            type="button"
            className="back-btn workout-back-arrow"
            style={backBtnStyle}
            aria-label="Back"
            onClick={onBack}
            disabled={isIntroTransitioning || isStageTransitioning}
          >
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
          <button className="cta" type="button" onClick={openPlannerFromProfile}>
            Generate Workout
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {/* ---- Sample weekly plan ---- */}
      <section className="panel muted-panel stage-panel">
        <h2>Sample Weekly Plan</h2>
        <div className="grid">
          {samplePlan.map((block) => (
            <article key={block.day} className="plan-card">
              <h3>{block.day}</h3>
              <ul>
                {block.blocks.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
