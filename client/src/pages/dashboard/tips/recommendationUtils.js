/**
 * The Guides view's rules: how the goal track, the plan, the planner's
 * equipment, the weather and an injury note score a wger exercise, and the
 * training-guide cards. Used by TipsView and the tips components.
 */
import { hasWord } from "../wordMatch";

// wger category names each goal track favours.
const trackCategoryMap = {
  lean_strength: ["Chest", "Back", "Legs", "Shoulders", "Arms"],
  fat_loss: ["Cardio", "Legs", "Abs", "Back"],
  endurance: ["Cardio", "Legs", "Back", "Abs"],
  recovery: ["Abs", "Back", "Shoulders", "Legs"]
};

// Words in the goal or today's plan lines that favour more categories, matched
// whole. Each lists its plurals and verb forms, and the exercise names it heads
// ("pulldown", "pushdown").
const keywordCategoryMap = [
  {
    words: ["push", "pushes", "pushing", "pushup", "pushups", "pushdown", "pushdowns"],
    categories: ["Chest", "Shoulders", "Arms"]
  },
  {
    words: [
      "pull",
      "pulls",
      "pulling",
      "pullup",
      "pullups",
      "pulldown",
      "pulldowns",
      "pullover",
      "pullovers"
    ],
    categories: ["Back", "Arms", "Shoulders"]
  },
  { words: ["chest"], categories: ["Chest", "Shoulders"] },
  { words: ["back"], categories: ["Back"] },
  { words: ["shoulder", "shoulders"], categories: ["Shoulders"] },
  { words: ["arm", "arms", "forearm", "forearms"], categories: ["Arms"] },
  { words: ["bicep", "biceps"], categories: ["Arms"] },
  { words: ["tricep", "triceps"], categories: ["Arms"] },
  { words: ["leg", "legs"], categories: ["Legs", "Calves"] },
  { words: ["quad", "quads", "quadriceps"], categories: ["Legs"] },
  { words: ["hamstring", "hamstrings"], categories: ["Legs"] },
  { words: ["glute", "glutes"], categories: ["Legs"] },
  { words: ["core"], categories: ["Abs"] },
  { words: ["ab", "abs", "abdominal", "abdominals"], categories: ["Abs"] },
  { words: ["cardio", "cardiovascular"], categories: ["Cardio"] },
  { words: ["conditioning"], categories: ["Cardio"] },
  { words: ["run", "runs", "running"], categories: ["Cardio", "Legs"] }
];

// The wger equipment-name fragments each planner equipment label stands for,
// keyed by the label lower-cased.
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
    "bodyweight",
    "cardio",
    "treadmill",
    "elliptical",
    "bike",
    "row"
  ],
  "strength floor": ["barbell", "dumbbell", "kettlebell", "bench", "machine"],
  "cardio deck": ["cardio", "bike", "row", "elliptical", "treadmill", "ergometer"],
  "functional training zone": ["bodyweight", "kettlebell", "dumbbell", "band", "cable"],
  "group class studio": ["bodyweight", "mat", "dumbbell", "kettlebell", "band", "cardio"],
  "pool / aquatic center": ["swim", "aquatic", "cardio", "bodyweight"],
  "court sports area": ["cardio", "conditioning", "agility", "jump", "plyometric"],
  "recovery & mobility zone": ["mobility", "stretch", "bodyweight", "mat", "band"],
  // Labels equipmentOptionsByEnv does not offer. The planner form only ever
  // holds that list's labels, so nothing in the app reaches these five.
  "barbell + plates": ["barbell"],
  "cable machine": ["cable"],
  "smith machine": ["barbell", "smith"],
  "cardio machines": ["cardio", "bike", "row", "elliptical", "treadmill"],
  "free weights": ["barbell", "dumbbell", "kettlebell"]
};

// Words in an exercise's name or description that are risky for each injury,
// `lower back` first: detectInjuryFlags tries the names in this order.
const injuryKeywordRules = {
  "lower back": ["deadlift", "good morning", "hyperextension", "bent-over"],
  back: ["deadlift", "good morning", "hyperextension", "bent-over"],
  knee: ["jump", "lunge", "pistol", "squat", "step-up"],
  shoulder: ["press", "snatch", "jerk", "dip", "raise", "pulldown"],
  hip: ["lunge", "squat", "deadlift", "kickback"],
  wrist: ["push-up", "curl", "press", "dip", "extension"],
  elbow: ["curl", "press", "extension", "dip"]
};

// The words naming each injury, matched whole: the plurals, and the compounds
// that name it. "lowerback" and "upperback", written as one word, are back.
const injuryNameForms = {
  "lower back": ["lower back", "lower backache", "lower backaches"],
  back: ["back", "backs", "backache", "backaches", "lowerback", "upperback"],
  knee: ["knee", "knees", "kneecap", "kneecaps", "kneel", "kneeling"],
  shoulder: ["shoulder", "shoulders"],
  hip: ["hip", "hips", "hipbone", "hipbones"],
  wrist: ["wrist", "wrists"],
  elbow: ["elbow", "elbows"]
};

// What a conflict costs: more than any single match earns. A lower-back
// conflict costs double, so a lower-back note weighs as two injuries do
// (client/README.md, "Exercise Recommendations").
const INJURY_PENALTY = 7;
const injuryPenalty = { "lower back": 14 };

// A rule a broader flag already covers: once the lower back is flagged, a
// further back mention adds no flag, so a note naming the back twice still
// weighs 14.
const coveredBy = { back: "lower back" };

/** `value` lower-cased and trimmed, or "" for anything that is not a string. */
export const normalizeText = (value) =>
  typeof value === "string" ? value.toLowerCase().trim() : "";

/** `items` without falsy entries or repeats, in first-seen order. */
export const uniqueList = (items) => [...new Set(items.filter(Boolean))];

/**
 * A wger media URL made absolute: a root-relative path gets wger's origin, any
 * other value comes back as given, and a missing one as "".
 */
export const resolveMediaUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `https://wger.de${url}`;
  return url;
};

/**
 * The exercise's main image, else its first, else a placehold.co image with
 * its name on it.
 */
export const getExerciseImage = (exercise) => {
  const images = Array.isArray(exercise?.images) ? exercise.images : [];
  const mainImage = images.find((item) => item?.isMain && item?.url);
  const fallback = mainImage?.url || images[0]?.url;
  const resolved = resolveMediaUrl(fallback);
  if (resolved) return resolved;
  return `https://placehold.co/640x420?text=${encodeURIComponent(exercise?.name || "Exercise")}`;
};

/**
 * The categories to favour: the track's own (lean_strength's for an unknown
 * track), plus those of each keyword in the goal text or today's plan lines,
 * without repeats. A keyword matches as a whole word.
 */
export const buildContextCategories = ({ track, goalText, todayLines }) => {
  const categories = [...(trackCategoryMap[track] || trackCategoryMap.lean_strength)];
  const sourceText = normalizeText(`${goalText} ${todayLines.join(" ")}`);
  for (const rule of keywordCategoryMap) {
    if (hasWord(sourceText, rule.words)) categories.push(...rule.categories);
  }
  return uniqueList(categories);
};

/**
 * The equipment-name fragments that count as available: those of each label
 * selected in the planner form, a label the map lacks adding none. When that
 * yields nothing and the environment is Home, a bodyweight-friendly set stands
 * in.
 */
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

/**
 * Each injury named in the text, with its risky keywords and what a conflict
 * costs. Names match as whole words, lower back before back, and a back
 * mention beside a flagged lower back adds no flag (coveredBy), so "lower
 * back" is one flag, not two.
 */
export const detectInjuryFlags = (injuryText) => {
  const source = normalizeText(injuryText);
  const active = [];
  for (const [injury, keywords] of Object.entries(injuryKeywordRules)) {
    if (!hasWord(source, injuryNameForms[injury])) continue;
    if (active.some((flag) => flag.injury === coveredBy[injury])) continue;
    active.push({ injury, keywords, penalty: injuryPenalty[injury] ?? INJURY_PENALTY });
  }
  return active;
};

// Whole answers to "any injuries?" that mean there are none: the planner's
// injuries field defaults to "None", and a profile note may say so in words
// ("No injuries", "no known issues", "injury-free"). Anchored at both ends, so
// a note that goes on to name something ("no injuries except a sore knee") is
// a note.
const NO_INJURY_ANSWER =
  /^(none|nothing|nope|no|n\/?a|injury[- ]free|no (current |known )?(injur(y|ies)|limitations?|issues?|problems?|pain)( or (injur(y|ies)|limitations?|issues?|problems?|pain))?)$/;

// Lower-cased, with runs of spaces collapsed and closing . ! dropped, so
// "No  injuries." reads as "no injuries".
const isNoInjuryAnswer = (value) =>
  NO_INJURY_ANSWER.test(
    value
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.!]+$/, "")
  );

/**
 * The injury note the guide reads: the planner's injuries answer and the
 * profile's notes, trimmed and joined with a space, each left out when it is
 * empty or is a whole answer meaning none (NO_INJURY_ANSWER).
 */
export const buildInjuryText = (injuries, notes) =>
  [injuries, notes]
    .map((value) => String(value || "").trim())
    .filter((value) => value && !isNoInjuryAnswer(value))
    .join(" ");

/**
 * Scores one exercise against TipsView's context, with the reasons the tiles
 * and the details modal show. Points come from a favoured category, the weather
 * mode, available equipment (or bodyweight at home), and a word of the goal or
 * of today's lines in the exercise; each injury conflict costs more than any
 * single match earns (7, or the flag's own penalty). A score of 0 or below gets a generic reason. Returns the
 * exercise with its score and reasons.
 */
export const scoreExercise = (exercise, context) => {
  // ---- What to match against ------------------------------------------------
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

  // ---- Category, weather and equipment --------------------------------------
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
    const bodyweightFriendly = equipmentNames.some(
      (name) => name.includes("bodyweight") || name.includes("none (bodyweight")
    );
    if (equipmentMatch) {
      score += 3;
      reasons.push("Fits your available equipment.");
    } else if (context.homeMode && bodyweightFriendly) {
      score += 2;
      reasons.push("Bodyweight-friendly for home setup.");
    }
  }

  // ---- The goal's and today's words -----------------------------------------
  // Short words are skipped, and each loop counts its first match only.
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

  // ---- Injury conflicts, and the fallback reason ----------------------------
  for (const flag of context.injuryFlags) {
    const conflict = flag.keywords.some(
      (keyword) => nameLower.includes(keyword) || descriptionLower.includes(keyword)
    );
    if (conflict) {
      score -= flag.penalty ?? INJURY_PENALTY;
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

/**
 * The training guide's cards: split, load progression, volume, session budget,
 * weather and injuries. Each card's text depends on one setting: weekly
 * workouts, track, activity level, session minutes, weather mode and whether
 * there is an injury note.
 */
export const buildGuideCards = ({
  track,
  weeklyWorkouts,
  duration,
  activity,
  weatherMode,
  injuryText
}) => {
  // ---- One cue per card -----------------------------------------------------
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

  // ---- The cards, in the order the guide shows them -------------------------
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
