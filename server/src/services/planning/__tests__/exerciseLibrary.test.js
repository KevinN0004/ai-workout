import { describe, expect, test } from "vitest";
import {
  AREAS,
  CAPABILITIES,
  EXERCISES,
  LEVELS,
  PATTERNS,
  capabilitiesFor
} from "../exerciseLibrary.js";

// The curated library the rule-based plan generator chooses from, and the
// capabilities each planner label supplies. The rules pinned here are the
// spec's (docs/specs/2026-11-03-rule-based-plans-design.md, "The exercise
// library"); the generator relies on each of them.

const byId = new Map(EXERCISES.map((entry) => [entry.id, entry]));
const isOk = (entry, area) => !entry.flags[area];
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 };

describe("the library's entries", () => {
  test("have unique kebab-case ids", () => {
    const ids = EXERCISES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("have unique names", () => {
    const names = EXERCISES.map((entry) => entry.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  test("hold about 120 entries or more", () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(120);
  });

  test.each(EXERCISES.map((entry) => [entry.id, entry]))(
    "%s draws every field from its list",
    (_id, entry) => {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.trim()).toBe(entry.name);
      expect(PATTERNS).toContain(entry.pattern);
      expect(LEVELS).toContain(entry.level);
      for (const need of entry.needs) expect(CAPABILITIES).toContain(need);
      expect(new Set(entry.needs).size).toBe(entry.needs.length);
      for (const [area, value] of Object.entries(entry.flags)) {
        expect(AREAS).toContain(area);
        expect(["modify", "avoid"]).toContain(value);
      }
      expect(typeof entry.supine).toBe("boolean");
      if (entry.pattern === "conditioning") expect(["high", "low"]).toContain(entry.impact);
      else expect(entry.impact).toBeUndefined();
    }
  );

  test.each(EXERCISES.map((entry) => [entry.id, entry]))(
    "%s has a regression for exactly the areas it marks modify",
    (_id, entry) => {
      const modified = Object.keys(entry.flags).filter((area) => entry.flags[area] === "modify");
      expect(Object.keys(entry.regressions).sort()).toEqual(modified.sort());
    }
  );
});

describe("the regressions", () => {
  const regressions = EXERCISES.flatMap((entry) =>
    Object.entries(entry.regressions).map(([area, regression]) => [
      `${entry.id} for ${area}`,
      entry,
      area,
      regression
    ])
  );

  test("exist", () => {
    expect(regressions.length).toBeGreaterThan(40);
  });

  test.each(regressions)(
    "%s is an entry of the same pattern, ok for the area, needing no more and no harder",
    (_label, entry, area, regression) => {
      const target = byId.get(regression.id);
      expect(target, `no entry ${regression.id}`).toBeDefined();
      expect(target.id).not.toBe(entry.id);
      expect(target.pattern).toBe(entry.pattern);
      expect(isOk(target, area)).toBe(true);
      for (const need of target.needs) expect(entry.needs).toContain(need);
      expect(LEVEL_RANK[target.level]).toBeLessThanOrEqual(LEVEL_RANK[entry.level]);
      expect(typeof regression.cue).toBe("string");
      expect(regression.cue.length).toBeGreaterThan(10);
      expect(regression.cue).toBe(regression.cue.trim());
    }
  );
});

describe("the guarantees", () => {
  // So no combination of areas empties a lower day.
  test.each(
    ["squat", "hinge", "single-leg", "core"].flatMap((pattern) =>
      AREAS.map((area) => [pattern, area])
    )
  )("%s has a bodyweight beginner entry that is ok for %s", (pattern, area) => {
    expect(
      EXERCISES.some(
        (entry) =>
          entry.pattern === pattern &&
          entry.needs.length === 0 &&
          entry.level === "beginner" &&
          isOk(entry, area)
      )
    ).toBe(true);
  });

  test.each(PATTERNS.filter((pattern) => !["vertical-pull", "arms"].includes(pattern)))(
    "%s has a bodyweight beginner entry",
    (pattern) => {
      expect(
        EXERCISES.some(
          (entry) =>
            entry.pattern === pattern && entry.needs.length === 0 && entry.level === "beginner"
        )
      ).toBe(true);
    }
  );

  test("conditioning has a bodyweight low-impact entry that is ok for every area", () => {
    for (const area of AREAS) {
      expect(
        EXERCISES.some(
          (entry) =>
            entry.pattern === "conditioning" &&
            entry.needs.length === 0 &&
            entry.impact === "low" &&
            entry.level === "beginner" &&
            isOk(entry, area)
        ),
        area
      ).toBe(true);
    }
  });
});

describe("the avoid table", () => {
  // The spec's avoid table, as name phrases matched whole and ignoring case.
  // scripts/evals/scorePlan.mjs keeps its own copy for the gate.
  const AVOID_PHRASES = {
    knee: ["jump", "jumps", "jumping", "pistol"],
    "lower back": ["barbell deadlift", "good morning"],
    back: ["barbell deadlift", "good morning"],
    shoulder: ["upright row", "behind-the-neck", "dip", "dips", "snatch", "jerk"],
    wrist: ["dip", "dips", "skull crusher"],
    elbow: ["dip", "dips", "skull crusher"],
    hip: ["pistol", "sumo squat"],
    pregnancy: ["jump", "jumps", "jumping", "burpee", "burpees", "sprint", "sprints"]
  };
  const names = (entry, phrases) =>
    phrases.some((phrase) => new RegExp(String.raw`\b${phrase}\b`, "i").test(entry.name));

  test.each(Object.entries(AVOID_PHRASES))(
    "every entry it names is avoid for %s",
    (area, phrases) => {
      for (const entry of EXERCISES.filter((candidate) => names(candidate, phrases))) {
        expect(entry.flags[area], entry.id).toBe("avoid");
      }
    }
  );

  test("names entries the library holds", () => {
    const named = EXERCISES.filter((entry) =>
      Object.values(AVOID_PHRASES).some((phrases) => names(entry, phrases))
    );
    expect(named.length).toBeGreaterThanOrEqual(5);
  });

  test("every entry lying on the back is avoid in pregnancy", () => {
    const supine = EXERCISES.filter((entry) => entry.supine);
    expect(supine.length).toBeGreaterThan(5);
    for (const entry of supine) expect(entry.flags.pregnancy, entry.id).toBe("avoid");
  });

  test("high-impact conditioning is avoid for the knee, the hip and pregnancy", () => {
    for (const entry of EXERCISES.filter((candidate) => candidate.impact === "high")) {
      for (const area of ["knee", "hip", "pregnancy"]) {
        expect(entry.flags[area], `${entry.id} for ${area}`).toBe("avoid");
      }
    }
  });
});

describe("the old keyword false positives", () => {
  // The Guides view's substring keywords would flag these for an area they do
  // not load (spec, finding 6). The library judges them by their tags.
  test.each([
    ["leg-press", ["shoulder", "wrist", "elbow"]],
    ["standing-calf-raise", ["shoulder"]],
    ["band-pallof-press", ["shoulder", "wrist", "elbow"]],
    ["dumbbell-triceps-kickback", ["hip"]],
    ["seated-hamstring-curl", ["wrist", "elbow"]]
  ])("%s is ok for %j", (id, areas) => {
    const entry = byId.get(id);
    expect(entry, id).toBeDefined();
    for (const area of areas) expect(isOk(entry, area)).toBe(true);
  });
});

describe("capabilitiesFor", () => {
  test.each([
    ["Home", "Bodyweight only", []],
    ["Home", "Dumbbells", ["dumbbell"]],
    ["Home", "Kettlebell", ["kettlebell"]],
    ["Home", "Pull-up bar", ["pull-up bar"]],
    ["Home", "Resistance bands", ["band"]],
    ["Home", "Adjustable bench", ["bench"]],
    ["Home", "Yoga mat", []],
    ["Commercial", "Full gym access", CAPABILITIES],
    [
      "Commercial",
      "Strength floor",
      ["dumbbell", "kettlebell", "barbell", "bench", "pull-up bar", "machine"]
    ],
    ["Commercial", "Cardio deck", ["cardio machine"]],
    [
      "Commercial",
      "Functional training zone",
      ["dumbbell", "kettlebell", "band", "pull-up bar", "cable"]
    ],
    ["Commercial", "Group class studio", ["dumbbell", "kettlebell", "band"]],
    ["Commercial", "Pool / aquatic center", ["pool"]],
    ["Commercial", "Court sports area", []],
    ["Commercial", "Recovery & mobility zone", ["band"]]
  ])("%s: %s supplies %j", (environment, label, expected) => {
    expect(capabilitiesFor({ environment, equipment: [label] })).toEqual(expected);
  });

  test("joins several labels, once each, in CAPABILITIES order", () => {
    expect(
      capabilitiesFor({
        environment: "Home",
        equipment: ["Resistance bands", "Dumbbells", "Kettlebell"]
      })
    ).toEqual(["dumbbell", "kettlebell", "band"]);
  });

  test("matches labels and the environment ignoring case and spaces", () => {
    expect(capabilitiesFor({ environment: " commercial ", equipment: ["  cardio DECK "] })).toEqual(
      ["cardio machine"]
    );
  });

  test("reads a label only in its own environment", () => {
    expect(capabilitiesFor({ environment: "Home", equipment: ["Full gym access"] })).toEqual([]);
    expect(capabilitiesFor({ environment: "Commercial", equipment: ["Dumbbells"] })).toEqual([]);
  });

  test("reads any environment but Commercial as a home", () => {
    expect(capabilitiesFor({ environment: "Garage", equipment: ["Dumbbells"] })).toEqual([
      "dumbbell"
    ]);
  });

  test.each([
    ["an unknown label", { environment: "Home", equipment: ["Rowing shed"] }],
    ["no labels", { environment: "Home", equipment: [] }],
    ["no list", { environment: "Home", equipment: undefined }],
    ["no environment", { equipment: ["Dumbbells"] }]
  ])("supplies the expected nothing or home set for %s", (label, input) => {
    expect(capabilitiesFor(input)).toEqual(label === "no environment" ? ["dumbbell"] : []);
  });

  test("ignores entries that are not strings", () => {
    expect(capabilitiesFor({ environment: "Home", equipment: [7, null, "Dumbbells"] })).toEqual([
      "dumbbell"
    ]);
  });
});
