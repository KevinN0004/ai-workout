import crypto from "crypto";
import { z } from "zod";
import { validateSchemaInput } from "../services/requestValidationService.js";

const dashboardPaginationQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).max(100000).optional()
  })
  .passthrough();

const savedExerciseParamsSchema = z.object({
  id: z.string().trim().min(1).max(64)
});

const validateQuery = (req, res, schema, fallbackPath = "query") => {
  const { data, error } = validateSchemaInput(schema, req.query || {}, fallbackPath);
  if (!error) return data;
  res.status(400).json({ error });
  return null;
};

const validateParams = (req, res, schema, fallbackPath = "params") => {
  const { data, error } = validateSchemaInput(schema, req.params || {}, fallbackPath);
  if (!error) return data;
  res.status(400).json({ error });
  return null;
};

export const registerDashboardRoutes = (app, deps) => {
  const {
    requireAuth,
    buildDashboardResponse,
    parseDashboardPagination,
    getDashboardCollections,
    validateBody,
    workoutSessionBodySchema,
    buildWorkoutSessionEntry,
    WorkoutSession,
    User,
    toWorkoutSummaryEntry,
    mapMongoDocToUser,
    caloriesBodySchema,
    toNullableNumber,
    cleanText,
    goalsBodySchema,
    mealLogBodySchema,
    buildMealLogEntry,
    MealLog,
    toFiniteNumber,
    progressMetricBodySchema,
    buildProgressMetricEntry,
    ProgressMetric,
    savedExerciseBodySchema,
    buildSavedExerciseEntry
  } = deps;

  app.get("/api/dashboard", requireAuth, async (req, res) => {
    try {
      const response = await buildDashboardResponse(req.user);
      return res.json(response);
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });

  app.get("/api/dashboard/workout-sessions", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const pagination = parseDashboardPagination(queryInput);
      const collections = await getDashboardCollections(req.user, {
        workoutSessions: pagination
      });
      return res.json({
        workoutSessions: collections.workoutSessions.items,
        pagination: {
          total: collections.workoutSessions.total,
          limit: collections.workoutSessions.limit,
          offset: collections.workoutSessions.offset,
          source: collections.workoutSessions.source
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });

  app.get("/api/dashboard/meal-logs", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const pagination = parseDashboardPagination(queryInput);
      const collections = await getDashboardCollections(req.user, {
        mealLogs: pagination
      });
      return res.json({
        mealLogs: collections.mealLogs.items,
        pagination: {
          total: collections.mealLogs.total,
          limit: collections.mealLogs.limit,
          offset: collections.mealLogs.offset,
          source: collections.mealLogs.source
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });

  app.get("/api/dashboard/progress-metrics", requireAuth, async (req, res) => {
    try {
      const queryInput = validateQuery(req, res, dashboardPaginationQuerySchema);
      if (!queryInput) return;
      const pagination = parseDashboardPagination(queryInput);
      const collections = await getDashboardCollections(req.user, {
        progressMetrics: pagination
      });
      return res.json({
        progressMetrics: collections.progressMetrics.items,
        pagination: {
          total: collections.progressMetrics.total,
          limit: collections.progressMetrics.limit,
          offset: collections.progressMetrics.offset,
          source: collections.progressMetrics.source
        }
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });

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

        await WorkoutSession.findOneAndUpdate(
          { userId: req.user.id, id: session.id },
          {
            $set: {
              userId: req.user.id,
              ...session
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const workoutSummary = toWorkoutSummaryEntry(session);
        const updatedDoc = await User.findOneAndUpdate(
          { userId: req.user.id },
          [
            {
              $set: {
                "dashboard.workouts": {
                  $slice: [
                    {
                      $concatArrays: [
                        [workoutSummary],
                        {
                          $filter: {
                            input: { $ifNull: ["$dashboard.workouts", []] },
                            as: "item",
                            cond: {
                              $ne: [
                                {
                                  $toString: { $ifNull: ["$$item.id", ""] }
                                },
                                workoutSummary.id
                              ]
                            }
                          }
                        }
                      ]
                    },
                    500
                  ]
                }
              }
            }
          ],
          { new: true }
        );
        if (!updatedDoc) return res.status(404).json({ error: "User not found." });

        const updated = mapMongoDocToUser(updatedDoc);
        const response = await buildDashboardResponse(updated);
        return res.json({
          ...response,
          workoutSession: session
        });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "Server error." });
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
      const updated = mapMongoDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(response);
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
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
      const updated = mapMongoDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json(response);
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });

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

      await MealLog.findOneAndUpdate(
        { userId: req.user.id, id: mealLog.id },
        {
          $set: {
            userId: req.user.id,
            ...mealLog
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const mealLogDate = mealLog.date;
      const mealLogCaloriesId = `meal-logs-${mealLogDate}`;
      const mealLogCaloriesUpdatedAt = new Date().toISOString();
      const aggregate = await MealLog.aggregate([
        { $match: { userId: req.user.id, date: mealLogDate } },
        {
          $group: {
            _id: null,
            calories: { $sum: { $ifNull: ["$calories", 0] } }
          }
        }
      ]);
      const dayCalories = Math.round(toFiniteNumber(aggregate?.[0]?.calories) ?? 0);

      const updatedDoc = await User.findOneAndUpdate(
        { userId: req.user.id },
        [
          {
            $set: {
              "dashboard.calories": {
                $let: {
                  vars: {
                    currentCalories: { $ifNull: ["$dashboard.calories", []] }
                  },
                  in: {
                    $let: {
                      vars: {
                        hasManualCaloriesForDay: {
                          $gt: [
                            {
                              $size: {
                                $filter: {
                                  input: "$$currentCalories",
                                  as: "entry",
                                  cond: {
                                    $and: [
                                      {
                                        $eq: [{ $ifNull: ["$$entry.date", ""] }, mealLogDate]
                                      },
                                      {
                                        $ne: [
                                          { $ifNull: ["$$entry.source", "manual"] },
                                          "meal_logs"
                                        ]
                                      }
                                    ]
                                  }
                                }
                              }
                            },
                            0
                          ]
                        },
                        caloriesWithoutMealLogSource: {
                          $filter: {
                            input: "$$currentCalories",
                            as: "entry",
                            cond: {
                              $not: [
                                {
                                  $and: [
                                    {
                                      $eq: [{ $ifNull: ["$$entry.date", ""] }, mealLogDate]
                                    },
                                    {
                                      $eq: [{ $ifNull: ["$$entry.source", ""] }, "meal_logs"]
                                    }
                                  ]
                                }
                              ]
                            }
                          }
                        }
                      },
                      in: {
                        $cond: [
                          "$$hasManualCaloriesForDay",
                          { $slice: ["$$currentCalories", 1000] },
                          {
                            $slice: [
                              {
                                $cond: [
                                  { $gt: [dayCalories, 0] },
                                  {
                                    $concatArrays: [
                                      [
                                        {
                                          id: mealLogCaloriesId,
                                          date: mealLogDate,
                                          calories: dayCalories,
                                          source: "meal_logs",
                                          updatedAt: mealLogCaloriesUpdatedAt
                                        }
                                      ],
                                      "$$caloriesWithoutMealLogSource"
                                    ]
                                  },
                                  "$$caloriesWithoutMealLogSource"
                                ]
                              },
                              1000
                            ]
                          }
                        ]
                      }
                    }
                  }
                }
              }
            }
          }
        ],
        { new: true }
      );

      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapMongoDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({
        ...response,
        mealLog
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
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

      await ProgressMetric.findOneAndUpdate(
        { userId: req.user.id, id: metric.id },
        {
          $set: {
            userId: req.user.id,
            ...metric
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const updatedDoc = await User.findOne({ userId: req.user.id });
      if (!updatedDoc) return res.status(404).json({ error: "User not found." });
      const updated = mapMongoDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({
        ...response,
        progressMetric: metric
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });

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
      const updated = mapMongoDocToUser(updatedDoc);
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
      const updated = mapMongoDocToUser(updatedDoc);
      const response = await buildDashboardResponse(updated);
      return res.json({ ...response, ok: true });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Server error." });
    }
  });
};
