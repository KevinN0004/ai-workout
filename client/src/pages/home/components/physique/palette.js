/**
 * The silhouette's colours, built by geometry.js and set by
 * PhysiqueSilhouette2D as CSS custom properties on its svg.
 */
import { clamp, toFiniteNumber } from "./math";

/**
 * HSL colour strings keyed by role. `major`, `minor`, `glow`, `anchorSurface`
 * and the outline pair are lighter shades of the model's `fillHue`,
 * `fillSaturation` and `fillLightness`, which useBodyModel shifts with the fat
 * score; the skeletal, joint, bone and muscle colours are fixed. `fallback` is
 * geometry.js's fallback model.
 *
 * forms-and-motion.css reads the outline pair for the visible outline and the
 * anchor colours for the debug points. No stylesheet reads `major`, `minor`
 * or the bone and muscle colours.
 */
export const buildPhysiquePalette = (model, fallback) => {
  const fillHue = clamp(toFiniteNumber(model.fillHue, fallback.fillHue), 0, 360);
  const fillSaturation = clamp(
    toFiniteNumber(model.fillSaturation, fallback.fillSaturation),
    10,
    100
  );
  const fillLightness = clamp(toFiniteNumber(model.fillLightness, fallback.fillLightness), 10, 90);
  return {
    major: `hsla(${fillHue}, ${Math.max(18, fillSaturation - 6)}%, ${Math.min(94, fillLightness + 42)}%, 0.98)`,
    minor: `hsla(${fillHue}, ${Math.max(16, fillSaturation - 14)}%, ${Math.min(90, fillLightness + 34)}%, 0.9)`,
    glow: `hsla(${fillHue}, ${Math.min(100, fillSaturation + 8)}%, ${Math.min(94, fillLightness + 40)}%, 0.3)`,
    anchorSurface: `hsla(${fillHue}, ${Math.max(20, fillSaturation - 10)}%, ${Math.min(96, fillLightness + 40)}%, 0.96)`,
    anchorSkeletal: "hsla(205, 88%, 76%, 0.98)",
    anchorJoint: "hsla(17, 90%, 69%, 0.98)",
    bone: "hsla(204, 88%, 76%, 0.95)",
    muscle: "hsla(9, 84%, 68%, 0.92)",
    boneGlow: "hsla(204, 88%, 76%, 0.26)",
    muscleGlow: "hsla(9, 84%, 68%, 0.24)",
    outline: `hsla(${fillHue}, ${Math.max(22, fillSaturation - 8)}%, ${Math.min(94, fillLightness + 38)}%, 0.96)`,
    outlineGlow: `hsla(${fillHue}, ${Math.min(100, fillSaturation + 4)}%, ${Math.min(94, fillLightness + 30)}%, 0.26)`
  };
};
