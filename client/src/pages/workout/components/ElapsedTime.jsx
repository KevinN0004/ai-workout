/**
 * The time since the session started, under its title on the session page,
 * counting each second (roadmap B6).
 */
import clockText from "../clockText";
import useNow from "../hooks/useNow";

/** The time since `startedAt` (ms since the epoch), as m:ss or h:mm:ss. */
export default function ElapsedTime({ startedAt }) {
  const now = useNow(startedAt);
  // A device clock set back since the start shows 0:00, not a negative time.
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <p className="session-elapsed">
      <span className="visually-hidden">Time so far </span>
      {clockText(seconds)}
    </p>
  );
}
