import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import DashboardWorkoutModal from "./DashboardWorkoutModal";

// The form a visitor logs a session through -- seven fields, each with its own
// setWorkoutForm updater, which is why this file carried fourteen uncovered
// functions. What matters is that each control writes to its own key and leaves
// the rest of the form alone: a copy-paste slip between two adjacent updaters
// would silently overwrite the wrong field and nothing else would notice.

const workoutForm = {
  date: "2026-03-02",
  duration: "45",
  focus: "Strength",
  exercises: "Squat, bench press",
  sets: "5",
  reps: "5",
  intensityRpe: "8",
  notes: "Felt strong."
};

const renderModal = (props = {}) => {
  const handlers = {
    setWorkoutForm: vi.fn(),
    onClose: vi.fn(),
    onSubmit: vi.fn((e) => e?.preventDefault?.())
  };
  const utils = render(
    <DashboardWorkoutModal open workoutForm={workoutForm} {...handlers} {...props} />
  );
  return { ...utils, ...handlers };
};

// Which key the last updater wrote to, found by running it against a form whose
// every value is the same sentinel and seeing which one comes back different.
//
// Deliberately not asserting the value it wrote. These are controlled inputs and
// `setWorkoutForm` is a spy, so the `value` prop never changes -- React's value
// tracker resets the DOM before the handler reads it, and every field ends up
// capturing its original value rather than the one the test dispatched.
// Measured across four fields, including text, number and date, so it is the
// controlled-input behaviour rather than anything specific to one input type.
// The key it writes to is the property worth protecting anyway: a copy-paste
// slip between two adjacent updaters is exactly what this catches.
const SENTINEL = Object.fromEntries(Object.keys(workoutForm).map((key) => [key, "__unwritten__"]));

const keysWrittenBy = (setWorkoutForm) => {
  const updater = setWorkoutForm.mock.calls.at(-1)[0];
  const next = updater(SENTINEL);
  return Object.keys(SENTINEL).filter((key) => next[key] !== SENTINEL[key]);
};

describe("DashboardWorkoutModal", () => {
  test("renders nothing when closed", () => {
    const { container } = renderModal({ open: false });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("is a dialog named by its own heading", () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: "Log workout" })).toBeTruthy();
  });

  test("shows the current form values", () => {
    renderModal();

    expect(screen.getByLabelText("Duration (minutes)").value).toBe("45");
    expect(screen.getByLabelText("Focus").value).toBe("Strength");
    expect(screen.getByLabelText("Notes").value).toBe("Felt strong.");
  });

  // One case per field, and the assertion is exactly one key -- so a swapped
  // updater fails, and so does one that writes two keys at once.
  describe("each field writes only its own key", () => {
    test.each([
      ["Date", "date"],
      ["Duration (minutes)", "duration"],
      ["Focus", "focus"],
      ["Exercises (comma-separated)", "exercises"],
      ["Sets", "sets"],
      ["Reps", "reps"],
      ["Intensity (RPE 1-10)", "intensityRpe"],
      ["Notes", "notes"]
    ])("%s", (label, key) => {
      const { setWorkoutForm } = renderModal();

      fireEvent.change(screen.getByLabelText(label), { target: { value: "changed" } });

      expect(keysWrittenBy(setWorkoutForm)).toEqual([key]);
    });
  });

  describe("dismissal", () => {
    test("the close button reports it", () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Close workout modal" }));

      expect(onClose).toHaveBeenCalled();
    });

    test("the cancel button reports it", () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onClose).toHaveBeenCalled();
    });

    test("clicking the backdrop reports it", () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByRole("dialog"));

      expect(onClose).toHaveBeenCalled();
    });

    // The handler is on the backdrop, so without stopPropagation every click on
    // the form itself would discard what the visitor had typed.
    test("clicking inside the form does not", () => {
      const { onClose } = renderModal();

      fireEvent.click(screen.getByRole("heading", { name: "Log workout" }));

      expect(onClose).not.toHaveBeenCalled();
    });

    // Handled centrally by ModalPortal via useCloseOnEscape; asserted here
    // because this is the modal a visitor is most likely to want out of.
    test("pressing Escape reports it", () => {
      const { onClose } = renderModal();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalled();
    });
  });

  test("submitting reports it", () => {
    const { onSubmit } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Save workout" }));

    expect(onSubmit).toHaveBeenCalled();
  });
});
