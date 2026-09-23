import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import WorkoutResultPage from "../WorkoutResultPage";

// Prop-driven apart from one piece of state -- the vertical/horizontal table
// toggle -- so these drive the two table renderings, the row-label derivation
// the horizontal layout does itself, and the four buttons a visitor can press.
// The plan text arrives from Gemini via App's parser, so every shape here
// (missing days, a day with no lines, ragged line counts, blank lines) is one
// the parser can actually produce.

const day = (title, lines) => ({ title, lines });

const renderPage = (props = {}) => {
  const handlers = {
    go: vi.fn(),
    onDownloadPlanPdf: vi.fn(),
    onSignupWithPrefilledProfile: vi.fn()
  };
  const utils = render(
    <WorkoutResultPage
      gradient={{}}
      user={null}
      planSections={{ days: [], notes: [] }}
      hasResult
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

const showHorizontal = () => fireEvent.click(screen.getByText("Horizontal"));

// The row a `<th scope="row">` label sits in, so a test can read that row's
// cells. Matched by role rather than by text: the horizontal layout derives its
// row label from the line itself, so the same string is often in the row twice.
const rowFor = (label) => screen.getByRole("rowheader", { name: label }).closest("tr");

describe("WorkoutResultPage", () => {
  describe("no generated plan", () => {
    test("says so rather than rendering an empty table", () => {
      renderPage({ hasResult: false });
      expect(screen.getByText("No generated workout is available yet.")).toBeInTheDocument();
      expect(screen.queryByRole("table")).toBeNull();
    });

    test("the header tells the visitor where to generate one", () => {
      renderPage({ hasResult: false });
      expect(
        screen.getByText("Generate a workout from the homepage to view it here.")
      ).toBeInTheDocument();
    });

    test("the layout toggle is not offered", () => {
      renderPage({ hasResult: false });
      expect(screen.queryByText("Vertical")).toBeNull();
      expect(screen.queryByText("Horizontal")).toBeNull();
    });

    test("Back to Home routes home", () => {
      const { go } = renderPage({ hasResult: false });
      fireEvent.click(screen.getByText("Back to Home"));
      expect(go).toHaveBeenCalledWith("/");
    });

    test("the header invites a signup once a plan exists", () => {
      renderPage();
      expect(
        screen.getByText("Review your plan below. Sign up to save your profile and keep tracking.")
      ).toBeInTheDocument();
    });
  });

  describe("the vertical layout", () => {
    test("opens vertical, with that button marked active", () => {
      renderPage();
      expect(screen.getByLabelText("Generated workout table vertical layout")).toBeInTheDocument();
      expect(screen.getByText("Vertical")).toHaveClass("active");
      expect(screen.getByText("Horizontal")).not.toHaveClass("active");
    });

    test("renders one row per day with its lines as list items", () => {
      renderPage({
        planSections: { days: [day("Monday", ["Squat 5x5", "Row 3x8"])], notes: [] }
      });
      const row = rowFor("Monday");
      expect(within(row).getByText("Squat 5x5")).toBeInTheDocument();
      expect(within(row).getByText("Row 3x8")).toBeInTheDocument();
    });

    test("a day carrying no lines reads as such rather than as a blank cell", () => {
      renderPage({ planSections: { days: [day("Rest day", [])], notes: [] } });
      expect(within(rowFor("Rest day")).getByText("No details provided.")).toBeInTheDocument();
    });

    test("a day whose lines are not an array is treated the same way", () => {
      // The parser has handed back a string for this before.
      renderPage({ planSections: { days: [day("Monday", "Squat 5x5")], notes: [] } });
      expect(within(rowFor("Monday")).getByText("No details provided.")).toBeInTheDocument();
    });

    test("no days at all falls back to a single Plan row", () => {
      renderPage({ planSections: { days: [], notes: [] } });
      expect(screen.getByText("No structured day-by-day sections were found.")).toBeInTheDocument();
      expect(rowFor("Plan")).toBeTruthy();
    });
  });

  describe("switching layouts", () => {
    test("Horizontal swaps the table and moves the active marker", () => {
      renderPage();
      showHorizontal();

      expect(
        screen.getByLabelText("Generated workout table horizontal layout")
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Generated workout table vertical layout")).toBeNull();
      expect(screen.getByText("Horizontal")).toHaveClass("active");
      expect(screen.getByText("Vertical")).not.toHaveClass("active");
    });

    test("Vertical switches back", () => {
      renderPage();
      showHorizontal();
      fireEvent.click(screen.getByText("Vertical"));
      expect(screen.getByLabelText("Generated workout table vertical layout")).toBeInTheDocument();
    });

    test("only one table is ever mounted", () => {
      renderPage();
      expect(screen.getAllByRole("table")).toHaveLength(1);
      showHorizontal();
      expect(screen.getAllByRole("table")).toHaveLength(1);
    });

    test("the toggle is exposed as a labelled group", () => {
      renderPage();
      expect(screen.getByRole("group", { name: "Workout table layout" })).toBeInTheDocument();
    });
  });

  describe("the horizontal layout", () => {
    test("puts each day in its own column", () => {
      renderPage({
        planSections: {
          days: [day("Monday", ["Squat 5x5"]), day("Tuesday", ["Run 5k"])],
          notes: []
        }
      });
      showHorizontal();

      const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
      expect(headers).toEqual(["Task", "Monday", "Tuesday"]);
    });

    test("no days leaves a single Plan column and the empty-state row", () => {
      renderPage({ planSections: { days: [], notes: [] } });
      showHorizontal();

      expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
        "Task",
        "Plan"
      ]);
      expect(screen.getByText("No structured day-by-day sections were found.")).toBeInTheDocument();
    });

    test("a day short of lines gets a dash rather than an empty cell", () => {
      // Ragged line counts are the norm: a rest day has fewer entries than a
      // training day, and the transposed table still needs a cell for it.
      renderPage({
        planSections: {
          days: [day("Monday", ["Squat 5x5", "Row 3x8"]), day("Tuesday", ["Run 5k"])],
          notes: []
        }
      });
      showHorizontal();

      const cells = within(rowFor("Row 3x8")).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent("Row 3x8");
      expect(cells[1]).toHaveTextContent("-");
    });

    describe("the row label it derives", () => {
      const labelOf = (lines) => {
        renderPage({ planSections: { days: [day("Monday", lines)], notes: [] } });
        showHorizontal();
        return screen
          .getAllByRole("rowheader")
          .map((th) => th.textContent)
          .slice(0, lines.length);
      };

      test("uses the text before a colon", () => {
        expect(labelOf(["Warmup: 10 min bike"])).toEqual(["Warmup"]);
      });

      test("uses the first three words when there is no colon", () => {
        expect(labelOf(["Back squat five by five heavy"])).toEqual(["Back squat five"]);
      });

      test("keeps a short line whole", () => {
        expect(labelOf(["Cooldown"])).toEqual(["Cooldown"]);
      });

      test("ignores a leading colon rather than producing an empty label", () => {
        // colonIndex 0 is not a prefix, so this has to fall through to words.
        expect(labelOf([": 10 min bike"])).toEqual([": 10 min"]);
      });

      test("numbers a row whose every day is blank", () => {
        // The parser emits placeholder blanks, and a row of them would
        // otherwise render a header with no text at all.
        expect(labelOf(["Warmup: bike", "", ""])).toEqual(["Warmup", "Task 2", "Task 3"]);
      });

      test("takes the label from the first day that has text on that row", () => {
        renderPage({
          planSections: {
            days: [day("Monday", [""]), day("Tuesday", ["Deadlift: 3x5"])],
            notes: []
          }
        });
        showHorizontal();
        expect(screen.getAllByRole("rowheader")[0]).toHaveTextContent("Deadlift");
      });
    });
  });

  describe("column density", () => {
    // The wrap element carries the counts to CSS as custom properties; they are
    // what stops a twelve-exercise day rendering as one very long column.
    const densityOf = (lineCount, dayCount = 1) => {
      const lines = Array.from({ length: lineCount }, (_, i) => `Line ${i + 1}`);
      const { container } = renderPage({
        planSections: {
          days: Array.from({ length: dayCount }, (_, i) => day(`Day ${i + 1}`, lines)),
          notes: []
        }
      });
      const wrap = container.querySelector(".plan-result-table-wrap");
      return {
        days: wrap.style.getPropertyValue("--plan-day-count"),
        cols: wrap.style.getPropertyValue("--plan-vertical-line-cols")
      };
    };

    test.each([
      [1, "1"],
      [5, "1"],
      [6, "2"],
      [9, "2"],
      [10, "3"]
    ])("%i lines asks for %s column(s)", (lineCount, expected) => {
      expect(densityOf(lineCount).cols).toBe(expected);
    });

    test("reports the number of days", () => {
      expect(densityOf(3, 4).days).toBe("4");
    });

    test("reports one day even when there are none, since zero would divide by zero in CSS", () => {
      const { container } = renderPage({ planSections: { days: [], notes: [] } });
      const wrap = container.querySelector(".plan-result-table-wrap");
      expect(wrap.style.getPropertyValue("--plan-day-count")).toBe("1");
    });
  });

  describe("coach notes", () => {
    test("renders each note", () => {
      renderPage({ planSections: { days: [], notes: ["Hydrate", "Sleep eight hours"] } });
      const notes = screen.getByRole("region", { name: "Coach notes" });
      expect(within(notes).getByText("Hydrate")).toBeInTheDocument();
      expect(within(notes).getByText("Sleep eight hours")).toBeInTheDocument();
    });

    test("the section is omitted entirely when there are none", () => {
      renderPage({ planSections: { days: [], notes: [] } });
      expect(screen.queryByRole("region", { name: "Coach notes" })).toBeNull();
    });

    test("a non-array notes field is treated as none", () => {
      renderPage({ planSections: { days: [], notes: "Hydrate" } });
      expect(screen.queryByRole("region", { name: "Coach notes" })).toBeNull();
    });
  });

  describe("a missing planSections", () => {
    test("null does not take the page down", () => {
      expect(() => renderPage({ planSections: null })).not.toThrow();
      expect(screen.getByText("No structured day-by-day sections were found.")).toBeInTheDocument();
    });

    test("a days field that is not an array is treated as no days", () => {
      renderPage({ planSections: { days: "Monday", notes: [] } });
      expect(rowFor("Plan")).toBeTruthy();
    });
  });

  describe("the actions", () => {
    test("Download PDF calls the download handler", () => {
      const { onDownloadPlanPdf } = renderPage();
      fireEvent.click(screen.getByText("Download PDF"));
      expect(onDownloadPlanPdf).toHaveBeenCalled();
    });

    test("a signed-out visitor is offered a signup that carries the profile over", () => {
      const { onSignupWithPrefilledProfile } = renderPage({ user: null });
      fireEvent.click(screen.getByText("Signup"));
      expect(onSignupWithPrefilledProfile).toHaveBeenCalled();
    });

    test("a signed-in visitor is not offered a signup", () => {
      renderPage({ user: { email: "a@b.c" } });
      expect(screen.queryByText("Signup")).toBeNull();
    });

    test("a signed-in visitor is sent to the dashboard", () => {
      const { go } = renderPage({ user: { email: "a@b.c" } });
      fireEvent.click(screen.getByText("Open Dashboard"));
      expect(go).toHaveBeenCalledWith("/dashboard");
    });

    test("a signed-out visitor is sent home", () => {
      const { go } = renderPage({ user: null });
      fireEvent.click(screen.getByText("Back to Home"));
      expect(go).toHaveBeenCalledWith("/");
    });
  });
});
