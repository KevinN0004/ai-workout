import { useEffect, useMemo, useState } from "react";
import "./PlansView.css";

const WEEKLY_MEAL_TEMPLATES = {
  lean_strength: {
    breakfast: [
      "Greek yogurt oats cup with berries",
      "Egg scramble with toast and avocado",
      "Protein overnight oats"
    ],
    lunch: [
      "Chicken quinoa prep box",
      "Salmon rice power bowl",
      "Turkey bean chili"
    ],
    dinner: [
      "Lean beef sweet potato skillet",
      "Tofu teriyaki rice bowl",
      "Baked chicken and roasted vegetables"
    ],
    snack: [
      "Apple with peanut butter",
      "Cottage cheese fruit cup",
      "Hummus with veggies and crackers"
    ],
    drink: [
      "Green protein smoothie",
      "Citrus electrolyte refresher",
      "Cold brew recovery shake"
    ],
    prep: [
      "Cook proteins and grains in bulk for 3 days.",
      "Pre-portion snacks so calories stay consistent.",
      "Keep sauces separate to keep meals fresh."
    ]
  },
  fat_loss: {
    breakfast: [
      "Egg white veggie wrap",
      "High-protein yogurt parfait",
      "Spinach protein smoothie"
    ],
    lunch: [
      "Chicken crunch salad bowl",
      "Shrimp cauliflower rice stir fry",
      "Lentil vegetable soup"
    ],
    dinner: [
      "Turkey chili with extra vegetables",
      "Baked fish with greens",
      "Chicken salad bowl with chickpeas"
    ],
    snack: [
      "Cucumber and hummus snack box",
      "Cottage cheese and berries",
      "Carrot sticks and boiled eggs"
    ],
    drink: [
      "Low-calorie electrolyte water",
      "Unsweetened iced tea",
      "Green smoothie with half banana"
    ],
    prep: [
      "Build large salad boxes first, then add proteins.",
      "Use measured dressing cups to control calories.",
      "Batch soup once for easy low-calorie dinners."
    ]
  },
  endurance: {
    breakfast: [
      "Banana peanut overnight oats",
      "Oats with yogurt and fruit",
      "Eggs with toast and banana"
    ],
    lunch: [
      "Chicken pasta prep",
      "Tofu teriyaki rice bowl",
      "Turkey rice bowl"
    ],
    dinner: [
      "Beef sweet potato skillet",
      "Salmon quinoa plate",
      "Chicken and potato tray bake"
    ],
    snack: [
      "Trail mix and fruit",
      "Apple with peanut butter",
      "Yogurt with granola"
    ],
    drink: [
      "Citrus electrolyte refresher",
      "Green smoothie with oats",
      "Cold brew recovery shake"
    ],
    prep: [
      "Increase carb portions the night before hard sessions.",
      "Prep extra rice and pasta for training days.",
      "Set hydration bottles in advance for morning workouts."
    ]
  },
  recovery: {
    breakfast: [
      "Greek yogurt oats cup",
      "Veggie omelet with toast",
      "Berry protein smoothie"
    ],
    lunch: [
      "Turmeric chicken soup",
      "Salmon avocado quinoa plate",
      "Tofu soba noodle bowl"
    ],
    dinner: [
      "Turkey veggie frittata",
      "Baked salmon and greens",
      "Chicken soup with whole-grain toast"
    ],
    snack: [
      "Cottage cheese fruit cup",
      "Hummus and cucumber sticks",
      "Yogurt parfait"
    ],
    drink: [
      "Citrus electrolyte refresher",
      "Herbal tea and water",
      "Green recovery smoothie"
    ],
    prep: [
      "Focus on anti-inflammatory foods and hydration.",
      "Keep proteins ready so recovery meals are fast.",
      "Prep soups and stews for low-effort evenings."
    ]
  }
};

const detectTrack = (goalText = "") => {
  const lower = goalText.toLowerCase();
  if (
    lower.includes("fat loss") ||
    lower.includes("cut") ||
    lower.includes("conditioning")
  ) {
    return "fat_loss";
  }
  if (
    lower.includes("endurance") ||
    lower.includes("athletic") ||
    lower.includes("performance")
  ) {
    return "endurance";
  }
  if (
    lower.includes("mobility") ||
    lower.includes("recovery") ||
    lower.includes("joint")
  ) {
    return "recovery";
  }
  return "lean_strength";
};

const getDailyCalories = (track, baseCalories, trainingDay) => {
  const base = Number(baseCalories) || 2200;
  if (track === "fat_loss") return trainingDay ? base : Math.max(base - 250, 1400);
  if (track === "endurance") return trainingDay ? base + 150 : base;
  if (track === "recovery") return trainingDay ? base : Math.max(base - 100, 1500);
  return trainingDay ? base : Math.max(base - 150, 1500);
};

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
    const targetCalories = Number(dashboard?.goals?.targetCalories || 2200);
    const track = detectTrack(goalText);
    const template = WEEKLY_MEAL_TEMPLATES[track];

    return {
      goalText,
      targetCalories,
      track,
      days: weekDays.map(({ label, key }, index) => {
        const trainingDay = Boolean(latestPlanByWeekday[key]?.length);
        return {
          label,
          key,
          trainingDay,
          breakfast: template.breakfast[index % template.breakfast.length],
          lunch: template.lunch[index % template.lunch.length],
          dinner: template.dinner[index % template.dinner.length],
          snack: template.snack[index % template.snack.length],
          drink: template.drink[index % template.drink.length],
          prepNote: template.prep[index % template.prep.length],
          calories: getDailyCalories(track, targetCalories, trainingDay)
        };
      })
    };
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
