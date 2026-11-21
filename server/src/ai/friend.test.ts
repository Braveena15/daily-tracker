/// <reference types="vitest/globals" />
// The AI friend's rules: consent, private logs, crisis safety, message limit, encryption.
import { ALL_FALLBACKS } from "./fallbacks";
import {
  FriendRefusal,
  MAX_FRIEND_MESSAGES,
  friendFirstReply,
  friendFollowUp,
  limitWords,
  openConversation,
  parseFriendReply,
  sealConversation,
  setFriendFeedback,
  type FriendConversation,
  type FriendDeps,
  type FriendStore,
  type FriendThought,
} from "./friend";
import { createFieldCrypto } from "../utils/crypto";

const crypto = createFieldCrypto("d".repeat(64));
const TODAY = "2026-11-21";

const AI_REPLY = JSON.stringify({
  acknowledge: "That sounds really heavy, and feeling anxious about it makes sense.",
  perspectives: ["One meeting doesn't define your work.", "Your boss also praised your report last week.", "You prepared well."],
  strength: "You wrote this down instead of bottling it up.",
  smallStep: "Take a 10-minute walk outside.",
  closing: "I'm here with you.",
});

const thought = (overrides: Partial<FriendThought> = {}): FriendThought => ({
  id: "t1",
  date: TODAY,
  isPrivate: false,
  thought: "I always mess up at work",
  situation: "A tense meeting with my boss",
  feelings: [{ name: "Anxious", intensity: 8 }],
  thinkingTraps: ["labelling"],
  evidenceFor: "I missed a deadline",
  evidenceAgainst: "My boss praised my report",
  balancedThought: "I made one mistake, not all of them",
  friendAdvice: "",
  smallStepText: "",
  values: ["Growth"],
  goodMoments: ["Coffee with Priya"],
  ...overrides,
});

/** An in-memory store that keeps conversations encrypted, like the real one. */
function memoryStore(): FriendStore & { raw: Map<string, string>; used: number } {
  const raw = new Map<string, string>();
  const store = {
    raw,
    used: 0,
    async load(userId: string, id: string) {
      return openConversation(crypto, raw.get(`${userId}:${id}`));
    },
    async save(userId: string, id: string, _date: string, c: FriendConversation) {
      raw.set(`${userId}:${id}`, sealConversation(crypto, c));
    },
    async consume(_u: string, _d: string, limit: number) {
      if (store.used >= limit) return false;
      store.used++;
      return true;
    },
  };
  return store;
}

function setup(overrides: Partial<FriendDeps> = {}) {
  const store = memoryStore();
  const generate = vi.fn(async (_prompt: string, options?: { json?: boolean }) => (options?.json ? AI_REPLY : "I hear you. That makes sense."));
  const deps: FriendDeps = { generate, store, limit: 50, ...overrides };
  const first = (o: Partial<Parameters<typeof friendFirstReply>[1]> = {}) =>
    friendFirstReply(deps, { userId: "u1", thought: thought(), consent: true, includeContext: false, today: TODAY, userEnabled: true, ...o });
  const message = (text: string, o: Partial<Parameters<typeof friendFollowUp>[1]> = {}) =>
    friendFollowUp(deps, { userId: "u1", thought: thought(), consent: true, message: text, today: TODAY, userEnabled: true, ...o });
  return { store, generate, deps, first, message };
}

describe("consent", () => {
  it("is required: nothing is sent without consent: true", async () => {
    const { generate, first, message } = setup();
    for (const consent of [undefined, false, "true", 1]) {
      await expect(first({ consent })).rejects.toMatchObject({ status: 400 });
    }
    await expect(message("hi", { consent: undefined })).rejects.toBeInstanceOf(FriendRefusal);
    expect(generate).not.toHaveBeenCalled();
  });

  it("sends the thought once consent is given", async () => {
    const { generate, first } = setup();
    const result = await first();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![0]).toContain("I always mess up at work");
    expect(result.conversation?.reply).toMatchObject({ closing: "I'm here with you.", source: "ai", helpful: null });
    expect(result.conversation?.reply.perspectives).toHaveLength(3);
  });

  it("includes values and good moments only when turned on", async () => {
    const off = setup();
    await off.first();
    expect(off.generate.mock.calls[0]![0]).not.toMatch(/Priya|Growth/);

    const on = setup();
    await on.first({ includeContext: true });
    expect(on.generate.mock.calls[0]![0]).toContain("Coffee with Priya");
    expect(on.generate.mock.calls[0]![0]).toContain("Growth");
  });
});

describe("private thought logs", () => {
  it("are refused with 403 and never sent", async () => {
    const { generate, first, message } = setup();
    await expect(first({ thought: thought({ isPrivate: true }) })).rejects.toMatchObject({ status: 403 });
    await expect(message("hi", { thought: thought({ isPrivate: true }) })).rejects.toMatchObject({ status: 403 });
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("crisis safety", () => {
  it("never sends a thought with crisis language to the AI", async () => {
    const { generate, store, first } = setup();
    for (const t of [thought({ thought: "I want to die" }), thought({ situation: "I keep thinking about ending my life" })]) {
      const result = await first({ thought: t });
      expect(result).toEqual({ conversation: null, showSupport: true, limitReached: false });
    }
    expect(generate).not.toHaveBeenCalled();
    expect(store.used).toBe(0);
  });

  it("checks every chat message before calling the AI", async () => {
    const { generate, first, message } = setup();
    await first();
    generate.mockClear();
    const result = await message("honestly I don't want to live anymore");
    expect(result.showSupport).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    // The crisis message isn't stored either
    expect((await message("thanks, that helps")).conversation?.messages.map((m) => m.text)).not.toContain("honestly I don't want to live anymore");
  });

  it("also checks good moments that would be shared", async () => {
    const { generate, first } = setup();
    expect((await first({ includeContext: true, thought: thought({ goodMoments: ["wish I was dead"] }) })).showSupport).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("follow-up chat", () => {
  it("needs a first reply, then allows up to 10 messages", async () => {
    const { first, message, generate } = setup();
    await expect(message("hi")).rejects.toMatchObject({ status: 400 });
    await first();
    for (let i = 0; i < MAX_FRIEND_MESSAGES; i++) await message(`message ${i}`);
    await expect(message("one more")).rejects.toMatchObject({ status: 400, message: `You've reached ${MAX_FRIEND_MESSAGES} messages for this thought.` });
    expect(generate).toHaveBeenCalledTimes(1 + MAX_FRIEND_MESSAGES);
  });

  it("uses only this thought and this conversation as context", async () => {
    const { first, message, generate } = setup();
    await first();
    await message("I'm still worried");
    await message("What if it happens again?");
    const prompt = generate.mock.calls.at(-1)![0];
    expect(prompt).toContain("I always mess up at work");
    expect(prompt).toContain("Them: I'm still worried");
    expect(prompt).toContain("Them: What if it happens again?");
  });

  it("keeps replies short", () => {
    const long = Array.from({ length: 200 }, (_, i) => (i % 20 === 19 ? "word." : "word")).join(" ");
    expect(limitWords(long, 120).split(/\s+/).length).toBeLessThanOrEqual(120);
    expect(limitWords("Short and kind.", 120)).toBe("Short and kind.");
  });
});

describe("fallbacks", () => {
  it("gives a warm reply when the AI fails or returns unusable JSON", async () => {
    const failing = setup({ generate: vi.fn(async () => "not json at all") });
    const result = await failing.first();
    expect(result.conversation?.reply.source).toBe("fallback");
    expect(result.conversation?.reply.acknowledge.length).toBeGreaterThan(10);
  });

  it("uses the app's own fallback messages in the chat when the daily limit is reached", async () => {
    const { first, message, store, deps } = setup();
    await first();
    deps.limit = store.used; // no calls left today
    const result = await message("are you there?");
    expect(result.limitReached).toBe(true);
    const reply = result.conversation!.messages.at(-1)!;
    expect(reply).toMatchObject({ role: "friend", source: "fallback" });
    expect(ALL_FALLBACKS).toContain(reply.text);
  });

  it("doesn't call the AI when it's turned off", async () => {
    const { first, generate } = setup();
    expect((await first({ userEnabled: false })).conversation?.reply.source).toBe("fallback");
    expect(generate).not.toHaveBeenCalled();
  });

  it("parses the friend's JSON, also inside a code block", () => {
    expect(parseFriendReply(AI_REPLY)?.closing).toBe("I'm here with you.");
    expect(parseFriendReply("```json\n" + AI_REPLY + "\n```")?.strength).toContain("wrote this down");
    expect(parseFriendReply('{"acknowledge":"hi"}')).toBeNull();
  });
});

describe("storage", () => {
  it("encrypts the whole conversation and reads it back", async () => {
    const { first, message, store } = setup();
    await first();
    await message("I'm still worried about tomorrow");
    const stored = store.raw.get("u1:t1")!;
    expect(stored).not.toMatch(/worried|mess up|walk outside|I'm here with you/);
    const opened = openConversation(crypto, stored)!;
    expect(opened.messages[0]).toMatchObject({ role: "user", text: "I'm still worried about tomorrow" });
    expect(openConversation(createFieldCrypto("e".repeat(64)), stored)).toBeNull();
  });

  it("stores 👍 / 👎 on the reply and on chat replies", async () => {
    const { first, message, store } = setup();
    await first();
    await message("thanks");
    await setFriendFeedback(store, { userId: "u1", thought: thought(), target: "reply", helpful: true });
    const c = await setFriendFeedback(store, { userId: "u1", thought: thought(), target: 1, helpful: false });
    expect(c.reply.helpful).toBe(true);
    expect(c.messages[1]).toMatchObject({ role: "friend", helpful: false });
    await expect(setFriendFeedback(store, { userId: "u1", thought: thought(), target: 0, helpful: true })).rejects.toBeInstanceOf(FriendRefusal);
  });
});
