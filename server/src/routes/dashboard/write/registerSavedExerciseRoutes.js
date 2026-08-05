import { savedExerciseParamsSchema, validateParams } from "../validation.js";

export const registerSavedExerciseRoutes = (app, deps) => {
  const {
    requireAuth,
    validateBody,
    savedExerciseBodySchema,
    buildSavedExerciseEntry,
    User,
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

      const savedName = entry.name.toLowerCase();
      const exerciseIdCondition =
        entry.exerciseId === null ? true : { $ne: ["$$item.exerciseId", entry.exerciseId] };

      const updatedDoc = await User.findOneAndUpdate(
        { userId: req.user.id },
        [
          {
            $set: {
              "dashboard.savedExercises": {
                $slice: [
                  {
                    $concatArrays: [
                      [entry],
                      {
                        $filter: {
                          input: { $ifNull: ["$dashboard.savedExercises", []] },
                          as: "item",
                          cond: {
                            $and: [
                              exerciseIdCondition,
                              {
                                $ne: [
                                  {
                                    $toLower: {
                                      $toString: { $ifNull: ["$$item.name", ""] }
                                    }
                                  },
                                  savedName
                                ]
                              }
                            ]
                          }
                        }
                      }
                    ]
                  },
                  200
                ]
              }
            }
          }
        ],
        { new: true }
      );
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({
        ...response,
        savedExercise: updated.dashboard?.savedExercises?.[0] || entry
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });

  app.delete("/api/dashboard/saved-exercises/:id", requireAuth, async (req, res) => {
    try {
      const params = validateParams(req, res, savedExerciseParamsSchema);
      if (!params) return;
      const entryId = cleanText(params.id, 64);

      const updatedDoc = await User.findOneAndUpdate(
        { userId: req.user.id },
        {
          $pull: {
            "dashboard.savedExercises": { id: entryId }
          }
        },
        { new: true }
      );
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapDbDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({ ...response, ok: true });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });
};
