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

  // Without this the session takes the host's zone and every JS-written
  // timestamp is stored offset by it -- measured at exactly 7h on a UTC-7
  // host. It is invisible two ways over: the driver drops the offset again on
  // read so JS->JS round-trips exactly, and CI runs in UTC where the offset is
  // zero. So this assertion is worth more than it looks: it is the only thing
  // that fails on a developer machine outside UTC if the option is dropped,
  // and in CI it can only ever pass. Read the skew assertion below as the one
  // that does the work locally.
  test("pins the session timezone to UTC", async () => {
    const rows = await prisma.$queryRaw`select current_setting('TIMEZONE') as tz`;
    expect(rows[0].tz).toBe("UTC");
  });

  test("stores a JS Date at the instant it actually represents", async () => {
    const instant = new Date();
    const rows = await prisma.$queryRaw`
      select extract(epoch from ${instant}::timestamptz) as epoch_seconds
    `;
    const storedMs = Math.round(Number(rows[0].epoch_seconds) * 1000);

    // Unpinned on a UTC-7 host this is 25_200_000. A second of slack covers
    // the round trip without admitting an offset of any size.
    expect(Math.abs(storedMs - instant.getTime())).toBeLessThan(1000);
  });
});
