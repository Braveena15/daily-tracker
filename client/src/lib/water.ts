// Water: amounts and small helpers (server: /api/entries/:date/water, /api/progress/water).
import type { WaterLog } from '@/lib/entries'

export const WATER_MIN_ML = 50
export const WATER_MAX_ML = 2000
export const DEFAULT_WATER_GOAL_ML = 2000
export const DEFAULT_GLASS_ML = 250

/** "1.25 L" (or "750 ml" under a litre) */
export function litres(ml: number): string {
  if (ml < 1000) return `${Math.round(ml)} ml`
  return `${(ml / 1000).toFixed(2).replace(/\.?0+$/, '')} L`
}

/** "2.0 L": a goal or total always with one decimal */
export const litres1 = (ml: number) => `${(ml / 1000).toFixed(1)} L`

export const waterTotalOf = (logs: WaterLog[] | null | undefined) => (logs ?? []).reduce((s, l) => s + l.amountMl, 0)

// ---------- Editing the day's total (same rules as the server: utils/water.ts) ----------

/** The highest daily total anyone can save, whatever their goal (a safety cap). */
export const WATER_TOTAL_CAP_ML = 6000

/** A day's total can be 0 to 2 × the goal, and never above 6000 ml. */
export const waterTotalMax = (goalMl: number) => Math.min(2 * goalMl, WATER_TOTAL_CAP_ML)

/**
 * A typed amount in whole ml: "1500", "1500 ml", "1.5 L", "1,5 l", "2 litres".
 * Without a unit, a number up to 10 is read as litres ("1.5" → 1500) and anything larger as ml.
 * Null when it isn't an amount.
 */
export function parseWaterAmount(input: string): number | null {
  const match = input
    .trim()
    .toLowerCase()
    .replace(',', '.')
    .match(/^(\d+(?:\.\d+)?|\.\d+)\s*(ml|millilitres?|milliliters?|l|litres?|liters?)?$/)
  if (!match) return null
  const value = Number(match[1])
  const unit = match[2]
  const isLitres = unit ? unit.startsWith('l') : value <= 10
  return Math.round(isLitres ? value * 1000 : value)
}

export type WaterResponse = {
  from: string
  to: string
  goalMl: number
  /** null on days without any water logged */
  days: { date: string; ml: number | null }[]
  avgWaterMl: number | null
  waterDays: number
  waterGoalDays: number
}
