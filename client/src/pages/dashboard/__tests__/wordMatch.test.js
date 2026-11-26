import { describe, expect, test } from "vitest";
import { hasWord } from "../wordMatch";

describe("hasWord", () => {
  test.each([
    ["cut", ["cut"], true],
    ["a cut phase", ["cut"], true],
    ["execute", ["cut"], false],
    ["haircut", ["cut"], false],
    ["push-ups", ["push"], true],
    ["wrist/elbow", ["elbow"], true],
    ["lower back pain", ["lower back"], true],
    ["lower-back", ["lower back"], false],
    ["knees", ["knee"], false],
    ["knees", ["knee", "knees"], true]
  ])("%j against %j is %s", (text, forms, expected) => {
    expect(hasWord(text, forms)).toBe(expected);
  });
});
