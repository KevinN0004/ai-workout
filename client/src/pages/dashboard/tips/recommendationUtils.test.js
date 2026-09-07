import { describe, expect, test } from "vitest";
import {
  buildContextCategories,
  buildEquipmentKeywords,
  buildGuideCards,
  detectInjuryFlags,
  getExerciseImage,
  normalizeText,
  resolveMediaUrl,
  scoreExercise,
  uniqueList
} from "./recommendationUtils";

// The ranking behind the Tips view: which exercises a user is shown, in what
// order, and which are pushed down because they conflict with an injury they
// reported. 282 lines of pure logic at 0% coverage.
//
// The injury penalty is the part that matters. Everything else changes what is
// suggested; that decides whether someone with a bad knee is shown pistol
// squats.

const context = (overrides = {}) => ({
  preferredCategories: [],
  weatherMode: "",
  equipmentKeywords: [],
  homeMode: false,
  goalTokens: [],
  todayTokens: [],
  injuryFlags: [],
  ...overrides
});

const exercise = (overrides = {}) => ({
  name: "Barbell Bench Press",
  description: "A horizontal press for the chest.",
  category: { name: "Chest" },
  equipment: [{ name: "Barbell" }],
  muscles: [{ name: "Pectoralis major" }],
  ...overrides
});

describe("normalizeText", () => {
  test("lowercases and trims", () => {
    expect(normalizeText("  Barbell Bench  ")).toBe("barbell bench");
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an object", {}]
  ])("returns an empty string for %s", (_label, input) => {
    expect(normalizeText(input)).toBe("");
  });
});

describe("uniqueList", () => {
  test("removes duplicates and keeps first-seen order", () => {
    expect(uniqueList(["Back", "Legs", "Back", "Abs"])).toEqual(["Back", "Legs", "Abs"]);
  });

  test("drops empty entries", () => {
    expect(uniqueList(["Back", "", null, undefined, 0, "Legs"])).toEqual(["Back", "Legs"]);
  });
});

describe("resolveMediaUrl", () => {
  test.each([
    ["https://example.com/a.png", "https://example.com/a.png"],
    ["http://example.com/a.png", "http://example.com/a.png"],
    ["HTTPS://example.com/a.png", "HTTPS://example.com/a.png"]
  ])("passes an absolute url through: %s", (input, expected) => {
    expect(resolveMediaUrl(input)).toBe(expected);
  });

  // wger returns image paths relative to its own host.
  test("prefixes a root-relative path with the wger host", () => {
    expect(resolveMediaUrl("/media/exercise/1.png")).toBe("https://wger.de/media/exercise/1.png");
  });

  test("leaves anything else alone", () => {
    expect(resolveMediaUrl("media/exercise/1.png")).toBe("media/exercise/1.png");
  });

  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined]
  ])("returns an empty string for %s", (_label, input) => {
    expect(resolveMediaUrl(input)).toBe("");
  });
});

describe("getExerciseImage", () => {
  test("prefers the image flagged as main", () => {
    const image = getExerciseImage(
      exercise({
        images: [
          { url: "/media/second.png", isMain: false },
          { url: "/media/main.png", isMain: true }
        ]
      })
    );

    expect(image).toBe("https://wger.de/media/main.png");
  });

  test("falls back to the first image when none is flagged", () => {
    const image = getExerciseImage(
      exercise({ images: [{ url: "/media/first.png" }, { url: "/media/second.png" }] })
    );

    expect(image).toBe("https://wger.de/media/first.png");
  });

  // The main-image search requires a url, so an entry flagged main without one
  // is not chosen. The fallback is positional though -- images[0], not the
  // first entry that has a url -- so a urlless first entry yields a placeholder
  // even when a later image would have served. Recorded as it behaves; the
  // result is an honest placeholder rather than a wrong image.
  test("falls back positionally, not to the first entry that has a url", () => {
    const image = getExerciseImage(
      exercise({ images: [{ isMain: true }, { url: "/media/second.png" }] })
    );

    expect(image).toContain("placehold.co");
  });

  test("ignores a main flag with no url when the first entry has one", () => {
    const image = getExerciseImage(
      exercise({ images: [{ url: "/media/first.png" }, { isMain: true }] })
    );

    expect(image).toBe("https://wger.de/media/first.png");
  });

  test("falls back to a placeholder naming the exercise", () => {
    const image = getExerciseImage(exercise({ images: [] }));

    expect(image).toContain("placehold.co");
    expect(image).toContain(encodeURIComponent("Barbell Bench Press"));
  });

  test.each([
    ["images is missing", exercise({ images: undefined })],
    ["images is not a list", exercise({ images: "nope" })],
    ["the exercise is empty", {}],
    ["the exercise is undefined", undefined]
  ])("still returns a usable url when %s", (_label, input) => {
    expect(getExerciseImage(input)).toMatch(/^https:\/\//);
  });
});

describe("buildContextCategories", () => {
  test.each([
    ["lean_strength", "Chest"],
    ["fat_loss", "Cardio"],
    ["endurance", "Cardio"],
    ["recovery", "Abs"]
  ])("starts from the %s track", (track, expected) => {
    const categories = buildContextCategories({ track, goalText: "", todayLines: [] });

    expect(categories[0]).toBe(expected);
  });

  test("falls back to lean_strength for an unknown track", () => {
    const categories = buildContextCategories({ track: "nonsense", goalText: "", todayLines: [] });

    expect(categories).toEqual(
      buildContextCategories({ track: "lean_strength", goalText: "", todayLines: [] })
    );
  });

  test("adds categories the goal wording implies", () => {
    const categories = buildContextCategories({
      track: "recovery",
      goalText: "improve my bench and chest strength",
      todayLines: []
    });

    expect(categories).toContain("Chest");
  });

  test("reads today's plan lines as well as the goal", () => {
    const categories = buildContextCategories({
      track: "recovery",
      goalText: "",
      todayLines: ["Cardio intervals", "Glute bridges"]
    });

    expect(categories).toEqual(expect.arrayContaining(["Cardio", "Legs"]));
  });

  test("matches keywords regardless of case", () => {
    const categories = buildContextCategories({
      track: "recovery",
      goalText: "HEAVY PULL DAY",
      todayLines: []
    });

    expect(categories).toContain("Back");
  });

  test("never repeats a category", () => {
    const categories = buildContextCategories({
      track: "fat_loss",
      goalText: "cardio and more cardio, plus legs",
      todayLines: ["cardio"]
    });

    expect(categories).toEqual(uniqueList(categories));
  });
});

describe("buildEquipmentKeywords", () => {
  test("maps a selection onto its keywords", () => {
    const keywords = buildEquipmentKeywords({ form: { equipment: ["Dumbbells"] } });

    expect(keywords).toEqual(expect.arrayContaining(["dumbbell", "kettlebell"]));
  });

  test("merges several selections without repeating", () => {
    const keywords = buildEquipmentKeywords({
      form: { equipment: ["Dumbbells", "Kettlebell"] }
    });

    expect(keywords).toEqual(uniqueList(keywords));
    expect(keywords).toContain("dumbbell");
  });

  test("ignores a selection it does not recognise", () => {
    expect(buildEquipmentKeywords({ form: { equipment: ["Moon boots"] } })).toEqual([]);
  });

  // Someone training at home who listed no equipment still gets bodyweight
  // suggestions rather than an empty list.
  test("assumes bodyweight for a home setup with nothing selected", () => {
    const keywords = buildEquipmentKeywords({ form: { equipment: [], environment: "Home" } });

    expect(keywords).toEqual(expect.arrayContaining(["bodyweight", "dumbbell", "band"]));
  });

  test("does not assume bodyweight for a gym setup", () => {
    expect(buildEquipmentKeywords({ form: { equipment: [], environment: "Gym" } })).toEqual([]);
  });

  // The fallback is only for an empty list, not an unrecognised one that
  // happens to produce no keywords... which it also is. Recorded as it behaves.
  test("applies the home fallback when the selections yield no keywords", () => {
    const keywords = buildEquipmentKeywords({
      form: { equipment: ["Moon boots"], environment: "home" }
    });

    expect(keywords).toContain("bodyweight");
  });

  test.each([
    ["equipment is missing", { form: {} }],
    ["equipment is not a list", { form: { equipment: "Dumbbells" } }],
    ["the form is missing", {}]
  ])("returns an empty list when %s", (_label, input) => {
    expect(buildEquipmentKeywords(input)).toEqual([]);
  });
});

describe("detectInjuryFlags", () => {
  test("finds an injury named in the text", () => {
    const flags = detectInjuryFlags("sore knee after running");

    expect(flags.map((flag) => flag.injury)).toContain("knee");
  });

  test("returns the keywords to avoid for that injury", () => {
    const [flag] = detectInjuryFlags("knee");

    expect(flag.keywords).toEqual(expect.arrayContaining(["squat", "lunge", "jump"]));
  });

  test("matches regardless of case and surrounding words", () => {
    expect(detectInjuryFlags("My SHOULDER hurts").map((f) => f.injury)).toContain("shoulder");
  });

  test("finds several injuries in one note", () => {
    const injuries = detectInjuryFlags("bad knee and a sore wrist").map((f) => f.injury);

    expect(injuries).toEqual(expect.arrayContaining(["knee", "wrist"]));
  });

  // "back" is a substring of "lower back", so a lower-back note raises both
  // rules. They carry the same keywords, so the effect is that a conflicting
  // exercise is penalised twice. Recording it because the doubled penalty is
  // load-bearing for the ordering, not an obvious reading of the code.
  test("raises both the back and lower back rules for a lower back note", () => {
    const injuries = detectInjuryFlags("lower back pain").map((f) => f.injury);

    expect(injuries).toContain("lower back");
    expect(injuries).toContain("back");
  });

  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a note naming no injury", "feeling great today"]
  ])("returns nothing for %s", (_label, input) => {
    expect(detectInjuryFlags(input)).toEqual([]);
  });
});

describe("scoreExercise", () => {
  const scoreOf = (ex, ctx) => scoreExercise(ex, context(ctx)).score;

  test("scores zero against an empty context", () => {
    expect(scoreOf(exercise(), {})).toBe(0);
  });

  test("rewards a category the user is focused on", () => {
    expect(scoreOf(exercise(), { preferredCategories: ["Chest"] })).toBe(5);
  });

  test("matches the category regardless of case", () => {
    expect(scoreOf(exercise(), { preferredCategories: ["chest"] })).toBe(5);
  });

  test("rewards cardio on an outdoor day", () => {
    const cardio = exercise({ category: { name: "Cardio" } });

    expect(scoreOf(cardio, { weatherMode: "outdoor" })).toBe(2);
  });

  test("rewards non-cardio on an indoor day", () => {
    expect(scoreOf(exercise(), { weatherMode: "indoor" })).toBe(1);
    expect(scoreOf(exercise({ category: { name: "Cardio" } }), { weatherMode: "indoor" })).toBe(0);
  });

  describe("equipment", () => {
    test("rewards an exercise the user can equip", () => {
      expect(scoreOf(exercise(), { equipmentKeywords: ["barbell"] })).toBe(3);
    });

    test("gives a smaller reward to a bodyweight option at home", () => {
      const bodyweight = exercise({ equipment: [{ name: "Bodyweight" }] });

      expect(scoreOf(bodyweight, { equipmentKeywords: ["barbell"], homeMode: true })).toBe(2);
    });

    test("gives nothing for unavailable equipment away from home", () => {
      expect(scoreOf(exercise(), { equipmentKeywords: ["kettlebell"] })).toBe(0);
    });

    test("does not reward equipment when the user listed none", () => {
      expect(scoreOf(exercise(), { equipmentKeywords: [] })).toBe(0);
    });
  });

  describe("wording", () => {
    test("rewards a goal word appearing in the exercise", () => {
      expect(scoreOf(exercise(), { goalTokens: ["bench"] })).toBe(1);
    });

    // Short tokens match too much to be evidence of anything.
    test.each(["ab", "leg", ""])("ignores the short token %s", (token) => {
      const named = exercise({ name: "Leg Press", description: "Abs and legs." });

      expect(scoreOf(named, { goalTokens: [token] })).toBe(0);
    });

    test("counts a goal match once however many words hit", () => {
      expect(scoreOf(exercise(), { goalTokens: ["bench", "press", "barbell"] })).toBe(1);
    });

    test("rewards today's plan wording more than the goal", () => {
      expect(scoreOf(exercise(), { todayTokens: ["bench"] })).toBe(2);
    });

    // Today's wording also matches the muscles worked, which the goal does not.
    test("matches today's wording against the muscles", () => {
      expect(scoreOf(exercise(), { todayTokens: ["pectoralis"] })).toBe(2);
      expect(scoreOf(exercise(), { goalTokens: ["pectoralis"] })).toBe(0);
    });
  });

  describe("injuries", () => {
    const kneeFlag = { injury: "knee", keywords: ["squat", "lunge", "jump"] };

    test("penalises an exercise that conflicts with an injury", () => {
      const squat = exercise({ name: "Back Squat", category: { name: "Legs" } });

      expect(scoreOf(squat, { injuryFlags: [kneeFlag] })).toBe(-7);
    });

    test("matches the conflict in the description too", () => {
      const hidden = exercise({ name: "Bulgarian Split", description: "A single-leg lunge." });

      expect(scoreOf(hidden, { injuryFlags: [kneeFlag] })).toBe(-7);
    });

    test("leaves an unrelated exercise alone", () => {
      expect(scoreOf(exercise(), { injuryFlags: [kneeFlag] })).toBe(0);
    });

    // Two otherwise identical exercises: the conflicting one ranks lower.
    test("ranks a conflicting exercise below an equivalent safe one", () => {
      const ctx = { preferredCategories: ["Legs"] };
      const squat = exercise({ name: "Back Squat", category: { name: "Legs" } });
      const legPress = exercise({ name: "Leg Press", category: { name: "Legs" } });

      expect(scoreOf(squat, { ...ctx, injuryFlags: [kneeFlag] })).toBeLessThan(
        scoreOf(legPress, { ...ctx, injuryFlags: [kneeFlag] })
      );
    });

    test("costs the same exercise seven points", () => {
      const squat = exercise({ name: "Back Squat", category: { name: "Legs" } });
      const ctx = { preferredCategories: ["Legs"] };

      expect(scoreOf(squat, { ...ctx, injuryFlags: [kneeFlag] })).toBe(scoreOf(squat, ctx) - 7);
    });

    // Worth being explicit about, because it is easy to read -7 as a veto. It
    // is a ranking penalty: an exercise that matches the focus, the equipment,
    // the goal wording and today's muscles banks 12 and still clears a safe
    // exercise that matches almost nothing. Excluding a risky movement outright
    // would need a filter, not a score.
    test("is a penalty rather than an exclusion", () => {
      const squat = exercise({
        name: "Back Squat",
        category: { name: "Legs" },
        equipment: [{ name: "Barbell" }],
        muscles: [{ name: "Quadriceps" }]
      });
      const ctx = {
        preferredCategories: ["Legs"],
        equipmentKeywords: ["barbell"],
        weatherMode: "indoor",
        goalTokens: ["squat"],
        todayTokens: ["quadriceps"],
        injuryFlags: [kneeFlag]
      };

      // 5 + 1 + 3 + 1 + 2 = 12 of reward, less the 7 penalty, is still 5.
      expect(scoreOf(squat, ctx)).toBe(5);
      expect(scoreOf(squat, ctx)).toBeGreaterThan(scoreOf(exercise(), ctx));
    });

    test("penalises once per conflicting injury", () => {
      const squat = exercise({ name: "Back Squat" });
      const hipFlag = { injury: "hip", keywords: ["squat", "lunge"] };

      expect(scoreOf(squat, { injuryFlags: [kneeFlag, hipFlag] })).toBe(-14);
    });
  });

  describe("reasons", () => {
    test("explains each thing that helped", () => {
      const { reasons } = scoreExercise(
        exercise(),
        context({ preferredCategories: ["Chest"], equipmentKeywords: ["barbell"] })
      );

      expect(reasons).toEqual(
        expect.arrayContaining(["Matches your Chest focus.", "Fits your available equipment."])
      );
    });

    test("names the injury it is warning about", () => {
      const { reasons } = scoreExercise(
        exercise({ name: "Back Squat" }),
        context({ injuryFlags: [{ injury: "knee", keywords: ["squat"] }] })
      );

      expect(reasons).toContain("Potentially high stress for knee.");
    });

    // A card with no reasons on it would look broken.
    test("always gives a reason, even with nothing to say", () => {
      const { reasons } = scoreExercise(exercise(), context());

      expect(reasons).toEqual(["Fits your current filters."]);
    });

    test("says something even when the score is dragged negative", () => {
      const { reasons } = scoreExercise(
        exercise({ name: "Back Squat" }),
        context({ injuryFlags: [{ injury: "knee", keywords: ["squat"] }] })
      );

      expect(reasons).toContain("Fits your current filters.");
    });

    test("does not repeat itself", () => {
      const { reasons } = scoreExercise(
        exercise({ name: "Back Squat Lunge Jump" }),
        context({ injuryFlags: [{ injury: "knee", keywords: ["squat", "lunge", "jump"] }] })
      );

      expect(reasons).toEqual(uniqueList(reasons));
    });
  });

  test("survives an exercise with nothing on it", () => {
    expect(() => scoreExercise({}, context())).not.toThrow();
    expect(() => scoreExercise(undefined, context())).not.toThrow();
  });
});

describe("buildGuideCards", () => {
  const cards = (overrides = {}) =>
    buildGuideCards({
      track: "lean_strength",
      weeklyWorkouts: 3,
      duration: 45,
      activity: "Moderate",
      weatherMode: "",
      injuryText: "",
      ...overrides
    });

  const textOf = (list, title) => list.find((card) => card.title === title)?.text || "";

  test("always returns the same six cards", () => {
    expect(cards().map((card) => card.title)).toEqual([
      "Split Strategy",
      "Load Progression",
      "Volume Target",
      "Session Budget",
      "Weather Adjustment",
      "Injury Guardrails"
    ]);
  });

  test.each([
    [6, /5-day split/],
    [5, /5-day split/],
    [4, /upper\/lower split/],
    [3, /push\/pull\/legs or full-body/],
    [2, /full-body sessions/],
    [1, /full-body sessions/]
  ])("advises a split for %i workouts a week", (weeklyWorkouts, pattern) => {
    expect(textOf(cards({ weeklyWorkouts }), "Split Strategy")).toMatch(pattern);
  });

  test.each([
    ["fat_loss", /finishers/],
    ["endurance", /pacing/],
    ["recovery", /submax/],
    ["lean_strength", /Progress top sets/]
  ])("gives %s its own load advice", (track, pattern) => {
    expect(textOf(cards({ track }), "Load Progression")).toMatch(pattern);
  });

  test.each([
    ["Very high", /14-20/],
    ["High", /14-20/],
    ["Moderate", /10-16/],
    ["Light", /10-16/]
  ])("sets a volume target for %s activity", (activity, pattern) => {
    expect(textOf(cards({ activity }), "Volume Target")).toMatch(pattern);
  });

  test.each([
    ["outdoor", /outdoor work/],
    ["indoor", /indoor work/],
    ["", /unavailable/]
  ])("adjusts for %s weather", (weatherMode, pattern) => {
    expect(textOf(cards({ weatherMode }), "Weather Adjustment")).toMatch(pattern);
  });

  test("puts the session length in the budget card", () => {
    expect(textOf(cards({ duration: 30 }), "Session Budget")).toContain("30 minute");
  });

  describe("injury guardrails", () => {
    test("warns when the user reported something", () => {
      expect(textOf(cards({ injuryText: "sore knee" }), "Injury Guardrails")).toMatch(
        /Injury note detected/
      );
    });

    test("says so when they did not", () => {
      expect(textOf(cards({ injuryText: "" }), "Injury Guardrails")).toMatch(
        /No injury note detected/
      );
    });

    // Whitespace is not a note. normalizeText trims before the check.
    test("treats a blank note as no note", () => {
      expect(textOf(cards({ injuryText: "   " }), "Injury Guardrails")).toMatch(
        /No injury note detected/
      );
    });
  });
});
