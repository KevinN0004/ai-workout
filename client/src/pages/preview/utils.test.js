import { describe, expect, test, vi } from "vitest";
import {
  PREVIEW_TYPING_MAX_MS,
  PREVIEW_TYPING_MIN_MS,
  PREVIEW_WEEK_DAY_ORDER
} from "./constants";
import {
  buildPreviewLinePath,
  clamp,
  getPreviewTypingStepMs,
  getPreviewWeekdayName,
  getRegionFromLocale,
  normalizePreviewTrainingDay,
  randomBetween,
  roundTo
} from "./utils";

describe("normalizePreviewTrainingDay", () => {
  test("accepts full names, short forms and odd casing", () => {
    expect(normalizePreviewTrainingDay("monday")).toBe("Monday");
    expect(normalizePreviewTrainingDay("MON")).toBe("Monday");
    expect(normalizePreviewTrainingDay("  Weds  ")).toBe("Wednesday");
  });

  test("returns an empty string for anything unrecognised", () => {
    expect(normalizePreviewTrainingDay("caturday")).toBe("");
    expect(normalizePreviewTrainingDay("")).toBe("");
    expect(normalizePreviewTrainingDay(null)).toBe("");
    expect(normalizePreviewTrainingDay(undefined)).toBe("");
  });
});

describe("getRegionFromLocale", () => {
  test("reads the region from a hyphenated or underscored tag", () => {
    expect(getRegionFromLocale("en-GB")).toBe("GB");
    expect(getRegionFromLocale("en_us")).toBe("US");
  });

  test("falls back to Intl parsing for a bare language tag", () => {
    // "en-US" is what Intl expands "en" to in most runtimes; either a region or
    // an empty string is acceptable, but it must never throw.
    expect(() => getRegionFromLocale("en")).not.toThrow();
    expect(typeof getRegionFromLocale("en")).toBe("string");
  });

  test("returns an empty string for junk rather than throwing", () => {
    expect(getRegionFromLocale("!!!")).toBe("");
    expect(getRegionFromLocale("")).toBe("");
    expect(getRegionFromLocale(null)).toBe("");
    expect(getRegionFromLocale(42)).toBe("");
  });
});

describe("clamp", () => {
  test("pins a value into the range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("roundTo", () => {
  test("rounds to whole numbers by default", () => {
    expect(roundTo(2.4)).toBe(2);
    expect(roundTo(2.6)).toBe(3);
  });

  test("rounds to the requested number of digits", () => {
    expect(roundTo(2.345, 2)).toBe(2.35);
    expect(roundTo(2.344, 2)).toBe(2.34);
  });
});

describe("getPreviewTypingStepMs", () => {
  test("stays inside the configured bounds for any length", () => {
    [0, 1, 5, 50, 5000].forEach((length) => {
      const step = getPreviewTypingStepMs(length);
      expect(step).toBeGreaterThanOrEqual(PREVIEW_TYPING_MIN_MS);
      expect(step).toBeLessThanOrEqual(PREVIEW_TYPING_MAX_MS);
    });
  });

  test("types longer text faster per character", () => {
    expect(getPreviewTypingStepMs(60)).toBeLessThan(getPreviewTypingStepMs(10));
  });

  test("treats junk input as a single character rather than dividing by zero", () => {
    expect(Number.isFinite(getPreviewTypingStepMs("abc"))).toBe(true);
    expect(Number.isFinite(getPreviewTypingStepMs(0))).toBe(true);
    expect(Number.isFinite(getPreviewTypingStepMs(null))).toBe(true);
  });
});

describe("randomBetween", () => {
  test("stays within the requested range", () => {
    for (let index = 0; index < 200; index += 1) {
      const value = randomBetween(5, 10);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  test("returns the bound when both ends are equal", () => {
    expect(randomBetween(7, 7)).toBe(7);
  });

  test("maps the extremes of Math.random onto the range", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    expect(randomBetween(2, 6)).toBe(2);
    random.mockReturnValue(0.5);
    expect(randomBetween(2, 6)).toBe(4);
    random.mockRestore();
  });
});

describe("buildPreviewLinePath", () => {
  test("starts with a move command and continues with lines", () => {
    const path = buildPreviewLinePath([1, 2, 3]);

    expect(path.startsWith("M")).toBe(true);
    expect((path.match(/L/g) || []).length).toBe(2);
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  test("produces one point per value", () => {
    expect(buildPreviewLinePath([1, 2, 3, 4]).split(" ")).toHaveLength(4);
  });

  test("handles an empty series without dividing by zero", () => {
    const path = buildPreviewLinePath([]);

    expect(path).not.toMatch(/NaN|Infinity/);
    expect(path.startsWith("M")).toBe(true);
  });

  test("handles a single value and a flat series", () => {
    expect(buildPreviewLinePath([5])).not.toMatch(/NaN/);
    // A flat series has zero range; the guard keeps it from dividing by zero.
    expect(buildPreviewLinePath([4, 4, 4])).not.toMatch(/NaN/);
  });

  test("keeps points inside the requested box", () => {
    const width = 200;
    const height = 80;
    const padding = 10;
    const path = buildPreviewLinePath([3, 9, 1, 7], width, height, padding);

    path.split(" ").forEach((command) => {
      const [x, y] = command.slice(1).split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(padding - 0.001);
      expect(x).toBeLessThanOrEqual(width - padding + 0.001);
      expect(y).toBeGreaterThanOrEqual(padding - 0.001);
      expect(y).toBeLessThanOrEqual(height - padding + 0.001);
    });
  });
});

describe("getPreviewWeekdayName", () => {
  // JS getDay() is Sunday-first; the preview week is Monday-first, so the
  // rotation has to move Sunday to the end rather than the start.
  test("maps a Monday date to the first day of the preview week", () => {
    expect(getPreviewWeekdayName(new Date("2026-06-01T12:00:00Z"))).toBe(
      PREVIEW_WEEK_DAY_ORDER[0]
    );
  });

  test("maps a Sunday date to the last day of the preview week", () => {
    expect(getPreviewWeekdayName(new Date("2026-06-07T12:00:00Z"))).toBe(
      PREVIEW_WEEK_DAY_ORDER[PREVIEW_WEEK_DAY_ORDER.length - 1]
    );
  });

  test("falls back to the first day when given something that is not a date", () => {
    expect(getPreviewWeekdayName(null)).toBe(PREVIEW_WEEK_DAY_ORDER[0]);
    expect(getPreviewWeekdayName({})).toBe(PREVIEW_WEEK_DAY_ORDER[0]);
    expect(getPreviewWeekdayName(new Date("not a date"))).toBe(PREVIEW_WEEK_DAY_ORDER[0]);
  });
});
