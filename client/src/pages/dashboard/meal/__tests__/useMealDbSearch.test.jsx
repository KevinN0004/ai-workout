import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useMealDbSearch from "../useMealDbSearch";
import { MEALDB_RECOMMENDATION_QUERIES } from "../data";

// The meal search and its goal-based suggestions, previously at 0%. Two
// effects, both hitting /api/mealdb/search, both abortable -- and the abort
// handling is the part worth having: switching query quickly cancels the
// in-flight request, and a cancelled request must not surface as an error the
// user sees.

const meal = (id, title = `Meal ${id}`) => ({ id, title, image: "https://example.com/a.jpg" });

const mealsResponse = (meals) => ({ ok: true, json: async () => ({ meals }) });

const sectionsFor = (track) =>
  MEALDB_RECOMMENDATION_QUERIES[track] || MEALDB_RECOMMENDATION_QUERIES.lean_strength;

let fetchMock;

// Requests the search effect made, as opposed to the recommendation ones.
const searchCalls = (query) =>
  fetchMock.mock.calls.filter(([url]) => url.includes(`query=${query}`));

const render = (track = "lean_strength") => renderHook(() => useMealDbSearch(track));

beforeEach(() => {
  fetchMock = vi.fn(async () => mealsResponse([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("goal recommendations", () => {
  test("loads one section per query for the track", async () => {
    const { result } = render("lean_strength");

    await waitFor(() =>
      expect(result.current.mealDbRecommendations).toHaveLength(sectionsFor("lean_strength").length)
    );
  });

  test("falls back to the lean_strength queries for an unknown track", async () => {
    const { result } = render("nonsense");

    await waitFor(() =>
      expect(result.current.mealDbRecommendations).toHaveLength(sectionsFor("lean_strength").length)
    );
  });

  test("asks for six meals per section", async () => {
    render();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("limit=6");
  });

  test("sends credentials so the proxy sees the session", async () => {
    render();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  test("carries the section titles through", async () => {
    const { result } = render("lean_strength");

    await waitFor(() => expect(result.current.mealDbRecommendations.length).toBeGreaterThan(0));
    const expected = sectionsFor("lean_strength")[0];
    expect(result.current.mealDbRecommendations[0]).toMatchObject({
      key: `recommend-${expected.key}`,
      title: expected.title,
      subtitle: expected.subtitle
    });
  });

  test("normalises the meals it gets back", async () => {
    fetchMock.mockResolvedValue(mealsResponse([{ id: " 1 ", title: " Penne " }]));
    const { result } = render();

    await waitFor(() => expect(result.current.mealDbRecommendations.length).toBeGreaterThan(0));
    expect(result.current.mealDbRecommendations[0].meals[0]).toMatchObject({
      id: "1",
      title: "Penne"
    });
  });

  test("drops a meal with no id or title", async () => {
    fetchMock.mockResolvedValue(mealsResponse([{ id: "", title: "" }, meal("1")]));
    const { result } = render();

    await waitFor(() => expect(result.current.mealDbRecommendations.length).toBeGreaterThan(0));
    expect(result.current.mealDbRecommendations[0].meals.map((m) => m.id)).toEqual(["1"]);
  });

  // The sections share one seen set, so a recipe matching two queries is shown
  // once rather than filling the page with the same card.
  test("does not repeat a meal across sections", async () => {
    fetchMock.mockResolvedValue(mealsResponse([meal("1"), meal("2")]));
    const { result } = render();

    await waitFor(() => expect(result.current.mealDbRecommendations.length).toBeGreaterThan(1));
    const ids = result.current.mealDbRecommendations.flatMap((s) => s.meals.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("caps a section at six meals", async () => {
    fetchMock.mockResolvedValue(
      mealsResponse(Array.from({ length: 20 }, (_, i) => meal(String(i))))
    );
    const { result } = render();

    await waitFor(() => expect(result.current.mealDbRecommendations.length).toBeGreaterThan(0));
    expect(result.current.mealDbRecommendations[0].meals).toHaveLength(6);
  });

  test("clears the loading flag when it finishes", async () => {
    const { result } = render();

    await waitFor(() => expect(result.current.mealDbRecommendationsLoading).toBe(false));
  });

  describe("when the proxy fails", () => {
    test("reports an error and shows nothing", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
      const { result } = render();

      await waitFor(() =>
        expect(result.current.mealDbRecommendationsError).toMatch(/meal suggestions/i)
      );
      expect(result.current.mealDbRecommendations).toEqual([]);
    });

    test("reports a network failure too", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const { result } = render();

      await waitFor(() => expect(result.current.mealDbRecommendationsError).toBe("network down"));
    });

    test("still clears the loading flag", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));
      const { result } = render();

      await waitFor(() => expect(result.current.mealDbRecommendationsLoading).toBe(false));
    });
  });

  // Leaving the page mid-load must not leave a request running or push state
  // into an unmounted hook.
  test("aborts the in-flight requests when unmounted", async () => {
    const { unmount } = render();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const signal = fetchMock.mock.calls[0][1].signal;

    unmount();

    expect(signal.aborted).toBe(true);
  });
});

describe("searching", () => {
  test("does nothing until a query is set", async () => {
    const { result } = render();

    await waitFor(() => expect(result.current.mealDbRecommendationsLoading).toBe(false));
    expect(result.current.mealDbMeals).toEqual([]);
    expect(result.current.mealDbLoading).toBe(false);
  });

  test("fetches the query and stores the normalised meals", async () => {
    const { result } = render();
    fetchMock.mockResolvedValue(mealsResponse([meal("1", "Penne")]));

    act(() => result.current.runMealDbSearch("penne"));

    await waitFor(() => expect(result.current.mealDbMeals).toHaveLength(1));
    expect(result.current.mealDbMeals[0].title).toBe("Penne");
    expect(searchCalls("penne")[0][0]).toContain("limit=8");
  });

  test("clears the results and the error when the query is emptied", async () => {
    const { result } = render();
    fetchMock.mockResolvedValue(mealsResponse([meal("1")]));

    act(() => result.current.runMealDbSearch("penne"));
    await waitFor(() => expect(result.current.mealDbMeals).toHaveLength(1));

    act(() => result.current.setMealDbQuery(""));

    await waitFor(() => expect(result.current.mealDbMeals).toEqual([]));
    expect(result.current.mealDbError).toBe("");
  });

  test("treats a whitespace-only query as empty", async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.mealDbRecommendationsLoading).toBe(false));
    const before = fetchMock.mock.calls.length;

    act(() => result.current.setMealDbQuery("   "));

    await waitFor(() => expect(result.current.mealDbLoading).toBe(false));
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  describe("when the search fails", () => {
    test("reports the error and clears the list", async () => {
      const { result } = render();
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

      act(() => result.current.runMealDbSearch("penne"));

      await waitFor(() => expect(result.current.mealDbError).toMatch(/recipes/i));
      expect(result.current.mealDbMeals).toEqual([]);
    });

    test("clears the loading flag", async () => {
      const { result } = render();
      fetchMock.mockRejectedValue(new Error("network down"));

      act(() => result.current.runMealDbSearch("penne"));

      await waitFor(() => expect(result.current.mealDbLoading).toBe(false));
      expect(result.current.mealDbError).toBe("network down");
    });

    // A request cancelled because the user typed something else is not a
    // failure, and showing it as one would flash an error on every keystroke.
    test("says nothing when the request was aborted", async () => {
      const { result } = render();
      const abortError = new Error("The user aborted a request.");
      abortError.name = "AbortError";
      fetchMock.mockRejectedValue(abortError);

      act(() => result.current.runMealDbSearch("penne"));

      await waitFor(() => expect(result.current.mealDbLoading).toBe(false));
      expect(result.current.mealDbError).toBe("");
    });
  });

  test("aborts the previous search when the query changes", async () => {
    const { result } = render();
    fetchMock.mockResolvedValue(mealsResponse([]));

    act(() => result.current.runMealDbSearch("penne"));
    await waitFor(() => expect(searchCalls("penne")).toHaveLength(1));
    const firstSignal = searchCalls("penne")[0][1].signal;

    act(() => result.current.runMealDbSearch("risotto"));
    await waitFor(() => expect(searchCalls("risotto")).toHaveLength(1));

    expect(firstSignal.aborted).toBe(true);
  });
});

describe("submitMealDbSearch", () => {
  const submitEvent = () => ({ preventDefault: vi.fn() });

  test("promotes the typed input to the active query and empties the box", async () => {
    const { result } = render();
    fetchMock.mockResolvedValue(mealsResponse([meal("1")]));

    act(() => result.current.setMealDbInput("  penne  "));
    const event = submitEvent();
    act(() => result.current.submitMealDbSearch(event));

    expect(event.preventDefault).toHaveBeenCalled();
    await waitFor(() => expect(result.current.mealDbQuery).toBe("penne"));
    expect(result.current.mealDbInput).toBe("");
  });

  test("clears the results when submitted empty", async () => {
    const { result } = render();
    fetchMock.mockResolvedValue(mealsResponse([meal("1")]));

    act(() => result.current.runMealDbSearch("penne"));
    await waitFor(() => expect(result.current.mealDbMeals).toHaveLength(1));

    act(() => result.current.setMealDbInput("   "));
    act(() => result.current.submitMealDbSearch(submitEvent()));

    await waitFor(() => expect(result.current.mealDbQuery).toBe(""));
    expect(result.current.mealDbMeals).toEqual([]);
  });
});

describe("runMealDbSearch", () => {
  test("fills the box as well as running the search, so the term is visible", async () => {
    const { result } = render();

    act(() => result.current.runMealDbSearch("  risotto  "));

    await waitFor(() => expect(result.current.mealDbQuery).toBe("risotto"));
    expect(result.current.mealDbInput).toBe("risotto");
  });

  test("ignores an empty term rather than clearing the current results", async () => {
    const { result } = render();
    fetchMock.mockResolvedValue(mealsResponse([meal("1")]));

    act(() => result.current.runMealDbSearch("penne"));
    await waitFor(() => expect(result.current.mealDbMeals).toHaveLength(1));

    act(() => result.current.runMealDbSearch("   "));

    expect(result.current.mealDbQuery).toBe("penne");
    expect(result.current.mealDbMeals).toHaveLength(1);
  });

  test("clears a standing error when a new search starts", async () => {
    const { result } = render();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    act(() => result.current.runMealDbSearch("penne"));
    await waitFor(() => expect(result.current.mealDbError).not.toBe(""));

    fetchMock.mockResolvedValue(mealsResponse([meal("1")]));
    act(() => result.current.runMealDbSearch("risotto"));

    await waitFor(() => expect(result.current.mealDbError).toBe(""));
  });
});
