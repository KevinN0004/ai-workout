/**
 * Whether the page can reach the server, fed by every request (network.js)
 * and read by useConnection, which disables the writes that cannot wait.
 */

// While offline, how often to ask the server whether it is back, and how long
// one ask waits for an answer, in milliseconds.
const PROBE_INTERVAL_MS = 30000;
const PROBE_TIMEOUT_MS = 10000;

let lastRequestUnanswered = false;
let probeTimer = null;
const listeners = new Set();

/**
 * "online" or "offline". Offline while the browser reports no network, and
 * while the last request got no answer: `navigator.onLine` stays true on a
 * Wi-Fi with no internet behind it.
 */
export const getConnection = () =>
  navigator.onLine !== false && !lastRequestUnanswered ? "online" : "offline";

// The probe runs only while someone is watching and the page is offline.
const syncProbe = () => {
  const wanted = listeners.size > 0 && getConnection() === "offline";
  if (wanted && !probeTimer) probeTimer = setInterval(probe, PROBE_INTERVAL_MS);
  if (!wanted && probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
};

const notify = () => {
  listeners.forEach((listener) => listener());
  syncProbe();
};

/** Records that a request was answered, whatever its status. */
export const markAnswered = () => {
  if (!lastRequestUnanswered) return;
  lastRequestUnanswered = false;
  notify();
};

/** Records that a request got no answer: a network error or a timeout. */
export const markUnanswered = () => {
  if (lastRequestUnanswered) return;
  lastRequestUnanswered = true;
  notify();
};

// Asks GET /api/health, with fetch itself rather than fetchWithTimeout, which
// reports into this store. Any answer means the server is back; no answer
// changes nothing.
function probe() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  fetch("/api/health", { cache: "no-store", signal: controller.signal })
    .then(markAnswered, () => {})
    .finally(() => clearTimeout(timer));
}

const onBrowserOnline = () => {
  notify();
  probe();
};

/**
 * Calls `listener` whenever the connection may have changed, until the
 * returned function is called. The browser's online and offline events are
 * listened to only while someone subscribes.
 */
export const subscribeConnection = (listener) => {
  if (!listeners.size) {
    window.addEventListener("online", onBrowserOnline);
    window.addEventListener("offline", notify);
  }
  listeners.add(listener);
  syncProbe();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      window.removeEventListener("online", onBrowserOnline);
      window.removeEventListener("offline", notify);
    }
    syncProbe();
  };
};
