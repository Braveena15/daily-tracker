// The "Time" field shared by every add/edit form on the Today page.
//
// - Today: starts at the current time and follows the clock (checked every few seconds) until you
//   change it by hand to back-fill an earlier time. "Now" jumps back to the current time and to
//   following the clock. A time later than now is rejected.
// - A past day: starts empty and is required ("When did this happen?").
// - Editing an entry: starts at the entry's own time and doesn't follow the clock.
import { useId } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TimeInput } from '@/hooks/useTimeInput'
import { isFutureTimeToday, nowHHmm } from '@/lib/time'

export function TimeField({ input }: { input: TimeInput }) {
  const id = useId()
  const hintId = `${id}-hint`
  const future = input.isToday && input.value !== '' && isFutureTimeToday(input.value)

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Time{!input.isToday && <span aria-hidden> *</span>}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="time"
          className="w-36"
          required={!input.isToday}
          max={input.isToday ? nowHHmm() : undefined}
          value={input.value}
          onChange={(e) => input.change(e.target.value)}
          aria-invalid={future || undefined}
          aria-describedby={hintId}
        />
        {input.isToday && (
          <Button type="button" variant="ghost" size="sm" onClick={input.now} aria-label="Set the time to now">
            <Clock aria-hidden /> Now
          </Button>
        )}
      </div>
      <p id={hintId} className={future ? 'text-xs text-destructive' : input.isToday ? 'sr-only' : 'text-xs text-muted-foreground'}>
        {future ? "Time can't be in the future" : input.isToday ? 'Change it to log something from earlier today' : 'When did this happen?'}
      </p>
    </div>
  )
}
