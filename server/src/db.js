import mongoose from "mongoose";

const defaultMongoUri = "mongodb://127.0.0.1:27017/ai_workout_backend";

export const connectDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI || defaultMongoUri;
  await mongoose.connect(mongoUri);
  return { mongoUri };
};
