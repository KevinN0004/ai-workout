import crypto from "crypto";
import { sendErrorResponse } from "../../../services/errorResponseService.js";

export const registerWorkoutAndGoalRoutes = (app, deps) => {
  const {
    requireAuth,
    validateBody,
    workoutSessionBodySchema,
    buildWorkoutSessionEntry,
    saveWorkoutSession,
    User,
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

        // The Mongo aggregation-pipeline update that used to sit here was inert.
        // It prepended a summary into `dashboard.workouts`, deduped by id and
        // capped at 500 -- but the shim only matched `$set`/`$push`/`$pull`
        // object updates, so an array pipeline fell through to a plain re-read.
        // All three effects are already provided elsewhere now that workouts
        // live in their own table: ordering by loadUserRelated's orderBy, dedupe
        // by the upsert above, and the 500 cap by mapUser. What remains is the
        // user-existence check the route actually depends on.
        const updatedDoc = await User.findOne({ userId: req.user.id });
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
      const updatedDoc = await User.findOneAndUpdate(
        { userId: req.user.id },
        {
          $push: {
            "dashboard.calories": {
              $each: [entry],
              $position: 0,
              $slice: 1000
            }
          }
        },
        { new: true }
      );
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
      const setFields = {};
      if (parsedTargetWeight !== null) {
        setFields["dashboard.goals.targetWeight"] = parsedTargetWeight;
      }
      if (parsedTargetCalories !== null) {
        setFields["dashboard.goals.targetCalories"] = parsedTargetCalories;
      }
      if (parsedWeeklyWorkouts !== null) {
        setFields["dashboard.goals.weeklyWorkouts"] = parsedWeeklyWorkouts;
      }

      let updatedDoc = null;
      if (Object.keys(setFields).length) {
        updatedDoc = await User.findOneAndUpdate(
          { userId: req.user.id },
          { $set: setFields },
          { new: true }
        );
      } else {
        updatedDoc = await User.findOne({ userId: req.user.id });
      }

      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(response);
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
