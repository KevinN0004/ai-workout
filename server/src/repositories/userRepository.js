import { dateOnlyToDate } from "./rowValues.js";
import { getUserPk, userIdWhere } from "./userLookup.js";

/**
 * Prisma-native writes against the user row and its calorie entries.
 *
 * Task 4b of docs/plans/2026-09-04-retiring-the-mongo-compat-shim.md -- the
 * remaining User writes once saved exercises moved in 4a.
 *
 * Each function writes and reports whether it matched a user. Callers re-read
 * through User.findOne for the response body, which is what they already did.
 */

const toJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

export const createUserRepository = ({ prisma }) => {
  /** Replaces the profile JSON wholesale. Callers merge before calling. */
  const updateProfile = async ({ userId, profile }) => {
    const { count } = await prisma.appUser.updateMany({
      where: userIdWhere(userId),
      data: { profile: profile || {} }
    });
    return count > 0;
  };

  /**
   * Patches goals, preserving keys the caller did not send.
   *
   * The shim expressed this as dotted `$set` paths (`dashboard.goals.x`) and
   * rebuilt the JSON from the existing row. Goals live in a single JSON column,
   * so a naive write would silently drop the other goals -- hence the read,
   * merge, write, and a test that sends one goal and checks the rest survive.
   *
   * An empty patch is a no-op rather than a write of `{}`.
   */
  const updateGoals = async ({ userId, goals = {} }) => {
    const patch = Object.fromEntries(
      Object.entries(goals).filter(([, value]) => value !== undefined)
    );
    if (!Object.keys(patch).length) {
      const existing = await prisma.appUser.findFirst({
        where: userIdWhere(userId),
        select: { id: true }
      });
      return Boolean(existing);
    }

    const existing = await prisma.appUser.findFirst({
      where: userIdWhere(userId),
      select: { goals: true }
    });
    if (!existing) return false;

    const { count } = await prisma.appUser.updateMany({
      where: userIdWhere(userId),
      data: { goals: { ...toJsonObject(existing.goals), ...patch } }
    });
    return count > 0;
  };

  /** Used by the pbkdf2 -> argon2id upgrade on successful login. */
  const updatePasswordHash = async ({ userId, salt, hash, passwordAlgo }) => {
    const { count } = await prisma.appUser.updateMany({
      where: userIdWhere(userId),
      data: {
        passwordSalt: salt || "",
        passwordHash: hash,
        passwordAlgo: passwordAlgo || "argon2id"
      }
    });
    return count > 0;
  };

  /**
   * Inserts a calorie entry, or updates the existing row with the same legacy
   * id. The route mints a fresh uuid per submission, so in practice every call
   * inserts; the update arm exists because the shim had it and a caller could
   * supply an id.
   */
  const saveCalorieEntry = async ({ userId, entry = {} }) => {
    const userPk = await getUserPk(prisma, userId);
    if (!userPk) return false;

    const existing = entry.id
      ? await prisma.calorieEntry.findFirst({
          where: { userId: userPk, legacyId: entry.id },
          select: { id: true }
        })
      : null;

    const data = {
      userId: userPk,
      legacyId: entry.id || null,
      calorieDate: dateOnlyToDate(entry.date),
      calories: Math.round(Number(entry.calories) || 0),
      source: entry.source || "manual"
    };

    if (existing) await prisma.calorieEntry.update({ where: { id: existing.id }, data });
    else await prisma.calorieEntry.create({ data });
    return true;
  };

  return { updateProfile, updateGoals, updatePasswordHash, saveCalorieEntry };
};
