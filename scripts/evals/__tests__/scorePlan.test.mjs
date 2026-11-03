import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PROFILES } from "../profiles.mjs";
import { scorePlan } from "../scorePlan.mjs";

// The plan-quality scorer. The eight saved plans are real /api/generate answers
// for the first eight profiles (docs/specs/2026-11-03-plan-quality-evals-design.md,
// "What was found"); the rest are plans built to have one property each.

const fixtureDir = new URL(
  "../../../server/src/services/dashboard/__tests__/fixtures/plans/",
  import.meta.url
);
const readFixture = (name) => readFileSync(new URL(`${name}.txt`, fixtureDir), "utf8");
const profileNamed = (name) => PROFILES.find((profile) => profile.name === name);

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// A plan that trains on `training` weekdays and rests on the rest, in `order`,
// with coach notes unless `notes` is false, and `extra` lines on Monday.
const buildPlan = ({ training = [], order = WEEKDAYS, notes = true, extra = [] } = {}) =>
  [
    ...order.flatMap((weekday) => [
      weekday,
      ...(training.includes(weekday) ? ["Main lifts:", "- Plank: 3 x 30 seconds"] : ["Rest day."]),
      ...(weekday === "Monday" ? extra : [])
    ]),
    ...(notes ? ["Coach Notes:", "Sleep well."] : [])
  ].join("\n");

const homeProfile = (overrides = {}) => ({
  ...profileNamed("01-home-bodyweight-3d"),
  days: 1,
  ...overrides
});
const ok = (text) => ({ text, finishReason: "STOP" });

describe("the profiles", () => {
  test("are ten, named once each, with every planner field", () => {
    expect(PROFILES).toHaveLength(10);
    expect(new Set(PROFILES.map((profile) => profile.name)).size).toBe(10);
    for (const profile of PROFILES) {
      expect(Object.keys(profile).sort()).toEqual(
        [
          "days",
          "duration",
          "environment",
          "equipment",
          "focuses",
          "goal",
          "injuries",
          "level",
          "name"
        ].sort()
      );
    }
  });

  test("ask for a training-day count that is the number in their name", () => {
    for (const profile of PROFILES) {
      expect(profile.name).toContain(`-${profile.days}d`);
    }
  });
});

describe("scorePlan on the saved plans", () => {
  test.each([
    ["01-home-bodyweight-3d", 0, 0],
    ["02-commercial-full-5d", 0, 0],
    ["03-home-dumbbells-4d-knee", 5, 0],
    ["04-commercial-strength-6d-lowerback", 1, 2],
    ["05-home-bands-2d-shoulder", 0, 0],
    ["06-commercial-cardio-3d", 0, 0],
    ["07-home-kettlebell-7d-wrist", 6, 0],
    ["08-commercial-recovery-1d-hip", 1, 0]
  ])("%s: no break, %i injury hits, %i equipment hits", (name, injury, equipment) => {
    const score = scorePlan(profileNamed(name), ok(readFixture(name)));

    expect(score.structure).toEqual([]);
    expect(score.injuryHits).toHaveLength(injury);
    expect(score.equipmentHits).toHaveLength(equipment);
  });

  test("names the equipment the strength-floor plan lacks", () => {
    const name = "04-commercial-strength-6d-lowerback";
    const score = scorePlan(profileNamed(name), ok(readFixture(name)));

    expect(score.equipmentHits.map((hit) => [hit.weekday, hit.word])).toEqual([
      ["Monday", "band"],
      ["Thursday", "cable"]
    ]);
  });
});

describe("scorePlan's structure breaks", () => {
  test("a well-formed plan has none", () => {
    expect(scorePlan(homeProfile(), ok(buildPlan({ training: ["Monday"] }))).structure).toEqual([]);
  });

  test.each([
    ["failed", { error: "timed out" }],
    ["truncated", { text: buildPlan({ training: ["Monday"] }), finishReason: "MAX_TOKENS" }],
    ["empty", ok(" \n ")],
    ["empty", { finishReason: "STOP" }],
    ["oversized", ok(buildPlan({ training: ["Monday"], extra: ["x".repeat(20000)] }))]
  ])("an outcome that is %s is only that break, with no hits", (expected, outcome) => {
    const score = scorePlan(homeProfile({ injuries: "Knee" }), outcome);

    expect(score.structure).toEqual([expected]);
    expect(score.injuryHits).toEqual([]);
    expect(score.equipmentHits).toEqual([]);
  });

  test("a plan of exactly the route's 20,000 characters is not oversized", () => {
    const base = buildPlan({ training: ["Monday"], extra: ["x"] });
    const text = base.replace("\nx\n", `\n${"x".repeat(20000 - base.length + 1)}\n`);

    expect(text).toHaveLength(20000);
    expect(scorePlan(homeProfile(), ok(text)).structure).toEqual([]);
  });

  test.each([
    ["a weekday is missing", WEEKDAYS.slice(0, 6)],
    ["two weekdays are out of order", ["Tuesday", "Monday", ...WEEKDAYS.slice(2)]],
    ["a weekday appears twice", [...WEEKDAYS, "Sunday"]]
  ])("weekdays, when %s", (_label, order) => {
    expect(
      scorePlan(homeProfile(), ok(buildPlan({ training: ["Monday"], order }))).structure
    ).toEqual(["weekdays"]);
  });

  test("notes, when the plan has no coach notes", () => {
    expect(
      scorePlan(homeProfile(), ok(buildPlan({ training: ["Monday"], notes: false }))).structure
    ).toEqual(["notes"]);
  });

  test.each([
    ["more", ["Monday", "Wednesday"]],
    ["fewer", []]
  ])("training-days, when the plan trains on %s days than asked", (_label, training) => {
    expect(scorePlan(homeProfile(), ok(buildPlan({ training }))).structure).toEqual([
      "training-days"
    ]);
  });

  test("lists every break a plan has", () => {
    const text = buildPlan({ training: [], order: WEEKDAYS.slice(1), notes: false });

    expect(scorePlan(homeProfile(), ok(text)).structure).toEqual([
      "weekdays",
      "notes",
      "training-days"
    ]);
  });
});

describe("scorePlan's equipment hits", () => {
  // The words on one Monday line, scored for a profile with one label.
  const hitsFor = (line, environment, label) =>
    scorePlan(
      homeProfile({ environment, equipment: [label] }),
      ok(buildPlan({ training: ["Monday"], extra: [line] }))
    ).equipmentHits.map((hit) => hit.word);

  test.each([
    [
      "- Barbell back squat: 3 x 5",
      "barbell",
      ["Home", "Dumbbells"],
      ["Commercial", "Strength floor"]
    ],
    [
      "- BB rows: 3 x 8",
      "barbell",
      ["Commercial", "Cardio deck"],
      ["Commercial", "Full gym access"]
    ],
    ["- DB rows: 3 x 10", "dumbbell", ["Home", "Kettlebell"], ["Home", "Dumbbells"]],
    [
      "- Dumbbells to the floor",
      "dumbbell",
      ["Commercial", "Cardio deck"],
      ["Commercial", "Group class studio"]
    ],
    ["- KB swings: 3 x 15", "kettlebell", ["Home", "Dumbbells"], ["Home", "Kettlebell"]],
    [
      "- Kettlebell goblet hold",
      "kettlebell",
      ["Commercial", "Cardio deck"],
      ["Commercial", "Functional training zone"]
    ],
    ["- Bench dips: 3 x 12", "bench", ["Home", "Dumbbells"], ["Home", "Adjustable bench"]],
    ["- Banded pull-aparts: 2 x 15", "band", ["Home", "Kettlebell"], ["Home", "Resistance bands"]],
    [
      "- Band walks",
      "band",
      ["Commercial", "Strength floor"],
      ["Commercial", "Recovery & mobility zone"]
    ],
    ["- Chin-ups: 3 x 5", "pull-up", ["Home", "Dumbbells"], ["Home", "Pull-up bar"]],
    [
      "- Hanging knee raises",
      "pull-up",
      ["Commercial", "Cardio deck"],
      ["Commercial", "Functional training zone"]
    ],
    [
      "- Pull-ups: 3 x max",
      "pull-up",
      ["Commercial", "Pool / aquatic center"],
      ["Commercial", "Strength floor"]
    ],
    [
      "- Cable flyes: 3 x 12",
      "cable",
      ["Commercial", "Strength floor"],
      ["Commercial", "Functional training zone"]
    ],
    [
      "- Smith squats: 3 x 8",
      "machine",
      ["Commercial", "Functional training zone"],
      ["Commercial", "Strength floor"]
    ],
    ["- Leg press: 3 x 10", "machine", ["Home", "Dumbbells"], ["Commercial", "Full gym access"]],
    [
      "- Chest-supported machine row",
      "machine",
      ["Commercial", "Cardio deck"],
      ["Commercial", "Strength floor"]
    ],
    [
      "- Treadmill intervals",
      "cardio machine",
      ["Commercial", "Strength floor"],
      ["Commercial", "Cardio deck"]
    ],
    [
      "- Assault bike sprints",
      "cardio machine",
      ["Home", "Kettlebell"],
      ["Commercial", "Cardio deck"]
    ],
    [
      "- Erg: 2,000 m",
      "cardio machine",
      ["Commercial", "Functional training zone"],
      ["Commercial", "Full gym access"]
    ],
    [
      "- Pool laps: 10 minutes",
      "pool",
      ["Commercial", "Cardio deck"],
      ["Commercial", "Pool / aquatic center"]
    ],
    ["- Aquatic jogging", "pool", ["Home", "Yoga mat"], ["Commercial", "Full gym access"]]
  ])("%s is a %s hit without a supplier, and none with one", (line, word, without, withIt) => {
    expect(hitsFor(line, ...without)).toEqual([word]);
    expect(hitsFor(line, ...withIt)).toEqual([]);
  });

  test("a rowing machine is cardio equipment, not a machine", () => {
    expect(hitsFor("- Rowing machine: 500 m", "Commercial", "Strength floor")).toEqual([
      "cardio machine"
    ]);
  });

  test("matches whole words in any case", () => {
    expect(hitsFor("- BARBELL hip thrust", "Home", "Dumbbells")).toEqual(["barbell"]);
    expect(hitsFor("- Doorbell drill, dbx tempo", "Home", "Bodyweight only")).toEqual([]);
  });

  test("never counts bodyweight work or a mat", () => {
    expect(hitsFor("- Bodyweight squats on a mat", "Home", "Bodyweight only")).toEqual([]);
  });

  test("counts each word a line names once", () => {
    expect(
      hitsFor("- Barbell or dumbbell bench press, barbell again", "Home", "Bodyweight only")
    ).toEqual(["barbell", "dumbbell", "bench"]);
  });

  test("full gym access supplies every word", () => {
    expect(
      hitsFor(
        "- Barbell, DB, KB, bench, band, pull-up, cable, machine, treadmill, pool",
        "Commercial",
        "Full gym access"
      )
    ).toEqual([]);
  });
});

describe("scorePlan's injury hits", () => {
  const hitsFor = (lines, injuries) =>
    scorePlan(
      homeProfile({ injuries }),
      ok(buildPlan({ training: ["Monday"], extra: lines }))
    ).injuryHits.map((hit) => hit.injury);

  test("a line with two keywords of one injury is one hit", () => {
    expect(hitsFor(["- Squat to reverse lunge: 3 x 8"], "Knee")).toEqual(["knee"]);
  });

  test("a line risky for two flagged injuries is a hit for each", () => {
    expect(hitsFor(["- DB curl to press: 3 x 10"], "Wrist/Elbow")).toEqual(["wrist", "elbow"]);
  });

  test("each line counts on its own", () => {
    expect(hitsFor(["- Lunges: 3 x 10", "- Jump squats: 3 x 8"], "Knee")).toEqual(["knee", "knee"]);
  });

  test("a keyword inside a longer word counts, as the Guides view counts it", () => {
    expect(hitsFor(["- Overhead pressing: 3 x 8"], "Shoulder")).toEqual(["shoulder"]);
  });

  test("no injury means no hits", () => {
    expect(hitsFor(["- Jump lunges: 3 x 8"], "None")).toEqual([]);
  });

  test("a rest day's lines count too", () => {
    const text = buildPlan({ training: ["Tuesday"] }).replace(
      "Sunday\nRest day.",
      "Sunday\nRest day.\n- Optional: easy jump rope"
    );
    const score = scorePlan(homeProfile({ injuries: "Knee" }), ok(text));

    expect(score.injuryHits.map((hit) => hit.weekday)).toEqual(["Sunday"]);
  });
});
