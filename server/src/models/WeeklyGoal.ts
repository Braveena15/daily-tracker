// A goal for one review week ("next week's goal" on the Weekly review). One goal per week.
// The week follows the Weekly review's boundaries: a review ending on day E covers E-6..E, so the
// goal saved from it covers E+1..E+7 — exactly the review week that ends on E+7.
// `text` is ENCRYPTED ("iv:authTag:ciphertext", see utils/crypto.ts) and is never sent to the AI.
import { Schema, model, type InferSchemaType } from "mongoose";

export const GOAL_TEXT_MAX = 200;
export const GOAL_SOURCES = ["ai", "edited", "typed"] as const;

const date = { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ };

const weeklyGoalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    weekStart: date,
    weekEnd: date,
    /** ENCRYPTED */
    text: { type: String, required: true, maxlength: 2000 },
    /** "ai": the AI's focus as is · "edited": the AI's focus, changed · "typed": written from scratch */
    source: { type: String, enum: GOAL_SOURCES, required: true },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
  },
  { timestamps: true },
);

weeklyGoalSchema.index({ userId: 1, weekStart: 1 }, { unique: true });
weeklyGoalSchema.index({ userId: 1, weekEnd: 1 });

export type WeeklyGoalDoc = InferSchemaType<typeof weeklyGoalSchema>;
export const WeeklyGoalModel = model("WeeklyGoal", weeklyGoalSchema);
