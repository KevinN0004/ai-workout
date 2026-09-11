import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { equipmentOptionsByEnv } from "./app/constants";

// App's equipment picker is the one piece of real logic in the file, and it is
// not a simple toggle. A commercial gym has a "Full gym access" option that
// stands for every other option at once, so selecting it fills the list,
// selecting a specific room while it is on has to expand it first, and
// selecting the last missing room has to fold them all back into it. Getting
// any of that wrong sends the planner a set of equipment the visitor did not
// choose.
//
// The handlers live inside App and are handed to the planner modal, so the
// modal is mocked to capture them and HomePage is mocked to render it.

const planner = vi.hoisted(() => ({ props: null }));

vi.mock("./app/components/PlannerSetupModal", () => ({
  default: (props) => {
    planner.props = props;
    return <div data-testid="planner" />;
  }
}));

vi.mock("./pages/HomePage", () => ({
  default: ({ plannerModal }) => <div data-testid="home-page">{plannerModal}</div>
}));

vi.mock("./pages/AuthPage", () => ({ default: () => <div /> }));
vi.mock("./pages/DashboardPage", () => ({ default: () => <div /> }));
vi.mock("./pages/WorkoutResultPage", () => ({ default: () => <div /> }));

import App from "./App";

const COMMERCIAL = equipmentOptionsByEnv.Commercial;
const HOME = equipmentOptionsByEnv.Home;
const FULL = "Full gym access";
const SPECIFIC = COMMERCIAL.filter((option) => option !== FULL);

const equipment = () => planner.props.form.equipment;

const setEnvironment = (environment) => act(() => planner.props.onEnvironmentChange(environment));

const toggle = (item) => act(() => planner.props.toggleEquipment(item));

beforeEach(() => {
  planner.props = null;
  window.history.pushState({}, "", "/");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
  render(<App />);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

describe("the planner's equipment picker", () => {
  describe("in a home gym, where each option stands for itself", () => {
    beforeEach(() => {
      setEnvironment("Home");
    });

    test("selecting an option adds it", () => {
      toggle(HOME[1]);
      expect(equipment()).toContain(HOME[1]);
    });

    test("selecting it again removes it", () => {
      toggle(HOME[1]);
      toggle(HOME[1]);
      expect(equipment()).not.toContain(HOME[1]);
    });

    test("several can be held at once", () => {
      toggle(HOME[0]);
      toggle(HOME[2]);

      expect(equipment()).toContain(HOME[0]);
      expect(equipment()).toContain(HOME[2]);
    });

    test("removing one leaves the others alone", () => {
      toggle(HOME[0]);
      toggle(HOME[2]);
      toggle(HOME[0]);

      expect(equipment()).not.toContain(HOME[0]);
      expect(equipment()).toContain(HOME[2]);
    });

    test("the list keeps the order they were chosen in", () => {
      // Deliberately the opposite of the commercial branch, which re-sorts to
      // the listed order. This is what separates the two code paths: run the
      // commercial logic here and the selection comes back sorted instead.
      toggle(HOME[2]);
      toggle(HOME[0]);

      expect(equipment()).toEqual([HOME[2], HOME[0]]);
    });
  });

  describe("in a commercial gym, where one option stands for all of them", () => {
    beforeEach(() => {
      setEnvironment("Commercial");
    });

    test("full access selects everything at once", () => {
      toggle(FULL);
      expect(equipment().sort()).toEqual([...COMMERCIAL].sort());
    });

    test("full access again clears everything", () => {
      toggle(FULL);
      toggle(FULL);

      expect(equipment()).toEqual([]);
    });

    test("a single room can be chosen on its own", () => {
      toggle(SPECIFIC[0]);

      expect(equipment()).toEqual([SPECIFIC[0]]);
      expect(equipment()).not.toContain(FULL);
    });

    test("deselecting a room while full access is on keeps the others", () => {
      // The visitor means "everything except the pool", not "nothing".
      //
      // Three mechanisms in the source produce this, and mutation testing --
      // singly and then in pairs -- says exactly how they relate:
      //
      //   - the block that expands full access into its parts, and the branch
      //     that removes full access when the set is incomplete, are a
      //     mutually redundant PAIR. Either one alone can be deleted and this
      //     suite still passes; delete both and it fails. One of them is
      //     load-bearing, and which one is a free choice.
      //   - the filter narrowing the previous selection to the environment's
      //     own options is redundant on its own and alongside either of the
      //     other two, because `onEnvironmentChange` has already narrowed the
      //     list before this ever runs.
      //
      // Worth knowing before any of it is "tidied up" on the strength of a
      // passing suite: two of the three deletions are safe and the third is
      // only safe while its partner stays.
      toggle(FULL);
      toggle(SPECIFIC[0]);

      expect(equipment()).not.toContain(SPECIFIC[0]);
      expect(equipment()).not.toContain(FULL);
      SPECIFIC.slice(1).forEach((option) => expect(equipment()).toContain(option));
    });

    test("choosing the last missing room folds them back into full access", () => {
      // The inverse of the case above: once every room is selected, the list
      // means full access and should say so.
      SPECIFIC.forEach((option) => toggle(option));

      expect(equipment().sort()).toEqual([...COMMERCIAL].sort());
    });

    test("full access drops away again as soon as one room is removed", () => {
      SPECIFIC.forEach((option) => toggle(option));
      expect(equipment()).toContain(FULL);

      toggle(SPECIFIC[0]);

      expect(equipment()).not.toContain(FULL);
      expect(equipment()).not.toContain(SPECIFIC[0]);
    });

    test("the selection keeps the order the options are listed in", () => {
      // The planner renders the list back to the visitor; selection order
      // would shuffle it under them.
      toggle(SPECIFIC[3]);
      toggle(SPECIFIC[1]);

      expect(equipment()).toEqual([SPECIFIC[1], SPECIFIC[3]]);
    });
  });

  describe("changing environment", () => {
    test("drops equipment the new environment does not offer", () => {
      // Dumbbells are not a room in a commercial gym, and carrying them over
      // would send the planner an option it cannot show.
      setEnvironment("Home");
      toggle(HOME[1]);
      expect(equipment()).toContain(HOME[1]);

      setEnvironment("Commercial");

      expect(equipment()).toEqual([]);
      expect(planner.props.form.environment).toBe("Commercial");
    });

    test("keeps nothing but what both offer", () => {
      setEnvironment("Commercial");
      toggle(SPECIFIC[0]);

      setEnvironment("Home");

      expect(equipment()).toEqual([]);
    });

    test("an unknown environment clears the list rather than throwing", () => {
      setEnvironment("Home");
      toggle(HOME[1]);

      expect(() => setEnvironment("Spaceship")).not.toThrow();
      expect(equipment()).toEqual([]);
    });

    test("toggling in an unknown environment does not throw", () => {
      // Reachable only this far. The `|| []` inside the toggle survives
      // mutation testing because changing environment has already emptied the
      // list, so the `options.includes` that would throw is never reached --
      // `filter` does not call its callback on an empty array, and the
      // commercial check short-circuits on the name before touching options.
      setEnvironment("Spaceship");

      expect(() => toggle("Anything")).not.toThrow();
    });
  });

  describe("the planner's other handlers", () => {
    test("a field change updates only that field", () => {
      const before = planner.props.form.goal;

      act(() => planner.props.onChange({ target: { name: "duration", value: "30" } }));

      expect(planner.props.form.duration).toBe("30");
      expect(planner.props.form.goal).toBe(before);
    });

    test("closing the planner resets it for next time", () => {
      // A half-filled planner reopening on step 3 is disorienting.
      act(() => planner.props.setPlannerStep(3));
      expect(planner.props.plannerStep).toBe(3);

      act(() => planner.props.closePlanner());

      expect(planner.props.plannerOpen).toBe(false);
      expect(planner.props.plannerStep).toBe(1);
    });

    test("closing it also clears the equipment the visitor had picked", () => {
      setEnvironment("Home");
      toggle(HOME[1]);

      act(() => planner.props.closePlanner());

      expect(equipment()).toEqual([]);
    });

    test("a focus toggle adds and removes", () => {
      const focus = "Strength";

      act(() => planner.props.toggleFocus(focus));
      expect(planner.props.form.focuses).toContain(focus);

      act(() => planner.props.toggleFocus(focus));
      expect(planner.props.form.focuses).not.toContain(focus);
    });
  });
});
