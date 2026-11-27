// /journey — "My Journey": everything about programs. With an active program: the big countdown
// note, where I started vs my goal vs now, weekly progress, habits and check-ins. Without one: an
// inviting start screen (30/60/90/100 days), plus the last program's result.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, CalendarDays, CalendarRange, ClipboardCheck, Flag, History as HistoryIcon, Rocket, Route, Sparkles, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { ErrorNotice } from '@/components/StatusViews'
import { StickyNote } from '@/components/journey/StickyNote'
import { CheckInDialog } from '@/components/journey/CheckIn'
import { EndProgramDialog } from '@/components/journey/EndProgram'
import { api } from '@/lib/api'
import { useFetch } from '@/hooks/useFetch'
import { formatDate, formatLongDate } from '@/lib/dates'
import {
  PROGRAM_PRESETS,
  endedLabel,
  ratingLabel,
  type ActiveProgramResponse,
  type CompareRow,
  type Program,
  type ProgramProgress,
} from '@/lib/program'
import { cn } from '@/lib/utils'

const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`

export function Journey() {
  // Bumped after a check-in, ending or undoing, to load the page again
  const [version, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)
  const { data, error } = useFetch<ActiveProgramResponse>(`/programs/active?v=${version}`)

  return (
    <>
      <PageHeader
        title="My Journey"
        description="Your transformation, one day at a time."
        action={
          <Button asChild variant="outline" size="sm" className="size-10 rounded-xl p-0 sm:w-auto sm:px-3">
            <Link to="/history" aria-label="History">
              <CalendarDays aria-hidden />
              <span className="hidden sm:inline">History</span>
            </Link>
          </Button>
        }
      />
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : data.program ? (
        <ActiveJourney key={`${data.program.id}-${version}`} program={data.program} onChanged={refresh} />
      ) : (
        <StartScreen latest={data.latestEnded} onChanged={refresh} />
      )}
    </>
  )
}

// ---------- No active program ----------

function StartScreen({ latest, onChanged }: { latest: Program | null; onChanged: () => void }) {
  const finished = latest && (latest.status === 'ended_early' || latest.status === 'completed')
  const [undoing, setUndoing] = useState(false)

  async function undo() {
    if (!latest) return
    setUndoing(true)
    try {
      await api.post(`/programs/${latest.id}/undo-end`)
      toast.success('Welcome back — your journey continues')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not undo')
      setUndoing(false)
    }
  }
  return (
    <div className="space-y-4 md:space-y-6">
      {finished && (
        <Card size="sm">
          <CardContent className="flex flex-wrap items-center gap-3">
            <IconBubble icon={Sparkles} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {endedLabel(latest)} · {latest.name}
              </p>
              <p className="text-sm text-muted-foreground">Every day you showed up counts.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {latest.canUndoEnd && (
                <Button type="button" variant="ghost" size="sm" loading={undoing} disabled={undoing} onClick={() => void undo()}>
                  <Undo2 aria-hidden /> Undo ending
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to={`/journey/${latest.id}/report`}>View your report</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardContent className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
          <div className="mx-auto pt-4 md:mx-0 md:pl-2">
            <div aria-hidden className="relative w-52 rounded-sm bg-[#fdf1a8] p-6 pt-8 text-[#3d3415] shadow-[0_10px_24px_-12px_rgba(60,50,10,0.45)] motion-safe:-rotate-2 dark:bg-[#5a5222] dark:text-[#fbf4cf]">
              <span className="absolute top-0 left-1/2 h-5 w-20 -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-white/60 dark:bg-white/20" />
              <p className="font-heading text-7xl leading-none font-semibold">Day 1</p>
              <p className="mt-2 text-lg font-medium">starts today</p>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold">{finished ? 'Ready for your next journey?' : 'Start your journey'}</h2>
              <p className="mt-1 text-muted-foreground">
                Write down where you are now, where you want to be, and a simple daily plan. Then take it one day at a time — you can end it any day, and your report shows what you achieved.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROGRAM_PRESETS.map((d) => (
                <Link
                  key={d}
                  to={`/journey/new?days=${d}${finished ? `&from=${latest.id}` : ''}`}
                  className="rounded-xl border p-3 text-center outline-none hover:border-primary hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="block font-heading text-2xl font-semibold">{d}</span>
                  <span className="text-xs text-muted-foreground">days</span>
                </Link>
              ))}
            </div>
            <Link to={`/journey/new${finished ? `?from=${latest.id}` : ''}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Or choose your own length <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </CardContent>
      </Card>

      <Link to="/journey/history" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline">
        <HistoryIcon className="size-4" aria-hidden /> Past journeys and reports
      </Link>
    </div>
  )
}

// ---------- Active program ----------

function ActiveJourney({ program, onChanged }: { program: Program; onChanged: () => void }) {
  const { data, error } = useFetch<ProgramProgress>(`/programs/${program.id}/progress`)
  const [checkIn, setCheckIn] = useState(false)
  const [ending, setEnding] = useState<'end' | 'restart' | null>(null)
  const due = program.dueCheckIn

  async function deleteUpcoming() {
    if (!window.confirm(`Delete "${program.name}"? It hasn't started, so there's nothing to report yet.`)) return
    try {
      await api.delete(`/programs/${program.id}`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete it')
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <Card className="overflow-visible">
        <CardContent className="flex flex-col items-center gap-6 pt-2 sm:flex-row sm:items-center">
          <StickyNote program={program} className="mt-3 shrink-0" />
          <div className="w-full min-w-0 space-y-3">
            <div>
              <h2 className="text-2xl font-semibold">{program.name}</h2>
              <p className="text-sm text-muted-foreground">
                {formatLongDate(program.startDate)} → {formatLongDate(program.plannedEndDate)}
              </p>
            </div>
            {data && (
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Days logged" value={`${data.stats.daysLogged}`} />
                <Stat label="Consistency" value={`${data.stats.consistency}%`} />
                <Stat label="Best streak" value={`${data.stats.streaks.longest}`} />
              </dl>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to={`/journey/${program.id}/report`}>Report so far</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/journey/history">
                  <HistoryIcon aria-hidden /> Past journeys
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {due && (
        <Card size="sm" className="ring-primary/40">
          <CardContent className="flex flex-wrap items-center gap-3">
            <IconBubble icon={ClipboardCheck} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{due === 'midpoint' ? 'Your halfway check-in is ready' : 'Your final check-in is ready'}</p>
              <p className="text-sm text-muted-foreground">A few minutes: weight, ratings and how it's going. You can skip it.</p>
            </div>
            <Button type="button" onClick={() => setCheckIn(true)}>
              Check in
            </Button>
          </CardContent>
          <CheckInDialog program={program} kind={due} open={checkIn} onOpenChange={setCheckIn} onDone={onChanged} />
        </Card>
      )}

      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <>
          <CompareCard progress={data} />
          <WeeksCard progress={data} />
          {data.stats.habits.length > 0 && <HabitsCard progress={data} />}
        </>
      )}

      <Card size="sm">
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Life changes, and that's okay. Ending a program keeps everything you logged, and creates your report.</p>
          {program.clock.phase === 'upcoming' ? (
            <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={() => void deleteUpcoming()}>
              Delete this program (it hasn't started)
            </Button>
          ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setEnding('end')}>
              <Flag aria-hidden /> End this program
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEnding('restart')}>
              <Rocket aria-hidden /> End this program & start a new one
            </Button>
          </div>
          )}
        </CardContent>
      </Card>
      {ending && (
        <EndProgramDialog
          program={program}
          open
          startNew={ending === 'restart'}
          onOpenChange={(o) => !o && setEnding(null)}
          onEnded={onChanged}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-heading text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/** Where I started, my goal and where I am now: weight and the ratings. */
function CompareCard({ progress }: { progress: ProgramProgress }) {
  const w = progress.weight
  const ratings = progress.ratings.filter((r) => r.before !== null || r.goal !== null || r.latest !== null)
  const source = progress.latest.source === 'entries' ? 'your latest entries' : progress.latest.source ? `your ${progress.latest.source} check-in` : null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Where I started · my goal · now</CardTitle>
        <CardDescription>{source ? `"Now" comes from ${source}.` : 'Add a check-in or log your weight to see where you are now.'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {(w.before !== null || w.goal !== null) && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Started" value={w.before !== null ? `${w.before} kg` : '—'} />
            <Stat label="Goal" value={w.goal !== null ? `${w.goal} kg` : '—'} />
            <Stat label="Now" value={w.latest !== null ? `${w.latest} kg` : '—'} />
            {w.change !== null && (
              <p className="col-span-3 text-sm text-muted-foreground">
                {signed(w.change)} kg so far{w.progress !== null && ` · ${w.progress}% of the way to your goal`}
              </p>
            )}
          </div>
        )}
        {ratings.length > 0 && (
          <ul className="space-y-3">
            {ratings.map((r) => (
              <RatingRow key={r.key} row={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RatingRow({ row }: { row: CompareRow }) {
  const pct = (v: number | null) => (v === null ? 0 : v * 10)
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{ratingLabel(row)}</span>
        <span className="text-muted-foreground tabular-nums">
          {row.before ?? '—'} → {row.latest ?? '—'}
          {row.goal !== null && ` (goal ${row.goal})`}
        </span>
      </div>
      {/* Started (light), now (solid) and a tick at the goal */}
      <div className="relative h-2.5 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${pct(row.before)}%` }} />
        {row.latest !== null && <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct(row.latest)}%` }} />}
        {row.goal !== null && <div className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/70" style={{ left: `calc(${pct(row.goal)}% - 1px)` }} />}
      </div>
    </li>
  )
}

function WeeksCard({ progress }: { progress: ProgramProgress }) {
  const weeks = [...progress.stats.weeks].reverse()
  const totalWeeks = Math.ceil(progress.range.days / 7)
  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <IconBubble icon={CalendarRange} />
        <div>
          <CardTitle className="text-lg font-semibold">Week by week</CardTitle>
          <CardDescription>Each week opens its Weekly review.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your first week starts on day 1.</p>
        ) : (
          <ul className="divide-y">
            {weeks.map((w) => (
              <li key={w.week}>
                <Link to={`/review?week=${w.to}`} className="flex items-center gap-3 py-3 outline-none hover:bg-accent/30 focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="w-20 shrink-0">
                    <span className="block font-medium">Week {w.week}</span>
                    <span className="text-xs text-muted-foreground">{w.partial ? 'so far' : `of ${Math.max(totalWeeks, w.week)}`}</span>
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block text-muted-foreground">
                      {formatDate(w.from)} – {formatDate(w.to)}
                    </span>
                    <span className="block">
                      {w.daysLogged}/{w.days} days logged
                      {w.avgOverall !== null && ` · score ${Math.round(w.avgOverall)}`}
                      {w.workouts > 0 && ` · ${w.workouts} workout${w.workouts === 1 ? '' : 's'}`}
                      {w.weightKg !== null && ` · ${w.weightKg} kg`}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function HabitsCard({ progress }: { progress: ProgramProgress }) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <IconBubble icon={Route} />
        <div>
          <CardTitle className="text-lg font-semibold">Daily habits</CardTitle>
          <CardDescription>Ticked on Today · out of the {progress.stats.daysCompleted} days so far</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {progress.stats.habits.map((h) => (
            <li key={h.id} className="space-y-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-medium">{h.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {h.daysDone} days · {h.percent}%
                </span>
              </div>
              <Progress value={h.percent} aria-label={`${h.label}: ${h.percent}%`} className={cn('h-2')} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
