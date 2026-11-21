// Models for the "Mind" section: diary, thought logs, purpose, and the motivation library.
// Fields marked ENCRYPTED hold "iv:authTag:ciphertext" (see utils/crypto.ts), never plain text.
// Controllers encrypt before saving and decrypt before sending.
import { Schema, model, type InferSchemaType } from "mongoose";
import { demoExpiryPlugin } from "../demo/expiryPlugin";
import { QUOTE_CATEGORIES } from "../utils/builtInQuotes";
import { DISTORTIONS } from "../utils/thoughts";

export const MIND_LIMITS = {
  diaryTitle: 200,
  diaryBody: 20_000,
  tag: 30,
  tags: 10,
  thoughtText: 2000,
  smallStep: 300,
  feelingName: 40,
  feelings: 10,
  purposeStatement: 1000,
  value: 40,
  values: 15,
  goalTitle: 150,
  goalWhy: 500,
  goals: 10,
  quoteText: 500,
  author: 100,
  videoTitle: 150,
  note: 500,
} as const;

const userId = { type: Schema.Types.ObjectId, ref: "User", required: true };
const date = { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ };
const encrypted = { type: String }; // ENCRYPTED

// ---------- Diary ----------

const diaryEntrySchema = new Schema(
  {
    userId,
    date,
    title: { ...encrypted, required: true }, // ENCRYPTED
    body: { ...encrypted, required: true }, // ENCRYPTED
    // Tags stay readable so entries can be filtered (the text itself can't be searched)
    tags: { type: [{ type: String, trim: true, lowercase: true, maxlength: MIND_LIMITS.tag }], default: [] },
    isFavourite: { type: Boolean, default: false },
  },
  { timestamps: true },
);
diaryEntrySchema.index({ userId: 1, date: -1 });
diaryEntrySchema.index({ userId: 1, tags: 1 });

export type DiaryEntry = InferSchemaType<typeof diaryEntrySchema>;
// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
diaryEntrySchema.plugin(demoExpiryPlugin);
export const DiaryEntryModel = model("DiaryEntry", diaryEntrySchema);

// ---------- Thought log (CBT) ----------

const rating = { type: Number, min: 0, max: 10 };

const thoughtLogSchema = new Schema(
  {
    userId,
    date,
    thought: { ...encrypted, required: true }, // ENCRYPTED
    situation: encrypted, // ENCRYPTED
    feelings: {
      type: [
        new Schema(
          {
            name: { type: String, required: true, trim: true, maxlength: MIND_LIMITS.feelingName },
            intensityBefore: { ...rating, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    distortions: { type: [{ type: String, enum: DISTORTIONS }], default: [] },
    evidenceFor: encrypted, // ENCRYPTED
    evidenceAgainst: encrypted, // ENCRYPTED
    friendAdvice: encrypted, // ENCRYPTED
    balancedThought: encrypted, // ENCRYPTED
    smallStep: encrypted, // ENCRYPTED
    smallStepDone: { type: Boolean, default: false },
    smallStepDoneAt: { type: Date },
    intensityAfter: rating,
    // true = never send this log to AI features (Part 8)
    isPrivate: { type: Boolean, default: false },
  },
  { timestamps: true },
);
thoughtLogSchema.index({ userId: 1, date: -1 });

export type ThoughtLog = InferSchemaType<typeof thoughtLogSchema>;
// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
thoughtLogSchema.plugin(demoExpiryPlugin);
export const ThoughtLogModel = model("ThoughtLog", thoughtLogSchema);

// ---------- Purpose (one per user) ----------

const purposeSchema = new Schema(
  {
    userId: { ...userId, unique: true },
    purposeStatement: { type: String, trim: true, maxlength: MIND_LIMITS.purposeStatement, default: "" },
    coreValues: { type: [{ type: String, trim: true, maxlength: MIND_LIMITS.value }], default: [] },
    longTermGoals: {
      type: [
        new Schema(
          {
            title: { type: String, required: true, trim: true, maxlength: MIND_LIMITS.goalTitle },
            why: { type: String, trim: true, maxlength: MIND_LIMITS.goalWhy, default: "" },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Earlier versions of the purpose, oldest first. The statement and goals (as JSON) are encrypted.
    // savedAt: when that version was saved; replacedAt: when a newer one replaced it.
    purposeHistory: {
      type: [
        new Schema(
          {
            statement: { type: String, required: true },
            coreValues: { type: [String], default: [] },
            goals: String,
            savedAt: { type: Date, required: true },
            replacedAt: Date,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

export type Purpose = InferSchemaType<typeof purposeSchema>;
// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
purposeSchema.plugin(demoExpiryPlugin);
export const PurposeModel = model("Purpose", purposeSchema);

// ---------- Motivation library ----------

const toJSON = {
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    const { _id, __v, userId: _userId, ...rest } = ret;
    return { id: String(_id), ...rest };
  },
};

const quoteSchema = new Schema(
  {
    userId,
    text: { type: String, required: true, trim: true, maxlength: MIND_LIMITS.quoteText },
    author: { type: String, trim: true, maxlength: MIND_LIMITS.author },
    category: { type: String, enum: QUOTE_CATEGORIES, required: true },
  },
  { timestamps: true, toJSON },
);
quoteSchema.index({ userId: 1, createdAt: -1 });

// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
quoteSchema.plugin(demoExpiryPlugin);
export const QuoteModel = model("Quote", quoteSchema);

const videoSchema = new Schema(
  {
    userId,
    title: { type: String, required: true, trim: true, maxlength: MIND_LIMITS.videoTitle },
    youtubeUrl: { type: String, required: true, trim: true, maxlength: 300 },
    // Taken from the link; videos are always embedded from youtube-nocookie.com/embed/<videoId>
    videoId: { type: String, required: true, match: /^[A-Za-z0-9_-]{11}$/ },
    category: { type: String, enum: QUOTE_CATEGORIES, required: true },
    note: { type: String, trim: true, maxlength: MIND_LIMITS.note },
  },
  { timestamps: true, toJSON },
);
videoSchema.index({ userId: 1, createdAt: -1 });

// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
videoSchema.plugin(demoExpiryPlugin);
export const VideoModel = model("Video", videoSchema);
