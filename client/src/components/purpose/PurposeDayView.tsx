// A day's purposes, read-only: each purpose as its own small block (text, focus value chips,
// intentions done / not done and its evening rating), then the day's evening note.
import { Check, Clock, Lock, Star, Target, X } from 'lucide-react'
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

/** 1–5 stars, read-only. */
export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  return (
    <p className={cn('flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('size-4', n <= rating ? 'fill-current text-learning' : 'text-muted-foreground/60')} aria-hidden />
      ))}
      <span className="sr-only">Lived this purpose: {rating} out of 5</span>
    </p>
  )
}

/** One purpose, read-only. */
export function PurposeBlockView({ purpose }: { purpose: DayPurpose }) {
  return (
    <div className="space-y-2">
      <p className="flex items-start gap-2 font-serif text-lg leading-snug">
        <Target className="mt-1 size-4 shrink-0 text-mental" aria-hidden />
        <span className={cn('min-w-0 break-words whitespace-pre-line', !purpose.text && 'text-muted-foreground italic')}>
          {purpose.text || 'Intentions for the day'}
        </span>
      </p>
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
      {purpose.rating !== null && <RatingStars rating={purpose.rating} />}
    </div>
  )
}

/** Every purpose of the day, then the evening note. */
export function PurposeDayView({ day, className }: { day: DayPurposes; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {day.purposes.length > 0 && (
        <ul className="space-y-3" aria-label={`${day.purposes.length} ${day.purposes.length === 1 ? 'purpose' : 'purposes'}`}>
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

/** A past day's purposes can't be changed any more. */
export function LockedLabel({ className }: { className?: string }) {
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Lock className="size-4" aria-hidden /> Locked · this day has ended
    </p>
  )
}

/** Today's purposes can be changed until midnight (Asia/Colombo). */
export function EditableUntilLabel({ className }: { className?: string }) {
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Clock className="size-4" aria-hidden /> Editable until 11:59 PM
    </p>
  )
}
