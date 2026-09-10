import { registerAuthRoutes } from "./authRoutes.js";
import { registerDashboardRoutes } from "./dashboardRoutes.js";
import { registerExternalRoutes } from "./externalRoutes.js";
import { registerGenerateRoutes } from "./generateRoutes.js";
import { registerSystemRoutes } from "./systemRoutes.js";

export const registerApiRoutes = (app, deps) => {
  registerSystemRoutes(app, deps);
  registerExternalRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerDashboardRoutes(app, deps);
  registerGenerateRoutes(app, deps);
};
