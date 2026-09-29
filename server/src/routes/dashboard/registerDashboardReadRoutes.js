/**
 * The dashboard's read routes: the whole dashboard in one response, and one
 * paginated route per collection. Registered by dashboardRoutes.js.
 */
import { dashboardPaginationQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

/**
 * Registers GET /api/dashboard and the workout-session, meal-log and
 * progress-metric collection routes, all behind `requireAuth`. The other three
 * members it takes from `deps` come from the dashboard collection service built
 * in index.js.
 */
export const registerDashboardReadRoutes = (app, deps) => {
  const { requireAuth, buildDashboardResponse, parseDashboardPagination, getDashboardCollections } =
    deps;

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const response = await buildDashboardResponse(req.user);
      return res.json(response);
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  // One page of one collection each. `limit` and `offset` are validated here and
  // defaulted by parseDashboardPagination, and the response carries the page's
  // total so the caller can ask for the next one.
  app.get("/api/dashboard/workout-sessions", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const pagination = parseDashboardPagination(queryInput);
      const collections = await getDashboardCollections(req.user, {
        workoutSessions: pagination
      });
      return res.json({
        workoutSessions: collections.workoutSessions.items,
        pagination: {
          total: collections.workoutSessions.total,
          limit: collections.workoutSessions.limit,
          offset: collections.workoutSessions.offset,
          source: collections.workoutSessions.source
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
      const pagination = parseDashboardPagination(queryInput);
      const collections = await getDashboardCollections(req.user, {
        mealLogs: pagination
      });
      return res.json({
        mealLogs: collections.mealLogs.items,
        pagination: {
          total: collections.mealLogs.total,
          limit: collections.mealLogs.limit,
          offset: collections.mealLogs.offset,
          source: collections.mealLogs.source
        }
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.get("/api/dashboard/progress-metrics", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const pagination = parseDashboardPagination(queryInput);
      const collections = await getDashboardCollections(req.user, {
        progressMetrics: pagination
      });
      return res.json({
        progressMetrics: collections.progressMetrics.items,
        pagination: {
          total: collections.progressMetrics.total,
          limit: collections.progressMetrics.limit,
          offset: collections.progressMetrics.offset,
          source: collections.progressMetrics.source
        }
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
