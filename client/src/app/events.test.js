import { beforeEach, describe, expect, test, vi } from "vitest";
import { createAppEventHandlers } from "./events";
import { defaultAuthForm, defaultSignupProfileForm } from "./constants";
import { toCmFromFeetInches, toFeetInchesFromCm, toKg } from "./units";

// The auth and sign-out handlers out of app/events.js, which was at 39%.
// These decide what the client does with a session: what it sends to the auth
// endpoints, and what it clears when a user signs out.
//
// The unit conversions are the real ones from units.js, since the signup body
// is built from them and a stub would prove nothing about what gets sent.

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

let deps;

const build = (overrides = {}) => createAppEventHandlers({ ...deps, ...overrides });

const submitEvent = () => ({ preventDefault: vi.fn() });

beforeEach(() => {
  deps = {
    apiFetch: vi.fn(async () => jsonResponse({ user: { id: "u-1" } })),
    form: {},
    setLoading: vi.fn(),
    setError: vi.fn(),
    setResult: vi.fn(),
    setDashboard: vi.fn(),
    closePlanner: vi.fn(),
    isDashboardRoute: false,
    setPlanModalOpen: vi.fn(),
    setDashView: vi.fn(),
    go: vi.fn(),
    personal: {},
    heightUnit: "cm",
    weightUnit: "kg",
    setAuthForm: vi.fn(),
    setAuthMode: vi.fn(),
    setAuthError: vi.fn(),
    setShowPassword: vi.fn(),
    setAuthAutoSignIn: vi.fn(),
    setSignupHeightUnit: vi.fn(),
    setSignupWeightUnit: vi.fn(),
    setSignupProfileForm: vi.fn(),
    toCmFromFeetInches,
    toFeetInchesFromCm,
    toKg,
    result: "",
    authMode: "login",
    setAuthLoading: vi.fn(),
    signupProfileForm: { ...defaultSignupProfileForm },
    signupHeightUnit: "cm",
    signupWeightUnit: "kg",
    authForm: { email: "person@example.com", password: "StrongPass123!" },
    setUser: vi.fn(),
    authAutoSignIn: false,
    clearOptimisticOperations: vi.fn(),
    clearDashboardDataState: vi.fn(),
    clearDashboardToast: vi.fn(),
    resetPersonalFlow: vi.fn(),
    queueOptimisticLogCommit: vi.fn(),
    workoutForm: { exercises: "" },
    setWorkoutForm: vi.fn(),
    setWorkoutModalOpen: vi.fn(),
    calorieForm: {},
    setCalorieForm: vi.fn(),
    goalForm: {},
    setDashError: vi.fn(),
    showDashboardToast: vi.fn(),
    mealLogForm: {},
    setMealLogForm: vi.fn(),
    progressForm: {},
    setProgressForm: vi.fn()
  };
});

describe("onLogout", () => {
  test("tells the server to end the session", async () => {
    await build().onLogout();

    expect(deps.apiFetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });

  test("clears the signed-in user and sends them home", async () => {
    await build().onLogout();

    expect(deps.setUser).toHaveBeenCalledWith(null);
    expect(deps.go).toHaveBeenCalledWith("/");
  });

  // Everything holding the previous account's data has to go, or the next
  // person at the same browser sees it.
  test("clears every piece of local dashboard state", async () => {
    await build().onLogout();

    expect(deps.clearOptimisticOperations).toHaveBeenCalledTimes(1);
    expect(deps.clearDashboardDataState).toHaveBeenCalledTimes(1);
    expect(deps.clearDashboardToast).toHaveBeenCalledTimes(1);
    expect(deps.resetPersonalFlow).toHaveBeenCalledTimes(1);
  });

  // Signing out locally must not depend on the request succeeding. A user who
  // clicks Log out on a shared machine, with the network down or the CSRF
  // token unobtainable, still expects their data off the screen.
  describe("when the request fails", () => {
    const failing = () => ({
      apiFetch: vi.fn(async () => {
        throw new Error("network down");
      })
    });

    test("does not reject at the caller", async () => {
      await expect(build(failing()).onLogout()).resolves.toBeUndefined();
    });

    test("still signs the user out locally", async () => {
      await build(failing()).onLogout();

      expect(deps.setUser).toHaveBeenCalledWith(null);
      expect(deps.go).toHaveBeenCalledWith("/");
    });

    test("still clears the dashboard data", async () => {
      await build(failing()).onLogout();

      expect(deps.clearOptimisticOperations).toHaveBeenCalledTimes(1);
      expect(deps.clearDashboardDataState).toHaveBeenCalledTimes(1);
      expect(deps.clearDashboardToast).toHaveBeenCalledTimes(1);
      expect(deps.resetPersonalFlow).toHaveBeenCalledTimes(1);
    });

    // apiFetch throws before sending anything when it cannot get a CSRF token,
    // which is the other way a sign-out can fail.
    test("still signs out when no csrf token could be obtained", async () => {
      const handlers = build({
        apiFetch: vi.fn(async () => {
          throw new Error("Security token unavailable. Refresh and try again.");
        })
      });

      await handlers.onLogout();

      expect(deps.setUser).toHaveBeenCalledWith(null);
      expect(deps.clearDashboardDataState).toHaveBeenCalledTimes(1);
    });
  });
});

describe("onAuthSubmit", () => {
  describe("signing in", () => {
    test("posts the credentials to the login endpoint", async () => {
      const event = submitEvent();

      await build().onAuthSubmit(event);

      expect(event.preventDefault).toHaveBeenCalled();
      const [url, options] = deps.apiFetch.mock.calls[0];
      expect(url).toBe("/api/auth/login");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body)).toMatchObject({
        email: "person@example.com",
        password: "StrongPass123!"
      });
    });

    test("passes the remember-me choice through", async () => {
      await build({ authAutoSignIn: true }).onAuthSubmit(submitEvent());

      expect(JSON.parse(deps.apiFetch.mock.calls[0][1].body).rememberMe).toBe(true);
    });

    test("stores the returned user and moves to the dashboard", async () => {
      await build().onAuthSubmit(submitEvent());

      expect(deps.setUser).toHaveBeenCalledWith({ id: "u-1" });
      expect(deps.go).toHaveBeenCalledWith("/dashboard");
    });

    // The password must not be left sitting in component state afterwards.
    test("empties the credentials form", async () => {
      await build().onAuthSubmit(submitEvent());

      expect(deps.setAuthForm).toHaveBeenCalledWith({ ...defaultAuthForm });
    });

    test("reports the server's message and stays put on a rejection", async () => {
      const handlers = build({
        apiFetch: vi.fn(async () => jsonResponse({ error: "Invalid credentials." }, false))
      });

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("Invalid credentials.");
      expect(deps.setUser).not.toHaveBeenCalled();
      expect(deps.go).not.toHaveBeenCalled();
    });

    test("falls back to a generic message when the body is unreadable", async () => {
      const handlers = build({
        apiFetch: vi.fn(async () => ({
          ok: false,
          json: async () => {
            throw new Error("not json");
          }
        }))
      });

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("Unable to authenticate.");
    });

    test("reports a network failure rather than hanging", async () => {
      const handlers = build({
        apiFetch: vi.fn(async () => {
          throw new Error("network down");
        })
      });

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("network down");
    });

    // The button has to come back regardless of the outcome.
    test.each([
      ["success", async () => jsonResponse({ user: { id: "u-1" } })],
      ["rejection", async () => jsonResponse({ error: "no" }, false)],
      [
        "network failure",
        async () => {
          throw new Error("network down");
        }
      ]
    ])("clears the loading flag after a %s", async (_label, apiFetch) => {
      await build({ apiFetch: vi.fn(apiFetch) }).onAuthSubmit(submitEvent());

      expect(deps.setAuthLoading).toHaveBeenNthCalledWith(1, true);
      expect(deps.setAuthLoading).toHaveBeenLastCalledWith(false);
    });

    test("tolerates a success body with no user on it", async () => {
      const handlers = build({ apiFetch: vi.fn(async () => jsonResponse({})) });

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setUser).toHaveBeenCalledWith(null);
    });
  });

  describe("signing up", () => {
    const signupDeps = (overrides = {}) => ({
      authMode: "signup",
      signupProfileForm: {
        ...defaultSignupProfileForm,
        firstName: "Jordan",
        lastName: "Kim",
        heightFeet: "5",
        heightInches: "10",
        weight: "168"
      },
      signupHeightUnit: "ft",
      signupWeightUnit: "lb",
      ...overrides
    });

    const bodyOf = () => JSON.parse(deps.apiFetch.mock.calls[0][1].body);

    test("posts to the signup endpoint", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(deps.apiFetch.mock.calls[0][0]).toBe("/api/auth/signup");
    });

    // The form collects feet and inches but the API stores centimetres, so the
    // conversion has to happen before the body is built.
    test("converts an imperial height to centimetres", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(bodyOf().profile.heightCm).toBe("178");
    });

    test("converts an imperial weight to kilograms", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(bodyOf().profile.weightKg).toBe("76");
    });

    test("leaves a metric height and weight alone", async () => {
      await build(
        signupDeps({
          signupHeightUnit: "cm",
          signupWeightUnit: "kg",
          signupProfileForm: {
            ...defaultSignupProfileForm,
            heightCm: "178",
            weight: "76"
          }
        })
      ).onAuthSubmit(submitEvent());

      expect(bodyOf().profile.heightCm).toBe("178");
      expect(bodyOf().profile.weightKg).toBe("76");
    });

    test("sends the credentials alongside the profile", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(bodyOf()).toMatchObject({
        email: "person@example.com",
        password: "StrongPass123!"
      });
      expect(bodyOf().profile.firstName).toBe("Jordan");
    });

    test("clears both forms and resets the unit choices on success", async () => {
      await build(signupDeps()).onAuthSubmit(submitEvent());

      expect(deps.setAuthForm).toHaveBeenCalledWith({ ...defaultAuthForm });
      expect(deps.setSignupProfileForm).toHaveBeenCalledWith({ ...defaultSignupProfileForm });
      expect(deps.setSignupHeightUnit).toHaveBeenCalledWith("ft");
      expect(deps.setSignupWeightUnit).toHaveBeenCalledWith("lb");
      expect(deps.go).toHaveBeenCalledWith("/dashboard");
    });

    test("reports the server's message and keeps the form on a rejection", async () => {
      const handlers = build(
        signupDeps({
          apiFetch: vi.fn(async () => jsonResponse({ error: "Account already exists." }, false))
        })
      );

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("Account already exists.");
      expect(deps.setSignupProfileForm).not.toHaveBeenCalled();
      expect(deps.go).not.toHaveBeenCalled();
    });

    test("falls back to a signup-specific message", async () => {
      const handlers = build(
        signupDeps({
          apiFetch: vi.fn(async () => ({
            ok: false,
            json: async () => {
              throw new Error("not json");
            }
          }))
        })
      );

      await handlers.onAuthSubmit(submitEvent());

      expect(deps.setAuthError).toHaveBeenCalledWith("Unable to create account.");
    });
  });
});

describe("onAuthModeChange", () => {
  test("switches the mode and drops any standing error", () => {
    build({ authMode: "login" }).onAuthModeChange("signup");

    expect(deps.setAuthMode).toHaveBeenCalledWith("signup");
    expect(deps.setAuthError).toHaveBeenCalledWith("");
  });

  // Switching away from a half-filled form should not leave the password or
  // the profile behind for the other mode.
  test("empties both forms when the mode actually changes", () => {
    build({ authMode: "login" }).onAuthModeChange("signup");

    expect(deps.setAuthForm).toHaveBeenCalledWith({ ...defaultAuthForm });
    expect(deps.setSignupProfileForm).toHaveBeenCalledWith({ ...defaultSignupProfileForm });
    expect(deps.setAuthAutoSignIn).toHaveBeenCalledWith(false);
    expect(deps.setShowPassword).toHaveBeenCalledWith(false);
  });

  // Re-selecting the mode already showing must not wipe what is being typed.
  test("leaves the forms alone when the mode is unchanged", () => {
    build({ authMode: "login" }).onAuthModeChange("login");

    expect(deps.setAuthMode).toHaveBeenCalledWith("login");
    expect(deps.setAuthError).toHaveBeenCalledWith("");
    expect(deps.setAuthForm).not.toHaveBeenCalled();
    expect(deps.setSignupProfileForm).not.toHaveBeenCalled();
    expect(deps.setShowPassword).not.toHaveBeenCalled();
  });
});

describe("form field handlers", () => {
  const changeEvent = (name, value) => ({ target: { name, value } });

  test("onAuthChange updates only the named field", () => {
    build().onAuthChange(changeEvent("email", "new@example.com"));

    const updater = deps.setAuthForm.mock.calls[0][0];
    expect(updater({ email: "old@example.com", password: "keep" })).toEqual({
      email: "new@example.com",
      password: "keep"
    });
  });

  test("onSignupProfileChange updates only the named field", () => {
    build().onSignupProfileChange(changeEvent("firstName", "Jordan"));

    const updater = deps.setSignupProfileForm.mock.calls[0][0];
    expect(updater({ firstName: "", lastName: "Kim" })).toEqual({
      firstName: "Jordan",
      lastName: "Kim"
    });
  });
});
