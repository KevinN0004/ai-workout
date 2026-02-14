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

export const detectTrack = (goalText = "") => {
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

export const getDailyCalories = (track, baseCalories, trainingDay) => {
  const base = Number(baseCalories) || 2200;
  if (track === "fat_loss") return trainingDay ? base : Math.max(base - 250, 1400);
  if (track === "endurance") return trainingDay ? base + 150 : base;
  if (track === "recovery") return trainingDay ? base : Math.max(base - 100, 1500);
  return trainingDay ? base : Math.max(base - 150, 1500);
};

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
      const trainingDay = Boolean(latestPlanByWeekday?.[key]?.length);
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
