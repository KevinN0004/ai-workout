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

export default function useDashboardData({
  user,
  isDashboardRoute,
  shouldLoadAmbientData,
  dashboardCacheKey,
  weatherCacheKey,
  airCacheKey,
  setGoalForm
}) {
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

  useEffect(() => {
    weatherDataRef.current = weatherData;
  }, [weatherData]);

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
    const requestId = airRequestRef.current + 1;
    airRequestRef.current = requestId;
    setAirQualityLoading(true);
    setAirQualityError("");
    try {
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
      if (airRequestRef.current === requestId) setAirQualityLoading(false);
    }
  }, [airCacheKey, getCurrentCoordinates]);

  useEffect(() => {
    if (!user || !dashboardCacheKey) return;
    const cached = readJsonCache(dashboardCacheKey);
    const cachedDashboard = cached?.dashboard;
    if (!cachedDashboard) return;
    setDashboard((current) => current || cachedDashboard);
    applyGoalFormFromDashboard(cachedDashboard, setGoalForm);
  }, [dashboardCacheKey, setGoalForm, user]);

  useEffect(() => {
    if (!user || !weatherCacheKey) return;
    const cached = readJsonCache(weatherCacheKey);
    if (!cached?.data) return;
    setWeatherData((current) => current || cached.data);
    if (cached.updatedAt) {
      setWeatherLastUpdatedAt((current) => current || cached.updatedAt);
    }
  }, [user, weatherCacheKey]);

  useEffect(() => {
    if (!user || !airCacheKey) return;
    const cached = readJsonCache(airCacheKey);
    if (!cached?.data) return;
    setAirQualityData((current) => current || cached.data);
    if (cached.updatedAt) {
      setAirQualityLastUpdatedAt((current) => current || cached.updatedAt);
    }
  }, [airCacheKey, user]);

  useEffect(() => {
    if (!dashboardCacheKey || !dashboard) return;
    writeJsonCache(dashboardCacheKey, {
      dashboard,
      updatedAt: Date.now()
    });
  }, [dashboard, dashboardCacheKey]);

  useEffect(() => {
    if (!isDashboardRoute || !user || !dashboardCacheKey) return;
    const requestId = dashboardRequestRef.current + 1;
    dashboardRequestRef.current = requestId;
    let cancelled = false;
    const loadDashboard = async () => {
      const cachedDashboard = readJsonCache(dashboardCacheKey)?.dashboard || null;
      const hasCachedFallback = Boolean(cachedDashboard);
      if (cachedDashboard) {
        setDashboard((current) => current || cachedDashboard);
        applyGoalFormFromDashboard(cachedDashboard, setGoalForm);
      }

      setDashLoading(true);
      setDashError("");
      try {
        const res = await fetchWithTimeout(
          "/api/dashboard",
          { credentials: "include" },
          12000
        );
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
          hasCachedFallback
            ? "Unable to refresh dashboard right now. Showing saved data."
            : message
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

  useEffect(() => {
    if (isDashboardRoute && user) return;
    hasAutoLoadedEnvironmentRef.current = false;
  }, [isDashboardRoute, user]);

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
