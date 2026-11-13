import { describe, expect, test } from "vitest";
import { STRENGTH_SPORTS, decideImport, deletionsFrom } from "../stravaImport.js";

// The import rules (roadmap C2, docs/specs/2026-11-12-strava-import-design.md,
// "The import rules"): a delete here wins, an import already here stays, and a
// strength-type activity gives way to a workout logged in the app that day.

const workoutOf = (sport) => ({ externalId: "9001", sport });

describe("decideImport", () => {
  test("an activity deleted here is skipped, whatever else holds", () => {
    expect(
      decideImport({
        workout: workoutOf("Run"),
        deletedHere: true,
        appWorkoutThatDay: false,
        existing: true
      })
    ).toBe("skip-deleted");
  });

  test.each([...STRENGTH_SPORTS])(
    "an import already here is updated, even a %s on a day with an app workout",
    (sport) => {
      expect(
        decideImport({
          workout: workoutOf(sport),
          deletedHere: false,
          appWorkoutThatDay: true,
          existing: true
        })
      ).toBe("update");
    }
  );

  test.each([...STRENGTH_SPORTS])("a new %s gives way to an app workout that day", (sport) => {
    expect(
      decideImport({
        workout: workoutOf(sport),
        deletedHere: false,
        appWorkoutThatDay: true,
        existing: false
      })
    ).toBe("skip-duplicate");
    expect(
      decideImport({
        workout: workoutOf(sport),
        deletedHere: false,
        appWorkoutThatDay: false,
        existing: false
      })
    ).toBe("create");
  });

  test.each(["Run", "Ride", "Swim", null])("a new %j imports beside an app workout", (sport) => {
    expect(
      decideImport({
        workout: workoutOf(sport),
        deletedHere: false,
        appWorkoutThatDay: true,
        existing: false
      })
    ).toBe("create");
  });

  test("the strength types are the three the spec names", () => {
    expect([...STRENGTH_SPORTS].sort()).toEqual(["Crossfit", "WeightTraining", "Workout"]);
  });
});

describe("deletionsFrom", () => {
  const imports = [
    { id: "a", externalId: "1", date: "2026-11-10" },
    { id: "b", externalId: "2", date: "2026-11-11" },
    { id: "c", externalId: "3", date: "2026-11-12" }
  ];

  test("from a complete list, the imports Strava no longer lists", () => {
    expect(deletionsFrom({ imports, listedIds: new Set(["2"]), complete: true })).toEqual([
      "1",
      "3"
    ]);
  });

  test("from a partial list, nothing", () => {
    expect(deletionsFrom({ imports, listedIds: new Set(), complete: false })).toEqual([]);
  });

  test("from a complete list holding every import, nothing", () => {
    expect(deletionsFrom({ imports, listedIds: new Set(["1", "2", "3"]), complete: true })).toEqual(
      []
    );
  });
});
