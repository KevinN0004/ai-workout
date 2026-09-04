import { describe, expect, test } from "vitest";
import { buildPhysiquePalette } from "./palette";

const fallback = { fillHue: 200, fillSaturation: 50, fillLightness: 40 };

// Pulls the three hsla channels out so assertions read as numbers rather than
// as string matching against the whole colour.
const hsla = (value) => {
  const [, h, s, l] = value.match(/hsla\(([\d.]+), ([\d.]+)%, ([\d.]+)%/).map(Number);
  return { h, s, l };
};

describe("buildPhysiquePalette", () => {
  test("returns the full set of tokens the SVG binds to", () => {
    const palette = buildPhysiquePalette({}, fallback);

    expect(Object.keys(palette).sort()).toEqual(
      [
        "anchorJoint",
        "anchorSkeletal",
        "anchorSurface",
        "bone",
        "boneGlow",
        "glow",
        "major",
        "minor",
        "muscle",
        "muscleGlow",
        "outline",
        "outlineGlow"
      ].sort()
    );
  });

  test("falls back when the model omits its colour fields", () => {
    const palette = buildPhysiquePalette({}, fallback);
    expect(hsla(palette.major).h).toBe(200);
  });

  test("uses model values in preference to the fallback", () => {
    const palette = buildPhysiquePalette(
      { fillHue: 12, fillSaturation: 70, fillLightness: 30 },
      fallback
    );
    expect(hsla(palette.major).h).toBe(12);
  });

  test("clamps hue into 0..360", () => {
    expect(hsla(buildPhysiquePalette({ fillHue: 999 }, fallback).major).h).toBe(360);
    expect(hsla(buildPhysiquePalette({ fillHue: -40 }, fallback).major).h).toBe(0);
  });

  test("clamps saturation into 10..100 before the per-token offsets", () => {
    // major subtracts 6 and floors at 18, so a clamped 100 yields 94.
    expect(hsla(buildPhysiquePalette({ fillSaturation: 900 }, fallback).major).s).toBe(94);
    // A clamped 10 falls under the floor, so the floor wins.
    expect(hsla(buildPhysiquePalette({ fillSaturation: -5 }, fallback).major).s).toBe(18);
  });

  test("clamps lightness into 10..90 and caps the lightened tokens", () => {
    // major adds 42 and caps at 94, so a clamped 90 hits the cap.
    expect(hsla(buildPhysiquePalette({ fillLightness: 500 }, fallback).major).l).toBe(94);
    expect(hsla(buildPhysiquePalette({ fillLightness: -100 }, fallback).major).l).toBe(52);
  });

  test("ignores non-numeric model values in favour of the fallback", () => {
    const palette = buildPhysiquePalette({ fillHue: "not-a-number" }, fallback);
    expect(hsla(palette.major).h).toBe(200);
  });

  test("keeps the skeletal and joint colours fixed regardless of the model", () => {
    const a = buildPhysiquePalette({ fillHue: 10 }, fallback);
    const b = buildPhysiquePalette({ fillHue: 300 }, fallback);

    expect(a.anchorSkeletal).toBe(b.anchorSkeletal);
    expect(a.anchorJoint).toBe(b.anchorJoint);
    expect(a.bone).toBe(b.bone);
    expect(a.muscle).toBe(b.muscle);
  });

  test("derives every hue-driven token from the same hue", () => {
    const palette = buildPhysiquePalette({ fillHue: 123 }, fallback);

    ["major", "minor", "glow", "anchorSurface", "outline", "outlineGlow"].forEach((token) => {
      expect(hsla(palette[token]).h).toBe(123);
    });
  });
});
