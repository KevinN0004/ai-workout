import mongoose from "mongoose";

const progressMetricSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, trim: true },
    id: { type: String, required: true, trim: true },
    date: { type: String, trim: true },
    weightLb: { type: Number, default: null },
    bodyFatPct: { type: Number, default: null },
    waistCm: { type: Number, default: null },
    restingHr: { type: Number, default: null },
    notes: { type: String, trim: true },
    loggedAt: { type: String, trim: true }
  },
  { versionKey: false }
);

progressMetricSchema.index({ userId: 1, id: 1 }, { unique: true });
progressMetricSchema.index({ userId: 1, loggedAt: -1 });
progressMetricSchema.index({ userId: 1, date: -1 });

const ProgressMetric =
  mongoose.models.ProgressMetric || mongoose.model("ProgressMetric", progressMetricSchema);

export default ProgressMetric;
