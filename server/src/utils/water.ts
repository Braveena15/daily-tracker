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

// ---------- Editing the day's total ----------

/** The highest daily total anyone can save, whatever their goal (a safety cap). */
export const WATER_TOTAL_CAP_ML = 6000;

/** The allowed range for a day's total: 0 to 2 × the goal, and never above 6000 ml. */
export const waterTotalRange = (goalMl: number) => ({ min: 0, max: Math.min(2 * goalMl, WATER_TOTAL_CAP_ML) });

/**
 * A typed amount in whole ml: "1500", "1500 ml", "1.5 L", "1,5 l", "2 litres", or a number.
 * Without a unit, a number up to 10 is read as litres ("1.5" → 1500) and anything larger as ml.
 * Null when it isn't an amount.
 */
export function parseWaterAmount(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  if (typeof input !== "string") return null;
  const match = input
    .trim()
    .toLowerCase()
    .replace(",", ".")
    .match(/^(\d+(?:\.\d+)?|\.\d+)\s*(ml|millilitres?|milliliters?|l|litres?|liters?)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  const litres = unit ? unit.startsWith("l") : value <= 10;
  return Math.round(litres ? value * 1000 : value);
}
