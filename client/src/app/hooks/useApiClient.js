/**
 * The fetch every API write in the client goes through: it sends the session
 * cookie, adds the CSRF token and gives up at a deadline. Called once, by App,
 * which passes `apiFetch` to createAppEventHandlers and DashboardPage.
 */
import { useCallback } from "react";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../constants";
import { readCookie } from "../cache";
import { fetchWithTimeout } from "../network";

// How long a request waits for an answer, in milliseconds, unless its caller
// names `timeoutMs`: network.js's own default, which the dashboard's reads use.
const API_TIMEOUT_MS = 15000;

// The writes the page keeps and sends later when they cannot be sent now
// (docs/specs/2026-11-06-offline-ready-pwa-design.md). Every other write is
// refused while the browser reports no network.
const QUEUED_LOG_PATHS = new Set([
  "/api/dashboard/workout-sessions",
  "/api/dashboard/meal-logs",
  "/api/dashboard/calories"
]);
const OFFLINE_WRITE_MESSAGE = "You're offline. This needs a connection.";

/**
 * Returns `apiFetch`, fetch with credentials included and, for any method other
 * than GET, HEAD or OPTIONS, the CSRF header set; and `ensureCsrfToken`, which
 * resolves the token, fetching one when no cookie holds it, or always with
 * `{ refresh: true }`. Both are stable across renders. `apiFetch` rejects
 * before sending a write it has no token for, or when fetching one fails; a
 * write other than the three logs while the browser reports no network, with
 * "You're offline. This needs a connection."; and with "Request timed out.
 * Please try again." when the server has not answered within
 * `options.timeoutMs` (API_TIMEOUT_MS by default), as does the token fetch.
 */
export default function useApiClient() {
  // ---- CSRF token -----------------------------------------------------------
  // The server sets the token as a cookie scripts can read, and /api/csrf-token
  // also returns it in the body. The cookie wins, and the body is the fallback
  // when no cookie can be read. `refresh` asks the server even when a cookie
  // is set, for a retry after the server refused the token the cookie holds.
  const ensureCsrfToken = useCallback(async ({ refresh = false } = {}) => {
    const existingToken = refresh ? "" : readCookie(CSRF_COOKIE_NAME);
    if (existingToken) {
      return existingToken;
    }
    const response = await fetchWithTimeout("/api/csrf-token", {
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error("Unable to initialize security token.");
    }
    const payload = await response.json().catch(() => ({}));
    const issuedToken =
      readCookie(CSRF_COOKIE_NAME) ||
      (typeof payload?.csrfToken === "string" ? payload.csrfToken.trim() : "");
    return issuedToken;
  }, []);

  // ---- Requests -------------------------------------------------------------
  const apiFetch = useCallback(
    async (url, options = {}) => {
      const { timeoutMs = API_TIMEOUT_MS, ...requestOptions } = options;
      const method = String(requestOptions.method || "GET").toUpperCase();
      const headers = new Headers(requestOptions.headers || {});
      const nextOptions = {
        ...requestOptions,
        credentials: requestOptions.credentials || "include",
        headers
      };

      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        // Only the browser's own flag: refusing on an unanswered request could
        // refuse the one request that would show the server is back.
        if (navigator.onLine === false && !QUEUED_LOG_PATHS.has(url)) {
          throw new Error(OFFLINE_WRITE_MESSAGE);
        }
        const csrfToken = await ensureCsrfToken();
        if (!csrfToken) {
          throw new Error("Security token unavailable. Refresh and try again.");
        }
        headers.set(CSRF_HEADER_NAME, csrfToken);
      }
      return fetchWithTimeout(url, nextOptions, timeoutMs);
    },
    [ensureCsrfToken]
  );

  return {
    apiFetch,
    ensureCsrfToken
  };
}
