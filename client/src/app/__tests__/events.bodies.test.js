import { beforeEach, describe, expect, test, vi } from "vitest";
import { createAppEventHandlers } from "../events";
import { defaultPersonalForm, defaultSignupProfileForm } from "../constants";
import { toCmFromFeetInches, toFeetInchesFromCm, toKg } from "../units";

// The exact JSON each handler sends, as a string, so key order is pinned as
// well as every value. Each was pinned against the inline code before its body
// moved to requestBodies.js (roadmap D1 phase 2), and the move kept them.

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body });

const submitEvent = () => ({ preventDefault: vi.fn() });

// The body of the nth request the handlers sent.
const sentBody = (call = 0) => deps.apiFetch.mock.calls[call][1].body;

let deps;

const build = (overrides = {}) => createAppEventHandlers({ ...deps, ...overrides });

beforeEach(() => {
  deps = {
    apiFetch: vi.fn(async () => jsonResponse({ user: { id: "u-1" }, profile: {} })),
    go: vi.fn(),
    toCmFromFeetInches,
    toFeetInchesFromCm,
    toKg,
    heightUnit: "cm",
    weightUnit: "kg",
    authMode: "login",
    authForm: { email: "a@b.co", password: "password1" },
    authAutoSignIn: false,
    signupProfileForm: { ...defaultSignupProfileForm },
    signupHeightUnit: "cm",
    signupWeightUnit: "kg",
    setAuthForm: vi.fn(),
    setAuthLoading: vi.fn(),
    setAuthError: vi.fn(),
    setSignupProfileForm: vi.fn(),
    setSignupHeightUnit: vi.fn(),
    setSignupWeightUnit: vi.fn(),
    setUser: vi.fn(),
    setDashError: vi.fn(),
    showDashboardToast: vi.fn(),
    captureAccount: () => () => true,
    flushOptimisticOperations: vi.fn(async () => {}),
    clearOptimisticOperations: vi.fn(),
    clearDashboardDataState: vi.fn(),
    clearDashboardToast: vi.fn(),
    resetPersonalFlow: vi.fn()
  };
});

describe("account bodies", () => {
  test("sign-up in feet and pounds sends the profile in cm and kg", async () => {
    await build({
      authMode: "signup",
      signupProfileForm: {
        ...defaultSignupProfileForm,
        firstName: "Sam",
        heightFeet: "5",
        heightInches: "10",
        weight: "170"
      },
      signupHeightUnit: "ft",
      signupWeightUnit: "lb"
    }).onAuthSubmit(submitEvent());

    expect(sentBody()).toBe(
      '{"email":"a@b.co","password":"password1","profile":{"firstName":"Sam","lastName":"",' +
        '"age":"","heightCm":"178","heightFeet":"5","heightInches":"10","weight":"170",' +
        '"weightKg":"77","sex":"","bodyFat":"","activity":"Moderate","notes":""}}'
    );
  });

  test("sign-up in cm and kg falls back to weightKg when weight is blank", async () => {
    await build({
      authMode: "signup",
      signupProfileForm: { ...defaultSignupProfileForm, heightCm: "180", weightKg: "80" }
    }).onAuthSubmit(submitEvent());

    expect(sentBody()).toBe(
      '{"email":"a@b.co","password":"password1","profile":{"firstName":"","lastName":"",' +
        '"age":"","heightCm":"180","heightFeet":"","heightInches":"","weight":"",' +
        '"weightKg":"80","sex":"","bodyFat":"","activity":"Moderate","notes":""}}'
    );
  });

  test.each([
    [true, '{"email":"a@b.co","password":"password1","rememberMe":true}'],
    [false, '{"email":"a@b.co","password":"password1","rememberMe":false}']
  ])("sign-in with keep-me-signed-in %s", async (authAutoSignIn, expected) => {
    await build({ authAutoSignIn }).onAuthSubmit(submitEvent());

    expect(sentBody()).toBe(expected);
  });

  test("a password change", async () => {
    await build().changePassword({ currentPassword: "old-pass", newPassword: "new-pass-123" });

    expect(sentBody()).toBe('{"currentPassword":"old-pass","newPassword":"new-pass-123"}');
  });

  test("an account delete", async () => {
    await build().deleteAccount("old-pass");

    expect(sentBody()).toBe('{"password":"old-pass"}');
  });

  test("a profile save in cm and kg", async () => {
    const draft = { ...defaultPersonalForm, name: "Sam Fields", age: "30", heightCm: "180" };
    await build().submitProfile({ ...draft, weight: "80" }, { heightUnit: "cm", weightUnit: "kg" });

    expect(sentBody()).toBe(
      '{"firstName":"Sam","lastName":"Fields","name":"Sam Fields","age":30,"heightCm":180,' +
        '"weightKg":80,"sex":"","bodyFat":null,"activity":"Moderate","notes":"","sleep":"",' +
        '"timeline":"","experience":"","nutrition":"","cardio":"","goal":"","trainingDays":[]}'
    );
  });

  test("a profile save in feet and pounds", async () => {
    const draft = { ...defaultPersonalForm, name: "Sam", heightFeet: "5", heightInches: "10" };
    await build().submitProfile(
      { ...draft, weight: "170" },
      { heightUnit: "ft", weightUnit: "lb" }
    );

    expect(sentBody()).toBe(
      '{"firstName":"Sam","lastName":"","name":"Sam","age":null,"heightCm":178,' +
        '"weightKg":77,"sex":"","bodyFat":null,"activity":"Moderate","notes":"","sleep":"",' +
        '"timeline":"","experience":"","nutrition":"","cardio":"","goal":"","trainingDays":[]}'
    );
  });
});
