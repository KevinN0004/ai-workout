import { describe, expect, test } from "vitest";
import { compare, summarize } from "../summarize.mjs";

// A run's totals, and the gate that compares them with the committed reference
// (docs/specs/2026-11-03-plan-quality-evals-design.md, "The scorers").

// A scored plan with `injury` and `equipment` hits and the given breaks.
const scored = (profile, { injury = 0, equipment = 0, structure = [] } = {}) => ({
  profile,
  structure,
  injuryHits: Array.from({ length: injury }, () => ({ injury: "knee" })),
  equipmentHits: Array.from({ length: equipment }, () => ({ word: "barbell" }))
});

// A summary whose totals are these, as summarize writes one.
const totals = ({ injuryHits = 0, equipmentHits = 0, structureBreaks = 0, failedCalls = 0 }) => ({
  profiles: {},
  totals: { plans: 30, structureBreaks, failedCalls, injuryHits, equipmentHits }
});

describe("summarize", () => {
  test("totals each profile's plans and the run", () => {
    const summary = summarize([
      scored("a", { injury: 2, equipment: 1 }),
      scored("a", { injury: 1, structure: ["notes"] }),
      scored("b", { equipment: 3, structure: ["failed"] })
    ]);

    expect(summary.profiles).toEqual({
      a: { plans: 2, structureBreaks: 1, failedCalls: 0, injuryHits: 3, equipmentHits: 1 },
      b: { plans: 1, structureBreaks: 0, failedCalls: 1, injuryHits: 0, equipmentHits: 3 }
    });
    expect(summary.totals).toEqual({
      plans: 3,
      structureBreaks: 1,
      failedCalls: 1,
      injuryHits: 3,
      equipmentHits: 4
    });
  });

  test("counts every break a plan has", () => {
    const summary = summarize([scored("a", { structure: ["weekdays", "notes"] })]);

    expect(summary.totals.structureBreaks).toBe(2);
  });

  test("an empty run totals zero", () => {
    expect(summarize([]).totals).toEqual({
      plans: 0,
      structureBreaks: 0,
      failedCalls: 0,
      injuryHits: 0,
      equipmentHits: 0
    });
  });
});

describe("compare", () => {
  // The margin is the larger of 3 hits and 25% of the reference.
  test.each([
    [13, 16, true],
    [13, 17, false],
    [2, 5, true],
    [2, 6, false],
    [20, 25, true],
    [20, 26, false],
    [0, 3, true],
    [0, 4, false],
    [13, 0, true]
  ])("a reference of %i injury hits and a run of %i: pass is %s", (reference, run, pass) => {
    expect(compare(totals({ injuryHits: run }), totals({ injuryHits: reference })).pass).toBe(pass);
  });

  test.each([
    [2, 5, true],
    [2, 6, false],
    [20, 25, true],
    [20, 26, false]
  ])("a reference of %i equipment hits and a run of %i: pass is %s", (reference, run, pass) => {
    expect(compare(totals({ equipmentHits: run }), totals({ equipmentHits: reference })).pass).toBe(
      pass
    );
  });

  test("says which count rose and by how much", () => {
    const result = compare(
      totals({ injuryHits: 17, equipmentHits: 9 }),
      totals({ injuryHits: 13, equipmentHits: 2 })
    );

    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual([
      "injury hits rose from 13 to 17, past the margin of 3.25",
      "equipment hits rose from 2 to 9, past the margin of 3"
    ]);
  });

  test("with no reference, only structure gates", () => {
    expect(compare(totals({ injuryHits: 99, equipmentHits: 99 }), null)).toEqual({
      pass: true,
      reasons: []
    });
  });

  test.each([
    ["a structure break", { structureBreaks: 1 }, "1 structure break"],
    ["a failed call", { failedCalls: 2 }, "2 failed calls"]
  ])("fails a run with %s, with or without a reference", (_label, run, reason) => {
    for (const reference of [null, totals({})]) {
      const result = compare(totals(run), reference);
      expect(result.pass).toBe(false);
      expect(result.reasons).toEqual([reason]);
    }
  });
});
