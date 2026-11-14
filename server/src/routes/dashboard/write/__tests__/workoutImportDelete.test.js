import { describe, expect, test, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerWorkoutAndGoalRoutes } from "../registerWorkoutAndGoalRoutes.js";

// Deleting a workout imported from Strava (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "Deleting an import"), with
// the store stubbed: only an import is deleted, and the answer is the
// refreshed dashboard. stravaSync.integration.test.js runs it against Postgres.

const buildApp = (overrides = {}, user = { id: "u-1" }) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    next();
  });
  const deps = {
    requireAuth: (req, res, next) => {
      if (!user) return res.status(401).json({ error: "Not signed in." });
      req.user = user;
      next();
    },
    deleteImportById: vi.fn(async () => true),
    findUserWithDashboard: vi.fn(async () => ({ userId: "u-1" })),
    mapDbDocToUser: (doc) => doc,
    buildDashboardResponse: vi.fn(async () => ({ dashboard: { workoutSessions: [] } })),
    ...overrides
  };
  registerWorkoutAndGoalRoutes(app, deps);
  return { app, deps };
};

const PATH = "/api/dashboard/workouts";

describe("DELETE /api/dashboard/workouts/:id", () => {
  test("deletes the user's import, and answers the refreshed dashboard", async () => {
    const { app, deps } = buildApp();

    const response = await request(app).delete(`${PATH}/import-1`).expect(200);

    expect(deps.deleteImportById).toHaveBeenCalledWith({ userId: "u-1", id: "import-1" });
    expect(response.body).toEqual({ dashboard: { workoutSessions: [] }, ok: true });
  });

  test("a workout that is not this user's import is a 404, and nothing is deleted", async () => {
    const { app, deps } = buildApp({ deleteImportById: vi.fn(async () => false) });

    const response = await request(app).delete(`${PATH}/own-1`).expect(404);

    expect(response.body).toEqual({ error: "Workout not found." });
    expect(deps.buildDashboardResponse).not.toHaveBeenCalled();
  });

  test("an id longer than any id is a 400", async () => {
    const { app, deps } = buildApp();
    await request(app)
      .delete(`${PATH}/${"x".repeat(65)}`)
      .expect(400);
    expect(deps.deleteImportById).not.toHaveBeenCalled();
  });

  test("a user gone by the time of the answer is a 404", async () => {
    const { app } = buildApp({ findUserWithDashboard: vi.fn(async () => null) });
    const response = await request(app).delete(`${PATH}/import-1`).expect(404);
    expect(response.body).toEqual({ error: "User not found." });
  });

  test("a failing store is a 500", async () => {
    const { app } = buildApp({
      deleteImportById: vi.fn(async () => Promise.reject(new Error("down")))
    });
    await request(app).delete(`${PATH}/import-1`).expect(500);
  });

  test("needs a session", async () => {
    const { app } = buildApp({}, null);
    await request(app).delete(`${PATH}/import-1`).expect(401);
  });
});
