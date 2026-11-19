/**
 * Resolves an id held in either form, the UUID primary key or a legacy string
 * id, into a Prisma `where`: for a user (userIdWhere, getUserPk), and for any
 * row known to the client by `legacyId || id` (legacyOrIdWhere).
 */
// @ts-check

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The Prisma `where` that finds a row by an id in either form: a UUID matches
 * the legacy column or the primary key, and anything else the legacy column
 * only, so a non-UUID string never reaches the `uuid` column, which would
 * refuse it.
 *
 * @param {unknown} value The id, in either form.
 * @param {"legacyId" | "legacyUserId"} legacyField The legacy column of the model searched.
 */
export const legacyOrIdWhere = (value, legacyField) => {
  const text = String(value || "");
  return uuidPattern.test(text)
    ? { OR: [{ [legacyField]: text }, { id: text }] }
    : { [legacyField]: text };
};

/**
 * The Prisma `where` that finds a user by id. Callers hold either the UUID
 * primary key or the legacy string id, depending on when the account and the
 * session were created. Load-bearing: a code path that assumed only the legacy
 * id once stopped finding users. Keep it until the legacy columns are dropped.
 *
 * @param {unknown} userId
 */
export const userIdWhere = (userId) => legacyOrIdWhere(userId, "legacyUserId");

/**
 * Returns the primary key, or "" when no user matches.
 *
 * @param {import("@prisma/client").PrismaClient | import("@prisma/client").Prisma.TransactionClient} prisma
 * @param {unknown} userId
 */
export const getUserPk = async (prisma, userId) => {
  const row = await prisma.appUser.findFirst({
    where: userIdWhere(userId),
    select: { id: true }
  });
  return row?.id || "";
};
