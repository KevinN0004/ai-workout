/**
 * The dashboard's plan helpers: a goal's track, a day's calorie target and a
 * week of meals (meal, plans and tips views, useDashboardMetrics), and the
 * workout form's pre-fill from a plan day, shaped by the week's progression.
 */
import { newCard } from "../../app/exerciseSets";
import { isRestDay } from "../../app/plans";
import { hasWord } from "./wordMatch";

// Meal ideas per track, which buildWeeklyMealPlan cycles through by day.
const WEEKLY_MEAL_TEMPLATES = {
  lean_strength: {
    breakfast: [
      "Greek yogurt oats cup with berries",
      "Egg scramble with toast and avocado",
      "Protein overnight oats"
    ],
    lunch: ["Chicken quinoa prep box", "Salmon rice power bowl", "Turkey bean chili"],
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
    drink: ["Green protein smoothie", "Citrus electrolyte refresher", "Cold brew recovery shake"],
    prep: [
      "Cook proteins and grains in bulk for 3 days.",
      "Pre-portion snacks so calories stay consistent.",
      "Keep sauces separate to keep meals fresh."
    ]
  },
  fat_loss: {
    breakfast: ["Egg white veggie wrap", "High-protein yogurt parfait", "Spinach protein smoothie"],
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
    lunch: ["Chicken pasta prep", "Tofu teriyaki rice bowl", "Turkey rice bowl"],
    dinner: ["Beef sweet potato skillet", "Salmon quinoa plate", "Chicken and potato tray bake"],
    snack: ["Trail mix and fruit", "Apple with peanut butter", "Yogurt with granola"],
    drink: ["Citrus electrolyte refresher", "Green smoothie with oats", "Cold brew recovery shake"],
    prep: [
      "Increase carb portions the night before hard sessions.",
      "Prep extra rice and pasta for training days.",
      "Set hydration bottles in advance for morning workouts."
    ]
  },
  recovery: {
    breakfast: ["Greek yogurt oats cup", "Veggie omelet with toast", "Berry protein smoothie"],
    lunch: ["Turmeric chicken soup", "Salmon avocado quinoa plate", "Tofu soba noodle bowl"],
    dinner: [
      "Turkey veggie frittata",
      "Baked salmon and greens",
      "Chicken soup with whole-grain toast"
    ],
    snack: ["Cottage cheese fruit cup", "Hummus and cucumber sticks", "Yogurt parfait"],
    drink: ["Citrus electrolyte refresher", "Herbal tea and water", "Green recovery smoothie"],
    prep: [
      "Focus on anti-inflammatory foods and hydration.",
      "Keep proteins ready so recovery meals are fast.",
      "Prep soups and stews for low-effort evenings."
    ]
  }
};

// The words that put a goal on each track, tried in this order. Each is matched
// as a whole word, with the forms a goal might use listed.
const TRACK_WORDS = [
  ["fat_loss", ["fat loss", "cut", "cuts", "cutting", "conditioning"]],
  [
    "endurance",
    [
      "endurance",
      "athletic",
      "athletics",
      "athleticism",
      "performance",
      "cardio",
      "cardiovascular",
      "cardiorespiratory"
    ]
  ],
  ["recovery", ["mobility", "recovery", "joint", "joints"]]
];

/**
 * Maps goal text to a track by keyword, tried in order: fat_loss, endurance,
 * recovery, and lean_strength when none match. A keyword matches as a whole
 * word (TRACK_WORDS), so "cut" is not found in "execute". Of goalOptions, only
 * "Build lean strength and energy" has no keyword, and lean_strength is the
 * track it is meant for. The four names also key the meal templates here, the
 * meal suggestions in meal/data and the tips' categories.
 */
export const detectTrack = (goalText = "") => {
  const lower = goalText.toLowerCase();
  const match = TRACK_WORDS.find(([, words]) => hasWord(lower, words));
  return match ? match[0] : "lean_strength";
};

/**
 * One day's calorie target on a track. Starts from `baseCalories`, with a
 * default for a missing, zero or non-numeric one. A training day keeps the base,
 * or gains a little on endurance. A rest day keeps it on endurance and
 * otherwise gets a little less, but never less than a floor, even when that
 * floor is above the base.
 */
export const getDailyCalories = (track, baseCalories, trainingDay) => {
  const base = Number(baseCalories) || 2200;
  if (track === "fat_loss") return trainingDay ? base : Math.max(base - 250, 1400);
  if (track === "endurance") return trainingDay ? base + 150 : base;
  if (track === "recovery") return trainingDay ? base : Math.max(base - 100, 1500);
  return trainingDay ? base : Math.max(base - 150, 1500);
};

/**
 * A week of meals for a goal: one entry per `weekDays` day, cycling through the
 * track's template meals and prep notes, with that day's calorie target. A day
 * is a training day when `latestPlanByWeekday`, the newest saved plan by
 * weekday, has lines for it that are not a rest day's (isRestDay). Returns the
 * goal text and target it used, after their defaults, with the track and the
 * days.
 */
export const buildWeeklyMealPlan = ({
  weekDays,
  latestPlanByWeekday,
  goalText,
  targetCalories
}) => {
  const safeGoal = goalText || "Build lean strength and energy";
  const safeCalories = Number(targetCalories) || 2200;
  const track = detectTrack(safeGoal);
  const template = WEEKLY_MEAL_TEMPLATES[track] || WEEKLY_MEAL_TEMPLATES.lean_strength;

  return {
    goalText: safeGoal,
    targetCalories: safeCalories,
    track,
    days: weekDays.map(({ label, key }, index) => {
      const trainingDay = !isRestDay(latestPlanByWeekday?.[key] || []);
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
        calories: getDailyCalories(track, safeCalories, trainingDay)
      };
    })
  };
};

// The workout form's limits, which the server enforces on save:
// buildWorkoutSessionEntry keeps 18 exercises of 140 characters and 500
// characters of notes.
const PREFILL_MAX_EXERCISES = 18;
const PREFILL_MAX_EXERCISE_LENGTH = 140;
const PREFILL_MAX_NOTES = 500;

// An exercise name from a "- Name: prescription" bullet, without its bracketed
// asides or a superset's "A1." label, or "" for a line that names no exercise
// (a rest, a ramp-up of the lift after it, a cool-down) or a name longer than
// an exercise can hold. A comma in a name stays: each name is its own card.
const NOT_AN_EXERCISE = /^(rest|ramp-up|easy breathing|easy cooldown)\b/i;
const exerciseNameOf = (line) => {
  if (!line.startsWith("- ")) return "";
  const name = line
    .slice(2)
    .split(":")[0]
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^[A-Z]\d\.\s+/, "")
    .trim();
  if (NOT_AN_EXERCISE.test(name)) return "";
  return name.length <= PREFILL_MAX_EXERCISE_LENGTH ? name : "";
};

// A prescribed range as a placeholder reads it: "8-10", or "6" when it is one
// value; "" for none.
const rangeText = (range) =>
  range ? (range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`) : "";

/**
 * A lift's key, as the server keys the week's progression (roadmap B4): its
 * name trimmed and lower-cased.
 */
export const liftKeyOf = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase();

/**
 * An exercise's sets in a deload week: half, rounded up, and at least one, as
 * the server's progression rules prescribe them.
 */
export const deloadSets = (sets) => Math.max(1, Math.ceil(sets / 2));

// The load a lift's card offers as its placeholder: the week's target, or the
// load it is at while an asked step up waits for its answer; null for a lift
// with no load to set.
const weekLoadOf = (lift, unit) => {
  const load = lift?.[unit];
  if (!load) return null;
  return String(lift.change === "ask" ? load.from : load.target);
};

// The card a prescription opens: its rows, counted the prescribed way, with
// its targets as placeholders. Every row opens empty. With the week's
// progression, a lift opens with the week's sets and load, and in a deload
// week every other exercise at half its sets.
const cardFromPrescription = (prescription, week, unit) => {
  const lift = prescription.reps
    ? week?.lifts.find((entry) => entry.key === liftKeyOf(prescription.name))
    : undefined;
  const lightWeek = Boolean(week?.deloadWeek?.active) && week.deloadWeek.decision === null;
  const load = weekLoadOf(lift, unit);
  return newCard({
    name: prescription.name,
    kind: prescription.seconds ? "seconds" : "reps",
    perSide: prescription.perSide,
    targets: {
      amount: rangeText(prescription.reps ?? prescription.seconds),
      rpe: rangeText(prescription.targetRpe),
      ...(load === null ? {} : { load })
    },
    rows: lift ? lift.sets : lightWeek ? deloadSets(prescription.sets) : prescription.sets
  });
};

/**
 * The Log workout form's fields for a day of a saved plan: the day's title as
 * the focus, its exercise cards (at most 18), and the day's lines as the
 * notes, cut at 500 characters. A rule-built day's cards come from its
 * prescriptions, with the prescribed rows and targets, shaped by `week`, the
 * week's progression when there is one, with loads in `system`'s unit; any
 * other day's are a card with one empty row for each name its bullets
 * prescribe. The sets themselves are left to the person logging.
 */
export const buildPlanDayPrefill = (day, week = null, system = "metric") => ({
  focus: day.title,
  exerciseSets: Array.isArray(day.prescriptions)
    ? day.prescriptions
        .slice(0, PREFILL_MAX_EXERCISES)
        .map((prescription) =>
          cardFromPrescription(prescription, week, system === "imperial" ? "lb" : "kg")
        )
    : day.lines
        .map(exerciseNameOf)
        .filter(Boolean)
        .slice(0, PREFILL_MAX_EXERCISES)
        .map((name) => newCard({ name })),
  notes: day.lines.join("\n").slice(0, PREFILL_MAX_NOTES)
});
