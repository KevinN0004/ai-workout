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
  const { requireAuth, buildDashboardResponse, parseDashboardPagination, getDashboardCollection } =
    deps;

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const response = await buildDashboardResponse(req.user);
      return res.json(response);
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
      return res.json({
        mealLogs: page.items,
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

  app.get("/api/dashboard/progress-metrics", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const page = await getDashboardCollection(
        req.user,
        "progressMetrics",
        parseDashboardPagination(queryInput)
      );
      return res.json({
        progressMetrics: page.items,
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
};
