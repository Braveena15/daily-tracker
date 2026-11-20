// Tokens for Apple Health sync (an iOS Shortcut sends one in "Authorization: Bearer <token>").
//
// - The token is 32 random bytes, so it can't be guessed.
// - Only its SHA-256 hash is stored. If the database ever leaked, the hashes couldn't be used
//   to sync, and a hash can't be turned back into the token.
// - A plain (fast) hash is fine here, unlike passwords: the token is fully random, so there's
//   nothing to guess with a dictionary.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SYNC_TOKEN_PREFIX = "dt_";
const TOKEN_BYTES = 32;
// "dt_" + 43 base64url characters
const TOKEN_PATTERN = /^dt_[A-Za-z0-9_-]{43}$/;

/** A new random token, e.g. "dt_Xk3…". Show it to the user once; store only hashSyncToken(token). */
export function generateSyncToken(): string {
  return SYNC_TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("base64url");
}

/** SHA-256 of the token, as 64 hex characters. */
export function hashSyncToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** True if the text looks like one of our tokens (checked before touching the database). */
export function looksLikeSyncToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/**
 * Compares a token with a stored hash in constant time, so the time taken doesn't reveal
 * how many characters matched.
 */
export function verifySyncToken(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const actual = Buffer.from(hashSyncToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The token from an "Authorization: Bearer <token>" header, or null. */
export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return match ? match[1]! : null;
}
