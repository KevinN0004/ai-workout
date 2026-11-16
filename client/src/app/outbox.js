/**
 * The outbox: workout, meal and calorie entries the server has not confirmed,
 * kept per account in localStorage until useOutboxReplay sends them
 * (docs/specs/2026-11-06-offline-ready-pwa-design.md).
 */
// @ts-check
import { buildScopedCacheKey, readJsonCache, removeJsonCache } from "./cache";
import { OUTBOX_CACHE_PREFIX } from "./constants";

/** @typedef {import("./cache.js").CacheUser} CacheUser */

/**
 * The three logs that are shown at once and can be kept: what
 * mergeOptimisticEntries (dashboard.js) matches on.
 * @typedef {"workout" | "calorie" | "meal"} LogType
 */

/**
 * One kept entry: the request to send again (`url` and its JSON `body`), and
 * the entry as the dashboard shows it, `item`, shaped like the server's rows,
 * which are not typed yet (D1 phase 3 spec, decision 2).
 * @typedef {object} OutboxEntry
 * @property {string} clientId The entry's own id, which the server keeps.
 * @property {LogType} type
 * @property {string} url Where it is sent.
 * @property {unknown} body The request body, sent as JSON.
 * @property {any} item The entry as the dashboard lists it.
 * @property {number} queuedAt When it was kept, in milliseconds since the epoch.
 */

/** @param {CacheUser} user */
const keyFor = (user) => buildScopedCacheKey(OUTBOX_CACHE_PREFIX, user);

/**
 * `user`'s entries, oldest first; empty when there are none or what is stored
 * is not a list.
 * @param {CacheUser} user
 * @returns {OutboxEntry[]}
 */
export const readOutbox = (user) => {
  const stored = readJsonCache(keyFor(user));
  return Array.isArray(stored) ? stored : [];
};

/**
 * Keeps `entry` for `user`, in place of one with the same `clientId`, and
 * returns whether storage took it. cache.js's writer hides a refused write,
 * which this has to report: an entry must never look kept when it is not.
 * @param {CacheUser} user
 * @param {OutboxEntry} entry
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

/**
 * Drops `user`'s entry with this `clientId`.
 * @param {CacheUser} user
 * @param {string} clientId
 */
export const removeFromOutbox = (user, clientId) => {
  const kept = readOutbox(user).filter((existing) => existing.clientId !== clientId);
  try {
    window.localStorage.setItem(keyFor(user), JSON.stringify(kept));
  } catch {
    // An entry that cannot be removed is sent again, which updates its row.
  }
};

/**
 * Drops every entry `user` has.
 * @param {CacheUser} user
 */
export const clearOutbox = (user) => removeJsonCache(keyFor(user));
