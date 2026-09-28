import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import HomePage from "../HomePage";

// The stage router for the whole home flow. Both hooks it calls have their own
// suites, so they are stubbed and what is left is this file's own work: which
// stage is mounted, what the stage shell is wearing while it moves, and the two
// handlers it owns -- the training-day toggle and the submit gate.

const flow = vi.hoisted(() => ({ state: null }));
const stages = vi.hoisted(() => ({ personal: null, visualizer: null, workout: null }));

vi.mock("../components/HomeIntroStage", () => ({
  default: (props) => (
    <div data-testid="intro-stage" data-direction={String(props.stageDirection)} />
  )
}));
vi.mock("../preview/PreviewPage", () => ({
  default: () => <div data-testid="preview-stage" />
}));
vi.mock("../components/HomePersonalStage", () => ({
  default: (props) => {
    stages.personal = props;
    return <div data-testid="personal-stage" />;
  }
}));
vi.mock("../components/HomeVisualizerStage", () => ({
  default: (props) => {
    stages.visualizer = props;
    return <div data-testid="visualizer-stage" />;
  }
}));
vi.mock("../components/HomeWorkoutStage", () => ({
  default: (props) => {
    stages.workout = props;
    return <div data-testid="workout-stage" />;
  }
}));
vi.mock("../components/HomeWorkoutMeasure", () => ({
  default: () => <div data-testid="workout-measure" />
}));

vi.mock("../hooks/useHomeStageFlow", () => ({ default: () => flow.state }));

vi.mock("../hooks/useBodyModel", () => ({
  default: () => ({
    resolvedHeightCm: 178,
    resolvedWeightKg: 77,
    isPersonalComplete: flow.state.isPersonalComplete,
    effectiveBodyFat: 18,
    silhouetteShape: { shoulderHalf: 40 },
    silhouetteRenderSignature: "sig"
  })
}));

const flowState = (overrides = {}) => ({
  visualPanelRef: { current: null },
  introPanelRef: { current: null },
  personalPanelRef: { current: null },
  introTitleRef: { current: null },
  introButtonRef: { current: null },
  workoutPanelRef: { current: null },
  workoutShellRef: { current: null },
  workoutMeasureRef: { current: null },
  workoutMeasureShellRef: { current: null },
  homeStage: "intro",
  stageDirection: "forward",
  isIntroTransitioning: false,
  isStageTransitioning: false,
  suppressStageEnter: false,
  goToStage: vi.fn(),
  transitionToStageFromTrigger: vi.fn(),
  onGetStarted: vi.fn(),
  // Not part of the hook: carried here so the useBodyModel stub can read it.
  isPersonalComplete: true,
  ...overrides
});

const setPersonal = vi.fn();

const renderHome = (overrides = {}, props = {}) => {
  flow.state = flowState(overrides);
  return render(
    <HomePage
      gradient={{}}
      user={{ email: "a@b.c" }}
      onLogout={vi.fn()}
      go={vi.fn()}
      form={{}}
      personalMode="basic"
      setPersonalMode={vi.fn()}
      personal={{ trainingDays: ["Monday"] }}
      onPersonalChange={vi.fn()}
      onResetPersonalFlow={vi.fn()}
      heightUnit="cm"
      setHeightUnit={vi.fn()}
      toCmFromFeetInches={vi.fn()}
      toFeetInchesFromCm={vi.fn()}
      setPersonal={setPersonal}
      weightUnit="kg"
      setWeightUnit={vi.fn()}
      toKg={vi.fn()}
      toLb={vi.fn()}
      openPlannerFromProfile={vi.fn()}
      error=""
      samplePlan={[{ day: "Monday" }]}
      plannerModal={<div data-testid="planner-modal" />}
      generatedPlanModal={<div data-testid="generated-modal" />}
      {...props}
    />
  );
};

const shell = () => document.querySelector(".home-stage");
const STAGES = ["intro", "preview", "personal", "visualizer", "workout"];

beforeEach(() => {
  setPersonal.mockClear();
  stages.personal = null;
  stages.visualizer = null;
  stages.workout = null;
});

describe("HomePage", () => {
  describe("which stage is mounted", () => {
    test.each(STAGES)("%s mounts only its own stage", (homeStage) => {
      renderHome({ homeStage });

      expect(screen.getByTestId(`${homeStage}-stage`)).toBeInTheDocument();
      STAGES.filter((other) => other !== homeStage).forEach((other) => {
        expect(screen.queryByTestId(`${other}-stage`)).not.toBeInTheDocument();
      });
    });

    test("the intro stands alone, outside the stage shell", () => {
      // Intro is the ternary's first arm and gets no `home-stage` wrapper, so
      // it cannot pick up the transition classes the others wear.
      renderHome({ homeStage: "intro" });

      expect(shell()).toBeNull();
      expect(document.querySelector("main.content")).toBeNull();
    });

    test("every other stage sits inside the shell", () => {
      renderHome({ homeStage: "personal" });

      expect(document.querySelector("main.content")).toBeTruthy();
      expect(shell()).toBeTruthy();
    });

    test("an unrecognised stage renders the shell with nothing in it", () => {
      // Nothing produces this today, but the four checks are independent `&&`s
      // rather than a chain, so there is no fallback arm.
      renderHome({ homeStage: "somewhere-else" });

      expect(shell()).toBeTruthy();
      STAGES.forEach((name) =>
        expect(screen.queryByTestId(`${name}-stage`)).not.toBeInTheDocument()
      );
    });

    test("the measure shell and both modals render whatever the stage", () => {
      renderHome({ homeStage: "intro" });

      expect(screen.getByTestId("workout-measure")).toBeInTheDocument();
      expect(screen.getByTestId("planner-modal")).toBeInTheDocument();
      expect(screen.getByTestId("generated-modal")).toBeInTheDocument();
    });
  });

  describe("what the stage shell is wearing", () => {
    test("names the stage and the direction it came from", () => {
      renderHome({ homeStage: "workout", stageDirection: "back" });

      expect(shell().className).toContain("home-stage-workout");
      expect(shell().className).toContain("stage-back");
    });

    test.each([
      [
        "snaps into place when the enter animation is suppressed",
        "suppressStageEnter",
        "stage-snap"
      ],
      ["hides itself mid-transition", "isStageTransitioning", "stage-transition-hidden"]
    ])("%s", (_label, flag, className) => {
      renderHome({ homeStage: "personal", [flag]: false });
      expect(shell().className).not.toContain(className);

      renderHome({ homeStage: "personal", [flag]: true });
      expect(document.querySelectorAll(".home-stage")[1].className).toContain(className);
    });
  });

  describe("the sticky nav", () => {
    test("the brand returns to the intro", () => {
      const goToStage = vi.fn();
      renderHome({ homeStage: "personal", goToStage });

      fireEvent.click(screen.getByRole("button", { name: /^(?!Preview).+/ }));

      expect(goToStage).toHaveBeenCalledWith("intro");
    });

    test("Preview jumps to the preview stage", () => {
      const goToStage = vi.fn();
      renderHome({ homeStage: "personal", goToStage });

      fireEvent.click(screen.getByRole("button", { name: "Preview" }));

      expect(goToStage).toHaveBeenCalledWith("preview");
    });

    test.each([
      ["an intro transition", "isIntroTransitioning"],
      ["a stage transition", "isStageTransitioning"]
    ])("Preview is disabled during %s", (_label, flag) => {
      renderHome({ homeStage: "personal", [flag]: true });

      expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    });

    test("Preview is enabled when nothing is moving", () => {
      renderHome({ homeStage: "personal" });

      expect(screen.getByRole("button", { name: "Preview" })).not.toBeDisabled();
    });
  });

  describe("choosing training days", () => {
    const toggle = (day, current) => {
      renderHome({ homeStage: "personal" }, { personal: { trainingDays: current } });
      act(() => stages.personal.toggleTrainingDay(day));
      // setPersonal is called with an updater; run it against the same state.
      return setPersonal.mock.calls.at(-1)[0]({ trainingDays: current });
    };

    test("adds a day that is not chosen yet", () => {
      expect(toggle("Friday", ["Monday"]).trainingDays).toEqual(["Monday", "Friday"]);
    });

    test("removes a day that is already chosen", () => {
      expect(toggle("Monday", ["Monday", "Friday"]).trainingDays).toEqual(["Friday"]);
    });

    test("removes only the day named", () => {
      expect(toggle("Friday", ["Monday", "Friday", "Sunday"]).trainingDays).toEqual([
        "Monday",
        "Sunday"
      ]);
    });

    test.each([
      ["absent", undefined],
      ["not a list", "Monday"]
    ])("treats a trainingDays that is %s as none chosen", (_label, current) => {
      // An older saved profile can carry either. Spreading a string would put
      // its characters in the list.
      expect(toggle("Friday", current).trainingDays).toEqual(["Friday"]);
    });

    test("leaves the rest of the profile alone", () => {
      renderHome({ homeStage: "personal" });
      act(() => stages.personal.toggleTrainingDay("Friday"));
      const next = setPersonal.mock.calls.at(-1)[0]({ name: "Ada", trainingDays: [] });

      expect(next.name).toBe("Ada");
    });

    test("offers all seven days", () => {
      renderHome({ homeStage: "personal" });

      expect(stages.personal.trainingDayOptions).toEqual([
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday"
      ]);
    });
  });

  describe("submitting the profile", () => {
    const submit = (overrides) => {
      renderHome({ homeStage: "personal", ...overrides });
      const event = { preventDefault: vi.fn() };
      act(() => stages.personal.onPersonalSubmit(event));
      return { event, flowState: flow.state };
    };

    test("moves on to the visualizer when the profile is ready", () => {
      const { event, flowState: state } = submit({});

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(state.transitionToStageFromTrigger).toHaveBeenCalledWith("visualizer");
    });

    test.each([
      ["the profile is incomplete", { isPersonalComplete: false }],
      ["the intro is still moving", { isIntroTransitioning: true }],
      ["a stage is still moving", { isStageTransitioning: true }]
    ])("does not move on while %s", (_label, overrides) => {
      const { event, flowState: state } = submit(overrides);

      // The form is still stopped from reloading the page, whatever else.
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(state.transitionToStageFromTrigger).not.toHaveBeenCalled();
    });
  });

  describe("moving back and forward between stages", () => {
    test("the visualizer goes back to the profile and on to the workout", () => {
      renderHome({ homeStage: "visualizer" });

      act(() => stages.visualizer.onBack());
      expect(flow.state.goToStage).toHaveBeenCalledWith("personal");

      act(() => stages.visualizer.onContinue());
      expect(flow.state.transitionToStageFromTrigger).toHaveBeenCalledWith("workout");
    });

    test("the workout goes back to the visualizer", () => {
      renderHome({ homeStage: "workout" });

      act(() => stages.workout.onBack());

      expect(flow.state.goToStage).toHaveBeenCalledWith("visualizer");
    });
  });

  describe("what the stages are handed", () => {
    test("the visualizer gets the body model's silhouette", () => {
      renderHome({ homeStage: "visualizer" });

      expect(stages.visualizer.silhouetteShape).toEqual({ shoulderHalf: 40 });
      expect(stages.visualizer.silhouetteRenderSignature).toBe("sig");
    });

    test("the profile stage is told whether the profile is complete", () => {
      renderHome({ homeStage: "personal", isPersonalComplete: false });

      expect(stages.personal.isPersonalComplete).toBe(false);
    });
  });
});
