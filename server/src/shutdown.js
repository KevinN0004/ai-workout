/**
 * Builds the routine run on SIGTERM/SIGINT: stop accepting connections, drain,
 * then release every external resource before exiting. Its dependencies are
 * injected so the sequence can be tested by direct call: Windows does not
 * deliver POSIX signals to Node the way the Linux CI runner does.
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

  return async (signal) => {
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
        await new Promise((resolve) => {
          httpServer.close(() => resolve());
          // close() waits on idle keep-alive sockets; drop them so it can finish.
          httpServer.closeIdleConnections?.();
        });
      }
      await closeSessionStore();
      await disconnectPrisma();
      await closePostgres();
      await flushErrorTracker();

      clearTimeout(forceExit);
      logger.info({ event: "shutdown_complete", signal }, "Shutdown complete.");
      exit(0);
    } catch (err) {
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
