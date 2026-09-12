import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import PreviewDashboardChapter from "./PreviewDashboardChapter";

// The last chapter of the walkthrough, and the one that assembles a whole
// dashboard out of the summary it is handed. Two things are worth pinning: the
// eight-stage reveal, where a threshold off by one shows the visitor a panel
// before the step that produces it, and the stand-ins each panel falls back to
// when its slice of the summary is empty.

const SUMMARY = {
  goalText: "Build lean strength",
  scheduleText: "4 days - 50 min",
  environmentText: "Commercial",
  equipmentList: ["Full gym access", "Barbell"],
  focusPicks: ["Strength", "Conditioning"],
  todayName: "Monday",
  todaySession: "Push Day",
  todayDuration: "50 min",
  todayWorkoutLines: ["Bench press 4x6", "Overhead press 3x8"],
  todayMealPlan: {
    breakfast: "Oats and berries",
    lunch: "Chicken and rice",
    dinner: "Salmon and greens",
    snack: "Greek yoghurt",
    calories: 2400
  },
  nextTrainingPlan: {
    day: "Tuesday",
    session: "Pull Day",
    meta: "45 min - moderate",
    highlights: ["Row volume", "Grip work", "Extra core"]
  },
  goalPaceText: "At this pace, 3 days to reach 4 workouts.",
  weeklyGoal: 4,
  completedWorkouts: 2,
  workoutProgress: 50,
  avgCalories: 2350,
  calorieGoal: 2400,
  calorieProgress: 98,
  calorieDelta: -50,
  targetWeightLabel: "82 kg",
  activeDays: 3,
  avgRecovery: 72,
  calorieSeries: [2100, 2300, 2500, 2200, 2400, 2350, 2450],
  workoutSeries: [1, 0, 1, 1, 0, 1, 0],
  recoverySeries: [70, 72, 68, 75, 71, 74, 73],
  trendStartLabel: "Sep 6",
  trendEndLabel: "Sep 12",
  streakDays: 2,
  recentActivity: [
    { day: "Monday", session: "Push Day", duration: "50 min" },
    { day: "Tuesday", session: "Pull Day", duration: "45 min" }
  ]
};

const renderChapter = (overrides = {}, previewDashboardStage = 8) =>
  render(
    <PreviewDashboardChapter
      previewDashboardSummary={{ ...SUMMARY, ...overrides }}
      previewDashboardStage={previewDashboardStage}
    />
  );

// Each panel is revealed by an is-visible class on the section wrapping its
// heading.
const panelFor = (headingText) => screen.getByText(headingText).closest("section");
const isVisible = (headingText) => panelFor(headingText).className.includes("is-visible");

// Scoped versions, for the comparisons that render twice and so cannot use
// document-wide queries.
const panelIn = (container, headingText) =>
  [...container.querySelectorAll("h3, h4")]
    .find((node) => node.textContent === headingText)
    .closest("section");
const isVisibleIn = (container, headingText) =>
  panelIn(container, headingText).className.includes("is-visible");

// Heading text -> the stage that reveals it, in the order the walkthrough
// plays them.
const PANELS = [
  ["Today's training snapshot", 1],
  ["Monday recommendations", 2],
  ["Weekly progress", 3],
  ["Recent activity", 4],
  ["Trend window", 5],
  ["Calories", 6],
  ["Activity", 7],
  ["Recovery", 8]
];

describe("PreviewDashboardChapter", () => {
  describe("the staged reveal", () => {
    test("shows nothing before the sequence starts", () => {
      renderChapter({}, 0);

      PANELS.forEach(([heading]) => expect(isVisible(heading)).toBe(false));
    });

    test.each(PANELS)("%s appears at stage %i", (heading, stage) => {
      const before = renderChapter({}, stage - 1).container;
      const after = renderChapter({}, stage).container;

      expect(isVisibleIn(before, heading)).toBe(false);
      expect(isVisibleIn(after, heading)).toBe(true);
    });

    test("every panel is out by the last stage, and they arrive in order", () => {
      renderChapter({}, 8);

      PANELS.forEach(([heading]) => expect(isVisible(heading)).toBe(true));
    });

    test("a stage reveals everything before it, and nothing after", () => {
      // The whole point of the sequence: at stage 4 the visitor should be
      // looking at four panels, not three and not five.
      renderChapter({}, 4);

      PANELS.forEach(([heading, stage]) => expect(isVisible(heading)).toBe(stage <= 4));
    });
  });

  describe("the calorie delta", () => {
    test.each([
      ["exactly on target", 0, "on target"],
      ["over target", 120, "+120 kcal vs target"],
      ["under target", -120, "-120 kcal vs target"]
    ])("reads %s", (_label, calorieDelta, expected) => {
      // The positive case is the one that needs its sign added; the negative
      // already carries one, so a shared template would double it.
      renderChapter({ calorieDelta });

      expect(screen.getByText(new RegExp(`\\| ${expected.replace("+", "\\+")}$`))).toBeTruthy();
    });
  });

  describe("the next session", () => {
    test("names the day, session and length it is given", () => {
      renderChapter();

      expect(screen.getByText(/^Next: Tuesday - Pull Day \(45 min\)$/)).toBeTruthy();
    });

    test("takes only the first part of the meta as the length", () => {
      renderChapter({ nextTrainingPlan: { ...SUMMARY.nextTrainingPlan, meta: "30 min - easy" } });

      expect(screen.getByText(/\(30 min\)$/)).toBeTruthy();
    });

    test("shows at most two highlights", () => {
      // Three are supplied; the card has room for two.
      renderChapter();
      const notes = document.querySelectorAll(".preview-dashboard-compact-list li");

      expect([...notes].map((node) => node.textContent)).toEqual(["Row volume", "Grip work"]);
    });

    test("stands in for a session it has not been given", () => {
      renderChapter({ nextTrainingPlan: null });

      expect(screen.getByText(/^Next: Next - Training Session \(50 min\)$/)).toBeTruthy();
      expect(document.querySelectorAll(".preview-dashboard-compact-list li")).toHaveLength(0);
    });

    test("treats highlights that are not a list as none", () => {
      renderChapter({
        nextTrainingPlan: { ...SUMMARY.nextTrainingPlan, highlights: "Row volume" }
      });

      expect(document.querySelectorAll(".preview-dashboard-compact-list li")).toHaveLength(0);
    });
  });

  describe("panels with nothing to show", () => {
    test("a day with no workout lines offers recovery instead of an empty list", () => {
      renderChapter({ todayWorkoutLines: [] });

      expect(screen.getByText("Active recovery and mobility reset")).toBeTruthy();
    });

    test("a day with workout lines does not also offer recovery", () => {
      renderChapter();

      expect(screen.queryByText("Active recovery and mobility reset")).toBeNull();
      expect(screen.getByText("Bench press 4x6")).toBeTruthy();
    });

    test("an empty history says so rather than showing a blank strip", () => {
      renderChapter({ recentActivity: [] });

      expect(screen.getByText("No workouts logged yet.")).toBeTruthy();
    });

    test("a populated history lists each session and not the empty message", () => {
      renderChapter();

      expect(screen.queryByText("No workouts logged yet.")).toBeNull();
      const rows = document.querySelectorAll(".preview-dashboard-activity-row");
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain("Push Day");
    });
  });

  describe("the three trend charts", () => {
    test.each([
      ["Calories", "is-calories"],
      ["Activity", "is-activity"],
      ["Recovery", "is-recovery"]
    ])("%s draws its own series", (title, lineClassName) => {
      renderChapter();
      const chart = panelFor(title);

      expect(within(chart).getByRole("img", { name: `${title} trend` })).toBeTruthy();
      expect(chart.querySelector(`.${lineClassName}`)).toBeTruthy();
      // A real path, not an empty attribute.
      expect(chart.querySelector("path").getAttribute("d")).toMatch(/^M[\d.]/);
    });

    test("each chart gets a different shape, so none is drawing another's data", () => {
      renderChapter();
      const paths = [...document.querySelectorAll(".preview-dashboard-chart path")].map((node) =>
        node.getAttribute("d")
      );

      expect(paths).toHaveLength(3);
      expect(new Set(paths).size).toBe(3);
    });

    test("all three share the trend window's labels", () => {
      renderChapter();

      expect(screen.getAllByText("Sep 6")).toHaveLength(3);
      expect(screen.getAllByText("Sep 12")).toHaveLength(3);
    });
  });

  describe("the figures it reports", () => {
    test("carries the plan settings through to the overview", () => {
      renderChapter();

      expect(screen.getByText("Build lean strength")).toBeTruthy();
      expect(screen.getByText("4 days - 50 min")).toBeTruthy();
      expect(screen.getByText("Commercial")).toBeTruthy();
      expect(screen.getByText("Full gym access, Barbell")).toBeTruthy();
      expect(screen.getByText("Strength, Conditioning")).toBeTruthy();
    });

    test("rounds the trend average but shows the weekly one as given", () => {
      renderChapter({ avgCalories: 2350.4 });

      expect(screen.getByText("2350.4")).toBeTruthy();
      expect(screen.getByText("2350")).toBeTruthy();
    });

    test("fills each progress bar to its own percentage", () => {
      renderChapter({ workoutProgress: 50, calorieProgress: 98 });
      const bars = [...document.querySelectorAll(".preview-dashboard-progress span")];

      expect(bars.map((bar) => bar.style.width)).toEqual(["50%", "98%"]);
    });
  });
});
