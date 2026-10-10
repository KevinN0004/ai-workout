/**
 * Paginated reads for the three dashboard collections: workout sessions, meal
 * logs and progress metrics. One generic loadCollectionPage serves all three,
 * because dashboardCollectionService drives them through a single code path.
 */
import { userIdWhere } from "./userLookup.js";
import { mapWorkoutSession } from "./workoutSessionRepository.js";
import { mapMealLog } from "./mealLogRepository.js";
import { mapProgressMetric } from "./progressMetricRepository.js";

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

/**
 * Builds the reader over `prisma`. Returns `loadCollectionPage`, which index.js
 * hands to the dashboard collection service.
 */
export const createDashboardCollectionRepository = ({ prisma }) => {
  /**
   * One page of a collection, newest first by `sortField`, plus the total of
   * the user's whole collection.
   *
   * Rows that share a `sortField` value are ordered by id. Without that
   * tiebreaker their order is whatever Postgres returns, so paging over tied
   * values can repeat or skip a row.
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
