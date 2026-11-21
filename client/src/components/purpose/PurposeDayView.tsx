// A day's purposes, read-only: each purpose line, focus value chips, intentions (done / not done) and the evening rating.
import { Check, Clock, Lock, Star, Target, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { type DailyPurpose } from '@/lib/purpose'
import { cn } from '@/lib/utils'

/** One purpose as a line; several as a list, each with a small target mark. */
function PurposeLines({ purpose }: { purpose: DailyPurpose }) {
  const lines = purpose.purposes ?? (purpose.text ? [{ id: 'text', text: purpose.text }] : [])
  if (lines.length === 0) return null
  if (lines.length === 1) return <p className="font-serif text-lg leading-snug whitespace-pre-line">{lines[0]!.text}</p>
  return (
    <ul className="space-y-1.5" aria-label={`${lines.length} purposes`}>
      {lines.map((line) => (
        <li key={line.id} className="flex items-start gap-2 font-serif text-lg leading-snug">
          <Target className="mt-1 size-4 shrink-0 text-mental" aria-hidden />
          <span className="min-w-0 break-words whitespace-pre-line">{line.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function PurposeDayView({ purpose, className }: { purpose: DailyPurpose; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <PurposeLines purpose={purpose} />
      {purpose.focusValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {purpose.focusValues.map((v) => (
            <Badge key={v} variant="secondary" className="bg-mental-soft text-mental-foreground">
              {v}
            </Badge>
          ))}
        </div>
      )}
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
      {purpose.reflection && (
        <div className="text-sm">
          <p className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn('size-4', n <= purpose.reflection!.rating ? 'fill-current text-learning' : 'text-muted-foreground/60')}
                aria-hidden
              />
            ))}
            <span className="sr-only">Lived my purpose: {purpose.reflection.rating} out of 5</span>
          </p>
          {purpose.reflection.note && <p className="mt-0.5 text-muted-foreground italic">{purpose.reflection.note}</p>}
        </div>
      )}
    </div>
  )
}

/** A past day's purpose can't be changed any more. */
export function LockedLabel({ className }: { className?: string }) {
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Lock className="size-4" aria-hidden /> Locked · this day has ended
    </p>
  )
}

/** Today's purpose can be changed until midnight (Asia/Colombo). */
export function EditableUntilLabel({ className }: { className?: string }) {
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Clock className="size-4" aria-hidden /> Editable until 11:59 PM
    </p>
  )
}
