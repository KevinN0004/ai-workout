/**
 * Pins the session page's rest timer (roadmap B6): the time left as digits,
 * −15 s, +15 s and Skip rest, and "Rest over" with no buttons once it ends.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import RestTimer from "../RestTimer";

const NOW = Date.UTC(2026, 10, 9, 17, 0, 0);

const tick = (ms) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const renderTimer = (restEndsAt = NOW + 90_000) => {
  const handlers = { onAdjust: vi.fn(), onSkip: vi.fn(), onEnd: vi.fn() };
  render(<RestTimer restEndsAt={restEndsAt} {...handlers} />);
  return handlers;
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RestTimer", () => {
  test("shows the time left as minutes and seconds, each second", () => {
    renderTimer();
    const rest = screen.getByRole("region", { name: "Rest" });

    expect(rest).toHaveTextContent("1:30");
    tick(1000);
    expect(rest).toHaveTextContent("1:29");
    tick(84_000);
    expect(rest).toHaveTextContent("0:05");
  });

  test("−15 s, +15 s and Skip rest reach the session", () => {
    const { onAdjust, onSkip } = renderTimer();

    fireEvent.click(screen.getByRole("button", { name: "−15 s" }));
    fireEvent.click(screen.getByRole("button", { name: "+15 s" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));

    expect(onAdjust.mock.calls).toEqual([[-15], [15]]);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  test("reads Rest over at the end, with nothing left to adjust", () => {
    const { onEnd } = renderTimer();

    tick(90_000);

    expect(screen.getByRole("region", { name: "Rest" })).toHaveTextContent("Rest over");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
