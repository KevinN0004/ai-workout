import { useCallback, useRef } from "react";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "../constants";
import { readCookie } from "../cache";

export default function useApiClient() {
  const csrfTokenRef = useRef("");

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
