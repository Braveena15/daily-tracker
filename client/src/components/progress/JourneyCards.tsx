import { Flame, Sprout } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorNotice } from '@/components/StatusViews'
import { useFetch } from '@/hooks/useFetch'
import { formatDate } from '@/lib/dates'
import type { StreakResponse } from '@/lib/entries'
import type { JourneyResponse } from '@/lib/progress'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "Day X of 100" with a progress bar, next to the streak. */
export function JourneyRow() {
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-6">
      <JourneyCard />
      <StreakCard />
    </div>
  )
}

function JourneyCard() {
  const { data, error } = useFetch<JourneyResponse>('/progress/journey')

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !data ? (
          <>
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-2.5 w-full rounded-full" />
            <Skeleton className="h-4 w-48" />
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-heading text-2xl font-semibold">
                {data.complete ? 'Journey complete' : `Day ${data.dayNumber} of ${data.totalDays}`}
              </p>
              <span className="text-sm text-muted-foreground tabular-nums">{data.percentComplete}%</span>
            </div>
            <Progress value={data.percentComplete} aria-label={`Day ${data.dayNumber} of ${data.totalDays}`} className="h-2.5" />
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Sprout className="size-4 text-primary" aria-hidden />
              {plural(data.daysLogged, 'day')} logged · {data.complete ? 'ended' : 'ends'} {formatDate(data.endDate)}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StreakCard() {
  const { data, error } = useFetch<StreakResponse>('/entries/stats/streak')

  return (
    <Card size="sm">
      <CardContent className="flex h-full items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-physical-soft text-physical" aria-hidden>
          <Flame className="size-6" />
        </span>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !data ? (
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <div className="min-w-0">
            <p className="font-heading text-2xl font-semibold tabular-nums">
              {plural(data.current, 'day')}
            </p>
            <p className="text-sm text-muted-foreground">
              {data.current === 0 ? 'Check in to start a streak' : `Best: ${plural(data.longest, 'day')}`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
