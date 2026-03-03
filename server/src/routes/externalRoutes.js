import { registerAirQualityRoutes } from "./external/registerAirQualityRoutes.js";
import { registerMealDbRoutes } from "./external/registerMealDbRoutes.js";
import { registerWeatherRoutes } from "./external/registerWeatherRoutes.js";
import { registerWgerRoutes } from "./external/registerWgerRoutes.js";

export const registerExternalRoutes = (app, deps) => {
  registerWeatherRoutes(app, deps);
  registerAirQualityRoutes(app, deps);
  registerWgerRoutes(app, deps);
  registerMealDbRoutes(app, deps);
};
