import "./SummaryView.css";

export default function SummaryView({
  form,
  openPlannerFromProfile,
  last7Workouts,
  avgCalories,
  goals,
  goalForm,
  weeklyGoal,
  workoutProgress,
  calorieGoal,
  calorieProgress,
  workouts
}) {
  return (
    <div className="dashboard-split span-2">
      <div className="dashboard-main">
        <section className="panel dashboard-card overview-panel">
          <div className="overview-header">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>Today's training snapshot</h2>
              <p className="muted">
                A quick read on your current plan settings and priorities.
              </p>
            </div>
            <button type="button" className="ghost" onClick={openPlannerFromProfile}>
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
                {form.days} days - {form.duration} min
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
                  <span className="muted">{item.focus ? ` - ${item.focus}` : ""}</span>
                </div>
                <span>{item.duration} min</span>
              </div>
            ))}
            {!workouts.length && <p className="muted">No workouts logged yet.</p>}
          </div>
        </section>

        <section className="panel dashboard-card">
          <h2>Plan hub</h2>
          <div className="hub-grid">
            <div className="hub-card">
              <h3>Workout plans</h3>
              <p className="muted">Generate weekly plans and progressions.</p>
              <button type="button" className="ghost" onClick={openPlannerFromProfile}>
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
  );
}
