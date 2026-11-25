// "What matters to me today", read-only: each item as its own small block (text, its intensity,
// focus value chips and any intentions done / not done), then the day's evening note.
import { Check, Target, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { type DayPurpose, type DayPurposes } from '@/lib/purpose'
import { cn } from '@/lib/utils'

export function FocusValueChips({ values }: { values: string[] }) {
  if (values.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((v) => (
        <Badge key={v} variant="secondary" className="bg-mental-soft text-mental-foreground">
          {v}
        </Badge>
      ))}
    </div>
  )
}

/** "8/10" with a small bar: how strongly it's felt. Older purposes (no intensity) show nothing. */
export function IntensityBadge({ intensity, className }: { intensity: number | null; className?: string }) {
  if (intensity === null) return null
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full bg-mental-soft px-2 py-0.5 text-xs font-semibold text-mental-foreground tabular-nums', className)}>
      <span aria-hidden className="h-1.5 w-8 overflow-hidden rounded-full bg-mental/20">
        <span className="block h-full rounded-full bg-mental" style={{ width: `${intensity * 10}%` }} />
      </span>
      {intensity}/10
      <span className="sr-only"> intensity</span>
    </span>
  )
}

/** One purpose, read-only. */
export function PurposeBlockView({ purpose }: { purpose: DayPurpose }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Target className="mt-1.5 size-4 shrink-0 text-mental" aria-hidden />
        <p className={cn('min-w-0 flex-1 font-serif text-lg leading-snug break-words whitespace-pre-line', !purpose.text && 'text-muted-foreground italic')}>
          {purpose.text || 'Intentions for the day'}
        </p>
        <IntensityBadge intensity={purpose.intensity} className="mt-1" />
      </div>
      <FocusValueChips values={purpose.focusValues} />
      {purpose.intentions.length > 0 && (
        <ul className="space-y-1 text-sm">
          {purpose.intentions.map((i) => (
            <li key={i.id} className="flex items-start gap-2">
              {i.done ? (
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className={cn('break-words', !i.done && 'text-muted-foreground')}>
                <span className="sr-only">{i.done ? 'Done: ' : 'Not done: '}</span>
                {i.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Every purpose of the day, then the evening note. */
export function PurposeDayView({ day, className }: { day: DayPurposes; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {day.purposes.length > 0 && (
        <ul className="space-y-3" aria-label={`What mattered: ${day.purposes.length} ${day.purposes.length === 1 ? 'thing' : 'things'}`}>
          {day.purposes.map((p) => (
            <li key={p.id} className={cn(day.purposes.length > 1 && 'rounded-xl bg-card/60 p-3 ring-1 ring-foreground/5')}>
              <PurposeBlockView purpose={p} />
            </li>
          ))}
        </ul>
      )}
      {day.reflectionNote && (
        <p className="text-sm text-muted-foreground italic">
          <span className="sr-only">Evening note: </span>
          {day.reflectionNote}
        </p>
      )}
    </div>
  )
}
