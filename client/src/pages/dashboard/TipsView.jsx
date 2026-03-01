import { useEffect, useMemo, useState } from "react";
import { detectTrack } from "./planUtils";
import ModalPortal from "../../components/ModalPortal";
import "./TipsView.css";

const DEFAULT_LIMIT = 48;

const normalizeText = (value) =>
  typeof value === "string" ? value.toLowerCase().trim() : "";

const uniqueList = (items) => [...new Set(items.filter(Boolean))];

const resolveMediaUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return `https://wger.de${url}`;
  return url;
};

const getExerciseImage = (exercise) => {
  const images = Array.isArray(exercise?.images) ? exercise.images : [];
  const mainImage = images.find((item) => item?.isMain && item?.url);
  const fallback = mainImage?.url || images[0]?.url;
  const resolved = resolveMediaUrl(fallback);
  if (resolved) return resolved;
  return `https://placehold.co/640x420?text=${encodeURIComponent(exercise?.name || "Exercise")}`;
};

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

const buildContextCategories = ({ track, goalText, todayLines }) => {
  const categories = [...(trackCategoryMap[track] || trackCategoryMap.lean_strength)];
  const sourceText = normalizeText(`${goalText} ${todayLines.join(" ")}`);
  for (const rule of keywordCategoryMap) {
    if (sourceText.includes(rule.keyword)) categories.push(...rule.categories);
  }
  return uniqueList(categories);
};

const buildEquipmentKeywords = ({ form }) => {
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

const detectInjuryFlags = (injuryText) => {
  const source = normalizeText(injuryText);
  const active = [];
  for (const [injury, keywords] of Object.entries(injuryKeywordRules)) {
    if (source.includes(injury)) active.push({ injury, keywords });
  }
  return active;
};

const scoreExercise = (exercise, context) => {
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

const buildGuideCards = ({
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

export default function TipsView({
  user,
  form,
  dashboard,
  latestPlanByWeekday,
  weatherData,
  onSaveExerciseToPlan
}) {
  const [meta, setMeta] = useState({ categories: [], muscles: [], equipment: [] });
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [muscleId, setMuscleId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState("");
  const [exercises, setExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [saveFeedback, setSaveFeedback] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savingIds, setSavingIds] = useState({});
  const [activeGuideSection, setActiveGuideSection] = useState("smart");

  useEffect(() => {
    let cancelled = false;
    const loadMeta = async () => {
      setMetaLoading(true);
      setMetaError("");
      try {
        const res = await fetch("/api/wger/meta", { credentials: "include" });
        if (!res.ok) {
          throw new Error("Couldn't load filter options.");
        }
        const data = await res.json();
        if (cancelled) return;
        setMeta({
          categories: Array.isArray(data?.categories) ? data.categories : [],
          muscles: Array.isArray(data?.muscles) ? data.muscles : [],
          equipment: Array.isArray(data?.equipment) ? data.equipment : []
        });
      } catch (err) {
        if (cancelled) return;
        setMetaError(err?.message || "Couldn't load filter options.");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    };
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  useEffect(() => {
    let cancelled = false;
    const loadExercises = async () => {
      setLibraryLoading(true);
      setLibraryError("");
      try {
        const params = new URLSearchParams({
          limit: String(DEFAULT_LIMIT),
          offset: "0",
          language: "2"
        });
        if (query.trim()) params.set("q", query.trim());
        if (categoryId) params.set("category", categoryId);
        if (muscleId) params.set("muscle", muscleId);
        if (equipmentId) params.set("equipment", equipmentId);

        const res = await fetch(`/api/wger/exercises?${params.toString()}`, {
          credentials: "include"
        });
        if (!res.ok) {
          throw new Error("Couldn't load exercises right now.");
        }
        const data = await res.json();
        if (cancelled) return;
        setExercises(Array.isArray(data?.exercises) ? data.exercises : []);
      } catch (err) {
        if (cancelled) return;
        setLibraryError(err?.message || "Couldn't load exercises right now.");
        setExercises([]);
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    };
    loadExercises();
    return () => {
      cancelled = true;
    };
  }, [query, categoryId, muscleId, equipmentId, refreshTick]);

  const todayWeekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const todayLines = latestPlanByWeekday?.[todayWeekday] || [];
  const goalText =
    dashboard?.plans?.[0]?.goal ||
    dashboard?.goals?.goalType ||
    form?.goal ||
    "Build lean strength and energy";
  const injuryText = `${form?.injuries || ""} ${user?.profile?.notes || ""}`.trim();
  const weatherMode = weatherData?.recommendation?.workoutType || "";
  const track = detectTrack(goalText);
  const weeklyWorkouts = Number(dashboard?.goals?.weeklyWorkouts || form?.days || 3);
  const duration = Number(form?.duration || 45);
  const activity = user?.profile?.activity || "Moderate";

  const recommendationContext = useMemo(() => {
    const preferredCategories = buildContextCategories({
      track,
      goalText,
      todayLines
    });
    const equipmentKeywords = buildEquipmentKeywords({ form });
    const goalTokens = uniqueList(normalizeText(goalText).split(/[^a-z0-9]+/));
    const todayTokens = uniqueList(normalizeText(todayLines.join(" ")).split(/[^a-z0-9]+/));
    const injuryFlags = detectInjuryFlags(injuryText);
    return {
      preferredCategories,
      equipmentKeywords,
      goalTokens,
      todayTokens,
      injuryFlags,
      weatherMode,
      homeMode: normalizeText(form?.environment) === "home"
    };
  }, [track, goalText, todayLines, form, injuryText, weatherMode]);

  const recommendations = useMemo(() => {
    const scored = exercises.map((exercise) => scoreExercise(exercise, recommendationContext));
    scored.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
    return scored.slice(0, 12);
  }, [exercises, recommendationContext]);

  const guideCards = useMemo(
    () =>
      buildGuideCards({
        track,
        weeklyWorkouts,
        duration,
        activity,
        weatherMode,
        injuryText
      }),
    [track, weeklyWorkouts, duration, activity, weatherMode, injuryText]
  );

  const savedExercises = Array.isArray(dashboard?.savedExercises)
    ? dashboard.savedExercises
    : [];
  const savedKeys = useMemo(() => {
    return new Set(
      savedExercises.map((item) => {
        const idPart =
          item?.exerciseId !== null && item?.exerciseId !== undefined
            ? `id:${item.exerciseId}`
            : "";
        const namePart = normalizeText(item?.name);
        return `${idPart}|${namePart}`;
      })
    );
  }, [savedExercises]);

  const toExerciseKey = (exercise) =>
    `${exercise?.id !== null && exercise?.id !== undefined ? `id:${exercise.id}` : ""}|${normalizeText(exercise?.name)}`;

  const isSaved = (exercise) => savedKeys.has(toExerciseKey(exercise));

  const buildSavePayload = (exercise, recommendation) => ({
    exerciseId: exercise?.id ?? null,
    name: exercise?.name || "",
    category: exercise?.category?.name || "",
    muscles: Array.isArray(exercise?.muscles) ? exercise.muscles.map((item) => item?.name) : [],
    equipment: Array.isArray(exercise?.equipment)
      ? exercise.equipment.map((item) => item?.name)
      : [],
    imageUrl: getExerciseImage(exercise),
    videoUrl: resolveMediaUrl(exercise?.videos?.[0]?.url || ""),
    reason: recommendation?.reasons?.[0] || ""
  });

  const saveExercise = async (exercise, recommendation) => {
    if (!onSaveExerciseToPlan) return;
    const key = toExerciseKey(exercise);
    if (isSaved(exercise)) {
      setSaveFeedback(`"${exercise?.name}" is already saved.`);
      setSaveError("");
      return;
    }

    setSaveFeedback("");
    setSaveError("");
    setSavingIds((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await onSaveExerciseToPlan(buildSavePayload(exercise, recommendation));
      if (!result?.ok) {
        throw new Error(result?.error || "Couldn't save this exercise right now.");
      }
      setSaveFeedback(`Saved "${exercise?.name}" to your plan.`);
    } catch (err) {
      setSaveError(err?.message || "Couldn't save this exercise right now.");
    } finally {
      setSavingIds((prev) => ({ ...prev, [key]: false }));
    }
  };

  const openExerciseModal = (payload) => {
    setSelectedExercise(payload);
  };
  const showExerciseFilters =
    activeGuideSection === "smart" || activeGuideSection === "library";

  return (
    <section className="panel tips-view">
      <div className="panel-header">
        <div>
          <h2>Guides + exercise ideas</h2>
          <p className="muted">
            Personalized suggestions based on your plan, equipment, weather, and injury notes.
          </p>
        </div>
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => setRefreshTick((value) => value + 1)}
          aria-label="Refresh exercise ideas"
          title="Refresh ideas"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path
              d="M21 12a9 9 0 1 1-2.64-6.36"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M21 3v6h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <section className="tips-section-selector">
        <label>
          View
          <select
            value={activeGuideSection}
            onChange={(event) => setActiveGuideSection(event.target.value)}
          >
            <option value="smart">Smart picks</option>
            <option value="guides">Training guide</option>
            <option value="library">Exercise list</option>
          </select>
        </label>
      </section>

      {showExerciseFilters && (
        <section className="tips-filters">
          <label>
            Search
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. row, squat, plank"
            />
          </label>
          <label>
            Category
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {meta.categories.map((item) => (
                <option key={`category-${item.id}`} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Muscle
            <select value={muscleId} onChange={(event) => setMuscleId(event.target.value)}>
              <option value="">All muscles</option>
              {meta.muscles.map((item) => (
                <option key={`muscle-${item.id}`} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Equipment
            <select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}>
              <option value="">All equipment</option>
              {meta.equipment.map((item) => (
                <option key={`equipment-${item.id}`} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {(metaLoading || libraryLoading) && <p className="muted">Loading exercise options...</p>}
      {metaError && <p className="error">{metaError}</p>}
      {libraryError && <p className="error">{libraryError}</p>}
      {saveError && <p className="error">{saveError}</p>}
      {saveFeedback && <p className="muted save-feedback">{saveFeedback}</p>}

      {activeGuideSection === "smart" && (
        <section className="tips-block">
          <div className="tips-block-header">
            <h3>Smart picks for you</h3>
            <p className="muted">
              Suggestions are sorted by your goal track ({track.replace("_", " ")}), available
              equipment, and today&apos;s training focus.
            </p>
          </div>
          <div className="exercise-grid">
            {recommendations.map((entry) => {
              const exercise = entry.exercise;
              const imageUrl = getExerciseImage(exercise);
              const equipmentText = (exercise.equipment || [])
                .map((item) => item?.name)
                .filter(Boolean)
                .slice(0, 2)
                .join(", ");
              const key = toExerciseKey(exercise);
              const saved = isSaved(exercise);
              const isSaving = Boolean(savingIds[key]);
              return (
                <article key={`smart-${exercise.id}`} className="exercise-tile">
                  <button
                    type="button"
                    className="exercise-tile-open"
                    onClick={() => openExerciseModal({ ...exercise, recommendation: entry })}
                  >
                    <img src={imageUrl} alt={exercise.name} loading="lazy" />
                    <div className="exercise-tile-meta">
                      <p className="exercise-group">{exercise.category?.name || "Exercise"}</p>
                      <h3>{exercise.name}</h3>
                      <p className="muted">{equipmentText || "Equipment details unavailable"}</p>
                      <p className="muted">{entry.reasons[0]}</p>
                    </div>
                  </button>
                  <div className="exercise-tile-actions">
                    <button
                      type="button"
                      className="ghost save-chip"
                      disabled={saved || isSaving}
                      onClick={() => saveExercise(exercise, entry)}
                    >
                      {saved ? "Saved" : isSaving ? "Saving..." : "Save to plan"}
                    </button>
                  </div>
                </article>
              );
            })}
            {!recommendations.length && (
              <p className="muted">No exercises available for current filters.</p>
            )}
          </div>
        </section>
      )}

      {activeGuideSection === "guides" && (
        <section className="tips-block">
          <div className="tips-block-header">
            <h3>Training guide upgrades</h3>
            <p className="muted">
              Straightforward planning cues based on your weekly settings and current conditions.
            </p>
          </div>
          <div className="training-guide-grid">
            {guideCards.map((card) => (
              <article key={card.title} className="training-card">
                <h4>{card.title}</h4>
                <p>{card.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeGuideSection === "library" && (
        <section className="tips-block">
          <div className="tips-block-header">
            <h3>Exercise list</h3>
            <p className="muted">Browse and open any movement for details, cues, and videos.</p>
          </div>
          <div className="exercise-grid">
            {exercises.map((exercise) => {
              const imageUrl = getExerciseImage(exercise);
              const equipmentText = (exercise.equipment || [])
                .map((item) => item?.name)
                .filter(Boolean)
                .slice(0, 2)
                .join(", ");
              const key = toExerciseKey(exercise);
              const saved = isSaved(exercise);
              const isSaving = Boolean(savingIds[key]);
              return (
                <article key={`library-${exercise.id}`} className="exercise-tile">
                  <button
                    type="button"
                    className="exercise-tile-open"
                    onClick={() => openExerciseModal(exercise)}
                  >
                    <img src={imageUrl} alt={exercise.name} loading="lazy" />
                    <div className="exercise-tile-meta">
                      <p className="exercise-group">{exercise.category?.name || "Exercise"}</p>
                      <h3>{exercise.name}</h3>
                      <p className="muted">{equipmentText || "Equipment details unavailable"}</p>
                    </div>
                  </button>
                  <div className="exercise-tile-actions">
                    <button
                      type="button"
                      className="ghost save-chip"
                      disabled={saved || isSaving}
                      onClick={() => saveExercise(exercise)}
                    >
                      {saved ? "Saved" : isSaving ? "Saving..." : "Save to plan"}
                    </button>
                  </div>
                </article>
              );
            })}
            {!exercises.length && !libraryLoading && (
              <p className="muted">No exercises match these filters.</p>
            )}
          </div>
        </section>
      )}

      {selectedExercise && (
        <ModalPortal open={Boolean(selectedExercise)}>
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setSelectedExercise(null)}
          >
            <div className="modal exercise-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h3>{selectedExercise.name}</h3>
                <button
                  type="button"
                  className="ghost icon-button"
                  aria-label="Close"
                  onClick={() => setSelectedExercise(null)}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path
                      d="M6 6l12 12M18 6L6 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
              <div className="exercise-modal-content">
                <img
                  className="exercise-modal-image"
                  src={getExerciseImage(selectedExercise)}
                  alt={selectedExercise.name}
                />
                <div className="exercise-modal-body">
                  <p className="exercise-target">
                    <strong>Category:</strong> {selectedExercise.category?.name || "Unknown"}
                  </p>
                  <p className="exercise-focus">
                    <strong>Primary muscles:</strong>{" "}
                    {(selectedExercise.muscles || [])
                      .map((item) => item.name)
                      .filter(Boolean)
                      .slice(0, 4)
                      .join(", ") || "Not specified"}
                  </p>
                  <p className="exercise-focus">
                    <strong>Equipment:</strong>{" "}
                    {(selectedExercise.equipment || [])
                      .map((item) => item.name)
                      .filter(Boolean)
                      .join(", ") || "Not specified"}
                  </p>
                  <div className="tips-save-actions">
                    <button
                      type="button"
                      className="cta save-modal-button"
                      disabled={
                        isSaved(selectedExercise) ||
                        Boolean(savingIds[toExerciseKey(selectedExercise)])
                      }
                      onClick={() =>
                        saveExercise(selectedExercise, selectedExercise?.recommendation)
                      }
                    >
                      {isSaved(selectedExercise)
                        ? "Saved to plan"
                        : savingIds[toExerciseKey(selectedExercise)]
                        ? "Saving..."
                        : "Save to my plan"}
                    </button>
                  </div>
                  {selectedExercise.description ? (
                    <p className="exercise-what">{selectedExercise.description}</p>
                  ) : (
                    <p className="muted">No description provided for this exercise.</p>
                  )}

                  {selectedExercise?.recommendation?.reasons?.length ? (
                    <section className="exercise-details-open">
                      <h4>Why this was recommended</h4>
                      <ul>
                        {selectedExercise.recommendation.reasons.map((reason) => (
                          <li key={`${selectedExercise.id}-${reason}`}>{reason}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {(selectedExercise.videos || []).length ? (
                    <div className="video-links">
                      {(selectedExercise.videos || []).slice(0, 2).map((item) => (
                        <a
                          key={`${selectedExercise.id}-video-${item.id || item.url}`}
                          href={resolveMediaUrl(item.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="video-link"
                        >
                          Watch reference video
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No video links available for this exercise.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </section>
  );
}

