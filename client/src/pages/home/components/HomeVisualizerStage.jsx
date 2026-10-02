/**
 * The home page's physique stage: the silhouette drawn from the visitor's
 * measurements, with Back and Continue. Rendered by HomePage while its stage is
 * "visualizer".
 */
import { useEffect } from "react";
import PhysiqueSilhouette2D, { SILHOUETTE_GEOMETRY_REV } from "./PhysiqueSilhouette2D";

/**
 * `visualPanelRef` is the panel useHomeStageFlow's morph measures, to and from
 * this stage, and whose stage and render surface it animates on entry.
 * `silhouetteRenderSignature` is part of the silhouette's key, so a changed
 * shape remounts it. `visualLabel` names the silhouette for assistive
 * technology.
 */
export default function HomeVisualizerStage({
  visualPanelRef,
  visualLabel,
  silhouetteRenderSignature,
  silhouetteShape,
  backBtnStyle,
  onBack,
  onContinue,
  isIntroTransitioning,
  isStageTransitioning
}) {
  // The stage is sized to the viewport, so the page is kept from scrolling, on
  // html and body alike, for as long as it is mounted; unmounting puts back
  // whatever inline overflow each had.
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  return (
    <section className="visualizer-only-stage">
      <div
        className="panel body-visual-panel stage-panel visualizer-only-panel"
        ref={visualPanelRef}
      >
        <h2>Physique</h2>

        {/* ---- Silhouette ---- */}
        <div className="visual-stage" role="img" aria-label={visualLabel}>
          <div className="physique-render-surface" data-silhouette-rev={SILHOUETTE_GEOMETRY_REV}>
            <PhysiqueSilhouette2D
              key={`silhouette-${SILHOUETTE_GEOMETRY_REV}-${silhouetteRenderSignature}`}
              shape={silhouetteShape}
            />
          </div>
        </div>

        {/* ---- Back and Continue ---- */}
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
