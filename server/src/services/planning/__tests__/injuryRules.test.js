import { describe, expect, test } from "vitest";
import { INJURY_AREAS, buildInjuryText, detectInjuryAreas } from "../injuryRules.js";

// How the plan generator reads the injuries answer: a planner option or free
// text, mapped to the body areas the exercise library is tagged by. The Guides
// view reads the same text with its own copy of these rules, and
// client/src/pages/dashboard/tips/__tests__/injuryRules.contract.test.js holds
// the two to the same answers.

describe("detectInjuryAreas", () => {
  test.each([
    ["None", []],
    ["Lower back", ["lower back"]],
    ["Knee", ["knee"]],
    ["Shoulder", ["shoulder"]],
    ["Hip", ["hip"]],
    ["Wrist/Elbow", ["wrist", "elbow"]]
  ])("maps the planner option %j to %j", (option, areas) => {
    expect(detectInjuryAreas(buildInjuryText(option, ""))).toEqual(areas);
  });

  test("finds an area named in free text, in any case", () => {
    expect(detectInjuryAreas("My SHOULDER hurts after a sore knee")).toEqual(["knee", "shoulder"]);
  });

  // "back" is inside "lower back", so a note naming the lower back is one area,
  // and a further back mention beside it adds none.
  test.each([
    ["lower back pain"],
    ["lower backache"],
    ["lower back and upper back"],
    ["upper back pain, then lower back"]
  ])("reads %j as the lower back alone", (note) => {
    expect(detectInjuryAreas(note)).toEqual(["lower back"]);
  });

  test("still reads an area the lower back does not cover", () => {
    expect(detectInjuryAreas("lower back; knee")).toEqual(["lower back", "knee"]);
  });

  test.each([
    ["sore knees", "knee"],
    ["bad kneecap", "knee"],
    ["kneeling hurts", "knee"],
    ["my hips ache", "hip"],
    ["hipbone bruise", "hip"],
    ["backache", "back"],
    ["lowerback pain", "back"],
    ["upperback stiffness", "back"],
    ["shoulders tight", "shoulder"],
    ["sore wrists", "wrist"],
    ["tennis elbows", "elbow"]
  ])("reads the name form in %j as %s", (note, area) => {
    expect(detectInjuryAreas(note)).toEqual([area]);
  });

  // Whole words only: a name inside a longer word is not an area.
  test.each([
    ["relationship stress"],
    ["championship prep"],
    ["feedback welcome"],
    ["comeback after a setback"],
    ["leg press and calf raise PRs"]
  ])("finds no area inside a longer word in %j", (note) => {
    expect(detectInjuryAreas(note)).toEqual([]);
  });

  test.each([
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 7]
  ])("returns no area for %s", (_label, input) => {
    expect(detectInjuryAreas(input)).toEqual([]);
  });

  test("lists areas in the library's order, once each", () => {
    expect(detectInjuryAreas("elbow, knee, elbow again, wrist")).toEqual([
      "knee",
      "wrist",
      "elbow"
    ]);
  });
});

describe("INJURY_AREAS", () => {
  test("are the areas the text can name, lower back first", () => {
    expect(INJURY_AREAS).toEqual([
      "lower back",
      "back",
      "knee",
      "shoulder",
      "hip",
      "wrist",
      "elbow"
    ]);
  });
});

describe("buildInjuryText", () => {
  test.each([["None"], ["none"], ["N/A"], ["No"], ["  none  "]])(
    "reads the answer %j as no injury",
    (answer) => {
      expect(buildInjuryText(answer, "")).toBe("");
      expect(buildInjuryText("", answer)).toBe("");
    }
  );

  test.each([
    ["No injuries"],
    ["No injuries."],
    ["Nothing"],
    ["No known injuries"],
    ["No injuries or limitations"],
    ["Injury-free"],
    ["  no   injuries  "]
  ])("reads the note %j as no injury", (note) => {
    expect(buildInjuryText("None", note)).toBe("");
  });

  test.each([
    ["No injuries except a sore knee"],
    ["Nothing major, lower back twinges"],
    ["Left knee, otherwise none"]
  ])("keeps the note %j, which names something", (note) => {
    expect(buildInjuryText("None", note)).toBe(note);
  });

  test("joins a real answer and a real note", () => {
    expect(buildInjuryText("Knee", "sore after runs")).toBe("Knee sore after runs");
  });

  test("reads absent values as nothing", () => {
    expect(buildInjuryText(undefined, null)).toBe("");
  });
});
