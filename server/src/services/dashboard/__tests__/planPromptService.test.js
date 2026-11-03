import { describe, expect, test } from "vitest";
import {
  DEFAULT_GEMINI_MODEL,
  SYSTEM_INSTRUCTION,
  buildGenerationEquipmentContext,
  buildPlanPrompt
} from "../planPromptService.js";

// The prompt every generated plan is asked with: the system instruction, the
// client-data block, and the equipment lines inside it. The generate route sends
// it, and its tests check what reaches the model; these pin the text itself.

describe("buildGenerationEquipmentContext", () => {
  describe("a home setup", () => {
    test("turns the selected kit into capabilities the model can use", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Home",
        equipment: ["Dumbbells", "Pull-up bar"]
      });

      expect(context.capabilityLine).toContain("dumbbells");
      expect(context.capabilityLine).toContain("pull-up bar");
      expect(context.profileLine).toBe("Dumbbells, Pull-up bar");
    });

    // The labels come back as the user wrote them; only the lookup is
    // lowercased.
    test("matches the kit regardless of case", () => {
      const context = buildGenerationEquipmentContext({
        environment: "home",
        equipment: ["  DUMBBELLS  "]
      });

      expect(context.capabilityLine).toContain("dumbbells");
    });

    test("assumes bodyweight when nothing was selected", () => {
      const context = buildGenerationEquipmentContext({ environment: "Home", equipment: [] });

      expect(context.profileLine).toBe("Bodyweight only");
      expect(context.capabilityLine).toContain("bodyweight training");
    });

    test("ignores kit it does not recognise", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Home",
        equipment: ["Moon boots"]
      });

      // Still named in the profile, but contributes no capabilities.
      expect(context.profileLine).toBe("Moon boots");
      expect(context.capabilityLine).toContain("bodyweight training");
    });

    test("does not repeat a capability two items share", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Home",
        equipment: ["Dumbbells", "Dumbbells"]
      });

      const hints = context.capabilityLine.split(", ");
      expect(new Set(hints).size).toBe(hints.length);
    });

    test.each([
      ["equipment is missing", { environment: "Home" }],
      ["equipment is not a list", { environment: "Home", equipment: "Dumbbells" }],
      ["nothing is given", {}]
    ])("still produces a usable context when %s", (_label, input) => {
      const context = buildGenerationEquipmentContext(input);

      expect(context.profileLine).toBeTruthy();
      expect(context.capabilityLine).toBeTruthy();
      expect(context.planningGuidance).toBeTruthy();
    });
  });

  describe("a commercial gym", () => {
    test("programs only the rooms that were listed", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Commercial",
        equipment: ["Cardio deck"]
      });

      expect(context.capabilityLine).toContain("treadmills");
      expect(context.capabilityLine).not.toContain("barbells and racks");
      expect(context.planningGuidance).toMatch(/only with the listed/i);
    });

    // "Full gym access" is a shorthand for every room, so the model is told
    // about all of them rather than the single label.
    test("expands full gym access to every room", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Commercial",
        equipment: ["Full gym access"]
      });

      expect(context.capabilityLine).toContain("barbells and racks");
      expect(context.capabilityLine).toContain("treadmills");
      expect(context.capabilityLine).toContain("lap swimming");
      expect(context.planningGuidance).toMatch(/full gym access/i);
    });

    test("keeps the other rooms when full access is listed alongside them", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Commercial",
        equipment: ["Full gym access", "Strength floor"]
      });

      expect(context.capabilityLine).toContain("barbells and racks");
      const hints = context.capabilityLine.split(", ");
      expect(new Set(hints).size).toBe(hints.length);
    });

    test("still recognises the older room labels", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Commercial",
        equipment: ["Barbell + plates", "Smith machine"]
      });

      expect(context.capabilityLine).toContain("barbells and racks");
      expect(context.capabilityLine).toContain("smith machine variations");
    });

    test("falls back to standard gym capabilities when nothing was listed", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Commercial",
        equipment: []
      });

      expect(context.profileLine).toMatch(/unspecified/i);
      expect(context.capabilityLine).toMatch(/standard strength and cardio/i);
    });

    // Anything that is not "commercial" is treated as a home setup, so a typo
    // in the environment quietly changes which map is used.
    test("treats an unrecognised environment as a home setup", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Commerical",
        equipment: ["Cardio deck"]
      });

      expect(context.capabilityLine).not.toContain("treadmills");
      expect(context.planningGuidance).toMatch(/home setup/i);
    });
  });

  describe("its three lines", () => {
    test("expands commercial full gym access to broad capabilities", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Commercial",
        equipment: ["Full gym access"]
      });

      expect(context.profileLine).toMatch(/full gym access/i);
      expect(context.capabilityLine).toMatch(/barbells and racks/i);
      expect(context.capabilityLine).toMatch(/lap swimming/i);
      expect(context.planningGuidance).toMatch(/across all gym rooms and operations/i);
    });

    test("uses selected commercial rooms/operations when full access is not selected", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Commercial",
        equipment: ["Strength floor", "Cardio deck"]
      });

      expect(context.profileLine).toBe("Strength floor, Cardio deck");
      expect(context.capabilityLine).toMatch(/barbells and racks/i);
      expect(context.capabilityLine).toMatch(/treadmills/i);
      expect(context.capabilityLine).not.toMatch(/lap swimming/i);
      expect(context.planningGuidance).toMatch(/listed commercial rooms and operations/i);
    });

    test("falls back to home bodyweight defaults for empty home setup", () => {
      const context = buildGenerationEquipmentContext({
        environment: "Home",
        equipment: []
      });

      expect(context.profileLine).toMatch(/bodyweight only/i);
      expect(context.capabilityLine).toMatch(/bodyweight training/i);
      expect(context.planningGuidance).toMatch(/listed home setup/i);
    });
  });
});

describe("buildPlanPrompt", () => {
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

  // The lines the route sent before the prompt moved here, written out by hand.
  test("writes one line per field between the fenced markers", () => {
    expect(buildPlanPrompt(fields, "abc").split("\n")).toEqual([
      "BEGIN CLIENT DATA abc (untrusted)",
      "- Goal: Build strength",
      "- Equipment/space profile: Dumbbells, Yoga mat",
      "- Session length: 45 minutes",
      "- Experience: Beginner",
      "- Injuries/limitations: Knee",
      "- Environment: Home",
      "- Focuses: Strength, Mobility",
      "- Training days target: 4",
      "- Available capabilities: dumbbells, unilateral strength work, hypertrophy accessories, yoga mat, mobility flows, recovery sessions",
      "- Planning guidance: Program for the listed home setup. Offer bodyweight-friendly substitutions when useful.",
      "END CLIENT DATA abc"
    ]);
  });

  test("names general fitness when no focus is chosen", () => {
    expect(buildPlanPrompt({ ...fields, focuses: [] }, "abc")).toContain(
      "\n- Focuses: General fitness\n"
    );
  });

  test("builds the equipment lines from the environment and equipment", () => {
    const prompt = buildPlanPrompt(
      { ...fields, environment: "Commercial", equipment: ["Cardio deck"] },
      "abc"
    );

    expect(prompt).toContain("\n- Equipment/space profile: Cardio deck\n");
    expect(prompt).toContain("treadmills");
    expect(prompt).toContain(
      "\n- Planning guidance: Program only with the listed commercial rooms and operations.\n"
    );
  });
});

describe("SYSTEM_INSTRUCTION and the default model", () => {
  test("asks for the weekday headings and Coach Notes the parser reads", () => {
    expect(SYSTEM_INSTRUCTION).toContain(
      "Use weekday headings exactly as: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday."
    );
    expect(SYSTEM_INSTRUCTION).toContain('End with a section labeled "Coach Notes:"');
  });

  test("defaults to gemini-3.5-flash-lite", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
  });
});
