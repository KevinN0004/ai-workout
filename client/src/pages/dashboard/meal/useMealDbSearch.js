import { useEffect, useMemo, useState } from "react";
import { MEALDB_RECOMMENDATION_QUERIES } from "./data";
import { dedupeMeals, normalizeMealDbMeal } from "./utils";

export default function useMealDbSearch(mealTrack) {
  const [mealDbInput, setMealDbInput] = useState("");
  const [mealDbQuery, setMealDbQuery] = useState("");
  const [mealDbMeals, setMealDbMeals] = useState([]);
  const [mealDbLoading, setMealDbLoading] = useState(false);
  const [mealDbError, setMealDbError] = useState("");
  const [mealDbRecommendations, setMealDbRecommendations] = useState([]);
  const [mealDbRecommendationsLoading, setMealDbRecommendationsLoading] = useState(false);
  const [mealDbRecommendationsError, setMealDbRecommendationsError] = useState("");

  const mealDbGoalRecommendations = useMemo(
    () => MEALDB_RECOMMENDATION_QUERIES[mealTrack] || MEALDB_RECOMMENDATION_QUERIES.lean_strength,
    [mealTrack]
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const loadRecommendationSections = async () => {
      setMealDbRecommendationsLoading(true);
      setMealDbRecommendationsError("");
      try {
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

  useEffect(() => {
    const query = mealDbQuery.trim();
    if (!query) {
      setMealDbMeals([]);
      setMealDbError("");
      setMealDbLoading(false);
      return;
    }

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
