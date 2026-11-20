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
 * The first field of `T` that JSON would not deliver as typed, as a dotted path
 * ("dashboard.calories.any"): an `any`, a `Date`, which arrives as a string, or a
 * Prisma `Decimal`. `never` when there is none. `D` counts the depth, so a type
 * that refers to itself stops.
 * @template T
 * @template {unknown[]} [D=[]]
 * @typedef {D["length"] extends 8 ? never : 0 extends (1 & T) ? "any" : T extends Date ? "Date" : T extends { toDecimalPlaces: Function } ? "Decimal" : T extends readonly (infer U)[] ? NotWireSafe<U, [...D, 0]> : T extends Function ? never : T extends object ? { [K in keyof T]-?: NotWireSafe<T[K], [...D, 0]> extends never ? never : `${K & string}.${NotWireSafe<T[K], [...D, 0]> & string}` }[keyof T] : never} NotWireSafe
 */

/**
 * A server answer's type as the client may trust it: `T` when every field arrives
 * as typed, else an object whose one field names the field that would not, so a
 * read through it fails the typecheck. Each answer the client reads is cast
 * through it.
 * @template T
 * @typedef {[NotWireSafe<T>] extends [never] ? T : { notWireSafe: NotWireSafe<T> }} Wire
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
