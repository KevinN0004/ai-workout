/**
 * fetch with a deadline, for the dashboard's reads (useDashboardData's and
 * useOlderLogPages'), App's session check and every apiFetch request. Each
 * request also tells the connection store whether it got an answer.
 */
// @ts-check
import { markAnswered, markUnanswered } from "./connection";

/**
 * The fetch every API request goes through, useApiClient's `apiFetch`:
 * `fetch`'s own options, plus `timeoutMs`, the deadline in milliseconds.
 * @typedef {(url: string, options?: RequestInit & { timeoutMs?: number }) => Promise<Response>} ApiFetch
 */

/**
 * fetch that aborts after `timeoutMs` and then rejects with a message fit to
 * show the visitor instead of an AbortError. It sets its own `signal`,
 * replacing any in `options`. Any answer, an error status included, marks the
 * connection answered; a network error or the deadline marks it unanswered.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 */
export const fetchWithTimeout = async (url, options = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    markAnswered();
    return response;
  } catch (error) {
    markUnanswered();
    // fetch rejects with an Error: a DOMException when aborted, a TypeError when
    // the network fails.
    if (/** @type {Error | undefined} */ (error)?.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
