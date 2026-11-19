// Validation for the food library and meal routes. Kept separate so it can be unit tested.
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { FOOD_LIMITS as F } from "../models/Food";
import { MEAL_LIMITS as M } from "../models/MealDay";
import { isValidDateString } from "../utils/dates";
import { MEAL_TYPES } from "../utils/meals";

function numberIn(label: string, min: number, max: number, unit = "") {
  const range = `${label} must be between ${min} and ${max}${unit}`;
  return z.number({ error: `${label} must be a number` }).min(min, range).max(max, range);
}

function text(label: string, max: number) {
  return z
    .string({ error: `${label} must be text` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or less`);
}

const name = text("Name", F.name);
const servingDescription = text("Serving", F.servingDescription);
const kcalPerServing = numberIn("Calories", F.kcal.min, F.kcal.max, " kcal");
const macro = (label: string) => numberIn(label, F.macroG.min, F.macroG.max, " g");
const mealType = z.enum(MEAL_TYPES, { error: "Meal must be breakfast, lunch, snack or dinner" });

// ---------- Foods ----------

/** POST /api/foods */
export const createFoodSchema = z.strictObject({
  name,
  servingDescription,
  kcalPerServing,
  proteinG: macro("Protein").optional(),
  carbsG: macro("Carbs").optional(),
  fatG: macro("Fat").optional(),
  isFavourite: z.boolean({ error: "Favourite must be true or false" }).default(false),
});

/** PUT /api/foods/:id — every field optional; null clears a macro. */
export const updateFoodSchema = z.strictObject({
  name: name.optional(),
  servingDescription: servingDescription.optional(),
  kcalPerServing: kcalPerServing.optional(),
  proteinG: macro("Protein").nullable().optional(),
  carbsG: macro("Carbs").nullable().optional(),
  fatG: macro("Fat").nullable().optional(),
  isFavourite: z.boolean({ error: "Favourite must be true or false" }).optional(),
});

export const FOOD_MACROS = ["proteinG", "carbsG", "fatG"] as const;

// ---------- Meals ----------

const mealItemSchema = z.strictObject({
  mealType,
  foodId: z
    .string()
    .refine((id) => isValidObjectId(id), "Unknown food")
    .optional(),
  name,
  servingDescription: text("Serving", F.servingDescription).optional(),
  servings: numberIn("Servings", M.servings.min, M.servings.max),
  kcalPerServing,
  proteinG: macro("Protein").optional(),
  carbsG: macro("Carbs").optional(),
  fatG: macro("Fat").optional(),
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must look like 08:30")
    .optional(),
});

/** PUT /api/meals/:date — the whole day's items. */
export const saveMealDaySchema = z.strictObject({
  items: z.array(mealItemSchema).max(M.itemsPerDay, `You can log up to ${M.itemsPerDay} items a day`),
});

/** POST /api/meals/:date/copy */
export const copyMealsSchema = z.strictObject({
  fromDate: z.string().refine(isValidDateString, '"fromDate" must be a real date in YYYY-MM-DD format'),
  mealType: mealType.optional(),
});

export type MealItemInput = z.infer<typeof mealItemSchema>;
