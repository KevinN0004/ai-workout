import { describe, expect, test } from "vitest";
import { buildGenerationEquipmentContext } from "../generateRoutes.js";

describe("buildGenerationEquipmentContext", () => {
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
