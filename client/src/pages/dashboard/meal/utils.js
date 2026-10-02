/**
 * Helpers for the meal view: the calorie band, the broken-photo fallback, and
 * shaping and deduplicating MealDB meals. Used by MealView and useMealDbSearch.
 */
import { FALLBACK_IMAGE } from "./data";

/**
 * Buckets a daily calorie target as "light", "balanced" or "high", the keys a
 * meal's `portionByCalorie` is read with. MealView always passes a number.
 */
export const getCalorieBand = (targetCalories) => {
  if (targetCalories < 2000) return "light";
  if (targetCalories > 2500) return "high";
  return "balanced";
};

/**
 * An `onError` handler for a meal photo: swaps in FALLBACK_IMAGE. What keeps it
 * from looping is that the fallback is inline and loads; clearing `onerror`
 * does not detach React's handler, which React attaches with addEventListener.
 */
export const handleImageError = (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = FALLBACK_IMAGE;
};

/**
 * Makes one meal from /api/mealdb/search safe to render: a trimmed id, title
 * and image (blank when not a string), FALLBACK_IMAGE for a missing photo, a
 * blurb that falls back to the category and area and then "Recipe idea",
 * `calories` null when absent, and the ingredient and recipe-link lists kept to
 * usable entries and capped. Every other field passes through untouched.
 * Callers drop a meal left without an id or a title.
 */
export const normalizeMealDbMeal = (meal = {}) => {
  const id = typeof meal?.id === "string" ? meal.id.trim() : "";
  const title = typeof meal?.title === "string" ? meal.title.trim() : "";
  const image = typeof meal?.image === "string" ? meal.image.trim() : "";
  const category = typeof meal?.category === "string" ? meal.category.trim() : "";
  const area = typeof meal?.area === "string" ? meal.area.trim() : "";
  const rawBlurb = typeof meal?.blurb === "string" ? meal.blurb.trim() : "";
  const blurb = rawBlurb || [category, area].filter(Boolean).join(" | ") || "Recipe idea";

  const ingredients = (Array.isArray(meal?.ingredients) ? meal.ingredients : [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
  const recipes = (Array.isArray(meal?.recipes) ? meal.recipes : [])
    .map((item) => ({
      label: typeof item?.label === "string" ? item.label.trim() : "",
      url: typeof item?.url === "string" ? item.url.trim() : ""
    }))
    .filter((item) => item.label && item.url)
    .slice(0, 8);

  return {
    ...meal,
    id,
    title,
    image: image || FALLBACK_IMAGE,
    blurb,
    calories: meal?.calories ?? null,
    ingredients,
    recipes
  };
};

/**
 * Drops repeats by id, or by title for a meal without one, and drops a meal
 * with neither. Sharing one `seenKeys` across calls dedupes across them, which
 * is how useMealDbSearch keeps a meal to the first suggestion section with it.
 */
export const dedupeMeals = (items, seenKeys = new Set()) => {
  const unique = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = item?.id || item?.title || "";
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    unique.push(item);
  }
  return unique;
};
