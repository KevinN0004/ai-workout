/**
 * The paginated dashboard: a page of one collection for the per-collection
 * routes, and the dashboard response that combines a page of each with the
 * rest of the stored dashboard. Built once in index.js over
 * dashboardCollectionRepository's reader.
 */
// @ts-check

// The three collections, and the field each one's pages are ordered by.
const COLLECTION_SORT_FIELDS = {
  workoutSessions: "createdAt",
  mealLogs: "loggedAt",
  progressMetrics: "loggedAt"
};

/** @typedef {keyof typeof COLLECTION_SORT_FIELDS} CollectionName */

/**
 * A page's size and start, either of which a caller may leave out.
 * @typedef {{ limit?: number, offset?: number }} Pagination
 */

/**
 * A user as the service reads one: the id, and for the full dashboard the
 * stored dashboard.
 * @typedef {{ id?: unknown, dashboard?: import("./dashboardDataBuildersService.js").StoredDashboard } | null | undefined} DashboardUser
 */

const emptyPage = () => ({ items: [], total: 0, limit: 0, offset: 0, source: "collection" });

/**
 * Builds the service. Returns the pagination parser and the one-collection
 * loader the paginated read routes use, and `buildDashboardResponse`, which the
 * read and write routes both answer with.
 *
 * @param {object} deps `defaultLimit` is a page's size when the caller names none, and a
 *   requested size above `maxLimit` falls back to it; index.js reads both from
 *   the environment. `loadCollectionPage` is the repository reader,
 *   and `buildDashboard` normalises the stored dashboard.
 * @param {typeof import("./dashboardDataBuildersService.js").cleanText} deps.cleanText
 * @param {typeof import("./dashboardDataBuildersService.js").toNullableNumber} deps.toNullableNumber
 * @param {number} deps.defaultLimit
 * @param {number} deps.maxLimit
 * @param {ReturnType<typeof import("../../repositories/dashboardCollectionRepository.js").createDashboardCollectionRepository>["loadCollectionPage"]} deps.loadCollectionPage
 * @param {typeof import("./dashboardDataBuildersService.js").buildDashboard} deps.buildDashboard
 */
export const createDashboardCollectionService = ({
  cleanText,
  toNullableNumber,
  defaultLimit,
  maxLimit,
  loadCollectionPage,
  buildDashboard
}) => {
  /**
   * @param {{ limit?: unknown, offset?: unknown }} [query]
   * @param {number} [fallbackLimit]
   */
  const parseDashboardPagination = (query = {}, fallbackLimit = defaultLimit) => {
    const parsedLimit = toNullableNumber(query?.limit, 1, maxLimit) ?? fallbackLimit;
    const parsedOffset = toNullableNumber(query?.offset, 0, 100000) ?? 0;
    return {
      limit: Math.trunc(parsedLimit),
      offset: Math.trunc(parsedOffset)
    };
  };

  // Shape the repository page into the response envelope the routes expect. The
  // items are the repository's row mappers' output, which carries no owner id.
  /**
   * @param {{ collection: CollectionName, userId: string, sortField: string, limit: number, offset: number }} args
   */
  const toCollectionPage = async ({ collection, userId, sortField, limit, offset }) => {
    const { items, total } = await loadCollectionPage({
      collection,
      userId,
      sortField,
      limit,
      offset
    });
    return {
      items,
      total,
      limit,
      offset,
      source: "collection"
    };
  };

  // One page of one collection: the caller's pagination for it, else the
  // default first page.
  /**
   * @param {CollectionName} collection
   * @param {string} userId
   * @param {Pagination} [pagination]
   */
  const loadPage = (collection, userId, pagination = {}) => {
    const { limit, offset } = { ...parseDashboardPagination({}, defaultLimit), ...pagination };
    return toCollectionPage({
      collection,
      userId,
      sortField: COLLECTION_SORT_FIELDS[collection],
      limit,
      offset
    });
  };

  // One collection, for the paginated routes. No user id: an empty page,
  // without a query.
  /**
   * @param {DashboardUser} user
   * @param {CollectionName} collection
   * @param {Pagination} [pagination]
   */
  const getDashboardCollection = async (user, collection, pagination) => {
    const userId = cleanText(user?.id, 120);
    if (!userId) return emptyPage();
    return loadPage(collection, userId, pagination);
  };

  // All three, for the full dashboard. No user id: an empty page of each,
  // without a query.
  /**
   * @param {DashboardUser} user
   * @param {Partial<Record<CollectionName, Pagination>>} [pagination]
   */
  const getDashboardCollections = async (user, pagination = {}) => {
    const userId = cleanText(user?.id, 120);
    if (!userId) {
      return { workoutSessions: emptyPage(), mealLogs: emptyPage(), progressMetrics: emptyPage() };
    }

    const [workoutSessions, mealLogs, progressMetrics] = await Promise.all([
      loadPage("workoutSessions", userId, pagination.workoutSessions),
      loadPage("mealLogs", userId, pagination.mealLogs),
      loadPage("progressMetrics", userId, pagination.progressMetrics)
    ]);

    return {
      workoutSessions,
      mealLogs,
      progressMetrics
    };
  };

  /**
   * @param {DashboardUser} user
   * @param {Partial<Record<CollectionName, Pagination>>} [pagination]
   */
  const buildDashboardResponse = async (user, pagination = {}) => {
    const baseDashboard = buildDashboard(user?.dashboard);
    const collections = await getDashboardCollections(user, pagination);

    return {
      dashboard: {
        ...baseDashboard,
        // Each collection's page holds its own rows, as the paged routes say.
        workoutSessions:
          /** @type {ReturnType<typeof import("../../repositories/workoutSessionRepository.js").mapWorkoutSession>[]} */ (
            collections.workoutSessions.items
          ),
        mealLogs:
          /** @type {ReturnType<typeof import("../../repositories/mealLogRepository.js").mapMealLog>[]} */ (
            collections.mealLogs.items
          ),
        progressMetrics:
          /** @type {ReturnType<typeof import("../../repositories/progressMetricRepository.js").mapProgressMetric>[]} */ (
            collections.progressMetrics.items
          )
      },
      pagination: {
        workoutSessions: {
          total: collections.workoutSessions.total,
          limit: collections.workoutSessions.limit,
          offset: collections.workoutSessions.offset,
          source: collections.workoutSessions.source
        },
        mealLogs: {
          total: collections.mealLogs.total,
          limit: collections.mealLogs.limit,
          offset: collections.mealLogs.offset,
          source: collections.mealLogs.source
        },
        progressMetrics: {
          total: collections.progressMetrics.total,
          limit: collections.progressMetrics.limit,
          offset: collections.progressMetrics.offset,
          source: collections.progressMetrics.source
        }
      }
    };
  };

  return {
    parseDashboardPagination,
    getDashboardCollection,
    buildDashboardResponse
  };
};
