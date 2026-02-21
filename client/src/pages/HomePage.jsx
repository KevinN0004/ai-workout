import { useEffect, useMemo, useRef, useState } from "react";
import { animate, createTimeline } from "animejs";
import PhysiqueSilhouette2D from "../components/PhysiqueSilhouette2D";
import "./HomePage.css";

const BODY_PART_SEQUENCE = ["head", "leftArm", "rightArm", "upper", "lower"];
const ACTIVE_PART_LABELS = {
  head: "Head and neck",
  leftArm: "Left arm",
  rightArm: "Right arm",
  upper: "Torso",
  lower: "Lower body"
};

export default function HomePage({
  gradient,
  user,
  onLogout,
  go,
  quickFocuses,
  form,
  toggleFocus,
  personalMode,
  setPersonalMode,
  personal,
  onPersonalChange,
  heightUnit,
  setHeightUnit,
  toCmFromFeetInches,
  toFeetInchesFromCm,
  setPersonal,
  weightUnit,
  setWeightUnit,
  toKg,
  toLb,
  openPlannerFromProfile,
  error,
  samplePlan,
  plannerModal,
  generatedPlanModal
}) {
  const trainingDayOptions = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  const toggleTrainingDay = (day) => {
    setPersonal((prev) => {
      const selectedDays = Array.isArray(prev.trainingDays) ? prev.trainingDays : [];
      const isSelected = selectedDays.includes(day);
      return {
        ...prev,
        trainingDays: isSelected
          ? selectedDays.filter((item) => item !== day)
          : [...selectedDays, day]
      };
    });
  };

  const visualPanelRef = useRef(null);
  const introTimelineRef = useRef(null);
  const stagePulseRef = useRef(null);
  const [activeBodyPart, setActiveBodyPart] = useState("head");

  const toFiniteNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const roundTo = (value, decimals = 1) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  };

  const resolvedHeightCm = (() => {
    const fromCmInput = toFiniteNumber(personal.heightCm);
    const fromImperialInput = toFiniteNumber(
      toCmFromFeetInches(personal.heightFeet, personal.heightInches)
    );
    const picked = heightUnit === "ft"
      ? fromImperialInput ?? fromCmInput
      : fromCmInput ?? fromImperialInput;
    return picked && picked > 0 ? picked : null;
  })();

  const resolvedWeightKg = (() => {
    const normalized = toFiniteNumber(toKg(personal.weight, weightUnit));
    return normalized && normalized > 0 ? normalized : null;
  })();

  const ageValue = (() => {
    const parsed = toFiniteNumber(personal.age);
    return parsed && parsed > 0 ? parsed : null;
  })();

  const bmi = (() => {
    if (!resolvedHeightCm || !resolvedWeightKg) return null;
    const heightMeters = resolvedHeightCm / 100;
    return Number((resolvedWeightKg / (heightMeters * heightMeters)).toFixed(1));
  })();

  const getBmiCategory = (value) => {
    if (value === null) return { label: "No BMI yet", tone: "neutral" };
    if (value < 18.5) return { label: "Underweight", tone: "cool" };
    if (value < 25) return { label: "Healthy range", tone: "good" };
    if (value < 30) return { label: "Overweight", tone: "warm" };
    return { label: "Obesity range", tone: "alert" };
  };

  const sexValue = String(personal.sex || "").toLowerCase();
  const isFemale = sexValue.includes("female");
  const isMale = sexValue.includes("male") && !isFemale;
  const sexFactor = isFemale ? 0 : isMale ? 1 : 0.5;
  const explicitBodyFat = (() => {
    const value = toFiniteNumber(personal.bodyFat);
    return value === null ? null : clamp(value, 3, 60);
  })();

  const estimatedBodyFat = (() => {
    if (bmi === null || ageValue === null) return null;
    const estimate = 1.2 * bmi + 0.23 * ageValue - 10.8 * sexFactor - 5.4;
    return roundTo(clamp(estimate, 3, 60), 1);
  })();
  const effectiveBodyFat = explicitBodyFat ?? estimatedBodyFat;
  const fatRange = isFemale
    ? { lean: 16, high: 44 }
    : isMale
      ? { lean: 8, high: 34 }
      : { lean: 12, high: 39 };

  const activityScoreMap = {
    Light: 0.25,
    Moderate: 0.45,
    High: 0.65,
    "Very high": 0.8
  };

  const trainingDaysCount = Array.isArray(personal.trainingDays)
    ? personal.trainingDays.length
    : 0;
  const hasStrengthFocus = form.focuses.includes("Strength");
  const hasWeightLossFocus = form.focuses.includes("Weight Loss");
  const hasCardioFocus = form.focuses.includes("Cardio");
  const activityScore = clamp(
    (activityScoreMap[personal.activity] ?? 0.45) + trainingDaysCount * 0.03,
    0,
    1
  );

  const bmiMassScore = bmi !== null ? clamp((bmi - 18.5) / (34 - 18.5), 0, 1) : 0.45;
  const bodyFatMassScore = effectiveBodyFat !== null
    ? clamp((effectiveBodyFat - fatRange.lean) / (fatRange.high - fatRange.lean), 0, 1)
    : null;
  const fatScore = clamp(
    (bodyFatMassScore !== null ? bodyFatMassScore : bmiMassScore) * 0.78 +
      bmiMassScore * 0.22,
    0,
    1
  );

  const leanMassKg = resolvedWeightKg && effectiveBodyFat !== null
    ? resolvedWeightKg * (1 - effectiveBodyFat / 100)
    : null;
  const ffmi = (() => {
    if (!leanMassKg || !resolvedHeightCm) return null;
    const heightM = resolvedHeightCm / 100;
    return roundTo(leanMassKg / (heightM * heightM), 1);
  })();
  const ffmiRange = isFemale
    ? { low: 13, high: 21 }
    : isMale
      ? { low: 15, high: 25 }
      : { low: 14, high: 23 };
  const ffmiScore = ffmi !== null
    ? clamp((ffmi - ffmiRange.low) / (ffmiRange.high - ffmiRange.low), 0, 1)
    : null;
  const experienceBoost = personal.experience === "Advanced"
    ? 0.08
    : personal.experience === "Intermediate"
      ? 0.04
      : 0;
  const nutritionBoost = personal.nutrition === "High-protein" ? 0.04 : 0;
  const muscleScore = clamp(
    (ffmiScore !== null ? ffmiScore : activityScore) * 0.62 +
      activityScore * 0.24 +
      (hasStrengthFocus ? 0.12 : 0) +
      experienceBoost +
      nutritionBoost -
      (hasWeightLossFocus ? 0.05 : 0),
    0,
    1
  );
  const leannessScore = clamp(
    (1 - fatScore) * 0.74 +
      (hasWeightLossFocus || hasCardioFocus ? 0.2 : 0) -
      (hasStrengthFocus ? 0.04 : 0),
    0,
    1
  );

  const heightNorm = resolvedHeightCm
    ? clamp((resolvedHeightCm - 150) / (205 - 150), 0, 1)
    : 0.48;
  const shoulderFrameOffset = isMale ? 2.5 : isFemale ? -1.5 : 0.5;
  const shoulderHalf = clamp(
    38 + shoulderFrameOffset + muscleScore * 24 + leannessScore * 3 - fatScore * 2,
    31,
    72
  );
  const chestHalf = clamp(31 + muscleScore * 16 + fatScore * 7, 24, 60);
  const waistHalf = clamp(
    17.5 + fatScore * 18 - muscleScore * 3 - leannessScore * 4 + (isFemale ? 1.8 : 0),
    13,
    48
  );
  const hipHalf = clamp(27 + fatScore * 10 + (isFemale ? 7 : 2), 22, 55);
  const thighHalf = clamp(20 + fatScore * 8 + muscleScore * 7 + (isFemale ? 1.5 : 0), 16, 45);
  const calfHalf = clamp(thighHalf * 0.67 + muscleScore * 1.2, 13, 32);
  const armWidth = clamp(10.5 + muscleScore * 7 + fatScore * 2.5, 9, 24);
  const armHeight = clamp(158 + heightNorm * 26, 148, 192);
  const headRadius = clamp(19 + fatScore * 2 + (isFemale ? 0.7 : 0), 17, 27);

  const legBias = (heightNorm - 0.5) * 18;
  const torsoBias = (heightNorm - 0.5) * 8;
  const shoulderY = 100 - torsoBias * 0.4;
  const chestY = 143 + torsoBias * 0.2;
  const waistY = 218 + torsoBias + legBias * 0.1;
  const hipY = 266 + torsoBias + legBias * 0.24;
  const thighY = 319 + legBias * 0.55;
  const calfY = 372 + legBias * 0.84;
  const ankleY = 412 + legBias;
  const headCenterY = 57 - torsoBias * 0.3;

  const fillHue = 18 + leannessScore * 24 + muscleScore * 5;
  const fillSaturation = clamp(53 + muscleScore * 18 - fatScore * 8, 40, 88);
  const fillLightness = clamp(51 + leannessScore * 13 - fatScore * 5, 40, 74);
  const strokeLightness = clamp(fillLightness - 24, 20, 48);
  const glowSaturation = clamp(fillSaturation + 8, 46, 94);
  const glowAlpha = clamp(0.1 + muscleScore * 0.06 + leannessScore * 0.03, 0.08, 0.24);
  const glowRadius = clamp(114 + shoulderHalf * 0.6 + hipHalf * 0.3, 118, 170);

  const silhouetteShape = useMemo(
    () => ({
      shoulderHalf,
      chestHalf,
      waistHalf,
      hipHalf,
      thighHalf,
      calfHalf,
      armWidth,
      armHeight,
      headRadius,
      shoulderY,
      chestY,
      waistY,
      hipY,
      thighY,
      calfY,
      ankleY,
      headCenterY,
      fillHue,
      fillSaturation,
      fillLightness,
      strokeLightness,
      glowSaturation,
      glowAlpha,
      glowRadius
    }),
    [
      shoulderHalf,
      chestHalf,
      waistHalf,
      hipHalf,
      thighHalf,
      calfHalf,
      armWidth,
      armHeight,
      headRadius,
      shoulderY,
      chestY,
      waistY,
      hipY,
      thighY,
      calfY,
      ankleY,
      headCenterY,
      fillHue,
      fillSaturation,
      fillLightness,
      strokeLightness,
      glowSaturation,
      glowAlpha,
      glowRadius
    ]
  );

  useEffect(() => {
    if (!visualPanelRef.current) return undefined;

    introTimelineRef.current?.cancel();
    stagePulseRef.current?.cancel();

    const stageEl = visualPanelRef.current.querySelector(".visual-stage");
    const renderSurfaceEl = visualPanelRef.current.querySelector(".physique-render-surface");
    if (!stageEl || !renderSurfaceEl) return undefined;

    introTimelineRef.current = createTimeline({
      defaults: { ease: "outCubic", duration: 360 }
    })
      .add(stageEl, { opacity: [0.42, 1], scale: [0.97, 1], duration: 380 })
      .add(
        renderSurfaceEl,
        {
          opacity: [0.6, 1],
          scale: [0.93, 1],
          duration: 460
        },
        "<<+=50"
      );

    stagePulseRef.current = animate(renderSurfaceEl, {
      scaleX: [1, 0.994, 1],
      scaleY: [1, 1.01, 1],
      duration: 4300,
      delay: 520,
      ease: "inOutSine",
      loop: true
    });

    return () => {
      introTimelineRef.current?.cancel();
      stagePulseRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    let partIndex = 0;
    setActiveBodyPart(BODY_PART_SEQUENCE[partIndex]);
    const cycleId = window.setInterval(() => {
      partIndex = (partIndex + 1) % BODY_PART_SEQUENCE.length;
      setActiveBodyPart(BODY_PART_SEQUENCE[partIndex]);
    }, 980);

    return () => {
      window.clearInterval(cycleId);
    };
  }, []);

  const bmiCategory = getBmiCategory(bmi);
  const physiqueType = (() => {
    if (muscleScore > 0.72 && leannessScore > 0.55) return "Athletic";
    if (muscleScore > 0.74) return "Power";
    if (leannessScore > 0.64) return "Lean";
    if (fatScore > 0.72) return "Mass";
    return "Balanced";
  })();
  const activePartLabel = ACTIVE_PART_LABELS[activeBodyPart] || "Head and neck";

  const visualLabel = bmi !== null
    ? `Physique silhouette: ${physiqueType.toLowerCase()} profile. BMI ${bmi}, ${bmiCategory.label}. Active region ${activePartLabel.toLowerCase()}.`
    : `Physique silhouette preview. Active region ${activePartLabel.toLowerCase()}. Add height and weight for a personalized shape.`;

  return (
    <div className="page home-page" style={gradient}>
      <header className="title">
        <div className="header-top">
          <div className="header-left">
            <h1>Workout Generator</h1>
          </div>
          <div className="auth-actions">
            {user ? (
              <>
                <span className="muted">Signed in as {user.email}</span>
                <button type="button" className="ghost" onClick={onLogout}>
                  Log out
                </button>
              </>
            ) : (
              <button type="button" className="ghost" onClick={() => go("/auth")}>
                Login / Sign up
              </button>
            )}
          </div>
        </div>
        <div className="focus-row">
          {quickFocuses.map((item) => (
            <button
              key={item}
              type="button"
              className={`pill ${form.focuses.includes(item) ? "active" : ""}`}
              onClick={() => toggleFocus(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <main className="content">
        <section className="split-panel">
          <div className="panel personal-panel">
            <header className="personal-panel-header">
              <h2>Personal Info</h2>
              <div className="segmented">
                <button
                  type="button"
                  className={personalMode === "basic" ? "active" : ""}
                  onClick={() => setPersonalMode("basic")}
                >
                  Basic
                </button>
                <button
                  type="button"
                  className={personalMode === "advanced" ? "active" : ""}
                  onClick={() => setPersonalMode("advanced")}
                >
                  Advanced
                </button>
              </div>
            </header>

            <form
              className={`form personal-form ${personalMode === "advanced" ? "advanced-mode" : "basic-mode"}`}
            >
              <label>
                Full name
                <input
                  name="name"
                  value={personal.name}
                  onChange={onPersonalChange}
                  placeholder="Jordan Lee"
                />
              </label>
              <label>
                Age
                <input
                  name="age"
                  value={personal.age}
                  onChange={onPersonalChange}
                  type="number"
                  min="10"
                  max="99"
                  placeholder="28"
                />
              </label>
              <label className="metric-field metric-height">
                <span className="label-row">
                  Height
                  <span
                    className="unit-toggle"
                    role="group"
                    aria-label="Height units"
                  >
                    <button
                      type="button"
                      className={heightUnit === "ft" ? "active" : ""}
                      onClick={() => {
                        const next = toFeetInchesFromCm(personal.heightCm);
                        setPersonal((prev) => ({
                          ...prev,
                          heightFeet: next.feet,
                          heightInches: next.inches
                        }));
                        setHeightUnit("ft");
                      }}
                    >
                      ft/in
                    </button>
                    <button
                      type="button"
                      className={heightUnit === "cm" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          heightCm: toCmFromFeetInches(
                            prev.heightFeet,
                            prev.heightInches
                          )
                        }));
                        setHeightUnit("cm");
                      }}
                    >
                      cm
                    </button>
                  </span>
                </span>
                {heightUnit === "cm" ? (
                  <input
                    name="heightCm"
                    value={personal.heightCm}
                    onChange={onPersonalChange}
                    type="number"
                    min="120"
                    max="230"
                    placeholder="175"
                  />
                ) : (
                  <div className="height-split">
                    <div className="height-field">
                      <input
                        name="heightFeet"
                        value={personal.heightFeet}
                        onChange={onPersonalChange}
                        type="number"
                        min="3"
                        max="7"
                        placeholder="5"
                      />
                      <span className="height-unit">ft</span>
                    </div>
                    <div className="height-field">
                      <input
                        name="heightInches"
                        value={personal.heightInches}
                        onChange={onPersonalChange}
                        type="number"
                        min="0"
                        max="11"
                        placeholder="9"
                      />
                      <span className="height-unit">in</span>
                    </div>
                  </div>
                )}
              </label>
              <label className="metric-field">
                <span className="label-row">
                  Weight
                  <span className="unit-toggle" role="group" aria-label="Weight units">
                    <button
                      type="button"
                      className={weightUnit === "lb" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          weight: toLb(prev.weight, weightUnit)
                        }));
                        setWeightUnit("lb");
                      }}
                    >
                      lb
                    </button>
                    <button
                      type="button"
                      className={weightUnit === "kg" ? "active" : ""}
                      onClick={() => {
                        setPersonal((prev) => ({
                          ...prev,
                          weight: toKg(prev.weight, weightUnit)
                        }));
                        setWeightUnit("kg");
                      }}
                    >
                      kg
                    </button>
                  </span>
                </span>
                <input
                  name="weight"
                  value={personal.weight}
                  onChange={onPersonalChange}
                  type="number"
                  min={weightUnit === "kg" ? "35" : "77"}
                  max={weightUnit === "kg" ? "200" : "440"}
                  placeholder={weightUnit === "kg" ? "72" : "160"}
                />
              </label>
              <label>
                Sex
                <select name="sex" value={personal.sex} onChange={onPersonalChange}>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </label>

              {personalMode === "advanced" && (
                <>
                  <label>
                    Activity level
                    <select
                      name="activity"
                      value={personal.activity}
                      onChange={onPersonalChange}
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
                      value={personal.sleep}
                      onChange={onPersonalChange}
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
                    <input
                      name="timeline"
                      value={personal.timeline}
                      onChange={onPersonalChange}
                      placeholder="Example: 12 weeks to lose 10 lb"
                    />
                  </label>
                  <label>
                    Training experience
                    <select
                      name="experience"
                      value={personal.experience}
                      onChange={onPersonalChange}
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
                      value={personal.nutrition}
                      onChange={onPersonalChange}
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
                      value={personal.cardio}
                      onChange={onPersonalChange}
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
                      {trainingDayOptions.map((day) => {
                        const isSelected = Array.isArray(personal.trainingDays) &&
                          personal.trainingDays.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            className={`day-toggle-btn ${isSelected ? "active" : ""}`}
                            onClick={() => toggleTrainingDay(day)}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </label>
                  <label className="full">
                    Additional Info
                    <input
                      name="notes"
                      value={personal.notes}
                      onChange={onPersonalChange}
                      placeholder="Past training, dietary restrictions, illness"
                    />
                  </label>
                </>
              )}
            </form>
          </div>

          <div className="panel body-visual-panel" ref={visualPanelRef}>
            <h2>Physique Visualizer</h2>
            <div className="body-visual">
              <div className="body-visual-layout">
                <div className="visual-stage-shell">
                  <div className="visual-stage" role="img" aria-label={visualLabel}>
                    <div className="physique-render-surface">
                      <PhysiqueSilhouette2D
                        shape={silhouetteShape}
                        activePart={activeBodyPart}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <p className="muted physique-footnote">
                {physiqueType} profile preview. Active region: {activePartLabel}.
              </p>
            </div>
          </div>
        </section>

        <section className="panel center-panel">
          <div>
            <h2>Design your plan</h2>
          </div>
          <button className="cta" type="button" onClick={openPlannerFromProfile}>
            Create
          </button>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel muted-panel">
          <h2>Sample  weekly plan</h2>
          <div className="grid">
            {samplePlan.map((block) => (
              <article key={block.day} className="plan-card">
                <h3>{block.day}</h3>
                <ul>
                  {block.blocks.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </main>

      {plannerModal}
      {generatedPlanModal}

    </div>
  );
}
