import mongoose from "mongoose";

const mealLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, trim: true },
    id: { type: String, required: true, trim: true },
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
  { versionKey: false }
);

mealLogSchema.index({ userId: 1, id: 1 }, { unique: true });
mealLogSchema.index({ userId: 1, loggedAt: -1 });
mealLogSchema.index({ userId: 1, date: -1 });

const MealLog = mongoose.models.MealLog || mongoose.model("MealLog", mealLogSchema);

export default MealLog;
