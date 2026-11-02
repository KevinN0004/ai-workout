/**
 * The dashboard's read routes: the whole dashboard in one response, and one
 * paginated route per collection. Registered by dashboardRoutes.js.
 */
import { dashboardPaginationQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

/**
 * Registers GET /api/dashboard and the workout-session, meal-log and
 * progress-metric collection routes, all behind `requireAuth`. From `deps`,
 * `findUserWithDashboard` and `mapDbDocToUser` load the whole user as the write
 * routes do, and the other three come from the dashboard collection service
 * built in index.js.
 */
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
      const userDoc = await findUserWithDashboard(req.user.id);
      if (!userDoc) return res.status(404).json({ error: "User not found." });
      const response = await buildDashboardResponse(mapDbDocToUser(userDoc));
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
