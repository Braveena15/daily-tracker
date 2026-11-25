// The intraday mood chart, loaded only when a day page shows them, so the chart library
// (the biggest dependency) isn't part of the first download.
import { Suspense, type ComponentProps } from 'react'
import { lazyPage } from '@/lib/lazyPage'
import { Skeleton } from '@/components/ui/skeleton'

const Charts = {
  Mood: lazyPage(() => import('./DayCharts').then((m) => m.MoodDayChart)),
}

type MoodProps = ComponentProps<typeof import('./DayCharts').MoodDayChart>

const ChartPlaceholder = () => <Skeleton className="h-72 w-full rounded-2xl" aria-label="Loading chart" />

export function MoodDayChart(props: MoodProps) {
  return (
    <Suspense fallback={<ChartPlaceholder />}>
      <Charts.Mood {...props} />
    </Suspense>
  )
}

