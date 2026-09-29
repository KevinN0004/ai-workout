/**
 * Groups the routes that serve third-party data, which live in routes/external/.
 * Called by registerApiRoutes.
 */
import { registerAirQualityRoutes } from "./external/registerAirQualityRoutes.js";
import { registerMealDbRoutes } from "./external/registerMealDbRoutes.js";
import { registerWeatherRoutes } from "./external/registerWeatherRoutes.js";
import { registerWgerRoutes } from "./external/registerWgerRoutes.js";

/**
 * Registers the weather, air-quality, wger and TheMealDB routes. None requires
 * a session, and each answers an upstream failure with a 200 fallback payload
 * rather than an error.
 */
export const registerExternalRoutes = (app, deps) => {
  registerWeatherRoutes(app, deps);
  registerAirQualityRoutes(app, deps);
  registerWgerRoutes(app, deps);
  registerMealDbRoutes(app, deps);
};
