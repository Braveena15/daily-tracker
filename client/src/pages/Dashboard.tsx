import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BedDouble,
  BookOpen,
  Brain,
  CircleCheck,
  Dumbbell,
  Flame,
  Info,
  Scale,
  SquarePen,
  Sun,
  Target,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { api } from '@/lib/api'
import type { SummaryResponse } from '@/lib/profile'
import { energyEmoji, moodEmoji, type DailyEntry, type EntryResponse, type StreakResponse } from '@/lib/entries'
import { toneSoft, type Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function Dashboard() {
  return (
    <>
      <PageHeader description="Here's how today is going." />

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        <TodayCheckin />
        <StreakCard />
      </div>

      <section className="mt-8 md:mt-10" aria-labelledby="numbers-heading">
        <h2 id="numbers-heading" className="mb-4 text-xl font-semibold">
          Your daily numbers
        </h2>
        <DailyNumbers />
      </section>
    </>
  )
}

function CardSkeleton() {
  return (
    <Card className="min-h-56" aria-busy="true">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-12 w-24" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-32 rounded-xl" />
      </CardContent>
    </Card>
  )
}

function TodayCheckin() {
  const [data, setData] = useState<EntryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<EntryResponse>('/entries/today')
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load today')))
  }, [])

  if (!data && !error) return <CardSkeleton />

  return (
    <Card className="min-h-56">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBubble icon={CircleCheck} />
          <CardTitle className="text-lg font-semibold">Today's check-in</CardTitle>
        </div>
        {data?.entry && (
          <CardAction>
            <Badge className="bg-success/15 text-success">Done ✓</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : data?.entry ? (
          <CheckinSummary entry={data.entry} />
        ) : (
          <EmptyState
            icon={SquarePen}
            title="Not checked in yet"
            className="py-2"
            action={
              <Button asChild>
                <Link to="/today">
                  <SquarePen aria-hidden /> Log today
                </Link>
              </Button>
            }
          >
            A couple of minutes is all it takes.
          </EmptyState>
        )}
      </CardContent>
    </Card>
  )
}

function CheckinSummary({ entry }: { entry: DailyEntry }) {
  const counts: { tone: Tone; icon: LucideIcon; label: string; n: number }[] = [
    { tone: 'physical', icon: Dumbbell, label: entry.workouts.length === 1 ? 'workout' : 'workouts', n: entry.workouts.length },
    { tone: 'mental', icon: Brain, label: 'mind', n: entry.mentalActivities.length },
    { tone: 'outdoor', icon: Sun, label: 'outdoor', n: entry.outdoorActivities.length },
    { tone: 'learning', icon: BookOpen, label: entry.learnings.length === 1 ? 'learning' : 'learnings', n: entry.learnings.length },
  ]

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="text-5xl leading-none" role="img" aria-label={`Mood ${entry.mood} out of 10`}>
          {moodEmoji(entry.mood)}
        </span>
        <div className="text-sm text-muted-foreground">
          <p>
            Mood <span className="font-semibold text-foreground">{entry.mood}/10</span>
          </p>
          <p>
            Energy {energyEmoji(entry.energy)} <span className="font-semibold text-foreground">{entry.energy}/10</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {counts
          .filter((c) => c.n > 0)
          .map(({ tone, icon: Icon, label, n }) => (
            <Badge key={tone} className={cn('h-6 px-2.5', toneSoft[tone])}>
              <Icon aria-hidden /> {n} {label}
            </Badge>
          ))}
      </div>
      <Button asChild variant="outline" className="mt-auto self-start">
        <Link to="/today">
          View or edit <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  )
}

function StreakCard() {
  const [data, setData] = useState<StreakResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<StreakResponse>('/entries/stats/streak')
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load your streak')))
  }, [])

  if (!data && !error) return <CardSkeleton />

  return (
    <Card className="min-h-56">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-muted text-xl" aria-hidden>
            🔥
          </span>
          <CardTitle className="text-lg font-semibold">Streak</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {error || !data ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            <p className="flex items-baseline gap-2">
              <span className="font-heading text-5xl font-semibold tabular-nums">{data.current}</span>
              <span className="text-muted-foreground">{data.current === 1 ? 'day' : 'days'} in a row</span>
            </p>
            <div className="mt-auto space-y-2">
              <Progress
                value={data.longest > 0 ? (data.current / data.longest) * 100 : 0}
                aria-label="Current streak compared with your longest"
              />
              <p className="text-sm text-muted-foreground">
                {data.current === 0
                  ? 'Check in today to start a new streak.'
                  : data.current >= data.longest
                    ? 'Your longest streak yet 🎉'
                    : `Longest: ${plural(data.longest, 'day')}. ${plural(data.longest - data.current + 1, 'more day')} to beat it.`}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({
  icon,
  tone,
  label,
  value,
  unit,
  hint,
}: {
  icon: LucideIcon
  tone: Tone
  label: string
  value: string
  unit?: string
  hint: string
}) {
  return (
    <Card className="gap-3 transition-all hover:-translate-y-0.5">
      <CardContent className="space-y-3">
        <IconBubble icon={icon} tone={tone} />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1">
            <span className="font-heading text-2xl font-semibold tabular-nums sm:text-3xl">{value}</span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function DailyNumbers() {
  const [data, setData] = useState<SummaryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<SummaryResponse>('/profile/summary')
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load your numbers')))
  }, [])

  if (error) return <ErrorNotice>{error}</ErrorNotice>

  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-3">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!data.complete) {
    return (
      <Card>
        <EmptyState
          icon={UserRound}
          title="Finish your profile"
          action={
            <Button asChild>
              <Link to="/profile">
                Complete your profile <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        >
          {data.message}
        </EmptyState>
      </Card>
    )
  }

  const { summary } = data
  const kcal = (n: number) => n.toLocaleString()

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Target}
          tone="primary"
          label="Calorie target"
          value={kcal(summary.calorieTarget)}
          unit="kcal"
          hint={
            summary.weeksToGoal === null
              ? 'Per day'
              : `About ${plural(summary.weeksToGoal, 'week')} to goal`
          }
        />
        <StatCard
          icon={Flame}
          tone="physical"
          label="Daily burn (TDEE)"
          value={kcal(summary.tdee)}
          unit="kcal"
          hint="With your activity"
        />
        <StatCard
          icon={BedDouble}
          tone="mental"
          label="BMR (at rest)"
          value={kcal(summary.bmr)}
          unit="kcal"
          hint="Just to keep you going"
        />
        <StatCard
          icon={Scale}
          tone="outdoor"
          label="BMI"
          value={summary.bmi.toFixed(1)}
          hint={summary.bmiCategory}
        />
      </div>

      {summary.wasClamped && (
        <p className="flex items-start gap-2.5 rounded-xl bg-learning-soft px-4 py-3 text-sm text-learning-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Your target has been raised to a safe minimum, so you may lose weight a little more slowly than your weekly
            goal. Choosing a gentler goal on your{' '}
            <Link to="/profile" className="font-medium underline underline-offset-4">
              profile
            </Link>{' '}
            can make this more realistic.
          </span>
        </p>
      )}
    </div>
  )
}
