/**
 * Groups the /api/dashboard routes, which live in routes/dashboard/. Called by
 * registerApiRoutes.
 */
import { registerDashboardReadRoutes } from "./dashboard/registerDashboardReadRoutes.js";
import { registerDashboardWriteRoutes } from "./dashboard/registerDashboardWriteRoutes.js";

/** Registers every /api/dashboard route, reads first, then writes. All require a session. */
export const registerDashboardRoutes = (app, deps) => {
  registerDashboardReadRoutes(app, deps);
  registerDashboardWriteRoutes(app, deps);
};
