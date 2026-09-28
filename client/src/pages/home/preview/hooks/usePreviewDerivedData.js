import { useMemo, useRef } from "react";
import {
  IMPERIAL_REGION_CODES,
  JOHN_DOE_PREVIEW_PROFILE,
  PREVIEW_WEEK_DAY_ORDER,
  PREVIEW_WEEK_MIN_WORKOUT_DAYS
} from "../constants";
import {
  normalizePreviewTrainingDay,
  getRegionFromLocale,
  clamp,
  roundTo,
  getPreviewWeekdayName
} from "../utils";

export default function usePreviewDerivedData({
  personal,
  form,
  weightUnit,
  toFeetInchesFromCm,
  toLb,
  resolvedHeightCm,
  resolvedWeightKg,
  effectiveBodyFat,
  previewStepIndex,
  previewWeekStage,
  previewWeekHeaderTypingProgress,
  previewWeekTypingProgress
}) {
  const usesImperialUnits = useMemo(() => {
    const previewLocale = (() => {
      if (typeof navigator === "undefined") return "en-US";
      if (Array.isArray(navigator.languages) && navigator.languages.length) {
        return navigator.languages[0] || navigator.language || "en-US";
      }
      return navigator.language || "en-US";
    })();
    const previewRegion = (() => {
      const localeRegion = getRegionFromLocale(previewLocale);
      if (localeRegion) return localeRegion;
      try {
        const intlLocale = new Intl.DateTimeFormat().resolvedOptions().locale;
        const intlRegion = getRegionFromLocale(intlLocale);
        if (intlRegion) return intlRegion;
      } catch {
        return "US";
      }
      return "US";
    })();
    return IMPERIAL_REGION_CODES.has(previewRegion);
  }, []);

  const inferredTrainingDayCount =
    Array.isArray(personal.trainingDays) && personal.trainingDays.length
      ? String(personal.trainingDays.length)
      : "";

  const activePreviewProfile = useMemo(
    () => ({
      ...JOHN_DOE_PREVIEW_PROFILE,
      name: personal.name?.trim() || JOHN_DOE_PREVIEW_PROFILE.name,
      age: personal.age || JOHN_DOE_PREVIEW_PROFILE.age,
      sex: personal.sex || JOHN_DOE_PREVIEW_PROFILE.sex,
      heightCm: resolvedHeightCm ?? JOHN_DOE_PREVIEW_PROFILE.heightCm,
      weightKg: resolvedWeightKg ?? JOHN_DOE_PREVIEW_PROFILE.weightKg,
      bodyFat: effectiveBodyFat ?? JOHN_DOE_PREVIEW_PROFILE.bodyFat,
      activity: personal.activity || JOHN_DOE_PREVIEW_PROFILE.activity,
      sleep: personal.sleep || JOHN_DOE_PREVIEW_PROFILE.sleep,
      timeline: personal.timeline || JOHN_DOE_PREVIEW_PROFILE.timeline,
      experience: personal.experience || JOHN_DOE_PREVIEW_PROFILE.experience,
      nutrition: personal.nutrition || JOHN_DOE_PREVIEW_PROFILE.nutrition,
      cardio: personal.cardio || JOHN_DOE_PREVIEW_PROFILE.cardio,
      trainingDays:
        Array.isArray(personal.trainingDays) && personal.trainingDays.length
          ? personal.trainingDays
          : JOHN_DOE_PREVIEW_PROFILE.trainingDays,
      notes: personal.notes || JOHN_DOE_PREVIEW_PROFILE.notes,
      goal: form.goal || JOHN_DOE_PREVIEW_PROFILE.goal,
      days: form.days || inferredTrainingDayCount || JOHN_DOE_PREVIEW_PROFILE.days,
      duration: form.duration || JOHN_DOE_PREVIEW_PROFILE.duration,
      environment: form.environment || JOHN_DOE_PREVIEW_PROFILE.environment,
      equipment:
        Array.isArray(form.equipment) && form.equipment.length
          ? form.equipment
          : JOHN_DOE_PREVIEW_PROFILE.equipment,
      focuses:
        Array.isArray(form.focuses) && form.focuses.length
          ? form.focuses
          : JOHN_DOE_PREVIEW_PROFILE.focuses
    }),
    [effectiveBodyFat, form, inferredTrainingDayCount, personal, resolvedHeightCm, resolvedWeightKg]
  );

  const activeHeightCm =
    Number(activePreviewProfile.heightCm) > 0 ? Number(activePreviewProfile.heightCm) : 175;
  const activeWeightKg =
    Number(activePreviewProfile.weightKg) > 0 ? Number(activePreviewProfile.weightKg) : 72;
  const previewBmi = Number((activeWeightKg / (activeHeightCm / 100) ** 2).toFixed(1));
  const previewBodyFat = Number.isFinite(Number(activePreviewProfile.bodyFat))
    ? roundTo(clamp(Number(activePreviewProfile.bodyFat), 3, 60), 1)
    : roundTo(clamp(1.35 * previewBmi - 13.5, 3, 60), 1);

  const previewHeightSplit = toFeetInchesFromCm(String(Math.round(activeHeightCm)));
  const previewHeightFeet = previewHeightSplit?.feet || "5";
  const previewHeightInches = previewHeightSplit?.inches || "9";
  const defaultHeightCm = String(Math.round(activeHeightCm));
  const previewHeightCmValue = String(personal.heightCm ?? "").trim() || defaultHeightCm;
  const previewHeightFeetValue =
    String(personal.heightFeet ?? "").trim() || String(previewHeightFeet);
  const previewHeightInchesValue =
    String(personal.heightInches ?? "").trim() || String(previewHeightInches);
  const previewWeightValue = (() => {
    const typedWeight = String(personal.weight ?? "").trim();
    if (typedWeight) return typedWeight;
    if (weightUnit === "kg") return String(Math.round(activeWeightKg));
    const pounds = Number(toLb(String(Math.round(activeWeightKg)), "kg"));
    return Number.isFinite(pounds) ? String(Math.round(pounds)) : "160";
  })();
  const defaultName = activePreviewProfile.name;
  const defaultAge = activePreviewProfile.age;
  const defaultSex = activePreviewProfile.sex;

  const previewWeekPlan = useMemo(() => {
    // No re-guard: activePreviewProfile already resolved this to a non-empty
    // array, falling back to the sample profile if the visitor supplied none.
    const sourceTrainingDaysRaw = activePreviewProfile.trainingDays;
    const trainingDaysSet = new Set(
      sourceTrainingDaysRaw.map((day) => normalizePreviewTrainingDay(day)).filter(Boolean)
    );
    const requestedWorkoutDays = Number(activePreviewProfile.days);
    const targetWorkoutDays = clamp(
      Math.max(
        trainingDaysSet.size,
        Number.isFinite(requestedWorkoutDays) ? Math.round(requestedWorkoutDays) : 0,
        PREVIEW_WEEK_MIN_WORKOUT_DAYS
      ),
      1,
      PREVIEW_WEEK_DAY_ORDER.length
    );
    if (trainingDaysSet.size < targetWorkoutDays) {
      for (const day of PREVIEW_WEEK_DAY_ORDER) {
        if (trainingDaysSet.has(day)) continue;
        trainingDaysSet.add(day);
        if (trainingDaysSet.size >= targetWorkoutDays) break;
      }
    }
    const sourceFocuses = activePreviewProfile.focuses;
    const sessionDuration =
      Number(activePreviewProfile.duration) > 0
        ? `${Number(activePreviewProfile.duration)} min`
        : `${Number(JOHN_DOE_PREVIEW_PROFILE.duration)} min`;
    const environmentLabel = String(activePreviewProfile.environment);
    const trainingTemplates = [
      "Upper Strength",
      "Lower Strength",
      "Conditioning",
      "Pull + Core",
      "Power + Stability",
      "Full Body Session"
    ];
    const trainingExerciseTemplates = [
      "Bench Press - Incline DB Press - Cable Row",
      "Back Squat - Romanian Deadlift - Walking Lunge",
      "Bike Intervals - Kettlebell Swings - Burpees",
      "Pull-ups - Seated Row - Hanging Knee Raise",
      "Trap Bar Deadlift - Push Press - Sled Push",
      "Front Squat - DB Bench Press - Lat Pulldown"
    ];
    let trainingIndex = 0;

    return PREVIEW_WEEK_DAY_ORDER.map((day) => {
      const isTrainingDay = trainingDaysSet.has(day);
      if (!isTrainingDay) {
        return {
          day,
          session: "Active Recovery",
          workout: "Zone 2 walk - Mobility flow - Stretching",
          meta: "20-30 min - Mobility",
          highlights: ["Zone 2 walk", "Stretch + mobility", "Recovery check-in"],
          isTraining: false
        };
      }

      const templateIndex = trainingIndex % trainingTemplates.length;
      const session = trainingTemplates[templateIndex];
      const workout = trainingExerciseTemplates[templateIndex];
      const focus = String(sourceFocuses[trainingIndex % sourceFocuses.length] || "Strength");
      trainingIndex += 1;
      return {
        day,
        session,
        workout,
        meta: `${sessionDuration} - ${environmentLabel}`,
        highlights: [`${focus} emphasis`, "Main lift + accessories", "Cooldown + notes"],
        isTraining: true
      };
    });
  }, [
    activePreviewProfile.trainingDays,
    activePreviewProfile.days,
    activePreviewProfile.focuses,
    activePreviewProfile.duration,
    activePreviewProfile.environment
  ]);

  const previewDashboardSummary = useMemo(() => {
    const trainingDays = previewWeekPlan.filter((item) => item.isTraining);
    const requestedGoalDays = Number(activePreviewProfile.days);
    const weeklyGoal = clamp(
      Number.isFinite(requestedGoalDays) ? Math.round(requestedGoalDays) : trainingDays.length || 4,
      1,
      PREVIEW_WEEK_DAY_ORDER.length
    );
    const completedWorkouts = clamp(trainingDays.length, 0, weeklyGoal);
    const workoutProgress = clamp(
      Math.round((completedWorkouts / Math.max(weeklyGoal, 1)) * 100),
      0,
      100
    );

    const calorieGoal = clamp(Math.round(activeWeightKg * 30 + weeklyGoal * 18), 1700, 3400);
    const avgCalories = clamp(
      Math.round(calorieGoal * (0.92 + (workoutProgress / 100) * 0.06)),
      1500,
      3600
    );
    const calorieProgress = clamp(
      Math.round((avgCalories / Math.max(calorieGoal, 1)) * 100),
      0,
      100
    );
    const calorieDelta = Math.round(avgCalories - calorieGoal);

    const goalText = String(activePreviewProfile.goal);
    const goalTokens = goalText.toLowerCase();
    const targetWeightKg = (() => {
      if (/lose|cut|fat/.test(goalTokens)) return Math.max(activeWeightKg - 3.5, 45);
      if (/gain|bulk|mass/.test(goalTokens)) return activeWeightKg + 2.2;
      return Math.max(activeWeightKg - 1.2, 45);
    })();
    const targetWeightLabel = usesImperialUnits
      ? `${Math.round(Number(toLb(String(roundTo(targetWeightKg, 1)), "kg")))} lb`
      : `${Math.round(targetWeightKg)} kg`;

    const todayName = getPreviewWeekdayName(new Date());
    const todayPlan = previewWeekPlan.find((item) => item.day === todayName) || previewWeekPlan[0];
    const todayWorkoutLines = String(todayPlan?.workout || "")
      .split(" - ")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);
    const todayDuration = String(todayPlan?.meta || "50 min")
      .split(" - ")[0]
      .trim();

    const todayIndex = Math.max(0, PREVIEW_WEEK_DAY_ORDER.indexOf(todayPlan?.day || todayName));
    let nextTrainingPlan = null;
    for (let offset = 1; offset <= PREVIEW_WEEK_DAY_ORDER.length; offset += 1) {
      const nextIndex = (todayIndex + offset) % PREVIEW_WEEK_DAY_ORDER.length;
      const candidate = previewWeekPlan[nextIndex];
      if (candidate?.isTraining) {
        nextTrainingPlan = candidate;
        break;
      }
    }
    if (!nextTrainingPlan) nextTrainingPlan = trainingDays[0] || previewWeekPlan[0];

    const calorieSeries = previewWeekPlan.map((dayPlan, index) => {
      const base = dayPlan.isTraining ? calorieGoal * 1.02 : calorieGoal * 0.9;
      const wave = Math.sin((index / Math.max(previewWeekPlan.length - 1, 1)) * Math.PI * 2) * 70;
      return Math.max(1200, Math.round(base + wave));
    });
    const workoutSeries = previewWeekPlan.map((dayPlan) => (dayPlan.isTraining ? 1 : 0));
    const recoverySeries = previewWeekPlan.map((dayPlan, index) => {
      const loadPenalty = dayPlan.isTraining ? 18 : 3;
      const wave = Math.cos((index / Math.max(previewWeekPlan.length - 1, 1)) * Math.PI * 2) * 6;
      return Math.round(clamp(82 - loadPenalty + wave, 45, 95));
    });
    const activeDays = workoutSeries.filter((value) => value > 0).length;
    const avgRecovery = Math.round(
      recoverySeries.reduce((sum, value) => sum + value, 0) / Math.max(recoverySeries.length, 1)
    );
    const trendStartLabel = PREVIEW_WEEK_DAY_ORDER[0].slice(0, 3);
    const trendEndLabel = PREVIEW_WEEK_DAY_ORDER[PREVIEW_WEEK_DAY_ORDER.length - 1].slice(0, 3);

    let runningStreak = 0;
    let bestStreak = 0;
    previewWeekPlan.forEach((dayPlan) => {
      if (dayPlan.isTraining) {
        runningStreak += 1;
        bestStreak = Math.max(bestStreak, runningStreak);
      } else {
        runningStreak = 0;
      }
    });
    const streakDays = Math.max(1, Math.min(bestStreak || completedWorkouts || 1, weeklyGoal));

    const recentActivity = trainingDays.slice(0, 4).map((dayPlan) => ({
      day: dayPlan.day,
      session: dayPlan.session,
      duration: String(dayPlan.meta || "50 min")
        .split(" - ")[0]
        .trim()
    }));
    const focusPicks = activePreviewProfile.focuses.slice(0, 3);
    const environmentText = String(activePreviewProfile.environment);
    const equipmentList = activePreviewProfile.equipment.slice(0, 3);
    const scheduleText = `${weeklyGoal} days - ${Number(activePreviewProfile.duration) || 50} min`;
    const avgDailyWorkouts = completedWorkouts / 7;
    const remainingWorkouts = Math.max(weeklyGoal - completedWorkouts, 0);
    const daysToGoal =
      avgDailyWorkouts > 0 ? Math.ceil(remainingWorkouts / avgDailyWorkouts) : null;
    const goalPaceText =
      remainingWorkouts === 0
        ? "Weekly workout goal reached."
        : avgDailyWorkouts > 0
          ? `At this pace, ${daysToGoal} day${daysToGoal === 1 ? "" : "s"} to reach ${weeklyGoal} workouts.`
          : "Log a workout to start your pace estimate.";
    const mealPlan = todayPlan?.isTraining
      ? {
          breakfast: "Greek yogurt + oats + berries",
          lunch: "Chicken rice bowl with mixed greens",
          dinner: "Salmon, potato, and vegetables",
          snack: "Protein shake + banana",
          calories: Math.round(calorieGoal * 0.32)
        }
      : {
          breakfast: "Egg scramble + fruit",
          lunch: "Turkey salad wrap",
          dinner: "Lean beef stir fry + veggies",
          snack: "Cottage cheese + nuts",
          calories: Math.round(calorieGoal * 0.27)
        };

    return {
      goalText,
      scheduleText,
      environmentText,
      equipmentList,
      focusPicks,
      todayName,
      todaySession: String(todayPlan?.session || "Training Session"),
      todayDuration,
      todayWorkoutLines,
      todayMealPlan: mealPlan,
      nextTrainingPlan,
      goalPaceText,
      weeklyGoal,
      completedWorkouts,
      workoutProgress,
      avgCalories,
      calorieGoal,
      calorieProgress,
      calorieDelta,
      targetWeightLabel,
      activeDays,
      avgRecovery,
      calorieSeries,
      workoutSeries,
      recoverySeries,
      trendStartLabel,
      trendEndLabel,
      streakDays,
      recentActivity
    };
  }, [
    previewWeekPlan,
    activePreviewProfile.days,
    activePreviewProfile.duration,
    activePreviewProfile.focuses,
    activePreviewProfile.goal,
    activePreviewProfile.environment,
    activePreviewProfile.equipment,
    activeWeightKg,
    usesImperialUnits,
    toLb
  ]);

  const previewPersonalTargets = useMemo(
    () => ({
      name: String(defaultName ?? ""),
      age: String(defaultAge ?? ""),
      heightCm: String(previewHeightCmValue ?? ""),
      heightFeet: String(previewHeightFeetValue ?? ""),
      heightInches: String(previewHeightInchesValue ?? ""),
      weight: String(previewWeightValue ?? ""),
      sex: String(defaultSex ?? ""),
      activity: String(activePreviewProfile.activity ?? ""),
      sleep: String(activePreviewProfile.sleep ?? ""),
      timeline: String(activePreviewProfile.timeline ?? ""),
      experience: String(activePreviewProfile.experience ?? ""),
      nutrition: String(activePreviewProfile.nutrition ?? ""),
      cardio: String(activePreviewProfile.cardio ?? ""),
      notes: String(activePreviewProfile.notes ?? ""),
      trainingDays: Array.isArray(activePreviewProfile.trainingDays)
        ? activePreviewProfile.trainingDays
        : [],
      computedBodyFat: String(previewBodyFat)
    }),
    [
      defaultName,
      defaultAge,
      previewHeightCmValue,
      previewHeightFeetValue,
      previewHeightInchesValue,
      previewWeightValue,
      defaultSex,
      activePreviewProfile.activity,
      activePreviewProfile.sleep,
      activePreviewProfile.timeline,
      activePreviewProfile.experience,
      activePreviewProfile.nutrition,
      activePreviewProfile.cardio,
      activePreviewProfile.notes,
      activePreviewProfile.trainingDays,
      previewBodyFat
    ]
  );

  const previewFillOrder = useMemo(
    () =>
      usesImperialUnits
        ? [
            "name",
            "age",
            "heightFeet",
            "heightInches",
            "weight",
            "sex",
            "activity",
            "sleep",
            "timeline",
            "experience",
            "nutrition",
            "cardio",
            "trainingDays",
            "notes"
          ]
        : [
            "name",
            "age",
            "heightCm",
            "weight",
            "sex",
            "activity",
            "sleep",
            "timeline",
            "experience",
            "nutrition",
            "cardio",
            "trainingDays",
            "notes"
          ],
    [usesImperialUnits]
  );

  const previewInitialTargetsRef = useRef(null);
  const previewInitialFillOrderRef = useRef(null);
  if (!previewInitialTargetsRef.current) {
    previewInitialTargetsRef.current = previewPersonalTargets;
  }
  if (!previewInitialFillOrderRef.current) {
    previewInitialFillOrderRef.current = previewFillOrder;
  }

  // Only the id and the title are read: PreviewPage routes on the id and the
  // table of contents shows the title. Each chapter used to carry a `fields`
  // array of label/value descriptors as well, built from the profile, but the
  // only thing that ever read them was a fallback arm of PreviewPage's router
  // that no chapter id could reach. With that gone the list is static, which is
  // why the dependency array is now empty.
  const previewChapters = useMemo(
    () => [
      { id: "personal-info", title: "Personal Info" },
      { id: "generate", title: "Generate" },
      { id: "workout-week", title: "Result" },
      { id: "dashboard-preview", title: "Dashboard" }
    ],
    []
  );

  const generateChapterIndex = previewChapters.findIndex((chapter) => chapter.id === "generate");
  const workoutWeekChapterIndex = previewChapters.findIndex(
    (chapter) => chapter.id === "workout-week"
  );
  const dashboardPreviewChapterIndex = previewChapters.findIndex(
    (chapter) => chapter.id === "dashboard-preview"
  );

  const activePreviewChapter = previewChapters[previewStepIndex] || previewChapters[0];
  const isCenteredBodyChapter =
    activePreviewChapter.id === "personal-info" ||
    activePreviewChapter.id === "generate" ||
    activePreviewChapter.id === "workout-week";
  const previewMaxChapterTitleLength = previewChapters.reduce(
    (maxLength, chapter) => Math.max(maxLength, chapter.title.length),
    0
  );
  const previewChipExpandedWidth = `calc(${Math.max(14, previewMaxChapterTitleLength)}ch + 2rem)`;
  const previewTitleWidth = `calc(${Math.max(16, previewMaxChapterTitleLength)}ch + 3.8rem)`;
  const previewStageStyle = {
    "--preview-body-width": "clamp(1480px, 99vw, 2140px)",
    "--preview-chip-expanded": previewChipExpandedWidth,
    "--preview-title-width": previewTitleWidth,
    "--preview-body-right-pad": isCenteredBodyChapter
      ? "calc(var(--preview-toc-lane-width) + 8px)"
      : "0px",
    "--preview-step-width-scale": "1.18",
    "--preview-step-card-width-scale": "1.18",
    "--preview-step-toc-reserve-scale": "1"
  };
  const previewTocStyle = {
    "--preview-chip-expanded": previewChipExpandedWidth,
    "--preview-chip-collapsed": "44px"
  };

  const getPreviewTextRows = (value, minRows = 1, maxRows = 4) => {
    const text = String(value ?? "").trim();
    if (!text) return minRows;
    const estimatedRows = Math.ceil(text.length / 30);
    return Math.max(minRows, Math.min(maxRows, estimatedRows));
  };

  const getPreviewWeekHeaderTypedText = (value) => {
    const text = String(value ?? "");
    if (previewWeekStage < 2) return "";
    const progress = previewWeekStage >= 3 ? 1 : previewWeekHeaderTypingProgress;
    if (progress >= 1) return text;
    const typedLength = Math.max(0, Math.ceil(text.length * progress));
    return text.slice(0, typedLength);
  };
  const getPreviewWeekTypedText = (value) => {
    const text = String(value ?? "");
    if (previewWeekStage < 3) return "";
    if (previewWeekTypingProgress >= 1) return text;
    const typedLength = Math.max(0, Math.ceil(text.length * previewWeekTypingProgress));
    return text.slice(0, typedLength);
  };

  return {
    usesImperialUnits,
    activePreviewProfile,
    previewWeekPlan,
    previewDashboardSummary,
    previewPersonalTargets,
    previewFillOrder,
    previewInitialTargetsRef,
    previewInitialFillOrderRef,
    previewChapters,
    generateChapterIndex,
    workoutWeekChapterIndex,
    dashboardPreviewChapterIndex,
    activePreviewChapter,
    previewStageStyle,
    previewTocStyle,
    getPreviewTextRows,
    getPreviewWeekHeaderTypedText,
    getPreviewWeekTypedText
  };
}
