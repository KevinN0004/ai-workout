import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import HomePersonalStage from "./HomePersonalStage";
import { toCmFromFeetInches, toFeetInchesFromCm, toKg, toLb } from "../../../app/units";

// The profile form on the home page. Mostly fields, but the unit toggles are
// not: each one converts what the visitor has already typed and writes it back
// before switching, so a mistake there silently loses their entry. The real
// converters are used rather than stubs, since they are the ones that ship.

const TRAINING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const basePersonal = (overrides = {}) => ({
  name: "",
  age: "",
  heightCm: "",
  heightFeet: "",
  heightInches: "",
  weight: "",
  sex: "",
  activity: "",
  sleep: "",
  timeline: "",
  experience: "",
  nutrition: "",
  cardio: "",
  notes: "",
  trainingDays: [],
  ...overrides
});

const renderStage = (props = {}) => {
  const handlers = {
    setPersonalMode: vi.fn(),
    onLogout: vi.fn(),
    go: vi.fn(),
    onPersonalSubmit: vi.fn((event) => event.preventDefault()),
    onPersonalChange: vi.fn(),
    setHeightUnit: vi.fn(),
    setPersonal: vi.fn(),
    setWeightUnit: vi.fn(),
    toggleTrainingDay: vi.fn(),
    goToStage: vi.fn()
  };
  const utils = render(
    <HomePersonalStage
      personalPanelRef={{ current: null }}
      personalMode="basic"
      user={null}
      personal={basePersonal(props.personal)}
      heightUnit="cm"
      toFeetInchesFromCm={toFeetInchesFromCm}
      toCmFromFeetInches={toCmFromFeetInches}
      weightUnit="kg"
      toLb={toLb}
      toKg={toKg}
      trainingDayOptions={TRAINING_DAYS}
      isPersonalComplete={false}
      backBtnStyle={{}}
      isIntroTransitioning={false}
      isStageTransitioning={false}
      {...handlers}
      {...props}
    />
  );
  return { ...utils, ...handlers };
};

const panel = () => document.querySelector(".personal-panel");
const button = (name) => screen.getByRole("button", { name });
// The unit buttons live inside a <label>, so their accessible name is the
// label text plus the group's aria-label ("Height Height units"), not the
// glyph on the button. They are selected by their own text instead.
const unitButton = (label) => {
  const found = Array.from(document.querySelectorAll(".unit-toggle button")).find(
    (el) => el.textContent.trim() === label
  );
  if (!found) throw new Error(`no unit button labelled ${label}`);
  return found;
};
// The updater the component last handed to setPersonal, applied to a form.
const applyLast = (setPersonal, prev) => setPersonal.mock.calls.at(-1)[0](prev);

describe("HomePersonalStage", () => {
  describe("basic and advanced modes", () => {
    test("opens in the mode it is given", () => {
      renderStage({ personalMode: "basic" });
      expect(panel().className).toContain("personal-panel-basic");
    });

    test("advanced mode is marked on the panel", () => {
      // The extra fields are revealed by CSS on this class, so it is the whole
      // difference between the two modes as far as this component goes.
      renderStage({ personalMode: "advanced" });

      expect(panel().className).toContain("personal-panel-advanced");
      expect(panel().className).not.toContain("personal-panel-basic");
    });

    test.each([
      ["basic", "Basic", "Advanced"],
      ["advanced", "Advanced", "Basic"]
    ])("in %s mode the toggle marks %s", (personalMode, active, inactive) => {
      // Both directions: asserting only the advanced side leaves the basic
      // marker free to disappear without any test noticing.
      renderStage({ personalMode });

      expect(button(active).className).toContain("active");
      expect(button(inactive).className).not.toContain("active");
    });

    test.each([["Basic"], ["Advanced"]])("choosing %s reports it", (label) => {
      const { setPersonalMode } = renderStage({ personalMode: "basic" });

      fireEvent.click(button(label));

      expect(setPersonalMode).toHaveBeenCalledWith(label.toLowerCase());
    });
  });

  describe("the account strip", () => {
    test("a signed-in visitor is named and offered a way out", () => {
      const { onLogout } = renderStage({ user: { email: "ada@example.com" } });

      expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
      fireEvent.click(button("Log out"));
      expect(onLogout).toHaveBeenCalled();
    });

    test("a signed-out visitor is offered a way in", () => {
      const { go } = renderStage({ user: null });

      fireEvent.click(button("Login / Sign up"));

      expect(go).toHaveBeenCalledWith("/auth");
    });
  });

  describe("switching height units", () => {
    test("centimetres are converted before switching to feet", () => {
      // Otherwise the visitor switches units and finds the field blank.
      const { setPersonal, setHeightUnit } = renderStage({
        heightUnit: "cm",
        personal: { heightCm: "183" }
      });

      fireEvent.click(unitButton("ft/in"));

      expect(applyLast(setPersonal, basePersonal({ heightCm: "183" }))).toMatchObject({
        heightFeet: "6",
        heightInches: "0"
      });
      expect(setHeightUnit).toHaveBeenCalledWith("ft");
    });

    test("feet and inches are converted back before switching to centimetres", () => {
      const { setPersonal, setHeightUnit } = renderStage({
        heightUnit: "ft",
        personal: { heightFeet: "6", heightInches: "0" }
      });

      fireEvent.click(unitButton("cm"));

      expect(
        applyLast(setPersonal, basePersonal({ heightFeet: "6", heightInches: "0" })).heightCm
      ).toBe("183");
      expect(setHeightUnit).toHaveBeenCalledWith("cm");
    });

    test("an empty height converts to an empty one rather than a zero", () => {
      // A visitor who switches units before typing must not be handed a 0.
      const { setPersonal } = renderStage({ heightUnit: "cm", personal: { heightCm: "" } });

      fireEvent.click(unitButton("ft/in"));

      const next = applyLast(setPersonal, basePersonal());
      expect(next.heightFeet).toBe("");
      expect(next.heightInches).toBe("");
    });

    test.each([
      ["cm", "cm", "ft/in"],
      ["ft", "ft/in", "cm"]
    ])("in %s the toggle marks %s", (heightUnit, active, inactive) => {
      renderStage({ heightUnit });

      expect(unitButton(active).className).toContain("active");
      expect(unitButton(inactive).className).not.toContain("active");
    });

    test("centimetres show one field and feet show two", () => {
      const { unmount } = renderStage({ heightUnit: "cm" });
      expect(document.querySelector('[name="heightCm"]')).toBeTruthy();
      expect(document.querySelector('[name="heightFeet"]')).toBeFalsy();
      unmount();

      renderStage({ heightUnit: "ft" });
      expect(document.querySelector('[name="heightFeet"]')).toBeTruthy();
      expect(document.querySelector('[name="heightInches"]')).toBeTruthy();
      expect(document.querySelector('[name="heightCm"]')).toBeFalsy();
    });
  });

  describe("switching weight units", () => {
    test("kilograms are converted before switching to pounds", () => {
      const { setPersonal, setWeightUnit } = renderStage({
        weightUnit: "kg",
        personal: { weight: "80" }
      });

      fireEvent.click(unitButton("lb"));

      expect(applyLast(setPersonal, basePersonal({ weight: "80" })).weight).toBe("176");
      expect(setWeightUnit).toHaveBeenCalledWith("lb");
    });

    test("pounds are converted back before switching to kilograms", () => {
      const { setPersonal, setWeightUnit } = renderStage({
        weightUnit: "lb",
        personal: { weight: "176" }
      });

      fireEvent.click(unitButton("kg"));

      expect(applyLast(setPersonal, basePersonal({ weight: "176" })).weight).toBe("80");
      expect(setWeightUnit).toHaveBeenCalledWith("kg");
    });

    test("an empty weight stays empty", () => {
      const { setPersonal } = renderStage({ weightUnit: "kg", personal: { weight: "" } });

      fireEvent.click(unitButton("lb"));

      expect(applyLast(setPersonal, basePersonal()).weight).toBe("");
    });

    test.each([
      ["lb", "lb", "kg"],
      ["kg", "kg", "lb"]
    ])("in %s the toggle marks %s", (weightUnit, active, inactive) => {
      renderStage({ weightUnit });

      expect(unitButton(active).className).toContain("active");
      expect(unitButton(inactive).className).not.toContain("active");
    });
  });

  describe("training days", () => {
    test("renders one toggle per day", () => {
      renderStage();
      expect(document.querySelectorAll(".day-toggle-btn")).toHaveLength(TRAINING_DAYS.length);
    });

    test("marks the chosen days", () => {
      renderStage({ personal: { trainingDays: ["Monday", "Friday"] } });

      const active = Array.from(document.querySelectorAll(".day-toggle-btn.active")).map(
        (el) => el.textContent
      );
      expect(active).toEqual(["Mon", "Fri"]);
    });

    test("a non-array trainingDays is treated as none rather than throwing", () => {
      // `"Monday".includes(day)` would match on substrings if the guard went.
      expect(() => renderStage({ personal: { trainingDays: "Monday" } })).not.toThrow();
      expect(document.querySelectorAll(".day-toggle-btn.active")).toHaveLength(0);
    });

    test("clicking one reports it", () => {
      const { toggleTrainingDay } = renderStage();

      fireEvent.click(screen.getByText("Mon"));

      expect(toggleTrainingDay).toHaveBeenCalledWith("Monday");
    });
  });

  describe("continuing", () => {
    test("an incomplete profile is told what is missing", () => {
      renderStage({ isPersonalComplete: false });

      expect(
        screen.getByText("Enter name, age, height, weight, and sex to continue.")
      ).toBeInTheDocument();
      expect(button("Continue")).toBeDisabled();
    });

    test("a complete one may continue, with the hint gone", () => {
      renderStage({ isPersonalComplete: true });

      expect(screen.queryByText(/Enter name, age/)).toBeNull();
      expect(button("Continue")).not.toBeDisabled();
    });

    test.each([
      ["an intro transition", { isIntroTransitioning: true }],
      ["a stage transition", { isStageTransitioning: true }]
    ])("%s holds both buttons, complete or not", (_label, overrides) => {
      // Advancing mid-animation leaves the stage machine part-way through.
      renderStage({ isPersonalComplete: true, ...overrides });

      expect(button("Continue")).toBeDisabled();
      expect(button("Back")).toBeDisabled();
    });

    test("submitting reports it without reloading the page", () => {
      const { onPersonalSubmit } = renderStage({ isPersonalComplete: true });

      expect(fireEvent.submit(document.querySelector("form"))).toBe(false);
      expect(onPersonalSubmit).toHaveBeenCalled();
    });

    test("going back returns to the intro", () => {
      const { goToStage } = renderStage();

      fireEvent.click(button("Back"));

      expect(goToStage).toHaveBeenCalledWith("intro");
    });
  });

  describe("the fields themselves", () => {
    test("show what the visitor has entered", () => {
      renderStage({ personal: { name: "Ada", notes: "Knee sensitivity" } });

      expect(document.querySelector('[name="name"]')).toHaveValue("Ada");
      expect(document.querySelector('[name="notes"]')).toHaveValue("Knee sensitivity");
    });

    test("report edits through the shared handler, by name", () => {
      // One handler serves every field, so the name is what routes the value.
      const { onPersonalChange } = renderStage();

      fireEvent.change(document.querySelector('[name="name"]'), { target: { value: "Ada" } });

      expect(onPersonalChange).toHaveBeenCalled();
      expect(onPersonalChange.mock.calls.at(-1)[0].target.name).toBe("name");
    });

    test("the panel ref is handed back for the stage animation to measure", () => {
      // useHomeStageFlow morphs this panel; without the ref it silently falls
      // back to an instant stage change.
      const personalPanelRef = { current: null };
      renderStage({ personalPanelRef });

      expect(personalPanelRef.current).toHaveClass("personal-panel");
    });
  });
});
