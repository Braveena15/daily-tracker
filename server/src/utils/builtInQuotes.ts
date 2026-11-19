// A small built-in set of quotes, served alongside the user's own.
//
// Attributed quotes are only from public-domain authors, in public-domain English translations,
// with the source given so they can be checked. Popular sayings that are misattributed or are
// modern paraphrases (for example many "Rumi" and "Aristotle" quotes online) are deliberately
// left out. The affirmations at the end are original and unattributed.

export const QUOTE_CATEGORIES = ["motivation", "purpose", "calm", "confidence", "discipline"] as const;
export type QuoteCategory = (typeof QUOTE_CATEGORIES)[number];

export type BuiltInQuote = { id: string; text: string; author: string | null; source: string | null; category: QuoteCategory };

export const BUILT_IN_QUOTES: readonly BuiltInQuote[] = [
  {
    id: "builtin-1",
    text: "If thou art pained by any external thing, it is not this thing that disturbs thee, but thy own judgement about it. And it is in thy power to wipe out this judgement now.",
    author: "Marcus Aurelius",
    source: "Meditations 8.47, trans. George Long",
    category: "calm",
  },
  {
    id: "builtin-2",
    text: "Such as are thy habitual thoughts, such also will be the character of thy mind; for the soul is dyed by the thoughts.",
    author: "Marcus Aurelius",
    source: "Meditations 5.16, trans. George Long",
    category: "discipline",
  },
  {
    id: "builtin-3",
    text: "No longer talk at all about the kind of man that a good man ought to be, but be such.",
    author: "Marcus Aurelius",
    source: "Meditations 10.16, trans. George Long",
    category: "purpose",
  },
  {
    id: "builtin-4",
    text: "We suffer more often in imagination than in reality.",
    author: "Seneca",
    source: "Letters to Lucilius 13, trans. Richard M. Gummere",
    category: "calm",
  },
  {
    id: "builtin-5",
    text: "Men are disturbed not by the things which happen, but by the opinions about the things.",
    author: "Epictetus",
    source: "Enchiridion 5, trans. George Long",
    category: "calm",
  },
  {
    id: "builtin-6",
    text: "Of things some are in our power, and others are not.",
    author: "Epictetus",
    source: "Enchiridion 1, trans. George Long",
    category: "discipline",
  },
  {
    id: "builtin-7",
    text: "The journey of a thousand li commences with a single step.",
    author: "Lao Tzu",
    source: "Tao Te Ching 64, trans. James Legge",
    category: "motivation",
  },
  {
    id: "builtin-8",
    text: "He who knows other men is discerning; he who knows himself is intelligent.",
    author: "Lao Tzu",
    source: "Tao Te Ching 33, trans. James Legge",
    category: "confidence",
  },
  {
    id: "builtin-9",
    text: "When you know a thing, to hold that you know it; and when you do not know a thing, to allow that you do not know it; this is knowledge.",
    author: "Confucius",
    source: "Analects 2.17, trans. James Legge",
    category: "confidence",
  },
  {
    id: "builtin-10",
    text: "If one advances confidently in the direction of his dreams, and endeavors to live the life which he has imagined, he will meet with a success unexpected in common hours.",
    author: "Henry David Thoreau",
    source: "Walden, Conclusion",
    category: "purpose",
  },

  // Original affirmations (no author)
  { id: "builtin-11", text: "You don't have to do it all today. One small step is enough.", author: null, source: null, category: "motivation" },
  { id: "builtin-12", text: "Rest is part of the work, not a break from it.", author: null, source: null, category: "calm" },
  { id: "builtin-13", text: "Progress counts, even when it's quiet.", author: null, source: null, category: "motivation" },
  { id: "builtin-14", text: "You can begin again at any moment of the day.", author: null, source: null, category: "discipline" },
  { id: "builtin-15", text: "Be as kind to yourself as you would be to a good friend.", author: null, source: null, category: "confidence" },
  { id: "builtin-16", text: "Feelings are visitors. Let them come, and let them go.", author: null, source: null, category: "calm" },
  { id: "builtin-17", text: "The things you care about are a compass. Follow them a little today.", author: null, source: null, category: "purpose" },
  { id: "builtin-18", text: "Showing up on hard days is its own kind of strength.", author: null, source: null, category: "confidence" },
  { id: "builtin-19", text: "Small habits, repeated kindly, change a life.", author: null, source: null, category: "discipline" },
  { id: "builtin-20", text: "Breathe in. Breathe out. You're doing better than you think.", author: null, source: null, category: "calm" },
];
