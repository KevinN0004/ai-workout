import "./CaloriesView.css";

export default function CaloriesView({
  goalForm,
  setGoalForm,
  avgCalories,
  calorieGoal,
  calorieDelta,
  buildLinePath,
  calorieSeries,
  workoutSeries,
  last7Keys,
  submitCalories,
  calorieForm,
  setCalorieForm,
  calories,
  goalPaceText,
  submitGoals,
  progressMetrics,
  progressForm,
  setProgressForm,
  submitProgressMetric
}) {
  return (
    <section className="panel dashboard-card span-2">
      <header className="panel-header">
        <div>
          <h2>Overall goal</h2>
          <p className="muted">Target weight: {goalForm.targetWeight} lb</p>
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
                <path className="chart-line" d={buildLinePath(calorieSeries)} />
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
                    <span className="muted"> - {item.calories} kcal</span>
                  </div>
                </div>
              ))}
              {!calories.length && <p className="muted">No calories logged yet.</p>}
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
            <form id="goals-form" className="form dashboard-form" onSubmit={submitGoals}>
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

          <section className="panel dashboard-card">
            <h3>Progress metrics</h3>
            <p className="muted">Log body metrics over time and keep historical records.</p>
            <form className="form dashboard-form progress-form" onSubmit={submitProgressMetric}>
              <label>
                Date
                <input
                  type="date"
                  value={progressForm.date}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      date: e.target.value
                    }))
                  }
                  required
                />
              </label>
              <label>
                Weight (lb)
                <input
                  type="number"
                  min="50"
                  max="700"
                  value={progressForm.weightLb}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      weightLb: e.target.value
                    }))
                  }
                />
              </label>
              <label>
                Body fat (%)
                <input
                  type="number"
                  min="2"
                  max="70"
                  step="0.1"
                  value={progressForm.bodyFatPct}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      bodyFatPct: e.target.value
                    }))
                  }
                />
              </label>
              <label>
                Waist (cm)
                <input
                  type="number"
                  min="30"
                  max="250"
                  step="0.1"
                  value={progressForm.waistCm}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      waistCm: e.target.value
                    }))
                  }
                />
              </label>
              <label>
                Resting HR
                <input
                  type="number"
                  min="30"
                  max="220"
                  value={progressForm.restingHr}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      restingHr: e.target.value
                    }))
                  }
                />
              </label>
              <label>
                Notes
                <input
                  value={progressForm.notes}
                  onChange={(e) =>
                    setProgressForm((prev) => ({
                      ...prev,
                      notes: e.target.value
                    }))
                  }
                  placeholder="Weekly check-in"
                />
              </label>
              <button className="ghost" type="submit">
                Save metric
              </button>
            </form>

            <div className="list">
              {(Array.isArray(progressMetrics) ? progressMetrics : []).slice(0, 6).map((item) => (
                <div key={item.id} className="list-row">
                  <div>
                    <strong>{item.date}</strong>
                    <span className="muted">
                      {" "}
                      - W {item.weightLb ?? "--"} lb | BF {item.bodyFatPct ?? "--"}% | Waist{" "}
                      {item.waistCm ?? "--"} cm | RHR {item.restingHr ?? "--"}
                    </span>
                  </div>
                </div>
              ))}
              {!progressMetrics?.length && (
                <p className="muted">No progress metrics logged yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
