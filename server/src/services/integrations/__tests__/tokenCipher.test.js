import { describe, expect, test } from "vitest";
import { TokenCipherError, createTokenCipher, parseTokenKey } from "../tokenCipher.js";

// The sealing of Strava's tokens at rest (docs/specs/2026-11-12-strava-import-design.md,
// "Tokens"): a value survives the round trip, and any change to a sealed value,
// or the wrong key, fails to open rather than yielding a guess.

const KEY = Buffer.alloc(32).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 7).toString("base64");
const cipher = createTokenCipher(/** @type {Buffer} */ (parseTokenKey(KEY)));

// The sealed value with one character of part `index` changed.
const tamper = (sealed, index) => {
  const parts = sealed.split(".");
  const part = parts[index];
  parts[index] = (part[0] === "A" ? "B" : "A") + part.slice(1);
  return parts.join(".");
};

describe("createTokenCipher", () => {
  test("a sealed value opens to itself", () => {
    expect(cipher.open(cipher.seal("abc"))).toBe("abc");
    expect(cipher.open(cipher.seal(""))).toBe("");
  });

  test("two seals of one value differ, since each takes a fresh nonce", () => {
    expect(cipher.seal("abc")).not.toBe(cipher.seal("abc"));
  });

  test("a sealed value is versioned, in four dot-separated parts", () => {
    const parts = cipher.seal("abc").split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  test.each([
    ["the nonce", 1],
    ["the ciphertext", 2],
    ["the tag", 3]
  ])("a change to %s fails to open", (_name, index) => {
    const sealed = cipher.seal("a token long enough to change");
    expect(() => cipher.open(tamper(sealed, index))).toThrow(TokenCipherError);
  });

  test("a value sealed under another key fails to open", () => {
    const other = createTokenCipher(/** @type {Buffer} */ (parseTokenKey(OTHER_KEY)));
    expect(() => cipher.open(other.seal("abc"))).toThrow(TokenCipherError);
  });

  test("a sealed value under another version fails to open, though its parts are sound", () => {
    const sealed = cipher.seal("abc");
    expect(() => cipher.open(sealed.replace(/^v1\./, "v2."))).toThrow(TokenCipherError);
  });

  test.each(["v2.a.b.c", "", "v1.a.b", "plain text"])("%j is not a sealed value", (value) => {
    expect(() => cipher.open(value)).toThrow(TokenCipherError);
  });
});

describe("parseTokenKey", () => {
  test("a base64 value of 32 bytes is the key", () => {
    const key = parseTokenKey(` ${KEY} `);
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key?.length).toBe(32);
  });

  test.each([
    ["undefined", undefined],
    ["an empty string", ""],
    ["blank", "   "],
    ["a short value", "short"],
    ["31 bytes", Buffer.alloc(31).toString("base64")],
    ["33 bytes", Buffer.alloc(33).toString("base64")],
    ["a number", 32]
  ])("%s is no key", (_name, value) => {
    expect(parseTokenKey(value)).toBeNull();
  });
});
