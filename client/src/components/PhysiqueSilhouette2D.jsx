import { useMemo } from "react";
import {
  VIEWBOX_WIDTH,
  VIEWBOX_HEIGHT,
  SILHOUETTE_GEOMETRY_REV,
  DEV_HOT_RELOAD_TOKEN,
  buildPhysiqueSilhouetteGeometry
} from "./physique/geometry";
export { SILHOUETTE_GEOMETRY_REV } from "./physique/geometry";

export default function PhysiqueSilhouette2D({ shape }) {
  const shapeSignature = JSON.stringify(shape || {});
  const { anchors, outlineMarkers, outlinePath, palette } = useMemo(
    () => buildPhysiqueSilhouetteGeometry(shape),
    [shapeSignature, DEV_HOT_RELOAD_TOKEN]
  );

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
      role="presentation"
      aria-hidden="true"
      style={anchorStyle}
      data-geometry-rev={SILHOUETTE_GEOMETRY_REV}
    >
      <path className="physique-outline-line" d={outlinePath} />
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
    </svg>
  );
}
