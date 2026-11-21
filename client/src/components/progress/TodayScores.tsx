import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gauge, SquarePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { ProgressRing } from '@/components/ProgressRing'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { useFetch } from '@/hooks/useFetch'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { todayInTimezone } from '@/lib/dates'
import { AREAS, type Area, type DayScoresResponse } from '@/lib/progress'
import { cn } from '@/lib/utils'

// Written out in full so Tailwind generates them
const BAR_CLASS: Record<Area, string> = { physical: 'bg-physical', mental: 'bg-mental', learning: 'bg-learning' }
const ICON_CLASS: Record<Area, string> = { physical: 'text-physical', mental: 'text-mental', learning: 'text-learning' }

/** Today's three area rings + overall. Tapping a ring shows how its score was worked out. */
export function TodayScores() {
  const { data, error } = useFetch<DayScoresResponse>(`/scores/${todayInTimezone()}`)
  const [open, setOpen] = useState<Area | null>(null)
  const [shown, setShown] = useState<Area>('physical') // keeps content while the sheet closes

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBubble icon={Gauge} />
          <div>
            <CardTitle className="text-lg font-semibold">Today's scores</CardTitle>
            {data?.logged && <CardDescription>Tap a ring to see how it's worked out</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !data ? (
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around" aria-busy="true">
            <Skeleton className="size-[120px] rounded-full" />
            <div className="flex gap-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="size-[84px] rounded-full" />
              ))}
            </div>
          </div>
        ) : !data.logged || data.overall === null ? (
          <EmptyState
            icon={SquarePen}
            title="Log today to see your scores"
            className="py-4"
            action={
              <Button asChild>
                <Link to="/today">
                  <SquarePen aria-hidden /> Log today
                </Link>
              </Button>
            }
          >
            Your physical, mental and learning scores appear once you check in.
          </EmptyState>
        ) : (
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-around">
            <div className="flex flex-col items-center gap-1">
              <ProgressRing value={data.overall} max={100} size={124} stroke={12} label={`Overall score ${data.overall} out of 100`}>
                <div>
                  <p className="font-heading text-3xl font-semibold tabular-nums">{data.overall}</p>
                  <p className="text-xs text-muted-foreground">overall</p>
                </div>
              </ProgressRing>
              <p className="text-xs text-muted-foreground">Average of the three</p>
            </div>

            <ul className="grid grid-cols-3 gap-3 sm:gap-5">
              {AREAS.map((area) => {
                const score = data[area.key].score ?? 0
                return (
                  <li key={area.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setShown(area.key)
                        setOpen(area.key)
                      }}
                      className="flex flex-col items-center gap-1.5 rounded-2xl p-1.5 transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
                    >
                      <span className="sr-only">
                        {area.label} score {score} out of 100. Show breakdown
                      </span>
                      <ProgressRing value={score} max={100} size={84} stroke={9} className={area.ringClass} label="">
                        <span className="font-heading text-xl font-semibold tabular-nums">{score}</span>
                      </ProgressRing>
                      <span className="flex items-center gap-1 text-xs font-medium" aria-hidden>
                        <area.icon className={cn('size-3.5', ICON_CLASS[area.key])} aria-hidden />
                        {area.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </CardContent>

      {data?.logged && <BreakdownSheet data={data} area={shown} open={open !== null} onClose={() => setOpen(null)} />}
    </Card>
  )
}

function BreakdownSheet({ data, area, open, onClose }: { data: DayScoresResponse; area: Area; open: boolean; onClose: () => void }) {
  const desktop = useMediaQuery('(min-width: 768px)')
  const info = AREAS.find((a) => a.key === area)!
  const result = data[area]

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={desktop ? 'right' : 'bottom'}
        className={cn('gap-0 p-0', desktop ? 'w-full sm:max-w-md' : 'max-h-[85dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]')}
      >
        <SheetHeader className="border-b px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <IconBubble icon={info.icon} tone={info.tone} />
            <div>
              <SheetTitle className="text-xl font-semibold">
                {info.label} · {result.score ?? 0}/100
              </SheetTitle>
              <SheetDescription>How today's score adds up</SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <ul className="space-y-4 overflow-y-auto p-5">
          {result.breakdown.map((line) => (
            <li key={line.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{line.label}</span>
                <span className="text-sm tabular-nums">
                  <span className="font-semibold">{line.points}</span>
                  <span className="text-muted-foreground">/{line.max}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-[width] duration-500', BAR_CLASS[area])}
                  style={{ width: `${(line.points / line.max) * 100}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">{line.reason}</p>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
