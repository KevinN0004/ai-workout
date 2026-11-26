/**
 * The write routes for workout sessions, daily calories and goals, and the
 * delete of an imported workout. Registered by registerDashboardWriteRoutes.js.
 */
import crypto from "crypto";
import { sendErrorResponse } from "../../../services/http/errorResponseService.js";
import { validateParams, workoutParamsSchema } from "../validation.js";

/** @typedef {import("../../../services/auth/authUserService.js").AuthUser} AuthUser */
/** @typedef {import("../registerDashboardReadRoutes.js").DashboardResponse} DashboardResponse */

/**
 * What index.js hands the workout, calorie and goal routes; one property per
 * member they read.
 * @typedef {object} WorkoutAndGoalDeps
 * @property {import("express").RequestHandler} requireAuth Rejects a request with no session.
 * @property {typeof import("../../../services/http/apiSchemaService.js").validateBody} validateBody
 * @property {typeof import("../../../services/http/apiSchemaService.js").workoutSessionBodySchema} workoutSessionBodySchema
 * @property {typeof import("../../../services/http/apiSchemaService.js").caloriesBodySchema} caloriesBodySchema
 * @property {typeof import("../../../services/http/apiSchemaService.js").goalsBodySchema} goalsBodySchema
 * @property {typeof import("../../../services/dashboard/dashboardDataBuildersService.js").buildWorkoutSessionEntry} buildWorkoutSessionEntry
 * @property {typeof import("../../../services/dashboard/dashboardDataBuildersService.js").toNullableNumber} toNullableNumber
 * @property {typeof import("../../../services/dashboard/dashboardDataBuildersService.js").cleanText} cleanText
 * @property {ReturnType<typeof import("../../../repositories/workoutSessionRepository.js").createWorkoutSessionRepository>["saveWorkoutSession"]} saveWorkoutSession
 * @property {ReturnType<typeof import("../../../repositories/userRepository.js").createUserRepository>["saveCalorieEntry"]} saveCalorieEntry
 * @property {ReturnType<typeof import("../../../repositories/userRepository.js").createUserRepository>["updateGoals"]} updateGoals
 * @property {ReturnType<typeof import("../../../repositories/userReadRepository.js").createUserReadRepository>["findUserWithDashboard"]} findUserWithDashboard
 * @property {ReturnType<typeof import("../../../services/auth/authUserService.js").createAuthUserService>["mapDbDocToUser"]} mapDbDocToUser
 * @property {ReturnType<typeof import("../../../services/dashboard/dashboardCollectionService.js").createDashboardCollectionService>["buildDashboardResponse"]} buildDashboardResponse
 * @property {ReturnType<typeof import("../../../repositories/stravaImportRepository.js").createStravaImportRepository>["deleteImportById"]} deleteImportById
 */

/**
 * What POST /api/dashboard/workout-sessions (and /workouts) answers: the
 * refreshed dashboard, and the session as saved, or as built when the user
 * could not be resolved.
 * @typedef {DashboardResponse & { workoutSession: NonNullable<Awaited<ReturnType<WorkoutAndGoalDeps["saveWorkoutSession"]>>> | ReturnType<WorkoutAndGoalDeps["buildWorkoutSessionEntry"]> }} WorkoutSessionSavedResponse
 */

/**
 * What POST /api/dashboard/calories answers: the refreshed dashboard.
 * @typedef {DashboardResponse} CaloriesSavedResponse
 */

/**
 * What POST /api/dashboard/goals answers: the refreshed dashboard.
 * @typedef {DashboardResponse} GoalsSavedResponse
 */

/**
 * What DELETE /api/dashboard/workouts/:id answers: the refreshed dashboard.
 * @typedef {DashboardResponse & { ok: true }} WorkoutDeletedResponse
 */

/**
 * Registers POST /api/dashboard/workouts (also answered at
 * /api/dashboard/workout-sessions), /api/dashboard/calories and
 * /api/dashboard/goals, and DELETE /api/dashboard/workouts/:id for a workout
 * imported from Strava. Each requires a session and answers with the refreshed
 * dashboard; the workout route adds the saved session as `workoutSession`.
 *
 * @param {import("express").Express} app
 * @param {WorkoutAndGoalDeps} deps
 */
// Every handler here runs behind requireAuth, which sets req.user.
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
        const saved = await saveWorkoutSession({
          userId: /** @type {AuthUser} */ (req.user).id,
          session
        });
        if (session.planId && !saved?.planId) {
          req.log?.warn(
            { event: "workout_plan_link_dropped", planDayIndex: session.planDayIndex },
            "A workout's plan-day link did not match a day of the user's plans."
          );
        }

        // Re-read rather than answer from req.user, which was loaded before this
        // write: dashboard.workouts in the response has to include the session.
        const updatedDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
        if (!updatedDoc) return res.status(404).json({ error: "User not found." });

        const updated = mapDbDocToUser(updatedDoc);
        const response = await buildDashboardResponse(updated);
        return res.json(
          /** @satisfies {WorkoutSessionSavedResponse} */ ({
            ...response,
            workoutSession: saved || session
          })
        );
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
      await saveCalorieEntry({ userId: /** @type {AuthUser} */ (req.user).id, entry });

      const updatedDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(/** @satisfies {CaloriesSavedResponse} */ (response));
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
      /** @type {Record<string, number>} */
      const goals = {};
      if (parsedTargetWeight !== null) goals.targetWeight = parsedTargetWeight;
      if (parsedTargetCalories !== null) goals.targetCalories = parsedTargetCalories;
      if (parsedWeeklyWorkouts !== null) goals.weeklyWorkouts = parsedWeeklyWorkouts;

      // updateGoals patches rather than replaces and writes nothing for an empty
      // object, so the route hands over whatever parsed without checking that
      // anything did.
      await updateGoals({ userId: /** @type {AuthUser} */ (req.user).id, goals });

      const updatedDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(/** @satisfies {GoalsSavedResponse} */ (response));
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
      const deleted = await deleteImportById({
        userId: /** @type {AuthUser} */ (req.user).id,
        id: params.id
      });
      if (!deleted) return res.status(404).json({ error: "Workout not found." });

      const updatedDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const response = await buildDashboardResponse(mapDbDocToUser(updatedDoc));
      return res.json(/** @satisfies {WorkoutDeletedResponse} */ ({ ...response, ok: true }));
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
