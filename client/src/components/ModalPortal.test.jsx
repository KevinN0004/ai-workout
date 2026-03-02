import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
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
});
