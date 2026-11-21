// A day's purpose, read-only: the text, focus value chips, intentions with ✓/✗ and the evening rating.
import { Badge } from '@/components/ui/badge'
import { stars, type DailyPurpose } from '@/lib/purpose'
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
              <span aria-hidden className={i.done ? 'text-success' : 'text-muted-foreground'}>
                {i.done ? '✓' : '✗'}
              </span>
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
          <p>
            <span className="text-learning" aria-hidden>
              {stars(purpose.reflection.rating)}
            </span>
            <span className="sr-only">Lived my purpose: {purpose.reflection.rating} out of 5</span>
          </p>
          {purpose.reflection.note && <p className="mt-0.5 text-muted-foreground italic">{purpose.reflection.note}</p>}
        </div>
      )}
    </div>
  )
}
