import { useEffect, useMemo, useState } from "react";

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
    day: "Day 1 � Full Body Strength",
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
    day: "Day 2 � Conditioning",
    blocks: [
      "Warmup: jump rope 3 min",
      "Intervals: 8 x 30s hard / 60s easy",
      "Core: plank 3 x 45s + dead bug 3 x 10"
    ]
  },
  {
    day: "Day 3 � Lower Body + Core",
    blocks: [
      "Warmup: hip openers + glute activation",
      "A1: Split squat 4 x 8",
      "A2: Single-leg RDL 3 x 10",
      "B1: Calf raises 3 x 15",
      "Core: side plank 3 x 30s"
    ]
  }
];

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
  const [authForm, setAuthForm] = useState({ email: "", password: "" });
  const [dashboard, setDashboard] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [dashError, setDashError] = useState("");
  const [workoutForm, setWorkoutForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    focus: "",
    duration: ""
  });
  const [calorieForm, setCalorieForm] = useState({
    calories: ""
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
    height: "",
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

  const gradient = useMemo(
    () => ({
      background:
        "radial-gradient(circle at 10% 10%, #ffe8b0 0%, transparent 40%)," +
        "radial-gradient(circle at 80% 20%, #c2f3ff 0%, transparent 45%)," +
        "linear-gradient(135deg, #0b0f1a 0%, #161c2f 100%)"
    }),
    []
  );

  const toCm = (value, fromUnit) => {
    if (!value) return "";
    const num = Number(value);
    if (Number.isNaN(num)) return value;
    return fromUnit === "in" ? String(Math.round(num * 2.54)) : String(num);
  };

  const toInches = (value, fromUnit) => {
    if (!value) return "";
    const num = Number(value);
    if (Number.isNaN(num)) return value;
    return fromUnit === "cm" ? String(Math.round(num / 2.54)) : String(num);
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

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Something went wrong.");
      }

      const data = await res.json();
      setResult(data.plan);
    } catch (err) {
      setError(err.message || "Unable to generate plan.");
    } finally {
      setLoading(false);
    }
  };

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
    if (route !== "/dashboard" || !user) return;
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
  }, [route, user]);

  const go = (path) => {
    window.history.pushState({}, "", path);
    setRoute(path);
  };

  const onAuthChange = (e) => {
    setAuthForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
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
      setAuthForm({ email: "", password: "" });
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
    go("/");
  };

  const submitWorkout = async (e) => {
    e.preventDefault();
    setDashError("");
    try {
      const res = await fetch("/api/dashboard/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(workoutForm)
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || "Unable to save workout.");
      }
      const data = await res.json();
      setDashboard(data.dashboard);
      setWorkoutForm({
        date: new Date().toISOString().slice(0, 10),
        focus: "",
        duration: ""
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
        date: new Date().toISOString().slice(0, 10)
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

  if (route === "/auth") {
    return (
      <div className="page auth-page" style={gradient}>
        <header className="title">
          <h1>AI Workout Studio</h1>
          <p className="muted">Sign in to unlock advanced planning.</p>
        </header>
        <main className="auth-card">
          <div className="segmented">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => setAuthMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === "signup" ? "active" : ""}
              onClick={() => setAuthMode("signup")}
            >
              Sign up
            </button>
          </div>
          <form className="form auth-form" onSubmit={onAuthSubmit}>
            <label>
              Email
              <input
                name="email"
                type="email"
                value={authForm.email}
                onChange={onAuthChange}
                placeholder="you@email.com"
                required
              />
            </label>
            <label>
              <span className="label-row">
                Password
                <button
                  type="button"
                  className="ghost ghost-inline"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                value={authForm.password}
                onChange={onAuthChange}
                placeholder="••••••••"
                required
              />
            </label>
            <button className="cta" type="submit" disabled={authLoading}>
              {authLoading
                ? "Working..."
                : authMode === "login"
                ? "Login"
                : "Create account"}
            </button>
          </form>
          {authError && <p className="error">{authError}</p>}
          <button type="button" className="ghost" onClick={() => go("/")}>
            Back to home
          </button>
        </main>
      </div>
    );
  }

  if (route === "/dashboard") {
    if (!user) {
      return (
        <div className="page" style={gradient}>
          <header className="title">
            <div className="header-top">
              <h1>Dashboard</h1>
              <div className="auth-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => go("/auth")}
                >
                  Login / Sign up
                </button>
              </div>
            </div>
            <p className="muted">Please sign in to access your dashboard.</p>
          </header>
        </div>
      );
    }

    const workouts = dashboard?.workouts || [];
    const calories = dashboard?.calories || [];
    const goals = dashboard?.goals || goalForm;

    const last7Cutoff = new Date();
    last7Cutoff.setDate(last7Cutoff.getDate() - 6);
    const last7Workouts = workouts.filter((item) => {
      const d = new Date(item.date);
      return !Number.isNaN(d) && d >= last7Cutoff;
    });
    const last7Calories = calories.filter((item) => {
      const d = new Date(item.date);
      return !Number.isNaN(d) && d >= last7Cutoff;
    });
    const avgCalories =
      last7Calories.reduce((sum, item) => sum + (item.calories || 0), 0) /
      (last7Calories.length || 1);
    const weeklyGoal = Number(goals.weeklyWorkouts || 3);
    const workoutProgress = Math.min(
      100,
      Math.round((last7Workouts.length / weeklyGoal) * 100)
    );
    const calorieGoal = Number(goals.targetCalories || 2200);
    const calorieProgress = Math.min(
      100,
      Math.round((avgCalories / calorieGoal) * 100)
    );
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, index) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - index));
      return d;
    });
    const last7Keys = last7Days.map((d) => d.toISOString().slice(0, 10));
    const caloriesByDate = calories.reduce((acc, item) => {
      if (!item?.date) return acc;
      const key = item.date;
      const next = Number(item.calories || 0);
      acc[key] = (acc[key] || 0) + (Number.isNaN(next) ? 0 : next);
      return acc;
    }, {});
    const workoutsByDate = workouts.reduce((acc, item) => {
      if (!item?.date) return acc;
      const key = item.date;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const calorieSeries = last7Keys.map((key) => caloriesByDate[key] || 0);
    const workoutSeries = last7Keys.map((key) => workoutsByDate[key] || 0);
    const avgDailyWorkouts = last7Workouts.length / 7;
    const remainingWorkouts = Math.max(weeklyGoal - last7Workouts.length, 0);
    const daysToGoal =
      avgDailyWorkouts > 0 ? Math.ceil(remainingWorkouts / avgDailyWorkouts) : null;
    const goalPaceText = remainingWorkouts === 0
      ? "Weekly workout goal reached."
      : avgDailyWorkouts > 0
      ? `At this pace, ${daysToGoal} day${daysToGoal === 1 ? "" : "s"} to reach ${weeklyGoal} workouts.`
      : "Log a workout to start your pace estimate.";
    const calorieDelta = Math.round(avgCalories - calorieGoal);

    const buildLinePath = (values, width = 260, height = 110, padding = 10) => {
      const safeValues = values.length ? values : [0];
      const max = Math.max(...safeValues, 1);
      const min = Math.min(...safeValues, 0);
      const range = max - min || 1;
      const stepX = (width - padding * 2) / Math.max(safeValues.length - 1, 1);
      return safeValues
        .map((value, index) => {
          const x = padding + stepX * index;
          const y =
            height -
            padding -
            ((value - min) / range) * (height - padding * 2);
          return `${index === 0 ? "M" : "L"}${x},${y}`;
        })
        .join(" ");
    };

    return (
      <div className="page" style={gradient}>
        <header className="title">
          <div className="header-top">
            <div className="header-left">
              <h1>Dashboard</h1>
              <div className="nav-trigger">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setDashNavOpen(true)}
                >
                  Open menu
                </button>
                <span className="muted">Current: {dashView}</span>
              </div>
            </div>
            <div className="auth-actions">
              {user ? (
                <>
                  <span className="muted">Signed in as {user.email}</span>
                  <button type="button" className="ghost" onClick={onLogout}>
                    Log out
                  </button>
                </>
              ) : (
                <button type="button" className="ghost" onClick={() => go("/auth")}>
                  Login / Sign up
                </button>
              )}
            </div>
          </div>
          <p className="muted">
            Visual summary of your progress and key metrics.
          </p>
        </header>
        <main className="dashboard-grid">
          {dashView === "summary" && (
            <div className="dashboard-split span-2">
              <div className="dashboard-main">
                <section className="panel dashboard-card overview-panel">
                <div className="overview-header">
                  <div>
                    <p className="eyebrow">Overview</p>
                    <h2>Today’s training snapshot</h2>
                    <p className="muted">
                      A quick read on your current plan settings and priorities.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setPlannerOpen(true)}
                  >
                    Update plan
                  </button>
                </div>
                <div className="overview-grid">
                  <article className="overview-card">
                    <h3>Goal</h3>
                    <p className="overview-value">{form.goal}</p>
                    <p className="muted">Primary outcome you are chasing.</p>
                  </article>
                  <article className="overview-card">
                    <h3>Schedule</h3>
                    <p className="overview-value">
                      {form.days} days · {form.duration} min
                    </p>
                    <p className="muted">Weekly cadence and session length.</p>
                  </article>
                  <article className="overview-card">
                    <h3>Environment</h3>
                    <p className="overview-value">{form.environment}</p>
                    <p className="muted">
                      {form.equipment.length
                        ? form.equipment.join(", ")
                        : "No equipment selected yet."}
                    </p>
                  </article>
                  <article className="overview-card">
                    <h3>Focus picks</h3>
                    <p className="overview-value">
                      {form.focuses.length ? form.focuses.join(", ") : "Pick a focus"}
                    </p>
                    <p className="muted">Quick focus tags to steer the plan.</p>
                  </article>
                </div>
              </section>
                <section className="panel dashboard-card">
                  <h2>Weekly progress</h2>
                <div className="stat-row">
                  <div>
                    <p className="muted">Workouts this week</p>
                    <h3>{last7Workouts.length}</h3>
                  </div>
                  <div>
                    <p className="muted">Avg calories</p>
                    <h3>{Math.round(avgCalories)}</h3>
                  </div>
                  <div>
                    <p className="muted">Target weight</p>
                    <h3>{goals.targetWeight || goalForm.targetWeight} lb</h3>
                  </div>
                </div>
                  <div className="progress-block">
                    <div className="progress-label">
                      Workouts ({last7Workouts.length}/{weeklyGoal})
                    </div>
                    <div className="progress-bar">
                      <span style={{ width: `${workoutProgress}%` }} />
                    </div>
                  </div>
                  <div className="progress-block">
                    <div className="progress-label">
                      Calories ({Math.round(avgCalories)}/{calorieGoal})
                    </div>
                    <div className="progress-bar">
                      <span style={{ width: `${calorieProgress}%` }} />
                    </div>
                  </div>
                </section>

                <section className="panel dashboard-card">
                  <h2>Recent activity</h2>
                  <div className="list">
                    {workouts.slice(0, 4).map((item) => (
                      <div key={item.id} className="list-row">
                        <div>
                          <strong>{item.date}</strong>
                          <span className="muted">
                            {item.focus ? ` · ${item.focus}` : ""}
                          </span>
                        </div>
                        <span>{item.duration} min</span>
                      </div>
                    ))}
                    {!workouts.length && (
                      <p className="muted">No workouts logged yet.</p>
                    )}
                  </div>
                </section>

                <section className="panel dashboard-card">
                  <h2>Plan hub</h2>
                  <div className="hub-grid">
                    <div className="hub-card">
                      <h3>Workout plans</h3>
                      <p className="muted">Generate weekly plans and progressions.</p>
                      <button type="button" className="ghost" onClick={() => go("/")}>
                        Open planner
                      </button>
                    </div>
                    <div className="hub-card">
                      <h3>Meal prep</h3>
                      <p className="muted">Build calorie-aligned meal templates.</p>
                      <button type="button" className="ghost">
                        Coming soon
                      </button>
                    </div>
                    <div className="hub-card">
                      <h3>Coaching tips</h3>
                      <p className="muted">Daily insights based on your activity.</p>
                      <button type="button" className="ghost">
                        Coming soon
                      </button>
                    </div>
                  </div>
                </section>
              </div>
              <aside className="dashboard-side">
                <section className="panel dashboard-card">
                  <h2>Last 7 days</h2>
                  <div className="stat-row">
                    <div>
                      <p className="muted">Active days</p>
                      <h3>{last7Workouts.length}</h3>
                    </div>
                    <div>
                      <p className="muted">Avg calories</p>
                      <h3>{Math.round(avgCalories)}</h3>
                    </div>
                  </div>
                </section>

                <section className="panel dashboard-card">
                  <h2>Calories</h2>
                  <div className="chart-placeholder">
                    <span className="muted">7-day calories chart (placeholder)</span>
                  </div>
                </section>

                <section className="panel dashboard-card">
                  <h2>Active days</h2>
                  <div className="chart-placeholder">
                    <span className="muted">7-day activity chart (placeholder)</span>
                  </div>
                </section>

                <section className="panel dashboard-card">
                  <h2>Recovery</h2>
                  <div className="chart-placeholder">
                    <span className="muted">Recovery score trend (placeholder)</span>
                  </div>
                </section>
              </aside>
            </div>
          )}

          {dashView === "workouts" && (
            <section className="panel dashboard-card span-2">
              <div className="panel-header">
                <div>
                  <h2>Workout log</h2>
                  <p className="muted">Log each session with a quick add.</p>
                </div>
                <button
                  type="button"
                  className="cta"
                  onClick={() => {
                    setWorkoutForm((prev) => ({
                      ...prev,
                      date: new Date().toISOString().slice(0, 10)
                    }));
                    setWorkoutModalOpen(true);
                  }}
                >
                  Add workout
                </button>
              </div>
              <div className="list">
                {workouts.map((item) => (
                  <div key={item.id} className="list-row">
                    <div>
                      <strong>{item.date}</strong>
                      <span className="muted">
                        {item.focus ? ` · ${item.focus}` : ""}
                      </span>
                    </div>
                    <span>{item.duration} min</span>
                  </div>
                ))}
                {!workouts.length && (
                  <p className="muted">No workouts logged yet.</p>
                )}
              </div>
            </section>
          )}

          {dashView === "calories" && (
            <section className="panel dashboard-card span-2">
              <header className="panel-header">
                <div>
                  <h2>Overall goal</h2>
                  <p className="muted">
                    Target weight: {goalForm.targetWeight} lb
                  </p>
                </div>
                <button className="cta" type="submit" form="goals-form">
                  Save goals
                </button>
              </header>
              <div className="dashboard-split">
                <div className="dashboard-main">
                  <section className="panel dashboard-card">
                    <h3>Calories</h3>
                    <div className="stat-row">
                      <div>
                        <p className="muted">Avg (7 days)</p>
                        <h3>{Math.round(avgCalories)}</h3>
                      </div>
                      <div>
                        <p className="muted">Target</p>
                        <h3>{calorieGoal}</h3>
                      </div>
                      <div>
                        <p className="muted">Delta</p>
                        <h3>{calorieDelta <= 0 ? "On track" : `+${calorieDelta}`}</h3>
                      </div>
                    </div>
                    <div className="chart-card">
                      <div className="chart-header">
                        <h4>Calories per day (7 days)</h4>
                        <span className="muted">Line graph</span>
                      </div>
                      <svg
                        className="chart"
                        viewBox="0 0 260 110"
                        role="img"
                        aria-label="Calories line chart"
                      >
                        <path
                          className="chart-line"
                          d={buildLinePath(calorieSeries)}
                        />
                      </svg>
                      <div className="chart-labels">
                        <span>{last7Keys[0]}</span>
                        <span>{last7Keys[last7Keys.length - 1]}</span>
                      </div>
                    </div>
                    <form className="form dashboard-form" onSubmit={submitCalories}>
                      <label>
                        Calories
                        <input
                          type="number"
                          min="1200"
                          max="5000"
                          value={calorieForm.calories}
                          onChange={(e) =>
                            setCalorieForm((prev) => ({
                              ...prev,
                              calories: e.target.value
                            }))
                          }
                          required
                        />
                      </label>
                      <button className="ghost" type="submit">
                        Log calories
                      </button>
                    </form>

                    <div className="list">
                      {calories.map((item) => (
                        <div key={item.id} className="list-row">
                          <div>
                            <strong>{item.date}</strong>
                            <span className="muted"> · {item.calories} kcal</span>
                          </div>
                        </div>
                      ))}
                      {!calories.length && (
                        <p className="muted">No calories logged yet.</p>
                      )}
                    </div>
                  </section>
                </div>
                <aside className="dashboard-side">
                  <section className="panel dashboard-card">
                    <h3>Goals</h3>
                    <p className="muted">{goalPaceText}</p>
                    <div className="chart-card">
                      <div className="chart-header">
                        <h4>Workouts per day (7 days)</h4>
                        <span className="muted">Line graph</span>
                      </div>
                      <svg
                        className="chart"
                        viewBox="0 0 260 110"
                        role="img"
                        aria-label="Workouts line chart"
                      >
                        <path
                          className="chart-line chart-line-alt"
                          d={buildLinePath(workoutSeries)}
                        />
                      </svg>
                      <div className="chart-labels">
                        <span>{last7Keys[0]}</span>
                        <span>{last7Keys[last7Keys.length - 1]}</span>
                      </div>
                    </div>
                    <form
                      id="goals-form"
                      className="form dashboard-form"
                      onSubmit={submitGoals}
                    >
                      <label>
                        Target weight (lb)
                        <input
                          type="number"
                          min="80"
                          max="400"
                          value={goalForm.targetWeight}
                          onChange={(e) =>
                            setGoalForm((prev) => ({
                              ...prev,
                              targetWeight: e.target.value
                            }))
                          }
                        />
                      </label>
                      <label>
                        Target calories
                        <input
                          type="number"
                          min="1200"
                          max="4000"
                          value={goalForm.targetCalories}
                          onChange={(e) =>
                            setGoalForm((prev) => ({
                              ...prev,
                              targetCalories: e.target.value
                            }))
                          }
                        />
                      </label>
                      <label>
                        Weekly workouts
                        <select
                          value={goalForm.weeklyWorkouts}
                          onChange={(e) =>
                            setGoalForm((prev) => ({
                              ...prev,
                              weeklyWorkouts: e.target.value
                            }))
                          }
                        >
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                        </select>
                      </label>
                    </form>
                  </section>
                </aside>
              </div>
            </section>
          )}

          {dashView === "plans" && (
            <section className="panel dashboard-card span-2">
              <h2>Plan hub</h2>
              <div className="hub-grid">
                <div className="hub-card">
                  <h3>Workout plans</h3>
                  <p className="muted">Generate weekly plans and progressions.</p>
                  <button type="button" className="ghost" onClick={() => go("/")}>
                    Open planner
                  </button>
                </div>
                <div className="hub-card">
                  <h3>Meal prep</h3>
                  <p className="muted">Build calorie-aligned meal templates.</p>
                  <button type="button" className="ghost">
                    Coming soon
                  </button>
                </div>
                <div className="hub-card">
                  <h3>Coaching tips</h3>
                  <p className="muted">Daily insights based on your activity.</p>
                  <button type="button" className="ghost">
                    Coming soon
                  </button>
                </div>
              </div>
            </section>
          )}

          {dashView === "meal" && (
            <section className="panel dashboard-card span-2">
              <h2>Meal prep</h2>
              <p className="muted">Placeholder for meal prep planning.</p>
            </section>
          )}

          {dashView === "tips" && (
            <section className="panel dashboard-card span-2">
              <h2>Tips</h2>
              <p className="muted">Placeholder for coaching tips.</p>
            </section>
          )}

          {dashView === "home" && (
            <section className="panel dashboard-card span-2 center-panel">
              <p className="muted">Return to the main home planner.</p>
              <button type="button" className="ghost" onClick={() => go("/")}>
                Back to home
              </button>
            </section>
          )}
        </main>
        {dashLoading && <p className="muted">Loading dashboard...</p>}
        {dashError && <p className="error">{dashError}</p>}
        {workoutModalOpen && (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setWorkoutModalOpen(false)}
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Add workout</h2>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setWorkoutModalOpen(false)}
                >
                  Close
                </button>
              </div>
              <form className="form dashboard-form workout-modal-form" onSubmit={submitWorkout}>
                <label>
                  Date
                  <input
                    type="date"
                    value={workoutForm.date}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({ ...prev, date: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Focus
                  <input
                    value={workoutForm.focus}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({ ...prev, focus: e.target.value }))
                    }
                    placeholder="Strength, conditioning..."
                  />
                </label>
                <label>
                  Duration (minutes)
                  <input
                    type="number"
                    min="10"
                    max="180"
                    value={workoutForm.duration}
                    onChange={(e) =>
                      setWorkoutForm((prev) => ({
                        ...prev,
                        duration: e.target.value
                      }))
                    }
                    required
                  />
                </label>
                <div className="modal-submit">
                  <button className="cta" type="submit">
                    Save workout
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {dashNavOpen && (
          <div className="drawer-backdrop" onClick={() => setDashNavOpen(false)}>
            <aside
              className="drawer"
              onClick={(e) => e.stopPropagation()}
              role="navigation"
            >
              <div className="drawer-header">
                <h3>Dashboard menu</h3>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setDashNavOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="drawer-links">
                <button
                  type="button"
                  className={dashView === "summary" ? "active" : ""}
                  onClick={() => {
                    setDashView("summary");
                    setDashNavOpen(false);
                  }}
                >
                  Summary
                </button>
                <button
                  type="button"
                  className={dashView === "workouts" ? "active" : ""}
                  onClick={() => {
                    setDashView("workouts");
                    setDashNavOpen(false);
                  }}
                >
                  Workout log
                </button>
                <button
                  type="button"
                  className={dashView === "calories" ? "active" : ""}
                  onClick={() => {
                    setDashView("calories");
                    setDashNavOpen(false);
                  }}
                >
                  Calories & goals
                </button>
                <button
                  type="button"
                  className={dashView === "plans" ? "active" : ""}
                  onClick={() => {
                    setDashView("plans");
                    setDashNavOpen(false);
                  }}
                >
                  Plan hub
                </button>
                <button
                  type="button"
                  className={dashView === "meal" ? "active" : ""}
                  onClick={() => {
                    setDashView("meal");
                    setDashNavOpen(false);
                  }}
                >
                  Meal prep
                </button>
                <button
                  type="button"
                  className={dashView === "tips" ? "active" : ""}
                  onClick={() => {
                    setDashView("tips");
                    setDashNavOpen(false);
                  }}
                >
                  Tips
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => go("/")}
                >
                  Back to home
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page" style={gradient}>
      <header className="title">
        <div className="header-top">
          <h1>AI Workout Studio</h1>
          <div className="auth-actions">
            {user ? (
              <>
                <span className="muted">Signed in as {user.email}</span>
                <button type="button" className="ghost" onClick={onLogout}>
                  Log out
                </button>
              </>
            ) : (
              <button type="button" className="ghost" onClick={() => go("/auth")}>
                Login / Sign up
              </button>
            )}
          </div>
        </div>
        <div className="focus-row">
          {quickFocuses.map((item) => (
            <button
              key={item}
              type="button"
              className={`pill ${form.focuses.includes(item) ? "active" : ""}`}
              onClick={() => toggleFocus(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <main className="content">
        <section className="split-panel">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Personal data</h2>
                <p className="muted">
                  Start with the essentials, or switch to the advanced form for
                  extra detail.
                </p>
              </div>
              <div className="segmented">
                <button
                  type="button"
                  className={personalMode === "basic" ? "active" : ""}
                  onClick={() => setPersonalMode("basic")}
                >
                  Basic
                </button>
                <button
                  type="button"
                  className={personalMode === "advanced" ? "active" : ""}
                  onClick={() => setPersonalMode("advanced")}
                >
                  Advanced
                </button>
              </div>
            </div>

            <form className="form personal-form">
              <label>
                Full name
                <input
                  name="name"
                  value={personal.name}
                  onChange={onPersonalChange}
                  placeholder="Jordan Lee"
                />
              </label>
              <label>
                Age
                <input
                  name="age"
                  value={personal.age}
                  onChange={onPersonalChange}
                  type="number"
                  min="10"
                  max="99"
                  placeholder="28"
                />
              </label>
              <label>
                <span className="label-row">
                  Height ({heightUnit})
                  <span className="unit-toggle" role="group" aria-label="Height units">
                    <button
                      type="button"
                      className={heightUnit === "cm" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          height: toCm(prev.height, heightUnit)
                        }));
                        setHeightUnit("cm");
                      }}
                    >
                      cm
                    </button>
                    <button
                      type="button"
                      className={heightUnit === "in" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          height: toInches(prev.height, heightUnit)
                        }));
                        setHeightUnit("in");
                      }}
                    >
                      in
                    </button>
                  </span>
                </span>
                <input
                  name="height"
                  value={personal.height}
                  onChange={onPersonalChange}
                  type="number"
                  min={heightUnit === "cm" ? "120" : "47"}
                  max={heightUnit === "cm" ? "230" : "91"}
                  placeholder={heightUnit === "cm" ? "175" : "69"}
                />
              </label>
              <label>
                <span className="label-row">
                  Weight ({weightUnit})
                  <span className="unit-toggle" role="group" aria-label="Weight units">
                    <button
                      type="button"
                      className={weightUnit === "kg" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          weight: toKg(prev.weight, weightUnit)
                        }));
                        setWeightUnit("kg");
                      }}
                    >
                      kg
                    </button>
                    <button
                      type="button"
                      className={weightUnit === "lb" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          weight: toLb(prev.weight, weightUnit)
                        }));
                        setWeightUnit("lb");
                      }}
                    >
                      lb
                    </button>
                  </span>
                </span>
                <input
                  name="weight"
                  value={personal.weight}
                  onChange={onPersonalChange}
                  type="number"
                  min={weightUnit === "kg" ? "35" : "77"}
                  max={weightUnit === "kg" ? "200" : "440"}
                  placeholder={weightUnit === "kg" ? "72" : "160"}
                />
              </label>
              <label>
                Sex
                <select name="sex" value={personal.sex} onChange={onPersonalChange}>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </label>

              {personalMode === "advanced" && (
                <>
                  <label>
                    Body fat %
                    <input
                      name="bodyFat"
                      value={personal.bodyFat}
                      onChange={onPersonalChange}
                      type="number"
                      min="5"
                      max="50"
                      placeholder="18"
                    />
                  </label>
                  <label>
                    Activity level
                    <select
                      name="activity"
                      value={personal.activity}
                      onChange={onPersonalChange}
                    >
                      <option>Light</option>
                      <option>Moderate</option>
                      <option>High</option>
                      <option>Very high</option>
                    </select>
                  </label>
                  <label className="full">
                    Notes
                    <input
                      name="notes"
                      value={personal.notes}
                      onChange={onPersonalChange}
                      placeholder="Sleep schedule, stress, recent training"
                    />
                  </label>
                </>
              )}
            </form>
          </div>

          <div className="panel body-visual-panel">
            <h2>Body type</h2>
            <div className="body-visual">
              <div className="body-frame" aria-hidden="true" />
              <p className="muted">Body type visual placeholder</p>
            </div>
          </div>
        </section>

        <section className="panel center-panel">
          <div>
            <h2>Design your plan</h2>
            <p className="muted">
              Open the planner to configure your training details across guided
              steps.
            </p>
          </div>
          <button className="cta" type="button" onClick={() => setPlannerOpen(true)}>
            Open planner
          </button>
          {error && <p className="error">{error}</p>}
          {result && (
            <div className="result">
              <h3>AI Plan</h3>
              <pre>{result}</pre>
            </div>
          )}
        </section>

        <section className="panel muted-panel">
          <h2>Sample plan snapshot</h2>
          <div className="grid">
            {samplePlan.map((block) => (
              <article key={block.day} className="plan-card">
                <h3>{block.day}</h3>
                <ul>
                  {block.blocks.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>

      {plannerOpen && (
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
                  <h3>Step 1 — Environment & equipment</h3>
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
                  <h3>Step 2 — Schedule & constraints</h3>
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
      )}
    </div>
  );
}
