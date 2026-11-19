// AI setup. The Gemini key is read here, on the server, and never sent to the browser.
import { createGemini } from "../ai/gemini";
import { mongoAiStore } from "../ai/mongoStore";
import type { AiDeps } from "../ai/service";
import { env } from "./env";

export const aiMode = env.AI_DATA_MODE;
export const aiConfigured = Boolean(env.GEMINI_API_KEY);

export const aiDeps: AiDeps = {
  generate: env.GEMINI_API_KEY ? createGemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }) : null,
  store: mongoAiStore,
  limit: env.AI_DAILY_LIMIT,
  // Only the kind of problem ("timeout", "blocked"…), never prompts or replies — and nothing in production
  onError: (err) => {
    if (!env.isProduction) console.warn(`[ai] ${err instanceof Error ? err.message : "unknown error"}`);
  },
};
