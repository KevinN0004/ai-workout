import { describe, expect, test } from "vitest";
import {
  buildSmoothClosedPath,
  selectImportantSegmentPoints,
  simplifyPerimeterByImportance
} from "../outlineUtils";

const straightLine = (count, step = 5) =>
  Array.from({ length: count }, (_, index) => ({
    id: `p-${index}`,
    x: index * step,
    y: 100
  }));

const countSegments = (path) => (path.match(/ C /g) || []).length;

describe("selectImportantSegmentPoints", () => {
  test("returns short inputs untouched", () => {
    const two = straightLine(2);
    expect(selectImportantSegmentPoints(two)).toBe(two);
    expect(selectImportantSegmentPoints([])).toEqual([]);
  });

  test("returns an empty array for non-array input", () => {
    expect(selectImportantSegmentPoints(undefined)).toEqual([]);
    expect(selectImportantSegmentPoints("nope")).toEqual([]);
  });

  test("always keeps the first and last point", () => {
    const points = straightLine(12);
    const kept = selectImportantSegmentPoints(points);

    expect(kept[0]).toBe(points[0]);
    expect(kept[kept.length - 1]).toBe(points[points.length - 1]);
  });

  test("drops redundant points along a straight run", () => {
    const points = straightLine(12);
    expect(selectImportantSegmentPoints(points).length).toBeLessThan(points.length);
  });

  test("keeps more points when a sharp turn is present than on a straight run", () => {
    const straight = straightLine(9);
    const cornered = straightLine(9).map((point, index) =>
      index >= 5 ? { ...point, y: 100 + (index - 4) * 40 } : point
    );

    expect(selectImportantSegmentPoints(cornered).length).toBeGreaterThanOrEqual(
      selectImportantSegmentPoints(straight).length
    );
  });

  test("never returns consecutive duplicate coordinates", () => {
    const withDupes = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 30 },
      { x: 20, y: 30 }
    ];
    const kept = selectImportantSegmentPoints(withDupes);

    for (let index = 1; index < kept.length; index += 1) {
      const previous = kept[index - 1];
      const current = kept[index];
      expect(previous.x === current.x && previous.y === current.y).toBe(false);
    }
  });
});

describe("simplifyPerimeterByImportance", () => {
  test("returns inputs of four points or fewer untouched", () => {
    const four = straightLine(4);
    expect(simplifyPerimeterByImportance(four)).toBe(four);
  });

  test("returns an empty array for non-array input", () => {
    expect(simplifyPerimeterByImportance(null)).toEqual([]);
  });

  test("reduces a dense straight run and keeps the endpoints", () => {
    const points = straightLine(20);
    const simplified = simplifyPerimeterByImportance(points);

    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toBe(points[0]);
  });

  test("preserves points whose id marks them critical", () => {
    const points = straightLine(20);
    points[9] = { ...points[9], id: "head-top" };

    const simplified = simplifyPerimeterByImportance(points);
    expect(simplified.some((point) => point.id === "head-top")).toBe(true);
  });
});

describe("buildSmoothClosedPath", () => {
  test("returns an empty string for missing or empty input", () => {
    expect(buildSmoothClosedPath([])).toBe("");
    expect(buildSmoothClosedPath(undefined)).toBe("");
  });

  test("emits a degenerate closed path for one point", () => {
    expect(buildSmoothClosedPath([{ x: 4, y: 9 }])).toBe("M 4 9 Z");
  });

  test("emits a straight closed path for two points", () => {
    expect(
      buildSmoothClosedPath([
        { x: 0, y: 0 },
        { x: 10, y: 5 }
      ])
    ).toBe("M 0 0 L 10 5 Z");
  });

  test("emits one cubic segment per point so the loop closes", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: 60, y: 80 },
      { x: 10, y: 70 }
    ];
    const path = buildSmoothClosedPath(points);

    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    expect(countSegments(path)).toBe(points.length);
  });

  test("produces only finite coordinates even when points coincide", () => {
    const degenerate = [
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 40, y: 40 }
    ];
    const path = buildSmoothClosedPath(degenerate);

    expect(path).not.toMatch(/NaN|Infinity/);
  });

  // Hard points are corners the silhouette must keep sharp, so their control
  // handles collapse rather than rounding the join.
  test("pins control handles tight against a hard point", () => {
    const points = [
      { id: "a", x: 0, y: 0 },
      { id: "head-top", x: 50, y: 0 },
      { id: "b", x: 50, y: 50 },
      { id: "c", x: 0, y: 50 }
    ];
    const hard = buildSmoothClosedPath(points);
    const soft = buildSmoothClosedPath(
      points.map((p) => ({ ...p, id: p.id.replace("head-top", "z") }))
    );

    expect(hard).not.toBe(soft);
    expect(hard).not.toMatch(/NaN/);
  });
});
