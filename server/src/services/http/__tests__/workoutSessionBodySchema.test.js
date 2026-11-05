import { describe, expect, test } from "vitest";
import { validateBody, workoutSessionBodySchema } from "../apiSchemaService.js";

// The sets a workout body may carry (roadmap B1): at most 18 exercises of 20
// sets, each set holding reps or seconds and an optional load and RPE, in the
// ranges 006_exercise_sets.sql enforces. The schema refuses what the table
// would, so a bad set is a 400 with a reason rather than a failed insert.

const base = { date: "2026-11-05", duration: 45 };
const set = (fields) => ({ reps: 8, seconds: null, loadKg: 60, rpe: 8, ...fields });
const withSets = (exerciseSets) => ({ ...base, exerciseSets });
const oneSet = (fields) => withSets([{ name: "Squat", sets: [set(fields)] }]);

// What validateBody answers: the parsed body, or the 400's message.
const parse = (body) => {
  let error = null;
  const res = {
    status: () => res,
    json: (payload) => {
      error = payload.error;
      return res;
    }
  };
  const data = validateBody({ body }, res, workoutSessionBodySchema);
  return { data, error };
};

describe("workoutSessionBodySchema's exerciseSets", () => {
  test("accepts the spec's shape and passes it through", () => {
    const exerciseSets = [
      { name: "Dumbbell bench press", sets: [set({}), set({ reps: 6, rpe: 9.5 })] },
      { name: "Plank", sets: [set({ reps: null, seconds: 30, loadKg: null, rpe: null })] }
    ];

    expect(parse(withSets(exerciseSets)).data.exerciseSets).toEqual(exerciseSets);
  });

  test("is optional, so the old body still validates", () => {
    const { data } = parse({ ...base, exercises: ["Squat"], sets: 3, reps: 8 });

    expect(data.exerciseSets).toBeUndefined();
  });

  test("accepts a card with a name and no sets", () => {
    expect(parse(withSets([{ name: "Squat", sets: [] }])).error).toBeNull();
  });

  test("accepts the edge of every range", () => {
    const edges = withSets(
      Array.from({ length: 18 }, (_, index) => ({
        name: index === 0 ? "x".repeat(140) : `Exercise ${index}`,
        sets: Array.from({ length: 20 }, () => set({ reps: 200, loadKg: 1000, rpe: 10 }))
      }))
    );

    expect(parse(edges).error).toBeNull();
    expect(parse(oneSet({ reps: 0, loadKg: 0, rpe: 1 })).error).toBeNull();
    expect(parse(oneSet({ reps: null, seconds: 3600 })).error).toBeNull();
  });

  // Absent is not zero (ADR 0001): every form of "no value" means no value,
  // and a measured 0 rep or 0 kg is kept.
  test.each([
    ["null", null],
    ["an empty string", ""]
  ])("reads %s as absent in every number", (_label, blank) => {
    const { data } = parse(oneSet({ loadKg: blank, rpe: blank }));

    expect(data.exerciseSets[0].sets[0]).toMatchObject({ reps: 8, loadKg: null, rpe: null });
  });

  test("reads a missing key as absent", () => {
    const { data } = parse(withSets([{ name: "Squat", sets: [{ reps: 5 }] }]));

    expect(data.exerciseSets[0].sets[0].reps).toBe(5);
    expect(data.exerciseSets[0].sets[0].loadKg ?? null).toBeNull();
  });

  test("keeps 0 reps and 0 kg", () => {
    const { data } = parse(oneSet({ reps: "0", loadKg: "0" }));

    expect(data.exerciseSets[0].sets[0]).toMatchObject({ reps: 0, loadKg: 0 });
  });

  test.each([
    ["19 exercises", withSets(Array.from({ length: 19 }, () => ({ name: "Squat", sets: [] })))],
    ["21 sets", withSets([{ name: "Squat", sets: Array.from({ length: 21 }, () => set({})) }])],
    ["an empty name", withSets([{ name: " ", sets: [] }])],
    ["a name of 141 characters", withSets([{ name: "x".repeat(141), sets: [] }])],
    ["both reps and seconds", oneSet({ reps: 8, seconds: 30 })],
    ["neither reps nor seconds", oneSet({ reps: null, seconds: null })],
    ["201 reps", oneSet({ reps: 201 })],
    ["negative reps", oneSet({ reps: -1 })],
    ["a fraction of a rep", oneSet({ reps: 8.5 })],
    ["a hold of 0 seconds", oneSet({ reps: null, seconds: 0 })],
    ["a hold of 3601 seconds", oneSet({ reps: null, seconds: 3601 })],
    ["a fraction of a second", oneSet({ reps: null, seconds: 30.5 })],
    ["a load of 1000.01 kg", oneSet({ loadKg: 1000.01 })],
    ["a negative load", oneSet({ loadKg: -2.5 })],
    ["RPE 10.5", oneSet({ rpe: 10.5 })],
    ["RPE 0", oneSet({ rpe: 0 })],
    ["a non-numeric load", oneSet({ loadKg: "heavy" })],
    ["a list that is not a list", withSets({ name: "Squat" })]
  ])("refuses %s", (_label, body) => {
    expect(parse(body).error).toMatch(/^exerciseSets/);
  });

  test("names the set and the field that is wrong", () => {
    const body = withSets([{ name: "Squat", sets: [set({}), set({ reps: 201 })] }]);

    expect(parse(body).error).toMatch(/^exerciseSets\.0\.sets\.1\.reps: /);
  });

  test("says what a set without reps or seconds needs", () => {
    expect(parse(oneSet({ reps: null, seconds: null })).error).toBe(
      "exerciseSets.0.sets.0: Each set needs reps or seconds, not both."
    );
  });
});
