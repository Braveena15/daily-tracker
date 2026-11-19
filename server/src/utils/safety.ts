// Gentle safety checks. When someone writes words that may mean they are thinking about
// suicide or self-harm, the app shows support contacts (fixed text, never AI-written).
//
// Limits, honestly:
// - This is simple phrase matching, not understanding. It will miss things said in other words
//   or other languages, and it will sometimes match when someone is fine ("this traffic makes me
//   want to die", or "I don't want to die"). Showing support when it wasn't needed is a small
//   cost, so the list leans towards matching.
// - It never blocks saving, and the matched text is never logged or sent anywhere.
// - It is not a crisis service and can't replace one.

/**
 * Phrases checked in lower-cased text (with curly apostrophes made straight and repeated spaces
 * collapsed). `\b` means "word boundary", `\s+` is any spacing, `?` makes the previous part optional.
 */
export const CRISIS_PATTERNS: readonly RegExp[] = [
  // Suicide
  /\bsuicid(e|al|ing)\b/,
  /\b(kill|killing|killed)\s+my\s?self\b/,
  /\b(end|ending|take|taking)\s+(my|my\s+own)\s+life\b/,
  /\bend\s+it\s+all\b/,
  /\bend\s+(things|everything)\b/,

  // Wanting to die / not wanting to live
  /\b(want|wanna|wanted|wish|wishing)\s+(to\s+)?(die|be\s+dead)\b/,
  /\bwish\s+i\s+(was|were)\s+(dead|never\s+born)\b/,
  /\b(better\s+off\s+dead|better\s+off\s+without\s+me)\b/,
  /\b(don'?t|do\s+not|dont)\s+want\s+to\s+(live|be\s+alive|exist|be\s+here\s+anymore|wake\s+up)\b/,
  /\b(no|nothing)\s+(reason\s+)?to\s+live\s+for\b/,
  /\bno\s+reason\s+to\s+(live|go\s+on|keep\s+going)\b/,
  /\b(life|living)\s+(is\s+not|isn'?t|is\s+no\s+longer)\s+worth\s+(it|living)\b/,
  /\bnot\s+worth\s+living\b/,
  /\bcan'?t\s+(go\s+on|keep\s+going|do\s+this\s+anymore)\b/,

  // Self-harm
  /\bself[\s-]?harm(ing)?\b/,
  /\b(hurt|hurting|harm|harming|cut|cutting)\s+my\s?self\b/,
  /\boverdos(e|ed|ing)\b/,
];

/** Lower-case, straight apostrophes, single spaces — so small writing differences still match. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, " ");
}

/** True if any of the texts contains a crisis phrase. Accepts several fields at once. */
export function containsCrisisLanguage(...texts: (string | null | undefined)[]): boolean {
  const combined = normalise(texts.filter(Boolean).join(" \n "));
  return combined.trim() !== "" && CRISIS_PATTERNS.some((pattern) => pattern.test(combined));
}

// ---------- Low mood ----------

export const LOW_MOOD = { maxMood: 3, days: 7, minLowDays: 5 } as const;

/**
 * True if mood was 3 or lower on at least 5 of the last 7 logged days.
 * `recentMoods` is newest first; only the first 7 are used. Fewer than 5 logged days → false.
 */
export function isLowMoodStreak(recentMoods: number[]): boolean {
  const lastDays = recentMoods.slice(0, LOW_MOOD.days);
  return lastDays.filter((mood) => mood <= LOW_MOOD.maxMood).length >= LOW_MOOD.minLowDays;
}
