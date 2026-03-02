import { beforeEach, describe, expect, test, vi } from "vitest";

const connectMock = vi.fn();

vi.mock("mongoose", () => ({
  default: {
    connect: connectMock
  }
}));

describe("connectDatabase", () => {
  beforeEach(() => {
    connectMock.mockReset();
    delete process.env.MONGODB_URI;
  });

  test("uses default local Mongo URI when env is not set", async () => {
    const { connectDatabase } = await import("./db.js");

    const result = await connectDatabase();

    expect(connectMock).toHaveBeenCalledWith("mongodb://127.0.0.1:27017/ai_workout_backend");
    expect(result).toEqual({
      mongoUri: "mongodb://127.0.0.1:27017/ai_workout_backend"
    });
  });

  test("uses MONGODB_URI from environment when provided", async () => {
    process.env.MONGODB_URI = "mongodb://example-host:27017/test_db";
    const { connectDatabase } = await import("./db.js");

    const result = await connectDatabase();

    expect(connectMock).toHaveBeenCalledWith("mongodb://example-host:27017/test_db");
    expect(result).toEqual({
      mongoUri: "mongodb://example-host:27017/test_db"
    });
  });
});
