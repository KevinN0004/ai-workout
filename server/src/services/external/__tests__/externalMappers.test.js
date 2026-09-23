import { describe, expect, test } from "vitest";
import { createExternalDataService } from "../externalDataService.js";
import { cleanText, toNullableNumber } from "../../dashboard/dashboardDataBuildersService.js";

// The pure mappers that shape every upstream payload before it reaches a
// client: the wger exercise mapper and its translation picker, the MealDB
// recipe mapper and its ingredient scan, and the two small helpers they lean
// on. These were the bulk of what was left uncovered in externalDataService --
// its retry layer, weather and AQI maths are covered elsewhere.

const { mapWgerExercise, mapMealDbMeal, normalizePlainText, parseMultiNumberQuery } =
  createExternalDataService({
    cleanText,
    toNullableNumber,
    readThroughExternalCache: async () => ({}),
    buildExternalCacheKey: () => "",
    metrics: { externalApiFailures: {}, externalApiRetries: {} },
    logger: { info() {}, warn() {}, error() {} },
    toShortText: (value) => String(value ?? ""),
    recordExternalApiLatency: () => {},
    externalApiRetries: 0,
    externalApiRetryBaseDelayMs: 0,
    wgerDefaultLanguage: 2
  });

describe("normalizePlainText", () => {
  // wger descriptions arrive as HTML and are rendered as plain text.
  test("strips markup", () => {
    expect(normalizePlainText("<p>Lie on a <b>bench</b>.</p>")).toBe("Lie on a bench .");
  });

  test("collapses the whitespace markup leaves behind", () => {
    expect(normalizePlainText("<p>one</p>\n\n  <p>two</p>")).toBe("one two");
  });

  test("caps the length", () => {
    expect(normalizePlainText("x".repeat(900), 100)).toHaveLength(100);
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an object", {}]
  ])("returns an empty string for %s", (_label, input) => {
    expect(normalizePlainText(input)).toBe("");
  });

  test("leaves plain text alone", () => {
    expect(normalizePlainText("  Bench press  ")).toBe("Bench press");
  });
});

describe("parseMultiNumberQuery", () => {
  test("splits a comma-separated string", () => {
    expect(parseMultiNumberQuery("1,2,3", 1, 100)).toEqual([1, 2, 3]);
  });

  test("accepts a list as well as a string", () => {
    expect(parseMultiNumberQuery([1, 2], 1, 100)).toEqual([1, 2]);
  });

  test("tolerates spacing around the separators", () => {
    expect(parseMultiNumberQuery(" 1 , 2 ", 1, 100)).toEqual([1, 2]);
  });

  // Out-of-range ids are dropped rather than clamped; a clamped id would
  // filter on something the caller never asked for.
  test("drops values outside the range", () => {
    expect(parseMultiNumberQuery("0,5,900", 1, 100)).toEqual([5]);
  });

  test("drops values that are not numbers", () => {
    expect(parseMultiNumberQuery("1,chest,3", 1, 100)).toEqual([1, 3]);
  });

  test("caps how many it will accept", () => {
    const many = Array.from({ length: 20 }, (_, i) => i + 1).join(",");

    expect(parseMultiNumberQuery(many, 1, 100)).toHaveLength(8);
  });

  test("honours a different cap", () => {
    expect(parseMultiNumberQuery("1,2,3,4", 1, 100, 2)).toEqual([1, 2]);
  });

  test.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""]
  ])("returns nothing for %s", (_label, input) => {
    expect(parseMultiNumberQuery(input, 1, 100)).toEqual([]);
  });
});

describe("mapWgerExercise", () => {
  const translation = (language, name, overrides = {}) => ({
    language,
    name,
    description: `<p>How to do ${name}.</p>`,
    ...overrides
  });

  const exercise = (overrides = {}) => ({
    id: 192,
    uuid: "abc-123",
    category: { id: 10, name: "Chest" },
    muscles: [{ id: 4, name_en: "Pectorals", name: "Pectoralis major" }],
    muscles_secondary: [{ id: 5, name: "Triceps" }],
    equipment: [{ id: 1, name: "Barbell" }],
    translations: [translation(2, "Bench Press")],
    ...overrides
  });

  test("maps the identifying fields", () => {
    const result = mapWgerExercise(exercise(), 2);

    expect(result).toMatchObject({ id: 192, uuid: "abc-123", name: "Bench Press", language: 2 });
  });

  test("renders the description as plain text", () => {
    expect(mapWgerExercise(exercise(), 2).description).toBe("How to do Bench Press.");
  });

  describe("choosing a translation", () => {
    test("prefers the requested language", () => {
      const result = mapWgerExercise(
        exercise({
          translations: [translation(2, "Bench Press"), translation(4, "Press de banca")]
        }),
        4
      );

      expect(result.name).toBe("Press de banca");
    });

    // English is the fallback the catalogue is most complete in.
    test("falls back to English when the requested language is missing", () => {
      const result = mapWgerExercise(
        exercise({ translations: [translation(2, "Bench Press"), translation(7, "Panca piana")] }),
        4
      );

      expect(result.name).toBe("Bench Press");
    });

    test("falls back to any named translation when English is missing too", () => {
      const result = mapWgerExercise(
        exercise({ translations: [translation(7, "Panca piana")] }),
        4
      );

      expect(result.name).toBe("Panca piana");
    });

    // A translation with no name is no use as a label, so it is skipped even
    // when its language matches.
    test("skips a translation that has no name", () => {
      const result = mapWgerExercise(
        exercise({ translations: [translation(4, ""), translation(2, "Bench Press")] }),
        4
      );

      expect(result.name).toBe("Bench Press");
    });

    test.each([
      ["there are no translations", []],
      ["translations is not a list", "Bench Press"],
      ["translations is missing", undefined]
    ])("leaves the name empty when %s", (_label, translations) => {
      expect(mapWgerExercise(exercise({ translations }), 2).name).toBe("");
    });

    // Both sides go through Number(), and Number(null) is 0, so a translation
    // whose language is null matches a request that did not name one. Recorded
    // as it behaves: the effect is picking an unlabelled language rather than
    // falling through, and the later fallbacks would have chosen something
    // anyway.
    test("treats a null language as matching a null preference", () => {
      const result = mapWgerExercise(
        exercise({
          translations: [translation(null, "Unlabelled"), translation(2, "Bench Press")]
        }),
        null
      );

      expect(result.name).toBe("Unlabelled");
    });
  });

  describe("related entities", () => {
    test("prefers the English muscle name", () => {
      expect(mapWgerExercise(exercise(), 2).muscles).toEqual([{ id: 4, name: "Pectorals" }]);
    });

    test("falls back to the plain muscle name", () => {
      const result = mapWgerExercise(
        exercise({ muscles: [{ id: 4, name: "Pectoralis major" }] }),
        2
      );

      expect(result.muscles).toEqual([{ id: 4, name: "Pectoralis major" }]);
    });

    test("maps the secondary muscles separately", () => {
      expect(mapWgerExercise(exercise(), 2).secondaryMuscles).toEqual([{ id: 5, name: "Triceps" }]);
    });

    test("maps the equipment", () => {
      expect(mapWgerExercise(exercise(), 2).equipment).toEqual([{ id: 1, name: "Barbell" }]);
    });

    // Some wger endpoints send bare ids rather than objects.
    test("accepts a bare id in place of an object", () => {
      const result = mapWgerExercise(exercise({ muscles: [4], equipment: [1], category: 10 }), 2);

      expect(result.muscles).toEqual([{ id: 4, name: "" }]);
      expect(result.equipment).toEqual([{ id: 1, name: "" }]);
      expect(result.category.id).toBe(10);
    });

    test.each([
      ["muscles", "muscles"],
      ["secondary muscles", "muscles_secondary"],
      ["equipment", "equipment"]
    ])("returns an empty list when %s is not a list", (_label, key) => {
      const result = mapWgerExercise(exercise({ [key]: "nope" }), 2);

      expect(
        result.muscles.length + result.secondaryMuscles.length + result.equipment.length
      ).toBeLessThan(3);
    });
  });

  describe("media", () => {
    test("reads an image from either field name", () => {
      const result = mapWgerExercise(
        exercise({
          images: [
            { id: 1, image: "https://example.com/a.png", is_main: true },
            { id: 2, url: "https://example.com/b.png" }
          ]
        }),
        2
      );

      expect(result.images).toEqual([
        { id: 1, url: "https://example.com/a.png", isMain: true },
        { id: 2, url: "https://example.com/b.png", isMain: false }
      ]);
    });

    test("accepts either spelling of the main flag", () => {
      const result = mapWgerExercise(
        exercise({ images: [{ id: 1, url: "https://example.com/a.png", isMain: true }] }),
        2
      );

      expect(result.images[0].isMain).toBe(true);
    });

    // An image entry with no url is not an image.
    test("drops an image with no url", () => {
      const result = mapWgerExercise(
        exercise({ images: [{ id: 1 }, { id: 2, url: "https://example.com/b.png" }] }),
        2
      );

      expect(result.images.map((i) => i.id)).toEqual([2]);
    });

    test("maps videos the same way", () => {
      const result = mapWgerExercise(
        exercise({ videos: [{ id: 9, video: "https://example.com/v.mp4" }, { id: 10 }] }),
        2
      );

      expect(result.videos).toEqual([{ id: 9, url: "https://example.com/v.mp4" }]);
    });

    test("returns empty lists when there is no media", () => {
      const result = mapWgerExercise(exercise(), 2);

      expect(result.images).toEqual([]);
      expect(result.videos).toEqual([]);
    });
  });

  test("survives an exercise with nothing on it", () => {
    expect(() => mapWgerExercise(undefined, 2)).not.toThrow();
    expect(mapWgerExercise({}, 2)).toMatchObject({ id: null, name: "", images: [], videos: [] });
  });
});

describe("mapMealDbMeal", () => {
  const meal = (overrides = {}) => ({
    idMeal: "52771",
    strMeal: "Spicy Arrabiata Penne",
    strMealThumb: "https://example.com/penne.jpg",
    strCategory: "Vegetarian",
    strArea: "Italian",
    strInstructions: "<p>Boil the penne.</p>",
    ...overrides
  });

  test("namespaces the id and keeps the upstream one", () => {
    const result = mapMealDbMeal(meal());

    // A MealDB recipe and a saved exercise share an id column downstream.
    expect(result.id).toBe("mealdb-52771");
    expect(result.sourceId).toBe("52771");
    expect(result.source).toBe("mealdb");
  });

  test("leaves the id empty when the upstream sent none", () => {
    expect(mapMealDbMeal(meal({ idMeal: "" })).id).toBe("");
  });

  test("renders the instructions as plain text", () => {
    expect(mapMealDbMeal(meal()).instructions).toBe("Boil the penne.");
  });

  describe("the blurb", () => {
    test("is the start of the instructions when there are any", () => {
      expect(mapMealDbMeal(meal()).blurb).toBe("Boil the penne.");
    });

    test("falls back to the category and area", () => {
      expect(mapMealDbMeal(meal({ strInstructions: "" })).blurb).toBe("Vegetarian | Italian");
    });

    test("falls back again when there is nothing to say", () => {
      const result = mapMealDbMeal(meal({ strInstructions: "", strCategory: "", strArea: "" }));

      expect(result.blurb).toBe("Recipe from TheMealDB.");
    });
  });

  describe("recipe links", () => {
    test("offers the source and the video when both are present", () => {
      const result = mapMealDbMeal(
        meal({
          strSource: "https://example.com/recipe",
          strYoutube: "https://youtube.com/watch?v=1"
        })
      );

      expect(result.recipes).toEqual([
        { label: "Source", url: "https://example.com/recipe" },
        { label: "YouTube", url: "https://youtube.com/watch?v=1" }
      ]);
    });

    test("offers only what it has", () => {
      const result = mapMealDbMeal(meal({ strYoutube: "https://youtube.com/watch?v=1" }));

      expect(result.recipes).toEqual([{ label: "YouTube", url: "https://youtube.com/watch?v=1" }]);
    });

    test("offers none when there are none", () => {
      expect(mapMealDbMeal(meal()).recipes).toEqual([]);
    });
  });

  // MealDB numbers its ingredients across twenty flat columns rather than
  // sending a list.
  describe("ingredients", () => {
    test("pairs each ingredient with its measure", () => {
      const result = mapMealDbMeal(
        meal({
          strIngredient1: "penne",
          strMeasure1: "1 lb",
          strIngredient2: "garlic",
          strMeasure2: "3 cloves"
        })
      );

      expect(result.ingredients).toEqual(["1 lb penne", "3 cloves garlic"]);
    });

    test("keeps an ingredient that has no measure", () => {
      const result = mapMealDbMeal(meal({ strIngredient1: "salt" }));

      expect(result.ingredients).toEqual(["salt"]);
    });

    // The columns are sparse: MealDB leaves gaps rather than compacting.
    test("skips empty slots and keeps scanning past them", () => {
      const result = mapMealDbMeal(
        meal({ strIngredient1: "penne", strIngredient2: "  ", strIngredient5: "basil" })
      );

      expect(result.ingredients).toEqual(["penne", "basil"]);
    });

    test("reads all twenty slots", () => {
      const filled = {};
      for (let i = 1; i <= 20; i += 1) filled[`strIngredient${i}`] = `item ${i}`;

      expect(mapMealDbMeal(meal(filled)).ingredients).toHaveLength(20);
    });

    test("stops at twenty even if the upstream adds more", () => {
      const filled = {};
      for (let i = 1; i <= 25; i += 1) filled[`strIngredient${i}`] = `item ${i}`;

      expect(mapMealDbMeal(meal(filled)).ingredients).toHaveLength(20);
    });

    test("returns nothing when the columns are empty", () => {
      expect(mapMealDbMeal(meal()).ingredients).toEqual([]);
    });
  });

  // MealDB has no calorie data; the field exists so the client can render one
  // shape for both meal sources.
  test("leaves calories null rather than zero", () => {
    expect(mapMealDbMeal(meal()).calories).toBeNull();
  });

  test("survives a meal with nothing on it", () => {
    expect(() => mapMealDbMeal()).not.toThrow();
    expect(mapMealDbMeal()).toMatchObject({ id: "", title: "", ingredients: [], recipes: [] });
  });
});
