/**
 * The outbox: workout, meal and calorie entries the server has not confirmed,
 * kept per account in localStorage until useOutboxReplay sends them
 * (docs/specs/2026-11-06-offline-ready-pwa-design.md).
 */
import { buildScopedCacheKey, readJsonCache, removeJsonCache } from "./cache";
import { OUTBOX_CACHE_PREFIX } from "./constants";

const keyFor = (user) => buildScopedCacheKey(OUTBOX_CACHE_PREFIX, user);

/**
 * `user`'s entries, oldest first, each `{ clientId, type, url, body, item,
 * queuedAt }`; empty when there are none or what is stored is not a list.
 */
export const readOutbox = (user) => {
  const stored = readJsonCache(keyFor(user));
  return Array.isArray(stored) ? stored : [];
};

/**
 * Keeps `entry` for `user`, in place of one with the same `clientId`, and
 * returns whether storage took it. cache.js's writer hides a refused write,
 * which this has to report: an entry must never look kept when it is not.
 */
export const addToOutbox = (user, entry) => {
  const kept = readOutbox(user);
  const index = kept.findIndex((existing) => existing.clientId === entry.clientId);
  const next =
    index === -1 ? [...kept, entry] : kept.map((existing, at) => (at === index ? entry : existing));
  try {
    window.localStorage.setItem(keyFor(user), JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
};

/** Drops `user`'s entry with this `clientId`. */
export const removeFromOutbox = (user, clientId) => {
  const kept = readOutbox(user).filter((existing) => existing.clientId !== clientId);
  try {
    window.localStorage.setItem(keyFor(user), JSON.stringify(kept));
  } catch {
    // An entry that cannot be removed is sent again, which updates its row.
  }
};

/** Drops every entry `user` has. */
export const clearOutbox = (user) => removeJsonCache(keyFor(user));
