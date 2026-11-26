import { describe, expect, test } from "vitest";
import { readStravaConfig } from "../stravaConfig.js";

// Reading the Strava settings (docs/specs/2026-11-12-strava-import-design.md,
// "Settings, the server's environment"): all of the client id, the secret and a
// valid key, or no Strava at all, so a route never runs on half a configuration.

const KEY = Buffer.alloc(32).toString("base64");
const BASE = {
  STRAVA_CLIENT_ID: "12345",
  STRAVA_CLIENT_SECRET: "test-client-secret",
  STRAVA_TOKEN_KEY: KEY
};

describe("readStravaConfig", () => {
  test("no settings is no Strava", () => {
    expect(readStravaConfig({})).toBeNull();
  });

  test("the three required settings give the configuration, on Strava's own host", () => {
    const config = readStravaConfig(BASE);

    expect(config).toMatchObject({
      clientId: "12345",
      clientSecret: "test-client-secret",
      webBase: "https://www.strava.com",
      verifyToken: null,
      subscriptionId: null
    });
    expect(config?.key.length).toBe(32);
  });

  test.each(["STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_TOKEN_KEY"])(
    "without %s there is no Strava",
    (name) => {
      expect(readStravaConfig({ ...BASE, [name]: "" })).toBeNull();
      expect(readStravaConfig({ ...BASE, [name]: "   " })).toBeNull();
    }
  );

  test("a key of the wrong length is no Strava", () => {
    expect(readStravaConfig({ ...BASE, STRAVA_TOKEN_KEY: "short" })).toBeNull();
  });

  test("the values are trimmed", () => {
    expect(readStravaConfig({ ...BASE, STRAVA_CLIENT_ID: " 12345 " })?.clientId).toBe("12345");
  });

  test("STRAVA_BASE_URL replaces Strava's host, without a trailing slash", () => {
    expect(readStravaConfig({ ...BASE, STRAVA_BASE_URL: "http://127.0.0.1:5099/" })?.webBase).toBe(
      "http://127.0.0.1:5099"
    );
  });

  test("the webhook settings, when set", () => {
    const config = readStravaConfig({
      ...BASE,
      STRAVA_WEBHOOK_VERIFY_TOKEN: "verify-me",
      STRAVA_WEBHOOK_SUBSCRIPTION_ID: "678"
    });

    expect(config?.verifyToken).toBe("verify-me");
    expect(config?.subscriptionId).toBe(678);
  });

  test.each(["abc", "1.5", "-3", "0"])("a subscription id of %j is no subscription", (value) => {
    expect(
      readStravaConfig({ ...BASE, STRAVA_WEBHOOK_SUBSCRIPTION_ID: value })?.subscriptionId
    ).toBeNull();
  });
});
