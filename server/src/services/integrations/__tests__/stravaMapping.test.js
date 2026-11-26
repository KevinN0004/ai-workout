import { describe, expect, test } from "vitest";
import { positiveOrNull, sportLabel, toWorkout } from "../stravaMapping.js";

// How a Strava activity becomes a workout (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "Data"): what is absent stays
// absent, Strava's distance 0 is no distance, and nothing breaks the
// workout_sessions checks, so an odd activity still imports.

const ACTIVITY = {
  id: 9001,
  name: "Morning run",
  sport_type: "Run",
  type: "Run",
  start_date: "2026-11-12T12:15:00Z",
  start_date_local: "2026-11-12T07:15:00Z",
  moving_time: 1799,
  elapsed_time: 1900,
  distance: 5012.4,
  has_heartrate: true,
  average_heartrate: 148.2
};

describe("toWorkout", () => {
  test("a full activity", () => {
    expect(toWorkout(ACTIVITY)).toEqual({
      externalId: "9001",
      sport: "Run",
      workoutDate: "2026-11-12",
      focus: "Run",
      durationMinutes: 30,
      notes: "Morning run",
      distanceMeters: 5012.4,
      averageHeartrate: 148.2
    });
  });

  test.each([
    ["0", 0, null],
    ["null", null, null],
    ["absent", undefined, null],
    ["a numeric string", "12", 12],
    ["negative", -4, null]
  ])("a distance of %s is %j", (_label, distance, expected) => {
    expect(toWorkout({ ...ACTIVITY, distance }).distanceMeters).toBe(expected);
  });

  test("a heart rate counts only when Strava says it was recorded", () => {
    expect(toWorkout({ ...ACTIVITY, has_heartrate: false }).averageHeartrate).toBeNull();
    expect(toWorkout({ ...ACTIVITY, has_heartrate: undefined }).averageHeartrate).toBeNull();
    expect(toWorkout({ ...ACTIVITY, average_heartrate: 0 }).averageHeartrate).toBeNull();
    expect(toWorkout({ ...ACTIVITY, average_heartrate: null }).averageHeartrate).toBeNull();
    expect(toWorkout({ ...ACTIVITY, average_heartrate: 141.6 }).averageHeartrate).toBe(141.6);
  });

  test.each([
    ["absent", undefined, null],
    ["null", null, null],
    ["an empty string", "", null],
    ["300 seconds, the table's 5-minute floor", 300, 5],
    ["21600 seconds, its 360-minute ceiling", 21600, 360],
    ["under five minutes", 120, null],
    ["over six hours", 25200, null],
    ["not a number", "long", null]
  ])("a moving time %s is %j minutes", (_label, moving_time, expected) => {
    expect(toWorkout({ ...ACTIVITY, moving_time }).durationMinutes).toBe(expected);
  });

  test("the date is the local start's own date part, never converted", () => {
    expect(toWorkout({ ...ACTIVITY, start_date_local: "2026-11-12T23:59:00Z" }).workoutDate).toBe(
      "2026-11-12"
    );
  });

  test("without a readable local start there is no date", () => {
    expect(toWorkout({ ...ACTIVITY, start_date_local: undefined }).workoutDate).toBeNull();
    expect(toWorkout({ ...ACTIVITY, start_date_local: "yesterday" }).workoutDate).toBeNull();
  });

  test("the sport is sport_type, then the deprecated type, then none", () => {
    expect(toWorkout({ ...ACTIVITY, sport_type: "TrailRun" })).toMatchObject({
      sport: "TrailRun",
      focus: "Trail run"
    });
    expect(toWorkout({ ...ACTIVITY, sport_type: undefined, type: "Ride" })).toMatchObject({
      sport: "Ride",
      focus: "Ride"
    });
    expect(toWorkout({ ...ACTIVITY, sport_type: "", type: "" })).toMatchObject({
      sport: null,
      focus: "Activity"
    });
  });

  test("the title is the notes, trimmed and cut to the notes limit", () => {
    expect(toWorkout({ ...ACTIVITY, name: "  Long one  " }).notes).toBe("Long one");
    expect(toWorkout({ ...ACTIVITY, name: "x".repeat(600) }).notes).toHaveLength(500);
    expect(toWorkout({ ...ACTIVITY, name: undefined }).notes).toBe("");
  });

  test("a sport longer than the column is cut, as its label is", () => {
    const long = "A".repeat(90);
    const workout = toWorkout({ ...ACTIVITY, sport_type: long });
    expect(workout.sport).toHaveLength(60);
    expect(workout.focus.length).toBeLessThanOrEqual(80);
  });
});

describe("sportLabel", () => {
  test.each([
    ["Run", "Run"],
    ["WeightTraining", "Weight training"],
    ["MountainBikeRide", "Mountain bike ride"],
    ["EBikeRide", "E-bike ride"],
    ["EMountainBikeRide", "E-mountain bike ride"],
    ["HighIntensityIntervalTraining", "HIIT"],
    ["Crossfit", "CrossFit"],
    [null, "Activity"]
  ])("%j reads %j", (type, label) => {
    expect(sportLabel(type)).toBe(label);
  });
});

describe("positiveOrNull", () => {
  test.each([
    [null, null],
    [undefined, null],
    ["", null],
    ["  ", null],
    [0, null],
    [-1, null],
    [true, null],
    ["abc", null],
    [Number.POSITIVE_INFINITY, null],
    [12.5, 12.5],
    [" 7 ", 7]
  ])("%j is %j", (value, expected) => {
    expect(positiveOrNull(value)).toBe(expected);
  });
});
