// Validation for the Mind routes (diary, thought logs, purpose, quotes, videos).
import { z } from "zod";
import { MIND_LIMITS as L } from "../models/Mind";
import { QUOTE_CATEGORIES } from "../utils/builtInQuotes";
import { isValidDateString, todayInTimezone } from "../utils/dates";
import { DISTORTIONS } from "../utils/thoughts";
import { youtubeVideoId } from "../utils/youtube";

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max.toLocaleString("en-US")} characters or less`);
const required = (label: string, max: number) => text(label, max).min(1, `${label} is required`);

const date = z
  .string({ error: "Date must be text" })
  .refine(isValidDateString, "Date must be a real date in YYYY-MM-DD format")
  .refine((d) => d <= todayInTimezone(), "The date can't be in the future");

const rating = (label: string) =>
  z.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(0).max(10, `${label} must be 0–10`);

const category = z.enum(QUOTE_CATEGORIES, { error: "Choose a category" });

// ---------- Diary ----------

const tags = z
  .array(text("Tag", L.tag).toLowerCase().min(1, "Tags can't be empty"))
  .max(L.tags, `You can add up to ${L.tags} tags`)
  .transform((list) => [...new Set(list)]);

export const createDiarySchema = z.strictObject({
  date: date.optional(),
  title: text("Title", L.diaryTitle).default(""),
  body: required("Your entry", L.diaryBody),
  tags: tags.default([]),
  isFavourite: z.boolean().default(false),
});

export const updateDiarySchema = z.strictObject({
  date: date.optional(),
  title: text("Title", L.diaryTitle).optional(),
  body: required("Your entry", L.diaryBody).optional(),
  tags: tags.optional(),
  isFavourite: z.boolean().optional(),
});

// ---------- Thought log ----------

/** Text fields that are stored encrypted. An empty string clears the field. */
export const THOUGHT_TEXT_FIELDS = [
  "thought",
  "situation",
  "evidenceFor",
  "evidenceAgainst",
  "friendAdvice",
  "balancedThought",
  "smallStep",
] as const;

const thoughtFields = {
  date: date.optional(),
  thought: required("The thought", L.thoughtText),
  situation: text("What happened", L.thoughtText).optional(),
  feelings: z
    .array(z.strictObject({ name: required("Feeling", L.feelingName), intensityBefore: rating("Intensity") }))
    .max(L.feelings, `You can add up to ${L.feelings} feelings`)
    .optional(),
  distortions: z
    .array(z.enum(DISTORTIONS, { error: "Unknown thinking trap" }))
    .max(DISTORTIONS.length)
    .transform((list) => [...new Set(list)])
    .optional(),
  evidenceFor: text("Evidence for", L.thoughtText).optional(),
  evidenceAgainst: text("Evidence against", L.thoughtText).optional(),
  friendAdvice: text("Advice to a friend", L.thoughtText).optional(),
  balancedThought: text("Balanced thought", L.thoughtText).optional(),
  smallStep: text("Small step", L.smallStep).optional(),
  smallStepDone: z.boolean().optional(),
  intensityAfter: rating("Intensity now").nullable().optional(),
  isPrivate: z.boolean().optional(),
};

export const createThoughtSchema = z.strictObject(thoughtFields);
export const updateThoughtSchema = z.strictObject({ ...thoughtFields, thought: thoughtFields.thought.optional() });

// ---------- Purpose ----------

export const purposeSchema = z.strictObject({
  purposeStatement: text("Purpose", L.purposeStatement).default(""),
  coreValues: z
    .array(required("Value", L.value))
    .max(L.values, `You can choose up to ${L.values} values`)
    .transform((list) => [...new Set(list)])
    .default([]),
  longTermGoals: z
    .array(z.strictObject({ title: required("Goal", L.goalTitle), why: text("Why", L.goalWhy).default("") }))
    .max(L.goals, `You can add up to ${L.goals} goals`)
    .default([]),
});

// ---------- Motivation library ----------

export const quoteSchema = z.strictObject({
  text: required("Quote", L.quoteText),
  author: text("Author", L.author).optional(),
  category,
});

const youtubeUrl = z
  .string({ error: "Paste a YouTube link" })
  .trim()
  .max(300)
  .refine((url) => youtubeVideoId(url) !== null, "That doesn't look like a YouTube video link");

export const videoSchema = z.strictObject({
  title: required("Title", L.videoTitle),
  youtubeUrl,
  category,
  note: text("Note", L.note).optional(),
});
