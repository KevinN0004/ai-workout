// @ts-check
import { describe, expect, test, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerPlanSwapRoutes } from "../registerPlanSwapRoutes.js";
import { validateBody } from "../../../services/http/apiSchemaService.js";
import { generatePlan, prescribe } from "../../../services/planning/generatePlan.js";
import { EXERCISES } from "../../../services/planning/exerciseLibrary.js";
import { buildFallbackNotes, buildSafetyNotes } from "../../../services/planning/fallbackNotes.js";
import {
  buildPlanPayload,
  withPrescriptions
} from "../../../services/dashboard/planPayloadService.js";
import { rulesForPlan, swapOptions } from "../../../services/planning/swaps.js";

// The plan swap routes' answers to what the wire cannot stage: a failure
// inside each handler, and a signed-in user whose profile has no age.
// planSwaps.integration.test.js runs everything else against real Postgres, so
// the dependencies are stubbed here.

const FIELDS = {
  goal: "Build lean strength and energy",
  environment: "Home",
  equipment: ["Dumbbells", "Adjustable bench"],
  level: "Beginner",
  days: 2,
  duration: 30,
  injuries: "None",
  focuses: []
};

const savedPlan = (overrides = {}) => {
  const fields = { ...FIELDS, ...overrides };
  const plan = generatePlan({ ...fields, health: {}, age: null });
  const notes = [...buildFallbackNotes(plan), ...buildSafetyNotes(plan)];
  const text = `${plan.text}\n\nCoach Notes:\n${notes.join("\n")}`;
  return {
    id: "plan-1",
    ...fields,
    plan: text,
    payload: withPrescriptions(buildPlanPayload(text), plan.week)
  };
};

// The user holds the fields the routes read, and a logger of vi.fn()s is not
// pino's, so it is cast through unknown.
/**
 * @param {object} [overrides]
 * @param {object} [user]
 */
const buildApp = (overrides = {}, user = { id: "u-1" }) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = /** @type {import("../../../services/auth/authUserService.js").AuthUser} */ (user);
    req.log = /** @type {import("pino").Logger} */ (
      /** @type {unknown} */ ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() })
    );
    next();
  });
  registerPlanSwapRoutes(app, {
    requireAuth: (_req, _res, next) => next(),
    validateBody,
    findPlanForUser: async () => null,
    rewritePlan: async () => null,
    ...overrides
  });
  return app;
};

const PATH = "/api/dashboard/plans/plan-1/swaps";

describe("the plan swap routes without a database", () => {
  test("a failure in the store is a 500 on every route", async () => {
    const broken = () => Promise.reject(new Error("database down"));
    const app = buildApp({ findPlanForUser: broken, rewritePlan: broken });

    const responses = await Promise.all([
      request(app).get(`${PATH}?exercise=Dumbbell%20goblet%20squat`),
      request(app).post(PATH).send({ from: "Dumbbell goblet squat", to: "Dumbbell sumo squat" }),
      request(app).post(`${PATH}/undo`).send({ name: "Dumbbell sumo squat" })
    ]);
    expect(responses.map((response) => response.status)).toEqual([500, 500, 500]);
  });

  // A swap doses the new exercise as a generated plan would for this profile: an
  // older adult's static stretch is held longer, so the age reaches the rules.
  test("a swap doses the new exercise for the profile's age", async () => {
    const plan = savedPlan({ goal: "Mobility" });
    // Assigned inside the rewrite, so it is typed by what the rewrite answers
    // rather than narrowed to its first value.
    let written =
      /** @type {import("../../../repositories/generatedPlanRepository.js").PlanRewrite | null} */ (
        null
      );
    const app = buildApp(
      {
        rewritePlan: async ({ rewrite }) => {
          // The swap below is one the rules offer, so the rewrite answers.
          written =
            /** @type {import("../../../repositories/generatedPlanRepository.js").PlanRewrite} */ (
              await rewrite(plan)
            );
          return { plan: { ...plan, payload: written.payload, plan: written.planText } };
        }
      },
      { id: "u-1", profile: { age: 70 } }
    );
    const older = rulesForPlan(plan, { age: 70, area: null });
    const younger = rulesForPlan(plan, { age: null, area: null });
    const doseOf = (rules, name) =>
      prescribe(
        // Each name comes from the library's own swaps.
        {
          .../** @type {(typeof EXERCISES)[number]} */ (
            EXERCISES.find((entry) => entry.name === name)
          ),
          regressed: false
        },
        "accessory",
        rules
      ).prescription;
    const stretches = plan.payload.days.flatMap((day) => day.prescriptions ?? []);
    // This plan holds a stretch whose dose the age changes, so one is found.
    const swap = /** @type {[string, string]} */ (
      stretches
        .flatMap((p) =>
          (swapOptions(plan, p.name, older) ?? []).map((option) => [p.name, option.name])
        )
        .find(([, to]) => doseOf(older, to).seconds?.max !== doseOf(younger, to).seconds?.max)
    );

    const response = await request(app).post(PATH).send({ from: swap[0], to: swap[1] });

    expect(response.status).toBe(200);
    // The swap above answered 200, so the rewrite ran and put the new exercise in.
    const swapped =
      /** @type {import("../../../repositories/generatedPlanRepository.js").PlanRewrite} */ (
        written
      ).payload.days
        .flatMap((day) => day.prescriptions ?? [])
        .find((p) => p.name === swap[1]);
    expect(/** @type {NonNullable<typeof swapped>} */ (swapped).seconds).toEqual(
      doseOf(older, swap[1]).seconds
    );
  });

  test("a profile with no age reads the plan's rules with none", async () => {
    const plan = savedPlan();
    const app = buildApp({ findPlanForUser: async () => plan }, { id: "u-1", profile: {} });

    const response = await request(app).get(`${PATH}?exercise=Dumbbell%20goblet%20squat`);

    expect(response.status).toBe(200);
    expect(response.body.alternatives).toEqual(
      swapOptions(plan, "Dumbbell goblet squat", rulesForPlan(plan, { age: null, area: null }))
    );
  });
});
