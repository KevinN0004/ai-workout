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
 * a session. A failure the cache cannot cover with a stale copy goes one of two
 * ways: an outage (an upstream 5xx, a timeout, a missing OpenAQ key, or an
 * error with no status) answers 200 with a fallback payload, and an upstream
 * 4xx, such as a 429, is answered as that error.
 */
export const registerExternalRoutes = (app, deps) => {
  registerWeatherRoutes(app, deps);
  registerAirQualityRoutes(app, deps);
  registerWgerRoutes(app, deps);
  registerMealDbRoutes(app, deps);
};
