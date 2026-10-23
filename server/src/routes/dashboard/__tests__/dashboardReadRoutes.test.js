import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { registerDashboardReadRoutes } from "../registerDashboardReadRoutes.js";
import { createDashboardCollectionService } from "../../../services/dashboard/dashboardCollectionService.js";
import {
  buildDashboard,
  cleanText,
  toNullableNumber
} from "../../../services/dashboard/dashboardDataBuildersService.js";

// The dashboard read routes over the real collection service, with only the
// repository reader stubbed: what this pins is which collections each route
// asks the database for. collectionReads.integration.test.js covers the same
// routes against Postgres.

let loadCollectionPage;

const paginatedPaths = [
  "/api/dashboard/workout-sessions",
  "/api/dashboard/meal-logs",
  "/api/dashboard/progress-metrics"
];

const buildApp = ({ user = { id: "u-1", dashboard: {} } } = {}) => {
  const service = createDashboardCollectionService({
    cleanText,
    toNullableNumber,
    defaultLimit: 50,
    maxLimit: 200,
    loadCollectionPage,
    buildDashboard
  });
  const app = express();
  registerDashboardReadRoutes(app, {
    ...service,
    requireAuth: (req, _res, next) => {
      req.user = user;
      next();
    }
  });
  return app;
};

beforeEach(() => {
  loadCollectionPage = vi.fn(async ({ collection }) => ({
    items: [{ id: `${collection}-1` }],
    total: 1
  }));
});

describe("the paginated routes", () => {
  // Each collection is a findMany and a count, so loading all three to answer
  // with one ran four queries for nothing.
  test.each([
    ["/api/dashboard/workout-sessions", "workoutSessions", "createdAt"],
    ["/api/dashboard/meal-logs", "mealLogs", "loggedAt"],
    ["/api/dashboard/progress-metrics", "progressMetrics", "loggedAt"]
  ])("%s reads only its own collection", async (path, collection, sortField) => {
    const response = await request(buildApp()).get(`${path}?limit=5&offset=10`);

    expect(response.status).toBe(200);
    expect(loadCollectionPage).toHaveBeenCalledTimes(1);
    expect(loadCollectionPage).toHaveBeenCalledWith({
      collection,
      userId: "u-1",
      sortField,
      limit: 5,
      offset: 10
    });
    expect(response.body).toEqual({
      [collection]: [{ id: `${collection}-1` }],
      pagination: { total: 1, limit: 5, offset: 10, source: "collection" }
    });
  });

  test("reads the default first page when the query names none", async () => {
    await request(buildApp()).get("/api/dashboard/meal-logs");

    expect(loadCollectionPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, offset: 0 })
    );
  });

  // requireAuth always supplies a user with an id; without one the loader
  // answers an empty page rather than query for nobody.
  test("answers an empty page, without a query, for a user with no id", async () => {
    const response = await request(buildApp({ user: {} })).get("/api/dashboard/workout-sessions");

    expect(response.body).toEqual({
      workoutSessions: [],
      pagination: { total: 0, limit: 0, offset: 0, source: "collection" }
    });
    expect(loadCollectionPage).not.toHaveBeenCalled();
  });

  test.each(paginatedPaths)(
    "%s refuses a limit above the maximum, without a read",
    async (path) => {
      const response = await request(buildApp()).get(`${path}?limit=5000`);

      expect(response.status).toBe(400);
      expect(loadCollectionPage).not.toHaveBeenCalled();
    }
  );
});

describe("GET /api/dashboard", () => {
  test("still reads all three collections", async () => {
    const response = await request(buildApp()).get("/api/dashboard");

    expect(response.status).toBe(200);
    const collections = loadCollectionPage.mock.calls.map(([args]) => args.collection);
    expect(collections.sort()).toEqual(["mealLogs", "progressMetrics", "workoutSessions"]);
  });

  test("answers empty collections, without a query, for a user with no id", async () => {
    const response = await request(buildApp({ user: {} })).get("/api/dashboard");

    expect(response.body.dashboard.workoutSessions).toEqual([]);
    expect(response.body.pagination.mealLogs).toEqual({
      total: 0,
      limit: 0,
      offset: 0,
      source: "collection"
    });
    expect(loadCollectionPage).not.toHaveBeenCalled();
  });
});

describe("a failed read", () => {
  test.each(["/api/dashboard", ...paginatedPaths])("%s answers a masked 500", async (path) => {
    loadCollectionPage = vi.fn(async () => {
      throw new Error('relation "meal_logs" does not exist');
    });

    const response = await request(buildApp()).get(path);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toMatch(/meal_logs/);
  });
});
