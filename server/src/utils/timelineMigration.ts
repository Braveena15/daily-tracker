// Converts a day stored in the old "one form" shape into the timeline shape (see scripts/migrateTimeline.ts).
// Pure, and safe to run twice: a day that's already converted produces no changes.
//
// - mood + energy           → one moodLogs entry
// - goodThings: ["text"]    → [{ _id, loggedAt, text }]
// - presentMoment: "text"   → presentMoments: [{ _id, loggedAt, text }]
// - workouts, mental and outdoor activities, learnings → each gets an _id and a loggedAt
// loggedAt is the day's updatedAt (or createdAt, or midday on that day when neither is set).
import { Types } from "mongoose";
import { atTime } from "./timeline";

type Doc = Record<string, unknown> & { date: string };

export type TimelineMigration = {
  set: Record<string, unknown>;
  unset: string[];
  /** How many entries got an _id/loggedAt or were created (for the log) */
  stamped: number;
};

const LISTS = ["workouts", "mentalActivities", "outdoorActivities", "learnings"] as const;

const asDate = (v: unknown): Date | null => (v instanceof Date ? v : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);

export function planTimelineMigration(doc: Doc, newId: () => unknown = () => new Types.ObjectId()): TimelineMigration | null {
  const loggedAt = asDate(doc.updatedAt) ?? asDate(doc.createdAt) ?? atTime(doc.date, "12:00");
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  let stamped = 0;

  const stamp = (item: Record<string, unknown>) => {
    if (item._id != null && item.loggedAt != null) return item;
    stamped++;
    return { _id: item._id ?? newId(), loggedAt: item.loggedAt ?? loggedAt, ...withoutKeys(item, ["_id", "loggedAt"]) };
  };

  // Mood and energy → one check-in
  const moodLogs = Array.isArray(doc.moodLogs) ? doc.moodLogs : [];
  if (typeof doc.mood === "number" && moodLogs.length === 0) {
    const energy = typeof doc.energy === "number" ? doc.energy : doc.mood;
    set.moodLogs = [{ _id: newId(), loggedAt, mood: doc.mood, energy }];
    stamped++;
  }
  if ("mood" in doc) unset.push("mood");
  if ("energy" in doc) unset.push("energy");

  // Lists of objects: give each item an _id and loggedAt
  for (const field of LISTS) {
    const list = doc[field];
    if (!Array.isArray(list)) continue;
    const before = stamped;
    const next = list.map((item: Record<string, unknown>) => {
      const out = stamp(item);
      if (field === "workouts" && out.source == null) {
        if (out === item) stamped++;
        return { ...out, source: "manual" };
      }
      return out;
    });
    if (stamped !== before) set[field] = next;
  }

  // Good things: strings → objects
  if (Array.isArray(doc.goodThings)) {
    const before = stamped;
    const next = doc.goodThings.map((g: unknown) => (typeof g === "string" ? (stamped++, { _id: newId(), loggedAt, text: g }) : stamp(g as Record<string, unknown>)));
    if (stamped !== before) set.goodThings = next;
  }

  // Present moment: one string → a list
  if ("presentMoment" in doc) {
    const text = typeof doc.presentMoment === "string" ? doc.presentMoment.trim() : "";
    const existing = Array.isArray(doc.presentMoments) ? doc.presentMoments : [];
    if (text && existing.length === 0) {
      set.presentMoments = [{ _id: newId(), loggedAt, text }];
      stamped++;
    }
    unset.push("presentMoment");
  }

  if (Object.keys(set).length === 0 && unset.length === 0) return null;
  return { set, unset, stamped };
}

function withoutKeys(item: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([k]) => !keys.includes(k)));
}
