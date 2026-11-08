/**
 * Pins the session page's screen wake lock (roadmap B6): asked for on mount and
 * again whenever the page is shown, let go on unmount, every refusal ignored,
 * and nothing at all in a browser without navigator.wakeLock.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import useWakeLock from "../useWakeLock";

const sentinel = () => ({ release: vi.fn(() => Promise.resolve()) });

const stubWakeLock = (request) =>
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });

const setVisibility = (state) =>
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });

// Lets the request's promise chain settle.
const settle = () => act(async () => {});

const changeVisibility = async (state) => {
  setVisibility(state);
  document.dispatchEvent(new Event("visibilitychange"));
  await settle();
};

afterEach(() => {
  delete navigator.wakeLock;
  delete document.visibilityState;
});

describe("useWakeLock", () => {
  test("asks for a screen lock on mount and lets it go on unmount", async () => {
    const lock = sentinel();
    const request = vi.fn(() => Promise.resolve(lock));
    stubWakeLock(request);

    const { unmount } = renderHook(() => useWakeLock());
    await settle();
    expect(request).toHaveBeenCalledWith("screen");

    unmount();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  test("asks again when the page is shown, not when it is hidden", async () => {
    const request = vi.fn(() => Promise.resolve(sentinel()));
    stubWakeLock(request);
    renderHook(() => useWakeLock());
    await settle();

    await changeVisibility("hidden");
    expect(request).toHaveBeenCalledTimes(1);
    await changeVisibility("visible");
    expect(request).toHaveBeenCalledTimes(2);
  });

  test("a refused request changes nothing", async () => {
    stubWakeLock(vi.fn(() => Promise.reject(new Error("NotAllowedError"))));

    const { unmount } = renderHook(() => useWakeLock());
    await settle();
    unmount();
  });

  test("a request that throws changes nothing", async () => {
    stubWakeLock(
      vi.fn(() => {
        throw new TypeError("not allowed here");
      })
    );

    renderHook(() => useWakeLock());
    await settle();
  });

  test("a lock granted after the page closed is let go at once", async () => {
    const lock = sentinel();
    let grant;
    stubWakeLock(vi.fn(() => new Promise((resolve) => (grant = resolve))));

    const { unmount } = renderHook(() => useWakeLock());
    await settle();
    unmount();
    expect(lock.release).not.toHaveBeenCalled();

    grant(lock);
    await settle();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  test("a release the browser refuses is ignored", async () => {
    const lock = { release: vi.fn(() => Promise.reject(new Error("already released"))) };
    stubWakeLock(vi.fn(() => Promise.resolve(lock)));

    const { unmount } = renderHook(() => useWakeLock());
    await settle();
    unmount();
    await settle();
    expect(lock.release).toHaveBeenCalledTimes(1);
  });

  test("does nothing in a browser without navigator.wakeLock", async () => {
    const { unmount } = renderHook(() => useWakeLock());
    await changeVisibility("visible");
    unmount();
  });
});
