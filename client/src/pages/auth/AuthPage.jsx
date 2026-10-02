/**
 * The /auth page: one form for logging in and for signing up, the sign-up mode
 * adding the profile fields above the email and password. Rendered by App.
 */
import { APP_BRAND_EXPANSION, APP_BRAND_NAME } from "../../app/constants";
import "./AuthPage.css";

/**
 * Renders App's auth and sign-up state and calls back into App for every
 * change and for the submit; it holds no state of its own. In login mode the
 * profile fields stay rendered but hidden, and their fieldset is disabled, so
 * their `required` does not block a login. The ft/in button fills feet and
 * inches from the centimetres field and the cm button does the reverse; the lb
 * and kg buttons convert the weight from the unit in use. All four use App's
 * converters from app/units.js. `gradient` is App's page background, and the
 * close button goes home through `go`.
 */
export default function AuthPage({
  gradient,
  authMode,
  onAuthModeChange,
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
  authAutoSignIn,
  setAuthAutoSignIn,
  authLoading,
  authError
}) {
  // Writes one sign-up field through App's change handler, shaped as the
  // change event it expects.
  const setSignupField = (name, value) => {
    onSignupProfileChange({ target: { name, value } });
  };
  const isSignupMode = authMode === "signup";

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="page auth-page home-page" style={gradient}>
      <header className="title">
        <h1>{APP_BRAND_NAME}</h1>
        <p className="muted">
          {isSignupMode
            ? `Create your account and complete your profile in ${APP_BRAND_EXPANSION}.`
            : `Sign in to continue your journey in ${APP_BRAND_NAME}.`}
        </p>
      </header>
      <main className="content auth-content">
        <section className={`panel auth-card ${isSignupMode ? "auth-card-profile" : ""}`}>
          {/* ---- Login or Sign Up, and close ---- */}
          <div className="auth-card-top">
            <div className={`segmented auth-mode-toggle ${isSignupMode ? "pos-1" : "pos-0"}`}>
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => {
                  onAuthModeChange("login");
                }}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => {
                  onAuthModeChange("signup");
                }}
              >
                Sign Up
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
          <form
            className={`form auth-form ${isSignupMode ? "auth-mode-signup" : "auth-mode-login"}`}
            onSubmit={onAuthSubmit}
          >
            {/* ---- Sign-up profile fields, hidden and disabled in login mode ---- */}
            <div
              className={`auth-signup-fields-wrap ${isSignupMode ? "active" : ""}`}
              aria-hidden={!isSignupMode}
            >
              <div className="auth-signup-fields-inner">
                <fieldset className="auth-signup-fields-grid" disabled={!isSignupMode}>
                  <label>
                    First name
                    <input
                      name="firstName"
                      value={signupProfileForm.firstName}
                      onChange={onSignupProfileChange}
                      placeholder="Jordan"
                      required
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      name="lastName"
                      value={signupProfileForm.lastName}
                      onChange={onSignupProfileChange}
                      placeholder="Lee"
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
                  {/* ---- Height, in centimetres or in feet and inches ---- */}
                  <label>
                    <span className="label-row">
                      Height
                      <span
                        className={`unit-toggle ${signupHeightUnit === "cm" ? "pos-1" : "pos-0"}`}
                        role="group"
                        aria-label="Height units"
                      >
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
                        <div className="height-field">
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
                          <span className="height-unit">ft</span>
                        </div>
                        <div className="height-field">
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
                          <span className="height-unit">in</span>
                        </div>
                      </div>
                    )}
                  </label>
                  {/* ---- Weight, in kilograms or pounds ---- */}
                  <label>
                    <span className="label-row">
                      Weight
                      <span
                        className={`unit-toggle ${signupWeightUnit === "kg" ? "pos-1" : "pos-0"}`}
                        role="group"
                        aria-label="Weight units"
                      >
                        <button
                          type="button"
                          className={signupWeightUnit === "lb" ? "active" : ""}
                          onClick={() => {
                            setSignupField(
                              "weight",
                              toLb(signupProfileForm.weight, signupWeightUnit)
                            );
                            setSignupWeightUnit("lb");
                          }}
                        >
                          lb
                        </button>
                        <button
                          type="button"
                          className={signupWeightUnit === "kg" ? "active" : ""}
                          onClick={() => {
                            setSignupField(
                              "weight",
                              toKg(signupProfileForm.weight, signupWeightUnit)
                            );
                            setSignupWeightUnit("kg");
                          }}
                        >
                          kg
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
                    <textarea
                      name="notes"
                      value={signupProfileForm.notes}
                      onChange={onSignupProfileChange}
                      placeholder="Optional training context"
                      rows="3"
                    />
                  </label>
                </fieldset>
              </div>
            </div>

            {/* ---- Email and password, for both modes ---- */}
            <label className={isSignupMode ? "full" : ""}>
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

            <label className={isSignupMode ? "full" : ""}>
              Password
              <div className="password-field-wrap">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={authForm.password}
                  onChange={onAuthChange}
                  placeholder="********"
                  required
                />
                <button
                  type="button"
                  className="password-visibility-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M3 3L21 21"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M10.6 10.7a2 2 0 0 0 2.7 2.7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9.5 5.4A10.8 10.8 0 0 1 12 5c5.5 0 9.5 4.3 10.5 6.9a12.6 12.6 0 0 1-3.1 4.4M6.1 7.3A13.9 13.9 0 0 0 1.5 11.9C2.5 14.5 6.5 18.8 12 18.8c1.5 0 2.9-.3 4.1-.8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M1.5 12c1-2.6 5-6.9 10.5-6.9S21.5 9.4 22.5 12c-1 2.6-5 6.9-10.5 6.9S2.5 14.6 1.5 12Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            {/* ---- Remember me (login only), submit, and the error ---- */}
            {!isSignupMode && (
              <label className="auto-signin-toggle">
                <input
                  type="checkbox"
                  checked={authAutoSignIn}
                  onChange={(e) => setAuthAutoSignIn(e.target.checked)}
                />
                <span>Remember me</span>
              </label>
            )}
            <button
              className={`cta ${isSignupMode ? "full" : ""}`}
              type="submit"
              disabled={authLoading}
            >
              {authLoading ? "Working..." : authMode === "login" ? "Login" : "Create Account"}
            </button>
          </form>
          {authError && <p className="error">{authError}</p>}
        </section>
      </main>
    </div>
  );
}
