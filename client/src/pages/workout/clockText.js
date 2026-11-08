/**
 * A count of seconds as the session page's clocks show it: m:ss, or h:mm:ss
 * from an hour up (roadmap B6).
 */

const pad = (value) => String(value).padStart(2, "0");

/** `totalSeconds`, a whole number, as "1:30", or as "1:02:03" past an hour. */
export default function clockText(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
