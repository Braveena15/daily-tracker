import { Schema, model, type InferSchemaType } from "mongoose";

// Shared limits, used by both the model and the API validation.
export const ENTRY_LIMITS = {
  rating: { min: 1, max: 10 },
  sleepHours: { min: 0, max: 24 },
  weightKg: { min: 30, max: 300 },
  steps: { min: 0, max: 100_000 },
  activeCalories: { min: 0, max: 10_000 },
  minutes: { min: 0, max: 1440 },
  activityName: 100,
  notes: 500,
  goodThing: 300,
  learningTopic: 200,
  learningDetails: 2000,
  presentMoment: 2000,
  listItems: 20,
} as const;

const L = ENTRY_LIMITS;
const minutes = { type: Number, min: L.minutes.min, max: L.minutes.max };
const notes = { type: String, trim: true, maxlength: L.notes };
const activityName = { type: String, required: true, trim: true, maxlength: L.activityName };

// _id: false: list items don't need their own ids
const workoutSchema = new Schema(
  { type: activityName, durationMin: { ...minutes, required: true }, notes },
  { _id: false },
);

const activitySchema = new Schema({ type: activityName, durationMin: minutes, notes }, { _id: false });

const learningSchema = new Schema(
  {
    topic: { type: String, required: true, trim: true, maxlength: L.learningTopic },
    details: { type: String, trim: true, maxlength: L.learningDetails },
    minutes,
  },
  { _id: false },
);

const rating = { type: Number, required: true, min: L.rating.min, max: L.rating.max };

const dailyEntrySchema = new Schema(
  {
    // Covered by the { userId, date } index below, since userId is its first key
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // The user's local calendar day (Asia/Colombo), e.g. "2026-11-18"
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

    mood: rating,
    energy: rating,
    sleepHours: { type: Number, required: true, min: L.sleepHours.min, max: L.sleepHours.max },

    weightKg: { type: Number, min: L.weightKg.min, max: L.weightKg.max },
    steps: { type: Number, min: L.steps.min, max: L.steps.max },
    activeCalories: { type: Number, min: L.activeCalories.min, max: L.activeCalories.max },

    workouts: { type: [workoutSchema], default: [] },
    mentalActivities: { type: [activitySchema], default: [] },
    outdoorActivities: { type: [activitySchema], default: [] },
    goodThings: { type: [{ type: String, trim: true, maxlength: L.goodThing }], default: [] },
    learnings: { type: [learningSchema], default: [] },
    presentMoment: { type: String, trim: true, maxlength: L.presentMoment, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        const { _id, __v, userId, ...rest } = ret;
        return { id: String(_id), ...rest };
      },
    },
  },
);

// One entry per user per day. Also makes "this user's entries by date" queries fast.
dailyEntrySchema.index({ userId: 1, date: 1 }, { unique: true });

export type DailyEntry = InferSchemaType<typeof dailyEntrySchema>;

export const DailyEntryModel = model("DailyEntry", dailyEntrySchema);
