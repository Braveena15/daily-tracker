import { Schema, model, type InferSchemaType } from "mongoose";
import { FOOD_LIMITS, fiber } from "./Food";
import { MEAL_TYPES } from "../utils/meals";

export const MEAL_LIMITS = {
  servings: { min: 0.25, max: 10 },
  itemsPerDay: 100,
} as const;

const macro = { type: Number, min: FOOD_LIMITS.macroG.min, max: FOOD_LIMITS.macroG.max };

// One food eaten in one meal. The name, kcal and macros are a *snapshot* copied from the
// food when it was added, so editing or deleting the food later never changes past days.
const mealItemSchema = new Schema(
  {
    mealType: { type: String, enum: MEAL_TYPES, required: true },
    // Which library food this came from (for "times used"); optional for one-off items
    foodId: { type: Schema.Types.ObjectId, ref: "Food" },
    name: { type: String, required: true, trim: true, maxlength: FOOD_LIMITS.name },
    servingDescription: { type: String, trim: true, maxlength: FOOD_LIMITS.servingDescription },
    servings: { type: Number, required: true, min: MEAL_LIMITS.servings.min, max: MEAL_LIMITS.servings.max },
    kcalPerServing: { type: Number, required: true, min: FOOD_LIMITS.kcal.min, max: FOOD_LIMITS.kcal.max },
    proteinG: macro,
    carbsG: macro,
    fatG: macro,
    fiberG: fiber,
    // Local time eaten, "HH:MM"
    time: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false },
);

const mealDaySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // The user's local calendar day (Asia/Colombo), e.g. "2026-11-19"
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    items: { type: [mealItemSchema], default: [] },
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

// One meal log per user per day. Also makes date-range queries fast.
mealDaySchema.index({ userId: 1, date: 1 }, { unique: true });

export type MealDay = InferSchemaType<typeof mealDaySchema>;

export const MealDayModel = model("MealDay", mealDaySchema);
