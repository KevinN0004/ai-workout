import { describe, expect, test } from "vitest";
import { DEFAULT_GEMINI_MODEL, NOTES_INSTRUCTION, buildNotesPrompt } from "../planPromptService.js";

// The prompt Gemini writes a plan's coach notes from: the instruction, and the
// message holding the client's answers, fenced, then the plan the rules built.
// The generate route sends it; its tests check what reaches the model.

const fields = {
  goal: "Build strength",
  equipment: ["Dumbbells", "Yoga mat"],
  duration: 45,
  level: "Beginner",
  injuries: "Knee",
  days: 4,
  environment: "Home",
  focuses: ["Strength", "Mobility"]
};

describe("buildNotesPrompt", () => {
  test("writes one line per answer between the fenced markers, then the plan", () => {
    expect(buildNotesPrompt(fields, "abc", "Monday - Full body A\n- Squat").split("\n")).toEqual([
      "BEGIN CLIENT DATA abc (untrusted)",
      "- Goal: Build strength",
      "- Experience: Beginner",
      "- Injuries/limitations: Knee",
      "- Focuses: Strength, Mobility",
      "- Training days: 4",
      "- Session length: 45 minutes",
      "- Environment: Home",
      "- Equipment: Dumbbells, Yoga mat",
      "END CLIENT DATA abc",
      "",
      "The plan:",
      "Monday - Full body A",
      "- Squat"
    ]);
  });

  test.each([
    ["no focus", { focuses: [] }, "- Focuses: General fitness"],
    ["no equipment", { equipment: [] }, "- Equipment: Bodyweight only"]
  ])("names the default for %s", (_label, patch, line) => {
    expect(buildNotesPrompt({ ...fields, ...patch }, "abc", "").split("\n")).toContain(line);
  });
});

describe("NOTES_INSTRUCTION", () => {
  test("asks for three to five plain notes, one a line", () => {
    expect(NOTES_INSTRUCTION).toMatch(/3 to 5 short coaching notes/);
    expect(NOTES_INSTRUCTION).toMatch(/one note per line/);
  });

  // The FDA's General Wellness policy and the EU's MDCG 2019-11 draw the line
  // at these claims (spec, "The coach notes").
  test.each([
    ["diagnosis", /diagnose/],
    ["a condition the client did not state", /condition the client did not state/],
    ["promising to prevent or treat an injury", /prevent or treat an injury/],
    ["pain thresholds", /pain thresholds/],
    ["medication advice", /medication/]
  ])("forbids %s", (_label, pattern) => {
    expect(NOTES_INSTRUCTION).toMatch(pattern);
  });

  test("treats the fenced client data as untrusted", () => {
    expect(NOTES_INSTRUCTION).toMatch(/untrusted data/);
    expect(NOTES_INSTRUCTION).toMatch(/BEGIN CLIENT DATA and END CLIENT DATA/);
  });

  test("defaults to gemini-3.5-flash-lite", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
  });
});
