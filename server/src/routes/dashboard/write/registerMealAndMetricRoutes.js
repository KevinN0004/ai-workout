import { sendErrorResponse } from "../../../services/http/errorResponseService.js";
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

      // A ~110-line Mongo aggregation-pipeline update used to sit here. It
      // computed the day’s calorie total and wrote it into dashboard.calories
      // as a `meal_logs`-sourced entry unless a manual entry already existed.
      //
      // None of it ran. The shim only matches object updates carrying
      // $set/$push/$pull, so an array pipeline fell through to a plain re-read.
      // Verified against a live server: logging a 700-calorie meal leaves
      // dashboard.calories empty and calorie_entries with no rows.
      //
      // Removed rather than repaired: making it work is a behaviour change and
      // belongs to its own decision, not to this refactor. The working half is
      // preserved as sumCaloriesForDate in repositories/mealLogRepository.js.
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
