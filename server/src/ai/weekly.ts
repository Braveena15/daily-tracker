// The weekly reflection is the one AI message with two parts: the reflection itself and a short
// "focus for next week" that the person can save as next week's goal. The AI is asked for JSON
// ({ reflection, focus }); it's stored as JSON in the message's content, and older plain-text
// reflections (saved before this) still read back fine, just without a focus.
import { z } from "zod";
import { pickRandom } from "../utils/random";

export type WeeklyReflection = { text: string; focus: string | null };

const MAX_FOCUS = 140;

/** Gentle, doable focus lines for when the reflection is a pre-written fallback. */
export const FALLBACK_FOCUS = [
  "Do one short mood check-in each evening",
  "Take a 10-minute walk on three days",
  "Write down one good thing every day",
  "Spend 15 minutes learning something new on two days",
  "Go to bed at the same time on weeknights",
] as const;

const replySchema = z.object({
  reflection: z.string().trim().min(20),
  focus: z.string().trim().min(3).optional().nullable(),
});

/** Stored content: JSON with a marker, so it can't be mistaken for a plain-text message. */
export function encodeWeekly(reflection: WeeklyReflection): string {
  return JSON.stringify({ v: 1, text: reflection.text, focus: reflection.focus });
}

/** Reads stored content back; plain text (from before) becomes { text, focus: null }. */
export function decodeWeekly(content: string): WeeklyReflection {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && (parsed as { v?: unknown }).v === 1) {
      const { text, focus } = parsed as { text?: unknown; focus?: unknown };
      if (typeof text === "string") return { text, focus: typeof focus === "string" && focus.trim() ? focus : null };
    }
  } catch {
    // Not JSON: an older plain-text reflection
  }
  return { text: content, focus: null };
}

/** One line, no quotes or trailing full stop, at most 140 characters. */
function tidyFocus(focus: string): string {
  const line = focus.replace(/\s+/g, " ").replace(/^["'“”]+|["'“”]+$/g, "").replace(/\.$/, "").trim();
  return line.length > MAX_FOCUS ? `${line.slice(0, MAX_FOCUS - 1).trimEnd()}…` : line;
}

/** The AI's JSON reply → stored content, or null if it isn't usable (the caller then uses a fallback). */
export function parseWeeklyReply(raw: string, withReminder: (text: string) => string): string | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const parsed = replySchema.safeParse(json);
  if (!parsed.success) return null;
  const focus = parsed.data.focus ? tidyFocus(parsed.data.focus) : null;
  return encodeWeekly({ text: withReminder(parsed.data.reflection), focus: focus || null });
}

/** A pre-written reflection, with a pre-written focus line to go with it. */
export function weeklyFallbackContent(text: string, random: () => number = Math.random): string {
  return encodeWeekly({ text, focus: pickRandom([...FALLBACK_FOCUS], 1, random)[0]! });
}
