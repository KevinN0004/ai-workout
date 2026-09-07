import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import AuthPage from "./AuthPage";

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
});
