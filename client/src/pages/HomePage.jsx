import { useEffect, useMemo, useRef, useState } from "react";
import { animate, createTimeline } from "animejs";
import PhysiqueSilhouette2D from "../components/PhysiqueSilhouette2D";
import "./HomePage.css";

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
  const [homeStage, setHomeStage] = useState("intro");
  const [stageDirection, setStageDirection] = useState("forward");
  const stageOrder = {
    intro: 0,
    personal: 1,
    visualizer: 2,
    workout: 3
  };

  const goToStage = (nextStage) => {
    if (nextStage === homeStage) return;
    const nextOrder = stageOrder[nextStage] ?? 0;
    const currentOrder = stageOrder[homeStage] ?? 0;
    setStageDirection(nextOrder >= currentOrder ? "forward" : "backward");
    setHomeStage(nextStage);
  };

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

  const bmi = (() => {
    if (!resolvedHeightCm || !resolvedWeightKg) return null;
    const heightMeters = resolvedHeightCm / 100;
    return Number((resolvedWeightKg / (heightMeters * heightMeters)).toFixed(1));
  })();

  const hasValidName = Boolean(personal.name?.trim());
  const ageValue = toFiniteNumber(personal.age);
  const hasValidAge = ageValue !== null && ageValue >= 10 && ageValue <= 99;
  const isPersonalComplete = hasValidName &&
    hasValidAge &&
    resolvedHeightCm !== null &&
    resolvedWeightKg !== null &&
    Boolean(personal.sex);

  const onPersonalSubmit = (event) => {
    event.preventDefault();
    if (!isPersonalComplete) return;
    goToStage("visualizer");
  };

  const explicitBodyFat = (() => {
    const value = toFiniteNumber(personal.bodyFat);
    return value === null ? null : clamp(value, 3, 60);
  })();

  const estimatedBodyFat = (() => {
    if (bmi === null) return null;
    const estimate = 1.35 * bmi - 13.5;
    return roundTo(clamp(estimate, 3, 60), 1);
  })();
  const effectiveBodyFat = explicitBodyFat ?? estimatedBodyFat;
  const bmiMassScore = bmi !== null ? clamp((bmi - 18.5) / (40 - 18.5), 0, 1) : 0.45;
  const bodyFatMassScore = effectiveBodyFat !== null
    ? clamp((effectiveBodyFat - 8) / (42 - 8), 0, 1)
    : null;
  const fatScore = clamp(
    (bodyFatMassScore !== null ? bodyFatMassScore : bmiMassScore) * 0.72 +
      bmiMassScore * 0.28,
    0,
    1
  );

  const heightNorm = resolvedHeightCm
    ? clamp((resolvedHeightCm - 150) / (205 - 150), 0, 1)
    : 0.48;
  const shoulderHalf = clamp(
    35 + bmiMassScore * 6 + fatScore * 11,
    30,
    72
  );
  const chestHalf = clamp(28 + bmiMassScore * 7 + fatScore * 12, 22, 62);
  const waistHalf = clamp(
    14 + bmiMassScore * 5 + fatScore * 22,
    11,
    52
  );
  const hipHalf = clamp(22 + bmiMassScore * 5 + fatScore * 14, 18, 56);
  const thighHalf = clamp(15 + bmiMassScore * 3.5 + fatScore * 15, 13, 46);
  const calfHalf = clamp(11.5 + bmiMassScore * 2 + fatScore * 10, 10, 34);
  const armWidth = clamp(8.5 + bmiMassScore * 2 + fatScore * 11, 8, 24);
  const armHeight = clamp(156 + heightNorm * 28, 146, 194);
  const headRadius = clamp(18 + fatScore * 2.6, 16, 28);

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

  const fillHue = 24 - fatScore * 4;
  const fillSaturation = clamp(44 + fatScore * 18, 40, 82);
  const fillLightness = clamp(56 - fatScore * 10, 36, 68);
  const strokeLightness = clamp(fillLightness - 24, 20, 48);
  const glowSaturation = clamp(fillSaturation + 8, 46, 94);
  const glowAlpha = clamp(0.08 + fatScore * 0.12, 0.06, 0.24);
  const glowRadius = clamp(112 + waistHalf * 0.7 + hipHalf * 0.45, 118, 176);

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
    if (homeStage !== "visualizer" || !visualPanelRef.current) return undefined;

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
  }, [homeStage]);

  const visualLabel = "T-pose contact points with finger joints, limb joints, 45 degree leg stance, and shoulder-to-pelvis torso triangle guide.";

  return (
    <div className="page home-page" style={gradient}>
      {homeStage === "intro" ? (
        <main className="content home-intro-wrap">
          <section className={`panel home-intro-panel home-stage stage-${stageDirection}`}>
            <h1>Workout Generator</h1>
            <button
              className="cta"
              type="button"
              onClick={() => goToStage("personal")}
            >
              Get Started
            </button>
          </section>
        </main>
      ) : (
        <>
          <main className="content">
            <div key={homeStage} className={`home-stage home-stage-${homeStage} stage-${stageDirection}`}>
              {homeStage === "personal" && (
                <section className="panel personal-panel stage-panel">
                  <header className="stage-header">
                    <div className="stage-header-main">
                      <h2>Personal Info</h2>
                    </div>
                    <div className={`segmented ${personalMode === "advanced" ? "pos-1" : "pos-0"}`}>
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
                    <div className="form-auth-actions">
                      {user ? (
                        <>
                          <span className="muted">Signed in as {user.email}</span>
                          <button type="button" className="ghost" onClick={onLogout}>
                            Log out
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => go("/auth")}
                        >
                          Login / Sign up
                        </button>
                      )}
                    </div>
                  </header>

                  <form
                    className={`form personal-form ${personalMode === "advanced" ? "advanced-mode" : "basic-mode"}`}
                    onSubmit={onPersonalSubmit}
                  >
                    <label className="field-name">
                Full name
                <input
                  name="name"
                  value={personal.name}
                  onChange={onPersonalChange}
                  placeholder="Jordan Lee"
                />
              </label>
                    <label className="field-age">
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
              <label className="field-sex">
                Sex
                <select name="sex" value={personal.sex} onChange={onPersonalChange}>
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </label>

              <div className="advanced-fields-wrap" aria-hidden={personalMode !== "advanced"}>
                <div className="advanced-fields-inner">
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
                </div>
                </div>
                    <div className="personal-footer full">
                      {!isPersonalComplete && (
                        <p className="muted personal-hint">
                          Enter name, age, height, weight, and sex to continue.
                        </p>
                      )}
                      <div className="stage-actions">
                        <button
                          type="button"
                          className="ghost back-btn"
                          onClick={() => goToStage("intro")}
                        >
                          Back
                        </button>
                        <button
                          className="cta"
                          type="submit"
                          disabled={!isPersonalComplete}
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  </form>
                </section>
              )}

              {homeStage === "visualizer" && (
                <section className="visualizer-only-stage">
                  <div className="panel body-visual-panel stage-panel visualizer-only-panel" ref={visualPanelRef}>
                    <h2>Physique Visualizer</h2>
                    <div className="body-visual">
                      <div className="body-visual-layout">
                        <div className="visual-stage-shell">
                          <div className="visual-stage" role="img" aria-label={visualLabel}>
                            <div className="physique-render-surface">
                              <PhysiqueSilhouette2D shape={silhouetteShape} />
                            </div>
                          </div>
                        </div>
                      </div>
                      <p className="muted physique-footnote">
                        T-pose scaffold with detailed finger and joint points, 45 degree leg stance, and torso triangle.
                      </p>
                    </div>
                    <div className="visualizer-only-actions">
                      <button
                        type="button"
                        className="ghost back-btn"
                        onClick={() => goToStage("personal")}
                      >
                        Back
                      </button>
                      <button
                        className="cta"
                        type="button"
                        onClick={() => goToStage("workout")}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                </section>
              )}

              {homeStage === "workout" && (
                <>
                  <section className="panel center-panel stage-panel workout-stage-panel">
                    <div className="workout-header">
                      <button
                        type="button"
                        className="ghost back-btn workout-back-arrow"
                        aria-label="Back"
                        onClick={() => goToStage("visualizer")}
                      >
                        {"\u2190"}
                      </button>
                      <h2>Workout Generation</h2>
                    </div>
                    <div className="stage-actions workout-generate-row">
                      <button className="cta" type="button" onClick={openPlannerFromProfile}>
                        Generate Workout
                      </button>
                    </div>
                    {error && <p className="error">{error}</p>}
                  </section>

                  <section className="panel muted-panel stage-panel">
                    <h2>Sample Weekly Plan</h2>
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
                </>
              )}
            </div>
          </main>
        </>
      )}

      {plannerModal}
      {generatedPlanModal}

    </div>
  );
}
