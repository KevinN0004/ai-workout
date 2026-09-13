import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ExerciseDetailsModal from "./ExerciseDetailsModal";

// The detail sheet behind every exercise card in Tips. Almost all of it is
// fallback text for fields the wger catalogue leaves out -- category, muscles,
// equipment and description are each optional upstream -- plus the save button,
// which has three states and must not fire twice.

const exercise = {
  id: 7,
  name: "Barbell Squat",
  description: "Sit back between the heels.",
  category: { name: "Legs" },
  muscles: [{ name: "Quadriceps" }, { name: "Glutes" }],
  equipment: [{ name: "Barbell" }],
  videos: [{ id: "v1", url: "https://example.test/a.mp4" }],
  recommendation: { reasons: ["Matches your strength focus."] }
};

const renderModal = (props = {}) => {
  const handlers = { onClose: vi.fn(), onSave: vi.fn() };
  const utils = render(
    <ExerciseDetailsModal
      selectedExercise={exercise}
      isSaved={false}
      isSaving={false}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

describe("ExerciseDetailsModal", () => {
  test("renders nothing without an exercise", () => {
    const { container } = renderModal({ selectedExercise: null });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("names the exercise in the heading and the image alt text", () => {
    renderModal();

    expect(screen.getByRole("heading", { name: "Barbell Squat" })).toBeTruthy();
    expect(screen.getByAltText("Barbell Squat")).toBeTruthy();
  });

  // wger leaves any of these out depending on the entry, and a missing one must
  // read as unknown rather than as a blank row with a dangling label.
  describe("fallbacks for fields the catalogue omits", () => {
    test("an absent category reads as Unknown", () => {
      renderModal({ selectedExercise: { ...exercise, category: undefined } });

      expect(screen.getByText(/Unknown/)).toBeTruthy();
    });

    test.each([
      ["absent", undefined],
      ["an empty list", []],
      ["entries with no name", [{ name: "" }]]
    ])("muscles that are %s read as Not specified", (_label, muscles) => {
      renderModal({ selectedExercise: { ...exercise, muscles } });

      expect(screen.getAllByText(/Not specified/).length).toBeGreaterThan(0);
    });

    test("equipment that is absent reads as Not specified", () => {
      renderModal({ selectedExercise: { ...exercise, equipment: undefined } });

      expect(screen.getAllByText(/Not specified/).length).toBeGreaterThan(0);
    });

    test("an absent description says so rather than leaving a gap", () => {
      renderModal({ selectedExercise: { ...exercise, description: "" } });

      expect(screen.getByText("No description provided for this exercise.")).toBeTruthy();
    });
  });

  test("lists at most four muscles", () => {
    renderModal({
      selectedExercise: {
        ...exercise,
        muscles: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }, { name: "E" }]
      }
    });

    expect(screen.getByText(/A, B, C, D$/)).toBeTruthy();
  });

  describe("the save button", () => {
    test.each([
      ["offers to save when neither saved nor saving", {}, "Save to my plan", false],
      ["reads as saving while in flight", { isSaving: true }, "Saving...", true],
      ["reads as saved once stored", { isSaved: true }, "Saved to plan", true]
    ])("%s", (_label, props, label, disabled) => {
      renderModal(props);

      const button = screen.getByRole("button", { name: label });
      expect(button.disabled).toBe(disabled);
    });

    test("saving reports the exercise and its recommendation", () => {
      const { onSave } = renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Save to my plan" }));

      expect(onSave).toHaveBeenCalledWith(exercise, exercise.recommendation);
    });
  });

  describe("the recommendation", () => {
    test("shows the reasons when there are any", () => {
      renderModal();

      expect(screen.getByRole("heading", { name: "Why this was recommended" })).toBeTruthy();
      expect(screen.getByText("Matches your strength focus.")).toBeTruthy();
    });

    test.each([
      ["there is no recommendation", undefined],
      ["it carries no reasons", { reasons: [] }]
    ])("is omitted entirely when %s", (_label, recommendation) => {
      renderModal({ selectedExercise: { ...exercise, recommendation } });

      expect(screen.queryByRole("heading", { name: "Why this was recommended" })).toBeNull();
    });
  });

  describe("video links", () => {
    test("links to a reference video when the entry has one", () => {
      renderModal();

      const link = screen.getByRole("link", { name: "Watch reference video" });
      expect(link.getAttribute("href")).toContain("a.mp4");
      // Opening an upstream video must not navigate the dashboard away.
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noreferrer");
    });

    test("shows at most two, however many the entry carries", () => {
      renderModal({
        selectedExercise: {
          ...exercise,
          videos: [
            { id: "v1", url: "https://example.test/a.mp4" },
            { id: "v2", url: "https://example.test/b.mp4" },
            { id: "v3", url: "https://example.test/c.mp4" }
          ]
        }
      });

      expect(screen.getAllByRole("link", { name: "Watch reference video" })).toHaveLength(2);
    });

    test.each([
      ["absent", undefined],
      ["an empty list", []]
    ])("are omitted when %s", (_label, videos) => {
      renderModal({ selectedExercise: { ...exercise, videos } });

      expect(screen.queryByRole("link", { name: "Watch reference video" })).toBeNull();
    });
  });

  describe("dismissal", () => {
    test("the close button reports it", () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(onClose).toHaveBeenCalled();
    });

    test("clicking the backdrop reports it", () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByRole("dialog"));

      expect(onClose).toHaveBeenCalled();
    });

    // The click handler sits on the backdrop, so without stopPropagation every
    // click inside the sheet would close it.
    test("clicking inside the sheet does not", () => {
      const { onClose } = renderModal();

      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByRole("heading", { name: "Barbell Squat" }));

      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
