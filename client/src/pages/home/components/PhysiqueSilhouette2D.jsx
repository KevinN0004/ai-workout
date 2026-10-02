/**
 * The physique silhouette as an SVG: its outline, and in development the
 * anchor and outline points when VITE_SHOW_PHYSIQUE_POINTS is "1". Rendered by
 * HomeVisualizerStage.
 */
import { useMemo } from "react";
import {
  VIEWBOX_WIDTH,
  VIEWBOX_HEIGHT,
  SILHOUETTE_GEOMETRY_REV,
  DEV_HOT_RELOAD_TOKEN,
  buildPhysiqueSilhouetteGeometry
} from "./physique/geometry";
export { SILHOUETTE_GEOMETRY_REV } from "./physique/geometry";

/**
 * Draws the outline geometry.js builds from `shape`, useBodyModel's
 * `silhouetteShape`, coloured through CSS custom properties set from its
 * palette. The svg is hidden from assistive technology: the `role="img"`
 * element HomeVisualizerStage wraps it in carries the label.
 */
export default function PhysiqueSilhouette2D({ shape }) {
  // Depends on a JSON signature of `shape` rather than on the object, so an
  // equal shape in a new object does not rebuild the geometry. In the app this
  // saves nothing: HomeVisualizerStage's key remounts this whenever the
  // signature changes, and the form that feeds useBodyModel is not on screen
  // while it is mounted. It keeps the memo correct for a caller that builds
  // `shape` inline.
  const shapeSignature = JSON.stringify(shape || {});
  const { anchors, outlineMarkers, outlinePath, outlineTransform, palette } = useMemo(
    () => buildPhysiqueSilhouetteGeometry(shape),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shapeSignature, DEV_HOT_RELOAD_TOKEN]
  );
  const showDebugPoints = import.meta.env.DEV && import.meta.env.VITE_SHOW_PHYSIQUE_POINTS === "1";

  const anchorStyle = {
    "--anchor-major": palette.major,
    "--anchor-minor": palette.minor,
    "--anchor-glow": palette.glow,
    "--anchor-surface": palette.anchorSurface,
    "--anchor-skeletal": palette.anchorSkeletal,
    "--anchor-joint": palette.anchorJoint,
    "--guide-bone": palette.bone,
    "--guide-muscle": palette.muscle,
    "--guide-bone-glow": palette.boneGlow,
    "--guide-muscle-glow": palette.muscleGlow,
    "--outline-stroke": palette.outline,
    "--outline-glow": palette.outlineGlow
  };

  return (
    <svg
      className="physique-2d-svg"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
      aria-hidden="true"
      style={anchorStyle}
      data-geometry-rev={SILHOUETTE_GEOMETRY_REV}
    >
      {/* ---- Outline ---- */}
      <path className="physique-outline-line" d={outlinePath} transform={outlineTransform} />

      {/* ---- Debug points: the outline's, then the anchors ---- */}
      {showDebugPoints && (
        <g className="physique-point-layer physique-outline-anchor-layer">
          {outlineMarkers.map((point) => (
            <circle
              key={point.id}
              className="physique-point outline"
              cx={point.x}
              cy={point.y}
              r={0.62}
            />
          ))}
        </g>
      )}
      {showDebugPoints && (
        <g className="physique-point-layer physique-anchor-layer">
          {anchors.map((point) => (
            <circle
              key={point.id}
              className={`physique-point ${point.kind} ${point.group || "surface"}`}
              cx={point.x}
              cy={point.y}
              r={point.kind === "major" ? 1.6 : 0.95}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
