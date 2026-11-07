/**
 * How old a saved copy is, in words, for App's offline notice ("2 h ago").
 */

const MINUTE_MS = 60 * 1000;

/**
 * The time from `then` to `now` (both milliseconds since the epoch) as "just
 * now", "5 min ago", "2 h ago" or "3 days ago"; null when `then` is not a
 * finite number or is later than `now`, so the notice leaves the age out.
 */
export const describeAge = (then, now) => {
  if (!Number.isFinite(then) || then > now) return null;
  const minutes = Math.floor((now - then) / MINUTE_MS);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
};
