/**
 * Registers the app's service worker, through vite-plugin-pwa's React module,
 * and reports when a new version is waiting. Called once, by App.
 */
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Whether a new version of the app is waiting (`ready`), and `reload`, which
 * activates it and reloads the page. Nothing reloads by itself: the config's
 * registerType "prompt" leaves that to the visitor
 * (docs/specs/2026-11-06-offline-ready-pwa-design.md). Without a built worker,
 * in development, `ready` stays false.
 */
export default function useWorkerUpdate() {
  const {
    needRefresh: [ready],
    updateServiceWorker
  } = useRegisterSW();
  return { ready, reload: () => updateServiceWorker(true) };
}
