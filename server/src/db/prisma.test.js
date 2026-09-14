import { afterAll, describe, expect, test } from "vitest";
import { disconnectPrisma, prisma } from "./prisma.js";

describe("prisma client", () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  test("exposes delegates for the Postgres foundation models", () => {
    expect(prisma.appUser).toBeTruthy();
    expect(prisma.workoutSession).toBeTruthy();
    expect(prisma.mealLog).toBeTruthy();
    expect(prisma.progressMetric).toBeTruthy();
    expect(prisma.calorieEntry).toBeTruthy();
    expect(prisma.generatedPlan).toBeTruthy();
    expect(prisma.savedExercise).toBeTruthy();
  });
});
