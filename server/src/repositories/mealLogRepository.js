import { dateOnlyToDate, toDateOnly, toIso, toNumberOrNull } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

/**
 * Prisma-native persistence for meal logs.
 *
 * Task 3 of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md.
 */

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
   * Nothing calls this yet. It is kept because it is the working half of a
   * feature that is currently broken: the meal-log route computed this total and
   * then fed it to a Mongo pipeline the shim never executed, so meal logs
   * contribute nothing to the calories view. Deleting it would throw away the
   * only part that works. See the plan document for the defect writeup.
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

  return { saveMealLog, sumCaloriesForDate };
};
