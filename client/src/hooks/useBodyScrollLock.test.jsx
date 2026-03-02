import { render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import useBodyScrollLock from "./useBodyScrollLock";

function LockHarness({ locked }) {
  useBodyScrollLock(locked);
  return <div>lock</div>;
}

afterEach(() => {
  document.body.classList.remove("no-scroll");
});

describe("useBodyScrollLock", () => {
  test("adds and removes no-scroll when lock state changes", () => {
    const view = render(<LockHarness locked={false} />);
    expect(document.body).not.toHaveClass("no-scroll");

    view.rerender(<LockHarness locked />);
    expect(document.body).toHaveClass("no-scroll");

    view.rerender(<LockHarness locked={false} />);
    expect(document.body).not.toHaveClass("no-scroll");
  });

  test("keeps body locked until the last lock owner unmounts", () => {
    const first = render(<LockHarness locked />);
    const second = render(<LockHarness locked />);
    expect(document.body).toHaveClass("no-scroll");

    first.unmount();
    expect(document.body).toHaveClass("no-scroll");

    second.unmount();
    expect(document.body).not.toHaveClass("no-scroll");
  });
});
