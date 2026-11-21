// The date-picker calendar (react-day-picker + date-fns), loaded only when a picker is opened.
// Pickers sit inside popovers, whose content isn't rendered until they open.
import { Suspense, type ComponentProps } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { lazyPage } from '@/lib/lazyPage'

const LoadedCalendar = lazyPage(() => import('@/components/ui/calendar').then((m) => m.Calendar))

/** Same props as ui/calendar's Calendar; shows a calendar-sized placeholder for the moment it loads. */
export function Calendar(props: ComponentProps<typeof import('@/components/ui/calendar').Calendar>) {
  return (
    <Suspense fallback={<Skeleton className="h-[19rem] w-[17rem] rounded-xl" aria-label="Loading calendar" />}>
      <LoadedCalendar {...props} />
    </Suspense>
  )
}
