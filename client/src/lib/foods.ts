// Food library types, matching the server's /api/foods routes.

export type Food = {
  id: string
  name: string
  servingDescription: string
  kcalPerServing: number
  proteinG?: number
  carbsG?: number
  fatG?: number
  isFavourite: boolean
  timesUsed: number
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

export type FoodsResponse = { foods: Food[] }
export type FoodResponse = { food: Food }

/** What the food form produces. Macros are null when left empty. */
export type FoodValues = {
  name: string
  servingDescription: string
  kcalPerServing: number
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  isFavourite: boolean
}

/** Body for POST /api/foods: empty macros are simply left out. */
export function createBody(values: FoodValues) {
  const { proteinG, carbsG, fatG, ...rest } = values
  return {
    ...rest,
    ...(proteinG !== null && { proteinG }),
    ...(carbsG !== null && { carbsG }),
    ...(fatG !== null && { fatG }),
  }
}

/** "P 12 g · C 40 g · F 8 g", or "" when there are no macros. */
export function macroText(food: Pick<Food, 'proteinG' | 'carbsG' | 'fatG'>): string {
  const parts = [
    food.proteinG != null && `P ${food.proteinG} g`,
    food.carbsG != null && `C ${food.carbsG} g`,
    food.fatG != null && `F ${food.fatG} g`,
  ].filter(Boolean)
  return parts.join(' · ')
}
