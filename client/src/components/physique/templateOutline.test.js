import { describe, expect, test } from "vitest";
import { buildTemplateOutline } from "./templateOutline";

// 693 lines with no coverage. Unlike geometry.js, nothing blocked importing
// this -- it is a pure module with one export, so it was simply never tested.

const FALLBACK = {
  shoulderHalf: 46,
  chestHalf: 38,
  waistHalf: 27,
  hipHalf: 34,
  thighHalf: 27,
  calfHalf: 20,
  armWidth: 14,
  armHeight: 170,
  headRadius: 20,
  shoulderY: 100,
  chestY: 142,
  waistY: 217,
  hipY: 262,
  thighY: 320,
  calfY: 374,
  ankleY: 414,
  headCenterY: 54,
  fillHue: 22,
  fillSaturation: 58,
  fillLightness: 50
};

const build = (model = FALLBACK, width = 430, height = 430) =>
  buildTemplateOutline({ model, fallback: FALLBACK, viewboxWidth: width, viewboxHeight: height });

describe("buildTemplateOutline", () => {
  test("returns a path and its marker points", () => {
    const outline = build();

    expect(outline).toBeTruthy();
    expect(Object.keys(outline).sort()).toEqual(["outlineMarkers", "path"]);
  });

  test("emits a closed path free of NaN", () => {
    const { path } = build();

    expect(path.startsWith("M ")).toBe(true);
    expect(path.trimEnd().endsWith("Z")).toBe(true);
    expect(path).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("every marker is a finite, identified point", () => {
    const { outlineMarkers } = build();

    expect(outlineMarkers.length).toBeGreaterThan(0);
    outlineMarkers.forEach((marker) => {
      expect(typeof marker.id).toBe("string");
      expect(marker.id).not.toBe("");
      expect(Number.isFinite(marker.x)).toBe(true);
      expect(Number.isFinite(marker.y)).toBe(true);
    });
  });

  test("marker ids are unique, so React keys cannot collide", () => {
    const ids = build().outlineMarkers.map((marker) => marker.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("is deterministic for the same model", () => {
    expect(build().path).toBe(build().path);
  });

  test("a different body model produces a different outline", () => {
    const narrow = build({ ...FALLBACK, shoulderHalf: 32, waistHalf: 22 });
    const wide = build({ ...FALLBACK, shoulderHalf: 70, waistHalf: 40 });

    expect(narrow.path).not.toBe(wide.path);
  });

  test("scales to the supplied viewbox", () => {
    const small = build(FALLBACK, 200, 200);
    const large = build(FALLBACK, 800, 800);

    expect(small.path).not.toBe(large.path);
    const smallMaxX = Math.max(...small.outlineMarkers.map((marker) => marker.x));
    const largeMaxX = Math.max(...large.outlineMarkers.map((marker) => marker.x));
    expect(largeMaxX).toBeGreaterThan(smallMaxX);
  });

  test("keeps the drawing inside the viewbox it was given", () => {
    const width = 430;
    const height = 430;
    const { outlineMarkers } = build(FALLBACK, width, height);

    outlineMarkers.forEach((marker) => {
      expect(marker.x).toBeGreaterThanOrEqual(0);
      expect(marker.x).toBeLessThanOrEqual(width);
      expect(marker.y).toBeGreaterThanOrEqual(0);
      expect(marker.y).toBeLessThanOrEqual(height);
    });
  });

  test.each([
    ["absurdly large", { shoulderHalf: 1e6, waistHalf: 1e6 }],
    ["negative", { shoulderHalf: -400, thighHalf: -50 }],
    ["non-numeric", { shoulderHalf: "wide", hipHalf: null }],
    ["NaN", { chestHalf: Number.NaN, calfHalf: Number.NaN }]
  ])("survives %s model values without emitting NaN", (_label, overrides) => {
    const { path, outlineMarkers } = build({ ...FALLBACK, ...overrides });

    expect(path).not.toMatch(/NaN|Infinity|undefined/);
    outlineMarkers.forEach((marker) => {
      expect(Number.isFinite(marker.x)).toBe(true);
      expect(Number.isFinite(marker.y)).toBe(true);
    });
  });

  test("falls back cleanly when the model is empty", () => {
    const { path } = build({});

    expect(path).not.toMatch(/NaN|undefined/);
    expect(path.trimEnd().endsWith("Z")).toBe(true);
  });
});
