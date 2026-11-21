// The two intraday charts, loaded only when a day page shows them, so the chart library
// (the biggest dependency) isn't part of the first download.
import { Suspense, type ComponentProps } from 'react'
import { lazyPage } from '@/lib/lazyPage'
import { Skeleton } from '@/components/ui/skeleton'

const Charts = {
  Mood: lazyPage(() => import('./DayCharts').then((m) => m.MoodDayChart)),
  Activity: lazyPage(() => import('./DayCharts').then((m) => m.ActivityDayChart)),
}

type MoodProps = ComponentProps<typeof import('./DayCharts').MoodDayChart>
type ActivityProps = ComponentProps<typeof import('./DayCharts').ActivityDayChart>

const ChartPlaceholder = () => <Skeleton className="h-72 w-full rounded-2xl" aria-label="Loading chart" />

export function MoodDayChart(props: MoodProps) {
  return (
    <Suspense fallback={<ChartPlaceholder />}>
      <Charts.Mood {...props} />
    </Suspense>
  )
}

export function ActivityDayChart(props: ActivityProps) {
  return (
    <Suspense fallback={<ChartPlaceholder />}>
      <Charts.Activity {...props} />
    </Suspense>
  )
}
