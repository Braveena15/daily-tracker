// Moves a day's single `dailyPurpose` object into the `dailyPurposes` list (see scripts/migratePurposes.ts).
// Pure, and safe to run twice: a day without `dailyPurpose` produces no changes. Text stays encrypted
// exactly as it was (ciphertext is moved, never decrypted).
//
// - the purpose text (or each of the day's purpose lines) → dailyPurposes[0], [1], …
// - focus values, intentions and the reflection rating    → dailyPurposes[0]
// - the reflection note                                    → dailyReflectionNote
import { Types } from "mongoose";
import { atTime } from "./timeline";

type Doc = Record<string, unknown> & { date: string };

type OldIntention = { _id?: unknown; text?: unknown; done?: unknown; doneAt?: unknown };
type OldPurpose = {
  text?: unknown;
  purposes?: { _id?: unknown; text?: unknown; at?: unknown }[] | null;
  focusValues?: unknown[] | null;
  intentions?: OldIntention[] | null;
  reflection?: { rating?: unknown; note?: unknown; at?: unknown } | null;
  setAt?: unknown;
  updatedAt?: unknown;
};

export type PurposesMigration = {
  set: Record<string, unknown>;
  unset: string[];
  /** For the log */
  counts: { purposes: number; intentions: number; ratings: number; notes: number };
};

const asDate = (v: unknown): Date | null => (v instanceof Date ? v : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
const asText = (v: unknown): string => (typeof v === "string" ? v : "");

export function planPurposesMigration(doc: Doc, newId: () => unknown = () => new Types.ObjectId()): PurposesMigration | null {
  if (!("dailyPurpose" in doc)) return null;
  const old = (doc.dailyPurpose ?? {}) as OldPurpose;
  const counts = { purposes: 0, intentions: 0, ratings: 0, notes: 0 };

  const createdAt = asDate(old.setAt) ?? asDate(doc.createdAt) ?? atTime(doc.date, "12:00");
  const updatedAt = asDate(old.updatedAt) ?? createdAt;

  // The day's purpose text: one or more lines (a short-lived shape), or the single older text
  const lines =
    Array.isArray(old.purposes) && old.purposes.length > 0
      ? old.purposes.filter((l) => asText(l.text) !== "").map((l) => ({ _id: l._id ?? newId(), text: asText(l.text), at: asDate(l.at) }))
      : asText(old.text)
        ? [{ _id: newId(), text: asText(old.text), at: null }]
        : [];

  const focusValues = (old.focusValues ?? []).filter((v): v is string => typeof v === "string");
  const intentions = (old.intentions ?? [])
    .filter((i) => asText(i.text) !== "")
    .map((i) => ({ _id: i._id ?? newId(), text: asText(i.text), done: Boolean(i.done), ...(asDate(i.doneAt) && { doneAt: asDate(i.doneAt) }) }));
  const rating = typeof old.reflection?.rating === "number" ? old.reflection.rating : null;
  const note = asText(old.reflection?.note);

  // Intentions, values or a rating without any purpose text still need a purpose to belong to
  if (lines.length === 0 && (focusValues.length > 0 || intentions.length > 0 || rating !== null)) {
    lines.push({ _id: newId(), text: "", at: null });
  }

  const moved = lines.map((line, i) => ({
    _id: line._id,
    text: line.text,
    focusValues: i === 0 ? focusValues : [],
    intentions: i === 0 ? intentions : [],
    ...(i === 0 && rating !== null && { rating }),
    createdAt: line.at ?? createdAt,
    updatedAt,
  }));
  counts.purposes = moved.length;
  counts.intentions = intentions.length;
  counts.ratings = rating !== null && moved.length > 0 ? 1 : 0;

  const set: Record<string, unknown> = {};
  if (moved.length > 0) {
    // Anything already in the new list (added after an update, before this ran) is kept, after these
    const existing = Array.isArray(doc.dailyPurposes) ? doc.dailyPurposes : [];
    set.dailyPurposes = [...moved, ...existing];
  }
  if (note && !asText(doc.dailyReflectionNote)) {
    set.dailyReflectionNote = note;
    counts.notes = 1;
  }
  return { set, unset: ["dailyPurpose"], counts };
}
