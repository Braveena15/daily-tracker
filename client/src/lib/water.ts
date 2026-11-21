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

export type WaterResponse = {
  from: string
  to: string
  goalMl: number
  days: { date: string; ml: number }[]
  avgWaterMl: number | null
  waterDays: number
  waterGoalDays: number
}
