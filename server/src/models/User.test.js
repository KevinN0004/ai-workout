import { describe, expect, test } from "vitest";
import User from "./User.js";

describe("User model", () => {
  test("lowercases and trims email values", () => {
    const user = new User({
      userId: "user-1",
      email: "  TEST@Example.COM  ",
      salt: "salt-value",
      hash: "hash-value",
      createdAt: new Date().toISOString()
    });

    expect(user.email).toBe("test@example.com");
  });

  test("applies dashboard nested defaults when dashboard exists", () => {
    const user = new User({
      userId: "user-2",
      email: "user2@example.com",
      salt: "salt-value",
      hash: "hash-value",
      createdAt: new Date().toISOString(),
      dashboard: {}
    });

    expect(user.dashboard.workouts).toEqual([]);
    expect(user.dashboard.workoutSessions).toEqual([]);
    expect(user.dashboard.calories).toEqual([]);
    expect(user.dashboard.goals.targetWeight).toBe(160);
    expect(user.dashboard.goals.targetCalories).toBe(2200);
    expect(user.dashboard.goals.weeklyWorkouts).toBe(3);
  });

  test("requires core auth fields", () => {
    const user = new User({
      userId: "user-3",
      email: "user3@example.com",
      createdAt: new Date().toISOString()
    });

    const error = user.validateSync();

    expect(error).toBeTruthy();
    expect(error.errors.salt).toBeTruthy();
    expect(error.errors.hash).toBeTruthy();
  });
});
