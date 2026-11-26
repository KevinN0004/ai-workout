/**
 * Routes that save an exercise to the user's dashboard and remove one from it.
 * Registered by registerDashboardWriteRoutes.js.
 */
import { savedExerciseParamsSchema, validateParams } from "../validation.js";
import { sendErrorResponse } from "../../../services/http/errorResponseService.js";

/** @typedef {import("../../../services/auth/authUserService.js").AuthUser} AuthUser */
/** @typedef {import("../registerDashboardReadRoutes.js").DashboardResponse} DashboardResponse */

/**
 * What index.js hands the saved-exercise routes; one property per member they read.
 * @typedef {object} SavedExerciseDeps
 * @property {import("express").RequestHandler} requireAuth Rejects a request with no session.
 * @property {typeof import("../../../services/http/apiSchemaService.js").validateBody} validateBody
 * @property {ReturnType<typeof import("../../../repositories/userReadRepository.js").createUserReadRepository>["findUserWithDashboard"]} findUserWithDashboard
 * @property {ReturnType<typeof import("../../../services/auth/authUserService.js").createAuthUserService>["mapDbDocToUser"]} mapDbDocToUser
 * @property {ReturnType<typeof import("../../../services/dashboard/dashboardCollectionService.js").createDashboardCollectionService>["buildDashboardResponse"]} buildDashboardResponse
 * @property {typeof import("../../../services/http/apiSchemaService.js").savedExerciseBodySchema} savedExerciseBodySchema
 * @property {typeof import("../../../services/dashboard/dashboardDataBuildersService.js").buildSavedExerciseEntry} buildSavedExerciseEntry
 * @property {typeof import("../../../services/dashboard/dashboardDataBuildersService.js").cleanText} cleanText
 * @property {ReturnType<typeof import("../../../repositories/savedExerciseRepository.js").createSavedExerciseRepository>["saveExercise"]} saveExercise
 * @property {ReturnType<typeof import("../../../repositories/savedExerciseRepository.js").createSavedExerciseRepository>["removeExercise"]} removeExercise
 */

/**
 * What POST /api/dashboard/saved-exercises answers: the refreshed dashboard, and
 * the exercise as saved, or as built when the user could not be resolved.
 * @typedef {DashboardResponse & { savedExercise: NonNullable<Awaited<ReturnType<SavedExerciseDeps["saveExercise"]>>> | ReturnType<SavedExerciseDeps["buildSavedExerciseEntry"]> }} SavedExerciseSavedResponse
 */

/**
 * What DELETE /api/dashboard/saved-exercises/:id answers: the refreshed dashboard.
 * @typedef {DashboardResponse & { ok: true }} SavedExerciseRemovedResponse
 */

/**
 * Registers POST /api/dashboard/saved-exercises and
 * DELETE /api/dashboard/saved-exercises/:id. Both require a session and answer
 * with the refreshed dashboard.
 *
 * @param {import("express").Express} app
 * @param {SavedExerciseDeps} deps
 */
// Every handler here runs behind requireAuth, which sets req.user.
export const registerSavedExerciseRoutes = (app, deps) => {
  const {
    requireAuth,
    validateBody,
    savedExerciseBodySchema,
    buildSavedExerciseEntry,
    saveExercise,
    removeExercise,
    findUserWithDashboard,
    mapDbDocToUser,
    buildDashboardResponse,
    cleanText
  } = deps;

  app.post("/api/dashboard/saved-exercises", requireAuth, async (req, res) => {
    try {
      const payload = validateBody(req, res, savedExerciseBodySchema);
      if (!payload) return;

      const entry = buildSavedExerciseEntry(payload);
      if (!entry.name) {
        return res.status(400).json({ error: "Exercise name is required." });
      }

      // Saving an exercise the user already has, matched by exercise id or by
      // name ignoring case, replaces that entry rather than adding a second one.
      const savedExercise = await saveExercise({
        userId: /** @type {AuthUser} */ (req.user).id,
        entry
      });

      const updatedDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(
        /** @satisfies {SavedExerciseSavedResponse} */ ({
          ...response,
          savedExercise: savedExercise || entry
        })
      );
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.delete("/api/dashboard/saved-exercises/:id", requireAuth, async (req, res) => {
    try {
      const params = validateParams(req, res, savedExerciseParamsSchema);
      if (!params) return;
      const entryId = cleanText(params.id, 64);

      // An id that matches none of this user's entries removes nothing and still
      // answers ok.
      await removeExercise({ userId: /** @type {AuthUser} */ (req.user).id, entryId });

      const updatedDoc = await findUserWithDashboard(/** @type {AuthUser} */ (req.user).id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(/** @satisfies {SavedExerciseRemovedResponse} */ ({ ...response, ok: true }));
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
