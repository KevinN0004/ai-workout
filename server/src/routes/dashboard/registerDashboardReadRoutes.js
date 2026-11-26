/**
 * The dashboard's read routes: the whole dashboard in one response, and one
 * paginated route per collection. Registered by dashboardRoutes.js.
 */
import { dashboardPaginationQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

/** @typedef {ReturnType<typeof import("../../services/dashboard/dashboardCollectionService.js").createDashboardCollectionService>} DashboardCollectionService */

/**
 * What index.js hands the dashboard's read routes; one property per member they read.
 * @typedef {object} DashboardReadDeps
 * @property {import("express").RequestHandler} requireAuth Rejects a request with no session.
 * @property {ReturnType<typeof import("../../repositories/userReadRepository.js").createUserReadRepository>["findUserWithDashboard"]} findUserWithDashboard
 * @property {ReturnType<typeof import("../../services/auth/authUserService.js").createAuthUserService>["mapDbDocToUser"]} mapDbDocToUser
 * @property {DashboardCollectionService["buildDashboardResponse"]} buildDashboardResponse
 * @property {DashboardCollectionService["parseDashboardPagination"]} parseDashboardPagination
 * @property {DashboardCollectionService["getDashboardCollection"]} getDashboardCollection
 */

/** @typedef {import("../../services/auth/authUserService.js").AuthUser} AuthUser */

/** @typedef {Awaited<ReturnType<DashboardCollectionService["getDashboardCollection"]>>} CollectionPage */

/**
 * What GET /api/dashboard answers: the stored dashboard, with the first page of
 * each collection and their pagination.
 * @typedef {Awaited<ReturnType<DashboardCollectionService["buildDashboardResponse"]>>} DashboardResponse
 */

/**
 * What GET /api/dashboard/meal-logs answers: one page of the user's meal logs.
 * @typedef {object} MealLogsResponse
 * @property {ReturnType<typeof import("../../repositories/mealLogRepository.js").mapMealLog>[]} mealLogs
 * @property {Pick<CollectionPage, "total" | "limit" | "offset" | "source">} pagination
 */

/**
 * What GET /api/dashboard/progress-metrics answers: one page of the user's metrics.
 * @typedef {object} ProgressMetricsResponse
 * @property {ReturnType<typeof import("../../repositories/progressMetricRepository.js").mapProgressMetric>[]} progressMetrics
 * @property {Pick<CollectionPage, "total" | "limit" | "offset" | "source">} pagination
 */

/**
 * Registers GET /api/dashboard and the workout-session, meal-log and
 * progress-metric collection routes, all behind `requireAuth`. From `deps`,
 * `findUserWithDashboard` and `mapDbDocToUser` load the whole user as the write
 * routes do, and the other three come from the dashboard collection service
 * built in index.js.
 *
 * @param {import("express").Express} app
 * @param {DashboardReadDeps} deps
 */
// Every handler here runs behind requireAuth, which sets req.user.
export const registerDashboardReadRoutes = (app, deps) => {
  const {
    requireAuth,
    findUserWithDashboard,
    mapDbDocToUser,
    buildDashboardResponse,
    parseDashboardPagination,
    getDashboardCollection
  } = deps;

  // req.user is the user row alone, so this route loads the collections itself.
  // It must not hand req.user to buildDashboardResponse: buildDashboard turns a
  // missing dashboard into an empty one, and answers 200 with nothing in it.
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const userDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
      if (!userDoc) return res.status(404).json({ error: "User not found." });
      const response = await buildDashboardResponse(mapDbDocToUser(userDoc));
      return res.json(/** @satisfies {DashboardResponse} */ (response));
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  // One page of one collection each, and only that collection is read. `limit`
  // and `offset` are validated here and defaulted by parseDashboardPagination.
  // `pagination.total` counts the user's whole collection, not the page, so the
  // caller can tell whether there is another page to ask for.
  app.get("/api/dashboard/workout-sessions", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const page = await getDashboardCollection(
        req.user,
        "workoutSessions",
        parseDashboardPagination(queryInput)
      );
      return res.json({
        workoutSessions: page.items,
        pagination: {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          source: page.source
        }
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.get("/api/dashboard/meal-logs", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const page = await getDashboardCollection(
        req.user,
        "mealLogs",
        parseDashboardPagination(queryInput)
      );
      return res.json(
        /** @satisfies {MealLogsResponse} */ ({
          // The mealLogs collection's page holds meal logs.
          mealLogs: /** @type {MealLogsResponse["mealLogs"]} */ (page.items),
          pagination: {
            total: page.total,
            limit: page.limit,
            offset: page.offset,
            source: page.source
          }
        })
      );
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.get("/api/dashboard/progress-metrics", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const page = await getDashboardCollection(
        req.user,
        "progressMetrics",
        parseDashboardPagination(queryInput)
      );
      return res.json(
        /** @satisfies {ProgressMetricsResponse} */ ({
          // The progressMetrics collection's page holds progress metrics.
          progressMetrics: /** @type {ProgressMetricsResponse["progressMetrics"]} */ (page.items),
          pagination: {
            total: page.total,
            limit: page.limit,
            offset: page.offset,
            source: page.source
          }
        })
      );
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
