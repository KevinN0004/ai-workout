/**
 * This week of the newest plan, Monday to Sunday, against the workouts logged:
 * which of its training days are done, missed, today's or still to come.
 * Called by useDashboardMetrics for the summary's weekly card.
 */
import { weekDays } from "../../app/constants";
import { isRestDay, readPlan } from "../../app/plans";

const toDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// The local date a plan was saved on, or "" when its timestamp does not parse.
const savedOnKey = (createdAt) => {
  const saved = new Date(createdAt);
  return Number.isNaN(saved.getTime()) ? "" : toDateKey(saved);
};

/**
 * The week holding `today`, Monday first, for `plan`, read through readPlan,
 * and `workouts`, whose dates are YYYY-MM-DD. Each of the seven days has its
 * weekday `key`, `label`, local `date` and a `state`:
 *
 * - `rest`: the plan does not train that weekday (isRestDay);
 * - `unplanned`: a training day before the local date the plan was saved on;
 * - `done`: a workout linked to a training day of this plan with that weekday is
 *   dated this week, or a workout with no link is dated on that day. A workout
 *   linked to another plan completes nothing;
 * - `missed`, `today` or `upcoming`, by the day's date against today's.
 *
 * Returns the days with the `planned`, `done` and `missed` counts, or null with
 * no plan.
 */
export const buildPlanWeek = ({ plan, workouts, today }) => {
  if (!plan) return null;
  const trainingDays = readPlan({ payload: plan.payload, text: plan.plan }).days.filter(
    (day) => day.weekday !== null && !isRestDay(day.lines)
  );
  const savedOn = savedOnKey(plan.createdAt);
  const todayKey = toDateKey(today);

  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = weekDays.map(({ key, label }, offset) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + offset);
    return { key, label, date: toDateKey(date) };
  });
  const weekDates = new Set(week.map((day) => day.date));

  // What this week's workouts complete: a linked one, its plan day's weekday;
  // one with no link, its date.
  const doneWeekdays = new Set();
  const doneDates = new Set();
  for (const workout of workouts) {
    if (!weekDates.has(workout?.date)) continue;
    if (!workout.planId) {
      doneDates.add(workout.date);
    } else if (workout.planId === plan.id) {
      const day = trainingDays.find((trainingDay) => trainingDay.index === workout.planDayIndex);
      if (day) doneWeekdays.add(day.weekday);
    }
  }

  const stateOf = ({ key, date }) => {
    if (!trainingDays.some((day) => day.weekday === key)) return "rest";
    if (date < savedOn) return "unplanned";
    if (doneWeekdays.has(key) || doneDates.has(date)) return "done";
    if (date < todayKey) return "missed";
    return date === todayKey ? "today" : "upcoming";
  };
  const days = week.map((day) => ({ ...day, state: stateOf(day) }));
  const count = (...states) => days.filter((day) => states.includes(day.state)).length;

  return {
    days,
    planned: count("done", "missed", "today", "upcoming"),
    done: count("done"),
    missed: count("missed")
  };
};
