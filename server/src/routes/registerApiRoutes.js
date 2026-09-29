/**
 * The one entry point for every /api route. index.js calls it once, after the
 * rate limiters and the CSRF check, with a flat object of every repository,
 * service and helper the routes use.
 */
import { registerAuthRoutes } from "./authRoutes.js";
import { registerDashboardRoutes } from "./dashboardRoutes.js";
import { registerExternalRoutes } from "./externalRoutes.js";
import { registerGenerateRoutes } from "./generateRoutes.js";
import { registerSystemRoutes } from "./systemRoutes.js";

/**
 * Registers the system, external-data, account, dashboard and plan-generation
 * routes. Every registrar receives the same `deps` and destructures only what
 * it uses.
 */
export const registerApiRoutes = (app, deps) => {
  registerSystemRoutes(app, deps);
  registerExternalRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerDashboardRoutes(app, deps);
  registerGenerateRoutes(app, deps);
};
