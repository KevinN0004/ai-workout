import { describe, expect, test } from "vitest";
import { readEvent } from "../stravaEvent.js";

// Reading a webhook event (roadmap C2, docs/specs/2026-11-12-strava-import-design.md,
// "The webhook"). Strava does not sign its events, so the body is anyone's: an
// id is a positive whole number or nothing, never a boolean or a blank coerced
// into one, and anything malformed is no event at all.

const EVENT = {
  object_type: "activity",
  object_id: 9001,
  aspect_type: "create",
  updates: {},
  owner_id: 4242,
  subscription_id: 77,
  event_time: 1794600000
};

describe("readEvent", () => {
  test("an activity event", () => {
    expect(readEvent(EVENT)).toEqual({
      objectType: "activity",
      aspectType: "create",
      objectId: "9001",
      ownerId: 4242,
      subscriptionId: 77,
      deauthorized: false
    });
  });

  test('a deauthorization carries authorized: "false"', () => {
    expect(
      readEvent({
        ...EVENT,
        object_type: "athlete",
        object_id: 4242,
        aspect_type: "update",
        updates: { authorized: "false" }
      })
    ).toMatchObject({ objectType: "athlete", deauthorized: true });
  });

  test.each([
    ["a boolean false", { authorized: false }],
    ["true", { authorized: "true" }],
    ["no updates", undefined],
    ["a title change", { title: "Renamed" }]
  ])("%s is no deauthorization", (_label, updates) => {
    expect(readEvent({ ...EVENT, updates }).deauthorized).toBe(false);
  });

  test("ids given as digits are read", () => {
    expect(
      readEvent({ ...EVENT, object_id: "9001", owner_id: "4242", subscription_id: "77" })
    ).toMatchObject({ objectId: "9001", ownerId: 4242, subscriptionId: 77 });
  });

  test.each([
    ["no body", null],
    ["a string", "event"],
    ["an array", [EVENT]],
    ["no owner", { ...EVENT, owner_id: undefined }],
    ["an owner of 0", { ...EVENT, owner_id: 0 }],
    ["an owner of true", { ...EVENT, owner_id: true }],
    ["a blank owner", { ...EVENT, owner_id: "" }],
    ["no subscription", { ...EVENT, subscription_id: null }],
    ["a fractional subscription", { ...EVENT, subscription_id: 7.5 }],
    ["a negative owner", { ...EVENT, owner_id: -4 }],
    ["an owner in words", { ...EVENT, owner_id: "4242 or so" }]
  ])("%s is no event", (_label, body) => {
    expect(readEvent(body)).toBeNull();
  });

  test.each([
    ["absent", undefined],
    ["true", true],
    ["0", 0],
    ["words", "../athlete"],
    ["too large to be exact", 2 ** 60],
    ["digits too large to be exact", "9999999999999999"]
  ])("an object id that is %s is none", (_label, object_id) => {
    expect(readEvent({ ...EVENT, object_id }).objectId).toBeNull();
  });

  test("the types are text, cut short, and blank when they are not", () => {
    expect(readEvent({ ...EVENT, object_type: 5, aspect_type: null })).toMatchObject({
      objectType: "",
      aspectType: ""
    });
    expect(readEvent({ ...EVENT, object_type: "x".repeat(100) }).objectType).toHaveLength(20);
  });
});
