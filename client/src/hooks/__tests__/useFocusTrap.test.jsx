import { fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { describe, expect, test } from "vitest";
import useFocusTrap from "../useFocusTrap";

// An overlay with three controls, beside a page with two of its own. The
// overlay is rendered only while open, as ModalPortal and the drawer are.
function Harness({ open, name = "overlay", controls = ["First", "Middle", "Last"] }) {
  const ref = useRef(null);
  useFocusTrap(open, ref);
  return open ? (
    <div ref={ref} data-testid={name}>
      {controls.map((label) => (
        <button key={label} type="button">
          {`${name} ${label}`}
        </button>
      ))}
    </div>
  ) : null;
}

function Page({ children }) {
  return (
    <>
      <button type="button">Opener</button>
      {children}
      <button type="button">Behind</button>
    </>
  );
}

const button = (name) => screen.getByRole("button", { name });

// A Tab keypress as the trap sees it, then the focus the browser would move.
const tabTo = (target, { shiftKey = false } = {}) => {
  fireEvent.keyDown(document.activeElement || document.body, { key: "Tab", shiftKey });
  target.focus();
};

describe("useFocusTrap", () => {
  test("moves focus to the overlay's first control when it opens", () => {
    const view = render(<Page>{<Harness open={false} />}</Page>);
    button("Opener").focus();

    view.rerender(<Page>{<Harness open />}</Page>);

    expect(document.activeElement).toBe(button("overlay First"));
  });

  test("Tab past the last control comes back to the first", () => {
    render(<Page>{<Harness open />}</Page>);
    button("overlay Last").focus();

    tabTo(button("Behind"));

    expect(document.activeElement).toBe(button("overlay First"));
  });

  test("Shift+Tab before the first control goes round to the last", () => {
    render(<Page>{<Harness open />}</Page>);
    button("overlay First").focus();

    tabTo(button("Opener"), { shiftKey: true });

    expect(document.activeElement).toBe(button("overlay Last"));
  });

  // At the end of the document there is nothing on the page to Tab to, and
  // the browser would take focus to its own toolbar, so the key itself wraps.
  test("Tab on the last control wraps to the first instead of leaving the page", () => {
    render(<Page>{<Harness open />}</Page>);
    button("overlay Last").focus();

    const allowed = fireEvent.keyDown(document.activeElement, { key: "Tab" });

    expect(allowed).toBe(false);
    expect(document.activeElement).toBe(button("overlay First"));
  });

  test("Shift+Tab on the first control wraps to the last", () => {
    render(<Page>{<Harness open />}</Page>);
    button("overlay First").focus();

    const allowed = fireEvent.keyDown(document.activeElement, { key: "Tab", shiftKey: true });

    expect(allowed).toBe(false);
    expect(document.activeElement).toBe(button("overlay Last"));
  });

  test("lets the browser move focus between controls in the middle", () => {
    render(<Page>{<Harness open />}</Page>);
    button("overlay Middle").focus();

    expect(fireEvent.keyDown(document.activeElement, { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(document.activeElement, { key: "Tab", shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(document.activeElement, { key: "Enter" })).toBe(true);
  });

  // A browser reports a control hidden by CSS through checkVisibility; jsdom
  // has no layout, so the stub stands in for it.
  test("does not count a control the browser reports hidden as the last one", () => {
    render(<Page>{<Harness open controls={["First", "Middle", "Hidden"]} />}</Page>);
    const hidden = button("overlay Hidden");
    hidden.checkVisibility = () => false;
    button("overlay Middle").focus();

    expect(fireEvent.keyDown(document.activeElement, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(button("overlay First"));
  });

  test("leaves focus alone while it moves inside the overlay", () => {
    render(<Page>{<Harness open />}</Page>);

    tabTo(button("overlay Middle"));

    expect(document.activeElement).toBe(button("overlay Middle"));
  });

  test("skips a disabled control and one taken out of the tab order", () => {
    function Mixed({ open }) {
      const ref = useRef(null);
      useFocusTrap(open, ref);
      return (
        <div ref={ref}>
          <button type="button" disabled>
            Disabled
          </button>
          <button type="button" tabIndex={-1}>
            Untabbable
          </button>
          <button type="button">Reachable</button>
        </div>
      );
    }
    render(
      <Page>
        <Mixed open />
      </Page>
    );

    expect(document.activeElement).toBe(button("Reachable"));
  });

  // The selector cannot see that a control sits in a disabled fieldset, but
  // the control refuses focus, and the next one is tried.
  test("moves past a control that refuses focus", () => {
    function Fieldset({ open }) {
      const ref = useRef(null);
      useFocusTrap(open, ref);
      return (
        <div ref={ref}>
          <fieldset disabled>
            <button type="button">Locked</button>
          </fieldset>
          <button type="button">Open</button>
        </div>
      );
    }
    render(
      <Page>
        <Fieldset open />
      </Page>
    );

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open" }));
  });

  // A modal that focuses a field of its own as it mounts keeps that focus.
  test("leaves focus where it is if the overlay already holds it", () => {
    // Effects run in the order they are declared, so this one focuses the
    // field before the trap's runs, as a modal's own focus call would.
    function AutoFocused({ open }) {
      const ref = useRef(null);
      const field = useRef(null);
      useEffect(() => {
        field.current.focus();
      }, []);
      useFocusTrap(open, ref);
      return (
        <div ref={ref}>
          <button type="button">Close</button>
          <input aria-label="Name" ref={field} />
        </div>
      );
    }
    render(
      <Page>
        <AutoFocused open />
      </Page>
    );

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
  });

  // A hidden or inert control is never the edge Tab wraps at: if it were,
  // Tab from the last control that can really take focus would walk out.
  test("does not count a control inside something hidden or inert as the last one", () => {
    function Collapsed({ open }) {
      const ref = useRef(null);
      useFocusTrap(open, ref);
      return (
        <div ref={ref}>
          <button type="button">Shown</button>
          <div hidden>
            <button type="button">Collapsed</button>
          </div>
          <div inert>
            <button type="button">Frozen</button>
          </div>
        </div>
      );
    }
    render(
      <Page>
        <Collapsed open />
      </Page>
    );
    const shown = screen.getByRole("button", { name: "Shown" });
    expect(document.activeElement).toBe(shown);

    expect(fireEvent.keyDown(shown, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(shown);
  });

  // A click on something that cannot take focus leaves focus on the body,
  // with no focusin for the trap to answer. The next Tab comes straight back
  // into the overlay rather than starting from wherever the browser chooses.
  test("Tab with focus on the body goes straight back in", () => {
    render(<Page>{<Harness open />}</Page>);
    document.activeElement.blur();
    expect(document.activeElement).toBe(document.body);

    expect(fireEvent.keyDown(document.body, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(button("overlay First"));
  });

  test("returns focus to the opener when the overlay closes", () => {
    const view = render(<Page>{<Harness open={false} />}</Page>);
    button("Opener").focus();
    view.rerender(<Page>{<Harness open />}</Page>);

    view.rerender(<Page>{<Harness open={false} />}</Page>);

    expect(document.activeElement).toBe(button("Opener"));
  });

  test("does not reach for an opener that is gone", () => {
    function Swap({ open, showOpener }) {
      return (
        <>
          {showOpener ? <button type="button">Opener</button> : null}
          <Harness open={open} />
        </>
      );
    }
    const view = render(<Swap open={false} showOpener />);
    button("Opener").focus();
    view.rerender(<Swap open showOpener />);
    view.rerender(<Swap open showOpener={false} />);

    view.rerender(<Swap open={false} showOpener={false} />);

    expect(document.activeElement).toBe(document.body);
  });

  test("does nothing while closed", () => {
    render(<Page>{<Harness open={false} />}</Page>);
    button("Opener").focus();

    tabTo(button("Behind"));

    expect(document.activeElement).toBe(button("Behind"));
  });

  test("with two overlays open, only the newer one holds focus until it closes", () => {
    const both = (second) => (
      <Page>
        <Harness open name="lower" />
        <Harness open={second} name="upper" />
      </Page>
    );
    const view = render(both(false));
    view.rerender(both(true));
    expect(document.activeElement).toBe(button("upper First"));

    tabTo(button("lower Middle"));
    expect(document.activeElement).toBe(button("upper First"));

    // The lower trap must not treat the upper overlay as outside itself: a
    // Tab between the upper overlay's own controls is the browser's to move.
    button("upper Middle").focus();
    expect(fireEvent.keyDown(document.activeElement, { key: "Tab" })).toBe(true);
    expect(document.activeElement).toBe(button("upper Middle"));

    view.rerender(both(false));
    // The upper overlay's opener was the lower one's first control.
    expect(document.activeElement).toBe(button("lower First"));
    tabTo(button("Behind"));
    expect(document.activeElement).toBe(button("lower First"));
  });

  test("an overlay with nothing to focus leaves focus where it was", () => {
    const view = render(<Page>{<Harness open={false} controls={[]} />}</Page>);
    button("Opener").focus();

    view.rerender(<Page>{<Harness open controls={[]} />}</Page>);

    expect(document.activeElement).toBe(button("Opener"));
  });
});
