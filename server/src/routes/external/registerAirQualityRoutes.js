/**
 * GET /api/air-quality/current: an OpenAQ station's latest readings near the
 * given coordinates, scored as a US AQI with a training recommendation.
 * Registered by externalRoutes.js.
 */
import { airQualityQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

/**
 * Registers the air-quality route. `deps` supplies the OpenAQ client
 * (`openAqRequest`) and its parsing and scoring helpers from
 * externalDataService.js.
 */
export const registerAirQualityRoutes = (app, deps) => {
  const {
    toNullableNumber,
    openAqRequest,
    toFiniteNumber,
    cleanText,
    extractOpenAqMeasurement,
    pm25ToUsAqi,
    aqiBand,
    mergeCacheStatuses,
    openAqParameterLabel,
    isUpstreamFailureStatus
  } = deps;

  app.get("/api/air-quality/current", async (req, res) => {
    try {
      // Validate the coordinates. The search radius defaults to 25 km.
      const query = validateQuery(req, res, airQualityQuerySchema, {
        message: "Valid latitude and longitude are required."
      });
      if (!query) return;
      const { latitude, longitude, radiusKm = 25 } = query;

      // Load the first station OpenAQ lists within the radius.
      const locationResponse = await openAqRequest("locations", {
        coordinates: `${latitude},${longitude}`,
        radius: Math.round(radiusKm * 1000),
        limit: 1
      });
      const locationData = locationResponse.data;
      const location = Array.isArray(locationData?.results) ? locationData.results[0] : null;
      if (!location) {
        return res.status(404).json({ error: "No nearby air quality station found." });
      }

      const locationId = toNullableNumber(location?.id, 1, 1000000000);
      if (locationId === null) {
        return res.status(502).json({ error: "OpenAQ response missing location id." });
      }

      // Load its latest readings. A reading names its sensor by id, and the
      // station's sensor list says what that sensor measures, so the two are
      // joined. Readings with no pollutant or no value are dropped, and the
      // first reading for each pollutant wins.
      const latestResponse = await openAqRequest(`locations/${Math.trunc(locationId)}/latest`);
      const latestData = latestResponse.data;
      const rawReadings = Array.isArray(latestData?.results) ? latestData.results : [];
      const sensorMap = new Map(
        (Array.isArray(location?.sensors) ? location.sensors : []).map((sensor) => [
          String(sensor?.id),
          sensor
        ])
      );
      const byCode = new Map();
      for (const entry of rawReadings) {
        const linkedSensor = sensorMap.get(String(entry?.sensorsId));
        const parsed = extractOpenAqMeasurement({
          ...entry,
          sensor: linkedSensor || entry?.sensor
        });
        if (!parsed.code || parsed.value === null) continue;
        if (!byCode.has(parsed.code)) byCode.set(parsed.code, parsed);
      }
      const pollutants = Array.from(byCode.values()).slice(0, 12);

      // Score from PM2.5 alone. A station with no PM2.5 reading scores null and
      // the "Unknown" band, never AQI 0.
      const pm25Reading =
        pollutants.find((item) => ["pm25", "pm2.5", "pm2_5", "pm2p5"].includes(item.code)) || null;
      const pm25 = pm25Reading?.value ?? null;
      const aqiUs = pm25ToUsAqi(pm25);
      const recommendation = aqiBand(aqiUs);

      res.json({
        cache: {
          status: mergeCacheStatuses(locationResponse.cache, latestResponse.cache),
          locations: locationResponse.cache,
          latest: latestResponse.cache
        },
        location: {
          id: toFiniteNumber(location?.id),
          name: cleanText(location?.name, 120),
          city: cleanText(location?.city || location?.locality, 120),
          country: cleanText(location?.country?.name || location?.country?.code || "", 80),
          latitude: toFiniteNumber(location?.coordinates?.latitude),
          longitude: toFiniteNumber(location?.coordinates?.longitude),
          distanceM: toFiniteNumber(location?.distance)
        },
        summary: {
          level: recommendation.level,
          workoutType: recommendation.workoutType,
          guidance: recommendation.guidance,
          primaryPollutant:
            pm25Reading?.label ||
            pollutants[0]?.label ||
            openAqParameterLabel(pollutants[0]?.code) ||
            "Unknown",
          pm25,
          aqiUs
        },
        pollutants: pollutants.map((item) => ({
          code: item.code,
          label: item.label || openAqParameterLabel(item.code),
          value: item.value,
          unit: item.unit,
          measuredAt: item.measuredAt
        }))
      });
    } catch (err) {
      // An outage (any status isUpstreamFailureStatus accepts, which includes a
      // missing OPENAQ_API_KEY; an error with no status counts as 500) answers
      // 200 with an "Unknown" reading that advises indoor training.
      const status = Number.isInteger(err?.status) ? err.status : 500;
      if (isUpstreamFailureStatus(status)) {
        return res.json({
          fallback: true,
          service: "openaq",
          error: "Air quality service unavailable.",
          location: {
            id: null,
            name: "",
            city: "",
            country: "",
            latitude: toNullableNumber(req.query.latitude, -90, 90),
            longitude: toNullableNumber(req.query.longitude, -180, 180)
          },
          summary: {
            aqiUs: null,
            pm25: null,
            level: "Unknown",
            workoutType: "indoor",
            guidance: "Air quality data is unavailable. Prefer indoor training."
          },
          pollutants: []
        });
      }
      return sendErrorResponse(req, res, err, status);
    }
  });
};
