import { describe, expect, test, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerWgerRoutes } from "./registerWgerRoutes.js";
import { registerMealDbRoutes } from "./registerMealDbRoutes.js";
import { createExternalDataService } from "../../services/externalDataService.js";
import { createHttpCacheService } from "../../services/httpCacheService.js";
import { isUpstreamFailureStatus } from "../../services/platformHealthService.js";
import { cleanText } from "../../services/dashboardDataBuildersService.js";

// The two read-only proxies, at 13% and 15% and the largest untested files
// left on the server. They forward public reference data, so the risk is lower
// than anything covered before them -- but the exercise search does real work
// between the upstream and the client, and the detail route retries with a
// relaxed filter, neither of which is obvious from the outside.
//
// Only wgerRequest and mealDbRequest are stubbed; they are the network
// boundary. Everything else is the real injected function.

const stubbed = {
  metrics: { externalApiFailures: {}, externalApiRetries: {} },
  logger: { info() {}, warn() {}, error() {} },
  toShortText: (value) => String(value ?? "")
};

const service = createExternalDataService({
  ...stubbed,
  cleanText,
  toNullableNumber: (value) => (Number.isFinite(Number(value)) ? Number(value) : null),
  readThroughExternalCache: async () => ({}),
  buildExternalCacheKey: () => "",
  recordExternalApiLatency: () => {},
  externalApiRetries: 0,
  externalApiRetryBaseDelayMs: 0,
  wgerDefaultLanguage: 2
});

const { mergeCacheStatuses } = createHttpCacheService({
  ...stubbed,
  toPositiveInt: (value, fallback) => (Number.isInteger(value) ? value : fallback),
  maxEntries: 10,
  defaultStaleTtlSec: 60
});

const buildWgerApp = (wgerRequest) => {
  const app = express();
  registerWgerRoutes(app, {
    wgerRequest,
    cleanText,
    mergeCacheStatuses,
    parseMultiNumberQuery: service.parseMultiNumberQuery,
    mapWgerExercise: service.mapWgerExercise,
    toFiniteNumber: service.toFiniteNumber,
    wgerDefaultLanguage: 2,
    isUpstreamFailureStatus
  });
  return app;
};

const buildMealDbApp = (mealDbRequest) => {
  const app = express();
  registerMealDbRoutes(app, {
    mealDbRequest,
    mapMealDbMeal: service.mapMealDbMeal,
    cleanText,
    isUpstreamFailureStatus
  });
  return app;
};

const upstreamError = (status) => {
  const err = new Error("wger exploded");
  if (status !== undefined) err.status = status;
  return err;
};

const results = (list, cache = "miss") => ({ data: { results: list }, cache });

// An exerciseinfo record in the shape mapWgerExercise expects.
const exercise = (id, name, overrides = {}) => ({
  id,
  category: { id: 10, name: "Chest" },
  muscles: [{ id: 4, name: "Pectoralis major" }],
  equipment: [{ id: 1, name: "Barbell" }],
  translations: [{ language: 2, name, description: `<p>How to do ${name}.</p>` }],
  ...overrides
});

describe("GET /api/wger/meta", () => {
  const metaUpstream = () =>
    vi
      .fn()
      .mockResolvedValueOnce(results([{ id: 10, name: "Chest" }], "hit"))
      .mockResolvedValueOnce(results([{ id: 4, name_en: "Pectorals", name: "Pectoralis" }]))
      .mockResolvedValueOnce(results([{ id: 1, name: "Barbell" }], "stale"));

  test("returns the three reference lists", async () => {
    const response = await request(buildWgerApp(metaUpstream())).get("/api/wger/meta");

    expect(response.status).toBe(200);
    expect(response.body.categories).toEqual([{ id: 10, name: "Chest" }]);
    expect(response.body.equipment).toEqual([{ id: 1, name: "Barbell" }]);
  });

  // The upstream carries a localised name and an English one; the English one
  // wins so the muscle filter reads consistently.
  test("prefers the English muscle name", async () => {
    const response = await request(buildWgerApp(metaUpstream())).get("/api/wger/meta");

    expect(response.body.muscles).toEqual([{ id: 4, name: "Pectorals" }]);
  });

  test("falls back to the plain name when there is no English one", async () => {
    const wgerRequest = vi
      .fn()
      .mockResolvedValueOnce(results([]))
      .mockResolvedValueOnce(results([{ id: 4, name: "Pectoralis" }]))
      .mockResolvedValueOnce(results([]));

    const response = await request(buildWgerApp(wgerRequest)).get("/api/wger/meta");

    expect(response.body.muscles).toEqual([{ id: 4, name: "Pectoralis" }]);
  });

  test("asks for all three lists at once", async () => {
    const wgerRequest = metaUpstream();

    await request(buildWgerApp(wgerRequest)).get("/api/wger/meta");

    expect(wgerRequest.mock.calls.map(([path]) => path)).toEqual([
      "exercisecategory/",
      "muscle/",
      "equipment/"
    ]);
  });

  test("merges the three cache statuses", async () => {
    const response = await request(buildWgerApp(metaUpstream())).get("/api/wger/meta");

    // Stale anywhere makes the whole answer stale.
    expect(response.body.cache.status).toBe("stale");
    expect(response.body.cache.categories).toBe("hit");
  });

  test("survives an upstream answer with no results", async () => {
    const wgerRequest = vi.fn().mockResolvedValue({ data: {}, cache: "miss" });

    const response = await request(buildWgerApp(wgerRequest)).get("/api/wger/meta");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ categories: [], muscles: [], equipment: [] });
  });

  test.each([500, 503])("answers 200 with empty lists for a %i", async (status) => {
    const wgerRequest = vi.fn().mockRejectedValue(upstreamError(status));

    const response = await request(buildWgerApp(wgerRequest)).get("/api/wger/meta");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ fallback: true, service: "wger", categories: [] });
  });

  test("reports a non-upstream failure as an error", async () => {
    const wgerRequest = vi.fn().mockRejectedValue(upstreamError(418));

    const response = await request(buildWgerApp(wgerRequest)).get("/api/wger/meta");

    expect(response.status).toBe(418);
  });
});

describe("GET /api/wger/exercises", () => {
  const listUpstream = (list, extra = {}) =>
    vi.fn(async () => ({ data: { results: list, count: 120, ...extra }, cache: "miss" }));

  const get = (app, query = "") =>
    request(app).get(`/api/wger/exercises${query ? `?${query}` : ""}`);

  test("returns the mapped exercises", async () => {
    const response = await get(buildWgerApp(listUpstream([exercise(1, "Bench Press")])));

    expect(response.status).toBe(200);
    expect(response.body.exercises[0]).toMatchObject({ id: 1, name: "Bench Press" });
  });

  test("defaults the paging and language", async () => {
    const wgerRequest = listUpstream([]);

    const response = await get(buildWgerApp(wgerRequest));

    expect(wgerRequest.mock.calls[0][1].query).toMatchObject({ limit: 15, offset: 0, language: 2 });
    expect(response.body).toMatchObject({ limit: 15, offset: 0, language: 2 });
  });

  test("passes the caller's paging through", async () => {
    const wgerRequest = listUpstream([]);

    await get(buildWgerApp(wgerRequest), "limit=5&offset=20&language=4");

    expect(wgerRequest.mock.calls[0][1].query).toMatchObject({ limit: 5, offset: 20, language: 4 });
  });

  test("forwards the id filters it was given", async () => {
    const wgerRequest = listUpstream([]);

    await get(buildWgerApp(wgerRequest), "category=10&muscle=4&equipment=1");

    expect(wgerRequest.mock.calls[0][1].query).toMatchObject({
      category: [10],
      muscles: [4],
      equipment: [1]
    });
  });

  test("omits a filter that was not given", async () => {
    const wgerRequest = listUpstream([]);

    await get(buildWgerApp(wgerRequest));

    const query = wgerRequest.mock.calls[0][1].query;
    expect("category" in query).toBe(false);
    expect("muscles" in query).toBe(false);
  });

  test.each([
    ["a limit above the cap", "limit=500"],
    ["a negative offset", "offset=-1"],
    ["a non-numeric limit", "limit=lots"]
  ])("rejects %s", async (_label, query) => {
    const wgerRequest = listUpstream([]);

    const response = await get(buildWgerApp(wgerRequest), query);

    expect(response.status).toBe(400);
    expect(wgerRequest).not.toHaveBeenCalled();
  });

  // wger has no text search, so the route asks for a wider page and filters it
  // here. Everything about that is invisible from the response alone.
  describe("text search", () => {
    test("over-fetches so there is something to filter", async () => {
      const wgerRequest = listUpstream([]);

      await get(buildWgerApp(wgerRequest), "q=bench&limit=5");

      // limit * 4 is below the floor of 100.
      expect(wgerRequest.mock.calls[0][1].query.limit).toBe(100);
    });

    test("never asks the upstream for more than two hundred", async () => {
      const wgerRequest = listUpstream([]);

      await get(buildWgerApp(wgerRequest), "q=bench&limit=80");

      expect(wgerRequest.mock.calls[0][1].query.limit).toBe(200);
    });

    test("does not over-fetch without a search term", async () => {
      const wgerRequest = listUpstream([]);

      await get(buildWgerApp(wgerRequest), "limit=5");

      expect(wgerRequest.mock.calls[0][1].query.limit).toBe(5);
    });

    test("keeps only the matching exercises", async () => {
      const wgerRequest = listUpstream([exercise(1, "Bench Press"), exercise(2, "Barbell Squat")]);

      const response = await get(buildWgerApp(wgerRequest), "q=bench");

      expect(response.body.exercises.map((e) => e.id)).toEqual([1]);
    });

    test("matches case-insensitively", async () => {
      const wgerRequest = listUpstream([exercise(1, "Bench Press")]);

      const response = await get(buildWgerApp(wgerRequest), "q=BENCH");

      expect(response.body.exercises).toHaveLength(1);
    });

    test.each([
      ["the description", "how to do"],
      ["the category", "chest"],
      ["a muscle name", "pectoralis"]
    ])("also searches %s", async (_label, q) => {
      const wgerRequest = listUpstream([exercise(1, "Bench Press")]);

      const response = await get(buildWgerApp(wgerRequest), `q=${encodeURIComponent(q)}`);

      expect(response.body.exercises).toHaveLength(1);
    });

    test("cuts the filtered list back to the requested limit", async () => {
      const many = Array.from({ length: 20 }, (_, i) => exercise(i + 1, `Bench ${i}`));
      const wgerRequest = listUpstream(many);

      const response = await get(buildWgerApp(wgerRequest), "q=bench&limit=3");

      expect(response.body.exercises).toHaveLength(3);
    });

    // The upstream count describes the whole unfiltered page, so reporting it
    // alongside a filtered list would claim results that are not there.
    test("counts what it is returning rather than the upstream total", async () => {
      const wgerRequest = listUpstream([exercise(1, "Bench Press"), exercise(2, "Squat")]);

      const response = await get(buildWgerApp(wgerRequest), "q=bench");

      expect(response.body.count).toBe(1);
    });

    test("reports the upstream total when not filtering", async () => {
      const wgerRequest = listUpstream([exercise(1, "Bench Press")]);

      const response = await get(buildWgerApp(wgerRequest));

      expect(response.body.count).toBe(120);
    });

    test("falls back to the returned length when the upstream sends no count", async () => {
      const wgerRequest = vi.fn(async () => ({
        data: { results: [exercise(1, "Bench Press")] },
        cache: "miss"
      }));

      const response = await get(buildWgerApp(wgerRequest));

      expect(response.body.count).toBe(1);
    });
  });

  describe("when wger is down", () => {
    test("answers 200 with an empty page", async () => {
      const wgerRequest = vi.fn().mockRejectedValue(upstreamError(503));

      const response = await get(buildWgerApp(wgerRequest), "limit=5&offset=10&language=4");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        fallback: true,
        exercises: [],
        count: 0,
        limit: 5,
        offset: 10,
        language: 4
      });
    });

    // The fallback re-parses the query so the client's paging survives an
    // outage rather than silently resetting to page one.
    test("keeps the caller's paging in the fallback", async () => {
      const wgerRequest = vi.fn().mockRejectedValue(upstreamError(500));

      const response = await get(buildWgerApp(wgerRequest), "offset=40");

      expect(response.body.offset).toBe(40);
    });

    test("reports a non-upstream failure as an error", async () => {
      const wgerRequest = vi.fn().mockRejectedValue(upstreamError(418));

      const response = await get(buildWgerApp(wgerRequest));

      expect(response.status).toBe(418);
    });
  });
});

describe("GET /api/wger/exercises/:id", () => {
  const get = (app, id = 1, query = "") =>
    request(app).get(`/api/wger/exercises/${id}${query ? `?${query}` : ""}`);

  test("returns the exercise it found", async () => {
    const wgerRequest = vi.fn(async () => results([exercise(1, "Bench Press")]));

    const response = await get(buildWgerApp(wgerRequest));

    expect(response.status).toBe(200);
    expect(response.body.exercise).toMatchObject({ id: 1, name: "Bench Press" });
  });

  test("asks for the id in the requested language", async () => {
    const wgerRequest = vi.fn(async () => results([exercise(1, "Bench Press")]));

    await get(buildWgerApp(wgerRequest), 7, "language=4");

    expect(wgerRequest.mock.calls[0][1].query).toEqual({ id: 7, language: 4 });
  });

  // wger returns nothing at all for an exercise with no translation in the
  // requested language, so the route asks again without the filter rather than
  // reporting a 404 for an exercise that exists.
  test("retries without the language filter when nothing came back", async () => {
    const wgerRequest = vi
      .fn()
      .mockResolvedValueOnce(results([]))
      .mockResolvedValueOnce(results([exercise(1, "Bench Press")]));

    const response = await get(buildWgerApp(wgerRequest));

    expect(response.status).toBe(200);
    expect(wgerRequest).toHaveBeenCalledTimes(2);
    expect(wgerRequest.mock.calls[1][1].query).toEqual({ id: 1 });
  });

  test("does not retry when the first attempt found something", async () => {
    const wgerRequest = vi.fn(async () => results([exercise(1, "Bench Press")]));

    await get(buildWgerApp(wgerRequest));

    expect(wgerRequest).toHaveBeenCalledTimes(1);
  });

  test("records the cache status of every attempt", async () => {
    const wgerRequest = vi
      .fn()
      .mockResolvedValueOnce(results([], "miss"))
      .mockResolvedValueOnce(results([exercise(1, "Bench Press")], "hit"));

    const response = await get(buildWgerApp(wgerRequest));

    expect(response.body.cache.attempts).toEqual(["miss", "hit"]);
  });

  test("answers 404 when both attempts find nothing", async () => {
    const wgerRequest = vi.fn(async () => results([]));

    const response = await get(buildWgerApp(wgerRequest));

    expect(response.status).toBe(404);
    expect(wgerRequest).toHaveBeenCalledTimes(2);
  });

  test.each([
    ["not a number", "not-a-number"],
    ["zero", 0],
    ["past the cap", 9999999]
  ])("rejects an id that is %s", async (_label, id) => {
    const wgerRequest = vi.fn();

    const response = await get(buildWgerApp(wgerRequest), id);

    expect(response.status).toBe(400);
    expect(wgerRequest).not.toHaveBeenCalled();
  });

  test("answers 200 with no exercise when wger is down", async () => {
    const wgerRequest = vi.fn().mockRejectedValue(upstreamError(503));

    const response = await get(buildWgerApp(wgerRequest));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ fallback: true, exercise: null });
  });
});

describe("GET /api/mealdb/search", () => {
  const meals = (list, cache = "miss") => ({ data: { meals: list }, cache });

  const meal = (id, title) => ({
    idMeal: id,
    strMeal: title,
    strMealThumb: "https://example.com/a.jpg",
    strCategory: "Pasta",
    strArea: "Italian"
  });

  const get = (app, query = "query=penne") => request(app).get(`/api/mealdb/search?${query}`);

  test("returns the mapped meals", async () => {
    const mealDbRequest = vi.fn(async () => meals([meal("1", "Penne")]));

    const response = await get(buildMealDbApp(mealDbRequest));

    expect(response.status).toBe(200);
    // The mapper namespaces the id so a MealDB recipe cannot collide with a
    // saved exercise, and keeps the upstream id separately as sourceId.
    expect(response.body.meals[0]).toMatchObject({
      id: "mealdb-1",
      sourceId: "1",
      title: "Penne",
      source: "mealdb"
    });
  });

  test("passes the search term upstream", async () => {
    const mealDbRequest = vi.fn(async () => meals([]));

    await get(buildMealDbApp(mealDbRequest));

    expect(mealDbRequest).toHaveBeenCalledWith("search.php", { s: "penne" });
  });

  test("accepts q as well as query", async () => {
    const mealDbRequest = vi.fn(async () => meals([]));

    const response = await get(buildMealDbApp(mealDbRequest), "q=risotto");

    expect(response.status).toBe(200);
    expect(mealDbRequest).toHaveBeenCalledWith("search.php", { s: "risotto" });
  });

  test("rejects a request with no search term", async () => {
    const mealDbRequest = vi.fn();

    const response = await request(buildMealDbApp(mealDbRequest)).get("/api/mealdb/search");

    expect(response.status).toBe(400);
    expect(mealDbRequest).not.toHaveBeenCalled();
  });

  test("defaults to eight results", async () => {
    const many = Array.from({ length: 20 }, (_, i) => meal(String(i + 1), `Meal ${i}`));
    const mealDbRequest = vi.fn(async () => meals(many));

    const response = await get(buildMealDbApp(mealDbRequest));

    expect(response.body.meals).toHaveLength(8);
    expect(response.body.count).toBe(8);
  });

  test("honours a smaller limit", async () => {
    const many = Array.from({ length: 20 }, (_, i) => meal(String(i + 1), `Meal ${i}`));
    const mealDbRequest = vi.fn(async () => meals(many));

    const response = await get(buildMealDbApp(mealDbRequest), "query=penne&limit=3");

    expect(response.body.meals).toHaveLength(3);
  });

  // MealDB answers a miss with meals: null rather than an empty list.
  test("treats a null meal list as no results", async () => {
    const mealDbRequest = vi.fn(async () => ({ data: { meals: null }, cache: "miss" }));

    const response = await get(buildMealDbApp(mealDbRequest));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ count: 0, meals: [] });
  });

  test("drops a meal with no id or title", async () => {
    const mealDbRequest = vi.fn(async () =>
      meals([{ idMeal: "", strMeal: "" }, meal("1", "Penne")])
    );

    const response = await get(buildMealDbApp(mealDbRequest));

    expect(response.body.meals.map((m) => m.id)).toEqual(["mealdb-1"]);
  });

  describe("when MealDB is down", () => {
    test("answers 200 with an empty result and the term echoed back", async () => {
      const mealDbRequest = vi.fn().mockRejectedValue(upstreamError(503));

      const response = await get(buildMealDbApp(mealDbRequest));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        fallback: true,
        service: "mealdb",
        query: "penne",
        count: 0,
        meals: []
      });
    });

    test("reports a non-upstream failure as an error", async () => {
      const mealDbRequest = vi.fn().mockRejectedValue(upstreamError(418));

      const response = await get(buildMealDbApp(mealDbRequest));

      expect(response.status).toBe(418);
      expect(response.body.fallback).toBeUndefined();
    });
  });
});
