import { afterEach, describe, expect, test, vi } from "vitest";
import { createShutdownHandler } from "../shutdown.js";

const createLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
});

const buildDeps = (overrides = {}) => {
  const order = [];
  const httpServer = {
    close: vi.fn((cb) => {
      order.push("http");
      cb();
    }),
    closeIdleConnections: vi.fn()
  };
  return {
    order,
    httpServer,
    deps: {
      logger: createLogger(),
      toShortText: (value) => String(value || ""),
      getHttpServer: () => httpServer,
      closeSessionStore: vi.fn(async () => {
        order.push("session");
      }),
      disconnectPrisma: vi.fn(async () => {
        order.push("prisma");
      }),
      closePostgres: vi.fn(async () => {
        order.push("postgres");
      }),
      flushErrorTracker: vi.fn(async () => {
        order.push("flush");
      }),
      shutdownTimeoutMs: 5000,
      exit: vi.fn(),
      ...overrides
    }
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("createShutdownHandler", () => {
  test("stops the server, releases every resource in order, and exits 0", async () => {
    const { order, httpServer, deps } = buildDeps();
    const shutdown = createShutdownHandler(deps);

    await shutdown("SIGTERM");

    expect(order).toEqual(["http", "session", "prisma", "postgres", "flush"]);
    // Idle keep-alive sockets keep close() pending until they time out.
    expect(httpServer.closeIdleConnections).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  test("ignores repeat signals once shutdown is under way", async () => {
    const { deps } = buildDeps();
    const shutdown = createShutdownHandler(deps);

    await shutdown("SIGTERM");
    await shutdown("SIGINT");

    expect(deps.closePostgres).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  test("exits 1 when a resource fails to close", async () => {
    const { deps } = buildDeps({
      closePostgres: vi.fn(async () => {
        throw new Error("pool stuck");
      })
    });
    const shutdown = createShutdownHandler(deps);

    await shutdown("SIGTERM");

    expect(deps.exit).toHaveBeenCalledWith(1);
    expect(deps.logger.error).toHaveBeenCalled();
  });

  test("forces exit when shutdown outlives the timeout", async () => {
    vi.useFakeTimers();
    const { deps } = buildDeps({
      // Never invokes the callback, so close() never settles.
      getHttpServer: () => ({ close: vi.fn(), closeIdleConnections: vi.fn() })
    });
    const shutdown = createShutdownHandler(deps);

    shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(5000);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  test("tolerates a missing http server", async () => {
    const { deps } = buildDeps({ getHttpServer: () => null });
    const shutdown = createShutdownHandler(deps);

    await shutdown("SIGTERM");

    expect(deps.exit).toHaveBeenCalledWith(0);
  });
});
