import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../../db/prisma.js";
import { createStravaImportRepository } from "../stravaImportRepository.js";

// Pins the store of workouts imported from Strava (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "Data", "The import rules" and
// "Deleting an import") against real Postgres: one row per activity, never a
// change to a workout logged in the app, and a delete that is remembered.

const {
  saveImport,
  hasAppWorkoutOn,
  isDeletedHere,
  hasImport,
  listImportsSince,
  removeImport,
  deleteImportById
} = createStravaImportRepository({ prisma });

const EMAILS = ["strava-import-a@example.com", "strava-import-b@example.com"];

const createUser = (email) => prisma.appUser.create({ data: { email, passwordHash: "x" } });

const RUN = {
  externalId: "9001",
  sport: "Run",
  workoutDate: "2026-11-12",
  focus: "Run",
  durationMinutes: 31,
  notes: "Morning run",
  distanceMeters: 5012.4,
  averageHeartrate: 148.2
};

const appSession = (userId, date = "2026-11-12") =>
  prisma.workoutSession.create({
    data: { userId, workoutDate: new Date(`${date}T00:00:00Z`), focus: "Upper body" }
  });

const rowsOf = (userId) =>
  prisma.workoutSession.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

const cleanUp = () => prisma.appUser.deleteMany({ where: { email: { in: EMAILS } } });

beforeEach(cleanUp);
afterAll(cleanUp);

describe("stravaImportRepository", () => {
  test("an import is a session with its five columns, no plan and no exercises", async () => {
    const user = await createUser(EMAILS[0]);

    expect(await saveImport({ userId: user.id, workout: RUN })).toBe("created");

    const [row] = await rowsOf(user.id);
    expect(row).toMatchObject({
      source: "strava",
      externalId: "9001",
      sport: "Run",
      focus: "Run",
      durationMinutes: 31,
      notes: "Morning run",
      generatedPlanId: null,
      planDayIndex: null,
      exercises: []
    });
    expect(row.workoutDate?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(Number(row.distanceMeters)).toBe(5012.4);
    expect(Number(row.averageHeartrate)).toBe(148.2);
  });

  test("an absent distance and heart rate are stored as NULL", async () => {
    const user = await createUser(EMAILS[0]);

    await saveImport({
      userId: user.id,
      workout: { ...RUN, sport: "WeightTraining", distanceMeters: null, averageHeartrate: null }
    });

    const [row] = await rowsOf(user.id);
    expect(row.distanceMeters).toBeNull();
    expect(row.averageHeartrate).toBeNull();
  });

  test("saving the same activity again updates its row in place", async () => {
    const user = await createUser(EMAILS[0]);
    await saveImport({ userId: user.id, workout: RUN });
    const [before] = await rowsOf(user.id);

    const changed = {
      ...RUN,
      notes: "Renamed in Strava",
      durationMinutes: 40,
      distanceMeters: null,
      averageHeartrate: 150,
      workoutDate: "2026-11-11"
    };
    expect(await saveImport({ userId: user.id, workout: changed })).toBe("updated");

    const rows = await rowsOf(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: before.id,
      notes: "Renamed in Strava",
      durationMinutes: 40,
      distanceMeters: null
    });
    expect(rows[0].createdAt).toEqual(before.createdAt);
    expect(rows[0].workoutDate?.toISOString().slice(0, 10)).toBe("2026-11-11");
  });

  test("the same activity id for two users is two imports", async () => {
    const first = await createUser(EMAILS[0]);
    const second = await createUser(EMAILS[1]);

    expect(await saveImport({ userId: first.id, workout: RUN })).toBe("created");
    expect(await saveImport({ userId: second.id, workout: RUN })).toBe("created");
  });

  test("a save never changes a workout logged in the app", async () => {
    const user = await createUser(EMAILS[0]);
    const own = await appSession(user.id);

    await saveImport({ userId: user.id, workout: RUN });

    const rows = await rowsOf(user.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === own.id)).toMatchObject({
      source: null,
      focus: "Upper body",
      notes: ""
    });
  });

  test("hasAppWorkoutOn counts only a workout logged in the app, on that date", async () => {
    const user = await createUser(EMAILS[0]);
    await saveImport({ userId: user.id, workout: RUN });

    expect(await hasAppWorkoutOn({ userId: user.id, date: "2026-11-12" })).toBe(false);
    await appSession(user.id, "2026-11-12");
    expect(await hasAppWorkoutOn({ userId: user.id, date: "2026-11-12" })).toBe(true);
    expect(await hasAppWorkoutOn({ userId: user.id, date: "2026-11-13" })).toBe(false);
  });

  test("listImportsSince lists the imports on or after a date", async () => {
    const user = await createUser(EMAILS[0]);
    await appSession(user.id, "2026-11-12");
    await saveImport({ userId: user.id, workout: RUN });
    await saveImport({
      userId: user.id,
      workout: { ...RUN, externalId: "9000", workoutDate: "2026-11-05" }
    });

    const listed = await listImportsSince({ userId: user.id, since: "2026-11-06" });
    expect(listed).toEqual([{ id: expect.any(String), externalId: "9001", date: "2026-11-12" }]);
  });

  test("removeImport deletes the one import, and counts it", async () => {
    const user = await createUser(EMAILS[0]);
    await saveImport({ userId: user.id, workout: RUN });

    expect(await removeImport({ userId: user.id, externalId: "9001" })).toBe(1);
    expect(await removeImport({ userId: user.id, externalId: "9001" })).toBe(0);
    expect(await rowsOf(user.id)).toHaveLength(0);
  });

  test("deleteImportById deletes the import and remembers it", async () => {
    const user = await createUser(EMAILS[0]);
    await saveImport({ userId: user.id, workout: RUN });
    const [row] = await rowsOf(user.id);

    expect(await isDeletedHere({ userId: user.id, externalId: "9001" })).toBe(false);
    expect(await deleteImportById({ userId: user.id, id: row.id })).toBe(true);

    expect(await rowsOf(user.id)).toHaveLength(0);
    expect(await isDeletedHere({ userId: user.id, externalId: "9001" })).toBe(true);
  });

  test("deleteImportById refuses a workout logged in the app, another user's import, and an unknown id", async () => {
    const user = await createUser(EMAILS[0]);
    const other = await createUser(EMAILS[1]);
    const own = await appSession(user.id);
    await saveImport({ userId: other.id, workout: RUN });
    const [othersImport] = await rowsOf(other.id);

    expect(await deleteImportById({ userId: user.id, id: own.id })).toBe(false);
    expect(await deleteImportById({ userId: user.id, id: othersImport.id })).toBe(false);
    expect(await deleteImportById({ userId: user.id, id: "not-a-session" })).toBe(false);
    expect(await deleteImportById({ userId: "nobody", id: own.id })).toBe(false);

    expect(await rowsOf(user.id)).toHaveLength(1);
    expect(await rowsOf(other.id)).toHaveLength(1);
    expect(await prisma.stravaDeletedActivity.count({ where: { userId: user.id } })).toBe(0);
  });

  test("hasImport finds only this user's import of that activity", async () => {
    const user = await createUser(EMAILS[0]);
    const other = await createUser(EMAILS[1]);
    await saveImport({ userId: other.id, workout: RUN });

    expect(await hasImport({ userId: user.id, externalId: "9001" })).toBe(false);
    await saveImport({ userId: user.id, workout: RUN });
    expect(await hasImport({ userId: user.id, externalId: "9001" })).toBe(true);
    expect(await hasImport({ userId: user.id, externalId: "9002" })).toBe(false);
  });

  test("an unknown user finds and changes nothing", async () => {
    expect(await hasImport({ userId: "nobody", externalId: "9001" })).toBe(false);
    expect(await saveImport({ userId: "nobody", workout: RUN })).toBeNull();
    expect(await hasAppWorkoutOn({ userId: "nobody", date: "2026-11-12" })).toBe(false);
    expect(await isDeletedHere({ userId: "nobody", externalId: "9001" })).toBe(false);
    expect(await listImportsSince({ userId: "nobody", since: "2026-11-01" })).toEqual([]);
    expect(await removeImport({ userId: "nobody", externalId: "9001" })).toBe(0);
  });
});
