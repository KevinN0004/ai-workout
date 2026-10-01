/**
 * POST routes for workout sessions, daily calories and goals. Registered by
 * registerDashboardWriteRoutes.js.
 */
import crypto from "crypto";
import { sendErrorResponse } from "../../../services/http/errorResponseService.js";

/**
 * Registers POST /api/dashboard/workouts (also answered at
 * /api/dashboard/workout-sessions), /api/dashboard/calories and
 * /api/dashboard/goals. All three require a session and answer with the
 * refreshed dashboard; the workout route adds the saved session as
 * `workoutSession`.
 */
export const registerWorkoutAndGoalRoutes = (app, deps) => {
  const {
    requireAuth,
    validateBody,
    workoutSessionBodySchema,
    buildWorkoutSessionEntry,
    saveWorkoutSession,
    saveCalorieEntry,
    updateGoals,
    findUserWithDashboard,
    mapDbDocToUser,
    buildDashboardResponse,
    caloriesBodySchema,
    toNullableNumber,
    cleanText,
    goalsBodySchema
  } = deps;

  app.post(
    ["/api/dashboard/workouts", "/api/dashboard/workout-sessions"],
    requireAuth,
    async (req, res) => {
      try {
        const body = validateBody(req, res, workoutSessionBodySchema);
        if (!body) return;

        const session = buildWorkoutSessionEntry(body);
        if (!session.date || session.duration === null) {
          return res.status(400).json({ error: "Date and duration are required." });
        }

        await saveWorkoutSession({ userId: req.user.id, session });

        // Re-read rather than answer from req.user, which was loaded before this
        // write: dashboard.workouts in the response has to include the session.
        const updatedDoc = await findUserWithDashboard(req.user.id);
        if (!updatedDoc) return res.status(404).json({ error: "User not found." });

        const updated = mapDbDocToUser(updatedDoc);
        const response = await buildDashboardResponse(updated);
        return res.json({
          ...response,
          workoutSession: session
        });
      } catch (err) {
        return sendErrorResponse(req, res, err, 500);
      }
    }
  );

  app.post("/api/dashboard/calories", requireAuth, async (req, res) => {
    try {
      const body = validateBody(req, res, caloriesBodySchema);
      if (!body) return;

      const { date, calories } = body;
      const parsedCalories = toNullableNumber(calories, 800, 10000);
      if (!cleanText(date, 20) || parsedCalories === null) {
        return res.status(400).json({ error: "Date and calories are required." });
      }

      const entry = {
        id: crypto.randomUUID(),
        date: cleanText(date, 20),
        calories: parsedCalories,
        source: "manual",
        updatedAt: new Date().toISOString()
      };
      await saveCalorieEntry({ userId: req.user.id, entry });

      const updatedDoc = await findUserWithDashboard(req.user.id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(response);
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.post("/api/dashboard/goals", requireAuth, async (req, res) => {
    try {
      const body = validateBody(req, res, goalsBodySchema);
      if (!body) return;

      const { targetWeight, targetCalories, weeklyWorkouts } = body;
      const parsedTargetWeight = toNullableNumber(targetWeight, 80, 400);
      const parsedTargetCalories = toNullableNumber(targetCalories, 1200, 4500);
      const parsedWeeklyWorkouts = toNullableNumber(weeklyWorkouts, 1, 7);
      const goals = {};
      if (parsedTargetWeight !== null) goals.targetWeight = parsedTargetWeight;
      if (parsedTargetCalories !== null) goals.targetCalories = parsedTargetCalories;
      if (parsedWeeklyWorkouts !== null) goals.weeklyWorkouts = parsedWeeklyWorkouts;

      // updateGoals patches rather than replaces and writes nothing for an empty
      // object, so the route hands over whatever parsed without checking that
      // anything did.
      await updateGoals({ userId: req.user.id, goals });

      const updatedDoc = await findUserWithDashboard(req.user.id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(response);
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
