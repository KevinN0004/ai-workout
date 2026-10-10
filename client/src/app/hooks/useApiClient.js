/**
 * The fetch every API write in the client goes through: it sends the session
 * cookie and adds the CSRF token. Called once, by App, which passes `apiFetch`
 * to createAppEventHandlers.
 */
import { useCallback, useRef } from "react";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../constants";
import { readCookie } from "../cache";

/**
 * Returns `apiFetch`, fetch with credentials included and, for any method other
 * than GET, HEAD or OPTIONS, the CSRF header set; and `ensureCsrfToken`, which
 * resolves the token, fetching one when no cookie holds it. Both are stable
 * across renders. `apiFetch` rejects before sending a write it has no token
 * for, or when fetching one fails.
 */
export default function useApiClient() {
  const csrfTokenRef = useRef("");

  // ---- CSRF token -----------------------------------------------------------
  // The server sets the token as a cookie scripts can read, and /api/csrf-token
  // also returns it in the body. The cookie wins, and the body is the fallback
  // when no cookie can be read.
  const ensureCsrfToken = useCallback(async () => {
    const existingToken = readCookie(CSRF_COOKIE_NAME);
    if (existingToken) {
      csrfTokenRef.current = existingToken;
      return existingToken;
    }
    const response = await fetch("/api/csrf-token", {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error("Unable to initialize security token.");
    }
    const payload = await response.json().catch(() => ({}));
    const issuedToken =
      readCookie(CSRF_COOKIE_NAME) ||
      (typeof payload?.csrfToken === "string" ? payload.csrfToken.trim() : "");
    csrfTokenRef.current = issuedToken;
    return issuedToken;
  }, []);

  // ---- Requests -------------------------------------------------------------
  const apiFetch = useCallback(
    async (url, options = {}) => {
      const method = String(options?.method || "GET").toUpperCase();
      const headers = new Headers(options?.headers || {});
      const nextOptions = {
        ...options,
        credentials: options?.credentials || "include",
        headers
      };

      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const csrfToken =
          (await ensureCsrfToken()) || csrfTokenRef.current || readCookie(CSRF_COOKIE_NAME);
        if (!csrfToken) {
          throw new Error("Security token unavailable. Refresh and try again.");
        }
        headers.set(CSRF_HEADER_NAME, csrfToken);
      }
      return fetch(url, nextOptions);
    },
    [ensureCsrfToken]
  );

  return {
    apiFetch,
    ensureCsrfToken
  };
}
