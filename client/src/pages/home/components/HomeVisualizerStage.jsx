import PhysiqueSilhouette2D, { SILHOUETTE_GEOMETRY_REV } from "../../../components/PhysiqueSilhouette2D";

export default function HomeVisualizerStage({
  visualPanelRef,
  visualLabel,
  silhouetteRenderSignature,
  silhouetteShape,
  isDevEnvironment,
  backBtnStyle,
  onBack,
  onContinue,
  isIntroTransitioning,
  isStageTransitioning
}) {
  return (
    <section className="visualizer-only-stage">
      <div className="panel body-visual-panel stage-panel visualizer-only-panel" ref={visualPanelRef}>
        <h2>Physique</h2>
        <div className="visual-stage" role="img" aria-label={visualLabel}>
          <div
            className="physique-render-surface"
            data-silhouette-rev={SILHOUETTE_GEOMETRY_REV}
          >
            <PhysiqueSilhouette2D
              key={`silhouette-${SILHOUETTE_GEOMETRY_REV}-${silhouetteRenderSignature}`}
              shape={silhouetteShape}
            />
          </div>
        </div>
        {isDevEnvironment && (
          <p className="physique-debug-rev">SVG rev: {SILHOUETTE_GEOMETRY_REV}</p>
        )}
        <div className="visualizer-only-actions">
          <button
            type="button"
            className="back-btn"
            style={backBtnStyle}
            onClick={onBack}
            disabled={isIntroTransitioning || isStageTransitioning}
          >
            Back
          </button>
          <button
            className="cta"
            type="button"
            onClick={onContinue}
            disabled={isIntroTransitioning || isStageTransitioning}
          >
            Continue
          </button>
        </div>
      </div>
    </section>
  );
}
