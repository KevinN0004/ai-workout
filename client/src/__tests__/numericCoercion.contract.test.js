import { describe, expect, test } from "vitest";
import { toFiniteNumber } from "../pages/home/components/physique/math";
import { toNumberOrNull } from "../app/units";
import { fromLoadKg, toLoadKg } from "../app/exerciseSets";
import { topOfRange } from "../app/workoutSession";
import { e1rmOf } from "../pages/dashboard/progress";

// The client half of the invariant asserted in
// server/src/__tests__/numericCoercion.contract.test.js:
//
//   Absent input must never become a measured zero.
//
// `Number(null)` and `Number("")` are both 0 and both finite, so a helper that
// coerces before it guards turns "no reading" into a real-looking measurement.
// On the client it has shipped as an unentered body fat modelled at 3%, a
// silhouette dimension collapsing to its minimum because a null bypassed the
// caller's fallback, and a metric logged without a weight shown as "Latest
// weight 0 lb".
//
// Add a row when you add a numeric helper.

const ABSENT = [
  ["null", null],
  ["an empty string", ""],
  ["undefined", undefined]
];

const helpers = [
  {
    name: "toFiniteNumber (physique/math)",
    call: (value) => toFiniteNumber(value, 42),
    absent: 42
  },
  {
    name: "toNumberOrNull (app/units)",
    call: (value) => toNumberOrNull(value),
    absent: null
  },
  // A set's load as the Log workout form saves it. Metric, so a real
  // measurement reads back as typed; the pound conversion is pinned in
  // app/__tests__/exerciseSets.test.js. A 0 load is bodyweight work.
  {
    name: "toLoadKg (app/exerciseSets)",
    call: (value) => toLoadKg(value, "metric"),
    absent: null
  },
  // A target as an in-gym set opens with it: the top of a card's range text.
  // A target of 0 reps is a measurement like any other.
  {
    name: "topOfRange (app/workoutSession)",
    call: (value) => topOfRange(value),
    absent: null
  }
];

describe.each(helpers)("$name", ({ call, absent }) => {
  // The asymmetry is the bug's signature: `undefined` behaved correctly all
  // along, so an omitted key and an explicit null gave opposite answers for the
  // same missing data. Asserting the three together is what catches it.
  test.each(ABSENT)("treats %s as absent", (_label, value) => {
    expect(call(value)).toBe(absent);
  });

  test("treats a non-numeric string as absent", () => {
    expect(call("not-a-number")).toBe(absent);
  });

  // The counterpart, and the reason these guard on absence rather than on
  // falsiness: a measured zero is a measurement. `sideFat: 0` means no
  // adiposity, not "unspecified". This fails if anyone "fixes" the class with
  // `!value`.
  test.each([
    ["a number", 0],
    ["a numeric string", "0"]
  ])("keeps a measured zero given as %s", (_label, value) => {
    expect(call(value)).toBe(0);
  });

  test("still parses a real measurement", () => {
    expect(call("1")).toBe(1);
  });
});

// Deliberately not in the table, checked rather than assumed:
//
// - `toKg` / `toLb` in app/units.js open with `if (!value) return ""`, which is
//   the falsiness test this class warns against. They are safe as used: every
//   caller passes a form string or an explicit String(...), and "0" is truthy,
//   so the guard only ever sees genuine absence. They are also string -> string
//   converters rather than numeric coercion, returning "" for absent and the
//   original value for non-numeric, so they do not share the contract above.
//
// - `fromLoadKg` in app/exerciseSets.js is the same kind of converter, a stored
//   load in kg to the text the form and Logs show. It guards with
//   toNumberOrNull first, so "" is for absent alone and a 0 kg load shows as
//   "0". Pinned here because it shares the risk, not the shape:
describe("fromLoadKg (app/exerciseSets)", () => {
  test.each(ABSENT)("shows %s as no load", (_label, value) => {
    expect(fromLoadKg(value, "metric")).toBe("");
  });

  test("shows a measured 0 kg as 0", () => {
    expect(fromLoadKg(0, "metric")).toBe("0");
    expect(fromLoadKg(0, "imperial")).toBe("0");
  });
});

// - `e1rmOf` in pages/dashboard/progress.js reads a set's load and reps. Only a
//   load above 0 has a one-rep max, so a measured 0 kg gives none, as no load
//   does, and the table's zero row does not fit. Pinned for the other half: an
//   absent or non-numeric load or rep count never becomes an estimate.
describe("e1rmOf (pages/dashboard/progress)", () => {
  test.each(ABSENT)("gives no estimate for a load given as %s", (_label, value) => {
    expect(e1rmOf({ reps: 5, loadKg: value })).toBeNull();
  });

  test.each(ABSENT)("gives no estimate for reps given as %s", (_label, value) => {
    expect(e1rmOf({ reps: value, loadKg: 100 })).toBeNull();
  });

  test("gives no estimate for a non-numeric load or rep count", () => {
    expect(e1rmOf({ reps: 5, loadKg: "heavy" })).toBeNull();
    expect(e1rmOf({ reps: "five", loadKg: 100 })).toBeNull();
  });

  // What toNumberOrNull adds over Number() behind the `load above 0` gate: an
  // absent load fails that gate either way, but Infinity passes it.
  test("gives no estimate for a load that is not finite", () => {
    expect(e1rmOf({ reps: 5, loadKg: Infinity })).toBeNull();
  });

  test("gives none for a measured 0 kg, which is bodyweight work", () => {
    expect(e1rmOf({ reps: 5, loadKg: 0 })).toBeNull();
  });

  test("still reads a real measurement given as strings", () => {
    expect(e1rmOf({ reps: "1", loadKg: "100" })).toBe(100);
  });
});
