// What we ask the AI. The system instruction is shared by every task; each task adds its own
// short brief, followed by the data from buildContext.ts (the only data the AI ever sees).
import type { AiContext, AiTask } from "./buildContext";

export const SYSTEM_INSTRUCTION =
  "You are a warm, encouraging companion inside a personal wellbeing app. Speak like a kind, grounded friend: " +
  "brief (max ~120 words), specific to the data given, practical. Celebrate effort, not just outcomes. " +
  "Suggest at most one small, concrete next step. Never diagnose, never give medical or medication advice, " +
  "never claim to be a therapist, never use guilt or shame, never comment on body appearance. " +
  "For low mood, validate feelings first. Use simple English.";

const TASKS: Record<AiTask, string> = {
  thought:
    "The person just finished a CBT-style thought log. Acknowledge how they felt. Gently name the thinking trap(s) they " +
    "spotted, if any, in plain words. If their own words are included, affirm their balanced thought and small step; if " +
    "not, affirm the effort of doing the exercise. Mention the before→after change in intensity kindly and without " +
    "pressure — if it didn't drop, say that's okay.",
  daily:
    "Write a short \"note for tomorrow\" after today's check-in. Notice one specific thing that went well (from the " +
    "scores or activities), then offer one small, doable idea for tomorrow.",
  weekly:
    "Write a short weekly reflection comparing this week with last week. Mention one or two wins, one pattern noticed " +
    "(as an observation from their data, never as a cause or a promise), and one gentle focus for next week.",
  boost:
    "Write a short pick-me-up for someone who opened the \"Lift me up\" page. Draw on their recent scores, streak and " +
    "the values they chose. Be uplifting but genuine, not over the top.",
};

const DATA_NOTES =
  "Data notes: days are relative (\"today\", \"yesterday\"). Scores are 0–100; mood, energy and intensities are 0–10. " +
  "\"other …\" means a name the person typed themselves, which is kept private. Don't mention these notes or the data " +
  "format, and don't invent details that aren't in the data.";

/**
 * The full prompt for a task. When mood is low today the app itself adds a support
 * reminder at the end, so the AI is asked not to write one (to avoid saying it twice).
 */
export function buildPrompt(context: AiContext, options: { lowMood: boolean }): string {
  const lowMood = options.lowMood
    ? "Their mood is low today: validate their feelings first and keep it especially gentle. Don't add a helpline " +
      "reminder — the app adds one after your message."
    : "";
  return [TASKS[context.task], lowMood, DATA_NOTES, `Data (JSON): ${JSON.stringify(context.data)}`].filter(Boolean).join("\n\n");
}

/** Added by the app (not the AI) whenever mood is 3 or lower today. */
export const LOW_MOOD_REMINDER =
  "If things feel heavy right now, talking to someone you trust — or a helpline — can really help. You don't have to carry it alone. 💜";

// ---------- AI friend (Thought log) ----------
// Only used after the person taps "Talk to my AI friend" for one thought and agrees to share it.

export const FRIEND_SYSTEM_INSTRUCTION =
  "You are a warm, caring friend inside a personal wellbeing app — not a therapist, coach or doctor. The user has " +
  "shared a difficult thought. Speak simply and kindly, like a close friend sitting next to them.\n" +
  "- First, really acknowledge the feeling in your own words, and name the feeling they named. Never rush past it.\n" +
  "- Don't say 'just think positive', don't minimise, don't lecture, don't use clichés.\n" +
  "- Gently offer 2–3 more balanced, hopeful ways to look at the thought, grounded in what THEY wrote (their evidence, " +
  "situation, balanced thought) and, if provided, their values and good moments. If they picked a thinking trap, " +
  "mention it softly and briefly.\n" +
  "- Remind them of one real strength they've shown (e.g. writing this down, facing it).\n" +
  "- Suggest ONE small, kind, doable step for the next hour.\n" +
  "- End with a short, warm line that makes them feel accompanied, e.g. 'I'm here with you.'\n" +
  "- Never diagnose, never give medical or medication advice, never claim to be human. Keep it under ~170 words. " +
  "Reply in the language the user wrote in.\n" +
  'Reply with JSON only, exactly: {"acknowledge": string, "perspectives": [2 or 3 strings], "strength": string, ' +
  '"smallStep": string, "closing": string}.';

export const FRIEND_CHAT_INSTRUCTION =
  "You are a warm, caring friend inside a personal wellbeing app — not a therapist, coach or doctor. You are " +
  "continuing a short conversation about one difficult thought the user shared. Speak simply and kindly, like a close " +
  "friend. Acknowledge what they just said before anything else. Don't minimise, lecture or use clichés. Stay on this " +
  "thought. Never diagnose, never give medical or medication advice, never claim to be human. Reply in plain text " +
  "(no lists, no headings), under 120 words, in the language the user wrote in.";

/** The thought as shared with the AI friend (only after consent). */
export type FriendThoughtData = {
  thought: string;
  situation: string;
  feelings: { name: string; intensity: number }[];
  thinkingTraps: string[];
  evidenceFor: string;
  evidenceAgainst: string;
  balancedThought: string;
  /** Only when the person turned on "Include my values and a few recent good moments" */
  values?: string[];
  goodMoments?: string[];
};

/** Leaves out empty fields so the AI doesn't comment on what wasn't written. */
function compact(data: FriendThoughtData): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v != null)),
  );
}

export function buildFriendPrompt(data: FriendThoughtData): string {
  return [
    "Here is what they wrote in their thought log. Respond as their friend, following your instructions.",
    `Their thought log (JSON): ${JSON.stringify(compact(data))}`,
  ].join("\n\n");
}

export function buildFriendChatPrompt(
  data: FriendThoughtData,
  history: { role: "user" | "friend"; text: string }[],
  message: string,
): string {
  const lines = history.map((m) => `${m.role === "user" ? "Them" : "You"}: ${m.text}`);
  return [
    `Their thought log (JSON): ${JSON.stringify(compact(data))}`,
    lines.length ? `Your conversation so far:\n${lines.join("\n")}` : "",
    `Them: ${message}`,
    "Reply to their last message as their friend.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
