import { describe, expect, test, vi } from "vitest";
import { dedupeMeals, getCalorieBand, handleImageError, normalizeMealDbMeal } from "./utils";
import { FALLBACK_IMAGE } from "./data";

// The meal helpers, previously at 0%. normalizeMealDbMeal is the shape every
// meal from the MealDB proxy passes through before it reaches a card, and
// dedupeMeals is what stops the same recipe appearing in two suggestion
// sections at once.

describe("getCalorieBand", () => {
  test.each([
    [1200, "light"],
    [1999, "light"],
    [2000, "balanced"],
    [2200, "balanced"],
    [2500, "balanced"],
    [2501, "high"],
    [3500, "high"]
  ])("puts %i calories in the %s band", (calories, band) => {
    expect(getCalorieBand(calories)).toBe(band);
  });

  // Both edges belong to the middle band, which is the easy thing to get wrong.
  test("includes both boundaries in the balanced band", () => {
    expect(getCalorieBand(2000)).toBe("balanced");
    expect(getCalorieBand(2500)).toBe("balanced");
  });
});

describe("handleImageError", () => {
  test("swaps in the fallback image", () => {
    const target = { src: "https://example.com/broken.png", onerror: vi.fn() };

    handleImageError({ currentTarget: target });

    expect(target.src).toBe(FALLBACK_IMAGE);
  });

  // Without this the fallback failing would fire the handler again, and a
  // fallback that cannot load would loop forever.
  test("detaches itself so a failing fallback cannot loop", () => {
    const target = { src: "", onerror: vi.fn() };

    handleImageError({ currentTarget: target });

    expect(target.onerror).toBeNull();
  });
});

describe("normalizeMealDbMeal", () => {
  const meal = (overrides = {}) => ({
    id: "52771",
    title: "Spicy Arrabiata Penne",
    image: "https://example.com/penne.jpg",
    category: "Vegetarian",
    area: "Italian",
    ...overrides
  });

  test("trims the text fields", () => {
    const result = normalizeMealDbMeal(meal({ id: "  52771  ", title: "  Penne  " }));

    expect(result.id).toBe("52771");
    expect(result.title).toBe("Penne");
  });

  test.each([
    ["a number", 52771],
    ["null", null],
    ["an object", {}],
    ["missing", undefined]
  ])("turns %s into an empty string rather than keeping it", (_label, value) => {
    expect(normalizeMealDbMeal(meal({ id: value })).id).toBe("");
  });

  // An empty id is what the callers filter on, so a meal that arrives without
  // one is dropped rather than rendered as a blank card.
  test("survives being handed nothing at all", () => {
    expect(() => normalizeMealDbMeal()).not.toThrow();
    expect(normalizeMealDbMeal().id).toBe("");
    expect(normalizeMealDbMeal().title).toBe("");
  });

  describe("the blurb", () => {
    test("uses the supplied one when there is one", () => {
      expect(normalizeMealDbMeal(meal({ blurb: "  A tomato pasta  " })).blurb).toBe(
        "A tomato pasta"
      );
    });

    test("falls back to the category and area", () => {
      expect(normalizeMealDbMeal(meal()).blurb).toBe("Vegetarian | Italian");
    });

    test("uses whichever of the two it has", () => {
      expect(normalizeMealDbMeal(meal({ area: "" })).blurb).toBe("Vegetarian");
      expect(normalizeMealDbMeal(meal({ category: "" })).blurb).toBe("Italian");
    });

    test("falls back again when it has neither", () => {
      expect(normalizeMealDbMeal(meal({ category: "", area: "" })).blurb).toBe("Recipe idea");
    });
  });

  describe("the image", () => {
    test("keeps a real url", () => {
      expect(normalizeMealDbMeal(meal()).image).toBe("https://example.com/penne.jpg");
    });

    test.each([
      ["empty", ""],
      ["missing", undefined],
      ["not a string", 42]
    ])("substitutes the fallback when the url is %s", (_label, image) => {
      expect(normalizeMealDbMeal(meal({ image })).image).toBe(FALLBACK_IMAGE);
    });
  });

  describe("ingredients", () => {
    test("trims and drops the empty ones", () => {
      const result = normalizeMealDbMeal(
        meal({ ingredients: ["  penne  ", "", "  ", "tomato", null] })
      );

      expect(result.ingredients).toEqual(["penne", "tomato"]);
    });

    test("caps the list at twenty", () => {
      const many = Array.from({ length: 30 }, (_, i) => `item ${i}`);

      expect(normalizeMealDbMeal(meal({ ingredients: many })).ingredients).toHaveLength(20);
    });

    test.each([
      ["missing", undefined],
      ["not a list", "penne"]
    ])("returns an empty list when ingredients are %s", (_label, ingredients) => {
      expect(normalizeMealDbMeal(meal({ ingredients })).ingredients).toEqual([]);
    });
  });

  describe("recipe links", () => {
    test("keeps only the entries that have both a label and a url", () => {
      const result = normalizeMealDbMeal(
        meal({
          recipes: [
            { label: "Video", url: "https://example.com/v" },
            { label: "No url" },
            { url: "https://example.com/no-label" },
            { label: "  Source  ", url: "  https://example.com/s  " }
          ]
        })
      );

      expect(result.recipes).toEqual([
        { label: "Video", url: "https://example.com/v" },
        { label: "Source", url: "https://example.com/s" }
      ]);
    });

    test("caps the list at eight", () => {
      const many = Array.from({ length: 12 }, (_, i) => ({
        label: `l${i}`,
        url: `https://example.com/${i}`
      }));

      expect(normalizeMealDbMeal(meal({ recipes: many })).recipes).toHaveLength(8);
    });
  });

  test("keeps calories as null rather than zero when absent", () => {
    expect(normalizeMealDbMeal(meal()).calories).toBeNull();
    expect(normalizeMealDbMeal(meal({ calories: 0 })).calories).toBe(0);
    expect(normalizeMealDbMeal(meal({ calories: 640 })).calories).toBe(640);
  });

  // The original object is spread first, so anything the proxy adds later
  // survives instead of being silently dropped here.
  test("keeps fields it does not know about", () => {
    expect(normalizeMealDbMeal(meal({ tags: ["pasta"] })).tags).toEqual(["pasta"]);
  });
});

describe("dedupeMeals", () => {
  const meal = (id, title = "Something") => ({ id, title });

  test("keeps the first of each repeated meal", () => {
    const result = dedupeMeals([meal("1"), meal("2"), meal("1")]);

    expect(result.map((m) => m.id)).toEqual(["1", "2"]);
  });

  test("falls back to the title when there is no id", () => {
    const result = dedupeMeals([{ title: "Penne" }, { title: "Penne" }, { title: "Risotto" }]);

    expect(result.map((m) => m.title)).toEqual(["Penne", "Risotto"]);
  });

  test("drops an entry with neither an id nor a title", () => {
    expect(dedupeMeals([{}, meal("1"), null])).toEqual([meal("1")]);
  });

  // The shared set is how the suggestion sections avoid showing the same
  // recipe twice: each section is deduped against everything already placed.
  test("carries the seen set across calls", () => {
    const seen = new Set();

    const first = dedupeMeals([meal("1"), meal("2")], seen);
    const second = dedupeMeals([meal("2"), meal("3")], seen);

    expect(first.map((m) => m.id)).toEqual(["1", "2"]);
    expect(second.map((m) => m.id)).toEqual(["3"]);
  });

  test("mutates the set it was given, which is what makes that work", () => {
    const seen = new Set();

    dedupeMeals([meal("1")], seen);

    expect(seen.has("1")).toBe(true);
  });

  test("starts fresh when given no set", () => {
    expect(dedupeMeals([meal("1")]).map((m) => m.id)).toEqual(["1"]);
    expect(dedupeMeals([meal("1")]).map((m) => m.id)).toEqual(["1"]);
  });

  test.each([
    ["undefined", undefined],
    ["not a list", "meals"],
    ["empty", []]
  ])("returns an empty list for %s input", (_label, input) => {
    expect(dedupeMeals(input)).toEqual([]);
  });
});
