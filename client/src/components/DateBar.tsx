import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { addDays, formatDate, fromLocalDate, relativeDay, toLocalDate } from '@/lib/dates'

/** ‹ Today › with a calendar picker in the middle. Future days can't be chosen. */
export function DateBar({ date, today, onChange }: { date: string; today: string; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false)
  const title = relativeDay(date, today)
  const subtitle = formatDate(date, today)

  return (
    <Card size="sm" className="flex-row items-center justify-between gap-2 px-(--card-spacing)">
      <Button type="button" variant="ghost" size="icon" aria-label="Previous day" onClick={() => onChange(addDays(date, -1))}>
        <ChevronLeft />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-w-0 flex-col gap-0 rounded-xl px-4 py-1.5"
            aria-label={`Choose a date, showing ${subtitle}`}
          >
            <span className="font-heading text-lg font-semibold">{title}</span>
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden />
              {title === subtitle ? 'Pick a date' : subtitle}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="center">
          <Calendar
            mode="single"
            selected={toLocalDate(date)}
            defaultMonth={toLocalDate(date)}
            endMonth={toLocalDate(today)}
            disabled={{ after: toLocalDate(today) }}
            onSelect={(picked) => {
              if (!picked) return
              onChange(fromLocalDate(picked))
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Next day"
        disabled={date >= today}
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronRight />
      </Button>
    </Card>
  )
}
