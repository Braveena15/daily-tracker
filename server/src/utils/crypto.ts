// Encrypts private text (diary, thought logs) with AES-256-GCM before it is stored.
//
// - AES-256: the text is scrambled with a 256-bit secret key. Without the key it can't be read.
// - GCM mode also adds an "auth tag": a fingerprint of the encrypted data. If anyone changes even
//   one character of the stored value, decryption fails instead of returning garbage.
// - A new random IV (starting value) is used for every value, so the same text encrypted twice
//   looks completely different and patterns can't be spotted.
//
// Stored format: "iv:authTag:ciphertext", each part base64.
// These functions take the key as an argument so they can be tested without the app's settings.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // the recommended IV size for GCM
const TAG_BYTES = 16;

/** Turns the 64-character hex key into 32 bytes, or throws if it isn't a valid key. */
export function parseKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Encryption key must be exactly 64 hex characters (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptWithKey(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64")).join(":");
}

/** Throws if the value was changed, is malformed, or was encrypted with a different key. */
export function decryptWithKey(key: Buffer, stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 3) throw new Error("Encrypted value is malformed");
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64")) as [Buffer, Buffer, Buffer];
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error("Encrypted value is malformed");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export type FieldCrypto = {
  encrypt: (plaintext: string) => string;
  decrypt: (stored: string) => string;
  /** Decrypts, or returns null if the value can't be read (wrong key or damaged). */
  tryDecrypt: (stored: string | null | undefined) => string | null;
};

export function createFieldCrypto(hexKey: string): FieldCrypto {
  const key = parseKey(hexKey);
  return {
    encrypt: (plaintext) => encryptWithKey(key, plaintext),
    decrypt: (stored) => decryptWithKey(key, stored),
    tryDecrypt: (stored) => {
      if (stored == null) return null;
      try {
        return decryptWithKey(key, stored);
      } catch {
        return null;
      }
    },
  };
}
