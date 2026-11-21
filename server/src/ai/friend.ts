// The AI friend in the Thought log: reads one thought (only after the person taps "Talk to my AI
// friend" and agrees to share it) and answers like a caring, grounded friend, then a short chat.
//
// Rules, in order, for every request (and tested in friend.test.ts):
//   1. Consent: the request must say consent: true. Nothing is sent otherwise.
//   2. Private thought logs are never sent (403).
//   3. Safety: the thought, situation and every chat message are checked for crisis language first.
//      If it matches, the AI is NOT called: the app shows support contacts instead.
//   4. AI off, not set up, daily limit reached, failed or blocked → a warm pre-written reply.
// The conversation is stored encrypted (DIARY_ENCRYPTION_KEY) as one AiMessage of type "friend".
// The store and the AI call are passed in, so all of this can be tested without a database or network.
import { z } from "zod";
import { pickFallback } from "./fallbacks";
import type { Generate } from "./gemini";
import {
  FRIEND_CHAT_INSTRUCTION,
  FRIEND_SYSTEM_INSTRUCTION,
  buildFriendChatPrompt,
  buildFriendPrompt,
  type FriendThoughtData,
} from "./prompts";
import type { FieldCrypto } from "../utils/crypto";
import { pickRandom } from "../utils/random";
import { containsCrisisLanguage } from "../utils/safety";

export const MAX_FRIEND_MESSAGES = 10;
export const MAX_CHAT_MESSAGE_CHARS = 1000;
// The friend's replies are longer than the app's short notes, so they get more time
const FRIEND_TIMEOUT_MS = 20_000;

// ---------- Shapes ----------

export type FriendReply = {
  acknowledge: string;
  perspectives: string[];
  strength: string;
  smallStep: string;
  closing: string;
};

type Source = "ai" | "fallback";
/** helpful: the person's 👍 (true) / 👎 (false), null until they answer */
export type FriendTurn = { role: "user" | "friend"; text: string; at: string; source?: Source; helpful?: boolean | null };

export type FriendConversation = {
  reply: FriendReply & { at: string; source: Source; helpful: boolean | null };
  messages: FriendTurn[];
  /** Whether values and good moments were shared */
  includedContext: boolean;
};

/** A thought log, decrypted, with what the friend may see. */
export type FriendThought = FriendThoughtData & {
  id: string;
  date: string;
  isPrivate: boolean;
  /** Also checked for crisis language (never sent) */
  friendAdvice: string;
  smallStepText: string;
};

export type FriendStore = {
  load(userId: string, thoughtId: string): Promise<FriendConversation | null>;
  save(userId: string, thoughtId: string, date: string, conversation: FriendConversation): Promise<void>;
  /** Uses one AI call from today's allowance; false if the limit is reached. */
  consume(userId: string, day: string, limit: number): Promise<boolean>;
};

export type FriendDeps = {
  generate: Generate | null;
  store: FriendStore;
  limit: number;
  onError?: (err: unknown) => void;
  now?: () => Date;
};

export class FriendRefusal extends Error {
  constructor(
    readonly status: 400 | 403,
    message: string,
  ) {
    super(message);
  }
}

export type FriendResult = { conversation: FriendConversation | null; showSupport: boolean; limitReached: boolean };

export const SUPPORT_LINE =
  "I'm really glad you wrote this down. This sounds like a lot to carry — please talk to someone right now. You deserve real support.";

// ---------- Encryption ----------

export const sealConversation = (crypto: FieldCrypto, c: FriendConversation) => crypto.encrypt(JSON.stringify(c));

/** Null when it can't be read (wrong key or damaged). */
export function openConversation(crypto: FieldCrypto, stored: string | null | undefined): FriendConversation | null {
  const json = crypto.tryDecrypt(stored);
  if (!json) return null;
  try {
    return JSON.parse(json) as FriendConversation;
  } catch {
    return null;
  }
}

// ---------- Replies ----------

const text = (max: number) => z.string().trim().min(1).max(max);
const replySchema = z.object({
  acknowledge: text(600),
  perspectives: z.array(text(400)).min(1).transform((p) => p.slice(0, 3)),
  strength: text(300),
  smallStep: text(300),
  closing: text(200),
});

/** The AI's JSON reply, checked; null if it isn't usable. */
export function parseFriendReply(raw: string): FriendReply | null {
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    const parsed = replySchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const FALLBACK_REPLIES: FriendReply[] = [
  {
    acknowledge: "Thank you for writing this down. It sounds like it's been sitting heavily with you, and that's real.",
    perspectives: [
      "A thought can feel completely true and still be only one way of seeing things.",
      "You've already stepped back from it a little, just by putting it into words here.",
    ],
    strength: "You faced a hard thought instead of pushing it away. That takes courage.",
    smallStep: "Take three slow breaths, then get yourself a glass of water.",
    closing: "I'm here with you.",
  },
  {
    acknowledge: "That sounds hard to carry. It makes sense that it's been on your mind.",
    perspectives: [
      "Hard moments pass, even when it doesn't feel like it right now.",
      "You've got through difficult days before, and you're still here, still trying.",
    ],
    strength: "Looking at this honestly, the way you just did, is a kind thing to do for yourself.",
    smallStep: "Step outside or open a window for a few minutes and notice what you can see.",
    closing: "You're not alone in this.",
  },
];

// Follow-up chat fallbacks: the app's own thought-log messages (ai/fallbacks.ts)
const chatFallback = () => pickFallback("thought");

// ---------- Requests ----------

/** Every user-written text in the thought, for the crisis check (never sent anywhere). */
const thoughtWords = (t: FriendThought) => [
  t.thought,
  t.situation,
  t.evidenceFor,
  t.evidenceAgainst,
  t.balancedThought,
  t.friendAdvice,
  t.smallStepText,
  ...(t.goodMoments ?? []),
];

/** What may be shared: the thought data only (values and good moments only when included). */
function shareable(t: FriendThought, includeContext: boolean): FriendThoughtData {
  return {
    thought: t.thought,
    situation: t.situation,
    feelings: t.feelings,
    thinkingTraps: t.thinkingTraps,
    evidenceFor: t.evidenceFor,
    evidenceAgainst: t.evidenceAgainst,
    balancedThought: t.balancedThought,
    ...(includeContext && { values: t.values ?? [], goodMoments: (t.goodMoments ?? []).slice(0, 3) }),
  };
}

function checkAllowed(thought: FriendThought, consent: unknown) {
  if (consent !== true) throw new FriendRefusal(400, "Please confirm you want to share this thought with Gemini first.");
  if (thought.isPrivate) throw new FriendRefusal(403, "This thought log is private, so it's never shared with AI.");
}

type FirstRequest = {
  userId: string;
  thought: FriendThought;
  consent: unknown;
  includeContext: boolean;
  /** Today, for the daily limit */
  today: string;
  userEnabled: boolean;
  /** Ask again even if there's already a reply */
  regenerate?: boolean;
};

/** POST /api/ai/friend/:thoughtId — the friend's first reply. */
export async function friendFirstReply(deps: FriendDeps, req: FirstRequest): Promise<FriendResult> {
  checkAllowed(req.thought, req.consent);
  const thought = { ...req.thought, ...(!req.includeContext && { goodMoments: [] }) };

  // Safety first: crisis words are never sent to an AI
  if (containsCrisisLanguage(...thoughtWords(thought))) return { conversation: null, showSupport: true, limitReached: false };

  const existing = await deps.store.load(req.userId, thought.id);
  if (existing && existing.reply.source === "ai" && !req.regenerate) return { conversation: existing, showSupport: false, limitReached: false };

  const now = (deps.now ?? (() => new Date()))().toISOString();
  const save = async (reply: FriendReply, source: Source, limitReached = false) => {
    const conversation: FriendConversation = {
      reply: { ...reply, at: now, source, helpful: null },
      messages: existing?.messages ?? [],
      includedContext: req.includeContext,
    };
    await deps.store.save(req.userId, thought.id, thought.date, conversation);
    return { conversation, showSupport: false, limitReached };
  };
  const fallback = (limitReached = false) => save(pickRandom(FALLBACK_REPLIES, 1)[0]!, "fallback", limitReached);

  if (!deps.generate || !req.userEnabled || deps.limit <= 0) return fallback();
  if (!(await deps.store.consume(req.userId, req.today, deps.limit))) return existing ? { conversation: existing, showSupport: false, limitReached: true } : fallback(true);

  try {
    const raw = await deps.generate(buildFriendPrompt(shareable(thought, req.includeContext)), {
      systemInstruction: FRIEND_SYSTEM_INSTRUCTION,
      json: true,
      timeoutMs: FRIEND_TIMEOUT_MS,
    });
    const reply = parseFriendReply(raw);
    if (!reply) throw new Error("AI unavailable: unreadable reply");
    return save(reply, "ai");
  } catch (err) {
    deps.onError?.(err);
    return fallback();
  }
}

type MessageRequest = Omit<FirstRequest, "includeContext" | "regenerate"> & { message: string };

/** POST /api/ai/friend/:thoughtId/messages — one follow-up message (up to 10 per thought). */
export async function friendFollowUp(deps: FriendDeps, req: MessageRequest): Promise<FriendResult> {
  checkAllowed(req.thought, req.consent);
  const message = req.message.trim();
  if (!message) throw new FriendRefusal(400, "Write a message first.");
  if (message.length > MAX_CHAT_MESSAGE_CHARS) throw new FriendRefusal(400, `Keep messages under ${MAX_CHAT_MESSAGE_CHARS} characters.`);

  const existing = await deps.store.load(req.userId, req.thought.id);
  if (!existing) throw new FriendRefusal(400, "Talk to your AI friend about this thought first.");
  const sent = existing.messages.filter((m) => m.role === "user").length;
  if (sent >= MAX_FRIEND_MESSAGES) throw new FriendRefusal(400, `You've reached ${MAX_FRIEND_MESSAGES} messages for this thought.`);

  const thought = { ...req.thought, ...(!existing.includedContext && { goodMoments: [] }) };
  // Safety first, on the new message and the thought itself
  if (containsCrisisLanguage(message, ...thoughtWords(thought))) return { conversation: null, showSupport: true, limitReached: false };

  const now = (deps.now ?? (() => new Date()))().toISOString();
  const save = async (replyText: string, source: Source, limitReached = false) => {
    const conversation: FriendConversation = {
      ...existing,
      messages: [
        ...existing.messages,
        { role: "user", text: message, at: now },
        { role: "friend", text: replyText, at: now, source, helpful: null },
      ],
    };
    await deps.store.save(req.userId, thought.id, thought.date, conversation);
    return { conversation, showSupport: false, limitReached };
  };
  const fallback = (limitReached = false) => save(chatFallback(), "fallback", limitReached);

  if (!deps.generate || !req.userEnabled || deps.limit <= 0) return fallback();
  if (!(await deps.store.consume(req.userId, req.today, deps.limit))) return fallback(true);

  try {
    // Context: this thought and this conversation only
    const history = [
      { role: "friend" as const, text: replyAsText(existing.reply) },
      ...existing.messages.map((m) => ({ role: m.role, text: m.text })),
    ];
    const raw = await deps.generate(buildFriendChatPrompt(shareable(thought, existing.includedContext), history, message), {
      systemInstruction: FRIEND_CHAT_INSTRUCTION,
      timeoutMs: FRIEND_TIMEOUT_MS,
    });
    return save(limitWords(raw, 140), "ai");
  } catch (err) {
    deps.onError?.(err);
    return fallback();
  }
}

/** 👍 / 👎 on the first reply ("reply") or on one of the friend's chat messages (its index). */
export async function setFriendFeedback(
  store: FriendStore,
  req: { userId: string; thought: FriendThought; target: "reply" | number; helpful: boolean | null },
): Promise<FriendConversation> {
  const existing = await store.load(req.userId, req.thought.id);
  if (!existing) throw new FriendRefusal(400, "There's no reply to rate yet.");
  let conversation: FriendConversation;
  if (req.target === "reply") {
    conversation = { ...existing, reply: { ...existing.reply, helpful: req.helpful } };
  } else {
    const turn = existing.messages[req.target];
    if (!turn || turn.role !== "friend") throw new FriendRefusal(400, "That message can't be rated.");
    conversation = { ...existing, messages: existing.messages.map((m, i) => (i === req.target ? { ...m, helpful: req.helpful } : m)) };
  }
  await store.save(req.userId, req.thought.id, req.thought.date, conversation);
  return conversation;
}

const replyAsText = (r: FriendReply) => [r.acknowledge, ...r.perspectives, r.strength, `One small step: ${r.smallStep}`, r.closing].join(" ");

/** The chat reply, cut to about `max` words at a sentence end where possible. */
export function limitWords(textIn: string, max: number): string {
  const words = textIn.trim().split(/\s+/);
  if (words.length <= max) return textIn.trim();
  const cut = words.slice(0, max).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > cut.length / 2 ? cut.slice(0, end + 1) : `${cut}…`;
}

