import { useEffect, useMemo, useState } from "react";
import { buildWeeklyMealPlan } from "./planUtils";
import "./PlansView.css";

export default function PlansView({
  weekDays,
  latestPlanByWeekday,
  openPlannerFromProfile,
  dashboard,
  fallbackPlan
}) {
  const [selectedDetail, setSelectedDetail] = useState(null);

  const weeklyMealPlan = useMemo(() => {
    const latestPlan = dashboard?.plans?.[0];
    const goalText =
      latestPlan?.goal ||
      dashboard?.goals?.goalType ||
      fallbackPlan?.goal ||
      "Build lean strength and energy";
    return buildWeeklyMealPlan({
      weekDays,
      latestPlanByWeekday,
      goalText,
      targetCalories: dashboard?.goals?.targetCalories
    });
  }, [dashboard, fallbackPlan, latestPlanByWeekday, weekDays]);

  const selectedDay = useMemo(() => {
    if (!selectedDetail?.dayKey) return null;
    const mealDay = weeklyMealPlan.days.find(
      (day) => day.key === selectedDetail.dayKey
    );
    if (!mealDay) return null;
    return {
      ...mealDay,
      workoutLines: latestPlanByWeekday[selectedDetail.dayKey] || []
    };
  }, [selectedDetail, weeklyMealPlan.days, latestPlanByWeekday]);

  useEffect(() => {
    if (!selectedDay) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSelectedDetail(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedDay]);

  return (
    <section className="panel dashboard-card span-2">
      <h2>Plan hub</h2>
      <div className="plan-rows">
        <section className="plan-row">
          <div className="plan-row-header">
            <div>
              <h3>Workout week</h3>
              <p className="muted">Build your weekly training block.</p>
            </div>
            <button type="button" className="ghost" onClick={openPlannerFromProfile}>
              Update plan
            </button>
          </div>
          <div className="plan-row-grid">
            {weekDays.map(({ label, key }) => (
              <button
                key={key}
                type="button"
                className="hub-card hub-card-button"
                onClick={() => setSelectedDetail({ dayKey: key, mode: "workout" })}
              >
                <h4>{label}</h4>
                {latestPlanByWeekday[key]?.length ? (
                  <ul className="hub-list">
                    {latestPlanByWeekday[key].slice(0, 4).map((line) => (
                      <li key={`${key}-${line}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Generate a weekly plan to populate this day.</p>
                )}
                <p className="hub-card-hint">View day details</p>
              </button>
            ))}
          </div>
        </section>

        <section className="plan-row">
          <div className="plan-row-header">
            <div>
              <h3>Meals week</h3>
              <p className="muted">
                Curated weekly meals based on your goal and calorie target.
              </p>
            </div>
            <div className="meal-track-pill">
              {weeklyMealPlan.goalText} | {weeklyMealPlan.targetCalories} cal/day
            </div>
          </div>
          <div className="plan-row-grid">
            {weeklyMealPlan.days.map((day) => (
              <button
                key={day.key}
                type="button"
                className="hub-card hub-card-button"
                onClick={() => setSelectedDetail({ dayKey: day.key, mode: "meal" })}
              >
                <h4>{day.label}</h4>
                <p className="meal-day-type">
                  {day.trainingDay ? "Training day fuel" : "Recovery day fuel"}
                </p>
                <ul className="hub-list meal-week-list">
                  <li>
                    <strong>Breakfast:</strong> {day.breakfast}
                  </li>
                  <li>
                    <strong>Lunch:</strong> {day.lunch}
                  </li>
                  <li>
                    <strong>Dinner:</strong> {day.dinner}
                  </li>
                  <li>
                    <strong>Snack:</strong> {day.snack}
                  </li>
                  <li>
                    <strong>Drink:</strong> {day.drink}
                  </li>
                </ul>
                <p className="muted">Calories: ~{day.calories}</p>
                <p className="muted">Prep note: {day.prepNote}</p>
                <p className="hub-card-hint">View day details</p>
              </button>
            ))}
          </div>
        </section>

        <section className="plan-row">
          <div className="plan-row-header">
            <div>
              <h3>Tips week</h3>
              <p className="muted">Guidance to keep the week on track.</p>
            </div>
            <button type="button" className="ghost">
              Coming soon
            </button>
          </div>
          <div className="plan-row-grid plan-row-grid-split">
            <div className="hub-card">
              <h4>Daily tips</h4>
              <p className="muted">Short cues that match your workload.</p>
            </div>
            <div className="hub-card">
              <h4>Weekly tips</h4>
              <p className="muted">Big picture adjustments for the week.</p>
            </div>
          </div>
        </section>
      </div>

      {selectedDay && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedDay.key} ${selectedDetail?.mode || "day"} details`}
          onClick={() => setSelectedDetail(null)}
        >
          <div
            className="modal plan-day-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2>
                {selectedDay.key}{" "}
                {selectedDetail?.mode === "workout" ? "Workout" : "Meal"} details
              </h2>
              <button
                type="button"
                className="ghost"
                onClick={() => setSelectedDetail(null)}
              >
                Close
              </button>
            </div>
            <div className="modal-body plan-day-detail-grid">
              {selectedDetail?.mode === "workout" ? (
                <section className="plan-day-detail-col">
                  <h3>Workout details</h3>
                  {selectedDay.workoutLines.length ? (
                    <ul className="hub-list plan-detail-list">
                      {selectedDay.workoutLines.map((line) => (
                        <li key={`${selectedDay.key}-${line}`}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">
                      Recovery or rest day. No workout block assigned.
                    </p>
                  )}
                </section>
              ) : (
                <section className="plan-day-detail-col">
                  <h3>Meal details</h3>
                  <ul className="hub-list plan-detail-list">
                    <li>
                      <strong>Breakfast:</strong> {selectedDay.breakfast}
                    </li>
                    <li>
                      <strong>Lunch:</strong> {selectedDay.lunch}
                    </li>
                    <li>
                      <strong>Dinner:</strong> {selectedDay.dinner}
                    </li>
                    <li>
                      <strong>Snack:</strong> {selectedDay.snack}
                    </li>
                    <li>
                      <strong>Drink:</strong> {selectedDay.drink}
                    </li>
                  </ul>
                  <p className="muted">Calories target: ~{selectedDay.calories}</p>
                  <p className="muted">Prep note: {selectedDay.prepNote}</p>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
