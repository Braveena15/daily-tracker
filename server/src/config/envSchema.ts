// The environment variables the server needs, and the rules for them. No side effects here
// (config/env.ts loads and checks the real environment), so the rules can be unit tested.
import { z } from "zod";

// Every environment variable the server needs, checked once at startup.
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Render sets PORT itself
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z
    .string({ error: "MONGODB_URI is required (your MongoDB Atlas connection string)" })
    .min(1, "MONGODB_URI is required (your MongoDB Atlas connection string)"),
  JWT_SECRET: z
    .string({ error: "JWT_SECRET is required" })
    .min(32, "JWT_SECRET must be at least 32 characters long. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""),
  ALLOW_REGISTRATION: z.string().default("false"),
  // Development only: the Vite dev server's address, allowed by CORS. In production the server
  // serves the client itself (same origin), so it isn't needed.
  CLIENT_URL: z.url({ error: "CLIENT_URL must be a full URL, for example http://localhost:5173" }).optional(),
  // 32 random bytes as 64 hex characters. Encrypts diary and thought-log text. Losing it loses that text.
  DIARY_ENCRYPTION_KEY: z
    .string({ error: "DIARY_ENCRYPTION_KEY is required" })
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "DIARY_ENCRYPTION_KEY must be exactly 64 hex characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    ),

  // AI encouragement. Required in production; optional in development, where AI features
  // show pre-written messages without a key.
  GEMINI_API_KEY: z.string().trim().optional().transform((v) => v || undefined),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-2.5-flash"),
  // "minimal": only numbers and categories are sent. "full": thought-log text too (never private logs or the diary).
  AI_DATA_MODE: z.enum(["minimal", "full"], { error: 'AI_DATA_MODE must be "minimal" or "full"' }).default("minimal"),
  // AI calls per user per day. Left empty means the default (an empty value isn't read as 0).
  AI_DAILY_LIMIT: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.coerce.number().int().min(0).max(1000).default(20)),

  // Public demo deployment (its own database): "true" adds "Try the demo" with temporary seeded
  // accounts, turns off the AI, Apple Health sync and data deletion. Anything else: no demo at all.
  DEMO_MODE: z.string().default("false"),
  // Demo only: the GitHub repository linked from the demo banner and footer
  DEMO_REPO_URL: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.url({ error: "DEMO_REPO_URL must be a full URL" }).optional()),
});

// Must be set explicitly in production (no silent defaults there)
const REQUIRED_IN_PRODUCTION: Record<string, string> = {
  GEMINI_API_KEY: "GEMINI_API_KEY is required in production (your Google AI Studio API key)",
  GEMINI_MODEL: 'GEMINI_MODEL is required in production, e.g. "gemini-2.5-flash"',
  AI_DATA_MODE: 'AI_DATA_MODE is required in production: "minimal" or "full"',
};
const REQUIRED_IN_DEVELOPMENT: Record<string, string> = {
  CLIENT_URL: "CLIENT_URL is required in development (the Vite dev server, e.g. http://localhost:5173)",
};

/** Every problem with the environment as a readable line: names and rules only, never the values. */
export function envProblems(source: Record<string, string | undefined>): string[] {
  const result = envSchema.safeParse(source);
  const problems = result.success ? [] : result.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`);
  const mode = source.NODE_ENV ?? "development";
  // The demo never calls the AI, so it needs no Gemini settings
  const production = source.DEMO_MODE === "true" ? {} : REQUIRED_IN_PRODUCTION;
  const required = mode === "production" ? production : mode === "development" ? REQUIRED_IN_DEVELOPMENT : {};
  for (const [key, message] of Object.entries(required)) {
    const reported = problems.some((p) => p.startsWith(`${key}:`));
    if (!source[key]?.trim() && !reported) problems.push(`${key}: ${message}`);
  }
  return problems;
}
