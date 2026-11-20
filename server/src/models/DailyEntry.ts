import { Schema, model, type InferSchemaType } from "mongoose";

// Shared limits, used by both the model and the API validation.
export const ENTRY_LIMITS = {
  rating: { min: 1, max: 10 },
  sleepHours: { min: 0, max: 24 },
  weightKg: { min: 30, max: 300 },
  steps: { min: 0, max: 200_000 },
  activeCalories: { min: 0, max: 10_000 },
  restingCalories: { min: 0, max: 5000 },
  workoutCalories: { min: 0, max: 10_000 },
  minutes: { min: 0, max: 1440 },
  score: { min: 0, max: 100 },
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

export const WORKOUT_SOURCES = ["manual", "watch"] as const;
export type WorkoutSource = (typeof WORKOUT_SOURCES)[number];

// _id: false: list items don't need their own ids
const workoutSchema = new Schema(
  {
    type: activityName,
    durationMin: { ...minutes, required: true },
    notes,
    // "watch" workouts come from Apple Health sync and are replaced on every sync
    source: { type: String, enum: WORKOUT_SOURCES, default: "manual" },
    calories: { type: Number, min: L.workoutCalories.min, max: L.workoutCalories.max },
  },
  { _id: false },
);

// Fields Apple Health sync can fill in (shown with a ⌚ in the app)
export const HEALTH_SYNC_FIELDS = [
  "activeCalories",
  "restingCalories",
  "steps",
  "exerciseMinutes",
  "weightKg",
  "sleepHours",
  "workouts",
] as const;
export type HealthSyncField = (typeof HEALTH_SYNC_FIELDS)[number];

const healthSyncSchema = new Schema(
  {
    source: { type: String, enum: ["apple-health"], required: true },
    syncedAt: { type: Date, required: true },
    // Which fields currently hold watch values. A field is dropped from here when you change it by hand.
    fields: { type: [{ type: String, enum: HEALTH_SYNC_FIELDS }], default: [] },
  },
  { _id: false },
);

// Sleep from Apple Health sleep samples, with our own score (see utils/sleep.ts).
// Raw samples are never stored, only this summary.
const sleepMinutes = { type: Number, required: true, min: L.minutes.min, max: L.minutes.max };
const clockTime = { type: String, required: true, match: /^\d{2}:\d{2}$/ };
const sleepSchema = new Schema(
  {
    totalSleepMin: sleepMinutes,
    deepMin: sleepMinutes,
    remMin: sleepMinutes,
    coreMin: sleepMinutes,
    awakeCount: { type: Number, required: true, min: 0, max: 500 },
    awakeMin: sleepMinutes,
    // "HH:mm", Asia/Colombo
    bedtime: clockTime,
    wakeTime: clockTime,
    score: { type: Number, required: true, min: L.score.min, max: L.score.max },
    breakdown: {
      type: [
        new Schema(
          { label: String, points: Number, max: Number, reason: String },
          { _id: false },
        ),
      ],
      default: [],
    },
    source: { type: String, enum: ["watch"], required: true },
  },
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

// Not required in the database: an Apple Health sync can create a day before you check in.
// The check-in route (PUT /api/entries/:date) still requires mood, energy and sleep.
const rating = { type: Number, min: L.rating.min, max: L.rating.max };

const dailyEntrySchema = new Schema(
  {
    // Covered by the { userId, date } index below, since userId is its first key
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // The user's local calendar day (Asia/Colombo), e.g. "2026-11-18"
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

    mood: rating,
    energy: rating,
    sleepHours: { type: Number, min: L.sleepHours.min, max: L.sleepHours.max },
    // Only set by Apple Health sync
    sleep: { type: sleepSchema, default: undefined },
    // Typed in by hand from the Watch, for comparison; not used in any score
    appleSleepScore: { type: Number, min: L.score.min, max: L.score.max },

    weightKg: { type: Number, min: L.weightKg.min, max: L.weightKg.max },
    steps: { type: Number, min: L.steps.min, max: L.steps.max },
    activeCalories: { type: Number, min: L.activeCalories.min, max: L.activeCalories.max },
    // Only set by Apple Health sync
    restingCalories: { type: Number, min: L.restingCalories.min, max: L.restingCalories.max },
    exerciseMinutes: minutes,
    healthSync: { type: healthSyncSchema, default: undefined },

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

// A day counts as "logged" (scores, streaks, history, insights) only once you've checked in.
// Days that only hold Apple Health data don't count yet.
export const CHECKED_IN = { mood: { $ne: null } } as const;

export function isCheckedIn<T extends { mood?: number | null; energy?: number | null }>(
  entry: T,
): entry is T & { mood: number; energy: number } {
  return entry.mood != null && entry.energy != null;
}

export const DailyEntryModel = model("DailyEntry", dailyEntrySchema);
