import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { prisma } from "../../db/prisma.js";
import { createStravaConnectionRepository } from "../stravaConnectionRepository.js";

// Pins the Strava connection store (roadmap C2,
// docs/specs/2026-11-12-strava-import-design.md, "Data" and "Tokens") against
// real Postgres: one connection per user and per athlete, the sync marks, the
// lock that serialises a user's refreshes, and what a disconnect removes.

const repository = createStravaConnectionRepository({ prisma });
const {
  findConnection,
  findConnectionByAthlete,
  saveConnection,
  withRefreshLock,
  updateTokens,
  markSynced,
  markSyncFailed,
  markNeedsReconnect,
  removeConnectionAndImports
} = repository;

const EMAILS = ["strava-conn-a@example.com", "strava-conn-b@example.com"];
const EXPIRES = new Date("2026-11-13T18:00:00Z");

const createUser = (email) => prisma.appUser.create({ data: { email, passwordHash: "x" } });

// The tokens arrive sealed; these stand for sealed values.
const connection = (userId, overrides = {}) => ({
  userId,
  athleteId: 4242,
  athleteName: "Jo S.",
  accessToken: "v1.sealed-access",
  refreshToken: "v1.sealed-refresh",
  expiresAt: EXPIRES,
  ...overrides
});

const session = (userId, overrides = {}) =>
  prisma.workoutSession.create({
    data: { userId, workoutDate: new Date("2026-11-12T00:00:00Z"), ...overrides }
  });

const cleanUp = () => prisma.appUser.deleteMany({ where: { email: { in: EMAILS } } });

beforeEach(cleanUp);
afterAll(cleanUp);

describe("stravaConnectionRepository", () => {
  test("a save then a find reads every field back", async () => {
    const user = await createUser(EMAILS[0]);
    await saveConnection(connection(user.id));

    expect(await findConnection({ userId: user.id })).toMatchObject({
      userPk: user.id,
      athleteId: 4242,
      athleteName: "Jo S.",
      accessToken: "v1.sealed-access",
      refreshToken: "v1.sealed-refresh",
      expiresAt: EXPIRES,
      lastSyncedAt: null,
      lastSyncError: null,
      needsReconnect: false
    });
  });

  test("no connection, and an unknown user, find nothing", async () => {
    const user = await createUser(EMAILS[0]);

    expect(await findConnection({ userId: user.id })).toBeNull();
    expect(await findConnection({ userId: "nobody" })).toBeNull();
    expect(await findConnectionByAthlete({ athleteId: 4242 })).toBeNull();
    expect(await saveConnection(connection("nobody"))).toBeNull();
  });

  test("saving again replaces the tokens, keeps when it connected, and clears reconnect", async () => {
    const user = await createUser(EMAILS[0]);
    await saveConnection(connection(user.id));
    const first = await findConnection({ userId: user.id });
    await markNeedsReconnect({ userId: user.id });

    await saveConnection(connection(user.id, { accessToken: "v1.new", refreshToken: "v1.new-r" }));

    const second = await findConnection({ userId: user.id });
    expect(second).toMatchObject({
      accessToken: "v1.new",
      refreshToken: "v1.new-r",
      needsReconnect: false
    });
    expect(second?.connectedAt).toEqual(first?.connectedAt);
  });

  test("an athlete linked to another account is a conflict, and changes nothing", async () => {
    const first = await createUser(EMAILS[0]);
    const second = await createUser(EMAILS[1]);
    await saveConnection(connection(first.id));

    expect(await saveConnection(connection(second.id))).toEqual({ conflict: true });
    expect(await findConnection({ userId: second.id })).toBeNull();
    expect((await findConnectionByAthlete({ athleteId: 4242 }))?.userPk).toBe(first.id);
  });

  test("the sync marks: synced clears the error, failed keeps the last sync", async () => {
    const user = await createUser(EMAILS[0]);
    await saveConnection(connection(user.id));
    const at = new Date("2026-11-13T08:00:00Z");

    await markSyncFailed({ userId: user.id, error: "rate_limited" });
    expect(await findConnection({ userId: user.id })).toMatchObject({
      lastSyncedAt: null,
      lastSyncError: "rate_limited"
    });

    await markSynced({ userId: user.id, at });
    expect(await findConnection({ userId: user.id })).toMatchObject({
      lastSyncedAt: at,
      lastSyncError: null
    });

    await markSyncFailed({ userId: user.id, error: "unavailable" });
    expect(await findConnection({ userId: user.id })).toMatchObject({
      lastSyncedAt: at,
      lastSyncError: "unavailable"
    });
  });

  test("the marks and the lock on a user with no connection change nothing", async () => {
    const user = await createUser(EMAILS[0]);

    expect(await markSynced({ userId: user.id, at: new Date() })).toBe(0);
    expect(await markSyncFailed({ userId: "nobody", error: "unavailable" })).toBe(0);
    expect(await markNeedsReconnect({ userId: user.id })).toBe(0);
    expect(await withRefreshLock({ userId: "nobody" }, async () => "ran")).toBeNull();
    expect(await withRefreshLock({ userId: user.id }, async (_tx, row) => row)).toBeNull();
  });

  test("updateTokens under the lock stores the new tokens and clears reconnect", async () => {
    const user = await createUser(EMAILS[0]);
    await saveConnection(connection(user.id));
    await markNeedsReconnect({ userId: user.id });
    const later = new Date("2026-11-14T00:00:00Z");

    const seen = await withRefreshLock({ userId: user.id }, async (tx, row) => {
      await updateTokens(tx, {
        userPk: row.userPk,
        accessToken: "v1.refreshed",
        refreshToken: "v1.refreshed-r",
        expiresAt: later
      });
      return row.accessToken;
    });

    expect(seen).toBe("v1.sealed-access");
    expect(await findConnection({ userId: user.id })).toMatchObject({
      accessToken: "v1.refreshed",
      refreshToken: "v1.refreshed-r",
      expiresAt: later,
      needsReconnect: false
    });
  });

  test("two refreshes for one user take turns, and the second reads the first's tokens", async () => {
    const user = await createUser(EMAILS[0]);
    await saveConnection(connection(user.id));
    const order = [];
    /** @type {() => void} */
    let release = () => {};
    const held = new Promise((resolve) => {
      release = () => resolve(undefined);
    });
    /** @type {() => void} */
    let entered = () => {};
    const firstIn = new Promise((resolve) => {
      entered = () => resolve(undefined);
    });

    const first = withRefreshLock({ userId: user.id }, async (tx, row) => {
      order.push("first in");
      entered();
      await held;
      await updateTokens(tx, {
        userPk: row.userPk,
        accessToken: "v1.from-first",
        refreshToken: "v1.from-first-r",
        expiresAt: EXPIRES
      });
      order.push("first out");
    });
    await firstIn;
    const second = withRefreshLock({ userId: user.id }, async (_tx, row) => {
      order.push(`second in, reading ${row.accessToken}`);
    });
    // The second is blocked on the lock while the first holds it.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(order).toEqual(["first in"]);

    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first in", "first out", "second in, reading v1.from-first"]);
  });

  test("a disconnect removes the connection, the imports and the deleted list, and nothing else", async () => {
    const user = await createUser(EMAILS[0]);
    const other = await createUser(EMAILS[1]);
    await saveConnection(connection(user.id));
    await session(user.id, { source: "strava", externalId: "111" });
    const own = await session(user.id);
    const othersImport = await session(other.id, { source: "strava", externalId: "222" });
    await prisma.stravaDeletedActivity.create({ data: { userId: user.id, externalId: "333" } });

    expect(await removeConnectionAndImports({ userId: user.id })).toEqual({ removed: 1 });

    expect(await findConnection({ userId: user.id })).toBeNull();
    const left = await prisma.workoutSession.findMany({
      where: { userId: { in: [user.id, other.id] } },
      select: { id: true }
    });
    expect(left.map((row) => row.id).sort()).toEqual([own.id, othersImport.id].sort());
    expect(await prisma.stravaDeletedActivity.count({ where: { userId: user.id } })).toBe(0);
    expect(await removeConnectionAndImports({ userId: "nobody" })).toEqual({ removed: 0 });
  });

  test("deleting the user removes the connection and the deleted list", async () => {
    const user = await createUser(EMAILS[0]);
    await saveConnection(connection(user.id));
    await prisma.stravaDeletedActivity.create({ data: { userId: user.id, externalId: "333" } });

    await prisma.appUser.delete({ where: { id: user.id } });

    expect(await prisma.stravaConnection.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.stravaDeletedActivity.count({ where: { userId: user.id } })).toBe(0);
  });

  test("the table refuses an import without its activity id", async () => {
    const user = await createUser(EMAILS[0]);

    await expect(session(user.id, { source: "strava" })).rejects.toThrow();
    await expect(session(user.id, { externalId: "111" })).rejects.toThrow();
    await expect(
      session(user.id, { source: "strava", externalId: "1", distanceMeters: 0 })
    ).rejects.toThrow();
  });
});
