/**
 * Builds the routine run on SIGTERM/SIGINT: stop accepting connections, drain,
 * then release every external resource before exiting. Its dependencies are
 * injected so the sequence can be tested by direct call: Windows does not
 * deliver POSIX signals to Node the way the Linux CI runner does.
 */

/**
 * Returns the handler index.js runs on SIGTERM and SIGINT. A second signal
 * while one is running does nothing.
 *
 * @param {object} deps
 * @param {import("pino").Logger} deps.logger
 * @param {(value: unknown, maxLen?: number) => string} deps.toShortText
 * @param {() => import("node:http").Server | null | undefined} deps.getHttpServer
 * @param {() => Promise<void>} deps.closeSessionStore
 * @param {() => Promise<void>} deps.disconnectPrisma
 * @param {() => Promise<void>} deps.closePostgres
 * @param {() => Promise<void>} deps.flushErrorTracker
 * @param {number} [deps.shutdownTimeoutMs]
 * @param {(code: number) => void} [deps.exit]
 */
export const createShutdownHandler = ({
  logger,
  toShortText,
  getHttpServer,
  closeSessionStore,
  disconnectPrisma,
  closePostgres,
  flushErrorTracker,
  shutdownTimeoutMs = 10000,
  exit = (code) => process.exit(code)
}) => {
  let shuttingDown = false;

  return async (/** @type {string} */ signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ event: "shutdown_started", signal }, "Shutdown signal received.");

    const forceExit = setTimeout(() => {
      logger.error(
        { event: "shutdown_timeout", signal, shutdownTimeoutMs },
        "Shutdown did not finish in time. Forcing exit."
      );
      exit(1);
    }, shutdownTimeoutMs);
    // Never let the guard timer itself hold the process open.
    if (typeof forceExit.unref === "function") forceExit.unref();

    try {
      const httpServer = getHttpServer();
      if (httpServer) {
        // It resolves with nothing once the server has closed.
        await /** @type {Promise<void>} */ (
          new Promise((resolve) => {
            httpServer.close(() => resolve());
            // close() waits on idle keep-alive sockets; drop them so it can finish.
            httpServer.closeIdleConnections?.();
          })
        );
      }
      await closeSessionStore();
      await disconnectPrisma();
      await closePostgres();
      await flushErrorTracker();

      clearTimeout(forceExit);
      logger.info({ event: "shutdown_complete", signal }, "Shutdown complete.");
      exit(0);
    } catch (/** @type {any} */ err) {
      // A close or flush step threw it, possibly a non-Error.
      clearTimeout(forceExit);
      logger.error(
        {
          event: "shutdown_failed",
          signal,
          error: toShortText(err?.message || String(err), 300)
        },
        "Shutdown failed."
      );
      exit(1);
    }
  };
};
