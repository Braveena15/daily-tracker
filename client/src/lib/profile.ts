// Profile types and form options, matching the server's /api/profile routes.

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type WeeklyGoalKg = 0 | 0.25 | 0.5 | 0.75 | 1

export type Profile = {
  heightCm: number | null
  birthYear: number | null
  sex: Sex | null
  currentWeightKg: number | null
  goalWeightKg: number | null
  activityLevel: ActivityLevel | null
  weeklyGoalKg: WeeklyGoalKg | null
}

export type Summary = {
  age: number
  bmr: number
  tdee: number
  dailyDeficit: number
  calorieTarget: number
  wasClamped: boolean
  bmi: number
  bmiCategory: string
  weeksToGoal: number | null
}

export type SummaryResponse =
  | { complete: true; summary: Summary }
  | { complete: false; missingFields: (keyof Profile)[]; message: string }

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: 'sedentary', label: 'Sedentary', description: 'Little or no exercise, mostly sitting' },
  { value: 'light', label: 'Lightly active', description: 'Light exercise or walks 1–3 days a week' },
  { value: 'moderate', label: 'Moderately active', description: 'Moderate exercise 3–5 days a week' },
  { value: 'active', label: 'Very active', description: 'Hard exercise 6–7 days a week' },
  { value: 'very_active', label: 'Extremely active', description: 'Hard daily training or a physical job' },
]

export const WEEKLY_GOAL_OPTIONS: { value: WeeklyGoalKg; label: string }[] = [
  { value: 0, label: 'Maintain my current weight' },
  { value: 0.25, label: '0.25 kg/week — gentle' },
  { value: 0.5, label: '0.5 kg/week — recommended' },
  { value: 0.75, label: '0.75 kg/week — faster' },
  { value: 1, label: '1 kg/week — aggressive' },
]
