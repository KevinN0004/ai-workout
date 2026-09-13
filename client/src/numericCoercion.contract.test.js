import { describe, expect, test } from "vitest";
import { toFiniteNumber } from "./components/physique/math";

// The client half of the invariant asserted in
// server/src/numericCoercion.contract.test.js:
//
//   Absent input must never become a measured zero.
//
// `Number(null)` and `Number("")` are both 0 and both finite, so a helper that
// coerces before it guards turns "no reading" into a real-looking measurement.
// Two of the five shipped instances of this were on the client: an unentered
// body fat modelled at 3%, and a silhouette dimension collapsing to its minimum
// because a null bypassed the caller's fallback.
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

// Deliberately not in the table, both checked rather than assumed:
//
// - `useBodyModel.js` has a module-private `toFiniteNumber` of its own. It has
//   the right shape, and its null-vs-empty-string equivalence is already pinned
//   behaviourally in useBodyModel.test.jsx, which asserts that a body fat given
//   as null and one given as "" produce the same model. Reaching it from here
//   would mean adding a `__testables` bag to a React hook module to duplicate a
//   test that already exists.
//
// - `toKg` / `toLb` in app/units.js open with `if (!value) return ""`, which is
//   the falsiness test this class warns against. They are safe as used: every
//   caller passes a form string or an explicit String(...), and "0" is truthy,
//   so the guard only ever sees genuine absence. They are also string -> string
//   converters rather than numeric coercion, returning "" for absent and the
//   original value for non-numeric, so they do not share the contract above.
