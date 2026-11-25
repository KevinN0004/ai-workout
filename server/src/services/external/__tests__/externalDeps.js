// Real dependencies for building the external-data and HTTP-cache services in a
// test: the app's own text and number helpers, fresh metrics, a silent logger and
// an in-memory cache with no Redis. No test calls the upstream hosts named here.
// @ts-check
import pino from "pino";
import {
  cleanText,
  toNullableNumber,
  toPositiveInt
} from "../../dashboard/dashboardDataBuildersService.js";
import { createExternalApiLatencyRecorder, createMetrics } from "../../platform/metricsService.js";
import { createHttpCacheService } from "../httpCacheService.js";

/**
 * What createHttpCacheService takes, as index.js builds it, with a small cache
 * and no Redis client.
 *
 * @returns {Parameters<typeof createHttpCacheService>[0]}
 */
export const httpCacheDeps = () => ({
  metrics: createMetrics(),
  logger: pino({ level: "silent" }),
  // index.js's toShortText is cleanText with a longer default length, and every
  // call either service makes passes its own length.
  toShortText: cleanText,
  toPositiveInt,
  maxEntries: 10,
  defaultStaleTtlSec: 60
});

/**
 * What createExternalDataService takes, as index.js builds it: the real cache
 * over httpCacheDeps, no retries, and settings for upstreams no test calls.
 *
 * @returns {import("../externalDataService.js").ExternalDataDeps}
 */
export const externalDataDeps = () => {
  const cacheDeps = httpCacheDeps();
  const { readThroughExternalCache, buildExternalCacheKey } = createHttpCacheService(cacheDeps);
  return {
    cleanText,
    toNullableNumber,
    readThroughExternalCache,
    buildExternalCacheKey,
    metrics: cacheDeps.metrics,
    logger: cacheDeps.logger,
    toShortText: cleanText,
    recordExternalApiLatency: createExternalApiLatencyRecorder({
      metrics: cacheDeps.metrics,
      cleanText
    }),
    externalApiRetries: 0,
    externalApiRetryBaseDelayMs: 0,
    openMeteoBaseUrl: "https://open-meteo.invalid",
    openMeteoTimeoutMs: 1000,
    openMeteoCacheTtlSec: 60,
    openAqBaseUrl: "https://openaq.invalid",
    openAqApiKey: "",
    openAqTimeoutMs: 1000,
    openAqCacheTtlSec: 60,
    wgerBaseUrl: "https://wger.invalid",
    wgerApiToken: "",
    wgerDefaultLanguage: 2,
    wgerTimeoutMs: 1000,
    wgerCacheTtlSec: 60,
    mealDbBaseUrl: "https://mealdb.invalid",
    mealDbTimeoutMs: 1000,
    mealDbCacheTtlSec: 60
  };
};
