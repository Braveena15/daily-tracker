import { Link } from 'react-router-dom'
import { ArrowRight, BedDouble, CalendarRange, Flame, Info, Scale, Target, UserRound, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { LowMoodCard } from '@/components/mind/Support'
import { JourneyRow } from '@/components/progress/JourneyCards'
import { CaloriesChartCard, InsightsCard, ScoreTrendCard, SleepChartCard, WaterChartCard, WeightCard } from '@/components/progress/ProgressCharts'
import { TodayScores } from '@/components/progress/TodayScores'
import { useFetch } from '@/hooks/useFetch'
import type { SummaryResponse } from '@/lib/profile'
import type { Tone } from '@/lib/tones'
import { MilestoneNote } from '@/components/progress/MilestoneNote'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function Dashboard() {
  return (
    <>
      <PageHeader
        description="Here's how today is going."
        action={
          <Button asChild variant="outline" size="sm" className="size-10 rounded-xl p-0 sm:w-auto sm:px-3">
            <Link to="/review" aria-label="Weekly review">
              <CalendarRange aria-hidden />
              <span className="hidden sm:inline">Weekly review</span>
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 md:space-y-6">
        <WellbeingNote />
        <MilestoneNote />
        <JourneyRow />
        <TodayScores />
        <ScoreTrendCard />
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          <WeightCard />
          <CaloriesChartCard />
        </div>
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          <SleepChartCard />
          <WaterChartCard />
        </div>
        <InsightsCard />
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

/** A gentle note with support contacts when mood has been low on most recent days. */
function WellbeingNote() {
  const { data } = useFetch<{ lowMoodStreak: boolean }>('/wellbeing/check')
  return data?.lowMoodStreak ? <LowMoodCard /> : null
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
    <Card className="gap-3 transition-all">
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
  const { data, error } = useFetch<SummaryResponse>('/profile/summary', 'Could not load your numbers')

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
          hint={summary.weeksToGoal === null ? 'Per day' : `About ${plural(summary.weeksToGoal, 'week')} to goal`}
        />
        <StatCard icon={Flame} tone="physical" label="Daily burn (TDEE)" value={kcal(summary.tdee)} unit="kcal" hint="With your activity" />
        <StatCard icon={BedDouble} tone="mental" label="BMR (at rest)" value={kcal(summary.bmr)} unit="kcal" hint="Just to keep you going" />
        <StatCard icon={Scale} tone="outdoor" label="BMI" value={summary.bmi.toFixed(1)} hint={summary.bmiCategory} />
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
