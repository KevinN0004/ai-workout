/**
 * Seals Strava's tokens for storage with AES-256-GCM under STRAVA_TOKEN_KEY
 * (docs/specs/2026-11-12-strava-import-design.md, "Tokens"). A sealed value is
 * `v1.<nonce>.<ciphertext>.<tag>` in base64, and any change to it fails to open.
 */
// @ts-check
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

/** A sealed value that cannot be opened: malformed, tampered with, or another key's. */
export class TokenCipherError extends Error {}

/**
 * The 32-byte key that `value` holds in base64, or null when it is absent or any
 * other length. The startup check and the configuration read share it.
 * @param {unknown} value
 * @returns {Buffer | null}
 */
export const parseTokenKey = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = Buffer.from(value.trim(), "base64");
  return key.length === KEY_BYTES ? key : null;
};

/**
 * Builds `{ seal, open }` over a 32-byte key. `seal` takes a fresh nonce each
 * time; `open` throws a TokenCipherError for anything it did not seal.
 * @param {Buffer} key
 */
export const createTokenCipher = (key) => {
  /** @param {string} text */
  const seal = (text) => {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const parts = [nonce, body, cipher.getAuthTag()].map((part) => part.toString("base64"));
    return [VERSION, ...parts].join(".");
  };

  /** @param {string} sealed */
  const open = (sealed) => {
    const parts = String(sealed).split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new TokenCipherError("Unreadable token.");
    }
    try {
      const [nonce, body, tag] = parts.slice(1).map((part) => Buffer.from(part, "base64"));
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    } catch {
      throw new TokenCipherError("Unreadable token.");
    }
  };

  return { seal, open };
};
