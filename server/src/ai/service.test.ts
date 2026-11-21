/// <reference types="vitest/globals" />
import type { AiContext } from "./buildContext";
import { ALL_FALLBACKS } from "./fallbacks";
import { LOW_MOOD_REMINDER } from "./prompts";
import { getEncouragement, type AiDeps, type AiRequest, type AiStore, type StoredMessage } from "./service";
import { FALLBACK_FOCUS, decodeWeekly, parseWeeklyReply, weeklyFallbackContent } from "./weekly";

function memoryStore(): AiStore & { messages: Map<string, StoredMessage>; used: Map<string, number> } {
  const messages = new Map<string, StoredMessage>();
  const used = new Map<string, number>();
  const k = (key: { userId: string; type: string; refId: string }) => `${key.userId}|${key.type}|${key.refId}`;
  return {
    messages,
    used,
    async find(key) {
      return messages.get(k(key)) ?? null;
    },
    async save(key, message) {
      const saved = { ...message, createdAt: new Date() };
      messages.set(k(key), saved);
      return saved;
    },
    async consume(userId, day, limit) {
      const count = used.get(`${userId}|${day}`) ?? 0;
      if (count >= limit) return false;
      used.set(`${userId}|${day}`, count + 1);
      return true;
    },
  };
}

const context: AiContext = { task: "daily", mode: "minimal", data: { mood: 6 } };

function setup(overrides: Partial<AiDeps> = {}) {
  const store = memoryStore();
  const generate = vi.fn(async (_prompt: string) => "You did well today. Try a short walk tomorrow.");
  const deps: AiDeps = { generate, store, limit: 2, ...overrides };
  const request = (r: Partial<AiRequest> = {}): AiRequest => ({
    userId: "u1",
    task: "daily",
    refId: "2026-11-19",
    date: "2026-11-19",
    today: "2026-11-19",
    userEnabled: true,
    regenerate: false,
    safetyText: ["Had a calm day"],
    lowMood: false,
    buildContext: () => context,
    ...r,
  });
  return { store, generate, deps, request };
}

describe("getEncouragement", () => {
  it("calls the AI and saves the message", async () => {
    const { deps, request, generate, store } = setup();
    const res = await getEncouragement(deps, request());
    expect(res.message).toMatchObject({ source: "ai", content: "You did well today. Try a short walk tomorrow." });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(store.used.get("u1|2026-11-19")).toBe(1);
  });

  it("never calls the AI when the person's words suggest a crisis", async () => {
    const { deps, request, generate, store } = setup();
    const res = await getEncouragement(deps, request({ safetyText: ["I don't want to live anymore"] }));
    expect(res).toEqual({ message: null, showSupport: true, lowMood: false, limitReached: false });
    expect(generate).not.toHaveBeenCalled();
    expect(store.used.size).toBe(0);
  });

  it("checks safety before building the payload", async () => {
    const { deps, request } = setup();
    const buildContext = vi.fn(() => context);
    await getEncouragement(deps, request({ safetyText: ["thinking about suicide"], buildContext }));
    expect(buildContext).not.toHaveBeenCalled();
  });

  it("reuses a saved message instead of calling the AI again", async () => {
    const { deps, request, generate } = setup();
    await getEncouragement(deps, request());
    const again = await getEncouragement(deps, request());
    expect(again.message?.source).toBe("ai");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("regenerates on request, until the daily limit", async () => {
    const { deps, request, generate } = setup();
    await getEncouragement(deps, request());
    await getEncouragement(deps, request({ regenerate: true }));
    expect(generate).toHaveBeenCalledTimes(2);

    const third = await getEncouragement(deps, request({ regenerate: true }));
    expect(generate).toHaveBeenCalledTimes(2); // limit of 2 reached
    expect(third.limitReached).toBe(true);
    expect(third.message?.source).toBe("ai"); // keeps the saved message
  });

  it("uses a fallback when the limit is reached and nothing is saved", async () => {
    const { deps, request, generate } = setup({ limit: 0 });
    const res = await getEncouragement(deps, request());
    expect(generate).not.toHaveBeenCalled();
    expect(res.message?.source).toBe("fallback");
    expect(ALL_FALLBACKS).toContain(res.message?.content);
  });

  it("uses a fallback when the AI fails, and tries again next time", async () => {
    const { deps, request, generate } = setup();
    generate.mockRejectedValueOnce(new Error("timeout"));
    const onError = vi.fn();
    const first = await getEncouragement({ ...deps, onError }, request());
    expect(first.message?.source).toBe("fallback");
    expect(onError).toHaveBeenCalled();

    const second = await getEncouragement(deps, request());
    expect(second.message?.source).toBe("ai");
  });

  it("never calls the AI when the person has turned it off, or there's no key", async () => {
    const off = setup();
    expect((await getEncouragement(off.deps, off.request({ userEnabled: false }))).message?.source).toBe("fallback");
    expect(off.generate).not.toHaveBeenCalled();

    const noKey = setup({ generate: null });
    expect((await getEncouragement(noKey.deps, noKey.request())).message?.source).toBe("fallback");
  });

  it("ends with a gentle support reminder when mood is low today — AI or fallback", async () => {
    const { deps, request } = setup();
    const ai = await getEncouragement(deps, request({ lowMood: true }));
    expect(ai.lowMood).toBe(true);
    expect(ai.message?.content.endsWith(LOW_MOOD_REMINDER)).toBe(true);

    const noKey = setup({ generate: null });
    const fallback = await getEncouragement(noKey.deps, noKey.request({ lowMood: true }));
    expect(fallback.message?.content.endsWith(LOW_MOOD_REMINDER)).toBe(true);
  });

  it("asks the AI not to add its own helpline line when mood is low", async () => {
    const { deps, request, generate } = setup();
    await getEncouragement(deps, request({ lowMood: true }));
    expect(generate.mock.calls[0]![0]).toContain("Don't add a helpline reminder");
  });
});

describe("fallbacks", () => {
  it("has at least 15 different messages", () => {
    expect(new Set(ALL_FALLBACKS).size).toBeGreaterThanOrEqual(15);
  });
});

describe("structured replies (weekly reflection)", () => {
  const structured = { fromReply: parseWeeklyReply, fromFallback: (text: string) => weeklyFallbackContent(text, () => 0) };

  it("asks for JSON and stores the reflection with its focus", async () => {
    const { deps, request } = setup({
      generate: vi.fn(async () => JSON.stringify({ reflection: "A steady week with three workouts and calmer evenings.", focus: "Walk after lunch on three days." })),
    });
    const res = await getEncouragement(deps, request({ task: "weekly", structured }));
    expect(deps.generate).toHaveBeenCalledWith(expect.any(String), { json: true });
    expect(decodeWeekly(res.message!.content)).toEqual({ text: "A steady week with three workouts and calmer evenings.", focus: "Walk after lunch on three days" });
    expect(res.message!.source).toBe("ai");
  });

  it("uses a fallback (with a fallback focus) when the reply isn't usable JSON", async () => {
    const { deps, request } = setup({ generate: vi.fn(async () => "Sorry, here is some plain text") });
    const res = await getEncouragement(deps, request({ task: "weekly", structured }));
    expect(res.message!.source).toBe("fallback");
    expect(FALLBACK_FOCUS).toContain(decodeWeekly(res.message!.content).focus);
  });

  it("gives a fallback focus when the AI is turned off", async () => {
    const { deps, request, generate } = setup();
    const res = await getEncouragement(deps, request({ task: "weekly", structured, userEnabled: false }));
    expect(generate).not.toHaveBeenCalled();
    expect(FALLBACK_FOCUS).toContain(decodeWeekly(res.message!.content).focus);
  });
});
