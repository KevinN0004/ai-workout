/**
 * Prisma-native writes against the user row and its calorie entries. Each one
 * reports whether it matched a user; a route that answers with the dashboard
 * then re-reads the user through findUserWithDashboard for the response body.
 */
import { dateOnlyToDate } from "./rowValues.js";
import { getUserPk, userIdWhere } from "./userLookup.js";

const toJsonObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

/**
 * Builds the user writers over `prisma`: the profile, goals and password hash,
 * a calorie entry, and the account itself.
 */
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
   * Goals live in a single JSON column, so writing only the patch would
   * silently drop the other goals -- hence the read, merge, write, and a test
   * that sends one goal and checks the rest survive.
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

  /**
   * Called by the silent pbkdf2 -> argon2id upgrade that runs when an account
   * with a legacy hash signs in, and by the user-initiated password change.
   * Only the latter passes `stampPasswordChange: true`. The login-time rehash is
   * invisible to the user, so if it moved the column an ordinary sign-in on
   * a legacy-hash account would sign that user out of every other device --
   * strictly worse than the stale-hash problem the rehash exists to fix.
   *
   * `stampPasswordChange` is an intent flag, not a value, and the repository
   * reads its own clock rather than accepting one from the caller. A
   * caller-supplied timestamp could be absent, malformed, or simply wrong,
   * and an explicit `null` would clear the column outright -- resurrecting
   * every session a real password change had invalidated, which is worse
   * than never stamping at all. Owning the clock here also means two
   * password changes racing each other resolve to whichever write lands
   * last, never to whichever caller happened to read an earlier clock value.
   */
  const updatePasswordHash = async ({ userId, salt, hash, passwordAlgo, stampPasswordChange }) => {
    const data = {
      passwordSalt: salt || "",
      passwordHash: hash,
      passwordAlgo: passwordAlgo || "argon2id"
    };
    if (stampPasswordChange) data.passwordChangedAt = new Date();
    const { count } = await prisma.appUser.updateMany({
      where: userIdWhere(userId),
      data
    });
    return count > 0;
  };

  /**
   * Inserts a calorie entry, or updates the existing row with the same legacy
   * id. The calories route mints a fresh uuid per submission, so every call it
   * makes inserts; the update arm serves a caller that passes back an id that
   * is already stored.
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

  /**
   * Removes the account row. Every AppUser relation carries onDelete: Cascade
   * in schema.prisma, so every row the user owns goes with it -- there is
   * deliberately no hand-written cascade here to drift out of step with the
   * schema.
   *
   * Goes through userIdWhere because a caller may hold either the UUID primary
   * key or the legacy string id.
   */
  const deleteUser = async ({ userId }) => {
    const { count } = await prisma.appUser.deleteMany({ where: userIdWhere(userId) });
    return count > 0;
  };

  return { updateProfile, updateGoals, updatePasswordHash, saveCalorieEntry, deleteUser };
};
