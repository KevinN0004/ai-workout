/** fetch with a deadline, for the dashboard's reads in useDashboardData. */

/**
 * fetch that aborts after `timeoutMs` and then rejects with a message fit to
 * show the visitor instead of an AbortError. It sets its own `signal`,
 * replacing any in `options`.
 */
export const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
