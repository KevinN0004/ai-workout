/**
 * MealDB state for the meal view: the visitor's own recipe search, and the
 * suggestion sections for their goal track. Called by MealView.
 */
import { useEffect, useMemo, useState } from "react";
import { MEALDB_RECOMMENDATION_QUERIES } from "./data";
import { dedupeMeals, normalizeMealDbMeal } from "./utils";

/**
 * Takes the goal track, as detectTrack names it; a track with no sections gets
 * lean_strength's. Returns the search box's text, the submitted query and its
 * results, loading flag and error, the suggestion sections with theirs, and two
 * ways to search: `submitMealDbSearch` for the form, and `runMealDbSearch` for
 * a query chosen in code. Each load aborts its request when superseded or
 * unmounted.
 */
export default function useMealDbSearch(mealTrack) {
  // ---- State ----------------------------------------------------------------
  const [mealDbInput, setMealDbInput] = useState("");
  const [mealDbQuery, setMealDbQuery] = useState("");
  const [mealDbMeals, setMealDbMeals] = useState([]);
  const [mealDbLoading, setMealDbLoading] = useState(false);
  const [mealDbError, setMealDbError] = useState("");
  const [mealDbRecommendations, setMealDbRecommendations] = useState([]);
  const [mealDbRecommendationsLoading, setMealDbRecommendationsLoading] = useState(false);
  const [mealDbRecommendationsError, setMealDbRecommendationsError] = useState("");

  // ---- Suggestion sections --------------------------------------------------
  const mealDbGoalRecommendations = useMemo(
    () => MEALDB_RECOMMENDATION_QUERIES[mealTrack] || MEALDB_RECOMMENDATION_QUERIES.lean_strength,
    [mealTrack]
  );

  // Loads the track's sections on mount and again whenever the track changes.
  // The previous sections stay on screen until the new ones arrive.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const loadRecommendationSections = async () => {
      setMealDbRecommendationsLoading(true);
      setMealDbRecommendationsError("");
      try {
        // One search per section, all at once. A single failure rejects the
        // whole set, so the catch below clears every section, not just one.
        const sections = await Promise.all(
          mealDbGoalRecommendations.map(async (entry) => {
            const params = new URLSearchParams({
              query: entry.query,
              limit: "6"
            });
            const res = await fetch(`/api/mealdb/search?${params.toString()}`, {
              credentials: "include",
              signal: controller.signal
            });
            if (!res.ok) {
              throw new Error("Couldn't load meal suggestions right now.");
            }
            const data = await res.json();
            const meals = (Array.isArray(data?.meals) ? data.meals : [])
              .map((item) => normalizeMealDbMeal(item))
              .filter((item) => item.id && item.title);
            return {
              key: `recommend-${entry.key}`,
              title: entry.title,
              subtitle: entry.subtitle,
              meals
            };
          })
        );
        if (cancelled) return;
        // A meal already in an earlier section is left out of later ones.
        const seen = new Set();
        const deduped = sections.map((section) => ({
          ...section,
          meals: dedupeMeals(section.meals, seen).slice(0, 6)
        }));
        setMealDbRecommendations(deduped);
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        setMealDbRecommendations([]);
        setMealDbRecommendationsError(err?.message || "Couldn't load meal suggestions right now.");
      } finally {
        if (!cancelled) setMealDbRecommendationsLoading(false);
      }
    };

    loadRecommendationSections();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mealDbGoalRecommendations]);

  // ---- Recipe search --------------------------------------------------------

  // Searches whenever the submitted query changes; an empty one clears the
  // results instead. Submitting the same query again does not search again,
  // because the state does not change.
  useEffect(() => {
    const query = mealDbQuery.trim();
    if (!query) {
      setMealDbMeals([]);
      setMealDbError("");
      setMealDbLoading(false);
      return;
    }

    // A response that lands after this run's cleanup is dropped, and the
    // cleanup aborts the request.
    let cancelled = false;
    const controller = new AbortController();
    const loadMealDbMeals = async () => {
      setMealDbLoading(true);
      setMealDbError("");
      try {
        const params = new URLSearchParams({
          query,
          limit: "8"
        });
        const res = await fetch(`/api/mealdb/search?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal
        });
        if (!res.ok) {
          throw new Error("Couldn't load recipes right now.");
        }
        const data = await res.json();
        if (cancelled) return;
        const normalized = (Array.isArray(data?.meals) ? data.meals : [])
          .map((item) => normalizeMealDbMeal(item))
          .filter((item) => item.id && item.title);
        setMealDbMeals(normalized);
      } catch (err) {
        if (cancelled || err?.name === "AbortError") return;
        setMealDbMeals([]);
        setMealDbError(err?.message || "Couldn't load recipes right now.");
      } finally {
        if (!cancelled) setMealDbLoading(false);
      }
    };

    loadMealDbMeals();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mealDbQuery]);

  // ---- Actions --------------------------------------------------------------

  // The form's submit: an empty box clears the search, and anything else
  // becomes the query and empties the box.
  const submitMealDbSearch = (event) => {
    event.preventDefault();
    const nextQuery = mealDbInput.trim();
    if (!nextQuery) {
      setMealDbQuery("");
      setMealDbMeals([]);
      setMealDbError("");
      return;
    }
    setMealDbQuery(nextQuery);
    setMealDbInput("");
  };

  // Searches for `query` and leaves it in the box.
  const runMealDbSearch = (query) => {
    const nextQuery = String(query || "").trim();
    if (!nextQuery) return;
    setMealDbInput(nextQuery);
    setMealDbQuery(nextQuery);
    setMealDbError("");
  };

  return {
    mealDbInput,
    setMealDbInput,
    mealDbQuery,
    setMealDbQuery,
    mealDbMeals,
    mealDbLoading,
    mealDbError,
    mealDbRecommendations,
    mealDbRecommendationsLoading,
    mealDbRecommendationsError,
    submitMealDbSearch,
    runMealDbSearch
  };
}
