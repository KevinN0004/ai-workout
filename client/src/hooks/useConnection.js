/**
 * The connection store as React state, for the controls that disable a write
 * offline and for App's offline notice.
 */
import { useSyncExternalStore } from "react";
import { getConnection, subscribeConnection } from "../app/connection";

/** "online" or "offline", re-rendering whenever the store changes. */
export default function useConnection() {
  return useSyncExternalStore(subscribeConnection, getConnection);
}
