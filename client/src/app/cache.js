/**
 * localStorage helpers for the per-account caches (dashboard, weather, air
 * quality), and the cookie reader useApiClient takes the CSRF token from. Storage
 * failures are swallowed: a cache that cannot be used only costs a page its head
 * start.
 */

/**
 * The storage key for one account's copy of a cache, `prefix:scope`, scoped by
 * `userId`, else `email`, else "anonymous". The server's auth responses carry
 * `id` rather than `userId`, so for a signed-in user the scope is the email.
 */
export const buildScopedCacheKey = (prefix, user) => {
  const scope = user?.userId || user?.email || "anonymous";
  return `${prefix}:${scope}`;
};

/**
 * The parsed entry under `key`, or null when there is no key, no storage, no
 * entry or no valid JSON. Never throws.
 */
export const readJsonCache = (key) => {
  if (!key || typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Stores `value` as JSON under `key`; does nothing without a key or storage. */
export const writeJsonCache = (key, value) => {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore cache write failures (private mode, quota, etc.)
  }
};

/** Deletes the entry under `key`, if storage is there to delete it from. */
export const removeJsonCache = (key) => {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore cache removal failures (private mode, storage disabled, etc.) --
    // a deletion must not fail because storage is unavailable.
  }
};

/**
 * The value of cookie `name`, URI-decoded (raw when it does not decode), or ""
 * when it is not set. Only cookies without HttpOnly are visible here; the CSRF
 * cookie is one, the session cookie is not.
 */
export const readCookie = (name) => {
  if (!name || typeof document === "undefined") return "";
  const key = `${name}=`;
  const pairs = document.cookie ? document.cookie.split(";") : [];
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed.startsWith(key)) continue;
    try {
      return decodeURIComponent(trimmed.slice(key.length));
    } catch {
      return trimmed.slice(key.length);
    }
  }
  return "";
};
