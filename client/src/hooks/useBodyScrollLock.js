import { useEffect } from "react";

let lockCount = 0;

const syncBodyScrollClass = () => {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("no-scroll", lockCount > 0);
};

export default function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    lockCount += 1;
    syncBodyScrollClass();

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      syncBodyScrollClass();
    };
  }, [locked]);
}
