import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import User from "./models/User.js";

const defaultMongoUri = "mongodb://127.0.0.1:27017/ai_workout_backend";
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const parseUsers = (raw) => {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const uniquePaths = (paths) => [...new Set(paths)];

const getLegacyUserPaths = () =>
  uniquePaths([
    path.join(process.cwd(), "data", "users.json"),
    path.join(process.cwd(), "server", "data", "users.json"),
    path.join(MODULE_DIR, "..", "data", "users.json"),
    path.join(MODULE_DIR, "..", "..", "data", "users.json")
  ]);

const toMongoUser = (user) => {
  const doc = {
    userId: user.id,
    email: user.email,
    salt: user.salt,
    hash: user.hash,
    createdAt: user.createdAt || new Date().toISOString()
  };
  if (user.profile !== undefined) doc.profile = user.profile;
  if (user.dashboard !== undefined) doc.dashboard = user.dashboard;
  return doc;
};

const migrateFromLegacyJson = async () => {
  const existingCount = await User.estimatedDocumentCount();
  if (existingCount > 0) {
    return { migratedFrom: null, migratedCount: 0 };
  }

  for (const filePath of getLegacyUserPaths()) {
    let raw = "";
    try {
      raw = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }

    const users = parseUsers(raw);
    if (!users.length) continue;

    const seenUserIds = new Set();
    const seenEmails = new Set();
    const docs = [];

    for (const user of users) {
      if (!user?.id || !user?.email || !user?.salt || !user?.hash) continue;
      const userId = String(user.id);
      const email = String(user.email).toLowerCase();
      if (seenUserIds.has(userId) || seenEmails.has(email)) continue;
      seenUserIds.add(userId);
      seenEmails.add(email);
      docs.push(toMongoUser({ ...user, id: userId, email }));
    }

    if (!docs.length) continue;

    await User.insertMany(docs, { ordered: true });
    return { migratedFrom: filePath, migratedCount: docs.length };
  }

  return { migratedFrom: null, migratedCount: 0 };
};

export const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI || defaultMongoUri;
  await mongoose.connect(mongoUri);
  const migration = await migrateFromLegacyJson();
  return { mongoUri, ...migration };
};
