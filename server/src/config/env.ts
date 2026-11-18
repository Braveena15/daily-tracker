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
