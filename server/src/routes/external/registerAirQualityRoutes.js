/**
 * GET /api/air-quality/current: the nearest OpenAQ PM2.5 station still reporting, its
 * latest readings, and the EPA NowCast of its PM2.5 hourly means scored as a US AQI
 * with a training recommendation. Registered by externalRoutes.js.
 */
import { airQualityQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

/**
 * Registers the air-quality route. `deps` supplies the OpenAQ client
 * (`openAqRequest`) and its parsing, station-choosing and scoring helpers, the
 * NowCast among them, from externalDataService.js.
 */
export const registerAirQualityRoutes = (app, deps) => {
  const {
    toNullableNumber,
    openAqRequest,
    toFiniteNumber,
    cleanText,
    extractOpenAqMeasurement,
    pm25ToUsAqi,
    pm25NowCast,
    nowCastHoursQuery,
    nearestFreshPm25Station,
    isPm25Code,
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

      // Load the stations within the radius and choose one. OpenAQ lists them in
      // id order (order_by accepts only id) and keeps stations that stopped
      // reporting years ago, so the route asks for one page of 100, OpenAQ's own
      // default page size, and picks the nearest PM2.5 station still reporting.
      const locationResponse = await openAqRequest("locations", {
        coordinates: `${latitude},${longitude}`,
        radius: Math.round(radiusKm * 1000),
        limit: 100
      });
      const locationData = locationResponse.data;
      const candidates = Array.isArray(locationData?.results) ? locationData.results : [];
      if (!candidates.length) {
        return res.status(404).json({ error: "No nearby air quality station found." });
      }

      // Stations are listed but none is a PM2.5 station reporting now: Unknown,
      // with nothing more asked of OpenAQ. No station is named, so the location
      // echoes the coordinates asked for, as the outage fallback's does.
      const chosen = nearestFreshPm25Station(candidates, { latitude, longitude });
      if (!chosen) {
        const recommendation = aqiBand(null);
        return res.json({
          cache: {
            status: mergeCacheStatuses(locationResponse.cache),
            locations: locationResponse.cache,
            latest: null,
            hours: null
          },
          location: {
            id: null,
            name: "",
            city: "",
            country: "",
            latitude,
            longitude,
            distanceM: null
          },
          summary: {
            level: recommendation.level,
            workoutType: recommendation.workoutType,
            guidance: recommendation.guidance,
            primaryPollutant: "Unknown",
            pm25: null,
            pm25NowCast: null,
            aqiUs: null
          },
          pollutants: []
        });
      }
      const location = chosen.station;

      const locationId = toNullableNumber(location?.id, 1, 1000000000);
      if (locationId === null) {
        return res
          .status(502)
          .json({ error: "OpenAQ response missing location id.", requestId: req.requestId || "" });
      }

      // Load its latest readings. A reading names its sensor by id, and the
      // station's sensor list says what that sensor measures, so the two are
      // joined. Readings with no pollutant or no value are dropped, and the
      // first reading for each pollutant wins, keeping its sensor id for the
      // hourly request below.
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
        if (!byCode.has(parsed.code)) {
          byCode.set(parsed.code, { ...parsed, sensorsId: entry?.sensorsId });
        }
      }
      const pollutants = Array.from(byCode.values()).slice(0, 12);

      // Score PM2.5's NowCast over its sensor's hourly means. No PM2.5 sensor,
      // too few recent hours, or a failed hourly request each score null and the
      // "Unknown" band, never AQI 0; the latest reading is still reported.
      const pm25Reading = pollutants.find((item) => isPm25Code(item.code)) || null;
      const pm25 = pm25Reading?.value ?? null;
      const pm25SensorId = toNullableNumber(pm25Reading?.sensorsId, 1, 1000000000);
      const hoursResponse =
        pm25SensorId === null
          ? null
          : await openAqRequest(
              `sensors/${Math.trunc(pm25SensorId)}/hours`,
              nowCastHoursQuery()
            ).catch(() => null);
      const pm25NowCastValue = pm25NowCast(hoursResponse?.data?.results);
      const aqiUs = pm25ToUsAqi(pm25NowCastValue);
      const recommendation = aqiBand(aqiUs);

      res.json({
        cache: {
          status: mergeCacheStatuses(
            locationResponse.cache,
            latestResponse.cache,
            hoursResponse?.cache
          ),
          locations: locationResponse.cache,
          latest: latestResponse.cache,
          hours: hoursResponse?.cache ?? null
        },
        location: {
          id: toFiniteNumber(location?.id),
          name: cleanText(location?.name, 120),
          city: cleanText(location?.city || location?.locality, 120),
          country: cleanText(location?.country?.name || location?.country?.code || "", 80),
          latitude: toFiniteNumber(location?.coordinates?.latitude),
          longitude: toFiniteNumber(location?.coordinates?.longitude),
          distanceM: chosen.distanceM
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
          pm25NowCast: pm25NowCastValue,
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
      // An outage (any status isUpstreamFailureStatus accepts, which covers the
      // one a missing OPENAQ_API_KEY raises; an error with no status counts as
      // 500) answers 200 with an "Unknown" reading that advises indoor training.
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
            pm25NowCast: null,
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
