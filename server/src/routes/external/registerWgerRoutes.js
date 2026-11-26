/**
 * The wger exercise-database routes: the filter lists, exercise search, and one
 * exercise's details. Registered by externalRoutes.js.
 */
import { validateSchemaInput } from "../../services/http/requestValidationService.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";
import {
  validateParams,
  validateQuery,
  wgerExerciseDetailsQuerySchema,
  wgerExerciseIdParamsSchema,
  wgerExercisesQuerySchema
} from "./validation.js";

/** @typedef {ReturnType<typeof import("../../services/external/externalDataService.js").createExternalDataService>} ExternalDataService */

/**
 * What index.js hands the wger routes; one property per member they read.
 * @typedef {object} WgerDeps
 * @property {ExternalDataService["wgerRequest"]} wgerRequest
 * @property {typeof import("../../services/dashboard/dashboardDataBuildersService.js").cleanText} cleanText
 * @property {ReturnType<typeof import("../../services/external/httpCacheService.js").createHttpCacheService>["mergeCacheStatuses"]} mergeCacheStatuses
 * @property {ExternalDataService["parseMultiNumberQuery"]} parseMultiNumberQuery
 * @property {ExternalDataService["mapWgerExercise"]} mapWgerExercise
 * @property {ExternalDataService["toFiniteNumber"]} toFiniteNumber
 * @property {number} wgerDefaultLanguage
 * @property {typeof import("../../services/platform/platformHealthService.js").isUpstreamFailureStatus} isUpstreamFailureStatus
 */

/**
 * A page of one of wger's lists, its fields each possibly absent.
 * @typedef {{ results?: unknown, count?: unknown, next?: unknown, previous?: unknown }} WgerPage
 */

/** @typedef {{ id: unknown, name: string }} WgerOption */

/**
 * What GET /api/wger/meta answers: the category, muscle and equipment lists,
 * each entry its id and name, or with `fallback` all three empty when wger is
 * out.
 * @typedef {object} WgerMetaResponse
 * @property {{ status: string, categories: import("../../services/external/externalDataService.js").CachedRead["cache"], muscles: import("../../services/external/externalDataService.js").CachedRead["cache"], equipment: import("../../services/external/externalDataService.js").CachedRead["cache"] }} [cache]
 *   How the cache answered each list; absent on a fallback.
 * @property {true} [fallback]
 * @property {string} [service]
 * @property {string} [error]
 * @property {WgerOption[]} categories
 * @property {WgerOption[]} muscles
 * @property {WgerOption[]} equipment
 */

/**
 * What GET /api/wger/exercises answers: one page of exercises and the paging,
 * or with `fallback` no exercises and the request's paging, when wger is out.
 * @typedef {object} WgerExercisesResponse
 * @property {import("../../services/external/externalDataService.js").CachedRead["cache"]} [cache] How the cache answered; absent on a fallback.
 * @property {true} [fallback]
 * @property {string} [service]
 * @property {string} [error]
 * @property {number} count
 * @property {string} next
 * @property {string} previous
 * @property {number} limit
 * @property {number} offset
 * @property {number} language
 * @property {ReturnType<WgerDeps["mapWgerExercise"]>[]} exercises
 */

/**
 * Registers GET /api/wger/meta, /api/wger/exercises and /api/wger/exercises/:id.
 * `wgerDefaultLanguage` is the wger language id used when a request names none.
 *
 * @param {import("express").Express} app
 * @param {WgerDeps} deps
 */
export const registerWgerRoutes = (app, deps) => {
  const {
    wgerRequest,
    cleanText,
    mergeCacheStatuses,
    parseMultiNumberQuery,
    mapWgerExercise,
    toFiniteNumber,
    wgerDefaultLanguage,
    isUpstreamFailureStatus
  } = deps;

  app.get("/api/wger/meta", async (req, res) => {
    try {
      // Load the three filter lists in parallel.
      const [categoriesResponse, musclesResponse, equipmentResponse] = await Promise.all([
        wgerRequest("exercisecategory/", { query: { limit: 200 } }),
        wgerRequest("muscle/", { query: { limit: 200 } }),
        wgerRequest("equipment/", { query: { limit: 200 } })
      ]);
      // wger's list answer, its fields each possibly absent.
      const categoriesData = /** @type {WgerPage} */ (categoriesResponse.data);
      const musclesData = /** @type {WgerPage} */ (musclesResponse.data);
      const equipmentData = /** @type {WgerPage} */ (equipmentResponse.data);

      // Reduce each entry to its id and name. A muscle's English name is in
      // `name_en`, so that is preferred.
      const categories = (Array.isArray(categoriesData?.results) ? categoriesData.results : []).map(
        (item) => ({
          id: item?.id ?? null,
          name: cleanText(item?.name, 120)
        })
      );
      const muscles = (Array.isArray(musclesData?.results) ? musclesData.results : []).map(
        (item) => ({
          id: item?.id ?? null,
          name: cleanText(item?.name_en || item?.name, 120)
        })
      );
      const equipment = (Array.isArray(equipmentData?.results) ? equipmentData.results : []).map(
        (item) => ({
          id: item?.id ?? null,
          name: cleanText(item?.name, 120)
        })
      );

      res.json(
        /** @satisfies {WgerMetaResponse} */ ({
          cache: {
            status: mergeCacheStatuses(
              categoriesResponse.cache,
              musclesResponse.cache,
              equipmentResponse.cache
            ),
            categories: categoriesResponse.cache,
            muscles: musclesResponse.cache,
            equipment: equipmentResponse.cache
          },
          categories,
          muscles,
          equipment
        })
      );
    } catch (/** @type {any} */ err) {
      // An outage (any status isUpstreamFailureStatus accepts; an error with no
      // status counts as 500) answers 200 with empty lists.
      // The external data service threw it: an Error carrying the upstream's
      // status (502 for its 5xx, 504 on a timeout), or none.
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json(
          /** @satisfies {WgerMetaResponse} */ ({
            fallback: true,
            service: "wger",
            error: "Exercise metadata unavailable.",
            categories: [],
            muscles: [],
            equipment: []
          })
        );
      }
      return sendErrorResponse(req, res, err, status);
    }
  });

  app.get("/api/wger/exercises", async (req, res) => {
    try {
      // Validate, then default the paging and language and parse the filters.
      const queryInput = validateQuery(req, res, wgerExercisesQuerySchema);
      if (!queryInput) return;
      const limit = queryInput.limit ?? 15;
      const offset = queryInput.offset ?? 0;
      const language = queryInput.language ?? wgerDefaultLanguage;
      const categories = parseMultiNumberQuery(queryInput.category, 1, 10000);
      const muscles = parseMultiNumberQuery(queryInput.muscle, 1, 10000);
      const equipment = parseMultiNumberQuery(queryInput.equipment, 1, 10000);
      const q = cleanText(queryInput.q, 120).toLowerCase();
      // `q` is matched here, after the fetch, so a text search asks wger for a
      // wider page (four times the limit, 100 to 200) to filter down from.
      const upstreamLimit = q ? Math.min(Math.max(limit * 4, 100), 200) : limit;

      /** @type {{ limit: number, offset: number, language: number, category?: number[], muscles?: number[], equipment?: number[] }} */
      const query = {
        limit: upstreamLimit,
        offset,
        language
      };
      if (categories.length) query.category = categories;
      if (muscles.length) query.muscles = muscles;
      if (equipment.length) query.equipment = equipment;

      // Load the page, map each exercise, and keep the matches for `q`.
      // wger's list answer, its fields each possibly absent.
      const { data, cache } =
        /** @type {import("../../services/external/externalDataService.js").CachedRead & { data: WgerPage }} */ (
          await wgerRequest("exerciseinfo/", { query })
        );
      const exercises = (Array.isArray(data?.results) ? data.results : [])
        .map((item) => mapWgerExercise(item, language))
        .filter((item) => {
          if (!q) return true;
          const haystack = [
            item.name,
            item.description,
            item.category?.name,
            ...(Array.isArray(item.muscles) ? item.muscles.map((m) => m.name) : [])
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
        .slice(0, limit);

      // With `q`, count is the matches on this page rather than wger's total.
      res.json(
        /** @satisfies {WgerExercisesResponse} */ ({
          cache,
          count: q ? exercises.length : (toFiniteNumber(data?.count) ?? exercises.length),
          next: cleanText(data?.next, 300),
          previous: cleanText(data?.previous, 300),
          limit,
          offset,
          language,
          exercises
        })
      );
    } catch (/** @type {any} */ err) {
      // An outage (any status isUpstreamFailureStatus accepts; an error with no
      // status counts as 500) answers 200 with no exercises and the request's
      // paging echoed back.
      // The external data service threw it: an Error carrying the upstream's
      // status (502 for its 5xx, 504 on a timeout), or none.
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        const queryInput =
          validateSchemaInput(wgerExercisesQuerySchema, req.query || {}, "query").data || {};
        const limit = queryInput.limit ?? 15;
        const offset = queryInput.offset ?? 0;
        const language = queryInput.language ?? wgerDefaultLanguage;
        return res.json(
          /** @satisfies {WgerExercisesResponse} */ ({
            fallback: true,
            service: "wger",
            error: "Exercise search unavailable.",
            count: 0,
            next: "",
            previous: "",
            limit,
            offset,
            language,
            exercises: []
          })
        );
      }
      return sendErrorResponse(req, res, err, status);
    }
  });

  app.get("/api/wger/exercises/:id", async (req, res) => {
    try {
      const params = validateParams(req, res, wgerExerciseIdParamsSchema, {
        message: "Valid exercise id is required."
      });
      if (!params) return;
      const queryInput = validateQuery(req, res, wgerExerciseDetailsQuerySchema);
      if (!queryInput) return;
      const { id } = params;
      const language = queryInput.language ?? wgerDefaultLanguage;

      // Ask in the requested language first. If that finds nothing, ask again
      // with no language filter; each lookup is reported in `cache.attempts`.
      let response = await wgerRequest("exerciseinfo/", {
        query: {
          id: Math.trunc(id),
          language
        }
      });
      // wger's list answer, its fields each possibly absent.
      let data = /** @type {WgerPage} */ (response.data);
      const cacheStatuses = [response.cache];
      let source = Array.isArray(data?.results) ? data.results[0] : null;
      if (!source) {
        response = await wgerRequest("exerciseinfo/", {
          query: {
            id: Math.trunc(id)
          }
        });
        data = /** @type {WgerPage} */ (response.data);
        cacheStatuses.push(response.cache);
        source = Array.isArray(data?.results) ? data.results[0] : null;
      }
      if (!source) return res.status(404).json({ error: "Exercise not found." });
      res.json({
        cache: {
          status: mergeCacheStatuses(...cacheStatuses),
          attempts: cacheStatuses
        },
        exercise: mapWgerExercise(source, language)
      });
    } catch (/** @type {any} */ err) {
      // An outage (any status isUpstreamFailureStatus accepts; an error with no
      // status counts as 500) answers 200 with a null exercise.
      // The external data service threw it: an Error carrying the upstream's
      // status (502 for its 5xx, 504 on a timeout), or none.
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "wger",
          error: "Exercise details unavailable.",
          exercise: null
        });
      }
      return sendErrorResponse(req, res, err, status);
    }
  });
};
