import mongoose from "mongoose";

const workoutEntrySchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    date: { type: String, trim: true },
    focus: { type: String, trim: true },
    duration: { type: Number, default: null },
    exercises: { type: [String], default: [] },
    sets: { type: Number, default: null },
    reps: { type: Number, default: null },
    intensityRpe: { type: Number, default: null },
    notes: { type: String, trim: true },
    createdAt: { type: String, trim: true }
  },
  { _id: false }
);

const calorieEntrySchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    date: { type: String, trim: true },
    calories: { type: Number, default: null },
    source: { type: String, trim: true },
    updatedAt: { type: String, trim: true }
  },
  { _id: false }
);

const mealLogSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    date: { type: String, trim: true },
    mealType: { type: String, trim: true },
    name: { type: String, trim: true },
    calories: { type: Number, default: null },
    proteinG: { type: Number, default: null },
    carbsG: { type: Number, default: null },
    fatG: { type: Number, default: null },
    notes: { type: String, trim: true },
    loggedAt: { type: String, trim: true }
  },
  { _id: false }
);

const progressMetricSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    date: { type: String, trim: true },
    weightLb: { type: Number, default: null },
    bodyFatPct: { type: Number, default: null },
    waistCm: { type: Number, default: null },
    restingHr: { type: Number, default: null },
    notes: { type: String, trim: true },
    loggedAt: { type: String, trim: true }
  },
  { _id: false }
);

const savedExerciseSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    exerciseId: { type: Number, default: null },
    name: { type: String, trim: true },
    category: { type: String, trim: true },
    muscles: { type: [String], default: [] },
    equipment: { type: [String], default: [] },
    imageUrl: { type: String, trim: true },
    videoUrl: { type: String, trim: true },
    reason: { type: String, trim: true },
    source: { type: String, trim: true },
    savedAt: { type: String, trim: true }
  },
  { _id: false }
);

const goalsSchema = new mongoose.Schema(
  {
    targetWeight: { type: Number, default: 160 },
    targetCalories: { type: Number, default: 2200 },
    weeklyWorkouts: { type: Number, default: 3 }
  },
  { _id: false }
);

const planEntrySchema = new mongoose.Schema(
  {
    id: { type: String, trim: true },
    createdAt: { type: String, trim: true },
    goal: { type: String, trim: true },
    equipment: { type: [String], default: [] },
    duration: { type: Number, default: null },
    level: { type: String, trim: true },
    injuries: { type: String, trim: true },
    days: { type: Number, default: null },
    environment: { type: String, trim: true },
    focuses: { type: [String], default: [] },
    plan: { type: String, trim: true }
  },
  { _id: false }
);

const profileSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    name: { type: String, trim: true },
    age: { type: Number, default: null },
    heightCm: { type: Number, default: null },
    weightKg: { type: Number, default: null },
    sex: { type: String, trim: true },
    bodyFat: { type: Number, default: null },
    activity: { type: String, trim: true },
    notes: { type: String, trim: true },
    updatedAt: { type: String, trim: true }
  },
  { _id: false }
);

const dashboardSchema = new mongoose.Schema(
  {
    workouts: { type: [workoutEntrySchema], default: [] },
    workoutSessions: { type: [workoutEntrySchema], default: [] },
    calories: { type: [calorieEntrySchema], default: [] },
    mealLogs: { type: [mealLogSchema], default: [] },
    progressMetrics: { type: [progressMetricSchema], default: [] },
    plans: { type: [planEntrySchema], default: [] },
    savedExercises: { type: [savedExerciseSchema], default: [] },
    goals: { type: goalsSchema, default: () => ({}) }
  },
  { _id: false, strict: false }
);

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true
    },
    salt: {
      type: String,
      default: "",
      required() {
        return (this.passwordAlgo || "pbkdf2") === "pbkdf2";
      }
    },
    hash: { type: String, required: true },
    passwordAlgo: {
      type: String,
      required: true,
      enum: ["pbkdf2", "argon2id"],
      default: "pbkdf2"
    },
    createdAt: { type: String, required: true },
    profile: { type: profileSchema, default: undefined },
    dashboard: { type: dashboardSchema, default: undefined }
  },
  { versionKey: false }
);

export default mongoose.model("User", userSchema);
