/**
 * The dashboard's summary view, the one /dashboard opens on: the planner's
 * settings, today's picks, weather and air quality, weekly progress and the
 * trends. Rendered by DashboardPage, which imports it eagerly, unlike the
 * other views.
 */
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
    <section className="panel summary-card">
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

/**
 * `form` is App's planner form, so the overview shows the settings the next
 * plan will use rather than the saved plan's. The progress and trend numbers
 * come from useDashboardMetrics, and the charts draw with its `buildLinePath`;
 * the weather and air-quality figures are useDashboardData's readings. App's
 * `dashView` being "summary", not this view rendering, is what starts their
 * one-time load. The two cards' refresh buttons are always there, and each card
 * shows its error alongside any reading it still has.
 */
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
  weeklyTrends,
  weatherData,
  weatherLoading,
  weatherError,
  refreshWeatherRecommendation,
  airQualityData,
  airQualityLoading,
  airQualityError,
  refreshAirQuality,
  onOpenPlans,
  onOpenMeal
}) {
  // ---- Derived values -------------------------------------------------------
  const [trendRange, setTrendRange] = useState("week");
  const activeTrend = trendRanges?.[trendRange] || trendRanges?.week || null;
  const selectedMeal = todayRecommendation?.mealPlan || null;
  const workoutLines = todayRecommendation?.workoutLines || [];
  const weatherCurrent = weatherData?.current || null;
  const weatherRecommendation = weatherData?.recommendation || null;
  const weatherReasons = Array.isArray(weatherRecommendation?.reasons)
    ? weatherRecommendation.reasons
    : [];
  const isCommercialEnvironment = form?.environment === "Commercial";
  const environmentSelections = Array.isArray(form?.equipment) ? form.equipment : [];
  // Guarded the same way as equipment above. The planner form always holds
  // focuses as an array, so this is defensive, but an unguarded read here would
  // crash the whole dashboard.
  const focusSelections = Array.isArray(form?.focuses) ? form.focuses : [];
  const emptyEnvironmentSelectionLabel = isCommercialEnvironment
    ? "No rooms or operations selected yet."
    : "No equipment selected yet.";
  const nextForecast = Array.isArray(weatherData?.daily) ? weatherData.daily.slice(0, 3) : [];
  const airSummary = airQualityData?.summary || null;
  const airLocation = airQualityData?.location || null;
  const topPollutants = Array.isArray(airQualityData?.pollutants)
    ? airQualityData.pollutants.slice(0, 3)
    : [];
  const airLevelClass = String(airSummary?.level || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const renderTrendBadge = (value, { suffix, unit = "", decimals = 0 } = {}) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
    const numeric = Number(value);
    const tone = numeric > 0 ? "up" : numeric < 0 ? "down" : "flat";
    const absolute = Math.abs(numeric);
    const formatted = decimals > 0 ? absolute.toFixed(decimals) : String(Math.round(absolute));
    const sign = numeric > 0 ? "+" : numeric < 0 ? "-" : "";
    return (
      <span className={`trend-badge trend-${tone}`}>
        {sign}
        {formatted}
        {unit ? ` ${unit}` : ""} {suffix}
      </span>
    );
  };

  // ---- Render ---------------------------------------------------------------
  return (
    <section className="summary-view">
      <div className="summary-main">
        {/* ---- Planner settings ---- */}
        <section className="panel summary-card overview-panel">
          <div className="overview-header">
            <div>
              <p className="eyebrow">Overview</p>
              <h2>Today's training snapshot</h2>
              <p className="muted">A quick read on your current plan settings and priorities.</p>
            </div>
            <button type="button" className="ghost" onClick={openPlannerFromProfile}>
              Update plan
            </button>
          </div>
          <div className="overview-grid equal-card-grid">
            <article className="overview-card card-shell">
              <div className="card-section-head">
                <h3>Goal</h3>
              </div>
              <div className="card-section-body">
                <p className="overview-value">{form.goal}</p>
                <p className="muted">Primary outcome you are chasing.</p>
              </div>
            </article>
            <article className="overview-card card-shell">
              <div className="card-section-head">
                <h3>Schedule</h3>
              </div>
              <div className="card-section-body">
                <p className="overview-value">
                  {form.days} days - {form.duration} min
                </p>
                <p className="muted">Weekly cadence and session length.</p>
              </div>
            </article>
            <article className="overview-card card-shell">
              <div className="card-section-head">
                <h3>Environment</h3>
              </div>
              <div className="card-section-body">
                <p className="overview-value">{form.environment}</p>
                <p className="muted">
                  {environmentSelections.length
                    ? environmentSelections.join(", ")
                    : emptyEnvironmentSelectionLabel}
                </p>
              </div>
            </article>
            <article className="overview-card card-shell">
              <div className="card-section-head">
                <h3>Focus picks</h3>
              </div>
              <div className="card-section-body">
                <p className="overview-value">
                  {focusSelections.length ? focusSelections.join(", ") : "Pick a focus"}
                </p>
                <p className="muted">Quick focus tags to steer the plan.</p>
              </div>
            </article>
          </div>
        </section>

        {/* ---- Today: workout, meals, weather and air quality ---- */}
        <section className="panel summary-card">
          <div className="overview-header">
            <div>
              <h2>{todayRecommendation?.weekday || "Today"} recommendations</h2>
              <p className="muted">
                Daily workout and meal picks aligned to your current weekly plan.
              </p>
            </div>
          </div>
          <div className="hub-grid equal-card-grid">
            <article className="hub-card card-shell">
              <div className="card-section-head">
                <h3>Workout</h3>
              </div>
              <div className="card-section-body">
                {workoutLines.length ? (
                  <ul className="hub-list">
                    {workoutLines.slice(0, 4).map((line, index) => (
                      <li key={`today-workout-${index}-${line}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">
                    No workout assigned for today. Use this as a recovery day.
                  </p>
                )}
              </div>
              <div className="card-section-foot">
                <button type="button" className="ghost" onClick={onOpenPlans}>
                  Open weekly plan
                </button>
              </div>
            </article>
            <article className="hub-card card-shell">
              <div className="card-section-head">
                <h3>Meal plan</h3>
              </div>
              <div className="card-section-body">
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
              </div>
              <div className="card-section-foot">
                <button type="button" className="ghost" onClick={onOpenMeal}>
                  Open meal prep
                </button>
              </div>
            </article>
            <article className="hub-card card-shell">
              <div className="card-section-head weather-card-header">
                <h3>Weather mode</h3>
                <button
                  type="button"
                  className="ghost icon-button"
                  onClick={refreshWeatherRecommendation}
                  aria-label={weatherLoading ? "Retrying weather" : "Refresh weather"}
                  title={weatherLoading ? "Retrying..." : "Refresh weather"}
                  disabled={weatherLoading}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path
                      d="M21 12a9 9 0 1 1-2.64-6.36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M21 3v6h-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <div className="card-section-body">
                {weatherLoading && !weatherRecommendation ? (
                  <p className="muted">Checking local conditions...</p>
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
                    {weatherError ? <p className="muted">{weatherError}</p> : null}
                  </>
                ) : weatherError ? (
                  <p className="muted">{weatherError}</p>
                ) : (
                  <p className="muted">No weather recommendation loaded yet.</p>
                )}
              </div>
            </article>
            <article className="hub-card card-shell">
              <div className="card-section-head weather-card-header">
                <h3>Air quality</h3>
                <button
                  type="button"
                  className="ghost icon-button"
                  onClick={refreshAirQuality}
                  aria-label={airQualityLoading ? "Retrying air quality" : "Refresh air quality"}
                  title={airQualityLoading ? "Retrying..." : "Refresh air quality"}
                  disabled={airQualityLoading}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path
                      d="M21 12a9 9 0 1 1-2.64-6.36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M21 3v6h-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
              <div className="card-section-body">
                {airQualityLoading && !airSummary ? (
                  <p className="muted">Checking local air quality...</p>
                ) : airSummary ? (
                  <>
                    <p className={`air-quality-badge air-quality-${airLevelClass}`}>
                      {airSummary.level || "Unknown"}
                    </p>
                    <p>{airSummary.guidance}</p>
                    <p className="muted">
                      {airSummary.primaryPollutant || "PM2.5"}: {airSummary.pm25 ?? "--"} ug/m3
                      {airSummary.aqiUs !== null && airSummary.aqiUs !== undefined
                        ? ` | US AQI ${airSummary.aqiUs} from the latest reading`
                        : ""}
                    </p>
                    {airLocation?.name ? (
                      <p className="muted">
                        Station: {airLocation.name}
                        {airLocation.city ? ` (${airLocation.city})` : ""}
                      </p>
                    ) : null}
                    {topPollutants.length ? (
                      <ul className="hub-list weather-reasons">
                        {topPollutants.map((item) => (
                          <li key={`${item.code}-${item.measuredAt}`}>
                            {item.label || item.code}: {item.value} {item.unit}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {airQualityError ? <p className="muted">{airQualityError}</p> : null}
                  </>
                ) : airQualityError ? (
                  <p className="muted">{airQualityError}</p>
                ) : (
                  <p className="muted">No air quality data loaded yet.</p>
                )}
              </div>
            </article>
          </div>
        </section>

        {/* ---- Weekly progress ---- */}
        <section className="panel summary-card">
          <h2>Weekly progress</h2>
          <div className="stat-row">
            <div>
              <p className="muted">Workouts this week</p>
              <div className="summary-stat-main">
                <h3>{last7Workouts.length}</h3>
                {renderTrendBadge(weeklyTrends?.workouts, { suffix: "vs last week" })}
              </div>
            </div>
            <div>
              <p className="muted">Avg calories</p>
              <div className="summary-stat-main">
                <h3>{Math.round(avgCalories)}</h3>
                {renderTrendBadge(weeklyTrends?.calories, {
                  suffix: "vs last week",
                  unit: "kcal"
                })}
              </div>
            </div>
            <div>
              <p className="muted">
                {weeklyTrends?.latestWeight !== null && weeklyTrends?.latestWeight !== undefined
                  ? "Latest weight"
                  : "Target weight"}
              </p>
              <div className="summary-stat-main">
                <h3>
                  {(weeklyTrends?.latestWeight ??
                    Number(goals.targetWeight || goalForm.targetWeight)) ||
                    0}{" "}
                  lb
                </h3>
                {renderTrendBadge(weeklyTrends?.weightDelta, {
                  suffix: "vs last log",
                  unit: "lb",
                  decimals: 1
                })}
              </div>
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

        {/* ---- Recent workouts ---- */}
        <section className="panel summary-card">
          <h2>Recent activity</h2>
          <div className="summary-list">
            {workouts.slice(0, 4).map((item) => (
              <div key={item.id} className="summary-list-row">
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

      {/* ---- Trends: the week or month ---- */}
      <aside className="summary-side">
        <section className="panel summary-card">
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
              subtitle={
                trendRange === "month" ? "Daily calories (30 days)" : "Daily calories (7 days)"
              }
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
    </section>
  );
}
