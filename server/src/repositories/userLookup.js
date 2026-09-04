/**
 * Resolving an application user id to its Postgres primary key.
 *
 * Callers hold either the UUID primary key or the legacy string id, depending on
 * when the account and the session were created, so both have to resolve. Commit
 * 19cc8ac exists because a code path assumed only the legacy id and stopped
 * finding users. Treat this as load-bearing until the legacy columns are dropped.
 */

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
