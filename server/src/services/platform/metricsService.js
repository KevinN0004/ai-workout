/**
 * The in-process metrics the `/api/metrics` route reports: the counters object
 * index.js creates at boot, and the latency buckets that requestContext.js and
 * the external-API recorder fold durations into.
 */
// @ts-check

/**
 * One latency bucket, as initLatencyStats builds it.
 * @typedef {ReturnType<typeof initLatencyStats>} LatencyStats
 */

/**
 * The counters object createMetrics builds and index.js hands its consumers.
 * @typedef {ReturnType<typeof createMetrics>} Metrics
 */

/** An empty latency bucket, the shape recordLatencyStats fills. */
export const initLatencyStats = () => ({
  count: 0,
  totalMs: 0,
  maxMs: 0,
  lastMs: 0
});

/**
 * Folds one duration into a bucket in place.
 *
 * A missing bucket, a non-finite duration and a negative one are all ignored
 * rather than recorded: the caller measures with `Date.now()` deltas, and a
 * clock adjustment mid-request can produce a negative, which would corrupt the
 * running total and the max for the lifetime of the process.
 *
 * @param {Partial<LatencyStats> | undefined} bucket A route's bucket starts as `{}`.
 * @param {number} durationMs
 */
export const recordLatencyStats = (bucket, durationMs) => {
  if (!bucket || !Number.isFinite(durationMs) || durationMs < 0) return;
  bucket.count = (bucket.count || 0) + 1;
  bucket.totalMs = (bucket.totalMs || 0) + durationMs;
  bucket.maxMs = Math.max(bucket.maxMs || 0, durationMs);
  bucket.lastMs = durationMs;
};

/**
 * The four upstreams are seeded so `/api/metrics` reports them from boot rather
 * than only after the first call to each.
 */
export const createMetrics = () => ({
  requestsTotal: 0,
  authFailures: 0,
  rateLimited: 0,
  postgresPoolErrors: 0,
  requestLatencyMs: initLatencyStats(),
  routeLatencyMs: /** @type {Record<string, Partial<LatencyStats>>} */ ({}),
  externalCache: {
    hits: 0,
    misses: 0,
    staleHits: 0,
    writes: 0,
    evictions: 0
  },
  externalApiFailures: /** @type {Record<string, number>} */ ({
    openMeteo: 0,
    openAq: 0,
    wger: 0,
    mealDb: 0
  }),
  externalApiRetries: /** @type {Record<string, number>} */ ({
    openMeteo: 0,
    openAq: 0,
    wger: 0,
    mealDb: 0
  }),
  externalApiLatencyMs: /** @type {Record<string, LatencyStats>} */ ({
    openMeteo: initLatencyStats(),
    openAq: initLatencyStats(),
    wger: initLatencyStats(),
    mealDb: initLatencyStats()
  })
});

/**
 * Records a latency against a named upstream, creating the bucket on first use.
 *
 * The service name goes through `cleanText` and an empty one is dropped, so a
 * caller cannot grow `externalApiLatencyMs` with an unbounded set of keys --
 * the same reasoning as the route-path sanitising in requestContext.js.
 *
 * @param {{ metrics: Metrics, cleanText: typeof import("../dashboard/dashboardDataBuildersService.js").cleanText }} deps
 */
export const createExternalApiLatencyRecorder = ({ metrics, cleanText }) => {
  return (/** @type {string} */ serviceName, /** @type {number} */ durationMs) => {
    const key = cleanText(serviceName, 32);
    if (!key) return;
    if (!metrics.externalApiLatencyMs[key]) {
      metrics.externalApiLatencyMs[key] = initLatencyStats();
    }
    recordLatencyStats(metrics.externalApiLatencyMs[key], durationMs);
  };
};
