/**
 * The planner profiles every plan-quality eval run generates for, each with all
 * eight planner fields. The first eight are Phase 4's capture, whose answers are
 * saved as server/src/services/dashboard/__tests__/fixtures/plans/<name>.txt.
 */

/** The ten profiles, in the order a run generates them. */
export const PROFILES = [
  {
    name: "01-home-bodyweight-3d",
    goal: "Build lean strength and energy",
    environment: "Home",
    equipment: ["Bodyweight only"],
    level: "Beginner",
    days: 3,
    duration: 30,
    injuries: "None",
    focuses: ["Strength"]
  },
  {
    name: "02-commercial-full-5d",
    goal: "Build lean strength and energy",
    environment: "Commercial",
    equipment: ["Full gym access"],
    level: "Intermediate",
    days: 5,
    duration: 60,
    injuries: "None",
    focuses: ["Strength"]
  },
  {
    name: "03-home-dumbbells-4d-knee",
    goal: "Fat loss + conditioning",
    environment: "Home",
    equipment: ["Dumbbells", "Adjustable bench", "Yoga mat"],
    level: "Intermediate",
    days: 4,
    duration: 45,
    injuries: "Knee",
    focuses: ["Weight Loss", "Cardio"]
  },
  {
    name: "04-commercial-strength-6d-lowerback",
    goal: "Build lean strength and energy",
    environment: "Commercial",
    equipment: ["Strength floor", "Cardio deck"],
    level: "Advanced",
    days: 6,
    duration: 75,
    injuries: "Lower back",
    focuses: ["Strength"]
  },
  {
    name: "05-home-bands-2d-shoulder",
    goal: "Mobility",
    environment: "Home",
    equipment: ["Resistance bands", "Yoga mat"],
    level: "Beginner",
    days: 2,
    duration: 20,
    injuries: "Shoulder",
    focuses: ["Mobility", "Recovery"]
  },
  {
    name: "06-commercial-cardio-3d",
    goal: "Cardio",
    environment: "Commercial",
    equipment: ["Cardio deck", "Functional training zone"],
    level: "Beginner",
    days: 3,
    duration: 45,
    injuries: "None",
    focuses: ["Cardio"]
  },
  {
    name: "07-home-kettlebell-7d-wrist",
    goal: "Fat loss + conditioning",
    environment: "Home",
    equipment: ["Kettlebell", "Pull-up bar"],
    level: "Advanced",
    days: 7,
    duration: 40,
    injuries: "Wrist/Elbow",
    focuses: ["Weight Loss", "Strength"]
  },
  {
    name: "08-commercial-recovery-1d-hip",
    goal: "Recovery",
    environment: "Commercial",
    equipment: ["Recovery & mobility zone", "Pool / aquatic center"],
    level: "Intermediate",
    days: 1,
    duration: 30,
    injuries: "Hip",
    focuses: ["Recovery", "Mobility"]
  },
  {
    name: "09-home-bodyweight-5d-knee",
    goal: "Build lean strength and energy",
    environment: "Home",
    equipment: ["Bodyweight only"],
    level: "Intermediate",
    days: 5,
    duration: 45,
    injuries: "Knee",
    focuses: ["Strength"]
  },
  {
    name: "10-commercial-full-4d-shoulder",
    goal: "Build lean strength and energy",
    environment: "Commercial",
    equipment: ["Full gym access"],
    level: "Intermediate",
    days: 4,
    duration: 60,
    injuries: "Shoulder",
    focuses: ["Strength"]
  }
];
