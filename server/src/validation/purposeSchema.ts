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

/** "How strongly do I feel this?" 0–10 */
const intensity = z
  .number({ error: (issue) => (issue.input === undefined ? "Choose how strongly you feel this (0–10)" : "Intensity must be a number from 0 to 10") })
  .int("Intensity must be a whole number")
  .min(L.intensity.min, "Intensity must be from 0 to 10")
  .max(L.intensity.max, "Intensity must be from 0 to 10");

/** POST /:date/purposes — what matters today, how strongly (0–10, required), and up to 3 focus values */
export const purposeCreateSchema = z.strictObject({
  text: text("Purpose", L.dailyPurpose).min(1, "Write what matters first"),
  intensity,
  focusValues: focusValues.optional(),
});

/** PATCH /:date/purposes/:purposeId — text, intensity or focus values. (There's no rating any more.) */
export const purposePatchSchema = z
  .strictObject({
    text: text("Purpose", L.dailyPurpose).min(1, "A purpose can't be empty").optional(),
    intensity: intensity.optional(),
    focusValues: focusValues.optional(),
  })
  .refine((v) => v.text !== undefined || v.focusValues !== undefined || v.intensity !== undefined, "Nothing to change");

/** PUT /:date/reflection-note — one evening note for the whole day ("" or null clears it) */
export const reflectionNoteSchema = z.strictObject({
  note: text("Evening note", L.reflectionNote).nullable(),
});
