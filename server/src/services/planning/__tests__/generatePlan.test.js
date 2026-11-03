import { describe, expect, test } from "vitest";
import { generatePlan, readInput } from "../generatePlan.js";
import { buildPlanPayload } from "../../dashboard/planPayloadService.js";
import { isRestDay } from "../../../../../client/src/app/plans.js";

// The rule-based plan generator. Each describe block is one step of the spec
// (docs/specs/2026-11-03-rule-based-plans-design.md, "The generator"), with its
// tables as cases. scripts/evals/__tests__/generatePlan.gate.test.mjs checks the
// invariants across every combination of planner answers.

const input = (overrides = {}) => ({
  goal: "Build lean strength and energy",
  environment: "Home",
  equipment: ["Dumbbells", "Adjustable bench"],
  level: "Intermediate",
  days: 3,
  duration: 45,
  injuries: "None",
  focuses: [],
  health: {},
  age: null,
  ...overrides
});

const trainingDays = (overrides) => generatePlan(input(overrides)).week.filter((d) => d.type);
const dayLines = (text, weekday) => {
  const days = buildPlanPayload(text).days;
  return days.find((day) => day.weekday === weekday)?.lines ?? [];
};

describe("step 1: reading the input", () => {
  test.each([
    ["Build lean strength and energy", "lean"],
    ["Fat loss + conditioning", "fat-loss"],
    ["Mobility", "mobility"],
    ["Recovery", "recovery"],
    ["Cardio", "cardio"],
    ["Lose some fat before summer", "fat-loss"],
    ["Weight loss", "fat-loss"],
    ["Train for a half marathon run", "cardio"],
    ["Build endurance", "cardio"],
    ["Get my mobility back", "mobility"],
    ["Recovery after surgery", "recovery"],
    ["Get stronger", "lean"],
    ["", "lean"]
  ])("reads the goal %j as the %s track", (goal, track) => {
    expect(readInput(input({ goal })).track).toBe(track);
  });

  test("a Strength focus on the lean track is the strength focus", () => {
    expect(readInput(input({ focuses: ["Strength"] })).strengthFocus).toBe(true);
    expect(readInput(input({ goal: "Cardio", focuses: ["Strength"] })).strengthFocus).toBe(false);
    expect(readInput(input()).strengthFocus).toBe(false);
  });

  test.each([
    ["Beginner", "beginner"],
    ["advanced", "advanced"],
    [" INTERMEDIATE ", "intermediate"],
    ["Expert", "intermediate"],
    ["", "intermediate"]
  ])("reads the level %j as %s", (level, expected) => {
    expect(readInput(input({ level })).level).toBe(expected);
  });

  test("reads the areas from the injuries answer, and pregnancy from the screen", () => {
    expect(readInput(input({ injuries: "Wrist/Elbow" })).areas).toEqual(["wrist", "elbow"]);
    expect(readInput(input({ health: { pregnant: true } })).areas).toEqual(["pregnancy"]);
    expect(readInput(input()).areas).toEqual([]);
  });

  test.each([["condition"], ["symptoms"], ["supervised"], ["pregnant"]])(
    "a yes to %s is light-to-moderate mode",
    (question) => {
      expect(readInput(input({ health: { [question]: true } })).lightMode).toBe(true);
    }
  );

  test("no yes, or no screen at all, is not light-to-moderate mode", () => {
    expect(readInput(input({ health: { condition: false } })).lightMode).toBe(false);
    expect(readInput(input({ health: undefined })).lightMode).toBe(false);
  });

  test.each([
    [65, true],
    [80, true],
    [64, false],
    [null, false],
    [undefined, false]
  ])("an age of %j is an older adult: %s", (age, older) => {
    expect(readInput(input({ age })).olderAdult).toBe(older);
  });

  test("reads the capabilities the labels supply", () => {
    expect(readInput(input()).capabilities).toEqual(["dumbbell", "bench"]);
  });
});

describe("step 2: the training weekdays", () => {
  test.each([
    [1, ["Wednesday"]],
    [2, ["Monday", "Thursday"]],
    [3, ["Monday", "Wednesday", "Friday"]],
    [4, ["Monday", "Tuesday", "Thursday", "Friday"]],
    [5, ["Monday", "Tuesday", "Wednesday", "Friday", "Saturday"]],
    [6, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]],
    [7, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]]
  ])("%i days train on %j", (days, weekdays) => {
    expect(trainingDays({ days }).map((day) => day.weekday)).toEqual(weekdays);
  });

  test("the week always has seven days, Monday first", () => {
    expect(generatePlan(input()).week.map((day) => day.weekday)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ]);
  });
});

describe("step 3: the day types", () => {
  const SEQUENCES = {
    "lean, intermediate": [
      { goal: "Build lean strength and energy", level: "Intermediate" },
      ["FB", "FB FB", "FB FB FB", "U L U L", "U L C U L", "P PL LG P PL LG", "P PL LG P PL LG M"]
    ],
    "lean, advanced": [
      { goal: "Build lean strength and energy", level: "Advanced" },
      ["FB", "FB FB", "FB FB FB", "U L U L", "U L C U L", "P PL LG P PL LG", "P PL LG P PL LG M"]
    ],
    "lean, beginner": [
      { goal: "Build lean strength and energy", level: "Beginner" },
      ["FB", "FB FB", "FB FB FB", "U L U L", "FB C FB FB M", "FB C FB E FB M", "FB C FB E FB M E"]
    ],
    "fat loss, intermediate": [
      { goal: "Fat loss + conditioning", level: "Intermediate" },
      ["FB", "FB FB", "FB FB FB", "U L C FB", "U L C U L", "U L C U L C", "U L C U L C M"]
    ],
    "fat loss, beginner": [
      { goal: "Fat loss + conditioning", level: "Beginner" },
      ["FB", "FB FB", "FB FB FB", "FB C FB C", "FB C FB C FB", "FB C FB C FB M", "FB C FB C FB M E"]
    ],
    cardio: [
      { goal: "Cardio", level: "Beginner" },
      [
        "FB",
        "FB FB",
        "FB C FB",
        "FB C FB C",
        "FB C FB C LC",
        "FB C FB C FB LC",
        "FB C FB C FB LC M"
      ]
    ],
    mobility: [
      { goal: "Mobility", level: "Advanced" },
      ["FB", "FB FB", "FB M FB", "FB M FB M", "FB M FB M M", "FB M FB M FB M", "FB M FB M FB M M"]
    ],
    recovery: [
      { goal: "Recovery", level: "Intermediate" },
      ["FB", "FB FB", "FB E FB", "FB E FB M", "FB E FB M E", "FB E FB M FB E", "FB E FB M FB E M"]
    ]
  };

  test.each(
    Object.entries(SEQUENCES).flatMap(([label, [overrides, rows]]) =>
      rows.map((row, index) => [label, index + 1, row, overrides])
    )
  )("%s, %i days: %s", (_label, days, row, overrides) => {
    expect(trainingDays({ ...overrides, days }).map((day) => day.type)).toEqual(row.split(" "));
  });

  test("the strength focus uses lean strength's sequences", () => {
    expect(trainingDays({ days: 6, focuses: ["Strength"] }).map((d) => d.type)).toEqual(
      "P PL LG P PL LG".split(" ")
    );
  });

  const FOCUS = [
    [{ level: "Intermediate" }, 3, "FB FB M"],
    [{ level: "Intermediate" }, 4, "U L FB M"],
    [{ level: "Intermediate" }, 5, "U L C FB M"],
    [{ level: "Intermediate" }, 6, "U L C U L M"],
    [{ level: "Beginner" }, 3, "FB FB M"],
    [{ level: "Beginner" }, 4, "U L FB M"],
    [{ level: "Beginner" }, 5, "FB C FB FB M"],
    [{ level: "Beginner" }, 6, "FB C FB E FB M"],
    [{ goal: "Fat loss + conditioning", level: "Advanced" }, 3, "FB FB M"],
    [{ goal: "Fat loss + conditioning", level: "Advanced" }, 4, "FB C FB M"],
    [{ goal: "Fat loss + conditioning", level: "Advanced" }, 5, "U L C FB M"],
    [{ goal: "Fat loss + conditioning", level: "Advanced" }, 6, "U L C U L M"],
    [{ goal: "Fat loss + conditioning", level: "Beginner" }, 3, "FB FB M"],
    [{ goal: "Fat loss + conditioning", level: "Beginner" }, 4, "FB C FB M"],
    [{ goal: "Fat loss + conditioning", level: "Beginner" }, 5, "FB C FB M FB"],
    [{ goal: "Fat loss + conditioning", level: "Beginner" }, 6, "FB C FB C FB M"],
    [{ goal: "Cardio" }, 3, "FB C FB"],
    [{ goal: "Cardio" }, 4, "FB C FB M"],
    [{ goal: "Cardio" }, 5, "FB C FB M LC"],
    [{ goal: "Cardio" }, 6, "FB C FB M FB LC"],
    [{ level: "Intermediate" }, 7, "P PL LG P PL LG M"],
    [{ level: "Intermediate" }, 2, "FB FB"]
  ];

  test.each(FOCUS)("a Mobility focus with %j at %i days: %s", (overrides, days, row) => {
    expect(trainingDays({ ...overrides, days, focuses: ["Mobility"] }).map((d) => d.type)).toEqual(
      row.split(" ")
    );
  });

  test("a Recovery focus works as a Mobility focus does", () => {
    expect(trainingDays({ days: 4, focuses: ["Recovery"] }).map((d) => d.type)).toEqual(
      "U L FB M".split(" ")
    );
  });

  test("where the focus leaves the sequence, strength days end with stretches", () => {
    const plan = generatePlan(input({ days: 2, focuses: ["Mobility"] }));
    expect(dayLines(plan.text, "Monday").some((line) => /^- .*stretch/i.test(line))).toBe(true);
    const plain = generatePlan(input({ days: 2 }));
    expect(dayLines(plain.text, "Monday").some((line) => /^- .*stretch/i.test(line))).toBe(false);
  });

  test("full-body days alternate A and B", () => {
    expect(trainingDays({ days: 3 }).map((day) => day.title)).toEqual([
      "Full body A",
      "Full body B",
      "Full body A"
    ]);
  });
});

describe("step 4: the slots and the session's length", () => {
  const exercisesOn = (overrides, weekday = "Monday") =>
    generatePlan(input(overrides)).week.find((day) => day.weekday === weekday).exercises;

  test("a full-body day puts a leg, a push, a hinge and a pull first", () => {
    expect(exercisesOn({}).map((e) => e.pattern)).toEqual([
      "squat",
      "horizontal-push",
      "hinge",
      "horizontal-pull"
    ]);
  });

  test.each([
    [15, 4, true],
    [30, 4, true],
    [44, 4, false],
    [45, 4, false],
    [60, 6, false],
    [90, 8, false],
    [180, 8, false]
  ])("a %i-minute lean session holds %i exercises, supersets %s", (duration, count, paired) => {
    const day = generatePlan(input({ duration })).week[0];
    expect(day.exercises).toHaveLength(count);
    expect(day.supersets).toBe(paired);
  });

  test("the strength focus fills fewer, longer slots", () => {
    expect(exercisesOn({ duration: 60, focuses: ["Strength"] })).toHaveLength(4);
    expect(exercisesOn({ duration: 90, focuses: ["Strength"] })).toHaveLength(7);
  });

  test("fat loss fills more, shorter slots", () => {
    expect(exercisesOn({ duration: 60, goal: "Fat loss + conditioning" })).toHaveLength(8);
  });

  test("other strength days hold at least three", () => {
    const day = generatePlan(input({ days: 4, duration: 15 })).week[0];
    expect(day.type).toBe("U");
    expect(day.exercises).toHaveLength(3);
  });

  test("supersets are written in pairs", () => {
    const lines = dayLines(generatePlan(input({ duration: 30 })).text, "Monday");
    expect(lines.filter((line) => /^- A[12]\. /.test(line))).toHaveLength(2);
    expect(lines.filter((line) => /^- B[12]\. /.test(line))).toHaveLength(2);
  });

  test("past the slot list, it repeats from the top", () => {
    const day = generatePlan(input({ days: 4, duration: 180 })).week[1];
    expect(day.type).toBe("L");
    expect(day.exercises.map((e) => e.pattern)).toEqual([
      "squat",
      "hinge",
      "single-leg",
      "glutes-calves",
      "core",
      "squat",
      "hinge",
      "single-leg"
    ]);
  });

  test("an older adult gets balance work on full-body days, whatever the length", () => {
    const patterns = exercisesOn({ age: 70, duration: 30 }).map((e) => e.pattern);
    expect(patterns).toContain("balance");
    expect(exercisesOn({ duration: 30 }).map((e) => e.pattern)).not.toContain("balance");
  });

  test("a mobility day holds mobility, balance and core work", () => {
    const day = generatePlan(input({ goal: "Mobility", days: 3 })).week[2];
    expect(day.type).toBe("M");
    expect(day.exercises.map((e) => e.pattern)).toEqual(
      expect.arrayContaining(["mobility", "balance", "core"])
    );
  });
});

describe("step 5: choosing an exercise", () => {
  const ex = (id, pattern, needs = [], level = "beginner", extra = {}) => ({
    id,
    name: id.replace(/-/g, " "),
    pattern,
    needs,
    level,
    flags: {},
    regressions: {},
    supine: false,
    ...extra
  });
  const fill = (pattern, prefix) => [ex(`${prefix}-a`, pattern), ex(`${prefix}-b`, pattern)];
  const base = [
    ...fill("horizontal-push", "push"),
    ...fill("hinge", "hinge"),
    ...fill("horizontal-pull", "pull"),
    ...fill("single-leg", "leg"),
    ...fill("core", "core"),
    ...fill("arms", "arm"),
    ...fill("conditioning", "cond").map((e) => ({ ...e, impact: "low" })),
    ...fill("balance", "bal"),
    ...fill("mobility", "mob")
  ];
  const firstSquat = (squats, overrides = {}) =>
    generatePlan(input({ days: 1, ...overrides }), [...squats, ...base]).week[2].exercises[0];

  test("skips an entry that needs equipment the input lacks", () => {
    const squats = [ex("barbell-squat", "squat", ["barbell"]), ex("goblet", "squat", ["dumbbell"])];
    expect(firstSquat(squats).id).toBe("goblet");
  });

  test("skips an entry above the input's level", () => {
    const squats = [ex("hard", "squat", [], "advanced"), ex("easy", "squat")];
    expect(firstSquat(squats).id).toBe("easy");
    expect(firstSquat(squats, { level: "Advanced" }).id).toBe("hard");
  });

  test("skips an entry that is avoid for an area", () => {
    const squats = [
      ex("jumpy", "squat", [], "beginner", { flags: { knee: "avoid" } }),
      ex("calm", "squat")
    ];
    expect(firstSquat(squats, { injuries: "Knee" }).id).toBe("calm");
    expect(firstSquat(squats).id).toBe("jumpy");
  });

  test("replaces a modify entry with its regression, with the cue", () => {
    const squats = [
      ex("deep", "squat", [], "beginner", {
        flags: { knee: "modify" },
        regressions: { knee: { id: "box", cue: "use a box" } }
      }),
      ex("box", "squat"),
      ex("other", "squat")
    ];
    const chosen = firstSquat(squats, { injuries: "Knee" });
    expect(chosen).toMatchObject({ id: "box", cue: "use a box", area: "knee", regressed: true });
  });

  test("skips a modify entry whose regression another area rules out", () => {
    const squats = [
      ex("deep", "squat", [], "beginner", {
        flags: { knee: "modify" },
        regressions: { knee: { id: "box", cue: "use a box" } }
      }),
      ex("box", "squat", [], "beginner", { flags: { hip: "avoid" } }),
      ex("wall", "squat")
    ];
    expect(firstSquat(squats, { injuries: "knee and hip" }).id).toBe("wall");
  });

  test("prefers an entry not used yet this week", () => {
    const squats = [ex("first", "squat"), ex("second", "squat")];
    const plan = generatePlan(input({ days: 2 }), [...squats, ...base]);
    expect(plan.week[0].exercises[0].id).toBe("first");
    expect(plan.week[3].exercises[0].id).toBe("second");
  });

  test("reuses an entry when nothing else fits", () => {
    const plan = generatePlan(input({ days: 2 }), [ex("only", "squat"), ...base]);
    expect(plan.week[3].exercises[0].id).toBe("only");
  });

  test("leaves a slot out when nothing fits, and the next slot takes its place", () => {
    const plan = generatePlan(input({ days: 1 }), base);
    const day = plan.week[2];
    expect(day.skipped).toContain("squat");
    expect(day.exercises.map((e) => e.pattern)).not.toContain("squat");
    expect(day.exercises).toHaveLength(4);
  });

  test("takes only low-impact conditioning for the knee, the hip and pregnancy", () => {
    const library = [
      ...base.filter((e) => e.pattern !== "conditioning"),
      ex("squat-a", "squat"),
      ex("hops", "conditioning", [], "beginner", { impact: "high" }),
      ex("steps", "conditioning", [], "beginner", { impact: "low" })
    ];
    const finisher = (overrides) =>
      generatePlan(input({ days: 1, ...overrides }), library).week[2].finisher.id;
    expect(finisher({})).toBe("hops");
    expect(finisher({ injuries: "Knee" })).toBe("steps");
    expect(finisher({ health: { pregnant: true } })).toBe("steps");
  });
});

describe("step 6: the prescription", () => {
  const main = (overrides) =>
    dayLines(generatePlan(input(overrides)).text, overrides.weekday ?? "Monday");
  const lineAfter = (lines, heading) => lines[lines.indexOf(heading) + 1];

  test.each([
    [{}, "3 x 8-10 (Rest 90s, stop 2 reps short of failure)"],
    [{ level: "Beginner" }, "2 x 8-10 (Rest 90s, stop 3 reps short of failure)"],
    [{ level: "Advanced" }, "4 x 8-10 (Rest 90s, stop 2 reps short of failure)"],
    [{ focuses: ["Strength"] }, "3 x 5 (Rest 150-180s, stop 2 reps short of failure)"],
    [
      { focuses: ["Strength"], level: "Advanced" },
      "4 x 5 (Rest 150-180s, stop 2 reps short of failure)"
    ],
    [
      { focuses: ["Strength"], level: "Beginner" },
      "2 x 8-10 (Rest 90s, stop 3 reps short of failure)"
    ],
    [{ goal: "Fat loss + conditioning" }, "3 x 8-12 (Rest 90s, stop 2 reps short of failure)"],
    [{ goal: "Cardio" }, "2 x 6-10 (Rest 90s, stop 3 reps short of failure)"],
    [{ goal: "Cardio", level: "Beginner" }, "2 x 8-10 (Rest 90s, stop 3 reps short of failure)"],
    [{ goal: "Cardio", level: "Advanced" }, "3 x 6-10 (Rest 90s, stop 3 reps short of failure)"],
    [
      { goal: "Mobility" },
      "2 x 10-12 (Rest 60s, full range with a 3-second lowering, stop 3 reps short of failure)"
    ],
    [{ health: { condition: true } }, "3 x 8-10 (Rest 90s, stop 3 reps short of failure)"],
    [
      { health: { symptoms: true }, focuses: ["Strength"] },
      "3 x 8-10 (Rest 90s, stop 3 reps short of failure)"
    ],
    [{ days: 1, weekday: "Wednesday" }, "4 x 8-10 (Rest 90s, stop 2 reps short of failure)"],
    [
      { days: 1, weekday: "Wednesday", level: "Beginner" },
      "3 x 8-10 (Rest 90s, stop 3 reps short of failure)"
    ]
  ])("%j writes the first main lift as %s", (overrides, prescription) => {
    expect(lineAfter(main(overrides), "Main lifts:")).toMatch(
      new RegExp(`: ${prescription.replace(/[()]/g, "\\$&")}$`)
    );
  });

  test.each([
    [{}, "3 x 10-12 (Rest 60-90s, stop 1-2 reps short of failure)"],
    [{ level: "Beginner" }, "2 x 10-12 (Rest 60-90s, stop 3 reps short of failure)"],
    [{ focuses: ["Strength"] }, "3 x 8-10 (Rest 90s, stop 1-2 reps short of failure)"],
    [
      { goal: "Fat loss + conditioning" },
      "3 x 12-15 (Rest 45-60s, stop 1-2 reps short of failure)"
    ],
    [{ goal: "Cardio" }, "2 x 10-12 (Rest 60s, stop 2 reps short of failure)"]
  ])("%j writes the first accessory as %s", (overrides, prescription) => {
    expect(lineAfter(main(overrides), "Accessories:")).toMatch(
      new RegExp(`: ${prescription.replace(/[()]/g, "\\$&")}$`)
    );
  });

  test("a regressed main lift takes the accessory prescription, with its cue", () => {
    const lines = main({ injuries: "Knee" });
    expect(lineAfter(lines, "Main lifts:")).toBe(
      "- Dumbbell box squat: 3 x 10-12 (Rest 60-90s, stop 1-2 reps short of failure; knee: sit back to a box at a height that stays comfortable)"
    );
  });

  test("a wall sit is held, not repeated", () => {
    const plan = generatePlan(
      input({ equipment: ["Bodyweight only"], injuries: "Knee", level: "Beginner", duration: 30 })
    );
    const line = plan.text.split("\n").find((text) => text.includes("Wall sit"));
    expect(line).toMatch(/: 2 x 30-45 seconds \(Rest 60s\)$/);
  });

  test("core holds and stretches have their own doses", () => {
    const lines = dayLines(generatePlan(input({ goal: "Mobility", days: 3 })).text, "Wednesday");
    expect(lines.some((line) => /: 2 x 30 seconds( a side)?$/.test(line))).toBe(true);
    const older = dayLines(
      generatePlan(input({ goal: "Mobility", days: 3, age: 70 })).text,
      "Wednesday"
    );
    expect(older.some((line) => /: 2 x 45 seconds( a side)?$/.test(line))).toBe(true);
    expect(older.some((line) => /: 3 x 20-30 seconds a side$/.test(line))).toBe(true);
  });
});

describe("step 7: conditioning", () => {
  const hardDays = (overrides) =>
    generatePlan(input(overrides))
      .week.filter((day) => day.hard)
      .map((day) => day.weekday);

  test("a beginner gets at most two hard sessions", () => {
    expect(
      hardDays({ goal: "Fat loss + conditioning", level: "Beginner", days: 6 }).length
    ).toBeLessThanOrEqual(2);
  });

  test("anyone else gets at most three, never on consecutive days", () => {
    const days = hardDays({ goal: "Fat loss + conditioning", days: 7 });
    expect(days.length).toBeLessThanOrEqual(3);
    const order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const indexes = days.map((day) => order.indexOf(day));
    for (const [i, index] of indexes.entries()) {
      const next = indexes[(i + 1) % indexes.length];
      if (indexes.length > 1) expect((next - index + 7) % 7).not.toBe(1);
    }
  });

  test("a conditioning day opens with the level's interval block", () => {
    const lines = (level) =>
      dayLines(generatePlan(input({ goal: "Cardio", days: 3, level })).text, "Wednesday");
    expect(lines("Beginner").join("\n")).toMatch(/8 x 30 seconds hard, 60 seconds easy/);
    expect(lines("Intermediate").join("\n")).toMatch(/10 x 1 minute hard, 1 minute easy/);
    expect(lines("Advanced").join("\n")).toMatch(/4 x 4 minutes hard, 3 minutes easy/);
  });

  test("intervals never say Tabata, and say the effort", () => {
    const text = generatePlan(input({ goal: "Cardio", days: 3 })).text;
    expect(text).not.toMatch(/tabata/i);
    expect(text).toMatch(/effort 7-9 out of 10/);
  });

  test("light-to-moderate mode has no hard sessions", () => {
    expect(
      hardDays({ goal: "Fat loss + conditioning", days: 6, health: { supervised: true } })
    ).toEqual([]);
    const text = generatePlan(input({ goal: "Cardio", days: 3, health: { condition: true } })).text;
    expect(text).not.toMatch(/ hard,/);
  });

  test("a cardio-track strength day opens with its cardio block", () => {
    const lines = dayLines(
      generatePlan(input({ goal: "Cardio", days: 3, duration: 60 })).text,
      "Monday"
    );
    expect(lines[lines.indexOf("Cardio block:") + 1]).toMatch(
      /: 20 minutes at a steady pace you can talk at$/
    );
    expect(lines.indexOf("Cardio block:")).toBeLessThan(lines.indexOf("Main lifts:"));
  });

  test("the cardio block is capped at half the session after the warm-up", () => {
    const lines = dayLines(
      generatePlan(input({ goal: "Cardio", days: 3, duration: 15 })).text,
      "Monday"
    );
    expect(lines[lines.indexOf("Cardio block:") + 1]).toMatch(/: 5 minutes at a steady pace/);
  });
});

describe("step 8: writing the day", () => {
  test("writes the spec's format for a full-body day", () => {
    const lines = dayLines(generatePlan(input()).text, "Monday");
    expect(lines).toEqual([
      "Warmup: 8 minutes - easy cardio to raise your temperature, then arm circles, hip circles and leg swings.",
      "- Ramp-up: Dumbbell goblet squat x 8 at about half your working weight, x 4 at about 70%.",
      "Main lifts:",
      "- Dumbbell goblet squat: 3 x 8-10 (Rest 90s, stop 2 reps short of failure)",
      "- Dumbbell bench press: 3 x 8-10 (Rest 90s, stop 2 reps short of failure)",
      "Accessories:",
      "- Dumbbell Romanian deadlift: 3 x 10-12 (Rest 60-90s, stop 1-2 reps short of failure)",
      "- Chest-supported dumbbell row: 3 x 10-12 (Rest 60-90s, stop 1-2 reps short of failure)",
      "Finisher/conditioning:",
      "- Brisk walk: 5 minutes at a steady pace you can talk at"
    ]);
  });

  test("headings name the weekday and the day type", () => {
    const days = buildPlanPayload(generatePlan(input()).text).days;
    expect(days.map((day) => day.title)).toEqual([
      "Monday - Full body A",
      "Tuesday",
      "Wednesday - Full body B",
      "Thursday",
      "Friday - Full body A",
      "Saturday",
      "Sunday"
    ]);
  });

  test("ramp-up sets come before a loaded lift only", () => {
    const text = generatePlan(input({ equipment: ["Bodyweight only"] })).text;
    expect(text).not.toMatch(/Ramp-up/);
    const strong = dayLines(generatePlan(input({ focuses: ["Strength"] })).text, "Monday");
    expect(strong[1]).toBe(
      "- Ramp-up: Dumbbell goblet squat x 8 at about half your working weight, x 4 at about 70%, x 1-2 at about 85-90%."
    );
  });

  test.each([
    [1, "Wednesday"],
    [2, "Monday"],
    [3, "Monday"],
    [4, "Monday"],
    [5, "Monday"],
    [6, "Monday"],
    [7, "Monday"]
  ])("a %i-day plan has exactly that many training days by isRestDay", (days) => {
    for (const goal of [
      "Build lean strength and energy",
      "Fat loss + conditioning",
      "Cardio",
      "Mobility",
      "Recovery"
    ]) {
      const parsed = buildPlanPayload(generatePlan(input({ days, goal })).text).days;
      expect(parsed).toHaveLength(7);
      expect(parsed.filter((day) => !isRestDay(day.lines))).toHaveLength(days);
    }
  });

  test("the same input gives the same plan", () => {
    expect(generatePlan(input({ days: 5, injuries: "Knee" })).text).toBe(
      generatePlan(input({ days: 5, injuries: "Knee" })).text
    );
  });
});

describe("step 9: rest days and the weekly target", () => {
  test("walks close the gap to the track's target, with one rest day optional", () => {
    const plan = generatePlan(input());
    expect(dayLines(plan.text, "Tuesday")).toEqual([
      "Rest day. Brisk walk 45 minutes: you can talk but not sing (about 100 steps a minute)."
    ]);
    expect(dayLines(plan.text, "Sunday")).toEqual(["Rest day. Optional: a 20-minute easy walk."]);
    expect(plan.aerobicMinutes).toBeGreaterThanOrEqual(150);
  });

  test("fat loss aims higher", () => {
    expect(generatePlan(input({ goal: "Fat loss + conditioning" })).aerobicTarget).toBe(225);
    expect(generatePlan(input({ goal: "Cardio" })).aerobicTarget).toBe(200);
    expect(generatePlan(input({ goal: "Mobility" })).aerobicTarget).toBe(150);
  });

  test("a one-day plan walks on most of its rest days", () => {
    const plan = generatePlan(input({ days: 1 }));
    const walks = plan.week.filter((day) => day.walkMinutes);
    expect(walks.length).toBeGreaterThanOrEqual(3);
    expect(plan.aerobicMinutes).toBeGreaterThanOrEqual(150);
  });

  test("walks are 20 to 60 minutes, in steps of 5", () => {
    for (const days of [1, 2, 3, 4, 5, 6]) {
      for (const day of generatePlan(input({ days, goal: "Fat loss + conditioning" })).week) {
        if (!day.walkMinutes) continue;
        expect(day.walkMinutes % 5).toBe(0);
        expect(day.walkMinutes).toBeGreaterThanOrEqual(20);
        expect(day.walkMinutes).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe("the edges", () => {
  const ex = (id, pattern, extra = {}) => ({
    id,
    name: id.replace(/-/g, " "),
    pattern,
    needs: [],
    level: "beginner",
    flags: {},
    regressions: {},
    supine: false,
    ...extra
  });
  const strengthOnly = [
    ex("squat-a", "squat"),
    ex("push-a", "horizontal-push"),
    ex("hinge-a", "hinge"),
    ex("pull-a", "horizontal-pull"),
    ex("leg-a", "single-leg"),
    ex("core-a", "core")
  ];

  test("reads missing or unusable fields as the route's defaults", () => {
    const rules = readInput({ goal: 7, focuses: "Strength", days: undefined, duration: "x" });
    expect(rules).toMatchObject({ track: "lean", strengthFocus: false, days: 3, minutes: 45 });
  });

  test("a day the library has no conditioning or balance for is still written", () => {
    const plan = generatePlan(input({ goal: "Cardio", days: 3, age: 70 }), strengthOnly);
    const wednesday = plan.week[2];
    expect(wednesday.type).toBe("C");
    // No conditioning entry fits, so the day's core slot is reused for its
    // second accessory: an entry is repeated only when nothing else fits.
    expect(wednesday.exercises.map((e) => e.id)).toEqual(["core-a", "core-a"]);
    expect(plan.week[0].finisher).toBeNull();
    expect(plan.week[0].exercises.map((e) => e.pattern)).not.toContain("balance");
    expect(buildPlanPayload(plan.text).days).toHaveLength(7);
  });

  test("a modify entry whose regression the library lacks is skipped", () => {
    const library = [
      ex("broken", "squat", {
        flags: { knee: "modify" },
        regressions: { knee: { id: "gone", cue: "x" } }
      }),
      ex("fine", "squat"),
      ...strengthOnly.slice(1)
    ];
    expect(
      generatePlan(input({ days: 1, injuries: "Knee" }), library).week[2].exercises[0].id
    ).toBe("fine");
  });

  test("closing stretches stop when the library runs out of them", () => {
    const plan = generatePlan(input({ goal: "Mobility", days: 2 }), strengthOnly);
    expect(plan.week[0].lines.filter((line) => /stretch/i.test(line))).toEqual([]);
  });

  test.each([
    ["forearm-plank", "Beginner", "3 x 10 seconds"],
    ["forearm-plank", "Intermediate", "3 x 20-30 seconds"],
    ["side-plank", "Intermediate", "3 x 20-30 seconds a side"],
    ["forearm-side-plank", "Beginner", "3 x 10 seconds a side"],
    ["hanging-knee-raise", "Intermediate", "3 x 8-12"],
    ["dead-bug", "Beginner", "2 x 8-12 a side"],
    ["dumbbell-suitcase-carry", "Intermediate", "3 x 30 seconds a side"]
  ])("dosing %s for a %s as %s", (id, level, dose) => {
    const core = ex(id, "core", { level: "beginner", name: id });
    const library = [...strengthOnly.filter((e) => e.pattern !== "core"), core];
    const plan = generatePlan(input({ days: 4, level, duration: 180 }), library);
    const line = plan.text.split("\n").find((text) => text.startsWith(`- ${id}:`));
    expect(line).toBe(`- ${id}: ${dose}`);
  });

  test("a conditioning day in light-to-moderate mode is a steady block", () => {
    const lines = dayLines(
      generatePlan(input({ goal: "Cardio", days: 3, health: { condition: true } })).text,
      "Wednesday"
    );
    expect(lines[lines.indexOf("Main lifts:") + 1]).toMatch(
      /: 25 minutes at a steady pace you can talk at$/
    );
  });
});
