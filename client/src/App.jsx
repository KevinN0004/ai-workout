import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import ModalPortal from "./components/ModalPortal";
import "./App.css";

const quickFocuses = [
  "Strength + hypertrophy",
  "Fat loss + conditioning",
  "Mobility + recovery",
  "Athletic power",
  "Endurance base"
];

const goalOptions = [
  "Build lean strength and energy",
  "Fat loss + conditioning",
  "Mobility + recovery",
  "Athletic power",
  "Endurance base"
];

const equipmentOptionsByEnv = {
  Home: [
    "Bodyweight only",
    "Dumbbells",
    "Kettlebell",
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

const getLocalDateKey = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function App() {
  const [personalMode, setPersonalMode] = useState("basic");
  const [heightUnit, setHeightUnit] = useState("cm");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerStep, setPlannerStep] = useState(1);
  const [route, setRoute] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authForm, setAuthForm] = useState({ ...defaultAuthForm });
  const [signupProfileForm, setSignupProfileForm] = useState({
    ...defaultSignupProfileForm
  });
  const [signupStep, setSignupStep] = useState("credentials");
  const [signupHeightUnit, setSignupHeightUnit] = useState("cm");
  const [signupWeightUnit, setSignupWeightUnit] = useState("kg");
  const [dashboard, setDashboard] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState("");
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [airQualityData, setAirQualityData] = useState(null);
  const [airQualityLoading, setAirQualityLoading] = useState(false);
  const [airQualityError, setAirQualityError] = useState("");
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
  const [dashView, setDashView] = useState("summary");
  const [dashNavOpen, setDashNavOpen] = useState(false);
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [personal, setPersonal] = useState({
    name: "",
    age: "",
    heightCm: "",
    heightFeet: "",
    heightInches: "",
    weight: "",
    sex: "",
    bodyFat: "",
    activity: "Moderate",
    notes: ""
  });
  const [form, setForm] = useState({
    goal: "Build lean strength and energy",
    equipment: ["Dumbbells"],
    duration: "45",
    level: "Intermediate",
    injuries: "None",
    days: "3",
    focuses: [],
    environment: "Home"
  });
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const isDashboardRoute =
    route === "/dashboard" || route.startsWith("/dashboard/");

  const gradient = useMemo(
    () => ({
      background:
        "radial-gradient(circle at 10% 10%, rgba(255, 255, 255, 0.14) 0%, transparent 40%)," +
        "radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 45%)," +
        "linear-gradient(135deg, #000 0%, #111 100%)"
    }),
    []
  );

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
        equipment: filtered.length ? filtered : [nextOptions[0]].filter(Boolean)
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
    const latestPlan = dashboard?.plans?.[0] || null;
    const profile = user?.profile || {};
    const activityToLevel = {
      Light: "Beginner",
      Moderate: "Intermediate",
      High: "Advanced",
      "Very high": "Advanced"
    };

    const inferInjuryFromNotes = (notes) => {
      const text = (notes || "").toLowerCase();
      if (!text) return "";
      if (text.includes("lower back") || text.includes("back")) return "Lower back";
      if (text.includes("knee")) return "Knee";
      if (text.includes("shoulder")) return "Shoulder";
      if (text.includes("hip")) return "Hip";
      if (text.includes("wrist") || text.includes("elbow")) return "Wrist/Elbow";
      return "";
    };

    setForm((prev) => {
      const environment = latestPlan?.environment || prev.environment || "Home";
      const envEquipment = equipmentOptionsByEnv[environment] || [];
      const nextEquipment = Array.isArray(latestPlan?.equipment)
        ? latestPlan.equipment.filter((item) => envEquipment.includes(item))
        : prev.equipment.filter((item) => envEquipment.includes(item));
      const nextInjuries =
        latestPlan?.injuries ||
        inferInjuryFromNotes(profile.notes) ||
        prev.injuries ||
        "None";

      return {
        ...prev,
        goal: latestPlan?.goal || dashboard?.goals?.goalType || prev.goal,
        duration: String(latestPlan?.duration || prev.duration || "45"),
        level: latestPlan?.level || activityToLevel[profile.activity] || prev.level,
        injuries: nextInjuries,
        days: String(latestPlan?.days || dashboard?.goals?.weeklyWorkouts || prev.days || "3"),
        environment,
        equipment: nextEquipment.length
          ? nextEquipment
          : [envEquipment[0]].filter(Boolean),
        focuses: Array.isArray(latestPlan?.focuses) ? latestPlan.focuses : prev.focuses
      };
    });

    setPlannerStep(1);
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
      setPlannerOpen(false);
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

  const plannerModal = plannerOpen && (
    <ModalPortal open={plannerOpen}>
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal">
          <div className="modal-header">
            <h2>Planner</h2>
            <button
              type="button"
              className="ghost"
              onClick={() => setPlannerOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="modal-body">
            {plannerStep === 1 && (
              <div className="step-panel">
                <h3>Step 1 - Environment & equipment</h3>
                <div className="step-top">
                  <div className="segmented">
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
              <div className="step-panel">
                <h3>Step 2 - Schedule & constraints</h3>
                <form className="form" onSubmit={onSubmit}>
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
          </div>
          <div className="modal-footer">
            <div className="step-indicator">Step {plannerStep} of 2</div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setPlannerStep((prev) => Math.max(1, prev - 1))}
                disabled={plannerStep === 1}
              >
                Back
              </button>
              {plannerStep < 2 ? (
                <button
                  type="button"
                  className="cta"
                  onClick={() => setPlannerStep((prev) => Math.min(2, prev + 1))}
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
    setWeatherLoading(true);
    setWeatherError("");
    try {
      const { latitude, longitude } = await getCurrentCoordinates();
      const query = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude)
      });
      const res = await fetch(`/api/weather/recommendation?${query.toString()}`, {
        credentials: "include"
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to load weather recommendation.");
      }
      const data = await res.json();
      setWeatherData(data || null);
    } catch (err) {
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
        setWeatherError(err?.message || "Unable to load weather recommendation.");
      }
      setWeatherData(null);
    } finally {
      setWeatherLoading(false);
    }
  }, [getCurrentCoordinates]);

  const loadAirQuality = useCallback(async () => {
    setAirQualityLoading(true);
    setAirQualityError("");
    try {
      const { latitude, longitude } = await getCurrentCoordinates();
      const query = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude)
      });
      const res = await fetch(`/api/air-quality/current?${query.toString()}`, {
        credentials: "include"
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to load air quality.");
      }
      const data = await res.json();
      setAirQualityData(data || null);
    } catch (err) {
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
        setAirQualityError(err?.message || "Unable to load air quality.");
      }
      setAirQualityData(null);
    } finally {
      setAirQualityLoading(false);
    }
  }, [getCurrentCoordinates]);

  useEffect(() => {
    const onPop = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
    const profile = user?.profile;
    if (!profile) return;
    const cm = profile.heightCm ? String(profile.heightCm) : "";
    const nextFeetInches = toFeetInchesFromCm(cm);
    const fullName =
      [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
      profile.name ||
      "";
    setPersonal((prev) => ({
      ...prev,
      name: fullName,
      age: profile.age ? String(profile.age) : "",
      heightCm: cm,
      heightFeet: nextFeetInches.feet,
      heightInches: nextFeetInches.inches,
      weight: profile.weightKg ? String(profile.weightKg) : "",
      sex: profile.sex || "",
      bodyFat: profile.bodyFat ? String(profile.bodyFat) : "",
      activity: profile.activity || "Moderate",
      notes: profile.notes || ""
    }));
  }, [user]);

  useEffect(() => {
    if (!isDashboardRoute || !user) return;
    const loadDashboard = async () => {
      setDashLoading(true);
      setDashError("");
      try {
        const res = await fetch("/api/dashboard", { credentials: "include" });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || "Unable to load dashboard.");
        }
        const data = await res.json();
        setDashboard(data.dashboard);
        if (data.dashboard?.goals) {
          setGoalForm({
            targetWeight: String(data.dashboard.goals.targetWeight || 160),
            targetCalories: String(data.dashboard.goals.targetCalories || 2200),
            weeklyWorkouts: String(data.dashboard.goals.weeklyWorkouts || 3)
          });
        }
      } catch (err) {
        setDashError(err.message || "Unable to load dashboard.");
      } finally {
        setDashLoading(false);
      }
    };
    loadDashboard();
  }, [isDashboardRoute, user]);

  useEffect(() => {
    if (!isDashboardRoute || !user) return;
    loadWeatherRecommendation();
    loadAirQuality();
  }, [isDashboardRoute, user, loadWeatherRecommendation, loadAirQuality]);

  const go = (path) => {
    const normalizedPath =
      path === "/dashboard/" || path.startsWith("/dashboard/")
        ? "/dashboard"
        : path;
    window.history.pushState({}, "", normalizedPath);
    setRoute(normalizedPath);
  };

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
    setSignupStep("credentials");
    setAuthError("");
    if (!isSwitchingMode) return;
    setAuthForm({ ...defaultAuthForm });
    setSignupProfileForm({ ...defaultSignupProfileForm });
    setSignupHeightUnit("cm");
    setSignupWeightUnit("kg");
    setShowPassword(false);
  };

  const onAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      if (authMode === "signup" && signupStep === "credentials") {
        setSignupStep("profile");
        return;
      }

      if (authMode === "signup" && signupStep === "profile") {
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
        setSignupHeightUnit("cm");
        setSignupWeightUnit("kg");
        setSignupStep("credentials");
        go("/dashboard");
        return;
      }

      const res = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(authForm)
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
    setWeatherData(null);
    setWeatherError("");
    setAirQualityData(null);
    setAirQualityError("");
    go("/");
  };

  const submitWorkout = async (e) => {
    e.preventDefault();
    setDashError("");
    try {
      const payload = {
        ...workoutForm,
        exercises: workoutForm.exercises
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      };
      const res = await fetch("/api/dashboard/workout-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save workout.");
      }
      const data = await res.json();
      setDashboard(data.dashboard);
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
    } catch (err) {
      setDashError(err.message || "Unable to save workout.");
    }
  };

  const submitCalories = async (e) => {
    e.preventDefault();
    setDashError("");
    try {
      const payload = {
        ...calorieForm,
        date: getLocalDateKey()
      };
      const res = await fetch("/api/dashboard/calories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save calories.");
      }
      const data = await res.json();
      setDashboard(data.dashboard);
      setCalorieForm({ calories: "" });
    } catch (err) {
      setDashError(err.message || "Unable to save calories.");
    }
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
    } catch (err) {
      setDashError(err.message || "Unable to save goals.");
    }
  };

  const submitMealLog = async (e) => {
    e.preventDefault();
    setDashError("");
    try {
      const res = await fetch("/api/dashboard/meal-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(mealLogForm)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save meal log.");
      }
      const data = await res.json();
      setDashboard(data.dashboard);
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
    } catch (err) {
      setDashError(err.message || "Unable to save meal log.");
    }
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
    } catch (err) {
      setDashError(err.message || "Unable to save progress metric.");
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
      return { ok: true, data };
    } catch (err) {
      const message = err.message || "Unable to save exercise.";
      setDashError(message);
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
      return { ok: true, data };
    } catch (err) {
      const message = err.message || "Unable to remove saved exercise.";
      setDashError(message);
      return { ok: false, error: message };
    }
  };

  if (route === "/auth") {
    return (
      <AuthPage
        gradient={gradient}
        authMode={authMode}
        onAuthModeChange={onAuthModeChange}
        signupStep={signupStep}
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
        authLoading={authLoading}
        authError={authError}
      />
    );
  }

  if (isDashboardRoute) {
    return (
      <DashboardPage
        gradient={gradient}
        user={user}
        go={go}
        onLogout={onLogout}
        dashboard={dashboard}
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
        refreshWeatherRecommendation={loadWeatherRecommendation}
        airQualityData={airQualityData}
        airQualityLoading={airQualityLoading}
        airQualityError={airQualityError}
        refreshAirQuality={loadAirQuality}
        onSaveExerciseToPlan={saveExerciseToPlan}
        onRemoveSavedExercise={removeSavedExercise}
        plannerModal={plannerModal}
        generatedPlanModal={generatedPlanModal}
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
