import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { demoExpiryPlugin } from "../demo/expiryPlugin";
import { ACTIVITY_LEVELS, WEEKLY_GOALS } from "../utils/calories";

// Shared limits for profile fields, used by both the model and the API validation.
export const PROFILE_LIMITS = {
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 300 },
  birthYear: { min: 1940 },
  minAge: 13,
} as const;

// Latest birth year allowed: users must be at least 13.
export function maxBirthYear(today: Date = new Date()): number {
  return today.getFullYear() - PROFILE_LIMITS.minAge;
}

export const PROFILE_FIELDS = [
  "heightCm",
  "birthYear",
  "sex",
  "currentWeightKg",
  "goalWeightKg",
  "activityLevel",
  "weeklyGoalKg",
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

// Personal goals used by the daily scores and the journey progress bar.
// Every goal has a default, so scores work before the user changes anything.
export const GOAL_LIMITS = {
  stepGoal: { min: 1000, max: 50_000, default: 8000 },
  activeCalorieGoal: { min: 50, max: 3000, default: 400 },
  workoutMinutesGoal: { min: 5, max: 300, default: 30 },
  learningMinutesGoal: { min: 5, max: 600, default: 30 },
  journeyLengthDays: { min: 7, max: 1000, default: 100 },
  fiberGoalG: { min: 5, max: 100, default: 30 },
  waterGoalMl: { min: 500, max: 6000, default: 2000 },
  glassSizeMl: { min: 50, max: 1000, default: 250 },
} as const;

export const NUMBER_GOAL_FIELDS = Object.keys(GOAL_LIMITS) as (keyof typeof GOAL_LIMITS)[];
export const GOAL_FIELDS = [...NUMBER_GOAL_FIELDS, "journeyStartDate"] as const;
export type GoalField = (typeof GOAL_FIELDS)[number];

const goal = (key: keyof typeof GOAL_LIMITS) => ({
  type: Number,
  min: GOAL_LIMITS[key].min,
  max: GOAL_LIMITS[key].max,
  default: GOAL_LIMITS[key].default,
});

const weight = {
  type: Number,
  min: PROFILE_LIMITS.weightKg.min,
  max: PROFILE_LIMITS.weightKg.max,
};

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false means normal queries never load the hash; login asks for it explicitly.
    passwordHash: { type: String, required: true, select: false },

    // Profile: all optional until the user fills them in
    heightCm: { type: Number, min: PROFILE_LIMITS.heightCm.min, max: PROFILE_LIMITS.heightCm.max },
    birthYear: {
      type: Number,
      min: PROFILE_LIMITS.birthYear.min,
      validate: {
        validator: (v: number) => Number.isInteger(v) && v <= maxBirthYear(),
        message: "You must be at least 13 years old",
      },
    },
    sex: { type: String, enum: ["male", "female"] },
    currentWeightKg: weight,
    goalWeightKg: weight,
    activityLevel: { type: String, enum: ACTIVITY_LEVELS },
    weeklyGoalKg: {
      type: Number,
      validate: {
        validator: (v: number) => (WEEKLY_GOALS as readonly number[]).includes(v),
        message: "Weekly goal must be 0, 0.25, 0.5, 0.75 or 1 kg",
      },
    },

    // Goals (see GOAL_LIMITS). Older accounts without them get the defaults when read.
    stepGoal: goal("stepGoal"),
    activeCalorieGoal: goal("activeCalorieGoal"),
    workoutMinutesGoal: goal("workoutMinutesGoal"),
    learningMinutesGoal: goal("learningMinutesGoal"),
    journeyLengthDays: goal("journeyLengthDays"),
    fiberGoalG: goal("fiberGoalG"),
    waterGoalMl: goal("waterGoalMl"),
    glassSizeMl: goal("glassSizeMl"),
    // "YYYY-MM-DD". When not set, the journey starts on the first logged day (or today).
    journeyStartDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },

    // false = never call the AI for this user; pre-written messages are shown instead
    aiEnabled: { type: Boolean, default: true },

    // Milestone notes (e.g. "streak-7") the user has closed, so they don't show again on any device
    dismissedMilestones: { type: [String], default: [] },

    // Apple Health sync. Only the SHA-256 hash of the token is stored, never the token itself.
    // sparse: users without a token don't take part in the unique index.
    healthSyncTokenHash: { type: String, select: false, unique: true, sparse: true },
    healthSyncTokenCreatedAt: { type: Date },
    lastHealthSyncAt: { type: Date },

    // Public demo only (DEMO_MODE=true): a temporary account with sample data. Never set otherwise.
    isDemo: { type: Boolean },
    // When a demo account (and all its data) is deleted by MongoDB's TTL index
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      // Shape of a user whenever it is sent as JSON: never includes the password or sync token hash.
      transform: (_doc, ret: Record<string, unknown>) => {
        const { _id, __v, passwordHash, healthSyncTokenHash, ...rest } = ret;
        return { id: String(_id), ...rest };
      },
    },
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
userSchema.plugin(demoExpiryPlugin);
export const UserModel = model("User", userSchema);
