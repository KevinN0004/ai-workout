import { describe, expect, test } from "vitest";
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH, buildPhysiqueSilhouetteGeometry } from "./geometry";

// This module was untestable until the HMR guard was fixed. `import.meta.hot`
// is truthy under vitest but its `data` bag is undefined, and the module wrote
// to `import.meta.hot.data` without guarding it -- so merely importing the file
// threw, and 965 lines went uncovered as a result.

const finite = (value) => Number.isFinite(value);

const allPointsFinite = (points) =>
  Array.isArray(points) && points.every((point) => finite(point?.x) && finite(point?.y));

describe("buildPhysiqueSilhouetteGeometry", () => {
  test("can be called with no shape at all", () => {
    const geometry = buildPhysiqueSilhouetteGeometry();

    expect(geometry).toBeTruthy();
    expect(Object.keys(geometry).sort()).toEqual(
      ["anchors", "guides", "outlineMarkers", "outlinePath", "outlineTransform", "palette"].sort()
    );
  });

  test("treats null and an empty object the same as no argument", () => {
    const bare = buildPhysiqueSilhouetteGeometry();
    expect(buildPhysiqueSilhouetteGeometry(null).outlinePath).toBe(bare.outlinePath);
    expect(buildPhysiqueSilhouetteGeometry({}).outlinePath).toBe(bare.outlinePath);
  });

  // A field that is present but absent must land on the same silhouette as a
  // field that was never supplied. The "survives non-numeric input" case below
  // exercises a null too, but only asserts the path holds no NaN -- which is
  // true whether the null resolves to the fallback or to 0, so it cannot see
  // this difference.
  //
  // The difference does reach the output. `buildTemplateSizing` in
  // templateOutline.js derives its width scale from the RAW model value rather
  // than from geometry's clamped local, so a dimension that coerces to 0
  // contributes nothing to that scale and narrows the whole silhouette.
  test.each([
    ["null", null],
    ["an empty string", ""]
  ])("reads a %s dimension as absent, not as zero", (_label, absent) => {
    const bare = buildPhysiqueSilhouetteGeometry();
    const withAbsent = buildPhysiqueSilhouetteGeometry({ shoulderHalf: absent });
    const withZero = buildPhysiqueSilhouetteGeometry({ shoulderHalf: 0 });

    expect(withAbsent.outlinePath).toBe(bare.outlinePath);
    expect(withAbsent.outlinePath).not.toBe(withZero.outlinePath);
  });

  // The counterpart, and the reason the guard tests for absence rather than
  // falsiness: an explicit 0 is a measurement and must keep changing the
  // silhouette.
  test("still treats an explicitly zero dimension as a measurement", () => {
    const bare = buildPhysiqueSilhouetteGeometry();
    const withZero = buildPhysiqueSilhouetteGeometry({ shoulderHalf: 0 });

    expect(withZero.outlinePath).not.toBe(bare.outlinePath);
  });

  test("is deterministic for the same shape", () => {
    const shape = { shoulderHalf: 50, waistHalf: 25, fillHue: 200 };
    expect(buildPhysiqueSilhouetteGeometry(shape)).toEqual(buildPhysiqueSilhouetteGeometry(shape));
  });

  test("emits a closed SVG path with no NaN", () => {
    const { outlinePath } = buildPhysiqueSilhouetteGeometry();

    expect(typeof outlinePath).toBe("string");
    expect(outlinePath.startsWith("M ")).toBe(true);
    expect(outlinePath.trimEnd().endsWith("Z")).toBe(true);
    expect(outlinePath).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("produces anchors with finite coordinates inside the viewBox", () => {
    const { anchors } = buildPhysiqueSilhouetteGeometry();

    expect(Array.isArray(anchors)).toBe(true);
    expect(anchors.length).toBeGreaterThan(0);
    expect(allPointsFinite(anchors)).toBe(true);
    anchors.forEach((anchor) => {
      expect(anchor.x).toBeGreaterThanOrEqual(-VIEWBOX_WIDTH);
      expect(anchor.x).toBeLessThanOrEqual(VIEWBOX_WIDTH * 2);
      expect(anchor.y).toBeGreaterThanOrEqual(-VIEWBOX_HEIGHT);
      expect(anchor.y).toBeLessThanOrEqual(VIEWBOX_HEIGHT * 2);
    });
  });

  test("returns a palette derived from the requested hue", () => {
    const { palette } = buildPhysiqueSilhouetteGeometry({ fillHue: 123 });

    expect(palette.major).toMatch(/hsla\(123,/);
    expect(palette.outline).toMatch(/hsla\(123,/);
  });

  // Every dimension is clamped, so nonsense input must not leak into the path.
  test.each([
    ["absurdly large", { shoulderHalf: 1e6, waistHalf: 1e6, headRadius: 1e6 }],
    ["negative", { shoulderHalf: -500, thighHalf: -80, armHeight: -300 }],
    ["non-numeric", { shoulderHalf: "wide", waistHalf: null, hipHalf: undefined }],
    ["NaN and Infinity", { chestHalf: Number.NaN, calfHalf: Number.POSITIVE_INFINITY }]
  ])("survives %s input without emitting NaN", (_label, shape) => {
    const geometry = buildPhysiqueSilhouetteGeometry(shape);

    expect(geometry.outlinePath).not.toMatch(/NaN|Infinity|undefined/);
    expect(allPointsFinite(geometry.anchors)).toBe(true);
  });

  test("a wider shoulder changes the silhouette", () => {
    const narrow = buildPhysiqueSilhouetteGeometry({ shoulderHalf: 32 });
    const wide = buildPhysiqueSilhouetteGeometry({ shoulderHalf: 70 });

    expect(narrow.outlinePath).not.toBe(wide.outlinePath);
  });

  test("outline markers, when present, are finite points", () => {
    const { outlineMarkers } = buildPhysiqueSilhouetteGeometry();

    if (Array.isArray(outlineMarkers) && outlineMarkers.length) {
      expect(allPointsFinite(outlineMarkers)).toBe(true);
    }
  });

  test("guides are finite", () => {
    const { guides } = buildPhysiqueSilhouetteGeometry();

    expect(Array.isArray(guides)).toBe(true);
    guides.forEach((guide) => {
      Object.values(guide).forEach((value) => {
        if (typeof value === "number") expect(finite(value)).toBe(true);
      });
    });
  });
});
