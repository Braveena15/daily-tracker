// Meal types and maths, matching the server's /api/meals routes and src/utils/meals.ts.
import { Coffee, Cookie, Soup, UtensilsCrossed, type LucideIcon } from 'lucide-react'

export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner'

export const MEALS: { type: MealType; label: string; icon: LucideIcon }[] = [
  { type: 'breakfast', label: 'Breakfast', icon: Coffee },
  { type: 'lunch', label: 'Lunch', icon: Soup },
  { type: 'snack', label: 'Pre-dinner snack', icon: Cookie },
  { type: 'dinner', label: 'Dinner', icon: UtensilsCrossed },
]

/** One food eaten in one meal. Name, kcal and macros are a snapshot taken when it was added. */
export type MealItem = {
  mealType: MealType
  foodId?: string
  name: string
  servingDescription?: string
  servings: number
  kcalPerServing: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  fiberG?: number
  time?: string
}

export type Totals = { kcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null; fiberG: number | null }

export type DaySummary = {
  totalsByMeal: Record<MealType, Totals>
  totals: Totals
  profileComplete: boolean
  calorieTarget: number | null
  /** Daily fibre goal from the profile (default 30 g) */
  fiberGoalG: number | null
  activeCalories: number | null
  /**
   * burn is "so far" for today (soFar: true): resting = BMR × the share of the day gone by, plus the
   * active calories you entered; projected is the expected full-day burn. For past days both are the full day.
   */
  estimatedBurn: {
    burn: number
    /** 'entry': BMR + the active calories you entered; 'estimate': from your TDEE */
    source: 'entry' | 'estimate'
    resting: number
    active: number | null
    projected: number
    soFar: boolean
  } | null
  remaining: number | null
  netVsBurn: number | null
  netVsProjected: number | null
}

export type MealDayResponse = { date: string; items: MealItem[]; summary: DaySummary }

export type WeeklyStats = {
  from: string
  to: string
  calorieTarget: number | null
  fiberGoalG: number | null
  days: { date: string; kcal: number | null; fiberG: number | null }[]
  average: number | null
  loggedDays: number
  daysOnTarget: number | null
  /** Over days with fibre logged */
  averageFiberG: number | null
}

export const SERVINGS = { min: 0.25, max: 10, step: 0.25 }

/** servings × kcal per serving, rounded (same as the server). */
export function itemKcal(item: Pick<MealItem, 'servings' | 'kcalPerServing'>): number {
  return Math.round(item.servings * item.kcalPerServing)
}

function sumMacro(items: MealItem[], key: 'proteinG' | 'carbsG' | 'fatG' | 'fiberG'): number | null {
  const withMacro = items.filter((i) => i[key] !== undefined && i[key] !== null)
  if (withMacro.length === 0) return null
  return Math.round(withMacro.reduce((sum, i) => sum + i.servings * (i[key] as number), 0) * 10) / 10
}

/** Totals for a list of items (the server does the same sums). */
export function totals(items: MealItem[]): Totals {
  return {
    kcal: items.reduce((sum, i) => sum + itemKcal(i), 0),
    proteinG: sumMacro(items, 'proteinG'),
    carbsG: sumMacro(items, 'carbsG'),
    fatG: sumMacro(items, 'fatG'),
    fiberG: sumMacro(items, 'fiberG'),
  }
}

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

/** 1.5 → "1½", 0.25 → "¼", 2 → "2". */
export function formatServings(n: number): string {
  const whole = Math.floor(n)
  const fraction = FRACTIONS[Math.round((n - whole) * 100) / 100]
  if (fraction === undefined) return whole === n ? String(n) : n.toFixed(2).replace(/0+$/, '')
  return whole === 0 ? fraction : `${whole}${fraction}`
}

export const kcal = (n: number) => n.toLocaleString()
