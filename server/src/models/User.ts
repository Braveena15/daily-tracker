import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
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
  },
  {
    timestamps: true,
    toJSON: {
      // Shape of a user whenever it is sent as JSON: never includes the password hash.
      transform: (_doc, ret: Record<string, unknown>) => {
        const { _id, __v, passwordHash, ...rest } = ret;
        return { id: String(_id), ...rest };
      },
    },
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model("User", userSchema);
