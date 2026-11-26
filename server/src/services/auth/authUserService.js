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
 * The signed-in user the session middleware puts on `req.user`: what findUserById
 * resolves to, less its null.
 * @typedef {NonNullable<Awaited<ReturnType<ReturnType<typeof createAuthUserService>["findUserById"]>>>} AuthUser
 */

/** @typedef {ReturnType<typeof import("../../repositories/userReadRepository.js").createUserReadRepository>} UserReadRepository */

/**
 * A user as userReadRepository returns one: the row's own fields, and the
 * dashboard only when the collections were loaded with it.
 * @typedef {Omit<NonNullable<ReturnType<typeof import("../../repositories/userReadRepository.js").mapUser>>, "dashboard"> & { dashboard?: NonNullable<ReturnType<typeof import("../../repositories/userReadRepository.js").mapUser>>["dashboard"] }} StoredUser
 */

/**
 * What the password checks read: a signed-in user, or the dummy record a
 * sign-in for an unknown email verifies against. Never null: the login route
 * answers an unknown email with the dummy record.
 * @typedef {{ salt?: string, hash?: string, passwordAlgo?: string }} PasswordRecord
 */

/**
 * A new account as the signup route builds it for createUser.
 * @typedef {object} NewUser
 * @property {string} id
 * @property {string} email
 * @property {string} [salt]
 * @property {string} hash
 * @property {string} [passwordAlgo]
 * @property {string} [createdAt]
 * @property {import("../../repositories/userReadRepository.js").NewUserDoc["profile"]} [profile]
 * @property {import("../../repositories/userReadRepository.js").NewUserDoc["dashboard"]} [dashboard]
 */

/**
 * Builds the service. Returns the user lookups and creation the routes and
 * sessionService call, mapDbDocToUser, which the routes apply to a user they
 * re-read after a write, and the hashing, verification and legacy-hash upgrade
 * the auth routes call.
 *
 * @param {object} deps The two row lookups and `createUserWithDashboard` come from
 *   userReadRepository, and `updatePasswordHash` from userRepository.
 *   `argon2Options` carries the argon2id costs index.js reads from the
 *   environment; any it leaves out takes the default below.
 * @param {typeof import("../dashboard/dashboardDataBuildersService.js").cleanText} deps.cleanText
 * @param {{ timeCost?: number, memoryCost?: number, parallelism?: number, hashLength?: number }} [deps.argon2Options]
 * @param {ReturnType<typeof import("../../repositories/userRepository.js").createUserRepository>["updatePasswordHash"]} deps.updatePasswordHash
 * @param {UserReadRepository["findUserRow"]} deps.findUserRow
 * @param {UserReadRepository["findUserRowByEmail"]} deps.findUserRowByEmail
 * @param {UserReadRepository["createUserWithDashboard"]} deps.createUserWithDashboard
 */
export const createAuthUserService = ({
  cleanText,
  argon2Options,
  updatePasswordHash,
  findUserRow,
  findUserRowByEmail,
  createUserWithDashboard
}) => {
  const {
    timeCost = 3,
    memoryCost = 19456,
    parallelism = 1,
    hashLength = 32
  } = argon2Options || {};

  // Maps a user as userReadRepository returns it to the shape the routes use:
  // `userId` becomes `id`, and a missing passwordAlgo, which only a hand-built
  // source can have, is inferred from the hash. A user read by its row alone
  // has no dashboard, and gets no `dashboard` key rather than an empty one.
  /** @param {StoredUser | null} source */
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
      ...(source.dashboard !== undefined && { dashboard: source.dashboard })
    };
  };

  /** @param {NewUser} user */
  const mapUserToDbDoc = (user) => {
    /** @type {import("../../repositories/userReadRepository.js").NewUserDoc & { createdAt: string }} */
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

  // The user row alone. Every signed-in request resolves its user here, and
  // only GET /api/dashboard and a write's response load the collections.
  /** @param {unknown} userId */
  const findUserById = async (userId) => mapDbDocToUser(await findUserRow(userId));

  /** @param {unknown} email */
  const findUserByEmail = async (email) =>
    mapDbDocToUser(await findUserRowByEmail(cleanText(email, 254).toLowerCase()));

  /** @param {NewUser} user */
  const createUser = async (user) =>
    mapDbDocToUser(await createUserWithDashboard(mapUserToDbDoc(user)));

  /** @param {string} password */
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

  /** @param {string} password */
  const hashPassword = async (password) => hashPasswordArgon2id(password);

  /** @param {unknown} value */
  const isArgon2Hash = (value) => cleanText(value, 260).startsWith("$argon2");

  /** @param {PasswordRecord} [user] */
  const resolvePasswordAlgo = (user = {}) => {
    const raw = cleanText(user.passwordAlgo, 24);
    if (raw === "argon2id" || raw === "pbkdf2") return raw;
    return isArgon2Hash(user.hash) ? "argon2id" : "pbkdf2";
  };

  /**
   * @param {string} password
   * @param {PasswordRecord} user
   */
  const verifyPasswordPbkdf2 = async (password, user) => {
    if (!user?.salt || !user?.hash) return false;
    const hash = await pbkdf2Async(password, user.salt, 120000, 64, "sha512");
    const storedHash = Buffer.from(user.hash, "hex");
    if (storedHash.length !== hash.length) return false;
    return crypto.timingSafeEqual(storedHash, hash);
  };

  /**
   * @param {string} password
   * @param {PasswordRecord} user
   */
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

  /** @type {ReturnType<typeof hashPasswordArgon2id> | null} */
  let dummyPasswordRecordPromise = null;
  const getDummyPasswordRecord = async () => {
    if (!dummyPasswordRecordPromise) {
      dummyPasswordRecordPromise = hashPasswordArgon2id("invalid-password");
    }
    return dummyPasswordRecordPromise;
  };

  /** @param {PasswordRecord} user */
  const shouldUpgradePasswordToArgon2id = (user) => resolvePasswordAlgo(user) !== "argon2id";

  /**
   * @param {string} userId
   * @param {string} plainPassword
   */
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
