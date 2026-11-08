/**
 * Pins the rest timer's clock (roadmap B6): it counts down from the rest's end
 * time, catches up when the page is shown again, and calls onEnd once per rest,
 * only when it sees the end within 5 seconds of it.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import useRestTimer from "../useRestTimer";

const NOW = Date.UTC(2026, 10, 9, 17, 0, 0);

const tick = (ms) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const showPage = () =>
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
// A locked phone: the clock moves on, but no timer runs.
const lockFor = (ms) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRestTimer", () => {
  test("counts the seconds left down from the end time", () => {
    const { result } = renderHook(() => useRestTimer(NOW + 90_000, vi.fn()));
    expect(result.current).toEqual({ remaining: 90, over: false });

    tick(1000);
    expect(result.current).toEqual({ remaining: 89, over: false });

    tick(89_000);
    expect(result.current).toEqual({ remaining: 0, over: true });
  });

  test("a part second left counts as a whole one", () => {
    const { result } = renderHook(() => useRestTimer(NOW + 1_500, vi.fn()));

    expect(result.current.remaining).toBe(2);
  });

  test("a new rest set between ticks starts from the true time", () => {
    const { result, rerender } = renderHook(({ endsAt }) => useRestTimer(endsAt, vi.fn()), {
      initialProps: { endsAt: NOW + 30_000 }
    });
    tick(30_500);

    rerender({ endsAt: Date.now() + 90_000 });
    expect(result.current.remaining).toBe(90);
  });

  test("a locked phone's jump is caught up at once when the page is shown", () => {
    const { result } = renderHook(() => useRestTimer(NOW + 90_000, vi.fn()));

    lockFor(60_000);
    expect(result.current.remaining).toBe(90);
    showPage();
    expect(result.current.remaining).toBe(30);
  });

  test("onEnd runs once, at the end", () => {
    const onEnd = vi.fn();
    renderHook(() => useRestTimer(NOW + 90_000, onEnd));

    tick(89_000);
    expect(onEnd).not.toHaveBeenCalled();
    tick(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    // A second at a time, as a page renders them: one act batches its ticks.
    for (let second = 0; second < 10; second += 1) tick(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("an end seen 5 seconds late still runs onEnd", () => {
    const onEnd = vi.fn();
    renderHook(() => useRestTimer(NOW + 90_000, onEnd));

    lockFor(95_000);
    showPage();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("an end seen 6 seconds late is over without onEnd", () => {
    const onEnd = vi.fn();
    const { result } = renderHook(() => useRestTimer(NOW + 90_000, onEnd));

    lockFor(96_000);
    showPage();
    expect(result.current).toEqual({ remaining: 0, over: true });
    expect(onEnd).not.toHaveBeenCalled();
  });

  test("a rest long over when it opens, as on Resume, runs no onEnd", () => {
    const onEnd = vi.fn();
    const { result } = renderHook(() => useRestTimer(NOW - 60_000, onEnd));

    tick(1000);
    expect(result.current.over).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });

  test("a new rest re-arms it", () => {
    const onEnd = vi.fn();
    const { result, rerender } = renderHook(({ endsAt }) => useRestTimer(endsAt, onEnd), {
      initialProps: { endsAt: NOW + 30_000 }
    });
    tick(30_000);
    expect(onEnd).toHaveBeenCalledTimes(1);

    rerender({ endsAt: Date.now() + 45_000 });
    expect(result.current).toEqual({ remaining: 45, over: false });
    tick(45_000);
    expect(onEnd).toHaveBeenCalledTimes(2);
  });

  test("onEnd is the latest one passed", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderHook(({ onEnd }) => useRestTimer(NOW + 5_000, onEnd), {
      initialProps: { onEnd: first }
    });
    rerender({ onEnd: latest });

    tick(5_000);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });
});
