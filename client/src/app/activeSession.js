/**
 * The open in-gym session, kept in localStorage per account so a closed tab or
 * a dead battery loses nothing (roadmap B6). Written on every change.
 */
import { buildScopedCacheKey, readJsonCache, removeJsonCache } from "./cache";
import { ACTIVE_SESSION_PREFIX } from "./constants";

/** @param {{ userId?: string, email?: string } | null | undefined} user */
const keyFor = (user) => buildScopedCacheKey(ACTIVE_SESSION_PREFIX, user);

/**
 * `user`'s open session, or null when there is none, or what is stored is not
 * a session of this version.
 */
export const readActiveSession = (user) => {
  const stored = readJsonCache(keyFor(user));
  return stored?.version === 1 && Array.isArray(stored.exercises) ? stored : null;
};

/**
 * Keeps `session` as `user`'s open session, and returns whether storage took
 * it. cache.js's writer hides a refused write, which the page has to show.
 */
export const writeActiveSession = (user, session) => {
  try {
    window.localStorage.setItem(keyFor(user), JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
};

/** Drops `user`'s open session. */
export const clearActiveSession = (user) => removeJsonCache(keyFor(user));
