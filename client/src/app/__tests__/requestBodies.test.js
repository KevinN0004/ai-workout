import { describe, expect, test } from "vitest";
import { defaultSignupProfileForm } from "../constants";
import { accountDeleteBody, loginBody, passwordChangeBody, signupBody } from "../requestBodies";

// Each builder's JSON, as a string, so key order is pinned with every value:
// a builder must send exactly what its caller sent inline before it existed.
const json = (value) => JSON.stringify(value);

const authForm = { email: "a@b.co", password: "password1" };

describe("signupBody", () => {
  test("converts feet and pounds to cm and kg, in place", () => {
    const profileForm = {
      ...defaultSignupProfileForm,
      firstName: "Sam",
      heightFeet: "5",
      heightInches: "10",
      weight: "170"
    };

    expect(json(signupBody({ authForm, profileForm, heightUnit: "ft", weightUnit: "lb" }))).toBe(
      '{"email":"a@b.co","password":"password1","profile":{"firstName":"Sam","lastName":"",' +
        '"age":"","heightCm":"178","heightFeet":"5","heightInches":"10","weight":"170",' +
        '"weightKg":"77","sex":"","bodyFat":"","activity":"Moderate","notes":""}}'
    );
  });

  test("keeps cm, and sends weight over weightKg in kg", () => {
    const profileForm = {
      ...defaultSignupProfileForm,
      heightCm: "180",
      weight: "82",
      weightKg: "80"
    };

    const { profile } = signupBody({ authForm, profileForm, heightUnit: "cm", weightUnit: "kg" });

    expect(profile.heightCm).toBe("180");
    expect(profile.weightKg).toBe("82");
  });

  test("falls back to weightKg in kg when weight is blank", () => {
    const profileForm = { ...defaultSignupProfileForm, weightKg: "80" };

    const { profile } = signupBody({ authForm, profileForm, heightUnit: "cm", weightUnit: "kg" });

    expect(profile.weightKg).toBe("80");
  });
});

describe("loginBody", () => {
  test("adds rememberMe after the form, false as well as true", () => {
    expect(json(loginBody(authForm, true))).toBe(
      '{"email":"a@b.co","password":"password1","rememberMe":true}'
    );
    expect(json(loginBody(authForm, false))).toBe(
      '{"email":"a@b.co","password":"password1","rememberMe":false}'
    );
  });
});

describe("passwordChangeBody", () => {
  test("sends the two passwords, current first", () => {
    expect(
      json(passwordChangeBody({ newPassword: "new-pass-123", currentPassword: "old-pass" }))
    ).toBe('{"currentPassword":"old-pass","newPassword":"new-pass-123"}');
  });
});

describe("accountDeleteBody", () => {
  test("sends the confirming password", () => {
    expect(json(accountDeleteBody("old-pass"))).toBe('{"password":"old-pass"}');
  });
});
