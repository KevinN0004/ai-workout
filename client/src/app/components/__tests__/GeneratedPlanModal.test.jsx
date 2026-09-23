import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import GeneratedPlanModal from "../GeneratedPlanModal";
import { APP_BRAND_NAME } from "../../constants";

// The modal a visitor sees after generating a plan, and the last thing standing
// between the Gemini response and the reader. It was at 0% on every metric --
// the only remaining client file with real conditional logic and no test.
//
// What it decides: whether to render at all, which day tab reads as selected,
// and whether each of the three optional lists is drawn or omitted.

const planSections = {
  days: [
    { title: "Monday", lines: ["Warmup: bike 5 min", "Squat 5x5"] },
    { title: "Tuesday", lines: ["Bench 5x5"] }
  ],
  notes: ["Sleep eight hours.", "Deload every fourth week."]
};

const renderModal = (props = {}) => {
  const handlers = {
    setPlanModalOpen: vi.fn(),
    setActiveDayIndex: vi.fn(),
    downloadPlanPdf: vi.fn(),
    go: vi.fn()
  };
  const utils = render(
    <GeneratedPlanModal
      planModalOpen
      result="a generated plan"
      planSections={planSections}
      activeDayIndex={0}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

describe("GeneratedPlanModal", () => {
  // Both halves of the guard, because either one alone would still render a
  // dialog with nothing in it.
  test.each([
    ["the modal is closed", { planModalOpen: false }],
    ["there is no result yet", { result: "" }]
  ])("renders nothing when %s", (_label, props) => {
    const { container } = renderModal(props);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("renders a dialog titled for the app", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: `Your ${APP_BRAND_NAME} Plan` })).toBeTruthy();
  });

  test("renders one tab per day", () => {
    renderModal();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Monday", "Tuesday"]);
  });

  // aria-selected is what a screen reader announces, so it has to track the
  // active index rather than only the class attribute.
  test("marks only the active day as selected", () => {
    renderModal({ activeDayIndex: 1 });

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  });

  test("shows the active day's lines, not another day's", () => {
    renderModal({ activeDayIndex: 1 });

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Bench 5x5")).toBeTruthy();
    expect(within(panel).queryByText("Squat 5x5")).toBeNull();
  });

  test("selecting a tab reports the index it was given", () => {
    const { setActiveDayIndex } = renderModal();

    fireEvent.click(screen.getByRole("tab", { name: "Tuesday" }));

    expect(setActiveDayIndex).toHaveBeenCalledWith(1);
  });

  test("renders the coach notes", () => {
    renderModal();

    expect(screen.getByText("Sleep eight hours.")).toBeTruthy();
    expect(screen.getByText("Deload every fourth week.")).toBeTruthy();
  });

  // An empty plan must not throw. Gemini returning something unparseable is the
  // realistic way this happens, and the heading stays either way.
  test("survives a plan with no days at all", () => {
    renderModal({ planSections: { days: [], notes: [] }, activeDayIndex: 0 });

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Coach notes" })).toBeTruthy();
  });

  test("omits the list when a day carries no lines", () => {
    renderModal({
      planSections: { days: [{ title: "Rest", lines: [] }], notes: [] },
      activeDayIndex: 0
    });

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).queryByRole("list")).toBeNull();
    expect(within(panel).getByRole("heading", { name: "Rest" })).toBeTruthy();
  });

  // An index past the end is reachable: the tabs come from a new plan while
  // activeDayIndex still holds the previous one's selection.
  test("survives an active index past the end of the plan", () => {
    renderModal({ activeDayIndex: 9 });

    expect(screen.getByRole("tabpanel")).toBeTruthy();
    expect(screen.queryByText("Squat 5x5")).toBeNull();
  });

  describe("footer actions", () => {
    test("closing the modal reports it", () => {
      const { setPlanModalOpen } = renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(setPlanModalOpen).toHaveBeenCalledWith(false);
    });

    test("downloading the plan calls through", () => {
      const { downloadPlanPdf } = renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

      expect(downloadPlanPdf).toHaveBeenCalled();
    });

    test("the sign-up prompt routes to auth", () => {
      const { go } = renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Login / Sign up" }));

      expect(go).toHaveBeenCalledWith("/auth");
    });
  });
});
