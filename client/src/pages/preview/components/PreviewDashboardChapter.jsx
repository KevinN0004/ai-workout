import { buildPreviewLinePath } from "../utils";

export default function PreviewDashboardChapter({
  previewDashboardSummary,
  previewDashboardStage
}) {
  const {
    goalText,
    scheduleText,
    environmentText,
    equipmentList,
    focusPicks,
    todayName,
    todaySession,
    todayDuration,
    todayWorkoutLines,
    todayMealPlan,
    nextTrainingPlan,
    goalPaceText,
    weeklyGoal,
    completedWorkouts,
    workoutProgress,
    avgCalories,
    calorieGoal,
    calorieProgress,
    calorieDelta,
    targetWeightLabel,
    activeDays,
    avgRecovery,
    calorieSeries,
    workoutSeries,
    recoverySeries,
    trendStartLabel,
    trendEndLabel,
    streakDays,
    recentActivity
  } = previewDashboardSummary;

  const nextWorkoutDuration = String(nextTrainingPlan?.meta || "50 min")
    .split(" - ")[0]
    .trim();
  const nextWorkoutNotes = Array.isArray(nextTrainingPlan?.highlights)
    ? nextTrainingPlan.highlights.slice(0, 2)
    : [];
  const calorieDeltaLabel =
    calorieDelta === 0
      ? "on target"
      : calorieDelta > 0
        ? `+${calorieDelta} kcal vs target`
        : `${calorieDelta} kcal vs target`;

  const renderTrendChart = ({ title, subtitle, series, lineClassName, revealStage }) => (
    <section
      key={`preview-chart-${title}`}
      className={`preview-dashboard-card preview-dashboard-chart-card ${
        previewDashboardStage >= revealStage ? "is-visible" : ""
      }`}
    >
      <div className="preview-dashboard-chart-head">
        <h4>{title}</h4>
        <span className="muted">{subtitle}</span>
      </div>
      <svg
        className="preview-dashboard-chart"
        viewBox="0 0 260 110"
        role="img"
        aria-label={`${title} trend`}
      >
        <path
          className={`preview-dashboard-chart-line ${lineClassName}`}
          d={buildPreviewLinePath(series)}
        />
      </svg>
      <div className="preview-dashboard-chart-labels">
        <span>{trendStartLabel}</span>
        <span>{trendEndLabel}</span>
      </div>
    </section>
  );

  return (
    <section className="preview-dashboard-view" aria-label="Dashboard preview snapshot">
      <div className="preview-dashboard-main">
        <section
          className={`preview-dashboard-card preview-dashboard-overview-panel ${
            previewDashboardStage >= 1 ? "is-visible" : ""
          }`}
        >
          <div className="preview-dashboard-overview-head">
            <div>
              <p className="preview-dashboard-eyebrow">Overview</p>
              <h3>Today's training snapshot</h3>
              <p className="muted">A quick read on your current plan settings and priorities.</p>
            </div>
            <span className="preview-dashboard-link-chip">Update plan</span>
          </div>
          <div className="preview-dashboard-overview-grid">
            <article className="preview-dashboard-overview-card">
              <h4>Goal</h4>
              <p className="preview-dashboard-overview-value">{goalText}</p>
              <p className="muted">Primary outcome you are chasing.</p>
            </article>
            <article className="preview-dashboard-overview-card">
              <h4>Schedule</h4>
              <p className="preview-dashboard-overview-value">{scheduleText}</p>
              <p className="muted">Weekly cadence and session length.</p>
            </article>
            <article className="preview-dashboard-overview-card">
              <h4>Environment</h4>
              <p className="preview-dashboard-overview-value">{environmentText}</p>
              <p className="muted">{equipmentList.join(", ")}</p>
            </article>
            <article className="preview-dashboard-overview-card">
              <h4>Focus picks</h4>
              <p className="preview-dashboard-overview-value">{focusPicks.join(", ")}</p>
              <p className="muted">Quick focus tags to steer the plan.</p>
            </article>
          </div>
        </section>

        <section
          className={`preview-dashboard-card ${previewDashboardStage >= 2 ? "is-visible" : ""}`}
        >
          <div className="preview-dashboard-overview-head">
            <div>
              <h3>{todayName} recommendations</h3>
              <p className="muted">Daily workout and meal picks aligned to your weekly plan.</p>
            </div>
          </div>
          <div className="preview-dashboard-hub-grid">
            <article className="preview-dashboard-hub-card">
              <h4>Workout</h4>
              <ul>
                {todayWorkoutLines.map((line) => (
                  <li key={`dashboard-today-${line}`}>{line}</li>
                ))}
                {!todayWorkoutLines.length ? <li>Active recovery and mobility reset</li> : null}
              </ul>
              <span className="preview-dashboard-link-chip">Open weekly plan</span>
            </article>
            <article className="preview-dashboard-hub-card">
              <h4>Meal plan</h4>
              <ul>
                <li>
                  <strong>Breakfast:</strong> {todayMealPlan.breakfast}
                </li>
                <li>
                  <strong>Lunch:</strong> {todayMealPlan.lunch}
                </li>
                <li>
                  <strong>Dinner:</strong> {todayMealPlan.dinner}
                </li>
                <li>
                  <strong>Snack:</strong> {todayMealPlan.snack}
                </li>
              </ul>
              <p className="muted">Daily target: ~{todayMealPlan.calories} kcal</p>
            </article>
          </div>
        </section>

        <section
          className={`preview-dashboard-card ${previewDashboardStage >= 3 ? "is-visible" : ""}`}
        >
          <h3>Weekly progress</h3>
          <div className="preview-dashboard-stat-row">
            <div>
              <p className="muted">Workouts this week</p>
              <h4>{completedWorkouts}</h4>
            </div>
            <div>
              <p className="muted">Avg calories</p>
              <h4>{avgCalories}</h4>
            </div>
            <div>
              <p className="muted">Target weight</p>
              <h4>{targetWeightLabel}</h4>
            </div>
          </div>
          <div className="preview-dashboard-progress-block">
            <div className="preview-dashboard-progress-label">
              Workouts ({completedWorkouts}/{weeklyGoal})
            </div>
            <div className="preview-dashboard-progress">
              <span style={{ width: `${workoutProgress}%` }} />
            </div>
          </div>
          <div className="preview-dashboard-progress-block">
            <div className="preview-dashboard-progress-label">
              Calories ({avgCalories}/{calorieGoal}) | {calorieDeltaLabel}
            </div>
            <div className="preview-dashboard-progress">
              <span style={{ width: `${calorieProgress}%` }} />
            </div>
          </div>
          <p className="muted">{goalPaceText}</p>
        </section>

        <section
          className={`preview-dashboard-card ${previewDashboardStage >= 4 ? "is-visible" : ""}`}
        >
          <h3>Recent activity</h3>
          <div className="preview-dashboard-activity-list">
            {recentActivity.map((item) => (
              <div key={`dashboard-recent-${item.day}`} className="preview-dashboard-activity-row">
                <div>
                  <strong>{item.day}</strong>
                  <span className="muted"> - {item.session}</span>
                </div>
                <span>{item.duration}</span>
              </div>
            ))}
            {!recentActivity.length ? <p className="muted">No workouts logged yet.</p> : null}
          </div>
        </section>
      </div>

      <aside className="preview-dashboard-side">
        <section
          className={`preview-dashboard-card ${previewDashboardStage >= 5 ? "is-visible" : ""}`}
        >
          <div className="preview-dashboard-range-head">
            <h3>Trend window</h3>
            <div className="preview-dashboard-range-pills" role="group" aria-label="Trend range">
              <span className="active">Week</span>
              <span>Month</span>
            </div>
          </div>
          <p className="muted">Last 7 days of trend data.</p>
          <div className="preview-dashboard-stat-row">
            <div>
              <p className="muted">Active days</p>
              <h4>{activeDays}</h4>
            </div>
            <div>
              <p className="muted">Avg calories</p>
              <h4>{Math.round(avgCalories)}</h4>
            </div>
            <div>
              <p className="muted">Recovery score</p>
              <h4>{avgRecovery}</h4>
            </div>
          </div>
          <p className="muted">
            {streakDays} day streak | {todaySession} ({todayDuration})
          </p>
          <p className="muted">
            Next: {nextTrainingPlan?.day || "Next"} -{" "}
            {nextTrainingPlan?.session || "Training Session"} ({nextWorkoutDuration})
          </p>
          <ul className="preview-dashboard-compact-list">
            {nextWorkoutNotes.map((item) => (
              <li key={`dashboard-next-note-${item}`}>{item}</li>
            ))}
          </ul>
        </section>

        {renderTrendChart({
          title: "Calories",
          subtitle: "Daily calories (7 days)",
          series: calorieSeries,
          lineClassName: "is-calories",
          revealStage: 6
        })}
        {renderTrendChart({
          title: "Activity",
          subtitle: "Workouts per day (7 days)",
          series: workoutSeries,
          lineClassName: "is-activity",
          revealStage: 7
        })}
        {renderTrendChart({
          title: "Recovery",
          subtitle: "Recovery readiness (7 days)",
          series: recoverySeries,
          lineClassName: "is-recovery",
          revealStage: 8
        })}
      </aside>
    </section>
  );
}
