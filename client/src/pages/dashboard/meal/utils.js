import { FALLBACK_IMAGE } from "./data";

export const getCalorieBand = (targetCalories) => {
  if (targetCalories < 2000) return "light";
  if (targetCalories > 2500) return "high";
  return "balanced";
};

export const handleImageError = (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = FALLBACK_IMAGE;
};

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

