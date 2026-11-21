// A small wrapper around Google's Gemini API. The API key is only ever used here, on the server.
// Prompts and replies are never logged.
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./prompts";

/** Per-call settings. Without them the app's shared system instruction and a plain-text reply are used. */
export type GenerateOptions = {
  /** Replaces the shared system instruction (e.g. the AI friend's voice) */
  systemInstruction?: string;
  /** Ask for a JSON reply (the caller parses and checks it); it isn't shortened */
  json?: boolean;
  /** For longer replies (default 10 s) */
  timeoutMs?: number;
};

/** Sends one prompt and returns the reply text, or throws. */
export type Generate = (prompt: string, options?: GenerateOptions) => Promise<string>;

export class AiUnavailableError extends Error {
  constructor(reason: "timeout" | "blocked" | "empty" | "failed") {
    super(`AI unavailable: ${reason}`);
    this.name = "AiUnavailableError";
  }
}

const TIMEOUT_MS = 10_000;
const MAX_REPLY_CHARS = 1500; // the prompt asks for ~120 words; this is just a safety cap
// A cap, not a target. Some models "think" before answering and that uses tokens too.
const MAX_OUTPUT_TOKENS = 2048;
const BLOCKED_FINISH = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "RECITATION", "IMAGE_SAFETY"]);

export function createGemini(options: { apiKey: string; model: string; timeoutMs?: number }): Generate {
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  return async (prompt, callOptions = {}) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AiUnavailableError("timeout"));
      }, callOptions.timeoutMs ?? timeoutMs);
    });

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: options.model,
          contents: prompt,
          config: {
            systemInstruction: callOptions.systemInstruction ?? SYSTEM_INSTRUCTION,
            temperature: 0.7,
            ...(callOptions.json && { responseMimeType: "application/json" }),
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            abortSignal: controller.signal,
          },
        }),
        timeout,
      ]);

      if (response.promptFeedback?.blockReason) throw new AiUnavailableError("blocked");
      const finish = response.candidates?.[0]?.finishReason;
      if (finish && BLOCKED_FINISH.has(String(finish))) throw new AiUnavailableError("blocked");

      const text = response.text?.trim();
      if (!text) throw new AiUnavailableError("empty");
      // JSON is checked by the caller instead (cutting it would break it)
      if (callOptions.json) return text;
      return text.length > MAX_REPLY_CHARS ? `${text.slice(0, MAX_REPLY_CHARS).trimEnd()}…` : text;
    } catch (err) {
      if (err instanceof AiUnavailableError) throw err;
      throw new AiUnavailableError("failed");
    } finally {
      clearTimeout(timer);
    }
  };
}
