/**
 * Groups the /api/dashboard routes, which live in routes/dashboard/. Called by
 * registerApiRoutes.
 */
// @ts-check
import { registerDashboardReadRoutes } from "./dashboard/registerDashboardReadRoutes.js";
import { registerDashboardWriteRoutes } from "./dashboard/registerDashboardWriteRoutes.js";
import { registerPlanSwapRoutes } from "./dashboard/registerPlanSwapRoutes.js";
import { registerProgressionRoutes } from "./dashboard/registerProgressionRoutes.js";

/**
 * Registers every /api/dashboard route: the reads, the writes, and the week's
 * progression with its answers, and the plan swaps. All require a session.
 *
 * @param {import("express").Express} app
 * @param {Parameters<typeof registerDashboardReadRoutes>[1] & Parameters<typeof registerDashboardWriteRoutes>[1] & Parameters<typeof registerProgressionRoutes>[1] & Parameters<typeof registerPlanSwapRoutes>[1]} deps
 *   What each of the four reads.
 */
export const registerDashboardRoutes = (app, deps) => {
  registerDashboardReadRoutes(app, deps);
  registerDashboardWriteRoutes(app, deps);
  registerProgressionRoutes(app, deps);
  registerPlanSwapRoutes(app, deps);
};
