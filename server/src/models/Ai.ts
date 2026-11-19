import { Schema, model } from "mongoose";

export const AI_TASKS = ["thought", "daily", "weekly", "boost"] as const;

// One saved message per user per thing (e.g. one daily note per date, one reflection per week),
// so the same request doesn't call the AI twice.
const aiMessageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: AI_TASKS, required: true },
    // What it's about: a thought-log id, a date, or a week-ending date
    refId: { type: String, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    content: { type: String, required: true, maxlength: 4000 },
    source: { type: String, enum: ["ai", "fallback"], required: true },
  },
  { timestamps: true },
);
aiMessageSchema.index({ userId: 1, type: 1, refId: 1 }, { unique: true });

export const AiMessageModel = model("AiMessage", aiMessageSchema);

// How many AI calls each user has made each day, for AI_DAILY_LIMIT.
const aiUsageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  count: { type: Number, required: true, default: 0, min: 0 },
});
aiUsageSchema.index({ userId: 1, date: 1 }, { unique: true });

export const AiUsageModel = model("AiUsage", aiUsageSchema);
