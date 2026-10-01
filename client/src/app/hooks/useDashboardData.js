/**
 * The dashboard and the weather and air-quality readings: loading each, caching
 * them per account, and keeping a stale response from overwriting a newer one.
 * Called once, by App.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonCache, writeJsonCache } from "../cache";
import { fetchWithTimeout } from "../network";

const applyGoalFormFromDashboard = (dashboardValue, setGoalForm) => {
  if (!dashboardValue?.goals) return;
  setGoalForm({
    targetWeight: String(dashboardValue.goals.targetWeight || 160),
    targetCalories: String(dashboardValue.goals.targetCalories || 2200),
    weeklyWorkouts: String(dashboardValue.goals.weeklyWorkouts || 3)
  });
};

/**
 * Owns the dashboard, weather and air-quality state, each with its loading flag
 * and error, and returns it with `setDashboard` and `setDashError` for the
 * handlers that write, the two location-based loaders, and
 * `clearDashboardDataState` for logout and account deletion. Expects from App
 * the three cache keys (empty while signed out), `isDashboardRoute`,
 * `shouldLoadAmbientData` (true on the summary view) and `setGoalForm`, which
 * each dashboard it loads, cached or fetched, seeds the goals form through.
 */
export default function useDashboardData({
  user,
  isDashboardRoute,
  shouldLoadAmbientData,
  dashboardCacheKey,
  weatherCacheKey,
  airCacheKey,
  setGoalForm
}) {
  // ---- State and refs -------------------------------------------------------
  const [dashboard, setDashboard] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState("");
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLastUpdatedAt, setWeatherLastUpdatedAt] = useState(null);
  const [airQualityData, setAirQualityData] = useState(null);
  const [airQualityLoading, setAirQualityLoading] = useState(false);
  const [airQualityError, setAirQualityError] = useState("");
  const [airQualityLastUpdatedAt, setAirQualityLastUpdatedAt] = useState(null);

  const weatherDataRef = useRef(null);
  const airQualityDataRef = useRef(null);
  const dashboardRequestRef = useRef(0);
  const weatherRequestRef = useRef(0);
  const airRequestRef = useRef(0);
  const hasAutoLoadedEnvironmentRef = useRef(false);

  // ---- Weather and air quality ----------------------------------------------

  // Mirrored into a ref, so the weather loader's error path and the auto-load
  // below can read the latest reading without depending on it.
  useEffect(() => {
    weatherDataRef.current = weatherData;
  }, [weatherData]);

  // The same mirror for air quality, read by loadAirQuality's error path and
  // by the auto-load.
  useEffect(() => {
    airQualityDataRef.current = airQualityData;
  }, [airQualityData]);

  const getCurrentCoordinates = useCallback(async () => {
    if (!navigator?.geolocation) {
      const err = new Error("Location is not available in this browser.");
      err.code = "GEO_NOT_AVAILABLE";
      throw err;
    }
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 1000 * 60 * 10
      });
    });
    const latitude = Number(position?.coords?.latitude);
    const longitude = Number(position?.coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Unable to determine location coordinates.");
    }
    return { latitude, longitude };
  }, []);

  const loadWeatherRecommendation = useCallback(async () => {
    // Only the latest call may write state; an older call's result is dropped.
    const requestId = weatherRequestRef.current + 1;
    weatherRequestRef.current = requestId;
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const { latitude, longitude } = await getCurrentCoordinates();
      const query = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude)
      });
      const res = await fetchWithTimeout(
        `/api/weather/recommendation?${query.toString()}`,
        { credentials: "include" },
        12000
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to load weather recommendation.");
      }
      const data = await res.json();
      if (weatherRequestRef.current !== requestId) return;
      setWeatherData(data || null);
      const now = Date.now();
      setWeatherLastUpdatedAt(now);
      writeJsonCache(weatherCacheKey, {
        data: data || null,
        updatedAt: now
      });
    } catch (err) {
      if (weatherRequestRef.current !== requestId) return;
      if (typeof err?.code === "number") {
        if (err.code === 1) {
          setWeatherError("Location permission was denied.");
        } else if (err.code === 2) {
          setWeatherError("Location information is unavailable.");
        } else if (err.code === 3) {
          setWeatherError("Location request timed out.");
        } else {
          setWeatherError("Unable to access location.");
        }
      } else {
        setWeatherError(
          weatherDataRef.current
            ? "Unable to refresh weather. Showing the last update."
            : err?.message || "Unable to load weather recommendation."
        );
      }
    } finally {
      // Guarded rather than early-returned: a `return` inside `finally`
      // overrides any in-flight throw or return from the try/catch above.
      if (weatherRequestRef.current === requestId) setWeatherLoading(false);
    }
  }, [getCurrentCoordinates, weatherCacheKey]);

  const loadAirQuality = useCallback(async () => {
    // Only the latest call may write state; an older call's result is dropped.
    const requestId = airRequestRef.current + 1;
    airRequestRef.current = requestId;
    setAirQualityLoading(true);
    setAirQualityError("");
    try {
      // Locate the visitor, fetch for that spot, and cache the reading with
      // the time it arrived.
      const { latitude, longitude } = await getCurrentCoordinates();
      const query = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude)
      });
      const res = await fetchWithTimeout(
        `/api/air-quality/current?${query.toString()}`,
        { credentials: "include" },
        12000
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to load air quality.");
      }
      const data = await res.json();
      if (airRequestRef.current !== requestId) return;
      setAirQualityData(data || null);
      const now = Date.now();
      setAirQualityLastUpdatedAt(now);
      writeJsonCache(airCacheKey, {
        data: data || null,
        updatedAt: now
      });
    } catch (err) {
      if (airRequestRef.current !== requestId) return;
      // A numeric code is a GeolocationPositionError, and GEO_NOT_AVAILABLE is
      // getCurrentCoordinates' own. Any other failure keeps the last reading on
      // screen, if there is one.
      if (typeof err?.code === "number") {
        if (err.code === 1) {
          setAirQualityError("Location permission was denied.");
        } else if (err.code === 2) {
          setAirQualityError("Location information is unavailable.");
        } else if (err.code === 3) {
          setAirQualityError("Location request timed out.");
        } else {
          setAirQualityError("Unable to access location.");
        }
      } else if (err?.code === "GEO_NOT_AVAILABLE") {
        setAirQualityError(err.message);
      } else {
        setAirQualityError(
          airQualityDataRef.current
            ? "Unable to refresh air quality. Showing the last update."
            : err?.message || "Unable to load air quality."
        );
      }
    } finally {
      // Guarded, not early-returned, as in the weather loader's finally.
      if (airRequestRef.current === requestId) setAirQualityLoading(false);
    }
  }, [airCacheKey, getCurrentCoordinates]);

  // ---- Caches ---------------------------------------------------------------

  // The cached dashboard fills in as soon as there is a user, on any route and
  // before any request, without replacing a dashboard already in state; the
  // goals form is reseeded from the cache either way. It re-runs whenever
  // `user` is replaced, a profile save included.
  useEffect(() => {
    if (!user || !dashboardCacheKey) return;
    const cached = readJsonCache(dashboardCacheKey);
    const cachedDashboard = cached?.dashboard;
    if (!cachedDashboard) return;
    setDashboard((current) => current || cachedDashboard);
    applyGoalFormFromDashboard(cachedDashboard, setGoalForm);
  }, [dashboardCacheKey, setGoalForm, user]);

  // The cached weather and when it was read fill in the same way, so the card
  // has something to show while the visitor's location is requested.
  useEffect(() => {
    if (!user || !weatherCacheKey) return;
    const cached = readJsonCache(weatherCacheKey);
    if (!cached?.data) return;
    setWeatherData((current) => current || cached.data);
    if (cached.updatedAt) {
      setWeatherLastUpdatedAt((current) => current || cached.updatedAt);
    }
  }, [user, weatherCacheKey]);

  // Air quality gets the same head start from its own cache entry.
  useEffect(() => {
    if (!user || !airCacheKey) return;
    const cached = readJsonCache(airCacheKey);
    if (!cached?.data) return;
    setAirQualityData((current) => current || cached.data);
    if (cached.updatedAt) {
      setAirQualityLastUpdatedAt((current) => current || cached.updatedAt);
    }
  }, [airCacheKey, user]);

  // Every new dashboard is written through to the cache. A cleared one (logout)
  // is not, which is what keeps the cache for the same account's return.
  useEffect(() => {
    if (!dashboardCacheKey || !dashboard) return;
    writeJsonCache(dashboardCacheKey, {
      dashboard,
      updatedAt: Date.now()
    });
  }, [dashboard, dashboardCacheKey]);

  // ---- Dashboard load -------------------------------------------------------

  // Fetches the dashboard when a signed-in visitor enters the dashboard routes,
  // or `user` is replaced while there. Moving between dashboard views does not
  // refetch: isDashboardRoute stays true.
  useEffect(() => {
    if (!isDashboardRoute || !user || !dashboardCacheKey) return;
    // Each run takes a new request id. A response to an older run, or one that
    // lands after this run's cleanup, is dropped.
    const requestId = dashboardRequestRef.current + 1;
    dashboardRequestRef.current = requestId;
    let cancelled = false;
    const loadDashboard = async () => {
      // The cached copy first, so a slow or failed request still shows data.
      const cachedDashboard = readJsonCache(dashboardCacheKey)?.dashboard || null;
      const hasCachedFallback = Boolean(cachedDashboard);
      if (cachedDashboard) {
        setDashboard((current) => current || cachedDashboard);
        applyGoalFormFromDashboard(cachedDashboard, setGoalForm);
      }

      // Then the server's copy replaces it. On failure the cached copy stays on
      // screen, and the error says so.
      setDashLoading(true);
      setDashError("");
      try {
        const res = await fetchWithTimeout("/api/dashboard", { credentials: "include" }, 12000);
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || "Unable to load dashboard.");
        }
        const data = await res.json();
        if (cancelled || dashboardRequestRef.current !== requestId) return;
        setDashboard(data.dashboard);
        applyGoalFormFromDashboard(data.dashboard, setGoalForm);
        setDashError("");
      } catch (err) {
        if (cancelled || dashboardRequestRef.current !== requestId) return;
        const message = err?.message || "Unable to load dashboard.";
        setDashError(
          hasCachedFallback ? "Unable to refresh dashboard right now. Showing saved data." : message
        );
      } finally {
        if (!cancelled && dashboardRequestRef.current === requestId) {
          setDashLoading(false);
        }
      }
    };
    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [dashboardCacheKey, isDashboardRoute, setGoalForm, user]);

  // ---- One-time weather and air-quality load --------------------------------

  // Leaving the dashboard, or signing out, re-arms the one-time load below for
  // the next visit.
  useEffect(() => {
    if (isDashboardRoute && user) return;
    hasAutoLoadedEnvironmentRef.current = false;
  }, [isDashboardRoute, user]);

  // Loads weather and air quality once per dashboard visit, the first time the
  // summary view shows, skipping either one already in state. The ref, not the
  // dependency list, is what keeps it to once.
  useEffect(() => {
    if (!isDashboardRoute || !user || !shouldLoadAmbientData) return;
    if (hasAutoLoadedEnvironmentRef.current) return;
    hasAutoLoadedEnvironmentRef.current = true;
    if (!weatherDataRef.current) {
      loadWeatherRecommendation();
    }
    if (!airQualityDataRef.current) {
      loadAirQuality();
    }
  }, [isDashboardRoute, loadAirQuality, loadWeatherRecommendation, shouldLoadAmbientData, user]);

  // ---- Resets ---------------------------------------------------------------

  // Off the dashboard, or signed out, nothing is loading: a load cut short by
  // the dashboard loader's cleanup never clears dashLoading itself.
  useEffect(() => {
    if (isDashboardRoute && user) return;
    setDashLoading(false);
  }, [isDashboardRoute, user]);

  const clearDashboardDataState = useCallback(() => {
    setDashboard(null);
    setDashLoading(false);
    setDashError("");
    setWeatherData(null);
    setWeatherLoading(false);
    setWeatherError("");
    setWeatherLastUpdatedAt(null);
    setAirQualityData(null);
    setAirQualityLoading(false);
    setAirQualityError("");
    setAirQualityLastUpdatedAt(null);
  }, []);

  return {
    dashboard,
    setDashboard,
    dashLoading,
    dashError,
    setDashError,
    weatherData,
    weatherLoading,
    weatherError,
    weatherLastUpdatedAt,
    airQualityData,
    airQualityLoading,
    airQualityError,
    airQualityLastUpdatedAt,
    loadWeatherRecommendation,
    loadAirQuality,
    clearDashboardDataState
  };
}
