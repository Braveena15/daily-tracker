// The night's sleep from Apple Health, with the score Daily Tracker calculated (see server/src/utils/sleep.ts).
import { useState } from 'react'
import { Info, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { IconBubble } from '@/components/IconBubble'
import { ProgressRing } from '@/components/ProgressRing'
import { WatchMark } from '@/components/CheckinFields'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { SleepSummary } from '@/lib/entries'
import { cn } from '@/lib/utils'

/** "7 h 32 min", "45 min", "8 h". */
function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const STAGES = [
  { key: 'deepMin', label: 'Deep', className: 'bg-mental-foreground' },
  { key: 'coreMin', label: 'Core', className: 'bg-mental' },
  { key: 'remMin', label: 'REM', className: 'bg-outdoor' },
] as const

export function SleepCard({ sleep }: { sleep: SleepSummary }) {
  const [open, setOpen] = useState(false)
  const staged = sleep.deepMin + sleep.coreMin + sleep.remMin
  const awake =
    sleep.awakeCount === 0 ? 'No time awake' : `Awake ${sleep.awakeCount} ${sleep.awakeCount === 1 ? 'time' : 'times'} · ${formatSleep(sleep.awakeMin)}`

  return (
    <div className="space-y-3 rounded-2xl bg-mental-soft/60 p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-mental-foreground">
        <WatchMark /> Sleep score (calculated by Daily Tracker)
      </p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <ProgressRing value={sleep.score} max={100} size={112} stroke={11} className="stroke-mental" label={`Sleep score ${sleep.score} out of 100`}>
          <div>
            <p className="font-heading text-3xl font-semibold tabular-nums">{sleep.score}</p>
            <p className="text-xs text-muted-foreground">of 100</p>
          </div>
        </ProgressRing>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <p className="font-heading text-2xl font-semibold">{formatSleep(sleep.totalSleepMin)}</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {sleep.bedtime} → {sleep.wakeTime} · {awake}
            </p>
          </div>

          {staged > 0 && (
            <div className="space-y-1.5">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={STAGES.map((s) => `${s.label} ${formatSleep(sleep[s.key])}`).join(', ')}>
                {STAGES.map((s) => (
                  <div key={s.key} className={s.className} style={{ width: `${(sleep[s.key] / staged) * 100}%` }} />
                ))}
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-hidden>
                {STAGES.map((s) => (
                  <li key={s.key} className="flex items-center gap-1.5">
                    <span className={cn('size-2 rounded-full', s.className)} />
                    {s.label} {formatSleep(sleep[s.key])}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Button type="button" variant="ghost" size="sm" className="-ml-2 text-mental-foreground" onClick={() => setOpen(true)}>
        <Info aria-hidden /> How is this calculated?
      </Button>
      <SleepBreakdownSheet sleep={sleep} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}

function SleepBreakdownSheet({ sleep, open, onClose }: { sleep: SleepSummary; open: boolean; onClose: () => void }) {
  const desktop = useMediaQuery('(min-width: 768px)')

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={desktop ? 'right' : 'bottom'}
        className={cn('gap-0 p-0', desktop ? 'w-full sm:max-w-md' : 'max-h-[85dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]')}
      >
        <SheetHeader className="border-b px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <IconBubble icon={Moon} tone="mental" />
            <div>
              <SheetTitle className="text-xl font-semibold">Sleep score · {sleep.score}/100</SheetTitle>
              <SheetDescription>Calculated by Daily Tracker from your Apple Health sleep</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="space-y-5 overflow-y-auto p-5">
          <ul className="space-y-4">
            {sleep.breakdown.map((line) => (
              <li key={line.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{line.label}</span>
                  <span className="text-sm tabular-nums">
                    <span className="font-semibold">{line.points}</span>
                    <span className="text-muted-foreground">/{line.max}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full bg-mental" style={{ width: `${(line.points / line.max) * 100}%` }} />
                </div>
                <p className="text-sm text-muted-foreground">{line.reason}</p>
              </li>
            ))}
          </ul>
          <div className="space-y-2 rounded-xl bg-muted/60 p-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Duration (50):</span> full points for 7–9 h asleep, falling to 0 at
              4 h. Above 9 h it eases down to 40 at 11 h.
            </p>
            <p>
              <span className="font-medium text-foreground">Bedtime consistency (30):</span> full points within 30 min of your
              average bedtime over the last 14 nights, falling to 0 at 2 h. Until there are 3 nights, you get full points.
            </p>
            <p>
              <span className="font-medium text-foreground">Interruptions (20):</span> 4 points off for each time awake after the
              first, and 1 off for every 5 minutes awake beyond 10.
            </p>
            <p>
              Time asleep is Core + Deep + REM (plus any unspecified “Asleep”); “In Bed” isn't counted. Watch and iPhone readings of the same minutes are only counted once. This is our
              own score, modelled on Apple's weighting, so it can differ from the Sleep Score on your Watch.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
