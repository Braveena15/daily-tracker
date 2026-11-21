import { Schema, model, type InferSchemaType } from "mongoose";
import { demoExpiryPlugin } from "../demo/expiryPlugin";

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
  moodNote: 500,
  dailyPurpose: 500,
  focusValues: 3,
  intentionText: 200,
  intentions: 5,
  reflectionNote: 1000,
  listItems: 50,
  waterMl: { min: 50, max: 2000 },
} as const;

const L = ENTRY_LIMITS;
const minutes = { type: Number, min: L.minutes.min, max: L.minutes.max };
const notes = { type: String, trim: true, maxlength: L.notes };
const activityName = { type: String, required: true, trim: true, maxlength: L.activityName };
// When the entry was logged (or back-filled to). Every multi-entry has one, plus its own _id.
const loggedAt = { type: Date, required: true };

export const WORKOUT_SOURCES = ["manual", "watch"] as const;
export type WorkoutSource = (typeof WORKOUT_SOURCES)[number];

export const SLEEP_SCORE_SOURCES = ["auto", "manual"] as const;

const workoutSchema = new Schema({
  loggedAt,
  type: activityName,
  durationMin: { ...minutes, required: true },
  notes,
  // "watch" workouts come from Apple Health sync and are replaced on every sync
  source: { type: String, enum: WORKOUT_SOURCES, default: "manual" },
  calories: { type: Number, min: L.workoutCalories.min, max: L.workoutCalories.max },
});

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

const rating = { type: Number, required: true, min: L.rating.min, max: L.rating.max };

const moodLogSchema = new Schema({ loggedAt, mood: rating, energy: rating, note: notes });

const activitySchema = new Schema({ loggedAt, type: activityName, durationMin: minutes, notes });

const learningSchema = new Schema({
  loggedAt,
  topic: { type: String, required: true, trim: true, maxlength: L.learningTopic },
  details: { type: String, trim: true, maxlength: L.learningDetails },
  minutes,
});

// One drink of water. Not part of the scores, and doesn't make a day "logged" (see USER_LISTS).
const waterLogSchema = new Schema({ loggedAt, amountMl: { type: Number, required: true, min: L.waterMl.min, max: L.waterMl.max } });
const goodThingSchema = new Schema({ loggedAt, text: { type: String, required: true, trim: true, maxlength: L.goodThing } });

const presentMomentSchema = new Schema({
  loggedAt,
  text: { type: String, required: true, trim: true, maxlength: L.presentMoment },
});

// How the day's totals grew, one point per sync that changed them (for the "through the day" charts)
const healthSnapshotSchema = new Schema(
  {
    time: { type: Date, required: true },
    steps: { type: Number, min: L.steps.min, max: L.steps.max },
    activeCalories: { type: Number, min: L.activeCalories.min, max: L.activeCalories.max },
  },
  { _id: false },
);

// Today's purpose. Text fields are encrypted (DIARY_ENCRYPTION_KEY), so their lengths are checked
// on the plain text in validation/purposeSchema.ts, not here.
const intentionSchema = new Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  doneAt: Date,
});
// One of the day's purposes (a day can have several). `text` is encrypted.
const purposeLineSchema = new Schema({
  text: { type: String, required: true },
  at: { type: Date, required: true },
});
const dailyPurposeSchema = new Schema(
  {
    // Older days: a single purpose (encrypted). It becomes the first of `purposes` the next time that
    // day's purposes are changed (see controllers/dailyPurposeController.ts).
    text: String,
    purposes: { type: [purposeLineSchema], default: undefined },
    // Words chosen from the user's core values
    focusValues: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
    intentions: { type: [intentionSchema], default: [] },
    reflection: {
      type: new Schema(
        { rating: { type: Number, required: true, min: 1, max: 5 }, note: String, at: { type: Date, required: true } },
        { _id: false },
      ),
      default: undefined,
    },
    setAt: Date,
    updatedAt: Date,
  },
  { _id: false },
);

const dailyEntrySchema = new Schema(
  {
    // Covered by the { userId, date } index below, since userId is its first key
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // The user's local calendar day (Asia/Colombo), e.g. "2026-11-18"
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },

    // ---------- One value per day ----------
    // Typed in on the Today page; editing replaces it
    weightKg: { type: Number, min: L.weightKg.min, max: L.weightKg.max },
    // From Apple Health sync (only ever goes up), or typed in by hand (always replaces)
    steps: { type: Number, min: L.steps.min, max: L.steps.max },
    activeCalories: { type: Number, min: L.activeCalories.min, max: L.activeCalories.max },
    // Only set by Apple Health sync
    restingCalories: { type: Number, min: L.restingCalories.min, max: L.restingCalories.max },
    exerciseMinutes: minutes,
    sleepHours: { type: Number, min: L.sleepHours.min, max: L.sleepHours.max },
    // Only set by Apple Health sync
    sleep: { type: sleepSchema, default: undefined },
    // The day's sleep score: the calculated one ("auto"). Older days may hold a score typed in by
    // hand ("manual"), which a sync never overwrites. See utils/sleepScoreField.ts
    sleepScoreValue: { type: Number, min: L.score.min, max: L.score.max },
    sleepScoreSource: { type: String, enum: SLEEP_SCORE_SOURCES },
    healthSync: { type: healthSyncSchema, default: undefined },
    healthSnapshots: { type: [healthSnapshotSchema], default: [] },

    // ---------- Timestamped entries, added through the day ----------
    moodLogs: { type: [moodLogSchema], default: [] },
    workouts: { type: [workoutSchema], default: [] },
    mentalActivities: { type: [activitySchema], default: [] },
    outdoorActivities: { type: [activitySchema], default: [] },
    goodThings: { type: [goodThingSchema], default: [] },
    learnings: { type: [learningSchema], default: [] },
    presentMoments: { type: [presentMomentSchema], default: [] },
    waterLogs: { type: [waterLogSchema], default: [] },

    // "What do I want today to be about?" (see controllers/dailyPurposeController.ts)
    dailyPurpose: { type: dailyPurposeSchema, default: undefined },
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

// A day counts as "logged" (scores, streaks, history, insights) once you've added anything yourself.
// Days that only hold Apple Health data (and watch workouts) don't count.
export const USER_LISTS = ["moodLogs", "mentalActivities", "outdoorActivities", "goodThings", "learnings", "presentMoments"] as const;

export const CHECKED_IN = {
  $or: [
    ...USER_LISTS.map((field) => ({ [`${field}.0`]: { $exists: true } })),
    { workouts: { $elemMatch: { source: { $ne: "watch" } } } },
  ],
};

type LoggedShape = Partial<Record<(typeof USER_LISTS)[number], readonly unknown[] | null>> & {
  workouts?: readonly { source?: string | null }[] | null;
};

export function isCheckedIn(entry: LoggedShape): boolean {
  return USER_LISTS.some((field) => (entry[field]?.length ?? 0) > 0) || (entry.workouts ?? []).some((w) => w.source !== "watch");
}

// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
dailyEntrySchema.plugin(demoExpiryPlugin);
export const DailyEntryModel = model("DailyEntry", dailyEntrySchema);
