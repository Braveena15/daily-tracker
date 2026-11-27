// /journey/history — every past program (completed, ended early, unfinished) with its report.
import { Link } from 'react-router-dom'
import { ArrowRight, Route } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { useFetch } from '@/hooks/useFetch'
import { formatLongDate } from '@/lib/dates'
import type { Program } from '@/lib/program'

const STATUS: Record<Program['status'], string> = {
  active: 'In progress',
  completed: 'Completed',
  ended_early: 'Ended early',
  abandoned: 'Not finished',
}

function summary(p: Program): string {
  if (p.status === 'ended_early') return `${p.endedOnDay} of ${p.lengthDays} days`
  if (p.status === 'active') return `Day ${p.clock.dayNumber} of ${p.lengthDays}`
  return `${p.lengthDays} days`
}

export function JourneyHistory() {
  const { data, error } = useFetch<{ programs: Program[] }>('/programs')
  return (
    <>
      <PageHeader title="Past journeys" back={{ to: '/journey', label: 'My Journey' }} />
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <Skeleton className="h-48 w-full max-w-3xl rounded-2xl" />
      ) : data.programs.length === 0 ? (
        <EmptyState icon={Route} title="No journeys yet" className="py-10">
          <Link to="/journey" className="text-primary hover:underline">
            Start your first journey
          </Link>
        </EmptyState>
      ) : (
        <ul className="max-w-3xl space-y-2">
          {data.programs.map((p) => (
            <li key={p.id}>
              <Link
                to={p.status === 'active' ? '/journey' : `/journey/${p.id}/report`}
                className="group flex items-center gap-3 surface p-4 transition-all outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>{STATUS[p.status]}</Badge>
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {formatLongDate(p.startDate)} · {summary(p)}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  {p.status === 'active' ? 'Open' : 'Report'} <ArrowRight className="size-4" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
