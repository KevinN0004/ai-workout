import { sendErrorResponse } from "../../../services/errorResponseService.js";
export const registerMealAndMetricRoutes = (app, deps) => {
  const {
    requireAuth,
    validateBody,
    mealLogBodySchema,
    buildMealLogEntry,
    MealLog,
    User,
    toFiniteNumber,
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

      const updatedDoc = await User.findOne({ userId: req.user.id });
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
