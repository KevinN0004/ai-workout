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

  test("releases the lock without reaching for a document that is not there", () => {
    const view = render(<LockHarness locked />);
    expect(document.body).toHaveClass("no-scroll");

    // The guard is not about skipping the class toggle -- nothing would see it.
    // It is that the release path must survive an environment with no DOM at
    // all, where `document.body` is a TypeError rather than a missing class.
    // Unmounting is the only way in: the effect itself cannot start without a
    // document to render into.
    //
    // Deleting the global rather than stubbing it to undefined is the whole
    // point. `typeof` is what survives an *undeclared* identifier, and a plain
    // `!document` would raise a ReferenceError right here -- but only if the
    // global is genuinely absent. Stubbed to undefined, the two read alike and
    // the weaker check passes, which is a surviving mutant rather than a test.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    delete globalThis.document;
    try {
      expect(() => view.unmount()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "document", descriptor);
    }
  });
});
