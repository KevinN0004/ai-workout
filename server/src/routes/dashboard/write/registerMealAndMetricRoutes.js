/**
 * POST routes for meal logs and progress metrics. Registered by
 * registerDashboardWriteRoutes.js.
 */
import { sendErrorResponse } from "../../../services/http/errorResponseService.js";

/** @typedef {import("../../../services/auth/authUserService.js").AuthUser} AuthUser */
/** @typedef {import("../registerDashboardReadRoutes.js").DashboardResponse} DashboardResponse */

/**
 * What index.js hands the meal-log and progress-metric routes; one property per
 * member they read.
 * @typedef {object} MealAndMetricDeps
 * @property {import("express").RequestHandler} requireAuth Rejects a request with no session.
 * @property {typeof import("../../../services/http/apiSchemaService.js").validateBody} validateBody
 * @property {ReturnType<typeof import("../../../repositories/userReadRepository.js").createUserReadRepository>["findUserWithDashboard"]} findUserWithDashboard
 * @property {ReturnType<typeof import("../../../services/auth/authUserService.js").createAuthUserService>["mapDbDocToUser"]} mapDbDocToUser
 * @property {ReturnType<typeof import("../../../services/dashboard/dashboardCollectionService.js").createDashboardCollectionService>["buildDashboardResponse"]} buildDashboardResponse
 * @property {typeof import("../../../services/http/apiSchemaService.js").mealLogBodySchema} mealLogBodySchema
 * @property {typeof import("../../../services/http/apiSchemaService.js").progressMetricBodySchema} progressMetricBodySchema
 * @property {typeof import("../../../services/dashboard/dashboardDataBuildersService.js").buildMealLogEntry} buildMealLogEntry
 * @property {typeof import("../../../services/dashboard/dashboardDataBuildersService.js").buildProgressMetricEntry} buildProgressMetricEntry
 * @property {ReturnType<typeof import("../../../repositories/mealLogRepository.js").createMealLogRepository>["saveMealLogWithDailySync"]} saveMealLogWithDailySync
 * @property {ReturnType<typeof import("../../../repositories/progressMetricRepository.js").createProgressMetricRepository>["saveProgressMetric"]} saveProgressMetric
 */

/**
 * What POST /api/dashboard/meal-logs answers: the refreshed dashboard, and the
 * meal as the route built it.
 * @typedef {DashboardResponse & { mealLog: ReturnType<MealAndMetricDeps["buildMealLogEntry"]> }} MealLogSavedResponse
 */

/**
 * What POST /api/dashboard/progress-metrics answers: the refreshed dashboard,
 * and the metric as the route built it.
 * @typedef {DashboardResponse & { progressMetric: ReturnType<MealAndMetricDeps["buildProgressMetricEntry"]> }} ProgressMetricSavedResponse
 */

/**
 * Registers POST /api/dashboard/meal-logs and POST /api/dashboard/progress-metrics.
 * Both require a session, and answer with the refreshed dashboard plus the entry
 * just saved.
 *
 * @param {import("express").Express} app
 * @param {MealAndMetricDeps} deps
 */
// Every handler here runs behind requireAuth, which sets req.user.
export const registerMealAndMetricRoutes = (app, deps) => {
  const {
    requireAuth,
    validateBody,
    mealLogBodySchema,
    buildMealLogEntry,
    saveMealLogWithDailySync,
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

      // One transaction: saves the meal and recomputes the whole day's derived
      // calorie entry, so it is correct when an existing meal is edited by id as
      // well as when a new one is added, and a failure leaves neither behind.
      await saveMealLogWithDailySync({ userId: /** @type {AuthUser} */ (req.user).id, mealLog });

      // Re-read rather than answer from req.user, which was loaded before these
      // writes: dashboard.calories in the response has to reflect the sync.
      const updatedDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(
        /** @satisfies {MealLogSavedResponse} */ ({
          ...response,
          mealLog
        })
      );
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

      await saveProgressMetric({ userId: /** @type {AuthUser} */ (req.user).id, metric });

      const updatedDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(
        /** @satisfies {ProgressMetricSavedResponse} */ ({
          ...response,
          progressMetric: metric
        })
      );
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
