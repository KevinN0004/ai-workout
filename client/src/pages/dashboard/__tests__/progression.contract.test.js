import { describe, expect, test } from "vitest";
import { deloadSets, liftKeyOf } from "../planUtils";
import {
  deloadSets as serverDeloadSets,
  liftKeyOf as serverLiftKeyOf
} from "../../../../../server/src/services/planning/progression.js";

// The client opens a deload week's cards and finds a prescription's lift in
// the week's progression (roadmap B4) with its own copies of two server rules,
// because the client may import server modules only in tests. These hold the
// copies to the server's.

describe("the client's progression rules agree with the server's", () => {
  test.each(Array.from({ length: 10 }, (_, index) => index + 1))("deloadSets(%i)", (sets) => {
    expect(deloadSets(sets)).toBe(serverDeloadSets(sets));
  });

  test.each(["Dumbbell box squat", "  Seated CABLE Row ", "Push-up", "", null, undefined])(
    "liftKeyOf(%j)",
    (name) => {
      expect(liftKeyOf(name)).toBe(serverLiftKeyOf(name));
    }
  );
});
