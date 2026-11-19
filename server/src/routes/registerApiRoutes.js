/**
 * The one entry point for every /api route. index.js calls it once, after the
 * rate limiters and the CSRF check, with a flat object of every repository,
 * service and helper the routes use.
 */
// @ts-check
import { registerAuthRoutes } from "./authRoutes.js";
import { registerDashboardRoutes } from "./dashboardRoutes.js";
import { registerExternalRoutes } from "./externalRoutes.js";
import { registerGenerateRoutes } from "./generateRoutes.js";
import { registerStravaRoutes } from "./integrations/registerStravaRoutes.js";
import { registerSystemRoutes } from "./systemRoutes.js";

/**
 * Registers the system, external-data, account, dashboard, plan-generation and
 * Strava routes. Every registrar receives the same `deps` and destructures only
 * what it uses.
 *
 * @param {import("express").Express} app
 * @param {Parameters<typeof registerSystemRoutes>[1] & Parameters<typeof registerExternalRoutes>[1] & Parameters<typeof registerAuthRoutes>[1] & Parameters<typeof registerDashboardRoutes>[1] & Parameters<typeof registerGenerateRoutes>[1] & Parameters<typeof registerStravaRoutes>[1]} deps
 *   What each of the six reads.
 */
export const registerApiRoutes = (app, deps) => {
  registerSystemRoutes(app, deps);
  registerExternalRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerDashboardRoutes(app, deps);
  registerGenerateRoutes(app, deps);
  registerStravaRoutes(app, deps);
};
