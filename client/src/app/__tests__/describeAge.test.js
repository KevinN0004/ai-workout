/**
 * Pins describeAge's wording, and that a missing or future time has no age.
 */
import { describe, expect, test } from "vitest";
import { describeAge } from "../describeAge.js";

const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const MINUTE = 60 * 1000;

describe("describeAge", () => {
  test.each([
    [0, "just now"],
    [59 * 1000, "just now"],
    [MINUTE, "1 min ago"],
    [5 * MINUTE, "5 min ago"],
    [59 * MINUTE, "59 min ago"],
    [60 * MINUTE, "1 h ago"],
    [2 * 60 * MINUTE, "2 h ago"],
    [23 * 60 * MINUTE, "23 h ago"],
    [24 * 60 * MINUTE, "1 day ago"],
    [3 * 24 * 60 * MINUTE, "3 days ago"]
  ])("%i ms before now reads %s", (elapsed, expected) => {
    expect(describeAge(NOW - elapsed, NOW)).toBe(expected);
  });

  test.each([[null], [undefined], ["2026-11-07"], [Number.NaN]])(
    "a time of %s has no age",
    (then) => {
      expect(describeAge(then, NOW)).toBeNull();
    }
  );

  test("a time in the future has no age", () => {
    expect(describeAge(NOW + MINUTE, NOW)).toBeNull();
  });
});
