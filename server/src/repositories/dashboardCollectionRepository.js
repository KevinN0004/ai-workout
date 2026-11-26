/**
 * Paginated reads for the three dashboard collections: workout sessions, meal
 * logs and progress metrics. One generic loadCollectionPage serves all three,
 * because dashboardCollectionService drives them through a single code path.
 */
import { userIdWhere } from "./userLookup.js";
import { mapWorkoutSession, WORKOUT_SESSION_INCLUDE } from "./workoutSessionRepository.js";
import { mapMealLog } from "./mealLogRepository.js";
import { mapProgressMetric } from "./progressMetricRepository.js";

/**
 * One collection as loadCollectionPage reads it.
 * @typedef {object} CollectionSpec
 * @property {"workoutSession" | "mealLog" | "progressMetric"} delegate The Prisma model.
 * @property {(row: any) => object} mapRow Maps one row to what the dashboard sends.
 * @property {object} [include] What mapRow needs loaded with each row.
 * @property {Record<string, string>} sortFields A sort name to its column.
 */

/**
 * The two calls a page makes, which all three collections' models share. Their
 * arguments are typed per model, so they are any here.
 * @typedef {object} CollectionModel
 * @property {(args: any) => Promise<any[]>} findMany
 * @property {(args: any) => Promise<number>} count
 */

// `include` is what a collection's mapRow needs loaded with each row.
/** @type {Record<"workoutSessions" | "mealLogs" | "progressMetrics", CollectionSpec>} */
const COLLECTIONS = {
  workoutSessions: {
    delegate: "workoutSession",
    mapRow: mapWorkoutSession,
    include: WORKOUT_SESSION_INCLUDE,
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
 *
 * @param {{ prisma: import("@prisma/client").PrismaClient }} deps
 */
export const createDashboardCollectionRepository = ({ prisma }) => {
  /**
   * One page of a collection, newest first by `sortField`, plus the total of
   * the user's whole collection.
   *
   * Rows that share a `sortField` value are ordered by id. Without that
   * tiebreaker their order is whatever Postgres returns, so paging over tied
   * values can repeat or skip a row.
   *
   * @param {object} args
   * @param {keyof typeof COLLECTIONS} args.collection
   * @param {unknown} args.userId
   * @param {string} args.sortField
   * @param {number} args.limit
   * @param {number} args.offset
   */
  const loadCollectionPage = async ({ collection, userId, sortField, limit, offset }) => {
    const spec = COLLECTIONS[collection];
    if (!spec) throw new Error(`Unknown dashboard collection: ${collection}`);

    const where = { user: userIdWhere(userId) };
    const orderBy = [{ [spec.sortFields[sortField] || sortField]: "desc" }, { id: "desc" }];

    // Each model's own call types differ by model; a page uses only what they share.
    const [rows, total] = await Promise.all([
      /** @type {CollectionModel} */ (prisma[spec.delegate]).findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        ...(spec.include ? { include: spec.include } : {})
      }),
      /** @type {CollectionModel} */ (prisma[spec.delegate]).count({ where })
    ]);

    return { items: rows.map(spec.mapRow), total };
  };

  return { loadCollectionPage };
};
