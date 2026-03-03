import { validateSchemaInput } from "../../services/requestValidationService.js";
import { mealDbSearchQuerySchema, validateQuery } from "./validation.js";

export const registerMealDbRoutes = (app, deps) => {
  const { mealDbRequest, mapMealDbMeal, cleanText, isUpstreamFailureStatus } = deps;

  app.get("/api/mealdb/search", async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, mealDbSearchQuerySchema, {
        message: "Query is required."
      });
      if (!queryInput) return;
      const query = cleanText(queryInput.query ?? queryInput.q, 100);
      const limit = queryInput.limit ?? 8;

      const { data, cache } = await mealDbRequest("search.php", { s: query });
      const meals = (Array.isArray(data?.meals) ? data.meals : [])
        .map((item) => mapMealDbMeal(item))
        .filter((item) => item.id && item.title)
        .slice(0, limit);

      res.json({ cache, query, count: meals.length, meals });
    } catch (err) {
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        const queryInput = validateSchemaInput(mealDbSearchQuerySchema, req.query || {}, "query")
          .data || {};
        const query = cleanText(queryInput.query ?? queryInput.q, 100);
        return res.json({
          fallback: true,
          service: "mealdb",
          error: err?.message || "Meal search unavailable.",
          query,
          count: 0,
          meals: []
        });
      }
      return res.status(status).json({ error: err?.message || "Server error." });
    }
  });
};
