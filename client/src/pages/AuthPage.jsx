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
  showPassword,
  setShowPassword,
  authLoading,
  authError
}) {
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
                />
              </label>
              <label>
                Height (cm)
                <input
                  name="heightCm"
                  type="number"
                  min="100"
                  max="260"
                  value={signupProfileForm.heightCm}
                  onChange={onSignupProfileChange}
                  placeholder="175"
                />
              </label>
              <label>
                Weight (kg)
                <input
                  name="weightKg"
                  type="number"
                  min="25"
                  max="400"
                  value={signupProfileForm.weightKg}
                  onChange={onSignupProfileChange}
                  placeholder="72"
                />
              </label>
              <label>
                Sex
                <select
                  name="sex"
                  value={signupProfileForm.sex}
                  onChange={onSignupProfileChange}
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
