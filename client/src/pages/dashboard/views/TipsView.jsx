/**
 * The dashboard's Guides view: wger exercises ranked for the visitor, a
 * training guide, and the full exercise list, each exercise savable to the
 * plan. Rendered by DashboardPage, which loads it lazily.
 */
import { useEffect, useMemo, useState } from "react";
import { detectTrack } from "../planUtils";
import ExerciseTile from "../tips/ExerciseTile";
import ExerciseDetailsModal from "../tips/ExerciseDetailsModal";
import {
  normalizeText,
  uniqueList,
  resolveMediaUrl,
  getExerciseImage,
  buildContextCategories,
  buildEquipmentKeywords,
  detectInjuryFlags,
  scoreExercise,
  buildGuideCards
} from "../tips/recommendationUtils";
import "./TipsView.css";

const DEFAULT_LIMIT = 48;
const SEARCH_DEBOUNCE_MS = 320;
const LIBRARY_PAGE_SIZE = 24;

/**
 * Three sections, picked by the View select: smart picks (the loaded exercises
 * scored by recommendationUtils against the goal track, the planner's
 * equipment, today's plan lines, the weather and any injury note), a training
 * guide (buildGuideCards), and the exercise list. The search
 * and filters drive the one exercise load both lists share. An injury note is
 * the planner form's injuries plus the profile's notes. `onSaveExerciseToPlan`
 * is saveExerciseToPlan in events.js, which resolves to `{ ok: true }` or
 * `{ ok: false, error }`.
 */
export default function TipsView({
  user,
  form,
  dashboard,
  latestPlanByWeekday,
  weatherData,
  onSaveExerciseToPlan
}) {
  // ---- State ----------------------------------------------------------------
  const [meta, setMeta] = useState({ categories: [], muscles: [], equipment: [] });
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
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
  const [libraryVisibleCount, setLibraryVisibleCount] = useState(LIBRARY_PAGE_SIZE);

  // ---- Loading the filters and the exercises --------------------------------

  // The search reaches the exercise load only once typing pauses, so a query is
  // not one request per keystroke.
  useEffect(() => {
    const timerId = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timerId);
  }, [query]);

  // Whatever reloads the exercises below, a search, a filter or a refresh, also
  // takes the list back to its first page.
  useEffect(() => {
    setLibraryVisibleCount(LIBRARY_PAGE_SIZE);
  }, [debouncedQuery, categoryId, muscleId, equipmentId, refreshTick]);

  // The filter options load on mount and again on each refresh. A response that
  // lands after this run's cleanup is dropped.
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

  // The exercises load on mount and again whenever the search, a filter or the
  // refresh changes; the cleanup aborts a request that has been superseded.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const loadExercises = async () => {
      setLibraryLoading(true);
      setLibraryError("");
      try {
        // The first page, in wger's language 2 (English) whatever the server's
        // WGER_DEFAULT_LANGUAGE, plus whichever filters are set.
        const params = new URLSearchParams({
          limit: String(DEFAULT_LIMIT),
          offset: "0",
          language: "2"
        });
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (categoryId) params.set("category", categoryId);
        if (muscleId) params.set("muscle", muscleId);
        if (equipmentId) params.set("equipment", equipmentId);

        const res = await fetch(`/api/wger/exercises?${params.toString()}`, {
          credentials: "include",
          signal: controller.signal
        });
        if (!res.ok) {
          throw new Error("Couldn't load exercises right now.");
        }
        const data = await res.json();
        if (cancelled) return;
        setExercises(Array.isArray(data?.exercises) ? data.exercises : []);
      } catch (err) {
        // An abort is this effect's own cleanup, not a failure. A real failure
        // empties the list and shows its error.
        if (err?.name === "AbortError") return;
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
      controller.abort();
    };
  }, [debouncedQuery, categoryId, muscleId, equipmentId, refreshTick]);

  // ---- Ranking and the training guide ---------------------------------------
  const todayWeekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  // Memoized because the `|| []` fallback would otherwise be a new array every
  // render, defeating the memo below.
  const todayLines = useMemo(
    () => latestPlanByWeekday?.[todayWeekday] || [],
    [latestPlanByWeekday, todayWeekday]
  );
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

  // The highest-scoring exercises, ties broken by name.
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

  // ---- Saving ---------------------------------------------------------------

  // Memoized because the `: []` fallback would otherwise be a new array every
  // render, defeating the memo below.
  const savedExercises = useMemo(
    () => (Array.isArray(dashboard?.savedExercises) ? dashboard.savedExercises : []),
    [dashboard]
  );
  const visibleLibraryExercises = useMemo(
    () => exercises.slice(0, libraryVisibleCount),
    [exercises, libraryVisibleCount]
  );
  // An exercise counts as saved when the bank holds one with the same wger id
  // and name; toExerciseKey builds the same key from a loaded exercise.
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
  const showExerciseFilters = activeGuideSection === "smart" || activeGuideSection === "library";

  // ---- Render ---------------------------------------------------------------
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

      {/* ---- Section picker, search and filters ---- */}
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

      {/* ---- Loading, errors and save feedback ---- */}
      {(metaLoading || libraryLoading) && (
        <div className="tips-skeleton-grid" aria-hidden="true">
          <div className="tips-skeleton-card" />
          <div className="tips-skeleton-card" />
          <div className="tips-skeleton-card" />
        </div>
      )}
      {metaError && <p className="error">{metaError}</p>}
      {libraryError && <p className="error">{libraryError}</p>}
      {saveError && <p className="error">{saveError}</p>}
      {saveFeedback && <p className="muted save-feedback">{saveFeedback}</p>}

      {/* ---- Smart picks ---- */}
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
              const key = toExerciseKey(exercise);
              const saved = isSaved(exercise);
              const isSaving = Boolean(savingIds[key]);
              return (
                <ExerciseTile
                  key={`smart-${exercise.id}`}
                  exercise={exercise}
                  recommendation={entry}
                  onOpen={openExerciseModal}
                  onSave={saveExercise}
                  saved={saved}
                  isSaving={isSaving}
                />
              );
            })}
            {!recommendations.length && (
              <p className="muted">No exercises available for current filters.</p>
            )}
          </div>
        </section>
      )}

      {/* ---- Training guide ---- */}
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
              <article key={card.title} className="training-card card-shell">
                <div className="card-section-head">
                  <h4>{card.title}</h4>
                </div>
                <div className="card-section-body">
                  <p>{card.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---- Exercise list ---- */}
      {activeGuideSection === "library" && (
        <section className="tips-block">
          <div className="tips-block-header">
            <h3>Exercise list</h3>
            <p className="muted">Browse and open any movement for details, cues, and videos.</p>
          </div>
          <div className="exercise-grid">
            {visibleLibraryExercises.map((exercise) => {
              const key = toExerciseKey(exercise);
              const saved = isSaved(exercise);
              const isSaving = Boolean(savingIds[key]);
              return (
                <ExerciseTile
                  key={`library-${exercise.id}`}
                  exercise={exercise}
                  onOpen={openExerciseModal}
                  onSave={saveExercise}
                  saved={saved}
                  isSaving={isSaving}
                />
              );
            })}
            {!exercises.length && !libraryLoading && (
              <p className="muted">No exercises match these filters.</p>
            )}
          </div>
          {exercises.length > libraryVisibleCount && (
            <button
              type="button"
              className="ghost"
              onClick={() => setLibraryVisibleCount((prev) => prev + LIBRARY_PAGE_SIZE)}
            >
              Show more exercises
            </button>
          )}
        </section>
      )}

      {/* ---- Exercise details ---- */}
      <ExerciseDetailsModal
        selectedExercise={selectedExercise}
        onClose={() => setSelectedExercise(null)}
        onSave={saveExercise}
        isSaved={Boolean(selectedExercise && isSaved(selectedExercise))}
        isSaving={Boolean(selectedExercise && savingIds[toExerciseKey(selectedExercise)])}
      />
    </section>
  );
}
