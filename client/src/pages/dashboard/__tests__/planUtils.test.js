import { describe, expect, test } from "vitest";
import {
  buildPlanDayPrefill,
  buildWeeklyMealPlan,
  deloadSets,
  detectTrack,
  getDailyCalories
} from "../planUtils";
import { equipmentOptionsByEnv, experienceOptions, goalOptions } from "../../../app/constants";
import { parsePlanSections } from "../../../app/plans";
import { generatePlan } from "../../../../../server/src/services/planning/generatePlan.js";
import {
  buildPlanPayload,
  withPrescriptions
} from "../../../../../server/src/services/dashboard/planPayloadService.js";
import { EXERCISES } from "../../../../../server/src/services/planning/exerciseLibrary.js";

// The eight real Gemini answers the server's plan tests are built on, loaded by
// Vite as text: under jsdom, node:fs cannot find them from import.meta.url.
const realDays = Object.entries(
  import.meta.glob("../../../../../server/src/services/dashboard/__tests__/fixtures/plans/*.txt", {
    query: "?raw",
    import: "default",
    eager: true
  })
).flatMap(([path, text]) =>
  parsePlanSections(text).days.map((day) => [`${path.split("/").pop()} ${day.title}`, day])
);
const realDay = (fixture, weekday) =>
  realDays.find(([label]) => label === `${fixture} ${weekday}`)[1];

// The names of the exercise cards a pre-fill opens with.
const namesOf = (prefill) => prefill.exerciseSets.map((card) => card.name);

describe("buildPlanDayPrefill", () => {
  test("reads all 56 real days", () => {
    expect(realDays).toHaveLength(56);
  });

  // Each name is one exercise card; the server keeps 18 names of 140
  // characters.
  test.each(realDays)("%s fits the form", (_label, day) => {
    const prefill = buildPlanDayPrefill(day);
    const { focus, notes } = prefill;
    const names = namesOf(prefill);

    expect(focus).toBe(day.title);
    expect(names.length).toBeLessThanOrEqual(18);
    for (const name of names) {
      expect(name).not.toMatch(/^rest\b/i);
      expect(name).not.toMatch(/[()]/);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(140);
    }
    expect(notes.length).toBeLessThanOrEqual(500);
    expect(notes).toBe(day.lines.join("\n").slice(0, 500));
  });

  test("names each exercise a day's bullets prescribe, in order", () => {
    expect(namesOf(buildPlanDayPrefill(realDay("02-commercial-full-5d.txt", "Monday")))).toEqual([
      "Back Squats",
      "Conventional Deadlifts",
      "Leg Press",
      "Seated Calf Raises",
      "Wall Sits"
    ]);
  });

  test("drops a bracketed aside, and the comma in it", () => {
    const day = {
      title: "Tuesday",
      lines: ["- Cable Rows (Close grip, focus on upright posture): 3 x 10"]
    };

    expect(namesOf(buildPlanDayPrefill(day))).toEqual(["Cable Rows"]);
  });

  // A card holds its name whole, so a comma in it no longer splits it in two
  // ("One-arm dumbbell row, hand on a bench" is one library exercise).
  test("leaves out a rest line, and keeps a name that holds a comma", () => {
    const day = {
      title: "Monday",
      lines: ["- Rest: 30 seconds", "- Squats, then lunges: 3 x 10", "- Plank: 3 x 30s"]
    };

    expect(namesOf(buildPlanDayPrefill(day))).toEqual(["Squats, then lunges", "Plank"]);
  });

  test("opens each card with one empty set row", () => {
    const [card] = buildPlanDayPrefill({
      title: "Monday",
      lines: ["- Plank: 3 x 30s"]
    }).exerciseSets;

    expect(card).toMatchObject({ name: "Plank", kind: "reps", targets: null });
    expect(card.sets).toHaveLength(1);
    expect(card.sets[0]).toMatchObject({ amount: "", load: "", rpe: "" });
  });

  // The server keeps an exercise of at most 140 characters, so a longer name
  // is left out rather than cut into a different name.
  test("leaves out a name longer than the 140 characters an exercise can hold", () => {
    const day = {
      title: "Monday",
      lines: [`- ${"x".repeat(141)}: 3 x 10`, `- ${"y".repeat(140)}: 3 x 10`]
    };

    expect(namesOf(buildPlanDayPrefill(day))).toEqual(["y".repeat(140)]);
  });

  test("keeps the whole day as notes, cut at 500 characters", () => {
    const day = { title: "Monday", lines: ["Warmup:", "x".repeat(600)] };

    expect(buildPlanDayPrefill(day).notes).toBe(`Warmup:\n${"x".repeat(492)}`);
  });

  test("gives a rest day its text and no exercises", () => {
    const day = realDay("05-home-bands-2d-shoulder.txt", "Monday");

    expect(buildPlanDayPrefill(day)).toEqual({
      focus: "Monday",
      exerciseSets: [],
      notes: "Rest / Active Recovery\n(Light walking or gentle stretching permitted)"
    });
  });

  // Plans are built by rules now, and their bullets are not all exercises: a
  // ramp-up line names its lift after a "Ramp-up:" label, a superset prefixes
  // its pair with "A1." and "A2.", and a cool-down is "Easy breathing". A
  // sample of real rule-built weeks must pre-fill only names from the library.
  test("pre-fills only library exercises from rule-built plans", () => {
    const names = new Set(EXERCISES.map((exercise) => exercise.name));
    const setups = [
      { environment: "Home", equipment: ["Bodyweight only"] },
      { environment: "Home", equipment: ["Dumbbells", "Adjustable bench"] },
      { environment: "Commercial", equipment: equipmentOptionsByEnv.Commercial }
    ];
    const texts = [];
    const strays = new Set();
    // The same weeks as a rule-built plan saves them, prescriptions and all.
    const prescribedStrays = new Set();
    let prescribedCards = 0;
    for (const setup of setups)
      for (const level of experienceOptions)
        for (const duration of [20, 30, 45, 60, 90])
          for (const focuses of [[], ["Mobility"], ["Cardio"]])
            for (const injuries of ["None", "Knee"])
              for (const days of [3, 5]) {
                const { text, week } = generatePlan({
                  ...setup,
                  goal: goalOptions[0],
                  level,
                  days,
                  duration,
                  injuries,
                  focuses,
                  health: {},
                  age: null
                });
                texts.push(text);
                for (const day of parsePlanSections(text).days) {
                  for (const name of namesOf(buildPlanDayPrefill(day)))
                    if (!names.has(name)) strays.add(name);
                }
                for (const day of withPrescriptions(buildPlanPayload(text), week).days) {
                  const cards = buildPlanDayPrefill(day).exerciseSets;
                  prescribedCards += cards.length;
                  for (const card of cards)
                    if (!names.has(card.name)) prescribedStrays.add(card.name);
                }
              }

    // The sample holds every kind of bullet that is not an exercise.
    const all = texts.join("\n");
    expect(all).toMatch(/^- Ramp-up: /m);
    expect(all).toMatch(/^- A1\. /m);
    expect(all).toMatch(/^- Easy breathing: /m);
    expect([...strays]).toEqual([]);
    expect(prescribedCards).toBeGreaterThan(0);
    expect([...prescribedStrays]).toEqual([]);
  });

  // Roadmap B1: a rule-built day carries its prescriptions, so its cards open
  // with the prescribed rows, counted the prescribed way, and the targets as
  // placeholders. A target is a placeholder, never a value: every row opens
  // empty.
  describe("from a rule-built day's prescriptions", () => {
    const prescription = (fields) => ({
      name: "Dumbbell bench press",
      sets: 3,
      reps: { min: 8, max: 10 },
      seconds: null,
      perSide: false,
      targetRpe: { min: 8, max: 9 },
      ...fields
    });
    const day = (prescriptions) => ({
      title: "Monday - Full body A",
      lines: ["- Dumbbell bench press: 3 x 8-10 (Rest 90s, stop 2 reps short of failure)"],
      prescriptions
    });

    test("opens a card per prescription, with its rows and its targets", () => {
      const [card] = buildPlanDayPrefill(day([prescription({})])).exerciseSets;

      expect(card).toMatchObject({
        name: "Dumbbell bench press",
        kind: "reps",
        perSide: false,
        targets: { amount: "8-10", rpe: "8-9" }
      });
      expect(card.sets).toHaveLength(3);
      for (const row of card.sets) expect(row).toMatchObject({ amount: "", load: "", rpe: "" });
    });

    test("counts seconds for a hold, each side where it says so, with no RPE target", () => {
      const [card] = buildPlanDayPrefill(
        day([
          prescription({
            name: "Side plank",
            reps: null,
            seconds: { min: 20, max: 30 },
            perSide: true,
            targetRpe: null
          })
        ])
      ).exerciseSets;

      expect(card).toMatchObject({
        name: "Side plank",
        kind: "seconds",
        perSide: true,
        targets: { amount: "20-30", rpe: "" }
      });
    });

    test("writes a single number for a range that is one value", () => {
      const [card] = buildPlanDayPrefill(
        day([prescription({ reps: { min: 6, max: 6 }, targetRpe: { min: 8, max: 8 } })])
      ).exerciseSets;

      expect(card.targets).toEqual({ amount: "6", rpe: "8" });
    });

    // A rule-built day that prescribes no sets, a cardio day, opens no cards
    // rather than guessing names from its lines.
    test("opens no cards for a day that prescribes none", () => {
      expect(buildPlanDayPrefill(day([])).exerciseSets).toEqual([]);
    });

    test("opens at most 18 cards", () => {
      const many = Array.from({ length: 20 }, (_, index) =>
        prescription({ name: `Exercise ${index + 1}` })
      );

      expect(buildPlanDayPrefill(day(many)).exerciseSets).toHaveLength(18);
    });

    // Roadmap B4: the week's progression sets each lift's rows and its load,
    // as a placeholder like the other targets. A typed load in a row left
    // blank would stop the save, so nothing is typed.
    describe("with the week's progression", () => {
      const hold = prescription({
        name: "Plank",
        reps: null,
        seconds: { min: 20, max: 30 },
        targetRpe: null
      });
      const lift = (fields) => ({
        name: "Dumbbell bench press",
        key: "dumbbell bench press",
        change: "up",
        kg: { from: 20, target: 22.5 },
        lb: { from: 45, target: 50 },
        sets: 3,
        why: "",
        decision: null,
        ...fields
      });
      const weekOf = (lifts, deloadWeek = { active: false, decision: null }) => ({
        weekStart: "2026-11-09",
        deloadWeek,
        lifts
      });
      const cardsOf = (week, system = "metric", prescriptions = [prescription({}), hold]) =>
        buildPlanDayPrefill(day(prescriptions), week, system).exerciseSets;

      test("a lift's card has the week's load as its placeholder, in the region's unit", () => {
        const [metric] = cardsOf(weekOf([lift({})]));
        const [imperial] = cardsOf(weekOf([lift({})]), "imperial");

        expect(metric.targets).toEqual({ amount: "8-10", rpe: "8-9", load: "22.5" });
        expect(imperial.targets.load).toBe("50");
        for (const row of metric.sets) expect(row.load).toBe("");
      });

      test("an asked step up not yet answered offers the load it is at", () => {
        expect(cardsOf(weekOf([lift({ change: "ask" })]))[0].targets.load).toBe("20");
        expect(cardsOf(weekOf([lift({ change: "up", decision: "accept" })]))[0].targets.load).toBe(
          "22.5"
        );
      });

      test("a lift with no load to set, or not in the week, gets no load", () => {
        expect(cardsOf(weekOf([lift({ change: "none", kg: null, lb: null })]))[0].targets).toEqual({
          amount: "8-10",
          rpe: "8-9"
        });
        expect(cardsOf(weekOf([]))[0].targets).toEqual({ amount: "8-10", rpe: "8-9" });
      });

      test("a lift's card opens with the week's sets", () => {
        expect(cardsOf(weekOf([lift({ sets: 2 })]))[0].sets).toHaveLength(2);
      });

      test("a deload week halves every card's rows, holds included", () => {
        const [press, plank] = cardsOf(
          weekOf([lift({ change: "hold", sets: 2 })], { active: true, decision: null })
        );

        expect(press.sets).toHaveLength(2);
        expect(plank.sets).toHaveLength(2);
      });

      test("a deload week trained normally keeps the prescribed rows", () => {
        const [, plank] = cardsOf(weekOf([lift({})], { active: true, decision: "normal" }));

        expect(plank.sets).toHaveLength(3);
      });

      test("a timed exercise takes no load, even one the week holds as a lift", () => {
        const [, plank] = cardsOf(weekOf([lift({ name: "Plank", key: "plank", sets: 1 })]));

        expect(plank.targets).toEqual({ amount: "20-30", rpe: "" });
        expect(plank.sets).toHaveLength(3);
      });

      test("the names of the week's lifts match in any case and spacing", () => {
        const [card] = cardsOf(weekOf([lift({})]), "metric", [
          prescription({ name: "  Dumbbell BENCH press " })
        ]);

        expect(card.targets.load).toBe("22.5");
      });
    });
  });
});

describe("deloadSets", () => {
  test.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3]
  ])("halves %i sets, rounding up, to %i", (sets, halved) => {
    expect(deloadSets(sets)).toBe(halved);
  });
});

describe("planUtils", () => {
  test("detectTrack maps goal text to expected tracks", () => {
    expect(detectTrack("Fat loss + conditioning")).toBe("fat_loss");
    expect(detectTrack("Endurance and athletic performance")).toBe("endurance");
    expect(detectTrack("Mobility and recovery focus")).toBe("recovery");
    expect(detectTrack("Build lean strength and energy")).toBe("lean_strength");
  });

  // Every goal the form offers, and the track it is meant to land on. A goal
  // added to goalOptions without a row here fails the first test.
  const INTENDED_TRACKS = {
    "Build lean strength and energy": "lean_strength",
    "Fat loss + conditioning": "fat_loss",
    Mobility: "recovery",
    Recovery: "recovery",
    Cardio: "endurance"
  };

  test("has an intended track for every goal the form offers", () => {
    expect(Object.keys(INTENDED_TRACKS).sort()).toEqual([...goalOptions].sort());
  });

  test.each(goalOptions)("detectTrack maps the goal %s to its intended track", (goal) => {
    expect(detectTrack(goal)).toBe(INTENDED_TRACKS[goal]);
  });

  // A keyword is a whole word. As a substring, "cut" was found in "execute"
  // and "joint" in "disjointed", which put those goals on the wrong track.
  test.each([
    ["Execute a strength block", "lean_strength"],
    ["Acute knee rehab, then strength", "lean_strength"],
    ["Uppercut power for boxing", "lean_strength"],
    ["Shortcut to strength", "lean_strength"],
    ["Disjointed schedule, build muscle", "lean_strength"],
    ["Cutting phase", "fat_loss"],
    ["Cardio-focused cut", "fat_loss"],
    ["Cardiovascular health", "endurance"],
    ["Improve cardiorespiratory fitness", "endurance"],
    ["Athleticism", "endurance"],
    ["Athletics season", "endurance"],
    ["Joint health", "recovery"]
  ])("detectTrack reads %j as %s", (goal, track) => {
    expect(detectTrack(goal)).toBe(track);
  });

  test("getDailyCalories applies track rules and minimum floors", () => {
    expect(getDailyCalories("fat_loss", 2000, true)).toBe(2000);
    expect(getDailyCalories("fat_loss", 1600, false)).toBe(1400);

    expect(getDailyCalories("endurance", 2200, true)).toBe(2350);
    expect(getDailyCalories("endurance", 2200, false)).toBe(2200);

    expect(getDailyCalories("recovery", 1550, false)).toBe(1500);
    expect(getDailyCalories("lean_strength", 1600, false)).toBe(1500);
  });

  test("buildWeeklyMealPlan builds training/rest day calories and defaults safely", () => {
    const weekDays = [
      { label: "Mon", key: "Monday" },
      { label: "Tue", key: "Tuesday" },
      { label: "Wed", key: "Wednesday" }
    ];

    const plan = buildWeeklyMealPlan({
      weekDays,
      latestPlanByWeekday: {
        Monday: ["Squat", "Bench"]
      },
      goalText: "Fat loss + conditioning",
      targetCalories: "2100"
    });

    expect(plan.track).toBe("fat_loss");
    expect(plan.targetCalories).toBe(2100);
    expect(plan.days).toHaveLength(3);
    expect(plan.days[0].trainingDay).toBe(true);
    expect(plan.days[0].calories).toBe(2100);
    expect(plan.days[1].trainingDay).toBe(false);
    expect(plan.days[1].calories).toBe(1850);
    expect(plan.days[0].breakfast).toBeTruthy();
    expect(plan.days[0].prepNote).toBeTruthy();

    const fallback = buildWeeklyMealPlan({
      weekDays,
      latestPlanByWeekday: {},
      goalText: "",
      targetCalories: ""
    });
    expect(fallback.track).toBe("lean_strength");
    expect(fallback.targetCalories).toBe(2200);
  });

  // Every day of a real plan has lines, so lines alone cannot mark a training
  // day: a rest day's lines are prose about resting.
  test("buildWeeklyMealPlan gives a rest day with lines the rest-day calories", () => {
    const plan = buildWeeklyMealPlan({
      weekDays: [
        { label: "Mon", key: "Monday" },
        { label: "Tue", key: "Tuesday" }
      ],
      latestPlanByWeekday: {
        Monday: ["Main lifts:", "- Back Squats: 3 x 5 (Rest: 3 mins)"],
        Tuesday: ["Rest or 20-minute light walk."]
      },
      goalText: "Fat loss + conditioning",
      targetCalories: "2100"
    });

    expect(plan.days.map((day) => day.trainingDay)).toEqual([true, false]);
    expect(plan.days.map((day) => day.calories)).toEqual([2100, 1850]);
  });
});
