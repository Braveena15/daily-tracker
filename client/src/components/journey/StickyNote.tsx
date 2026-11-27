// The journey countdown as a paper sticky note: a big "87", "days left", "Day 14 of 100" and a
// small progress bar. Slightly rotated (not with reduced motion). The numbers are worked out from
// today's date in Asia/Colombo, so the note moves on at local midnight without reloading.
import { useToday } from '@/hooks/useClock'
import { formatLongDate } from '@/lib/dates'
import { countdownSentence, daysLeftLabel, programClock, type Program } from '@/lib/program'
import { cn } from '@/lib/utils'

export function StickyNote({ program, size = 'large', className }: { program: Pick<Program, 'name' | 'startDate' | 'lengthDays'>; size?: 'large' | 'small'; className?: string }) {
  const today = useToday()
  const c = programClock(program.startDate, program.lengthDays, today)
  const large = size === 'large'
  const big = c.phase === 'upcoming' ? c.startsIn : c.phase === 'finished' ? '✓' : c.daysLeft
  const label = c.phase === 'upcoming' ? (c.startsIn === 1 ? 'day to go' : 'days to go') : c.phase === 'finished' ? 'Completed' : daysLeftLabel(c.daysLeft)
  const sub = c.phase === 'upcoming' ? `Starts ${formatLongDate(program.startDate)}` : c.phase === 'finished' ? `All ${program.lengthDays} days` : `Day ${c.dayNumber} of ${program.lengthDays}`

  return (
    <div
      className={cn(
        // Paper: warm yellow, a soft shadow, a strip of "tape" on top. Readable in both themes.
        'relative rounded-sm bg-[#fdf1a8] text-[#3d3415] shadow-[0_10px_24px_-12px_rgba(60,50,10,0.45)] dark:bg-[#5a5222] dark:text-[#fbf4cf]',
        'motion-safe:-rotate-2 motion-safe:transition-transform motion-safe:hover:rotate-0',
        large ? 'w-56 p-6 pt-8 sm:w-64' : 'w-36 p-3 pt-5',
        className,
      )}
    >
      <span aria-hidden className={cn('absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-white/60 dark:bg-white/20', large ? 'h-5 w-20' : 'h-3.5 w-12')} />
      <p className="sr-only">{countdownSentence(program, today)}</p>
      <div aria-hidden>
        <p className={cn('font-heading leading-none font-semibold tabular-nums', large ? 'text-7xl' : 'text-4xl')}>{big}</p>
        <p className={cn('mt-1 font-medium', large ? 'text-lg' : 'text-sm')}>{label}</p>
        <p className={cn('opacity-75', large ? 'mt-3 text-sm' : 'mt-1 text-xs')}>{sub}</p>
        <div className={cn('overflow-hidden rounded-full bg-[#3d3415]/15 dark:bg-white/20', large ? 'mt-3 h-2' : 'mt-2 h-1.5')}>
          <div className="h-full rounded-full bg-[#3d3415]/70 dark:bg-[#fbf4cf]/80" style={{ width: `${c.phase === 'finished' ? 100 : c.percent}%` }} />
        </div>
      </div>
    </div>
  )
}
