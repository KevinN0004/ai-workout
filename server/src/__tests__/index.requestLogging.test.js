import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

// What the app's real logger writes for a weather request that carries the
// visitor's coordinates: the request line from requestContext.js and the
// rate-limit line from index.js, through the app index.js builds. pino is the
// real one, wrapped only so it writes to an array instead of stdout.
//
// The coordinates are out of range, so the route answers 400 from validation
// and never reaches Open-Meteo; the log lines are written either way.

const { lines } = vi.hoisted(() => ({ lines: [] }));

vi.mock("pino", async (importOriginal) => {
  const actual = await importOriginal();
  const realPino = actual.default;
  const sink = { write: (line) => lines.push(JSON.parse(line)) };
  const capturing = (options) => realPino(options, sink);
  capturing.stdTimeFunctions = realPino.stdTimeFunctions;
  return { ...actual, default: capturing };
});

const WEATHER_PATH = "/api/weather/recommendation";
const WEATHER_URL = `${WEATHER_PATH}?latitude=140.712776&longitude=-74.005974`;

// Assigned, never deleted, before the import: index.js calls dotenv.config()
// at module scope, and dotenv fills in a key that is absent.
const ENV = { LOG_LEVEL: "info", API_RATE_LIMIT_MAX: "1" };

let server;
let baseUrl;

beforeAll(async () => {
  vi.resetModules();
  const previous = Object.fromEntries(Object.keys(ENV).map((key) => [key, process.env[key]]));
  Object.assign(process.env, ENV);
  let app;
  try {
    ({ app } = await import("../index.js"));
  } finally {
    // Assigning undefined stores the string "undefined", so an absent key is
    // deleted rather than assigned back.
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(() => resolve()));
});

describe("request logging in index.js", () => {
  test("no log line keeps the coordinates a weather request carries", async () => {
    const first = await fetch(`${baseUrl}${WEATHER_URL}`);
    const limited = await fetch(`${baseUrl}${WEATHER_URL}`);

    expect(first.status).toBe(400);
    expect(limited.status).toBe(429);

    const requestLines = lines.filter((line) => line.event === "http_request");
    const limitLines = lines.filter((line) => line.event === "rate_limited");
    expect(requestLines.map((line) => line.path)).toEqual([WEATHER_PATH, WEATHER_PATH]);
    expect(limitLines.map((line) => line.path)).toEqual([WEATHER_PATH]);
    for (const line of lines) {
      expect(JSON.stringify(line)).not.toMatch(/latitude|longitude|140\.71|74\.00/);
    }
  });
});
