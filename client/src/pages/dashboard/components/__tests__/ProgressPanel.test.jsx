import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import ProgressPanel, { PrTag } from "../ProgressPanel";

// Logs' Progress panel (roadmap B2) over progress.js, whose arithmetic is
// pinned in ../../__tests__/progress.test.js. What is pinned here is what the
// panel adds: which rows and lines it shows, in what order and words, and the
// loads in the region's unit. "Today" is Wednesday 2026-11-04.

const TODAY = "2026-11-04";

let saved = 0;
const session = (date, exerciseSets) => {
  saved += 1;
  return {
    id: `s-${saved}`,
    date,
    createdAt: new Date(Date.UTC(2026, 0, 1) + saved * 1000).toISOString(),
    exerciseSets
  };
};
const exercise = (name, pattern, sets) => ({ name, pattern, sets });
const reps = (count, loadKg = null) => ({ reps: count, seconds: null, loadKg, rpe: null });
const hold = (seconds) => ({ reps: null, seconds, loadKg: null, rpe: null });
const times = (count, set) => Array.from({ length: count }, () => set);

const renderPanel = (sessions, measurementSystem = "metric") =>
  render(<ProgressPanel sessions={sessions} today={TODAY} measurementSystem={measurementSystem} />);

const setsTable = () => screen.getByRole("table", { name: "This week's sets" });
const tableRows = () =>
  within(setsTable())
    .getAllByRole("row")
    .slice(1)
    .map((row) => Array.from(row.cells).map((cell) => cell.textContent));
const recordLines = () =>
  within(screen.getByRole("list", { name: "Records" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

// One lift per session, each a day later than the one before, so the most
// recently trained is the last named.
const liftsOnDays = (count) =>
  Array.from({ length: count }, (_, index) =>
    session(`2026-10-${String(index + 1).padStart(2, "0")}`, [
      exercise(`Lift ${index + 1}`, "arms", [reps(10, 10)])
    ])
  );

describe("the sets table", () => {
  test("has column headers and a row per group: GROUPS order, Not sorted last", () => {
    renderPanel([
      session("2026-11-03", [
        exercise("Curl", "arms", [reps(12, 10)]),
        exercise("My cable thing", null, [reps(5)]),
        exercise("Squat", "squat", times(3, reps(5, 100))),
        exercise("Romanian deadlift", "hinge", [])
      ]),
      session("2026-10-27", [exercise("Squat", "squat", times(4, reps(5, 100)))])
    ]);

    expect(
      within(setsTable())
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
    ).toEqual(["Muscle group", "This week", "4-week average"]);
    expect(
      within(setsTable())
        .getAllByRole("rowheader")
        .map((cell) => cell.textContent)
    ).toEqual(["Legs", "Arms", "Not sorted"]);
    // Legs: 3 this week, and 4 sets over the four weeks before, an average of 1.
    expect(tableRows()).toEqual([
      ["Legs", "3", "1.0"],
      ["Arms", "1", "0.0"],
      ["Not sorted", "1", "0.0"]
    ]);
  });

  // Records alone are something to show, so there is no empty message either.
  test("is left out when nothing falls in the last five weeks", () => {
    renderPanel([session("2026-08-03", [exercise("Squat", "squat", [reps(5, 100)])])]);

    expect(screen.queryByRole("table")).toBeNull();
    expect(recordLines()).toEqual(["Squat: e1RM 116.7 kg, heaviest 100 kg × 5"]);
    expect(screen.queryByText(/Log a workout with sets/)).toBeNull();
  });
});

describe("the records", () => {
  test("name each lift's records in the panel's words", () => {
    renderPanel([
      session("2026-10-01", [
        exercise("Squat", "squat", [reps(5, 100)]),
        exercise("Pull-up", "vertical-pull", [reps(8)])
      ]),
      session("2026-11-03", [
        exercise("Squat", "squat", [reps(5, 105)]),
        exercise("Pull-up", "vertical-pull", [reps(11)]),
        exercise("Dumbbell box squat", "squat", [reps(12, 13.61), reps(11)])
      ])
    ]);

    // 105 × 7/6 = 122.5 now, against 100 × 7/6 = 116.67 four weeks back.
    expect(recordLines()).toEqual([
      "Squat: e1RM 122.5 kg (up 5.8 kg), heaviest 105 kg × 5 (up 5 kg)",
      "Pull-up: most reps 11 (up 3)",
      "Dumbbell box squat: heaviest 13.6 kg × 12"
    ]);
    expect(
      screen.getByText("e1RM is estimated from sets of 1 to 10 reps (Epley).")
    ).toBeInTheDocument();
  });

  test("show loads in pounds under an imperial region", () => {
    renderPanel(
      [
        session("2026-10-01", [exercise("Squat", "squat", [reps(5, 100)])]),
        session("2026-11-03", [
          exercise("Squat", "squat", [reps(5, 105)]),
          exercise("Dumbbell box squat", "squat", [reps(12, 13.61)])
        ])
      ],
      "imperial"
    );

    // 122.5 kg is 270.1 lb, 5.83 kg is 12.9 lb, 105 kg 231.5 lb, 13.61 kg 30 lb.
    expect(recordLines()).toEqual([
      "Squat: e1RM 270.1 lb (up 12.9 lb), heaviest 231.5 lb × 5 (up 11 lb)",
      "Dumbbell box squat: heaviest 30 lb × 12"
    ]);
  });

  // A change under 0.05 shows as 0 at one decimal, which would read "up 0 kg".
  test("leave out a change too small to show", () => {
    renderPanel([
      session("2026-10-01", [exercise("Squat", "squat", [reps(12, 100)])]),
      session("2026-11-03", [exercise("Squat", "squat", [reps(12, 100.04)])])
    ]);

    expect(recordLines()).toEqual(["Squat: heaviest 100 kg × 12"]);
  });

  test("list eight, most recently trained first, and Show all lists the rest", () => {
    renderPanel(liftsOnDays(10));

    expect(recordLines().map((line) => line.split(":")[0])).toEqual([
      "Lift 10",
      "Lift 9",
      "Lift 8",
      "Lift 7",
      "Lift 6",
      "Lift 5",
      "Lift 4",
      "Lift 3"
    ]);

    const toggle = screen.getByRole("button", { name: "Show all 10 records" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(recordLines()).toHaveLength(10);
    expect(toggle).toHaveTextContent("Show fewer records");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(recordLines()).toHaveLength(8);
  });

  test("offer no Show all for eight or fewer", () => {
    renderPanel(liftsOnDays(8));

    expect(recordLines()).toHaveLength(8);
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
  });

  test("are left out when no lift has one", () => {
    renderPanel([session("2026-11-03", [exercise("Plank", "core", [hold(60)])])]);

    expect(tableRows()).toEqual([["Core", "1", "0.0"]]);
    expect(screen.queryByRole("list", { name: "Records" })).toBeNull();
    expect(screen.queryByText(/Epley/)).toBeNull();
  });
});

describe("the panel", () => {
  test("is a region named Progress", () => {
    renderPanel([]);

    expect(screen.getByRole("region", { name: "Progress" })).toBeInTheDocument();
  });

  test.each([
    ["no sessions", []],
    ["sessions with no sets", [session("2026-11-03", [])]]
  ])("with %s, says how to fill it", (_label, sessions) => {
    renderPanel(sessions);

    expect(
      screen.getByText("Log a workout with sets to see your progress here.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });

  test("drops the empty message once there is something to show", () => {
    renderPanel([session("2026-11-03", [exercise("Plank", "core", [hold(60)])])]);

    expect(screen.queryByText(/Log a workout with sets/)).toBeNull();
  });
});

describe("PrTag", () => {
  test("shows PR, and is read aloud as the records the session set", () => {
    render(
      <PrTag
        marks={[
          { name: "Squat", record: "e1rm" },
          { name: "Squat", record: "heaviest" },
          { name: "Pull-up", record: "reps" }
        ]}
      />
    );

    expect(screen.getByText("PR")).toHaveAttribute("aria-hidden", "true");
    const label = screen.getByText(
      "personal record: Squat, best e1RM and heaviest set; Pull-up, most reps"
    );
    expect(label).toHaveClass("visually-hidden");
  });
});
