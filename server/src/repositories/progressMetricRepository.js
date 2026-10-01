/**
 * Prisma-native persistence for progress metrics: the row mapper the API
 * returns, and the save.
 */
import { dateOnlyToDate, toDateOnly, toIso, toNumberOrNull } from "./rowValues.js";
import { getUserPk } from "./userLookup.js";

/**
 * Maps a progress_metrics row to the metric the API returns. The Decimal
 * columns read through toNumberOrNull, so an unrecorded reading is null, not 0.
 */
export const mapProgressMetric = (row = {}) => ({
  id: row.legacyId || row.id,
  date: toDateOnly(row.metricDate),
  weightLb: toNumberOrNull(row.weightLb),
  bodyFatPct: toNumberOrNull(row.bodyFatPct),
  waistCm: toNumberOrNull(row.waistCm),
  restingHr: row.restingHr ?? null,
  notes: row.notes || "",
  loggedAt: toIso(row.loggedAt)
});

/**
 * Builds the progress-metric writer over `prisma`. Returns `saveProgressMetric`,
 * which the progress-metrics route calls.
 */
export const createProgressMetricRepository = ({ prisma }) => {
  /**
   * Inserts a metric, or updates the existing row when one already carries the
   * same legacy id for this user.
   *
   * Deliberately a read-then-write rather than a Prisma `upsert`: the uniqueness
   * that makes this safe is `progress_metrics_user_legacy_idx`, a *partial*
   * unique index (`where legacy_id is not null`). Prisma's schema language
   * cannot express partial indexes, so `upsert` has no constraint to target.
   *
   * Returns null when the user cannot be resolved, as the workout, meal,
   * saved-exercise and plan saves do. The route does not read it: its own re-read is what answers 404.
   */
  const saveProgressMetric = async ({ userId, metric = {} }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return null;

    const legacyId = metric.id || null;
    const existing = legacyId
      ? await prisma.progressMetric.findFirst({
          where: { userId: userPk, legacyId },
          select: { id: true }
        })
      : null;

    const data = {
      userId: userPk,
      legacyId,
      metricDate: dateOnlyToDate(metric.date),
      weightLb: metric.weightLb ?? null,
      bodyFatPct: metric.bodyFatPct ?? null,
      waistCm: metric.waistCm ?? null,
      restingHr: metric.restingHr ?? null,
      notes: metric.notes || "",
      loggedAt: metric.loggedAt ? new Date(metric.loggedAt) : new Date()
    };

    const row = existing
      ? await prisma.progressMetric.update({ where: { id: existing.id }, data })
      : await prisma.progressMetric.create({ data });

    return mapProgressMetric(row);
  };

  return { saveProgressMetric };
};
