/**
 * Pins the in-gym session (roadmap B6): building one from a plan day's cards or
 * blank, the set each "Done" would log, logging and undoing, the steppers, the
 * rest, and the save Finish queues. Days and cards are built by hand here.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_REST_SECONDS,
  addExercise,
  adjustRest,
  blankSession,
  draftFor,
  endRest,
  goTo,
  logSet,
  replaceExercise,
  loggedSetCount,
  sessionFromPlanDay,
  skipExercise,
  stepAmount,
  stepLoad,
  toWorkoutSave,
  topOfRange,
  undoLastSet
} from "../workoutSession.js";
import { newCard } from "../exerciseSets.js";

const NOW = Date.UTC(2026, 10, 9, 17, 0, 0);
const MINUTE = 60 * 1000;

// A rule-built day, its cards as buildPlanDayPrefill makes them, in kg.
const day = {
  index: 0,
  weekday: "Monday",
  title: "Upper A",
  lines: [],
  prescriptions: [
    { name: "Dumbbell bench press", restSeconds: 90 },
    { name: "Plank", restSeconds: null }
  ]
};
const cards = () => [
  newCard({
    name: "Dumbbell bench press",
    kind: "reps",
    targets: { amount: "8-10", rpe: "7-8", load: "22.5" },
    rows: 3
  }),
  newCard({ name: "Plank", kind: "seconds", targets: { amount: "20-30", rpe: "" }, rows: 2 })
];
const fromPlan = (overrides = {}) =>
  sessionFromPlanDay({
    day,
    cards: cards(),
    planId: "plan-1",
    system: "metric",
    now: NOW,
    ...overrides
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 9, 17, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("topOfRange", () => {
  test.each([
    ["8-10", 10],
    ["5", 5],
    ["20-30", 30],
    ["", null],
    [undefined, null],
    ["abc", null]
  ])("%s reads as %s", (text, expected) => {
    expect(topOfRange(text)).toBe(expected);
  });
});

describe("a session from a plan day", () => {
  test("takes the day's title, the plan-day link, the start and today's date", () => {
    const session = fromPlan();

    expect(session).toMatchObject({
      version: 1,
      title: "Upper A",
      planId: "plan-1",
      planDayIndex: 0,
      startedAt: NOW,
      date: "2026-11-09",
      current: 0,
      restEndsAt: null
    });
    expect(session.clientId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("each card is an exercise with its target, its planned sets and its rest", () => {
    const [bench, plank] = fromPlan().exercises;

    expect(bench).toMatchObject({
      name: "Dumbbell bench press",
      kind: "reps",
      targetAmount: 10,
      targetText: "8-10 reps @ RPE 7-8",
      targetLoadKg: 22.5,
      plannedSets: 3,
      restSeconds: 90,
      skipped: false,
      sets: []
    });
    expect(plank).toMatchObject({
      kind: "seconds",
      targetAmount: 30,
      targetText: "20-30 s",
      targetLoadKg: null,
      plannedSets: 2,
      restSeconds: DEFAULT_REST_SECONDS
    });
  });

  test("a load typed in pounds is kept in kg", () => {
    const imperial = [newCard({ name: "Row", targets: { amount: "10", rpe: "", load: "50" } })];

    const [row] = sessionFromPlanDay({
      day: { ...day, prescriptions: [{ name: "Row", restSeconds: 60 }] },
      cards: imperial,
      planId: "plan-1",
      system: "imperial",
      now: NOW
    }).exercises;

    expect(row.targetLoadKg).toBe(22.68);
    expect(row.restSeconds).toBe(60);
  });

  test.each([[undefined], [null], [0], [-5], ["90"], [12.5]])(
    "a rest of %s is the default",
    (restSeconds) => {
      const [bench] = sessionFromPlanDay({
        day: { ...day, prescriptions: [{ name: "Dumbbell bench press", restSeconds }] },
        cards: cards().slice(0, 1),
        planId: "plan-1",
        system: "metric",
        now: NOW
      }).exercises;

      expect(bench.restSeconds).toBe(DEFAULT_REST_SECONDS);
    }
  );

  test("a day saved before prescriptions gets each named exercise, untargeted, at the default rest", () => {
    const [squat] = sessionFromPlanDay({
      day: { index: 2, weekday: "Friday", title: "Legs", lines: ["- Squat: 3 x 5"] },
      cards: [newCard({ name: "Squat" })],
      planId: "plan-1",
      system: "metric",
      now: NOW
    }).exercises;

    expect(squat).toMatchObject({
      targetAmount: null,
      targetText: "",
      targetLoadKg: null,
      plannedSets: 1,
      restSeconds: DEFAULT_REST_SECONDS
    });
  });
});

describe("a blank session", () => {
  test("has no exercises and no plan-day link", () => {
    expect(blankSession({ now: NOW })).toMatchObject({
      title: "Workout",
      planId: null,
      planDayIndex: null,
      exercises: [],
      startedAt: NOW
    });
  });

  test("adds an exercise by name, untargeted, which becomes current", () => {
    let session = addExercise(blankSession({ now: NOW }), { name: " Curl ", kind: "reps" });
    session = addExercise(session, { name: "Wall sit", kind: "seconds" });

    expect(session.exercises.map((exercise) => [exercise.name, exercise.kind])).toEqual([
      ["Curl", "reps"],
      ["Wall sit", "seconds"]
    ]);
    expect(session.exercises[1]).toMatchObject({
      targetAmount: null,
      plannedSets: 0,
      restSeconds: DEFAULT_REST_SECONDS
    });
    expect(session.current).toBe(1);
  });

  test("ignores an exercise with no name", () => {
    const session = blankSession({ now: NOW });

    expect(addExercise(session, { name: "  ", kind: "reps" })).toBe(session);
  });
});

describe("the set Done would log", () => {
  test("the first comes from the targets", () => {
    expect(draftFor(fromPlan().exercises[0])).toEqual({ amount: 10, loadKg: 22.5, rpe: null });
  });

  test("a later one copies the amount and load, and never the RPE", () => {
    const session = logSet(fromPlan(), { amount: 9, loadKg: 25, rpe: 8 }, NOW);

    expect(draftFor(session.exercises[0])).toEqual({ amount: 9, loadKg: 25, rpe: null });
  });

  test("an exercise with no load is bodyweight, not 0 kg", () => {
    expect(draftFor(fromPlan().exercises[1]).loadKg).toBeNull();
  });

  test("an untargeted exercise starts at 10 reps, or 30 seconds", () => {
    const session = addExercise(
      addExercise(blankSession({ now: NOW }), { name: "Curl", kind: "reps" }),
      {
        name: "Hang",
        kind: "seconds"
      }
    );

    expect(draftFor(session.exercises[0]).amount).toBe(10);
    expect(draftFor(session.exercises[1]).amount).toBe(30);
  });
});

describe("logging, undoing and the rest", () => {
  test("a logged set joins the current exercise and starts its rest", () => {
    const session = logSet(fromPlan(), { amount: 10, loadKg: 22.5, rpe: null }, NOW);

    expect(session.exercises[0].sets).toEqual([{ amount: 10, loadKg: 22.5, rpe: null }]);
    expect(session.restEndsAt).toBe(NOW + 90 * 1000);
    expect(loggedSetCount(session)).toBe(1);
  });

  test("undo removes the last set only, and ends the rest", () => {
    let session = logSet(fromPlan(), { amount: 10, loadKg: 22.5, rpe: null }, NOW);
    session = logSet(session, { amount: 9, loadKg: 22.5, rpe: 8 }, NOW);

    session = undoLastSet(session);

    expect(session.exercises[0].sets).toEqual([{ amount: 10, loadKg: 22.5, rpe: null }]);
    expect(session.restEndsAt).toBeNull();
  });

  test("undo with nothing logged changes nothing", () => {
    const session = fromPlan();

    expect(undoLastSet(session)).toBe(session);
  });

  test("±15 s moves the running rest and becomes the exercise's rest", () => {
    let session = logSet(fromPlan(), { amount: 10, loadKg: 22.5, rpe: null }, NOW);

    session = adjustRest(session, 15, NOW);
    expect(session.restEndsAt).toBe(NOW + 105 * 1000);
    expect(session.exercises[0].restSeconds).toBe(105);

    session = adjustRest(session, -15, NOW);
    expect(session.exercises[0].restSeconds).toBe(90);
  });

  test("the rest stays between 15 s and 10 minutes", () => {
    let session = fromPlan();
    for (let i = 0; i < 10; i += 1) session = adjustRest(session, -15, NOW);
    expect(session.exercises[0].restSeconds).toBe(15);

    for (let i = 0; i < 60; i += 1) session = adjustRest(session, 15, NOW);
    expect(session.exercises[0].restSeconds).toBe(600);
  });

  test("taking time off a nearly finished rest ends it now, not in the past", () => {
    let session = logSet(fromPlan(), { amount: 10, loadKg: 22.5, rpe: null }, NOW);

    session = adjustRest(session, -15, NOW + 85 * 1000);

    expect(session.restEndsAt).toBe(NOW + 85 * 1000);
  });

  test("Skip ends the rest", () => {
    const session = logSet(fromPlan(), { amount: 10, loadKg: 22.5, rpe: null }, NOW);

    expect(endRest(session).restEndsAt).toBeNull();
  });
});

describe("moving between exercises", () => {
  test("goes to an exercise in range, and stays put otherwise", () => {
    const session = fromPlan();

    expect(goTo(session, 1).current).toBe(1);
    expect(goTo(session, 5).current).toBe(0);
    expect(goTo(session, -1).current).toBe(0);
  });

  test("skipping marks an exercise, and skipping it again brings it back", () => {
    const skipped = skipExercise(fromPlan(), 1);
    expect(skipped.exercises[1].skipped).toBe(true);

    expect(skipExercise(skipped, 1).exercises[1].skipped).toBe(false);
  });
});

describe("the steppers", () => {
  test("reps move by one, between 0 and 200", () => {
    expect(stepAmount(10, 1, "reps")).toBe(11);
    expect(stepAmount(0, -1, "reps")).toBe(0);
    expect(stepAmount(200, 1, "reps")).toBe(200);
  });

  test("seconds move by five, between 5 and 3600", () => {
    expect(stepAmount(30, 1, "seconds")).toBe(35);
    expect(stepAmount(5, -1, "seconds")).toBe(5);
    expect(stepAmount(3600, 1, "seconds")).toBe(3600);
  });

  test("a load moves by 2.5 kg, and below the lightest step is bodyweight", () => {
    expect(stepLoad(22.5, 1, "metric")).toBe(25);
    expect(stepLoad(null, 1, "metric")).toBe(2.5);
    expect(stepLoad(2.5, -1, "metric")).toBeNull();
    expect(stepLoad(null, -1, "metric")).toBeNull();
  });

  test("under imperial a load moves by 5 lb, kept in kg", () => {
    expect(stepLoad(null, 1, "imperial")).toBe(2.27);
    expect(stepLoad(22.68, 1, "imperial")).toBe(24.95);
  });

  test("a load never passes 1000 kg", () => {
    expect(stepLoad(1000, 1, "metric")).toBe(1000);
  });
});

describe("the save Finish queues", () => {
  test("carries the session's key, date, title and plan-day link, in kg", () => {
    let session = logSet(fromPlan(), { amount: 10, loadKg: 22.5, rpe: 8 }, NOW);
    session = goTo(session, 1);
    session = logSet(session, { amount: 30, loadKg: null, rpe: null }, NOW + 2 * MINUTE);

    expect(toWorkoutSave(session, NOW + 42 * MINUTE)).toEqual({
      id: session.clientId,
      date: "2026-11-09",
      focus: "Upper A",
      duration: 42,
      notes: "",
      exerciseSets: [
        { name: "Dumbbell bench press", sets: [{ reps: 10, seconds: null, loadKg: 22.5, rpe: 8 }] },
        { name: "Plank", sets: [{ reps: null, seconds: 30, loadKg: null, rpe: null }] }
      ],
      planId: "plan-1",
      planDayIndex: 0
    });
  });

  test("leaves out an exercise with no sets", () => {
    const session = logSet(fromPlan(), { amount: 10, loadKg: 22.5, rpe: null }, NOW);

    expect(toWorkoutSave(session, NOW + 30 * MINUTE).exerciseSets.map((e) => e.name)).toEqual([
      "Dumbbell bench press"
    ]);
  });

  test("keeps the duration within the server's 5 to 360 minutes", () => {
    const session = fromPlan();

    expect(toWorkoutSave(session, NOW + 2 * MINUTE).duration).toBe(5);
    expect(toWorkoutSave(session, NOW + 30 * 60 * MINUTE).duration).toBe(360);
  });
});

// Roadmap C4: an exercise swapped on the in-gym screen takes the new
// exercise's prescription, as the plan now holds it.
describe("replacing an exercise after a swap", () => {
  const goblet = {
    name: "Dumbbell goblet squat",
    sets: 3,
    reps: { min: 8, max: 10 },
    seconds: null,
    perSide: false,
    targetRpe: { min: 7, max: 8 },
    restSeconds: 120
  };

  test("takes the new exercise's name, targets, sets and rest, with no load and no sets", () => {
    const session = fromPlan();
    const replaced = replaceExercise(session, 0, goblet);

    expect(replaced.exercises[0]).toEqual({
      key: expect.any(String),
      name: "Dumbbell goblet squat",
      kind: "reps",
      perSide: false,
      targetAmount: 10,
      targetText: "8-10 reps @ RPE 7-8",
      targetLoadKg: null,
      plannedSets: 3,
      restSeconds: 120,
      skipped: false,
      sets: []
    });
    expect(replaced.exercises[0].key).not.toBe(session.exercises[0].key);
    expect(replaced.exercises[1]).toBe(session.exercises[1]);
  });

  test("a held exercise counts seconds, a single value reads as one, and no rest is 90 s", () => {
    const replaced = replaceExercise(fromPlan(), 1, {
      name: "Side plank",
      sets: 3,
      reps: null,
      seconds: { min: 30, max: 30 },
      perSide: true,
      targetRpe: null,
      restSeconds: null
    });

    expect(replaced.exercises[1]).toMatchObject({
      kind: "seconds",
      perSide: true,
      targetAmount: 30,
      targetText: "30 s a side",
      restSeconds: DEFAULT_REST_SECONDS
    });
  });

  test("leaves an exercise that has sets logged, and an index past the end, alone", () => {
    const session = logSet(fromPlan(), { amount: 10, loadKg: 22.5, rpe: null }, NOW);

    expect(replaceExercise(session, 0, goblet)).toBe(session);
    expect(replaceExercise(session, 5, goblet)).toBe(session);
  });
});
