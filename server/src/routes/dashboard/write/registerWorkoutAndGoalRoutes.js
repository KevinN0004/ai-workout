/**
 * The write routes for workout sessions, daily calories and goals, and the
 * delete of an imported workout. Registered by registerDashboardWriteRoutes.js.
 */
import crypto from "crypto";
import { sendErrorResponse } from "../../../services/http/errorResponseService.js";
import { validateParams, workoutParamsSchema } from "../validation.js";

/**
 * Registers POST /api/dashboard/workouts (also answered at
 * /api/dashboard/workout-sessions), /api/dashboard/calories and
 * /api/dashboard/goals, and DELETE /api/dashboard/workouts/:id for a workout
 * imported from Strava. Each requires a session and answers with the refreshed
 * dashboard; the workout route adds the saved session as `workoutSession`.
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
    goalsBodySchema,
    deleteImportById
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

        // The repository keeps a plan-day link only when the plan is the user's
        // and has that day. A dropped link still saves the workout, which the
        // undo window has already shown as logged, and is logged here.
        const saved = await saveWorkoutSession({ userId: req.user.id, session });
        if (session.planId && !saved?.planId) {
          req.log?.warn(
            { event: "workout_plan_link_dropped", planDayIndex: session.planDayIndex },
            "A workout's plan-day link did not match a day of the user's plans."
          );
        }

        // Re-read rather than answer from req.user, which was loaded before this
        // write: dashboard.workouts in the response has to include the session.
        const updatedDoc = await findUserWithDashboard(req.user.id);
        if (!updatedDoc) return res.status(404).json({ error: "User not found." });

        const updated = mapDbDocToUser(updatedDoc);
        const response = await buildDashboardResponse(updated);
        return res.json({
          ...response,
          workoutSession: saved || session
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

      // The client's id is the replay key (docs/specs/2026-11-06-offline-ready-pwa-design.md):
      // an entry resent after a lost answer updates its row in saveCalorieEntry
      // instead of adding a second. Without one, each submission is a new entry.
      const entry = {
        id: cleanText(body.id, 64) || crypto.randomUUID(),
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

  // Roadmap C2: only a workout imported from Strava can be deleted, and the
  // delete is remembered so no import brings it back. A workout logged in the
  // app answers 404, as an unknown id does.
  app.delete("/api/dashboard/workouts/:id", requireAuth, async (req, res) => {
    try {
      const params = validateParams(req, res, workoutParamsSchema);
      if (!params) return;
      const deleted = await deleteImportById({ userId: req.user.id, id: params.id });
      if (!deleted) return res.status(404).json({ error: "Workout not found." });

      const updatedDoc = await findUserWithDashboard(req.user.id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const response = await buildDashboardResponse(mapDbDocToUser(updatedDoc));
      return res.json({ ...response, ok: true });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
