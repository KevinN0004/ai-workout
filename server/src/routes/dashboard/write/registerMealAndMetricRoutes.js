/**
 * POST routes for meal logs and progress metrics. Registered by
 * registerDashboardWriteRoutes.js.
 */
import { sendErrorResponse } from "../../../services/http/errorResponseService.js";

/**
 * Registers POST /api/dashboard/meal-logs and POST /api/dashboard/progress-metrics.
 * Both require a session, and answer with the refreshed dashboard plus the entry
 * just saved.
 */
export const registerMealAndMetricRoutes = (app, deps) => {
  const {
    requireAuth,
    validateBody,
    mealLogBodySchema,
    buildMealLogEntry,
    saveMealLog,
    syncDerivedCalorieEntry,
    findUserWithDashboard,
    mapDbDocToUser,
    buildDashboardResponse,
    progressMetricBodySchema,
    buildProgressMetricEntry,
    saveProgressMetric
  } = deps;

  app.post("/api/dashboard/meal-logs", requireAuth, async (req, res) => {
    try {
      const body = validateBody(req, res, mealLogBodySchema);
      if (!body) return;

      const mealLog = buildMealLogEntry(body);
      if (!mealLog.date || !mealLog.name) {
        return res.status(400).json({ error: "Date and meal name are required." });
      }
      if (
        mealLog.calories === null &&
        mealLog.proteinG === null &&
        mealLog.carbsG === null &&
        mealLog.fatG === null
      ) {
        return res
          .status(400)
          .json({ error: "Add calories or at least one macro value for the meal." });
      }

      await saveMealLog({ userId: req.user.id, mealLog });
      // Recomputes the whole day, so this is correct when an existing meal is
      // edited by id as well as when a new one is added.
      await syncDerivedCalorieEntry({ userId: req.user.id, date: mealLog.date });

      // Re-read rather than answer from req.user, which was loaded before these
      // writes: dashboard.calories in the response has to reflect the sync.
      const updatedDoc = await findUserWithDashboard(req.user.id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({
        ...response,
        mealLog
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.post("/api/dashboard/progress-metrics", requireAuth, async (req, res) => {
    try {
      const body = validateBody(req, res, progressMetricBodySchema);
      if (!body) return;

      const metric = buildProgressMetricEntry(body);
      if (!metric.date) {
        return res.status(400).json({ error: "Date is required." });
      }
      if (
        metric.weightLb === null &&
        metric.bodyFatPct === null &&
        metric.waistCm === null &&
        metric.restingHr === null
      ) {
        return res.status(400).json({
          error: "Add at least one metric: weight, body fat, waist, or resting heart rate."
        });
      }

      await saveProgressMetric({ userId: req.user.id, metric });

      const updatedDoc = await findUserWithDashboard(req.user.id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({
        ...response,
        progressMetric: metric
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
