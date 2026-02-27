import { useEffect, useMemo, useRef, useState } from "react";
import { animate, createTimeline } from "animejs";
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
  const previewStepTimelineRef = useRef(null);
  const previewFillTimeoutsRef = useRef([]);
  const previewStageRef = useRef(null);
  const [previewStepIndex, setPreviewStepIndex] = useState(0);
  const [previewFilledFields, setPreviewFilledFields] = useState({});
  const [previewPersonalCollapsed, setPreviewPersonalCollapsed] = useState(false);

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
    }
  ];

  const activePreviewChapter = previewChapters[previewStepIndex] || previewChapters[0];

  const clearPreviewFillTimers = () => {
    if (!previewFillTimeoutsRef.current.length) return;
    previewFillTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
      window.clearInterval(timeoutId);
    });
    previewFillTimeoutsRef.current = [];
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

  const renderPreviewPersonalInfoChapter = () => {
    const getFieldValue = (fieldKey) => (
      typeof previewFilledFields[fieldKey] === "string" ? previewFilledFields[fieldKey] : ""
    );
    const previewTrainingDays = Array.isArray(previewFilledFields.trainingDays)
      ? previewFilledFields.trainingDays
      : [];

    return (
      <div className={`preview-personal-form-shell ${previewPersonalCollapsed ? "is-collapsed" : ""}`}>
        <div className="preview-personal-morph-surface" aria-hidden="true">
          <span className="preview-personal-morph-label">Personal Info</span>
        </div>
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
    );
  };

  const renderPreviewChapterBody = (chapter) => (
    chapter.id === "personal-info" ? (
      renderPreviewPersonalInfoChapter()
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
    setPreviewStepIndex(boundedIndex);
  };

  const pulsePreviewControl = (event) => {
    const controlEl = event?.currentTarget;
    if (!controlEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animate(controlEl, {
      scale: [1, 0.92, 1],
      duration: 360,
      ease: "inOutQuad"
    });
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
    setPreviewStepIndex(0);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollPreviewIntoView);
    });
  }, []);

  useEffect(() => {
    const markAllFilled = () => {
      const nextFilled = {};
      previewFillOrder.forEach((fieldKey) => {
        if (fieldKey === "trainingDays") {
          nextFilled[fieldKey] = Array.isArray(previewPersonalTargets.trainingDays)
            ? [...previewPersonalTargets.trainingDays]
            : [];
          return;
        }
        nextFilled[fieldKey] = String(previewPersonalTargets[fieldKey] ?? "");
      });
      setPreviewFilledFields(nextFilled);
    };

    clearPreviewFillTimers();
    setPreviewPersonalCollapsed(false);

    if (activePreviewChapter.id !== "personal-info") {
      setPreviewFilledFields({});
      setPreviewPersonalCollapsed(false);
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      markAllFilled();
      setPreviewPersonalCollapsed(false);
      return undefined;
    }

    setPreviewFilledFields({});
    setPreviewPersonalCollapsed(false);
    let latestCompletionMs = 0;

    previewFillOrder.forEach((fieldKey, index) => {
      const fieldStartMs = previewFillStartDelayMs + index * previewFillStepMs;
      const timeoutId = window.setTimeout(() => {
        if (fieldKey === "trainingDays") {
          const trainingDays = Array.isArray(previewPersonalTargets.trainingDays)
            ? previewPersonalTargets.trainingDays
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

        const targetValue = String(previewPersonalTargets[fieldKey] ?? "");
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
        const trainingDays = Array.isArray(previewPersonalTargets.trainingDays)
          ? previewPersonalTargets.trainingDays
          : [];
        const revealMs = trainingDays.length > 0
          ? (trainingDays.length - 1) * PREVIEW_TRAINING_DAY_STEP_MS
          : 0;
        latestCompletionMs = Math.max(latestCompletionMs, fieldStartMs + revealMs);
        return;
      }

      const targetValue = String(previewPersonalTargets[fieldKey] ?? "");
      if (!targetValue || PREVIEW_INSTANT_FIELDS.has(fieldKey)) {
        latestCompletionMs = Math.max(latestCompletionMs, fieldStartMs);
        return;
      }

      const typingStepMs = getPreviewTypingStepMs(targetValue.length);
      latestCompletionMs = Math.max(latestCompletionMs, fieldStartMs + (targetValue.length * typingStepMs));
    });

    const collapseTimeoutId = window.setTimeout(() => {
      setPreviewPersonalCollapsed(true);
    }, latestCompletionMs + PREVIEW_COLLAPSE_DELAY_MS);
    previewFillTimeoutsRef.current.push(collapseTimeoutId);

    return () => {
      clearPreviewFillTimers();
    };
  }, [
    activePreviewChapter.id,
    previewFillOrder,
    previewFillStartDelayMs,
    previewFillStepMs,
    previewPersonalTargets
  ]);

  useEffect(() => {
    if (!previewStageRef.current) return undefined;

    const stageEl = previewStageRef.current;
    const activePageEl = stageEl.querySelector(".preview-card-page.active");
    if (!activePageEl) return undefined;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    previewStepTimelineRef.current?.cancel();

    if (prefersReducedMotion) return undefined;

    const timeline = createTimeline({
      defaults: { ease: "outCubic" }
    });

    timeline.add(activePageEl, {
      opacity: [0, 1],
      translateY: [16, 0],
      scale: [0.988, 1],
      duration: 760
    });

    const activeChip = stageEl.querySelector(".preview-jump-chip.active");
    if (activeChip) {
      timeline.add(activeChip, {
        scale: [1, 1.02, 1],
        duration: 620,
        ease: "inOutSine"
      }, "-=320");
    }

    previewStepTimelineRef.current = timeline;
    return () => {
      timeline.cancel();
    };
  }, [previewStepIndex, activePreviewChapter.id]);

  useEffect(
    () => () => {
      previewStepTimelineRef.current?.cancel();
      clearPreviewFillTimers();
    },
    []
  );

  return (
    <section ref={previewStageRef} className="panel preview-stage-panel stage-panel">
      <header className="preview-stage-header">
        <p className="preview-stage-kicker">Guided walkthrough</p>
        <div className="preview-stage-title-row">
          <h2>{activePreviewChapter.title}</h2>
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
              className={`preview-jump-chip ${index === previewStepIndex ? "active" : ""}`}
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
              activePreviewChapter.id === "personal-info" && previewPersonalCollapsed
                ? "is-personal-collapsed"
                : ""
            }`}
          >
            <div className="preview-card-pages">
              {previewChapters.map((chapter, chapterIndex) => (
                <section
                  key={`preview-card-page-${chapter.id}`}
                  className={`preview-card-page ${chapterIndex === previewStepIndex ? "active" : ""}`}
                  aria-hidden={chapterIndex !== previewStepIndex}
                >
                  {renderPreviewChapterBody(chapter)}
                </section>
              ))}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
