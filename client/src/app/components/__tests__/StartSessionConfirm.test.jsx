/**
 * Pins StartSessionConfirm: shown only while a new session waits, it names the
 * open one, and offers Resume, Discard and start, and a way out.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import StartSessionConfirm from "../StartSessionConfirm";

const openSession = { startedAt: Date.UTC(2026, 10, 9, 17, 5, 0), exercises: [{ sets: [1, 2] }] };

const renderConfirm = (props = {}) => {
  const handlers = { onResume: vi.fn(), onReplace: vi.fn(), onCancel: vi.fn() };
  render(<StartSessionConfirm openSession={openSession} waiting {...handlers} {...props} />);
  return handlers;
};

describe("StartSessionConfirm", () => {
  test("shows nothing while no new session waits", () => {
    renderConfirm({ waiting: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("names the open session, with its start and its sets", () => {
    renderConfirm();

    const started = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(openSession.startedAt);
    expect(
      screen.getByRole("dialog", { name: "A workout is in progress" })
    ).toHaveAccessibleDescription(`Started ${started}, with 2 sets logged.`);
  });

  test("Resume, Discard and start, and Escape each reach their handler", async () => {
    const { onResume, onReplace, onCancel } = renderConfirm();

    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard and start" }));
    await userEvent.keyboard("{Escape}");
    fireEvent.click(screen.getByRole("dialog"));

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onReplace).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
