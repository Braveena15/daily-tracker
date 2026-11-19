/// <reference types="vitest/globals" />
import { createFieldCrypto, decryptWithKey, encryptWithKey, parseKey } from "./crypto";

const HEX = "0f".repeat(32);
const key = parseKey(HEX);

describe("parseKey", () => {
  it("accepts 64 hex characters", () => {
    expect(parseKey(HEX)).toHaveLength(32);
  });

  it("rejects anything else", () => {
    expect(() => parseKey("abc")).toThrow();
    expect(() => parseKey("zz".repeat(32))).toThrow();
    expect(() => parseKey("0f".repeat(33))).toThrow();
  });
});

describe("encrypt / decrypt", () => {
  it("round-trips text, including emoji and long text", () => {
    for (const text of ["Hello", "A hard day 💜 — but I got through it.", "x".repeat(20_000)]) {
      expect(decryptWithKey(key, encryptWithKey(key, text))).toBe(text);
    }
  });

  it("round-trips an empty string", () => {
    const stored = encryptWithKey(key, "");
    expect(stored.split(":")).toHaveLength(3);
    expect(decryptWithKey(key, stored)).toBe("");
  });

  it("stores iv:authTag:ciphertext and never the plain text", () => {
    const stored = encryptWithKey(key, "my secret");
    expect(stored).not.toContain("my secret");
    const [iv, tag] = stored.split(":");
    expect(Buffer.from(iv!, "base64")).toHaveLength(12);
    expect(Buffer.from(tag!, "base64")).toHaveLength(16);
  });

  it("gives a different result each time (random IV)", () => {
    expect(encryptWithKey(key, "same")).not.toBe(encryptWithKey(key, "same"));
  });

  it("fails if the data was tampered with", () => {
    const [iv, tag, ciphertext] = encryptWithKey(key, "do not change me").split(":") as [string, string, string];
    const bytes = Buffer.from(ciphertext, "base64");
    bytes[0] = bytes[0]! ^ 1; // flip one bit
    expect(() => decryptWithKey(key, [iv, tag, bytes.toString("base64")].join(":"))).toThrow();

    const badTag = Buffer.from(tag, "base64");
    badTag[0] = badTag[0]! ^ 1;
    expect(() => decryptWithKey(key, [iv, badTag.toString("base64"), ciphertext].join(":"))).toThrow();
  });

  it("fails with a different key", () => {
    const stored = encryptWithKey(key, "private");
    expect(() => decryptWithKey(parseKey("1a".repeat(32)), stored)).toThrow();
  });

  it("rejects malformed values", () => {
    expect(() => decryptWithKey(key, "not-encrypted")).toThrow();
    expect(() => decryptWithKey(key, "a:b:c")).toThrow();
  });
});

describe("createFieldCrypto", () => {
  it("tryDecrypt returns null instead of throwing", () => {
    const crypto = createFieldCrypto(HEX);
    expect(crypto.tryDecrypt(crypto.encrypt("hi"))).toBe("hi");
    expect(crypto.tryDecrypt("garbage")).toBeNull();
    expect(crypto.tryDecrypt(undefined)).toBeNull();
  });
});
