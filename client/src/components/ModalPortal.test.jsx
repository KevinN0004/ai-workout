import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ModalPortal from "./ModalPortal";

describe("ModalPortal", () => {
  test("renders nothing when closed", () => {
    const { container } = render(
      <ModalPortal open={false}>
        <div>Hidden modal</div>
      </ModalPortal>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Hidden modal")).not.toBeInTheDocument();
  });

  test("portals content to body and manages body lock when open", () => {
    const { container, unmount } = render(
      <ModalPortal open>
        <div>Visible modal</div>
      </ModalPortal>
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.getByText("Visible modal")).toBeInTheDocument();
    expect(document.body).toHaveClass("no-scroll");

    unmount();
    expect(document.body).not.toHaveClass("no-scroll");
  });

  // Every modal in the app goes through this component, and none of them
  // handled Escape: a keyboard user could only leave by tabbing to the Close
  // button, while a mouse user could click the backdrop. Handling it here fixes
  // all six call sites at once, and is why the backdrop click can stay a
  // mouse-only convenience rather than needing its own key handler.
  describe("closing with Escape", () => {
    test("calls onClose when Escape is pressed", () => {
      const onClose = vi.fn();
      render(
        <ModalPortal open onClose={onClose}>
          <div>Visible modal</div>
        </ModalPortal>
      );

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("ignores other keys", () => {
      const onClose = vi.fn();
      render(
        <ModalPortal open onClose={onClose}>
          <div>Visible modal</div>
        </ModalPortal>
      );

      fireEvent.keyDown(document, { key: "Enter" });
      fireEvent.keyDown(document, { key: "a" });

      expect(onClose).not.toHaveBeenCalled();
    });

    test("does not listen while closed", () => {
      const onClose = vi.fn();
      render(
        <ModalPortal open={false} onClose={onClose}>
          <div>Hidden modal</div>
        </ModalPortal>
      );

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
    });

    // A stale listener would keep firing a closed modal's handler, so the
    // teardown matters as much as the handler.
    test("stops listening once unmounted", () => {
      const onClose = vi.fn();
      const { unmount } = render(
        <ModalPortal open onClose={onClose}>
          <div>Visible modal</div>
        </ModalPortal>
      );

      unmount();
      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
    });

    // Not every caller has something to do on Escape; the listener must not
    // throw when there is no handler.
    test("survives Escape with no handler supplied", () => {
      render(
        <ModalPortal open>
          <div>Visible modal</div>
        </ModalPortal>
      );

      expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
    });
  });
});
