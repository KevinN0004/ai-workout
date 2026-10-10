/**
 * Client error tracking with Sentry, off unless the bundle was built with
 * VITE_SENTRY_DSN. main.jsx starts it before the first render; the SDK is in
 * errorTrackingSdk.js, fetched only when a DSN is set.
 */

// Enough to report a crash on mount. A render loop failing every frame would
// otherwise queue hundreds of copies of one error.
const MAX_EARLY_ERRORS = 10;

// The SDK is loaded on demand, not imported. Imported, it would sit in the main
// chunk and take it past the build's chunk-size warning, which is how this repo
// notices something landing on the eager path. Loaded this way it costs a
// visitor nothing until a DSN is configured, and then arrives just after the
// first render. The price, measured against the live project: the
// /api/auth/me and /api/csrf-token calls made while booting go out before it
// and carry no trace headers.
const loadSdk = () => import("./errorTrackingSdk.js");

/**
 * Starts Sentry and resolves true once it is running, or false when there is no
 * DSN or the SDK fails to load. Off without a DSN the same way the server's
 * errorTrackingService is off without SENTRY_DSN: development, the unit suites
 * and the E2E build all run without one, so none of them report into the real
 * project. `load` is the SDK loader, replaced in tests.
 *
 * The server's CSP must allow the ingest host and Replay's blob: worker, or
 * every report is refused on the deployed origin. index.js derives both from
 * this same variable.
 */
export const initErrorTracking = async (dsn = import.meta.env.VITE_SENTRY_DSN, load = loadSdk) => {
  const configuredDsn = typeof dsn === "string" ? dsn.trim() : "";
  if (!configuredDsn) return false;

  // Errors thrown before the SDK arrives -- a crash while mounting is the one
  // that matters -- are held here and reported once it has. The listeners are
  // registered before the first await, so they are in place before main.jsx
  // renders anything.
  const early = [];
  const hold = (error) => {
    if (early.length < MAX_EARLY_ERRORS) early.push(error);
  };
  const holdError = (event) => hold(event.error ?? event.message);
  const holdRejection = (event) => hold(event.reason);
  window.addEventListener("error", holdError);
  window.addEventListener("unhandledrejection", holdRejection);
  const release = () => {
    window.removeEventListener("error", holdError);
    window.removeEventListener("unhandledrejection", holdRejection);
  };

  let Sentry;
  try {
    Sentry = await load();
  } catch {
    // A chunk that fails to load must not surface as an unhandled rejection
    // of its own, or disturb the app it was meant to watch.
    release();
    return false;
  }

  Sentry.init({
    dsn: configuredDsn,
    // Replay is called with no options on purpose: its defaults mask all text
    // and inputs and block media, which is what keeps weight, body fat and the
    // rest of a profile out of the recordings.
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    // tracePropagationTargets is left at its default, which adds the trace
    // headers to same-origin requests -- every /api call made once the SDK is
    // running, in development and in production alike. Naming targets
    // replaces that default, so a list matching "localhost" would trace the
    // dev server and silently stop tracing the deployed one.
    //
    // One page load in ten. Errors are not sampled by this -- every error is
    // still reported -- it only thins the performance traces, which at 1.0
    // would send one per page load into the free plan's quota. Enough for
    // trends.
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
  });
  // In the same tick as init: from here on the SDK's own handlers catch
  // everything, and a listener left behind would only collect errors that
  // nothing will ever send.
  release();
  early.forEach((error) => Sentry.captureException(error));
  return true;
};
