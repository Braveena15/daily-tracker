// Water: totals and weekly figures. Pure functions, so they're easy to test.
// Water never counts toward the daily scores, and a day with only water isn't a "logged" day.
import { listDates } from "./dates";

export type WaterLog = { amountMl: number; loggedAt?: Date | string | null };

/** The day's total, in ml. */
export function waterTotal(logs: readonly WaterLog[] | null | undefined): number {
  return (logs ?? []).reduce((sum, l) => sum + (Number.isFinite(l.amountMl) ? l.amountMl : 0), 0);
}

export type WaterWeek = {
  /** Average over the days with any water logged (whole ml), null when none */
  avgWaterMl: number | null;
  /** Days with any water logged */
  waterDays: number;
  /** Days whose total reached the goal */
  waterGoalDays: number;
};

/** Weekly water figures from each day's total (days without water are left out of the average). */
export function waterWeek(totals: readonly (number | null | undefined)[], goalMl: number): WaterWeek {
  const logged = totals.filter((t): t is number => typeof t === "number" && t > 0);
  return {
    avgWaterMl: logged.length ? Math.round(logged.reduce((s, t) => s + t, 0) / logged.length) : null,
    waterDays: logged.length,
    waterGoalDays: logged.filter((t) => t >= goalMl).length,
  };
}

/** One point per day from `from` to `to`; null for days without any water logged (not 0). */
export function waterSeries(totals: ReadonlyMap<string, number>, from: string, to: string): { date: string; ml: number | null }[] {
  return from > to ? [] : listDates(from, to).map((date) => ({ date, ml: totals.get(date) || null }));
}
