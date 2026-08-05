import argon2 from "argon2";
import crypto from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(crypto.pbkdf2);

export const createAuthUserService = ({ User, cleanText, argon2Options }) => {
  const {
    timeCost = 3,
    memoryCost = 19456,
    parallelism = 1,
    hashLength = 32
  } = argon2Options || {};

  const mapDbDocToUser = (doc) => {
    if (!doc) return null;
    const source = typeof doc.toObject === "function" ? doc.toObject() : doc;
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
    };
    if (user.profile !== undefined) doc.profile = user.profile;
    if (user.dashboard !== undefined) doc.dashboard = user.dashboard;
    return doc;
  };

  const findUserById = async (userId) => {
    const doc = await User.findOne({ userId });
    return mapDbDocToUser(doc);
  };

  const findUserByEmail = async (email) => {
    const doc = await User.findOne({
      email: cleanText(email, 254).toLowerCase()
    });
    return mapDbDocToUser(doc);
  };

  const createUser = async (user) => {
    const doc = await User.create(mapUserToDbDoc(user));
    return mapDbDocToUser(doc);
  };

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
    await User.updateOne(
      { userId },
      {
        $set: {
          salt: next.salt,
          hash: next.hash,
          passwordAlgo: next.passwordAlgo
        }
      }
    );
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
