import { Schema, model, type InferSchemaType } from "mongoose";
import { demoExpiryPlugin } from "../demo/expiryPlugin";

// Shared limits, used by both the model and the API validation.
export const FOOD_LIMITS = {
  name: 100,
  servingDescription: 50,
  kcal: { min: 0, max: 5000 },
  macroG: { min: 0, max: 500 },
  fiberG: { min: 0, max: 100 },
} as const;

const macro = { type: Number, min: FOOD_LIMITS.macroG.min, max: FOOD_LIMITS.macroG.max };
export const fiber = { type: Number, min: FOOD_LIMITS.fiberG.min, max: FOOD_LIMITS.fiberG.max };

// A food in the user's personal library, e.g. "Rice and curry", 1 plate, 650 kcal.
const foodSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: FOOD_LIMITS.name },
    servingDescription: { type: String, required: true, trim: true, maxlength: FOOD_LIMITS.servingDescription },
    kcalPerServing: { type: Number, required: true, min: FOOD_LIMITS.kcal.min, max: FOOD_LIMITS.kcal.max },
    // Grams per serving, all optional
    proteinG: macro,
    carbsG: macro,
    fatG: macro,
    fiberG: fiber,
    isFavourite: { type: Boolean, default: false },
    // Updated when the food is added to a meal; used to sort "recent" and "most used" foods
    timesUsed: { type: Number, default: 0, min: 0 },
    lastUsedAt: { type: Date },
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

// One food per name per user, ignoring case ("Rice" and "rice" are the same food).
// strength 2 = compare letters and accents, but not upper/lower case.
foodSchema.index({ userId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export type Food = InferSchemaType<typeof foodSchema>;

// Demo only: deleted with its demo account (see demo/expiryPlugin.ts)
foodSchema.plugin(demoExpiryPlugin);
export const FoodModel = model("Food", foodSchema);
