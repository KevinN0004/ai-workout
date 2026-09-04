import { userIdWhere } from "./userLookup.js";
import { mapWorkoutSession } from "./workoutSessionRepository.js";
import { mapMealLog } from "./mealLogRepository.js";
import { mapProgressMetric } from "./progressMetricRepository.js";

/**
 * Paginated reads for the three dashboard collections.
 *
 * Task 3b of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md. This is
 * one task rather than three because dashboardCollectionService drives all
 * three models through a single generic function -- the reason the read side
 * could not be migrated per model the way the plan first assumed.
 */

const COLLECTIONS = {
  workoutSessions: {
    delegate: "workoutSession",
    mapRow: mapWorkoutSession,
    sortFields: { createdAt: "createdAt", date: "workoutDate" }
  },
  mealLogs: {
    delegate: "mealLog",
    mapRow: mapMealLog,
    sortFields: { loggedAt: "loggedAt", date: "mealDate" }
  },
  progressMetrics: {
    delegate: "progressMetric",
    mapRow: mapProgressMetric,
    sortFields: { loggedAt: "loggedAt", date: "metricDate" }
  }
};

export const createDashboardCollectionRepository = ({ prisma }) => {
  /**
   * One page of a collection, plus the unpaged total.
   *
   * The caller has always asked for `{ [sortField]: -1, _id: -1 }`, but the
   * shim's sort() read only the first key, so the tiebreaker was silently
   * discarded and ordering among rows sharing a timestamp was left to whatever
   * Postgres returned. It is honoured here: without it, paging over tied values
   * can repeat or skip a row, and the caller was already asking for the fix.
   */
  const loadCollectionPage = async ({ collection, userId, sortField, limit, offset }) => {
    const spec = COLLECTIONS[collection];
    if (!spec) throw new Error(`Unknown dashboard collection: ${collection}`);

    const where = { user: userIdWhere(userId) };
    const orderBy = [{ [spec.sortFields[sortField] || sortField]: "desc" }, { id: "desc" }];

    const [rows, total] = await Promise.all([
      prisma[spec.delegate].findMany({ where, orderBy, skip: offset, take: limit }),
      prisma[spec.delegate].count({ where })
    ]);

    return { items: rows.map(spec.mapRow), total };
  };

  return { loadCollectionPage };
};
