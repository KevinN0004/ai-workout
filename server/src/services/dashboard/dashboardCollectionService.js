/**
 * The paginated dashboard: one page of each collection, and the dashboard
 * response that combines those pages with the rest of the stored dashboard.
 * Built once in index.js over dashboardCollectionRepository's reader.
 */

/**
 * Builds the service. Returns the pagination parser and the collection loader
 * the dashboard read routes use, and `buildDashboardResponse`, which the read
 * and write routes both answer with.
 *
 * @param deps `defaultLimit` is a page's size when the caller names none, and a
 *   requested size above `maxLimit` falls back to it; index.js reads both from
 *   the environment. `loadCollectionPage` is the repository reader,
 *   and `buildDashboard` normalises the stored dashboard.
 */
export const createDashboardCollectionService = ({
  cleanText,
  toNullableNumber,
  defaultLimit,
  maxLimit,
  loadCollectionPage,
  buildDashboard
}) => {
  const parseDashboardPagination = (query = {}, fallbackLimit = defaultLimit) => {
    const parsedLimit = toNullableNumber(query?.limit, 1, maxLimit) ?? fallbackLimit;
    const parsedOffset = toNullableNumber(query?.offset, 0, 100000) ?? 0;
    return {
      limit: Math.trunc(parsedLimit),
      offset: Math.trunc(parsedOffset)
    };
  };

  const stripUserIdField = (doc = {}) => {
    if (!doc || typeof doc !== "object") return doc;
    const { userId: _omitUserId, ...rest } = doc;
    return rest;
  };

  // Shape the repository page into the response envelope the routes expect.
  const toCollectionPage = async ({ collection, userId, sortField, limit, offset }) => {
    const { items, total } = await loadCollectionPage({
      collection,
      userId,
      sortField,
      limit,
      offset
    });
    return {
      items: items.map(stripUserIdField),
      total,
      limit,
      offset,
      source: "collection"
    };
  };

  const getDashboardCollections = async (user, pagination = {}) => {
    // No user id: an empty page of each, without a query.
    const userId = cleanText(user?.id, 120);
    if (!userId) {
      return {
        workoutSessions: { items: [], total: 0, limit: 0, offset: 0, source: "collection" },
        mealLogs: { items: [], total: 0, limit: 0, offset: 0, source: "collection" },
        progressMetrics: { items: [], total: 0, limit: 0, offset: 0, source: "collection" }
      };
    }

    // Each collection gets the caller's pagination for it, else the default
    // first page.
    const workoutPagination = {
      ...parseDashboardPagination({}, defaultLimit),
      ...(pagination.workoutSessions || {})
    };
    const mealPagination = {
      ...parseDashboardPagination({}, defaultLimit),
      ...(pagination.mealLogs || {})
    };
    const metricPagination = {
      ...parseDashboardPagination({}, defaultLimit),
      ...(pagination.progressMetrics || {})
    };

    // All three pages load at once, even for a route that answers with one.
    const [workoutSessions, mealLogs, progressMetrics] = await Promise.all([
      toCollectionPage({
        collection: "workoutSessions",
        userId,
        sortField: "createdAt",
        limit: workoutPagination.limit,
        offset: workoutPagination.offset
      }),
      toCollectionPage({
        collection: "mealLogs",
        userId,
        sortField: "loggedAt",
        limit: mealPagination.limit,
        offset: mealPagination.offset
      }),
      toCollectionPage({
        collection: "progressMetrics",
        userId,
        sortField: "loggedAt",
        limit: metricPagination.limit,
        offset: metricPagination.offset
      })
    ]);

    return {
      workoutSessions,
      mealLogs,
      progressMetrics
    };
  };

  const buildDashboardResponse = async (user, pagination = {}) => {
    const baseDashboard = buildDashboard(user?.dashboard);
    const collections = await getDashboardCollections(user, pagination);

    return {
      dashboard: {
        ...baseDashboard,
        workoutSessions: collections.workoutSessions.items,
        mealLogs: collections.mealLogs.items,
        progressMetrics: collections.progressMetrics.items
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
    getDashboardCollections,
    buildDashboardResponse
  };
};
