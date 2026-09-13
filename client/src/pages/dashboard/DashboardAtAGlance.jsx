export default function DashboardAtAGlance({
  nextWorkout,
  caloriesGap,
  avgCalories,
  calorieGoal,
  weatherLoading,
  weatherRecommendation,
  weatherError,
  weatherLastUpdatedAt,
  refreshWeatherRecommendation,
  airQualityLoading,
  airSummary,
  airQualityError,
  airQualityLastUpdatedAt,
  refreshAirQuality,
  formatRelativeUpdatedAt,
  onAddWorkout,
  onOpenMeal,
  onOpenTips
}) {
  return (
    <section className="panel dashboard-at-a-glance">
      <div className="dashboard-at-a-glance-head">
        <h2>Today at a glance</h2>
        <p className="muted">Quick status and shortcuts for your day.</p>
      </div>
      <div className="dashboard-at-a-glance-grid equal-card-grid">
        <article className="dashboard-glance-card card-shell">
          <div className="card-section-head">
            <h3>{nextWorkout ? `${nextWorkout.context} workout` : "Workout status"}</h3>
          </div>
          <div className="card-section-body">
            {nextWorkout ? (
              <>
                <p className="dashboard-glance-value">
                  {nextWorkout.date || "Date pending"} - {nextWorkout.focus || "General"}
                </p>
                <p className="muted">{nextWorkout.duration || "--"} min planned</p>
              </>
            ) : (
              <p className="muted">No workout logged yet. Add one to get started.</p>
            )}
          </div>
        </article>
        <article className="dashboard-glance-card card-shell">
          <div className="card-section-head">
            <h3>Calories gap</h3>
          </div>
          <div className="card-section-body">
            <p className="dashboard-glance-value">
              {caloriesGap === 0
                ? "On target"
                : caloriesGap > 0
                  ? `${caloriesGap} under target`
                  : `${Math.abs(caloriesGap)} over target`}
            </p>
            <p className="muted">
              Avg {Math.round(avgCalories)} / goal {calorieGoal} kcal
            </p>
          </div>
        </article>
        <article className="dashboard-glance-card card-shell">
          <div className="card-section-head">
            <h3>Weather</h3>
          </div>
          <div className="card-section-body">
            <p className="dashboard-glance-value">
              {weatherLoading
                ? weatherRecommendation
                  ? "Refreshing..."
                  : "Checking..."
                : weatherRecommendation?.workoutType === "outdoor"
                  ? "Outdoor friendly"
                  : weatherRecommendation?.workoutType === "indoor"
                    ? "Indoor suggested"
                    : weatherError
                      ? "Couldn't check"
                      : "Not checked yet"}
            </p>
            <p className="muted">
              {weatherRecommendation?.summary || weatherError || "No weather update yet."}
            </p>
            {weatherError && typeof refreshWeatherRecommendation === "function" ? (
              <button
                type="button"
                className="ghost dashboard-glance-retry"
                onClick={refreshWeatherRecommendation}
                disabled={weatherLoading}
                aria-label={weatherLoading ? "Retrying weather" : "Retry weather"}
              >
                {weatherLoading ? "Retrying..." : "Retry"}
              </button>
            ) : null}
            <p className="muted dashboard-glance-updated">
              {formatRelativeUpdatedAt(weatherLastUpdatedAt)}
            </p>
          </div>
        </article>
        <article className="dashboard-glance-card card-shell">
          <div className="card-section-head">
            <h3>Air quality</h3>
          </div>
          <div className="card-section-body">
            <p className="dashboard-glance-value">
              {airQualityLoading
                ? airSummary
                  ? "Refreshing..."
                  : "Checking..."
                : airSummary?.level || (airQualityError ? "Couldn't check" : "Not checked yet")}
            </p>
            <p className="muted">
              {airSummary?.guidance || airQualityError || "No air quality guidance available."}
            </p>
            {airQualityError && typeof refreshAirQuality === "function" ? (
              <button
                type="button"
                className="ghost dashboard-glance-retry"
                onClick={refreshAirQuality}
                disabled={airQualityLoading}
                aria-label={airQualityLoading ? "Retrying air quality" : "Retry air quality"}
              >
                {airQualityLoading ? "Retrying..." : "Retry"}
              </button>
            ) : null}
            <p className="muted dashboard-glance-updated">
              {formatRelativeUpdatedAt(airQualityLastUpdatedAt)}
            </p>
          </div>
        </article>
      </div>
      <div className="dashboard-glance-actions">
        <button type="button" className="ghost" onClick={onAddWorkout}>
          Add workout
        </button>
        <button type="button" className="ghost" onClick={onOpenMeal}>
          Log meal
        </button>
        <button type="button" className="ghost" onClick={onOpenTips}>
          Open guides
        </button>
      </div>
    </section>
  );
}
