import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import PlannerSetupModal from "../PlannerSetupModal";
import { equipmentOptionsByEnv, quickFocuses } from "../../constants";

// The three-step planner a visitor actually fills in. The equipment logic
// behind it is covered in App.planner.test.jsx, through the very handlers this
// component calls; what is untested is the surface that calls them -- which
// step shows what, which tile reads as selected, and that every option gets a
// thumbnail rather than a broken image.

const renderModal = (props = {}) => {
  const handlers = {
    setPlannerStep: vi.fn(),
    closePlanner: vi.fn(),
    onEnvironmentChange: vi.fn(),
    toggleEquipment: vi.fn(),
    onChange: vi.fn(),
    toggleFocus: vi.fn(),
    onSubmit: vi.fn()
  };
  const utils = render(
    <PlannerSetupModal
      plannerOpen
      plannerStep={1}
      form={{
        environment: "Home",
        equipment: [],
        focuses: [],
        days: "3",
        duration: "45",
        goal: "",
        injuries: ""
      }}
      loading={false}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

const dialog = () => screen.getByRole("dialog");
const tile = (label) =>
  Array.from(document.querySelectorAll(".equip-card")).find((el) => el.textContent.includes(label));

describe("PlannerSetupModal", () => {
  describe("whether it is on screen at all", () => {
    test("renders nothing while closed", () => {
      // The early `return null` here is belt-and-braces and survives mutation
      // testing: `ModalPortal` is given the same flag and returns null on its
      // own. What the guard adds is not rendering -- it is not running the
      // component body at all while closed.
      renderModal({ plannerOpen: false });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("renders as a modal dialog when open", () => {
      renderModal();
      expect(dialog()).toHaveAttribute("aria-modal", "true");
    });

    test("the close button closes it", () => {
      const { closePlanner } = renderModal();

      fireEvent.click(within(dialog()).getByLabelText("Close planner"));

      expect(closePlanner).toHaveBeenCalled();
    });
  });

  describe("the header", () => {
    test.each([
      [1, "Enviroment"],
      [2, "Schedule"],
      [3, "Focus"]
    ])("step %i is titled %s", (plannerStep, title) => {
      renderModal({ plannerStep });
      expect(within(dialog()).getByText(title)).toBeInTheDocument();
    });

    test("an out-of-range step falls back to the first title", () => {
      // The step is held in App's state and has been out of range during a
      // reset; a blank header reads as a broken modal.
      renderModal({ plannerStep: 9 });
      expect(within(dialog()).getByText("Enviroment")).toBeInTheDocument();
    });

    test("there is no back arrow on the first step", () => {
      renderModal({ plannerStep: 1 });
      expect(within(dialog()).queryByLabelText("Back")).toBeNull();
    });

    test.each([[2], [3]])("step %i offers a way back", (plannerStep) => {
      renderModal({ plannerStep });
      expect(within(dialog()).getByLabelText("Back")).toBeInTheDocument();
    });

    test("going back moves one step, never below the first", () => {
      const { setPlannerStep } = renderModal({ plannerStep: 2 });

      fireEvent.click(within(dialog()).getByLabelText("Back"));

      const updater = setPlannerStep.mock.calls.at(-1)[0];
      expect(updater(2)).toBe(1);
      expect(updater(1)).toBe(1);
    });
  });

  describe("step one: the environment", () => {
    test("offers both environments", () => {
      renderModal({ plannerStep: 1 });

      expect(within(dialog()).getByText("Home")).toBeInTheDocument();
      expect(within(dialog()).getByText("Commercial")).toBeInTheDocument();
    });

    test.each([["Home"], ["Commercial"]])("choosing %s reports it", (environment) => {
      const { onEnvironmentChange } = renderModal({ plannerStep: 1 });

      fireEvent.click(within(dialog()).getByText(environment));

      expect(onEnvironmentChange).toHaveBeenCalledWith(environment);
    });

    test("lists the equipment for the chosen environment", () => {
      renderModal({ plannerStep: 1, form: formWith({ environment: "Home" }) });

      equipmentOptionsByEnv.Home.forEach((item) => {
        expect(tile(item)).toBeTruthy();
      });
    });

    test("a commercial gym lists rooms instead", () => {
      renderModal({ plannerStep: 1, form: formWith({ environment: "Commercial" }) });

      equipmentOptionsByEnv.Commercial.forEach((item) => {
        expect(tile(item)).toBeTruthy();
      });
      expect(tile("Dumbbells")).toBeFalsy();
    });

    test("a chosen option reads as selected", () => {
      renderModal({
        plannerStep: 1,
        form: formWith({ environment: "Home", equipment: ["Dumbbells"] })
      });

      expect(tile("Dumbbells").className).toContain("active");
      expect(tile("Kettlebell").className).not.toContain("active");
    });

    test("clicking an option reports it", () => {
      const { toggleEquipment } = renderModal({ plannerStep: 1 });

      fireEvent.click(tile("Dumbbells"));

      expect(toggleEquipment).toHaveBeenCalledWith("Dumbbells");
    });

    test("says so when full gym access is on", () => {
      // Otherwise every room shows selected with no explanation of why.
      renderModal({
        plannerStep: 1,
        form: formWith({ environment: "Commercial", equipment: ["Full gym access"] })
      });

      expect(within(dialog()).getByText(/Full gym access selected/)).toBeInTheDocument();
    });

    test("says nothing of the sort in a home gym", () => {
      renderModal({
        plannerStep: 1,
        form: formWith({ environment: "Home", equipment: ["Dumbbells"] })
      });

      expect(within(dialog()).queryByText(/Full gym access selected/)).toBeNull();
    });

    test("a home gym never shows it, even given the commercial option", () => {
      // Not a state the picker can produce -- "Full gym access" is not a home
      // option -- but this component is handed its props rather than deriving
      // them, and the environment check is its own guard against exactly that
      // inconsistency. Without it the notice appears in a home gym.
      renderModal({
        plannerStep: 1,
        form: formWith({ environment: "Home", equipment: ["Full gym access"] })
      });

      expect(within(dialog()).queryByText(/Full gym access selected/)).toBeNull();
    });

    test("says nothing when the commercial list is only partly chosen", () => {
      renderModal({
        plannerStep: 1,
        form: formWith({ environment: "Commercial", equipment: ["Strength floor"] })
      });

      expect(within(dialog()).queryByText(/Full gym access selected/)).toBeNull();
    });
  });

  describe("the equipment thumbnails", () => {
    test("every current option resolves to an image", () => {
      // A missing thumbnail is a broken image in a grid of pictures.
      [...equipmentOptionsByEnv.Home, ...equipmentOptionsByEnv.Commercial].forEach((item) => {
        const environment = equipmentOptionsByEnv.Home.includes(item) ? "Home" : "Commercial";
        const { unmount } = renderModal({ plannerStep: 1, form: formWith({ environment }) });

        const image = tile(item).querySelector("img");
        expect(image).toBeTruthy();
        expect(image.getAttribute("src")).toBeTruthy();
        unmount();
      });
    });

    test("different options get different thumbnails", () => {
      renderModal({ plannerStep: 1, form: formWith({ environment: "Home" }) });

      const sources = new Set(
        Array.from(document.querySelectorAll(".equip-card img")).map((img) =>
          img.getAttribute("src")
        )
      );

      expect(sources.size).toBeGreaterThan(1);
    });

    test("the thumbnails are decorative, so they carry no alt text", () => {
      // They repeat the label beside them; announcing both says everything
      // twice.
      renderModal({ plannerStep: 1, form: formWith({ environment: "Home" }) });

      document.querySelectorAll(".equip-card img").forEach((img) => {
        expect(img.getAttribute("alt")).toBe("");
      });
    });

    test("they are lazy, since the grid is below the fold on a phone", () => {
      renderModal({ plannerStep: 1, form: formWith({ environment: "Home" }) });

      document.querySelectorAll(".equip-card img").forEach((img) => {
        expect(img).toHaveAttribute("loading", "lazy");
      });
    });
  });

  describe("step two: the schedule", () => {
    test("shows the days and duration the form holds", () => {
      renderModal({ plannerStep: 2, form: formWith({ days: "5", duration: "60" }) });

      expect(within(dialog()).getByDisplayValue("5")).toBeInTheDocument();
      expect(within(dialog()).getByDisplayValue("60")).toBeInTheDocument();
    });

    test("changing a field reports it by name", () => {
      // The handler is shared across every field, so the name is what routes
      // the value to the right key.
      const { onChange } = renderModal({ plannerStep: 2 });

      fireEvent.change(within(dialog()).getByLabelText("Days per week"), {
        target: { value: "6" }
      });

      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls.at(-1)[0].target.name).toBe("days");
    });

    test("the equipment grid is not on this step", () => {
      renderModal({ plannerStep: 2 });
      expect(document.querySelectorAll(".equip-card")).toHaveLength(0);
    });
  });

  describe("step three: the focus", () => {
    test("offers every quick focus", () => {
      renderModal({ plannerStep: 3 });

      quickFocuses.forEach((focus) => {
        expect(within(dialog()).getByText(focus)).toBeInTheDocument();
      });
    });

    test("a chosen focus reads as selected", () => {
      const chosen = quickFocuses[0];
      renderModal({ plannerStep: 3, form: formWith({ focuses: [chosen] }) });

      // The label is a span inside the button; the state class is on the
      // button itself.
      expect(within(dialog()).getByText(chosen).closest("button").className).toContain("active");
    });

    test("clicking one reports it", () => {
      const { toggleFocus } = renderModal({ plannerStep: 3 });

      fireEvent.click(within(dialog()).getByText(quickFocuses[0]));

      expect(toggleFocus).toHaveBeenCalledWith(quickFocuses[0]);
    });
  });

  describe("the footer", () => {
    test.each([[1], [2]])("step %i offers to continue rather than submit", (plannerStep) => {
      const { setPlannerStep, onSubmit } = renderModal({ plannerStep });

      const next = within(dialog())
        .getAllByRole("button")
        .find((button) => /next|continue/i.test(button.textContent));
      expect(next).toBeTruthy();

      fireEvent.click(next);

      expect(setPlannerStep).toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    test("continuing moves one step, never past the last", () => {
      const { setPlannerStep } = renderModal({ plannerStep: 1 });

      const next = within(dialog())
        .getAllByRole("button")
        .find((button) => /next|continue/i.test(button.textContent));
      fireEvent.click(next);

      const updater = setPlannerStep.mock.calls.at(-1)[0];
      expect(updater(1)).toBe(2);
      expect(updater(3)).toBe(3);
    });

    test("the last step submits instead", () => {
      const { onSubmit } = renderModal({ plannerStep: 3 });

      const submit = within(dialog())
        .getAllByRole("button")
        .find((button) => button.className.includes("cta"));

      fireEvent.click(submit);

      expect(onSubmit).toHaveBeenCalled();
    });

    test("the submit button is disabled while a plan is generating", () => {
      // Generating takes several seconds; a second submit costs another call
      // to the model.
      renderModal({ plannerStep: 3, loading: true });

      const submit = within(dialog())
        .getAllByRole("button")
        .find((button) => button.className.includes("cta"));

      expect(submit).toBeDisabled();
    });

    test("and enabled when it is not", () => {
      renderModal({ plannerStep: 3, loading: false });

      const submit = within(dialog())
        .getAllByRole("button")
        .find((button) => button.className.includes("cta"));

      expect(submit).not.toBeDisabled();
    });
  });
});

function formWith(overrides) {
  return {
    environment: "Home",
    equipment: [],
    focuses: [],
    days: "3",
    duration: "45",
    goal: "",
    injuries: "",
    ...overrides
  };
}
