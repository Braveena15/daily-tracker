/// <reference types="vitest/globals" />
import { envProblems, envSchema } from "./envSchema";

// Placeholder values for the tests only
const KEY = "ab".repeat(32);
const base = {
  MONGODB_URI: "mongodb+srv://user:pass@cluster0.example.mongodb.net/test",
  JWT_SECRET: "x".repeat(40),
  DIARY_ENCRYPTION_KEY: KEY,
};
const production = { ...base, NODE_ENV: "production", GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-2.5-flash", AI_DATA_MODE: "minimal" };
const development = { ...base, NODE_ENV: "development", CLIENT_URL: "http://localhost:5173" };

describe("envProblems", () => {
  it("accepts a complete production environment, without CLIENT_URL", () => {
    expect(envProblems(production)).toEqual([]);
  });

  it("accepts a development environment without the AI settings", () => {
    expect(envProblems(development)).toEqual([]);
  });

  it("requires the AI settings in production, with clear messages", () => {
    const { GEMINI_API_KEY: _k, GEMINI_MODEL: _m, AI_DATA_MODE: _a, ...rest } = production;
    expect(envProblems({ ...rest, GEMINI_API_KEY: "  " })).toEqual([
      "GEMINI_API_KEY: GEMINI_API_KEY is required in production (your Google AI Studio API key)",
      'GEMINI_MODEL: GEMINI_MODEL is required in production, e.g. "gemini-2.5-flash"',
      'AI_DATA_MODE: AI_DATA_MODE is required in production: "minimal" or "full"',
    ]);
  });

  it("requires CLIENT_URL in development", () => {
    const { CLIENT_URL: _c, ...rest } = development;
    expect(envProblems(rest)).toEqual([
      "CLIENT_URL: CLIENT_URL is required in development (the Vite dev server, e.g. http://localhost:5173)",
    ]);
  });

  it("explains the database, JWT and diary key rules", () => {
    const problems = envProblems({ NODE_ENV: "production", GEMINI_API_KEY: "k", GEMINI_MODEL: "m", AI_DATA_MODE: "full" });
    expect(problems).toEqual([
      "MONGODB_URI: MONGODB_URI is required (your MongoDB Atlas connection string)",
      expect.stringMatching(/^JWT_SECRET: JWT_SECRET is required/),
      expect.stringMatching(/^DIARY_ENCRYPTION_KEY: DIARY_ENCRYPTION_KEY is required/),
    ]);
    expect(envProblems({ ...production, DIARY_ENCRYPTION_KEY: "abc123" })).toEqual([
      expect.stringMatching(/^DIARY_ENCRYPTION_KEY: DIARY_ENCRYPTION_KEY must be exactly 64 hex characters/),
    ]);
    expect(envProblems({ ...production, JWT_SECRET: "short" })).toEqual([
      expect.stringMatching(/^JWT_SECRET: JWT_SECRET must be at least 32 characters/),
    ]);
    expect(envProblems({ ...production, AI_DATA_MODE: "everything" })).toEqual([
      'AI_DATA_MODE: AI_DATA_MODE must be "minimal" or "full"',
    ]);
  });

  it("treats an empty AI_DAILY_LIMIT as the default, not 0", () => {
    expect(envProblems({ ...production, AI_DAILY_LIMIT: "" })).toEqual([]);
    expect(envSchema.parse({ ...production, AI_DAILY_LIMIT: "" }).AI_DAILY_LIMIT).toBe(20);
    expect(envSchema.parse({ ...production, AI_DAILY_LIMIT: "5" }).AI_DAILY_LIMIT).toBe(5);
  });

  it("never puts a value in a message", () => {
    const secret = "SECRET_VALUE_" + "z".repeat(10);
    const problems = envProblems({ ...production, JWT_SECRET: secret.slice(0, 20), DIARY_ENCRYPTION_KEY: secret, MONGODB_URI: "" });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).not.toContain("SECRET_VALUE");
  });
});
