import { describe, expect, test } from "vitest";
import { toNumberOrNull } from "../repositories/rowValues.js";
import { toNullableNumber } from "../services/dashboard/dashboardDataBuildersService.js";
import { parseRedisPort } from "../services/auth/sessionService.js";
import { __testables as errorTracking } from "../services/platform/errorTrackingService.js";
import { __testables as apiSchema } from "../services/http/apiSchemaService.js";
import { __testables as indexTestables } from "../index.js";
import { validateEnv } from "../services/platform/envValidationService.js";
import { createExternalDataService } from "../services/external/externalDataService.js";

// The NowCast is pure, so it is built through the factory with stub
// dependencies rather than widening index.js's __testables for it.
const { pm25NowCast } = createExternalDataService({
  cleanText: (value) => (typeof value === "string" ? value : ""),
  toNullableNumber,
  readThroughExternalCache: async () => ({}),
  buildExternalCacheKey: () => "",
  metrics: { externalApiFailures: {}, externalApiRetries: {} },
  logger: { info() {}, warn() {}, error() {} },
  toShortText: (value) => String(value ?? ""),
  recordExternalApiLatency: () => {},
  externalApiRetries: 0,
  externalApiRetryBaseDelayMs: 0
});

// Three hourly means of one value, ending in the three hours before `NOW`: the
// fewest a NowCast needs, so the NowCast of a steady value is that value.
const NOW = Date.parse("2026-03-02T12:10:00Z");
const threeHoursOf = (value) =>
  [0, 1, 2].map((hoursAgo) => ({
    value,
    period: { datetimeTo: { utc: new Date(NOW - 10 * 60000 - hoursAgo * 3600000).toISOString() } }
  }));

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

// The startup check and the reader must agree on what a positive integer
// setting is. A value the check passes but toPositiveInt replaces with its
// default is a setting the operator was told took effect when it did not.
describe("validateEnv accepts a positive integer setting exactly when toPositiveInt keeps it", () => {
  test.each(["1", "42", " 42 ", "1e3", "0x10", "1500.5", "0", "-3", "Infinity", "lots"])(
    "%j",
    (value) => {
      const accepted =
        validateEnv({ DATABASE_URL: "postgresql://u@127.0.0.1/db", GEMINI_TIMEOUT_MS: value })
          .length === 0;
      const kept = indexTestables.toPositiveInt(value, -1) !== -1;

      expect(accepted).toBe(kept);
    }
  );
});

const ABSENT = [
  ["null", null],
  ["an empty string", ""],
  ["undefined", undefined]
];

// `zeroIsValid` is not decoration. `toPositiveInt` and `parseRedisPort`
// legitimately exclude 0 from their domain -- a port 0, a limit of 0 and a
// zero-length generation timeout are not meaningful -- so for
// them a measured 0 correctly gives the absent answer, and asserting otherwise
// would be wrong. Flattening this column would either force a false assertion
// or quietly drop the zero check for everyone.
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
  },
  // Takes a list of hours rather than one value, so the row feeds it three
  // steady hours of the value under test: absent hours are missing hours, and
  // three missing hours are no NowCast at all, never a NowCast of 0.
  {
    name: "pm25NowCast (each hour's value)",
    call: (value) => pm25NowCast(threeHoursOf(value), NOW),
    absent: null,
    zeroIsValid: true
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
