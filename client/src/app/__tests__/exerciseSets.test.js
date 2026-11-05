import { describe, expect, test } from "vitest";
import {
  MAX_CARDS,
  MAX_SETS,
  addCard,
  addSet,
  formatExerciseLine,
  fromLoadKg,
  newCard,
  newWorkoutForm,
  removeCard,
  removeSet,
  toExerciseSets,
  toLoadKg,
  updateCard,
  updateSet
} from "../exerciseSets";

// The Log workout form's set log (roadmap B1): exercise cards, each with set
// rows held as typed strings, turned into the API's exerciseSets on save.

const card = (name, rows, fields = {}) => {
  const base = newCard({ name, ...fields });
  return { ...base, sets: rows.map((row) => ({ ...base.sets[0], key: Math.random(), ...row })) };
};

describe("the cards and rows", () => {
  test("the form opens dated today, with one empty card and no plan-day link", () => {
    const form = newWorkoutForm();

    expect(form).toMatchObject({
      focus: "",
      duration: "",
      notes: "",
      planId: null,
      planDayIndex: null,
      planDayLabel: ""
    });
    expect(form.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(form.exerciseSets).toHaveLength(1);
    expect(form.exerciseSets[0].name).toBe("");
    expect(form).not.toHaveProperty("exercises");
  });

  test("a new card has one empty row and counts reps", () => {
    const fresh = newCard();

    expect(fresh).toMatchObject({ name: "", kind: "reps", perSide: false, targets: null });
    expect(fresh.sets).toHaveLength(1);
    expect(fresh.sets[0]).toMatchObject({ amount: "", load: "", rpe: "" });
  });

  test("adding a set copies the previous row's load and nothing else", () => {
    const start = [card("Squat", [{ amount: "5", load: "100", rpe: "8" }])];

    const [after] = addSet(start, start[0].key);

    expect(after.sets).toHaveLength(2);
    expect(after.sets[1]).toMatchObject({ amount: "", load: "100", rpe: "" });
    expect(after.sets[1].key).not.toBe(after.sets[0].key);
  });

  test(`stops at ${MAX_SETS} sets and ${MAX_CARDS} cards`, () => {
    let cards = [newCard()];
    for (let index = 0; index < MAX_SETS + 3; index += 1) cards = addSet(cards, cards[0].key);
    expect(cards[0].sets).toHaveLength(MAX_SETS);

    for (let index = 0; index < MAX_CARDS + 3; index += 1) cards = addCard(cards);
    expect(cards).toHaveLength(MAX_CARDS);
  });

  test("removes a row, a card, and updates each by key", () => {
    const start = [
      card("Squat", [{ amount: "5" }, { amount: "6" }]),
      card("Row", [{ amount: "10" }])
    ];
    const [squat] = start;

    expect(removeSet(start, squat.key, squat.sets[0].key)[0].sets.map((s) => s.amount)).toEqual([
      "6"
    ]);
    expect(removeCard(start, squat.key).map((c) => c.name)).toEqual(["Row"]);
    expect(updateCard(start, squat.key, { name: "Front squat" })[0].name).toBe("Front squat");
    expect(updateSet(start, squat.key, squat.sets[1].key, { load: "80" })[0].sets[1].load).toBe(
      "80"
    );
  });
});

describe("the load's unit", () => {
  test.each([
    ["135", "imperial", 61.23],
    ["60", "metric", 60],
    ["22.555", "metric", 22.56],
    ["0", "imperial", 0],
    ["0", "metric", 0]
  ])("%s typed under %s saves as %s kg", (typed, system, kg) => {
    expect(toLoadKg(typed, system)).toBe(kg);
  });

  test.each([
    ["", null],
    [null, null],
    [undefined, null],
    ["heavy", null]
  ])("%j typed is no load", (typed, kg) => {
    expect(toLoadKg(typed, "metric")).toBe(kg);
  });

  test.each([
    [61.23, "imperial", "135"],
    [22.5, "metric", "22.5"],
    [60, "metric", "60"],
    [0, "imperial", "0"],
    [null, "metric", ""]
  ])("%s kg shows under %s as %j", (kg, system, shown) => {
    expect(fromLoadKg(kg, system)).toBe(shown);
  });
});

describe("toExerciseSets, on save", () => {
  test("turns the cards into the API's shape, in kg", () => {
    const cards = [
      card("  Dumbbell bench press ", [
        { amount: "10", load: "50", rpe: "7" },
        { amount: "8", load: "50", rpe: "8.5" }
      ]),
      card("Plank", [{ amount: "30", load: "", rpe: "" }], { kind: "seconds" })
    ];

    const { exerciseSets, errors } = toExerciseSets(cards, "imperial");

    expect(errors).toEqual({});
    expect(exerciseSets).toEqual([
      {
        name: "Dumbbell bench press",
        sets: [
          { reps: 10, seconds: null, loadKg: 22.68, rpe: 7 },
          { reps: 8, seconds: null, loadKg: 22.68, rpe: 8.5 }
        ]
      },
      { name: "Plank", sets: [{ reps: null, seconds: 30, loadKg: null, rpe: null }] }
    ]);
  });

  test("drops a blank row, keeps a name with no rows, and drops a wholly blank card", () => {
    const cards = [
      card("Squat", [{ amount: "5" }, { amount: "", load: "", rpe: "" }]),
      card("Stretch", [{ amount: "", load: "", rpe: "" }]),
      card("", [{ amount: "", load: "", rpe: "" }])
    ];

    // A blank row is no set, and no reason to stop the save either.
    const { exerciseSets, errors } = toExerciseSets(cards, "metric");
    expect(errors).toEqual({});
    expect(exerciseSets).toEqual([
      { name: "Squat", sets: [{ reps: 5, seconds: null, loadKg: null, rpe: null }] },
      { name: "Stretch", sets: [] }
    ]);
  });

  // A placeholder target is a hint, never a value: an untouched pre-filled row
  // is blank, and is dropped.
  test("saves nothing for a row that only shows a target", () => {
    const cards = [
      card("Squat", [{ amount: "", load: "", rpe: "" }], {
        targets: { amount: "8-10", rpe: "8-9" }
      })
    ];

    const { exerciseSets, errors } = toExerciseSets(cards, "metric");
    expect(errors).toEqual({});
    expect(exerciseSets).toEqual([{ name: "Squat", sets: [] }]);
  });

  test("keeps 0 reps and 0 load", () => {
    const { exerciseSets } = toExerciseSets(
      [card("Pull-up", [{ amount: "0", load: "0" }])],
      "metric"
    );

    expect(exerciseSets[0].sets[0]).toMatchObject({ reps: 0, loadKg: 0 });
  });

  test.each([
    ["a load with no reps", { amount: "", load: "100" }, "reps", "Enter reps or seconds"],
    ["an RPE with no reps", { amount: "", rpe: "8" }, "reps", "Enter reps or seconds"],
    ["a fraction of a rep", { amount: "8.5" }, "reps", "Reps are a whole number from 0 to 200"],
    ["201 reps", { amount: "201" }, "reps", "Reps are a whole number from 0 to 200"],
    [
      "a hold of 0 seconds",
      { amount: "0" },
      "seconds",
      "Seconds are a whole number from 1 to 3600"
    ],
    ["a load past 1000 kg", { amount: "5", load: "1000.5" }, "reps", "Load is from 0 to 1000 kg"],
    ["a negative load", { amount: "5", load: "-5" }, "reps", "Load is from 0 to 1000 kg"],
    ["RPE 11", { amount: "5", rpe: "11" }, "reps", "RPE is from 1 to 10"]
  ])("names the row for %s", (_label, row, kind, message) => {
    const cards = [card("Squat", [row], { kind })];

    const { errors } = toExerciseSets(cards, "metric");

    expect(errors).toEqual({ [`${cards[0].key}:${cards[0].sets[0].key}`]: message });
  });

  test("says the load's limit in pounds under an imperial region", () => {
    const cards = [card("Squat", [{ amount: "5", load: "2300" }])];

    expect(Object.values(toExerciseSets(cards, "imperial").errors)).toEqual([
      "Load is from 0 to 2204 lb"
    ]);
  });

  test("asks for a name when a card has sets but none", () => {
    const cards = [card(" ", [{ amount: "5" }])];

    expect(toExerciseSets(cards, "metric").errors).toEqual({
      [cards[0].key]: "Name this exercise"
    });
  });
});

describe("formatExerciseLine, in Logs", () => {
  const sets = (...rows) =>
    rows.map(([reps, loadKg, rpe]) => ({ reps, seconds: null, loadKg, rpe }));

  test("lists the reps, and collapses a load and RPE every set shares", () => {
    expect(
      formatExerciseLine(
        { name: "Dumbbell bench press", sets: sets([10, 22.5, 7], [9, 22.5, 7], [8, 22.5, 7]) },
        "metric"
      )
    ).toBe("Dumbbell bench press: 10, 9, 8 reps | 22.5 kg | RPE 7");
  });

  test("gives a range where the sets differ", () => {
    expect(
      formatExerciseLine(
        { name: "Squat", sets: sets([5, 100, 7], [5, 102.5, 8], [5, 105, 9]) },
        "metric"
      )
    ).toBe("Squat: 5, 5, 5 reps | 100-105 kg | RPE 7-9");
  });

  test("shows pounds under an imperial region, and seconds for a hold", () => {
    expect(formatExerciseLine({ name: "Squat", sets: sets([5, 61.23, null]) }, "imperial")).toBe(
      "Squat: 5 reps | 135 lb"
    );
    expect(
      formatExerciseLine(
        { name: "Plank", sets: [{ reps: null, seconds: 30, loadKg: null, rpe: null }] },
        "metric"
      )
    ).toBe("Plank: 30 seconds");
  });

  test("keeps a 0 kg load, and a name with no sets", () => {
    expect(formatExerciseLine({ name: "Pull-up", sets: sets([0, 0, 10]) }, "metric")).toBe(
      "Pull-up: 0 reps | 0 kg | RPE 10"
    );
    expect(formatExerciseLine({ name: "Stretch", sets: [] }, "metric")).toBe("Stretch");
  });
});
