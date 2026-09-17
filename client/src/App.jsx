import { useCallback, useEffect, useMemo, useState } from "react";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import WorkoutResultPage from "./pages/WorkoutResultPage";
import {
  AIR_QUALITY_CACHE_PREFIX,
  DASHBOARD_CACHE_PREFIX,
  WEATHER_CACHE_PREFIX,
  createDefaultPlannerForm,
  defaultAuthForm,
  defaultPersonalForm,
  defaultSignupProfileForm,
  equipmentOptionsByEnv,
  samplePlan,
  weekDays
} from "./app/constants";
import { buildScopedCacheKey } from "./app/cache";
import PlannerSetupModal from "./app/components/PlannerSetupModal";
import GeneratedPlanModal from "./app/components/GeneratedPlanModal";
import { mergeOptimisticDashboard } from "./app/dashboard";
import useApiClient from "./app/hooks/useApiClient";
import useDashboardData from "./app/hooks/useDashboardData";
import useOptimisticLogs from "./app/hooks/useOptimisticLogs";
import { parsePlanSections, extractLatestPlanByWeekday } from "./app/plans";
import { resolveDashViewFromPath } from "./app/routing";
import { createAppEventHandlers } from "./app/events";
import {
  getLocalDateKey,
  getPreferredMeasurementSystem,
  toCmFromFeetInches,
  toFeetInchesFromCm,
  toKg,
  toLb
} from "./app/units";
import "./App.css";

export default function App() {
  const [personalMode, setPersonalMode] = useState("basic");
  const [heightUnit, setHeightUnit] = useState(() =>
    getPreferredMeasurementSystem() === "imperial" ? "ft" : "cm"
  );
  const [weightUnit, setWeightUnit] = useState(() =>
    getPreferredMeasurementSystem() === "imperial" ? "lb" : "kg"
  );
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerStep, setPlannerStep] = useState(1);
  const [route, setRoute] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authAutoSignIn, setAuthAutoSignIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authForm, setAuthForm] = useState({ ...defaultAuthForm });
  const [signupProfileForm, setSignupProfileForm] = useState({
    ...defaultSignupProfileForm
  });
  const [signupHeightUnit, setSignupHeightUnit] = useState("ft");
  const [signupWeightUnit, setSignupWeightUnit] = useState("lb");
  const [workoutForm, setWorkoutForm] = useState({
    date: getLocalDateKey(),
    focus: "",
    duration: "",
    exercises: "",
    sets: "",
    reps: "",
    intensityRpe: "",
    notes: ""
  });
  const [calorieForm, setCalorieForm] = useState({
    calories: ""
  });
  const [mealLogForm, setMealLogForm] = useState({
    date: getLocalDateKey(),
    mealType: "breakfast",
    name: "",
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
    notes: ""
  });
  const [progressForm, setProgressForm] = useState({
    date: getLocalDateKey(),
    weightLb: "",
    bodyFatPct: "",
    waistCm: "",
    restingHr: "",
    notes: ""
  });
  const [goalForm, setGoalForm] = useState({
    targetWeight: "160",
    targetCalories: "2200",
    weeklyWorkouts: "3"
  });
  const [dashView, setDashView] = useState(
    () => resolveDashViewFromPath(window.location.pathname) || "summary"
  );
  const [dashNavOpen, setDashNavOpen] = useState(false);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [personal, setPersonal] = useState({ ...defaultPersonalForm });
  const [form, setForm] = useState(() => createDefaultPlannerForm());
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const { apiFetch, ensureCsrfToken } = useApiClient();
  const isDashboardRoute = route === "/dashboard" || route.startsWith("/dashboard/");
  const dashboardCacheKey = useMemo(
    () => (user ? buildScopedCacheKey(DASHBOARD_CACHE_PREFIX, user) : ""),
    [user]
  );
  const weatherCacheKey = useMemo(
    () => (user ? buildScopedCacheKey(WEATHER_CACHE_PREFIX, user) : ""),
    [user]
  );
  const airCacheKey = useMemo(
    () => (user ? buildScopedCacheKey(AIR_QUALITY_CACHE_PREFIX, user) : ""),
    [user]
  );
  const {
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
  } = useDashboardData({
    user,
    isDashboardRoute,
    shouldLoadAmbientData: dashView === "summary",
    dashboardCacheKey,
    weatherCacheKey,
    airCacheKey,
    setGoalForm
  });
  const {
    optimisticLogEntries,
    dashboardToast,
    clearDashboardToast,
    showDashboardToast,
    queueOptimisticLogCommit,
    clearOptimisticOperations
  } = useOptimisticLogs({
    setDashboard,
    setDashError
  });

  const gradient = useMemo(
    () => ({
      background:
        "radial-gradient(circle at center, rgba(189, 189, 189, 0.34) 0%, rgba(151, 151, 151, 0.16) 20%, rgba(110, 110, 110, 0.06) 36%, rgba(0, 0, 0, 0.96) 58%, #000 78%)"
    }),
    []
  );
  const go = useCallback((path) => {
    const normalizedPath = path === "/dashboard/" ? "/dashboard" : path;
    window.history.pushState({}, "", normalizedPath);
    setRoute(normalizedPath);
  }, []);

  const mergedDashboard = useMemo(
    () => mergeOptimisticDashboard(dashboard, optimisticLogEntries),
    [dashboard, optimisticLogEntries]
  );

  const onPersonalChange = (e) => {
    setPersonal((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const resetPersonalFlow = useCallback(() => {
    const preferredSystem = getPreferredMeasurementSystem();
    setPersonalMode("basic");
    setPersonal({ ...defaultPersonalForm });
    setHeightUnit(preferredSystem === "imperial" ? "ft" : "cm");
    setWeightUnit(preferredSystem === "imperial" ? "lb" : "kg");
  }, []);

  // Seeded here rather than from an effect on `user`, because every path that
  // opens the planner calls this first -- openPlannerFromProfile resets before
  // it opens, and closePlanner resets on the way out. So the form always
  // carries the current profile's goal without an effect that could clobber a
  // half-filled planner when the user object changes.
  const resetPlannerFlow = useCallback(() => {
    setForm(createDefaultPlannerForm(user?.profile?.goal));
    setPlannerStep(1);
  }, [user]);

  const closePlanner = useCallback(() => {
    setPlannerOpen(false);
    resetPlannerFlow();
  }, [resetPlannerFlow]);

  const onChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleEquipment = (item) => {
    setForm((prev) => {
      const options = equipmentOptionsByEnv[prev.environment] || [];
      const fullAccessLabel = "Full gym access";
      const isCommercialEnv =
        prev.environment === "Commercial" && options.includes(fullAccessLabel);
      const currentSelection = prev.equipment.filter((value) => options.includes(value));

      if (!isCommercialEnv) {
        const exists = prev.equipment.includes(item);
        return {
          ...prev,
          equipment: exists
            ? prev.equipment.filter((equip) => equip !== item)
            : [...prev.equipment, item]
        };
      }

      if (item === fullAccessLabel) {
        const hasFullAccess = currentSelection.includes(fullAccessLabel);
        return {
          ...prev,
          equipment: hasFullAccess ? [] : [...options]
        };
      }

      const nextSelection = new Set(currentSelection);
      if (nextSelection.has(fullAccessLabel)) {
        nextSelection.delete(fullAccessLabel);
        options.forEach((option) => {
          if (option !== fullAccessLabel) nextSelection.add(option);
        });
      }

      if (nextSelection.has(item)) {
        nextSelection.delete(item);
      } else {
        nextSelection.add(item);
      }

      const specificCommercialOptions = options.filter((option) => option !== fullAccessLabel);
      const hasAllSpecificOptions = specificCommercialOptions.every((option) =>
        nextSelection.has(option)
      );
      if (hasAllSpecificOptions) {
        nextSelection.add(fullAccessLabel);
      } else {
        nextSelection.delete(fullAccessLabel);
      }

      return {
        ...prev,
        equipment: options.filter((option) => nextSelection.has(option))
      };
    });
  };

  const onEnvironmentChange = (nextEnv) => {
    const nextOptions = equipmentOptionsByEnv[nextEnv] || [];
    setForm((prev) => {
      const filtered = prev.equipment.filter((item) => nextOptions.includes(item));
      return {
        ...prev,
        environment: nextEnv,
        equipment: filtered
      };
    });
  };

  const toggleFocus = (item) => {
    setForm((prev) => {
      const exists = prev.focuses.includes(item);
      return {
        ...prev,
        focuses: exists ? prev.focuses.filter((focus) => focus !== item) : [...prev.focuses, item]
      };
    });
  };

  const openPlannerFromProfile = () => {
    resetPlannerFlow();
    setPlannerOpen(true);
  };

  const {
    onSubmit,
    openSignupWithPrefilledProfile,
    downloadPlanPdf,
    onAuthChange,
    onSignupProfileChange,
    onAuthModeChange,
    onAuthSubmit,
    onLogout,
    submitWorkout,
    submitCalories,
    submitGoals,
    submitProfile,
    submitMealLog,
    submitProgressMetric,
    saveExerciseToPlan,
    removeSavedExercise
  } = createAppEventHandlers({
    apiFetch,
    form,
    setLoading,
    setError,
    setResult,
    setDashboard,
    closePlanner,
    isDashboardRoute,
    setPlanModalOpen,
    setDashView,
    go,
    personal,
    heightUnit,
    weightUnit,
    setAuthForm,
    setAuthMode,
    setAuthError,
    setShowPassword,
    setAuthAutoSignIn,
    setSignupHeightUnit,
    setSignupWeightUnit,
    setSignupProfileForm,
    toCmFromFeetInches,
    toFeetInchesFromCm,
    toKg,
    result,
    authMode,
    setAuthLoading,
    signupProfileForm,
    signupHeightUnit,
    signupWeightUnit,
    authForm,
    setUser,
    authAutoSignIn,
    clearOptimisticOperations,
    clearDashboardDataState,
    clearDashboardToast,
    resetPersonalFlow,
    queueOptimisticLogCommit,
    workoutForm,
    setWorkoutForm,
    setWorkoutModalOpen,
    calorieForm,
    setCalorieForm,
    goalForm,
    setDashError,
    showDashboardToast,
    mealLogForm,
    setMealLogForm,
    progressForm,
    setProgressForm
  });

  const plannerModal = (
    <PlannerSetupModal
      plannerOpen={plannerOpen}
      plannerStep={plannerStep}
      setPlannerStep={setPlannerStep}
      closePlanner={closePlanner}
      form={form}
      onEnvironmentChange={onEnvironmentChange}
      toggleEquipment={toggleEquipment}
      onChange={onChange}
      toggleFocus={toggleFocus}
      loading={loading}
      onSubmit={onSubmit}
    />
  );

  const planSections = useMemo(() => parsePlanSections(result), [result]);

  const generatedPlanModal = (
    <GeneratedPlanModal
      planModalOpen={planModalOpen}
      result={result}
      setPlanModalOpen={setPlanModalOpen}
      planSections={planSections}
      activeDayIndex={activeDayIndex}
      setActiveDayIndex={setActiveDayIndex}
      downloadPlanPdf={downloadPlanPdf}
      go={go}
    />
  );

  useEffect(() => {
    if (!planSections.days.length) return;
    setActiveDayIndex(0);
  }, [planSections.days.length, result]);

  const latestPlanByWeekday = useMemo(() => extractLatestPlanByWeekday(dashboard), [dashboard]);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const routeDashView = resolveDashViewFromPath(route);
    if (!routeDashView) return;
    setDashView((current) => (current === routeDashView ? current : routeDashView));
  }, [route]);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        setUser(data.user || null);
      } catch {
        setUser(null);
      }
    };
    loadSession();
  }, []);

  useEffect(() => {
    ensureCsrfToken().catch(() => {
      // CSRF token is lazily retried before unsafe requests.
    });
  }, [ensureCsrfToken]);

  useEffect(() => {
    if (route !== "/") return;
    resetPersonalFlow();
  }, [route, resetPersonalFlow]);

  useEffect(() => {
    if (!user) return;
    if (route === "/" || route === "/auth" || route === "/auth/") {
      go("/dashboard");
    }
  }, [go, route, user]);

  if (route === "/auth" || route === "/auth/") {
    return (
      <AuthPage
        gradient={gradient}
        authMode={authMode}
        onAuthModeChange={onAuthModeChange}
        go={go}
        onAuthSubmit={onAuthSubmit}
        authForm={authForm}
        onAuthChange={onAuthChange}
        signupProfileForm={signupProfileForm}
        onSignupProfileChange={onSignupProfileChange}
        signupHeightUnit={signupHeightUnit}
        setSignupHeightUnit={setSignupHeightUnit}
        signupWeightUnit={signupWeightUnit}
        setSignupWeightUnit={setSignupWeightUnit}
        toCmFromFeetInches={toCmFromFeetInches}
        toFeetInchesFromCm={toFeetInchesFromCm}
        toKg={toKg}
        toLb={toLb}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        authAutoSignIn={authAutoSignIn}
        setAuthAutoSignIn={setAuthAutoSignIn}
        authLoading={authLoading}
        authError={authError}
      />
    );
  }

  if (route === "/plan" || route === "/plan/") {
    return (
      <WorkoutResultPage
        gradient={gradient}
        user={user}
        go={go}
        planSections={planSections}
        hasResult={Boolean(result)}
        onDownloadPlanPdf={downloadPlanPdf}
        onSignupWithPrefilledProfile={openSignupWithPrefilledProfile}
      />
    );
  }

  if (isDashboardRoute) {
    return (
      <DashboardPage
        user={user}
        go={go}
        onLogout={onLogout}
        dashboard={mergedDashboard}
        goalForm={goalForm}
        setGoalForm={setGoalForm}
        dashView={dashView}
        setDashView={setDashView}
        dashNavOpen={dashNavOpen}
        setDashNavOpen={setDashNavOpen}
        dashLoading={dashLoading}
        dashError={dashError}
        workoutModalOpen={workoutModalOpen}
        setWorkoutModalOpen={setWorkoutModalOpen}
        workoutForm={workoutForm}
        setWorkoutForm={setWorkoutForm}
        submitWorkout={submitWorkout}
        form={form}
        openPlannerFromProfile={openPlannerFromProfile}
        calorieForm={calorieForm}
        setCalorieForm={setCalorieForm}
        submitCalories={submitCalories}
        mealLogForm={mealLogForm}
        setMealLogForm={setMealLogForm}
        submitMealLog={submitMealLog}
        progressForm={progressForm}
        setProgressForm={setProgressForm}
        submitProgressMetric={submitProgressMetric}
        submitGoals={submitGoals}
        onSaveProfile={submitProfile}
        weekDays={weekDays}
        latestPlanByWeekday={latestPlanByWeekday}
        weatherData={weatherData}
        weatherLoading={weatherLoading}
        weatherError={weatherError}
        weatherLastUpdatedAt={weatherLastUpdatedAt}
        refreshWeatherRecommendation={loadWeatherRecommendation}
        airQualityData={airQualityData}
        airQualityLoading={airQualityLoading}
        airQualityError={airQualityError}
        airQualityLastUpdatedAt={airQualityLastUpdatedAt}
        refreshAirQuality={loadAirQuality}
        onSaveExerciseToPlan={saveExerciseToPlan}
        onRemoveSavedExercise={removeSavedExercise}
        plannerModal={plannerModal}
        generatedPlanModal={generatedPlanModal}
        dashboardToast={dashboardToast}
        clearDashboardToast={clearDashboardToast}
      />
    );
  }

  return (
    <HomePage
      gradient={gradient}
      user={user}
      onLogout={onLogout}
      go={go}
      form={form}
      personalMode={personalMode}
      setPersonalMode={setPersonalMode}
      personal={personal}
      onPersonalChange={onPersonalChange}
      onResetPersonalFlow={resetPersonalFlow}
      heightUnit={heightUnit}
      setHeightUnit={setHeightUnit}
      toCmFromFeetInches={toCmFromFeetInches}
      toFeetInchesFromCm={toFeetInchesFromCm}
      setPersonal={setPersonal}
      weightUnit={weightUnit}
      setWeightUnit={setWeightUnit}
      toKg={toKg}
      toLb={toLb}
      openPlannerFromProfile={openPlannerFromProfile}
      error={error}
      samplePlan={samplePlan}
      plannerModal={plannerModal}
      generatedPlanModal={generatedPlanModal}
    />
  );
}
