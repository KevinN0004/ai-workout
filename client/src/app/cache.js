export const buildScopedCacheKey = (prefix, user) => {
  const scope = user?.userId || user?.email || "anonymous";
  return `${prefix}:${scope}`;
};

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

export const writeJsonCache = (key, value) => {
  if (!key || typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore cache write failures (private mode, quota, etc.)
  }
};

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
