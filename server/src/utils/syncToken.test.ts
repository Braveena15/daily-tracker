import {
  bearerToken,
  generateSyncToken,
  hashSyncToken,
  looksLikeSyncToken,
  verifySyncToken,
} from "./syncToken";

describe("generateSyncToken", () => {
  it('starts with "dt_" and carries 32 random bytes', () => {
    const token = generateSyncToken();
    expect(token.startsWith("dt_")).toBe(true);
    expect(Buffer.from(token.slice(3), "base64url")).toHaveLength(32);
    expect(looksLikeSyncToken(token)).toBe(true);
  });

  it("is different every time", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateSyncToken));
    expect(tokens.size).toBe(50);
  });
});

describe("hashSyncToken", () => {
  it("is a 64-character SHA-256 hex digest that never contains the token", () => {
    const token = generateSyncToken();
    const hash = hashSyncToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token.slice(3));
  });

  it("is stable for the same token and differs for different tokens", () => {
    expect(hashSyncToken("dt_abc")).toBe(hashSyncToken("dt_abc"));
    expect(hashSyncToken("dt_abc")).not.toBe(hashSyncToken("dt_abd"));
  });

  it("matches a known SHA-256 value", () => {
    expect(hashSyncToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("verifySyncToken", () => {
  const token = generateSyncToken();
  const stored = hashSyncToken(token);

  it("accepts the right token", () => {
    expect(verifySyncToken(token, stored)).toBe(true);
  });

  it("rejects a different token, a changed character or the hash itself", () => {
    expect(verifySyncToken(generateSyncToken(), stored)).toBe(false);
    const changed = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifySyncToken(changed, stored)).toBe(false);
    expect(verifySyncToken(stored, stored)).toBe(false);
  });

  it("rejects when no token is set up, or the stored hash is malformed", () => {
    expect(verifySyncToken(token, null)).toBe(false);
    expect(verifySyncToken(token, undefined)).toBe(false);
    expect(verifySyncToken(token, "")).toBe(false);
    expect(verifySyncToken(token, "abc123")).toBe(false);
  });
});

describe("looksLikeSyncToken", () => {
  it("rejects anything that isn't dt_ + 43 base64url characters", () => {
    expect(looksLikeSyncToken("dt_short")).toBe(false);
    expect(looksLikeSyncToken("xx_" + "a".repeat(43))).toBe(false);
    expect(looksLikeSyncToken("dt_" + "a".repeat(42) + "=")).toBe(false);
    expect(looksLikeSyncToken("dt_" + "a".repeat(43))).toBe(true);
  });
});

describe("bearerToken", () => {
  it("reads the token from an Authorization header", () => {
    expect(bearerToken("Bearer dt_abc")).toBe("dt_abc");
    expect(bearerToken("bearer   dt_abc  ")).toBe("dt_abc");
  });

  it("returns null for missing or other kinds of headers", () => {
    expect(bearerToken(undefined)).toBeNull();
    expect(bearerToken("")).toBeNull();
    expect(bearerToken("dt_abc")).toBeNull();
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
  });
});
