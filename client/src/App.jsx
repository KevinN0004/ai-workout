import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import ModalPortal from "./components/ModalPortal";
import "./App.css";

const quickFocuses = [
  "Strength",
  "Weight Loss",
  "Mobility",
  "Recovery",
  "Cardio"
];

const goalOptions = [
  "Build lean strength and energy",
  "Fat loss + conditioning",
  "Mobility",
  "Recovery",
  "Cardio"
];

const equipmentOptionsByEnv = {
  Home: [
    "Bodyweight only",
    "Dumbbells",
    "Kettlebell",
    "Pull-up bar",
    "Resistance bands",
    "Adjustable bench",
    "Yoga mat"
  ],
  Commercial: [
    "Full gym access",
    "Barbell + plates",
    "Cable machine",
    "Smith machine",
    "Cardio machines",
    "Free weights"
  ]
};

const injuryOptions = [
  "None",
  "Lower back",
  "Knee",
  "Shoulder",
  "Hip",
  "Wrist/Elbow"
];

const samplePlan = [
  {
    day: "Day 1 - Full Body Strength",
    blocks: [
      "Warmup: 5 min bike + dynamic mobility",
      "A1: Goblet squat 4 x 8",
      "A2: Push-up 4 x 10",
      "B1: RDL 3 x 10",
      "B2: TRX row 3 x 12",
      "Finisher: 6 min EMOM 10 kettlebell swings"
    ]
  },
  {
    day: "Day 2 - Conditioning",
    blocks: [
      "Warmup: jump rope 3 min",
      "Intervals: 8 x 30s hard / 60s easy",
      "Core: plank 3 x 45s + dead bug 3 x 10"
    ]
  },
  {
    day: "Day 3 - Lower Body + Core",
    blocks: [
      "Warmup: hip openers + glute activation",
      "A1: Split squat 4 x 8",
      "A2: Single-leg RDL 3 x 10",
      "B1: Calf raises 3 x 15",
      "Core: side plank 3 x 30s"
    ]
  }
];

const weekDays = [
  { label: "Mon", key: "Monday" },
  { label: "Tue", key: "Tuesday" },
  { label: "Wed", key: "Wednesday" },
  { label: "Thu", key: "Thursday" },
  { label: "Fri", key: "Friday" },
  { label: "Sat", key: "Saturday" },
  { label: "Sun", key: "Sunday" }
];
const defaultAuthForm = {
  email: "",
  password: ""
};
const defaultSignupProfileForm = {
  firstName: "",
  lastName: "",
  age: "",
  heightCm: "",
  heightFeet: "",
  heightInches: "",
  weight: "",
  weightKg: "",
  sex: "",
  bodyFat: "",
  activity: "Moderate",
  notes: ""
};

const defaultPersonalForm = {
  name: "",
  age: "",
  heightCm: "",
  heightFeet: "",
  heightInches: "",
  weight: "",
  sex: "",
  bodyFat: "",
  activity: "Moderate",
  sleep: "",
  timeline: "",
  experience: "",
  trainingDays: [],
  nutrition: "",
  cardio: "",
  notes: ""
};

const createDefaultPlannerForm = () => ({
  goal: "Build lean strength and energy",
  equipment: [],
  duration: "45",
  level: "Intermediate",
  injuries: "None",
  days: "3",
  focuses: [],
  environment: "Home"
});

const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);

const getRegionFromLocale = (locale) => {
  if (!locale || typeof locale !== "string") return "";
  const localeParts = locale.split(/[-_]/).filter(Boolean);
  if (localeParts.length > 1 && localeParts[1]) {
    return localeParts[1].toUpperCase();
  }
  try {
    const parsed = new Intl.Locale(locale);
    return parsed.region ? parsed.region.toUpperCase() : "";
  } catch {
    return "";
  }
};

const getPreferredMeasurementSystem = () => {
  if (typeof navigator === "undefined") return "metric";
  const locales = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const locale of locales) {
    const region = getRegionFromLocale(locale);
    if (IMPERIAL_REGION_CODES.has(region)) {
      return "imperial";
    }
  }
  return "metric";
};

const getLocalDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const DASHBOARD_ROUTE_VIEW_MAP = {
  "": "summary",
  summary: "summary",
  workouts: "workouts",
  calories: "calories",
  plans: "plans",
  meal: "meal",
  tips: "tips",
  settings: "settings",
  home: "home"
};

const resolveDashViewFromPath = (path) => {
  if (path === "/dashboard" || path === "/dashboard/") {
    return "summary";
  }
  if (!path.startsWith("/dashboard/")) {
    return null;
  }
  const slug = path.slice("/dashboard/".length).split("/")[0];
  return DASHBOARD_ROUTE_VIEW_MAP[slug] || null;
};

const defaultDashboardData = () => ({
  workouts: [],
  workoutSessions: [],
  calories: [],
  mealLogs: [],
  progressMetrics: [],
  plans: [],
  savedExercises: [],
  goals: {
    targetWeight: 160,
    targetCalories: 2200,
    weeklyWorkouts: 3
  }
});

const DASHBOARD_CACHE_PREFIX = "ai-workout-dashboard-cache-v1";
const WEATHER_CACHE_PREFIX = "ai-workout-weather-cache-v1";
const AIR_QUALITY_CACHE_PREFIX = "ai-workout-air-cache-v1";
const OPTIMISTIC_UNDO_WINDOW_MS = 4500;

const buildScopedCacheKey = (prefix, user) => {
  const scope = user?.userId || user?.email || "anonymous";
  return `${prefix}:${scope}`;
};

const readJsonCache = (key) => {
  if (!key || typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeJsonCache = (key, value) => {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore cache write failures (private mode, quota, etc.)
  }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

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
  const [optimisticLogEntries, setOptimisticLogEntries] = useState([]);
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
  const [dashboardToast, setDashboardToast] = useState(null);
  const dashboardToastTimeoutRef = useRef(null);
  const optimisticOpRef = useRef(new Map());
  const weatherDataRef = useRef(null);
  const airQualityDataRef = useRef(null);
  const dashboardRequestRef = useRef(0);
  const weatherRequestRef = useRef(0);
  const airRequestRef = useRef(0);
  const isDashboardRoute =
    route === "/dashboard" || route.startsWith("/dashboard/");
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

  const gradient = useMemo(
    () => ({
      background:
        "radial-gradient(circle at center, rgba(189, 189, 189, 0.34) 0%, rgba(151, 151, 151, 0.16) 20%, rgba(110, 110, 110, 0.06) 36%, rgba(0, 0, 0, 0.96) 58%, #000 78%)"
    }),
    []
  );

  useEffect(() => {
    weatherDataRef.current = weatherData;
  }, [weatherData]);

  useEffect(() => {
    airQualityDataRef.current = airQualityData;
  }, [airQualityData]);

  const mergedDashboard = useMemo(() => {
    if (!dashboard && !optimisticLogEntries.length) return null;
    const base = dashboard ? { ...dashboard } : defaultDashboardData();
    if (!optimisticLogEntries.length) return base;

    const nextWorkoutSessions = Array.isArray(base.workoutSessions)
      ? [...base.workoutSessions]
      : [];
    const nextWorkouts = Array.isArray(base.workouts) ? [...base.workouts] : [];
    const nextCalories = Array.isArray(base.calories) ? [...base.calories] : [];
    const nextMealLogs = Array.isArray(base.mealLogs) ? [...base.mealLogs] : [];

    const ordered = [...optimisticLogEntries].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    for (const entry of ordered) {
      if (entry.type === "workout") {
        nextWorkoutSessions.unshift(entry.item);
        nextWorkouts.unshift(entry.item);
      } else if (entry.type === "calorie") {
        nextCalories.unshift(entry.item);
      } else if (entry.type === "meal") {
        nextMealLogs.unshift(entry.item);
      }
    }

    return {
      ...base,
      workoutSessions: nextWorkoutSessions,
      workouts: nextWorkouts,
      calories: nextCalories,
      mealLogs: nextMealLogs
    };
  }, [dashboard, optimisticLogEntries]);

  const toCmFromFeetInches = (feetValue, inchesValue) => {
    const feetNum = Number(feetValue);
    const inchesNum = Number(inchesValue);
    if (Number.isNaN(feetNum) && Number.isNaN(inchesNum)) return "";
    const totalInches = (Number.isNaN(feetNum) ? 0 : feetNum * 12) +
      (Number.isNaN(inchesNum) ? 0 : inchesNum);
    if (!totalInches) return "";
    return String(Math.round(totalInches * 2.54));
  };

  const toFeetInchesFromCm = (cmValue) => {
    const cmNum = Number(cmValue);
    if (!cmNum || Number.isNaN(cmNum)) return { feet: "", inches: "" };
    const totalInches = cmNum / 2.54;
    let feet = Math.floor(totalInches / 12);
    let inches = Math.round(totalInches - feet * 12);
    if (inches === 12) {
      feet += 1;
      inches = 0;
    }
    return { feet: String(feet), inches: String(inches) };
  };

  const toKg = (value, fromUnit) => {
    if (!value) return "";
    const num = Number(value);
    if (Number.isNaN(num)) return value;
    return fromUnit === "lb" ? String(Math.round(num * 0.453592)) : String(num);
  };

  const toLb = (value, fromUnit) => {
    if (!value) return "";
    const num = Number(value);
    if (Number.isNaN(num)) return value;
    return fromUnit === "kg" ? String(Math.round(num / 0.453592)) : String(num);
  };

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

  const resetPlannerFlow = useCallback(() => {
    setForm(createDefaultPlannerForm());
    setPlannerStep(1);
  }, []);

  const closePlanner = useCallback(() => {
    setPlannerOpen(false);
    resetPlannerFlow();
  }, [resetPlannerFlow]);

  const onChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggleEquipment = (item) => {
    setForm((prev) => {
      const exists = prev.equipment.includes(item);
      return {
        ...prev,
        equipment: exists
          ? prev.equipment.filter((equip) => equip !== item)
          : [...prev.equipment, item]
      };
    });
  };

  const onEnvironmentChange = (nextEnv) => {
    const nextOptions = equipmentOptionsByEnv[nextEnv] || [];
    setForm((prev) => {
      const filtered = prev.equipment.filter((item) =>
        nextOptions.includes(item)
      );
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
        focuses: exists
          ? prev.focuses.filter((focus) => focus !== item)
          : [...prev.focuses, item]
      };
    });
  };

  const openPlannerFromProfile = () => {
    resetPlannerFlow();
    setPlannerOpen(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form)
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Something went wrong.");
      }

      const data = await res.json();
      setResult(data.plan);
      if (data.savedPlan) {
        setDashboard((prev) =>
          prev
            ? { ...prev, plans: [data.savedPlan, ...(prev.plans || [])] }
            : prev
        );
      }
      closePlanner();
      if (isDashboardRoute) {
        setPlanModalOpen(false);
        setDashView("summary");
        go("/dashboard");
      } else {
        setPlanModalOpen(true);
      }
    } catch (err) {
      setError(err.message || "Unable to generate plan.");
    } finally {
      setLoading(false);
    }
  };

  const downloadPlanPdf = () => {
    if (!result) return;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineHeight = 16;
    const lines = doc.splitTextToSize(result, pageWidth - margin * 2);

    let y = margin;
    lines.forEach((line) => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });

    doc.save("ai-workout-plan.pdf");
  };

  const plannerHeaderTitleByStep = {
    1: "Step 1 - Environment & equipment",
    2: "Step 2 - Schedule & constraints",
    3: "Step 3 - Focus priorities"
  };
  const plannerHeaderTitle =
    plannerHeaderTitleByStep[plannerStep] || plannerHeaderTitleByStep[1];

  const plannerModal = plannerOpen && (
    <ModalPortal open={plannerOpen}>
      <div className="modal-backdrop planner-backdrop" role="dialog" aria-modal="true">
        <div className="modal planner-setup-modal">
          <div className="modal-header">
            {plannerStep > 1 ? (
              <button
                type="button"
                className="back-btn planner-back-arrow planner-header-back"
                aria-label="Back"
                onClick={() => setPlannerStep((prev) => Math.max(1, prev - 1))}
              >
                <svg
                  className="planner-back-arrow-icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12.75 4.75L7.5 10L12.75 15.25"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : (
              <span className="planner-header-spacer" aria-hidden="true" />
            )}
            <h2>{plannerHeaderTitle}</h2>
            <button
              type="button"
              className="ghost icon-button planner-close-icon"
              aria-label="Close planner"
              onClick={closePlanner}
            >
              &times;
            </button>
          </div>
          <div className="modal-body">
            {plannerStep === 1 && (
              <div className="step-panel planner-step-panel">
                <div className="step-top">
                  <div
                    className={`segmented planner-env-toggle ${
                      form.environment === "Commercial" ? "pos-1" : "pos-0"
                    }`}
                  >
                    <button
                      type="button"
                      className={form.environment === "Home" ? "active" : ""}
                      onClick={() => onEnvironmentChange("Home")}
                    >
                      Home
                    </button>
                    <button
                      type="button"
                      className={
                        form.environment === "Commercial" ? "active" : ""
                      }
                      onClick={() => onEnvironmentChange("Commercial")}
                    >
                      Commercial
                    </button>
                  </div>
                </div>
                <div className="option-grid">
                  {equipmentOptionsByEnv[form.environment].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`equip-card ${
                        form.equipment.includes(item) ? "active" : ""
                      }`}
                      onClick={() => toggleEquipment(item)}
                    >
                      <span className="equip-thumb" aria-hidden="true" />
                      <span className="equip-label">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {plannerStep === 2 && (
              <div className="step-panel planner-step-panel">
                <form className="form planner-step-two-form">
                  <label>
                    Days per week
                    <select name="days" value={form.days} onChange={onChange}>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                      <option value="7">7</option>
                    </select>
                  </label>
                  <label>
                    Session length (minutes)
                    <select
                      name="duration"
                      value={form.duration}
                      onChange={onChange}
                    >
                      <option value="30">30</option>
                      <option value="45">45</option>
                      <option value="60">60</option>
                      <option value="75">75</option>
                      <option value="90">90</option>
                    </select>
                  </label>
                  <label>
                    Experience level
                    <select name="level" value={form.level} onChange={onChange}>
                      <option>Beginner</option>
                      <option>Intermediate</option>
                      <option>Advanced</option>
                    </select>
                  </label>
                  <label>
                    Injuries or limitations
                    <select
                      name="injuries"
                      value={form.injuries}
                      onChange={onChange}
                    >
                      {injuryOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </form>
              </div>
            )}
            {plannerStep === 3 && (
              <div className="step-panel planner-step-panel">
                <p className="muted">Select one or more focus areas for this plan.</p>
                <div className="option-grid focus-option-grid">
                  {quickFocuses.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`equip-card focus-chip ${form.focuses.includes(item) ? "active" : ""}`}
                      onClick={() => toggleFocus(item)}
                    >
                      <span className="equip-label">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className={`modal-footer ${plannerStep === 3 ? "planner-footer-center" : ""}`}>
            <div className={`modal-actions ${plannerStep === 3 ? "planner-actions-center" : ""}`}>
              {plannerStep < 3 ? (
                <button
                  type="button"
                  className="cta"
                  onClick={() => setPlannerStep((prev) => Math.min(3, prev + 1))}
                >
                  Next
                </button>
              ) : (
                <button
                  className="cta"
                  type="button"
                  disabled={loading}
                  onClick={onSubmit}
                >
                  {loading ? "Generating..." : "Generate workout"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );

  const generatedPlanModal = planModalOpen && result && (
    <ModalPortal open={Boolean(planModalOpen && result)}>
      <div
        className="modal-backdrop plan-modal-backdrop"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal plan-modal">
          <div className="modal-header">
            <h2>Your AI Plan</h2>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost icon-button"
                aria-label="Close"
                onClick={() => setPlanModalOpen(false)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="modal-body">
            <div className="plan-modal-content">
              <section className="plan-modal-plan">
                {planSections.days.length ? (
                  <>
                    <div className="plan-tabs" role="tablist" aria-label="Plan days">
                      {planSections.days.map((day, index) => (
                        <button
                          key={`${day.title}-${index}`}
                          type="button"
                          role="tab"
                          className={index === activeDayIndex ? "active" : ""}
                          aria-selected={index === activeDayIndex}
                          onClick={() => setActiveDayIndex(index)}
                        >
                          {day.title}
                        </button>
                      ))}
                    </div>
                    <div className="plan-day" role="tabpanel">
                      <h3>{planSections.days[activeDayIndex]?.title}</h3>
                      {planSections.days[activeDayIndex]?.lines?.length ? (
                        <ul>
                          {planSections.days[activeDayIndex].lines.map(
                            (line, lineIndex) => (
                              <li key={`${activeDayIndex}-${lineIndex}-${line}`}>
                                {line}
                              </li>
                            )
                          )}
                        </ul>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="plan-day" />
                )}
              </section>
              <section className="plan-modal-notes">
                <h3>Coach notes</h3>
                {planSections.notes.length ? (
                  <ul>
                    {planSections.notes.map((line, index) => (
                      <li key={`${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </div>
          </div>
          <div className="modal-footer plan-modal-footer">
            <div className="modal-actions">
              <button type="button" className="cta" onClick={downloadPlanPdf}>
                Download PDF
              </button>
              <button type="button" className="ghost" onClick={() => go("/auth")}>
                Login / Sign up
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );

  const planSections = useMemo(() => {
    if (!result) return { days: [], notes: [] };
    const rawLines = result
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const notesStart = rawLines.findIndex((line) =>
      /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\b/i.test(line)
    );

    let lines = rawLines;
    let notes = [];

    if (notesStart >= 0) {
      const headerLine = rawLines[notesStart];
      const strippedHeader = headerLine.replace(
        /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\s*[:\-]?\s*/i,
        ""
      );
      notes = [
        ...[strippedHeader].filter((line) => line),
        ...rawLines.slice(notesStart + 1)
      ];
      lines = rawLines.slice(0, notesStart);
    }

    const weekdayMap = [
      ["monday", "Monday"],
      ["tuesday", "Tuesday"],
      ["wednesday", "Wednesday"],
      ["thursday", "Thursday"],
      ["friday", "Friday"],
      ["saturday", "Saturday"],
      ["sunday", "Sunday"]
    ];
    const isWeekdayHeader = (line) =>
      weekdayMap.some(([key]) => line.toLowerCase().startsWith(key));

    const dayIndices = lines
      .map((line, index) => (isWeekdayHeader(line) ? index : -1))
      .filter((index) => index >= 0);

    const days = dayIndices.length
      ? dayIndices.map((start, idx) => {
          const end = dayIndices[idx + 1] ?? lines.length;
          const title = lines[start];
          const dayLines = lines.slice(start + 1, end);
          return { title, lines: dayLines };
        })
      : lines.length
      ? [{ title: "Your plan", lines }]
      : [];

    return { days, notes };
  }, [result]);

  useEffect(() => {
    if (!planSections.days.length) return;
    setActiveDayIndex(0);
  }, [planSections.days.length, result]);

  const latestPlanByWeekday = useMemo(() => {
    const plans = dashboard?.plans || [];
    if (!plans.length) return {};
    const source = plans[0]?.plan || "";
    const lines = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const notesStart = lines.findIndex((line) =>
      /^(coach\s*notes?|coach's\s*notes?|tips?|notes?)\b/i.test(line)
    );
    const planLines = notesStart >= 0 ? lines.slice(0, notesStart) : lines;
    const week = {};
    let current = null;
    planLines.forEach((line) => {
      const lower = line.toLowerCase();
      if (lower.startsWith("monday")) current = "Monday";
      else if (lower.startsWith("tuesday")) current = "Tuesday";
      else if (lower.startsWith("wednesday")) current = "Wednesday";
      else if (lower.startsWith("thursday")) current = "Thursday";
      else if (lower.startsWith("friday")) current = "Friday";
      else if (lower.startsWith("saturday")) current = "Saturday";
      else if (lower.startsWith("sunday")) current = "Sunday";
      else if (current) {
        if (!week[current]) week[current] = [];
        week[current].push(line);
      }
    });
    return week;
  }, [dashboard]);

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
      if (weatherRequestRef.current !== requestId) return;
      setWeatherLoading(false);
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
      if (airRequestRef.current !== requestId) return;
      setAirQualityLoading(false);
    }
  }, [airCacheKey, getCurrentCoordinates]);

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
    if (route !== "/") return;
    resetPersonalFlow();
  }, [route, resetPersonalFlow]);

  useEffect(() => {
    if (!user || !dashboardCacheKey) return;
    const cached = readJsonCache(dashboardCacheKey);
    const cachedDashboard = cached?.dashboard;
    if (!cachedDashboard) return;
    setDashboard((current) => current || cachedDashboard);
    if (cachedDashboard?.goals) {
      setGoalForm({
        targetWeight: String(cachedDashboard.goals.targetWeight || 160),
        targetCalories: String(cachedDashboard.goals.targetCalories || 2200),
        weeklyWorkouts: String(cachedDashboard.goals.weeklyWorkouts || 3)
      });
    }
  }, [dashboardCacheKey, user]);

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
        if (cachedDashboard?.goals) {
          setGoalForm({
            targetWeight: String(cachedDashboard.goals.targetWeight || 160),
            targetCalories: String(cachedDashboard.goals.targetCalories || 2200),
            weeklyWorkouts: String(cachedDashboard.goals.weeklyWorkouts || 3)
          });
        }
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
        if (data.dashboard?.goals) {
          setGoalForm({
            targetWeight: String(data.dashboard.goals.targetWeight || 160),
            targetCalories: String(data.dashboard.goals.targetCalories || 2200),
            weeklyWorkouts: String(data.dashboard.goals.weeklyWorkouts || 3)
          });
        }
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
        if (cancelled || dashboardRequestRef.current !== requestId) return;
        setDashLoading(false);
      }
    };
    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [dashboardCacheKey, isDashboardRoute, user]);

  useEffect(() => {
    if (!isDashboardRoute || !user) return;
    loadWeatherRecommendation();
    loadAirQuality();
  }, [isDashboardRoute, user, loadWeatherRecommendation, loadAirQuality]);

  useEffect(() => {
    if (isDashboardRoute && user) return;
    setDashLoading(false);
  }, [isDashboardRoute, user]);

  const go = useCallback((path) => {
    const normalizedPath = path === "/dashboard/" ? "/dashboard" : path;
    window.history.pushState({}, "", normalizedPath);
    setRoute(normalizedPath);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (route === "/" || route === "/auth" || route === "/auth/") {
      go("/dashboard");
    }
  }, [go, route, user]);

  const clearDashboardToast = useCallback(() => {
    if (dashboardToastTimeoutRef.current) {
      clearTimeout(dashboardToastTimeoutRef.current);
      dashboardToastTimeoutRef.current = null;
    }
    setDashboardToast(null);
  }, []);

  const showDashboardToast = useCallback(
    (message, tone = "success", options = {}) => {
      if (!message) return;
      if (dashboardToastTimeoutRef.current) {
        clearTimeout(dashboardToastTimeoutRef.current);
      }
      const nextToast = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        tone,
        message,
        actionLabel: options?.actionLabel || "",
        onAction: typeof options?.onAction === "function" ? options.onAction : null
      };
      const timeoutMs =
        Number(options?.durationMs) > 0
          ? Number(options.durationMs)
          : nextToast.onAction
          ? 5200
          : 3200;
      setDashboardToast(nextToast);
      dashboardToastTimeoutRef.current = setTimeout(() => {
        setDashboardToast((current) => (current?.id === nextToast.id ? null : current));
        dashboardToastTimeoutRef.current = null;
      }, timeoutMs);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (dashboardToastTimeoutRef.current) {
        clearTimeout(dashboardToastTimeoutRef.current);
      }
    };
  }, []);

  const removeOptimisticEntry = useCallback((operationId) => {
    setOptimisticLogEntries((current) =>
      current.filter((entry) => entry.operationId !== operationId)
    );
  }, []);

  const clearOptimisticOperations = useCallback(() => {
    optimisticOpRef.current.forEach((operation) => {
      if (operation?.timerId) {
        clearTimeout(operation.timerId);
      }
    });
    optimisticOpRef.current.clear();
    setOptimisticLogEntries([]);
  }, []);

  const undoOptimisticOperation = useCallback(
    (operationId, { showToast = true } = {}) => {
      const operation = optimisticOpRef.current.get(operationId);
      if (!operation || operation.committing) return false;
      if (operation.timerId) {
        clearTimeout(operation.timerId);
      }
      optimisticOpRef.current.delete(operationId);
      removeOptimisticEntry(operationId);
      if (showToast) {
        showDashboardToast(operation.undoMessage || "Update undone.", "success");
      }
      return true;
    },
    [removeOptimisticEntry, showDashboardToast]
  );

  const queueOptimisticLogCommit = useCallback(
    ({ type, item, request, pendingMessage, successMessage, undoMessage }) => {
      const operationId = item.id;
      setDashError("");
      setOptimisticLogEntries((current) => [
        {
          operationId,
          type,
          item: { ...item, isOptimistic: true },
          createdAt: Date.now()
        },
        ...current
      ]);

      const commit = async () => {
        const operation = optimisticOpRef.current.get(operationId);
        if (!operation) return;
        operation.committing = true;
        try {
          const data = await request();
          optimisticOpRef.current.delete(operationId);
          removeOptimisticEntry(operationId);
          setDashboard(data.dashboard);
          showDashboardToast(successMessage || "Saved.");
        } catch (err) {
          optimisticOpRef.current.delete(operationId);
          removeOptimisticEntry(operationId);
          const message = err?.message || `Unable to save ${type}.`;
          setDashError(message);
          showDashboardToast(message, "error");
        }
      };

      const timerId = setTimeout(commit, OPTIMISTIC_UNDO_WINDOW_MS);
      optimisticOpRef.current.set(operationId, {
        type,
        timerId,
        committing: false,
        undoMessage
      });
      showDashboardToast(pendingMessage || "Saved locally.", "success", {
        actionLabel: "Undo",
        onAction: () => {
          undoOptimisticOperation(operationId, { showToast: true });
        },
        durationMs: OPTIMISTIC_UNDO_WINDOW_MS + 1000
      });
    },
    [removeOptimisticEntry, showDashboardToast, undoOptimisticOperation]
  );

  useEffect(() => {
    return () => {
      clearOptimisticOperations();
    };
  }, [clearOptimisticOperations]);

  const onAuthChange = (e) => {
    setAuthForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSignupProfileChange = (e) => {
    setSignupProfileForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const onAuthModeChange = (mode) => {
    const isSwitchingMode = mode !== authMode;
    setAuthMode(mode);
    setAuthError("");
    if (!isSwitchingMode) return;
    setAuthForm({ ...defaultAuthForm });
    setSignupProfileForm({ ...defaultSignupProfileForm });
    setSignupHeightUnit("ft");
    setSignupWeightUnit("lb");
    setAuthAutoSignIn(false);
    setShowPassword(false);
  };

  const onAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      if (authMode === "signup") {
        const normalizedProfile = {
          ...signupProfileForm,
          heightCm:
            signupHeightUnit === "ft"
              ? toCmFromFeetInches(
                  signupProfileForm.heightFeet,
                  signupProfileForm.heightInches
                )
              : signupProfileForm.heightCm,
          weightKg:
            signupWeightUnit === "lb"
              ? toKg(signupProfileForm.weight, "lb")
              : signupProfileForm.weight || signupProfileForm.weightKg
        };
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            ...authForm,
            profile: normalizedProfile
          })
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || "Unable to create account.");
        }
        const data = await res.json();
        setUser(data.user || null);
        setAuthForm({ ...defaultAuthForm });
        setSignupProfileForm({ ...defaultSignupProfileForm });
        setSignupHeightUnit("ft");
        setSignupWeightUnit("lb");
        go("/dashboard");
        return;
      }

      const res = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...authForm,
          rememberMe: authAutoSignIn
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to authenticate.");
      }
      const data = await res.json();
      setUser(data.user || null);

      setAuthForm({ ...defaultAuthForm });
      go("/dashboard");
    } catch (err) {
      setAuthError(err.message || "Unable to authenticate.");
    } finally {
      setAuthLoading(false);
    }
  };

  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setDashboard(null);
    clearOptimisticOperations();
    setWeatherData(null);
    setWeatherError("");
    setWeatherLastUpdatedAt(null);
    setAirQualityData(null);
    setAirQualityError("");
    setAirQualityLastUpdatedAt(null);
    clearDashboardToast();
    resetPersonalFlow();
    go("/");
  };

  const submitWorkout = async (e) => {
    e.preventDefault();
    const normalizedExercises = workoutForm.exercises
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const payload = {
      ...workoutForm,
      exercises: normalizedExercises
    };
    const operationId = `optimistic-workout-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const optimisticWorkout = {
      id: operationId,
      date: workoutForm.date || getLocalDateKey(),
      focus: workoutForm.focus || "General",
      duration: workoutForm.duration ? Number(workoutForm.duration) : null,
      exercises: normalizedExercises,
      sets: workoutForm.sets ? Number(workoutForm.sets) : null,
      reps: workoutForm.reps ? Number(workoutForm.reps) : null,
      intensityRpe: workoutForm.intensityRpe ? Number(workoutForm.intensityRpe) : null,
      notes: workoutForm.notes || "",
      createdAt: new Date().toISOString()
    };

    queueOptimisticLogCommit({
      type: "workout",
      item: optimisticWorkout,
      request: async () => {
        const res = await fetch("/api/dashboard/workout-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorPayload = await res.json().catch(() => ({}));
          throw new Error(errorPayload?.error || "Unable to save workout.");
        }
        return res.json();
      },
      pendingMessage: "Workout added. Undo?",
      successMessage: "Workout saved.",
      undoMessage: "Workout entry removed."
    });

    setWorkoutForm({
      date: getLocalDateKey(),
      focus: "",
      duration: "",
      exercises: "",
      sets: "",
      reps: "",
      intensityRpe: "",
      notes: ""
    });
    setWorkoutModalOpen(false);
  };

  const submitCalories = async (e) => {
    e.preventDefault();
    const operationId = `optimistic-calories-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const payload = {
      ...calorieForm,
      date: getLocalDateKey()
    };

    queueOptimisticLogCommit({
      type: "calorie",
      item: {
        id: operationId,
        date: payload.date,
        calories: Number(calorieForm.calories || 0),
        createdAt: new Date().toISOString()
      },
      request: async () => {
        const res = await fetch("/api/dashboard/calories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorPayload = await res.json().catch(() => ({}));
          throw new Error(errorPayload?.error || "Unable to save calories.");
        }
        return res.json();
      },
      pendingMessage: "Calories added. Undo?",
      successMessage: "Calories logged.",
      undoMessage: "Calorie entry removed."
    });

    setCalorieForm({ calories: "" });
  };

  const submitGoals = async (e) => {
    e.preventDefault();
    setDashError("");
    try {
      const res = await fetch("/api/dashboard/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(goalForm)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save goals.");
      }
      const data = await res.json();
      setDashboard(data.dashboard);
      showDashboardToast("Goals updated.");
    } catch (err) {
      const message = err.message || "Unable to save goals.";
      setDashError(message);
      showDashboardToast(message, "error");
    }
  };

  const submitMealLog = async (e) => {
    e.preventDefault();
    const operationId = `optimistic-meal-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const payload = { ...mealLogForm };

    queueOptimisticLogCommit({
      type: "meal",
      item: {
        id: operationId,
        date: mealLogForm.date || getLocalDateKey(),
        mealType: mealLogForm.mealType || "other",
        name: mealLogForm.name || "",
        calories: mealLogForm.calories ? Number(mealLogForm.calories) : null,
        proteinG: mealLogForm.proteinG ? Number(mealLogForm.proteinG) : null,
        carbsG: mealLogForm.carbsG ? Number(mealLogForm.carbsG) : null,
        fatG: mealLogForm.fatG ? Number(mealLogForm.fatG) : null,
        notes: mealLogForm.notes || "",
        loggedAt: new Date().toISOString()
      },
      request: async () => {
        const res = await fetch("/api/dashboard/meal-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorPayload = await res.json().catch(() => ({}));
          throw new Error(errorPayload?.error || "Unable to save meal log.");
        }
        return res.json();
      },
      pendingMessage: "Meal added. Undo?",
      successMessage: "Meal logged.",
      undoMessage: "Meal entry removed."
    });

    setMealLogForm({
      date: getLocalDateKey(),
      mealType: "breakfast",
      name: "",
      calories: "",
      proteinG: "",
      carbsG: "",
      fatG: "",
      notes: ""
    });
  };

  const submitProgressMetric = async (e) => {
    e.preventDefault();
    setDashError("");
    try {
      const res = await fetch("/api/dashboard/progress-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(progressForm)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save progress metric.");
      }
      const data = await res.json();
      setDashboard(data.dashboard);
      setProgressForm({
        date: getLocalDateKey(),
        weightLb: "",
        bodyFatPct: "",
        waistCm: "",
        restingHr: "",
        notes: ""
      });
      showDashboardToast("Progress metric saved.");
    } catch (err) {
      const message = err.message || "Unable to save progress metric.";
      setDashError(message);
      showDashboardToast(message, "error");
    }
  };

  const saveExerciseToPlan = async (exercisePayload) => {
    setDashError("");
    try {
      const res = await fetch("/api/dashboard/saved-exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(exercisePayload || {})
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save exercise.");
      }
      const data = await res.json();
      setDashboard(data.dashboard);
      showDashboardToast("Exercise saved to your plan.");
      return { ok: true, data };
    } catch (err) {
      const message = err.message || "Unable to save exercise.";
      setDashError(message);
      showDashboardToast(message, "error");
      return { ok: false, error: message };
    }
  };

  const removeSavedExercise = async (entryId) => {
    setDashError("");
    try {
      const res = await fetch(`/api/dashboard/saved-exercises/${entryId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to remove saved exercise.");
      }
      const data = await res.json();
      setDashboard(data.dashboard);
      showDashboardToast("Saved exercise removed.");
      return { ok: true, data };
    } catch (err) {
      const message = err.message || "Unable to remove saved exercise.";
      setDashError(message);
      showDashboardToast(message, "error");
      return { ok: false, error: message };
    }
  };

  if (route === "/auth") {
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

  if (isDashboardRoute) {
    return (
      <DashboardPage
        user={user}
        personal={personal}
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
      quickFocuses={quickFocuses}
      form={form}
      toggleFocus={toggleFocus}
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
