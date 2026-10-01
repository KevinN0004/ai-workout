/**
 * Users as the auth layer sees them, and their passwords: lookup and creation
 * over userReadRepository, argon2id hashing, and verification of argon2id and
 * legacy pbkdf2 hashes. Built once in index.js.
 */
import argon2 from "argon2";
import crypto from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(crypto.pbkdf2);

/**
 * Builds the service. Returns the user lookups and creation the routes and
 * sessionService call, and the hashing, verification and legacy-hash upgrade
 * the auth routes call.
 *
 * @param deps The three user readers come from userReadRepository and
 *   `updatePasswordHash` from userRepository. `argon2Options` carries the
 *   argon2id costs index.js reads from the environment; any it leaves out
 *   takes the default below.
 */
export const createAuthUserService = ({
  cleanText,
  argon2Options,
  updatePasswordHash,
  findUserWithDashboard,
  findUserWithDashboardByEmail,
  createUserWithDashboard
}) => {
  const {
    timeCost = 3,
    memoryCost = 19456,
    parallelism = 1,
    hashLength = 32
  } = argon2Options || {};

  // Maps a user as userReadRepository returns it to the shape the routes use:
  // `userId` becomes `id`, and a missing passwordAlgo is inferred from the hash.
  const mapDbDocToUser = (source) => {
    if (!source) return null;
    const inferredAlgo =
      cleanText(source.passwordAlgo, 24) ||
      (cleanText(source.hash, 260).startsWith("$argon2") ? "argon2id" : "pbkdf2");
    return {
      id: source.userId,
      email: source.email,
      salt: source.salt,
      hash: source.hash,
      passwordAlgo: inferredAlgo,
      createdAt: source.createdAt,
      // mapUser already guarantees string | null for every real caller, so
      // this only matters for a hand-built source (a test fixture that omits
      // the key); keeping it stops that undefined from leaking out instead
      // of the null the rest of the app expects.
      passwordChangedAt: source.passwordChangedAt ?? null,
      profile: source.profile,
      dashboard: source.dashboard
    };
  };

  const mapUserToDbDoc = (user) => {
    const doc = {
      userId: user.id,
      email: cleanText(user.email, 254).toLowerCase(),
      salt: user.salt ?? "",
      hash: user.hash,
      passwordAlgo: cleanText(user.passwordAlgo, 24) || "pbkdf2",
      createdAt: user.createdAt || new Date().toISOString()
      // No passwordChangedAt here: this only feeds createUser, and a brand
      // new account deliberately leaves the column NULL. Do not add it to
      // "fix" the asymmetry with mapDbDocToUser.
    };
    if (user.profile !== undefined) doc.profile = user.profile;
    if (user.dashboard !== undefined) doc.dashboard = user.dashboard;
    return doc;
  };

  const findUserById = async (userId) => mapDbDocToUser(await findUserWithDashboard(userId));

  const findUserByEmail = async (email) =>
    mapDbDocToUser(await findUserWithDashboardByEmail(cleanText(email, 254).toLowerCase()));

  const createUser = async (user) =>
    mapDbDocToUser(await createUserWithDashboard(mapUserToDbDoc(user)));

  const hashPasswordArgon2id = async (password) => {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost,
      memoryCost,
      parallelism,
      hashLength
    });
    return { salt: "", hash, passwordAlgo: "argon2id" };
  };

  const hashPassword = async (password) => hashPasswordArgon2id(password);

  const isArgon2Hash = (value) => cleanText(value, 260).startsWith("$argon2");

  const resolvePasswordAlgo = (user = {}) => {
    const raw = cleanText(user.passwordAlgo, 24);
    if (raw === "argon2id" || raw === "pbkdf2") return raw;
    return isArgon2Hash(user.hash) ? "argon2id" : "pbkdf2";
  };

  const verifyPasswordPbkdf2 = async (password, user) => {
    if (!user?.salt || !user?.hash) return false;
    const hash = await pbkdf2Async(password, user.salt, 120000, 64, "sha512");
    const storedHash = Buffer.from(user.hash, "hex");
    if (storedHash.length !== hash.length) return false;
    return crypto.timingSafeEqual(storedHash, hash);
  };

  const verifyPassword = async (password, user) => {
    const algo = resolvePasswordAlgo(user);
    if (algo === "argon2id") {
      if (!user?.hash) return false;
      try {
        return await argon2.verify(user.hash, password);
      } catch {
        return false;
      }
    }
    return verifyPasswordPbkdf2(password, user);
  };

  let dummyPasswordRecordPromise = null;
  const getDummyPasswordRecord = async () => {
    if (!dummyPasswordRecordPromise) {
      dummyPasswordRecordPromise = hashPasswordArgon2id("invalid-password");
    }
    return dummyPasswordRecordPromise;
  };

  const shouldUpgradePasswordToArgon2id = (user) => resolvePasswordAlgo(user) !== "argon2id";

  const upgradeUserPasswordToArgon2id = async (userId, plainPassword) => {
    const next = await hashPasswordArgon2id(plainPassword);
    await updatePasswordHash({
      userId,
      salt: next.salt,
      hash: next.hash,
      passwordAlgo: next.passwordAlgo
    });
    return next;
  };

  return {
    mapDbDocToUser,
    findUserById,
    findUserByEmail,
    createUser,
    hashPassword,
    getDummyPasswordRecord,
    verifyPassword,
    shouldUpgradePasswordToArgon2id,
    upgradeUserPasswordToArgon2id
  };
};
