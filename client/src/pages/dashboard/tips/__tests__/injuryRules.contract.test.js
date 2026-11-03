import { describe, expect, test } from "vitest";
import { injuryOptions } from "../../../../app/constants";
import { buildInjuryText, detectInjuryFlags } from "../recommendationUtils";
import {
  buildInjuryText as serverBuildInjuryText,
  detectInjuryAreas
} from "../../../../../../server/src/services/planning/injuryRules.js";

// The Guides view and the plan generator read an injury note with two copies of
// the same rules: this one, which also scores wger exercises, and the server's
// services/planning/injuryRules.js, which the generator cannot share with the
// client. Each case here must give both copies the same areas, so a name form
// added on one side and not the other fails the suite.

const clientAreas = (text) => detectInjuryFlags(text).map((flag) => flag.injury);

const NOTES = [
  "sore knee after running",
  "My SHOULDER hurts",
  "bad knee and a sore wrist",
  "lower back pain",
  "lower backache",
  "lower backaches",
  "lower back and upper back",
  "upper back pain, then lower back",
  "lower back; knee",
  "sore knees",
  "kneecap",
  "kneecaps",
  "kneeling hurts",
  "kneel",
  "my hips ache",
  "hipbone bruise",
  "hipbones",
  "backache",
  "backaches",
  "backs",
  "lowerback pain",
  "upperback stiffness",
  "shoulders tight",
  "sore wrists",
  "tennis elbows",
  "elbow",
  "relationship stress",
  "championship prep",
  "feedback welcome",
  "comeback after a setback",
  "",
  "feeling great today"
];

const NO_INJURY_NOTES = [
  "None",
  "No injuries",
  "no injury",
  "No injuries.",
  "Nothing",
  "Nope",
  "n/a.",
  "No known injuries",
  "No current injuries",
  "No limitations",
  "No injuries or limitations",
  "Injury-free",
  "  no   injuries  ",
  "No injuries except a sore knee",
  "Left knee, otherwise none",
  "Nothing major, lower back twinges"
];

describe("the injury rules, client and server", () => {
  test.each(injuryOptions.map((option) => [option]))(
    "read the planner option %j as the same areas",
    (option) => {
      expect(detectInjuryAreas(serverBuildInjuryText(option, ""))).toEqual(
        clientAreas(buildInjuryText(option, ""))
      );
    }
  );

  test.each(NOTES.map((note) => [note]))("read the note %j as the same areas", (note) => {
    expect(detectInjuryAreas(note)).toEqual(clientAreas(note));
  });

  test.each(NO_INJURY_NOTES.map((note) => [note]))(
    "build the same injury text from the note %j",
    (note) => {
      expect(serverBuildInjuryText("None", note)).toBe(buildInjuryText("None", note));
      expect(serverBuildInjuryText(note, "")).toBe(buildInjuryText(note, ""));
    }
  );

  test("agree that the planner's options name every area but the plain back", () => {
    const areas = new Set(
      injuryOptions.flatMap((option) => detectInjuryAreas(serverBuildInjuryText(option, "")))
    );

    expect([...areas].sort()).toEqual(["elbow", "hip", "knee", "lower back", "shoulder", "wrist"]);
  });
});
