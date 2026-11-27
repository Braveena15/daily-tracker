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
  purposes: 5,
  intensity: { min: 0, max: 10, default: 5 },
  reflectionNote: 1000,
  listItems: 50,
  waterMl: { min: 50, max: 2000 },
  // A day's total (the safety cap; the real limit is 2 × the user's goal)
  waterTotalMl: 6000,
  missedNote: 300,
} as const;

const L = ENTRY_LIMITS;
const minutes = { type: Number, min: L.minutes.min, max: L.minutes.max };
const notes = { type: String, trim: true, maxlength: L.notes };
const activityName = { type: String, required: true, trim: true, maxlength: L.activityName };
// When the entry was logged (or back-filled to). Every multi-entry has one, plus its own _id.
const loggedAt = { type: Date, required: true };

export const WORKOUT_SOURCES = ["manual", "watch"] as const;
export type WorkoutSource = (typeof WORKOUT_SOURCES)[number];

// "auto": calculated from the watch's sleep; "manual": entered on the Today page (a sync never overwrites it)
export const SLEEP_SCORE_SOURCES = ["auto", "manual"] as const;
// Where the day's sleepHours came from: the watch, or entered by hand (a sync never overwrites it)
export const SLEEP_HOURS_SOURCES = ["watch", "manual"] as const;

const workoutSchema = new Schema({
  loggedAt,
  type: activityName,
  durationMin: { ...minutes, required: true },
  notes,
  // "watch": added by an Apple Health sync on older days (syncs no longer send workouts); otherwise "manual"
  source: { type: String, enum: WORKOUT_SOURCES, default: "manual" },
  calories: { type: Number, min: L.workoutCalories.min, max: L.workoutCalories.max },
});

// The fields an Apple Health sync can fill in: only sleep (steps, calories and the rest are entered by hand)
export const HEALTH_SYNC_FIELDS = ["sleepHours"] as const;
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

// Learnings have no time of day: loggedAt is when it was added, used only to sort (never shown)
const learningSchema = new Schema({
  loggedAt: Date,
  topic: { type: String, required: true, trim: true, maxlength: L.learningTopic },
  details: { type: String, trim: true, maxlength: L.learningDetails },
  minutes,
});

// Water: one drink (added with +1 glass etc., up to 2000 ml — checked in validation/entrySchema.ts), or the
// day's whole total after it was edited (PUT /:date/water/total, up to 6000 ml). Not part of the scores,
// and doesn't make a day "logged" (see USER_LISTS).
const waterLogSchema = new Schema({ loggedAt, amountMl: { type: Number, required: true, min: 1, max: L.waterTotalMl } });
const goodThingSchema = new Schema({ loggedAt, text: { type: String, required: true, trim: true, maxlength: L.goodThing } });

const presentMomentSchema = new Schema({
  loggedAt,
  text: { type: String, required: true, trim: true, maxlength: L.presentMoment },
});

// The day's purposes. Text fields are encrypted (DIARY_ENCRYPTION_KEY), so their lengths are checked
// on the plain text in validation/purposeSchema.ts, not here.
const intentionSchema = new Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  doneAt: Date,
});
// "What matters to me today": one of the day's purposes (up to 5 a day), with how strongly it's felt
// (intensity 0–10), and optional focus values and intentions.
const dayPurposeSchema = new Schema({
  // Encrypted. Only empty for a purpose moved from an older day that had intentions but no text.
  text: { type: String, default: "" },
  // Words chosen from the user's core values
  focusValues: { type: [{ type: String, trim: true, maxlength: 40 }], default: [] },
  intentions: { type: [intentionSchema], default: [] },
  // "How strongly do I feel this today?" 0–10. Null only on purposes from before intensity existed.
  intensity: { type: Number, min: 0, max: 10 },
  // The old evening rating (1–5, "how well did I live it"), kept but never shown (see services/migrations.ts)
  legacyRating: { type: Number, min: 1, max: 5 },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
});

// Why a day wasn't logged (only for today or yesterday). It doesn't make the day "logged".
export const MISSED_CATEGORIES = ["busy", "unwell", "travelling", "forgot", "needed a break", "other"] as const;
export type MissedCategory = (typeof MISSED_CATEGORIES)[number];
const missedReasonSchema = new Schema(
  {
    category: { type: String, enum: MISSED_CATEGORIES, required: true },
    // Encrypted (DIARY_ENCRYPTION_KEY); its length is checked on the plain text in validation/entrySchema.ts
    note: String,
    createdAt: { type: Date, required: true },
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
    // Typed in on the Today page only (a sync ignores them)
    steps: { type: Number, min: L.steps.min, max: L.steps.max },
    activeCalories: { type: Number, min: L.activeCalories.min, max: L.activeCalories.max },
    // Older days only: synced from the watch before steps and calories became manual. No longer written or shown.
    restingCalories: { type: Number, min: L.restingCalories.min, max: L.restingCalories.max },
    exerciseMinutes: minutes,
    // From the watch's sleep, or entered on the Today page ("manual", which a sync never overwrites)
    sleepHours: { type: Number, min: L.sleepHours.min, max: L.sleepHours.max },
    sleepHoursSource: { type: String, enum: SLEEP_HOURS_SOURCES },
    // The watch's night (stages, bedtime, wake time, our calculated score). Only set by Apple Health sync
    sleep: { type: sleepSchema, default: undefined },
    // The day's sleep score: calculated from the watch's sleep ("auto"), or entered on the Today page
    // ("manual"), which a sync never overwrites. See utils/sleepScoreField.ts
    sleepScoreValue: { type: Number, min: L.score.min, max: L.score.max },
    sleepScoreSource: { type: String, enum: SLEEP_SCORE_SOURCES },
    healthSync: { type: healthSyncSchema, default: undefined },

    // ---------- Timestamped entries, added through the day ----------
    moodLogs: { type: [moodLogSchema], default: [] },
    workouts: { type: [workoutSchema], default: [] },
    mentalActivities: { type: [activitySchema], default: [] },
    outdoorActivities: { type: [activitySchema], default: [] },
    goodThings: { type: [goodThingSchema], default: [] },
    learnings: { type: [learningSchema], default: [] },
    presentMoments: { type: [presentMomentSchema], default: [] },
    waterLogs: { type: [waterLogSchema], default: [] },

    // "What do I want today to be about?" (see controllers/dailyPurposeController.ts).
    // Older days stored one `dailyPurpose` object; services/purposesMigration.ts moves it here.
    dailyPurposes: { type: [dayPurposeSchema], default: undefined },
    // One evening note for the whole day (encrypted)
    dailyReflectionNote: String,
    // The active program's custom daily habits ticked on this day (their ids; see models/Program.ts).
    // Ticking one never counts as logging the day.
    programHabitsDone: { type: [String], default: undefined },
    // "Not logged · busy": why the day wasn't logged. Never counts as logging the day.
    missedReason: { type: missedReasonSchema, default: undefined },
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
