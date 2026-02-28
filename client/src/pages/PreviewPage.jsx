import { createTimeline } from "animejs";
import { useEffect, useMemo, useRef, useState } from "react";
import "./PreviewPage.css";

const IMPERIAL_REGION_CODES = new Set(["US", "LR", "MM"]);
const TRAINING_DAY_OPTIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
const JOHN_DOE_PREVIEW_PROFILE = {
  name: "John Doe",
  age: "31",
  sex: "Male",
  heightCm: 183,
  weightKg: 84,
  bodyFat: 18.4,
  activity: "Moderate",
  sleep: "7 - 8 hours",
  timeline: "12 weeks to build lean strength",
  experience: "Intermediate",
  nutrition: "High-protein",
  cardio: "Mixed",
  trainingDays: ["Monday", "Tuesday", "Thursday", "Saturday"],
  notes: "Minor left-knee sensitivity during deep squats.",
  goal: "Build lean strength and energy",
  days: "4",
  duration: "50",
  environment: "Commercial",
  equipment: ["Barbell + plates", "Cable machine", "Cardio machines"],
  focuses: ["Strength", "Conditioning", "Core"],
  personalComplete: true
};
const PREVIEW_INSTANT_FIELDS = new Set([
  "sex",
  "activity",
  "sleep",
  "experience",
  "nutrition",
  "cardio"
]);
const PREVIEW_TYPING_MIN_MS = 22;
const PREVIEW_TYPING_MAX_MS = 58;
const PREVIEW_TRAINING_DAY_STEP_MS = 110;
const PREVIEW_COLLAPSE_DELAY_MS = 480;
const PREVIEW_MOTION_DURATION_MS = 1100;
const PREVIEW_MORPH_DURATION_MS = PREVIEW_MOTION_DURATION_MS;
const PREVIEW_POST_MORPH_SHIFT_DELAY_MS = Math.max(0, PREVIEW_MORPH_DURATION_MS - 120);
const PREVIEW_BUILDER_START_DELAY_MS = 760;
const PREVIEW_BUILDER_STEP_MS = PREVIEW_MOTION_DURATION_MS;
const PREVIEW_TOC_SWITCH_MS = 920;
const PREVIEW_GENERATING_HOLD_MS = 2400;
const PREVIEW_WEEK_DAY_ORDER = [...TRAINING_DAY_OPTIONS];
const PREVIEW_WEEK_TEXT_ROW_CONFIG = [
  { id: "session", label: "Session", valueKey: "session", textClass: "preview-week-session" },
  { id: "duration", label: "Duration", valueKey: "meta", textClass: "preview-week-meta" },
  { id: "workout", label: "Workout", valueKey: "workout", textClass: "preview-week-meta" }
];
const PREVIEW_WEEK_TABLE_BODY_ROW_COUNT = PREVIEW_WEEK_TEXT_ROW_CONFIG.length + 1; // + highlights row
const PREVIEW_WEEK_TABLE_ROW_COUNT = PREVIEW_WEEK_TABLE_BODY_ROW_COUNT + 1; // + header row
const PREVIEW_WEEK_TABLE_COLUMN_COUNT = PREVIEW_WEEK_DAY_ORDER.length + 1; // + row label column
const PREVIEW_WEEK_HORIZONTAL_LINE_COUNT = PREVIEW_WEEK_TABLE_ROW_COUNT + 1;
const PREVIEW_WEEK_VERTICAL_LINE_COUNT = PREVIEW_WEEK_TABLE_COLUMN_COUNT + 1;
const PREVIEW_WEEK_LINE_STAGGER_MS = 120;
const PREVIEW_WEEK_LINE_DRAW_MS = 520;
const PREVIEW_WEEK_OUTLINE_START_MS = 180;
const PREVIEW_WEEK_OUTLINE_DRAW_MS =
  ((PREVIEW_WEEK_HORIZONTAL_LINE_COUNT + PREVIEW_WEEK_VERTICAL_LINE_COUNT - 1) * PREVIEW_WEEK_LINE_STAGGER_MS)
  + PREVIEW_WEEK_LINE_DRAW_MS;
const PREVIEW_WEEK_HEADER_REVEAL_MS = 620;
const PREVIEW_WEEK_ROW_TYPING_MS = 1800;
const PREVIEW_WEEK_SCAN_DELAY_MS = 1400;
const PREVIEW_WEEK_SCAN_DURATION_MS = 5000;
const PREVIEW_WEEK_BREAK_AFTER_SCAN_START_MS = PREVIEW_WEEK_SCAN_DURATION_MS + 120;
const PREVIEW_WEEK_PARTICLE_DENSITY_PX = 820;
const PREVIEW_WEEK_PARTICLE_MIN_COUNT = 8;
const PREVIEW_WEEK_PARTICLE_MAX_COUNT = 28;
const PREVIEW_WEEK_PARTICLE_MIN_SIZE_PX = 1;
const PREVIEW_WEEK_PARTICLE_MAX_SIZE_PX = 3.4;
const PREVIEW_WEEK_PARTICLE_MIN_DURATION_MS = 1850;
const PREVIEW_WEEK_PARTICLE_MAX_DURATION_MS = 2650;
const PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS = 980;
const PREVIEW_WEEK_PARTICLE_JITTER_MS = 18;
const PREVIEW_WEEK_PARTICLE_TOTAL_DURATION_MS = 3000;
const PREVIEW_WEEK_MIN_WORKOUT_DAYS = 5;
const PREVIEW_WEEK_DAY_NORMALIZATION = {
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tues: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  weds: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  thurs: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
  sun: "Sunday",
  sunday: "Sunday"
};
const normalizePreviewTrainingDay = (dayValue) => {
  const normalizedKey = String(dayValue ?? "").trim().toLowerCase();
  if (!normalizedKey) return "";
  return PREVIEW_WEEK_DAY_NORMALIZATION[normalizedKey] || "";
};

const getRegionFromLocale = (locale) => {
  if (!locale || typeof locale !== "string") return "";
  const localeParts = locale.split(/[-_]/).filter(Boolean);
  if (localeParts.length > 1 && localeParts[1]) {
    return localeParts[1].toUpperCase();
  }
  try {
    const parsed = new Intl.Locale(locale);
    return parsed.region ? parsed.region.toUpperCase() : "";
  } catch {
    return "";
  }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundTo = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const getPreviewTypingStepMs = (textLength) =>
  Math.max(
    PREVIEW_TYPING_MIN_MS,
    Math.min(PREVIEW_TYPING_MAX_MS, Math.round(560 / Math.max(Number(textLength) || 1, 1)))
  );
const randomBetween = (min, max) => min + (Math.random() * (max - min));

export default function PreviewPage({
  personal,
  form,
  heightUnit,
  weightUnit,
  toFeetInchesFromCm,
  toLb,
  resolvedHeightCm,
  resolvedWeightKg,
  effectiveBodyFat
}) {
  const previewFillTimeoutsRef = useRef([]);
  const previewStageRef = useRef(null);
  const previewWeekTableWrapRef = useRef(null);
  const previewWeekParticleLayerRef = useRef(null);
  const previewWeekParticlePlayersRef = useRef([]);
  const previewWeekParticleTargetsRef = useRef([]);
  const previewStepIndexRef = useRef(0);
  const previewSwitchTimeoutRef = useRef(null);
  const [previewStepIndex, setPreviewStepIndex] = useState(0);
  const [previewSwitchFromIndex, setPreviewSwitchFromIndex] = useState(null);
  const [previewFilledFields, setPreviewFilledFields] = useState({});
  const [previewPersonalCollapsed, setPreviewPersonalCollapsed] = useState(false);
  const [previewPersonalShifted, setPreviewPersonalShifted] = useState(false);
  const [previewBuilderStage, setPreviewBuilderStage] = useState(0);
  const [previewWeekStage, setPreviewWeekStage] = useState(0);
  const [previewWeekHeaderTypingProgress, setPreviewWeekHeaderTypingProgress] = useState(0);
  const [previewWeekTypingProgress, setPreviewWeekTypingProgress] = useState(0);

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
  const usesImperialUnits = IMPERIAL_REGION_CODES.has(previewRegion);

  const inferredTrainingDayCount =
    Array.isArray(personal.trainingDays) && personal.trainingDays.length
      ? String(personal.trainingDays.length)
      : "";

  const transferredPreviewProfile = {
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
  };

  const activePreviewProfile = transferredPreviewProfile;
  const activeHeightCm = Number(activePreviewProfile.heightCm) > 0 ? Number(activePreviewProfile.heightCm) : 175;
  const activeWeightKg = Number(activePreviewProfile.weightKg) > 0 ? Number(activePreviewProfile.weightKg) : 72;
  const previewBmi = Number((activeWeightKg / ((activeHeightCm / 100) ** 2)).toFixed(1));
  const previewBodyFat = Number.isFinite(Number(activePreviewProfile.bodyFat))
    ? roundTo(clamp(Number(activePreviewProfile.bodyFat), 3, 60), 1)
    : roundTo(clamp(1.35 * previewBmi - 13.5, 3, 60), 1);

  const formatWeightForLocale = (kgValue) => {
    if (!usesImperialUnits) return `${Math.round(kgValue)} kg`;
    const pounds = Number(toLb(String(Math.round(kgValue)), "kg"));
    return Number.isFinite(pounds) ? `${Math.round(pounds)} lb` : "160 lb";
  };

  const previewHeightSplit = toFeetInchesFromCm(String(Math.round(activeHeightCm)));
  const previewHeightFeet = previewHeightSplit?.feet || "5";
  const previewHeightInches = previewHeightSplit?.inches || "9";
  const defaultHeightCm = String(Math.round(activeHeightCm));
  const previewHeightCmValue = String(personal.heightCm ?? "").trim() || defaultHeightCm;
  const previewHeightFeetValue = String(personal.heightFeet ?? "").trim() || String(previewHeightFeet);
  const previewHeightInchesValue = String(personal.heightInches ?? "").trim() || String(previewHeightInches);
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
  const defaultWeight = formatWeightForLocale(activeWeightKg);
  const previewTrainingDaysList =
    Array.isArray(activePreviewProfile.trainingDays) && activePreviewProfile.trainingDays.length
      ? activePreviewProfile.trainingDays.join(", ")
      : "Monday, Tuesday, Thursday, Saturday";
  const previewWeekPlan = useMemo(() => {
    const sourceTrainingDaysRaw =
      Array.isArray(activePreviewProfile.trainingDays) && activePreviewProfile.trainingDays.length
        ? activePreviewProfile.trainingDays
        : JOHN_DOE_PREVIEW_PROFILE.trainingDays;
    const trainingDaysSet = new Set(
      sourceTrainingDaysRaw
        .map((day) => normalizePreviewTrainingDay(day))
        .filter(Boolean)
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
    const sourceFocuses =
      Array.isArray(activePreviewProfile.focuses) && activePreviewProfile.focuses.length
        ? activePreviewProfile.focuses
        : JOHN_DOE_PREVIEW_PROFILE.focuses;
    const sessionDuration = Number(activePreviewProfile.duration) > 0
      ? `${Number(activePreviewProfile.duration)} min`
      : `${Number(JOHN_DOE_PREVIEW_PROFILE.duration)} min`;
    const environmentLabel = String(
      activePreviewProfile.environment || JOHN_DOE_PREVIEW_PROFILE.environment
    );
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
    () => (
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
          ]
    ),
    [usesImperialUnits]
  );

  // Keep a stable snapshot so local/parent rerenders do not restart the preview sequence.
  const previewInitialTargetsRef = useRef(null);
  const previewInitialFillOrderRef = useRef(null);
  if (!previewInitialTargetsRef.current) {
    previewInitialTargetsRef.current = previewPersonalTargets;
  }
  if (!previewInitialFillOrderRef.current) {
    previewInitialFillOrderRef.current = previewFillOrder;
  }

  const previewChapters = [
    {
      id: "personal-info",
      title: "Personal Info",
      fields: [
        { label: "Full name", value: defaultName },
        { label: "Age", value: defaultAge },
        ...(usesImperialUnits
          ? [
              { label: "Height (ft)", value: previewHeightFeet },
              { label: "Height (in)", value: previewHeightInches }
            ]
          : [{ label: "Height (cm)", value: defaultHeightCm }]),
        { label: "Weight", value: defaultWeight },
        { label: "Sex", value: defaultSex },
        { label: "Activity level", value: activePreviewProfile.activity },
        { label: "Sleep", value: activePreviewProfile.sleep },
        { label: "Goal timeline", value: activePreviewProfile.timeline, multiline: true, rows: 2 },
        { label: "Training experience", value: activePreviewProfile.experience },
        { label: "Nutrition preference", value: activePreviewProfile.nutrition },
        { label: "Cardio preference", value: activePreviewProfile.cardio },
        { label: "Training days", value: previewTrainingDaysList, multiline: true, rows: 2 },
        { label: "Additional info", value: activePreviewProfile.notes, multiline: true, rows: 2 }
      ]
    },
    {
      id: "generate",
      title: "Generate",
      fields: []
    },
    {
      id: "workout-week",
      title: "Result",
      fields: []
    }
  ];
  const generateChapterIndex = previewChapters.findIndex((chapter) => chapter.id === "generate");
  const workoutWeekChapterIndex = previewChapters.findIndex((chapter) => chapter.id === "workout-week");

  const activePreviewChapter = previewChapters[previewStepIndex] || previewChapters[0];
  const previousPreviewChapter =
    Number.isInteger(previewSwitchFromIndex) &&
    previewSwitchFromIndex !== previewStepIndex &&
    previewSwitchFromIndex >= 0 &&
    previewSwitchFromIndex < previewChapters.length
      ? previewChapters[previewSwitchFromIndex]
      : null;
  const isPreviewTitleSwitching = Boolean(previousPreviewChapter);
  const previewMaxChapterTitleLength = previewChapters.reduce(
    (maxLength, chapter) => Math.max(maxLength, chapter.title.length),
    0
  );
  const previewStageStyle = {
    "--preview-chip-expanded": `calc(${Math.max(14, previewMaxChapterTitleLength)}ch + 4.4rem)`,
    "--preview-title-width": `calc(${Math.max(16, previewMaxChapterTitleLength)}ch + 3.8rem)`
  };

  const clearPreviewFillTimers = () => {
    if (!previewFillTimeoutsRef.current.length) return;
    previewFillTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
      window.clearInterval(timeoutId);
    });
    previewFillTimeoutsRef.current = [];
  };

  const clearPreviewWeekParticleAnimation = () => {
    if (previewWeekParticlePlayersRef.current.length) {
      previewWeekParticlePlayersRef.current.forEach((player) => {
        player?.cancel?.();
      });
      previewWeekParticlePlayersRef.current = [];
    }

    if (previewWeekParticleTargetsRef.current.length) {
      previewWeekParticleTargetsRef.current.forEach((target) => {
        if (!target) return;
        target.style.opacity = "";
        target.style.transform = "";
        target.style.filter = "";
      });
      previewWeekParticleTargetsRef.current = [];
    }

    if (previewWeekParticleLayerRef.current) {
      previewWeekParticleLayerRef.current.replaceChildren();
    }
  };

  const getPreviewFieldRows = (field) => {
    if (Number.isFinite(Number(field.rows)) && Number(field.rows) > 0) {
      return Number(field.rows);
    }
    const text = String(field.value ?? "").trim();
    if (!text) return 1;
    const estimatedRows = Math.ceil(text.length / 30);
    return Math.max(1, Math.min(4, estimatedRows));
  };

  const getPreviewTextRows = (value, minRows = 1, maxRows = 4) => {
    const text = String(value ?? "").trim();
    if (!text) return minRows;
    const estimatedRows = Math.ceil(text.length / 30);
    return Math.max(minRows, Math.min(maxRows, estimatedRows));
  };

  const previewFillStartDelayMs = 420;
  const previewFillStepMs = 220;
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

  const renderPreviewPersonalInfoChapter = (isGenerateView = false) => {
    const showCollapsed = previewPersonalCollapsed || isGenerateView;
    const showBuilder = previewPersonalShifted || isGenerateView;
    const getFieldValue = (fieldKey) => (
      typeof previewFilledFields[fieldKey] === "string" ? previewFilledFields[fieldKey] : ""
    );
    const previewTrainingDays = Array.isArray(previewFilledFields.trainingDays)
      ? previewFilledFields.trainingDays
      : [];

    return (
      <div
        className={`preview-personal-sequence ${isGenerateView ? "is-generate-view" : ""} ${showBuilder ? "is-builder-active" : ""} builder-stage-${previewBuilderStage}`}
      >
        <div
          className={`preview-personal-form-shell ${showCollapsed ? "is-collapsed" : ""}`}
        >
          <div className="preview-personal-morph-surface" aria-hidden="true" />
          <span className="preview-personal-morph-label" aria-hidden="true">Personal Info</span>
          <form className="form personal-form advanced-mode preview-personal-form" onSubmit={(event) => event.preventDefault()}>
        <label className="field-name">
          Full name
          <textarea
            name="name"
            value={getFieldValue("name")}
            rows={getPreviewTextRows(getFieldValue("name"), 1, 2)}
            readOnly
          />
        </label>
        <label className="field-age">
          Age
          <input
            name="age"
            value={getFieldValue("age")}
            type="number"
            min="10"
            max="99"
            readOnly
          />
        </label>
        <label className="metric-field metric-height field-height">
          <span className="label-row">
            Height
            <span
              className={`unit-toggle ${heightUnit === "cm" ? "pos-1" : "pos-0"}`}
              role="group"
              aria-label="Height units"
            >
              <button
                type="button"
                className={heightUnit === "ft" ? "active" : ""}
                tabIndex={-1}
              >
                ft/in
              </button>
              <button
                type="button"
                className={heightUnit === "cm" ? "active" : ""}
                tabIndex={-1}
              >
                cm
              </button>
            </span>
          </span>
          {heightUnit === "cm" ? (
            <input
              name="heightCm"
              value={getFieldValue("heightCm")}
              type="number"
              min="120"
              max="230"
              readOnly
            />
          ) : (
            <div className="height-split">
              <div className="height-field">
                <input
                  name="heightFeet"
                  value={getFieldValue("heightFeet")}
                  type="number"
                  min="3"
                  max="7"
                  readOnly
                />
                <span className="height-unit">ft</span>
              </div>
              <div className="height-field">
                <input
                  name="heightInches"
                  value={getFieldValue("heightInches")}
                  type="number"
                  min="0"
                  max="11"
                  readOnly
                />
                <span className="height-unit">in</span>
              </div>
            </div>
          )}
        </label>
        <label className="metric-field field-weight">
          <span className="label-row">
            Weight
            <span
              className={`unit-toggle ${weightUnit === "kg" ? "pos-1" : "pos-0"}`}
              role="group"
              aria-label="Weight units"
            >
              <button
                type="button"
                className={weightUnit === "lb" ? "active" : ""}
                tabIndex={-1}
              >
                lb
              </button>
              <button
                type="button"
                className={weightUnit === "kg" ? "active" : ""}
                tabIndex={-1}
              >
                kg
              </button>
            </span>
          </span>
          <input
            name="weight"
            value={getFieldValue("weight")}
            type="number"
            min={weightUnit === "kg" ? "35" : "77"}
            max={weightUnit === "kg" ? "200" : "440"}
            readOnly
          />
        </label>
        <label className="field-sex">
          Sex
          <select name="sex" value={getFieldValue("sex")} onChange={() => {}}>
            <option value="">Select</option>
            <option>Female</option>
            <option>Male</option>
            <option>Non-binary</option>
            <option>Prefer not to say</option>
          </select>
        </label>

        <div className="advanced-fields-wrap" aria-hidden={false}>
          <div className="advanced-fields-inner">
            <label>
              Activity level
              <select
                name="activity"
                value={getFieldValue("activity")}
                onChange={() => {}}
              >
                <option value="">Select</option>
                <option>Light</option>
                <option>Moderate</option>
                <option>High</option>
                <option>Very high</option>
              </select>
            </label>
            <label>
              Sleep
              <select
                name="sleep"
                value={getFieldValue("sleep")}
                onChange={() => {}}
              >
                <option value="">Select</option>
                <option>Less than 4</option>
                <option>4 - 6 hours</option>
                <option>7 - 8 hours</option>
                <option>More than 8</option>
              </select>
            </label>
            <label className="full">
              Goal timeline
              <textarea
                name="timeline"
                value={getFieldValue("timeline")}
                rows={getPreviewTextRows(getFieldValue("timeline"), 2, 4)}
                readOnly
              />
            </label>
            <label>
              Training experience
              <select
                name="experience"
                value={getFieldValue("experience")}
                onChange={() => {}}
              >
                <option value="">Select</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </label>
            <label>
              Nutrition preference
              <select
                name="nutrition"
                value={getFieldValue("nutrition")}
                onChange={() => {}}
              >
                <option value="">Select</option>
                <option>No preference</option>
                <option>High-protein</option>
                <option>Balanced</option>
                <option>Low-carb</option>
                <option>Vegetarian</option>
                <option>Vegan</option>
              </select>
            </label>
            <label>
              Cardio preference
              <select
                name="cardio"
                value={getFieldValue("cardio")}
                onChange={() => {}}
              >
                <option value="">Select</option>
                <option>None</option>
                <option>Walking</option>
                <option>Running</option>
                <option>Cycling</option>
                <option>Rowing</option>
                <option>Swimming</option>
                <option>HIIT</option>
                <option>Mixed</option>
              </select>
            </label>
            <label className="full">
              Training days
              <div className="day-toggle-grid">
                {TRAINING_DAY_OPTIONS.map((day) => {
                  const isSelected = previewTrainingDays.includes(day);
                  return (
                    <button
                      key={`preview-${day}`}
                      type="button"
                      className={`day-toggle-btn ${isSelected ? "active" : ""}`}
                      tabIndex={-1}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </label>
            <label className="full">
              Additional Info
              <textarea
                name="notes"
                value={getFieldValue("notes")}
                rows={getPreviewTextRows(getFieldValue("notes"), 2, 5)}
                readOnly
              />
            </label>
          </div>
        </div>
          </form>
        </div>
        <div className={`preview-builder-track ${showBuilder ? "is-active" : ""}`} aria-hidden={!showBuilder}>
          <div className="preview-builder-spacer" aria-hidden="true" />
          <span className={`preview-builder-plus plus-one from-bottom ${previewBuilderStage >= 1 ? "is-visible" : ""}`}>+</span>
          <div className={`preview-builder-slot env from-top ${previewBuilderStage >= 2 ? "is-visible" : ""}`}>
            <span className="preview-builder-btn">Environment</span>
          </div>
          <span className={`preview-builder-plus plus-two from-bottom ${previewBuilderStage >= 3 ? "is-visible" : ""}`}>+</span>
          <div className={`preview-builder-slot focus from-top ${previewBuilderStage >= 4 ? "is-visible" : ""}`}>
            <span className="preview-builder-btn">Focus</span>
          </div>
          <span className={`preview-builder-generating ${previewBuilderStage >= 6 ? "is-visible" : ""}`}>
            Generating
          </span>
        </div>
      </div>
    );
  };

  const renderPreviewWorkoutWeekChapter = () => {
    const horizontalLineOffsets = Array.from({ length: PREVIEW_WEEK_HORIZONTAL_LINE_COUNT }, (_, index) => (
      `${(index / (PREVIEW_WEEK_HORIZONTAL_LINE_COUNT - 1)) * 100}%`
    ));
    const verticalLineOffsets = Array.from({ length: PREVIEW_WEEK_VERTICAL_LINE_COUNT }, (_, index) => (
      `${(index / (PREVIEW_WEEK_VERTICAL_LINE_COUNT - 1)) * 100}%`
    ));

    return (
      <div
        className={`preview-week-plan ${previewWeekStage >= 1 ? "is-outline-active" : ""} ${
          previewWeekStage >= 2 ? "is-headers-visible" : ""
        } ${previewWeekStage >= 3 ? "is-rows-visible" : ""} ${
          previewWeekStage >= 3 && previewWeekTypingProgress < 1 ? "is-typing" : ""
        } ${previewWeekStage >= 5 ? "is-scan-once" : ""} ${
          previewWeekStage >= 6 ? "is-breaking-apart is-anime-particle-break" : ""
        }`}
        aria-label="Generated weekly workout preview"
      >
        <div ref={previewWeekTableWrapRef} className="preview-week-table-wrap">
          <div className="preview-week-outline" aria-hidden="true">
            {horizontalLineOffsets.map((offset, index) => (
              <span
                key={`preview-week-outline-h-${index}`}
                className="preview-week-outline-line horizontal"
                style={{
                  "--preview-line-offset": offset,
                  "--preview-line-delay": `${index * PREVIEW_WEEK_LINE_STAGGER_MS}ms`
                }}
              />
            ))}
            {verticalLineOffsets.map((offset, index) => (
              <span
                key={`preview-week-outline-v-${index}`}
                className="preview-week-outline-line vertical"
                style={{
                  "--preview-line-offset": offset,
                  "--preview-line-delay": `${
                    (horizontalLineOffsets.length + index) * PREVIEW_WEEK_LINE_STAGGER_MS
                  }ms`
                }}
              />
            ))}
          </div>
          <table className="preview-week-table">
          <thead>
            <tr>
              <th
                className={`preview-week-row-label preview-week-corner-cell ${
                  previewWeekStage >= 2 ? "is-visible" : ""
                }`}
              >
                {getPreviewWeekHeaderTypedText("Plan") || "\u00A0"}
              </th>
              {previewWeekPlan.map((dayPlan) => (
                <th
                  key={`preview-week-head-${dayPlan.day}`}
                  scope="col"
                  className={`preview-week-day-cell preview-week-day-head ${
                    dayPlan.isTraining ? "is-training" : "is-recovery"
                  } ${previewWeekStage >= 2 ? "is-visible" : ""}`}
                >
                  <h3 className="preview-week-day-name">{getPreviewWeekHeaderTypedText(dayPlan.day) || "\u00A0"}</h3>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PREVIEW_WEEK_TEXT_ROW_CONFIG.map((rowConfig) => (
              <tr key={`preview-week-row-${rowConfig.id}`}>
                <th scope="row" className={`preview-week-row-label ${previewWeekStage >= 2 ? "is-visible" : ""}`}>
                  {getPreviewWeekHeaderTypedText(rowConfig.label) || "\u00A0"}
                </th>
                {previewWeekPlan.map((dayPlan) => {
                  const rowValue = String(dayPlan[rowConfig.valueKey] ?? "");
                  const typedRowValue = getPreviewWeekTypedText(rowValue);
                  return (
                    <td
                      key={`preview-week-${rowConfig.id}-${dayPlan.day}`}
                      className={`preview-week-day-cell ${
                        dayPlan.isTraining ? "is-training" : "is-recovery"
                      } ${previewWeekStage >= 3 ? "is-visible" : ""}`}
                    >
                      <p className={rowConfig.textClass}>{typedRowValue || "\u00A0"}</p>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className={`preview-week-row-label ${previewWeekStage >= 2 ? "is-visible" : ""}`}>
                {getPreviewWeekHeaderTypedText("Highlights") || "\u00A0"}
              </th>
              {previewWeekPlan.map((dayPlan) => (
                <td
                  key={`preview-week-highlights-${dayPlan.day}`}
                  className={`preview-week-day-cell preview-week-highlights-cell ${
                    dayPlan.isTraining ? "is-training" : "is-recovery"
                  } ${previewWeekStage >= 3 ? "is-visible" : ""}`}
                >
                  <ul className="preview-week-highlights">
                    {dayPlan.highlights.map((item, itemIndex) => {
                      const typedHighlight = getPreviewWeekTypedText(item);
                      return (
                        <li
                          key={`preview-week-${dayPlan.day}-item-${itemIndex}`}
                          className={typedHighlight ? "is-typed" : "is-empty"}
                        >
                          {typedHighlight || "\u00A0"}
                        </li>
                      );
                    })}
                  </ul>
                </td>
              ))}
            </tr>
          </tbody>
          </table>
          <div ref={previewWeekParticleLayerRef} className="preview-week-particle-layer" aria-hidden="true" />
        </div>
      </div>
    );
  };

  const renderPreviewChapterBody = (chapter) => (
    chapter.id === "personal-info" ? (
      renderPreviewPersonalInfoChapter(false)
    ) : chapter.id === "generate" ? (
      renderPreviewPersonalInfoChapter(true)
    ) : chapter.id === "workout-week" ? (
      renderPreviewWorkoutWeekChapter()
    ) : (
      <div className="preview-fields-grid">
        {chapter.fields.map((field, fieldIndex) => {
          const rows = field.multiline ? (field.rows || 3) : getPreviewFieldRows(field);
          return (
            <label key={`${chapter.id}-${field.label}-${fieldIndex}`} className="preview-field-row">
              <span>{field.label}</span>
              <textarea
                className={`preview-field-input ${rows > 1 ? "wrapped" : "single-line"}`}
                value={String(field.value ?? "")}
                rows={rows}
                readOnly
              />
            </label>
          );
        })}
      </div>
    )
  );

  const scrollPreviewIntoView = () => {
    if (!previewStageRef.current) return;
    previewStageRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToChapter = (targetIndex) => {
    const boundedIndex = Math.max(0, Math.min(targetIndex, previewChapters.length - 1));
    const currentIndex = previewStepIndexRef.current;
    if (currentIndex === boundedIndex) return;
    setPreviewSwitchFromIndex(currentIndex);
    setPreviewStepIndex(boundedIndex);
    previewStepIndexRef.current = boundedIndex;
    if (previewSwitchTimeoutRef.current) {
      window.clearTimeout(previewSwitchTimeoutRef.current);
    }
    previewSwitchTimeoutRef.current = window.setTimeout(() => {
      setPreviewSwitchFromIndex(null);
      previewSwitchTimeoutRef.current = null;
    }, PREVIEW_TOC_SWITCH_MS + 120);
  };

  const pulsePreviewControl = (event) => {
    void event;
  };

  useEffect(() => {
    const rootEl = document.documentElement;
    if (!rootEl) return undefined;
    rootEl.classList.add("preview-smooth-scroll");
    return () => {
      rootEl.classList.remove("preview-smooth-scroll");
    };
  }, []);

  useEffect(() => {
    previewStepIndexRef.current = previewStepIndex;
  }, [previewStepIndex]);

  useEffect(() => {
    setPreviewStepIndex(0);
    previewStepIndexRef.current = 0;
    setPreviewSwitchFromIndex(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollPreviewIntoView);
    });
  }, []);

  useEffect(() => {
    const personalTargets = previewInitialTargetsRef.current || previewPersonalTargets;
    const fillOrder = previewInitialFillOrderRef.current || previewFillOrder;

    const markAllFilled = () => {
      const nextFilled = {};
      fillOrder.forEach((fieldKey) => {
        if (fieldKey === "trainingDays") {
          nextFilled[fieldKey] = Array.isArray(personalTargets.trainingDays)
            ? [...personalTargets.trainingDays]
            : [];
          return;
        }
        nextFilled[fieldKey] = String(personalTargets[fieldKey] ?? "");
      });
      setPreviewFilledFields(nextFilled);
    };

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    clearPreviewFillTimers();

    if (activePreviewChapter.id === "generate") {
      setPreviewWeekStage(0);
      setPreviewWeekHeaderTypingProgress(0);
      setPreviewWeekTypingProgress(0);
      markAllFilled();
      setPreviewPersonalCollapsed(true);
      setPreviewPersonalShifted(true);
      setPreviewBuilderStage(0);

      if (prefersReducedMotion) {
        setPreviewBuilderStage(6);
        if (workoutWeekChapterIndex >= 0) {
          const weekChapterTimeoutId = window.setTimeout(() => {
            scrollToChapter(workoutWeekChapterIndex);
          }, PREVIEW_GENERATING_HOLD_MS);
          previewFillTimeoutsRef.current.push(weekChapterTimeoutId);
        }
        return undefined;
      }

      [1, 2, 3, 4, 5, 6].forEach((stage, idx) => {
        const builderStepTimeoutId = window.setTimeout(() => {
          setPreviewBuilderStage(stage);
        }, PREVIEW_BUILDER_START_DELAY_MS + (idx * PREVIEW_BUILDER_STEP_MS));
        previewFillTimeoutsRef.current.push(builderStepTimeoutId);
      });

      if (workoutWeekChapterIndex >= 0) {
        const weekChapterTimeoutId = window.setTimeout(() => {
          scrollToChapter(workoutWeekChapterIndex);
        }, PREVIEW_BUILDER_START_DELAY_MS + (5 * PREVIEW_BUILDER_STEP_MS) + PREVIEW_GENERATING_HOLD_MS);
        previewFillTimeoutsRef.current.push(weekChapterTimeoutId);
      }
      return undefined;
    }

    if (activePreviewChapter.id === "workout-week") {
      setPreviewFilledFields({});
      setPreviewPersonalCollapsed(false);
      setPreviewPersonalShifted(false);
      setPreviewBuilderStage(0);
      setPreviewWeekStage(0);
      setPreviewWeekHeaderTypingProgress(0);
      setPreviewWeekTypingProgress(0);

      if (prefersReducedMotion) {
        setPreviewWeekStage(4);
        setPreviewWeekHeaderTypingProgress(1);
        setPreviewWeekTypingProgress(1);
        return undefined;
      }

      const outlineTimeoutId = window.setTimeout(() => {
        setPreviewWeekStage(1);
      }, PREVIEW_WEEK_OUTLINE_START_MS);
      previewFillTimeoutsRef.current.push(outlineTimeoutId);

      const headerTimeoutId = window.setTimeout(() => {
        setPreviewWeekStage(2);
        setPreviewWeekHeaderTypingProgress(0);
        const headerTypingStartedAt = Date.now();
        const headerTypingIntervalId = window.setInterval(() => {
          const elapsedMs = Date.now() - headerTypingStartedAt;
          const nextProgress = clamp(elapsedMs / PREVIEW_WEEK_HEADER_REVEAL_MS, 0, 1);
          setPreviewWeekHeaderTypingProgress(nextProgress);
          if (nextProgress >= 1) {
            window.clearInterval(headerTypingIntervalId);
          }
        }, 32);
        previewFillTimeoutsRef.current.push(headerTypingIntervalId);
      }, PREVIEW_WEEK_OUTLINE_START_MS + PREVIEW_WEEK_OUTLINE_DRAW_MS);
      previewFillTimeoutsRef.current.push(headerTimeoutId);

      const rowTypingTimeoutId = window.setTimeout(() => {
        setPreviewWeekStage(3);
        setPreviewWeekHeaderTypingProgress(1);
        setPreviewWeekTypingProgress(0);
        const typingStartedAt = Date.now();
        const typingIntervalId = window.setInterval(() => {
          const elapsedMs = Date.now() - typingStartedAt;
          const nextProgress = clamp(elapsedMs / PREVIEW_WEEK_ROW_TYPING_MS, 0, 1);
          setPreviewWeekTypingProgress(nextProgress);
          if (nextProgress >= 1) {
            window.clearInterval(typingIntervalId);
            setPreviewWeekStage(4);
            const scanTimeoutId = window.setTimeout(() => {
              setPreviewWeekStage(5);
              const breakTimeoutId = window.setTimeout(() => {
                setPreviewWeekStage(6);
              }, PREVIEW_WEEK_BREAK_AFTER_SCAN_START_MS);
              previewFillTimeoutsRef.current.push(breakTimeoutId);
            }, PREVIEW_WEEK_SCAN_DELAY_MS);
            previewFillTimeoutsRef.current.push(scanTimeoutId);
          }
        }, 32);
        previewFillTimeoutsRef.current.push(typingIntervalId);
      }, PREVIEW_WEEK_OUTLINE_START_MS + PREVIEW_WEEK_OUTLINE_DRAW_MS + PREVIEW_WEEK_HEADER_REVEAL_MS);
      previewFillTimeoutsRef.current.push(rowTypingTimeoutId);
      return undefined;
    }

    if (activePreviewChapter.id !== "personal-info") {
      setPreviewWeekStage(0);
      setPreviewWeekHeaderTypingProgress(0);
      setPreviewWeekTypingProgress(0);
      setPreviewFilledFields({});
      setPreviewPersonalCollapsed(false);
      setPreviewPersonalShifted(false);
      setPreviewBuilderStage(0);
      return undefined;
    }

    if (prefersReducedMotion) {
      markAllFilled();
      setPreviewPersonalCollapsed(true);
      if (generateChapterIndex >= 0) {
        scrollToChapter(generateChapterIndex);
      }
      return undefined;
    }

    setPreviewFilledFields({});
    setPreviewWeekStage(0);
    setPreviewWeekHeaderTypingProgress(0);
    setPreviewWeekTypingProgress(0);
    setPreviewPersonalCollapsed(false);
    setPreviewPersonalShifted(false);
    setPreviewBuilderStage(0);
    let latestCompletionMs = 0;

    fillOrder.forEach((fieldKey, index) => {
      const fieldStartMs = previewFillStartDelayMs + index * previewFillStepMs;
      const timeoutId = window.setTimeout(() => {
        if (fieldKey === "trainingDays") {
          const trainingDays = Array.isArray(personalTargets.trainingDays)
            ? personalTargets.trainingDays
            : [];
          setPreviewFilledFields((prev) => ({ ...prev, trainingDays: [] }));
          trainingDays.forEach((day, dayIndex) => {
            const dayTimerId = window.setTimeout(() => {
              setPreviewFilledFields((prev) => {
                const currentDays = Array.isArray(prev.trainingDays) ? prev.trainingDays : [];
                if (currentDays.includes(day)) return prev;
                return { ...prev, trainingDays: [...currentDays, day] };
              });
            }, dayIndex * PREVIEW_TRAINING_DAY_STEP_MS);
            previewFillTimeoutsRef.current.push(dayTimerId);
          });
          return;
        }

        const targetValue = String(personalTargets[fieldKey] ?? "");
        if (!targetValue) {
          setPreviewFilledFields((prev) => ({ ...prev, [fieldKey]: "" }));
          return;
        }

        if (PREVIEW_INSTANT_FIELDS.has(fieldKey)) {
          setPreviewFilledFields((prev) => ({ ...prev, [fieldKey]: targetValue }));
          return;
        }

        setPreviewFilledFields((prev) => ({ ...prev, [fieldKey]: "" }));
        let cursor = 0;
        const typingStepMs = getPreviewTypingStepMs(targetValue.length);
        const typingIntervalId = window.setInterval(() => {
          cursor += 1;
          const nextValue = targetValue.slice(0, cursor);
          setPreviewFilledFields((prev) => ({ ...prev, [fieldKey]: nextValue }));
          if (cursor >= targetValue.length) {
            window.clearInterval(typingIntervalId);
          }
        }, typingStepMs);
        previewFillTimeoutsRef.current.push(typingIntervalId);
      }, fieldStartMs);
      previewFillTimeoutsRef.current.push(timeoutId);

      if (fieldKey === "trainingDays") {
        const trainingDays = Array.isArray(personalTargets.trainingDays)
          ? personalTargets.trainingDays
          : [];
        const revealMs = trainingDays.length > 0
          ? (trainingDays.length - 1) * PREVIEW_TRAINING_DAY_STEP_MS
          : 0;
        latestCompletionMs = Math.max(latestCompletionMs, fieldStartMs + revealMs);
        return;
      }

      const targetValue = String(personalTargets[fieldKey] ?? "");
      if (!targetValue || PREVIEW_INSTANT_FIELDS.has(fieldKey)) {
        latestCompletionMs = Math.max(latestCompletionMs, fieldStartMs);
        return;
      }

      const typingStepMs = getPreviewTypingStepMs(targetValue.length);
      latestCompletionMs = Math.max(latestCompletionMs, fieldStartMs + (targetValue.length * typingStepMs));
    });

    const collapseTimeoutId = window.setTimeout(() => {
      setPreviewPersonalCollapsed(true);
      const postMorphShiftTimeoutId = window.setTimeout(() => {
        if (generateChapterIndex >= 0) {
          scrollToChapter(generateChapterIndex);
          return;
        }
        setPreviewPersonalShifted(true);
        setPreviewBuilderStage(0);
        [1, 2, 3, 4, 5, 6].forEach((stage, idx) => {
          const builderStepTimeoutId = window.setTimeout(() => {
            setPreviewBuilderStage(stage);
          }, PREVIEW_BUILDER_START_DELAY_MS + (idx * PREVIEW_BUILDER_STEP_MS));
          previewFillTimeoutsRef.current.push(builderStepTimeoutId);
        });
      }, PREVIEW_POST_MORPH_SHIFT_DELAY_MS);
      previewFillTimeoutsRef.current.push(postMorphShiftTimeoutId);
    }, latestCompletionMs + PREVIEW_COLLAPSE_DELAY_MS);
    previewFillTimeoutsRef.current.push(collapseTimeoutId);

    return () => {
      clearPreviewFillTimers();
    };
  }, [
    activePreviewChapter.id,
    generateChapterIndex,
    workoutWeekChapterIndex
  ]);

  useEffect(() => {
    if (activePreviewChapter.id !== "workout-week" || previewWeekStage < 6) {
      clearPreviewWeekParticleAnimation();
      return undefined;
    }
    if (previewWeekStage > 6) {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      clearPreviewWeekParticleAnimation();
      return undefined;
    }

    const wrapEl = previewWeekTableWrapRef.current;
    const layerEl = previewWeekParticleLayerRef.current;
    const tableEl = wrapEl?.querySelector(".preview-week-table");
    if (!wrapEl || !layerEl || !tableEl) return undefined;

    clearPreviewWeekParticleAnimation();

    const wrapRect = wrapEl.getBoundingClientRect();
    if (!wrapRect.width || !wrapRect.height) return undefined;

    const contentEntries = Array.from(tableEl.querySelectorAll("th, td, p, li, h3"))
      .map((targetEl) => {
        const rect = targetEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;

        const relativeLeft = rect.left - wrapRect.left;
        const relativeTop = rect.top - wrapRect.top;
        if (relativeLeft > wrapRect.width || relativeTop > wrapRect.height) return null;
        if (relativeLeft + rect.width < 0 || relativeTop + rect.height < 0) return null;

        const centerX = relativeLeft + (rect.width / 2);
        const centerY = relativeTop + (rect.height / 2);
        const rowProgress = clamp(centerY / Math.max(wrapRect.height, 1), 0, 1);
        const colProgress = clamp(centerX / Math.max(wrapRect.width, 1), 0, 1);
        const targetStyle = window.getComputedStyle(targetEl);

        return {
          targetEl,
          rect,
          relativeLeft,
          relativeTop,
          rowProgress,
          colProgress,
          particleColor: targetStyle.color || "rgba(255, 255, 255, 0.9)"
        };
      })
      .filter(Boolean);
    const contentTargets = contentEntries.map((entry) => entry.targetEl);
    const sourceTargets = [tableEl, ...contentTargets];
    const particles = [];
    const particleMeta = [];
    const contentMeta = [];
    const fragment = document.createDocumentFragment();

    contentEntries.forEach((entry) => {
      const {
        rect,
        relativeLeft,
        relativeTop,
        rowProgress,
        colProgress,
        particleColor
      } = entry;
      contentMeta.push({
        delay: Math.round((rowProgress * PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS) + (colProgress * 24)),
        rise: -18 - (rowProgress * 14)
      });
      const particleCount = clamp(
        Math.round((rect.width * rect.height) / PREVIEW_WEEK_PARTICLE_DENSITY_PX),
        PREVIEW_WEEK_PARTICLE_MIN_COUNT,
        PREVIEW_WEEK_PARTICLE_MAX_COUNT
      );

      for (let index = 0; index < particleCount; index += 1) {
        const particleEl = document.createElement("span");
        particleEl.className = "preview-week-particle";

        const size = randomBetween(PREVIEW_WEEK_PARTICLE_MIN_SIZE_PX, PREVIEW_WEEK_PARTICLE_MAX_SIZE_PX);
        const particleX = relativeLeft + randomBetween(0, rect.width);
        const particleY = relativeTop + randomBetween(0, rect.height);
        const localRowProgress = clamp((particleY - relativeTop) / Math.max(rect.height, 1), 0, 1);
        const particleRowProgress = clamp(
          rowProgress + ((localRowProgress - 0.5) * 0.09),
          0,
          1
        );

        particleEl.style.left = `${particleX.toFixed(2)}px`;
        particleEl.style.top = `${particleY.toFixed(2)}px`;
        particleEl.style.width = `${size.toFixed(2)}px`;
        particleEl.style.height = `${size.toFixed(2)}px`;
        particleEl.style.opacity = randomBetween(0.5, 1).toFixed(3);
        particleEl.style.backgroundColor = particleColor;
        particleEl.style.borderRadius = Math.random() > 0.75 ? "50%" : "1px";

        fragment.appendChild(particleEl);
        particles.push(particleEl);
        particleMeta.push({
          delay: Math.round(
            (particleRowProgress * PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS) +
            randomBetween(0, PREVIEW_WEEK_PARTICLE_JITTER_MS)
          ),
          duration: Math.round(randomBetween(PREVIEW_WEEK_PARTICLE_MIN_DURATION_MS, PREVIEW_WEEK_PARTICLE_MAX_DURATION_MS)),
          driftX: randomBetween(-72, 72),
          driftY: randomBetween(-188, -84),
          rotate: randomBetween(-110, 110),
          scale: randomBetween(0.42, 1.36)
        });
      }
    });

    if (!particles.length) return undefined;

    layerEl.appendChild(fragment);
    previewWeekParticleTargetsRef.current = sourceTargets;

    let keepCompletionFrame = false;

    const dissolveTimeline = createTimeline({
      defaults: { ease: "inOutSine" },
      onComplete: () => {
        keepCompletionFrame = true;
        setPreviewWeekStage((current) => (current < 7 ? 7 : current));
      }
    })
      .add(tableEl, {
        translateY: [0, -74],
        opacity: [1, 0],
        duration: PREVIEW_WEEK_PARTICLE_TOTAL_DURATION_MS
      }, Math.round(PREVIEW_WEEK_PARTICLE_ROW_DELAY_MS * 0.18))
      .add(contentTargets, {
        opacity: [1, 0],
        translateY: (_, index) => contentMeta[index]?.rise ?? -24,
        duration: PREVIEW_WEEK_PARTICLE_TOTAL_DURATION_MS - 560,
        delay: (_, index) => contentMeta[index]?.delay ?? 0,
        ease: "inOutSine"
      }, 0)
      .add(particles, {
        translateX: (_, index) => particleMeta[index].driftX,
        translateY: (_, index) => particleMeta[index].driftY,
        rotate: (_, index) => particleMeta[index].rotate,
        scale: [1, (_, index) => particleMeta[index].scale],
        opacity: [1, 0],
        filter: ["blur(0px)", "blur(1.4px)"],
        delay: (_, index) => particleMeta[index].delay,
        duration: (_, index) => particleMeta[index].duration,
        ease: "outSine"
      }, 0);

    previewWeekParticlePlayersRef.current = [dissolveTimeline];

    return () => {
      if (!keepCompletionFrame) {
        clearPreviewWeekParticleAnimation();
      }
    };
  }, [activePreviewChapter.id, previewWeekStage]);

  useEffect(
    () => () => {
      if (previewSwitchTimeoutRef.current) {
        window.clearTimeout(previewSwitchTimeoutRef.current);
      }
      clearPreviewFillTimers();
      clearPreviewWeekParticleAnimation();
    },
    []
  );

  return (
    <section ref={previewStageRef} className="panel preview-stage-panel stage-panel" style={previewStageStyle}>
      <header className="preview-stage-header">
        <p className="preview-stage-kicker">Guided walkthrough</p>
        <div className="preview-stage-title-row">
          <div className="preview-stage-title-stack" aria-live="polite">
            {previousPreviewChapter ? (
              <span className="preview-stage-title preview-stage-title-ghost is-leaving" aria-hidden="true">
                {previousPreviewChapter.title}
              </span>
            ) : null}
            <h2 className={`preview-stage-title ${isPreviewTitleSwitching ? "is-entering" : "is-static"}`}>
              {activePreviewChapter.title}
            </h2>
          </div>
        </div>
      </header>
      <div className="preview-scroll-story">
        <aside className="preview-side-tab" role="tablist" aria-label="Preview sections">
          {previewChapters.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              role="tab"
              aria-selected={index === previewStepIndex}
              aria-current={index === previewStepIndex ? "step" : undefined}
              className={`preview-jump-chip ${index === previewStepIndex ? "active is-expanding" : ""} ${
                index === previewSwitchFromIndex && index !== previewStepIndex ? "is-contracting" : ""
              }`}
              onClick={(event) => {
                pulsePreviewControl(event);
                scrollToChapter(index);
              }}
            >
              <span className="preview-jump-label">{chapter.title}</span>
            </button>
          ))}
        </aside>
        <div className="preview-step-shell">
          <article
            className={`setup-snapshot-card setup-snapshot-card-detailed preview-step-card ${
              activePreviewChapter.id === "generate" ? "is-generate-view" : ""
            } ${
              activePreviewChapter.id === "personal-info" && previewPersonalCollapsed
                ? "is-personal-collapsed"
                : ""
            }`}
          >
            <div className="preview-card-pages">
              <section className="preview-card-page active is-entering">
                {renderPreviewChapterBody(activePreviewChapter)}
              </section>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

