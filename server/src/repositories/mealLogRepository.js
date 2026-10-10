/**
 * Prisma-native persistence for meal logs: the row mapper the API returns, the
 * save (with the day's calorie entry re-derived in the same transaction), and the
 * calorie entry derived from each day's meals.
 */
import { dateOnlyToDate, toDateOnly, toIso, toNumberOrNull } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

// Marks a calorie entry as derived from meal logs rather than typed by the user.
const DERIVED_CALORIE_SOURCE = "meal_logs";
const DERIVED_CALORIE_SOURCE_PREFIX = "meal-logs-";

/**
 * Maps a meal_logs row to the meal the API returns. The macro columns are
 * Decimals, read through toNumberOrNull, so an unrecorded macro is null, not 0.
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

// The derived calorie entry is a summary figure that calorie_entries_calories_check
// (001_foundation.sql) bounds, while the meal schema bounds a single meal on its own,
// so a day's meals can sum past what one derived row may hold. Clamping the entry to
// the column ceiling keeps the meal log writable (rejecting the meal would punish the
// user for logging what they ate) while every meal stays stored in full.
const MAX_DERIVED_DAILY_CALORIES = 10000;

/**
 * Builds the meal-log writer over `rootPrisma`. The meal-log route calls
 * `saveMealLogWithDailySync`, which runs `saveMealLog` and
 * `syncDerivedCalorieEntry` inside one transaction; `sumCaloriesForDate` is the
 * total the sync derives its entry from. The three building blocks are returned
 * too, bound to the root client.
 */
export const createMealLogRepository = ({ prisma: rootPrisma }) => {
  // Binds the three operations to one client, so the same code runs on the root
  // client and on a transaction client.
  const build = (prisma) => {
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
     * `_sum` is null when no row has calories, so it is turned into 0 here: an
     * empty day's total is zero, not absent.
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
     * Keeps the calories view in step with the meals logged for one date:
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

      const total = Math.min(
        await sumCaloriesForDate({ userId, date }),
        MAX_DERIVED_DAILY_CALORIES
      );
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

  /**
   * Saves a meal and re-derives that day's calorie entry in one transaction, so
   * a failure in the derived write cannot leave a persisted meal behind an
   * error response (which the client answers by retrying and duplicating it).
   * Returns null when the user cannot be resolved.
   */
  const saveMealLogWithDailySync = ({ userId, mealLog }) =>
    rootPrisma.$transaction(async (tx) => {
      const repo = build(tx);
      const saved = await repo.saveMealLog({ userId, mealLog });
      if (!saved) return null;
      await repo.syncDerivedCalorieEntry({ userId, date: mealLog.date });
      return saved;
    });

  return { ...build(rootPrisma), saveMealLogWithDailySync };
};
