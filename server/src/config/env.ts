import path from "node:path";
import dotenv from "dotenv";
import { envProblems, envSchema } from "./envSchema";

// Development: values come from server/.env (found from this file, so it works whether the server is
// started from server/ or from the repo root). Production (Render): from the dashboard's environment
// variables. There's no .env file there, and real environment variables always win over .env.
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const problems = envProblems(process.env);
const parsed = envSchema.safeParse(process.env);

if (problems.length > 0 || !parsed.success) {
  const where = process.env.NODE_ENV === "production" ? "the environment (on Render: your service → Environment)" : "server/.env";
  console.error(
    `❌ Missing or invalid environment variables in ${where}:\n${problems.map((p) => `  - ${p}`).join("\n")}\n\n` +
      "See server/.env.example for the full list.",
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  demoMode: parsed.data.DEMO_MODE === "true",
  // The demo only ever creates temporary demo accounts
  allowRegistration: parsed.data.ALLOW_REGISTRATION === "true" && parsed.data.DEMO_MODE !== "true",
};
