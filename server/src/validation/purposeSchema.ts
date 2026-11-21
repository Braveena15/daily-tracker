// Validation for today's purpose routes (/api/entries/:date/purpose…). Lengths are checked on the
// plain text here, because the stored text is encrypted.
import { z } from "zod";
import { ENTRY_LIMITS as L } from "../models/DailyEntry";

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or less`);

/** PUT /:date/purpose — the day's purpose and up to 3 focus values. */
export const dailyPurposeSchema = z
  .strictObject({
    text: text("Today's purpose", L.dailyPurpose).optional(),
    focusValues: z
      .array(text("Focus value", 40).min(1, "Focus values can't be empty"), { error: "focusValues must be a list" })
      .max(L.focusValues, `Choose up to ${L.focusValues} focus values`)
      .optional(),
  })
  .refine((v) => v.text !== undefined || v.focusValues !== undefined, "Send text or focusValues");

/** POST /:date/purpose/intentions */
export const intentionSchema = z.strictObject({
  text: text("Intention", L.intentionText).min(1, "Write the intention first"),
});

/** PATCH /:date/purpose/intentions/:id */
export const intentionPatchSchema = z
  .strictObject({
    text: text("Intention", L.intentionText).min(1, "An intention can't be empty").optional(),
    done: z.boolean({ error: "done must be true or false" }).optional(),
  })
  .refine((v) => v.text !== undefined || v.done !== undefined, "Nothing to change");

/** PUT /:date/purpose/reflection — "How well did I live my purpose today?" */
export const reflectionSchema = z.strictObject({
  rating: z
    .number({ error: "Rating must be a number from 1 to 5" })
    .int("Rating must be a whole number")
    .min(1, "Rating must be from 1 to 5")
    .max(5, "Rating must be from 1 to 5"),
  note: text("Note", L.reflectionNote).nullable().optional(),
});
