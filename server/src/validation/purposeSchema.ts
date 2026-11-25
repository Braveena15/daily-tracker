// Validation for the day's purpose routes (/api/entries/:date/purposes…, /reflection-note). Lengths
// are checked on the plain text here, because the stored text is encrypted.
import { z } from "zod";
import { ENTRY_LIMITS as L } from "../models/DailyEntry";

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or less`);

const focusValues = z
  .array(text("Focus value", 40).min(1, "Focus values can't be empty"), { error: "focusValues must be a list" })
  .max(L.focusValues, `Choose up to ${L.focusValues} focus values`);

const rating = z
  .number({ error: "Rating must be a number from 1 to 5" })
  .int("Rating must be a whole number")
  .min(1, "Rating must be from 1 to 5")
  .max(5, "Rating must be from 1 to 5");

/** POST /:date/purposes — one of the day's purposes, with up to 3 focus values */
export const purposeCreateSchema = z.strictObject({
  text: text("Purpose", L.dailyPurpose).min(1, "Write the purpose first"),
  focusValues: focusValues.optional(),
});

/** PATCH /:date/purposes/:purposeId — text, focus values, or the evening rating (null clears it) */
export const purposePatchSchema = z
  .strictObject({
    text: text("Purpose", L.dailyPurpose).min(1, "A purpose can't be empty").optional(),
    focusValues: focusValues.optional(),
    rating: rating.nullable().optional(),
  })
  .refine((v) => v.text !== undefined || v.focusValues !== undefined || v.rating !== undefined, "Nothing to change");

/** POST /:date/purposes/:purposeId/intentions */
export const intentionSchema = z.strictObject({
  text: text("Intention", L.intentionText).min(1, "Write the intention first"),
});

/** PATCH /:date/purposes/:purposeId/intentions/:intentionId */
export const intentionPatchSchema = z
  .strictObject({
    text: text("Intention", L.intentionText).min(1, "An intention can't be empty").optional(),
    done: z.boolean({ error: "done must be true or false" }).optional(),
  })
  .refine((v) => v.text !== undefined || v.done !== undefined, "Nothing to change");

/** PUT /:date/reflection-note — one evening note for the whole day ("" or null clears it) */
export const reflectionNoteSchema = z.strictObject({
  note: text("Evening note", L.reflectionNote).nullable(),
});
