export const createDashboardCollectionService = ({
  cleanText,
  toNullableNumber,
  defaultLimit,
  maxLimit,
  WorkoutSession,
  MealLog,
  ProgressMetric,
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
    const { userId, ...rest } = doc;
    return rest;
  };

  const loadCollectionPage = async ({
    model,
    userId,
    sortField,
    limit,
    offset
  }) => {
    const [items, total] = await Promise.all([
      model
        .find({ userId })
        .sort({ [sortField]: -1, _id: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      model.countDocuments({ userId })
    ]);

    return {
      items: items.map(stripUserIdField),
      total,
      limit,
      offset,
      source: "collection"
    };
  };

  const getDashboardCollections = async (user, pagination = {}) => {
    const userId = cleanText(user?.id, 120);
    if (!userId) {
      return {
        workoutSessions: { items: [], total: 0, limit: 0, offset: 0, source: "collection" },
        mealLogs: { items: [], total: 0, limit: 0, offset: 0, source: "collection" },
        progressMetrics: { items: [], total: 0, limit: 0, offset: 0, source: "collection" }
      };
    }

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

    const [workoutSessions, mealLogs, progressMetrics] = await Promise.all([
      loadCollectionPage({
        model: WorkoutSession,
        userId,
        sortField: "createdAt",
        limit: workoutPagination.limit,
        offset: workoutPagination.offset
      }),
      loadCollectionPage({
        model: MealLog,
        userId,
        sortField: "loggedAt",
        limit: mealPagination.limit,
        offset: mealPagination.offset
      }),
      loadCollectionPage({
        model: ProgressMetric,
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
