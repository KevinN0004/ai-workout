/**
 * Pins OfflineHint: it says "You're offline" only while the connection store
 * reads offline, and follows it as it changes.
 */
import { act, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import OfflineHint from "../OfflineHint";
import { markAnswered, markUnanswered } from "../../app/connection";

describe("OfflineHint", () => {
  test("says nothing while online", () => {
    const { container } = render(<OfflineHint />);

    expect(container).toBeEmptyDOMElement();
  });

  test("says so while offline, and goes once the connection is back", () => {
    markUnanswered();
    render(<OfflineHint />);
    expect(screen.getByText("You're offline")).toBeInTheDocument();

    act(() => markAnswered());

    expect(screen.queryByText("You're offline")).not.toBeInTheDocument();
  });
});
