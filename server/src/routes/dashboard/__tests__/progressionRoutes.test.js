import { describe, expect, test, vi } from "vitest";
import pino from "pino";
import express from "express";
import request from "supertest";
import { registerProgressionRoutes } from "../registerProgressionRoutes.js";
import { validateBody } from "../../../services/http/apiSchemaService.js";

// The progression routes' answers to what the wire cannot stage: a user row
// gone between the session check and the read, and a failure inside the
// handler. progression.integration.test.js runs everything else against real
// Postgres, so the dependencies are stubbed here.

const NOW = new Date("2026-11-09T12:00:00Z");

// The user holds the id the routes read, the stub mapper hands the doc back as
// is, so it is cast through unknown, and the logger is a real one that writes
// nothing.
/**
 * @param {Partial<Parameters<typeof registerProgressionRoutes>[1]>} [overrides]
 */
const buildApp = (overrides = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = /** @type {import("../../../services/auth/authUserService.js").AuthUser} */ ({
      id: "u-1"
    });
    req.log = pino({ level: "silent" });
    next();
  });
  registerProgressionRoutes(app, {
    requireAuth: (_req, _res, next) => next(),
    validateBody,
    findUserWithDashboard: async () => null,
    mapDbDocToUser:
      /** @type {Parameters<typeof registerProgressionRoutes>[1]["mapDbDocToUser"]} */ (
        /** @type {unknown} */ ((doc) => doc)
      ),
    listWeekDecisions: async () => ({}),
    saveDecision: vi.fn(),
    removeDecision: vi.fn(),
    ...overrides
  });
  return app;
};

/**
 * @param {import("express").Express} app
 */
const routes = (app) => [
  request(app).get("/api/dashboard/progression"),
  request(app)
    .put("/api/dashboard/progression/2026-11-09/lifts/leg%20press")
    .send({ decision: "undo" }),
  request(app).delete("/api/dashboard/progression/2026-11-09/week")
];

describe("the progression routes without a database", () => {
  test("a user row gone since the session check is a 404 on every route", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    try {
      const responses = await Promise.all(routes(buildApp()));
      expect(responses.map((response) => [response.status, response.body])).toEqual([
        [404, { error: "User not found." }],
        [404, { error: "User not found." }],
        [404, { error: "User not found." }]
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a failure while loading the week is a 500 on every route", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    try {
      const app = buildApp({
        findUserWithDashboard: async () => {
          throw new Error("database down");
        }
      });
      const responses = await Promise.all(routes(app));
      expect(responses.map((response) => response.status)).toEqual([500, 500, 500]);
    } finally {
      vi.useRealTimers();
    }
  });
});
