import { energyBand, moodBand } from '@/lib/mood'
import { cn } from '@/lib/utils'

/** The mood face in its colour. Decorative: always show the word or number next to it. */
export function MoodIcon({ mood, className }: { mood: number; className?: string }) {
  const band = moodBand(mood)
  const Icon = band.icon
  return <Icon className={cn('size-5 shrink-0', band.text, className)} aria-hidden />
}

/** Face + word + number: "(face) Good 7/10". `number` can show an average like 6.5. */
export function MoodBadge({ mood, showNumber = true, className }: { mood: number; showNumber?: boolean; className?: string }) {
  const band = moodBand(mood)
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-1.5 text-sm font-medium', band.soft, className)}>
      <MoodIcon mood={mood} className="size-4" />
      {band.word}
      {showNumber && <span className="text-muted-foreground tabular-nums">{mood}/10</span>}
    </span>
  )
}

/** Battery icon + "High energy 8/10" */
export function EnergyLabel({ energy, className }: { energy: number; className?: string }) {
  const band = energyBand(energy)
  const Icon = band.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icon className="size-4 shrink-0 text-learning-foreground" aria-hidden />
      {band.word} <span className="text-muted-foreground tabular-nums">{energy}/10</span>
    </span>
  )
}
