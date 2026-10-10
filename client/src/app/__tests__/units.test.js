import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getLocalDateKey,
  getPreferredMeasurementSystem,
  getRegionFromLocale,
  splitFullName,
  toCmFromFeetInches,
  toFeetInchesFromCm,
  toKg,
  toLb
} from "../units";

// Measurement conversion and the locale guess that decides which units a user
// is shown. Pure functions, previously at 54% and only reached incidentally
// through page tests. A wrong conversion here is a wrong weight or height on
// screen, and those numbers feed the profile the planner reads.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("splitFullName", () => {
  test("splits on the first space", () => {
    expect(splitFullName("Jordan Kim")).toEqual({ firstName: "Jordan", lastName: "Kim" });
  });

  // Everything after the first token is the surname, so double-barrelled and
  // multi-word names survive a round trip through the profile form.
  test("keeps a multi-word surname together", () => {
    expect(splitFullName("Ana Maria de la Cruz")).toEqual({
      firstName: "Ana",
      lastName: "Maria de la Cruz"
    });
  });

  test("returns an empty surname for a single name", () => {
    expect(splitFullName("Prince")).toEqual({ firstName: "Prince", lastName: "" });
  });

  test("collapses runs of whitespace rather than making empty parts", () => {
    expect(splitFullName("  Jordan   Kim  ")).toEqual({ firstName: "Jordan", lastName: "Kim" });
  });

  test.each([
    ["an empty string", ""],
    ["only spaces", "   "],
    ["null", null],
    ["undefined", undefined]
  ])("returns two empty strings for %s", (_label, input) => {
    expect(splitFullName(input)).toEqual({ firstName: "", lastName: "" });
  });
});

describe("getRegionFromLocale", () => {
  test.each([
    ["en-US", "US"],
    ["en_US", "US"],
    ["en-us", "US"],
    ["fr-CA", "CA"]
  ])("reads the region out of %s", (locale, expected) => {
    expect(getRegionFromLocale(locale)).toBe(expected);
  });

  // A bare language has no region in the tag, so it falls through to Intl,
  // which does not invent one either.
  test("returns nothing for a bare language", () => {
    expect(getRegionFromLocale("en")).toBe("");
  });

  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42]
  ])("returns nothing for %s", (_label, input) => {
    expect(getRegionFromLocale(input)).toBe("");
  });

  // Intl.Locale throws on a malformed tag, and that must not reach a caller.
  test("returns nothing rather than throwing on a malformed tag", () => {
    expect(() => getRegionFromLocale("!!!")).not.toThrow();
    expect(getRegionFromLocale("!!!")).toBe("");
  });
});

describe("getPreferredMeasurementSystem", () => {
  const withLanguages = (languages, language) => {
    vi.stubGlobal("navigator", { languages, language });
  };

  // The three countries that do not use metric for body measurements.
  test.each(["en-US", "en-LR", "my-MM"])("chooses imperial for %s", (locale) => {
    withLanguages([locale]);

    expect(getPreferredMeasurementSystem()).toBe("imperial");
  });

  test.each(["en-GB", "fr-FR", "ja-JP", "en"])("chooses metric for %s", (locale) => {
    withLanguages([locale]);

    expect(getPreferredMeasurementSystem()).toBe("metric");
  });

  // The list is in preference order, so any imperial entry counts.
  test("chooses imperial when it appears later in the list", () => {
    withLanguages(["fr-FR", "en-US"]);

    expect(getPreferredMeasurementSystem()).toBe("imperial");
  });

  test("falls back to the single language when there is no list", () => {
    withLanguages(undefined, "en-US");

    expect(getPreferredMeasurementSystem()).toBe("imperial");
  });

  test("falls back to the single language when the list is empty", () => {
    withLanguages([], "en-US");

    expect(getPreferredMeasurementSystem()).toBe("imperial");
  });

  // Metric is the default for everyone the list does not name.
  test("defaults to metric when the locale says nothing", () => {
    withLanguages([], undefined);

    expect(getPreferredMeasurementSystem()).toBe("metric");
  });

  // With no navigator there is no locale to read, and reading one would throw.
  test("chooses metric when there is no navigator at all", () => {
    vi.stubGlobal("navigator", undefined);

    expect(getPreferredMeasurementSystem()).toBe("metric");
  });
});

describe("getLocalDateKey", () => {
  // Deliberately built from local getters rather than toISOString. A user in a
  // negative offset late at night is already on tomorrow's date in UTC, and
  // logging a meal would file it under the wrong day.
  test("uses the local date, not the UTC one", () => {
    vi.useFakeTimers();
    // 23:30 on 2 March in a UTC-5 zone is 04:30 on 3 March UTC.
    vi.setSystemTime(new Date(2026, 2, 2, 23, 30, 0));

    expect(getLocalDateKey()).toBe("2026-03-02");
  });

  test("pads the month and day to two digits", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12, 0, 0));

    expect(getLocalDateKey()).toBe("2026-01-05");
  });

  test("always produces a sortable yyyy-mm-dd key", () => {
    expect(getLocalDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toCmFromFeetInches", () => {
  test.each([
    [5, 10, "178"],
    [6, 0, "183"],
    [5, 0, "152"],
    [0, 10, "25"]
  ])("converts %s ft %s in to %s cm", (feet, inches, expected) => {
    expect(toCmFromFeetInches(feet, inches)).toBe(expected);
  });

  test("accepts the strings a form field produces", () => {
    expect(toCmFromFeetInches("5", "10")).toBe("178");
  });

  // A blank field counts as zero of that unit rather than voiding the whole
  // measurement, so someone entering only feet still gets a height.
  test("treats a missing part as zero", () => {
    expect(toCmFromFeetInches(6, "")).toBe("183");
    expect(toCmFromFeetInches("", 10)).toBe("25");
  });

  test("returns nothing when the result would be zero height", () => {
    expect(toCmFromFeetInches(0, 0)).toBe("");
    expect(toCmFromFeetInches("", "")).toBe("");
  });

  test("returns nothing when neither part is a number", () => {
    expect(toCmFromFeetInches("tall", "ish")).toBe("");
  });
});

describe("toFeetInchesFromCm", () => {
  test.each([
    [178, "5", "10"],
    [183, "6", "0"],
    // 152cm is 59.84in: 4ft and 11.84in, which rounds up and carries.
    [152, "5", "0"],
    [160, "5", "3"]
  ])("converts %s cm to %s ft %s in", (cm, feet, inches) => {
    const result = toFeetInchesFromCm(cm);
    expect(result.feet).toBe(feet);
    expect(result.inches).toBe(inches);
  });

  // Rounding the remainder can land on a full twelve inches, which has to
  // carry into the feet rather than be shown as 5 ft 12 in.
  test("carries a rounded twelve inches into the next foot", () => {
    // 182.7cm is 71.93in -- 5ft and 11.93in, which rounds to 12.
    const result = toFeetInchesFromCm(182.7);

    expect(result).toEqual({ feet: "6", inches: "0" });
  });

  test("never reports twelve inches at any height", () => {
    for (let cm = 120; cm <= 220; cm += 0.1) {
      expect(Number(toFeetInchesFromCm(cm).inches)).toBeLessThan(12);
    }
  });

  test("accepts the string a form field produces", () => {
    expect(toFeetInchesFromCm("178")).toEqual({ feet: "5", inches: "10" });
  });

  test.each([
    ["zero", 0],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["text", "tall"]
  ])("returns empty parts for %s", (_label, input) => {
    expect(toFeetInchesFromCm(input)).toEqual({ feet: "", inches: "" });
  });
});

describe("weight conversion", () => {
  test("converts pounds to kilograms", () => {
    expect(toKg("168", "lb")).toBe("76");
  });

  test("leaves a kilogram value alone", () => {
    expect(toKg("76", "kg")).toBe("76");
  });

  test("converts kilograms to pounds", () => {
    expect(toLb("76", "kg")).toBe("168");
  });

  test("leaves a pound value alone", () => {
    expect(toLb("168", "lb")).toBe("168");
  });

  // Both conversions round to whole units, so a round trip is close but not
  // guaranteed identical. Pinning the tolerance stops a future change turning
  // a 1kg drift into a larger one.
  test("round-trips within a kilogram", () => {
    for (const kg of [50, 63, 76, 90, 110]) {
      const back = Number(toKg(toLb(String(kg), "kg"), "lb"));
      expect(Math.abs(back - kg)).toBeLessThanOrEqual(1);
    }
  });

  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["zero", 0]
  ])("returns an empty string for %s", (_label, input) => {
    expect(toKg(input, "lb")).toBe("");
    expect(toLb(input, "kg")).toBe("");
  });

  // A half-typed value is handed back untouched so the field does not clear
  // itself under the user mid-entry.
  test("returns unusable text unchanged rather than blanking the field", () => {
    expect(toKg("seventy", "lb")).toBe("seventy");
    expect(toLb("seventy", "kg")).toBe("seventy");
  });

  test("never converts twice for an unknown source unit", () => {
    expect(toKg("76", "stone")).toBe("76");
    expect(toLb("168", "stone")).toBe("168");
  });
});
