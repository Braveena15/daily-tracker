// One mood scale for the whole app (Today, History, Weekly review, charts): five levels over the
// 1–10 rating, each with a face, a colour and a word, so mood is never shown by colour alone.
// The colours are --mood-1 … --mood-5 in index.css.
import { Annoyed, BatteryFull, BatteryLow, BatteryMedium, Frown, Laugh, Meh, Smile, type LucideIcon } from 'lucide-react'

export type MoodLevel = 1 | 2 | 3 | 4 | 5

export type Band = {
  level: MoodLevel
  word: string
  icon: LucideIcon
  /** The colour as a CSS value, for charts */
  color: string
  /** Icon / text colour class */
  text: string
  /** Pale background class */
  soft: string
}

// Tailwind only generates classes it can see written out in full
const MOOD_BANDS: Band[] = [
  { level: 1, word: 'Very low', icon: Frown, color: 'var(--mood-1)', text: 'text-mood-1', soft: 'bg-mood-1/15' },
  { level: 2, word: 'Low', icon: Annoyed, color: 'var(--mood-2)', text: 'text-mood-2', soft: 'bg-mood-2/15' },
  { level: 3, word: 'Okay', icon: Meh, color: 'var(--mood-3)', text: 'text-mood-3', soft: 'bg-mood-3/15' },
  { level: 4, word: 'Good', icon: Smile, color: 'var(--mood-4)', text: 'text-mood-4', soft: 'bg-mood-4/15' },
  { level: 5, word: 'Great', icon: Laugh, color: 'var(--mood-5)', text: 'text-mood-5', soft: 'bg-mood-5/15' },
]

/** 1–2 Very low · 3–4 Low · 5–6 Okay · 7–8 Good · 9–10 Great (averages round to the nearest band). */
export function moodBand(mood: number): Band {
  const level = Math.min(5, Math.max(1, Math.ceil(Math.round(mood) / 2))) as MoodLevel
  return MOOD_BANDS[level - 1]!
}

const ENERGY_BANDS = [
  { word: 'Low energy', icon: BatteryLow },
  { word: 'Some energy', icon: BatteryMedium },
  { word: 'High energy', icon: BatteryFull },
] as const

/** 1–3 low · 4–6 some · 7–10 high */
export function energyBand(energy: number): { word: string; icon: LucideIcon } {
  return ENERGY_BANDS[energy <= 3 ? 0 : energy <= 6 ? 1 : 2]
}

/** "Good · 7/10" */
export const moodText = (mood: number) => `${moodBand(mood).word} · ${mood}/10`
