import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import AuthPage from "../AuthPage";

const baseProps = {
  gradient: {},
  authMode: "login",
  onAuthModeChange: vi.fn(),
  go: vi.fn(),
  onAuthSubmit: vi.fn((event) => event.preventDefault()),
  authForm: { email: "user@example.com", password: "password123" },
  onAuthChange: vi.fn(),
  signupProfileForm: {
    firstName: "Jordan",
    lastName: "Lee",
    age: "28",
    sex: "Male",
    heightCm: "175",
    heightFeet: "5",
    heightInches: "9",
    weight: "160",
    activity: "Moderate",
    notes: ""
  },
  onSignupProfileChange: vi.fn(),
  signupHeightUnit: "ft",
  setSignupHeightUnit: vi.fn(),
  signupWeightUnit: "lb",
  setSignupWeightUnit: vi.fn(),
  toCmFromFeetInches: vi.fn(() => "175"),
  toFeetInchesFromCm: vi.fn(() => ({ feet: "5", inches: "9" })),
  toKg: vi.fn(() => "73"),
  toLb: vi.fn(() => "160"),
  showPassword: false,
  setShowPassword: vi.fn(),
  authAutoSignIn: false,
  setAuthAutoSignIn: vi.fn(),
  authLoading: false,
  authError: ""
};

describe("AuthPage", () => {
  test("renders login mode and handles close/password/remember actions", async () => {
    const user = userEvent.setup();
    const go = vi.fn();
    const setShowPassword = vi.fn();
    const setAuthAutoSignIn = vi.fn();

    render(
      <AuthPage
        {...baseProps}
        go={go}
        setShowPassword={setShowPassword}
        setAuthAutoSignIn={setAuthAutoSignIn}
      />
    );

    expect(screen.getByText(/sign in to continue your journey/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(go).toHaveBeenCalledWith("/");

    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(setShowPassword).toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox"));
    expect(setAuthAutoSignIn).toHaveBeenCalledWith(true);
  });

  test("renders signup mode and triggers conversion + submit callbacks", async () => {
    const user = userEvent.setup();
    const setSignupHeightUnit = vi.fn();
    const setSignupWeightUnit = vi.fn();
    const onSignupProfileChange = vi.fn();
    const onAuthSubmit = vi.fn((event) => event.preventDefault());
    const onAuthModeChange = vi.fn();

    render(
      <AuthPage
        {...baseProps}
        authMode="signup"
        onAuthModeChange={onAuthModeChange}
        setSignupHeightUnit={setSignupHeightUnit}
        setSignupWeightUnit={setSignupWeightUnit}
        onSignupProfileChange={onSignupProfileChange}
        onAuthSubmit={onAuthSubmit}
      />
    );

    expect(screen.getByText(/create your account and complete your profile/i)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "cm" }));
    expect(onSignupProfileChange).toHaveBeenCalled();
    expect(setSignupHeightUnit).toHaveBeenCalledWith("cm");

    await user.click(screen.getByRole("button", { name: "kg" }));
    expect(setSignupWeightUnit).toHaveBeenCalledWith("kg");

    await user.click(screen.getByRole("button", { name: /login/i }));
    expect(onAuthModeChange).toHaveBeenCalledWith("login");

    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(onAuthSubmit).toHaveBeenCalled();
  });

  // The signup form lets a visitor switch units mid-entry, and switching has to
  // carry the value across rather than reinterpret it -- 175 cm becoming "175
  // lb" is the kind of thing nothing else would catch. Every toggle reports its
  // conversion through onSignupProfileChange, so the calls are what is asserted.
  const renderSignup = (overrides = {}) =>
    render(<AuthPage {...baseProps} authMode="signup" {...overrides} />);

  const fieldWrites = (onSignupProfileChange) =>
    onSignupProfileChange.mock.calls.map(([event]) => [event.target.name, event.target.value]);

  // These buttons sit inside a <label>, so their accessible name is the label's
  // text rather than their own ("Height Height units", not "ft/in"). Picked by
  // text content within their own group instead.
  const unitButton = (group, text) =>
    within(screen.getByRole("group", { name: group }))
      .getAllByRole("button")
      .find((button) => button.textContent === text);

  describe("switching height units", () => {
    test("moving to feet and inches converts what was typed in centimetres", () => {
      const onSignupProfileChange = vi.fn();
      const setSignupHeightUnit = vi.fn();
      const toFeetInchesFromCm = vi.fn(() => ({ feet: "5", inches: "11" }));
      renderSignup({
        signupHeightUnit: "cm",
        onSignupProfileChange,
        setSignupHeightUnit,
        toFeetInchesFromCm,
        signupProfileForm: { ...baseProps.signupProfileForm, heightCm: "180" }
      });

      fireEvent.click(unitButton("Height units", "ft/in"));

      expect(toFeetInchesFromCm).toHaveBeenCalledWith("180");
      expect(fieldWrites(onSignupProfileChange)).toEqual([
        ["heightFeet", "5"],
        ["heightInches", "11"]
      ]);
      expect(setSignupHeightUnit).toHaveBeenCalledWith("ft");
    });

    test("moving to centimetres converts the feet and inches already entered", () => {
      const onSignupProfileChange = vi.fn();
      const setSignupHeightUnit = vi.fn();
      const toCmFromFeetInches = vi.fn(() => "180");
      renderSignup({
        signupHeightUnit: "ft",
        onSignupProfileChange,
        setSignupHeightUnit,
        toCmFromFeetInches,
        signupProfileForm: { ...baseProps.signupProfileForm, heightFeet: "5", heightInches: "11" }
      });

      fireEvent.click(unitButton("Height units", "cm"));

      expect(toCmFromFeetInches).toHaveBeenCalledWith("5", "11");
      expect(fieldWrites(onSignupProfileChange)).toEqual([["heightCm", "180"]]);
      expect(setSignupHeightUnit).toHaveBeenCalledWith("cm");
    });

    test.each([
      ["ft", "heightFeet"],
      ["cm", "heightCm"]
    ])("%s is the unit that decides which input is shown", (signupHeightUnit, shownField) => {
      renderSignup({ signupHeightUnit });

      expect(document.querySelector(`[name="${shownField}"]`)).toBeTruthy();
      const hidden = shownField === "heightCm" ? "heightFeet" : "heightCm";
      expect(document.querySelector(`[name="${hidden}"]`)).toBeNull();
    });

    test.each([
      ["ft", "pos-0", "ft/in"],
      ["cm", "pos-1", "cm"]
    ])("%s marks the toggle and its own button", (signupHeightUnit, position, activeLabel) => {
      renderSignup({ signupHeightUnit });
      const group = screen.getByRole("group", { name: "Height units" });

      expect(group.className).toContain(position);
      expect(unitButton("Height units", activeLabel).className).toContain("active");
      const other = activeLabel === "cm" ? "ft/in" : "cm";
      expect(unitButton("Height units", other).className).not.toContain("active");
    });
  });

  describe("switching weight units", () => {
    test.each([
      ["lb", "toLb"],
      ["kg", "toKg"]
    ])("moving to %s converts through the matching helper", (target, helper) => {
      const onSignupProfileChange = vi.fn();
      const setSignupWeightUnit = vi.fn();
      const converter = vi.fn(() => "999");
      const from = target === "lb" ? "kg" : "lb";
      renderSignup({
        signupWeightUnit: from,
        onSignupProfileChange,
        setSignupWeightUnit,
        [helper]: converter,
        signupProfileForm: { ...baseProps.signupProfileForm, weight: "72" }
      });

      fireEvent.click(unitButton("Weight units", target));

      // The value and the unit it is currently in both have to reach the
      // converter, or it cannot know which way to go.
      expect(converter).toHaveBeenCalledWith("72", from);
      expect(fieldWrites(onSignupProfileChange)).toEqual([["weight", "999"]]);
      expect(setSignupWeightUnit).toHaveBeenCalledWith(target);
    });

    test.each([
      ["lb", "pos-0"],
      ["kg", "pos-1"]
    ])("%s marks the toggle", (signupWeightUnit, position) => {
      renderSignup({ signupWeightUnit });

      expect(screen.getByRole("group", { name: "Weight units" }).className).toContain(position);
      expect(unitButton("Weight units", signupWeightUnit).className).toContain("active");
    });

    test.each([
      ["kg", "25", "400", "72"],
      ["lb", "55", "882", "160"]
    ])("%s sets its own bounds and example", (signupWeightUnit, min, max, placeholder) => {
      // The bounds are the unit's, so leaving them behind would let a visitor
      // enter 60 lb or reject a legitimate 300 lb.
      renderSignup({ signupWeightUnit });
      const input = document.querySelector('[name="weight"]');

      expect(input.getAttribute("min")).toBe(min);
      expect(input.getAttribute("max")).toBe(max);
      expect(input.getAttribute("placeholder")).toBe(placeholder);
    });
  });

  describe("the password field", () => {
    test.each([
      [false, "password", "Show password"],
      [true, "text", "Hide password"]
    ])("with showPassword %s the field is %s", (showPassword, type, label) => {
      render(<AuthPage {...baseProps} showPassword={showPassword} />);
      const button = screen.getByRole("button", { name: label });

      expect(document.querySelector('[name="password"]').getAttribute("type")).toBe(type);
      expect(button.getAttribute("aria-pressed")).toBe(String(showPassword));
    });

    test("the two states show different icons", () => {
      const { container: hidden } = render(<AuthPage {...baseProps} showPassword={false} />);
      const { container: shown } = render(<AuthPage {...baseProps} showPassword />);
      const iconOf = (root) => root.querySelector(".password-visibility-btn svg").innerHTML.length;

      expect(iconOf(hidden)).not.toBe(iconOf(shown));
    });
  });

  describe("the submit button", () => {
    test.each([
      ["login", false, "Login"],
      ["signup", false, "Create Account"],
      ["login", true, "Working..."],
      ["signup", true, "Working..."]
    ])("in %s mode with loading %s it reads %s", (authMode, authLoading, expected) => {
      // Scoped to the submit button: "Login" also appears on the control that
      // switches modes, so a document-wide query finds the wrong one.
      const { container } = render(
        <AuthPage {...baseProps} authMode={authMode} authLoading={authLoading} />
      );

      expect(container.querySelector('button[type="submit"].cta').textContent).toBe(expected);
    });

    test("is disabled only while working", () => {
      render(<AuthPage {...baseProps} authLoading />);
      expect(screen.getByRole("button", { name: "Working..." })).toBeDisabled();
    });

    test("spans the form in signup mode and not in login mode", () => {
      const { container: signup } = render(<AuthPage {...baseProps} authMode="signup" />);
      const { container: login } = render(<AuthPage {...baseProps} authMode="login" />);

      expect(signup.querySelector('button[type="submit"].cta').className).toContain("full");
      expect(login.querySelector('button[type="submit"].cta').className).not.toContain("full");
    });
  });

  describe("reporting a failure", () => {
    test("shows the error it is given", () => {
      render(<AuthPage {...baseProps} authError="Those details did not match." />);

      expect(screen.getByText("Those details did not match.")).toBeInTheDocument();
    });

    test("shows nothing when there is no error", () => {
      const { container } = render(<AuthPage {...baseProps} authError="" />);

      expect(container.querySelector(".error")).toBeNull();
    });
  });

  describe("switching between login and signup", () => {
    const modeButton = (text) =>
      [...document.querySelectorAll(".auth-mode-switch button, .auth-tabs button, button")].find(
        (button) => button.textContent === text && button.getAttribute("type") === "button"
      );

    test.each([
      ["Login", "login"],
      ["Sign Up", "signup"]
    ])("%s asks the parent for the %s mode", (text, mode) => {
      const onAuthModeChange = vi.fn();
      render(<AuthPage {...baseProps} authMode="login" onAuthModeChange={onAuthModeChange} />);

      fireEvent.click(modeButton(text));

      expect(onAuthModeChange).toHaveBeenCalledWith(mode);
    });

    test.each([
      ["login", "Login"],
      ["signup", "Sign Up"]
    ])("in %s mode the %s tab is the active one", (authMode, activeText) => {
      render(<AuthPage {...baseProps} authMode={authMode} />);

      expect(modeButton(activeText).className).toContain("active");
      const other = activeText === "Login" ? "Sign Up" : "Login";
      expect(modeButton(other).className).not.toContain("active");
    });
  });
});
