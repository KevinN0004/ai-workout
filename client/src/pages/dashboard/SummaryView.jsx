import { useState } from "react";
import "./SummaryView.css";

function TrendChart({
  title,
  subtitle,
  series,
  buildLinePath,
  lineClassName,
  startLabel,
  endLabel
}) {
  return (
    <section className="panel dashboard-card">
      <div className="summary-chart-header">
        <h2>{title}</h2>
        <span className="muted">{subtitle}</span>
      </div>
      <svg className="summary-chart" viewBox="0 0 260 110" role="img" aria-label={title}>
        <path className={lineClassName} d={buildLinePath(series)} />
      </svg>
      <div className="summary-chart-labels">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </section>
  );
}

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
  workouts,
  buildLinePath,
  trendRanges,
  todayRecommendation,
  weatherData,
  weatherLoading,
  weatherError,
  refreshWeatherRecommendation,
  onOpenPlans,
  onOpenMeal
}) {
  const [trendRange, setTrendRange] = useState("week");
  const activeTrend = trendRanges?.[trendRange] || trendRanges?.week || null;
  const selectedMeal = todayRecommendation?.mealPlan || null;
  const workoutLines = todayRecommendation?.workoutLines || [];
  const weatherCurrent = weatherData?.current || null;
  const weatherRecommendation = weatherData?.recommendation || null;
  const weatherReasons = Array.isArray(weatherRecommendation?.reasons)
    ? weatherRecommendation.reasons
    : [];
  const nextForecast = Array.isArray(weatherData?.daily)
    ? weatherData.daily.slice(0, 3)
    : [];

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
          <div className="overview-header">
            <div>
              <h2>{todayRecommendation?.weekday || "Today"} recommendations</h2>
              <p className="muted">
                Daily workout and meal picks aligned to your current weekly plan.
              </p>
            </div>
          </div>
          <div className="hub-grid">
            <article className="hub-card">
              <h3>Workout</h3>
              {workoutLines.length ? (
                <ul className="hub-list">
                  {workoutLines.slice(0, 4).map((line, index) => (
                    <li key={`today-workout-${index}-${line}`}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No workout assigned for today. Use this as a recovery day.</p>
              )}
              <button type="button" className="ghost" onClick={onOpenPlans}>
                Open weekly plan
              </button>
            </article>
            <article className="hub-card">
              <h3>Meal plan</h3>
              {selectedMeal ? (
                <>
                  <p className="muted">
                    {selectedMeal.trainingDay ? "Training day fuel" : "Recovery day fuel"}
                  </p>
                  <ul className="hub-list">
                    <li>
                      <strong>Breakfast:</strong> {selectedMeal.breakfast}
                    </li>
                    <li>
                      <strong>Lunch:</strong> {selectedMeal.lunch}
                    </li>
                    <li>
                      <strong>Dinner:</strong> {selectedMeal.dinner}
                    </li>
                    <li>
                      <strong>Snack:</strong> {selectedMeal.snack}
                    </li>
                    <li>
                      <strong>Drink:</strong> {selectedMeal.drink}
                    </li>
                  </ul>
                  <p className="muted">Daily target: ~{selectedMeal.calories} kcal</p>
                </>
              ) : (
                <p className="muted">Meal recommendation not available yet.</p>
              )}
              <button type="button" className="ghost" onClick={onOpenMeal}>
                Open meal prep
              </button>
            </article>
            <article className="hub-card">
              <div className="weather-card-header">
                <h3>Weather mode</h3>
                <button type="button" className="ghost" onClick={refreshWeatherRecommendation}>
                  Refresh
                </button>
              </div>
              {weatherLoading ? (
                <p className="muted">Checking local conditions...</p>
              ) : weatherError ? (
                <p className="muted">{weatherError}</p>
              ) : weatherRecommendation ? (
                <>
                  <p className="weather-badge">
                    {weatherRecommendation.workoutType === "outdoor"
                      ? "Outdoor day"
                      : "Indoor day"}
                  </p>
                  <p>{weatherRecommendation.summary}</p>
                  <p className="muted">
                    {weatherCurrent?.temperatureC ?? "--"} C,{" "}
                    {weatherCurrent?.weatherText || weatherRecommendation.weatherText}
                  </p>
                  {weatherReasons.length ? (
                    <ul className="hub-list weather-reasons">
                      {weatherReasons.slice(0, 3).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  {nextForecast.length ? (
                    <div className="weather-forecast">
                      {nextForecast.map((day) => (
                        <div key={day.date} className="weather-forecast-row">
                          <span>{day.date}</span>
                          <span>
                            {day.tempMinC ?? "--"}-{day.tempMaxC ?? "--"} C
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="muted">No weather recommendation loaded yet.</p>
              )}
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

      </div>

      <aside className="dashboard-side">
        <section className="panel dashboard-card">
          <div className="summary-range-header">
            <h2>Trend window</h2>
            <div className="summary-range-toggle" role="group" aria-label="Trend range">
              <button
                type="button"
                className={trendRange === "week" ? "active" : ""}
                onClick={() => setTrendRange("week")}
              >
                Week
              </button>
              <button
                type="button"
                className={trendRange === "month" ? "active" : ""}
                onClick={() => setTrendRange("month")}
              >
                Month
              </button>
            </div>
          </div>
          <p className="muted">
            {trendRange === "month" ? "Last 30 days of trend data." : "Last 7 days of trend data."}
          </p>
          <div className="stat-row">
            <div>
              <p className="muted">Active days</p>
              <h3>{activeTrend?.activeDays || 0}</h3>
            </div>
            <div>
              <p className="muted">Avg calories</p>
              <h3>{Math.round(activeTrend?.avgCalories || 0)}</h3>
            </div>
            <div>
              <p className="muted">Recovery score</p>
              <h3>{Math.round(activeTrend?.avgRecovery || 0)}</h3>
            </div>
          </div>
        </section>

        {activeTrend && (
          <>
            <TrendChart
              title="Calories"
              subtitle={trendRange === "month" ? "Daily calories (30 days)" : "Daily calories (7 days)"}
              series={activeTrend.caloriesSeries}
              buildLinePath={buildLinePath}
              lineClassName="summary-chart-line"
              startLabel={activeTrend.startLabel}
              endLabel={activeTrend.endLabel}
            />
            <TrendChart
              title="Activity"
              subtitle={
                trendRange === "month" ? "Workouts per day (30 days)" : "Workouts per day (7 days)"
              }
              series={activeTrend.workoutSeries}
              buildLinePath={buildLinePath}
              lineClassName="summary-chart-line summary-chart-line-alt"
              startLabel={activeTrend.startLabel}
              endLabel={activeTrend.endLabel}
            />
            <TrendChart
              title="Recovery"
              subtitle={
                trendRange === "month"
                  ? "Recovery readiness estimate (30 days)"
                  : "Recovery readiness estimate (7 days)"
              }
              series={activeTrend.recoverySeries}
              buildLinePath={buildLinePath}
              lineClassName="summary-chart-line summary-chart-line-recovery"
              startLabel={activeTrend.startLabel}
              endLabel={activeTrend.endLabel}
            />
          </>
        )}
      </aside>
    </div>
  );
}
