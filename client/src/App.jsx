/**
 * The app shell: owns the route, the signed-in user and the form state the
 * pages share, and renders the page for the current path. Rendered by main.jsx.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthPage from "./pages/auth/AuthPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import HomePage from "./pages/home/HomePage";
import WorkoutResultPage from "./pages/workout-result/WorkoutResultPage";
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
import AppNotice from "./app/components/AppNotice";
import PlannerSetupModal from "./app/components/PlannerSetupModal";
import { mergeOptimisticDashboard } from "./app/dashboard";
import useApiClient from "./app/hooks/useApiClient";
import useDashboardData from "./app/hooks/useDashboardData";
import useOptimisticLogs from "./app/hooks/useOptimisticLogs";
import { fetchWithTimeout } from "./app/network";
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
import "./styles/app.css";

// How long the session check waits before asking again while the server cannot
// answer it, in milliseconds: one delay per failed attempt, the last repeated.
const SESSION_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000];

/**
 * Routes on window.location.pathname without a router: /auth, /plan and
 * /dashboard with its subpaths each have a page, and any other path renders
 * HomePage. The planner modal is built here and passed to HomePage and
 * DashboardPage, which both render it.
 */
export default function App() {
  // ---- State ----------------------------------------------------------------
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
  // True while the session check has had no answer from the server it can trust.
  const [sessionUnchecked, setSessionUnchecked] = useState(false);
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

  // ---- Dashboard data and the API client ------------------------------------
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
    dashboardPagination,
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
    clearOptimisticOperations,
    flushOptimisticOperations,
    captureAccount
  } = useOptimisticLogs({
    setDashboard,
    setDashError
  });

  // ---- Derived values and handlers ------------------------------------------
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

      // Home, or a Commercial list without "Full gym access": a plain toggle.
      if (!isCommercialEnv) {
        const exists = prev.equipment.includes(item);
        return {
          ...prev,
          equipment: exists
            ? prev.equipment.filter((equip) => equip !== item)
            : [...prev.equipment, item]
        };
      }

      // "Full gym access" itself selects every room, or clears them all.
      if (item === fullAccessLabel) {
        const hasFullAccess = currentSelection.includes(fullAccessLabel);
        return {
          ...prev,
          equipment: hasFullAccess ? [] : [...options]
        };
      }

      // Any other room: full access is first expanded into the rooms it stands
      // for, so that one of them can be taken away, and then the room toggles.
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

      // Full access then follows the rooms: on exactly when every room is on.
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

  // ---- Event handlers, built in app/events.js -------------------------------
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
    changePassword,
    deleteAccount,
    submitMealLog,
    submitProgressMetric,
    saveExerciseToPlan,
    removeSavedExercise
  } = createAppEventHandlers({
    apiFetch,
    user,
    form,
    setLoading,
    setError,
    setResult,
    setDashboard,
    closePlanner,
    isDashboardRoute,
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
    flushOptimisticOperations,
    captureAccount,
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

  // ---- Modals and the parsed plan -------------------------------------------
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

  const latestPlanByWeekday = useMemo(() => extractLatestPlanByWeekday(dashboard), [dashboard]);

  // ---- Routing and session --------------------------------------------------

  // `go` navigates with pushState, which fires no event, so the browser's back and
  // forward buttons are the only route changes this has to hear about.
  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // The URL picks the dashboard view on every route change, back and forward
  // included. A path that names no view leaves the last one as it was.
  useEffect(() => {
    const routeDashView = resolveDashViewFromPath(route);
    if (!routeDashView) return;
    setDashView((current) => (current === routeDashView ? current : routeDashView));
  }, [route]);

  // On load: the session cookie is HttpOnly, so asking the server is the only
  // way to learn who is signed in. Only a 401 means signed out. Any other
  // failure, such as a 503 while the session store is down, a network error or
  // a timeout, means the server could not say: the visitor is told so and the
  // check is asked again, rather than shown the signed-out page as the answer.
  // An unmount stops the asking.
  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;
    let attempt = 0;
    const loadSession = async () => {
      let answered = false;
      try {
        const res = await fetchWithTimeout("/api/auth/me", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user || null);
          answered = true;
        } else {
          answered = res.status === 401;
        }
      } catch {
        // No answer: a network error, a timeout or a body that is not JSON.
      }
      if (cancelled) return;
      setSessionUnchecked(!answered);
      if (answered) return;
      const delay = SESSION_RETRY_DELAYS_MS[Math.min(attempt, SESSION_RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(loadSession, delay);
    };
    loadSession();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, []);

  // Fetches the CSRF token up front, so the first write need not wait for it.
  // ensureCsrfToken is stable, so this runs once.
  useEffect(() => {
    ensureCsrfToken().catch(() => {
      // CSRF token is lazily retried before unsafe requests.
    });
  }, [ensureCsrfToken]);

  // Each arrival at / starts the home flow over, blank and in the locale's
  // units. resetPersonalFlow is stable, so the route is the only trigger.
  useEffect(() => {
    if (route !== "/") return;
    resetPersonalFlow();
  }, [route, resetPersonalFlow]);

  // A signed-in visitor has nothing to do on the landing or sign-in page, so
  // either one sends them to the dashboard, including once the session check
  // above resolves.
  useEffect(() => {
    if (!user) return;
    if (route === "/" || route === "/auth" || route === "/auth/") {
      go("/dashboard");
    }
  }, [go, route, user]);

  // ---- The page for the route -----------------------------------------------
  // Every page renders with the session notice after it, while the session
  // check is still waiting for an answer.
  const sessionNotice = sessionUnchecked ? (
    <AppNotice message="Can't reach the server to check your sign-in. Trying again..." />
  ) : null;
  const withNotice = (page) => (
    <>
      {page}
      {sessionNotice}
    </>
  );

  if (route === "/auth" || route === "/auth/") {
    return withNotice(
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
    return withNotice(
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
    return withNotice(
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
        dashboardPagination={dashboardPagination}
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
        onChangePassword={changePassword}
        onDeleteAccount={deleteAccount}
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
        dashboardToast={dashboardToast}
        clearDashboardToast={clearDashboardToast}
      />
    );
  }

  return withNotice(
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
    />
  );
}
