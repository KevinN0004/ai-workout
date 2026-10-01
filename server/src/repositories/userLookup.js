/**
 * Resolves an application user id, either form of it, to the user row. Every
 * repository resolves a user id through these two functions.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The Prisma `where` that finds a user by id. Callers hold either the UUID
 * primary key or the legacy string id, depending on when the account and the
 * session were created, so a UUID matches either column and anything else the
 * legacy id only. Load-bearing: a code path that assumed only the legacy id
 * once stopped finding users. Keep it until the legacy columns are dropped.
 */
export const userIdWhere = (userId) => {
  const value = String(userId || "");
  return uuidPattern.test(value)
    ? { OR: [{ legacyUserId: value }, { id: value }] }
    : { legacyUserId: value };
};

/** Returns the primary key, or "" when no user matches. */
export const getUserPk = async (prisma, userId) => {
  const row = await prisma.appUser.findFirst({
    where: userIdWhere(userId),
    select: { id: true }
  });
  return row?.id || "";
};
