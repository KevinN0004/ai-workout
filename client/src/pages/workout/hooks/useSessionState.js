/**
 * The open in-gym session as the session page's state, written to the device
 * on every change (roadmap B6).
 */
import { useCallback, useState } from "react";
import { writeActiveSession } from "../../../app/activeSession";

/**
 * `session`, starting from `initialSession`; `update(next)`, which shows `next`
 * and keeps it on the device for `user`; and `kept`, false once the device has
 * refused a write, so the page can say the workout is not being kept.
 */
export default function useSessionState(user, initialSession) {
  const [session, setSession] = useState(initialSession);
  const [kept, setKept] = useState(true);

  const update = useCallback(
    (next) => {
      setSession(next);
      setKept(writeActiveSession(user, next));
    },
    [user]
  );

  return { session, update, kept };
}
