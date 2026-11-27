// A transformation program (e.g. "100-day transformation"): where I am now (baseline), where I
// want to be (goals), the daily plan, and the midpoint / final check-ins.
// Text fields marked ENCRYPTED hold "iv:authTag:ciphertext" (DIARY_ENCRYPTION_KEY) and are never
// sent to the AI. Photos are GridFS file ids (bucket "programPhotos", encrypted, owner-only).
// Only one program per user can be active: a partial unique index enforces it.
import { Schema, model, type InferSchemaType } from "mongoose";
import { demoExpiryPlugin } from "../demo/expiryPlugin";
import { PROGRAM_LENGTH, PROGRAM_STATUSES } from "../utils/program";

export const END_REASONS = ["goal reached", "too busy", "health", "lost motivation", "starting a new plan", "other"] as const;
export type EndReason = (typeof END_REASONS)[number];
export const RATING_KEYS = ["confidence", "discipline", "fitness", "mentalWellbeing", "focus"] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export const FOCUS_AREAS = ["physical", "mental", "learning", "finances"] as const;
export const MEASUREMENT_KEYS = ["waistCm", "chestCm", "hipsCm", "armCm"] as const;

export const PROGRAM_LIMITS = {
  name: 80,
  text: 4000,
  label: 60,
  listItems: 12,
  customRatings: 5,
  photos: 4,
  customHabits: 8,
} as const;

const date = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };
const rating = { type: Number, min: 1, max: 10 };
const cm = { type: Number, min: 20, max: 300 };

const ratingsSchema = new Schema(
  {
    confidence: rating,
    discipline: rating,
    fitness: rating,
    mentalWellbeing: rating,
    focus: rating,
    custom: { type: [{ _id: false, label: { type: String, maxlength: PROGRAM_LIMITS.label }, value: rating }], default: [] },
  },
  { _id: false },
);

const photoSchema = new Schema(
  { fileId: { type: String, required: true }, mimeType: String, size: Number, uploadedAt: { type: Date, default: Date.now } },
  { _id: false },
);

/** "Where I am now", and each check-in: the same shape */
const snapshotSchema = new Schema(
  {
    date,
    weightKg: { type: Number, min: 30, max: 300 },
    waistCm: cm,
    chestCm: cm,
    hipsCm: cm,
    armCm: cm,
    ratings: { type: ratingsSchema, default: () => ({}) },
    habits: { type: [String], default: [] },
    /** ENCRYPTED: why I'm doing this (baseline) or my reflection (check-ins) */
    text: String,
    photos: { type: [photoSchema], default: [] },
    /** A check-in that was skipped: kept so it isn't offered again */
    skipped: { type: Boolean, default: false },
  },
  { _id: false },
);

const programSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, maxlength: PROGRAM_LIMITS.name },
    lengthDays: { type: Number, required: true, min: PROGRAM_LENGTH.min, max: PROGRAM_LENGTH.max },
    startDate: { ...date, required: true },
    status: { type: String, enum: PROGRAM_STATUSES, default: "active" },
    endedOn: date,
    endedOnDay: Number,
    /** When it was ended early: "Undo ending" is offered for 24 hours */
    endedAt: Date,
    endReason: { type: String, enum: END_REASONS },
    /** ENCRYPTED */
    endNote: String,
    /** Created from the old journey settings (services/programMigration.ts) */
    migrated: { type: Boolean, default: false },

    baseline: { type: snapshotSchema, default: () => ({}) },
    goals: {
      type: new Schema(
        {
          goalWeightKg: { type: Number, min: 30, max: 300 },
          ratings: { type: ratingsSchema, default: () => ({}) },
          habits: { type: [String], default: [] },
          focusAreas: { type: [String], default: [] },
          /** ENCRYPTED */
          notes: String,
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    plan: {
      type: new Schema(
        {
          waterMl: { type: Number, min: 0, max: 6000 },
          calorieTarget: { type: Number, min: 800, max: 6000 },
          sleepHours: { type: Number, min: 0, max: 14 },
          workoutsPerWeek: { type: Number, min: 0, max: 14 },
          learningMinutes: { type: Number, min: 0, max: 600 },
          customHabits: {
            type: [{ _id: false, id: { type: String, required: true }, label: { type: String, required: true, maxlength: PROGRAM_LIMITS.label } }],
            default: [],
          },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    midpoint: snapshotSchema,
    final: snapshotSchema,
  },
  { timestamps: true },
);

programSchema.index({ userId: 1, startDate: -1 });
// At most one active program per user
programSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: "active" }, name: "one_active_program" });

export type Program = InferSchemaType<typeof programSchema>;
// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
programSchema.plugin(demoExpiryPlugin);
export const ProgramModel = model("Program", programSchema);
