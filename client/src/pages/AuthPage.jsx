import "./AuthPage.css";

export default function AuthPage({
  gradient,
  authMode,
  setAuthMode,
  signupStep,
  setSignupStep,
  setAuthError,
  go,
  onAuthSubmit,
  authForm,
  onAuthChange,
  signupProfileForm,
  onSignupProfileChange,
  signupHeightUnit,
  setSignupHeightUnit,
  signupWeightUnit,
  setSignupWeightUnit,
  toCmFromFeetInches,
  toFeetInchesFromCm,
  toKg,
  toLb,
  showPassword,
  setShowPassword,
  authLoading,
  authError
}) {
  const setSignupField = (name, value) => {
    onSignupProfileChange({ target: { name, value } });
  };

  return (
    <div className="page auth-page" style={gradient}>
      <header className="title">
        <h1>AI Workout Studio</h1>
        <p className="muted">
          {authMode === "signup" && signupStep === "profile"
            ? "Step 2 of 2: add your profile details."
            : "Sign in to unlock advanced planning."}
        </p>
      </header>
      <main className="auth-card">
        <div className="auth-card-top">
          <div className="segmented">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => {
                setAuthMode("login");
                setSignupStep("credentials");
                setAuthError("");
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={authMode === "signup" ? "active" : ""}
              onClick={() => {
                setAuthMode("signup");
                setSignupStep("credentials");
                setAuthError("");
              }}
            >
              Sign up
            </button>
          </div>
          <button
            type="button"
            className="ghost icon-button auth-close"
            onClick={() => go("/")}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <form className="form auth-form" onSubmit={onAuthSubmit}>
          {!(authMode === "signup" && signupStep === "profile") && (
            <label>
              Email
              <input
                name="email"
                type="email"
                value={authForm.email}
                onChange={onAuthChange}
                placeholder="you@email.com"
                required
              />
            </label>
          )}
          {authMode === "signup" && signupStep === "profile" && (
            <>
              <label>
                Full name
                <input
                  name="name"
                  value={signupProfileForm.name}
                  onChange={onSignupProfileChange}
                  placeholder="Jordan Lee"
                  required
                />
              </label>
              <label>
                Age
                <input
                  name="age"
                  type="number"
                  min="10"
                  max="120"
                  value={signupProfileForm.age}
                  onChange={onSignupProfileChange}
                  placeholder="28"
                  required
                />
              </label>
              <label>
                <span className="label-row">
                  Height ({signupHeightUnit === "cm" ? "cm" : "ft/in"})
                  <span className="unit-toggle" role="group" aria-label="Height units">
                    <button
                      type="button"
                      className={signupHeightUnit === "cm" ? "active" : ""}
                      onClick={() => {
                        setSignupField(
                          "heightCm",
                          toCmFromFeetInches(
                            signupProfileForm.heightFeet,
                            signupProfileForm.heightInches
                          )
                        );
                        setSignupHeightUnit("cm");
                      }}
                    >
                      cm
                    </button>
                    <button
                      type="button"
                      className={signupHeightUnit === "ft" ? "active" : ""}
                      onClick={() => {
                        const next = toFeetInchesFromCm(signupProfileForm.heightCm);
                        setSignupField("heightFeet", next.feet);
                        setSignupField("heightInches", next.inches);
                        setSignupHeightUnit("ft");
                      }}
                    >
                      ft/in
                    </button>
                  </span>
                </span>
                {signupHeightUnit === "cm" ? (
                  <input
                    name="heightCm"
                    type="number"
                    min="100"
                    max="260"
                    value={signupProfileForm.heightCm}
                    onChange={onSignupProfileChange}
                    placeholder="175"
                    required
                  />
                ) : (
                  <div className="height-split">
                    <input
                      name="heightFeet"
                      type="number"
                      min="3"
                      max="8"
                      value={signupProfileForm.heightFeet}
                      onChange={onSignupProfileChange}
                      placeholder="5"
                      required
                    />
                    <span className="muted">ft</span>
                    <input
                      name="heightInches"
                      type="number"
                      min="0"
                      max="11"
                      value={signupProfileForm.heightInches}
                      onChange={onSignupProfileChange}
                      placeholder="9"
                      required
                    />
                    <span className="muted">in</span>
                  </div>
                )}
              </label>
              <label>
                <span className="label-row">
                  Weight ({signupWeightUnit})
                  <span className="unit-toggle" role="group" aria-label="Weight units">
                    <button
                      type="button"
                      className={signupWeightUnit === "kg" ? "active" : ""}
                      onClick={() => {
                        setSignupField("weight", toKg(signupProfileForm.weight, signupWeightUnit));
                        setSignupWeightUnit("kg");
                      }}
                    >
                      kg
                    </button>
                    <button
                      type="button"
                      className={signupWeightUnit === "lb" ? "active" : ""}
                      onClick={() => {
                        setSignupField("weight", toLb(signupProfileForm.weight, signupWeightUnit));
                        setSignupWeightUnit("lb");
                      }}
                    >
                      lb
                    </button>
                  </span>
                </span>
                <input
                  name="weight"
                  type="number"
                  min={signupWeightUnit === "kg" ? "25" : "55"}
                  max={signupWeightUnit === "kg" ? "400" : "882"}
                  value={signupProfileForm.weight}
                  onChange={onSignupProfileChange}
                  placeholder={signupWeightUnit === "kg" ? "72" : "160"}
                  required
                />
              </label>
              <label>
                Sex
                <select
                  name="sex"
                  value={signupProfileForm.sex}
                  onChange={onSignupProfileChange}
                  required
                >
                  <option value="">Select</option>
                  <option>Female</option>
                  <option>Male</option>
                  <option>Non-binary</option>
                  <option>Prefer not to say</option>
                </select>
              </label>
              <label>
                Activity level
                <select
                  name="activity"
                  value={signupProfileForm.activity}
                  onChange={onSignupProfileChange}
                >
                  <option>Light</option>
                  <option>Moderate</option>
                  <option>High</option>
                  <option>Very high</option>
                </select>
              </label>
              <label className="full">
                Notes
                <input
                  name="notes"
                  value={signupProfileForm.notes}
                  onChange={onSignupProfileChange}
                  placeholder="Optional training context"
                />
              </label>
            </>
          )}
          {!(authMode === "signup" && signupStep === "profile") && (
            <label>
              <span className="label-row">
                Password
                <button
                  type="button"
                  className="ghost ghost-inline"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                value={authForm.password}
                onChange={onAuthChange}
                placeholder="********"
                required
              />
            </label>
          )}
          <button className="cta" type="submit" disabled={authLoading}>
            {authLoading
              ? "Working..."
              : authMode === "login"
              ? "Login"
              : signupStep === "credentials"
              ? "Continue"
              : "Save profile"}
          </button>
        </form>
        {authError && <p className="error">{authError}</p>}
      </main>
    </div>
  );
}
