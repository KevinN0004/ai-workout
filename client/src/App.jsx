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
    return (
      <div className="page" style={gradient}>
        <header className="title">
          <div className="header-top">
            <h1>Dashboard</h1>
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
          <p className="muted">Empty dashboard — ready for advanced planning.</p>
        </header>
        <main className="panel center-panel">
          <p className="muted">This is a placeholder dashboard.</p>
          <button type="button" className="ghost" onClick={() => go("/")}>
            Back to home
          </button>
        </main>
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
