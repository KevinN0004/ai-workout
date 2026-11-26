import { describe, expect, test, vi } from "vitest";
import pino from "pino";
import express from "express";
import request from "supertest";
import { registerWorkoutAndGoalRoutes } from "../registerWorkoutAndGoalRoutes.js";
import {
  validateBody,
  workoutSessionBodySchema
} from "../../../../services/http/apiSchemaService.js";
import { buildWorkoutSessionEntry } from "../../../../services/dashboard/dashboardDataBuildersService.js";

// The workout route's side of a plan-day link: what it answers and what it
// logs. The repository, which decides whether a link is kept, is stubbed here;
// workoutSessions.integration.test.js runs it against real Postgres.

// The user holds the id the route reads, and the deps cover the workout route
// alone, with stubs holding what it reads of their answers, so each is cast
// through unknown. The logger is a real one that writes nothing, its warn calls
// spied on.
/** @typedef {Parameters<typeof registerWorkoutAndGoalRoutes>[1]} Deps */
/**
 * @param {{ saveWorkoutSession: import("vitest").Mock }} options
 */
const buildApp = ({ saveWorkoutSession }) => {
  const log = pino({ level: "silent" });
  const warn = vi.spyOn(log, "warn");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = /** @type {import("../../../../services/auth/authUserService.js").AuthUser} */ ({
      id: "u-1"
    });
    req.log = log;
    next();
  });
  registerWorkoutAndGoalRoutes(
    app,
    /** @type {Deps} */ (
      /** @type {unknown} */ (
        /** @satisfies {{ [K in keyof Deps]?: unknown }} */ ({
          requireAuth: (_req, _res, next) => next(),
          validateBody,
          workoutSessionBodySchema,
          buildWorkoutSessionEntry,
          saveWorkoutSession,
          findUserWithDashboard: async () => ({ id: "u-1" }),
          mapDbDocToUser: (doc) => doc,
          buildDashboardResponse: async () => ({ dashboard: {} })
        })
      )
    )
  );
  return { app, warn };
};

/**
 * @param {import("express").Express} app
 * @param {object} body
 */
const post = (app, body) =>
  request(app)
    .post("/api/dashboard/workout-sessions")
    .send({ date: "2026-05-12", duration: 30, ...body });

/**
 * @param {import("vitest").MockInstance} warn
 */
const linkDropped = (warn) =>
  warn.mock.calls.some(([entry]) => entry?.event === "workout_plan_link_dropped");

describe("the workout route and a plan-day link", () => {
  test("answers the session as saved, not as sent", async () => {
    const saved = { id: "w-1", planId: "plan-1", planDayIndex: 2 };
    const { app } = buildApp({ saveWorkoutSession: vi.fn(async () => saved) });

    const response = await post(app, { planId: "plan-1", planDayIndex: 2 });

    expect(response.body.workoutSession).toEqual(saved);
  });

  test("logs a link that was asked for and not kept", async () => {
    const { app, warn } = buildApp({
      saveWorkoutSession: vi.fn(async () => ({ id: "w-1", planId: null, planDayIndex: null }))
    });

    const response = await post(app, { planId: "plan-1", planDayIndex: 2 });

    expect(response.status).toBe(200);
    expect(linkDropped(warn)).toBe(true);
  });

  test.each([
    ["a link that was kept", { planId: "plan-1", planDayIndex: 2 }, "plan-1"],
    ["no link asked for", {}, null]
  ])("logs nothing for %s", async (_label, body, savedPlanId) => {
    const { app, warn } = buildApp({
      saveWorkoutSession: vi.fn(async () => ({ id: "w-1", planId: savedPlanId }))
    });

    await post(app, body);

    expect(linkDropped(warn)).toBe(false);
  });

  // The save returns null when the user cannot be resolved; the caller still
  // gets the session it sent back.
  test("answers the entry it built when the save returns nothing", async () => {
    const { app } = buildApp({ saveWorkoutSession: vi.fn(async () => null) });

    const response = await post(app, { focus: "Push" });

    expect(response.body.workoutSession).toMatchObject({ focus: "Push", duration: 30 });
  });

  test("hands the repository the link it was sent", async () => {
    // The test reads what the route saved, so the fake is the Mock of the save.
    const saveWorkoutSession = /** @type {import("vitest").Mock<Deps["saveWorkoutSession"]>} */ (
      vi.fn(async () => null)
    );
    const { app } = buildApp({ saveWorkoutSession });

    await post(app, { planId: "plan-1", planDayIndex: 0 });

    expect(saveWorkoutSession.mock.calls[0][0].session).toMatchObject({
      planId: "plan-1",
      planDayIndex: 0
    });
  });
});
