import { dateOnlyToDate, toDateOnly, toIso, toNumberOrNull } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

/**
 * Prisma-native persistence for meal logs.
 *
 * Task 3 of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md.
 */

// Marks a calorie entry as derived from meal logs rather than typed by the user.
const DERIVED_CALORIE_SOURCE = "meal_logs";
const DERIVED_CALORIE_SOURCE_PREFIX = "meal-logs-";

export const mapMealLog = (row = {}) => ({
  id: row.legacyId || row.id,
  date: toDateOnly(row.mealDate),
  mealType: row.mealType || "other",
  name: row.name || "",
  calories: row.calories ?? null,
  proteinG: toNumberOrNull(row.proteinG),
  carbsG: toNumberOrNull(row.carbsG),
  fatG: toNumberOrNull(row.fatG),
  notes: row.notes || "",
  loggedAt: toIso(row.loggedAt)
});

export const createMealLogRepository = ({ prisma }) => {
  /**
   * Inserts a meal, or updates the existing row carrying the same legacy id for
   * this user. Read-then-write rather than `upsert` for the same reason as the
   * other repositories: `meal_logs_user_legacy_idx` is a partial unique index,
   * which schema.prisma cannot express.
   *
   * Returns null when the user cannot be resolved.
   */
  const saveMealLog = async ({ userId, mealLog = {} }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;

    const legacyId = mealLog.id || null;
    const existing = legacyId
      ? await prisma.mealLog.findFirst({
          where: { userId: userPk, legacyId },
          select: { id: true }
        })
      : null;

    const data = {
      userId: userPk,
      legacyId,
      mealDate: dateOnlyToDate(mealLog.date),
      mealType: mealLog.mealType || "other",
      name: mealLog.name || "",
      calories: mealLog.calories ?? null,
      proteinG: mealLog.proteinG ?? null,
      carbsG: mealLog.carbsG ?? null,
      fatG: mealLog.fatG ?? null,
      notes: mealLog.notes || "",
      loggedAt: mealLog.loggedAt ? new Date(mealLog.loggedAt) : new Date()
    };

    const row = existing
      ? await prisma.mealLog.update({ where: { id: existing.id }, data })
      : await prisma.mealLog.create({ data });

    return mapMealLog(row);
  };

  /**
   * Total calories logged by a user on one date.
   *
   * `_sum` returns null when no row has a calories value, which is not the same
   * as a zero total -- the Mongo pipeline this replaces used `$ifNull` to make
   * both cases 0, so that coalescing is preserved here rather than left to the
   * caller.
   */
  const sumCaloriesForDate = async ({ userId, date }) => {
    const userPk = await getUserPk(prisma, userId);
    const mealDate = dateOnlyToDate(date);
    if (!userPk || !mealDate) return 0;

    const result = await prisma.mealLog.aggregate({
      where: { userId: userPk, mealDate },
      _sum: { calories: true }
    });
    return result._sum.calories || 0;
  };

  /**
   * Keeps the calories view in step with the meals logged for one date.
   *
   * The rules are lifted from the Mongo aggregation pipeline that was supposed
   * to do this and never executed -- the shim only matched object updates, so
   * an array pipeline fell through to a plain re-read and meal logs contributed
   * nothing to the calories view. Restated plainly, that pipeline said:
   *
   *   1. if a manual entry exists for the day, change nothing -- a number the
   *      user typed themselves outranks one derived from meals
   *   2. otherwise replace the derived entry with the day's current total
   *   3. if that total is zero, leave no entry rather than a misleading 0
   *
   * Rule 3 matters for macros-only meals, which sum to zero calories.
   *
   * Recomputing the whole day rather than adding a delta means this is correct
   * when an existing meal is edited, which the POST route allows by id.
   */
  const syncDerivedCalorieEntry = async ({ userId, date }) => {
    const userPk = await getUserPk(prisma, userId);
    const calorieDate = dateOnlyToDate(date);
    if (!userPk || !calorieDate) return null;

    const manualEntry = await prisma.calorieEntry.findFirst({
      where: { userId: userPk, calorieDate, NOT: { source: DERIVED_CALORIE_SOURCE } },
      select: { id: true }
    });
    if (manualEntry) return null;

    const total = await sumCaloriesForDate({ userId, date });
    const legacyId = `${DERIVED_CALORIE_SOURCE_PREFIX}${String(date).slice(0, 10)}`;
    const existing = await prisma.calorieEntry.findFirst({
      where: { userId: userPk, calorieDate, source: DERIVED_CALORIE_SOURCE },
      select: { id: true }
    });

    if (total <= 0) {
      if (existing) await prisma.calorieEntry.delete({ where: { id: existing.id } });
      return null;
    }

    const data = {
      userId: userPk,
      legacyId,
      calorieDate,
      calories: total,
      source: DERIVED_CALORIE_SOURCE
    };
    const row = existing
      ? await prisma.calorieEntry.update({ where: { id: existing.id }, data })
      : await prisma.calorieEntry.create({ data });
    return row.calories;
  };

  return { saveMealLog, sumCaloriesForDate, syncDerivedCalorieEntry };
};
