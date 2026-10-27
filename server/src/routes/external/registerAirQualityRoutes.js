/**
 * GET /api/air-quality/current: the nearest OpenAQ station whose PM2.5 reading is
 * current, its latest readings, and the EPA NowCast of its PM2.5 hourly means scored
 * as a US AQI with a training recommendation. Registered by externalRoutes.js.
 */
import { airQualityQuerySchema, validateQuery } from "./validation.js";
import { sendErrorResponse } from "../../services/http/errorResponseService.js";

// OpenAQ's id for the PM2.5 parameter (seen live for every PM2.5 sensor in New
// York, Los Angeles and London on 2026-10-27).
const PM25_PARAMETER_ID = 2;
// One page holds every PM2.5 station within 25 km: 1,000 is the most OpenAQ's
// pagination docs allow on a page, and a list still cut short is logged.
const STATION_PAGE_LIMIT = 1000;
// How many candidates' /latest may be asked per lookup. With the station list
// and the hours, a lookup makes at most five OpenAQ calls, so twelve uncached
// lookups a minute stay inside OpenAQ's 60 requests a minute.
const MAX_LATEST_ATTEMPTS = 3;

/**
 * Registers the air-quality route. `deps` supplies the OpenAQ client
 * (`openAqRequest`) and its parsing, station-ranking and scoring helpers, the
 * NowCast among them, from externalDataService.js, and the server's `logger`.
 */
export const registerAirQualityRoutes = (app, deps) => {
  const {
    toNullableNumber,
    openAqRequest,
    toFiniteNumber,
    cleanText,
    logger,
    extractOpenAqMeasurement,
    pm25ToUsAqi,
    pm25NowCast,
    nowCastHoursQuery,
    rankFreshPm25Stations,
    isFreshReading,
    openAqResultsTruncated,
    isPm25Code,
    aqiBand,
    mergeCacheStatuses,
    openAqParameterLabel,
    isUpstreamFailureStatus
  } = deps;

  // A station's latest readings, each joined to its sensor to learn what it
  // measures (a reading names its sensor by id; the station's sensor list says
  // what that sensor is). Readings with no pollutant or no value are dropped,
  // the first reading for each pollutant wins and keeps its sensor id and its
  // own UTC time, and the list is capped at twelve.
  const readPollutants = (station, latestResponse) => {
    const latestData = latestResponse?.data;
    const rawReadings = Array.isArray(latestData?.results) ? latestData.results : [];
    const sensorMap = new Map(
      (Array.isArray(station?.sensors) ? station.sensors : []).map((sensor) => [
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
        byCode.set(parsed.code, {
          ...parsed,
          sensorsId: entry?.sensorsId,
          readingUtc: entry?.datetime?.utc
        });
      }
    }
    return Array.from(byCode.values()).slice(0, 12);
  };

  app.get("/api/air-quality/current", async (req, res) => {
    try {
      // Validate the coordinates. The search radius defaults to 25 km.
      const query = validateQuery(req, res, airQualityQuerySchema, {
        message: "Valid latitude and longitude are required."
      });
      if (!query) return;
      const { latitude, longitude, radiusKm = 25 } = query;

      // Load every PM2.5 station within the radius. OpenAQ lists them in id
      // order (order_by accepts only id) and keeps stations that stopped
      // reporting years ago, so the route asks for one full page and ranks them
      // itself. A list still cut short could miss the nearest station, so it is
      // logged, once per answer fetched from OpenAQ rather than per cached read.
      const locationResponse = await openAqRequest("locations", {
        coordinates: `${latitude},${longitude}`,
        radius: Math.round(radiusKm * 1000),
        parameters_id: PM25_PARAMETER_ID,
        limit: STATION_PAGE_LIMIT
      });
      const locationData = locationResponse.data;
      const candidates = Array.isArray(locationData?.results) ? locationData.results : [];
      if (!candidates.length) {
        return res.status(404).json({ error: "No nearby air quality station found." });
      }
      if (
        locationResponse.cache === "miss" &&
        openAqResultsTruncated(locationData?.meta, candidates.length)
      ) {
        logger.warn({
          event: "openaq_locations_truncated",
          found: locationData.meta.found,
          returned: candidates.length,
          message: "OpenAQ holds more PM2.5 stations within the radius than one page returned."
        });
      }

      // Walk the fresh PM2.5 stations nearest first. A station's datetimeLast
      // covers all its sensors, so its PM2.5 reading's own time is checked too:
      // the first station whose PM2.5 reading is fresh is the one read. A
      // station with no usable id costs no call and is passed over; a failed
      // /latest, or one with no fresh PM2.5 reading, is a miss. At most
      // MAX_LATEST_ATTEMPTS are asked.
      const ranked = rankFreshPm25Stations(candidates, { latitude, longitude });
      let chosen = null;
      let attempts = 0;
      let answered = 0;
      let lastFailure = null;
      for (const candidate of ranked) {
        if (attempts >= MAX_LATEST_ATTEMPTS) break;
        const stationId = toNullableNumber(candidate.station?.id, 1, 1000000000);
        if (stationId === null) continue;
        attempts += 1;
        let latestResponse;
        try {
          latestResponse = await openAqRequest(`locations/${Math.trunc(stationId)}/latest`);
        } catch (err) {
          lastFailure = err;
          continue;
        }
        answered += 1;
        const pollutants = readPollutants(candidate.station, latestResponse);
        const pm25Reading = pollutants.find((item) => isPm25Code(item.code));
        if (!pm25Reading || !isFreshReading(pm25Reading.readingUtc)) continue;
        chosen = { ...candidate, latestResponse, pollutants, pm25Reading };
        break;
      }

      // Fresh candidates, none with a usable id: OpenAQ's data is malformed.
      if (ranked.length && attempts === 0) {
        return res
          .status(502)
          .json({ error: "OpenAQ response missing location id.", requestId: req.requestId || "" });
      }
      // Every /latest asked failed, so nothing said the stations were stale:
      // an outage, answered by the handler below exactly as before.
      if (!chosen && attempts > 0 && answered === 0) throw lastFailure;

      // No PM2.5 station reporting now: Unknown, with no hours asked. No
      // station is named, so the location echoes the coordinates asked for, as
      // the outage fallback's does.
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
      const { station: location, latestResponse, pollutants, pm25Reading } = chosen;

      // Score PM2.5's NowCast over its sensor's hourly means. A reading with no
      // sensor id, too few recent hours, or a failed hourly request each score
      // null and the "Unknown" band, never AQI 0; the latest reading is still
      // reported.
      const pm25 = pm25Reading.value;
      const pm25SensorId = toNullableNumber(pm25Reading.sensorsId, 1, 1000000000);
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
          // Always PM2.5's: a station is read only for its PM2.5 reading.
          primaryPollutant: pm25Reading.label,
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
