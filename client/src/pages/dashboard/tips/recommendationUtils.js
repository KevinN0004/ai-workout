const trackCategoryMap = {
  lean_strength: ["Chest", "Back", "Legs", "Shoulders", "Arms"],
  fat_loss: ["Cardio", "Legs", "Abs", "Back"],
  endurance: ["Cardio", "Legs", "Back", "Abs"],
  recovery: ["Abs", "Back", "Shoulders", "Legs"]
};

const keywordCategoryMap = [
  { keyword: "push", categories: ["Chest", "Shoulders", "Arms"] },
  { keyword: "pull", categories: ["Back", "Arms", "Shoulders"] },
  { keyword: "chest", categories: ["Chest", "Shoulders"] },
  { keyword: "back", categories: ["Back"] },
  { keyword: "shoulder", categories: ["Shoulders"] },
  { keyword: "arm", categories: ["Arms"] },
  { keyword: "bicep", categories: ["Arms"] },
  { keyword: "tricep", categories: ["Arms"] },
  { keyword: "leg", categories: ["Legs", "Calves"] },
  { keyword: "quad", categories: ["Legs"] },
  { keyword: "hamstring", categories: ["Legs"] },
  { keyword: "glute", categories: ["Legs"] },
  { keyword: "core", categories: ["Abs"] },
  { keyword: "ab", categories: ["Abs"] },
  { keyword: "cardio", categories: ["Cardio"] },
  { keyword: "conditioning", categories: ["Cardio"] },
  { keyword: "run", categories: ["Cardio", "Legs"] }
];

const equipmentKeywordMap = {
  "bodyweight only": ["bodyweight", "none (bodyweight exercise)"],
  dumbbells: ["dumbbell", "kettlebell"],
  kettlebell: ["kettlebell", "dumbbell"],
  "resistance bands": ["band", "resistance"],
  "adjustable bench": ["bench", "incline bench"],
  "yoga mat": ["mat", "bodyweight"],
  "full gym access": [
    "barbell",
    "dumbbell",
    "machine",
    "bench",
    "cable",
    "kettlebell",
    "bodyweight"
  ],
  "barbell + plates": ["barbell"],
  "cable machine": ["cable"],
  "smith machine": ["barbell", "smith"],
  "cardio machines": ["cardio", "bike", "row", "elliptical", "treadmill"],
  "free weights": ["barbell", "dumbbell", "kettlebell"]
};

const injuryKeywordRules = {
  "lower back": ["deadlift", "good morning", "hyperextension", "bent-over"],
  back: ["deadlift", "good morning", "hyperextension", "bent-over"],
  knee: ["jump", "lunge", "pistol", "squat", "step-up"],
  shoulder: ["press", "snatch", "jerk", "dip", "raise", "pulldown"],
  hip: ["lunge", "squat", "deadlift", "kickback"],
  wrist: ["push-up", "curl", "press", "dip", "extension"],
  elbow: ["curl", "press", "extension", "dip"]
};

export const normalizeText = (value) =>
  typeof value === "string" ? value.toLowerCase().trim() : "";

export const uniqueList = (items) => [...new Set(items.filter(Boolean))];

export const resolveMediaUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `https://wger.de${url}`;
  return url;
};

export const getExerciseImage = (exercise) => {
  const images = Array.isArray(exercise?.images) ? exercise.images : [];
  const mainImage = images.find((item) => item?.isMain && item?.url);
  const fallback = mainImage?.url || images[0]?.url;
  const resolved = resolveMediaUrl(fallback);
  if (resolved) return resolved;
  return `https://placehold.co/640x420?text=${encodeURIComponent(exercise?.name || "Exercise")}`;
};

export const buildContextCategories = ({ track, goalText, todayLines }) => {
  const categories = [...(trackCategoryMap[track] || trackCategoryMap.lean_strength)];
  const sourceText = normalizeText(`${goalText} ${todayLines.join(" ")}`);
  for (const rule of keywordCategoryMap) {
    if (sourceText.includes(rule.keyword)) categories.push(...rule.categories);
  }
  return uniqueList(categories);
};

export const buildEquipmentKeywords = ({ form }) => {
  const selected = Array.isArray(form?.equipment) ? form.equipment : [];
  const keywords = [];
  for (const item of selected) {
    const key = normalizeText(item);
    keywords.push(...(equipmentKeywordMap[key] || []));
  }
  if (!keywords.length && normalizeText(form?.environment) === "home") {
    keywords.push("bodyweight", "none (bodyweight exercise)", "dumbbell", "band");
  }
  return uniqueList(keywords);
};

export const detectInjuryFlags = (injuryText) => {
  const source = normalizeText(injuryText);
  const active = [];
  for (const [injury, keywords] of Object.entries(injuryKeywordRules)) {
    if (source.includes(injury)) active.push({ injury, keywords });
  }
  return active;
};

export const scoreExercise = (exercise, context) => {
  const reasons = [];
  let score = 0;
  const categoryName = exercise?.category?.name || "";
  const categoryLower = normalizeText(categoryName);
  const nameLower = normalizeText(exercise?.name);
  const descriptionLower = normalizeText(exercise?.description);
  const equipmentNames = (Array.isArray(exercise?.equipment) ? exercise.equipment : [])
    .map((item) => normalizeText(item?.name))
    .filter(Boolean);
  const muscleNames = (Array.isArray(exercise?.muscles) ? exercise.muscles : [])
    .map((item) => normalizeText(item?.name))
    .filter(Boolean);

  if (context.preferredCategories.some((name) => normalizeText(name) === categoryLower)) {
    score += 5;
    reasons.push(`Matches your ${categoryName || "current"} focus.`);
  }

  if (context.weatherMode === "outdoor" && categoryLower === "cardio") {
    score += 2;
    reasons.push("Good fit for an outdoor-focused day.");
  }

  if (context.weatherMode === "indoor" && categoryLower !== "cardio") {
    score += 1;
    reasons.push("Works well as an indoor training option.");
  }

  if (context.equipmentKeywords.length) {
    const equipmentMatch = context.equipmentKeywords.some((keyword) =>
      equipmentNames.some((name) => name.includes(keyword))
    );
    const bodyweightFriendly = equipmentNames.some((name) =>
      name.includes("bodyweight") || name.includes("none (bodyweight")
    );
    if (equipmentMatch) {
      score += 3;
      reasons.push("Fits your available equipment.");
    } else if (context.homeMode && bodyweightFriendly) {
      score += 2;
      reasons.push("Bodyweight-friendly for home setup.");
    }
  }

  for (const token of context.goalTokens) {
    if (!token || token.length < 4) continue;
    if (nameLower.includes(token) || descriptionLower.includes(token)) {
      score += 1;
      reasons.push("Aligns with your current goal wording.");
      break;
    }
  }

  for (const token of context.todayTokens) {
    if (!token || token.length < 4) continue;
    if (
      nameLower.includes(token) ||
      descriptionLower.includes(token) ||
      muscleNames.some((muscle) => muscle.includes(token))
    ) {
      score += 2;
      reasons.push("Supports today's planned training emphasis.");
      break;
    }
  }

  for (const flag of context.injuryFlags) {
    const conflict = flag.keywords.some(
      (keyword) => nameLower.includes(keyword) || descriptionLower.includes(keyword)
    );
    if (conflict) {
      score -= 7;
      reasons.push(`Potentially high stress for ${flag.injury}.`);
    }
  }

  if (score <= 0) {
    reasons.push("Fits your current filters.");
  }

  return {
    exercise,
    score,
    reasons: uniqueList(reasons)
  };
};

export const buildGuideCards = ({
  track,
  weeklyWorkouts,
  duration,
  activity,
  weatherMode,
  injuryText
}) => {
  const splitText =
    weeklyWorkouts >= 5
      ? "Use a 5-day split: push, pull, legs, upper, lower with 1-2 recovery days."
      : weeklyWorkouts === 4
      ? "Use an upper/lower split with one conditioning day and one full recovery day."
      : weeklyWorkouts <= 2
      ? "Use full-body sessions each workout day and keep a mobility block on off days."
      : "Use push/pull/legs or full-body rotation based on available days.";

  const intensityText =
    track === "fat_loss"
      ? "Keep compounds at 6-10 reps and add short finishers; keep 1-2 reps in reserve."
      : track === "endurance"
      ? "Prioritize sustainable pacing and controlled intervals before adding load."
      : track === "recovery"
      ? "Use submax loads, slower eccentrics, and higher movement quality focus."
      : "Progress top sets gradually and add load only after clean reps across all sets.";

  const volumeText =
    activity === "Very high" || activity === "High"
      ? "Target 14-20 quality sets per major muscle weekly, then deload every 4-6 weeks."
      : "Target 10-16 quality sets per major muscle weekly and deload every 6-8 weeks.";

  const weatherText =
    weatherMode === "outdoor"
      ? "Weather favors outdoor work: place cardio blocks before sunset and hydrate early."
      : weatherMode === "indoor"
      ? "Weather favors indoor work: bias strength circuits, machines, and controlled conditioning."
      : "Weather mode unavailable: default to your planned split and adjust by RPE.";

  const injuryGuidance = normalizeText(injuryText)
    ? "Injury note detected: use controlled tempo, pain-free ranges, and swap high-risk patterns."
    : "No injury note detected: maintain warm-up sets and full range where technique stays stable.";

  return [
    {
      title: "Split Strategy",
      text: splitText
    },
    {
      title: "Load Progression",
      text: intensityText
    },
    {
      title: "Volume Target",
      text: volumeText
    },
    {
      title: "Session Budget",
      text: `With ${duration} minute sessions, keep 1-2 main lifts and 2-4 accessories per day.`
    },
    {
      title: "Weather Adjustment",
      text: weatherText
    },
    {
      title: "Injury Guardrails",
      text: injuryGuidance
    }
  ];
};
