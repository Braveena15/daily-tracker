import "dotenv/config";
import { z } from "zod";

// Every environment variable the server needs, checked once at startup.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required (your MongoDB Atlas connection string)"),
  JWT_SECRET: z
    .string({ error: "JWT_SECRET is required" })
    .min(32, "JWT_SECRET must be at least 32 characters long. Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""),
  ALLOW_REGISTRATION: z.string().default("false"),
  CLIENT_URL: z.url({ error: "CLIENT_URL must be a full URL, for example http://localhost:5173" }),
  // 32 random bytes as 64 hex characters. Encrypts diary and thought-log text. Losing it loses that text.
  DIARY_ENCRYPTION_KEY: z
    .string({ error: "DIARY_ENCRYPTION_KEY is required" })
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "DIARY_ENCRYPTION_KEY must be exactly 64 hex characters. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    ),

  // AI encouragement (optional). Without a key, AI features show pre-written messages instead.
  GEMINI_API_KEY: z.string().trim().optional().transform((v) => v || undefined),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-2.5-flash"),
  // "minimal": only numbers and categories are sent. "full": thought-log text too (never private logs or the diary).
  AI_DATA_MODE: z.enum(["minimal", "full"], { error: 'AI_DATA_MODE must be "minimal" or "full"' }).default("minimal"),
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).max(1000).default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
  console.error(`❌ Invalid environment variables in server/.env:\n${problems}\n\nSee server/.env.example for the full list.`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  allowRegistration: parsed.data.ALLOW_REGISTRATION === "true",
};
