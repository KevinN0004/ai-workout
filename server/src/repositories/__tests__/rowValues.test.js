/**
 * Pins toJsonArray and toJsonObject from rowValues.js: a value of the expected
 * shape passes through as the same object, and anything else, a JSON-looking
 * string included, reads as an empty one. Pure, so nothing is stubbed.
 */
import { describe, expect, test } from "vitest";
import { toJsonArray, toJsonObject } from "../rowValues.js";

describe("toJsonArray", () => {
  test("passes an array through unchanged", () => {
    const value = [1, "two"];
    expect(toJsonArray(value)).toBe(value);
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a JSON-looking string", "[1]"],
    ["zero", 0],
    ["a plain object", {}],
    ["an array-like object", { length: 1 }]
  ])("reads %s as an empty array", (_label, value) => {
    expect(toJsonArray(value)).toEqual([]);
  });
});

describe("toJsonObject", () => {
  test("passes a plain object through unchanged", () => {
    const value = { a: 1 };
    expect(toJsonObject(value)).toBe(value);
  });

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a JSON-looking string", "{}"],
    ["zero", 0],
    ["an empty array", []],
    ["an array", [1]]
  ])("reads %s as an empty object", (_label, value) => {
    expect(toJsonObject(value)).toEqual({});
  });
});
