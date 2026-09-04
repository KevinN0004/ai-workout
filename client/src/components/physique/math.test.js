import { describe, expect, test } from "vitest";
import { clamp, interpolateBandWidth, mirrorX, toFiniteNumber } from "./math";

describe("clamp", () => {
  test("returns the value untouched when it sits inside the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  test("pins to the nearest bound when the value falls outside", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });

  test("returns the lower bound when min exceeds max", () => {
    // Math.min(max, Math.max(min, value)) resolves to max for an inverted range.
    expect(clamp(5, 10, 0)).toBe(0);
  });
});

describe("mirrorX", () => {
  test("reflects a point across the centre line", () => {
    expect(mirrorX(120, 215)).toBe(310);
    expect(mirrorX(310, 215)).toBe(120);
  });

  test("leaves a point already on the centre line in place", () => {
    expect(mirrorX(215, 215)).toBe(215);
  });

  test("is its own inverse", () => {
    expect(mirrorX(mirrorX(87.5, 215), 215)).toBe(87.5);
  });
});

describe("toFiniteNumber", () => {
  test("parses numeric input, including numeric strings", () => {
    expect(toFiniteNumber(12, 0)).toBe(12);
    expect(toFiniteNumber("12.5", 0)).toBe(12.5);
  });

  test("falls back for values that are not finite numbers", () => {
    expect(toFiniteNumber("abc", 7)).toBe(7);
    expect(toFiniteNumber(undefined, 7)).toBe(7);
    expect(toFiniteNumber(null, 7)).toBe(0); // Number(null) is 0, which is finite.
    expect(toFiniteNumber(Number.POSITIVE_INFINITY, 7)).toBe(7);
    expect(toFiniteNumber(Number.NaN, 7)).toBe(7);
  });

  test("returns the fallback unchanged when it is undefined", () => {
    expect(toFiniteNumber("nope", undefined)).toBeUndefined();
  });
});

describe("interpolateBandWidth", () => {
  const bands = [
    { y: 0, w: 10 },
    { y: 100, w: 30 },
    { y: 200, w: 20 }
  ];

  test("returns 0 for missing or empty band lists", () => {
    expect(interpolateBandWidth(undefined, 50)).toBe(0);
    expect(interpolateBandWidth([], 50)).toBe(0);
    expect(interpolateBandWidth("not-an-array", 50)).toBe(0);
  });

  test("clamps to the first band above the top of the range", () => {
    expect(interpolateBandWidth(bands, -20)).toBe(10);
    expect(interpolateBandWidth(bands, 0)).toBe(10);
  });

  test("interpolates linearly between two bands", () => {
    expect(interpolateBandWidth(bands, 50)).toBe(20);
    expect(interpolateBandWidth(bands, 150)).toBe(25);
  });

  test("returns a band's own width when y lands exactly on it", () => {
    expect(interpolateBandWidth(bands, 100)).toBe(30);
    expect(interpolateBandWidth(bands, 200)).toBe(20);
  });

  test("clamps to the last band below the bottom of the range", () => {
    expect(interpolateBandWidth(bands, 999)).toBe(20);
  });

  test("does not divide by zero when neighbouring bands share a y", () => {
    const degenerate = [
      { y: 10, w: 4 },
      { y: 10, w: 9 }
    ];
    // The range is floored at 1, so this stays finite rather than producing NaN.
    expect(Number.isFinite(interpolateBandWidth(degenerate, 10))).toBe(true);
  });
});
