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
    // The scale always spans 0, so even a flat series has a range to divide by.
    expect(buildLinePath([4, 4, 4])).not.toMatch(/NaN/);
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
