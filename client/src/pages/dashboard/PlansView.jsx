import { useEffect, useMemo, useState } from "react";
import { buildWeeklyMealPlan } from "./planUtils";
import ModalPortal from "../../components/ModalPortal";
import "./PlansView.css";

export default function PlansView({
  weekDays,
  latestPlanByWeekday,
  openPlannerFromProfile,
  dashboard,
  fallbackPlan,
  onRemoveSavedExercise
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

  const { trainingDays, recoveryDays, dailyTips, weeklyTips } = useMemo(() => {
    const trainingDays = weekDays.filter(
      ({ key }) => (latestPlanByWeekday[key] || []).length > 0
    ).length;
    const recoveryDays = Math.max(weekDays.length - trainingDays, 0);

    const dailyTips = weekDays.map(({ label, key }) => {
      const lines = latestPlanByWeekday[key] || [];
      const merged = lines.join(" ").toLowerCase();

      if (!lines.length) {
        return {
          label,
          text: "Recovery day: keep intensity low, do 15-30 min easy movement, and prioritize sleep and hydration."
        };
      }

      if (
        merged.includes("push") ||
        merged.includes("chest") ||
        merged.includes("shoulder") ||
        merged.includes("triceps")
      ) {
        return {
          label,
          text: "Push focus: keep shoulder blades stable on presses, stop 1-2 reps before failure, and track top-set load."
        };
      }

      if (
        merged.includes("pull") ||
        merged.includes("back") ||
        merged.includes("biceps") ||
        merged.includes("row")
      ) {
        return {
          label,
          text: "Pull focus: start reps by driving elbows back, control the eccentric, and match pull volume to push volume."
        };
      }

      if (
        merged.includes("leg") ||
        merged.includes("quad") ||
        merged.includes("hamstring") ||
        merged.includes("glute") ||
        merged.includes("squat") ||
        merged.includes("deadlift") ||
        merged.includes("lunge")
      ) {
        return {
          label,
          text: "Leg focus: use longer rest on compounds (2-3 min), keep reps controlled, and avoid adding load if depth breaks down."
        };
      }

      if (
        merged.includes("hiit") ||
        merged.includes("conditioning") ||
        merged.includes("cardio") ||
        merged.includes("run") ||
        merged.includes("cycle")
      ) {
        return {
          label,
          text: "Conditioning focus: keep effort targets clear, avoid sprinting every interval, and recover fully between hard bouts."
        };
      }

      return {
        label,
        text: "Session focus: prioritize your first compound lifts, keep form strict, and progress by small weekly increments."
      };
    });

    const minRecoveryDays = Math.max(recoveryDays, 1);
    const weeklyTips = [
      "Progressive overload: add 1 rep or small load increases only when form stays clean.",
      "Balance push and pull work to keep shoulders healthy and posture strong.",
      `Keep at least ${minRecoveryDays} recovery day${minRecoveryDays === 1 ? "" : "s"} this week.`,
      "Use a deload every 4-8 weeks or sooner if performance and recovery are dropping."
    ];

    return { trainingDays, recoveryDays, dailyTips, weeklyTips };
  }, [weekDays, latestPlanByWeekday]);

  const savedExercises = Array.isArray(dashboard?.savedExercises)
    ? dashboard.savedExercises
    : [];

  return (
    <section className="panel plans-view">
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
              <h3>Saved exercise bank</h3>
              <p className="muted">
                Movements saved from the guides library for quick reference in your weekly plans.
              </p>
            </div>
            <div className="tips-status-pill">
              {savedExercises.length} saved exercise{savedExercises.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="plan-row-grid">
            {savedExercises.map((item) => (
              <article key={item.id} className="hub-card saved-exercise-card">
                <h4>{item.name || "Exercise"}</h4>
                <p className="muted">
                  {item.category || "General"}{" "}
                  {item.source ? `| ${String(item.source).toUpperCase()}` : ""}
                </p>
                {Array.isArray(item.muscles) && item.muscles.length ? (
                  <p className="muted">Muscles: {item.muscles.slice(0, 4).join(", ")}</p>
                ) : null}
                {Array.isArray(item.equipment) && item.equipment.length ? (
                  <p className="muted">Equipment: {item.equipment.slice(0, 3).join(", ")}</p>
                ) : null}
                {item.reason ? <p className="muted">Why saved: {item.reason}</p> : null}
                <div className="saved-exercise-actions">
                  {item.videoUrl ? (
                    <a
                      href={item.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ghost"
                    >
                      Video
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onRemoveSavedExercise?.(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {!savedExercises.length ? (
              <article className="hub-card">
                <h4>No saved exercises yet</h4>
                <p className="muted">
                  Open Guides, browse Wger exercises, and tap Save to add your favorites here.
                </p>
              </article>
            ) : null}
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
            <div className="tips-status-pill">
              {trainingDays} training day{trainingDays === 1 ? "" : "s"} | {recoveryDays} recovery
              day{recoveryDays === 1 ? "" : "s"}
            </div>
          </div>
          <div className="plan-row-grid plan-row-grid-split">
            <div className="hub-card">
              <h4>Daily cues</h4>
              <ul className="hub-list tips-day-list">
                {dailyTips.map((tip) => (
                  <li key={`tip-${tip.label}`}>
                    <strong>{tip.label}:</strong> {tip.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="hub-card">
              <h4>Weekly principles</h4>
              <ul className="hub-list tips-week-list">
                {weeklyTips.map((tip) => (
                  <li key={`weekly-${tip}`}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      {selectedDay && (
        <ModalPortal open={Boolean(selectedDay)}>
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
        </ModalPortal>
      )}
    </section>
  );
}
