import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { SupportButton } from '@/components/mind/Support'
import { useFetch } from '@/hooks/useFetch'
import { api } from '@/lib/api'
import { relativeDay, todayInTimezone } from '@/lib/dates'
import { strongestFeeling, type ThoughtLog, type ThoughtResponse, type ThoughtStats } from '@/lib/mind'
import { CardChevron } from '@/components/CardChevron'

export function Thoughts() {
  const [logs, setLogs] = useState<ThoughtLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { data: stats } = useFetch<ThoughtStats>('/thoughts/stats')
  const today = todayInTimezone()

  useEffect(() => {
    api
      .get<{ logs: ThoughtLog[] }>('/thoughts')
      .then((data) => setLogs(data.logs))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your thought logs'))
  }, [])

  async function toggleStep(log: ThoughtLog, done: boolean) {
    setLogs((list) => list?.map((l) => (l.id === log.id ? { ...l, smallStepDone: done } : l)) ?? null)
    try {
      const data = await api.put<ThoughtResponse>(`/thoughts/${log.id}`, { smallStepDone: done })
      setLogs((list) => list?.map((l) => (l.id === log.id ? data.log : l)) ?? null)
      if (done) toast.success('Small step done — nice one')
    } catch (err) {
      setLogs((list) => list?.map((l) => (l.id === log.id ? log : l)) ?? null)
      toast.error(err instanceof Error ? err.message : 'Could not update')
    }
  }

  return (
    <>
      <PageHeader
        title="Thought log"
        description="When a thought weighs on you, walk through it one step at a time."
        action={
          <Button asChild>
            <Link to="/thoughts/new">
              <Plus aria-hidden /> New
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 md:space-y-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-stretch">
          <Card size="sm">
            <CardContent>
              <p className="text-sm text-muted-foreground">This month</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">{stats ? stats.thisMonth : '–'}</p>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent>
              <p className="text-sm text-muted-foreground">Average change in intensity</p>
              <p className="font-heading text-2xl font-semibold tabular-nums">
                {!stats || stats.averageDrop === null
                  ? '–'
                  : stats.averageDrop > 0
                    ? `eased by ${stats.averageDrop}`
                    : stats.averageDrop === 0
                      ? 'about the same'
                      : `up by ${Math.abs(stats.averageDrop)}`}
              </p>
            </CardContent>
          </Card>
          <div className="flex items-center">
            <SupportButton />
          </div>
        </div>

        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !logs ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <EmptyState
              icon={Brain}
              tone="mental"
              title="No thought logs yet"
              action={
                <Button asChild>
                  <Link to="/thoughts/new">
                    <Plus aria-hidden /> Start one
                  </Link>
                </Button>
              }
            >
              Next time a thought keeps circling, try writing it down here. It takes about five minutes.
            </EmptyState>
          </Card>
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => {
              const before = strongestFeeling(log.feelings)
              return (
                <li key={log.id}>
                  <Card size="sm">
                    <CardContent className="space-y-3">
                      <Link to={`/thoughts/${log.id}`} className="group flex items-start gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                        <IconBubble icon={Brain} tone="mental" className="size-9" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {relativeDay(log.date, today)}
                            {log.isPrivate && (
                              <>
                                · <Lock className="size-4" aria-hidden /> private
                              </>
                            )}
                          </p>
                          <p className="line-clamp-2 font-serif text-lg leading-snug">"{log.thought}"</p>
                          {log.balancedThought && <p className="line-clamp-2 text-sm text-muted-foreground">→ {log.balancedThought}</p>}
                        </div>
                        <CardChevron className="mt-1" />
                      </Link>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {log.feelings.map((f) => (
                          <Badge key={f.name} variant="secondary" className="bg-mental-soft text-mental-foreground">
                            {f.name} {f.intensityBefore}
                          </Badge>
                        ))}
                        {before && log.intensityAfter !== null && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {before.intensityBefore} → {log.intensityAfter}
                          </span>
                        )}
                      </div>

                      {log.smallStep && (
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-muted/60 p-3 text-sm">
                          <Checkbox checked={log.smallStepDone} onCheckedChange={(v) => void toggleStep(log, v === true)} aria-label={`Small step done: ${log.smallStep}`} />
                          <span className={log.smallStepDone ? 'text-muted-foreground line-through' : ''}>{log.smallStep}</span>
                        </label>
                      )}
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
