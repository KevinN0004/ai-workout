import { dashboardPaginationQuerySchema, validateQuery } from "./validation.js";

export const registerDashboardReadRoutes = (app, deps) => {
  const { requireAuth, buildDashboardResponse, parseDashboardPagination, getDashboardCollections } =
    deps;

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const response = await buildDashboardResponse(req.user);
      return res.json(response);
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });

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
      return res.status(500).json({ error: err?.message || "Server error." });
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
      return res.status(500).json({ error: err?.message || "Server error." });
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
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });
};
