import { describe, expect, test } from "vitest";
import { toNumberOrNull } from "./repositories/rowValues.js";
import { toNullableNumber } from "./services/dashboardDataBuildersService.js";
import { parseRedisPort } from "./services/sessionService.js";
import { __testables as errorTracking } from "./services/errorTrackingService.js";
import { __testables as apiSchema } from "./services/apiSchemaService.js";
import { __testables as indexTestables } from "./index.js";

// The invariant this file exists to hold:
//
//   Absent input must never become a measured zero.
//
// `Number(null)` and `Number("")` are both 0 and both finite, so any helper that
// coerces before it guards turns "no reading" into a real-looking measurement.
// That has shipped five times here -- a null pm2.5 published as AQI 0 ("the air
// is clean"), a null weather code read as "Clear sky" twice, an unentered body
// fat modelled at 3%, and a silhouette dimension collapsing to its minimum.
//
// Until now the rule lived only in prose in CLAUDE.md, and `toNumberOrNull` --
// the reference shape that prose tells everyone to copy -- had no test file at
// all. Five recurrences is the evidence that prose is not a gate. This is the
// gate: every numeric helper on the server is enumerated here, and a new one is
// expected to be added.
//
// Note this asserts a CONTRACT, not an implementation. A helper is free to
// guard however it likes as long as the three absent forms agree and a measured
// zero survives.

const ABSENT = [
  ["null", null],
  ["an empty string", ""],
  ["undefined", undefined]
];

// `zeroIsValid` is not decoration. `toPositiveInt` and `parseRedisPort`
// legitimately exclude 0 from their domain -- a port 0 and a limit of 0 are not
// meaningful -- so for them a measured 0 correctly gives the absent answer, and
// asserting otherwise would be wrong. Flattening this column would either force
// a false assertion or quietly drop the zero check for everyone.
const helpers = [
  {
    name: "toNumberOrNull",
    call: (value) => toNumberOrNull(value),
    absent: null,
    zeroIsValid: true
  },
  {
    name: "toNullableNumber",
    call: (value) => toNullableNumber(value, 0, 100),
    absent: null,
    zeroIsValid: true
  },
  {
    name: "toFiniteNumber (externalDataService)",
    call: (value) => indexTestables.toFiniteNumber(value),
    absent: null,
    zeroIsValid: true
  },
  {
    name: "toRate",
    call: (value) => errorTracking.toRate(value, 0.5),
    absent: 0.5,
    zeroIsValid: true
  },
  {
    name: "toPositiveInt",
    call: (value) => indexTestables.toPositiveInt(value, 42),
    absent: 42,
    zeroIsValid: false
  },
  {
    name: "parseRedisPort",
    call: (value) => parseRedisPort(value),
    absent: null,
    zeroIsValid: false
  }
];

describe.each(helpers)("$name", ({ call, absent, zeroIsValid }) => {
  // The asymmetry is the bug's signature: `undefined` behaved correctly all
  // along, so an omitted key and an explicit null gave opposite answers for the
  // same missing data. That is what made it hard to see, so the three forms are
  // asserted together rather than one at a time.
  test.each(ABSENT)("treats %s as absent", (_label, value) => {
    expect(call(value)).toBe(absent);
  });

  test("treats a non-numeric string as absent", () => {
    expect(call("not-a-number")).toBe(absent);
  });

  if (zeroIsValid) {
    // The counterpart, and the reason these guard on absence rather than on
    // falsiness: a measured zero is a measurement. CLAUDE.md is explicit that
    // fixing this class with `!value` swallows a real 0 -- 0 degrees really is
    // below the cold gate. This fails if anyone does that.
    test.each([
      ["a number", 0],
      ["a numeric string", "0"]
    ])("keeps a measured zero given as %s", (_label, value) => {
      expect(call(value)).toBe(0);
    });
  } else {
    // Zero is outside this helper's domain, so it is genuinely absent here.
    test("treats zero as absent, because zero is outside its range", () => {
      expect(call(0)).toBe(absent);
    });
  }

  test("still parses a real measurement", () => {
    expect(call("1")).toBe(1);
  });
});

// `toNumberInput` is the one helper that deliberately does NOT make the three
// absent forms agree, so it is not in the table above. It feeds `z.preprocess`,
// and zod needs `undefined` to stay `undefined` for `.optional()` to fire and
// `null` to stay `null` for `z.null()` to match -- collapsing them would break
// the distinction between "field omitted" and "field explicitly cleared".
//
// It still honours the invariant that matters: an empty form field becomes
// null, never 0.
describe("toNumberInput", () => {
  const { toNumberInput } = apiSchema;

  test("normalizes an empty string to null rather than to zero", () => {
    expect(toNumberInput("")).toBeNull();
  });

  test("passes null and undefined through for zod to tell apart", () => {
    expect(toNumberInput(null)).toBeNull();
    expect(toNumberInput(undefined)).toBeUndefined();
  });

  test("keeps a measured zero", () => {
    expect(toNumberInput(0)).toBe(0);
    expect(toNumberInput("0")).toBe(0);
  });

  // Returning the original value lets zod produce the type error itself, rather
  // than this helper silently swallowing it into null.
  test("passes a non-numeric value through untouched for zod to reject", () => {
    expect(toNumberInput("not-a-number")).toBe("not-a-number");
  });
});
