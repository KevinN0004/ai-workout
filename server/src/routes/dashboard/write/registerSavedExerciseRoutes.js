import { savedExerciseParamsSchema, validateParams } from "../validation.js";
import { sendErrorResponse } from "../../../services/http/errorResponseService.js";

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

      const savedExercise = await saveExercise({ userId: req.user.id, entry });

      const updatedDoc = await findUserWithDashboard(req.user.id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({
        ...response,
        savedExercise: savedExercise || entry
      });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });

  app.delete("/api/dashboard/saved-exercises/:id", requireAuth, async (req, res) => {
    try {
      const params = validateParams(req, res, savedExerciseParamsSchema);
      if (!params) return;
      const entryId = cleanText(params.id, 64);

      await removeExercise({ userId: req.user.id, entryId });

      const updatedDoc = await findUserWithDashboard(req.user.id);
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({ ...response, ok: true });
    } catch (err) {
      return sendErrorResponse(req, res, err, 500);
    }
  });
};
