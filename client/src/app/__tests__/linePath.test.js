/**
 * Pins buildLinePath, the SVG path builder the dashboard's charts and the
 * walkthrough's dashboard chapter both draw with. Pure, so nothing is stubbed.
 */
import { describe, expect, test } from "vitest";
import { buildLinePath } from "../linePath";

describe("buildLinePath", () => {
  test("starts with a move command and continues with lines", () => {
    const path = buildLinePath([1, 2, 3]);

    expect(path.startsWith("M")).toBe(true);
    expect((path.match(/L/g) || []).length).toBe(2);
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  test("produces one point per value", () => {
    expect(buildLinePath([1, 2, 3, 4]).split(" ")).toHaveLength(4);
  });

  test("handles an empty series without dividing by zero", () => {
    const path = buildLinePath([]);

    expect(path).not.toMatch(/NaN|Infinity/);
    expect(path.startsWith("M")).toBe(true);
  });

  test("handles a single value and a flat series", () => {
    expect(buildLinePath([5])).not.toMatch(/NaN/);
    // The scale runs from 0 to at least 1, so even a flat series has a range.
    expect(buildLinePath([4, 4, 4])).not.toMatch(/NaN/);
  });

  // The charts rely on where the points land, not only on a well-formed path:
  // a larger value draws higher, the scale always reaches 0 and at least 1,
  // and the first and last points sit on the box's inset edges. Each of those
  // can break without producing a NaN.
  test.each([
    ["a rising series, bottom left to top right", [0, 5, 10], "M10,100 L130,55 L250,10"],
    ["an empty series, as one point on the bottom", [], "M10,100"],
    ["an all-zero series, along the bottom", [0, 0, 0], "M10,100 L130,100 L250,100"],
    ["a flat series above 0, along the top", [4, 4, 4], "M10,10 L130,10 L250,10"],
    ["a series under 1, on a scale of at least 1", [0, 0.5], "M10,100 L250,55"]
  ])("draws %s", (_label, values, expected) => {
    expect(buildLinePath(values)).toBe(expected);
  });

  test("keeps points inside the requested box", () => {
    const width = 200;
    const height = 80;
    const padding = 10;
    const path = buildLinePath([3, 9, 1, 7], width, height, padding);

    path.split(" ").forEach((command) => {
      const [x, y] = command.slice(1).split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(padding - 0.001);
      expect(x).toBeLessThanOrEqual(width - padding + 0.001);
      expect(y).toBeGreaterThanOrEqual(padding - 0.001);
      expect(y).toBeLessThanOrEqual(height - padding + 0.001);
    });
  });
});
