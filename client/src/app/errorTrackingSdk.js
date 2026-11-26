/**
 * Everything errorTracking.js uses from the SDK, in a module of its own so the
 * bundler splits it into a chunk that is only fetched when a DSN is set. See
 * errorTracking.js for why it is not imported directly.
 */
export {
  browserTracingIntegration,
  captureException,
  init,
  replayIntegration
} from "@sentry/react";
