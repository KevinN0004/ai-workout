import { clamp, toFiniteNumber } from "./math";

export const buildPhysiquePalette = (model, fallback) => {
  const fillHue = clamp(toFiniteNumber(model.fillHue, fallback.fillHue), 0, 360);
  const fillSaturation = clamp(toFiniteNumber(model.fillSaturation, fallback.fillSaturation), 10, 100);
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
