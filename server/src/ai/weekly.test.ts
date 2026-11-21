/// <reference types="vitest/globals" />
// The weekly reflection's two parts: the reflection text and next week's focus.
import { FALLBACK_FOCUS, decodeWeekly, encodeWeekly, parseWeeklyReply, weeklyFallbackContent } from "./weekly";

const same = (t: string) => t;

describe("parseWeeklyReply", () => {
  it("reads { reflection, focus }, also inside a code block", () => {
    const raw = JSON.stringify({ reflection: "You logged five days and moved more than last week.", focus: "Take a short walk after dinner." });
    expect(decodeWeekly(parseWeeklyReply(raw, same)!)).toEqual({
      text: "You logged five days and moved more than last week.",
      focus: "Take a short walk after dinner",
    });
    expect(parseWeeklyReply("```json\n" + raw + "\n```", same)).not.toBeNull();
  });

  it("returns null for unusable replies (so a fallback is used)", () => {
    expect(parseWeeklyReply("Just some text", same)).toBeNull();
    expect(parseWeeklyReply(JSON.stringify({ reflection: "too short" }), same)).toBeNull();
    expect(parseWeeklyReply(JSON.stringify({ focus: "Walk more" }), same)).toBeNull();
  });

  it("keeps the focus to one tidy line and allows it to be missing", () => {
    const long = "Walk " + "a little further each day ".repeat(10);
    const { focus } = decodeWeekly(parseWeeklyReply(JSON.stringify({ reflection: "A calm, steady week overall.", focus: `"${long}"` }), same)!);
    expect(focus!.length).toBeLessThanOrEqual(140);
    expect(focus).not.toMatch(/^"/);
    expect(decodeWeekly(parseWeeklyReply(JSON.stringify({ reflection: "A calm, steady week overall." }), same)!).focus).toBeNull();
  });

  it("adds the low-mood reminder to the reflection, not the focus", () => {
    const content = parseWeeklyReply(JSON.stringify({ reflection: "A harder week, and you kept going.", focus: "Rest early twice" }), (t) => `${t}\n\nREMINDER`)!;
    expect(decodeWeekly(content)).toEqual({ text: "A harder week, and you kept going.\n\nREMINDER", focus: "Rest early twice" });
  });
});

describe("stored content", () => {
  it("reads older plain-text reflections with no focus", () => {
    expect(decodeWeekly("A plain reflection from before.")).toEqual({ text: "A plain reflection from before.", focus: null });
    expect(decodeWeekly('{"text":"not ours"}')).toEqual({ text: '{"text":"not ours"}', focus: null });
  });

  it("round-trips, and fallbacks come with a fallback focus", () => {
    expect(decodeWeekly(encodeWeekly({ text: "Hi", focus: "Sleep" }))).toEqual({ text: "Hi", focus: "Sleep" });
    expect(FALLBACK_FOCUS).toContain(decodeWeekly(weeklyFallbackContent("Kind words")).focus);
  });
});
