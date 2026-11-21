// A day's purpose, read-only: the text, focus value chips, intentions (done / not done) and the evening rating.
import { Check, Clock, Lock, Star, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { type DailyPurpose } from '@/lib/purpose'
import { cn } from '@/lib/utils'

export function PurposeDayView({ purpose, className }: { purpose: DailyPurpose; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)}>
      {purpose.text && <p className="font-serif text-lg leading-snug whitespace-pre-line">{purpose.text}</p>}
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
