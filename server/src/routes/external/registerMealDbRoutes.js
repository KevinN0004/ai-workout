/**
 * GET /api/mealdb/search: meal search against TheMealDB, answered with mapped
 * meals. Registered by externalRoutes.js.
 */
// @ts-check
import { validateSchemaInput } from "../../services/http/requestValidationService.js";
import { mealDbSearchQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

/** @typedef {ReturnType<typeof import("../../services/external/externalDataService.js").createExternalDataService>} ExternalDataService */

/**
 * What index.js hands the TheMealDB route; one property per member they read.
 * @typedef {object} MealDbDeps
 * @property {ExternalDataService["mealDbRequest"]} mealDbRequest
 * @property {ExternalDataService["mapMealDbMeal"]} mapMealDbMeal
 * @property {typeof import("../../services/dashboard/dashboardDataBuildersService.js").cleanText} cleanText
 * @property {typeof import("../../services/platform/platformHealthService.js").isUpstreamFailureStatus} isUpstreamFailureStatus
 */

/**
 * What GET /api/mealdb/search answers: the meals found for the query, or with
 * `fallback` none, when TheMealDB is out.
 * @typedef {object} MealDbSearchResponse
 * @property {import("../../services/external/externalDataService.js").CachedRead["cache"]} [cache] How the cache answered; absent on a fallback.
 * @property {true} [fallback]
 * @property {string} [service]
 * @property {string} [error]
 * @property {string} query
 * @property {number} count
 * @property {ReturnType<MealDbDeps["mapMealDbMeal"]>[]} meals
 */

/**
 * Registers the meal-search route. The search text arrives as `query` or `q`,
 * and at most `limit` meals come back (8 by default). When the cache has no
 * stale copy to serve, an outage answers 200 with no meals and `fallback: true`,
 * and an upstream 4xx is answered as an error.
 *
 * @param {import("express").Express} app
 * @param {MealDbDeps} deps
 */
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

      // TheMealDB's answer: `meals` is a list, or null when nothing matched.
      const { data, cache } =
        /** @type {import("../../services/external/externalDataService.js").CachedRead & { data: { meals?: unknown } }} */ (
          await mealDbRequest("search.php", { s: query })
        );
      const meals = (Array.isArray(data?.meals) ? data.meals : [])
        .map((item) => mapMealDbMeal(item))
        .filter((item) => item.id && item.title)
        .slice(0, limit);

      res.json(
        /** @satisfies {MealDbSearchResponse} */ ({ cache, query, count: meals.length, meals })
      );
    } catch (/** @type {any} */ err) {
      // The external data service threw it: an Error carrying the upstream's
      // status (502 for its 5xx, 504 on a timeout), or none.
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        const queryInput =
          validateSchemaInput(mealDbSearchQuerySchema, req.query || {}, "query").data || {};
        const query = cleanText(queryInput.query ?? queryInput.q, 100);
        return res.json(
          /** @satisfies {MealDbSearchResponse} */ ({
            fallback: true,
            service: "mealdb",
            error: "Meal search unavailable.",
            query,
            count: 0,
            meals: []
          })
        );
      }
      return sendErrorResponse(req, res, err, status);
    }
  });
};
