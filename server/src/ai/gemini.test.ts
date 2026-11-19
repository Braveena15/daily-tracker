/// <reference types="vitest/globals" />
// The real SDK is replaced with a fake, so no network calls are made.
const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { AiUnavailableError, createGemini } from "./gemini";
import { SYSTEM_INSTRUCTION } from "./prompts";

const generate = createGemini({ apiKey: "test-key", model: "test-model", timeoutMs: 50 });

// Braces matter: a function returned from beforeEach would be run as a cleanup step
beforeEach(() => {
  generateContent.mockReset();
});

describe("createGemini", () => {
  it("sends the shared system instruction and returns the text", async () => {
    generateContent.mockResolvedValue({ text: "  Lovely work today.  ", candidates: [{ finishReason: "STOP" }] });
    await expect(generate("prompt")).resolves.toBe("Lovely work today.");
    const call = generateContent.mock.calls[0]![0];
    expect(call).toMatchObject({ model: "test-model", contents: "prompt", config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.7 } });
  });

  it("times out", async () => {
    generateContent.mockReturnValue(new Promise(() => {})); // never answers
    await expect(generate("prompt")).rejects.toThrow("timeout");
  });

  it("treats blocked replies as unavailable", async () => {
    generateContent.mockResolvedValue({ promptFeedback: { blockReason: "SAFETY" } });
    await expect(generate("prompt")).rejects.toThrow("blocked");
    generateContent.mockResolvedValue({ text: "x", candidates: [{ finishReason: "SAFETY" }] });
    await expect(generate("prompt")).rejects.toThrow("blocked");
  });

  it("treats empty replies and errors as unavailable, without leaking details", async () => {
    generateContent.mockResolvedValue({ text: "" });
    await expect(generate("prompt")).rejects.toThrow("empty");
    generateContent.mockRejectedValue(new Error("400 API key not valid: test-key"));
    const err = await generate("prompt").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiUnavailableError);
    expect(String(err)).not.toContain("test-key");
  });
});
