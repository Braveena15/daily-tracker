// Decides, for each request, whether to use a saved message, call the AI, or use a fallback.
// Order matters:
//   1. Safety first: if the person's own words suggest a crisis, the AI is NOT called —
//      the app shows support contacts instead.
//   2. Cache: the same thing (e.g. one daily note per date) is only generated once.
//   3. Turned off / not set up → a warm pre-written message.
//   4. Daily limit → the saved message, or a fallback.
//   5. Call the AI. Any failure (timeout, blocked, error) → a fallback. Never an error page.
// The store and the AI call are passed in, so all of this can be tested without a database or network.
import type { AiContext, AiTask } from "./buildContext";
import { pickFallback } from "./fallbacks";
import type { Generate } from "./gemini";
import { LOW_MOOD_REMINDER, buildPrompt } from "./prompts";
import { containsCrisisLanguage } from "../utils/safety";

export type MessageSource = "ai" | "fallback";
export type StoredMessage = { type: AiTask; refId: string; date: string; content: string; source: MessageSource; createdAt: Date };
export type MessageKey = { userId: string; type: AiTask; refId: string };

export type AiStore = {
  find(key: MessageKey): Promise<StoredMessage | null>;
  save(key: MessageKey, message: Omit<StoredMessage, "createdAt">): Promise<StoredMessage>;
  /** Uses one AI call from today's allowance; false if the limit is reached. */
  consume(userId: string, day: string, limit: number): Promise<boolean>;
};

export type AiDeps = {
  /** null when no API key is set */
  generate: Generate | null;
  store: AiStore;
  limit: number;
  /** Errors are reported by kind only — never with prompts or replies. */
  onError?: (err: unknown) => void;
};

export type AiRequest = {
  userId: string;
  task: AiTask;
  refId: string;
  /** The date the message is about ("YYYY-MM-DD") */
  date: string;
  /** Today, for the daily limit */
  today: string;
  userEnabled: boolean;
  regenerate: boolean;
  /** The person's own words, checked for crisis language before anything else. Never sent anywhere. */
  safetyText: (string | null | undefined)[];
  lowMood: boolean;
  /** Builds the AI payload — only called if the AI will actually be used */
  buildContext: () => AiContext;
};

export type AiResult = {
  message: StoredMessage | null;
  showSupport: boolean;
  lowMood: boolean;
  limitReached: boolean;
};

const withReminder = (text: string, lowMood: boolean) => (lowMood ? `${text}\n\n${LOW_MOOD_REMINDER}` : text);

export async function getEncouragement(deps: AiDeps, req: AiRequest): Promise<AiResult> {
  const result = (message: StoredMessage | null, limitReached = false): AiResult => ({
    message,
    showSupport: false,
    lowMood: req.lowMood,
    limitReached,
  });

  // 1. Safety: never send words that suggest a crisis to an AI
  if (containsCrisisLanguage(...req.safetyText)) {
    return { message: null, showSupport: true, lowMood: req.lowMood, limitReached: false };
  }

  const key: MessageKey = { userId: req.userId, type: req.task, refId: req.refId };
  const cached = await deps.store.find(key);
  const aiAvailable = deps.generate !== null && req.userEnabled && deps.limit > 0;

  const fallback = async (limitReached = false) =>
    result(
      await deps.store.save(key, {
        type: req.task,
        refId: req.refId,
        date: req.date,
        content: withReminder(pickFallback(req.task), req.lowMood),
        source: "fallback",
      }),
      limitReached,
    );

  // 2. Cache: an AI message is reused; a saved fallback is retried when the AI is available
  if (cached && !req.regenerate && (cached.source === "ai" || !aiAvailable)) return result(cached);

  // 3. AI turned off by the user, or not set up
  if (!aiAvailable) return fallback();

  // 4. Daily limit
  if (!(await deps.store.consume(req.userId, req.today, deps.limit))) {
    return cached ? result(cached, true) : fallback(true);
  }

  // 5. Ask the AI; any problem → a warm fallback
  try {
    const text = await deps.generate!(buildPrompt(req.buildContext(), { lowMood: req.lowMood }));
    return result(
      await deps.store.save(key, {
        type: req.task,
        refId: req.refId,
        date: req.date,
        content: withReminder(text, req.lowMood),
        source: "ai",
      }),
    );
  } catch (err) {
    deps.onError?.(err);
    return fallback();
  }
}
