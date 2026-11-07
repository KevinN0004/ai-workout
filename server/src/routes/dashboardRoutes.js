/**
 * Groups the /api/dashboard routes, which live in routes/dashboard/. Called by
 * registerApiRoutes.
 */
import { registerDashboardReadRoutes } from "./dashboard/registerDashboardReadRoutes.js";
import { registerDashboardWriteRoutes } from "./dashboard/registerDashboardWriteRoutes.js";
import { registerProgressionRoutes } from "./dashboard/registerProgressionRoutes.js";

/**
 * Registers every /api/dashboard route: the reads, the writes, and the week's
 * progression with its answers. All require a session.
 */
export const registerDashboardRoutes = (app, deps) => {
  registerDashboardReadRoutes(app, deps);
  registerDashboardWriteRoutes(app, deps);
  registerProgressionRoutes(app, deps);
};
