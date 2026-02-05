import { useMemo, useState } from "react";

const quickFocuses = [
  "Strength + hypertrophy",
  "Fat loss + conditioning",
  "Mobility + recovery",
  "Athletic power",
  "Endurance base"
];

const samplePlan = [
  {
    day: "Day 1 — Full Body Strength",
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
    day: "Day 2 — Conditioning",
    blocks: [
      "Warmup: jump rope 3 min",
      "Intervals: 8 x 30s hard / 60s easy",
      "Core: plank 3 x 45s + dead bug 3 x 10"
    ]
  },
  {
    day: "Day 3 — Lower Body + Core",
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
  const [form, setForm] = useState({
    goal: "Build lean strength and energy",
    equipment: "Dumbbells, yoga mat",
    duration: "45",
    level: "Intermediate",
    injuries: "None",
    days: "3"
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

  const onChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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

  return (
    <div className="page" style={gradient}>
      <header className="hero">
        <nav className="nav">
          <div className="logo">AI Workout Studio</div>
          <div className="nav-actions">
            <button className="ghost">Templates</button>
            <button className="ghost">Pricing</button>
            <button className="cta">Start Free</button>
          </div>
        </nav>

        <div className="hero-grid">
          <div>
            <p className="eyebrow">Coach-level plans in seconds</p>
            <h1>
              Build a workout plan that adapts to your schedule, equipment, and
              energy.
            </h1>
            <p className="subhead">
              Train smarter with AI-built sessions designed around your goal,
              experience, and time. No fluff. Just a clear plan you can follow
              today.
            </p>
            <div className="focus-row">
              {quickFocuses.map((item) => (
                <span key={item} className="pill">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="hero-card">
            <div className="hero-card-top">
              <div>
                <p className="card-label">Today&apos;s focus</p>
                <h3>Lower body strength + core</h3>
              </div>
              <span className="tag">45 min</span>
            </div>
            <div className="hero-card-body">
              <div>
                <p className="metric">8</p>
                <span className="metric-label">Exercises</span>
              </div>
              <div>
                <p className="metric">4</p>
                <span className="metric-label">Blocks</span>
              </div>
              <div>
                <p className="metric">2</p>
                <span className="metric-label">Finishers</span>
              </div>
            </div>
            <button className="cta full">Generate Plan</button>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="panel">
          <div>
            <h2>Design your plan</h2>
            <p className="muted">
              Tell the AI coach what you&apos;re working with and it will produce a
              structured multi-day plan.
            </p>
          </div>
          <form className="form" onSubmit={onSubmit}>
            <label>
              Goal
              <input
                name="goal"
                value={form.goal}
                onChange={onChange}
                placeholder="Strength, fat loss, endurance, mobility"
              />
            </label>
            <label>
              Equipment
              <input
                name="equipment"
                value={form.equipment}
                onChange={onChange}
                placeholder="Dumbbells, kettlebell, treadmill"
              />
            </label>
            <label>
              Days per week
              <select name="days" value={form.days} onChange={onChange}>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </label>
            <label>
              Session length (minutes)
              <input
                name="duration"
                value={form.duration}
                onChange={onChange}
                type="number"
                min="20"
                max="90"
              />
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
              <input
                name="injuries"
                value={form.injuries}
                onChange={onChange}
                placeholder="Lower back, knee, shoulder"
              />
            </label>
            <button className="cta" type="submit" disabled={loading}>
              {loading ? "Generating..." : "Generate workout"}
            </button>
          </form>
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

      <footer className="footer">
        <div>
          <strong>AI Workout Studio</strong>
          <p className="muted">Train with clarity, track with confidence.</p>
        </div>
        <div className="footer-links">
          <button className="ghost">Privacy</button>
          <button className="ghost">Terms</button>
          <button className="ghost">Support</button>
        </div>
      </footer>
    </div>
  );
}