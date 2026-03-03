import { registerDashboardReadRoutes } from "./dashboard/registerDashboardReadRoutes.js";
import { registerDashboardWriteRoutes } from "./dashboard/registerDashboardWriteRoutes.js";

export const registerDashboardRoutes = (app, deps) => {
  registerDashboardReadRoutes(app, deps);
  registerDashboardWriteRoutes(app, deps);
};
