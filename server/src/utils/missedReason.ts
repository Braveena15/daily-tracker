// "Not logged · busy": why a day wasn't logged. Pure functions, so the rules are easy to test.
// - Only today and yesterday (Asia/Colombo) can get a reason; older and future days can't.
// - A reason never makes a day "logged": streaks, averages and "days logged" don't change.
// - The note is encrypted and only ever shown to its owner; the AI may see the category only.
import type { FieldCrypto } from "./crypto";
import { addDays } from "./dates";

export type StoredMissedReason = { category: string; note?: string | null; createdAt?: Date | string | null } | null | undefined;
export type MissedReason = { category: string; note: string; createdAt: string | null };

/** A reason can be noted for today or yesterday only. */
export const canNoteMissedDay = (date: string, today: string) => date === today || date === addDays(today, -1);

/** For the API: the note decrypted ("" when there's none, or it can't be decrypted). */
export function openMissedReason(crypto: FieldCrypto, stored: StoredMissedReason): MissedReason | null {
  if (!stored?.category) return null;
  return {
    category: stored.category,
    note: stored.note ? (crypto.tryDecrypt(stored.note) ?? "") : "",
    createdAt: stored.createdAt ? new Date(stored.createdAt).toISOString() : null,
  };
}

/** "{ busy: 2, forgot: 1 }": what the AI may know (categories and counts, never notes). */
export function missedCategoryCounts(reasons: (MissedReason | null)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of reasons) if (r) counts[r.category] = (counts[r.category] ?? 0) + 1;
  return counts;
}
