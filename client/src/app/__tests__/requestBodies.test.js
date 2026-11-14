import { describe, expect, test } from "vitest";
import { defaultSignupProfileForm } from "../constants";
import {
  accountDeleteBody,
  blankProgressForm,
  caloriesBody,
  loginBody,
  mealLogBody,
  passwordChangeBody,
  signupBody,
  workoutSessionBody
} from "../requestBodies";

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

describe("workoutSessionBody", () => {
  const exerciseSets = [
    { name: "Squat", sets: [{ reps: 5, seconds: null, loadKg: 100, rpe: 8 }] },
    { name: "Row", sets: [{ reps: 10, seconds: null, loadKg: null, rpe: null }] }
  ];
  const workout = {
    id: "w-1",
    date: "2026-03-01",
    focus: "Pull",
    duration: "45",
    notes: "",
    exerciseSets
  };

  test("names the exercises from their sets, in order, and adds no link without a plan", () => {
    expect(json(workoutSessionBody(workout))).toBe(
      '{"id":"w-1","date":"2026-03-01","focus":"Pull","duration":"45","notes":"",' +
        '"exercises":["Squat","Row"],"exerciseSets":' +
        json(exerciseSets) +
        "}"
    );
  });

  test("adds the plan day's link last when it has a plan", () => {
    const body = workoutSessionBody({ ...workout, planId: "plan-1", planDayIndex: 0 });

    expect(json(body).endsWith(',"planId":"plan-1","planDayIndex":0}')).toBe(true);
  });

  test("leaves the link out for a null plan, index and all", () => {
    const body = workoutSessionBody({ ...workout, planId: null, planDayIndex: 3 });

    expect(body).not.toHaveProperty("planId");
    expect(body).not.toHaveProperty("planDayIndex");
  });
});

describe("caloriesBody", () => {
  test("is the form, then the replay key and the date", () => {
    expect(json(caloriesBody({ calories: "2200" }, "c-1", "2026-03-01"))).toBe(
      '{"calories":"2200","id":"c-1","date":"2026-03-01"}'
    );
  });
});

describe("mealLogBody", () => {
  test("is the form, then the replay key", () => {
    const form = {
      date: "2026-03-01",
      mealType: "lunch",
      name: "Rice bowl",
      calories: "600",
      proteinG: "",
      carbsG: "",
      fatG: "",
      notes: ""
    };

    expect(json(mealLogBody(form, "m-1"))).toBe(
      '{"date":"2026-03-01","mealType":"lunch","name":"Rice bowl","calories":"600",' +
        '"proteinG":"","carbsG":"","fatG":"","notes":"","id":"m-1"}'
    );
  });
});

describe("blankProgressForm", () => {
  test("is the date with every other field blank", () => {
    expect(json(blankProgressForm("2026-03-01"))).toBe(
      '{"date":"2026-03-01","weightLb":"","bodyFatPct":"","waistCm":"","restingHr":"","notes":""}'
    );
  });

  test("is a fresh object each time", () => {
    expect(blankProgressForm("2026-03-01")).not.toBe(blankProgressForm("2026-03-01"));
  });
});
