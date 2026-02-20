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
          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Personal Info</h2>
              </div>
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
            </div>

            <form className="form personal-form">
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
              <label>
                <span className="label-row">
                  Height ({heightUnit === "cm" ? "cm" : "ft/in"})
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
                    <input
                      name="heightFeet"
                      value={personal.heightFeet}
                      onChange={onPersonalChange}
                      type="number"
                      min="3"
                      max="7"
                      placeholder="5"
                    />
                    <span className="muted">ft</span>
                    <input
                      name="heightInches"
                      value={personal.heightInches}
                      onChange={onPersonalChange}
                      type="number"
                      min="0"
                      max="11"
                      placeholder="9"
                    />
                    <span className="muted">in</span>
                  </div>
                )}
              </label>
              <label>
                <span className="label-row">
                  Weight ({weightUnit})
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
                    Additional Info
                    <input
                      name="notes"
                      value={personal.notes}
                      onChange={onPersonalChange}
                      placeholder="Past training, dietary restrictions, ilness"
                    />
                  </label>
                </>
              )}
            </form>
          </div>

          <div className="panel body-visual-panel">
            <h2>Physique</h2>
            <div className="body-visual">
              <div className="body-frame" aria-hidden="true" />
              <p className="muted">Body type visual placeholder</p>
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
