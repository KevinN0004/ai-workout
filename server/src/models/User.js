import mongoose from "mongoose";

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
    salt: { type: String, required: true },
    hash: { type: String, required: true },
    createdAt: { type: String, required: true },
    profile: { type: mongoose.Schema.Types.Mixed, default: undefined },
    dashboard: { type: mongoose.Schema.Types.Mixed, default: undefined }
  },
  { versionKey: false }
);

export default mongoose.model("User", userSchema);
