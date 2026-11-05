import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MAX_CARDS, newCard } from "../../../../app/exerciseSets";
import DashboardWorkoutModal from "../DashboardWorkoutModal";

// Loads show in the region's unit; pin one, so the labels below are stable.
beforeEach(() => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const squat = () => {
  const card = newCard({ name: "Squat" });
  return { ...card, sets: [{ ...card.sets[0], amount: "5", load: "225", rpe: "8" }] };
};

// The form a visitor logs a session through -- the session's fields and the
// exercise cards, each control with its own setWorkoutForm updater. What matters is that each control writes to its own key and leaves
// the rest of the form alone: a copy-paste slip between two adjacent updaters
// would silently overwrite the wrong field and nothing else would notice.

const workoutForm = {
  date: "2026-03-02",
  duration: "45",
  focus: "Strength",
  exerciseSets: [squat()],
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
const SENTINEL = Object.fromEntries(
  Object.keys(workoutForm).map((key) => [key, key === "exerciseSets" ? [] : "__unwritten__"])
);

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
      ["Exercise", "exerciseSets"],
      ["Counts", "exerciseSets"],
      ["Set 1 reps, Squat", "exerciseSets"],
      ["Set 1 load in lb, Squat", "exerciseSets"],
      ["Set 1 RPE, Squat", "exerciseSets"],
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

  // A form filled from a plan day says which day it is logging, so a person
  // can tell it from an ordinary workout before saving.
  describe("the plan day it is logging", () => {
    test("names the day when the form carries a link", () => {
      renderModal({
        workoutForm: { ...workoutForm, planId: "plan-1", planDayIndex: 0, planDayLabel: "Monday" }
      });

      expect(screen.getByText("Logging Monday of your plan.")).toBeInTheDocument();
    });

    test("says nothing for an ordinary workout", () => {
      renderModal();

      expect(screen.queryByText(/of your plan/)).toBeNull();
    });
  });
});

// The exercise cards (roadmap B1), driven through real state: what each card
// shows, adding and removing sets and exercises, and the save stopping beside
// a set it cannot log.
describe("the exercise cards", () => {
  function Stateful({
    initial = workoutForm,
    onSubmit = vi.fn((e) => e.preventDefault()),
    onClose = vi.fn()
  }) {
    const [form, setForm] = useState(initial);
    return (
      <DashboardWorkoutModal
        open
        workoutForm={form}
        setWorkoutForm={setForm}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );
  }
  const input = (name) => screen.getByLabelText(name);
  const button = (name) => screen.getByRole("button", { name });

  test("names each card's inputs by set and exercise, with the plan's targets as placeholders", () => {
    const planned = {
      ...newCard({ name: "Bench press", targets: { amount: "8-10", rpe: "8-9" }, rows: 2 })
    };
    render(<Stateful initial={{ ...workoutForm, exerciseSets: [planned] }} />);

    expect(screen.getByRole("group", { name: "Bench press" })).toBeInTheDocument();
    expect(input("Set 2 reps, Bench press")).toHaveAttribute("placeholder", "8-10");
    expect(input("Set 2 reps, Bench press").value).toBe("");
    expect(input("Set 1 RPE, Bench press")).toHaveAttribute("placeholder", "8-9");
  });

  // A range like "8-10" is no number, so a number input would blank it even if
  // it were passed as the value. A single target is the case that shows a
  // target sent as a value, and it must stay a placeholder.
  test("leaves a single-number target as a placeholder, never a value", () => {
    const planned = newCard({ name: "Step-up", targets: { amount: "6", rpe: "8" } });
    render(<Stateful initial={{ ...workoutForm, exerciseSets: [planned] }} />);

    expect(input("Set 1 reps, Step-up")).toHaveAttribute("placeholder", "6");
    expect(input("Set 1 reps, Step-up").value).toBe("");
    expect(input("Set 1 RPE, Step-up").value).toBe("");
  });

  test("adds a set that copies the load above it, and removes one", () => {
    render(<Stateful />);

    fireEvent.click(button("Add set to Squat"));
    expect(input("Set 2 load in lb, Squat").value).toBe("225");
    expect(input("Set 2 reps, Squat").value).toBe("");

    fireEvent.click(button("Remove set 1, Squat"));
    expect(screen.queryByLabelText("Set 2 reps, Squat")).toBeNull();
    expect(input("Set 1 load in lb, Squat").value).toBe("225");
  });

  test("says when a card's sets count each side", () => {
    render(
      <Stateful
        initial={{ ...workoutForm, exerciseSets: [newCard({ name: "Lunge", perSide: true })] }}
      />
    );

    expect(screen.getByText("Count each side.")).toBeInTheDocument();
  });

  test("a card can lose its last row and get one back", () => {
    render(<Stateful />);

    fireEvent.click(button("Remove set 1, Squat"));
    expect(screen.queryByLabelText("Set 1 reps, Squat")).toBeNull();

    fireEvent.click(button("Add set to Squat"));
    expect(input("Set 1 reps, Squat").value).toBe("");
    expect(input("Set 1 load in lb, Squat").value).toBe("");
  });

  test("adds an exercise, and removes one", () => {
    render(<Stateful />);

    fireEvent.click(button("Add exercise"));
    expect(screen.getByRole("group", { name: "Exercise 2" })).toBeInTheDocument();

    fireEvent.click(button("Remove Squat"));
    expect(screen.queryByRole("group", { name: "Squat" })).toBeNull();
  });

  test("counts seconds when the card says so", () => {
    render(<Stateful />);

    fireEvent.change(input("Counts"), { target: { value: "seconds" } });

    expect(input("Set 1 seconds, Squat")).toHaveAttribute("min", "1");
  });

  test("says so when there are no exercises, and stops adding at the limit", () => {
    const { unmount } = render(<Stateful initial={{ ...workoutForm, exerciseSets: [] }} />);
    expect(screen.getByText("No exercises yet.")).toBeInTheDocument();
    unmount();

    render(
      <Stateful
        initial={{
          ...workoutForm,
          exerciseSets: Array.from({ length: MAX_CARDS }, () => newCard())
        }}
      />
    );
    expect(button("Add exercise")).toBeDisabled();
  });

  test("stops the save beside a set it cannot log, and saves once it is fixed", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<Stateful onSubmit={onSubmit} />);

    fireEvent.change(input("Set 1 reps, Squat"), { target: { value: "" } });
    fireEvent.click(button("Save workout"));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Enter reps or seconds")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Check the exercises marked above");
    expect(input("Set 1 reps, Squat")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(input("Set 1 reps, Squat"), { target: { value: "5" } });
    fireEvent.click(button("Save workout"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Enter reps or seconds")).toBeNull();
  });

  test("asks for a name when a card has sets but none", () => {
    const unnamed = { ...squat(), name: "" };
    render(<Stateful initial={{ ...workoutForm, exerciseSets: [unnamed] }} />);

    fireEvent.click(button("Save workout"));

    expect(screen.getByText("Name this exercise")).toBeInTheDocument();
    expect(input("Exercise")).toHaveAttribute("aria-invalid", "true");
  });

  test("forgets the messages when the modal closes", () => {
    const onClose = vi.fn();
    render(<Stateful onClose={onClose} />);
    fireEvent.change(input("Set 1 reps, Squat"), { target: { value: "" } });
    fireEvent.click(button("Save workout"));

    fireEvent.click(button("Cancel"));

    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
