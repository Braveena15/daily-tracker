// Everything logged on a day, in time order: mood check-ins, workouts, good things, syncs…
import { ListOrdered } from 'lucide-react'
import { IconBubble } from '@/components/IconBubble'
import { EmptyState } from '@/components/StatusViews'
import { timeOf } from '@/lib/healthSync'
import { TIMELINE_STYLE, type TimelineItem } from '@/lib/entries'
import { cn } from '@/lib/utils'

export function DayTimeline({ items, emptyText, className }: { items: TimelineItem[]; emptyText?: string; className?: string }) {
  if (items.length === 0) {
    return (
      <EmptyState icon={ListOrdered} title="Nothing logged yet" className="py-6">
        {emptyText ?? 'Entries you add show up here in time order.'}
      </EmptyState>
    )
  }

  return (
    <ol className={cn('relative space-y-3', className)}>
      {/* The line joining the icons */}
      <span className="absolute top-5 bottom-5 left-5 w-px bg-border" aria-hidden />
      {items.map((item, i) => {
        const style = TIMELINE_STYLE[item.kind]
        return (
          <li key={item.id ?? `${item.kind}-${item.time}-${i}`} className="relative flex items-start gap-3">
            <IconBubble icon={style.icon} tone={style.tone} className="relative ring-4 ring-card" />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <time dateTime={item.time} className="font-semibold text-foreground tabular-nums">
                  {timeOf(item.time)}
                </time>
                {style.label}
              </p>
              <p className="text-sm break-words">{item.summary}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
