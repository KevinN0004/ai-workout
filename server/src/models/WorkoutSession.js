import mongoose from "mongoose";

const workoutSessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, trim: true },
    id: { type: String, required: true, trim: true },
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
  { versionKey: false }
);

workoutSessionSchema.index({ userId: 1, id: 1 }, { unique: true });
workoutSessionSchema.index({ userId: 1, createdAt: -1 });
workoutSessionSchema.index({ userId: 1, date: -1 });

const WorkoutSession =
  mongoose.models.WorkoutSession || mongoose.model("WorkoutSession", workoutSessionSchema);

export default WorkoutSession;
