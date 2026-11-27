// Today and the Dashboard: the small countdown note (tapping it opens My Journey), the program's
// own daily habits to tick (Today only), "Program ended on day 37 — view your report", or a small
// "Start your journey" card when there's no program.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Route } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { CardChevron } from '@/components/CardChevron'
import { IconBubble } from '@/components/IconBubble'
import { StickyNote } from '@/components/journey/StickyNote'
import { useFetch } from '@/hooks/useFetch'
import { api } from '@/lib/api'
import { endedLabel, type ActiveProgramResponse, type Program } from '@/lib/program'

export function JourneyHomeCard({ habitsFor }: { habitsFor?: { date: string; done: string[] } }) {
  const { data, error } = useFetch<ActiveProgramResponse>('/programs/active')
  if (error) return null
  if (!data) return <Skeleton className="h-36 w-full rounded-2xl" />

  const program = data.program
  if (!program) {
    const ended = data.latestEnded
    return (
      <Link to="/journey" className="group flex items-center gap-3 surface p-4 transition-all outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50">
        <IconBubble icon={Route} />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{ended?.status === 'ended_early' || ended?.status === 'completed' ? `${endedLabel(ended)} — view your report` : 'Start your journey'}</span>
          <span className="block text-sm text-muted-foreground">
            {ended?.status === 'ended_early' || ended?.status === 'completed' ? 'Every day you showed up counts. Start a new one when you’re ready.' : 'A 30, 60, 90 or 100-day transformation, one day at a time.'}
          </span>
        </span>
        <CardChevron />
      </Link>
    )
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-start gap-5 sm:flex-nowrap">
        <Link to="/journey" aria-label={`My Journey: ${program.name}`} className="shrink-0 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <StickyNote program={program} size="small" className="mt-1 ml-1" />
        </Link>
        <div className="min-w-0 flex-1 space-y-2">
          <Link to="/journey" className="group inline-flex items-center gap-1 font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            {program.name} <ArrowRight className="size-4" aria-hidden />
          </Link>
          {program.dueCheckIn && (
            <p className="text-sm text-muted-foreground">Your {program.dueCheckIn === 'midpoint' ? 'midpoint' : 'final'} check-in is ready on My Journey.</p>
          )}
          {habitsFor && program.plan.customHabits.length > 0 && program.clock.phase === 'running' && habitsFor.date >= program.startDate ? (
            <HabitTicks program={program} date={habitsFor.date} initial={habitsFor.done} />
          ) : (
            !program.dueCheckIn && <p className="text-sm text-muted-foreground">Keep going — small steps add up.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** The program's own daily habits for one day, saved as they're ticked. */
function HabitTicks({ program, date, initial }: { program: Program; date: string; initial: string[] }) {
  const [done, setDone] = useState(initial)

  async function toggle(id: string, on: boolean) {
    const next = on ? [...done, id] : done.filter((d) => d !== id)
    setDone(next)
    try {
      const res = await api.put<{ done: string[] }>(`/programs/habits/${date}`, { done: next })
      setDone(res.done)
    } catch (err) {
      setDone(done)
      toast.error(err instanceof Error ? err.message : 'Could not save that')
    }
  }

  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm text-muted-foreground">Daily habits</legend>
      {program.plan.customHabits.map((h) => (
        <label key={h.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg py-1 text-sm">
          <Checkbox checked={done.includes(h.id)} onCheckedChange={(v) => void toggle(h.id, v === true)} />
          <span className={done.includes(h.id) ? 'text-muted-foreground line-through decoration-1' : undefined}>{h.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
