import { useEffect, useMemo, useState } from "react";
import PhysiqueSilhouette2D, { SILHOUETTE_GEOMETRY_REV } from "../../../components/PhysiqueSilhouette2D";

const TEST_LOOP_DURATION_MS = 18000;

const PHYSIQUE_TEST_PRESETS = [
  {
    shoulderHalf: 0.94,
    chestHalf: 0.9,
    waistHalf: 0.78,
    hipHalf: 0.86,
    thighHalf: 0.9,
    calfHalf: 0.88,
    armWidth: 0.86,
    armHeight: 1.01,
    headRadius: 0.96,
    armSpanRatio: 1.01,
    sideFat: 0.18,
    shoulderFat: 0.2
  },
  {
    shoulderHalf: 1.12,
    chestHalf: 1.06,
    waistHalf: 0.84,
    hipHalf: 0.95,
    thighHalf: 1.12,
    calfHalf: 1.05,
    armWidth: 1.2,
    armHeight: 1.04,
    headRadius: 0.99,
    armSpanRatio: 1.02,
    sideFat: 0.26,
    shoulderFat: 0.44
  },
  {
    shoulderHalf: 1.03,
    chestHalf: 1.07,
    waistHalf: 1.02,
    hipHalf: 1.08,
    thighHalf: 1.06,
    calfHalf: 1.02,
    armWidth: 1.04,
    armHeight: 1,
    headRadius: 1.01,
    armSpanRatio: 1,
    sideFat: 0.52,
    shoulderFat: 0.45
  },
  {
    shoulderHalf: 1.01,
    chestHalf: 1.14,
    waistHalf: 1.24,
    hipHalf: 1.22,
    thighHalf: 1.16,
    calfHalf: 1.09,
    armWidth: 1.1,
    armHeight: 0.99,
    headRadius: 1.03,
    armSpanRatio: 0.99,
    sideFat: 0.82,
    shoulderFat: 0.62
  },
  {
    shoulderHalf: 1.08,
    chestHalf: 1,
    waistHalf: 0.88,
    hipHalf: 0.93,
    thighHalf: 1.03,
    calfHalf: 1,
    armWidth: 1.08,
    armHeight: 1.02,
    headRadius: 1,
    armSpanRatio: 1.01,
    sideFat: 0.34,
    shoulderFat: 0.5
  }
];

const easeInOut = (value) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - (2 * clamped));
};

const applyPresetToShape = (shape, preset) => {
  if (!shape || !preset) return shape;

  const scaled = { ...shape };
  [
    "shoulderHalf",
    "chestHalf",
    "waistHalf",
    "hipHalf",
    "thighHalf",
    "calfHalf",
    "armWidth",
    "armHeight",
    "headRadius",
    "armSpanRatio"
  ].forEach((key) => {
    const baseValue = Number(shape[key]);
    const factor = Number(preset[key]);
    if (Number.isFinite(baseValue) && Number.isFinite(factor)) {
      scaled[key] = baseValue * factor;
    }
  });

  if (Number.isFinite(Number(preset.sideFat))) {
    scaled.sideFat = Number(preset.sideFat);
  }
  if (Number.isFinite(Number(preset.shoulderFat))) {
    scaled.shoulderFat = Number(preset.shoulderFat);
  }

  return scaled;
};

const blendShapes = (fromShape, toShape, amount) => {
  if (!fromShape) return toShape;
  if (!toShape) return fromShape;

  const blended = {};
  const keys = new Set([...Object.keys(fromShape), ...Object.keys(toShape)]);
  keys.forEach((key) => {
    const left = fromShape[key];
    const right = toShape[key];
    if (Number.isFinite(Number(left)) && Number.isFinite(Number(right))) {
      blended[key] = Number(left) + ((Number(right) - Number(left)) * amount);
      return;
    }
    blended[key] = amount < 0.5 ? left : right;
  });
  return blended;
};

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
  const shouldAnimateLoop = isDevEnvironment && import.meta.env.VITE_PHYSIQUE_TEST_LOOP === "1";
  const [animationClockMs, setAnimationClockMs] = useState(0);

  useEffect(() => {
    if (!shouldAnimateLoop) return undefined;

    let frameId = 0;
    let lastCommit = -Infinity;
    const startTime = performance.now();

    const step = (time) => {
      if ((time - lastCommit) >= 33) {
        setAnimationClockMs(time - startTime);
        lastCommit = time;
      }
      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [shouldAnimateLoop, silhouetteRenderSignature]);

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

  const displayShape = useMemo(() => {
    if (!shouldAnimateLoop || !silhouetteShape) return silhouetteShape;
    const loopPhase = ((animationClockMs % TEST_LOOP_DURATION_MS) / TEST_LOOP_DURATION_MS) * PHYSIQUE_TEST_PRESETS.length;
    const fromIndex = Math.floor(loopPhase) % PHYSIQUE_TEST_PRESETS.length;
    const toIndex = (fromIndex + 1) % PHYSIQUE_TEST_PRESETS.length;
    const localT = easeInOut(loopPhase - Math.floor(loopPhase));

    const fromShape = applyPresetToShape(silhouetteShape, PHYSIQUE_TEST_PRESETS[fromIndex]);
    const toShape = applyPresetToShape(silhouetteShape, PHYSIQUE_TEST_PRESETS[toIndex]);
    return blendShapes(fromShape, toShape, localT);
  }, [animationClockMs, shouldAnimateLoop, silhouetteShape]);

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
              shape={displayShape}
            />
          </div>
        </div>
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
