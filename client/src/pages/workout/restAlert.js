/**
 * The alert at the end of a rest on the session page (roadmap B6): a short
 * beep through Web Audio, unlocked by a tap, and a buzz where the phone can.
 */

const BEEP_HZ = 880;
const BEEP_SECONDS = 0.2;
const BEEP_VOLUME = 0.25;
const BUZZ_PATTERN = [200, 100, 200];

// The page's one AudioContext, made by the first unlockAudio.
let context = null;

const ignore = () => {};

/**
 * Makes the page's AudioContext, or resumes it when suspended. Browsers play
 * sound only after a tap, so the session page calls this from its taps. Does
 * nothing without an AudioContext, or when the browser refuses to make one.
 */
export const unlockAudio = () => {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) return;
  try {
    context ??= new AudioContextClass();
    if (context.state === "suspended") context.resume().catch(ignore);
  } catch {
    // No context means no beep; the timer and the buzz still work.
  }
};

/** A 0.2-second beep at 880 Hz, once unlockAudio has made the context. */
export const beep = () => {
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = BEEP_HZ;
  gain.gain.value = BEEP_VOLUME;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + BEEP_SECONDS);
};

/** Two short buzzes where the browser can vibrate; iPhones cannot. */
export const buzz = () => {
  navigator.vibrate?.(BUZZ_PATTERN);
};
